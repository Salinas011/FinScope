/**
 * scripts/test-new-features.js
 * Suite de verificación para las 3 nuevas mejoras de arquitectura:
 * 1. Formateo de montos en vivo y compatibilidad canónica con currencyService.toCents
 * 2. Validación estricta de categoría sin preselección por defecto
 * 3. Reasignación masiva de movimientos entre categorías con lotes de 500 y eventos
 */

import assert from 'node:assert';
import { currencyService } from '../src/services/currencyService.js';
import { formatAmountValue } from '../src/ui/amountFormatter.js';
import { transactionService } from '../src/services/transactionService.js';
import { store } from '../src/core/store.js';
import { eventBus } from '../src/core/eventBus.js';

console.log('Iniciando Suite de Pruebas: Nuevas Mejoras Operativas y de Producto...\n');

import { StorageService } from '../src/core/storage.js';

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
function test(name, fn) {
  try {
    fn();
    console.log(`  ✔ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== 1. Formateo de montos en vivo y Safe Math (centavos) ===');

test('Formateo visual: enteros con separador de miles latino', () => {
  assert.strictEqual(formatAmountValue('225000'), '225.000');
  assert.strictEqual(formatAmountValue('1000000'), '1.000.000');
  assert.strictEqual(formatAmountValue('500'), '500');
  assert.strictEqual(formatAmountValue('0'), '0');
  assert.strictEqual(formatAmountValue(''), '');
});

test('Formateo visual: soporte de coma decimal y hasta 2 dígitos', () => {
  assert.strictEqual(formatAmountValue('225000,50'), '225.000,50');
  assert.strictEqual(formatAmountValue('225000.50'), '225.000,50');
  assert.strictEqual(formatAmountValue('1250,5'), '1.250,5');
  assert.strictEqual(formatAmountValue('19.99'), '19,99');
});

test('currencyService.toCents: procesa correctamente entradas formateadas y crudas', () => {
  // Entero formateado
  assert.strictEqual(currencyService.toCents('225.000'), 22500000);
  assert.strictEqual(currencyService.toCents('1.000.000'), 100000000);
  assert.strictEqual(currencyService.toCents('225000'), 22500000);

  // Decimales
  assert.strictEqual(currencyService.toCents('225.000,50'), 22500050);
  assert.strictEqual(currencyService.toCents('19.99'), 1999);
  assert.strictEqual(currencyService.toCents('19,99'), 1999);
  assert.strictEqual(currencyService.toCents('$ 225.000,50'), 22500050);
  assert.strictEqual(currencyService.toCents(19.99), 1999);
});

console.log('\n=== 2. Validación estricta de categoría sin preselección ===');

test('transactionService.saveTransaction rechaza categorías vacías', () => {
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

console.log('\n=== 3. Reasignación de movimientos entre categorías ===');

test('transactionService.reassignCategory: reasigna transacciones activas e ignora eliminadas', async () => {
  // Inicializar estado con transacciones de prueba
  const sourceCatId = 'cat-source-test';
  const targetCatId = 'cat-target-test';

  const tx1 = {
    id: 'tx-test-1',
    title: 'Supermercado 1',
    amount: 1000000, // 10,000 en centavos
    type: 'expense',
    categoryId: sourceCatId,
    accountId: 'acc-1',
    deletedAt: null
  };

  const tx2 = {
    id: 'tx-test-2',
    title: 'Supermercado 2',
    amount: 2500000, // 25,000 en centavos
    type: 'expense',
    categoryId: sourceCatId,
    accountId: 'acc-1',
    deletedAt: null
  };

  const txDeleted = {
    id: 'tx-test-deleted',
    title: 'Supermercado Borrado',
    amount: 500000,
    type: 'expense',
    categoryId: sourceCatId,
    accountId: 'acc-1',
    deletedAt: 1700000000000 // soft deleted
  };

  const txOther = {
    id: 'tx-test-other',
    title: 'Gasolina',
    amount: 800000,
    type: 'expense',
    categoryId: 'cat-other',
    accountId: 'acc-1',
    deletedAt: null
  };

  store.setState({
    transactions: [tx1, tx2, txDeleted, txOther]
  });

  let eventEmitted = false;
  let eventPayload = null;
  const unsubscribe = eventBus.on('transactions:reassigned', (data) => {
    eventEmitted = true;
    eventPayload = data;
  });

  const result = await transactionService.reassignCategory(sourceCatId, targetCatId);

  unsubscribe();

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.count, 2);

  // Verificar en store
  const updatedTx1 = store.transactions.find(t => t.id === 'tx-test-1');
  const updatedTx2 = store.transactions.find(t => t.id === 'tx-test-2');
  const updatedDeleted = store.transactions.find(t => t.id === 'tx-test-deleted');
  const updatedOther = store.transactions.find(t => t.id === 'tx-test-other');

  assert.strictEqual(updatedTx1.categoryId, targetCatId);
  assert.strictEqual(updatedTx2.categoryId, targetCatId);
  assert.strictEqual(updatedDeleted.categoryId, sourceCatId, 'Transacción borrada no debe reasignarse');
  assert.strictEqual(updatedOther.categoryId, 'cat-other');

  assert.strictEqual(eventEmitted, true);
  assert.strictEqual(eventPayload.sourceCategoryId, sourceCatId);
  assert.strictEqual(eventPayload.targetCategoryId, targetCatId);
  assert.strictEqual(eventPayload.count, 2);
});

console.log(`\n-------------------------------------------------------------`);
console.log(`✔ TODAS LAS PRUEBAS NUEVAS PASARON EXITOSAMENTE: ${passed}/${passed} verificadas.\n`);
