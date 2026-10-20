/**
 * src/ui/charts.js
 * Renderizador de gráficos Canvas interactivos v3 con Safe Math (centavos)
 * y exclusión estricta de transferencias y movimientos internos de alcancías.
 */
import { currencyService } from '../services/currencyService.js';
import { categoryService } from '../services/categoryService.js';

export class ChartRenderer {
  /**
   * Renderiza el gráfico de flujo de caja diario en el elemento canvas.
   * Excluye estrictamente transferencias y movimientos internos de alcancías.
   */
  static renderCashflow(canvasId, emptyId, transactions, year, month) {
    const canvas = document.getElementById(canvasId);
    const empty = document.getElementById(emptyId);
    if (!canvas) return;

    // Filtrar estrictamente: solo ingresos y gastos operativos activos
    const validTxs = (transactions || []).filter(
      t => !t.deletedAt && (t.type === 'income' || t.type === 'expense')
    );

    const hasAny = validTxs.length > 0;
    if (empty) empty.classList.toggle('hidden', hasAny);

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(260, rect.width || 300);
    const height = Math.max(180, rect.height || 220);
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const days = new Date(year, month, 0).getDate();
    const daily = Array.from({ length: days }, () => ({ income: 0, expense: 0 }));

    validTxs.forEach(t => {
      const day = Number((t.date || '').slice(8, 10));
      if (day >= 1 && day <= days) {
        if (t.type === 'income') daily[day - 1].income += Number(t.amount || 0); // en centavos
        else if (t.type === 'expense') daily[day - 1].expense += Number(t.amount || 0); // en centavos
      }
    });

    const maxValue = Math.max(1, ...daily.flatMap(d => [d.income, d.expense]));
    const pad = { top: 16, right: 12, bottom: 26, left: 45 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;

    const isDark = document.body.classList.contains('dark');
    const gridColor = isDark ? '#27272a' : '#e4e4e7';
    const textColor = isDark ? '#a1a1aa' : '#71717a';

    // Líneas de cuadrícula y etiquetas del eje Y (formateando desde centavos a unidades mayores)
    ctx.font = '10px "DM Sans", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < 4; i++) {
      const y = pad.top + (chartH / 3) * i;
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();

      const centsVal = maxValue * (1 - i / 3);
      ctx.fillStyle = textColor;
      ctx.fillText(this.formatAxisValue(centsVal), pad.left - 8, y);
    }

    // Barras de ingresos y gastos
    const groupW = chartW / days;
    const barW = Math.max(2, Math.min(8, groupW * 0.32));

    daily.forEach((d, i) => {
      const x = pad.left + groupW * i + groupW / 2;
      const hIncome = (d.income / maxValue) * chartH;
      const hExpense = (d.expense / maxValue) * chartH;

      // Barra de Ingreso
      if (hIncome > 0) {
        ctx.fillStyle = isDark ? '#f4f4f5' : '#18181b';
        this.drawRoundRect(ctx, x - barW - 1, pad.top + chartH - hIncome, barW, hIncome, 3);
        ctx.fill();
      }

      // Barra de Gasto
      if (hExpense > 0) {
        ctx.fillStyle = isDark ? '#52525b' : '#a1a1aa';
        this.drawRoundRect(ctx, x + 1, pad.top + chartH - hExpense, barW, hExpense, 3);
        ctx.fill();
      }
    });

    // Etiquetas del eje X (días del mes)
    const labelDays = days <= 10
      ? [1, Math.ceil(days / 2), days]
      : [1, Math.round(days / 4), Math.round(days / 2), Math.round(days * 0.75), days];

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    [...new Set(labelDays)].forEach(day => {
      const x = pad.left + groupW * (day - 0.5);
      ctx.fillText(String(day), x, height - pad.bottom + 8);
    });
  }

  /**
   * Renderiza el gráfico tipo Dona con distribución de gastos por categorías.
   * Excluye ingresos, transferencias y movimientos internos de alcancías.
   */
  static renderDonut(donutId, totalId, legendId, transactions) {
    const donutEl = document.getElementById(donutId);
    const totalEl = document.getElementById(totalId);
    const legendEl = document.getElementById(legendId);
    if (!donutEl || !legendEl) return;

    const isDark = document.body.classList.contains('dark');
    // Solo gastos operativos activos
    const expenses = (transactions || []).filter(t => !t.deletedAt && t.type === 'expense');
    const totals = new Map();

    expenses.forEach(t => {
      totals.set(t.categoryId, (totals.get(t.categoryId) || 0) + Number(t.amount || 0)); // en centavos
    });

    const entries = [...totals.entries()]
      .map(([id, amount]) => ({ category: categoryService.getById(id), amount }))
      .sort((a, b) => b.amount - a.amount);

    const total = expenses.reduce((sum, t) => sum + Number(t.amount || 0), 0); // en centavos
    if (totalEl) totalEl.textContent = currencyService.formatShort(total);

    if (!total || entries.length === 0) {
      donutEl.style.background = isDark ? 'conic-gradient(#18181b 0deg 360deg)' : 'conic-gradient(#e4e4e7 0deg 360deg)';
      legendEl.innerHTML = '<div class="empty-note">Aún no hay gastos registrados este mes.</div>';
      return;
    }

    let angle = 0;
    const stops = [];

    entries.forEach(({ category, amount }) => {
      const start = angle;
      angle += (amount / total) * 360;
      stops.push(`${category?.color || '#3f3f46'} ${start}deg ${angle}deg`);
    });

    donutEl.style.background = `conic-gradient(${stops.join(',')})`;

    const escapeHTML = str => String(str ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    legendEl.innerHTML = entries.slice(0, 5).map(({ category, amount }) => {
      const pct = Math.round((amount / total) * 100);
      return `
        <div class="legend-row">
          <span class="legend-swatch" style="background:${category?.color || '#3f3f46'}"></span>
          <span class="legend-category" title="${escapeHTML(category?.name || 'General')}">${escapeHTML(category?.name || 'General')}</span>
          <span class="legend-amount">${pct}% <small class="muted">(${currencyService.formatShort(amount)})</small></span>
        </div>
      `;
    }).join('');
  }

  /**
   * Formatea el valor del eje Y recibiendo centavos y mostrando unidades abreviadas (k, M).
   * @param {number} cents
   * @returns {string}
   */
  static formatAxisValue(cents) {
    const majorUnit = currencyService.fromCents(cents);
    if (majorUnit >= 1000000) return `${(majorUnit / 1000000).toFixed(1)}M`;
    if (majorUnit >= 1000) return `${Math.round(majorUnit / 1000)}k`;
    return Math.round(majorUnit).toString();
  }

  static drawRoundRect(ctx, x, y, w, h, r) {
    if (h <= 0 || w <= 0) return;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
