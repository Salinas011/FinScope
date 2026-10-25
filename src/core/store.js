/**
 * src/core/store.js
 * Almacén reactivo de estado global centralizado v3 (Single Source of Truth).
 * Soporta hidratación asíncrona mediante IndexedDB, Safe Math, alcancías (pockets)
 * y arquitectura reactiva orientada a eventos.
 */
import { StorageService } from './storage.js';
import { eventBus } from './eventBus.js';

class Store {
  constructor() {
    // Inicialización síncrona segura con estado en blanco v3 para evitar errores de renderizado
    this._state = StorageService.getBlankState();
    this._isHydrated = false;
    this._subscribers = new Set();
    this._writeQueue = Promise.resolve();
  }

  /**
   * Hidrata el almacén de forma asíncrona desde IndexedDB
   * y ejecuta las migraciones si existen versiones previas.
   * Notifica a la aplicación a través de eventBus ('store:hydrated' y 'app:ready').
   * @returns {Promise<Object>}
   */
  async init() {
    try {
      const persistedState = await StorageService.init();
      this._state = persistedState;
      this._isHydrated = true;

      // Notificar a todos los suscriptores reactivos registrados
      this._notifySubscribers(this._state);

      // Emisión de eventos para main.js y servicios externos
      eventBus.emit('store:hydrated', this._state);
      eventBus.emit('app:ready', this._state);

      console.log('[Store] Hidratación v3 completada exitosamente desde IndexedDB.');
      return this._state;
    } catch (error) {
      console.error('[Store] Error durante la hidratación del Store:', error);
      eventBus.emit('error:storage', 'Error inicializando almacenamiento local IndexedDB.');
      return this._state;
    }
  }

  /**
   * Indica si el almacén ya completó su hidratación inicial desde la base de datos.
   * @returns {boolean}
   */
  get isHydrated() {
    return this._isHydrated;
  }

  /**
   * Obtiene una copia del estado completo.
   * @returns {Object}
   */
  getState() {
    return this._state;
  }

  get transactions() {
    return this._state.transactions || [];
  }

  get accounts() {
    return this._state.accounts || [];
  }

  get categories() {
    return this._state.categories || [];
  }

  get budgets() {
    return this._state.budgets || [];
  }

  get recurring() {
    return this._state.recurring || [];
  }

  get currency() {
    return this._state.currency || 'COP';
  }

  get theme() {
    return this._state.theme || 'light';
  }

  get settings() {
    return this._state.settings || { dateFormat: 'es-CO', pageSize: 25 };
  }

  get isPrivacyMode() {
    return !!this._state.isPrivacyMode;
  }

  /**
   * Alterna el modo de privacidad para ocultar/mostrar saldos con asteriscos.
   * @returns {boolean} Nuevo estado
   */
  togglePrivacyMode() {
    const nextVal = !this.isPrivacyMode;
    this.setState({ isPrivacyMode: nextVal }, 'privacy:toggled');
    return nextVal;
  }

  /**
   * Actualiza una porción del estado de forma inmutable y persiste en IndexedDB.
   * @param {Object|Function} updater Objeto parcial o función que recibe el estado previo.
   * @param {string} [actionTag='state:updated'] Etiqueta semántica para auditoría y observadores.
   */
  setState(updater, actionTag = 'state:updated') {
    const prevState = this._state;
    const partial = typeof updater === 'function' ? updater(prevState) : updater;

    this._state = {
      ...prevState,
      ...partial
    };

    // Persistencia asíncrona serializada FIFO en IndexedDB
    this._writeQueue = this._writeQueue
      .then(() => StorageService.saveState(this._state))
      .then(result => {
        if (result && !result.success) {
          eventBus.emit('error:storage', result.error);
        }
      })
      .catch(err => {
        console.error('[Store] Error guardando estado en IndexedDB:', err);
        eventBus.emit('error:storage', 'No se pudieron guardar los cambios en la base de datos.');
      });

    // 1. Notificar a observadores síncronos de la UI
    this._notifySubscribers(this._state, prevState);

    // 2. Emitir eventos en el EventBus para sincronización y log
    eventBus.emit(actionTag, { state: this._state, prevState });
    eventBus.emit('state:changed', { state: this._state, actionTag });
  }

  /**
   * Suscribe una función para escuchar cambios de estado.
   * @param {Function} callback
   * @returns {Function} Desuscriptor
   */
  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  _notifySubscribers(state, prevState) {
    this._subscribers.forEach(cb => {
      try {
        cb(state, prevState);
      } catch (err) {
        console.error('[Store] Error en callback de suscriptor:', err);
      }
    });
  }

  /**
   * Reemplaza el estado completamente (ej. al restaurar respaldo JSON o sincronizar nube).
   * @param {Object} newState
   */
  async replaceState(newState) {
    const blank = StorageService.getBlankState();
    this._state = {
      ...blank,
      ...newState,
      version: 3
    };

    this._writeQueue = this._writeQueue
      .then(() => StorageService.saveState(this._state))
      .then(result => {
        if (result && !result.success) {
          eventBus.emit('error:storage', result.error);
        }
      })
      .catch(err => {
        console.error('[Store] Error guardando estado en IndexedDB:', err);
        eventBus.emit('error:storage', 'No se pudieron guardar los cambios en la base de datos.');
      });

    await this._writeQueue;
    this._notifySubscribers(this._state);
    eventBus.emit('state:replaced', this._state);
    eventBus.emit('state:changed', { state: this._state, actionTag: 'state:replaced' });
  }

  /**
   * Restablece los datos de fábrica vaciando IndexedDB y retornando al estado v3 en blanco.
   */
  async reset() {
    this._state = await StorageService.reset();
    this._notifySubscribers(this._state);
    eventBus.emit('state:reset', this._state);
    eventBus.emit('state:changed', { state: this._state, actionTag: 'state:reset' });
  }

  /**
   * Borra por completo la base de datos IndexedDB local por privacidad en el cierre de sesión,
   * y reestablece un estado en blanco en la memoria sin recargar abruptamente la página.
   * Si el usuario registra nuevos movimientos deslogueado, se creará una base local nueva (Guest Mode).
   */
  async clearForGuestMode() {
    await StorageService.deleteDatabase();
    this._state = StorageService.getBlankState();
    this._isHydrated = true;
    this._notifySubscribers(this._state);
    eventBus.emit('state:reset', this._state);
    eventBus.emit('state:changed', { state: this._state, actionTag: 'auth:guest_mode' });
    console.log('[Store] Estado local reseteado en memoria para Modo Invitado.');
  }
}

export const store = new Store();
