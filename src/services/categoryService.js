/**
 * Servicio de gestión de categorías con validaciones y protección de dependencias.
 */
import { store } from '../core/store.js';

class CategoryService {
  /**
   * Obtiene todas las categorías activas (no eliminadas).
   */
  getAll() {
    return (store.categories || []).filter(c => !c.deletedAt);
  }

  /**
   * Obtiene categorías filtradas por tipo ('expense' | 'income') activas.
   */
  getByType(type) {
    return (store.categories || []).filter(c => !c.deletedAt && c.type === type);
  }

  /**
   * Obtiene una categoría por su ID con fallback seguro.
   */
  getById(id) {
    return (
      (store.categories || []).find(c => c.id === id && !c.deletedAt) || {
        id: 'uncategorized',
        name: 'Sin categoría',
        type: 'expense',
        color: '#9ba5a0',
        icon: '◈'
      }
    );
  }

  /**
   * Agrega o edita una categoría con metadatos LWW.
   */
  saveCategory({ id, name, type, color, icon }) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return { success: false, error: 'El nombre de la categoría es obligatorio.' };
    }

    const categories = store.categories || [];
    const isDuplicate = categories.some(
      c => !c.deletedAt &&
           c.name.toLocaleLowerCase('es-CO') === trimmedName.toLocaleLowerCase('es-CO') &&
           c.type === type &&
           c.id !== id
    );

    if (isDuplicate) {
      return { success: false, error: 'Ya existe una categoría con ese nombre y tipo.' };
    }

    const now = Date.now();

    if (id) {
      // Modificación
      const existing = categories.find(c => c.id === id && !c.deletedAt);
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
        c.id === id ? { ...c, name: trimmedName, type, color, icon, updatedAt: now, syncStatus: 'pending' } : c
      );
      store.setState({ categories: updated }, 'category:updated');
      return { success: true, category: { ...existing, name: trimmedName, type, color, icon, updatedAt: now, syncStatus: 'pending' } };
    } else {
      // Creación
      const newCategory = {
        id: `cat-${now}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmedName,
        type,
        color: color || '#52525b',
        icon: icon || '◈',
        locked: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending'
      };

      store.setState({ categories: [...categories, newCategory] }, 'category:created');
      return { success: true, category: newCategory };
    }
  }

  /**
   * Comprueba si una categoría activa está asociada a transacciones, presupuestos o recurrentes activos.
   */
  isCategoryInUse(categoryId) {
    const hasTx = (store.transactions || []).some(t => !t.deletedAt && t.categoryId === categoryId);
    const hasBudget = (store.budgets || []).some(b => !b.deletedAt && b.categoryId === categoryId);
    const hasRecurring = (store.recurring || []).some(r => !r.deletedAt && r.categoryId === categoryId);
    return hasTx || hasBudget || hasRecurring;
  }

  /**
   * Realiza Soft Delete en una categoría si no está en uso activo.
   */
  deleteCategory(id) {
    if (this.isCategoryInUse(id)) {
      return {
        success: false,
        error: 'Esta categoría tiene movimientos, presupuestos o gastos recurrentes asociados. Elimínelos o muévalos primero.'
      };
    }

    const now = Date.now();
    const updated = (store.categories || []).map(c =>
      c.id === id ? { ...c, deletedAt: now, updatedAt: now, syncStatus: 'pending' } : c
    );
    store.setState({ categories: updated }, 'category:deleted');
    return { success: true };
  }
}

export const categoryService = new CategoryService();
