// Внутридневной пробой диапазона открытия (часовые бары основной сессии 10:00–18:59).
// Диапазон — первый часовой бар 10:00. Пробой вверх при цене выше дневной SMA20 → покупка, вниз ниже → продажа.
// Стоп — противоположная граница диапазона (не ближе 0,5 ATR часа). Выход — закрытие бара 18:00.
import { atr } from '../indicators.js';

const hourOf = (t) => +t.slice(11, 13);

export function intradayORB({
  id = 'orb', symbols, riskFrac = 0.005, maxLev = 0.5, orderType = 'market',
  maxEntriesPerDay = 3, filter = null, threshold = 0.5, sessionStart = 10, exitHour = 18,
} = {}) {
  const st = {};
  return {
    id, symbols,
    init({ series }) {
      for (const sym of symbols) {
        const bars = series[sym].bars;
        // дневные закрытия из часовых: SMA20 по завершённым дням, известна с начала следующего дня
        const dayClose = new Map();
        for (const b of bars) dayClose.set(b.t.slice(0, 10), b.c);
        const days = [...dayClose.keys()];
        const smaPrev = new Map();
        let sum = 0; const q = [];
        days.forEach((d, i) => {
          if (q.length >= 20) smaPrev.set(d, sum / 20);
          const c = dayClose.get(d); q.push(c); sum += c;
          if (q.length > 20) sum -= q.shift();
        });
        st[sym] = { atr: atr(bars, 14), smaPrev, day: null, hi: NaN, lo: NaN, entries: 0, vol: [] };
      }
    },
    onBar(ctx, updated, t) {
      const out = [];
      const h = hourOf(t);
      for (const sym of updated) {
        const s = st[sym]; const b = ctx.bar(sym); const i = ctx.index(sym);
        const d = t.slice(0, 10);
        if (s.day !== d) { s.day = d; s.hi = NaN; s.lo = NaN; s.entries = 0; s.open = NaN; }
        const pos = ctx.pos(id, sym);
        if (h < sessionStart) continue;
        if (h >= exitHour) { if (pos) out.push({ sym, target: 0, when: 'close', reason: 'eod' }); continue; }
        if (h === sessionStart) { s.hi = b.h; s.lo = b.l; s.open = b.o; continue; }
        if (Number.isNaN(s.hi) || pos || s.entries >= maxEntriesPerDay || ctx.halted) continue;
        const sma = s.smaPrev.get(d); const a = s.atr[i];
        if (!sma || !a) continue;
        let side = 0;
        if (b.c > s.hi && b.c > sma) side = 1;
        else if (b.c < s.lo && b.c < sma) side = -1;
        if (!side) continue;
        const range = s.hi - s.lo;
        const stop = side > 0 ? Math.min(s.lo, b.c - 0.5 * a) : Math.max(s.hi, b.c + 0.5 * a);
        const dist = Math.abs(b.c - stop);
        const feat = [
          (b.c - sma) / sma * 100,            // удалённость от дневного тренда
          range / b.c * 100,                  // ширина диапазона открытия
          a / b.c * 100,                      // волатильность часа
          (b.c - s.open) / b.c * 100 * side,  // движение от открытия в сторону сделки
          h,                                  // время сигнала
          side,
          s.entries,
        ];
        if (filter && filter(feat, t, sym) < threshold) continue;
        const qty = ctx.size(sym, dist, riskFrac, maxLev);
        if (!qty) continue;
        s.entries++;
        out.push({ sym, target: side * qty, stop, type: orderType, limit: b.c, ttl: 1, feat, tag: side > 0 ? 'long' : 'short' });
      }
      return out;
    },
  };
}
