/**
 * @typedef {number} AmountInCents
 * Importe monetario canónico expresado como un número entero de centavos (base 100)
 * en el modelo de dominio y capa de persistencia de FinScope v3.1.
 * Erradica imprecisiones de coma flotante IEEE 754.
 * Ejemplos: $ 19.99 -> 1999 centavos; $ 50.000 -> 5000000 centavos.
 */

/**
 * @typedef {number} MajorAmount
 * Importe monetario expresado en unidades mayores (valor decimal estándar).
 * Ejemplo: 15.5 ($ 15.50).
 */

/**
 * @typedef {string} FormattedCurrency
 * Representación en cadena para la interfaz de usuario con símbolo y formato numérico regional.
 * Ejemplo: "$ 50.000,00".
 */

/**
 * @typedef {Object} CurrencyConfig
 * @property {string} code Código ISO de la divisa (COP, USD, EUR, etc.)
 * @property {string} symbol Símbolo monetario ($, €, etc.)
 * @property {string} name Nombre descriptivo de la divisa
 * @property {string} locale Locale BCP 47 para formato (es-CO, en-US, etc.)
 * @property {number} decimals Cantidad de decimales de presentación
 */

import { SUPPORTED_CURRENCIES } from '../core/constants.js';
import { store } from '../core/store.js';

class CurrencyService {
  /**
   * Obtiene la configuración de la moneda activa actual.
   * @returns {CurrencyConfig}
   */
  getCurrencyConfig() {
    const code = store.currency || 'COP';
    return SUPPORTED_CURRENCIES[code] || SUPPORTED_CURRENCIES.COP;
  }

  /**
   * Convierte un valor decimal, flotante o string ingresado por el usuario a un entero en centavos (base 100).
   * Erradica problemas de precisión IEEE 754 y soporta separadores coma y punto.
   * Ejemplos: 15.5 -> 1550, "10,25" -> 1025, 50000 -> 5000000.
   * @param {number|string|MajorAmount} value
   * @returns {AmountInCents} Entero exacto en centavos.
   */
  toCents(value) {
    if (value === null || value === undefined || value === '') return 0;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return 0;
      return Math.round(value * 100);
    }

    // Normalizar string: quitar espacios y signos de moneda
    let clean = String(value).trim().replace(/[$€£S\/\s]/g, '');
    if (!clean) return 0;
    
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
      const commaParts = clean.split(',');
      if (commaParts.length > 2) {
        clean = clean.replace(/,/g, '');
      } else {
        clean = clean.replace(',', '.');
      }
    } else if (hasDot) {
      const dotParts = clean.split('.');
      if (dotParts.length > 2) {
        // Múltiples puntos (ej: 1.000.000) son separadores de miles
        clean = clean.replace(/\./g, '');
      } else if (dotParts.length === 2 && dotParts[1].length === 3 && dotParts[0].length >= 1 && dotParts[0].length <= 3) {
        // Separador de miles latino sin decimales (ej: "225.000" o "1.250")
        clean = clean.replace(/\./g, '');
      }
    }

    const num = parseFloat(clean);
    if (isNaN(num) || !Number.isFinite(num)) return 0;
    return Math.round(num * 100);
  }

  /**
   * Convierte un entero en centavos a su valor decimal correspondiente en unidades mayores.
   * Ej: 1550 -> 15.5
   * @param {AmountInCents} cents Valor entero en centavos.
   * @returns {MajorAmount} Valor en unidades mayores (decimal).
   */
  fromCents(cents) {
    const num = Number(cents);
    if (!Number.isFinite(num)) return 0;
    return num / 100;
  }

  /**
   * Formatea un valor en centavos hacia la capa de presentación (UI) usando Intl.NumberFormat.
   * @param {AmountInCents} cents Valor canónico expresado en centavos.
   * @param {boolean} [includeCode=false] Si debe incluir el código ISO (ej: COP, USD).
   * @param {boolean} [forceShow=false] Si debe forzar la visualización ignorando el Modo Privacidad.
   * @returns {FormattedCurrency} Cadena lista para presentación visual.
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
   * @param {AmountInCents} cents Valor canónico expresado en centavos.
   * @param {boolean} [forceShow=false]
   * @returns {FormattedCurrency}
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
