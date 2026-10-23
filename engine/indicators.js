// Индикаторы по массиву баров. Значение в точке i зависит только от баров 0..i (без заглядывания вперёд).

export function sma(xs, n) {
  const out = new Array(xs.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    s += xs[i];
    if (i >= n) s -= xs[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}

export function ema(xs, n) {
  const out = new Array(xs.length).fill(NaN);
  const k = 2 / (n + 1);
  let e = NaN;
  for (let i = 0; i < xs.length; i++) { e = Number.isNaN(e) ? xs[i] : xs[i] * k + e * (1 - k); if (i >= n - 1) out[i] = e; }
  return out;
}

export function atr(bars, n) {
  const tr = bars.map((b, i) => {
    const pc = i ? bars[i - 1].c : b.c;
    return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
  });
  // сглаживание Уайлдера
  const out = new Array(bars.length).fill(NaN);
  let a = NaN;
  for (let i = 0; i < bars.length; i++) {
    if (i < n - 1) continue;
    if (i === n - 1) a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
    else a = (a * (n - 1) + tr[i]) / n;
    out[i] = a;
  }
  return out;
}

export function rsi(xs, n) {
  const out = new Array(xs.length).fill(NaN);
  let up = 0, dn = 0;
  for (let i = 1; i < xs.length; i++) {
    const ch = xs[i] - xs[i - 1];
    const u = Math.max(ch, 0), d = Math.max(-ch, 0);
    if (i <= n) { up += u / n; dn += d / n; } else { up = (up * (n - 1) + u) / n; dn = (dn * (n - 1) + d) / n; }
    if (i >= n) out[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
  }
  return out;
}

// максимум/минимум за n баров ДО текущего (не включая i) — уровень пробоя
export function highestPrev(xs, n) {
  return xs.map((_, i) => (i < n ? NaN : Math.max(...xs.slice(i - n, i))));
}
export function lowestPrev(xs, n) {
  return xs.map((_, i) => (i < n ? NaN : Math.min(...xs.slice(i - n, i))));
}

export const roc = (xs, n) => xs.map((x, i) => (i < n ? NaN : x / xs[i - n] - 1));

export function stdev(xs, n) {
  return xs.map((_, i) => {
    if (i < n - 1) return NaN;
    const w = xs.slice(i - n + 1, i + 1);
    const m = w.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  });
}
