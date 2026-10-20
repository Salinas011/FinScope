/**
 * Servicio para la gestión de cuentas y billeteras (múltiples cuentas, saldos y transferencias).
 */
import { store } from '../core/store.js';

class AccountService {
  /**
   * Obtiene todas las cuentas registradas.
   */
  getAll() {
    return store.accounts;
  }

  /**
   * Obtiene una cuenta por su ID.
   */
  getById(id) {
    return (
      store.accounts.find(a => a.id === id) || {
        id: 'unknown-account',
        name: 'Cuenta desconocida',
        type: 'bank',
        initialBalance: 0,
        color: '#64748b',
        icon: '💳'
      }
    );
  }

  /**
   * Calcula el saldo en tiempo real de una cuenta en particular.
   * Saldo = Balance inicial + Ingresos - Gastos + Transferencias entrantes - Transferencias salientes.
   */
  calculateBalance(accountId) {
    const account = this.getById(accountId);
    let balance = Number(account.initialBalance) || 0;

    const txs = store.transactions;
    for (const t of txs) {
      const amount = Number(t.amount) || 0;
      if (t.type === 'income' && t.accountId === accountId) {
        balance += amount;
      } else if (t.type === 'expense' && t.accountId === accountId) {
        balance -= amount;
      } else if (t.type === 'transfer') {
        if (t.toAccountId === accountId) {
          balance += amount;
        }
        if (t.fromAccountId === accountId) {
          balance -= amount;
        }
      }
    }

    return balance;
  }

  /**
   * Obtiene todas las cuentas con sus saldos calculados.
   */
  getAccountsWithBalances() {
    return store.accounts.map(acc => ({
      ...acc,
      currentBalance: this.calculateBalance(acc.id)
    }));
  }

  /**
   * Calcula el patrimonio neto consolidado (suma de saldos de todas las cuentas).
   */
  getNetWorth() {
    return this.getAccountsWithBalances().reduce(
      (total, acc) => total + acc.currentBalance,
      0
    );
  }

  /**
   * Crea o actualiza una cuenta.
   */
  saveAccount({ id, name, type, initialBalance, color, icon }) {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return { success: false, error: 'El nombre de la cuenta es obligatorio.' };
    }

    const accounts = store.accounts;
    const balanceNum = Number(initialBalance) || 0;

    if (id) {
      const existing = accounts.find(a => a.id === id);
      if (!existing) {
        return { success: false, error: 'Cuenta no encontrada.' };
      }

      const updated = accounts.map(a =>
        a.id === id
          ? { ...a, name: trimmedName, type, initialBalance: balanceNum, color, icon }
          : a
      );
      store.setState({ accounts: updated }, 'account:updated');
      return { success: true };
    } else {
      const newAccount = {
        id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: trimmedName,
        type: type || 'bank',
        initialBalance: balanceNum,
        color: color || '#18181b',
        icon: icon || '🏦'
      };

      store.setState({ accounts: [...accounts, newAccount] }, 'account:created');
      return { success: true, account: newAccount };
    }
  }

  /**
   * Elimina una cuenta si no tiene movimientos asociados.
   */
  deleteAccount(id) {
    if (store.accounts.length <= 1) {
      return { success: false, error: 'Debe conservar al menos una cuenta activa.' };
    }

    const hasTx = store.transactions.some(
      t => t.accountId === id || t.fromAccountId === id || t.toAccountId === id
    );

    if (hasTx) {
      return {
        success: false,
        error: 'Esta cuenta tiene movimientos o transferencias asociadas. Trasládelos o elimínelos primero.'
      };
    }

    const filtered = store.accounts.filter(a => a.id !== id);
    store.setState({ accounts: filtered }, 'account:deleted');
    return { success: true };
  }

  /**
   * Registra una transferencia entre dos cuentas sin afectar ingresos o gastos globales.
   */
  transfer({ fromAccountId, toAccountId, amount, date, note }) {
    const amountNum = Number(amount) || 0;
    if (amountNum <= 0) {
      return { success: false, error: 'El monto de la transferencia debe ser mayor a cero.' };
    }
    if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) {
      return { success: false, error: 'Seleccione cuentas de origen y destino diferentes.' };
    }

    const fromAcc = this.getById(fromAccountId);
    const toAcc = this.getById(toAccountId);

    const transferTx = {
      id: `tx-tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: 'transfer',
      title: `Transferencia: ${fromAcc.name} → ${toAcc.name}`,
      amount: Math.round(amountNum),
      date: date || new Date().toISOString().slice(0, 10),
      fromAccountId,
      toAccountId,
      categoryId: 'cat-extra',
      method: 'Transferencia',
      note: note ? note.trim() : '',
      createdAt: Date.now()
    };

    store.setState(
      state => ({ transactions: [transferTx, ...state.transactions] }),
      'transfer:completed'
    );

    return { success: true, transaction: transferTx };
  }
}

export const accountService = new AccountService();
