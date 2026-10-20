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
        document.body.appendChild(this.container);
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

  static success(msg) {
    this.show(msg, 'success');
  }

  static error(msg) {
    this.show(msg, 'error', 4200);
  }

  static info(msg) {
    this.show(msg, 'info');
  }
}
