/**
 * Vista de Configuración (Moneda, Respaldos JSON, Importación CSV, Mantenimiento y Cuenta Cloud).
 */
import { currencyService } from '../../services/currencyService.js';
import { store } from '../../core/store.js';
import { authService } from '../../services/authService.js';
import { Toast } from '../toast.js';

export class SettingsView {
  static escape(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /**
   * Renderiza la tarjeta superior izquierda de Cuenta y Sincronización en la Nube
   * con soporte resiliente para estados autenticado y no autenticado (Modo Invitado).
   * @param {Object|null} [user=null] - Información del usuario autenticado o null.
   */
  static renderAuthCard(user = authService.getUser()) {
    const card = document.getElementById('settingsAuthCard');
    if (!card) return;

    try {
      if (!user) {
        // --- Estado: NO Autenticado (Modo Local / Invitado) ---
        card.innerHTML = `
          <div class="settings-card-head">
            <span class="settings-card-icon"><span class="material-symbols-rounded">cloud_sync</span></span>
            <div>
              <h3>Cuenta y Sincronización en la Nube</h3>
              <p class="muted">Modo local / Seguro en este dispositivo</p>
            </div>
          </div>
          <div class="settings-card-body">
            <div class="settings-auth-status" style="margin-bottom: 12px;">
              <span class="status-indicator-badge local" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; background: var(--surface-2, rgba(255,255,255,0.06)); border: 1px solid var(--line, rgba(255,255,255,0.1)); color: var(--text, #fff);">
                <span class="material-symbols-rounded" style="font-size: 16px; color: var(--accent, #6366f1);">lock</span> Modo local / Seguro en este dispositivo
              </span>
            </div>
            <p class="settings-help" style="margin-top: 0; margin-bottom: 14px;">
              Actualmente estás usando FinScope en modo local en este dispositivo. Para sincronizar tus cuentas y movimientos en tiempo real con Cloud Firestore y acceder desde cualquier lugar, inicia sesión con Google:
            </p>
            <div class="settings-action-row" style="margin-top: 14px; align-items: center; gap: 12px; min-height: 44px;">
              <div id="googleBtnSettings" class="google-btn-wrapper"></div>
              <button type="button" class="primary-button" id="btnGoogleFallbackSettings" style="display: none;">
                <span class="material-symbols-rounded">login</span> Iniciar sesión con Google
              </button>
            </div>
          </div>
        `;

        // Botón de fallback interactivo ante demoras o bloqueo de GIS
        const fallbackBtn = document.getElementById('btnGoogleFallbackSettings');
        if (fallbackBtn) {
          fallbackBtn.addEventListener('click', () => {
            try {
              authService.promptGoogleLogin();
            } catch (err) {
              console.warn('[SettingsView] Error al invocar promptGoogleLogin:', err);
            }
          });
        }

        // Inicialización segura del botón oficial de Google Identity Services
        try {
          authService.initGoogleAuth(['googleBtnSettings']);
          // Si el SDK de Google aún no está disponible en window, habilitamos el fallback visual
          if (typeof window !== 'undefined' && (!window.google?.accounts?.id)) {
            if (fallbackBtn) fallbackBtn.style.display = 'inline-flex';
          }
        } catch (gErr) {
          console.warn('[SettingsView] Error al inicializar botón de Google en Configuración:', gErr);
          if (fallbackBtn) fallbackBtn.style.display = 'inline-flex';
        }
      } else {
        // --- Estado: SÍ Autenticado (Sesión de Google y Firestore Activa) ---
        const firstLetter = (user.name || user.email || 'U').charAt(0).toUpperCase();
        const safeName = this.escape(user.name || 'Usuario');
        const safeEmail = this.escape(user.email || '');
        const pictureUrl = this.escape(user.picture || '');

        card.innerHTML = `
          <div class="settings-card-head">
            <span class="settings-card-icon"><span class="material-symbols-rounded">verified_user</span></span>
            <div>
              <h3>Cuenta y Sincronización en la Nube</h3>
              <p class="muted">Sincronizado en tiempo real con Firebase Firestore</p>
            </div>
          </div>
          <div class="settings-card-body">
            <div class="profile-row user-logged" style="padding: 0; background: transparent; border: none; margin-bottom: 14px; display: flex; align-items: center; gap: 12px;">
              <img 
                class="avatar-img" 
                src="${pictureUrl}" 
                alt="${safeName}" 
                referrerpolicy="no-referrer"
                style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent, #6366f1);"
                onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='grid';" 
              />
              <div class="avatar" style="display: none; width: 44px; height: 44px; border-radius: 50%; font-size: 18px;">${firstLetter}</div>
              <div class="user-meta" style="min-width: 0;">
                <strong style="font-size: 14px; display: block; line-height: 1.3;">${safeName}</strong>
                <small class="muted" title="${safeEmail}" style="font-size: 12px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeEmail}</small>
              </div>
            </div>

            <div class="settings-auth-status" style="margin-bottom: 14px;">
              <span class="status-indicator-badge synced" style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(34, 197, 94, 0.3); color: #22c55e;">
                <span class="material-symbols-rounded" style="font-size: 16px;">cloud_done</span> Sincronizado con Cloud Firestore
              </span>
            </div>

            <p class="settings-help" style="margin-top: 0; margin-bottom: 16px;">
              Tus finanzas personales están respaldadas en la nube de Firebase. Todos tus cambios se sincronizan automáticamente entre tus dispositivos conectados.
            </p>

            <div class="settings-action-row">
              <button type="button" class="danger-button" id="btnLogoutSettings">
                <span class="material-symbols-rounded">logout</span> Cerrar sesión
              </button>
            </div>
          </div>
        `;

        const btnLogout = document.getElementById('btnLogoutSettings');
        if (btnLogout) {
          btnLogout.addEventListener('click', async () => {
            try {
              btnLogout.disabled = true;
              btnLogout.innerHTML = `<span class="material-symbols-rounded spin">sync</span> Cerrando sesión...`;
              await authService.signOut();
              Toast.info('Has cerrado sesión. Base local reiniciada y Modo Invitado activo.');
              SettingsView.renderAuthCard(null);
            } catch (err) {
              console.error('[SettingsView] Error al cerrar sesión:', err);
              Toast.error('Error al cerrar sesión: ' + (err.message || err));
              btnLogout.disabled = false;
              btnLogout.innerHTML = `<span class="material-symbols-rounded">logout</span> Cerrar sesión`;
            }
          });
        }
      }
    } catch (error) {
      console.error('[SettingsView] Excepción renderizando settingsAuthCard:', error);
    }
  }

  static render() {
    // 1. Renderizar tarjeta de autenticación y sincronización
    this.renderAuthCard();

    // 2. Selector de moneda activa
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

    // 3. Estadísticas de almacenamiento (registros activos)
    const totalTx = (store.transactions || []).filter(t => !t.deletedAt).length;
    const totalCat = (store.categories || []).filter(c => !c.deletedAt).length;
    const totalAcc = (store.accounts || []).filter(a => !a.deletedAt).length;
    const totalBgt = (store.budgets || []).filter(b => !b.deletedAt).length;
    const totalRec = (store.recurring || []).filter(r => !r.deletedAt).length;

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
