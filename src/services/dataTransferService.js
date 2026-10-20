/**
 * Servicio para exportación e importación de datos (JSON y CSV con validaciones).
 */
import { store } from '../core/store.js';
import { categoryService } from './categoryService.js';
import { accountService } from './accountService.js';

class DataTransferService {
  /**
   * Descarga un archivo en el navegador.
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
   * Exporta el estado completo a JSON.
   */
  exportBackupJSON() {
    const state = store.getState();
    const payload = {
      ...state,
      exportedAt: new Date().toISOString()
    };
    const jsonString = JSON.stringify(payload, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    this.download(`finanza-respaldo-${dateStr}.json`, jsonString, 'application/json');
    return { success: true };
  }

  /**
   * Importa y valida un respaldo JSON.
   * @param {string} jsonString
   * @param {'replace'|'merge'} mode
   */
  importBackupJSON(jsonString, mode = 'replace') {
    try {
      const parsed = JSON.parse(jsonString);
      if (!parsed || typeof parsed !== 'object') {
        return { success: false, error: 'El archivo JSON no tiene un formato válido.' };
      }

      if (!Array.isArray(parsed.transactions) && !Array.isArray(parsed.categories)) {
        return { success: false, error: 'El archivo no contiene un esquema de Finanza compatible.' };
      }

      if (mode === 'replace') {
        store.replaceState(parsed);
        return { success: true, count: parsed.transactions?.length || 0 };
      } else {
        // Modo fusión: unir categorías y transacciones evitando duplicados por ID
        const current = store.getState();
        const existingTxIds = new Set(current.transactions.map(t => t.id));
        const newTxs = (parsed.transactions || []).filter(t => !existingTxIds.has(t.id));

        const existingCatNames = new Set(current.categories.map(c => `${c.name}-${c.type}`.toLowerCase()));
        const newCats = (parsed.categories || []).filter(c => !existingCatNames.has(`${c.name}-${c.type}`.toLowerCase()));

        store.setState(state => ({
          categories: [...state.categories, ...newCats],
          transactions: [...newTxs, ...state.transactions]
        }), 'data:merged');

        return { success: true, count: newTxs.length };
      }
    } catch (error) {
      return { success: false, error: 'Error al interpretar el archivo JSON: ' + error.message };
    }
  }

  /**
   * Exporta transacciones a formato CSV compatible con Excel.
   */
  exportCSV(transactionsList) {
    const txs = transactionsList || store.transactions;
    const header = ['ID', 'Fecha', 'Tipo', 'Nombre', 'Categoria', 'Cuenta', 'Valor', 'Medio de pago', 'Nota'];

    const escape = val => `"${String(val ?? '').replace(/"/g, '""')}"`;

    const rows = txs.map(t => [
      t.id,
      t.date || '',
      t.type === 'income' ? 'Ingreso' : t.type === 'transfer' ? 'Transferencia' : 'Gasto',
      t.title || '',
      categoryService.getById(t.categoryId).name,
      accountService.getById(t.accountId).name,
      t.amount || 0,
      t.method || '',
      t.note || ''
    ]);

    const csvContent = [header, ...rows]
      .map(row => row.map(escape).join(';'))
      .join('\r\n');

    const dateStr = new Date().toISOString().slice(0, 10);
    // \ufeff agrega el BOM para que Excel en Windows reconozca caracteres latinos y tildes correctamente
    this.download(`finanza-movimientos-${dateStr}.csv`, '\ufeff' + csvContent, 'text/csv;charset=utf-8');
    return { success: true, count: rows.length };
  }

  /**
   * Parsea e importa transacciones desde un archivo CSV.
   * Soporta delimitadores de coma o punto y coma y mapea cabeceras de forma inteligente.
   */
  parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return { success: false, error: 'El archivo CSV está vacío o no contiene filas de datos.' };
    }

    // Determinar delimitador (; o ,)
    const headerLine = lines[0];
    const delimiter = headerLine.includes(';') ? ';' : ',';

    // Parsear fila respetando comillas
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

    // Mapear índices de columnas comunes
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

    const defaultCat = store.categories[0]?.id || 'cat-food';
    const defaultAcc = store.accounts[0]?.id || 'acc-bank';
    const parsedTxs = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = parseRow(lines[i]);
      if (cells.length === 0) continue;

      const title = cells[colIndex.title] || '';
      const rawAmount = (cells[colIndex.amount] || '').replace(/[^\d.-]/g, '');
      const amount = Math.abs(Math.round(Number(rawAmount)));

      if (!title || !amount || Number.isNaN(amount)) {
        errors.push(`Fila ${i + 1}: Nombre o monto no válido.`);
        continue;
      }

      // Fecha
      let date = colIndex.date !== -1 ? cells[colIndex.date] : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        // Intentar parsear DD/MM/AAAA o similar
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
        const matched = store.categories.find(c => c.name.toLowerCase() === catName);
        if (matched) categoryId = matched.id;
      }

      parsedTxs.push({
        id: `tx-imp-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        amount,
        type,
        date,
        categoryId,
        accountId: defaultAcc,
        method: 'Importado CSV',
        note: colIndex.note !== -1 ? cells[colIndex.note] : '',
        createdAt: Date.now()
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
   * Importa las transacciones parseadas al almacén general.
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
