/**
 * Almacén reactivo de estado global centralizado (Single Source of Truth).
 */
import { StorageService } from './storage.js';
import { eventBus } from './eventBus.js';

class Store {
  constructor() {
    this._state = StorageService.load();
    this._subscribers = new Set();
  }

  /**
   * Obtiene una copia de sólo lectura del estado.
   */
  getState() {
    return this._state;
  }

  get transactions() {
    return this._state.transactions;
  }

  get accounts() {
    return this._state.accounts;
  }

  get categories() {
    return this._state.categories;
  }

  get budgets() {
    return this._state.budgets;
  }

  get recurring() {
    return this._state.recurring;
  }

  get currency() {
    return this._state.currency || 'COP';
  }

  get theme() {
    return this._state.theme || 'light';
  }

  get settings() {
    return this._state.settings;
  }

  /**
   * Actualiza una porción del estado de forma inmutable y persiste.
   * @param {Object|Function} updater Objeto parcial o función que recibe estado previo.
   * @param {string} [actionTag] Etiqueta opcional para depuración o eventos selectivos.
   */
  setState(updater, actionTag = 'state:updated') {
    const prevState = this._state;
    const partial = typeof updater === 'function' ? updater(prevState) : updater;

    this._state = {
      ...prevState,
      ...partial
    };

    // Persistir
    const saveResult = StorageService.save(this._state);
    if (!saveResult.success) {
      eventBus.emit('error:storage', saveResult.error);
    }

    // Notificar a observadores generales
    this._notifySubscribers(this._state, prevState);

    // Emitir en el bus de eventos
    eventBus.emit(actionTag, { state: this._state, prevState });
    eventBus.emit('state:changed', { state: this._state, actionTag });
  }

  /**
   * Suscribe una función para escuchar cambios de estado.
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
        console.error('Error en suscriptor del Store:', err);
      }
    });
  }

  /**
   * Reemplaza el estado completamente (por ejemplo al importar un respaldo).
   */
  replaceState(newState) {
    const normalized = StorageService.normalizeState(newState);
    this._state = normalized;
    StorageService.save(this._state);
    this._notifySubscribers(this._state);
    eventBus.emit('state:replaced', this._state);
    eventBus.emit('state:changed', { state: this._state, actionTag: 'state:replaced' });
  }

  /**
   * Restablece los datos de fábrica.
   */
  reset() {
    this._state = StorageService.reset();
    this._notifySubscribers(this._state);
    eventBus.emit('state:reset', this._state);
    eventBus.emit('state:changed', { state: this._state, actionTag: 'state:reset' });
  }
}

export const store = new Store();
