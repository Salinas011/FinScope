/**
 * Controlador de modales y diálogos de confirmación accesibles.
 */
export class Modal {
  static currentConfirmAction = null;

  static init() {
    // Cerrar al pulsar Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.closeAll();
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

    el.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Autofocus en el primer campo interactivo
    const firstInput = el.querySelector('input:not([type=hidden]), select, textarea, button:not(.close-modal)');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 60);
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
    this.currentConfirmAction = null;
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

    titleEl.textContent = title;
    msgEl.textContent = message;
    acceptBtn.textContent = confirmText;
    acceptBtn.className = isDanger ? 'danger-button' : 'primary-button';

    this.currentConfirmAction = onConfirm;
    modalEl.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
}
