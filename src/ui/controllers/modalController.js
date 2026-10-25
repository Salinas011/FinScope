/**
 * src/ui/controllers/modalController.js
 * Controlador desacoplado para la apertura, poblado, reseteo y control de ciclo de vida
 * de todos los diálogos modales y formularios de FinScope.
 */
import { Modal } from '../modal.js';
import { formatAmountValue } from '../amountFormatter.js';
import { getMaterialIconName } from '../icons.js';
import { currencyService } from '../../services/currencyService.js';
import { categoryService } from '../../services/categoryService.js';
import { accountService } from '../../services/accountService.js';
import { authService } from '../../services/authService.js';
import { store } from '../../core/store.js';

export class ModalController {
  constructor() {
    this.editingTransactionId = null;
    this.editingAccountId = null;
    this.editingPocketId = null;
    this.editingCategoryId = null;
    this.editingBudgetId = null;
    this.editingRecurringId = null;
  }

  /**
   * Abre y prepara el formulario para crear o editar un movimiento (Transacción).
   */
  openTransactionModal(type = 'expense', transaction = null, isDuplicate = false, callbacks = {}) {
    this.editingTransactionId = isDuplicate ? null : (transaction?.id || null);
    const form = document.getElementById('transactionForm');
    if (form) form.reset();

    const titleEl = document.getElementById('transactionModalTitle');
    if (titleEl) {
      titleEl.textContent = (transaction && !isDuplicate) ? 'Editar movimiento' : 'Nuevo movimiento';
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
    if (amountInput) amountInput.value = transaction ? formatAmountValue(currencyService.fromCents(transaction.amount)) : '';
    const localToday = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (dateInput) dateInput.value = (transaction && !isDuplicate) ? (transaction.date || localToday) : localToday;
    if (noteInput) noteInput.value = transaction?.note || '';
    if (methodInput) methodInput.value = transaction?.method || '';

    if (typeof callbacks.refreshSelects === 'function') callbacks.refreshSelects();

    const catSelect = document.getElementById('transactionCategory');
    const accSelect = document.getElementById('transactionAccount');
    if (transaction) {
      if (catSelect && transaction.categoryId) catSelect.value = transaction.categoryId;
      if (accSelect && transaction.accountId) accSelect.value = transaction.accountId;
      if (typeof callbacks.refreshPocketSelect === 'function') callbacks.refreshPocketSelect();
      const pocketSelect = document.getElementById('transactionPocket');
      if (pocketSelect && transaction.pocketId) {
        pocketSelect.value = transaction.pocketId;
      }
    } else {
      if (catSelect) catSelect.value = '';
    }

    const recCheck = document.getElementById('transactionRecurringCheck');
    if (recCheck) recCheck.checked = false;
    const recGroup = document.getElementById('transactionRecurringGroup');
    if (recGroup) recGroup.style.display = (transaction && !isDuplicate) ? 'none' : 'block';

    const submitBtn = document.querySelector('#transactionForm button[type=submit]');
    if (submitBtn) {
      submitBtn.innerHTML = (transaction && !isDuplicate)
        ? 'Guardar cambios <span class="material-symbols-rounded" style="font-size: 15px; vertical-align: middle;">arrow_forward</span>'
        : 'Guardar movimiento <span class="material-symbols-rounded" style="font-size: 15px; vertical-align: middle;">arrow_forward</span>';
    }

    Modal.open('#transactionModal');
  }

  /**
   * Abre y prepara el formulario para crear o editar una Cuenta o Billetera.
   */
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
    if (balanceInput) balanceInput.value = account?.initialBalance ? formatAmountValue(currencyService.fromCents(account.initialBalance)) : 0;
    if (colorInput) colorInput.value = account?.color || '#18181b';
    if (iconInput) iconInput.value = getMaterialIconName(account?.icon, 'account_balance');

    Modal.open('#accountModal');
  }

  /**
   * Abre y prepara el formulario para crear o editar una Alcancía (Pocket).
   */
  openPocketModal(accountId, pocket = null) {
    this.editingPocketId = pocket?.id || null;
    const form = document.getElementById('pocketForm');
    if (form) form.reset();

    const accIdInput = document.getElementById('pocketAccountId');
    const pockIdInput = document.getElementById('editingPocketId');
    if (accIdInput) accIdInput.value = accountId;
    if (pockIdInput) pockIdInput.value = pocket?.id || '';

    const title = document.getElementById('pocketModalTitle');
    if (title) title.textContent = pocket ? 'Editar alcancía' : 'Nueva alcancía';

    const nameInput = document.getElementById('pocketName');
    const targetInput = document.getElementById('pocketTargetAmount');
    const colorInput = document.getElementById('pocketColor');
    const iconInput = document.getElementById('pocketIcon');

    if (nameInput) nameInput.value = pocket?.name || '';
    if (targetInput) targetInput.value = pocket?.targetAmount ? formatAmountValue(currencyService.fromCents(pocket.targetAmount)) : '';
    if (colorInput) colorInput.value = pocket?.color || '#3f3f46';
    if (iconInput) iconInput.value = pocket?.icon || 'savings';

    Modal.open('#pocketModal');
  }

  /**
   * Abre y prepara el diálogo de acción de alcancía (Meter o Sacar dinero).
   */
  openPocketActionModal(accountId, pocketId, pocketName, mode = 'deposit') {
    const form = document.getElementById('pocketActionForm');
    if (form) form.reset();

    const accIdInput = document.getElementById('pocketActionAccountId');
    const pockIdInput = document.getElementById('pocketActionPocketId');
    const modeInput = document.getElementById('pocketActionMode');

    if (accIdInput) accIdInput.value = accountId;
    if (pockIdInput) pockIdInput.value = pocketId;
    if (modeInput) modeInput.value = mode;

    const titleEl = document.getElementById('pocketActionModalTitle');
    const subtitleEl = document.getElementById('pocketActionSubtitle');
    const submitBtn = document.getElementById('pocketActionSubmitBtn');

    const fundingGroup = document.getElementById('pocketFundingSourceGroup');
    if (fundingGroup) {
      fundingGroup.style.display = mode === 'deposit' ? 'block' : 'none';
      const defaultRadio = document.querySelector('input[name="pocketFundingSource"][value="available"]');
      if (defaultRadio) defaultRadio.checked = true;
    }

    if (mode === 'deposit') {
      if (titleEl) titleEl.textContent = `Meter dinero a "${pocketName}"`;
      if (subtitleEl) subtitleEl.textContent = 'Mueve dinero desde tu disponible o añade fondeo inicial a esta alcancía.';
      if (submitBtn) submitBtn.textContent = 'Asignar a alcancía';
    } else {
      if (titleEl) titleEl.textContent = `Sacar dinero de "${pocketName}"`;
      if (subtitleEl) subtitleEl.textContent = 'Retira dinero desde esta alcancía hacia tu saldo disponible.';
      if (submitBtn) submitBtn.textContent = 'Retirar a disponible';
    }

    Modal.open('#pocketActionModal');
  }

  /**
   * Abre y prepara el diálogo de transferencias entre cuentas.
   */
  openTransferModal(callbacks = {}) {
    const form = document.getElementById('transferForm');
    if (form) form.reset();

    const dateInput = document.getElementById('transferDate');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

    if (typeof callbacks.refreshSelects === 'function') callbacks.refreshSelects();
    Modal.open('#transferModal');
  }

  /**
   * Abre y prepara el diálogo para crear o editar una Categoría.
   */
  openCategoryModal(category = null, defaultType = 'expense') {
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
    if (typeInput) typeInput.value = category?.type || defaultType;
    if (colorInput) colorInput.value = category?.color || '#52525b';
    if (iconInput) iconInput.value = getMaterialIconName(category?.icon, 'category');

    Modal.open('#categoryModal');
  }

  /**
   * Abre y prepara el diálogo de presupuestos mensuales.
   */
  openBudgetModal(budget = null, callbacks = {}) {
    this.editingBudgetId = budget?.id || null;
    const form = document.getElementById('budgetForm');
    if (form) form.reset();

    const title = document.getElementById('budgetModalTitle');
    if (title) title.textContent = budget ? 'Editar presupuesto' : 'Crear presupuesto';

    if (typeof callbacks.refreshSelects === 'function') callbacks.refreshSelects();

    const idInput = document.getElementById('editingBudgetId');
    const catSelect = document.getElementById('budgetCategory');
    const limitInput = document.getElementById('budgetLimit');
    const noteInput = document.getElementById('budgetNote');

    if (idInput) idInput.value = budget?.id || '';
    if (catSelect) catSelect.value = budget ? budget.categoryId : '';
    if (limitInput) limitInput.value = budget?.limit ? formatAmountValue(currencyService.fromCents(budget.limit)) : '';
    if (noteInput) noteInput.value = budget?.note || '';

    Modal.open('#budgetModal');
  }

  /**
   * Abre y prepara el diálogo de transacciones recurrentes / gastos fijos.
   */
  openRecurringModal(recurring = null, callbacks = {}) {
    this.editingRecurringId = recurring?.id || null;
    const form = document.getElementById('recurringForm');
    if (form) form.reset();

    const title = document.getElementById('recurringModalTitle');
    if (title) title.textContent = recurring ? 'Editar recurrente' : 'Nueva suscripción o gasto fijo';

    if (typeof callbacks.refreshSelects === 'function') callbacks.refreshSelects();

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
    if (amountInput) amountInput.value = recurring?.amount ? formatAmountValue(currencyService.fromCents(recurring.amount)) : '';
    if (freqSelect) freqSelect.value = recurring?.frequency || 'monthly';
    if (dayInput) dayInput.value = recurring?.dueDay || 1;
    if (catSelect) catSelect.value = recurring ? recurring.categoryId : '';
    if (accSelect && recurring) accSelect.value = recurring.accountId;
    if (noteInput) noteInput.value = recurring?.note || '';

    Modal.open('#recurringModal');
  }

  /**
   * Abre el diálogo de reasignación de saldo/movimientos entre categorías.
   * @param {string} sourceCategoryId
   */
  openReassignCategoryModal(sourceCategoryId) {
    const cat = categoryService.getById(sourceCategoryId);
    if (!cat) return;

    const activeTxs = (store.transactions || []).filter(t => !t.deletedAt && t.categoryId === sourceCategoryId);
    const count = activeTxs.length;
    const totalCents = activeTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    const form = document.getElementById('reassignCategoryForm');
    if (form) form.reset();

    const sourceIdInput = document.getElementById('reassignSourceCategoryId');
    const sourceNameEl = document.getElementById('reassignSourceCategoryName');
    const sourceCountEl = document.getElementById('reassignSourceCountText');
    const sourceBalanceEl = document.getElementById('reassignSourceBalanceText');
    const targetSelect = document.getElementById('reassignTargetCategory');
    const amountInput = document.getElementById('reassignAmount');
    const validationMsg = document.getElementById('reassignValidationMsg');
    const submitBtn = document.getElementById('reassignSubmitBtn');

    if (sourceIdInput) sourceIdInput.value = sourceCategoryId;
    if (sourceNameEl) sourceNameEl.textContent = `${cat.name} · ${cat.type === 'income' ? 'Ingreso' : 'Gasto'}`;
    if (sourceCountEl) {
      sourceCountEl.textContent = `${count} ${count === 1 ? 'movimiento activo' : 'movimientos activos'}`;
    }
    if (sourceBalanceEl) {
      sourceBalanceEl.textContent = currencyService.format(totalCents);
    }

    if (targetSelect) {
      const candidates = categoryService.getAll().filter(c => c.id !== sourceCategoryId && c.type === cat.type);
      targetSelect.innerHTML = '<option value="" disabled selected hidden>Selecciona una categoría de destino...</option>' +
        candidates.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      targetSelect.value = '';
    }

    if (amountInput) {
      amountInput.value = '';
    }

    if (validationMsg) {
      validationMsg.style.display = 'none';
      validationMsg.textContent = '';
    }

    const updateSubmitState = () => {
      const targetId = targetSelect?.value;
      const targetCat = targetId ? categoryService.getById(targetId) : null;
      const amountVal = amountInput?.value || '';
      const cents = currencyService.toCents(amountVal);

      if (validationMsg) {
        validationMsg.style.display = 'none';
        validationMsg.textContent = '';
      }

      if (totalCents <= 0) {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Sin saldo disponible para mover';
        }
        if (validationMsg) {
          validationMsg.textContent = 'Esta categoría no tiene movimientos activos con saldo para transferir.';
          validationMsg.style.display = 'block';
        }
        return;
      }

      if (!targetId) {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Selecciona una categoría de destino';
        }
        return;
      }

      if (cents <= 0) {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Ingresa un valor a mover';
        }
        return;
      }

      if (cents > totalCents) {
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = 'Monto supera el disponible';
        }
        if (validationMsg) {
          validationMsg.textContent = `El valor no puede superar el total disponible de la categoría (${currencyService.format(totalCents)}).`;
          validationMsg.style.display = 'block';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = `Mover ${currencyService.format(cents)} a ${targetCat?.name || 'Destino'}`;
      }
    };

    targetSelect?.addEventListener('change', updateSubmitState);
    amountInput?.addEventListener('input', updateSubmitState);

    updateSubmitState();
    Modal.open('#reassignCategoryModal');
  }

  /**
   * Abre el modal de perfil de usuario y autenticación Google.
   */
  openUserProfileModal() {
    Modal.open('#userProfileModal');
    if (!authService.isAuthenticated()) {
      setTimeout(() => {
        authService.initGoogleAuth(['googleBtnModal', 'googleBtnSettings', 'googleBtnContainer']);
      }, 80);
    }
  }

  /**
   * Cierra todos los modales abiertos en la vista.
   */
  closeAll() {
    Modal.closeAll();
  }
}

export const modalController = new ModalController();
