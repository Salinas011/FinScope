/**
 * src/services/firestoreService.js
 * Servicio de sincronización y persistencia en la nube con Firebase Cloud Firestore.
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { store } from '../core/store.js';
import { eventBus } from '../core/eventBus.js';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Validar que las variables mínimas requeridas estén presentes
const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && 
  firebaseConfig.projectId
);

if (!isFirebaseConfigured) {
  console.warn(
    '[FinScope] Firebase no está configurado o faltan variables de entorno (VITE_FIREBASE_*). ' +
    'Revisa tu archivo .env basado en .env.example. La aplicación continuará en modo local.'
  );
}

// Inicializar Firebase evitando duplicaciones
const app = isFirebaseConfigured
  ? (getApps().length > 0 ? getApp() : initializeApp(firebaseConfig))
  : null;

export const db = app ? getFirestore(app) : null;

class FirestoreService {
  constructor() {
    this.currentUserId = null;
    this.unsubscribeSnapshot = null;
    this.isSyncingFromRemote = false;
    this.saveTimeout = null;
    this.syncStatus = 'disconnected'; // 'connected' | 'syncing' | 'disconnected' | 'error'
    this.listeners = [];
  }

  /**
   * Suscribe a observadores para cambios en el estado de sincronización.
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
   * Conecta el almacén a Firestore para el usuario autenticado.
   * @param {Object} user - Objeto de usuario autenticado con Google.
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
      console.warn('Firestore no está inicializado: variables de entorno ausentes. Operando con almacenamiento local.');
      this.setSyncStatus('disconnected');
      return;
    }

    try {
      const userDocRef = doc(db, 'users', this.currentUserId);
      const docSnap = await getDoc(userDocRef);

      if (docSnap.exists()) {
        // 1. Existen datos en la nube: aplicarlos al estado local
        const cloudData = docSnap.data();
        this.isSyncingFromRemote = true;
        store.replaceState({
          accounts: cloudData.accounts || [],
          categories: cloudData.categories || [],
          transactions: cloudData.transactions || [],
          budgets: cloudData.budgets || [],
          recurring: cloudData.recurring || [],
          currency: cloudData.currency || 'COP',
          theme: cloudData.theme || store.theme,
          settings: cloudData.settings || store.settings
        });
        this.isSyncingFromRemote = false;
        this.setSyncStatus('connected');
      } else {
        // 2. Primer inicio de sesión: respaldar datos locales iniciales en Firestore
        await this.pushLocalToCloud(user);
        this.setSyncStatus('connected');
      }

      // 3. Suscribirse a cambios en tiempo real (Multi-dispositivo)
      this.unsubscribeSnapshot = onSnapshot(userDocRef, (snapshot) => {
        if (!snapshot.exists()) return;
        if (this.isSyncingFromRemote) return;

        // Comprobar si el cambio provino de otro dispositivo
        const source = snapshot.metadata.hasPendingWrites ? 'local' : 'server';
        if (source === 'server') {
          const remoteData = snapshot.data();
          this.isSyncingFromRemote = true;
          store.replaceState({
            accounts: remoteData.accounts || [],
            categories: remoteData.categories || [],
            transactions: remoteData.transactions || [],
            budgets: remoteData.budgets || [],
            recurring: remoteData.recurring || [],
            currency: remoteData.currency || 'COP',
            theme: remoteData.theme || store.theme,
            settings: remoteData.settings || store.settings
          });
          this.isSyncingFromRemote = false;
          this.setSyncStatus('connected');
        }
      }, (error) => {
        console.warn('Advertencia en tiempo real de Firestore:', error);
        this.setSyncStatus('error');
      });

    } catch (error) {
      console.error('Error al conectar con Firestore:', error);
      this.setSyncStatus('error');
    }
  }

  /**
   * Guarda inmediatamente o con debounce el estado actual en Firestore.
   */
  async saveCurrentStateDebounced(user) {
    if (!this.currentUserId || !db || this.isSyncingFromRemote) return;

    this.setSyncStatus('syncing');
    clearTimeout(this.saveTimeout);

    this.saveTimeout = setTimeout(async () => {
      try {
        await this.pushLocalToCloud(user);
        this.setSyncStatus('connected');
      } catch (err) {
        console.error('Error guardando en Firestore:', err);
        this.setSyncStatus('error');
      }
    }, 400);
  }

  /**
   * Envía el estado completo a la nube.
   */
  async pushLocalToCloud(user) {
    if (!this.currentUserId || !db) return;
    const userDocRef = doc(db, 'users', this.currentUserId);
    const state = store.getState();

    const payload = {
      transactions: state.transactions || [],
      accounts: state.accounts || [],
      categories: state.categories || [],
      budgets: state.budgets || [],
      recurring: state.recurring || [],
      currency: state.currency || 'COP',
      theme: state.theme || 'light',
      settings: state.settings || {},
      userEmail: user?.email || '',
      userName: user?.name || '',
      updatedAt: serverTimestamp()
    };

    await setDoc(userDocRef, payload, { merge: true });
  }

  /**
   * Desconecta los listeners cuando el usuario cierra sesión.
   */
  detachUser() {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
    this.currentUserId = null;
    this.setSyncStatus('disconnected');
  }
}

export const firestoreService = new FirestoreService();
