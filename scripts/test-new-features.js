/**
 * scripts/test-new-features.js
 * Suite de verificación para las 3 nuevas mejoras de arquitectura:
 * 1. Formateo de montos en vivo y compatibilidad canónica con currencyService.toCents
 * 2. Validación estricta de categoría sin preselección por defecto
 * 3. Reasignación de movimientos / traslado de montos específicos ($X) entre categorías
 */

import assert from 'node:assert';
import { currencyService } from '../src/services/currencyService.js';
import { formatAmountValue } from '../src/ui/amountFormatter.js';
import { transactionService } from '../src/services/transactionService.js';
import { store } from '../src/core/store.js';
import { eventBus } from '../src/core/eventBus.js';
import { StorageService } from '../src/core/storage.js';

console.log('Iniciando Suite de Pruebas: Nuevas Mejoras Operativas y de Producto...\n');

// Mock localStorage and IndexedDB in memory
if (!globalThis.localStorage) {
  const memStore = new Map();
  globalThis.localStorage = {
    getItem: k => memStore.get(k) || null,
    setItem: (k, v) => memStore.set(k, String(v)),
    removeItem: k => memStore.delete(k),
    clear: () => memStore.clear()
  };
}

let inMemoryStorage = new Map();
StorageService.openDB = async () => ({
  close: () => {},
  transaction: () => ({
    objectStore: () => ({
      get: () => ({ onsuccess: null, onerror: null }),
      put: () => ({ onsuccess: null, onerror: null }),
      delete: () => ({ onsuccess: null, onerror: null }),
      clear: () => ({ onsuccess: null, onerror: null }),
      getAll: () => ({ onsuccess: null, onerror: null })
    })
  })
});
StorageService.saveState = async (state) => {
  inMemoryStorage.set('state', JSON.parse(JSON.stringify(state)));
  return true;
};
StorageService.saveEntity = async (storeName, entity) => {
  inMemoryStorage.set(`${storeName}:${entity.id}`, JSON.parse(JSON.stringify(entity)));
  return true;
};

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✔ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== 1. Formateo de montos en vivo y Safe Math (centavos) ===');

await test('Formateo visual: enteros largos sin asumir decimales automáticamente', () => {
  // Cifras enteras libres
  assert.strictEqual(formatAmountValue('225000'), '225.000');
  assert.strictEqual(formatAmountValue('2250000'), '2.250.000');
  assert.strictEqual(formatAmountValue('1000000'), '1.000.000');
  assert.strictEqual(formatAmountValue('500'), '500');
  assert.strictEqual(formatAmountValue('0'), '0');
  assert.strictEqual(formatAmountValue(''), '');
  assert.strictEqual(formatAmountValue('$ 225.000'), '225.000');
});

await test('Formateo visual: coma decimal SOLO si se teclea explícitamente y preserva coma final', () => {
  assert.strictEqual(formatAmountValue('225000,50'), '225.000,50');
  assert.strictEqual(formatAmountValue('225.000,50'), '225.000,50');
  assert.strictEqual(formatAmountValue('1250,5'), '1.250,5');
  assert.strictEqual(formatAmountValue('19.99'), '19,99');
  assert.strictEqual(formatAmountValue('225.000,', true), '225.000,');
});

await test('currencyService.toCents: procesa correctamente entradas formateadas y crudas', () => {
  // Entero formateado
  assert.strictEqual(currencyService.toCents('225.000'), 22500000);
  assert.strictEqual(currencyService.toCents('1.000.000'), 100000000);
  assert.strictEqual(currencyService.toCents('225000'), 22500000);

  // Decimales
  assert.strictEqual(currencyService.toCents('225.000,50'), 22500050);
  assert.strictEqual(currencyService.toCents('225.000,'), 22500000);
  assert.strictEqual(currencyService.toCents('19.99'), 1999);
  assert.strictEqual(currencyService.toCents('19,99'), 1999);
  assert.strictEqual(currencyService.toCents('$ 225.000,50'), 22500050);
  assert.strictEqual(currencyService.toCents(19.99), 1999);
});

console.log('\n=== 2. Validación estricta de categoría sin preselección ===');

await test('transactionService.saveTransaction rechaza categorías vacías', () => {
  const resEmpty = transactionService.saveTransaction({
    type: 'expense',
    title: 'Café',
    amount: '5000',
    date: '2026-10-24',
    categoryId: '',
    accountId: 'acc-1'
  });
  assert.strictEqual(resEmpty.success, false);
  assert.ok(resEmpty.error.includes('selecciona una categoría'));

  const resNull = transactionService.saveTransaction({
    type: 'expense',
    title: 'Café',
    amount: '5000',
    date: '2026-10-24',
    categoryId: null,
    accountId: 'acc-1'
  });
  assert.strictEqual(resNull.success, false);

  const resWhitespace = transactionService.saveTransaction({
    type: 'expense',
    title: 'Café',
    amount: '5000',
    date: '2026-10-24',
    categoryId: '   ',
    accountId: 'acc-1'
  });
  assert.strictEqual(resWhitespace.success, false);
});

console.log('\n=== 3. Reasignación de movimientos y traslado de valor ($X) entre categorías ===');

await test('transactionService.reassignCategory: reasigna todas las transacciones activas si no se especifica monto', async () => {
  const sourceCatId = 'cat-source-all';
  const targetCatId = 'cat-target-all';

  const tx1 = {
    id: 'tx-all-1',
    title: 'Supermercado 1',
    amount: 1000000, // $10,000 en centavos
    type: 'expense',
    categoryId: sourceCatId,
    accountId: 'acc-1',
    deletedAt: null
  };

  const tx2 = {
    id: 'tx-all-2',
    title: 'Supermercado 2',
    amount: 2500000, // $25,000 en centavos
    type: 'expense',
    categoryId: sourceCatId,
    accountId: 'acc-1',
    deletedAt: null
  };

  store.setState({ transactions: [tx1, tx2] });

  const result = await transactionService.reassignCategory(sourceCatId, targetCatId);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.count, 2);
  assert.strictEqual(result.amount, 3500000);

  const updatedTxs = store.transactions.filter(t => t.categoryId === targetCatId);
  assert.strictEqual(updatedTxs.length, 2);
});

await test('transactionService.reassignCategory: traslada un valor específico ($X) dividiendo movimientos si es necesario', async () => {
  const sourceCatId = 'cat-source-amount';
  const targetCatId = 'cat-target-amount';

  // Categoría origen con 2 transacciones: $10,000 + $25,000 = $35,000
  const tx1 = {
    id: 'tx-amt-1',
    title: 'Compra A',
    amount: 1000000, // 10,000 en centavos
    type: 'expense',
    categoryId: sourceCatId,
    accountId: 'acc-1',
    deletedAt: null
  };

  const tx2 = {
    id: 'tx-amt-2',
    title: 'Compra B',
    amount: 2500000, // 25,000 en centavos
    type: 'expense',
    categoryId: sourceCatId,
    accountId: 'acc-1',
    deletedAt: null
  };

  store.setState({ transactions: [tx1, tx2] });

  let eventPayload = null;
  const unsubscribe = eventBus.on('transactions:reassigned', (data) => {
    eventPayload = data;
  });

  // Mover $15,000 (1500000 centavos) de origen a destino
  const result = await transactionService.reassignCategory(sourceCatId, targetCatId, 1500000);
  unsubscribe();

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.amount, 1500000);

  // Verificación de saldos resultantes en cada categoría
  const sourceActive = store.transactions.filter(t => !t.deletedAt && t.categoryId === sourceCatId);
  const targetActive = store.transactions.filter(t => !t.deletedAt && t.categoryId === targetCatId);

  const sourceTotal = sourceActive.reduce((sum, t) => sum + t.amount, 0);
  const targetTotal = targetActive.reduce((sum, t) => sum + t.amount, 0);

  // Total origen pasó de 35,000 a 20,000
  assert.strictEqual(sourceTotal, 2000000, 'Origen debe quedar con 20,000 centavos');
  // Total destino pasó a 15,000
  assert.strictEqual(targetTotal, 1500000, 'Destino debe recibir exactamente 15,000 centavos');

  // Suma total global se mantiene inalterada (invariante contable)
  assert.strictEqual(sourceTotal + targetTotal, 3500000);

  // Evento emitido con datos correctos
  assert.ok(eventPayload);
  assert.strictEqual(eventPayload.amount, 1500000);
});

await test('transactionService.reassignCategory: valida montos inválidos o superiores al disponible', async () => {
  const sourceCatId = 'cat-source-val';
  const targetCatId = 'cat-target-val';

  const tx = {
    id: 'tx-val-1',
    title: 'Compra Única',
    amount: 500000, // 5,000 en centavos
    type: 'expense',
    categoryId: sourceCatId,
    accountId: 'acc-1',
    deletedAt: null
  };

  store.setState({ transactions: [tx] });

  // Monto mayor al total disponible
  const resExcess = await transactionService.reassignCategory(sourceCatId, targetCatId, 600000);
  assert.strictEqual(resExcess.success, false);
  assert.ok(resExcess.error.includes('supera el total disponible'));

  // Monto menor o igual a cero
  const resZero = await transactionService.reassignCategory(sourceCatId, targetCatId, 0);
  assert.strictEqual(resZero.success, false);
});

console.log(`\n-------------------------------------------------------------`);
console.log(`✔ TODAS LAS PRUEBAS NUEVAS PASARON EXITOSAMENTE: ${passed}/${passed} verificadas.\n`);
