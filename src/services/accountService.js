/**
 * src/services/accountService.js
 * Servicio contable para cuentas, billeteras y sub-entidades "Alcancías" (Pockets).
 * Implementa Safe Math (cálculos exactos en centavos), invariantes de balance
 * y trazabilidad en el libro de transacciones sin alterar el P&L general.
 */
import { store } from '../core/store.js';
import { currencyService } from './currencyService.js';

class AccountService {
  /**
   * Obtiene todas las cuentas activas (no eliminadas).
   * @returns {Array}
   */
  getAll() {
    return (store.accounts || []).filter(a => !a.deletedAt);
  }

  /**
   * Obtiene una cuenta por su identificador único.
   * @param {string} id
   * @returns {Object}
   */
  getById(id) {
    const acc = (store.accounts || []).find(a => a.id === id && !a.deletedAt);
    if (acc) return acc;

    return {
      id: 'unknown-account',
      name: 'Cuenta desconocida',
      type: 'bank',
      initialBalance: 0,
      pockets: [],
      color: '#64748b',
      icon: 'credit_card',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
      syncStatus: 'synced'
    };
  }

  /**
   * Calcula los saldos en tiempo real de una cuenta en centavos:
   * Invariante Contable:
   * Saldo Total de Cuenta = Saldo Disponible + Σ(Saldo de sus Alcancías)
   * @param {string} accountId
   * @returns {Object} { totalBalance, availableBalance, pockets: Array }
   */
  calculateBalances(accountId) {
    const account = this.getById(accountId);
    const initialBalance = Number(account.initialBalance) || 0; // en centavos

    // Mapeo inicial de alcancías activas
    const activePockets = (account.pockets || []).filter(p => !p.deletedAt);
    const pocketBalances = new Map();
    for (const pocket of activePockets) {
      pocketBalances.set(pocket.id, 0);
    }

    let availableBalance = initialBalance;
    let totalBalance = initialBalance;

    const txs = (store.transactions || []).filter(t => !t.deletedAt);

    for (const t of txs) {
      const amount = Number(t.amount) || 0; // en centavos

      // 1. Movimientos directos de la cuenta
      if (t.accountId === accountId) {
        if (t.type === 'income') {
          totalBalance += amount;
          if (t.pocketId && pocketBalances.has(t.pocketId)) {
            pocketBalances.set(t.pocketId, pocketBalances.get(t.pocketId) + amount);
          } else {
            availableBalance += amount;
          }
        } else if (t.type === 'expense') {
          totalBalance -= amount;
          if (t.pocketId && pocketBalances.has(t.pocketId)) {
            pocketBalances.set(t.pocketId, pocketBalances.get(t.pocketId) - amount);
          } else {
            availableBalance -= amount;
          }
        } else if (t.type === 'pocket_deposit') {
          // Fondos movidos desde el disponible hacia la alcancía
          if (t.pocketId && pocketBalances.has(t.pocketId)) {
            availableBalance -= amount;
            pocketBalances.set(t.pocketId, pocketBalances.get(t.pocketId) + amount);
            // El Saldo Total no cambia (movimiento interno de la misma cuenta)
          }
        } else if (t.type === 'pocket_withdraw') {
          // Fondos retirados de la alcancía hacia el disponible
          if (t.pocketId && pocketBalances.has(t.pocketId)) {
            availableBalance += amount;
            pocketBalances.set(t.pocketId, pocketBalances.get(t.pocketId) - amount);
            // El Saldo Total no cambia
          }
        } else if (t.type === 'pocket_adjustment') {
          // Fondeo Externo / Ajuste Inicial:
          // Suma a la Alcancía Y al Saldo Total de la cuenta padre, SIN descontar del Saldo Disponible.
          if (t.pocketId && pocketBalances.has(t.pocketId)) {
            totalBalance += amount;
            pocketBalances.set(t.pocketId, pocketBalances.get(t.pocketId) + amount);
            // availableBalance queda intacto (invariante contable se preserva)
          }
        }
      }

      // 2. Transferencias entre cuentas
      if (t.type === 'transfer') {
        if (t.toAccountId === accountId) {
          totalBalance += amount;
          availableBalance += amount;
        }
        if (t.fromAccountId === accountId) {
          totalBalance -= amount;
          availableBalance -= amount;
        }
      }
    }

    // Estructurar alcancías con su progreso y saldo actual
    const calculatedPockets = activePockets.map(p => {
      const currentBalance = pocketBalances.get(p.id) || 0;
      const target = Number(p.targetAmount) || 0;
      const progressPercent = target > 0 ? Math.min(100, Math.round((currentBalance / target) * 100)) : 0;

      return {
        ...p,
        currentBalance,
        progressPercent
      };
    });

    return {
      accountId,
      initialBalance,
      totalBalance,
      availableBalance,
      pockets: calculatedPockets
    };
  }

  /**
   * Obtiene el saldo actual de una alcancía específica en centavos.
   * @param {string} accountId
   * @param {string} pocketId
   * @returns {number} Saldo en centavos.
   */
  getPocketBalance(accountId, pocketId) {
    const balances = this.calculateBalances(accountId);
    const pocket = balances.pockets.find(p => p.id === pocketId);
    return pocket ? pocket.currentBalance : 0;
  }

  /**
   * Retorna todas las cuentas con sus métricas calculadas en centavos.
   * @returns {Array}
   */
  getAccountsWithBalances() {
    return this.getAll().map(acc => {
      const balanceData = this.calculateBalances(acc.id);
      return {
        ...acc,
        currentBalance: balanceData.totalBalance,
        availableBalance: balanceData.availableBalance,
        calculatedPockets: balanceData.pockets
      };
    });
  }

  /**
   * Calcula el patrimonio neto consolidado en centavos.
   * Respeta la invariante: las alcancías no alteran el patrimonio, están sumadas en totalBalance.
   * @returns {number} Centavos.
   */
  getNetWorth() {
    return this.getAccountsWithBalances().reduce(
      (sum, acc) => sum + acc.currentBalance,
      0
    );
  }

  /**
   * Guarda o actualiza una cuenta bancaria / billetera.
   * @param {Object} accountData
   * @returns {Object}
   */
  saveAccount({ id, name, type, initialBalance, color, icon }) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return { success: false, error: 'El nombre de la cuenta es obligatorio.' };
    }

    // Conversión segura de saldo inicial a centavos
    const balanceInCents = currencyService.toCents(initialBalance);
    const now = Date.now();
    const accounts = store.accounts || [];

    if (id) {
      const existing = accounts.find(a => a.id === id);
      if (!existing) {
        return { success: false, error: 'Cuenta no encontrada.' };
      }

      const updated = accounts.map(a =>
        a.id === id
          ? {
              ...a,
              name: trimmedName,
              type: type || a.type,
              initialBalance: balanceInCents,
              color: color || a.color,
              icon: icon || a.icon,
              updatedAt: now,
              syncStatus: 'pending'
            }
          : a
      );

      store.setState({ accounts: updated }, 'account:updated');
      return { success: true };
    } else {
      const newAccount = {
        id: `acc-${now}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmedName,
        type: type || 'bank',
        initialBalance: balanceInCents,
        pockets: [],
        color: color || '#18181b',
        icon: icon || 'account_balance',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending'
      };

      store.setState({ accounts: [...accounts, newAccount] }, 'account:created');
      return { success: true, account: newAccount };
    }
  }

  /**
   * Elimina una cuenta (Soft Delete) si no tiene transacciones activas.
   * @param {string} id
   * @returns {Object}
   */
  deleteAccount(id) {
    const activeAccounts = this.getAll();
    if (activeAccounts.length <= 1) {
      return { success: false, error: 'Debe conservar al menos una cuenta activa.' };
    }

    const hasTx = (store.transactions || []).some(
      t => !t.deletedAt && (t.accountId === id || t.fromAccountId === id || t.toAccountId === id)
    );

    if (hasTx) {
      return {
        success: false,
        error: 'Esta cuenta tiene movimientos o transferencias asociadas. Elimínelos o reasígnelos primero.'
      };
    }

    const now = Date.now();
    const updated = (store.accounts || []).map(a =>
      a.id === id ? { ...a, deletedAt: now, updatedAt: now, syncStatus: 'pending' } : a
    );

    store.setState({ accounts: updated }, 'account:deleted');
    return { success: true };
  }

  // ==========================================
  // GESTIÓN DE ALCANCÍAS (POCKETS)
  // ==========================================

  /**
   * Crea una nueva alcancía dentro de una cuenta.
   * @param {string} accountId
   * @param {Object} pocketData { name, targetAmount, color, icon }
   * @returns {Object}
   */
  createPocket(accountId, { name, targetAmount, color, icon }) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      return { success: false, error: 'El nombre de la alcancía es obligatorio.' };
    }

    const account = this.getById(accountId);
    if (!account || account.id === 'unknown-account') {
      return { success: false, error: 'Cuenta padre no encontrada.' };
    }

    const now = Date.now();
    const newPocket = {
      id: `pock-${now}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      targetAmount: currencyService.toCents(targetAmount), // en centavos
      color: color || '#3f3f46',
      icon: icon || 'savings',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending'
    };

    const updatedAccounts = (store.accounts || []).map(a => {
      if (a.id === accountId) {
        return {
          ...a,
          pockets: [...(a.pockets || []), newPocket],
          updatedAt: now,
          syncStatus: 'pending'
        };
      }
      return a;
    });

    store.setState({ accounts: updatedAccounts }, 'pocket:created');
    return { success: true, pocket: newPocket };
  }

  /**
   * Actualiza los datos de una alcancía existente.
   * @param {string} accountId
   * @param {string} pocketId
   * @param {Object} pocketData
   * @returns {Object}
   */
  updatePocket(accountId, pocketId, { name, targetAmount, color, icon }) {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      return { success: false, error: 'El nombre de la alcancía no puede estar vacío.' };
    }

    const now = Date.now();
    const updatedAccounts = (store.accounts || []).map(a => {
      if (a.id === accountId) {
        const pockets = (a.pockets || []).map(p => {
          if (p.id === pocketId) {
            return {
              ...p,
              name: trimmed,
              targetAmount: currencyService.toCents(targetAmount),
              color: color || p.color,
              icon: icon || p.icon,
              updatedAt: now,
              syncStatus: 'pending'
            };
          }
          return p;
        });
        return { ...a, pockets, updatedAt: now, syncStatus: 'pending' };
      }
      return a;
    });

    store.setState({ accounts: updatedAccounts }, 'pocket:updated');
    return { success: true };
  }

  /**
   * Elimina una alcancía (Soft Delete).
   * Si la alcancía aún tiene saldo positivo (balance > 0), dicho monto se traslada automáticamente
   * de regreso al Saldo Disponible de la cuenta padre mediante una transacción interna 'pocket_withdraw',
   * manteniendo la invariante de que el Saldo Total de la cuenta no se altera.
   * @param {string} accountId
   * @param {string} pocketId
   * @returns {Object}
   */
  deletePocket(accountId, pocketId) {
    const balances = this.calculateBalances(accountId);
    const pocket = balances.pockets.find(p => p.id === pocketId);
    if (!pocket) {
      return { success: false, error: 'Alcancía no encontrada.' };
    }

    const pocketBalance = pocket.currentBalance || 0;
    const now = Date.now();
    let newTransactions = store.transactions || [];

    // Si la alcancía tiene saldo, retornarlo íntegro al disponible sin alterar el total
    if (pocketBalance > 0) {
      const returnTx = {
        id: `tx-pkw-${now}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'pocket_withdraw',
        title: `Liquidación de alcancía: ${pocket.name}`,
        amount: pocketBalance,
        date: new Date().toISOString().slice(0, 10),
        accountId,
        pocketId,
        categoryId: 'cat-extra',
        method: 'Bolsillo',
        note: 'Retorno automático de fondos al disponible por eliminación de alcancía',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending'
      };
      newTransactions = [returnTx, ...newTransactions];
    }

    // Soft delete de la alcancía
    const updatedAccounts = (store.accounts || []).map(a => {
      if (a.id === accountId) {
        const pockets = (a.pockets || []).map(p =>
          p.id === pocketId ? { ...p, deletedAt: now, updatedAt: now, syncStatus: 'pending' } : p
        );
        return { ...a, pockets, updatedAt: now, syncStatus: 'pending' };
      }
      return a;
    });

    store.setState(
      { accounts: updatedAccounts, transactions: newTransactions },
      'pocket:deleted'
    );

    return {
      success: true,
      releasedBalance: pocketBalance
    };
  }

  /**
   * Mueve fondos hacia la Alcancía.
   * Si isExternalFunding es false: mueve fondos del Saldo Disponible hacia la Alcancía (pocket_deposit).
   * Si isExternalFunding es true: realiza un Fondeo Externo / Ajuste Inicial sumando al total de la cuenta
   * y a la alcancía sin descontar del disponible (pocket_adjustment).
   * @param {string} accountId
   * @param {string} pocketId
   * @param {number|string} amount
   * @param {string} [note='']
   * @param {boolean} [isExternalFunding=false]
   * @returns {Object}
   */
  depositToPocket(accountId, pocketId, amount, note = '', isExternalFunding = false) {
    const amountInCents = currencyService.toCents(amount);
    if (amountInCents <= 0) {
      return { success: false, error: 'El monto a asignar debe ser mayor a cero.' };
    }

    const balances = this.calculateBalances(accountId);
    const pocket = balances.pockets.find(p => p.id === pocketId);
    if (!pocket) {
      return { success: false, error: 'Alcancía no encontrada.' };
    }

    if (!isExternalFunding && balances.availableBalance < amountInCents) {
      return {
        success: false,
        error: `Saldo disponible insuficiente. Disponible: ${currencyService.format(balances.availableBalance)}.`
      };
    }

    const now = Date.now();
    const type = isExternalFunding ? 'pocket_adjustment' : 'pocket_deposit';
    const title = isExternalFunding
      ? `Fondeo externo a alcancía: ${pocket.name}`
      : `Aporte a alcancía: ${pocket.name}`;
    const defaultNote = isExternalFunding ? 'Fondeo externo / Ajuste inicial' : 'Asignación a alcancía';
    const idPrefix = isExternalFunding ? 'tx-pka' : 'tx-pkd';

    const internalTx = {
      id: `${idPrefix}-${now}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      title,
      amount: amountInCents,
      date: new Date().toISOString().slice(0, 10),
      accountId,
      pocketId,
      categoryId: 'cat-extra',
      method: isExternalFunding ? 'Fondeo Externo' : 'Bolsillo',
      note: note ? note.trim() : defaultNote,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending'
    };

    store.setState(
      state => ({ transactions: [internalTx, ...(state.transactions || [])] }),
      isExternalFunding ? 'pocket:adjustment' : 'pocket:deposit'
    );

    return { success: true, transaction: internalTx };
  }

  /**
   * Retira fondos de la Alcancía hacia el Saldo Disponible (Sacar dinero).
   * Genera un movimiento interno `pocket_withdraw` que no altera ingresos, gastos ni presupuestos.
   * @param {string} accountId
   * @param {string} pocketId
   * @param {number|string} amount
   * @param {string} [note='']
   * @returns {Object}
   */
  withdrawFromPocket(accountId, pocketId, amount, note = '') {
    const amountInCents = currencyService.toCents(amount);
    if (amountInCents <= 0) {
      return { success: false, error: 'El monto a retirar debe ser mayor a cero.' };
    }

    const pocketBalance = this.getPocketBalance(accountId, pocketId);
    if (pocketBalance < amountInCents) {
      return {
        success: false,
        error: `Fondos insuficientes en la alcancía. Saldo en alcancía: ${currencyService.format(pocketBalance)}.`
      };
    }

    const balances = this.calculateBalances(accountId);
    const pocket = balances.pockets.find(p => p.id === pocketId);
    const now = Date.now();

    const internalTx = {
      id: `tx-pkw-${now}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'pocket_withdraw',
      title: `Retiro de alcancía: ${pocket?.name || 'Alcancía'}`,
      amount: amountInCents,
      date: new Date().toISOString().slice(0, 10),
      accountId,
      pocketId,
      categoryId: 'cat-extra',
      method: 'Bolsillo',
      note: note ? note.trim() : 'Retiro a disponible',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending'
    };

    store.setState(
      state => ({ transactions: [internalTx, ...(state.transactions || [])] }),
      'pocket:withdraw'
    );

    return { success: true, transaction: internalTx };
  }

  /**
   * Registra una transferencia entre dos cuentas sin afectar ingresos o gastos globales.
   * Valida saldo disponible en la cuenta origen.
   * @param {Object} transferData { fromAccountId, toAccountId, amount, date, note }
   * @returns {Object}
   */
  transfer({ fromAccountId, toAccountId, amount, date, note }) {
    const amountInCents = currencyService.toCents(amount);
    if (amountInCents <= 0) {
      return { success: false, error: 'El monto de la transferencia debe ser mayor a cero.' };
    }
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      return { success: false, error: 'Seleccione cuentas de origen y destino diferentes.' };
    }

    const fromAcc = this.getById(fromAccountId);
    const toAcc = this.getById(toAccountId);
    const fromBalances = this.calculateBalances(fromAccountId);

    if (fromBalances.availableBalance < amountInCents) {
      return {
        success: false,
        error: `Saldo disponible insuficiente en "${fromAcc.name}". Disponible: ${currencyService.format(fromBalances.availableBalance)}.`
      };
    }

    const now = Date.now();
    const transferTx = {
      id: `tx-tr-${now}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'transfer',
      title: `Transferencia: ${fromAcc.name} → ${toAcc.name}`,
      amount: amountInCents,
      date: date || new Date().toISOString().slice(0, 10),
      fromAccountId,
      toAccountId,
      accountId: fromAccountId,
      pocketId: null,
      categoryId: 'cat-extra',
      method: 'Transferencia',
      note: note ? note.trim() : '',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      syncStatus: 'pending'
    };

    store.setState(
      state => ({ transactions: [transferTx, ...(state.transactions || [])] }),
      'transfer:completed'
    );

    return { success: true, transaction: transferTx };
  }
}

export const accountService = new AccountService();
