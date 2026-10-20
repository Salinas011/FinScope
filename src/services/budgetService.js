/**
 * Servicio para gestión y análisis de presupuestos mensuales.
 */
import { store } from '../core/store.js';
import { categoryService } from './categoryService.js';

class BudgetService {
  /**
   * Obtiene todos los presupuestos configurados.
   */
  getAll() {
    return store.budgets;
  }

  /**
   * Obtiene un presupuesto por su ID.
   */
  getById(id) {
    return store.budgets.find(b => b.id === id);
  }

  /**
   * Calcula el estado de ejecución de los presupuestos para un mes específico.
   * @param {string} month Mes en formato AAAA-MM.
   */
  getBudgetsWithProgress(month) {
    const monthTx = store.transactions.filter(
      t => t.date && t.date.startsWith(month) && t.type === 'expense'
    );

    return store.budgets.map(b => {
      const category = categoryService.getById(b.categoryId);
      const spent = monthTx
        .filter(t => t.categoryId === b.categoryId)
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

      const limit = Number(b.limit) || 0;
      const percentage = limit > 0 ? (spent / limit) * 100 : 0;
      const remaining = limit - spent;
      const isOver = spent > limit;
      const isWarning = !isOver && percentage >= 85;

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
   * Obtiene el resumen totalizado de presupuestos para un mes.
   */
  getMonthlySummary(month) {
    const budgets = this.getBudgetsWithProgress(month);
    const totalLimit = budgets.reduce((acc, b) => acc + Number(b.limit || 0), 0);
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
   * Guarda o actualiza un presupuesto.
   */
  saveBudget({ id, categoryId, limit, note }) {
    const limitNum = Math.round(Number(limit));
    if (!categoryId) {
      return { success: false, error: 'Debe seleccionar una categoría de gasto.' };
    }
    if (!Number.isFinite(limitNum) || limitNum <= 0) {
      return { success: false, error: 'El límite debe ser un monto positivo.' };
    }

    const budgets = store.budgets;
    const existsOther = budgets.some(b => b.categoryId === categoryId && b.id !== id);
    if (existsOther) {
      return {
        success: false,
        error: 'Ya existe un presupuesto para esta categoría. Edite el existente.'
      };
    }

    const payload = {
      id: id || `bgt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      categoryId,
      limit: limitNum,
      note: (note || '').trim()
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
   * Elimina un presupuesto.
   */
  deleteBudget(id) {
    const filtered = store.budgets.filter(b => b.id !== id);
    store.setState({ budgets: filtered }, 'budget:deleted');
    return { success: true };
  }
}

export const budgetService = new BudgetService();
