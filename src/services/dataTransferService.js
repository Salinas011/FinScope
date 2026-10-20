/**
 * src/services/dataTransferService.js
 * Servicio de exportación e importación de datos v3 (JSON y CSV con validaciones).
 * Soporta esquema v3 completo (cuentas con pockets, metadatos LWW), Safe Math en centavos
 * y persistencia directa en IndexedDB y Store.
 */
import { store } from '../core/store.js';
import { categoryService } from './categoryService.js';
import { accountService } from './accountService.js';
import { currencyService } from './currencyService.js';
import { StorageService } from '../core/storage.js';
import { APP_VERSION } from '../core/constants.js';

class DataTransferService {
  /**
   * Descarga un archivo en el navegador.
   * @param {string} filename
   * @param {string} content
   * @param {string} mimeType
   */
  download(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Exporta el estado completo a JSON bajo el esquema v3 (incluyendo pockets y metadatos LWW).
   * @returns {{success: boolean}}
   */
  exportBackupJSON() {
    const state = store.getState();
    const payload = {
      ...state,
      version: APP_VERSION,
      exportedAt: new Date().toISOString()
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    this.download(`finscope-respaldo-v3-${dateStr}.json`, jsonString, 'application/json');
    return { success: true };
  }

  /**
   * Importa y valida un respaldo JSON, normalizando al esquema v3 y persistiendo en IndexedDB.
   * @param {string} jsonString
   * @param {'replace'|'merge'} [mode='replace']
   * @returns {Promise<{success: boolean, count?: number, error?: string}>}
   */
  async importBackupJSON(jsonString, mode = 'replace') {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: 'El archivo JSON no tiene un formato válido.' };
      }

      if (!Array.isArray(parsed.transactions) && !Array.isArray(parsed.categories)) {
        return { success: false, error: 'El archivo no contiene un esquema de FinScope compatible.' };
      }

      // Normalizar esquema v3: si el respaldo era v1 o v2, aplicar pipeline
      let normalizedState = parsed;
      if (!parsed.version || parsed.version < 3) {
        let intermediateV2 = parsed;
        if (parsed.version === 1 || !parsed.version) {
          intermediateV2 = StorageService.migrateV1ToV2(parsed);
        }
        normalizedState = StorageService.migrateV2ToV3(intermediateV2);
      }

      if (mode === 'replace') {
        await store.replaceState(normalizedState);
        return { success: true, count: normalizedState.transactions?.length || 0 };
      } else {
        // Modo fusión: unir entidades evitando duplicados por ID
        const current = store.getState();
        const existingTxIds = new Set(current.transactions.map(t => t.id));
        const newTxs = (normalizedState.transactions || []).filter(t => !existingTxIds.has(t.id));

        const existingAccIds = new Set(current.accounts.map(a => a.id));
        const newAccs = (normalizedState.accounts || []).filter(a => !existingAccIds.has(a.id));

        const existingCatNames = new Set(
          current.categories.map(c => `${c.name}-${c.type}`.toLowerCase())
        );
        const newCats = (normalizedState.categories || []).filter(
          c => !existingCatNames.has(`${c.name}-${c.type}`.toLowerCase())
        );

        const existingBudgetIds = new Set((current.budgets || []).map(b => b.id));
        const newBudgets = (normalizedState.budgets || []).filter(b => !existingBudgetIds.has(b.id));

        const existingRecIds = new Set((current.recurring || []).map(r => r.id));
        const newRecs = (normalizedState.recurring || []).filter(r => !existingRecIds.has(r.id));

        const mergedState = {
          accounts: [...current.accounts, ...newAccs],
          categories: [...current.categories, ...newCats],
          transactions: [...newTxs, ...current.transactions],
          budgets: [...(current.budgets || []), ...newBudgets],
          recurring: [...(current.recurring || []), ...newRecs]
        };

        store.setState(mergedState, 'data:merged');
        return { success: true, count: newTxs.length };
      }
    } catch (error) {
      console.error('[DataTransferService] Error importando JSON:', error);
      return { success: false, error: 'Error al procesar el archivo JSON: ' + error.message };
    }
  }

  /**
   * Exporta transacciones activas a CSV compatible con Excel.
   * Divide los centavos a decimales usando currencyService.fromCents e ignora movimientos internos de alcancía.
   * @param {Array} [transactionsList]
   * @returns {{success: boolean, count: number}}
   */
  exportCSV(transactionsList) {
    const rawList = transactionsList || store.transactions;

    // Filtrar eliminados e ignorar movimientos internos de alcancía para no distorsionar el extracto
    const txs = (rawList || []).filter(
      t => !t.deletedAt && t.type !== 'pocket_deposit' && t.type !== 'pocket_withdraw'
    );

    const header = [
      'ID',
      'Fecha',
      'Tipo',
      'Nombre',
      'Categoria',
      'Cuenta',
      'Alcancía',
      'Valor',
      'Medio de pago',
      'Nota'
    ];

    const escape = val => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = txs.map(t => {
      const acc = accountService.getById(t.accountId);
      const cat = categoryService.getById(t.categoryId);
      const pocket = t.pocketId ? (acc.pockets || []).find(p => p.id === t.pocketId) : null;

      // Conversión de centavos a decimal para la exportación a hoja de cálculo
      const majorAmount = currencyService.fromCents(t.amount || 0);

      const typeLabel = t.type === 'income'
        ? 'Ingreso'
        : t.type === 'transfer'
        ? 'Transferencia'
        : 'Gasto';

      return [
        t.id,
        t.date || '',
        typeLabel,
        t.title || '',
        cat?.name || 'General',
        acc?.name || 'Cuenta Principal',
        pocket ? pocket.name : '—',
        majorAmount,
        t.method || '',
        t.note || ''
      ];
    });

    const csvContent = [header, ...rows]
      .map(row => row.map(escape).join(';'))
      .join('\r\n');

    const dateStr = new Date().toISOString().slice(0, 10);
    // \ufeff antepone el BOM UTF-8 para garantizar compatibilidad con Excel
    this.download(`finscope-movimientos-${dateStr}.csv`, '\ufeff' + csvContent, 'text/csv;charset=utf-8');
    return { success: true, count: rows.length };
  }

  /**
   * Parsea e importa transacciones desde un archivo CSV.
   * Convierte los montos a enteros en centavos usando currencyService.toCents()
   * e inyecta metadatos LWW.
   * @param {string} csvText
   * @returns {Object}
   */
  parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return { success: false, error: 'El archivo CSV está vacío o no contiene filas de datos.' };
    }

    const headerLine = lines[0];
    const delimiter = headerLine.includes(';') ? ';' : ',';

    const parseRow = rowStr => {
      const regex = new RegExp(`(?:^|${delimiter})("(?:[^"]|"")*"|[^${delimiter}]*)`, 'g');
      const cells = [];
      let match;
      while ((match = regex.exec(rowStr)) !== null) {
        let cell = match[1];
        if (cell.startsWith('"') && cell.endsWith('"')) {
          cell = cell.slice(1, -1).replace(/""/g, '"');
        }
        cells.push(cell.trim());
      }
      return cells;
    };

    const headers = parseRow(headerLine).map(h => h.toLowerCase());

    const colIndex = {
      date: headers.findIndex(h => h.includes('fecha') || h.includes('date')),
      type: headers.findIndex(h => h.includes('tipo') || h.includes('type')),
      title: headers.findIndex(h => h.includes('nombre') || h.includes('concepto') || h.includes('descrip') || h.includes('title')),
      amount: headers.findIndex(h => h.includes('valor') || h.includes('monto') || h.includes('importe') || h.includes('amount')),
      category: headers.findIndex(h => h.includes('categor')),
      account: headers.findIndex(h => h.includes('cuenta') || h.includes('account')),
      note: headers.findIndex(h => h.includes('nota') || h.includes('detalle'))
    };

    if (colIndex.title === -1 || colIndex.amount === -1) {
      return {
        success: false,
        error: 'El archivo CSV debe contener al menos las columnas "Nombre" (o Concepto) y "Valor" (o Monto).'
      };
    }

    const defaultCat = (store.categories || []).find(c => !c.deletedAt)?.id || 'cat-food';
    const defaultAcc = (store.accounts || []).find(a => !a.deletedAt)?.id || 'acc-bank';
    const parsedTxs = [];
    const errors = [];
    const now = Date.now();

    for (let i = 1; i < lines.length; i++) {
      const cells = parseRow(lines[i]);
      if (cells.length === 0) continue;

      const title = cells[colIndex.title] || '';
      // Safe Math: Conversión exacta del input a centavos
      const amountInCents = currencyService.toCents(cells[colIndex.amount]);

      if (!title || amountInCents <= 0) {
        errors.push(`Fila ${i + 1}: Nombre o monto no válido.`);
        continue;
      }

      // Fecha
      let date = colIndex.date !== -1 ? cells[colIndex.date] : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const parts = date.split(/[/.-]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
          } else if (parts[2].length === 4) {
            date = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = new Date().toISOString().slice(0, 10);
      }

      // Tipo
      let type = 'expense';
      if (colIndex.type !== -1) {
        const rawType = (cells[colIndex.type] || '').toLowerCase();
        if (rawType.includes('ingreso') || rawType.includes('income')) type = 'income';
        if (rawType.includes('transf')) type = 'transfer';
      }

      // Categoría
      let categoryId = defaultCat;
      if (colIndex.category !== -1 && cells[colIndex.category]) {
        const catName = cells[colIndex.category].toLowerCase();
        const matched = (store.categories || []).find(c => !c.deletedAt && c.name.toLowerCase() === catName);
        if (matched) categoryId = matched.id;
      }

      // Cuenta
      let accountId = defaultAcc;
      if (colIndex.account !== -1 && cells[colIndex.account]) {
        const accName = cells[colIndex.account].toLowerCase();
        const matchedAcc = (store.accounts || []).find(a => !a.deletedAt && a.name.toLowerCase() === accName);
        if (matchedAcc) accountId = matchedAcc.id;
      }

      parsedTxs.push({
        id: `tx-imp-${now}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        amount: amountInCents, // Guardado en centavos
        type,
        date,
        categoryId,
        accountId,
        pocketId: null,
        method: 'Importado CSV',
        note: colIndex.note !== -1 ? cells[colIndex.note] : '',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        syncStatus: 'pending'
      });
    }

    return {
      success: true,
      transactions: parsedTxs,
      errorsCount: errors.length,
      errors
    };
  }

  /**
   * Guarda las transacciones importadas en el Store e IndexedDB.
   * @param {Array} transactions
   * @returns {{success: boolean, count: number}}
   */
  commitCSVTransactions(transactions) {
    if (!transactions || !transactions.length) return { success: false, count: 0 };

    store.setState(
      state => ({ transactions: [...transactions, ...state.transactions] }),
      'csv:imported'
    );
    return { success: true, count: transactions.length };
  }
}

export const dataTransferService = new DataTransferService();
