/**
 * Vista de Cuentas y Billeteras con cálculo de saldo en tiempo real y transferencias internas.
 */
import { accountService } from '../../services/accountService.js';
import { currencyService } from '../../services/currencyService.js';
import { iconHtml } from '../icons.js';

export class AccountsView {
  static escape(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  static render() {
    const accounts = accountService.getAccountsWithBalances();
    const netWorth = accountService.getNetWorth();

    const netWorthEl = document.getElementById('accountNetWorth');
    if (netWorthEl) {
      netWorthEl.textContent = currencyService.format(netWorth);
    }

    const totalAssets = accounts
      .filter(a => a.currentBalance > 0)
      .reduce((sum, a) => sum + a.currentBalance, 0);

    const totalDebts = accounts
      .filter(a => a.currentBalance < 0)
      .reduce((sum, a) => sum + a.currentBalance, 0);

    const assetsEl = document.getElementById('accountTotalAssets');
    const debtsEl = document.getElementById('accountTotalDebts');
    if (assetsEl) assetsEl.textContent = currencyService.format(totalAssets);
    if (debtsEl) debtsEl.textContent = currencyService.format(Math.abs(totalDebts));

    const grid = document.getElementById('accountsGrid');
    if (!grid) return;

    const accountTypeLabels = {
      cash: 'Efectivo',
      bank: 'Banco / Ahorros',
      credit: 'Tarjeta de Crédito',
      wallet: 'Billetera Digital'
    };

    grid.innerHTML = accounts.map(a => {
      const isNegative = a.currentBalance < 0;
      return `
        <article class="account-card" style="border-top: 4px solid ${a.color}">
          <div class="account-card-head">
            <span class="account-icon" style="background:${a.color}1c;color:${a.color}">
              ${iconHtml(a.icon, 'account_balance_wallet')}
            </span>
            <div class="account-card-title">
              <strong>${this.escape(a.name)}</strong>
              <small>${accountTypeLabels[a.type] || 'Cuenta'}</small>
            </div>
            <div class="account-card-actions">
              <button title="Editar cuenta" aria-label="Editar" data-edit-account="${a.id}">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button title="Eliminar cuenta" aria-label="Eliminar" data-delete-account="${a.id}">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </div>

          <div class="account-card-body">
            <div class="account-balance-label">Saldo disponible</div>
            <div class="account-balance ${isNegative ? 'negative-balance' : ''}">
              ${currencyService.format(a.currentBalance)}
            </div>
            <div class="account-initial">
              Balance inicial: ${currencyService.format(a.initialBalance || 0)}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }
}
