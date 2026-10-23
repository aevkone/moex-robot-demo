// Протокол исследования: выбор настроек на обучающем периоде, проверка на независимом,
// стресс, чувствительность и прогноз на 12 месяцев. Работает и в Node, и в браузере.
import { VARIANTS, runVariant, runBenchmark } from './variants.js';
import { summarize, curveStats, byYear } from './metrics.js';

export const PERIODS = { inSample: ['2020-01-01', '2022-12-31'], outSample: ['2023-01-01', '2099-12-31'] };

// Кусок результата за период, капитал пересчитан на начало куска.
export function slice(res, from, to) {
  const eq = res.equity.filter((p) => p.d >= from && p.d <= to);
  const before = res.equity.filter((p) => p.d < from).at(-1);
  const capital = before?.eq ?? eq[0]?.eq ?? res.capital;
  return { equity: eq, capital, trades: res.trades.filter((t) => t.exitT >= from && t.exitT.slice(0, 10) <= to) };
}

export function sliceStats(res, bench, from, to) {
  const a = slice(res, from, to), b = slice(bench, from, to);
  const s = curveStats(a.equity, a.capital), sb = curveStats(b.equity, b.capital);
  if (!s || !sb) return null;
  return { ...s, trades: a.trades.length, benchmarkCagr: sb.cagr, excessCagr: s.cagr - sb.cagr, beatsFund: s.cagr > sb.cagr };
}

// Сетка настроек, выбираемых на обучающем периоде: уровень риска и ИИ-фильтр.
export const GRID = [
  { riskMult: 1, filter: true }, { riskMult: 1, filter: false },
  { riskMult: 2, filter: true }, { riskMult: 2, filter: false },
  { riskMult: 3, filter: true }, { riskMult: 3, filter: false },
];

// Критерий выбора: превышение над фондом при просадке не больше maxDD на обучающем периоде.
export function selectOnInSample(ds, key, bench, { maxDD = 15, onProgress } = {}) {
  const rows = [];
  for (const g of GRID) {
    if (!VARIANTS[key].filter && g.filter) continue;
    const r = runVariant(ds, key, g);
    const is = sliceStats(r, bench, ...PERIODS.inSample);
    const oos = sliceStats(r, bench, ...PERIODS.outSample);
    rows.push({ ...g, is, oos, res: r });
    onProgress?.(key, g);
  }
  const ok = rows.filter((x) => x.is.maxDD <= maxDD);
  const pool = ok.length ? ok : rows;
  const best = pool.reduce((a, b) => (b.is.excessCagr > a.is.excessCagr ? b : a));
  return { rows, best };
}

// Месячные доходности сверх фонда — основа бутстрепа прогноза.
export function monthlyExcess(res, bench) {
  const m = (eq) => {
    const out = new Map(); let prev = null;
    for (const p of eq) { const k = p.d.slice(0, 7); out.set(k, p.eq); }
    const keys = [...out.keys()];
    return new Map(keys.map((k, i) => [k, i ? out.get(k) / out.get(keys[i - 1]) - 1 : null]).filter(([, v]) => v != null));
  };
  const a = m(res.equity), b = m(bench.equity);
  return [...a].filter(([k]) => b.has(k)).map(([k, v]) => ({ m: k, x: v - b.get(k) }));
}

// Прогноз на 12 месяцев: блочный бутстреп (блоки по 3 месяца) месячных превышений над фондом
// + ожидаемая доходность фонда. Возвращает перцентили годового результата и вероятность обогнать фонд.
export function forecast(excess, { fundYield = 12, n = 5000, block = 3, seed = 42 } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const xs = excess.map((e) => e.x);
  const fundM = Math.pow(1 + fundYield / 100, 1 / 12) - 1;
  const sims = [];
  for (let k = 0; k < n; k++) {
    let v = 1, f = 1;
    for (let mth = 0; mth < 12; ) {
      const st = Math.floor(rnd() * (xs.length - block));
      for (let j = 0; j < block && mth < 12; j++, mth++) { v *= 1 + fundM + xs[st + j]; f *= 1 + fundM; }
    }
    sims.push({ ret: (v - 1) * 100, excess: (v - f) * 100 });
  }
  sims.sort((a, b) => a.ret - b.ret);
  const q = (p) => sims[Math.floor(p * (sims.length - 1))].ret;
  return {
    fundYield, p10: q(0.1), p25: q(0.25), p50: q(0.5), p75: q(0.75), p90: q(0.9),
    probBeatFund: sims.filter((x) => x.excess > 0).length / sims.length,
    probLoss: sims.filter((x) => x.ret < 0).length / sims.length,
  };
}

export const SENSITIVITY = [
  { id: 'base', title: 'Базовые условия', costs: {} },
  { id: 'slip2', title: 'Проскальзывание ×2', costs: { slipMult: 2 } },
  { id: 'futcomm', title: 'Комиссия по фьючерсам 0,05%', costs: { futCommission: 0.0005 } },
  { id: 'premium', title: 'Premium платный (2 990 ₽/мес)', costs: { premiumFeeMonth: 2990 } },
  { id: 'rate-4', title: 'Ставка денежного рынка −4 п.п.', costs: { rateShift: -4 } },
  { id: 'reserve25', title: 'Резерв денег 25% вместо 12,5%', costs: { reserve: 0.25 } },
];

export function sensitivity(ds, key, setting, onProgress) {
  return SENSITIVITY.map((sc) => {
    const r = runVariant(ds, key, { ...setting, costs: sc.costs });
    const b = runBenchmark(ds, { costs: sc.costs });
    onProgress?.(key, sc.id);
    return { id: sc.id, title: sc.title, ...pickStats(summarize(r, b)) };
  });
}

export const pickStats = (s) => s && ({
  cagr: s.cagr, totalReturn: s.totalReturn, maxDD: s.maxDD, sharpe: s.sharpe, vol: s.vol, trades: s.trades, winRate: s.winRate,
  excessCagr: s.excessCagr, benchmarkCagr: s.benchmarkCagr, beatsFund: s.beatsFund,
  turnoverPerYear: s.turnoverPerYear, costsPctYear: s.costsPctYear, years: s.years,
  endEquity: s.endEquity, from: s.from, to: s.to, profitFactor: s.profitFactor, longestDDdays: s.longestDDdays,
});

// Кривая капитала, прорежённая до недель — для графиков.
export const weekly = (equity) => equity.filter((p, i) => i === equity.length - 1 || new Date(p.d).getUTCDay() === 5 || (equity[i + 1] && Date.parse(equity[i + 1].d) - Date.parse(p.d) > 3 * 864e5)).map((p) => [p.d, Math.round(p.eq)]);

export { byYear };
