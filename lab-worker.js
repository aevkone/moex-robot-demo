// Бэктест в браузере (Web Worker): те же модули движка, что и в исследовании.
import { buildDataset } from './engine/dataset.js';
import { runVariant, runBenchmark } from './engine/variants.js';
import { summarize } from './engine/metrics.js';
import { breakout, impulse, pullback } from './engine/strategies/swing.js';
import { monthlyMomentum } from './engine/strategies/portfolio.js';
import { FUTURES, SHARES } from './engine/instruments.js';
import { decodeDaily } from './data.js';

let ds = null;
const FUT = FUTURES.map((f) => f.sym), SHR = SHARES.map((s) => s.sym);

self.onmessage = async ({ data: msg }) => {
  try {
    if (!ds) {
      self.postMessage({ type: 'progress', text: 'Загружаю историю Мосбиржи…' });
      const r = await fetch('data/daily.json');
      ds = buildDataset(decodeDaily(await r.json()));
    }
    const p = msg.params;
    const futs = FUT.filter((s) => p.instruments.includes(s));
    const strat = new Set(p.strategies);
    const m = p.riskMult;
    const variant = {
      tf: 'D', syms: [...futs, ...(strat.has('portfolio') ? SHR : [])], inFund: p.inFund, filter: p.filter,
      risk: { maxGrossLev: 2.5, dailyLossLimit: p.dailyLossLimit },
      make: (f) => [
        strat.has('breakout') && futs.length && breakout({ symbols: futs, riskFrac: 0.006 * m, filter: f.breakout }),
        strat.has('impulse') && futs.length && impulse({ symbols: futs, riskFrac: 0.006 * m, filter: f.impulse, orderType: p.limit ? 'limit' : 'market' }),
        strat.has('pullback') && futs.length && pullback({ symbols: futs, riskFrac: 0.006 * m, filter: f.pullback, orderType: p.limit ? 'limit' : 'market' }),
        strat.has('portfolio') && monthlyMomentum({ symbols: SHR, top: 5, weight: p.portfolioWeight }),
      ].filter(Boolean),
    };
    const o = {
      start: p.from, end: p.to, filter: p.filter,
      costs: { futCommission: p.futCommission / 100, commission: p.commission / 100, slipMult: p.slipMult, premiumFeeMonth: p.premium ? 2990 : 0, reserve: p.reserve / 100, capital: p.capital },
    };
    self.postMessage({ type: 'progress', text: 'Считаю бэктест…' });
    const t0 = performance.now();
    const res = runVariant(ds, variant, o);
    const bench = runBenchmark(ds, o);
    const s = summarize(res, bench);
    const by = {};
    for (const t of res.trades) { by[t.strat] ??= { strat: t.strat, trades: 0, pnl: 0, costs: 0 }; by[t.strat].trades++; by[t.strat].pnl += t.pnl; by[t.strat].costs += t.costs; }
    const thin = (eq) => eq.filter((_, i) => i % 3 === 0 || i === eq.length - 1).map((x) => [x.d, Math.round(x.eq)]);
    self.postMessage({
      type: 'done', ms: Math.round(performance.now() - t0),
      summary: s, bench: summarize(bench), equity: thin(res.equity), benchEquity: thin(bench.equity),
      byStrategy: Object.values(by), trades: res.trades.slice(-40).reverse().map(({ feat, ...t }) => t),
    });
  } catch (e) {
    self.postMessage({ type: 'error', text: e.message });
  }
};
