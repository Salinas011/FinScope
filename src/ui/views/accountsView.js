/**
 * src/ui/views/accountsView.js
 * Vista de Cuentas y Billeteras v3 con diseño minimalista, paleta neutra,
 * cabeceras limpias sin tags redundantes y tooltips no invasivos.
 */
import { accountService } from '../../services/accountService.js';
import { currencyService } from '../../services/currencyService.js';
import { authService } from '../../services/authService.js';
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
    const isGuest = !authService.isAuthenticated();

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

    grid.innerHTML = accounts.map(a => {
      const isNegative = a.currentBalance < 0;
      const pockets = a.calculatedPockets || [];
      const totalInPockets = a.currentBalance - a.availableBalance;

      // Render de alcancías anidadas con diseño en tarjetas independientes
      const pocketsHtml = pockets.length === 0
        ? `<div class="pocket-empty-card">
             <div class="pocket-empty-icon">
               <span class="material-symbols-rounded">savings</span>
             </div>
             <div class="pocket-empty-content">
               <strong>Sin alcancías activas</strong>
               <p>Aparta dinero de tu saldo disponible para metas específicas sin alterar tus gastos.</p>
             </div>
             <button class="pocket-empty-action-btn ${isGuest ? 'guest-locked' : ''}" data-add-pocket="${a.id}" type="button" aria-label="Crear alcancía en ${this.escape(a.name)}" data-tooltip="${isGuest ? 'Crear alcancía (Requiere cuenta)' : 'Crear alcancía'}">
               <span class="material-symbols-rounded">add</span>
               <span>Crear alcancía</span>
               ${isGuest ? '<span class="material-symbols-rounded auth-lock-mini">lock</span>' : ''}
             </button>
           </div>`
        : `<div class="pockets-list">
            ${pockets.map(p => {
              const hasTarget = Number(p.targetAmount) > 0;
              return `
                <div class="pocket-card">
                  <div class="pocket-card-top">
                    <div class="pocket-info-group">
                      <span class="pocket-icon-badge">
                        ${iconHtml(p.icon || 'savings', 'savings')}
                      </span>
                      <div class="pocket-text-group">
                        <strong class="pocket-name" title="${this.escape(p.name)}">${this.escape(p.name)}</strong>
                        <span class="pocket-balance tabular-nums">${currencyService.format(p.currentBalance)}</span>
                      </div>
                    </div>
                    <button class="pocket-delete-btn ${isGuest ? 'guest-locked' : ''}" data-tooltip="${isGuest ? 'Eliminar alcancía (Requiere cuenta)' : 'Eliminar alcancía'}" aria-label="Eliminar alcancía ${this.escape(p.name)}" data-delete-pocket="${a.id}:${p.id}">
                      <span class="material-symbols-rounded">delete</span>
                    </button>
                  </div>

                  ${hasTarget ? `
                    <div class="pocket-progress-wrap">
                      <div class="pocket-progress-header">
                        <span class="pocket-target-text">Meta: ${currencyService.format(p.targetAmount)}</span>
                        <span class="pocket-percent-badge tabular-nums">${p.progressPercent}%</span>
                      </div>
                      <div class="pocket-progress-track">
                        <div class="pocket-progress-bar" style="width: ${Math.min(100, Math.max(0, p.progressPercent))}%;"></div>
                      </div>
                    </div>
                  ` : ''}

                  <div class="pocket-actions-row">
                    <button class="pocket-action-pill deposit ${isGuest ? 'guest-locked' : ''}" data-tooltip="${isGuest ? 'Meter dinero (Requiere cuenta)' : 'Meter dinero a esta alcancía'}" aria-label="Meter dinero en alcancía ${this.escape(p.name)}" data-pocket-deposit="${a.id}:${p.id}:${this.escape(p.name)}">
                      <span class="material-symbols-rounded">add</span>
                      <span>Meter</span>
                      ${isGuest ? '<span class="material-symbols-rounded auth-lock-mini">lock</span>' : ''}
                    </button>
                    <button class="pocket-action-pill withdraw ${isGuest ? 'guest-locked' : ''}" data-tooltip="${isGuest ? 'Sacar dinero (Requiere cuenta)' : 'Sacar dinero de esta alcancía'}" aria-label="Sacar dinero de alcancía ${this.escape(p.name)}" data-pocket-withdraw="${a.id}:${p.id}:${this.escape(p.name)}">
                      <span class="material-symbols-rounded">remove</span>
                      <span>Sacar</span>
                      ${isGuest ? '<span class="material-symbols-rounded auth-lock-mini">lock</span>' : ''}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>`;

      return `
        <article class="account-card">
          <div class="account-card-head">
            <span class="account-icon">
              ${iconHtml(a.icon, 'account_balance_wallet')}
            </span>
            <div class="account-card-title">
              <strong class="account-name" title="${this.escape(a.name)}">${this.escape(a.name)}</strong>
            </div>
            <div class="account-card-actions">
              <button class="card-action-btn ${isGuest ? 'guest-locked' : ''}" data-tooltip="${isGuest ? 'Editar cuenta (Requiere cuenta)' : 'Editar cuenta'}" aria-label="Editar cuenta ${this.escape(a.name)}" data-edit-account="${a.id}">
                <span class="material-symbols-rounded">edit</span>
              </button>
              <button class="card-action-btn delete ${isGuest ? 'guest-locked' : ''}" data-tooltip="${isGuest ? 'Eliminar cuenta (Requiere cuenta)' : 'Eliminar cuenta'}" aria-label="Eliminar cuenta ${this.escape(a.name)}" data-delete-account="${a.id}">
                <span class="material-symbols-rounded">delete</span>
              </button>
            </div>
          </div>

          <div class="account-card-body">
            <div class="account-balance-group">
              <div class="account-balance-label">
                <span>Saldo total de la cuenta</span>
              </div>
              <div class="account-balance tabular-nums ${isNegative ? 'negative-balance' : ''}">
                ${currencyService.format(a.currentBalance)}
              </div>
            </div>

            <div class="account-sub-balances-grid">
              <div class="sub-balance-box">
                <div class="sub-balance-header">
                  <span class="sub-balance-label">DISPONIBLE</span>
                </div>
                <strong class="sub-balance-value tabular-nums">${currencyService.format(a.availableBalance)}</strong>
              </div>
              <div class="sub-balance-box">
                <div class="sub-balance-header">
                  <span class="sub-balance-label">EN ALCANCÍAS</span>
                </div>
                <strong class="sub-balance-value tabular-nums">${currencyService.format(totalInPockets)}</strong>
              </div>
            </div>
          </div>

          <!-- SECCIÓN DE ALCANCÍAS ANIDADAS -->
          <div class="pockets-container">
            <div class="pockets-header">
              <div class="pockets-title">
                <span class="material-symbols-rounded">savings</span>
                <span>Alcancías (${pockets.length})</span>
              </div>
              <button class="btn-add-pocket ${isGuest ? 'guest-locked' : ''}" data-add-pocket="${a.id}" aria-label="Crear nueva alcancía en cuenta ${this.escape(a.name)}" data-tooltip="${isGuest ? 'Nueva alcancía (Requiere cuenta)' : 'Crear alcancía'}">
                <span class="material-symbols-rounded">add</span>
                <span>Nueva alcancía</span>
                ${isGuest ? '<span class="material-symbols-rounded auth-lock-mini">lock</span>' : ''}
              </button>
            </div>
            ${pocketsHtml}
          </div>
        </article>
      `;
    }).join('');
  }
}
