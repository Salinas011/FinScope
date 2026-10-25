/**
 * src/services/transactionService.js
 * Servicio de transacciones financieras v3 con soporte para Safe Math (centavos),
 * gasto directo desde Alcancías (pockets), filtros avanzados, paginación y métricas.
 *
 * @typedef {number} AmountInCents
 * Importe monetario canónico expresado como un número entero de centavos (base 100).
 * Almacenado en la base de datos sin coma flotante.
 * Ejemplos: $ 15.50 -> 1550; $ 50.000 -> 5000000.
 *
 * @typedef {Object} Transaction
 * @property {string} id Identificador único UUID de la transacción.
 * @property {string} title Concepto o descripción del movimiento.
 * @property {AmountInCents} amount Importe en centavos.
 * @property {'expense'|'income'|'transfer'|'pocket_deposit'|'pocket_withdraw'|'pocket_adjustment'} type Tipo de movimiento.
 * @property {string} date Fecha en formato YYYY-MM-DD.
 * @property {string} categoryId Identificador de la categoría asignada.
 * @property {string} accountId Identificador de la cuenta origen o principal.
 * @property {string|null} [toAccountId] Cuenta destino (para transferencias).
 * @property {string|null} [pocketId] Identificador de la alcancía asociada.
 * @property {string} [method] Método de pago o medio utilizado.
 * @property {string} [note] Notas o detalles adicionales.
 * @property {number} createdAt Marca temporal Unix ms.
 * @property {number} updatedAt Marca temporal Unix ms.
 * @property {number|null} deletedAt Marca temporal de borrado lógico (soft-delete).
 * @property {'synced'|'pending'} [syncStatus] Estado de sincronización en la nube.
 */
import { store } from '../core/store.js';
import { StorageService } from '../core/storage.js';
import { eventBus } from '../core/eventBus.js';
import { categoryService } from './categoryService.js';
import { accountService } from './accountService.js';
import { currencyService } from './currencyService.js';
import { firestoreService } from './firestoreService.js';

class TransactionService {
  /**
   * Obtiene todas las transacciones activas (sin soft-delete).
   * @returns {Array}
   */
  getAll() {
    return (store.transactions || []).filter(t => !t.deletedAt);
  }

  /**
   * Obtiene una transacción por su ID.
   * @param {string} id
   * @returns {Object|undefined}
   */
  getById(id) {
    return (store.transactions || []).find(t => t.id === id && !t.deletedAt);
  }

  /**
   * Filtra, busca, ordena y pagina transacciones para alto rendimiento con miles de registros.
   * Todos los totales agregados se calculan en enteros en centavos.
   * @param {Object} options
   * @returns {Object}
   */
  query({
    search = '',
    type = 'all',
    categoryId = 'all',
    accountId = 'all',
    pocketId = 'all',
    month = '',
    sortBy = 'date',
    sortOrder = 'desc',
    page = 1,
    pageSize = 25
  } = {}) {
    let list = this.getAll();

    // 1. Filtro por búsqueda textual (concepto, notas, categorías, cuentas)
    const cleanSearch = search.trim().toLocaleLowerCase('es-CO');
    if (cleanSearch) {
      list = list.filter(t => {
        const cat = categoryService.getById(t.categoryId);
        const acc = accountService.getById(t.accountId);
        const fullText = `${t.title} ${t.note || ''} ${cat?.name || ''} ${acc?.name || ''} ${t.method || ''}`.toLocaleLowerCase('es-CO');
        return fullText.includes(cleanSearch);
      });
    }

    // 2. Filtro por tipo
    if (type !== 'all') {
      list = list.filter(t => t.type === type);
    }

    // 3. Filtro por categoría
    if (categoryId !== 'all') {
      list = list.filter(t => t.categoryId === categoryId);
    }

    // 4. Filtro por cuenta
    if (accountId !== 'all') {
      list = list.filter(
        t => t.accountId === accountId || t.fromAccountId === accountId || t.toAccountId === accountId
      );
    }

    // 5. Filtro por alcancía (pocket)
    if (pocketId !== 'all') {
      if (pocketId === 'none') {
        list = list.filter(t => !t.pocketId);
      } else {
        list = list.filter(t => t.pocketId === pocketId);
      }
    }

    // 6. Filtro por mes (YYYY-MM)
    if (month) {
      list = list.filter(t => t.date && t.date.startsWith(month));
    }

    // 7. Ordenamiento
    list.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'date') {
        comparison = (b.date || '').localeCompare(a.date || '') || Number(b.createdAt || 0) - Number(a.createdAt || 0);
      } else if (sortBy === 'amount') {
        comparison = Number(b.amount || 0) - Number(a.amount || 0);
      } else if (sortBy === 'title') {
        comparison = (a.title || '').localeCompare(b.title || '');
      }

      return sortOrder === 'asc' ? -comparison : comparison;
    });

    // 8. Totales agregados de la consulta filtrada (en centavos)
    const totalCount = list.length;
    const totalIncome = list
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    const totalExpense = list
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + (Number(t.amount) || 0), 0);

    // 9. Paginación segura
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const limit = Math.max(5, parseInt(pageSize, 10) || 25);
    const totalPages = Math.max(1, Math.ceil(totalCount / limit));
    const safePage = Math.min(currentPage, totalPages);
    const startIndex = (safePage - 1) * limit;
    const paginatedItems = list.slice(startIndex, startIndex + limit);

    return {
      items: paginatedItems,
      totalCount,
      totalIncome,
      totalExpense,
      page: safePage,
      pageSize: limit,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
      startIndex: totalCount > 0 ? startIndex + 1 : 0,
      endIndex: Math.min(startIndex + limit, totalCount)
    };
  }

  /**
   * Obtiene estadísticas financieras de un mes (YYYY-MM).
   * Excluye movimientos internos (transferencias, pocket_deposit, pocket_withdraw).
   * Todos los valores devueltos están expresados en centavos.
   * @param {string} month 'YYYY-MM'
   * @returns {Object}
   */
  getMonthStats(month) {
    const monthTx = this.getAll().filter(t => t.date && t.date.startsWith(month));
    const incomeTx = monthTx.filter(t => t.type === 'income');
    const expenseTx = monthTx.filter(t => t.type === 'expense');

    const income = incomeTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const expense = expenseTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const balance = income - expense;
    const savingsRate = income > 0 ? Math.round((balance / income) * 100) : 0;

    return {
      transactions: monthTx,
      income,
      expense,
      balance,
      savingsRate,
      incomeCount: incomeTx.length,
      expenseCount: expenseTx.length
    };
  }

  /**
   * Agrega o edita un movimiento aplicando Safe Math y validando fondos en alcancías.
   * @param {Object} txData
   * @returns {Object}
   */
  saveTransaction({
    id,
    type = 'expense',
    title,
    amount,
    date,
    categoryId,
    accountId,
    pocketId = null,
    method = '',
    note = ''
  }) {
    const trimmedTitle = (title || '').trim();
    const amountInCents = currencyService.toCents(amount);

    if (!trimmedTitle) {
      return { success: false, error: 'El nombre del movimiento es obligatorio.' };
    }
    if (amountInCents <= 0) {
      return { success: false, error: 'El monto debe ser un valor positivo mayor a cero.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return { success: false, error: 'La fecha no tiene un formato válido (AAAA-MM-DD).' };
    }
    if (!categoryId || String(categoryId).trim() === '') {
      return { success: false, error: 'Por favor selecciona una categoría.' };
    }

    const finalAccountId = accountId || store.accounts[0]?.id || 'acc-bank';
    const cleanPocketId = pocketId && pocketId !== 'null' && pocketId !== 'none' ? pocketId : null;

    // VALIDACIÓN CONTABLE: Fondos suficientes si es un gasto
    if (type === 'expense') {
      if (cleanPocketId) {
        // Gasto directo desde Alcancía
        const pocketBalance = accountService.getPocketBalance(finalAccountId, cleanPocketId);
        // Si estamos editando una transacción previa, restituir temporalmente el monto original
        const previousAmount = id ? (this.getById(id)?.amount || 0) : 0;
        const effectivePocketBalance = pocketBalance + (id ? previousAmount : 0);

        if (effectivePocketBalance < amountInCents) {
          return {
            success: false,
            error: `Fondos insuficientes en la alcancía seleccionada. Saldo disponible en alcancía: ${currencyService.format(pocketBalance)}.`
          };
        }
      } else {
        // Gasto desde Saldo Disponible: validar si la cuenta no es crédito
        const acc = accountService.getById(finalAccountId);
        if (acc.type !== 'credit') {
          const balances = accountService.calculateBalances(finalAccountId);
          const previousAmount = id ? (this.getById(id)?.amount || 0) : 0;
          const effectiveAvailable = balances.availableBalance + (id ? previousAmount : 0);

          if (effectiveAvailable < amountInCents) {
            // Nota de advertencia o bloqueo según política contable estricta
            return {
              success: false,
              error: `Saldo disponible insuficiente en la cuenta. Disponible: ${currencyService.format(balances.availableBalance)}.`
            };
          }
        }
      }
    }

    const now = Date.now();
    const existing = id ? this.getById(id) : null;

    const payload = {
      id: id || `tx-${now}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      title: trimmedTitle,
      amount: amountInCents,
      date,
      categoryId,
      accountId: finalAccountId,
      pocketId: cleanPocketId,
      method: method || '',
      note: (note || '').trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending'
    };

    if (id) {
      const updated = (store.transactions || []).map(t => (t.id === id ? payload : t));
      store.setState({ transactions: updated }, 'transaction:updated');
    } else {
      store.setState(
        state => ({ transactions: [payload, ...(state.transactions || [])] }),
        'transaction:created'
      );
    }

    // Garantía de Escritura Inmediata en Firestore si está online
    try {
      firestoreService.syncRecordImmediate('transactions', payload);
    } catch (err) {
      console.warn('[TransactionService] Sincronización inmediata diferida:', err);
    }

    return { success: true, transaction: payload };
  }

  /**
   * Elimina un movimiento mediante Soft Delete (LWW).
   * @param {string} id
   * @returns {Object}
   */
  deleteTransaction(id) {
    const exists = this.getById(id);
    if (!exists) {
      return { success: false, error: 'El movimiento no existe o ya fue eliminado.' };
    }

    const now = Date.now();
    const updated = (store.transactions || []).map(t =>
      t.id === id ? { ...t, deletedAt: now, updatedAt: now, syncStatus: 'pending' } : t
    );

    store.setState({ transactions: updated }, 'transaction:deleted');

    // Garantía de Escritura Inmediata en Firestore si está online
    const deletedItem = updated.find(t => t.id === id);
    if (deletedItem) {
      try {
        firestoreService.syncRecordImmediate('transactions', deletedItem);
      } catch (err) {
        console.warn('[TransactionService] Sincronización inmediata diferida:', err);
      }
    }

    return { success: true };
  }

  /**
   * Reasigna movimientos o un monto específico ($X) entre categorías.
   * Si se especifica amount, reasigna exactamente ese valor en centavos (dividiendo una transacción si es necesario).
   * Si no se especifica amount (o es null), reasigna todas las transacciones activas de la categoría origen.
   * Actualiza el store local, persiste en IndexedDB, sube a Firestore en lotes de máximo 500 operaciones
   * y emite eventos en el EventBus para refrescar dashboard, balance y lista de movimientos.
   * 
   * @param {string} sourceCategoryId ID de la categoría origen
   * @param {string} targetCategoryId ID de la categoría destino
   * @param {number|string|null} [amount=null] Monto a mover (en centavos o valor monetario)
   * @returns {Promise<{success: boolean, count: number, amount?: number, error?: string}>}
   */
  async reassignCategory(sourceCategoryId, targetCategoryId, amount = null) {
    if (!sourceCategoryId || !targetCategoryId) {
      return { success: false, error: 'Las categorías de origen y destino son requeridas.' };
    }
    if (sourceCategoryId === targetCategoryId) {
      return { success: false, error: 'La categoría de origen y destino no pueden ser la misma.' };
    }

    const allTx = store.transactions || [];
    const sourceTxs = allTx.filter(t => !t.deletedAt && t.categoryId === sourceCategoryId);

    if (sourceTxs.length === 0) {
      return { success: false, error: 'La categoría de origen no tiene movimientos activos para transferir.' };
    }

    const totalAvailable = sourceTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    let amountInCents = null;
    if (amount !== null && amount !== undefined && amount !== '') {
      amountInCents = typeof amount === 'number' ? Math.round(amount) : currencyService.toCents(amount);
    }

    if (amountInCents !== null) {
      if (amountInCents <= 0) {
        return { success: false, error: 'El monto a transferir debe ser mayor a cero.' };
      }
      if (amountInCents > totalAvailable) {
        return {
          success: false,
          error: `El monto a transferir (${currencyService.format(amountInCents)}) supera el total disponible de la categoría (${currencyService.format(totalAvailable)}).`
        };
      }
    }

    const now = Date.now();
    let updatedPayloads = [];
    let newPayloads = [];

    if (amountInCents === null || amountInCents === totalAvailable) {
      // Reasignar todos los movimientos activos
      updatedPayloads = sourceTxs.map(t => ({
        ...t,
        categoryId: targetCategoryId,
        updatedAt: now,
        syncStatus: 'pending'
      }));
    } else {
      // Reasignar exactamente amountInCents
      let remaining = amountInCents;
      for (const t of sourceTxs) {
        if (remaining <= 0) break;
        const tAmount = Number(t.amount) || 0;

        if (remaining >= tAmount) {
          // Reasignar la transacción completa
          updatedPayloads.push({
            ...t,
            categoryId: targetCategoryId,
            updatedAt: now,
            syncStatus: 'pending'
          });
          remaining -= tAmount;
        } else {
          // Dividir la transacción: una parte queda en origen y la otra va a destino
          const splitAmount = remaining;
          const remainingInSource = tAmount - splitAmount;

          updatedPayloads.push({
            ...t,
            amount: remainingInSource,
            updatedAt: now,
            syncStatus: 'pending'
          });

          const splitTx = {
            ...t,
            id: `tx-${now}-${Math.random().toString(36).slice(2, 7)}`,
            amount: splitAmount,
            categoryId: targetCategoryId,
            title: `${t.title} (Reclasificado)`,
            note: t.note ? `${t.note} · Reclasificado desde otra categoría` : 'Reclasificado desde otra categoría',
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
            syncStatus: 'pending'
          };
          newPayloads.push(splitTx);
          remaining = 0;
          break;
        }
      }
    }

    const payloadMap = new Map(updatedPayloads.map(t => [t.id, t]));
    const nextTransactions = allTx.map(t => payloadMap.get(t.id) || t);
    if (newPayloads.length) {
      nextTransactions.push(...newPayloads);
    }

    // 1. Actualizar Store local y emitir evento reactivo
    store.setState({ transactions: nextTransactions }, 'transactions:reassigned');

    const allChanged = [...updatedPayloads, ...newPayloads];

    // 2. Persistir localmente en StorageService (IndexedDB)
    for (const item of allChanged) {
      try {
        await StorageService.saveEntity('transactions', item);
      } catch (err) {
        console.warn('[TransactionService] Error guardando entidad en IndexedDB:', err);
      }
    }

    // 3. Persistir en Cloud Firestore mediante lotes de máximo 500 operaciones
    try {
      if (firestoreService.currentUserId) {
        await firestoreService.reassignTransactionsCategory(sourceCategoryId, targetCategoryId, allChanged);
      }
    } catch (err) {
      console.warn('[TransactionService] Error en persistencia Firestore durante reasignación:', err);
    }

    const finalMovedAmount = amountInCents !== null ? amountInCents : totalAvailable;

    // 4. Emitir eventos en el eventBus para refrescar dashboard, balance y lista de movimientos
    eventBus.emit('transactions:reassigned', {
      sourceCategoryId,
      targetCategoryId,
      count: allChanged.length,
      amount: finalMovedAmount
    });
    eventBus.emit('dashboard:refresh');

    return {
      success: true,
      count: allChanged.length,
      amount: finalMovedAmount
    };
  }
}

export const transactionService = new TransactionService();
