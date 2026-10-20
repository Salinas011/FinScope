/**
 * src/services/recurringService.js
 * Servicio para gestión de suscripciones y pagos recurrentes v3 con Safe Math (centavos) y LWW.
 */
import { store } from '../core/store.js';
import { transactionService } from './transactionService.js';
import { currencyService } from './currencyService.js';

class RecurringService {
  /**
   * Obtiene todas las reglas de movimientos recurrentes activas.
   * @returns {Array}
   */
  getAll() {
    return (store.recurring || []).filter(r => !r.deletedAt);
  }

  /**
   * Obtiene un registro recurrente por ID.
   * @param {string} id
   * @returns {Object|undefined}
   */
  getById(id) {
    return (store.recurring || []).find(r => r.id === id && !r.deletedAt);
  }

  /**
   * Calcula el compromiso mensual total proyectado por suscripciones activas en centavos.
   * @returns {number} Centavos.
   */
  getMonthlyCommitment() {
    return this.getAll()
      .filter(r => r.active && r.type === 'expense')
      .reduce((total, r) => {
        const amt = Number(r.amount) || 0; // en centavos
        if (r.frequency === 'weekly') return total + Math.round(amt * 4.33);
        if (r.frequency === 'yearly') return total + Math.round(amt / 12);
        return total + amt;
      }, 0);
  }

  /**
   * Guarda o actualiza un movimiento recurrente con Safe Math (centavos) y metadatos LWW.
   * @param {Object} recurringData
   * @returns {Object}
   */
  saveRecurring({
    id,
    title,
    amount,
    type = 'expense',
    categoryId,
    accountId,
    frequency = 'monthly',
    dueDay = 1,
    note = '',
    active = true
  }) {
    const trimmedTitle = (title || '').trim();
    const amountInCents = currencyService.toCents(amount);
    const safeDueDay = Math.min(31, Math.max(1, parseInt(dueDay, 10) || 1));

    if (!trimmedTitle) {
      return { success: false, error: 'El nombre de la suscripción o gasto es obligatorio.' };
    }
    if (amountInCents <= 0) {
      return { success: false, error: 'El monto debe ser un valor positivo mayor a cero.' };
    }

    const finalAccountId = accountId || store.accounts[0]?.id || 'acc-bank';
    const now = Date.now();
    const existing = id ? this.getById(id) : null;

    const payload = {
      id: id || `rec-${now}-${Math.random().toString(36).slice(2, 7)}`,
      title: trimmedTitle,
      amount: amountInCents,
      type,
      categoryId,
      accountId: finalAccountId,
      frequency,
      dueDay: safeDueDay,
      note: (note || '').trim(),
      active: Boolean(active),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending',
      lastAppliedMonth: existing?.lastAppliedMonth || null
    };

    const list = store.recurring || [];
    if (id) {
      const updated = list.map(r => (r.id === id ? payload : r));
      store.setState({ recurring: updated }, 'recurring:updated');
    } else {
      store.setState({ recurring: [...list, payload] }, 'recurring:created');
    }

    return { success: true, recurring: payload };
  }

  /**
   * Cambia el estado activo/pausado de una recurrencia.
   * @param {string} id
   * @returns {Object}
   */
  toggleActive(id) {
    const rec = this.getById(id);
    if (!rec) return { success: false, error: 'Recurrencia no encontrada.' };

    const now = Date.now();
    const updated = (store.recurring || []).map(r =>
      r.id === id ? { ...r, active: !r.active, updatedAt: now, syncStatus: 'pending' } : r
    );
    store.setState({ recurring: updated }, 'recurring:updated');
    return { success: true };
  }

  /**
   * Elimina un movimiento recurrente (Soft Delete).
   * @param {string} id
   * @returns {Object}
   */
  deleteRecurring(id) {
    const now = Date.now();
    const updated = (store.recurring || []).map(r =>
      r.id === id ? { ...r, deletedAt: now, updatedAt: now, syncStatus: 'pending' } : r
    );
    store.setState({ recurring: updated }, 'recurring:deleted');
    return { success: true };
  }

  /**
   * Aplica un movimiento recurrente al mes seleccionado generando la transacción correspondiente.
   * Evita duplicaciones en el mismo mes.
   * @param {string} recurringId
   * @param {string} targetMonth 'YYYY-MM'
   * @returns {Object}
   */
  applyToMonth(recurringId, targetMonth) {
    const rec = this.getById(recurringId);
    if (!rec) return { success: false, error: 'Gasto recurrente no encontrado.' };

    const [year, month] = targetMonth.split('-');
    const maxDay = new Date(Number(year), Number(month), 0).getDate();
    const effectiveDay = Math.min(rec.dueDay, maxDay);
    const dateStr = `${targetMonth}-${String(effectiveDay).padStart(2, '0')}`;

    // Validar si ya fue aplicado en targetMonth
    const alreadyApplied = (store.transactions || []).some(
      t => !t.deletedAt && t.recurringId === rec.id && t.date && t.date.startsWith(targetMonth)
    );

    if (alreadyApplied) {
      return { success: false, error: `Este movimiento ya fue registrado para el mes ${targetMonth}.` };
    }

    // Convertir centavos a formato decimal para transactionService.saveTransaction
    const majorAmount = currencyService.fromCents(rec.amount);

    const txResult = transactionService.saveTransaction({
      title: `${rec.title} (${rec.frequency === 'yearly' ? 'Anual' : 'Recurrente'})`,
      amount: majorAmount,
      type: rec.type,
      date: dateStr,
      categoryId: rec.categoryId,
      accountId: rec.accountId,
      pocketId: null,
      method: 'Transferencia',
      note: rec.note ? `Suscripción: ${rec.note}` : 'Suscripción o pago programado'
    });

    if (txResult.success) {
      const now = Date.now();
      const updatedTxs = (store.transactions || []).map(t =>
        t.id === txResult.transaction.id ? { ...t, recurringId: rec.id } : t
      );
      const updatedRecs = (store.recurring || []).map(r =>
        r.id === rec.id ? { ...r, lastAppliedMonth: targetMonth, updatedAt: now, syncStatus: 'pending' } : r
      );
      store.setState({ transactions: updatedTxs, recurring: updatedRecs }, 'recurring:applied');
      return { success: true };
    }

    return { success: false, error: txResult.error };
  }
}

export const recurringService = new RecurringService();
