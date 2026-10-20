/**
 * scripts/verify-v3.js
 * Suite Ligera de Verificación Pre-Release (Smoke Tests) para FinScope v3
 * 
 * Valida de forma autónoma en segundos:
 * 1. Safe Math y conversiones exactas en currencyService (toCents y fromCents con casos borde).
 * 2. Invariante Contable de Alcancías (Pockets):
 *    Crear cuenta -> Depositar en alcancía -> Gasto directo desde alcancía ->
 *    Eliminar alcancía con saldo remanente y verificar que Saldo Disponible recupera los fondos
 *    sin alterar el Saldo Total de la cuenta.
 * 3. Aislamiento y exclusión estricta de Soft Deletes (deletedAt !== null).
 */

import assert from 'node:assert/strict';
import { StorageService } from '../src/core/storage.js';

// En entorno Node.js, silenciamos la persistencia en IndexedDB simulando guardado exitoso
StorageService.saveState = async () => ({ success: true });
StorageService.saveEntity = async () => {};

// Importar servicios bajo prueba
const { currencyService } = await import('../src/services/currencyService.js');
const { accountService } = await import('../src/services/accountService.js');
const { transactionService } = await import('../src/services/transactionService.js');
const { store } = await import('../src/core/store.js');

const colors = {
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function pass(testName) {
  console.log(`  ${colors.green}✔ PASS:${colors.reset} ${testName}`);
}

function heading(title) {
  console.log(`\n${colors.bold}${colors.cyan}=== ${title} ===${colors.reset}`);
}

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    pass(name);
  } catch (err) {
    console.error(`  ${colors.red}✖ FAIL:${colors.reset} ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    pass(name);
  } catch (err) {
    console.error(`  ${colors.red}✖ FAIL:${colors.reset} ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log(`${colors.bold}${colors.yellow}Iniciando Suite de Verificación FinScope v3...${colors.reset}`);

// -------------------------------------------------------------
// 1. SAFE MATH & CONVERSIONES DE MONEDA (currencyService)
// -------------------------------------------------------------
heading('1. Safe Math & Conversiones de Moneda (currencyService)');

runTest('Conversión decimal estándar: 19.99 -> 1999 centavos', () => {
  assert.equal(currencyService.toCents(19.99), 1999);
  assert.equal(currencyService.toCents('19.99'), 1999);
  assert.equal(currencyService.fromCents(1999), 19.99);
});

runTest('Precisión ante error de coma flotante IEEE 754: 0.1 + 0.2 -> 30 centavos', () => {
  const floatSum = 0.1 + 0.2; // 0.30000000000000004
  const cents = currencyService.toCents(floatSum);
  assert.equal(cents, 30);
  assert.equal(currencyService.fromCents(cents), 0.3);
});

runTest('Formato latino con separador de miles y coma: "1.250,50" -> 125050 centavos', () => {
  assert.equal(currencyService.toCents('1.250,50'), 125050);
  assert.equal(currencyService.fromCents(125050), 1250.5);
});

runTest('Cadenas formateadas con símbolos de moneda: "$ 50.000,00" -> 5000000 centavos', () => {
  assert.equal(currencyService.toCents('$ 50.000,00'), 5000000);
  assert.equal(currencyService.fromCents(5000000), 50000);
});

runTest('Grandes sumas monetarias (millones sin desbordamiento): 15,000,000.75', () => {
  const raw = '15000000.75';
  const cents = currencyService.toCents(raw);
  assert.equal(cents, 1500000075);
  assert.equal(currencyService.fromCents(cents), 15000000.75);
});

runTest('Valores borde y entradas inválidas (NaN, null, undefined, texto)', () => {
  assert.equal(currencyService.toCents(0), 0);
  assert.equal(currencyService.toCents(null), 0);
  assert.equal(currencyService.toCents(undefined), 0);
  assert.equal(currencyService.toCents(''), 0);
  assert.equal(currencyService.toCents('invalido'), 0);
  assert.equal(currencyService.fromCents(0), 0);
  assert.equal(currencyService.fromCents(null), 0);
});

// -------------------------------------------------------------
// 2. INVARIANTE CONTABLE DE ALCANCÍAS (accountService & transactionService)
// -------------------------------------------------------------
heading('2. Invariante Contable de Alcancías / Pockets');

// Limpiar store para un entorno de prueba controlado
store.setState({
  accounts: [],
  transactions: [],
  categories: [{ id: 'cat-test', name: 'General', type: 'expense', color: '#18181b', icon: 'receipt' }]
});

let testAccountId = null;
let testPocketId = null;

runTest('Paso 1: Crear cuenta bancaria con saldo inicial de $1,000.00 (100,000 centavos)', () => {
  const result = accountService.saveAccount({
    name: 'Banco Test Smoke',
    type: 'bank',
    initialBalance: 1000,
    color: '#0284c7',
    icon: 'account_balance'
  });

  assert.equal(result.success, true);
  testAccountId = result.account.id;

  const balances = accountService.calculateBalances(testAccountId);
  assert.equal(balances.totalBalance, 100000, 'Saldo Total debe ser 100,000 centavos');
  assert.equal(balances.availableBalance, 100000, 'Saldo Disponible debe ser 100,000 centavos');
  assert.equal(balances.pockets.length, 0, 'No debe tener alcancías inicialmente');
});

runTest('Paso 2: Crear Alcancía (Meta de Ahorro: Viaje a Japón por $500.00)', () => {
  const result = accountService.createPocket(testAccountId, {
    name: 'Viaje a Japón',
    targetAmount: 500,
    color: '#ec4899',
    icon: 'flight_takeoff'
  });

  assert.equal(result.success, true);
  const balances = accountService.calculateBalances(testAccountId);
  assert.equal(balances.pockets.length, 1);
  testPocketId = balances.pockets[0].id;

  assert.equal(balances.pockets[0].currentBalance, 0);
  assert.equal(balances.availableBalance, 100000);
  assert.equal(balances.totalBalance, 100000);
  // Invariante: Total = Disponible + Alcancías
  assert.equal(balances.totalBalance, balances.availableBalance + balances.pockets[0].currentBalance);
});

runTest('Paso 3: Depositar $300.00 (30,000 centavos) en la Alcancía (pocket_deposit)', () => {
  const depResult = accountService.depositToPocket(testAccountId, testPocketId, 300, 'Ahorro quincena');
  assert.equal(depResult.success, true);

  const balances = accountService.calculateBalances(testAccountId);
  const pocket = balances.pockets.find(p => p.id === testPocketId);

  assert.equal(pocket.currentBalance, 30000, 'Alcancía debe tener 30,000 centavos ($300.00)');
  assert.equal(balances.availableBalance, 70000, 'Saldo Disponible debe descender a 70,000 centavos ($700.00)');
  assert.equal(balances.totalBalance, 100000, 'Saldo Total de la cuenta NO debe cambiar ($1,000.00)');

  // Verificación estricta de la Invariante
  assert.equal(
    balances.totalBalance,
    balances.availableBalance + pocket.currentBalance,
    'Invariante Contable Violada en pocket_deposit: Total !== Disponible + Alcancía'
  );
});

runTest('Paso 4: Gasto directo desde la Alcancía de $50.00 (5,000 centavos)', () => {
  const txResult = transactionService.saveTransaction({
    title: 'Reserva vuelo parcial',
    amount: 50,
    type: 'expense',
    date: '2026-10-20',
    categoryId: 'cat-test',
    accountId: testAccountId,
    pocketId: testPocketId,
    method: 'Bolsillo'
  });

  assert.equal(txResult.success, true);

  const balances = accountService.calculateBalances(testAccountId);
  const pocket = balances.pockets.find(p => p.id === testPocketId);

  assert.equal(pocket.currentBalance, 25000, 'Alcancía debe quedar en 25,000 centavos ($250.00)');
  assert.equal(balances.availableBalance, 70000, 'Saldo Disponible debe permanecer intacto en 70,000 centavos');
  assert.equal(balances.totalBalance, 95000, 'Saldo Total de la cuenta debe ser 95,000 centavos');

  // Verificación estricta de la Invariante
  assert.equal(
    balances.totalBalance,
    balances.availableBalance + pocket.currentBalance,
    'Invariante Contable Violada en gasto de alcancía: Total !== Disponible + Alcancía'
  );
});

runTest('Paso 5: Eliminar Alcancía con saldo remanente ($250.00) y verificar auto-reintegro', () => {
  const delResult = accountService.deletePocket(testAccountId, testPocketId);
  assert.equal(delResult.success, true);
  assert.equal(delResult.releasedBalance, 25000, 'Debe haber liberado 25,000 centavos');

  const balances = accountService.calculateBalances(testAccountId);
  
  // La alcancía eliminada ya no debe figurar en alcancías activas
  assert.equal(balances.pockets.length, 0, 'No debe haber alcancías activas');
  
  // El saldo remanente debe retornar íntegramente al Disponible: 70,000 + 25,000 = 95,000
  assert.equal(balances.availableBalance, 95000, 'Saldo Disponible debe recuperar los 25,000 centavos');
  
  // El Saldo Total debe permanecer en 95,000 (la eliminación de la alcancía no altera el saldo total)
  assert.equal(balances.totalBalance, 95000, 'Saldo Total de la cuenta no debe variar durante la eliminación');

  // Invariante Contable final
  const sumPockets = balances.pockets.reduce((sum, p) => sum + p.currentBalance, 0);
  assert.equal(balances.totalBalance, balances.availableBalance + sumPockets);
});

// -------------------------------------------------------------
// 3. EXCLUSIÓN DE SOFT DELETES (deletedAt !== null)
// -------------------------------------------------------------
heading('3. Aislamiento y Exclusión de Soft Deletes');

runTest('Transacciones eliminadas son excluidas de balances, consultas y KPIs', () => {
  const tx = transactionService.saveTransaction({
    title: 'Gasto a eliminar',
    amount: 20,
    type: 'expense',
    date: '2026-10-20',
    categoryId: 'cat-test',
    accountId: testAccountId,
    pocketId: null
  });

  assert.equal(tx.success, true);
  const txId = tx.transaction.id;

  // Verificar que existe en la consulta activa
  assert.ok(transactionService.getById(txId));
  assert.ok(transactionService.getAll().some(t => t.id === txId));

  // Eliminar movimiento (Soft Delete)
  const del = transactionService.deleteTransaction(txId);
  assert.equal(del.success, true);

  // Comprobar que ya no aparece en getById ni en getAll
  assert.equal(transactionService.getById(txId), undefined);
  assert.equal(transactionService.getAll().some(t => t.id === txId), false);

  // Comprobar que getMonthStats no lo contabiliza
  const stats = transactionService.getMonthStats('2026-10');
  assert.equal(stats.transactions.some(t => t.id === txId), false);

  // Comprobar que en query() paginado tampoco se incluye
  const queryRes = transactionService.query({ search: 'Gasto a eliminar' });
  assert.equal(queryRes.totalCount, 0);
});

// -------------------------------------------------------------
// RESUMEN FINAL
// -------------------------------------------------------------
console.log(`\n-------------------------------------------------------------`);
if (passedTests === totalTests) {
  console.log(`${colors.green}${colors.bold}✔ TODAS LAS PRUEBAS PASARON EXITOSAMENTE: ${passedTests}/${totalTests} pruebas verificadas.${colors.reset}`);
  console.log(`${colors.cyan}Arquitectura FinScope v3 lista para despliegue en producción.${colors.reset}\n`);
} else {
  console.error(`${colors.red}${colors.bold}✖ ALGUNAS PRUEBAS FALLARON: ${passedTests}/${totalTests} pruebas pasadas.${colors.reset}\n`);
  process.exit(1);
}
