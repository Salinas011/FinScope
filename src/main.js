/**
 * Entrypoint principal de Finanza — Dashboard Modular y Escalable.
 */
import { store } from './core/store.js';
import { eventBus } from './core/eventBus.js';
import { VIEW_TITLES, PAYMENT_METHODS } from './core/constants.js';

import { currencyService } from './services/currencyService.js';
import { transactionService } from './services/transactionService.js';
import { accountService } from './services/accountService.js';
import { categoryService } from './services/categoryService.js';
import { budgetService } from './services/budgetService.js';
import { recurringService } from './services/recurringService.js';
import { dataTransferService } from './services/dataTransferService.js';

import { Toast } from './ui/toast.js';
import { Modal } from './ui/modal.js';
import { getMaterialIconName } from './ui/icons.js';
import { DashboardView } from './ui/views/dashboardView.js';
import { TransactionsView } from './ui/views/transactionsView.js';
import { AccountsView } from './ui/views/accountsView.js';
import { BudgetsView } from './ui/views/budgetsView.js';
import { CategoriesView } from './ui/views/categoriesView.js';
import { RecurringView } from './ui/views/recurringView.js';
import { SettingsView } from './ui/views/settingsView.js';

class App {
  constructor() {
    this.activeView = 'dashboard';
    this.selectedMonth = new Date().toISOString().slice(0, 7);
    this.editingTransactionId = null;
    this.editingAccountId = null;
    this.editingCategoryId = null;
    this.editingBudgetId = null;
    this.editingRecurringId = null;
    this.pendingCSVTransactions = null;
  }

  init() {
    Toast.init();
    Modal.init();

    // Sincronizar tema visual guardado
    document.body.classList.toggle('dark', store.theme === 'dark');
    const themeIcon = document.getElementById('themeIcon');
    if (themeIcon) {
      themeIcon.textContent = store.theme === 'dark' ? 'light_mode' : 'dark_mode';
    }

    // Inicializar campos de fecha
    const today = new Date().toISOString().slice(0, 10);
    const txDate = document.getElementById('transactionDate');
    if (txDate) txDate.value = today;

    const txMonth = document.getElementById('transactionMonth');
    if (txMonth) txMonth.value = this.selectedMonth;

    const picker = document.getElementById('monthPicker');
    if (picker) picker.value = this.selectedMonth;

    // Vincular eventos y vistas
    this.bindEvents();
    this.refreshSelects();
    this.renderAll();

    // Suscribirse a cambios del almacén reactivo
    store.subscribe(() => {
      this.refreshSelects();
      this.renderActiveView();
    });

    // Escuchar alertas de almacenamiento
    eventBus.on('error:storage', err => {
      Toast.error(err);
    });

    console.log('Finanza v2 iniciado exitosamente.');
  }

  setView(viewName) {
    if (!VIEW_TITLES[viewName]) return;
    this.activeView = viewName;

    // Actualizar secciones activas
    document.querySelectorAll('.view').forEach(el => {
      el.classList.toggle('active-view', el.id === `view-${viewName}`);
    });

    // Actualizar navegación
    document.querySelectorAll('.nav-item[data-view]').forEach(el => {
      el.classList.toggle('active', el.dataset.view === viewName);
    });

    // Breadcrumb
    const breadcrumb = document.getElementById('breadcrumbCurrent');
    if (breadcrumb) {
      breadcrumb.textContent = VIEW_TITLES[viewName];
    }

    // Cerrar sidebar en pantallas táctiles/móviles
    document.getElementById('sidebar')?.classList.remove('open');

    this.renderActiveView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  renderActiveView() {
    switch (this.activeView) {
      case 'dashboard':
        DashboardView.render(this.selectedMonth);
        break;
      case 'transactions':
        TransactionsView.render();
        break;
      case 'accounts':
        AccountsView.render();
        break;
      case 'budgets':
        BudgetsView.render(this.selectedMonth);
        break;
      case 'categories':
        CategoriesView.render();
        break;
      case 'recurring':
        RecurringView.render(this.selectedMonth);
        break;
      case 'settings':
        SettingsView.render();
        break;
    }
  }

  renderAll() {
    DashboardView.render(this.selectedMonth);
    TransactionsView.render();
    AccountsView.render();
    BudgetsView.render(this.selectedMonth);
    CategoriesView.render();
    RecurringView.render(this.selectedMonth);
    SettingsView.render();
  }

  refreshSelects() {
    const categories = store.categories;
    const accounts = store.accounts;

    // 1. Selector de categoría en modal de transacción
    const txType = document.getElementById('transactionType')?.value || 'expense';
    const txCatSelect = document.getElementById('transactionCategory');
    if (txCatSelect) {
      const filteredCats = categories.filter(c => c.type === txType);
      const prevVal = txCatSelect.value;
      txCatSelect.innerHTML = filteredCats.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
      if (filteredCats.some(c => c.id === prevVal)) {
        txCatSelect.value = prevVal;
      }
    }

    // 2. Selector de cuenta en modal de transacción
    const txAccSelect = document.getElementById('transactionAccount');
    if (txAccSelect) {
      const prevAcc = txAccSelect.value;
      txAccSelect.innerHTML = accounts.map(a => `
        <option value="${a.id}">${a.name}</option>
      `).join('');
      if (accounts.some(a => a.id === prevAcc)) {
        txAccSelect.value = prevAcc;
      }
    }

    // 3. Selector de categoría en filtro de movimientos
    const catFilter = document.getElementById('categoryFilter');
    if (catFilter) {
      const current = catFilter.value;
      catFilter.innerHTML = '<option value="all">Todas las categorías</option>' +
        categories.map(c => `<option value="${c.id}">${c.name} · ${c.type === 'income' ? 'Ingreso' : 'Gasto'}</option>`).join('');
      if (categories.some(c => c.id === current)) catFilter.value = current;
    }

    // 4. Selector de cuenta en filtro de movimientos
    const accFilter = document.getElementById('accountFilter');
    if (accFilter) {
      const current = accFilter.value;
      accFilter.innerHTML = '<option value="all">Todas las cuentas</option>' +
        accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
      if (accounts.some(a => a.id === current)) accFilter.value = current;
    }

    // 5. Selector de categoría en modal de presupuestos
    const bgtCatSelect = document.getElementById('budgetCategory');
    if (bgtCatSelect) {
      const expenseCats = categories.filter(c => c.type === 'expense');
      const prev = bgtCatSelect.value;
      bgtCatSelect.innerHTML = expenseCats.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
      if (expenseCats.some(c => c.id === prev)) bgtCatSelect.value = prev;
    }

    // 6. Selectores en modal de transferencia
    const fromSelect = document.getElementById('transferFromAccount');
    const toSelect = document.getElementById('transferToAccount');
    if (fromSelect && toSelect) {
      const optHtml = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
      fromSelect.innerHTML = optHtml;
      toSelect.innerHTML = optHtml;
      if (accounts.length > 1) {
        toSelect.selectedIndex = 1;
      }
    }

    // 7. Selectores en modal de recurrente
    const recCatSelect = document.getElementById('recurringCategory');
    const recAccSelect = document.getElementById('recurringAccount');
    if (recCatSelect) {
      recCatSelect.innerHTML = categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    if (recAccSelect) {
      recAccSelect.innerHTML = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    }
  }

  // --- Modales y Formularios ---

  openTransactionModal(type = 'expense', transaction = null) {
    this.editingTransactionId = transaction?.id || null;
    const form = document.getElementById('transactionForm');
    if (form) form.reset();

    const titleEl = document.getElementById('transactionModalTitle');
    if (titleEl) {
      titleEl.textContent = transaction ? 'Editar movimiento' : 'Nuevo movimiento';
    }

    const typeInput = document.getElementById('transactionType');
    if (typeInput) typeInput.value = transaction?.type || type;

    document.querySelectorAll('.type-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.formType === (transaction?.type || type));
    });

    const titleInput = document.getElementById('transactionTitle');
    const amountInput = document.getElementById('transactionAmount');
    const dateInput = document.getElementById('transactionDate');
    const noteInput = document.getElementById('transactionNote');
    const methodInput = document.getElementById('transactionMethod');

    if (titleInput) titleInput.value = transaction?.title || '';
    if (amountInput) amountInput.value = transaction?.amount || '';
    if (dateInput) dateInput.value = transaction?.date || new Date().toISOString().slice(0, 10);
    if (noteInput) noteInput.value = transaction?.note || '';
    if (methodInput) methodInput.value = transaction?.method || '';

    this.refreshSelects();

    const catSelect = document.getElementById('transactionCategory');
    const accSelect = document.getElementById('transactionAccount');
    if (transaction) {
      if (catSelect) catSelect.value = transaction.categoryId;
      if (accSelect) accSelect.value = transaction.accountId;
    }

    const submitBtn = document.querySelector('#transactionForm button[type=submit]');
    if (submitBtn) {
      submitBtn.innerHTML = transaction
        ? 'Guardar cambios <span class="material-symbols-rounded" style="font-size: 15px; vertical-align: middle;">arrow_forward</span>'
        : 'Guardar movimiento <span class="material-symbols-rounded" style="font-size: 15px; vertical-align: middle;">arrow_forward</span>';
    }

    Modal.open('#transactionModal');
  }

  openAccountModal(account = null) {
    this.editingAccountId = account?.id || null;
    const form = document.getElementById('accountForm');
    if (form) form.reset();

    const title = document.getElementById('accountModalTitle');
    if (title) title.textContent = account ? 'Editar cuenta' : 'Nueva cuenta';

    const idInput = document.getElementById('editingAccountId');
    const nameInput = document.getElementById('accountName');
    const typeInput = document.getElementById('accountType');
    const balanceInput = document.getElementById('accountInitialBalance');
    const colorInput = document.getElementById('accountColor');
    const iconInput = document.getElementById('accountIcon');

    if (idInput) idInput.value = account?.id || '';
    if (nameInput) nameInput.value = account?.name || '';
    if (typeInput) typeInput.value = account?.type || 'bank';
    if (balanceInput) balanceInput.value = account?.initialBalance || 0;
    if (colorInput) colorInput.value = account?.color || '#18181b';
    if (iconInput) iconInput.value = getMaterialIconName(account?.icon, 'account_balance');

    Modal.open('#accountModal');
  }

  openTransferModal() {
    const form = document.getElementById('transferForm');
    if (form) form.reset();

    const dateInput = document.getElementById('transferDate');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

    this.refreshSelects();
    Modal.open('#transferModal');
  }

  openCategoryModal(category = null) {
    this.editingCategoryId = category?.id || null;
    const form = document.getElementById('categoryForm');
    if (form) form.reset();

    const title = document.getElementById('categoryModalTitle');
    if (title) title.textContent = category ? 'Editar categoría' : 'Nueva categoría';

    const idInput = document.getElementById('editingCategoryId');
    const nameInput = document.getElementById('categoryName');
    const typeInput = document.getElementById('categoryType');
    const colorInput = document.getElementById('categoryColor');
    const iconInput = document.getElementById('categoryIcon');

    if (idInput) idInput.value = category?.id || '';
    if (nameInput) nameInput.value = category?.name || '';
    if (typeInput) typeInput.value = category?.type || CategoriesView.activeTab;
    if (colorInput) colorInput.value = category?.color || '#52525b';
    if (iconInput) iconInput.value = getMaterialIconName(category?.icon, 'category');

    Modal.open('#categoryModal');
  }

  openBudgetModal(budget = null) {
    this.editingBudgetId = budget?.id || null;
    const form = document.getElementById('budgetForm');
    if (form) form.reset();

    const title = document.getElementById('budgetModalTitle');
    if (title) title.textContent = budget ? 'Editar presupuesto' : 'Crear presupuesto';

    this.refreshSelects();

    const idInput = document.getElementById('editingBudgetId');
    const catSelect = document.getElementById('budgetCategory');
    const limitInput = document.getElementById('budgetLimit');
    const noteInput = document.getElementById('budgetNote');

    if (idInput) idInput.value = budget?.id || '';
    if (catSelect && budget) catSelect.value = budget.categoryId;
    if (limitInput) limitInput.value = budget?.limit || '';
    if (noteInput) noteInput.value = budget?.note || '';

    Modal.open('#budgetModal');
  }

  openRecurringModal(recurring = null) {
    this.editingRecurringId = recurring?.id || null;
    const form = document.getElementById('recurringForm');
    if (form) form.reset();

    const title = document.getElementById('recurringModalTitle');
    if (title) title.textContent = recurring ? 'Editar recurrente' : 'Nueva suscripción o gasto fijo';

    this.refreshSelects();

    const idInput = document.getElementById('editingRecurringId');
    const titleInput = document.getElementById('recurringTitle');
    const amountInput = document.getElementById('recurringAmount');
    const freqSelect = document.getElementById('recurringFrequency');
    const dayInput = document.getElementById('recurringDueDay');
    const catSelect = document.getElementById('recurringCategory');
    const accSelect = document.getElementById('recurringAccount');
    const noteInput = document.getElementById('recurringNote');

    if (idInput) idInput.value = recurring?.id || '';
    if (titleInput) titleInput.value = recurring?.title || '';
    if (amountInput) amountInput.value = recurring?.amount || '';
    if (freqSelect) freqSelect.value = recurring?.frequency || 'monthly';
    if (dayInput) dayInput.value = recurring?.dueDay || 1;
    if (catSelect && recurring) catSelect.value = recurring.categoryId;
    if (accSelect && recurring) accSelect.value = recurring.accountId;
    if (noteInput) noteInput.value = recurring?.note || '';

    Modal.open('#recurringModal');
  }

  // --- Manejadores de Eventos ---

  bindEvents() {
    const closeMobileSidebar = () => {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebarBackdrop')?.classList.remove('active');
    };

    // 1. Navegación principal
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setView(btn.dataset.view);
        if (window.innerWidth <= 950) closeMobileSidebar();
      });
    });

    document.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setView(btn.dataset.goto);
        if (window.innerWidth <= 950) closeMobileSidebar();
      });
    });

    // 2. Menú móvil con backdrop y botón de cierre
    document.getElementById('menuToggle')?.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebar');
      const backdrop = document.getElementById('sidebarBackdrop');
      const isOpen = sidebar?.classList.toggle('open');
      backdrop?.classList.toggle('active', !!isOpen);
    });

    document.getElementById('sidebarClose')?.addEventListener('click', closeMobileSidebar);
    document.getElementById('sidebarBackdrop')?.addEventListener('click', closeMobileSidebar);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.getElementById('sidebar')?.classList.contains('open')) {
        closeMobileSidebar();
      }
    });

    document.addEventListener('click', e => {
      const sidebar = document.getElementById('sidebar');
      const toggle = document.getElementById('menuToggle');
      if (window.innerWidth <= 950 && sidebar?.classList.contains('open') &&
          !sidebar.contains(e.target) && !toggle?.contains(e.target)) {
        closeMobileSidebar();
      }
    });

    // 3. Selector de mes global
    document.getElementById('monthPicker')?.addEventListener('change', e => {
      if (/^\d{4}-\d{2}$/.test(e.target.value)) {
        this.selectedMonth = e.target.value;
        this.renderAll();
      }
    });

    document.getElementById('monthPickerButton')?.addEventListener('click', () => {
      const picker = document.getElementById('monthPicker');
      if (picker?.showPicker) picker.showPicker();
      else picker?.click();
    });

    // 4. Conmutador de tema claro/oscuro
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      const newTheme = store.theme === 'dark' ? 'light' : 'dark';
      store.setState({ theme: newTheme }, 'theme:changed');
      document.body.classList.toggle('dark', newTheme === 'dark');
      const themeIcon = document.getElementById('themeIcon');
      if (themeIcon) {
        themeIcon.textContent = newTheme === 'dark' ? 'light_mode' : 'dark_mode';
      }
      this.renderActiveView();
    });

    // 5. Botón agregar movimiento en topbar y llamadas rápidas
    document.getElementById('topAdd')?.addEventListener('click', () => this.openTransactionModal());
    document.querySelectorAll('[data-open-add]').forEach(btn => {
      btn.addEventListener('click', () => this.openTransactionModal());
    });

    // 6. Selector de tipo (Gasto / Ingreso) en modal de movimiento
    document.querySelectorAll('.type-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.formType;
        const typeInput = document.getElementById('transactionType');
        if (typeInput) typeInput.value = type;
        document.querySelectorAll('.type-option').forEach(b => b.classList.toggle('active', b === btn));
        this.refreshSelects();
      });
    });

    // 7. Envíos de Formularios
    document.getElementById('transactionForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const type = document.getElementById('transactionType').value;
      const title = document.getElementById('transactionTitle').value;
      const amount = document.getElementById('transactionAmount').value;
      const date = document.getElementById('transactionDate').value;
      const categoryId = document.getElementById('transactionCategory').value;
      const accountId = document.getElementById('transactionAccount').value;
      const method = document.getElementById('transactionMethod').value;
      const note = document.getElementById('transactionNote').value;

      const result = transactionService.saveTransaction({
        id: this.editingTransactionId,
        type,
        title,
        amount,
        date,
        categoryId,
        accountId,
        method,
        note
      });

      if (result.success) {
        Toast.success(this.editingTransactionId ? 'Movimiento actualizado.' : 'Movimiento registrado con éxito.');
        Modal.closeAll();
        this.selectedMonth = date.slice(0, 7);
        this.renderAll();
      } else {
        Toast.error(result.error);
      }
    });

    document.getElementById('accountForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const id = document.getElementById('editingAccountId').value;
      const name = document.getElementById('accountName').value;
      const type = document.getElementById('accountType').value;
      const initialBalance = document.getElementById('accountInitialBalance').value;
      const color = document.getElementById('accountColor').value;
      const icon = document.getElementById('accountIcon').value;

      const result = accountService.saveAccount({ id, name, type, initialBalance, color, icon });
      if (result.success) {
        Toast.success(id ? 'Cuenta actualizada.' : 'Cuenta creada.');
        Modal.closeAll();
        this.refreshSelects();
        this.renderAll();
      } else {
        Toast.error(result.error);
      }
    });

    document.getElementById('transferForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const fromAccountId = document.getElementById('transferFromAccount').value;
      const toAccountId = document.getElementById('transferToAccount').value;
      const amount = document.getElementById('transferAmount').value;
      const date = document.getElementById('transferDate').value;
      const note = document.getElementById('transferNote').value;

      const result = accountService.transfer({ fromAccountId, toAccountId, amount, date, note });
      if (result.success) {
        Toast.success('Transferencia registrada exitosamente.');
        Modal.closeAll();
        this.renderAll();
      } else {
        Toast.error(result.error);
      }
    });

    document.getElementById('categoryForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const id = document.getElementById('editingCategoryId').value;
      const name = document.getElementById('categoryName').value;
      const type = document.getElementById('categoryType').value;
      const color = document.getElementById('categoryColor').value;
      const icon = document.getElementById('categoryIcon').value;

      const result = categoryService.saveCategory({ id, name, type, color, icon });
      if (result.success) {
        Toast.success(id ? 'Categoría actualizada.' : 'Categoría creada.');
        Modal.closeAll();
        CategoriesView.activeTab = type;
        this.refreshSelects();
        this.renderAll();
      } else {
        Toast.error(result.error);
      }
    });

    document.getElementById('budgetForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const id = document.getElementById('editingBudgetId').value;
      const categoryId = document.getElementById('budgetCategory').value;
      const limit = document.getElementById('budgetLimit').value;
      const note = document.getElementById('budgetNote').value;

      const result = budgetService.saveBudget({ id, categoryId, limit, note });
      if (result.success) {
        Toast.success(id ? 'Presupuesto guardado.' : 'Presupuesto creado.');
        Modal.closeAll();
        this.renderAll();
      } else {
        Toast.error(result.error);
      }
    });

    document.getElementById('recurringForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const id = document.getElementById('editingRecurringId').value;
      const title = document.getElementById('recurringTitle').value;
      const amount = document.getElementById('recurringAmount').value;
      const frequency = document.getElementById('recurringFrequency').value;
      const dueDay = document.getElementById('recurringDueDay').value;
      const categoryId = document.getElementById('recurringCategory').value;
      const accountId = document.getElementById('recurringAccount').value;
      const note = document.getElementById('recurringNote').value;

      const result = recurringService.saveRecurring({
        id,
        title,
        amount,
        frequency,
        dueDay,
        categoryId,
        accountId,
        note
      });

      if (result.success) {
        Toast.success(id ? 'Suscripción actualizada.' : 'Suscripción registrada.');
        Modal.closeAll();
        this.renderAll();
      } else {
        Toast.error(result.error);
      }
    });

    // 8. Botones de Apertura de Modales
    document.getElementById('addAccountButton')?.addEventListener('click', () => this.openAccountModal());
    document.getElementById('transferButton')?.addEventListener('click', () => this.openTransferModal());
    document.getElementById('addCategoryButton')?.addEventListener('click', () => this.openCategoryModal());
    document.getElementById('addBudgetButton')?.addEventListener('click', () => this.openBudgetModal());
    document.getElementById('emptyAddBudget')?.addEventListener('click', () => this.openBudgetModal());
    document.getElementById('addRecurringButton')?.addEventListener('click', () => this.openRecurringModal());
    document.getElementById('emptyAddRecurring')?.addEventListener('click', () => this.openRecurringModal());

    // 9. Pestañas de categorías
    document.querySelectorAll('.category-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        CategoriesView.activeTab = btn.dataset.catType;
        CategoriesView.render();
      });
    });

    // 10. Filtros y búsqueda debounced en movimientos
    let debounceTimer = null;
    const handleFilterChange = () => {
      TransactionsView.resetPagination();
      TransactionsView.render();
    };

    document.getElementById('transactionSearch')?.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(handleFilterChange, 220);
    });

    ['typeFilter', 'categoryFilter', 'accountFilter', 'transactionMonth'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', handleFilterChange);
    });

    document.getElementById('clearFilters')?.addEventListener('click', () => {
      const search = document.getElementById('transactionSearch');
      const type = document.getElementById('typeFilter');
      const cat = document.getElementById('categoryFilter');
      const acc = document.getElementById('accountFilter');
      const month = document.getElementById('transactionMonth');

      if (search) search.value = '';
      if (type) type.value = 'all';
      if (cat) cat.value = 'all';
      if (acc) acc.value = 'all';
      if (month) month.value = '';

      TransactionsView.resetPagination();
      TransactionsView.render();
    });

    // 11. Exportar e Importar
    document.getElementById('exportTransactions')?.addEventListener('click', () => {
      // Exportar solo los filtrados
      const search = document.getElementById('transactionSearch')?.value || '';
      const type = document.getElementById('typeFilter')?.value || 'all';
      const categoryId = document.getElementById('categoryFilter')?.value || 'all';
      const accountId = document.getElementById('accountFilter')?.value || 'all';
      const month = document.getElementById('transactionMonth')?.value || '';

      const queryResult = transactionService.query({
        search, type, categoryId, accountId, month, pageSize: 999999
      });

      dataTransferService.exportCSV(queryResult.items);
      Toast.success(`Exportados ${queryResult.items.length} movimientos a CSV.`);
    });

    document.getElementById('exportSidebar')?.addEventListener('click', () => {
      dataTransferService.exportBackupJSON();
      Toast.success('Copia de respaldo JSON descargada.');
    });

    document.getElementById('btnExportJSON')?.addEventListener('click', () => {
      dataTransferService.exportBackupJSON();
      Toast.success('Copia de respaldo JSON descargada.');
    });

    document.getElementById('btnExportCSV')?.addEventListener('click', () => {
      dataTransferService.exportCSV();
      Toast.success('Todos los movimientos exportados a CSV.');
    });

    // Importar JSON
    document.getElementById('jsonFileInput')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = ev => {
        Modal.confirm(
          '¿Importar copia de respaldo JSON?',
          'Selecciona si deseas reemplazar toda la base de datos o fusionarla con tus registros existentes.',
          () => {
            const res = dataTransferService.importBackupJSON(ev.target.result, 'replace');
            if (res.success) {
              Toast.success(`Respaldo restaurado con ${res.count} movimientos.`);
              this.renderAll();
            } else {
              Toast.error(res.error);
            }
          },
          { confirmText: 'Reemplazar y Restaurar', isDanger: false }
        );
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // Importar CSV
    document.getElementById('csvFileInput')?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = ev => {
        const parseResult = dataTransferService.parseCSV(ev.target.result);
        if (!parseResult.success) {
          Toast.error(parseResult.error);
          return;
        }

        const count = parseResult.transactions.length;
        Modal.confirm(
          `¿Importar ${count} movimientos desde CSV?`,
          `Se encontraron ${count} movimientos válidos en el archivo. ¿Deseas agregarlos a tu historial?`,
          () => {
            dataTransferService.commitCSVTransactions(parseResult.transactions);
            Toast.success(`${count} movimientos importados exitosamente.`);
            this.renderAll();
          },
          { confirmText: `Importar ${count} movimientos`, isDanger: false }
        );
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // Cambio de divisa en configuración
    document.getElementById('settingsCurrencySelect')?.addEventListener('change', e => {
      currencyService.setCurrency(e.target.value);
      Toast.success(`Moneda cambiada a ${e.target.value}.`);
      this.renderAll();
    });

    // Restablecer de fábrica
    document.getElementById('btnFactoryReset')?.addEventListener('click', () => {
      Modal.confirm(
        '¿Restablecer datos de fábrica?',
        '¡ADVERTENCIA! Se borrarán todos los movimientos, cuentas y presupuestos guardados en este navegador. Asegúrate de haber exportado un respaldo primero.',
        () => {
          store.reset();
          Toast.info('Datos restablecidos a la configuración inicial.');
          this.refreshSelects();
          this.renderAll();
        },
        { confirmText: 'Sí, borrar todo', isDanger: true }
      );
    });

    // 12. Delegación de eventos en clics dinámicos (Editar, Borrar, Acciones)
    document.addEventListener('click', e => {
      // Movimientos
      const editTx = e.target.closest('[data-edit-transaction]');
      if (editTx) {
        const tx = transactionService.getById(editTx.dataset.editTransaction);
        if (tx) this.openTransactionModal(tx.type, tx);
        return;
      }

      const delTx = e.target.closest('[data-delete-transaction]');
      if (delTx) {
        const id = delTx.dataset.deleteTransaction;
        const tx = transactionService.getById(id);
        if (!tx) return;
        Modal.confirm(
          '¿Eliminar movimiento?',
          `Se eliminará “${tx.title}” de tus registros permanentemente.`,
          () => {
            transactionService.deleteTransaction(id);
            Toast.success('Movimiento eliminado.');
            this.renderAll();
          }
        );
        return;
      }

      // Cuentas
      const editAcc = e.target.closest('[data-edit-account]');
      if (editAcc) {
        const acc = accountService.getById(editAcc.dataset.editAccount);
        if (acc) this.openAccountModal(acc);
        return;
      }

      const delAcc = e.target.closest('[data-delete-account]');
      if (delAcc) {
        const id = delAcc.dataset.deleteAccount;
        const acc = accountService.getById(id);
        if (!acc) return;
        Modal.confirm(
          '¿Eliminar cuenta?',
          `Se eliminará la cuenta “${acc.name}”.`,
          () => {
            const res = accountService.deleteAccount(id);
            if (res.success) {
              Toast.success('Cuenta eliminada.');
              this.refreshSelects();
              this.renderAll();
            } else {
              Toast.error(res.error);
            }
          }
        );
        return;
      }

      // Categorías
      const editCat = e.target.closest('[data-edit-category]');
      if (editCat) {
        const cat = categoryService.getById(editCat.dataset.editCategory);
        if (cat) this.openCategoryModal(cat);
        return;
      }

      const delCat = e.target.closest('[data-delete-category]');
      if (delCat) {
        const id = delCat.dataset.deleteCategory;
        const cat = categoryService.getById(id);
        if (!cat) return;
        Modal.confirm(
          '¿Eliminar categoría?',
          `Se eliminará la categoría “${cat.name}”.`,
          () => {
            const res = categoryService.deleteCategory(id);
            if (res.success) {
              Toast.success('Categoría eliminada.');
              this.refreshSelects();
              this.renderAll();
            } else {
              Toast.error(res.error);
            }
          }
        );
        return;
      }

      // Presupuestos
      const editBgt = e.target.closest('[data-edit-budget]');
      if (editBgt) {
        const bgt = budgetService.getById(editBgt.dataset.editBudget);
        if (bgt) this.openBudgetModal(bgt);
        return;
      }

      const delBgt = e.target.closest('[data-delete-budget]');
      if (delBgt) {
        const id = delBgt.dataset.deleteBudget;
        const bgt = budgetService.getById(id);
        if (!bgt) return;
        const cat = categoryService.getById(bgt.categoryId);
        Modal.confirm(
          '¿Eliminar presupuesto?',
          `Se eliminará el presupuesto mensual de ${cat.name}.`,
          () => {
            budgetService.deleteBudget(id);
            Toast.success('Presupuesto eliminado.');
            this.renderAll();
          }
        );
        return;
      }

      // Recurrentes
      const editRec = e.target.closest('[data-edit-recurring]');
      if (editRec) {
        const rec = recurringService.getById(editRec.dataset.editRecurring);
        if (rec) this.openRecurringModal(rec);
        return;
      }

      const delRec = e.target.closest('[data-delete-recurring]');
      if (delRec) {
        const id = delRec.dataset.deleteRecurring;
        const rec = recurringService.getById(id);
        if (!rec) return;
        Modal.confirm(
          '¿Eliminar suscripción recurrente?',
          `Se eliminará “${rec.title}”. Los movimientos pasados no se borrarán.`,
          () => {
            recurringService.deleteRecurring(id);
            Toast.success('Suscripción eliminada.');
            this.renderAll();
          }
        );
        return;
      }

      const toggleRec = e.target.closest('[data-toggle-recurring]');
      if (toggleRec) {
        const id = toggleRec.dataset.toggleRecurring;
        recurringService.toggleActive(id);
        this.renderAll();
        return;
      }

      const applyRec = e.target.closest('[data-apply-recurring]');
      if (applyRec) {
        const id = applyRec.dataset.applyRecurring;
        const res = recurringService.applyToMonth(id, this.selectedMonth);
        if (res.success) {
          Toast.success('Movimiento recurrente registrado en el mes actual.');
          this.renderAll();
        } else {
          Toast.error(res.error);
        }
        return;
      }
    });

    // 13. Atajo de teclado (Ctrl + N o Cmd + N)
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        this.openTransactionModal();
      }
    });

    // 14. Redimensionamiento para gráficos
    window.addEventListener('resize', () => {
      if (this.activeView === 'dashboard') {
        const [year, month] = this.selectedMonth.split('-').map(Number);
        const stats = transactionService.getMonthStats(this.selectedMonth);
        DashboardView.render(this.selectedMonth);
      }
    });
  }
}

// Inicializar la aplicación cuando el DOM esté listo
const app = new App();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

export default app;
