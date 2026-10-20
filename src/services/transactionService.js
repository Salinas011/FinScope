/**
 * Servicio de transacciones con soporte para paginación, ordenamiento, filtrado avanzado y cálculo de métricas.
 */
import { store } from '../core/store.js';
import { categoryService } from './categoryService.js';
import { accountService } from './accountService.js';

class TransactionService {
  /**
   * Obtiene todas las transacciones sin procesar.
   */
  getAll() {
    return store.transactions;
  }

  /**
   * Obtiene una transacción por su ID.
   */
  getById(id) {
    return store.transactions.find(t => t.id === id);
  }

  /**
   * Filtra, busca, ordena y pagina transacciones para alto rendimiento con miles de registros.
   */
  query({
    search = '',
    type = 'all',
    categoryId = 'all',
    accountId = 'all',
    month = '',
    sortBy = 'date',
    sortOrder = 'desc',
    page = 1,
    pageSize = 25
  } = {}) {
    let list = [...store.transactions];

    // 1. Filtro por búsqueda
    const cleanSearch = search.trim().toLocaleLowerCase('es-CO');
    if (cleanSearch) {
      list = list.filter(t => {
        const cat = categoryService.getById(t.categoryId);
        const acc = accountService.getById(t.accountId);
        const fullText = `${t.title} ${t.note || ''} ${cat.name} ${acc.name} ${t.method || ''}`.toLocaleLowerCase('es-CO');
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

    // 5. Filtro por mes (YYYY-MM)
    if (month) {
      list = list.filter(t => t.date && t.date.startsWith(month));
    }

    // 6. Ordenamiento
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

    // 7. Totales agregados de la consulta filtrada
    const totalCount = list.length;
    const totalIncome = list.filter(t => t.type === 'income').reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const totalExpense = list.filter(t => t.type === 'expense').reduce((acc, t) => acc + Number(t.amount || 0), 0);

    // 8. Paginación
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
   * Obtiene estadísticas financieras de un mes determinado (YYYY-MM).
   */
  getMonthStats(month) {
    const monthTx = store.transactions.filter(t => t.date && t.date.startsWith(month));
    const incomeTx = monthTx.filter(t => t.type === 'income');
    const expenseTx = monthTx.filter(t => t.type === 'expense');

    const income = incomeTx.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const expense = expenseTx.reduce((sum, t) => sum + Number(t.amount || 0), 0);
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
   * Agrega o edita un movimiento con validaciones de negocio.
   */
  saveTransaction({
    id,
    type = 'expense',
    title,
    amount,
    date,
    categoryId,
    accountId,
    method = '',
    note = ''
  }) {
    const trimmedTitle = (title || '').trim();
    const numAmount = Math.round(Number(amount));

    if (!trimmedTitle) {
      return { success: false, error: 'El nombre del movimiento es obligatorio.' };
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return { success: false, error: 'El monto debe ser un número positivo.' };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
      return { success: false, error: 'La fecha no tiene un formato válido (AAAA-MM-DD).' };
    }

    // Asignar cuenta por defecto si no se especificó
    const finalAccountId = accountId || store.accounts[0]?.id || 'acc-bank';

    const payload = {
      id: id || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      title: trimmedTitle,
      amount: numAmount,
      date,
      categoryId,
      accountId: finalAccountId,
      method: method || '',
      note: (note || '').trim(),
      createdAt: id ? (this.getById(id)?.createdAt || Date.now()) : Date.now()
    };

    if (id) {
      const updated = store.transactions.map(t => (t.id === id ? payload : t));
      store.setState({ transactions: updated }, 'transaction:updated');
    } else {
      store.setState(
        state => ({ transactions: [payload, ...state.transactions] }),
        'transaction:created'
      );
    }

    return { success: true, transaction: payload };
  }

  /**
   * Elimina un movimiento por su ID.
   */
  deleteTransaction(id) {
    const exists = this.getById(id);
    if (!exists) {
      return { success: false, error: 'El movimiento no existe.' };
    }

    const filtered = store.transactions.filter(t => t.id !== id);
    store.setState({ transactions: filtered }, 'transaction:deleted');
    return { success: true };
  }
}

export const transactionService = new TransactionService();
