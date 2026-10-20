/**
 * Vista de Resumen / Dashboard.
 */
import { transactionService } from '../../services/transactionService.js';
import { currencyService } from '../../services/currencyService.js';
import { budgetService } from '../../services/budgetService.js';
import { accountService } from '../../services/accountService.js';
import { categoryService } from '../../services/categoryService.js';
import { ChartRenderer } from '../charts.js';
import { iconHtml } from '../icons.js';

export class DashboardView {
  static monthFormatter = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' });

  static escape(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  static render(selectedMonth) {
    const stats = transactionService.getMonthStats(selectedMonth);
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1, 1);

    // Encabezado de período
    const headingPeriod = document.getElementById('headingPeriod');
    if (headingPeriod) {
      headingPeriod.textContent = `· ${this.monthFormatter.format(date)}`;
    }

    const monthLabel = document.getElementById('monthLabel');
    const currentMonthISO = new Date().toISOString().slice(0, 7);
    if (monthLabel) {
      monthLabel.textContent = selectedMonth === currentMonthISO ? 'Este mes' : this.monthFormatter.format(date);
    }

    const monthPicker = document.getElementById('monthPicker');
    if (monthPicker) {
      monthPicker.value = selectedMonth;
    }

    // Tarjetas principales
    const balanceEl = document.getElementById('balanceValue');
    const incomeEl = document.getElementById('incomeValue');
    const expenseEl = document.getElementById('expenseValue');
    const incomeCountEl = document.getElementById('incomeCount');
    const expenseCountEl = document.getElementById('expenseCount');
    const balanceFootEl = document.getElementById('balanceFoot');
    const savingsRateEl = document.getElementById('savingsRate');
    const savingsProgressEl = document.getElementById('savingsProgress');

    if (balanceEl) balanceEl.textContent = currencyService.format(stats.balance);
    if (incomeEl) incomeEl.textContent = currencyService.format(stats.income);
    if (expenseEl) expenseEl.textContent = currencyService.format(stats.expense);

    if (incomeCountEl) {
      incomeCountEl.textContent = `${stats.incomeCount} ${stats.incomeCount === 1 ? 'registro' : 'registros'}`;
    }
    if (expenseCountEl) {
      expenseCountEl.textContent = `${stats.expenseCount} ${stats.expenseCount === 1 ? 'registro' : 'registros'}`;
    }
    if (balanceFootEl) {
      balanceFootEl.textContent = stats.balance >= 0 ? 'Balance positivo este mes' : 'Los gastos superan los ingresos';
    }

    if (savingsRateEl) {
      savingsRateEl.innerHTML = `${Math.max(-999, Math.min(999, stats.savingsRate))}<span class="value-suffix">%</span>`;
    }
    if (savingsProgressEl) {
      savingsProgressEl.style.width = `${Math.max(0, Math.min(100, stats.savingsRate))}%`;
    }

    // Gráficos
    ChartRenderer.renderCashflow('cashflowChart', 'chartEmpty', stats.transactions, year, month);
    ChartRenderer.renderDonut('categoryDonut', 'donutTotal', 'categoryLegend', stats.transactions);

    // Movimientos recientes
    this.renderRecent(stats.transactions);

    // Resumen de presupuestos
    this.renderBudgetPreview(selectedMonth);

    // Resumen de cuentas (Mini barra de patrimonio)
    this.renderNetWorthMini();
  }

  static renderRecent(transactions) {
    const tbody = document.getElementById('recentTableBody');
    const empty = document.getElementById('recentEmpty');
    if (!tbody) return;

    const rows = [...transactions]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || Number(b.createdAt || 0) - Number(a.createdAt || 0))
      .slice(0, 5);

    const table = tbody.closest('table');
    if (empty) empty.classList.toggle('hidden', rows.length > 0);
    if (table) table.classList.toggle('hidden', rows.length === 0);

    tbody.innerHTML = rows.map(t => {
      const cat = categoryService.getById(t.categoryId);
      const isIncome = t.type === 'income';
      const isTransfer = t.type === 'transfer';
      const iconBg = `${cat.color}1c`;
      const amountColor = isIncome ? 'income-amount' : isTransfer ? 'transfer-amount' : '';
      const sign = isIncome ? '+' : isTransfer ? '⇄' : '−';

      return `
        <tr>
          <td>
            <div class="movement-cell">
              <span class="movement-icon" style="background:${iconBg};color:${cat.color}">
                ${iconHtml(cat.icon, 'category')}
              </span>
              <span>
                <strong title="${this.escape(t.title)}">${this.escape(t.title)}</strong>
                <small>${this.escape(t.method || 'Sin medio')}</small>
              </span>
            </div>
          </td>
          <td>
            <span class="category-chip" style="color:${cat.color}">
              ${iconHtml(cat.icon, 'category', 'text-xs')}
              ${this.escape(cat.name)}
            </span>
          </td>
          <td>${this.escape(t.date || '—')}</td>
          <td class="amount-cell ${amountColor}">
            ${sign} ${currencyService.format(t.amount)}
          </td>
        </tr>
      `;
    }).join('');
  }

  static renderBudgetPreview(month) {
    const container = document.getElementById('budgetPreview');
    const empty = document.getElementById('budgetPreviewEmpty');
    if (!container) return;

    const budgets = budgetService.getBudgetsWithProgress(month).slice(0, 4);

    if (empty) empty.classList.toggle('hidden', budgets.length > 0);
    container.classList.toggle('hidden', budgets.length === 0);

    container.innerHTML = budgets.map(b => {
      const c = b.category;
      return `
        <div class="budget-preview-row">
          <div class="budget-preview-head">
            <span class="mini-icon" style="background:${c.color}1c;color:${c.color}">${iconHtml(c.icon, 'category')}</span>
            <strong>${this.escape(c.name)}</strong>
            <span>${b.percentage}%</span>
          </div>
          <div class="budget-progress">
            <span class="${b.isOver ? 'over' : ''}" style="width:${Math.min(100, b.percentage)}%;background:${b.isOver ? '#71717a' : (c.color || '#27272a')}"></span>
          </div>
          <div class="budget-preview-meta">
            <span>${currencyService.format(b.spent)} gastados</span>
            <span>de ${currencyService.format(b.limit)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  static renderNetWorthMini() {
    const netWorthEl = document.getElementById('dashboardNetWorth');
    if (netWorthEl) {
      const netWorth = accountService.getNetWorth();
      netWorthEl.textContent = currencyService.format(netWorth);
    }
  }
}
