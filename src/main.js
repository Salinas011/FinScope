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
import { authService } from './services/authService.js';
import { firestoreService } from './services/firestoreService.js';

import { Toast } from './ui/toast.js';
import { Modal } from './ui/modal.js';
import { getMaterialIconName } from './ui/icons.js';
import { initAmountInputs, formatAmountValue } from './ui/amountFormatter.js';
import { MonthPicker, formatMonthDisplay } from './ui/components/monthPicker.js';
import { customDropdownManager } from './ui/components/customDropdown.js';

import { router } from './ui/router.js';
import { modalController } from './ui/controllers/modalController.js';

// Conexión con el enrutador modular
const loadView = (name) => router.loadView(name);
const loadedViews = router.loadedViews;

// Carga perezosa para el servicio de transferencia
const getDataTransferService = async () => {
  const mod = await import('./services/dataTransferService.js');
  return mod.dataTransferService;
};


class App {
  constructor() {
    this.activeView = 'dashboard';
    this.selectedMonth = new Date().toISOString().slice(0, 7);
    this.modalController = modalController;
    this.pendingCSVTransactions = null;
  }

  get editingTransactionId() { return this.modalController.editingTransactionId; }
  set editingTransactionId(val) { this.modalController.editingTransactionId = val; }

  get editingAccountId() { return this.modalController.editingAccountId; }
  set editingAccountId(val) { this.modalController.editingAccountId = val; }

  get editingPocketId() { return this.modalController.editingPocketId; }
  set editingPocketId(val) { this.modalController.editingPocketId = val; }

  get editingCategoryId() { return this.modalController.editingCategoryId; }
  set editingCategoryId(val) { this.modalController.editingCategoryId = val; }

  get editingBudgetId() { return this.modalController.editingBudgetId; }
  set editingBudgetId(val) { this.modalController.editingBudgetId = val; }

  get editingRecurringId() { return this.modalController.editingRecurringId; }
  set editingRecurringId(val) { this.modalController.editingRecurringId = val; }

  async init() {
    Toast.init();
    Modal.init();

    // Hidratar almacén central de forma asíncrona desde IndexedDB
    await store.init();

    // Rehidratación inmediata desde Cloud Firestore si hay sesión activa (Initial Cloud Pull)
    const currentUser = authService.getUser();
    if (currentUser) {
      const isLocalEmpty = (store.transactions.length === 0);
      if (isLocalEmpty) {
        Toast.info('Recuperando tus finanzas desde Cloud Firestore...', 3500);
      }
      try {
        const uid = currentUser.uid || currentUser.id || currentUser.email;
        await firestoreService.pullAllUserData(uid);
        if (isLocalEmpty && store.transactions.length > 0) {
          Toast.success('¡Tus finanzas se han recuperado exitosamente!');
        }
      } catch (err) {
        console.error('[Main] Error durante la rehidratación inicial desde Firestore:', err);
      }
    }

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

    const txMonthLabel = document.getElementById('transactionMonthLabel');
    if (txMonthLabel) txMonthLabel.textContent = formatMonthDisplay(this.selectedMonth);

    const picker = document.getElementById('monthPicker');
    if (picker) picker.value = this.selectedMonth;

    // Vincular eventos y vistas
    this.bindEvents();
    initAmountInputs();
    customDropdownManager.init(['typeFilter', 'categoryFilter', 'accountFilter']);
    await router.init({ getSelectedMonth: () => this.selectedMonth });
    this.refreshSelects();
    this.renderAll();

    // Suscribirse a cambios del almacén reactivo
    store.subscribe(() => {
      this.refreshSelects();
      this.renderActiveView();
    });

    // Re-renderizado al reasignar categorías
    eventBus.on('transactions:reassigned', () => {
      this.refreshSelects();
      this.renderAll();
    });

    // Re-renderizado completo al recibir evento de rehidratación o sincronización en la nube
    eventBus.on('store:synced', () => {
      this.refreshSelects();
      this.renderAll();
    });

    // Escuchar inicio de sesión para refrescar el almacén y re-renderizar todas las vistas
    eventBus.on('auth:login_success', () => {
      this.refreshSelects();
      this.renderAll();
    });

    eventBus.on('auth:login', () => {
      this.refreshSelects();
      this.renderAll();
    });

    eventBus.on('auth:logout', () => {
      this.refreshSelects();
      this.renderAll();
    });

    // Escuchar alertas de almacenamiento
    eventBus.on('error:storage', err => {
      Toast.error(err);
    });

    // Estado reactivo de sincronización con Firestore
    firestoreService.onSyncStatusChange(status => {
      this.updateSyncUI(status);
    });

    // Guardar cambios en Firestore cuando el usuario esté autenticado (ignora pulls y sync directos)
    eventBus.on('state:changed', (e) => {
      if (firestoreService.isApplyingRemoteChange) return;
      if (e?.actionTag?.startsWith('firestore:')) return;
      const user = authService.getUser();
      if (user) {
        firestoreService.saveCurrentStateDebounced(user);
      }
    });

    // Suscribirse a cambios en el estado de autenticación de Google
    let hasInitializedAuth = false;
    authService.subscribe(async user => {
      this.renderAuthUI(user);
      if (user) {
        await firestoreService.attachUser(user);
      } else {
        firestoreService.detachUser();
      }
      this.refreshSelects();
      this.renderAll();
      if (hasInitializedAuth && user) {
        Toast.success(`¡Bienvenido, ${user.givenName || user.name || 'Usuario'}!`);
      }
      hasInitializedAuth = true;
    });

    // Monitoreo de conectividad y estado de red en tiempo real
    window.addEventListener('online', () => {
      this.updateSyncUI(authService.isAuthenticated() ? 'connected' : 'local');
      Toast.info('Conexión reestablecida. En línea.');
    });
    window.addEventListener('offline', () => {
      this.updateSyncUI('offline');
      Toast.warning('Modo sin conexión. Guardando localmente.');
    });

    console.log('Finanza v2 iniciado exitosamente.');
  }

  updateSyncUI(status) {
    const badge = document.getElementById('syncStatusBadge');
    const dot = document.getElementById('syncStatusDot');

    if (badge) {
      badge.classList.remove('cloud-synced', 'cloud-syncing');
      if (status === 'connected') {
        badge.classList.add('cloud-synced');
        badge.innerHTML = `<span class="material-symbols-rounded">cloud_done</span> Sincronizado en la nube`;
        badge.title = 'Tus datos están sincronizados en tiempo real con Firebase Firestore';
      } else if (status === 'syncing') {
        badge.classList.add('cloud-syncing');
        badge.innerHTML = `<span class="material-symbols-rounded">sync</span> Sincronizando...`;
        badge.title = 'Guardando cambios en la nube...';
      } else if (status === 'error') {
        badge.innerHTML = `<span class="material-symbols-rounded" style="color:#ef4444;">cloud_off</span> Error de sincronización`;
        badge.title = 'No se pudo conectar con Firestore. Guardando solo localmente.';
      } else if (status === 'offline') {
        badge.innerHTML = `<span class="material-symbols-rounded" style="color:var(--amber, #f59e0b);">wifi_off</span> Sin conexión (Local)`;
        badge.title = 'Modo sin conexión a internet. Guardando cambios de forma segura en este dispositivo.';
      } else {
        badge.innerHTML = `<span class="material-symbols-rounded">verified_user</span> Seguro en este dispositivo`;
        badge.title = 'Almacenamiento local privado';
      }
    }

    if (dot) {
      dot.classList.toggle('synced', status === 'connected');
      dot.title = status === 'connected' ? 'Sincronizado con Firebase Firestore' : 'Almacenamiento local activo';
    }
  }

  renderAuthUI(user) {
    const sidebarContainer = document.getElementById('authProfileContainer');
    const topbarContainer = document.getElementById('topbarAuthContainer');
    const modalBody = document.getElementById('userProfileModalBody');
    const settingsAuthCard = document.getElementById('settingsAuthCard');

    const firstLetter = (user?.name || 'U').charAt(0).toUpperCase();

    // 1. Botón / Avatar en la barra superior (Topbar)
    if (topbarContainer) {
      if (!user) {
        topbarContainer.innerHTML = `
          <button class="topbar-user-pill guest" id="btnOpenAuthModal" aria-label="Iniciar sesión con Google" title="Modo Invitado · Toca para acceder con Google">
            <span class="material-symbols-rounded">account_circle</span>
            <span class="topbar-user-text">Acceder</span>
          </button>
        `;
      } else {
        topbarContainer.innerHTML = `
          <button class="topbar-user-pill logged" id="btnOpenAuthModal" aria-label="Ver perfil de usuario" title="${user.name} · Sincronizado">
            <img 
              class="topbar-avatar" 
              src="${user.picture || ''}" 
              alt="${user.name || 'Usuario'}" 
              referrerpolicy="no-referrer"
              onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='grid';" 
            />
            <div class="topbar-initial" style="display: none;">${firstLetter}</div>
            <span class="topbar-dot" title="Sincronizado"></span>
          </button>
        `;
      }

      document.getElementById('btnOpenAuthModal')?.addEventListener('click', () => {
        Modal.open('#userProfileModal');
        if (!authService.isAuthenticated()) {
          setTimeout(() => {
            authService.initGoogleAuth(['googleBtnModal', 'googleBtnSettings', 'googleBtnContainer']);
          }, 80);
        }
      });
    }

    // 2. Modal de Perfil y Sincronización
    if (modalBody) {
      if (!user) {
        modalBody.innerHTML = `
          <div class="auth-modal-guest">
            <div class="auth-modal-icon-wrap">
              <span class="material-symbols-rounded">cloud_sync</span>
            </div>
            <h3>Modo Invitado Activo</h3>
            <p class="muted" style="font-size: 12px; margin-bottom: 12px;">Tus finanzas se guardan exclusivamente en el almacenamiento local de este dispositivo.</p>
            <div class="auth-features-list">
              <div class="auth-feature-item">
                <span class="material-symbols-rounded">check_circle</span>
                <span>Sincronización en la nube con Firestore</span>
              </div>
              <div class="auth-feature-item">
                <span class="material-symbols-rounded">check_circle</span>
                <span>Acceso multidispositivo (PC, Tablet y Móvil)</span>
              </div>
              <div class="auth-feature-item">
                <span class="material-symbols-rounded">check_circle</span>
                <span>Respaldo automático sin pérdida de datos</span>
              </div>
            </div>
            <div class="auth-google-wrapper">
              <div id="googleBtnModal"></div>
              <span class="login-hint" style="font-size: 11px; color: var(--muted); margin-top: 4px;">Inicia sesión con tu cuenta de Google</span>
            </div>
            <div class="form-footer" style="margin-top: 18px;">
              <button type="button" class="outline-button" data-close-modal style="width: 100%;">Cerrar</button>
            </div>
          </div>
        `;
      } else {
        modalBody.innerHTML = `
          <div class="auth-modal-logged">
            <div class="auth-user-card">
              <img 
                class="avatar-img-lg" 
                src="${user.picture || ''}" 
                alt="${user.name || 'Usuario'}" 
                referrerpolicy="no-referrer"
                onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='grid';" 
              />
              <div class="avatar-lg" style="display: none;">${firstLetter}</div>
              <div class="auth-user-info">
                <h3 style="font-size: 15px; margin: 0 0 2px;">${user.name}</h3>
                <p class="muted" style="font-size: 12px; margin: 0;">${user.email}</p>
              </div>
            </div>
            <div class="auth-sync-status-box">
              <span class="material-symbols-rounded sync-icon-ok">cloud_done</span>
              <div>
                <strong>Sincronización en la Nube Activa</strong>
                <small style="display: block; color: var(--muted); font-size: 11px;">Tus datos están protegidos y sincronizados en tiempo real con Firebase Firestore</small>
              </div>
            </div>
            <div class="form-footer" style="margin-top: 20px;">
              <button type="button" class="outline-button" data-close-modal>Volver</button>
              <button type="button" class="danger-button" id="btnLogoutModal"><span class="material-symbols-rounded" style="font-size: 16px;">logout</span> Cerrar sesión</button>
            </div>
          </div>
        `;

        document.getElementById('btnLogoutModal')?.addEventListener('click', async () => {
          Modal.closeAll();
          await authService.signOut();
          this.renderAll();
          Toast.info('Has cerrado sesión. Base local eliminada y Modo Invitado activado.');
        });
      }
    }

    // 3. Tarjeta en la Vista de Ajustes / Configuración
    if (settingsAuthCard) {
      try {
        if (loadedViews.settings?.renderAuthCard) {
          loadedViews.settings.renderAuthCard(user);
        } else {
          import('./ui/views/settingsView.js').then(m => {
            m.SettingsView.renderAuthCard(user);
          }).catch(err => {
            console.warn('[main.js] Fallback al cargar SettingsView dinámicamente:', err);
          });
        }
      } catch (err) {
        console.error('[main.js] Error al actualizar settingsAuthCard:', err);
      }
    }

    // 4. Barra lateral en escritorio (Sidebar)
    if (sidebarContainer) {
      if (!user) {
        sidebarContainer.innerHTML = `
          <div class="login-wrapper">
            <div id="googleBtnContainer"></div>
            <span class="login-hint">Inicia sesión con Google</span>
          </div>
        `;
      } else {
        sidebarContainer.innerHTML = `
          <div class="profile-row user-logged">
            <img 
              class="avatar-img" 
              src="${user.picture || ''}" 
              alt="${user.name || 'Usuario'}" 
              referrerpolicy="no-referrer"
              onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='grid';" 
            />
            <div class="avatar" style="display: none;">${firstLetter}</div>
            <div class="user-meta">
              <strong title="${user.name}">${user.name}</strong>
              <small title="${user.email}">${user.email}</small>
            </div>
            <button class="logout-btn" id="btnLogoutGoogle" title="Cerrar sesión" aria-label="Cerrar sesión de Google">
              <span class="material-symbols-rounded">logout</span>
            </button>
          </div>
        `;

        document.getElementById('btnLogoutGoogle')?.addEventListener('click', async () => {
          await authService.signOut();
          this.renderAll();
          Toast.info('Has cerrado sesión. Base local eliminada y Modo Invitado activado.');
        });
      }
    }

    // Actualizar clase global en body y botones de acción según el estado de autenticación
    document.body.classList.toggle('guest-mode', !user);

    const topAddBtn = document.getElementById('topAdd');
    if (topAddBtn) {
      topAddBtn.innerHTML = !user
        ? '<span class="material-symbols-rounded">add</span> <span>Nuevo movimiento</span> <span class="material-symbols-rounded auth-lock-mini" title="Requiere iniciar sesión">lock</span>'
        : '<span class="material-symbols-rounded">add</span> <span>Nuevo movimiento</span>';
    }

    // Si el usuario inició sesión y el modal de cuenta/sincronización está abierto
    const userProfileModal = document.getElementById('userProfileModal');
    if (user && userProfileModal && !userProfileModal.classList.contains('hidden')) {
      Modal.closeAll();
    }

    // Inicializar botones de Google en todos los contenedores activos si el usuario es invitado
    if (!user) {
      authService.initGoogleAuth(['googleBtnContainer', 'googleBtnModal', 'googleBtnSettings']);
    }
  }

  /**
   * Interceptor de autenticación para operaciones de escritura/mutación.
   * Si el usuario no ha iniciado sesión, detiene la acción y abre el modal original
   * de Cuenta y Sincronización.
   * @param {Function} [actionCallback] - Acción a ejecutar si el usuario está autenticado.
   * @returns {boolean} true si está autenticado, false si fue interceptado.
   */
  requireAuth(actionCallback) {
    if (authService.isAuthenticated()) {
      if (typeof actionCallback === 'function') {
        actionCallback();
      }
      return true;
    }
    this.openUserProfileModal();
    return false;
  }

  /**
   * Abre directamente el modal original de Cuenta y Sincronización.
   */
  openUserProfileModal() {
    this.modalController.openUserProfileModal();
  }

  /**
   * Alias de compatibilidad
   */
  openAuthGuardModal() {
    this.openUserProfileModal();
  }

  get activeView() {
    return router.getActiveView();
  }

  set activeView(viewName) {
    router.activeView = viewName;
  }

  async setView(viewName) {
    await router.navigate(viewName);
  }

  async renderActiveView() {
    await router.renderActiveView();
  }

  updateMonthPickerButtonLabel(selectedMonth) {
    const monthLabel = document.getElementById('monthLabel');
    if (!monthLabel) return;
    const currentMonthISO = new Date().toISOString().slice(0, 7);
    monthLabel.textContent = selectedMonth === currentMonthISO ? 'Este mes' : formatMonthDisplay(selectedMonth);
  }

  renderAll() {
    DashboardView.render(this.selectedMonth);
    if (loadedViews.transactions) loadedViews.transactions.render();
    if (loadedViews.accounts) loadedViews.accounts.render();
    if (loadedViews.budgets) loadedViews.budgets.render(this.selectedMonth);
    if (loadedViews.categories) loadedViews.categories.render();
    if (loadedViews.recurring) loadedViews.recurring.render(this.selectedMonth);
    if (loadedViews.settings) loadedViews.settings.render();
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
      const placeholder = '<option value="" disabled selected hidden>Selecciona una categoría...</option>';
      txCatSelect.innerHTML = placeholder + filteredCats.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
      if (prevVal && filteredCats.some(c => c.id === prevVal)) {
        txCatSelect.value = prevVal;
      } else {
        txCatSelect.value = '';
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
      const placeholder = '<option value="" disabled selected hidden>Selecciona una categoría...</option>';
      bgtCatSelect.innerHTML = placeholder + expenseCats.map(c => `
        <option value="${c.id}">${c.name}</option>
      `).join('');
      if (prev && expenseCats.some(c => c.id === prev)) {
        bgtCatSelect.value = prev;
      } else {
        bgtCatSelect.value = '';
      }
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
      const prev = recCatSelect.value;
      const placeholder = '<option value="" disabled selected hidden>Selecciona una categoría...</option>';
      recCatSelect.innerHTML = placeholder + categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      if (prev && categories.some(c => c.id === prev)) {
        recCatSelect.value = prev;
      } else {
        recCatSelect.value = '';
      }
    }
    if (recAccSelect) {
      recAccSelect.innerHTML = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
    }

    this.refreshPocketSelect();
    customDropdownManager.syncAll();
  }

  refreshPocketSelect() {
    const accSelect = document.getElementById('transactionAccount');
    const pocketSelect = document.getElementById('transactionPocket');
    const pocketWrap = document.getElementById('transactionPocketWrap');
    const txType = document.getElementById('transactionType')?.value || 'expense';

    if (!pocketSelect) return;

    if (txType !== 'expense') {
      if (pocketWrap) pocketWrap.style.display = 'none';
      pocketSelect.value = '';
      return;
    }

    if (pocketWrap) pocketWrap.style.display = 'block';

    const accountId = accSelect?.value;
    if (!accountId) {
      pocketSelect.innerHTML = '<option value="">Saldo Disponible (General)</option>';
      return;
    }

    const balances = accountService.calculateBalances(accountId);
    let html = `<option value="">Saldo Disponible (General: ${currencyService.format(balances.availableBalance)})</option>`;

    if (balances.pockets && balances.pockets.length > 0) {
      html += `<optgroup label="Alcancías de esta cuenta">`;
      balances.pockets.forEach(p => {
        html += `<option value="${p.id}">${p.name} (Saldo: ${currencyService.format(p.currentBalance)})</option>`;
      });
      html += `</optgroup>`;
    }

    const prevPocket = pocketSelect.value;
    pocketSelect.innerHTML = html;
    if (prevPocket && balances.pockets.some(p => p.id === prevPocket)) {
      pocketSelect.value = prevPocket;
    }
  }

  // --- Modales y Formularios (Delegados a ModalController) ---

  openTransactionModal(type = 'expense', transaction = null, isDuplicate = false) {
    this.modalController.openTransactionModal(type, transaction, isDuplicate, {
      refreshSelects: () => this.refreshSelects(),
      refreshPocketSelect: () => this.refreshPocketSelect()
    });
  }

  openAccountModal(account = null) {
    this.modalController.openAccountModal(account);
  }

  openPocketModal(accountId, pocket = null) {
    this.modalController.openPocketModal(accountId, pocket);
  }

  openPocketActionModal(accountId, pocketId, pocketName, mode = 'deposit') {
    this.modalController.openPocketActionModal(accountId, pocketId, pocketName, mode);
  }

  openTransferModal() {
    this.modalController.openTransferModal({
      refreshSelects: () => this.refreshSelects()
    });
  }

  openCategoryModal(category = null) {
    const activeTab = loadedViews.categories?.activeTab || 'expense';
    this.modalController.openCategoryModal(category, activeTab);
  }

  openBudgetModal(budget = null) {
    this.modalController.openBudgetModal(budget, {
      refreshSelects: () => this.refreshSelects()
    });
  }

  openRecurringModal(recurring = null) {
    this.modalController.openRecurringModal(recurring, {
      refreshSelects: () => this.refreshSelects()
    });
  }

  openReassignCategoryModal(sourceCategoryId) {
    this.modalController.openReassignCategoryModal(sourceCategoryId);
  }

  // --- Manejadores de Eventos ---

  bindEvents() {
    const closeMobileSidebar = () => {
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebarBackdrop')?.classList.remove('active');
    };

    // 1. Navegación principal (Sidebar y Bottom Nav)
    document.querySelectorAll('.nav-item[data-view], .bottom-nav-item[data-view]').forEach(btn => {
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

    // 3. Selector de mes global con MonthPicker personalizado
    document.getElementById('monthPicker')?.addEventListener('change', e => {
      if (/^\d{4}-\d{2}$/.test(e.target.value)) {
        this.selectedMonth = e.target.value;
        this.updateMonthPickerButtonLabel(e.target.value);
        this.renderAll();
      }
    });

    document.getElementById('monthPickerButton')?.addEventListener('click', (e) => {
      e.stopPropagation();
      MonthPicker.open({
        anchorEl: document.getElementById('monthPickerButton'),
        value: this.selectedMonth,
        clearText: 'Este mes',
        onChange: (newMonth) => {
          if (/^\d{4}-\d{2}$/.test(newMonth)) {
            this.selectedMonth = newMonth;
            const picker = document.getElementById('monthPicker');
            if (picker) picker.value = newMonth;
            this.updateMonthPickerButtonLabel(newMonth);
            this.renderAll();
          }
        },
        onClear: () => {
          const currentMonthISO = new Date().toISOString().slice(0, 7);
          this.selectedMonth = currentMonthISO;
          const picker = document.getElementById('monthPicker');
          if (picker) picker.value = currentMonthISO;
          this.updateMonthPickerButtonLabel(currentMonthISO);
          this.renderAll();
        }
      });
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
      if (!authService.isAuthenticated()) {
        authService.initGoogleAuth(['googleBtnContainer', 'googleBtnModal', 'googleBtnSettings']);
      }
      this.renderActiveView();
    });

    // Epic 4: Modo Privacidad (Ocultar / Mostrar montos con asteriscos)
    const updatePrivacyUI = (isActive) => {
      const icon = document.getElementById('privacyIcon');
      const btn = document.getElementById('privacyToggle');
      if (icon) {
        icon.textContent = isActive ? 'visibility_off' : 'visibility';
      }
      if (btn) {
        btn.classList.toggle('active', isActive);
        btn.title = isActive ? 'Modo privacidad activo (Mostrar saldos)' : 'Ocultar saldos';
      }
    };

    updatePrivacyUI(store.isPrivacyMode);

    document.getElementById('privacyToggle')?.addEventListener('click', () => {
      const isPrivate = store.togglePrivacyMode();
      updatePrivacyUI(isPrivate);
      this.renderAll();
      Toast.info(isPrivate ? 'Modo privacidad activado. Saldos ocultos.' : 'Modo privacidad desactivado.');
    });

    // 5. Botón agregar movimiento en topbar, llamadas rápidas y FAB móvil
    document.getElementById('topAdd')?.addEventListener('click', () => this.requireAuth(() => this.openTransactionModal()));
    document.getElementById('mobileFab')?.addEventListener('click', () => this.requireAuth(() => this.openTransactionModal()));
    document.querySelectorAll('[data-open-add]').forEach(btn => {
      btn.addEventListener('click', () => this.requireAuth(() => this.openTransactionModal()));
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

    // 6. Selector de cuenta en modal: refrescar alcancías dinámicamente
    document.getElementById('transactionAccount')?.addEventListener('change', () => this.refreshPocketSelect());

    // 7. Envíos de Formularios protegidos con Auth Guard
    document.getElementById('transactionForm')?.addEventListener('submit', e => {
      e.preventDefault();
      if (!this.requireAuth()) return;
      const type = document.getElementById('transactionType').value;
      const title = document.getElementById('transactionTitle').value;
      const amount = document.getElementById('transactionAmount').value;
      const date = document.getElementById('transactionDate').value;
      const categorySelect = document.getElementById('transactionCategory');
      const categoryId = categorySelect?.value;

      if (!categoryId || categoryId.trim() === '') {
        if (categorySelect) categorySelect.focus();
        Toast.error('Por favor selecciona una categoría');
        return;
      }

      const accountId = document.getElementById('transactionAccount').value;
      const pocketId = document.getElementById('transactionPocket')?.value || null;
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
        pocketId,
        method,
        note
      });

      if (result.success) {
        // Si el usuario marcó "Repetir todos los meses", crear regla recurrente mensual automática
        const recurringCheck = document.getElementById('transactionRecurringCheck');
        if (recurringCheck?.checked && !this.editingTransactionId) {
          const dueDay = Math.min(28, Math.max(1, parseInt(date.slice(8, 10), 10) || 1));
          recurringService.saveRecurring({
            title,
            amount,
            frequency: 'monthly',
            dueDay,
            categoryId,
            accountId,
            note: `Regla automática desde movimiento: ${title}`
          });
        }

        Toast.success(this.editingTransactionId ? 'Movimiento actualizado.' : 'Movimiento registrado con éxito.');
        Modal.closeAll();
        this.selectedMonth = date.slice(0, 7);
        this.renderAll();
      } else {
        Toast.error(result.error);
      }
    });

    // Formulario de creación/edición de alcancía
    document.getElementById('pocketForm')?.addEventListener('submit', e => {
      e.preventDefault();
      if (!this.requireAuth()) return;
      const accountId = document.getElementById('pocketAccountId').value;
      const pocketId = document.getElementById('editingPocketId').value;
      const name = document.getElementById('pocketName').value;
      const targetAmount = document.getElementById('pocketTargetAmount').value;
      const color = document.getElementById('pocketColor').value;
      const icon = document.getElementById('pocketIcon').value;

      let result;
      if (pocketId) {
        result = accountService.updatePocket(accountId, pocketId, { name, targetAmount, color, icon });
      } else {
        result = accountService.createPocket(accountId, { name, targetAmount, color, icon });
      }

      if (result.success) {
        Toast.success(pocketId ? 'Alcancía actualizada.' : 'Alcancía creada con éxito.');
        Modal.closeAll();
        this.renderAll();
      } else {
        Toast.error(result.error);
      }
    });

    // Formulario de movimientos internos de alcancía (Meter / Sacar)
    document.getElementById('pocketActionForm')?.addEventListener('submit', e => {
      e.preventDefault();
      if (!this.requireAuth()) return;
      const accountId = document.getElementById('pocketActionAccountId').value;
      const pocketId = document.getElementById('pocketActionPocketId').value;
      const mode = document.getElementById('pocketActionMode').value;
      const amount = document.getElementById('pocketActionAmount').value;
      const note = document.getElementById('pocketActionNote').value;
      const fundingSource = document.querySelector('input[name="pocketFundingSource"]:checked')?.value || 'available';
      const isExternal = mode === 'deposit' && fundingSource === 'external';

      let result;
      if (mode === 'deposit') {
        result = accountService.depositToPocket(accountId, pocketId, amount, note, isExternal);
      } else {
        result = accountService.withdrawFromPocket(accountId, pocketId, amount, note);
      }

      if (result.success) {
        const successMsg = mode === 'deposit'
          ? (isExternal ? 'Fondeo inicial externo registrado exitosamente.' : 'Fondos asignados a la alcancía.')
          : 'Fondos retirados al saldo disponible.';
        Toast.success(successMsg);
        Modal.closeAll();
        this.renderAll();
      } else {
        Toast.error(result.error);
      }
    });

    document.getElementById('accountForm')?.addEventListener('submit', e => {
      e.preventDefault();
      if (!this.requireAuth()) return;
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
      if (!this.requireAuth()) return;
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
      if (!this.requireAuth()) return;
      const id = document.getElementById('editingCategoryId').value;
      const name = document.getElementById('categoryName').value;
      const type = document.getElementById('categoryType').value;
      const color = document.getElementById('categoryColor').value;
      const icon = document.getElementById('categoryIcon').value;

      const result = categoryService.saveCategory({ id, name, type, color, icon });
      if (result.success) {
        Toast.success(id ? 'Categoría actualizada.' : 'Categoría creada.');
        Modal.closeAll();
        if (loadedViews.categories) {
          loadedViews.categories.activeTab = type;
        }
        this.refreshSelects();
        this.renderAll();
      } else {
        Toast.error(result.error);
      }
    });

    // Formulario de reasignación de saldo/movimientos entre categorías
    document.getElementById('reassignCategoryForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      if (!this.requireAuth()) return;
      const sourceId = document.getElementById('reassignSourceCategoryId')?.value;
      const targetSelect = document.getElementById('reassignTargetCategory');
      const targetId = targetSelect?.value;
      const amountInput = document.getElementById('reassignAmount');
      const amountVal = amountInput?.value || '';
      const cents = currencyService.toCents(amountVal);

      if (!targetId || targetId === sourceId) {
        if (targetSelect) targetSelect.focus();
        Toast.error('Por favor selecciona una categoría de destino.');
        return;
      }

      if (cents <= 0) {
        if (amountInput) amountInput.focus();
        Toast.error('Por favor ingresa un monto a mover mayor a cero.');
        return;
      }

      const targetCat = categoryService.getById(targetId);
      const result = await transactionService.reassignCategory(sourceId, targetId, cents);

      if (result.success) {
        Toast.success(`Se trasladaron ${currencyService.format(result.amount)} a "${targetCat?.name || 'la categoría'}".`);
        Modal.closeAll();
        this.refreshSelects();
        this.renderAll();
      } else {
        Toast.error(result.error || 'Error al reasignar movimientos.');
      }
    });

    document.getElementById('budgetForm')?.addEventListener('submit', e => {
      e.preventDefault();
      if (!this.requireAuth()) return;
      const id = document.getElementById('editingBudgetId').value;
      const catSelect = document.getElementById('budgetCategory');
      const categoryId = catSelect?.value;

      if (!categoryId || categoryId.trim() === '') {
        if (catSelect) catSelect.focus();
        Toast.error('Por favor selecciona una categoría');
        return;
      }

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
      if (!this.requireAuth()) return;
      const id = document.getElementById('editingRecurringId').value;
      const title = document.getElementById('recurringTitle').value;
      const amount = document.getElementById('recurringAmount').value;
      const frequency = document.getElementById('recurringFrequency').value;
      const dueDay = document.getElementById('recurringDueDay').value;
      const catSelect = document.getElementById('recurringCategory');
      const categoryId = catSelect?.value;

      if (!categoryId || categoryId.trim() === '') {
        if (catSelect) catSelect.focus();
        Toast.error('Por favor selecciona una categoría');
        return;
      }

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

    // 8. Botones de Apertura de Modales protegidos con Auth Guard
    document.getElementById('addAccountButton')?.addEventListener('click', () => this.requireAuth(() => this.openAccountModal()));
    document.getElementById('transferButton')?.addEventListener('click', () => this.requireAuth(() => this.openTransferModal()));
    document.getElementById('addCategoryButton')?.addEventListener('click', () => this.requireAuth(() => this.openCategoryModal()));
    document.getElementById('addBudgetButton')?.addEventListener('click', () => this.requireAuth(() => this.openBudgetModal()));
    document.getElementById('emptyAddBudget')?.addEventListener('click', () => this.requireAuth(() => this.openBudgetModal()));
    document.getElementById('addRecurringButton')?.addEventListener('click', () => this.requireAuth(() => this.openRecurringModal()));
    document.getElementById('emptyAddRecurring')?.addEventListener('click', () => this.requireAuth(() => this.openRecurringModal()));

    // 9. Pestañas de categorías
    document.querySelectorAll('.category-tab').forEach(btn => {
      btn.addEventListener('click', async () => {
        const CategoriesView = await loadView('categories');
        if (CategoriesView) {
          CategoriesView.activeTab = btn.dataset.catType;
          CategoriesView.render();
        }
      });
    });

    // 10. Filtros y búsqueda debounced en movimientos
    let debounceTimer = null;
    const handleFilterChange = async () => {
      const TransactionsView = await loadView('transactions');
      TransactionsView?.resetPagination();
      TransactionsView?.render();
    };

    document.getElementById('transactionSearch')?.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(handleFilterChange, 220);
    });

    const updateTxMonthLabel = (val) => {
      const label = document.getElementById('transactionMonthLabel');
      if (label) {
        label.textContent = val ? formatMonthDisplay(val) : 'Todos los meses';
      }
    };

    const initialTxMonth = document.getElementById('transactionMonth')?.value;
    if (initialTxMonth) updateTxMonthLabel(initialTxMonth);

    document.getElementById('transactionMonthButton')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentVal = document.getElementById('transactionMonth')?.value || '';
      MonthPicker.open({
        anchorEl: document.getElementById('transactionMonthButton'),
        value: currentVal,
        clearText: 'Todos los meses',
        onChange: (newMonth) => {
          const input = document.getElementById('transactionMonth');
          if (input) {
            input.value = newMonth;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          updateTxMonthLabel(newMonth);
        },
        onClear: () => {
          const input = document.getElementById('transactionMonth');
          if (input) {
            input.value = '';
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
          updateTxMonthLabel('');
        }
      });
    });

    ['typeFilter', 'categoryFilter', 'accountFilter', 'transactionMonth'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', handleFilterChange);
    });

    document.getElementById('clearFilters')?.addEventListener('click', async () => {
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

      updateTxMonthLabel('');
      customDropdownManager.syncAll();

      const TransactionsView = await loadView('transactions');
      TransactionsView?.resetPagination();
      TransactionsView?.render();
    });

    // 11. Exportar e Importar (Lazy Loaded)
    document.getElementById('exportTransactions')?.addEventListener('click', async () => {
      // Exportar solo los filtrados
      const search = document.getElementById('transactionSearch')?.value || '';
      const type = document.getElementById('typeFilter')?.value || 'all';
      const categoryId = document.getElementById('categoryFilter')?.value || 'all';
      const accountId = document.getElementById('accountFilter')?.value || 'all';
      const month = document.getElementById('transactionMonth')?.value || '';

      const queryResult = transactionService.query({
        search, type, categoryId, accountId, month, pageSize: 999999
      });

      const dts = await getDataTransferService();
      dts.exportCSV(queryResult.items);
      Toast.success(`Exportados ${queryResult.items.length} movimientos a CSV.`);
    });

    document.getElementById('exportSidebar')?.addEventListener('click', async () => {
      const dts = await getDataTransferService();
      dts.exportBackupJSON();
      Toast.success('Copia de respaldo JSON descargada.');
    });

    document.getElementById('btnExportJSON')?.addEventListener('click', async () => {
      const dts = await getDataTransferService();
      dts.exportBackupJSON();
      Toast.success('Copia de respaldo JSON descargada.');
    });

    document.getElementById('btnExportCSV')?.addEventListener('click', async () => {
      const dts = await getDataTransferService();
      dts.exportCSV();
      Toast.success('Todos los movimientos exportados a CSV.');
    });

    // Importar JSON
    document.getElementById('jsonFileInput')?.addEventListener('change', e => {
      if (!this.requireAuth()) {
        e.target.value = '';
        return;
      }
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async ev => {
        const dts = await getDataTransferService();
        Modal.confirm(
          '¿Importar copia de respaldo JSON?',
          'Selecciona si deseas reemplazar toda la base de datos o fusionarla con tus registros existentes.',
          () => {
            const res = dts.importBackupJSON(ev.target.result, 'replace');
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
      if (!this.requireAuth()) {
        e.target.value = '';
        return;
      }
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async ev => {
        const dts = await getDataTransferService();
        const parseResult = dts.parseCSV(ev.target.result);
        if (!parseResult.success) {
          Toast.error(parseResult.error);
          return;
        }

        const count = parseResult.transactions.length;
        Modal.confirm(
          `¿Importar ${count} movimientos desde CSV?`,
          `Se encontraron ${count} movimientos válidos en el archivo. ¿Deseas agregarlos a tu historial?`,
          () => {
            dts.commitCSVTransactions(parseResult.transactions);
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
      this.requireAuth(() => {
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
    });

    // 12. Delegación de eventos en clics dinámicos protegida con Auth Guard (Editar, Borrar, Acciones)
    document.addEventListener('click', e => {
      // Movimientos
      const dupTx = e.target.closest('[data-duplicate-transaction]');
      if (dupTx) {
        this.requireAuth(() => {
          const tx = transactionService.getById(dupTx.dataset.duplicateTransaction);
          if (tx) this.openTransactionModal(tx.type, tx, true);
        });
        return;
      }

      const editTx = e.target.closest('[data-edit-transaction]');
      if (editTx) {
        this.requireAuth(() => {
          const tx = transactionService.getById(editTx.dataset.editTransaction);
          if (tx) this.openTransactionModal(tx.type, tx);
        });
        return;
      }

      const delTx = e.target.closest('[data-delete-transaction]');
      if (delTx) {
        this.requireAuth(() => {
          const id = delTx.dataset.deleteTransaction;
          const tx = transactionService.getById(id);
          if (!tx) return;
          Modal.confirm(
            '¿Eliminar movimiento?',
            `Se eliminará “${tx.title}” de tus registros. Podrás deshacer la acción si te equivocas.`,
            () => {
              transactionService.deleteTransaction(id);
              this.renderAll();
              Toast.action(
                `Movimiento “${tx.title}” eliminado`,
                'Deshacer',
                () => {
                  transactionService.restore(id);
                  this.renderAll();
                  Toast.success('Movimiento restaurado exitosamente.');
                },
                6000
              );
            }
          );
        });
        return;
      }

      // Cuentas
      const editAcc = e.target.closest('[data-edit-account]');
      if (editAcc) {
        this.requireAuth(() => {
          const acc = accountService.getById(editAcc.dataset.editAccount);
          if (acc) this.openAccountModal(acc);
        });
        return;
      }

      const delAcc = e.target.closest('[data-delete-account]');
      if (delAcc) {
        this.requireAuth(() => {
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
        });
        return;
      }

      // Alcancías (Pockets)
      const addPocketBtn = e.target.closest('[data-add-pocket]');
      if (addPocketBtn) {
        this.requireAuth(() => {
          const accountId = addPocketBtn.dataset.addPocket;
          this.openPocketModal(accountId);
        });
        return;
      }

      const depositPocketBtn = e.target.closest('[data-pocket-deposit]');
      if (depositPocketBtn) {
        this.requireAuth(() => {
          const [accId, pockId, pockName] = depositPocketBtn.dataset.pocketDeposit.split(':');
          this.openPocketActionModal(accId, pockId, pockName || 'Alcancía', 'deposit');
        });
        return;
      }

      const withdrawPocketBtn = e.target.closest('[data-pocket-withdraw]');
      if (withdrawPocketBtn) {
        this.requireAuth(() => {
          const [accId, pockId, pockName] = withdrawPocketBtn.dataset.pocketWithdraw.split(':');
          this.openPocketActionModal(accId, pockId, pockName || 'Alcancía', 'withdraw');
        });
        return;
      }

      const delPocketBtn = e.target.closest('[data-delete-pocket]');
      if (delPocketBtn) {
        this.requireAuth(() => {
          const [accId, pockId] = delPocketBtn.dataset.deletePocket.split(':');
          Modal.confirm(
            '¿Eliminar alcancía?',
            'Se eliminará este bolsillo de ahorro. Si contiene saldo, se transferirá automáticamente a tu saldo disponible.',
            () => {
              const res = accountService.deletePocket(accId, pockId);
              if (res.success) {
                if (res.releasedBalance > 0) {
                  Toast.success(`Alcancía eliminada. Se reintegraron ${currencyService.format(res.releasedBalance)} a tu saldo disponible.`);
                } else {
                  Toast.success('Alcancía eliminada.');
                }
                this.refreshSelects();
                this.renderAll();
              } else {
                Toast.error(res.error);
              }
            }
          );
        });
        return;
      }

      // Categorías
      const reassignCat = e.target.closest('[data-reassign-category]');
      if (reassignCat) {
        this.requireAuth(() => {
          const id = reassignCat.dataset.reassignCategory;
          this.openReassignCategoryModal(id);
        });
        return;
      }

      const editCat = e.target.closest('[data-edit-category]');
      if (editCat) {
        this.requireAuth(() => {
          const cat = categoryService.getById(editCat.dataset.editCategory);
          if (cat) this.openCategoryModal(cat);
        });
        return;
      }

      const delCat = e.target.closest('[data-delete-category]');
      if (delCat) {
        this.requireAuth(() => {
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
        });
        return;
      }

      // Presupuestos
      const editBgt = e.target.closest('[data-edit-budget]');
      if (editBgt) {
        this.requireAuth(() => {
          const bgt = budgetService.getById(editBgt.dataset.editBudget);
          if (bgt) this.openBudgetModal(bgt);
        });
        return;
      }

      const delBgt = e.target.closest('[data-delete-budget]');
      if (delBgt) {
        this.requireAuth(() => {
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
        });
        return;
      }

      // Recurrentes
      const editRec = e.target.closest('[data-edit-recurring]');
      if (editRec) {
        this.requireAuth(() => {
          const rec = recurringService.getById(editRec.dataset.editRecurring);
          if (rec) this.openRecurringModal(rec);
        });
        return;
      }

      const delRec = e.target.closest('[data-delete-recurring]');
      if (delRec) {
        this.requireAuth(() => {
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
        });
        return;
      }

      const toggleRec = e.target.closest('[data-toggle-recurring]');
      if (toggleRec) {
        this.requireAuth(() => {
          const id = toggleRec.dataset.toggleRecurring;
          recurringService.toggleActive(id);
          this.renderAll();
        });
        return;
      }

      const applyRec = e.target.closest('[data-apply-recurring]');
      if (applyRec) {
        this.requireAuth(() => {
          const id = applyRec.dataset.applyRecurring;
          const res = recurringService.applyToMonth(id, this.selectedMonth);
          if (res.success) {
            Toast.success('Movimiento recurrente registrado en el mes actual.');
            this.renderAll();
          } else {
            Toast.error(res.error);
          }
        });
        return;
      }
    });

    // 13. Atajo de teclado (Ctrl + N o Cmd + N)
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        this.requireAuth(() => this.openTransactionModal());
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

    // 15. Atajos rápidos de fecha (Hoy / Ayer) en modales
    document.addEventListener('click', e => {
      const chip = e.target.closest('.date-chip');
      if (chip) {
        const targetId = chip.dataset.target;
        const targetInput = document.getElementById(targetId);
        if (!targetInput) return;
        const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
        if (chip.dataset.quickDate === 'today') {
          targetInput.value = now.toISOString().slice(0, 10);
        } else if (chip.dataset.quickDate === 'yesterday') {
          now.setDate(now.getDate() - 1);
          targetInput.value = now.toISOString().slice(0, 10);
        }
      }
    });

    // 16. Imprimir o Exportar reporte a PDF
    document.getElementById('btnPrintReport')?.addEventListener('click', () => {
      window.print();
    });
  }
}

// ==========================================================================
// EPIC 5: PWA CORE — Service Worker Nativo & Instalación Multiplataforma (iOS & Android)
// ==========================================================================
let deferredInstallPrompt = null;

// Helpers de detección para dispositivos Apple (iOS / iPadOS) y modo Standalone
const isIos = () => /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
const isInStandaloneMode = () => ('standalone' in window.navigator) && window.navigator.standalone;

function setupPWA() {
  const installBtn = document.getElementById('btnInstallPwa');

  // 1. En iOS Safari, beforeinstallprompt no existe. Si no está instalada, mostramos el botón directamente
  if (isIos() && !isInStandaloneMode()) {
    if (installBtn) {
      installBtn.style.display = 'inline-flex';
    }
  }

  // 2. Registro del Service Worker y notificación de actualizaciones PWA
  if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
      let isRefreshing = false;

      // Escuchar cuando el nuevo SW toma el control para recargar una sola vez
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!isRefreshing) {
          isRefreshing = true;
          window.location.reload();
        }
      });

      const notifyUpdateAvailable = (waitingWorker) => {
        Toast.persistentAction(
          'Nueva versión disponible',
          'Actualizar',
          () => {
            if (waitingWorker) {
              waitingWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        );
      };

      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.log('[PWA] Service Worker registrado exitosamente con alcance:', reg.scope);

          // Si ya hay un worker en espera (waiting)
          if (reg.waiting) {
            notifyUpdateAvailable(reg.waiting);
            return;
          }

          // Si se detecta un nuevo worker actualizándose
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                notifyUpdateAvailable(newWorker);
              }
            });
          });
        })
        .catch(err => {
          console.warn('[PWA] No se pudo registrar el Service Worker:', err);
        });
    });
  }

  // 3. Captura del evento beforeinstallprompt para Android / Chrome / Edge / Desktop
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('[PWA] Evento beforeinstallprompt capturado. Listo para instalación.');

    if (installBtn) {
      installBtn.style.display = 'inline-flex';
    }
  });

  // 4. Manejador de click en el botón de instalación (soporte para iOS y Android/Desktop)
  installBtn?.addEventListener('click', async () => {
    // Flujo específico para iOS / Safari
    if (isIos()) {
      if (isInStandaloneMode()) {
        Toast.info('FinScope ya está ejecutándose como aplicación instalada.');
      } else {
        Toast.info('En iPhone/iPad: Toca el botón "Compartir" en Safari (el cuadro con la flecha hacia arriba) y selecciona "Agregar a la pantalla de inicio".', 6000);
      }
      return;
    }

    // Flujo para Android / Chrome / Chromium Desktop
    if (!deferredInstallPrompt) {
      Toast.info('FinScope ya está instalado o puedes instalarlo desde el menú del navegador (Compartir > Añadir a pantalla de inicio).');
      return;
    }

    try {
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      console.log('[PWA] Elección de instalación del usuario:', choiceResult.outcome);

      if (choiceResult.outcome === 'accepted') {
        Toast.success('¡Instalación iniciada! FinScope aparecerá en tus aplicaciones.');
      }
      deferredInstallPrompt = null;
    } catch (err) {
      console.error('[PWA] Error durante el proceso de instalación:', err);
    }
  });

  // 5. Notificación al completar la instalación
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] FinScope fue instalada en el dispositivo.');
    Toast.success('¡FinScope se instaló correctamente!');
    deferredInstallPrompt = null;
  });
}

// Inicializar la aplicación cuando el DOM esté listo
const app = new App();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    app.init();
    setupPWA();
  });
} else {
  app.init();
  setupPWA();
}

export default app;
