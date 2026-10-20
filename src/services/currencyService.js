/**
 * src/services/currencyService.js
 * Servicio de moneda, formato numérico internacional y utilidades Safe Math en centavos.
 */
import { SUPPORTED_CURRENCIES } from '../core/constants.js';
import { store } from '../core/store.js';

class CurrencyService {
  /**
   * Obtiene la configuración de la moneda activa actual.
   * @returns {Object}
   */
  getCurrencyConfig() {
    const code = store.currency || 'COP';
    return SUPPORTED_CURRENCIES[code] || SUPPORTED_CURRENCIES.COP;
  }

  /**
   * Convierte un valor flotante o string ingresado por el usuario a un entero en centavos (base 100).
   * Erradica problemas de precisión IEEE 754.
   * Ejemplos: 15.5 -> 1550, "10,25" -> 1025, 50000 -> 5000000.
   * @param {number|string} value
   * @returns {number} Entero en centavos.
   */
  toCents(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return 0;
      return Math.round(value * 100);
    }

    // Normalizar string: quitar espacios y signos de moneda
    let clean = String(value).trim().replace(/[$€£S\/\s]/g, '');
    
    // Si contiene comas y puntos, determinar cuál es separador decimal
    const hasComma = clean.includes(',');
    const hasDot = clean.includes('.');

    if (hasComma && hasDot) {
      // Formato latino/europeo (1.234,56) vs anglosajón (1,234.56)
      if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
      } else {
        clean = clean.replace(/,/g, '');
      }
    } else if (hasComma) {
      clean = clean.replace(',', '.');
    }

    const num = parseFloat(clean);
    if (isNaN(num) || !Number.isFinite(num)) return 0;
    return Math.round(num * 100);
  }

  /**
   * Convierte un entero en centavos a su valor decimal correspondiente en unidades mayores.
   * Ej: 1550 -> 15.5
   * @param {number} cents
   * @returns {number}
   */
  fromCents(cents) {
    const num = Number(cents);
    if (!Number.isFinite(num)) return 0;
    return num / 100;
  }

  /**
   * Formatea un valor en centavos hacia la capa de presentación (UI) usando Intl.NumberFormat.
   * @param {number} cents Valor expresado en centavos.
   * @param {boolean} [includeCode=false] Si debe incluir el código ISO (ej: COP, USD).
   * @param {boolean} [forceShow=false] Si debe forzar la visualización ignorando el Modo Privacidad.
   * @returns {string}
   */
  format(cents, includeCode = false, forceShow = false) {
    const config = this.getCurrencyConfig();

    // Epic 4: Modo Privacidad - Ocultar montos si está activo
    if (!forceShow && store.isPrivacyMode) {
      return `${config.symbol} ****`;
    }

    const majorUnit = this.fromCents(cents);

    try {
      const formatter = new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: config.code,
        minimumFractionDigits: config.decimals,
        maximumFractionDigits: config.decimals
      });

      let formatted = formatter.format(majorUnit);

      // Limpieza de formato según convención limpia de UI
      if (!includeCode) {
        formatted = formatted.replace(config.code, '').trim();
      }
      return formatted;
    } catch {
      return `${config.symbol} ${majorUnit.toLocaleString()}`;
    }
  }

  /**
   * Formatea valores grandes expresados en centavos de forma abreviada (ej. $ 1.2 M, $ 450 k).
   * @param {number} cents
   * @param {boolean} [forceShow=false]
   * @returns {string}
   */
  formatShort(cents, forceShow = false) {
    const config = this.getCurrencyConfig();

    if (!forceShow && store.isPrivacyMode) {
      return `${config.symbol} ****`;
    }

    const majorUnit = this.fromCents(cents);
    const abs = Math.abs(majorUnit);
    const sign = majorUnit < 0 ? '-' : '';

    if (abs >= 1000000) {
      const millions = (abs / 1000000).toLocaleString(config.locale, { maximumFractionDigits: 1 });
      return `${sign}${config.symbol} ${millions} M`;
    }
    if (abs >= 1000) {
      const thousands = (abs / 1000).toLocaleString(config.locale, { maximumFractionDigits: 0 });
      return `${sign}${config.symbol} ${thousands} k`;
    }
    return this.format(cents, false, forceShow);
  }

  /**
   * Cambia la moneda activa en el Store.
   * @param {string} currencyCode
   */
  setCurrency(currencyCode) {
    if (SUPPORTED_CURRENCIES[currencyCode]) {
      store.setState({ currency: currencyCode }, 'currency:changed');
    }
  }

  /**
   * Lista todas las monedas soportadas.
   * @returns {Array}
   */
  getSupportedCurrencies() {
    return Object.values(SUPPORTED_CURRENCIES);
  }
}

export const currencyService = new CurrencyService();
