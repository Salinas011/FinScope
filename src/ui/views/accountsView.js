/**
 * src/ui/views/accountsView.js
 * Vista de Cuentas y Billeteras v3 con soporte integral para Alcancías (Pockets),
 * barras de progreso hacia metas de ahorro, saldos disponibles vs. totales y acciones rápidas.
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

    // Actualizar KPIs de cabecera
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
      const pockets = a.calculatedPockets || [];
      const totalInPockets = a.currentBalance - a.availableBalance;

      // Render de alcancías anidadas
      const pocketsHtml = pockets.length === 0
        ? `<div class="pocket-empty-hint">
             <span>Sin alcancías activas. Aparta dinero de tu saldo disponible creando una alcancía.</span>
           </div>`
        : `<div class="pockets-list">
            ${pockets.map(p => {
              const hasTarget = Number(p.targetAmount) > 0;
              return `
                <div class="pocket-card">
                  <div class="pocket-head">
                    <div class="pocket-info">
                      <span class="pocket-icon" style="background:${p.color || '#3f3f46'}1c;color:${p.color || '#3f3f46'}">
                        ${iconHtml(p.icon || 'savings', 'savings')}
                      </span>
                      <div>
                        <strong class="pocket-name">${this.escape(p.name)}</strong>
                        <div class="pocket-balance tabular-nums">${currencyService.format(p.currentBalance)}</div>
                      </div>
                    </div>
                    <div class="pocket-actions">
                      <button class="pocket-btn" title="Meter dinero a esta alcancía" aria-label="Meter dinero en alcancía ${this.escape(p.name)}" data-pocket-deposit="${a.id}:${p.id}:${this.escape(p.name)}">
                        <span class="material-symbols-rounded">add</span> Meter
                      </button>
                      <button class="pocket-btn" title="Sacar dinero de esta alcancía" aria-label="Sacar dinero de alcancía ${this.escape(p.name)}" data-pocket-withdraw="${a.id}:${p.id}:${this.escape(p.name)}">
                        <span class="material-symbols-rounded">remove</span> Sacar
                      </button>
                      <button class="pocket-btn danger-icon" title="Eliminar alcancía" aria-label="Eliminar alcancía ${this.escape(p.name)}" data-delete-pocket="${a.id}:${p.id}">
                        <span class="material-symbols-rounded">delete</span>
                      </button>
                    </div>
                  </div>

                  ${hasTarget ? `
                    <div class="pocket-progress-wrap">
                      <div class="pocket-progress-meta">
                        <span>Meta: ${currencyService.format(p.targetAmount)}</span>
                        <strong>${p.progressPercent}%</strong>
                      </div>
                      <div class="pocket-progress-bar">
                        <div class="pocket-progress-fill" style="width: ${p.progressPercent}%; background: ${p.color || '#3f3f46'}"></div>
                      </div>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>`;

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
              <button title="Editar cuenta" aria-label="Editar cuenta ${this.escape(a.name)}" data-edit-account="${a.id}">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button title="Eliminar cuenta" aria-label="Eliminar cuenta ${this.escape(a.name)}" data-delete-account="${a.id}">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </div>

          <div class="account-card-body">
            <div class="account-balance-group">
              <div class="account-balance-label">Saldo total de la cuenta</div>
              <div class="account-balance tabular-nums ${isNegative ? 'negative-balance' : ''}">
                ${currencyService.format(a.currentBalance)}
              </div>
            </div>

            <div class="account-sub-balances">
              <div class="sub-balance-item">
                <span class="sub-balance-label">Disponible:</span>
                <strong class="sub-balance-value tabular-nums">${currencyService.format(a.availableBalance)}</strong>
              </div>
              <div class="sub-balance-item">
                <span class="sub-balance-label">En alcancías:</span>
                <strong class="sub-balance-value tabular-nums">${currencyService.format(totalInPockets)}</strong>
              </div>
            </div>
          </div>

          <!-- SECCIÓN DE ALCANCÍAS ANIDADAS -->
          <div class="pockets-container">
            <div class="pockets-header">
              <span>Alcancías (${pockets.length})</span>
              <button class="btn-add-pocket" data-add-pocket="${a.id}" aria-label="Crear nueva alcancía en cuenta ${this.escape(a.name)}">
                <span class="material-symbols-rounded">add</span> Nueva alcancía
              </button>
            </div>
            ${pocketsHtml}
          </div>
        </article>
      `;
    }).join('');
  }
}
