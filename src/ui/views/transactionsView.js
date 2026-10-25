/**
 * Vista de Movimientos con paginación de alto rendimiento, búsqueda, filtros avanzados,
 * ordenamiento interactivo por columnas y acciones en lote (Bulk Actions).
 */
import { transactionService } from '../../services/transactionService.js';
import { currencyService } from '../../services/currencyService.js';
import { categoryService } from '../../services/categoryService.js';
import { accountService } from '../../services/accountService.js';
import { iconHtml } from '../icons.js';
import { customDropdownManager } from '../components/customDropdown.js';
import { Toast } from '../toast.js';
import { Modal } from '../modal.js';
import { eventBus } from '../../core/eventBus.js';

export class TransactionsView {
  static currentPage = 1;
  static pageSize = 25;
  static sortBy = 'date';
  static sortOrder = 'desc';
  static selectedIds = new Set();
  static isEventsInitialized = false;

  static escape(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  static render() {
    this.initEvents();

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
      this.currentPage = Math.max(1, queryResult.totalPages);
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

    const hasAnyTransactions = transactionService.getAll().length > 0;

    if (empty) {
      empty.classList.toggle('hidden', queryResult.totalCount > 0);
      if (queryResult.totalCount === 0) {
        const iconEl = document.getElementById('transactionsEmptyIcon');
        const titleEl = document.getElementById('transactionsEmptyTitle');
        const descEl = document.getElementById('transactionsEmptyDesc');
        const actionEl = document.getElementById('transactionsEmptyAction');

        if (!hasAnyTransactions) {
          if (iconEl) iconEl.textContent = 'receipt_long';
          if (titleEl) titleEl.textContent = 'Aún no tiene movimientos';
          if (descEl) descEl.textContent = 'Registre su primer ingreso o gasto para comenzar a organizar sus finanzas.';
          if (actionEl) {
            actionEl.innerHTML = '<button class="primary-button" data-open-add><span class="material-symbols-rounded">add</span> Registrar movimiento</button>';
          }
        } else {
          if (iconEl) iconEl.textContent = 'search_off';
          if (titleEl) titleEl.textContent = 'No se encontraron movimientos con los filtros actuales';
          if (descEl) descEl.textContent = 'Pruebe ajustando los filtros o realizando otra búsqueda.';
          if (actionEl) {
            actionEl.innerHTML = '<button class="outline-button" id="btnResetTxFilters"><span class="material-symbols-rounded">filter_alt_off</span> Restablecer filtros</button>';
            document.getElementById('btnResetTxFilters')?.addEventListener('click', () => {
              const searchInput = document.getElementById('transactionSearch');
              const typeSelect = document.getElementById('typeFilter');
              const catSelect = document.getElementById('categoryFilter');
              const accSelect = document.getElementById('accountFilter');
              const monthInput = document.getElementById('transactionMonth');
              if (searchInput) searchInput.value = '';
              if (typeSelect) typeSelect.value = 'all';
              if (catSelect) catSelect.value = 'all';
              if (accSelect) accSelect.value = 'all';
              if (monthInput) monthInput.value = '';
              const txMonthLabel = document.getElementById('transactionMonthLabel');
              if (txMonthLabel) txMonthLabel.textContent = 'Todos los meses';
              customDropdownManager.syncAll();
              this.resetPagination();
              this.render();
            });
          }
        }
      }
    }
    if (table) table.classList.toggle('hidden', queryResult.totalCount === 0);

    // Sincronizar encabezados de ordenamiento visual
    this.updateSortHeaders();

    if (!tbody) return;

    tbody.innerHTML = queryResult.items.map(t => {
      const cat = categoryService.getById(t.categoryId);
      const acc = accountService.getById(t.accountId);
      const isIncome = t.type === 'income';
      const isTransfer = t.type === 'transfer';
      const isAdjustment = t.type === 'pocket_adjustment';
      const isPocketDeposit = t.type === 'pocket_deposit';
      const isPocketWithdraw = t.type === 'pocket_withdraw';

      let typeLabel = 'Gasto';
      let typeClass = 'expense';
      let typeIcon = 'arrow_upward';
      let amountColor = '';
      let sign = '−';

      if (isIncome) {
        typeLabel = 'Ingreso';
        typeClass = 'income';
        typeIcon = 'arrow_downward';
        amountColor = 'income-amount';
        sign = '+';
      } else if (isTransfer) {
        typeLabel = 'Transferencia';
        typeClass = 'transfer';
        typeIcon = 'sync_alt';
        amountColor = 'transfer-amount';
        sign = '⇄';
      } else if (isAdjustment) {
        typeLabel = 'Fondeo Alcancía';
        typeClass = 'adjustment';
        typeIcon = 'savings';
        amountColor = 'income-amount';
        sign = '+';
      } else if (isPocketDeposit) {
        typeLabel = 'Aporte Alcancía';
        typeClass = 'transfer';
        typeIcon = 'arrow_forward';
        amountColor = 'transfer-amount';
        sign = '→';
      } else if (isPocketWithdraw) {
        typeLabel = 'Retiro Alcancía';
        typeClass = 'transfer';
        typeIcon = 'arrow_back';
        amountColor = '';
        sign = '←';
      }

      const pocket = t.pocketId ? (acc.pockets || []).find(p => p.id === t.pocketId) : null;
      const pocketLabel = pocket ? ` · [Alcancía: ${this.escape(pocket.name)}]` : '';
      const iconBg = `${cat.color}1c`;
      const isSelected = this.selectedIds.has(t.id);

      return `
        <tr class="${isSelected ? 'row-selected' : ''}">
          <td class="td-checkbox">
            <input type="checkbox" class="tx-row-check" data-id="${t.id}" ${isSelected ? 'checked' : ''} aria-label="Seleccionar ${this.escape(t.title)}" />
          </td>
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
            <span class="type-pill ${typeClass}"><span class="material-symbols-rounded" aria-hidden="true">${typeIcon}</span> ${typeLabel}</span>
          </td>
          <td>
            <span class="category-chip" style="color:${cat.color}">
              ${iconHtml(cat.icon, 'category', 'text-xs')}
              ${this.escape(cat.name)}
            </span>
          </td>
          <td>${this.escape(t.date || '—')}</td>
          <td class="note-cell">${this.escape(t.note || '—')}</td>
          <td class="amount-cell tabular-nums ${amountColor}">
            ${sign} ${currencyService.format(t.amount)}
          </td>
          <td>
            <div class="row-actions">
              <button class="row-action" title="Duplicar movimiento" aria-label="Duplicar movimiento" data-duplicate-transaction="${t.id}">
                <span class="material-symbols-rounded">content_copy</span>
              </button>
              <button class="row-action" title="Editar movimiento" aria-label="Editar movimiento ${this.escape(t.title)}" data-edit-transaction="${t.id}">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button class="row-action delete" title="Eliminar movimiento" aria-label="Eliminar movimiento ${this.escape(t.title)}" data-delete-transaction="${t.id}">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    // Actualizar barra flotante de acciones en lote
    this.updateBulkActionsUI(queryResult.items);

    this.renderPagination(queryResult);
  }

  static updateSortHeaders() {
    document.querySelectorAll('.sortable-th').forEach(th => {
      const col = th.dataset.sort;
      const isActive = this.sortBy === col;
      th.classList.toggle('active-sort', isActive);
      th.setAttribute('data-direction', isActive ? this.sortOrder : '');
      const icon = th.querySelector('.sort-icon');
      if (icon) {
        if (!isActive) {
          icon.textContent = 'unfold_more';
        } else {
          icon.textContent = this.sortOrder === 'asc' ? 'arrow_upward' : 'arrow_downward';
        }
      }
    });
  }

  static updateBulkActionsUI(items = []) {
    const bar = document.getElementById('bulkActionsBar');
    const countEl = document.getElementById('bulkSelectedCount');
    const selectAllCheckbox = document.getElementById('selectAllTransactions');

    if (bar) {
      bar.classList.toggle('hidden', this.selectedIds.size === 0);
    }
    if (countEl) {
      countEl.textContent = `${this.selectedIds.size} ${this.selectedIds.size === 1 ? 'seleccionado' : 'seleccionados'}`;
    }

    if (selectAllCheckbox) {
      if (items.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      } else {
        const selectedOnPage = items.filter(t => this.selectedIds.has(t.id)).length;
        selectAllCheckbox.checked = selectedOnPage === items.length && items.length > 0;
        selectAllCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < items.length;
      }
    }
  }

  static initEvents() {
    if (this.isEventsInitialized) return;
    this.isEventsInitialized = true;

    // 1. Click en cabeceras ordenables
    document.addEventListener('click', e => {
      const th = e.target.closest('.sortable-th');
      if (th) {
        const col = th.dataset.sort;
        if (!col) return;
        if (this.sortBy === col) {
          this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortBy = col;
          this.sortOrder = (col === 'date' || col === 'amount') ? 'desc' : 'asc';
        }
        this.currentPage = 1;
        this.render();
      }
    });

    // 2. Selección de checkbox de fila individual
    document.addEventListener('change', e => {
      if (e.target.classList.contains('tx-row-check')) {
        const id = e.target.dataset.id;
        if (e.target.checked) {
          this.selectedIds.add(id);
        } else {
          this.selectedIds.delete(id);
        }
        e.target.closest('tr')?.classList.toggle('row-selected', e.target.checked);
        this.updateBulkActionsUI();
      }
    });

    // 3. Seleccionar todos en página
    document.getElementById('selectAllTransactions')?.addEventListener('change', e => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.tx-row-check').forEach(chk => {
        chk.checked = isChecked;
        const id = chk.dataset.id;
        if (isChecked) {
          this.selectedIds.add(id);
        } else {
          this.selectedIds.delete(id);
        }
        chk.closest('tr')?.classList.toggle('row-selected', isChecked);
      });
      this.updateBulkActionsUI();
    });

    // 4. Cancelar selección
    document.getElementById('bulkCancelBtn')?.addEventListener('click', () => {
      this.selectedIds.clear();
      this.render();
    });

    // 5. Eliminación en lote con Undo (Deshacer)
    document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => {
      const ids = [...this.selectedIds];
      if (ids.length === 0) return;

      const count = ids.length;
      transactionService.deleteBulk(ids);
      this.selectedIds.clear();
      this.render();
      eventBus.emit('store:synced');

      Toast.action(
        `${count} ${count === 1 ? 'movimiento eliminado' : 'movimientos eliminados'}`,
        'Deshacer',
        () => {
          ids.forEach(id => transactionService.restore(id));
          this.render();
          eventBus.emit('store:synced');
          Toast.success('Movimientos restaurados exitosamente.');
        },
        6000
      );
    });

    // 6. Abrir modal para reasignar categoría en lote
    document.getElementById('bulkChangeCategoryBtn')?.addEventListener('click', () => {
      if (this.selectedIds.size === 0) return;
      const select = document.getElementById('bulkCategorySelect');
      if (select) {
        select.innerHTML = '<option value="" disabled selected hidden>Selecciona una categoría...</option>' +
          categoryService.getAll().map(c => `<option value="${c.id}">${c.name} · ${c.type === 'income' ? 'Ingreso' : 'Gasto'}</option>`).join('');
      }
      Modal.open('#bulkCategoryModal');
    });

    // 7. Enviar formulario de reasignación en lote
    document.getElementById('bulkCategoryForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const newCatId = document.getElementById('bulkCategorySelect')?.value;
      if (!newCatId) {
        Toast.error('Por favor selecciona una categoría');
        return;
      }
      const ids = [...this.selectedIds];
      const result = transactionService.reassignBulkCategory(ids, newCatId);
      if (result.success) {
        this.selectedIds.clear();
        Modal.closeAll();
        this.render();
        eventBus.emit('store:synced');
        Toast.success(`Se actualizaron ${result.updatedCount} movimientos.`);
      } else {
        Toast.error(result.error || 'Error al reasignar categorías');
      }
    });
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
