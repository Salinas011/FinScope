/**
 * scripts/test-multi-browser-sync.js
 * Suite de Verificación: Sincronización Multi-Navegador y Rehidratación en Cliente Limpio.
 *
 * Simula el flujo exacto de abrir FinScope en un nuevo navegador o ventana de incógnito:
 * 1. Almacenamiento local limpio (IndexedDB y localStorage vacíos).
 * 2. Hidratación inicial con estado en blanco por defecto (cuentas vacías en $0).
 * 3. Inicio de sesión interactivo con Google Identity Services (GIS).
 * 4. Estandarización de `uid` en authService y firestoreService.
 * 5. Rehidratación reactiva mediante pullAllUserData(uid).
 * 6. Verificación de que las cuentas remotas reemplacen por completo las cuentas vacías por defecto (sin duplicados en $0).
 */

import assert from 'node:assert/strict';
import { StorageService } from '../src/core/storage.js';
import { DEFAULT_ACCOUNTS } from '../src/core/constants.js';

// Colores ANSI para terminal
const colors = {
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function pass(name) {
  console.log(`  ${colors.green}✔ PASS:${colors.reset} ${name}`);
}

function fail(name, err) {
  console.error(`  ${colors.red}✖ FAIL:${colors.reset} ${name}`);
  console.error(err);
}

function heading(title) {
  console.log(`\n${colors.bold}${colors.cyan}=== ${title} ===${colors.reset}`);
}

// -------------------------------------------------------------
// Simulación de Almacenamiento Local (IndexedDB y localStorage en Memoria)
// -------------------------------------------------------------
const inMemoryLocalStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => inMemoryLocalStorage.get(key) || null,
  setItem: (key, val) => inMemoryLocalStorage.set(key, String(val)),
  removeItem: (key) => inMemoryLocalStorage.delete(key),
  clear: () => inMemoryLocalStorage.clear()
};

let inMemoryStorage = new Map();

StorageService.openDB = async () => ({
  close: () => {},
  transaction: () => ({
    objectStore: () => ({
      clear: () => {},
      put: () => {},
      getAll: () => ({ onsuccess: null, onerror: null })
    })
  })
});

StorageService.init = async () => {
  return await StorageService.loadState();
};

StorageService.saveState = async (state) => {
  inMemoryStorage.set('persisted_state', JSON.parse(JSON.stringify(state)));
  return { success: true };
};

StorageService.loadState = async () => {
  if (inMemoryStorage.has('persisted_state')) {
    return JSON.parse(JSON.stringify(inMemoryStorage.get('persisted_state')));
  }
  return StorageService.getBlankState();
};

StorageService.saveEntity = async (collName, entity) => {
  const current = inMemoryStorage.get('persisted_state') || StorageService.getBlankState();
  const list = current[collName] || [];
  const idx = list.findIndex(e => e.id === entity.id);
  if (idx >= 0) list[idx] = entity;
  else list.push(entity);
  current[collName] = list;
  inMemoryStorage.set('persisted_state', current);
};

StorageService.deleteDatabase = async () => {
  inMemoryStorage.clear();
};

// Polyfill atob si fuera necesario
if (typeof globalThis.atob === 'undefined') {
  globalThis.atob = (str) => Buffer.from(str, 'base64').toString('binary');
}

// Generador de JWT simulado para Google Identity Services
function createMockGoogleJwt(payload) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.mock_signature`;
}

// Importar servicios del núcleo reactivo
const { store } = await import('../src/core/store.js');
const { eventBus } = await import('../src/core/eventBus.js');
const { authService } = await import('../src/services/authService.js');
const { firestoreService } = await import('../src/services/firestoreService.js');
const { accountService } = await import('../src/services/accountService.js');

console.log(`${colors.bold}${colors.yellow}Iniciando Suite: Sincronización Multi-Navegador en Cliente Limpio...${colors.reset}`);

let testCount = 0;
let passedCount = 0;

async function runStep(name, fn) {
  testCount++;
  try {
    await fn();
    passedCount++;
    pass(name);
  } catch (err) {
    fail(name, err);
    process.exitCode = 1;
    throw err;
  }
}

async function main() {
  try {
    // -------------------------------------------------------------
    // PASO 1: Estado Inicial en un Navegador Limpio
    // -------------------------------------------------------------
    heading('Paso 1: Inicialización en Navegador Limpio (Clean State)');

    await runStep('1.1: Almacenamiento local completamente vacío sin sesión previa', async () => {
      inMemoryLocalStorage.clear();
      inMemoryStorage.clear();
      await store.init();
      await store.replaceState(StorageService.getBlankState());

      assert.equal(authService.isAuthenticated(), false, 'Usuario no debe estar autenticado');
      assert.equal(authService.getUser(), null, 'getUser() debe retornar null');
      assert.equal(firestoreService.currentUserId, null, 'currentUserId debe ser null');
    });

    await runStep('1.2: El Store inicia con cuentas por defecto en cero y 0 transacciones', async () => {
      assert.equal(store.transactions.length, 0, 'No debe haber transacciones');
      assert.equal(store.accounts.length, DEFAULT_ACCOUNTS.length, 'Debe tener cuentas default de getBlankState');
      
      const defaultIds = DEFAULT_ACCOUNTS.map(a => a.id);
      for (const acc of store.accounts) {
        assert.ok(defaultIds.includes(acc.id), `Cuenta ${acc.id} debe ser default`);
        assert.equal(acc.initialBalance, 0, 'Saldo inicial default debe ser $0');
        assert.deepEqual(acc.pockets, [], 'Alcancías default deben ser un array vacío');
      }
    });

    // -------------------------------------------------------------
    // PASO 2: Datos Existentes en Cloud Firestore (Guardados en otro navegador)
    // -------------------------------------------------------------
    heading('Paso 2: Definición de Datos Remotos en Cloud Firestore');

    const REMOTE_USER_SUB = 'google-oauth2-sub-9876543210';
    const REMOTE_USER_EMAIL = 'andres.salinas@example.com';
    const now = Date.now();

    const remoteAccounts = [
      {
        id: 'acc-nomina-remota-001',
        name: 'Bancolombia Nómina Principal',
        type: 'bank',
        initialBalance: 3500000, // $35,000.00 COP
        pockets: [
          {
            id: 'pkt-viaje-001',
            name: 'Ahorro Vacaciones',
            targetAmount: 2000000,
            currentBalance: 500000,
            createdAt: now - 5000,
            updatedAt: now - 1000,
            deletedAt: null
          }
        ],
        createdAt: now - 10000,
        updatedAt: now - 1000,
        deletedAt: null,
        syncStatus: 'synced'
      },
      {
        id: 'acc-nequi-remota-002',
        name: 'Nequi Personal',
        type: 'wallet',
        initialBalance: 1200000, // $12,000.00 COP
        pockets: [],
        createdAt: now - 10000,
        updatedAt: now - 1000,
        deletedAt: null,
        syncStatus: 'synced'
      }
    ];

    const remoteTransactions = [
      {
        id: 'tx-ingreso-001',
        description: 'Pago Quincena Aviatur',
        amount: 2500000,
        type: 'income',
        accountId: 'acc-nomina-remota-001',
        categoryId: 'cat-salary',
        date: new Date().toISOString().slice(0, 10),
        createdAt: now - 3000,
        updatedAt: now - 1000,
        deletedAt: null,
        syncStatus: 'synced'
      },
      {
        id: 'tx-gasto-001',
        description: 'Almuerzo Restaurante',
        amount: 45000,
        type: 'expense',
        accountId: 'acc-nequi-remota-002',
        categoryId: 'cat-food',
        date: new Date().toISOString().slice(0, 10),
        createdAt: now - 2000,
        updatedAt: now - 1000,
        deletedAt: null,
        syncStatus: 'synced'
      }
    ];

    const remoteCloudData = {
      accounts: remoteAccounts,
      transactions: remoteTransactions,
      categories: [],
      budgets: [],
      recurring: [],
      meta: {
        currency: 'COP',
        theme: 'dark'
      }
    };

    // -------------------------------------------------------------
    // PASO 3: Simulación de Inicio de Sesión Interactivo con Google Identity Services
    // -------------------------------------------------------------
    heading('Paso 3: Login Interactivo y Estandarización de Identificador (Point 1 & 2)');

    let loginSuccessEventFired = false;
    let storeSyncedEventFired = false;

    eventBus.on('auth:login_success', (user) => {
      loginSuccessEventFired = true;
    });

    eventBus.on('store:synced', (data) => {
      storeSyncedEventFired = true;
    });

    await runStep('3.1: Procesar credencial JWT de Google en authService.handleCredentialResponse', async () => {
      const mockJwt = createMockGoogleJwt({
        sub: REMOTE_USER_SUB,
        email: REMOTE_USER_EMAIL,
        name: 'Andres Salinas',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
        given_name: 'Andres',
        family_name: 'Salinas'
      });

      // Sobrescribir temporalmente fetch a Firestore real con mockData para esta prueba controlada
      const originalPull = firestoreService.pullAllUserData.bind(firestoreService);
      firestoreService.pullAllUserData = async (uid, mockData = null) => {
        return await originalPull(uid, mockData || remoteCloudData);
      };

      await authService.handleCredentialResponse({ credential: mockJwt });

      assert.equal(authService.isAuthenticated(), true, 'Usuario debe quedar autenticado');
      const currentUser = authService.getUser();
      assert.ok(currentUser, 'currentUser debe existir');
      
      // Point 1: Estandarización de uid e id
      assert.equal(currentUser.uid, REMOTE_USER_SUB, 'currentUser.uid debe ser igual a payload.sub');
      assert.equal(currentUser.id, REMOTE_USER_SUB, 'currentUser.id debe coincidir con uid');
      assert.equal(currentUser.email, REMOTE_USER_EMAIL, 'currentUser.email debe ser correcto');
      
      // Point 1: firestoreService.currentUserId debe coincidir exactamente
      assert.equal(firestoreService.currentUserId, REMOTE_USER_SUB, 'firestoreService.currentUserId debe coincidir con uid');

      // Point 2: Eventos emitidos
      assert.equal(loginSuccessEventFired, true, 'auth:login_success debió ser emitido');
      assert.equal(storeSyncedEventFired, true, 'store:synced debió ser emitido');
    });

    // -------------------------------------------------------------
    // PASO 4: Reemplazo Completo del Estado en Blanco (Point 3)
    // -------------------------------------------------------------
    heading('Paso 4: Verificación de Reemplazo Total de Cuentas Vacías en Cero (Point 3)');

    await runStep('4.1: Cuentas remotas reemplazan por completo las cuentas vacías por defecto', async () => {
      const accountsInStore = store.accounts;
      
      // Deben existir exactamente las 2 cuentas de Firestore, SIN dejar las 4 cuentas default
      assert.equal(accountsInStore.length, 2, 'El store debe contener exactamente las 2 cuentas remotas');
      
      const defaultIds = DEFAULT_ACCOUNTS.map(a => a.id);
      for (const defId of defaultIds) {
        const found = accountsInStore.find(a => a.id === defId);
        assert.equal(found, undefined, `La cuenta default en cero '${defId}' NO debe existir en el store`);
      }

      // Validar que las 2 cuentas remotas están intactas con sus saldos y alcancías
      const nomina = accountsInStore.find(a => a.id === 'acc-nomina-remota-001');
      assert.ok(nomina, 'Debe existir la cuenta de nómina remota');
      assert.equal(nomina.initialBalance, 3500000, 'Saldo de nómina debe ser $35,000.00 COP (3,500,000 centavos)');
      assert.equal(nomina.pockets.length, 1, 'Debe tener la alcancía remota');
      assert.equal(nomina.pockets[0].name, 'Ahorro Vacaciones');

      const nequi = accountsInStore.find(a => a.id === 'acc-nequi-remota-002');
      assert.ok(nequi, 'Debe existir la cuenta Nequi remota');
      assert.equal(nequi.initialBalance, 1200000, 'Saldo de Nequi debe ser $12,000.00 COP (1,200,000 centavos)');
    });

    await runStep('4.2: Transacciones y metadatos remotos cargados en Store e IndexedDB', async () => {
      assert.equal(store.transactions.length, 2, 'Deben existir las 2 transacciones remotas');
      assert.equal(store.theme, 'dark', 'El tema debe haberse actualizado a dark desde remoteMeta');

      // Persistencia en IndexedDB simulado
      const persisted = inMemoryStorage.get('persisted_state');
      assert.ok(persisted, 'El estado debe haberse guardado en IndexedDB');
      assert.equal(persisted.accounts.length, 2, 'IndexedDB debe guardar exactamente las 2 cuentas remotas');
      assert.equal(persisted.transactions.length, 2, 'IndexedDB debe guardar las 2 transacciones');
    });

    await runStep('4.3: Cálculos de balance e invariantes contables correctos', async () => {
      const nominaBalances = accountService.calculateBalances('acc-nomina-remota-001');
      // Saldo inicial 3,500,000 + ingreso 2,500,000 = 6,000,000 Total
      assert.equal(nominaBalances.totalBalance, 6000000);
      assert.equal(nominaBalances.pockets.length, 1);

      const nequiBalances = accountService.calculateBalances('acc-nequi-remota-002');
      // Saldo inicial 1,200,000 - gasto 45,000 = 1,155,000 Total
      assert.equal(nequiBalances.totalBalance, 1155000);
    });

    // -------------------------------------------------------------
    // PASO 5: Cierre de Sesión y Restauración Limpia para Modo Invitado
    // -------------------------------------------------------------
    heading('Paso 5: Cierre de Sesión y Vuelta a Modo Invitado');

    await runStep('5.1: authService.signOut() borra sesión local y restablece estado en blanco', async () => {
      await authService.signOut();

      assert.equal(authService.isAuthenticated(), false);
      assert.equal(authService.getUser(), null);
      assert.equal(localStorage.getItem('finanza_auth_user'), null);
      assert.equal(store.transactions.length, 0, 'No deben quedar transacciones');
      assert.equal(store.accounts.length, DEFAULT_ACCOUNTS.length, 'Vuelve a las cuentas default en cero para Guest Mode');
    });

    console.log(`\n-------------------------------------------------------------`);
    console.log(`${colors.bold}${colors.green}✔ TODAS LAS PRUEBAS PASARON EXITOSAMENTE: ${passedCount}/${testCount} verificadas.${colors.reset}`);
    console.log(`${colors.cyan}Certificación FinScope: Bug de sincronización multi-navegador resuelto al 100%.${colors.reset}\n`);
    process.exit(0);

  } catch (error) {
    console.error(`\n${colors.red}${colors.bold}ERROR CRÍTICO EN TEST DE SINCRONIZACIÓN:${colors.reset}`, error);
    process.exit(1);
  }
}

main();
