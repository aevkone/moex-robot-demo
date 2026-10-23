// SVG-графики без зависимостей: одинаковые в веб-панели и в отчёте клиенту.
// Цвета передаются явно (в панели — CSS-переменные, в отчёте — фиксированные значения).

export const PALETTE = {
  A: '#c2413a', B: '#d98a1c', C: '#2f6fb3', D: '#2e8b57', fund: '#6b7280',
  text: '#1f2328', muted: '#6b7280', grid: '#e5e7eb', bg: '#ffffff',
  commission: '#e3b9b5', slippage: '#f0dcda', mmf: '#b9d7ad',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const fmtPct = (v, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d).replace('.', ',')}%`;

function niceTicks(min, max, n = 5) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

// Кривые капитала: lines = [{ label, color, points: [[date, value]], dash }]; значения в тыс. ₽.
export function equityChart(lines, { width = 900, height = 380, title = '', c = PALETTE, log = false, font = 'system-ui, sans-serif' } = {}) {
  const narrow = width < 640;
  const pad = { l: narrow ? 44 : 64, r: narrow ? 118 : 200, t: title ? 36 : 14, b: 34 };
  const all = lines.flatMap((l) => l.points);
  const t0 = Date.parse(all.reduce((a, p) => (p[0] < a ? p[0] : a), all[0][0]));
  const t1 = Date.parse(all.reduce((a, p) => (p[0] > a ? p[0] : a), all[0][0]));
  const tf = log ? Math.log : (x) => x;
  let vmin = Math.min(...all.map((p) => p[1])), vmax = Math.max(...all.map((p) => p[1]));
  vmin = vmin * 0.97; vmax = vmax * 1.03;
  const X = (d) => pad.l + ((Date.parse(d) - t0) / (t1 - t0)) * (width - pad.l - pad.r);
  const Y = (v) => height - pad.b - ((tf(v) - tf(vmin)) / (tf(vmax) - tf(vmin))) * (height - pad.t - pad.b);
  const ticks = log
    ? [20, 50, 100, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000].filter((v) => v * 1000 >= vmin && v * 1000 <= vmax)
    : niceTicks(vmin / 1000, vmax / 1000, 5);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${font}" role="img" aria-label="${esc(title || 'График капитала')}">`;
  s += `<rect width="${width}" height="${height}" fill="${c.bg}"/>`;
  if (title && !narrow) s += `<text x="${pad.l}" y="20" font-size="14" fill="${c.muted}">${esc(title)}</text>`;
  for (const v of ticks) {
    const y = Y(v * 1000);
    s += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${y}" y2="${y}" stroke="${c.grid}"/>`;
    s += `<text x="${pad.l - 8}" y="${y + 4}" font-size="12" text-anchor="end" fill="${c.muted}">${v.toLocaleString('ru-RU')}</text>`;
  }
  for (let y = new Date(t0).getUTCFullYear() + 1; y <= new Date(t1).getUTCFullYear(); y++) {
    const x = X(`${y}-01-01`);
    if (narrow && y % 2) continue;
    s += `<line x1="${x}" x2="${x}" y1="${pad.t}" y2="${height - pad.b}" stroke="${c.grid}" stroke-dasharray="2 3"/>`;
    s += `<text x="${x}" y="${height - pad.b + 18}" font-size="12" text-anchor="middle" fill="${c.muted}">${y}</text>`;
  }
  if (!narrow) s += `<text x="${pad.l - 52}" y="${pad.t + 4}" font-size="11" fill="${c.muted}">тыс. ₽</text>`;
  const ends = [];
  for (const l of lines) {
    const d = l.points.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
    s += `<path d="${d}" fill="none" stroke="${l.color}" stroke-width="${l.width ?? 2}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ''} stroke-linejoin="round"/>`;
    const lp = l.points.at(-1);
    ends.push({ y: Y(lp[1]), l, v: lp[1] });
  }
  // подписи справа без наложений
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 30) ends[i].y = ends[i - 1].y + 30;
  for (const e of ends) {
    s += `<text x="${width - pad.r + 8}" y="${e.y}" font-size="12" font-weight="600" fill="${e.l.color}">${esc(narrow ? e.l.label.split('.')[0] + (e.l.label.includes('.') ? '' : '') : e.l.label)}</text>`;
    s += `<text x="${width - pad.r + 8}" y="${e.y + 14}" font-size="11" fill="${c.muted}">${Math.round(e.v / 1000).toLocaleString('ru-RU')} тыс. ₽</text>`;
  }
  return s + '</svg>';
}

// Горизонтальные столбики: rows = [{ label, value, color }], value в % (может быть < 0).
export function barChart(rows, { width = 900, rowH = 42, title = '', c = PALETTE, unit = '%', font = 'system-ui, sans-serif', ref = null } = {}) {
  const pad = { l: 250, r: 80, t: title ? 40 : 14, b: 30 };
  const height = pad.t + pad.b + rows.length * rowH;
  const vals = rows.map((r) => r.value);
  const vmin = Math.min(0, ...vals, ref?.value ?? 0), vmax = Math.max(0, ...vals, ref?.value ?? 0);
  const ticks = niceTicks(vmin, vmax, 6);
  const lo = Math.min(vmin, ticks[0]), hi = Math.max(vmax, ticks.at(-1));
  const X = (v) => pad.l + ((v - lo) / (hi - lo)) * (width - pad.l - pad.r);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${font}" role="img" aria-label="${esc(title)}">`;
  s += `<rect width="${width}" height="${height}" fill="${c.bg}"/>`;
  if (title) s += `<text x="${pad.l}" y="22" font-size="14" fill="${c.muted}">${esc(title)}</text>`;
  for (const t of ticks) {
    s += `<line x1="${X(t)}" x2="${X(t)}" y1="${pad.t}" y2="${height - pad.b}" stroke="${t === 0 ? '#9ca3af' : c.grid}"/>`;
    s += `<text x="${X(t)}" y="${height - pad.b + 18}" font-size="12" text-anchor="middle" fill="${c.muted}">${fmtPct(t)}</text>`;
  }
  rows.forEach((r, i) => {
    const y = pad.t + i * rowH + 8;
    const x0 = X(Math.min(0, r.value)), x1 = X(Math.max(0, r.value));
    s += `<text x="${pad.l - 12}" y="${y + rowH / 2 - 4}" font-size="13" text-anchor="end" fill="${c.text}">${esc(r.label)}</text>`;
    s += `<rect x="${x0}" y="${y}" width="${Math.max(1, x1 - x0)}" height="${rowH - 16}" rx="3" fill="${r.color}"/>`;
    const tx = r.value >= 0 ? x1 + 6 : x0 - 6;
    s += `<text x="${tx}" y="${y + rowH / 2 - 4}" font-size="13" font-weight="600" text-anchor="${r.value >= 0 ? 'start' : 'end'}" fill="${c.text}">${fmtPct(r.value, 1)}</text>`;
  });
  if (ref) {
    const x = X(ref.value);
    s += `<line x1="${x}" x2="${x}" y1="${pad.t - 6}" y2="${height - pad.b}" stroke="${c.text}" stroke-dasharray="5 4"/>`;
    s += `<text x="${x + 6}" y="${pad.t - 8}" font-size="12" fill="${c.text}">${esc(ref.label)}</text>`;
  }
  return s + '</svg>';
}

// Рис. 1 промежуточного отчёта: разложение годового результата при нулевой стратегии.
export function zeroChart(zero, { width = 900, c = PALETTE, font = 'system-ui, sans-serif' } = {}) {
  const rows = [
    { label: ['Как планировалось:', 'интрадей на акциях'], z: zero.original },
    { label: ['С рекомендациями:', 'фьючерсы, капитал в фонде'], z: zero.recommended },
  ];
  const pad = { l: 230, r: 40, t: 20, b: 60 }, rowH = 110;
  const height = pad.t + pad.b + rows.length * rowH;
  const lo = -30, hi = 20;
  const X = (v) => pad.l + ((v - lo) / (hi - lo)) * (width - pad.l - pad.r);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${font}" role="img" aria-label="Годовой результат счёта при нулевой стратегии">`;
  s += `<rect width="${width}" height="${height}" fill="${c.bg}"/>`;
  for (let t = lo; t <= hi; t += 5) {
    s += `<line x1="${X(t)}" x2="${X(t)}" y1="${pad.t}" y2="${height - pad.b}" stroke="${t === 0 ? '#9ca3af' : c.grid}"/>`;
    s += `<text x="${X(t)}" y="${height - pad.b + 18}" font-size="12" text-anchor="middle" fill="${c.muted}">${fmtPct(t)}</text>`;
  }
  rows.forEach((r, i) => {
    const y = pad.t + i * rowH + 30, h = 44;
    r.label.forEach((ln, k) => { s += `<text x="${pad.l - 12}" y="${y + 18 + k * 16}" font-size="13" text-anchor="end" fill="${c.text}">${esc(ln)}</text>`; });
    let x = 0;
    for (const [v, col] of [[r.z.commission, c.commission], [r.z.slippage, c.slippage]]) {
      s += `<rect x="${X(x + v)}" y="${y}" width="${X(x) - X(x + v)}" height="${h}" fill="${col}"/>`; x += v;
    }
    if (r.z.mmf) s += `<rect x="${X(0)}" y="${y}" width="${X(r.z.mmf) - X(0)}" height="${h}" fill="${c.mmf}"/>`;
    const xt = X(r.z.total);
    s += `<line x1="${xt}" x2="${xt}" y1="${y - 10}" y2="${y + h + 10}" stroke="${c.text}" stroke-width="3"/>`;
    s += `<text x="${xt}" y="${y - 16}" font-size="13" font-weight="700" text-anchor="middle" fill="${c.text}">Итог: ${fmtPct(r.z.total, 1)} в год</text>`;
  });
  const xf = X(zero.recommended.fundOnly);
  s += `<line x1="${xf}" x2="${xf}" y1="${pad.t}" y2="${height - pad.b}" stroke="${c.muted}" stroke-dasharray="5 4"/>`;
  s += `<text x="${xf + 6}" y="${height - pad.b - 8}" font-size="11" fill="${c.muted}">всё в фонде ≈ ${fmtPct(zero.recommended.fundOnly)}</text>`;
  const ly = height - 18;
  [['Комиссии', c.commission], ['Проскальзывание', c.slippage], ['Доход фонда', c.mmf]].forEach(([t, col], k) => {
    const lx = pad.l + k * 180;
    s += `<rect x="${lx}" y="${ly - 10}" width="14" height="12" fill="${col}"/><text x="${lx + 20}" y="${ly}" font-size="12" fill="${c.text}">${t}</text>`;
  });
  return s + '</svg>';
}

// Столбики по годам для нескольких серий: series = [{ label, color, values: {year: pct} }]
export function yearChart(series, years, { width = 900, height = 320, c = PALETTE, font = 'system-ui, sans-serif', title = '' } = {}) {
  const pad = { l: 50, r: 16, t: title ? 36 : 14, b: 54 };
  const all = series.flatMap((s) => years.map((y) => s.values[y] ?? 0));
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 6);
  const lo = ticks[0], hi = ticks.at(-1);
  const Y = (v) => height - pad.b - ((v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const gw = (width - pad.l - pad.r) / years.length;
  const bw = Math.min(22, (gw - 12) / series.length);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="${font}" role="img" aria-label="${esc(title || 'Доходность по годам')}">`;
  s += `<rect width="${width}" height="${height}" fill="${c.bg}"/>`;
  if (title) s += `<text x="${pad.l}" y="20" font-size="14" fill="${c.muted}">${esc(title)}</text>`;
  for (const t of ticks) {
    s += `<line x1="${pad.l}" x2="${width - pad.r}" y1="${Y(t)}" y2="${Y(t)}" stroke="${t === 0 ? '#9ca3af' : c.grid}"/>`;
    s += `<text x="${pad.l - 6}" y="${Y(t) + 4}" font-size="11" text-anchor="end" fill="${c.muted}">${t}%</text>`;
  }
  years.forEach((y, i) => {
    const gx = pad.l + i * gw + (gw - bw * series.length) / 2;
    series.forEach((sr, k) => {
      const v = sr.values[y] ?? 0;
      s += `<rect x="${gx + k * bw}" y="${Math.min(Y(v), Y(0))}" width="${bw - 2}" height="${Math.max(1, Math.abs(Y(v) - Y(0)))}" fill="${sr.color}"/>`;
    });
    s += `<text x="${pad.l + i * gw + gw / 2}" y="${height - pad.b + 16}" font-size="12" text-anchor="middle" fill="${c.muted}">${y}</text>`;
  });
  series.forEach((sr, k) => {
    const lx = pad.l + k * 170;
    s += `<rect x="${lx}" y="${height - 18}" width="12" height="12" fill="${sr.color}"/><text x="${lx + 18}" y="${height - 8}" font-size="12" fill="${c.text}">${esc(sr.label)}</text>`;
  });
  return s + '</svg>';
}
