/**
 * scripts/test-cache-wipe.js
 * Suite de Pruebas Automatizadas: Rehidratación desde Cloud Firestore tras Borrado de Caché.
 * 
 * Simula de extremo a extremo el flujo exacto del bug reportado en FinScope v3.1:
 * - Paso A: Inserción inicial (1 cuenta con saldo, 1 alcancía fondeada y 2 transacciones).
 * - Paso B: Subida a Firestore simulada (validación de updatedAt, deletedAt: null y enteros en centavos).
 * - Paso C: Borrado total de caché física (StorageService.deleteDatabase() dejando store en $0).
 * - Paso D: Invocación de pullAllUserData() para rehidratación reactiva.
 * - Paso E: Aserciones de integridad contable, invariante de alcancías y precisión Safe Math.
 */

import assert from 'node:assert/strict';
import { StorageService } from '../src/core/storage.js';

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
// Simulación de Almacenamiento Local (IndexedDB en Memoria)
// -------------------------------------------------------------
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

// Importar servicios reactivos
const { store } = await import('../src/core/store.js');
const { accountService } = await import('../src/services/accountService.js');
const { transactionService } = await import('../src/services/transactionService.js');
const { currencyService } = await import('../src/services/currencyService.js');
const { firestoreService } = await import('../src/services/firestoreService.js');

console.log(`${colors.bold}${colors.yellow}Iniciando Suite de Certificación: Rehidratación Cloud tras Borrado de Caché...${colors.reset}`);

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
    // PASO A: Inserción inicial
    // -------------------------------------------------------------
    heading('Paso A: Inserción Inicial de Datos en FinScope');

    let testAccountId = null;
    let testPocketId = null;
    let expectedBalances = null;

    await runStep('A1: Inicializar Store con estado base en blanco', async () => {
      await store.init();
      await store.replaceState(StorageService.getBlankState());
      assert.equal(store.transactions.length, 0);
    });

    await runStep('A2: Crear 1 Cuenta con saldo inicial ($25,000.00 COP = 2,500,000 centavos)', async () => {
      const res = accountService.saveAccount({
        name: 'Bancolombia Nómina Principal',
        type: 'bank',
        initialBalance: 25000,
        color: '#1e40af',
        icon: 'account_balance'
      });
      assert.equal(res.success, true);
      assert.ok(res.account?.id);
      testAccountId = res.account.id;
      assert.equal(res.account.initialBalance, 2500000);
    });

    await runStep('A3: Crear 1 Alcancía (Meta: Fondo de Emergencias por $10,000.00)', async () => {
      const res = accountService.createPocket(testAccountId, {
        name: 'Fondo de Emergencias',
        targetAmount: 10000,
        color: '#059669',
        icon: 'savings'
      });
      assert.equal(res.success, true);
      assert.ok(res.pocket?.id);
      testPocketId = res.pocket.id;
      assert.equal(res.pocket.targetAmount, 1000000);
    });

    await runStep('A4: Fondeo de la alcancía ($3,000.00 COP = 300,000 centavos desde disponible)', async () => {
      const res = accountService.depositToPocket(testAccountId, testPocketId, 3000, 'Aporte inicial para emergencias');
      assert.equal(res.success, true);
      assert.equal(res.transaction.amount, 300000);
      assert.equal(res.transaction.type, 'pocket_deposit');
    });

    await runStep('A5: Registrar 2 Transacciones (1 Gasto y 1 Ingreso con decimales)', async () => {
      // Gasto de supermercado: $450.75 COP = 45075 centavos
      const tx1 = transactionService.saveTransaction({
        type: 'expense',
        title: 'Mercado de Víveres Supermercado',
        amount: 450.75,
        date: '2026-10-20',
        accountId: testAccountId,
        categoryId: 'cat-food'
      });
      assert.equal(tx1.success, true);
      assert.equal(tx1.transaction.amount, 45075);

      // Ingreso por consultoría: $1,200.00 COP = 120000 centavos
      const tx2 = transactionService.saveTransaction({
        type: 'income',
        title: 'Honorarios Asesoría Financiera',
        amount: 1200,
        date: '2026-10-20',
        accountId: testAccountId,
        categoryId: 'cat-salary'
      });
      assert.equal(tx2.success, true);
      assert.equal(tx2.transaction.amount, 120000);
    });

    await runStep('A6: Validar Invariante Contable Pre-Wipe', async () => {
      expectedBalances = accountService.calculateBalances(testAccountId);
      // Saldo Inicial = 2,500,000
      // Fondeo Alcancía = 300,000 (Available: 2,200,000 | Alcancía: 300,000 | Total: 2,500,000)
      // Gasto = -45,075 (Available: 2,154,925 | Alcancía: 300,000 | Total: 2,454,925)
      // Ingreso = +120,000 (Available: 2,274,925 | Alcancía: 300,000 | Total: 2,574,925)
      assert.equal(expectedBalances.totalBalance, 2574925);
      assert.equal(expectedBalances.availableBalance, 2274925);
      assert.equal(expectedBalances.pockets[0].currentBalance, 300000);
      assert.equal(
        expectedBalances.totalBalance,
        expectedBalances.availableBalance + expectedBalances.pockets[0].currentBalance
      );
    });

    // -------------------------------------------------------------
    // PASO B: Subida a Firestore simulada
    // -------------------------------------------------------------
    heading('Paso B: Verificación de Formato y Subida Simulada a Cloud Firestore');

    let cloudData = null;

    await runStep('B1: Capturar snapshot para la nube y validar metadatos LWW y Safe Math', async () => {
      cloudData = {
        accounts: JSON.parse(JSON.stringify(store.accounts)),
        transactions: JSON.parse(JSON.stringify(store.transactions)),
        categories: JSON.parse(JSON.stringify(store.categories)),
        budgets: JSON.parse(JSON.stringify(store.budgets)),
        recurring: JSON.parse(JSON.stringify(store.recurring)),
        meta: { currency: store.currency, theme: store.theme }
      };

      // Validar Cuentas y Alcancías anidadas
      for (const acc of cloudData.accounts) {
        assert.equal(typeof acc.updatedAt, 'number', 'Account debe tener updatedAt numérico');
        assert.equal(acc.deletedAt, null, 'Account no eliminada debe tener deletedAt: null');
        assert.ok(Number.isInteger(acc.initialBalance), 'initialBalance debe ser entero en centavos');
        for (const p of acc.pockets || []) {
          assert.equal(typeof p.updatedAt, 'number');
          assert.equal(p.deletedAt, null);
          assert.ok(Number.isInteger(p.targetAmount), 'Pocket targetAmount debe ser entero en centavos');
        }
      }

      // Validar Transacciones
      assert.equal(cloudData.transactions.length, 3); // 2 manuales + 1 de fondeo de alcancía
      for (const tx of cloudData.transactions) {
        assert.equal(typeof tx.updatedAt, 'number', 'Tx debe tener updatedAt numérico');
        assert.equal(tx.deletedAt, null, 'Tx deletedAt debe ser null');
        assert.ok(Number.isInteger(tx.amount), 'Tx amount debe ser entero en centavos');
        assert.ok(tx.amount > 0, 'Tx amount debe ser estrictamente positivo');
      }
    });

    // -------------------------------------------------------------
    // PASO C: Simulación de Borrado Físico de Caché / IndexedDB
    // -------------------------------------------------------------
    heading('Paso C: Simulación de Borrado de Caché / Datos del Navegador');

    await runStep('C1: Ejecutar StorageService.deleteDatabase() y limpiar Store en memoria', async () => {
      // Simula el borrado físico de IndexedDB por parte del usuario en el navegador
      await StorageService.deleteDatabase();
      await store.clearForGuestMode();

      // Confirmar que el almacén quedó completamente vacío en cero ($0)
      assert.equal(store.transactions.length, 0, 'No deben quedar transacciones tras wipe');
      assert.equal(inMemoryStorage.size, 0, 'Almacenamiento persistente debe estar vacío');

      // Intentar calcular saldo sobre la cuenta previa debe arrojar 0
      const wipedBalances = accountService.calculateBalances(testAccountId);
      assert.equal(wipedBalances.totalBalance, 0, 'Saldo Total tras wipe debe ser $0');
      assert.equal(wipedBalances.availableBalance, 0, 'Saldo Disponible tras wipe debe ser $0');
      assert.equal(wipedBalances.pockets.length, 0, 'No deben quedar alcancías');
    });

    // -------------------------------------------------------------
    // PASO D: Pull y Rehidratación desde Cloud Firestore
    // -------------------------------------------------------------
    heading('Paso D: Rehidratación desde Cloud Firestore (pullAllUserData)');

    let pullResult = null;

    await runStep('D1: Invocar firestoreService.pullAllUserData() con datos remotos', async () => {
      pullResult = await firestoreService.pullAllUserData('google-user-uid-test-12345', cloudData);

      assert.equal(pullResult.success, true, 'pullAllUserData debe completarse exitosamente');
      assert.ok(pullResult.pulledCount > 0, 'Debe haber procesado registros remotos');
    });

    // -------------------------------------------------------------
    // PASO E: Aserción de Integridad y Recuperación Contable Exacta
    // -------------------------------------------------------------
    heading('Paso E: Aserciones de Integridad y Reconciliación Contable');

    await runStep('E1: Verificar que el Store recuperó exactamente todas las transacciones', async () => {
      assert.equal(store.transactions.length, 3, 'Deben existir exactamente las 3 transacciones');
      const expenseTx = store.transactions.find(t => t.type === 'expense');
      const incomeTx = store.transactions.find(t => t.type === 'income');
      const depositTx = store.transactions.find(t => t.type === 'pocket_deposit');

      assert.ok(expenseTx, 'Debe existir la transacción de gasto');
      assert.equal(expenseTx.amount, 45075);
      assert.equal(expenseTx.syncStatus, 'synced');

      assert.ok(incomeTx, 'Debe existir la transacción de ingreso');
      assert.equal(incomeTx.amount, 120000);
      assert.equal(incomeTx.syncStatus, 'synced');

      assert.ok(depositTx, 'Debe existir la transacción de aporte a alcancía');
      assert.equal(depositTx.amount, 300000);
      assert.equal(depositTx.syncStatus, 'synced');
    });

    await runStep('E2: Verificar recuperación de cuenta y alcancía con formato exacto', async () => {
      const recoveredAccount = store.accounts.find(a => a.id === testAccountId);
      assert.ok(recoveredAccount, 'La cuenta debe existir en el store recuperado');
      assert.equal(recoveredAccount.name, 'Bancolombia Nómina Principal');
      assert.equal(recoveredAccount.initialBalance, 2500000);
      assert.equal(recoveredAccount.syncStatus, 'synced');

      assert.equal(recoveredAccount.pockets.length, 1, 'La alcancía debe haberse recuperado');
      const recoveredPocket = recoveredAccount.pockets[0];
      assert.equal(recoveredPocket.id, testPocketId);
      assert.equal(recoveredPocket.name, 'Fondo de Emergencias');
      assert.equal(recoveredPocket.targetAmount, 1000000);
    });

    await runStep('E3: Invariante Contable de Alcancías: Total = Disponible + Σ(Alcancías)', async () => {
      const finalBalances = accountService.calculateBalances(testAccountId);

      assert.equal(finalBalances.totalBalance, expectedBalances.totalBalance, 'Saldo Total debe ser idéntico al original');
      assert.equal(finalBalances.availableBalance, expectedBalances.availableBalance, 'Saldo Disponible debe ser idéntico al original');
      assert.equal(finalBalances.pockets[0].currentBalance, 300000, 'Saldo de la alcancía debe ser exactamente 300,000 centavos');

      // Verificación estricta de la Invariante
      const sumPockets = finalBalances.pockets.reduce((sum, p) => sum + p.currentBalance, 0);
      assert.equal(
        finalBalances.totalBalance,
        finalBalances.availableBalance + sumPockets,
        'La invariante contable Saldo Total = Saldo Disponible + Σ Alcancías debe cumplirse estrictamente'
      );
    });

    await runStep('E4: Preservación de Safe Math (Enteros en centavos sin coma flotante)', async () => {
      const finalBalances = accountService.calculateBalances(testAccountId);

      // Verificación de enteros exactos
      assert.ok(Number.isInteger(finalBalances.totalBalance), 'totalBalance debe ser un entero');
      assert.ok(Number.isInteger(finalBalances.availableBalance), 'availableBalance debe ser un entero');
      assert.ok(Number.isInteger(finalBalances.pockets[0].currentBalance), 'pocket balance debe ser entero');

      // Conversión legible con currencyService sin corrupción decimal
      assert.equal(currencyService.fromCents(finalBalances.totalBalance), 25749.25);
      assert.equal(currencyService.fromCents(finalBalances.availableBalance), 22749.25);
      assert.equal(currencyService.fromCents(finalBalances.pockets[0].currentBalance), 3000.0);
    });

    await runStep('E5: Confirmar persistencia atómica en almacenamiento local simulado', async () => {
      const persisted = inMemoryStorage.get('persisted_state');
      assert.ok(persisted, 'El estado debió persistirse atómicamente en IndexedDB');
      assert.equal(persisted.accounts.length, store.accounts.length);
      assert.equal(persisted.transactions.length, store.transactions.length);
    });

    console.log(`\n-------------------------------------------------------------`);
    console.log(`${colors.bold}${colors.green}✔ TODAS LAS PRUEBAS PASARON EXITOSAMENTE: ${passedCount}/${testCount} verificadas.${colors.reset}`);
    console.log(`${colors.cyan}Certificación FinScope v3.1: Rehidratación desde Cloud Firestore validada al 100%.${colors.reset}\n`);
    process.exit(0);

  } catch (error) {
    console.error(`\n${colors.red}${colors.bold}ERROR CRÍTICO EN SUITE DE PRUEBAS:${colors.reset}`, error);
    process.exit(1);
  }
}

main();
