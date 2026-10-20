/**
 * Servicio para gestión de suscripciones y gastos/ingresos recurrentes.
 */
import { store } from '../core/store.js';
import { transactionService } from './transactionService.js';

class RecurringService {
  /**
   * Obtiene todas las reglas de movimientos recurrentes.
   */
  getAll() {
    return store.recurring;
  }

  /**
   * Obtiene un registro recurrente por ID.
   */
  getById(id) {
    return store.recurring.find(r => r.id === id);
  }

  /**
   * Calcula el compromiso mensual total proyectado por suscripciones y gastos fijos activos.
   */
  getMonthlyCommitment() {
    return store.recurring
      .filter(r => r.active && r.type === 'expense')
      .reduce((total, r) => {
        const amt = Number(r.amount) || 0;
        if (r.frequency === 'weekly') return total + amt * 4.33;
        if (r.frequency === 'yearly') return total + amt / 12;
        return total + amt;
      }, 0);
  }

  /**
   * Guarda o actualiza un movimiento recurrente.
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
    const numAmount = Math.round(Number(amount));
    const safeDueDay = Math.min(31, Math.max(1, parseInt(dueDay, 10) || 1));

    if (!trimmedTitle) {
      return { success: false, error: 'El nombre de la suscripción o gasto es obligatorio.' };
    }
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      return { success: false, error: 'El monto debe ser mayor a cero.' };
    }

    const finalAccountId = accountId || store.accounts[0]?.id || 'acc-bank';

    const payload = {
      id: id || `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: trimmedTitle,
      amount: numAmount,
      type,
      categoryId,
      accountId: finalAccountId,
      frequency,
      dueDay: safeDueDay,
      note: (note || '').trim(),
      active: Boolean(active),
      createdAt: id ? (this.getById(id)?.createdAt || Date.now()) : Date.now(),
      lastAppliedMonth: id ? (this.getById(id)?.lastAppliedMonth || null) : null
    };

    const list = store.recurring;
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
   */
  toggleActive(id) {
    const rec = this.getById(id);
    if (!rec) return { success: false };

    return this.saveRecurring({ ...rec, active: !rec.active });
  }

  /**
   * Elimina un movimiento recurrente.
   */
  deleteRecurring(id) {
    const filtered = store.recurring.filter(r => r.id !== id);
    store.setState({ recurring: filtered }, 'recurring:deleted');
    return { success: true };
  }

  /**
   * Aplica un movimiento recurrente al mes actual creando una transacción efectiva,
   * evitando duplicaciones en el mismo mes.
   */
  applyToMonth(recurringId, targetMonth) {
    const rec = this.getById(recurringId);
    if (!rec) return { success: false, error: 'Gasto recurrente no encontrado.' };

    const dayStr = String(rec.dueDay).padStart(2, '0');
    const [year, month] = targetMonth.split('-');
    // Asegurar fecha válida considerando meses con menos días
    const maxDay = new Date(Number(year), Number(month), 0).getDate();
    const effectiveDay = Math.min(rec.dueDay, maxDay);
    const dateStr = `${targetMonth}-${String(effectiveDay).padStart(2, '0')}`;

    // Comprobar si ya se aplicó este mes
    const alreadyApplied = store.transactions.some(
      t => t.recurringId === rec.id && t.date && t.date.startsWith(targetMonth)
    );

    if (alreadyApplied) {
      return { success: false, error: `Este movimiento ya fue registrado para el mes ${targetMonth}.` };
    }

    // Crear la transacción
    const txResult = transactionService.saveTransaction({
      title: `${rec.title} (${rec.frequency === 'yearly' ? 'Anual' : 'Recurrente'})`,
      amount: rec.amount,
      type: rec.type,
      date: dateStr,
      categoryId: rec.categoryId,
      accountId: rec.accountId,
      method: 'Transferencia',
      note: rec.note ? `Suscripción: ${rec.note}` : 'Suscripción o pago recurrente programado'
    });

    if (txResult.success) {
      // Marcar la transacción con el ID recurrente
      const updatedTxs = store.transactions.map(t =>
        t.id === txResult.transaction.id ? { ...t, recurringId: rec.id } : t
      );
      const updatedRecs = store.recurring.map(r =>
        r.id === rec.id ? { ...r, lastAppliedMonth: targetMonth } : r
      );
      store.setState({ transactions: updatedTxs, recurring: updatedRecs }, 'recurring:applied');
      return { success: true };
    }

    return { success: false, error: txResult.error };
  }
}

export const recurringService = new RecurringService();
