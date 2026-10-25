/**
 * src/ui/amountFormatter.js
 * Máscara y formateador en tiempo real para campos de entrada monetaria en FinScope.
 * 
 * Reglas de diseño y usabilidad:
 * 1. NO asume decimales automáticamente. Las cifras enteras se formatean con separador de miles latino (.) libremente.
 * 2. La coma decimal (,) SOLO se añade si el usuario la teclea explícitamente (ej. ,50 -> 225.000,50).
 * 3. Máximo 2 decimales.
 * 4. El cursor se mantiene exactamente en la posición esperada durante la inserción o borrado intermedio.
 * 5. Si el usuario teclea '.' en el teclado o numpad, se normaliza como coma decimal (,) si no existe una ya.
 * 6. Preserva la compatibilidad exacta con currencyService.toCents().
 */

/**
 * Formatea un valor numérico o cadena de texto para su presentación.
 * Soporta números nativos (ej: 19.99 -> "19,99"; 225000 -> "225.000")
 * y cadenas de texto existentes.
 * 
 * @param {string|number} value
 * @param {boolean} [preserveTrailingComma=false]
 * @returns {string}
 */
export function formatAmountValue(value, preserveTrailingComma = false) {
  if (value === null || value === undefined || value === '') return '';

  let str = String(value).trim();
  if (!str) return '';

  // Limpiar cualquier símbolo de moneda ($) o espacios accidentales
  str = str.replace(/[$€£S\/\s]/g, '');
  if (!str) return '';

  const hasTrailingComma = preserveTrailingComma && str.endsWith(',');

  let integerPartRaw = '';
  let decimalPartRaw = null;

  if (str.includes(',')) {
    // Si contiene coma, la coma es el separador decimal explícito
    const parts = str.split(',');
    integerPartRaw = parts[0].replace(/\D/g, '');
    decimalPartRaw = parts.slice(1).join('').replace(/\D/g, '').slice(0, 2);
  } else if (typeof value === 'number') {
    // Valor numérico nativo de JavaScript (ej. 19.99 o 225000)
    const numStr = value.toString();
    if (numStr.includes('.')) {
      const parts = numStr.split('.');
      integerPartRaw = parts[0].replace(/\D/g, '');
      decimalPartRaw = parts[1].replace(/\D/g, '').slice(0, 2);
    } else {
      integerPartRaw = numStr.replace(/\D/g, '');
    }
  } else if (str.includes('.')) {
    // Cadena con punto: evaluar si es separador de miles o punto decimal importado
    const dotParts = str.split('.');
    if (dotParts.length > 2) {
      // Múltiples puntos son siempre separadores de miles (ej: 1.000.000)
      integerPartRaw = str.replace(/\D/g, '');
    } else if (dotParts.length === 2) {
      // Un solo punto: si tiene 3 dígitos a la derecha y 1 a 3 a la izquierda, es miles latino (ej: 225.000)
      if (dotParts[1].length === 3 && dotParts[0].length >= 1 && dotParts[0].length <= 3) {
        integerPartRaw = str.replace(/\D/g, '');
      } else {
        // Formato anglosajón importado (ej: 19.99 o 12.5)
        integerPartRaw = dotParts[0].replace(/\D/g, '');
        decimalPartRaw = dotParts[1].replace(/\D/g, '').slice(0, 2);
      }
    }
  } else {
    // Solo dígitos enteros
    integerPartRaw = str.replace(/\D/g, '');
  }

  // Quitar ceros a la izquierda no significativos (ej. "05" -> "5", pero "0" se respeta)
  if (integerPartRaw.length > 1 && integerPartRaw.startsWith('0')) {
    integerPartRaw = integerPartRaw.replace(/^0+/, '') || '0';
  }

  if (!integerPartRaw && decimalPartRaw === null && !hasTrailingComma) {
    return '';
  }

  // Formatear la parte entera con separadores de miles (.)
  const formattedInt = (integerPartRaw || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (decimalPartRaw !== null && decimalPartRaw !== '') {
    return `${formattedInt},${decimalPartRaw}`;
  }
  if (hasTrailingComma || (str.includes(',') && decimalPartRaw === '')) {
    return `${formattedInt},`;
  }

  return formattedInt;
}

/**
 * Formatea el valor crudo del input durante la interacción del usuario en tiempo real.
 * Durante la escritura interactiva:
 * - Todos los puntos (.) existentes en el input son separadores de miles generados por la máscara.
 * - La coma (,) es el ÚNICO separador decimal.
 * 
 * @param {string} raw
 * @returns {string}
 */
function formatLiveInput(raw) {
  if (!raw) return '';

  // Limpiar caracteres no válidos (solo dígitos, coma y punto)
  let clean = raw.replace(/[$€£S\/\s]/g, '');
  if (!clean) return '';

  const hasComma = clean.includes(',');

  if (!hasComma) {
    // Es un entero puro (los puntos que tenga son de miles previos)
    const digitsOnly = clean.replace(/\D/g, '');
    if (!digitsOnly) return '';

    // Evitar ceros a la izquierda superfluos (salvo "0")
    let trimmedDigits = digitsOnly;
    if (trimmedDigits.length > 1 && trimmedDigits.startsWith('0')) {
      trimmedDigits = trimmedDigits.replace(/^0+/, '') || '0';
    }

    return trimmedDigits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // Tiene coma decimal explícita
  const commaIndex = clean.indexOf(',');
  const integerPartRaw = clean.slice(0, commaIndex).replace(/\D/g, '');
  const decimalPartRaw = clean.slice(commaIndex + 1).replace(/\D/g, '').slice(0, 2);

  let trimmedInt = integerPartRaw;
  if (trimmedInt.length > 1 && trimmedInt.startsWith('0')) {
    trimmedInt = trimmedInt.replace(/^0+/, '') || '0';
  }

  const formattedInt = (trimmedInt || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (commaIndex === clean.length - 1 || decimalPartRaw.length === 0) {
    return `${formattedInt},`;
  }

  return `${formattedInt},${decimalPartRaw}`;
}

/**
 * Vincula la máscara interactiva en vivo a un elemento input.
 * Se encarga de formatear al escribir, normalizar puntos a comas y
 * mantener la posición exacta del cursor.
 * 
 * @param {HTMLInputElement} input
 */
export function applyLiveAmountMask(input) {
  if (!input || input._hasAmountMask) return;
  input._hasAmountMask = true;

  // Interceptar tecla '.' o ',' en teclado físico
  input.addEventListener('keydown', (e) => {
    // Si presiona '.' o ',', normalizar a coma decimal
    if (e.key === '.' || e.key === ',') {
      e.preventDefault();
      const val = input.value || '';
      if (val.includes(',')) return; // ya existe una coma decimal

      const start = input.selectionStart ?? val.length;
      const end = input.selectionEnd ?? val.length;
      const newVal = val.slice(0, start) + ',' + val.slice(end);

      input.value = newVal;
      const nextPos = start + 1;
      input.setSelectionRange(nextPos, nextPos);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    // Si presiona Backspace justo después de un punto de miles (.), borrar el dígito anterior
    if (e.key === 'Backspace' && input.selectionStart === input.selectionEnd) {
      const pos = input.selectionStart;
      if (pos > 0 && input.value[pos - 1] === '.') {
        e.preventDefault();
        const val = input.value;
        const newVal = val.slice(0, pos - 2) + val.slice(pos - 1);
        input.value = newVal;
        const nextPos = Math.max(0, pos - 2);
        input.setSelectionRange(nextPos, nextPos);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  // Interceptar '.' en teclados móviles o virtuales mediante beforeinput
  input.addEventListener('beforeinput', (e) => {
    if (e.data === '.' || e.data === ',') {
      e.preventDefault();
      const val = input.value || '';
      if (val.includes(',')) return;

      const start = input.selectionStart ?? val.length;
      const end = input.selectionEnd ?? val.length;
      const newVal = val.slice(0, start) + ',' + val.slice(end);

      input.value = newVal;
      const nextPos = start + 1;
      input.setSelectionRange(nextPos, nextPos);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  // Manejo de pegado (paste)
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    const formatted = formatAmountValue(pasted);
    input.value = formatted;
    input.setSelectionRange(formatted.length, formatted.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // Evento input para formateo en tiempo real y posicionamiento del cursor
  input.addEventListener('input', () => {
    const rawVal = input.value;
    const oldCursor = input.selectionStart || 0;

    // Contar caracteres de contenido significativos (dígitos y coma decimal) antes del cursor
    let contentCharsBefore = 0;
    for (let i = 0; i < oldCursor; i++) {
      const ch = rawVal[i];
      if (/\d/.test(ch) || ch === ',') {
        contentCharsBefore++;
      }
    }

    const formatted = formatLiveInput(rawVal);
    input.value = formatted;

    // Recalcular posición del cursor en base a los caracteres de contenido
    let newCursor = 0;
    let counted = 0;
    for (let i = 0; i < formatted.length; i++) {
      const ch = formatted[i];
      if (/\d/.test(ch) || ch === ',') {
        counted++;
      }
      if (counted === contentCharsBefore) {
        newCursor = i + 1;
        break;
      }
    }

    if (counted < contentCharsBefore || newCursor === 0) {
      newCursor = formatted.length;
    }

    try {
      input.setSelectionRange(newCursor, newCursor);
    } catch {
      // Ignorar en entornos donde selectionRange no aplique
    }
  });
}

/**
 * Vincula la máscara en vivo a todos los campos monetarios del sistema.
 */
export function initAmountInputs() {
  const targetIds = [
    'transactionAmount',
    'transferAmount',
    'budgetLimit',
    'accountInitialBalance',
    'pocketTargetAmount',
    'pocketActionAmount',
    'recurringAmount',
    'reassignAmount'
  ];

  targetIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) applyLiveAmountMask(el);
  });

  document.querySelectorAll('.amount-input').forEach(el => {
    applyLiveAmountMask(el);
  });
}
