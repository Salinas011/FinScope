/**
 * src/ui/amountFormatter.js
 * Máscara y formateador en tiempo real para campos de entrada monetaria.
 * Aplica formato con separadores de miles (.) y decimales (,) preservando
 * la posición exacta del cursor en dispositivos de escritorio y móviles.
 */

/**
 * Formatea un valor numérico o cadena de texto con separador de miles (.) y decimales (,).
 * Ejemplos:
 *  "225000" -> "225.000"
 *  "225000,50" -> "225.000,50"
 *  "225000.50" -> "225.000,50"
 *  "1250.5" -> "1.250,50"
 *  1999 -> "19,99" (si viene en unidades mayores 19.99 -> "19,99")
 * @param {string|number} value
 * @returns {string}
 */
export function formatAmountValue(value) {
  if (value === null || value === undefined || value === '') return '';
  let str = String(value).trim();
  if (!str) return '';

  let integerPart = '';
  let decimalPart = null;

  const hasComma = str.includes(',');
  const hasDot = str.includes('.');

  if (hasComma && hasDot) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // Formato latino: 1.250,50 -> punto miles, coma decimal
      const parts = str.split(',');
      integerPart = parts[0].replace(/\D/g, '');
      decimalPart = parts.slice(1).join('').replace(/\D/g, '').slice(0, 2);
    } else {
      // Formato anglosajón: 1,250.50 -> coma miles, punto decimal
      const parts = str.split('.');
      integerPart = parts[0].replace(/\D/g, '');
      decimalPart = parts.slice(1).join('').replace(/\D/g, '').slice(0, 2);
    }
  } else if (hasComma) {
    const parts = str.split(',');
    integerPart = parts[0].replace(/\D/g, '');
    decimalPart = parts.slice(1).join('').replace(/\D/g, '').slice(0, 2);
  } else if (hasDot) {
    const dotParts = str.split('.');
    if (dotParts.length > 2) {
      // Múltiples puntos -> miles (ej: 1.000.000)
      integerPart = str.replace(/\D/g, '');
    } else if (dotParts.length === 2 && dotParts[1].length === 3 && dotParts[0].length >= 1 && dotParts[0].length <= 3) {
      // Miles latinos con un punto y 3 dígitos (ej: 225.000)
      integerPart = str.replace(/\D/g, '');
    } else {
      // Punto decimal ingresado (ej: "19.99" o "15.5")
      integerPart = dotParts[0].replace(/\D/g, '');
      decimalPart = dotParts[1].replace(/\D/g, '').slice(0, 2);
    }
  } else {
    integerPart = str.replace(/\D/g, '');
  }

  // Quitar ceros a la izquierda no significativos (ej. "05" -> "5", pero "0" se respeta)
  if (integerPart.length > 1 && integerPart.startsWith('0')) {
    integerPart = integerPart.replace(/^0+/, '') || '0';
  }

  if (!integerPart && decimalPart === null) return '';

  const formattedInt = (integerPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (decimalPart !== null) {
    return `${formattedInt},${decimalPart}`;
  }
  return formattedInt;
}

/**
 * Vincula la máscara interactiva en vivo a un elemento input.
 * Se encarga de formatear al escribir y mantener la posición correcta del cursor.
 * @param {HTMLInputElement} input
 */
export function applyLiveAmountMask(input) {
  if (!input || input._hasAmountMask) return;
  input._hasAmountMask = true;

  input.addEventListener('input', () => {
    const rawVal = input.value;
    const oldCursor = input.selectionStart || 0;

    // Contar cuántos caracteres de contenido (dígitos y separadores decimales) había antes del cursor
    let contentCharsBefore = 0;
    for (let i = 0; i < oldCursor; i++) {
      const ch = rawVal[i];
      if (/\d/.test(ch) || ch === ',' || ch === '.') {
        contentCharsBefore++;
      }
    }

    // Si el usuario escribe un punto después de números en teclados móviles, convertirlo en coma decimal
    let workingVal = rawVal;
    const commaCount = (workingVal.match(/,/g) || []).length;
    if (workingVal.endsWith('.') && commaCount === 0) {
      workingVal = workingVal.slice(0, -1) + ',';
    }

    const formatted = formatAmountValue(workingVal);
    input.value = formatted;

    // Recalcular posición del cursor basada en los caracteres de contenido
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

    if (counted < contentCharsBefore) {
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
    'recurringAmount'
  ];

  targetIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) applyLiveAmountMask(el);
  });

  document.querySelectorAll('.amount-input').forEach(el => {
    applyLiveAmountMask(el);
  });
}
