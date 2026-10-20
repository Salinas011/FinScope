/**
 * Módulo de almacenamiento con soporte para migración de esquemas y validación.
 */
import {
  STORAGE_KEY_V2,
  STORAGE_KEY_V1,
  APP_VERSION,
  DEFAULT_CATEGORIES,
  DEFAULT_ACCOUNTS
} from './constants.js';

export class StorageService {
  /**
   * Genera el estado en blanco por defecto con el esquema v2.
   */
  static getBlankState() {
    return {
      version: APP_VERSION,
      currency: 'COP',
      theme: 'light',
      accounts: structuredClone(DEFAULT_ACCOUNTS),
      categories: structuredClone(DEFAULT_CATEGORIES),
      transactions: [],
      budgets: [],
      recurring: [],
      settings: {
        dateFormat: 'es-CO',
        pageSize: 25
      }
    };
  }

  /**
   * Carga el estado actual aplicando migraciones si es necesario.
   */
  static load() {
    try {
      if (typeof localStorage === 'undefined') {
        return this.getBlankState();
      }

      // 1. Intentar cargar v2
      const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
      if (rawV2) {
        const parsed = JSON.parse(rawV2);
        return this.normalizeState(parsed);
      }

      // 2. Comprobar si existe v1 para migrar
      const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
      if (rawV1) {
        const parsedV1 = JSON.parse(rawV1);
        const migrated = this.migrateV1ToV2(parsedV1);
        this.save(migrated);
        return migrated;
      }

      // 3. Si no existe ninguno, retornar estado en blanco
      const blank = this.getBlankState();
      this.save(blank);
      return blank;
    } catch (error) {
      console.warn('Error cargando datos de almacenamiento. Se usará estado por defecto.', error);
      return this.getBlankState();
    }
  }

  /**
   * Guarda el estado en almacenamiento persistente.
   */
  static save(state) {
    try {
      if (typeof localStorage === 'undefined') {
        return { success: true };
      }
      const serialized = JSON.stringify(state);
      localStorage.setItem(STORAGE_KEY_V2, serialized);
      return { success: true };
    } catch (error) {
      console.error('Error al persistir estado en localStorage:', error);
      return {
        success: false,
        error: error.name === 'QuotaExceededError'
          ? 'El almacenamiento del navegador está lleno.'
          : 'No se pudieron guardar los cambios localmente.'
      };
    }
  }

  /**
   * Migra datos del esquema V1 (monolítico anterior) al esquema V2 escalable.
   */
  static migrateV1ToV2(v1Data) {
    const blank = this.getBlankState();
    if (!v1Data || typeof v1Data !== 'object') return blank;

    const defaultBank = blank.accounts.find(a => a.id === 'acc-bank') || blank.accounts[0];

    // Asegurar que cada transacción existente tenga un accountId válido
    const migratedTransactions = Array.isArray(v1Data.transactions)
      ? v1Data.transactions.map(t => ({
          ...t,
          accountId: t.accountId || defaultBank.id,
          type: t.type || 'expense',
          amount: Number(t.amount) || 0,
          createdAt: t.createdAt || Date.now()
        }))
      : [];

    return {
      ...blank,
      theme: v1Data.theme || 'light',
      categories: Array.isArray(v1Data.categories) && v1Data.categories.length > 0
        ? v1Data.categories
        : blank.categories,
      transactions: migratedTransactions,
      budgets: Array.isArray(v1Data.budgets) ? v1Data.budgets : [],
      recurring: [],
      version: APP_VERSION
    };
  }

  /**
   * Normaliza y rellena propiedades faltantes para garantizar integridad del esquema.
   */
  static normalizeState(state) {
    const blank = this.getBlankState();
    if (!state || typeof state !== 'object') return blank;

    const oldColorsMap = {
      '#3e8bd8': '#3f3f46',
      '#0fae83': '#52525b',
      '#ed8c55': '#64748b',
      '#8176e8': '#71717a',
      '#e35d78': '#57534e',
      '#13a9b7': '#78716c',
      '#c49a31': '#475569'
    };

    const oldIconsMap = {
      '⌂': 'home',
      '✦': 'restaurant',
      '↗': 'directions_car',
      '▤': 'receipt_long',
      '♡': 'celebration',
      '◇': 'shopping_bag',
      '✚': 'medical_services',
      '◎': 'more_horiz',
      '↓': 'payments',
      '↶': 'replay',
      '◈': 'category',
      '💵': 'payments',
      '🏦': 'account_balance',
      '💳': 'credit_card',
      '📱': 'smartphone',
      '💎': 'diamond',
      '🪙': 'monetization_on',
      '💼': 'business_center',
      '🐾': 'pets',
      '🎮': 'sports_esports',
      '✈️': 'flight',
      '🎓': 'school'
    };

    const categories = (Array.isArray(state.categories) && state.categories.length > 0 ? state.categories : blank.categories)
      .map(c => ({
        ...c,
        color: oldColorsMap[c.color] || c.color,
        icon: oldIconsMap[c.icon] || c.icon || 'category'
      }));

    const accounts = (Array.isArray(state.accounts) && state.accounts.length > 0 ? state.accounts : blank.accounts)
      .map(a => ({
        ...a,
        color: oldColorsMap[a.color] || a.color,
        icon: oldIconsMap[a.icon] || a.icon || 'account_balance_wallet'
      }));

    return {
      version: APP_VERSION,
      currency: state.currency || blank.currency,
      theme: state.theme || blank.theme,
      accounts,
      categories,
      transactions: Array.isArray(state.transactions) ? state.transactions : [],
      budgets: Array.isArray(state.budgets) ? state.budgets : [],
      recurring: Array.isArray(state.recurring) ? state.recurring : [],
      settings: { ...blank.settings, ...(state.settings || {}) }
    };
  }

  /**
   * Limpia y resetea a los datos de fábrica.
   */
  static reset() {
    localStorage.removeItem(STORAGE_KEY_V2);
    localStorage.removeItem(STORAGE_KEY_V1);
    return this.getBlankState();
  }
}
