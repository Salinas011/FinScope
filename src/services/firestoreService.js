/**
 * src/services/firestoreService.js
 * Servicio de sincronización en la nube con Firebase Cloud Firestore v3.
 * Implementa persistencia granular por subcolecciones, resolución de conflictos
 * Last-Write-Wins (LWW) por registro y soporte Offline-First con cola de cambios pendientes.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { store } from '../core/store.js';
import { eventBus } from '../core/eventBus.js';
import { StorageService } from '../core/storage.js';
import { DEFAULT_ACCOUNTS } from '../core/constants.js';

export const firebaseConfig = {
  apiKey:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY) ||
    'AIzaSyBv7PPxra44OhQrEShtZ-2uYIs2iYpabVo',
  authDomain:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN) ||
    'finscope-7c0a8.firebaseapp.com',
  projectId:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_PROJECT_ID) ||
    'finscope-7c0a8',
  storageBucket:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET) ||
    'finscope-7c0a8.firebasestorage.app',
  messagingSenderId:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID) ||
    '1033760580508',
  appId:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_APP_ID) ||
    '1:1033760580508:web:c3e229a578fa8c8c195e59',
  measurementId:
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID) ||
    'G-T1S3BY10DM'
};

const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId
);

if (!isFirebaseConfigured) {
  console.warn(
    '[FinScope] Firebase no está configurado (variables VITE_FIREBASE_* ausentes). Modo offline local activo.'
  );
}

const app = isFirebaseConfigured
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

export const db = app ? getFirestore(app) : null;

const SYNCED_COLLECTIONS = ['accounts', 'categories', 'transactions', 'budgets', 'recurring'];

class FirestoreService {
  constructor() {
    this.currentUserId = null;
    this.unsubscribers = [];
    this.isApplyingRemoteChange = false;
    this.saveTimeout = null;
    this.syncStatus = 'disconnected'; // 'connected' | 'syncing' | 'disconnected' | 'error'
    this.listeners = [];
    this._activePullPromise = null;

    // Monitoreo de conectividad de red nativo
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkOnline());
      window.addEventListener('offline', () => {
        this.setSyncStatus('disconnected');
      });
    }
  }

  /**
   * Suscribe observadores al cambio de estado de sincronización.
   */
  onSyncStatusChange(cb) {
    this.listeners.push(cb);
    cb(this.syncStatus);
    return () => {
      this.listeners = this.listeners.filter(fn => fn !== cb);
    };
  }

  setSyncStatus(status) {
    this.syncStatus = status;
    this.listeners.forEach(cb => cb(status));
  }

  /**
   * Conecta el almacén a Firestore bajo el usuario autenticado.
   * Inicializa subcolecciones e instala listeners de snapshot en tiempo real.
   * @param {Object} user
   */
  async attachUser(user) {
    if (!user) {
      this.detachUser();
      return;
    }

    const uid = user.uid || user.id || user.sub || user.email;
    if (!uid) {
      this.detachUser();
      return;
    }

    if (this.currentUserId === uid && this.unsubscribers.length > 0) return;
    this.detachUser();

    this.currentUserId = uid;
    this.setSyncStatus('syncing');

    if (!db) {
      console.warn('[Firestore] Firebase no disponible. Operando en almacenamiento local.');
      this.setSyncStatus('disconnected');
      return;
    }

    try {
      // 1. Sincronizar o crear documento raíz de metadatos (theme, currency, settings)
      const userDocRef = doc(db, 'users', this.currentUserId);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const metaData = userDocSnap.data();
        if (metaData.currency || metaData.theme || metaData.settings) {
          store.setState({
            currency: metaData.currency || store.currency,
            theme: metaData.theme || store.theme,
            settings: { ...store.settings, ...(metaData.settings || {}) }
          }, 'firestore:meta_synced');
        }
      } else {
        await setDoc(userDocRef, {
          userEmail: user.email || '',
          userName: user.name || '',
          currency: store.currency,
          theme: store.theme,
          settings: store.settings,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      // 2. Ejecutar rehidratación completa inicial LWW (Cloud Pull)
      await this.pullAllUserData(this.currentUserId);

      // 3. Suscribirse en tiempo real a cada subcolección granular
      this.listenToSubcollections();

      this.setSyncStatus('connected');
    } catch (error) {
      console.error('[Firestore] Error conectando con Firestore:', error);
      this.setSyncStatus('error');
    }
  }

  /**
   * Rehidratación completa desde la nube (Initial Cloud Pull).
   * Realiza un fetch sobre todas las subcolecciones del usuario:
   * accounts, categories, transactions, budgets y recurring bajo la ruta users/{userId}/{collection}.
   * Excluye registros que tengan deletedAt !== null o aplica resolución Last-Write-Wins (LWW).
   * Si la consulta remota contiene registros y el estado local está vacío o desactualizado:
   * 1. Guarda atómicamente todos los registros remotos en sus respectivos Object Stores de IndexedDB.
   * 2. Actualiza el estado reactivo en store.js mediante replaceState().
   * 3. Emite un evento en el eventBus ('store:synced' y 'state:changed') para forzar re-renderizado automático.
   * @param {string|Object} userId UID o email del usuario
   * @param {Object} [mockData=null] Datos simulados para testing automatizado
   * @returns {Promise<{success: boolean, pulledCount: number, state: Object}>}
   */
  async pullAllUserData(userId, mockData = null) {
    const uid = typeof userId === 'object' && userId !== null
      ? (userId.uid || userId.id || userId.sub || userId.email)
      : (userId || this.currentUserId);

    if (!uid) {
      console.warn('[Firestore] pullAllUserData: userId no especificado.');
      return { success: false, reason: 'missing_user_id', pulledCount: 0 };
    }

    this.currentUserId = uid;

    if (this._activePullPromise && !mockData) {
      return this._activePullPromise;
    }

    const executePull = async () => {
      this.setSyncStatus('syncing');

      let remoteCollections = {};
      let remoteMeta = {};

      if (mockData) {
        remoteCollections = {
          accounts: mockData.accounts || [],
          categories: mockData.categories || [],
          transactions: mockData.transactions || [],
          budgets: mockData.budgets || [],
          recurring: mockData.recurring || []
        };
        remoteMeta = mockData.meta || {};
      } else {
        if (!db) {
          console.warn('[Firestore] Firebase no disponible para pullAllUserData. Operando localmente.');
          this.setSyncStatus('disconnected');
          return { success: false, reason: 'no_db', pulledCount: 0 };
        }

        try {
          // 1. Obtener metadatos raíz (currency, theme, settings)
          try {
            const userDocRef = doc(db, 'users', this.currentUserId);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              remoteMeta = userDocSnap.data() || {};
            }
          } catch (metaErr) {
            console.warn('[Firestore] No se pudieron leer metadatos de usuario:', metaErr);
          }

          // 2. Fetch granular sobre cada subcolección
          for (const collName of SYNCED_COLLECTIONS) {
            const collRef = collection(db, 'users', this.currentUserId, collName);
            const snapshot = await getDocs(collRef);
            const docs = [];
            snapshot.forEach(docSnap => {
              docs.push({ id: docSnap.id, ...docSnap.data() });
            });
            remoteCollections[collName] = docs;
          }
        } catch (err) {
          console.error('[Firestore] Error en pullAllUserData durante fetch remoto:', err);
          this.setSyncStatus('error');
          return { success: false, error: err.message, pulledCount: 0 };
        }
      }

      const currentState = store.getState();
      const isLocalEmpty = (currentState.transactions || []).length === 0;

      const defaultAccountIds = new Set(DEFAULT_ACCOUNTS.map(a => a.id));
      const isBlankDefaultAccount = (acc) => {
        return defaultAccountIds.has(acc.id) &&
          Number(acc.initialBalance || 0) === 0 &&
          (!acc.pockets || acc.pockets.length === 0);
      };

      const isLocalAccountsOnlyDefaults = (currentState.accounts || []).length === 0 ||
        (currentState.accounts || []).every(acc => isBlankDefaultAccount(acc));

      let totalPulled = 0;
      const mergedData = {};

      for (const collName of SYNCED_COLLECTIONS) {
        const remoteItems = remoteCollections[collName] || [];
        const localItems = currentState[collName] || [];

        totalPulled += remoteItems.length;

        // Si el almacenamiento local estaba en blanco o solo contenía cuentas por defecto
        if (isLocalEmpty || (collName === 'accounts' && isLocalAccountsOnlyDefaults)) {
          if (collName === 'accounts') {
            // Si la nube tiene cuentas del usuario, reemplazan por completo las cuentas vacías por defecto
            if (remoteItems.length > 0) {
              mergedData.accounts = remoteItems
                .filter(item => !item.deletedAt)
                .map(item => ({ ...item, syncStatus: 'synced' }));
            } else {
              mergedData.accounts = localItems;
            }
          } else if (collName === 'categories') {
            // Si la nube tiene categorías, sustituyen o conservan DEFAULT_CATEGORIES
            if (remoteItems.length > 0) {
              mergedData.categories = remoteItems
                .filter(item => !item.deletedAt)
                .map(item => ({ ...item, syncStatus: 'synced' }));
            } else {
              mergedData.categories = localItems;
            }
          } else {
            // Para transactions, budgets, recurring
            mergedData[collName] = remoteItems
              .filter(item => !item.deletedAt)
              .map(item => ({ ...item, syncStatus: 'synced' }));
          }
        } else {
          // Resolución Last-Write-Wins (LWW) registro a registro
          const localMap = new Map(localItems.map(item => [item.id, item]));
          const remoteMap = new Map(remoteItems.map(item => [item.id, item]));
          const mergedList = [];

          // Evaluar registros remotos contra locales
          for (const [id, remoteItem] of remoteMap.entries()) {
            const localItem = localMap.get(id);

            if (!localItem) {
              // No existe localmente: incorporar si no está eliminado
              if (!remoteItem.deletedAt) {
                mergedList.push({ ...remoteItem, syncStatus: 'synced' });
              }
            } else {
              // Existe en ambos: resolver conflicto con LWW por updatedAt
              const remoteTime = Number(remoteItem.updatedAt) || 0;
              const localTime = Number(localItem.updatedAt) || 0;

              if (remoteTime >= localTime) {
                if (!remoteItem.deletedAt) {
                  mergedList.push({ ...remoteItem, syncStatus: 'synced' });
                }
              } else {
                if (!localItem.deletedAt) {
                  mergedList.push(localItem);
                }
              }
            }
          }

          // Evaluar registros locales que no están en remoto
          for (const [id, localItem] of localMap.entries()) {
            if (!remoteMap.has(id)) {
              // Descartar cuentas en cero por defecto creadas por getBlankState si la nube ya tiene cuentas
              if (collName === 'accounts' && remoteItems.length > 0 && isBlankDefaultAccount(localItem)) {
                continue;
              }
              if (!localItem.deletedAt) {
                mergedList.push(localItem);
              }
            }
          }

          mergedData[collName] = mergedList;
        }
      }

      // 4. Construir estado unificado consolidado
      const nextState = {
        ...currentState,
        currency: remoteMeta.currency || currentState.currency || 'COP',
        theme: remoteMeta.theme || currentState.theme || 'light',
        settings: { ...currentState.settings, ...(remoteMeta.settings || {}) },
        accounts: (mergedData.accounts !== undefined)
          ? mergedData.accounts
          : (currentState.accounts || []),
        categories: (mergedData.categories !== undefined)
          ? mergedData.categories
          : (currentState.categories || []),
        transactions: mergedData.transactions !== undefined ? mergedData.transactions : [],
        budgets: mergedData.budgets !== undefined ? mergedData.budgets : [],
        recurring: mergedData.recurring !== undefined ? mergedData.recurring : [],
        version: 3
      };

      // 5. Guardado atómico en IndexedDB y actualización del store reactivo
      this.isApplyingRemoteChange = true;
      await store.replaceState(nextState);
      this.isApplyingRemoteChange = false;

      // 6. Notificar a toda la aplicación para re-renderizado automático
      eventBus.emit('store:synced', {
        source: 'firestore:pullAllUserData',
        userId: uid,
        pulledCount: totalPulled,
        state: nextState
      });

      eventBus.emit('state:changed', {
        state: nextState,
        actionTag: 'firestore:pullAllUserData'
      });

      this.setSyncStatus('connected');
      console.log(`[Firestore] pullAllUserData completado. ${totalPulled} registros remotos procesados.`);

      return {
        success: true,
        pulledCount: totalPulled,
        state: nextState
      };
    };

    if (mockData) {
      return await executePull();
    }

    this._activePullPromise = executePull().finally(() => {
      this._activePullPromise = null;
    });

    return await this._activePullPromise;
  }

  /**
   * Garantía de Escritura Inmediata:
   * Sube inmediatamente un registro a Cloud Firestore si el usuario está autenticado y online.
   * Marca syncStatus: 'synced' al confirmarse la persistencia remota.
   * Si está offline o ocurre un error, el registro conserva syncStatus: 'pending' para la cola de reintento.
   * @param {string} collName 'accounts' | 'transactions' | 'categories' | 'budgets' | 'recurring'
   * @param {Object} item Entidad a sincronizar
   * @returns {Promise<Object>}
   */
  async syncRecordImmediate(collName, item) {
    if (!item || !item.id) return item;

    const uid = this.currentUserId;
    if (!uid || !db) return item;

    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!isOnline) return item;

    try {
      this.setSyncStatus('syncing');
      const itemRef = doc(db, 'users', uid, collName, item.id);
      const { syncStatus, ...cleanItem } = item;
      await setDoc(itemRef, cleanItem, { merge: true });

      const syncedItem = { ...item, syncStatus: 'synced' };

      // Persistir en IndexedDB
      await StorageService.saveEntity(collName, syncedItem);

      // Actualizar silenciosamente en el store en memoria
      const currentList = store[collName] || [];
      const updatedList = currentList.map(it => (it.id === item.id ? syncedItem : it));
      this.isApplyingRemoteChange = true;
      store.setState({ [collName]: updatedList }, `firestore:synced:${collName}`);
      this.isApplyingRemoteChange = false;

      this.setSyncStatus('connected');
      return syncedItem;
    } catch (err) {
      console.warn(`[Firestore] Error en sincronización inmediata de ${collName}/${item.id}:`, err);
      this.setSyncStatus('connected');
      return item;
    }
  }

  /**
   * Reconciliación inicial bidireccional Last-Write-Wins (LWW) registro a registro.
   */
  async reconcileInitialData(user) {
    if (!db || !this.currentUserId) return;

    for (const collName of SYNCED_COLLECTIONS) {
      const collRef = collection(db, 'users', this.currentUserId, collName);
      const snapshot = await getDocs(collRef);
      const remoteMap = new Map();

      snapshot.forEach(docSnap => {
        remoteMap.set(docSnap.id, docSnap.data());
      });

      const localList = [...(store[collName] || [])];
      const localMap = new Map(localList.map(item => [item.id, item]));

      const mergedList = [];
      const pendingUploads = [];

      // Evaluar registros remotos contra locales
      for (const [id, remoteItem] of remoteMap.entries()) {
        const localItem = localMap.get(id);

        if (!localItem) {
          // No existe localmente: incorporar si no está eliminado
          mergedList.push({ ...remoteItem, syncStatus: 'synced' });
          await StorageService.saveEntity(collName, remoteItem);
        } else {
          // Conflicto de concurrencia: comparar updatedAt (LWW)
          const remoteTime = Number(remoteItem.updatedAt) || 0;
          const localTime = Number(localItem.updatedAt) || 0;

          if (remoteTime > localTime) {
            // Remoto es más reciente: gana remoto
            mergedList.push({ ...remoteItem, syncStatus: 'synced' });
            await StorageService.saveEntity(collName, remoteItem);
          } else if (localTime > remoteTime) {
            // Local es más reciente: gana local y se encola para subir
            mergedList.push(localItem);
            pendingUploads.push(localItem);
          } else {
            // Idéntico timestamp
            mergedList.push({ ...localItem, syncStatus: 'synced' });
          }
        }
      }

      // Evaluar registros locales que aún no existen en la nube
      for (const [id, localItem] of localMap.entries()) {
        if (!remoteMap.has(id)) {
          mergedList.push(localItem);
          pendingUploads.push(localItem);
        }
      }

      // Actualizar estado en memoria
      this.isApplyingRemoteChange = true;
      store.setState({ [collName]: mergedList }, `firestore:reconciled:${collName}`);
      this.isApplyingRemoteChange = false;

      // Subir registros locales más recientes
      if (pendingUploads.length > 0) {
        await this.uploadBatch(collName, pendingUploads);
      }
    }
  }

  /**
   * Instala listeners de tiempo real en cada subcolección.
   */
  listenToSubcollections() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];

    for (const collName of SYNCED_COLLECTIONS) {
      const collRef = collection(db, 'users', this.currentUserId, collName);

      const unsub = onSnapshot(collRef, snapshot => {
        if (this.isApplyingRemoteChange) return;

        snapshot.docChanges().forEach(change => {
          const docData = change.doc.data();
          const docId = change.doc.id;

          if (change.type === 'added' || change.type === 'modified') {
            this.handleRemoteRecordChange(collName, docId, docData);
          } else if (change.type === 'removed') {
            this.handleRemoteRecordRemoval(collName, docId);
          }
        });
      }, error => {
        console.warn(`[Firestore] Error escuchando colección ${collName}:`, error);
        this.setSyncStatus('error');
      });

      this.unsubscribers.push(unsub);
    }
  }

  /**
   * Resuelve cambios en tiempo real provenientes de otros dispositivos con Last-Write-Wins.
   */
  async handleRemoteRecordChange(collName, id, remoteRecord) {
    const localList = store[collName] || [];
    const localItem = localList.find(item => item.id === id);

    const remoteTime = Number(remoteRecord.updatedAt) || 0;
    const localTime = localItem ? Number(localItem.updatedAt || 0) : 0;

    // Solo aplicar si el registro remoto es más reciente
    if (!localItem || remoteTime >= localTime) {
      this.isApplyingRemoteChange = true;

      const updatedRecord = { ...remoteRecord, syncStatus: 'synced' };
      const updatedList = localItem
        ? localList.map(item => (item.id === id ? updatedRecord : item))
        : [...localList, updatedRecord];

      store.setState({ [collName]: updatedList }, `remote:${collName}:updated`);
      await StorageService.saveEntity(collName, updatedRecord);

      this.isApplyingRemoteChange = false;
    }
  }

  /**
   * Maneja eliminaciones remotas.
   */
  async handleRemoteRecordRemoval(collName, id) {
    const localList = store[collName] || [];
    const localItem = localList.find(item => item.id === id);
    if (!localItem) return;

    this.isApplyingRemoteChange = true;
    const now = Date.now();
    const softDeleted = { ...localItem, deletedAt: now, updatedAt: now, syncStatus: 'synced' };
    const updatedList = localList.map(item => (item.id === id ? softDeleted : item));

    store.setState({ [collName]: updatedList }, `remote:${collName}:deleted`);
    await StorageService.saveEntity(collName, softDeleted);
    this.isApplyingRemoteChange = false;
  }

  /**
   * Sube un lote de registros a una subcolección de Firestore.
   */
  async uploadBatch(collName, items) {
    if (!db || !this.currentUserId || items.length === 0) return;

    try {
      const batch = writeBatch(db);
      for (const item of items) {
        const itemRef = doc(db, 'users', this.currentUserId, collName, item.id);
        const { syncStatus, ...cleanItem } = item;
        batch.set(itemRef, cleanItem, { merge: true });
      }
      await batch.commit();

      // Marcar como sincronizados localmente
      const syncedItems = items.map(it => ({ ...it, syncStatus: 'synced' }));
      for (const s of syncedItems) {
        await StorageService.saveEntity(collName, s);
      }
    } catch (err) {
      console.error(`[Firestore] Error subiendo lote de ${collName}:`, err);
    }
  }

  /**
   * Sincroniza cambios pendientes locales con debounce.
   */
  saveCurrentStateDebounced(user) {
    if (!this.currentUserId || !db || this.isApplyingRemoteChange) return;

    this.setSyncStatus('syncing');
    clearTimeout(this.saveTimeout);

    this.saveTimeout = setTimeout(async () => {
      try {
        await this.pushPendingChanges();
        this.setSyncStatus('connected');
      } catch (err) {
        console.error('[Firestore] Error subiendo cambios pendientes:', err);
        this.setSyncStatus('error');
      }
    }, 450);
  }

  /**
   * Encuentra y sube todas las entidades con `syncStatus === 'pending'`.
   */
  async pushPendingChanges() {
    if (!db || !this.currentUserId) return;

    for (const collName of SYNCED_COLLECTIONS) {
      const items = (store[collName] || []).filter(item => item.syncStatus === 'pending');
      if (items.length > 0) {
        await this.uploadBatch(collName, items);
      }
    }

    // Actualizar metadatos raíz
    const userDocRef = doc(db, 'users', this.currentUserId);
    await setDoc(userDocRef, {
      currency: store.currency,
      theme: store.theme,
      settings: store.settings,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  /**
   * Reconexión de red: reanuda sincronización y vacía la cola pendiente.
   */
  async handleNetworkOnline() {
    if (!this.currentUserId) return;
    console.log('[Firestore] Conexión de red recuperada. Vaciando cola offline...');
    this.setSyncStatus('syncing');
    await this.pushPendingChanges();
    this.setSyncStatus('connected');
  }

  /**
   * Desconecta observadores al cerrar sesión.
   */
  detachUser() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    this.currentUserId = null;
    this.setSyncStatus('disconnected');
  }
}

export const firestoreService = new FirestoreService();
