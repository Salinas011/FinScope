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

export const firebaseConfig = {
  apiKey: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FIREBASE_API_KEY : undefined,
  authDomain: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN : undefined,
  projectId: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FIREBASE_PROJECT_ID : undefined,
  storageBucket: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET : undefined,
  messagingSenderId: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID : undefined,
  appId: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FIREBASE_APP_ID : undefined,
  measurementId: typeof import.meta !== 'undefined' ? import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID : undefined
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
    if (!user?.id) {
      this.detachUser();
      return;
    }

    if (this.currentUserId === user.id) return;
    this.detachUser();

    this.currentUserId = user.id;
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

      // 2. Ejecutar reconciliación inicial LWW de todas las subcolecciones
      await this.reconcileInitialData(user);

      // 3. Suscribirse en tiempo real a cada subcolección granular
      this.listenToSubcollections();

      this.setSyncStatus('connected');
    } catch (error) {
      console.error('[Firestore] Error conectando con Firestore:', error);
      this.setSyncStatus('error');
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
