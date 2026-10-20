/**
 * Vista de Configuración (Moneda, Respaldos JSON, Importación CSV y mantenimiento).
 */
import { currencyService } from '../../services/currencyService.js';
import { store } from '../../core/store.js';

export class SettingsView {
  static render() {
    const activeCurrency = store.currency || 'COP';
    const currencies = currencyService.getSupportedCurrencies();

    const currencySelect = document.getElementById('settingsCurrencySelect');
    if (currencySelect) {
      currencySelect.innerHTML = currencies.map(c => `
        <option value="${c.code}" ${c.code === activeCurrency ? 'selected' : ''}>
          ${c.name} (${c.symbol})
        </option>
      `).join('');
    }

    // Estadísticas de almacenamiento
    const totalTx = store.transactions.length;
    const totalCat = store.categories.length;
    const totalAcc = store.accounts.length;
    const totalBgt = store.budgets.length;
    const totalRec = store.recurring.length;

    const statsEl = document.getElementById('settingsDataStats');
    if (statsEl) {
      const approxBytes = JSON.stringify(store.getState()).length;
      const approxKb = (approxBytes / 1024).toFixed(1);
      statsEl.innerHTML = `
        <div class="stat-pill"><strong>${totalTx}</strong> movimientos</div>
        <div class="stat-pill"><strong>${totalCat}</strong> categorías</div>
        <div class="stat-pill"><strong>${totalAcc}</strong> cuentas</div>
        <div class="stat-pill"><strong>${totalBgt}</strong> presupuestos</div>
        <div class="stat-pill"><strong>${totalRec}</strong> recurrentes</div>
        <div class="stat-pill muted-pill">~${approxKb} KB en almacenamiento local</div>
      `;
    }
  }
}
