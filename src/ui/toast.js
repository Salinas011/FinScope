/**
 * Sistema de notificaciones Toast dinámicas y accesibles.
 */
export class Toast {
  static container = null;

  static init() {
    if (!this.container) {
      this.container = document.getElementById('toastRegion');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toastRegion';
        this.container.className = 'toast-region';
        this.container.setAttribute('aria-live', 'polite');
        this.container.setAttribute('role', 'status');
        this.container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(this.container);
      } else {
        if (!this.container.hasAttribute('role')) this.container.setAttribute('role', 'status');
        if (!this.container.hasAttribute('aria-atomic')) this.container.setAttribute('aria-atomic', 'true');
      }
    }
  }

  /**
   * Muestra un mensaje emergente.
   * @param {string} message Mensaje de la notificación.
   * @param {'success'|'error'|'info'} [type='success'] Tipo de notificación.
   * @param {number} [duration=3000] Tiempo en pantalla en ms.
   */
  static show(message, type = 'success', duration = 3200) {
    this.init();

    const node = document.createElement('div');
    node.className = `toast ${type === 'error' ? 'error' : type === 'info' ? 'info' : ''}`;
    node.setAttribute('role', type === 'error' ? 'alert' : 'status');
    node.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    const iconName = type === 'error' ? 'error' : type === 'info' ? 'info' : 'check';
    const escaped = String(message).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    node.innerHTML = `
      <span class="toast-mark"><span class="material-symbols-rounded">${iconName}</span></span>
      <span class="toast-text">${escaped}</span>
    `;

    this.container.appendChild(node);

    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(8px)';
      setTimeout(() => node.remove(), 250);
    }, duration);
  }

  static success(msg, duration = 3200) {
    this.show(msg, 'success', duration);
  }

  static error(msg, duration = 4200) {
    this.show(msg, 'error', duration);
  }

  static info(msg, duration = 3200) {
    this.show(msg, 'info', duration);
  }

  /**
   * Muestra un toast con botón de acción (ej. Deshacer) con temporizador automático.
   * @param {string} message Mensaje de la notificación.
   * @param {string} actionText Texto del botón de acción (ej. 'Deshacer').
   * @param {Function} onAction Acción a ejecutar al pulsar el botón.
   * @param {number} [duration=6000] Tiempo antes de expirar la acción.
   */
  static action(message, actionText, onAction, duration = 6000) {
    this.init();

    const node = document.createElement('div');
    node.className = 'toast info toast-actionable';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');

    const escaped = String(message).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
    const escapedBtn = String(actionText).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    node.innerHTML = `
      <span class="toast-mark"><span class="material-symbols-rounded">undo</span></span>
      <span class="toast-text">${escaped}</span>
      <button type="button" class="toast-action-btn undo-btn">${escapedBtn}</button>
    `;

    let timer = null;
    const btn = node.querySelector('.toast-action-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        clearTimeout(timer);
        try {
          if (typeof onAction === 'function') onAction();
        } finally {
          node.style.opacity = '0';
          node.style.transform = 'translateY(8px)';
          setTimeout(() => node.remove(), 250);
        }
      });
    }

    this.container.appendChild(node);

    timer = setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(8px)';
      setTimeout(() => node.remove(), 250);
    }, duration);

    return node;
  }

  /**
   * Muestra una notificación persistente con un botón de acción accionable.
   * @param {string} message Mensaje de la notificación.
   * @param {string} actionText Texto del botón.
   * @param {Function} onAction Acción a ejecutar al pulsar el botón.
   * @returns {HTMLElement}
   */
  static persistentAction(message, actionText, onAction) {
    this.init();

    const node = document.createElement('div');
    node.className = 'toast info toast-persistent';
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');

    const escaped = String(message).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
    const escapedBtn = String(actionText).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    node.innerHTML = `
      <span class="toast-mark"><span class="material-symbols-rounded">system_update</span></span>
      <span class="toast-text">${escaped}</span>
      <button type="button" class="toast-action-btn">${escapedBtn}</button>
    `;

    const btn = node.querySelector('.toast-action-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        try {
          if (typeof onAction === 'function') onAction();
        } finally {
          node.style.opacity = '0';
          node.style.transform = 'translateY(8px)';
          setTimeout(() => node.remove(), 250);
        }
      });
    }

    this.container.appendChild(node);
    return node;
  }
}

