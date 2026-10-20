/**
 * Controlador de modales y diálogos de confirmación accesibles.
 */
export class Modal {
  static currentConfirmAction = null;
  static previousActiveElement = null;

  static init() {
    // Cerrar al pulsar Escape y atrapar foco con Tab
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.closeAll();
        return;
      }

      if (e.key === 'Tab') {
        const activeModal = document.querySelector('.modal-backdrop:not(.hidden), .confirm-backdrop:not(.hidden)');
        if (!activeModal) return;

        const focusables = Array.from(
          activeModal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
        ).filter(el => el.offsetParent !== null);

        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Cerrar al hacer clic en el backdrop
    document.addEventListener('mousedown', e => {
      if (e.target.classList.contains('modal-backdrop') || e.target.classList.contains('confirm-backdrop')) {
        this.closeAll();
      }
    });

    // Botones con data-close-modal
    document.addEventListener('click', e => {
      if (e.target.closest('[data-close-modal]')) {
        this.closeAll();
      }
    });

    // Botón aceptar confirmación
    const confirmAccept = document.getElementById('confirmAccept');
    if (confirmAccept) {
      confirmAccept.addEventListener('click', () => {
        const action = this.currentConfirmAction;
        this.closeAll();
        if (typeof action === 'function') {
          action();
        }
      });
    }

    const confirmCancel = document.getElementById('confirmCancel');
    if (confirmCancel) {
      confirmCancel.addEventListener('click', () => this.closeAll());
    }
  }

  /**
   * Abre un modal por su selector CSS.
   */
  static open(selector) {
    const el = document.querySelector(selector);
    if (!el) return;

    this.previousActiveElement = document.activeElement;

    el.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');

    // Autofocus en el primer campo interactivo
    const firstInput = el.querySelector('input:not([type=hidden]), select, textarea, button:not(.close-modal)');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 80);
    }
  }

  /**
   * Cierra todos los modales abiertos.
   */
  static closeAll() {
    document.querySelectorAll('.modal-backdrop, .confirm-backdrop').forEach(modal => {
      modal.classList.add('hidden');
    });
    document.body.style.overflow = '';
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    this.currentConfirmAction = null;

    if (this.previousActiveElement && typeof this.previousActiveElement.focus === 'function') {
      try {
        this.previousActiveElement.focus();
      } catch (_) {}
      this.previousActiveElement = null;
    }
  }

  /**
   * Muestra un diálogo de confirmación seguro.
   */
  static confirm(title, message, onConfirm, { confirmText = 'Eliminar', isDanger = true } = {}) {
    const titleEl = document.getElementById('confirmTitle');
    const msgEl = document.getElementById('confirmMessage');
    const acceptBtn = document.getElementById('confirmAccept');
    const modalEl = document.getElementById('confirmModal');

    if (!modalEl || !titleEl || !msgEl || !acceptBtn) {
      if (window.confirm(`${title}\n\n${message}`)) {
        onConfirm();
      }
      return;
    }

    this.previousActiveElement = document.activeElement;

    titleEl.textContent = title;
    msgEl.textContent = message;
    acceptBtn.textContent = confirmText;
    acceptBtn.className = isDanger ? 'danger-button' : 'primary-button';

    this.currentConfirmAction = onConfirm;
    modalEl.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  }
}
