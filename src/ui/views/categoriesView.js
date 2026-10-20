/**
 * Vista de Categorías.
 */
import { categoryService } from '../../services/categoryService.js';
import { currencyService } from '../../services/currencyService.js';
import { store } from '../../core/store.js';
import { iconHtml } from '../icons.js';

export class CategoriesView {
  static activeTab = 'expense';

  static escape(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  static render() {
    const all = categoryService.getAll();
    const categories = all.filter(c => c.type === this.activeTab);

    const expenseCountEl = document.getElementById('expenseCategoryCount');
    const incomeCountEl = document.getElementById('incomeCategoryCount');
    if (expenseCountEl) expenseCountEl.textContent = all.filter(c => c.type === 'expense').length;
    if (incomeCountEl) incomeCountEl.textContent = all.filter(c => c.type === 'income').length;

    document.querySelectorAll('.category-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.catType === this.activeTab);
    });

    const grid = document.getElementById('categoriesGrid');
    if (!grid) return;

    if (!categories.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <strong>No hay categorías de ${this.activeTab === 'expense' ? 'gasto' : 'ingreso'}</strong>
          <p>Agregue una nueva categoría para comenzar.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = categories.map(c => {
      const txs = (store.transactions || []).filter(t => !t.deletedAt && t.categoryId === c.id);
      const totalAmount = txs.reduce((sum, t) => sum + Number(t.amount || 0), 0);

      return `
        <article class="category-card">
          <div class="category-card-head">
            <span class="category-big-icon" style="background:${c.color}1c;color:${c.color}">
              ${iconHtml(c.icon, 'category')}
            </span>
            <div class="category-card-actions">
              <button title="Editar categoría" aria-label="Editar" data-edit-category="${c.id}">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button title="Eliminar categoría" aria-label="Eliminar" data-delete-category="${c.id}">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </div>
          <h3 title="${this.escape(c.name)}">${this.escape(c.name)}</h3>
          <p>${txs.length} ${txs.length === 1 ? 'movimiento' : 'movimientos'}</p>
          <div class="category-total">${currencyService.format(totalAmount)}</div>
          <div class="category-total-label">Total histórico acumulado</div>
        </article>
      `;
    }).join('');
  }
}
