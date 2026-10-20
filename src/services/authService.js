/**
 * src/services/authService.js
 * Servicio de Autenticación con Google Identity Services (GIS).
 */

export const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '897612074532-o6vrakogt8oqf9fem4qmefelafi5tm4d.apps.googleusercontent.com';

const AUTH_STORAGE_KEY = 'finanza_auth_user';

class AuthService {
  constructor() {
    this.currentUser = this.loadStoredUser();
    this.listeners = [];
    this.initialized = false;
  }

  /**
   * Carga la sesión guardada previamente en localStorage.
   */
  loadStoredUser() {
    try {
      const data = localStorage.getItem(AUTH_STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Error al recuperar sesión local:', e);
      return null;
    }
  }

  /**
   * Decodifica de forma segura el payload del JWT (Credential) de Google
   * manejando correctamente caracteres especiales UTF-8 (tildes, eñes).
   * @param {string} token 
   * @returns {Object|null}
   */
  parseJwt(token) {
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;

      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error al decodificar credencial JWT de Google:', error);
      return null;
    }
  }

  /**
   * Inicializa el SDK de Google Identity Services y renderiza el botón.
   * @param {string} containerId - ID del contenedor donde se insertará el botón oficial.
   */
  initGoogleAuth(containerId = 'googleBtnContainer') {
    if (typeof window === 'undefined') return;

    if (!window.google?.accounts?.id) {
      // Reintentar cuando el script termine de cargar o mediante sondeo breve
      if (document.readyState === 'complete') {
        const checkGsi = setInterval(() => {
          if (window.google?.accounts?.id) {
            clearInterval(checkGsi);
            this.initGoogleAuth(containerId);
          }
        }, 150);
        setTimeout(() => clearInterval(checkGsi), 8000);
      } else {
        window.addEventListener('load', () => this.initGoogleAuth(containerId), { once: true });
      }
      return;
    }

    try {
      if (!this.initialized) {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => this.handleCredentialResponse(response),
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        this.initialized = true;
      }

      const container = document.getElementById(containerId);
      if (container && !this.isAuthenticated()) {
        container.innerHTML = '';
        window.google.accounts.id.renderButton(container, {
          type: 'standard',
          shape: 'rectangular',
          theme: document.body.classList.contains('dark') ? 'filled_black' : 'outline',
          text: 'signin_with',
          size: 'medium',
          logo_alignment: 'left',
          width: 228
        });
      }
    } catch (error) {
      console.error('Error inicializando Google Identity Services:', error);
    }
  }

  /**
   * Manejador del callback tras autenticación exitosa en Google.
   */
  handleCredentialResponse(response) {
    if (!response?.credential) {
      console.error('Respuesta de Google sin credencial válida.');
      return;
    }

    const payload = this.parseJwt(response.credential);
    if (!payload) return;

    this.currentUser = {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      picture: payload.picture,
      givenName: payload.given_name,
      familyName: payload.family_name,
      token: response.credential,
      loggedInAt: new Date().toISOString()
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(this.currentUser));
    this.notify();
  }

  /**
   * Cierra la sesión activa y desactiva la selección automática.
   */
  signOut() {
    if (this.currentUser?.email && window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
      try {
        window.google.accounts.id.revoke(this.currentUser.email, () => {
          console.log('Sesión de Google revocada correctamente.');
        });
      } catch (e) {
        console.warn('Revocación completada localmente.');
      }
    }

    this.currentUser = null;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    this.notify();
  }

  isAuthenticated() {
    return !!this.currentUser;
  }

  getUser() {
    return this.currentUser;
  }

  subscribe(callback) {
    this.listeners.push(callback);
    callback(this.currentUser);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  notify() {
    this.listeners.forEach(cb => cb(this.currentUser));
  }
}

export const authService = new AuthService();
