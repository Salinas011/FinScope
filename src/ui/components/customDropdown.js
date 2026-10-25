/**
 * FinScope v3.1 — Componente de Dropdowns Personalizados (Custom Dropdowns)
 * Transforma los selects nativos de filtros en dropdowns estilizados,
 * accesibles y acordes a la identidad visual de FinScope (Dark/Light mode).
 */

export class CustomDropdownManager {
  constructor() {
    this.instances = new Map();
    this.activeOpenWrapper = null;
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleDocumentKeydown = this.handleDocumentKeydown.bind(this);
    document.addEventListener('pointerdown', this.handleDocumentClick);
    document.addEventListener('keydown', this.handleDocumentKeydown);
  }

  /**
   * Inicializa o actualiza los dropdowns personalizados para los selectores indicados.
   * @param {string[]} selectIds - IDs de los selects a transformar (ej. ['typeFilter', 'categoryFilter', 'accountFilter'])
   */
  init(selectIds = ['typeFilter', 'categoryFilter', 'accountFilter']) {
    selectIds.forEach(id => {
      const select = document.getElementById(id);
      if (!select) return;
      this.attachToSelect(select);
    });
  }

  /**
   * Adjunta el componente personalizado a un elemento <select>.
   * Preserva el <select> en el DOM para compatibilidad 100% con tests y formularios.
   */
  attachToSelect(select) {
    const id = select.id;
    let wrapper = select.closest('.custom-select-wrapper');

    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper';
      wrapper.dataset.selectId = id;
      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(select);
    }

    // Ocultar select nativo de forma accesible (manteniendo su operatividad para tests y scripts)
    select.classList.add('custom-select-hidden');
    select.setAttribute('tabindex', '-1');
    select.setAttribute('aria-hidden', 'true');

    // Obtener o crear botón trigger
    let trigger = wrapper.querySelector('.custom-select-trigger');
    if (!trigger) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'custom-select-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('id', `${id}_trigger`);
      trigger.innerHTML = `
        <span class="custom-select-label"></span>
        <span class="material-symbols-rounded custom-select-arrow" aria-hidden="true">expand_more</span>
      `;
      wrapper.appendChild(trigger);

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle(wrapper);
      });
    }

    // Obtener o crear menú flotante
    let menu = wrapper.querySelector('.custom-select-menu');
    if (!menu) {
      menu = document.createElement('div');
      menu.className = 'custom-select-menu';
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('aria-labelledby', `${id}_trigger`);
      menu.style.display = 'none';
      wrapper.appendChild(menu);
    }

    // Sincronizar opciones del select con el menú
    this.sync(id);

    // Escuchar cambios nativos en el select (ej. desde código JS o clearFilters)
    if (!select.dataset.hasCustomListener) {
      select.addEventListener('change', () => {
        this.updateTriggerAndSelection(id);
      });
      select.dataset.hasCustomListener = 'true';
    }

    this.instances.set(id, { select, wrapper, trigger, menu });
  }

  /**
   * Sincroniza las opciones del menú flotante con las <option> del <select>.
   */
  sync(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const wrapper = select.closest('.custom-select-wrapper');
    if (!wrapper) return;

    const trigger = wrapper.querySelector('.custom-select-trigger');
    const menu = wrapper.querySelector('.custom-select-menu');
    if (!trigger || !menu) return;

    const options = Array.from(select.options);
    const selectedOption = select.options[select.selectedIndex] || options[0];

    // Actualizar etiqueta del trigger
    const labelSpan = trigger.querySelector('.custom-select-label');
    if (labelSpan && selectedOption) {
      labelSpan.textContent = selectedOption.text;
    }

    // Renderizar opciones en el menú
    menu.innerHTML = options.map((opt, index) => {
      const isSelected = opt.value === select.value || (!select.value && index === 0);
      return `
        <div class="custom-select-option ${isSelected ? 'selected' : ''}" 
             data-value="${opt.value}" 
             data-index="${index}"
             role="option" 
             aria-selected="${isSelected ? 'true' : 'false'}"
             tabindex="0">
          <span class="option-text">${opt.text}</span>
          ${isSelected ? '<span class="material-symbols-rounded option-check">check</span>' : ''}
        </div>
      `;
    }).join('');

    // Asignar listeners de selección
    menu.querySelectorAll('.custom-select-option').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = item.getAttribute('data-value');
        this.selectOption(selectId, value);
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const value = item.getAttribute('data-value');
          this.selectOption(selectId, value);
        }
      });
    });
  }

  /**
   * Sincroniza todas las instancias registradas (útil tras refreshSelects()).
   */
  syncAll() {
    this.instances.forEach((_, id) => {
      this.sync(id);
    });
  }

  /**
   * Selecciona una opción en el dropdown personalizado y propaga el evento al select nativo.
   */
  selectOption(selectId, value) {
    const instance = this.instances.get(selectId);
    if (!instance) return;

    const { select, wrapper } = instance;
    if (select.value !== value) {
      select.value = value;
      // Disparar evento de cambio nativo para que todos los filtros y vistas reaccionen
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    this.updateTriggerAndSelection(selectId);
    this.close(wrapper);
  }

  /**
   * Actualiza el texto del botón trigger y el check de la opción seleccionada.
   */
  updateTriggerAndSelection(selectId) {
    const instance = this.instances.get(selectId);
    if (!instance) return;

    const { select, trigger, menu } = instance;
    const selectedOption = select.options[select.selectedIndex];
    const labelSpan = trigger.querySelector('.custom-select-label');
    if (labelSpan && selectedOption) {
      labelSpan.textContent = selectedOption.text;
    }

    // Actualizar clases de selección en el menú
    if (menu) {
      menu.querySelectorAll('.custom-select-option').forEach(item => {
        const isMatch = item.getAttribute('data-value') === select.value;
        item.classList.toggle('selected', isMatch);
        item.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        let check = item.querySelector('.option-check');
        if (isMatch && !check) {
          const checkEl = document.createElement('span');
          checkEl.className = 'material-symbols-rounded option-check';
          checkEl.textContent = 'check';
          item.appendChild(checkEl);
        } else if (!isMatch && check) {
          check.remove();
        }
      });
    }
  }

  toggle(wrapper) {
    if (wrapper.classList.contains('open')) {
      this.close(wrapper);
    } else {
      this.open(wrapper);
    }
  }

  open(wrapper) {
    if (this.activeOpenWrapper && this.activeOpenWrapper !== wrapper) {
      this.close(this.activeOpenWrapper);
    }

    wrapper.classList.add('open');
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const menu = wrapper.querySelector('.custom-select-menu');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    if (menu) {
      menu.style.display = 'flex';
      // Enfocar opción seleccionada si existe
      const selected = menu.querySelector('.custom-select-option.selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }

    this.activeOpenWrapper = wrapper;
  }

  close(wrapper) {
    if (!wrapper) return;
    wrapper.classList.remove('open');
    const trigger = wrapper.querySelector('.custom-select-trigger');
    const menu = wrapper.querySelector('.custom-select-menu');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    if (menu) menu.style.display = 'none';

    if (this.activeOpenWrapper === wrapper) {
      this.activeOpenWrapper = null;
    }
  }

  closeAll() {
    if (this.activeOpenWrapper) {
      this.close(this.activeOpenWrapper);
    }
  }

  handleDocumentClick(e) {
    if (this.activeOpenWrapper && !this.activeOpenWrapper.contains(e.target)) {
      this.close(this.activeOpenWrapper);
    }
  }

  handleDocumentKeydown(e) {
    if (e.key === 'Escape' && this.activeOpenWrapper) {
      const trigger = this.activeOpenWrapper.querySelector('.custom-select-trigger');
      this.close(this.activeOpenWrapper);
      trigger?.focus?.();
    }
  }
}

export const customDropdownManager = new CustomDropdownManager();
