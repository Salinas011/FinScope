/**
 * src/core/storage.js
 * Adaptador de almacenamiento persistente asíncrono sobre IndexedDB nativo (Promises)
 * con soporte para migraciones automáticas de esquema (v1 -> v2 -> v3),
 * Safe Math (montos en centavos) y metadatos de sincronización LWW.
 */
import {
  STORAGE_KEY_V2,
  STORAGE_KEY_V1,
  STORAGE_KEY_V3,
  APP_VERSION,
  DEFAULT_CATEGORIES,
  DEFAULT_ACCOUNTS
} from './constants.js';

const DB_NAME = 'finscope_db_v3';
const DB_VERSION = 1;

export class StorageService {
  static dbPromise = null;

  /**
   * Genera el estado en blanco por defecto con el esquema v3.
   * Todos los montos se representan como enteros en centavos (base 100)
   * y las entidades incorporan metadatos para resolución Last-Write-Wins (LWW).
   * @returns {Object}
   */
  static getBlankState() {
    const now = Date.now();

    const accounts = DEFAULT_ACCOUNTS.map(acc => ({
      ...structuredClone(acc),
      initialBalance: Math.round((Number(acc.initialBalance) || 0) * 100),
      pockets: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'synced'
    }));

    const categories = DEFAULT_CATEGORIES.map(cat => ({
      ...structuredClone(cat),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'synced'
    }));

    return {
      version: APP_VERSION,
      currency: 'COP',
      theme: 'light',
      isPrivacyMode: false,
      accounts,
      categories,
      transactions: [],
      budgets: [],
      recurring: [],
      settings: {
        dateFormat: 'es-CO',
        pageSize: 25
      }
    };
  }

  /**
   * Abre o inicializa la base de datos IndexedDB.
   * Crea los object stores e índices requeridos.
   * @returns {Promise<IDBDatabase>}
   */
  static async openDB() {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB no está soportado en este entorno.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = event => {
        const db = event.target.result;

        // 1. Store 'meta': configuración general, temas, moneda, cursor sync
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }

        // 2. Store 'accounts': cuentas y sus alcancías anidadas
        if (!db.objectStoreNames.contains('accounts')) {
          const accStore = db.createObjectStore('accounts', { keyPath: 'id' });
          accStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
          accStore.createIndex('by_syncStatus', 'syncStatus', { unique: false });
        }

        // 3. Store 'categories': categorías de ingreso y gasto
        if (!db.objectStoreNames.contains('categories')) {
          const catStore = db.createObjectStore('categories', { keyPath: 'id' });
          catStore.createIndex('by_type', 'type', { unique: false });
          catStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        }

        // 4. Store 'transactions': movimientos, transferencias y movimientos de alcancías
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
          txStore.createIndex('by_date', 'date', { unique: false });
          txStore.createIndex('by_accountId', 'accountId', { unique: false });
          txStore.createIndex('by_pocketId', 'pocketId', { unique: false });
          txStore.createIndex('by_type', 'type', { unique: false });
          txStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
          txStore.createIndex('by_syncStatus', 'syncStatus', { unique: false });
        }

        // 5. Store 'budgets': presupuestos mensuales
        if (!db.objectStoreNames.contains('budgets')) {
          const bgtStore = db.createObjectStore('budgets', { keyPath: 'id' });
          bgtStore.createIndex('by_categoryId', 'categoryId', { unique: false });
          bgtStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        }

        // 6. Store 'recurring': suscripciones y pagos recurrentes
        if (!db.objectStoreNames.contains('recurring')) {
          const recStore = db.createObjectStore('recurring', { keyPath: 'id' });
          recStore.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Helper genérico para ejecutar transacciones de lectura/escritura en un store.
   */
  static async getStore(storeName, mode = 'readonly') {
    const db = await this.openDB();
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  /**
   * Obtiene todos los elementos de un Object Store.
   * @param {string} storeName
   * @returns {Promise<Array>}
   */
  static async getAll(storeName) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Guarda o actualiza un elemento en un Object Store.
   * @param {string} storeName
   * @param {Object} item
   * @returns {Promise<void>}
   */
  static async put(storeName, item) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Inicializa la base de datos y ejecuta el pipeline de migración si es necesario.
   * @returns {Promise<Object>} Estado completo hidratado v3.
   */
  static async init() {
    try {
      const db = await this.openDB();

      // Comprobar si ya existen registros en IndexedDB
      const metaEntries = await this.getAll('meta');
      const isDbInitialized = metaEntries.some(m => m.key === 'app_initialized');

      if (!isDbInitialized) {
        // Ejecutar pipeline de migración desde localStorage si existen datos previos
        const migratedState = await this.runMigrationPipeline();
        await this.saveState(migratedState);

        // Marcar inicialización completa en el store 'meta'
        await this.put('meta', { key: 'app_initialized', value: true, timestamp: Date.now() });
        return migratedState;
      }

      // Si ya está inicializado, cargar estado consolidado
      return await this.loadState();
    } catch (error) {
      console.error('[StorageService] Error inicializando IndexedDB. Usando estado en blanco.', error);
      return this.getBlankState();
    }
  }

  /**
   * Pipeline de Migración (v1 -> v2 -> v3).
   * Inspecciona localStorage en busca de versiones anteriores y las transforma a v3.
   * @returns {Promise<Object>}
   */
  static async runMigrationPipeline() {
    const blank = this.getBlankState();

    if (typeof localStorage === 'undefined') {
      return blank;
    }

    try {
      let rawData = null;
      let fromVersion = null;

      // 1. Detectar v2
      const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
      if (rawV2) {
        rawData = JSON.parse(rawV2);
        fromVersion = 2;
      } else {
        // 2. Detectar v1
        const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
        if (rawV1) {
          rawData = JSON.parse(rawV1);
          fromVersion = 1;
        }
      }

      if (!rawData) {
        // No hay datos previos; usar estado base en blanco
        return blank;
      }

      console.log(`[StorageService] Migrando datos desde esquema v${fromVersion} a v3...`);

      // Si proviene de v1, transformar primero a la estructura intermedia v2
      let intermediateV2 = rawData;
      if (fromVersion === 1) {
        intermediateV2 = this.migrateV1ToV2(rawData);
      }

      // Transformar v2 -> v3 (Safe Math en centavos, alcancías y metadatos LWW)
      const migratedV3 = this.migrateV2ToV3(intermediateV2);

      // Limpiar o marcar migrado en localStorage para no duplicar en futuras cargas
      try {
        localStorage.removeItem(STORAGE_KEY_V1);
        localStorage.removeItem(STORAGE_KEY_V2);
        localStorage.setItem(STORAGE_KEY_V3, JSON.stringify({ migratedAt: Date.now(), version: 3 }));
      } catch (e) {
        console.warn('No se pudo limpiar localStorage tras migrar a v3:', e);
      }

      console.log('[StorageService] Migración a v3 completada exitosamente.');
      return migratedV3;
    } catch (err) {
      console.error('[StorageService] Error durante la migración a v3:', err);
      return blank;
    }
  }

  /**
   * Convierte datos de v1 a v2 asegurando cuentas y campos obligatorios.
   */
  static migrateV1ToV2(v1Data) {
    const blank = this.getBlankState();
    if (!v1Data || typeof v1Data !== 'object') return blank;

    const defaultBank = blank.accounts.find(a => a.id === 'acc-bank') || blank.accounts[0];

    const migratedTransactions = Array.isArray(v1Data.transactions)
      ? v1Data.transactions.map(t => ({
          ...t,
          accountId: t.accountId || defaultBank.id,
          type: t.type || 'expense',
          amount: Number(t.amount) || 0,
          createdAt: t.createdAt || Date.now()
        }))
      : [];

    return {
      version: 2,
      currency: v1Data.currency || 'COP',
      theme: v1Data.theme || 'light',
      accounts: DEFAULT_ACCOUNTS,
      categories: Array.isArray(v1Data.categories) && v1Data.categories.length > 0
        ? v1Data.categories
        : DEFAULT_CATEGORIES,
      transactions: migratedTransactions,
      budgets: Array.isArray(v1Data.budgets) ? v1Data.budgets : [],
      recurring: [],
      settings: { dateFormat: 'es-CO', pageSize: 25 }
    };
  }

  /**
   * Convierte esquema v2 a v3:
   * 1. Multiplica montos decimales por 100 redondeando a enteros en centavos.
   * 2. Inicializa sub-entidad `pockets: []` en cada cuenta.
   * 3. Asigna `pocketId: null` en transacciones existentes.
   * 4. Inyecta metadatos LWW (`updatedAt`, `deletedAt: null`, `syncStatus: 'synced'`).
   */
  static migrateV2ToV3(v2Data) {
    const blank = this.getBlankState();
    const now = Date.now();

    // Migrar cuentas
    const sourceAccounts = Array.isArray(v2Data.accounts) && v2Data.accounts.length > 0
      ? v2Data.accounts
      : blank.accounts;

    const accounts = sourceAccounts.map(acc => ({
      ...acc,
      // Convertir balance inicial a centavos
      initialBalance: Math.round((Number(acc.initialBalance) || 0) * 100),
      pockets: Array.isArray(acc.pockets) ? acc.pockets : [],
      createdAt: acc.createdAt || now,
      updatedAt: acc.updatedAt || now,
      deletedAt: acc.deletedAt || null,
      syncStatus: 'synced'
    }));

    // Migrar transacciones
    const sourceTransactions = Array.isArray(v2Data.transactions) ? v2Data.transactions : [];
    const transactions = sourceTransactions.map(t => ({
      ...t,
      // Convertir monto a centavos
      amount: Math.round((Number(t.amount) || 0) * 100),
      pocketId: t.pocketId || null,
      createdAt: t.createdAt || now,
      updatedAt: t.updatedAt || now,
      deletedAt: t.deletedAt || null,
      syncStatus: 'synced'
    }));

    // Migrar presupuestos
    const sourceBudgets = Array.isArray(v2Data.budgets) ? v2Data.budgets : [];
    const budgets = sourceBudgets.map(b => ({
      ...b,
      limit: Math.round((Number(b.limit) || 0) * 100),
      createdAt: b.createdAt || now,
      updatedAt: b.updatedAt || now,
      deletedAt: b.deletedAt || null,
      syncStatus: 'synced'
    }));

    // Migrar recurrentes
    const sourceRecurring = Array.isArray(v2Data.recurring) ? v2Data.recurring : [];
    const recurring = sourceRecurring.map(r => ({
      ...r,
      amount: Math.round((Number(r.amount) || 0) * 100),
      createdAt: r.createdAt || now,
      updatedAt: r.updatedAt || now,
      deletedAt: r.deletedAt || null,
      syncStatus: 'synced'
    }));

    // Migrar categorías
    const sourceCategories = Array.isArray(v2Data.categories) && v2Data.categories.length > 0
      ? v2Data.categories
      : blank.categories;

    const categories = sourceCategories.map(c => ({
      ...c,
      createdAt: c.createdAt || now,
      updatedAt: c.updatedAt || now,
      deletedAt: c.deletedAt || null,
      syncStatus: 'synced'
    }));

    return {
      version: APP_VERSION,
      currency: v2Data.currency || 'COP',
      theme: v2Data.theme || 'light',
      accounts,
      categories,
      transactions,
      budgets,
      recurring,
      settings: { ...blank.settings, ...(v2Data.settings || {}) }
    };
  }

  /**
   * Carga todo el estado desde los stores de IndexedDB.
   * @returns {Promise<Object>}
   */
  static async loadState() {
    const blank = this.getBlankState();
    try {
      const [
        metaList,
        accounts,
        categories,
        transactions,
        budgets,
        recurring
      ] = await Promise.all([
        this.getAll('meta'),
        this.getAll('accounts'),
        this.getAll('categories'),
        this.getAll('transactions'),
        this.getAll('budgets'),
        this.getAll('recurring')
      ]);

      const metaMap = Object.fromEntries(metaList.map(m => [m.key, m.value]));

      return {
        version: APP_VERSION,
        currency: metaMap.currency || blank.currency,
        theme: metaMap.theme || blank.theme,
        accounts: accounts.length > 0 ? accounts : blank.accounts,
        categories: categories.length > 0 ? categories : blank.categories,
        transactions,
        budgets,
        recurring,
        settings: metaMap.settings || blank.settings
      };
    } catch (err) {
      console.error('[StorageService] Error al cargar estado desde IndexedDB:', err);
      return blank;
    }
  }

  /**
   * Guarda todo el estado en IndexedDB transaccionalmente.
   * @param {Object} state
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async saveState(state) {
    try {
      const db = await this.openDB();
      const stores = ['meta', 'accounts', 'categories', 'transactions', 'budgets', 'recurring'];
      const tx = db.transaction(stores, 'readwrite');

      // 1. Guardar metadatos
      const metaStore = tx.objectStore('meta');
      metaStore.put({ key: 'version', value: APP_VERSION });
      metaStore.put({ key: 'currency', value: state.currency });
      metaStore.put({ key: 'theme', value: state.theme });
      metaStore.put({ key: 'settings', value: state.settings });
      metaStore.put({ key: 'lastSaved', value: Date.now() });

      // Helper para sincronizar un store completo
      const syncStore = (storeName, items = []) => {
        const store = tx.objectStore(storeName);
        store.clear();
        for (const item of items) {
          store.put(item);
        }
      };

      syncStore('accounts', state.accounts);
      syncStore('categories', state.categories);
      syncStore('transactions', state.transactions);
      syncStore('budgets', state.budgets);
      syncStore('recurring', state.recurring);

      return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve({ success: true });
        tx.onerror = () => {
          console.error('[StorageService] Error en transacción saveState:', tx.error);
          resolve({ success: false, error: tx.error?.message || 'Error guardando en IndexedDB' });
        };
      });
    } catch (error) {
      console.error('[StorageService] Excepción al persistir estado en IndexedDB:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Guarda o actualiza una única entidad de manera granular (útil para LWW y Firestore sync).
   * @param {string} storeName
   * @param {Object} entity
   * @returns {Promise<void>}
   */
  static async saveEntity(storeName, entity) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(entity);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Elimina una entidad por su clave primaria de forma física o soft delete.
   * @param {string} storeName
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async deleteEntity(storeName, id) {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Restablece los datos de fábrica vaciando todos los stores de IndexedDB.
   * @returns {Promise<Object>} Estado base en blanco v3.
   */
  static async reset() {
    try {
      const db = await this.openDB();
      const stores = ['meta', 'accounts', 'categories', 'transactions', 'budgets', 'recurring'];
      const tx = db.transaction(stores, 'readwrite');

      for (const s of stores) {
        tx.objectStore(s).clear();
      }

      await new Promise(resolve => {
        tx.oncomplete = resolve;
      });

      const blank = this.getBlankState();
      await this.saveState(blank);
      await this.put('meta', { key: 'app_initialized', value: true, timestamp: Date.now() });

      return blank;
    } catch (err) {
      console.error('[StorageService] Error reseteando base de datos:', err);
      return this.getBlankState();
    }
  }

  /**
   * Elimina por completo la base de datos IndexedDB y limpia claves de sesión local.
   * Utilizado para protección de privacidad estricta en logout y transición a Guest Mode.
   * @returns {Promise<void>}
   */
  static async deleteDatabase() {
    try {
      if (this.dbPromise) {
        const db = await this.dbPromise;
        db.close();
        this.dbPromise = null;
      }

      if (typeof indexedDB !== 'undefined') {
        await new Promise((resolve, reject) => {
          const req = indexedDB.deleteDatabase(DB_NAME);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
          req.onblocked = () => {
            console.warn('[StorageService] Borrado de base de datos bloqueado por conexiones activas.');
            resolve();
          };
        });
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY_V1);
        localStorage.removeItem(STORAGE_KEY_V2);
        localStorage.removeItem(STORAGE_KEY_V3);
        localStorage.removeItem('finscope_last_sync_timestamp');
      }

      console.log('[StorageService] Base de datos local finscope_db_v3 eliminada por completo.');
    } catch (err) {
      console.error('[StorageService] Error eliminando base de datos IndexedDB:', err);
    }
  }
}
