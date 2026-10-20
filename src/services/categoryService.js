/**
 * Servicio de gestión de categorías con validaciones y protección de dependencias.
 */
import { store } from '../core/store.js';

class CategoryService {
  /**
   * Obtiene todas las categorías.
   */
  getAll() {
    return store.categories;
  }

  /**
   * Obtiene categorías filtradas por tipo ('expense' | 'income').
   */
  getByType(type) {
    return store.categories.filter(c => c.type === type);
  }

  /**
   * Obtiene una categoría por su ID con fallback seguro.
   */
  getById(id) {
    return (
      store.categories.find(c => c.id === id) || {
        id: 'uncategorized',
        name: 'Sin categoría',
        type: 'expense',
        color: '#9ba5a0',
        icon: '◈'
      }
    );
  }

  /**
   * Agrega o edita una categoría.
   */
  saveCategory({ id, name, type, color, icon }) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return { success: false, error: 'El nombre de la categoría es obligatorio.' };
    }

    const categories = store.categories;
    const isDuplicate = categories.some(
      c => c.name.toLocaleLowerCase('es-CO') === trimmedName.toLocaleLowerCase('es-CO') &&
           c.type === type &&
           c.id !== id
    );

    if (isDuplicate) {
      return { success: false, error: 'Ya existe una categoría con ese nombre y tipo.' };
    }

    if (id) {
      // Modificación
      const existing = categories.find(c => c.id === id);
      if (!existing) {
        return { success: false, error: 'Categoría no encontrada.' };
      }

      // Si cambió el tipo, comprobar dependencias
      if (existing.type !== type && this.isCategoryInUse(id)) {
        return {
          success: false,
          error: 'No se puede cambiar el tipo de una categoría asociada a movimientos o presupuestos.'
        };
      }

      const updated = categories.map(c =>
        c.id === id ? { ...c, name: trimmedName, type, color, icon } : c
      );
      store.setState({ categories: updated }, 'category:updated');
      return { success: true, category: { ...existing, name: trimmedName, type, color, icon } };
    } else {
      // Creación
      const newCategory = {
        id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmedName,
        type,
        color: color || '#52525b',
        icon: icon || '◈',
        locked: false
      };

      store.setState({ categories: [...categories, newCategory] }, 'category:created');
      return { success: true, category: newCategory };
    }
  }

  /**
   * Comprueba si una categoría está asociada a transacciones, presupuestos o recurrentes.
   */
  isCategoryInUse(categoryId) {
    const hasTx = store.transactions.some(t => t.categoryId === categoryId);
    const hasBudget = store.budgets.some(b => b.categoryId === categoryId);
    const hasRecurring = store.recurring.some(r => r.categoryId === categoryId);
    return hasTx || hasBudget || hasRecurring;
  }

  /**
   * Elimina una categoría si no está en uso.
   */
  deleteCategory(id) {
    if (this.isCategoryInUse(id)) {
      return {
        success: false,
        error: 'Esta categoría tiene movimientos, presupuestos o gastos recurrentes asociados. Elimínelos o muévalos primero.'
      };
    }

    const filtered = store.categories.filter(c => c.id !== id);
    store.setState({ categories: filtered }, 'category:deleted');
    return { success: true };
  }
}

export const categoryService = new CategoryService();
