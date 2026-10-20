/**
 * Constantes y valores por defecto del sistema Finanza.
 */

export const STORAGE_KEY_V2 = 'finanza_dashboard_v2';
export const STORAGE_KEY_V1 = 'finanza_dashboard_v1';
export const APP_VERSION = 2;

export const SUPPORTED_CURRENCIES = {
  COP: { code: 'COP', symbol: '$', name: 'Peso Colombiano (COP)', locale: 'es-CO', decimals: 0 },
  USD: { code: 'USD', symbol: '$', name: 'Dólar Estadounidense (USD)', locale: 'en-US', decimals: 2 },
  EUR: { code: 'EUR', symbol: '€', name: 'Euro (EUR)', locale: 'es-ES', decimals: 2 },
  MXN: { code: 'MXN', symbol: '$', name: 'Peso Mexicano (MXN)', locale: 'es-MX', decimals: 2 },
  ARS: { code: 'ARS', symbol: '$', name: 'Peso Argentino (ARS)', locale: 'es-AR', decimals: 2 },
  CLP: { code: 'CLP', symbol: '$', name: 'Peso Chileno (CLP)', locale: 'es-CL', decimals: 0 },
  PEN: { code: 'PEN', symbol: 'S/', name: 'Sol Peruano (PEN)', locale: 'es-PE', decimals: 2 },
  BRL: { code: 'BRL', symbol: 'R$', name: 'Real Brasileño (BRL)', locale: 'pt-BR', decimals: 2 }
};

export const DEFAULT_CATEGORIES = [
  { id: 'cat-home', name: 'Hogar', type: 'expense', color: '#3f3f46', icon: 'home', locked: false },
  { id: 'cat-food', name: 'Alimentación', type: 'expense', color: '#52525b', icon: 'restaurant', locked: false },
  { id: 'cat-transport', name: 'Transporte', type: 'expense', color: '#64748b', icon: 'directions_car', locked: false },
  { id: 'cat-bills', name: 'Servicios', type: 'expense', color: '#71717a', icon: 'receipt_long', locked: false },
  { id: 'cat-leisure', name: 'Ocio y salidas', type: 'expense', color: '#57534e', icon: 'celebration', locked: false },
  { id: 'cat-shopping', name: 'Compras', type: 'expense', color: '#78716c', icon: 'shopping_bag', locked: false },
  { id: 'cat-health', name: 'Salud', type: 'expense', color: '#475569', icon: 'medical_services', locked: false },
  { id: 'cat-other', name: 'Otros gastos', type: 'expense', color: '#8b95a5', icon: 'more_horiz', locked: false },
  { id: 'cat-salary', name: 'Salario', type: 'income', color: '#18181b', icon: 'payments', locked: false },
  { id: 'cat-extra', name: 'Ingresos extra', type: 'income', color: '#3f3f46', icon: 'trending_up', locked: false },
  { id: 'cat-refund', name: 'Reembolsos', type: 'income', color: '#64748b', icon: 'replay', locked: false }
];

export const DEFAULT_ACCOUNTS = [
  { id: 'acc-cash', name: 'Efectivo', type: 'cash', initialBalance: 0, color: '#52525b', icon: 'payments' },
  { id: 'acc-bank', name: 'Cuenta Bancaria Principal', type: 'bank', initialBalance: 0, color: '#18181b', icon: 'account_balance' },
  { id: 'acc-credit', name: 'Tarjeta de Crédito', type: 'credit', initialBalance: 0, color: '#71717a', icon: 'credit_card' },
  { id: 'acc-wallet', name: 'Billetera Digital', type: 'wallet', initialBalance: 0, color: '#64748b', icon: 'smartphone' }
];

export const PAYMENT_METHODS = [
  'Efectivo',
  'Débito',
  'Crédito',
  'Transferencia',
  'Billetera digital'
];

export const RECURRING_FREQUENCIES = {
  weekly: { id: 'weekly', label: 'Semanal', days: 7 },
  monthly: { id: 'monthly', label: 'Mensual', months: 1 },
  yearly: { id: 'yearly', label: 'Anual', years: 1 }
};

export const VIEW_TITLES = {
  dashboard: 'Resumen',
  transactions: 'Movimientos',
  accounts: 'Cuentas y Billeteras',
  budgets: 'Presupuestos',
  categories: 'Categorías',
  recurring: 'Gastos Recurrentes',
  settings: 'Configuración'
};
