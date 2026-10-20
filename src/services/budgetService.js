/**
 * src/services/budgetService.js
 * Servicio para gestión y análisis de presupuestos mensuales v3 con Safe Math (centavos) y LWW.
 */
import { store } from '../core/store.js';
import { categoryService } from './categoryService.js';
import { currencyService } from './currencyService.js';

class BudgetService {
  /**
   * Obtiene todos los presupuestos activos (no eliminados).
   * @returns {Array}
   */
  getAll() {
    return (store.budgets || []).filter(b => !b.deletedAt);
  }

  /**
   * Obtiene un presupuesto por su ID.
   * @param {string} id
   * @returns {Object|undefined}
   */
  getById(id) {
    return (store.budgets || []).find(b => b.id === id && !b.deletedAt);
  }

  /**
   * Calcula el estado de ejecución de los presupuestos para un mes específico (YYYY-MM).
   * Todos los montos se computan como enteros en centavos.
   * @param {string} month Mes en formato AAAA-MM.
   * @returns {Array}
   */
  getBudgetsWithProgress(month) {
    const monthTx = (store.transactions || []).filter(
      t => !t.deletedAt && t.date && t.date.startsWith(month) && t.type === 'expense'
    );

    return this.getAll().map(b => {
      const category = categoryService.getById(b.categoryId);
      const spent = monthTx
        .filter(t => t.categoryId === b.categoryId)
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0); // en centavos

      const limit = Number(b.limit) || 0; // en centavos
      const percentage = limit > 0 ? (spent / limit) * 100 : 0;
      const remaining = limit - spent;
      const isOver = spent > limit;
      const isWarning = !isOver && percentage >= 80;

      return {
        ...b,
        category,
        spent,
        remaining,
        percentage: Math.round(percentage),
        isOver,
        isWarning
      };
    });
  }

  /**
   * Obtiene el resumen totalizado de presupuestos para un mes en centavos.
   * @param {string} month
   * @returns {Object}
   */
  getMonthlySummary(month) {
    const budgets = this.getBudgetsWithProgress(month);
    const totalLimit = budgets.reduce((acc, b) => acc + (Number(b.limit) || 0), 0);
    const totalSpent = budgets.reduce((acc, b) => acc + b.spent, 0);
    const totalRemaining = totalLimit - totalSpent;
    const overCount = budgets.filter(b => b.isOver).length;

    return {
      totalLimit,
      totalSpent,
      totalRemaining,
      overCount,
      budgetCount: budgets.length,
      budgets
    };
  }

  /**
   * Guarda o actualiza un presupuesto aplicando Safe Math (centavos) y metadatos LWW.
   * @param {Object} budgetData
   * @returns {Object}
   */
  saveBudget({ id, categoryId, limit, note }) {
    const limitInCents = currencyService.toCents(limit);
    if (!categoryId) {
      return { success: false, error: 'Debe seleccionar una categoría de gasto.' };
    }
    if (limitInCents <= 0) {
      return { success: false, error: 'El límite mensual debe ser un monto positivo mayor a cero.' };
    }

    const budgets = store.budgets || [];
    const existsOther = budgets.some(b => !b.deletedAt && b.categoryId === categoryId && b.id !== id);
    if (existsOther) {
      return {
        success: false,
        error: 'Ya existe un presupuesto para esta categoría. Edite el existente.'
      };
    }

    const now = Date.now();
    const existing = id ? this.getById(id) : null;

    const payload = {
      id: id || `bgt-${now}-${Math.random().toString(36).slice(2, 7)}`,
      categoryId,
      limit: limitInCents,
      note: (note || '').trim(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending'
    };

    if (id) {
      const updated = budgets.map(b => (b.id === id ? payload : b));
      store.setState({ budgets: updated }, 'budget:updated');
    } else {
      store.setState({ budgets: [...budgets, payload] }, 'budget:created');
    }

    return { success: true, budget: payload };
  }

  /**
   * Elimina un presupuesto mediante Soft Delete.
   * @param {string} id
   * @returns {Object}
   */
  deleteBudget(id) {
    const now = Date.now();
    const updated = (store.budgets || []).map(b =>
      b.id === id ? { ...b, deletedAt: now, updatedAt: now, syncStatus: 'pending' } : b
    );
    store.setState({ budgets: updated }, 'budget:deleted');
    return { success: true };
  }
}

export const budgetService = new BudgetService();
