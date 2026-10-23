// Сделки на 2–10 дней по дневным барам фьючерсов. Три стратегии, по-разному реагирующие на рынок:
//  breakout — пробой 20-дневного канала по направлению тренда (SMA100), трейлинг-стоп 3 ATR;
//  impulse  — импульсный день (закрытие у экстремума, диапазон > 1,3 ATR) по тренду, выход через 5 дней;
//  pullback — откат в тренде (RSI2 < 10 в восходящем / > 90 в нисходящем), выход по возврату к SMA5.
// Все выходят не позже maxBars дней. Размер — риск riskFrac капитала на дистанцию стопа (от волатильности).
import { atr, sma, rsi, highestPrev, lowestPrev } from '../indicators.js';

function prep(bars) {
  const c = bars.map((b) => b.c);
  return { c, atr: atr(bars, 20), sma100: sma(c, 100), sma5: sma(c, 5), rsi2: rsi(c, 2), hi20: highestPrev(bars.map((b) => b.h), 20), lo20: lowestPrev(bars.map((b) => b.l), 20) };
}

function base({ id, symbols, riskFrac, maxLev, maxBars, filter, threshold, orderType }, entry, manage) {
  const st = {};
  return {
    id, symbols,
    init({ series }) { for (const sym of symbols) st[sym] = prep(series[sym].bars); },
    onBar(ctx, updated, t) {
      const out = [];
      for (const sym of updated) {
        const i = ctx.index(sym), s = st[sym], b = ctx.bar(sym);
        const a = s.atr[i];
        if (!(a > 0) || Number.isNaN(s.sma100[i])) continue;
        const p = ctx.position(id, sym);
        if (p) {
          const m = manage(s, i, b, p, a);
          if (m === 'exit' || p.bars >= maxBars) out.push({ sym, target: 0, reason: m === 'exit' ? 'signal' : 'time' });
          else if (m?.stop !== undefined) out.push({ sym, setStop: m.stop });
          continue;
        }
        if (ctx.halted) continue;
        const e = entry(s, i, b, a);
        if (!e) continue;
        const feat = [
          (b.c - s.sma100[i]) / a,              // сила тренда в ATR
          a / b.c * 100,                        // волатильность
          (b.c - b.l) / Math.max(1e-9, b.h - b.l), // положение закрытия в диапазоне дня
          (b.h - b.l) / a,                      // ширина дня в ATR
          s.rsi2[i] / 100,
          e.side,
        ];
        if (filter && filter(feat, t, sym) < threshold) continue;
        const qty = ctx.size(sym, Math.abs(b.c - e.stop), riskFrac, maxLev);
        if (!qty) continue;
        const type = e.type ?? orderType;
        out.push({ sym, target: e.side * qty, stop: e.stop, type, limit: e.limit ?? b.c, ttl: 1, feat, tag: e.side > 0 ? 'long' : 'short' });
      }
      return out;
    },
  };
}

const defaults = { riskFrac: 0.006, maxLev: 1.5, maxBars: 10, filter: null, threshold: 0.5, orderType: 'market' };

export const breakout = (o) => base({ id: 'breakout', ...defaults, ...o },
  (s, i, b, a) => {
    if (b.c > s.hi20[i] && b.c > s.sma100[i]) return { side: 1, stop: b.c - 2 * a, type: 'market' };
    if (b.c < s.lo20[i] && b.c < s.sma100[i]) return { side: -1, stop: b.c + 2 * a, type: 'market' };
    return null;
  },
  (s, i, b, p, a) => {
    const trail = p.qty > 0 ? b.c - 3 * a : b.c + 3 * a;
    if (p.qty > 0 && trail > p.stop) return { stop: trail };
    if (p.qty < 0 && trail < p.stop) return { stop: trail };
    return null;
  });

export const impulse = (o) => base({ id: 'impulse', ...defaults, maxBars: 5, ...o },
  (s, i, b, a) => {
    const rng = b.h - b.l;
    if (rng < 1.3 * a) return null;
    const pos = (b.c - b.l) / rng;
    if (pos > 0.8 && b.c > s.sma100[i]) return { side: 1, stop: b.l, limit: b.c - 0.2 * a };
    if (pos < 0.2 && b.c < s.sma100[i]) return { side: -1, stop: b.h, limit: b.c + 0.2 * a };
    return null;
  },
  () => null);

export const pullback = (o) => base({ id: 'pullback', ...defaults, maxBars: 7, ...o },
  (s, i, b, a) => {
    if (b.c > s.sma100[i] && s.rsi2[i] < 10) return { side: 1, stop: b.c - 2.5 * a, limit: b.c };
    if (b.c < s.sma100[i] && s.rsi2[i] > 90) return { side: -1, stop: b.c + 2.5 * a, limit: b.c };
    return null;
  },
  (s, i, b, p) => ((p.qty > 0 && b.c > s.sma5[i]) || (p.qty < 0 && b.c < s.sma5[i]) ? 'exit' : null));
