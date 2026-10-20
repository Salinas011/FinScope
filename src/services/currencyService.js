/**
 * Servicio de moneda y formato numérico internacional.
 */
import { SUPPORTED_CURRENCIES } from '../core/constants.js';
import { store } from '../core/store.js';

class CurrencyService {
  /**
   * Obtiene la configuración de la moneda activa actual.
   */
  getCurrencyConfig() {
    const code = store.currency || 'COP';
    return SUPPORTED_CURRENCIES[code] || SUPPORTED_CURRENCIES.COP;
  }

  /**
   * Formatea un número en la moneda activa.
   * @param {number|string} amount Valor a formatear.
   * @param {boolean} [includeCode=false] Si debe incluir el código ISO (ej: COP, USD).
   */
  format(amount, includeCode = false) {
    const num = Number(amount) || 0;
    const config = this.getCurrencyConfig();

    try {
      const formatter = new Intl.NumberFormat(config.locale, {
        style: 'currency',
        currency: config.code,
        minimumFractionDigits: config.decimals,
        maximumFractionDigits: config.decimals
      });

      let formatted = formatter.format(num);

      // Limpieza de formato según convención limpia
      if (!includeCode) {
        formatted = formatted.replace(config.code, '').trim();
      }
      return formatted;
    } catch {
      return `${config.symbol} ${num.toLocaleString()}`;
    }
  }

  /**
   * Formatea valores grandes de manera abreviada (ej. $ 1.2 M, $ 450 mil / k).
   */
  formatShort(amount) {
    const num = Number(amount) || 0;
    const abs = Math.abs(num);
    const config = this.getCurrencyConfig();
    const sign = num < 0 ? '-' : '';

    if (abs >= 1000000) {
      const millions = (abs / 1000000).toLocaleString(config.locale, { maximumFractionDigits: 1 });
      return `${sign}${config.symbol} ${millions} M`;
    }
    if (abs >= 1000) {
      const thousands = (abs / 1000).toLocaleString(config.locale, { maximumFractionDigits: 0 });
      return `${sign}${config.symbol} ${thousands} k`;
    }
    return this.format(num);
  }

  /**
   * Cambia la moneda activa en el Store.
   */
  setCurrency(currencyCode) {
    if (SUPPORTED_CURRENCIES[currencyCode]) {
      store.setState({ currency: currencyCode }, 'currency:changed');
    }
  }

  /**
   * Lista todas las monedas soportadas.
   */
  getSupportedCurrencies() {
    return Object.values(SUPPORTED_CURRENCIES);
  }
}

export const currencyService = new CurrencyService();
