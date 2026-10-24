/**
 * src/ui/router.js
 * Enrutador modular SPA para FinScope v3.1.
 * Centraliza el estado de la vista activa, sincronización de rutas por hash,
 * actualización visual del sidebar y bottom navigation, breadcrumbs
 * y transiciones visuales mediante View Transitions API.
 */
import { VIEW_TITLES } from '../core/constants.js';
import { DashboardView } from './views/dashboardView.js';

class Router {
  constructor() {
    this.activeView = 'dashboard';
    this.isTransitioning = false;
    this.isInitialized = false;
    this.onViewRender = null;
    this.getSelectedMonth = () => new Date().toISOString().slice(0, 7);
    this.loadedViews = {};

    this.viewLoaders = {
      transactions: () => import('./views/transactionsView.js').then(m => m.TransactionsView),
      accounts: () => import('./views/accountsView.js').then(m => m.AccountsView),
      budgets: () => import('./views/budgetsView.js').then(m => m.BudgetsView),
      categories: () => import('./views/categoriesView.js').then(m => m.CategoriesView),
      recurring: () => import('./views/recurringView.js').then(m => m.RecurringView),
      settings: () => import('./views/settingsView.js').then(m => m.SettingsView)
    };
  }

  /**
   * Carga una vista de forma dinámica (Lazy Loading).
   * @param {string} name 
   * @returns {Promise<any>}
   */
  async loadView(name) {
    if (this.loadedViews[name]) return this.loadedViews[name];
    if (this.viewLoaders[name]) {
      const viewClass = await this.viewLoaders[name]();
      this.loadedViews[name] = viewClass;
      return viewClass;
    }
    return null;
  }

  /**
   * Inicializa el enrutador con sus manejadores y listeners globales.
   * @param {Object} [options={}]
   * @param {Function} [options.onViewRender] Callback para renderizar vistas personalizadas.
   * @param {Function} [options.getSelectedMonth] Función que devuelve el mes seleccionado (YYYY-MM).
   */
  async init({ onViewRender, getSelectedMonth } = {}) {
    if (this.isInitialized) return;
    this.isInitialized = true;

    if (onViewRender) this.onViewRender = onViewRender;
    if (getSelectedMonth) this.getSelectedMonth = getSelectedMonth;

    // 1. Escuchar cambios de hash en la ventana (navegación atrás/adelante y enlaces directos)
    window.addEventListener('hashchange', () => {
      const hashView = window.location.hash.replace('#', '').trim();
      if (hashView && VIEW_TITLES[hashView] && hashView !== this.activeView) {
        this.navigate(hashView, false);
      }
    });

    // 2. Delegación de clics para enlaces y botones con data-view o data-goto
    document.addEventListener('click', e => {
      const target = e.target.closest('[data-view], [data-goto], a[href^="#"]');
      if (!target) return;

      let viewName = null;
      if (target.dataset.view) {
        viewName = target.dataset.view;
      } else if (target.dataset.goto) {
        viewName = target.dataset.goto;
      } else if (target.getAttribute('href')?.startsWith('#')) {
        const hash = target.getAttribute('href').slice(1);
        if (VIEW_TITLES[hash]) viewName = hash;
      }

      if (viewName && VIEW_TITLES[viewName]) {
        e.preventDefault();
        this.navigate(viewName, true);
      }
    });

    // 3. Determinar vista inicial desde hash o por defecto 'dashboard'
    const initialHash = window.location.hash.replace('#', '').trim();
    const initialView = (initialHash && VIEW_TITLES[initialHash]) ? initialHash : 'dashboard';
    await this.navigate(initialView, true);
  }

  /**
   * Navega hacia una vista específica.
   * @param {string} viewName Nombre de la vista destino.
   * @param {boolean} [updateHash=true] Si debe sincronizarse con window.location.hash.
   */
  async navigate(viewName, updateHash = true) {
    if (!VIEW_TITLES[viewName]) return;
    if (this.isTransitioning) return;

    this.activeView = viewName;

    if (updateHash && window.location.hash !== `#${viewName}`) {
      window.location.hash = `#${viewName}`;
    }

    const updateDOM = async () => {
      // Actualizar visibilidad de vistas
      document.querySelectorAll('.view').forEach(el => {
        el.classList.toggle('active-view', el.id === `view-${viewName}`);
      });

      // Actualizar navegación de barra lateral
      document.querySelectorAll('.nav-item[data-view]').forEach(el => {
        el.classList.toggle('active', el.dataset.view === viewName);
      });

      // Actualizar navegación inferior en móviles
      document.querySelectorAll('.bottom-nav-item[data-view]').forEach(el => {
        el.classList.toggle('active', el.dataset.view === viewName);
      });

      // Actualizar miga de pan (Breadcrumb)
      const breadcrumb = document.getElementById('breadcrumbCurrent');
      if (breadcrumb) {
        breadcrumb.textContent = VIEW_TITLES[viewName];
      }

      // Cerrar menú móvil
      document.getElementById('sidebar')?.classList.remove('open');
      document.getElementById('sidebarBackdrop')?.classList.remove('active');

      // Ejecutar render de la vista activa
      await this.renderActiveView();

      // Scroll suave al inicio
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Uso de View Transitions API si está soportada por el navegador
    if (typeof document.startViewTransition === 'function') {
      try {
        this.isTransitioning = true;
        await document.startViewTransition(async () => {
          await updateDOM();
        }).finished;
      } catch (err) {
        console.warn('[Router] Error en View Transition:', err);
        await updateDOM();
      } finally {
        this.isTransitioning = false;
      }
    } else {
      await updateDOM();
    }
  }

  /**
   * Renderiza el contenido de la vista activa.
   */
  async renderActiveView() {
    const month = typeof this.getSelectedMonth === 'function' ? this.getSelectedMonth() : new Date().toISOString().slice(0, 7);

    if (typeof this.onViewRender === 'function') {
      await this.onViewRender(this.activeView, month);
      return;
    }

    switch (this.activeView) {
      case 'dashboard': {
        DashboardView.render(month);
        break;
      }
      case 'transactions': {
        const view = await this.loadView('transactions');
        view?.render();
        break;
      }
      case 'accounts': {
        const view = await this.loadView('accounts');
        view?.render();
        break;
      }
      case 'budgets': {
        const view = await this.loadView('budgets');
        view?.render(month);
        break;
      }
      case 'categories': {
        const view = await this.loadView('categories');
        view?.render();
        break;
      }
      case 'recurring': {
        const view = await this.loadView('recurring');
        view?.render(month);
        break;
      }
      case 'settings': {
        const view = await this.loadView('settings');
        view?.render();
        break;
      }
    }
  }

  /**
   * Devuelve el nombre de la vista activa.
   * @returns {string}
   */
  getActiveView() {
    return this.activeView;
  }
}

export const router = new Router();
