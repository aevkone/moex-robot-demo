// Портфельная часть: раз в месяц пересборка корзины из top акций по силе тренда.
// Сила тренда — доходность за 6 месяцев без последнего месяца; в корзину только бумаги выше SMA200.
// Доля капитала weight делится поровну; бумаги без сигнала — деньги остаются в фонде.
import { sma } from '../indicators.js';

export function monthlyMomentum({ id = 'portfolio', symbols, top = 5, weight = 0.2, lookback = 126, skip = 21 } = {}) {
  const st = {};
  let month = null;
  return {
    id, symbols,
    init({ series }) {
      for (const sym of symbols) {
        const c = series[sym].bars.map((b) => b.c);
        st[sym] = { c, sma200: sma(c, 200) };
      }
    },
    onBar(ctx, updated, t) {
      const m = t.slice(0, 7);
      if (m === month) return [];
      // ждём, пока обновятся все бумаги этого дня (первый бар месяца)
      if (updated.length < symbols.length * 0.8) return [];
      month = m;
      const scored = [];
      for (const sym of symbols) {
        const i = ctx.index(sym), s = st[sym];
        if (i == null || i < lookback || Number.isNaN(s.sma200[i])) continue;
        const mom = s.c[i - skip] / s.c[i - lookback] - 1;
        if (s.c[i] > s.sma200[i] && mom > 0) scored.push({ sym, mom });
      }
      scored.sort((a, b) => b.mom - a.mom);
      const chosen = new Set(scored.slice(0, top).map((x) => x.sym));
      const each = (ctx.equity * weight) / top;
      return symbols.map((sym) => {
        const b = ctx.bar(sym);
        const target = chosen.has(sym) && b ? Math.floor(each / b.c) : 0;
        return { sym, target, reason: 'rebalance' };
      }).filter((o) => {
        // мелкие подстройки веса (< 15% позиции) не торгуем — лишние издержки
        const cur = ctx.pos(id, o.sym);
        return o.target === 0 ? cur !== 0 : Math.abs(o.target - cur) > 0.15 * o.target;
      });
    },
  };
}
