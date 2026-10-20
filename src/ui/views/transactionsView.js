/**
 * Vista de Movimientos con paginación de alto rendimiento, búsqueda y filtros avanzados.
 */
import { transactionService } from '../../services/transactionService.js';
import { currencyService } from '../../services/currencyService.js';
import { categoryService } from '../../services/categoryService.js';
import { accountService } from '../../services/accountService.js';
import { iconHtml } from '../icons.js';

export class TransactionsView {
  static currentPage = 1;
  static pageSize = 25;
  static sortBy = 'date';
  static sortOrder = 'desc';

  static escape(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  static render() {
    const search = document.getElementById('transactionSearch')?.value || '';
    const type = document.getElementById('typeFilter')?.value || 'all';
    const categoryId = document.getElementById('categoryFilter')?.value || 'all';
    const accountId = document.getElementById('accountFilter')?.value || 'all';
    const month = document.getElementById('transactionMonth')?.value || '';

    const queryResult = transactionService.query({
      search,
      type,
      categoryId,
      accountId,
      month,
      sortBy: this.sortBy,
      sortOrder: this.sortOrder,
      page: this.currentPage,
      pageSize: this.pageSize
    });

    // Asegurar página válida
    if (this.currentPage > queryResult.totalPages) {
      this.currentPage = queryResult.totalPages;
    }

    const tbody = document.getElementById('transactionsTableBody');
    const empty = document.getElementById('transactionsEmpty');
    const table = tbody?.closest('table');
    const countEl = document.getElementById('transactionResultCount');
    const totalEl = document.getElementById('transactionResultTotal');

    if (countEl) {
      countEl.textContent = `${queryResult.totalCount} ${queryResult.totalCount === 1 ? 'movimiento' : 'movimientos'}`;
    }

    if (totalEl) {
      totalEl.textContent = `Gastos: ${currencyService.format(queryResult.totalExpense)} · Ingresos: ${currencyService.format(queryResult.totalIncome)}`;
    }

    if (empty) empty.classList.toggle('hidden', queryResult.totalCount > 0);
    if (table) table.classList.toggle('hidden', queryResult.totalCount === 0);

    if (!tbody) return;

    tbody.innerHTML = queryResult.items.map(t => {
      const cat = categoryService.getById(t.categoryId);
      const acc = accountService.getById(t.accountId);
      const isIncome = t.type === 'income';
      const isTransfer = t.type === 'transfer';
      const typeLabel = isIncome ? 'Ingreso' : isTransfer ? 'Transferencia' : 'Gasto';
      const typeClass = isIncome ? 'income' : isTransfer ? 'transfer' : 'expense';
      const iconBg = `${cat.color}1c`;
      const amountColor = isIncome ? 'income-amount' : isTransfer ? 'transfer-amount' : '';
      const sign = isIncome ? '+' : isTransfer ? '⇄' : '−';

      const pocket = t.pocketId ? (acc.pockets || []).find(p => p.id === t.pocketId) : null;
      const pocketLabel = pocket ? ` · [Alcancía: ${this.escape(pocket.name)}]` : '';

      return `
        <tr>
          <td>
            <div class="movement-cell">
              <span class="movement-icon" style="background:${iconBg};color:${cat.color}">
                ${iconHtml(cat.icon, 'category')}
              </span>
              <span>
                <strong title="${this.escape(t.title)}">${this.escape(t.title)}</strong>
                <small>${this.escape(acc.name)}${pocketLabel} · ${this.escape(t.method || 'Sin método')}</small>
              </span>
            </div>
          </td>
          <td>
            <span class="type-pill ${typeClass}">${typeLabel}</span>
          </td>
          <td>
            <span class="category-chip" style="color:${cat.color}">
              ${iconHtml(cat.icon, 'category', 'text-xs')}
              ${this.escape(cat.name)}
            </span>
          </td>
          <td>${this.escape(t.date || '—')}</td>
          <td class="note-cell">${this.escape(t.note || '—')}</td>
          <td class="amount-cell ${amountColor}">
            ${sign} ${currencyService.format(t.amount)}
          </td>
          <td>
            <div class="row-actions">
              <button class="row-action" title="Editar movimiento" aria-label="Editar" data-edit-transaction="${t.id}">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button class="row-action delete" title="Eliminar movimiento" aria-label="Eliminar" data-delete-transaction="${t.id}">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    this.renderPagination(queryResult);
  }

  static renderPagination(queryResult) {
    const paginationEl = document.getElementById('transactionsPagination');
    if (!paginationEl) return;

    if (queryResult.totalCount === 0) {
      paginationEl.innerHTML = '';
      paginationEl.classList.add('hidden');
      return;
    }

    paginationEl.classList.remove('hidden');

    const { page, totalPages, startIndex, endIndex, totalCount } = queryResult;

    paginationEl.innerHTML = `
      <div class="pagination-info">
        Mostrando <strong>${startIndex}-${endIndex}</strong> de <strong>${totalCount}</strong> movimientos
      </div>
      <div class="pagination-controls">
        <button class="pagination-btn" id="pgPrev" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
        <span class="pagination-current">Pág. ${page} de ${totalPages}</span>
        <button class="pagination-btn" id="pgNext" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button>
        <select class="pagination-size" id="pgSizeSelect" aria-label="Movimientos por página">
          <option value="10" ${this.pageSize === 10 ? 'selected' : ''}>10 / pág</option>
          <option value="25" ${this.pageSize === 25 ? 'selected' : ''}>25 / pág</option>
          <option value="50" ${this.pageSize === 50 ? 'selected' : ''}>50 / pág</option>
          <option value="100" ${this.pageSize === 100 ? 'selected' : ''}>100 / pág</option>
        </select>
      </div>
    `;

    document.getElementById('pgPrev')?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.render();
      }
    });

    document.getElementById('pgNext')?.addEventListener('click', () => {
      if (this.currentPage < totalPages) {
        this.currentPage++;
        this.render();
      }
    });

    document.getElementById('pgSizeSelect')?.addEventListener('change', e => {
      this.pageSize = parseInt(e.target.value, 10);
      this.currentPage = 1;
      this.render();
    });
  }

  static resetPagination() {
    this.currentPage = 1;
  }
}
