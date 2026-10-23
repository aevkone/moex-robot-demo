// Четыре варианта настройки робота из раздела 5 отчёта + эталон «всё в фонде».
// Все варианты считаются на одних данных и одной модели издержек.
import { runBacktest } from './backtest.js';
import { summarize } from './metrics.js';
import { walkForwardFilter } from './filter.js';
import { intradayORB } from './strategies/intraday.js';
import { breakout, impulse, pullback } from './strategies/swing.js';
import { monthlyMomentum } from './strategies/portfolio.js';
import { SHARES, FUTURES } from './instruments.js';

const SHARE_SYMS = SHARES.map((s) => s.sym);
const FUT_SYMS = FUTURES.map((f) => f.sym);

export const VARIANTS = {
  A: {
    title: 'Интрадей на акциях (изначальный план)',
    short: 'Интрадей акции',
    tf: 'H', syms: SHARE_SYMS, inFund: false, filter: false,
    risk: { maxGrossLev: 2, dailyLossLimit: 0.03 },
    make: (f, m = 1) => [intradayORB({ symbols: SHARE_SYMS, orderType: 'market', maxEntriesPerDay: 3, riskFrac: 0.004 * m, maxLev: 0.5 })],
  },
  B: {
    title: 'Интрадей на фьючерсах + свободный капитал в фонде',
    short: 'Интрадей фьючерсы + фонд',
    tf: 'H', syms: FUT_SYMS, inFund: true, filter: true,
    risk: { maxGrossLev: 2, dailyLossLimit: 0.03, maxTurnoverPerDay: 0.5 },
    make: (f, m = 1) => [intradayORB({ symbols: FUT_SYMS, orderType: 'limit', maxEntriesPerDay: 1, riskFrac: 0.004 * m, maxLev: 0.6, filter: f.orb, threshold: 0.5 })],
  },
  C: {
    title: 'Сделки на 2–10 дней на фьючерсах + фонд',
    short: 'Свинг фьючерсы + фонд',
    tf: 'D', syms: FUT_SYMS, inFund: true, filter: true,
    risk: { maxGrossLev: 2.5, dailyLossLimit: 0.04 },
    make: (f, m = 1) => [
      breakout({ symbols: FUT_SYMS, riskFrac: 0.006 * m, filter: f.breakout, threshold: 0.5 }),
      impulse({ symbols: FUT_SYMS, riskFrac: 0.006 * m, filter: f.impulse, threshold: 0.5, orderType: 'limit' }),
      pullback({ symbols: FUT_SYMS, riskFrac: 0.006 * m, filter: f.pullback, threshold: 0.5, orderType: 'limit' }),
    ],
  },
  D: {
    title: 'Комбинированный: свинг на фьючерсах + портфельная часть 20% в акциях',
    short: 'Свинг + портфель',
    tf: 'D', syms: [...FUT_SYMS, ...SHARE_SYMS], inFund: true, filter: true,
    risk: { maxGrossLev: 2.5, dailyLossLimit: 0.04 },
    make: (f, m = 1) => [
      breakout({ symbols: FUT_SYMS, riskFrac: 0.006 * m, filter: f.breakout, threshold: 0.5 }),
      impulse({ symbols: FUT_SYMS, riskFrac: 0.006 * m, filter: f.impulse, threshold: 0.5, orderType: 'limit' }),
      pullback({ symbols: FUT_SYMS, riskFrac: 0.006 * m, filter: f.pullback, threshold: 0.5, orderType: 'limit' }),
      monthlyMomentum({ symbols: SHARE_SYMS, top: 5, weight: 0.2 }),
    ],
  },
};

const base = (ds, v, o) => ({
  series: ds.pick(v.syms, v.tf), usd: ds.usd, money: ds.money, divDaily: ds.divDaily,
  inFund: v.inFund, start: o.start, end: o.end, costs: o.costs, risk: { ...v.risk, ...o.risk },
});

export function runBenchmark(ds, o = {}) {
  const any = Object.keys(ds.series)[0];
  return runBacktest({
    series: { [any]: { instr: ds.series[any].instr, bars: ds.series[any].daily } },
    money: ds.money, inFund: true, start: o.start, end: o.end,
    costs: { ...o.costs, reserve: 0, premiumFeeMonth: 0 }, strategies: [],
  });
}

// Прогон варианта: проход без фильтра → обучение фильтра walk-forward → проход с фильтром.
// key — буква из VARIANTS или собственное описание варианта той же формы (лаборатория в панели).
export function runVariant(ds, key, o = {}) {
  const v = typeof key === 'string' ? VARIANTS[key] : key;
  const noFilter = new Proxy({}, { get: () => null });
  let res = runBacktest({ ...base(ds, v, o), strategies: v.make(noFilter, o.riskMult ?? v.riskMult ?? 1) });
  let filters = null;
  if (v.filter && o.filter !== false) {
    filters = {};
    for (const id of new Set(res.trades.map((t) => t.strat))) {
      filters[id] = walkForwardFilter(res.trades.filter((t) => t.strat === id), { minTrades: o.minTrades ?? 60, quantile: o.keep ?? 0.6 });
    }
    const raw = res;
    res = runBacktest({ ...base(ds, v, o), strategies: v.make(new Proxy(filters, { get: (t, k) => t[k] ?? null }), o.riskMult ?? v.riskMult ?? 1) });
    res.unfiltered = { trades: raw.trades.length, summary: summarize(raw) };
  }
  return res;
}

export function compareAll(ds, o = {}, keys = Object.keys(VARIANTS)) {
  const bench = runBenchmark(ds, o);
  const benchSummary = summarize(bench);
  const out = { benchmark: { title: '100% в фонде денежного рынка', summary: benchSummary, equity: bench.equity }, variants: {} };
  for (const k of keys) {
    const r = runVariant(ds, k, o);
    out.variants[k] = { key: k, title: VARIANTS[k].title, short: VARIANTS[k].short, summary: summarize(r, bench), equity: r.equity, trades: r.trades, unfiltered: r.unfiltered?.summary ?? null };
  }
  return out;
}
