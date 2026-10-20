/**
 * EventBus ligero basado en el patrón Pub/Sub para desacoplar componentes.
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Suscribe una función a un evento.
   * @param {string} event Nombre del evento.
   * @param {Function} callback Función a ejecutar.
   * @returns {Function} Función para cancelar la suscripción.
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  /**
   * Desuscribe una función de un evento.
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emite un evento con datos asociados a todos los oyentes.
   */
  emit(event, payload) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`Error en listener del evento "${event}":`, error);
        }
      });
    }
  }

  /**
   * Limpia todos los oyentes de un evento o de todos los eventos.
   */
  clear(event) {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

export const eventBus = new EventBus();
