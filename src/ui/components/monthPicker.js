/**
 * FinScope v3.1 — Componente de Selección de Mes (Custom Month Picker)
 * Reemplaza el selector nativo del navegador con una interfaz moderna,
 * accesible y totalmente adaptada al diseño y temas (claro/oscuro) de FinScope.
 */

const MONTHS_ES = [
  { num: '01', short: 'Ene', full: 'Enero' },
  { num: '02', short: 'Feb', full: 'Febrero' },
  { num: '03', short: 'Mar', full: 'Marzo' },
  { num: '04', short: 'Abr', full: 'Abril' },
  { num: '05', short: 'May', full: 'Mayo' },
  { num: '06', short: 'Jun', full: 'Junio' },
  { num: '07', short: 'Jul', full: 'Julio' },
  { num: '08', short: 'Ago', full: 'Agosto' },
  { num: '09', short: 'Sep', full: 'Septiembre' },
  { num: '10', short: 'Oct', full: 'Octubre' },
  { num: '11', short: 'Nov', full: 'Noviembre' },
  { num: '12', short: 'Dic', full: 'Diciembre' }
];

export function formatMonthDisplay(isoString, defaultText = 'Todos los meses') {
  if (!isoString || !/^\d{4}-\d{2}$/.test(isoString)) return defaultText;
  const [yearStr, monthStr] = isoString.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthStr, 10) - 1;
  const monthObj = MONTHS_ES[monthIdx];
  if (!monthObj) return isoString;
  return `${monthObj.full} de ${year}`;
}

export class MonthPickerPopover {
  constructor() {
    this.popoverEl = null;
    this.backdropEl = null;
    this.anchorEl = null;
    this.activeYear = new Date().getFullYear();
    this.selectedValue = '';
    this.onChange = null;
    this.onClear = null;
    this.isOpen = false;
    this.clearText = 'Todos los meses';

    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.initDOM();
  }

  initDOM() {
    if (document.getElementById('finscopeMonthPicker')) {
      this.popoverEl = document.getElementById('finscopeMonthPicker');
      this.backdropEl = document.getElementById('finscopeMonthPickerBackdrop');
      return;
    }

    // Backdrop para dispositivos móviles o clicks externos
    this.backdropEl = document.createElement('div');
    this.backdropEl.id = 'finscopeMonthPickerBackdrop';
    this.backdropEl.className = 'month-picker-backdrop';
    this.backdropEl.style.display = 'none';

    // Popover principal
    this.popoverEl = document.createElement('div');
    this.popoverEl.id = 'finscopeMonthPicker';
    this.popoverEl.className = 'month-picker-popover';
    this.popoverEl.style.display = 'none';
    this.popoverEl.setAttribute('role', 'dialog');
    this.popoverEl.setAttribute('aria-modal', 'true');
    this.popoverEl.setAttribute('aria-label', 'Selector de período mensual');

    this.popoverEl.innerHTML = `
      <div class="month-picker-header">
        <button type="button" class="month-picker-nav-btn" id="mpPrevYear" aria-label="Año anterior">
          <span class="material-symbols-rounded">chevron_left</span>
        </button>
        <div class="month-picker-year" id="mpYearDisplay">${this.activeYear}</div>
        <button type="button" class="month-picker-nav-btn" id="mpNextYear" aria-label="Año siguiente">
          <span class="material-symbols-rounded">chevron_right</span>
        </button>
      </div>
      <div class="month-picker-grid" id="mpMonthGrid"></div>
      <div class="month-picker-footer">
        <button type="button" class="month-picker-action-btn btn-clear" id="mpClearBtn">${this.clearText}</button>
        <button type="button" class="month-picker-action-btn btn-today" id="mpCurrentMonthBtn">Este mes</button>
      </div>
    `;

    document.body.appendChild(this.backdropEl);
    document.body.appendChild(this.popoverEl);

    // Eventos de controles de año
    this.popoverEl.querySelector('#mpPrevYear').addEventListener('click', (e) => {
      e.stopPropagation();
      this.activeYear--;
      this.render();
    });

    this.popoverEl.querySelector('#mpNextYear').addEventListener('click', (e) => {
      e.stopPropagation();
      this.activeYear++;
      this.render();
    });

    this.popoverEl.querySelector('#mpCurrentMonthBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      const now = new Date();
      const currentMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (this.onChange) this.onChange(currentMonthISO);
      this.close();
    });

    this.popoverEl.querySelector('#mpClearBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onClear) {
        this.onClear();
      } else if (this.onChange) {
        this.onChange('');
      }
      this.close();
    });

    this.backdropEl.addEventListener('click', () => this.close());
  }

  render() {
    const yearDisplay = this.popoverEl.querySelector('#mpYearDisplay');
    if (yearDisplay) yearDisplay.textContent = this.activeYear;

    const clearBtn = this.popoverEl.querySelector('#mpClearBtn');
    if (clearBtn) clearBtn.textContent = this.clearText;

    const grid = this.popoverEl.querySelector('#mpMonthGrid');
    if (!grid) return;

    const now = new Date();
    const currentMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    grid.innerHTML = MONTHS_ES.map(m => {
      const monthISO = `${this.activeYear}-${m.num}`;
      const isSelected = monthISO === this.selectedValue;
      const isCurrent = monthISO === currentMonthISO;
      const classes = ['month-picker-cell'];
      if (isSelected) classes.push('selected');
      if (isCurrent) classes.push('current');

      return `
        <button type="button" 
          class="${classes.join(' ')}" 
          data-month-iso="${monthISO}" 
          aria-label="${m.full} ${this.activeYear}" 
          ${isSelected ? 'aria-current="date"' : ''}>
          ${m.short}
        </button>
      `;
    }).join('');

    // Listener para cada mes
    grid.querySelectorAll('.month-picker-cell').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const iso = btn.getAttribute('data-month-iso');
        if (this.onChange) this.onChange(iso);
        this.close();
      });
    });
  }

  position() {
    if (!this.anchorEl || !this.popoverEl) return;

    if (window.innerWidth <= 480) {
      // En móviles se posiciona en centro mediante CSS fijo
      this.popoverEl.style.top = '';
      this.popoverEl.style.left = '';
      return;
    }

    const rect = this.anchorEl.getBoundingClientRect();
    const popoverWidth = 290;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    let top = rect.bottom + scrollY + 6;
    let left = rect.left + scrollX;

    // Ajustar si se desborda hacia la derecha
    if (left + popoverWidth > window.innerWidth - 16 + scrollX) {
      left = window.innerWidth - popoverWidth - 16 + scrollX;
    }
    if (left < 16 + scrollX) {
      left = 16 + scrollX;
    }

    this.popoverEl.style.top = `${top}px`;
    this.popoverEl.style.left = `${left}px`;
  }

  open({ anchorEl, value, onChange, onClear, clearText = 'Todos los meses' }) {
    this.anchorEl = anchorEl;
    this.selectedValue = value || '';
    this.onChange = onChange;
    this.onClear = onClear;
    this.clearText = clearText;

    if (value && /^\d{4}-\d{2}$/.test(value)) {
      this.activeYear = parseInt(value.slice(0, 4), 10);
    } else {
      this.activeYear = new Date().getFullYear();
    }

    this.render();
    this.popoverEl.style.display = 'block';
    if (this.backdropEl) this.backdropEl.style.display = 'block';
    this.position();
    this.isOpen = true;

    // Manejadores globales
    setTimeout(() => {
      document.addEventListener('pointerdown', this.handleOutsideClick);
      document.addEventListener('keydown', this.handleKeyDown);
    }, 10);
  }

  close() {
    if (!this.isOpen) return;
    this.popoverEl.style.display = 'none';
    if (this.backdropEl) this.backdropEl.style.display = 'none';
    this.isOpen = false;
    document.removeEventListener('pointerdown', this.handleOutsideClick);
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  handleOutsideClick(e) {
    if (this.popoverEl && !this.popoverEl.contains(e.target) && !this.anchorEl?.contains(e.target)) {
      this.close();
    }
  }

  handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.close();
      this.anchorEl?.focus?.();
    }
  }
}

// Singleton accesible en toda la aplicación
export const MonthPicker = new MonthPickerPopover();
