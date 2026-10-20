/**
 * Vista de Presupuestos mensuales.
 */
import { budgetService } from '../../services/budgetService.js';
import { currencyService } from '../../services/currencyService.js';
import { iconHtml } from '../icons.js';

export class BudgetsView {
  static escape(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  static render(selectedMonth) {
    const summary = budgetService.getMonthlySummary(selectedMonth);

    const totalValEl = document.getElementById('budgetTotalValue');
    const spentValEl = document.getElementById('budgetSpentValue');
    const remainingValEl = document.getElementById('budgetRemainingValue');
    const countLabelEl = document.getElementById('budgetCountLabel');

    if (totalValEl) totalValEl.textContent = currencyService.format(summary.totalLimit);
    if (spentValEl) spentValEl.textContent = currencyService.format(summary.totalSpent);
    if (remainingValEl) remainingValEl.textContent = currencyService.format(summary.totalRemaining);
    if (countLabelEl) {
      countLabelEl.textContent = `${summary.budgetCount} ${summary.budgetCount === 1 ? 'presupuesto' : 'presupuestos'}`;
    }

    const grid = document.getElementById('budgetsGrid');
    const empty = document.getElementById('budgetsEmpty');
    if (!grid) return;

    if (empty) empty.classList.toggle('hidden', summary.budgetCount > 0);
    grid.classList.toggle('hidden', summary.budgetCount === 0);

    grid.innerHTML = summary.budgets.map(b => {
      const c = b.category;
      const overText = b.isOver
        ? `Excedido por ${currencyService.format(b.spent - b.limit)}`
        : `Disponible ${currencyService.format(b.remaining)}`;

      const statusBadge = b.isOver
        ? '<span class="status-badge over"><span class="material-symbols-rounded">error</span> Sobre el límite</span>'
        : b.isWarning
        ? '<span class="status-badge warning"><span class="material-symbols-rounded">warning</span> Cerca del límite (85%)</span>'
        : '<span class="status-badge ok"><span class="material-symbols-rounded">check_circle</span> En control</span>';

      return `
        <article class="budget-card">
          <div class="budget-card-top">
            <span class="budget-icon" style="background:${c.color}1c;color:${c.color}">
              ${iconHtml(c.icon, 'pie_chart')}
            </span>
            <div class="budget-card-title">
              <strong>${this.escape(c.name)}</strong>
              <small>Presupuesto mensual</small>
            </div>
            <div class="budget-card-actions">
              <button title="Editar presupuesto" aria-label="Editar presupuesto para ${this.escape(c.name)}" data-edit-budget="${b.id}">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button title="Eliminar presupuesto" aria-label="Eliminar presupuesto para ${this.escape(c.name)}" data-delete-budget="${b.id}">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </div>

          <div class="budget-card-values tabular-nums">
            <div>
              <strong>${currencyService.format(b.spent)}</strong>
              <div><small>de ${currencyService.format(b.limit)}</small></div>
            </div>
            <span>${b.percentage}% usado</span>
          </div>

          <div class="budget-progress">
            <span class="${b.isOver ? 'over' : ''}" style="width:${Math.min(100, b.percentage)}%;background:${b.isOver ? '#71717a' : (c.color || '#27272a')}"></span>
          </div>

          <div class="budget-card-foot">
            <span>${overText}</span>
            ${statusBadge}
          </div>

          ${b.note ? `<p class="muted budget-note">${this.escape(b.note)}</p>` : ''}
        </article>
      `;
    }).join('');
  }
}
