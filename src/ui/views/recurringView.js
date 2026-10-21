/**
 * Vista de Gastos Recurrentes y Suscripciones (servicios, streaming, alquiler, etc.).
 */
import { recurringService } from '../../services/recurringService.js';
import { currencyService } from '../../services/currencyService.js';
import { categoryService } from '../../services/categoryService.js';
import { accountService } from '../../services/accountService.js';
import { iconHtml } from '../icons.js';

export class RecurringView {
  static escape(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  static render(selectedMonth) {
    const list = recurringService.getAll();
    const monthlyCommitment = recurringService.getMonthlyCommitment();

    const commitEl = document.getElementById('recurringMonthlyCommitment');
    const countEl = document.getElementById('recurringActiveCount');
    if (commitEl) commitEl.textContent = currencyService.format(monthlyCommitment);
    if (countEl) {
      const activeCount = list.filter(r => r.active).length;
      countEl.textContent = `${activeCount} activas de ${list.length} totales`;
    }

    const grid = document.getElementById('recurringGrid');
    const empty = document.getElementById('recurringEmpty');
    if (!grid) return;

    if (empty) empty.classList.toggle('hidden', list.length > 0);
    grid.classList.toggle('hidden', list.length === 0);

    const freqLabels = {
      weekly: 'Semanal',
      monthly: 'Mensual',
      yearly: 'Anual'
    };

    grid.innerHTML = list.map(r => {
      const cat = categoryService.getById(r.categoryId);
      const acc = accountService.getById(r.accountId);
      const isApplied = r.lastAppliedMonth === selectedMonth;

      return `
        <article class="recurring-card ${r.active ? '' : 'paused'}">
          <div class="recurring-head">
            <span class="recurring-icon" style="background:${cat.color}1c;color:${cat.color}">
              ${iconHtml(cat.icon, 'event_repeat')}
            </span>
            <div class="recurring-info">
              <strong>${this.escape(r.title)}</strong>
              <small>${this.escape(acc.name)} · ${freqLabels[r.frequency] || 'Mensual'}</small>
            </div>
            <div class="recurring-actions">
              <button title="Editar" aria-label="Editar suscripción ${this.escape(r.title)}" data-edit-recurring="${r.id}">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button title="Eliminar" aria-label="Eliminar suscripción ${this.escape(r.title)}" data-delete-recurring="${r.id}">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </div>

          <div class="recurring-body">
            <div class="recurring-amount tabular-nums">${currencyService.format(r.amount)}</div>
            <div class="recurring-due">
              <span>📅 Cobro: Día ${r.dueDay} de cada mes</span>
              <span class="badge ${r.active ? 'badge-active' : 'badge-paused'}">
                <span class="material-symbols-rounded" aria-hidden="true">${r.active ? 'check_circle' : 'pause_circle'}</span>
                <span>${r.active ? 'Activo' : 'Pausado'}</span>
              </span>
            </div>
            ${r.note ? `<p class="muted recurring-note">${this.escape(r.note)}</p>` : ''}
          </div>

          <div class="recurring-foot">
            <button class="outline-button toggle-rec-btn" data-toggle-recurring="${r.id}" aria-label="${r.active ? 'Pausar cobro recurrente de' : 'Reanudar cobro recurrente de'} ${this.escape(r.title)}">
              ${r.active ? 'Pausar' : 'Reanudar'}
            </button>
            <button class="primary-button apply-rec-btn" data-apply-recurring="${r.id}" ${isApplied ? 'disabled' : ''} aria-label="Registrar ahora el cobro recurrente de ${this.escape(r.title)}">
              ${isApplied ? '✓ Aplicado este mes' : '＋ Registrar ahora'}
            </button>
          </div>
        </article>
      `;
    }).join('');
  }
}
