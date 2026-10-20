/**
 * Utilidades para unificar la iconografía del sistema con Google Material Symbols.
 */

export const LEGACY_ICON_MAP = {
  '⌂': 'home',
  '✦': 'restaurant',
  '↗': 'directions_car',
  '▤': 'receipt_long',
  '♡': 'celebration',
  '◇': 'shopping_bag',
  '✚': 'medical_services',
  '◎': 'more_horiz',
  '↓': 'payments',
  '↶': 'replay',
  '◈': 'category',
  '💵': 'payments',
  '🏦': 'account_balance',
  '💳': 'credit_card',
  '📱': 'smartphone',
  '💎': 'diamond',
  '🪙': 'monetization_on',
  '💼': 'business_center',
  '🐾': 'pets',
  '🎮': 'sports_esports',
  '✈️': 'flight',
  '🎓': 'school'
};

/**
 * Traduce un ícono heredado o devuelve el nombre de Material Symbol válido.
 * @param {string} icon 
 * @param {string} defaultIcon 
 * @returns {string} Nombre del Material Symbol (ej. 'home', 'restaurant', 'credit_card')
 */
export function getMaterialIconName(icon, defaultIcon = 'category') {
  if (!icon) return defaultIcon;
  const clean = String(icon).trim();
  if (LEGACY_ICON_MAP[clean]) return LEGACY_ICON_MAP[clean];
  if (/^[a-z0-9_]+$/i.test(clean)) return clean;
  return defaultIcon;
}

/**
 * Genera el markup HTML para renderizar un Material Symbol.
 * @param {string} icon 
 * @param {string} defaultIcon 
 * @param {string} extraClass 
 * @returns {string} Elemento HTML <span class="material-symbols-rounded ...">name</span>
 */
export function iconHtml(icon, defaultIcon = 'category', extraClass = '') {
  const name = getMaterialIconName(icon, defaultIcon);
  const classes = extraClass ? `material-symbols-rounded ${extraClass}` : 'material-symbols-rounded';
  return `<span class="${classes}">${name}</span>`;
}
