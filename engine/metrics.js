// Метрики результата бэктеста. Доходности — % годовых, просадки — % от пика.

const yearsBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / (365.25 * 864e5);

export function curveStats(equity, capital) {
  if (equity.length < 2) return null;
  const first = equity[0].d, lastD = equity.at(-1).d;
  const yrs = Math.max(yearsBetween(first, lastD), 1 / 365);
  const end = equity.at(-1).eq;
  const cagr = (Math.pow(end / capital, 1 / yrs) - 1) * 100;
  const rets = [];
  for (let i = 1; i < equity.length; i++) rets.push(equity[i].eq / equity[i - 1].eq - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  const vol = sd * Math.sqrt(252) * 100;
  let peak = capital, maxDD = 0, ddStart = first, longest = 0, curStart = null;
  for (const p of equity) {
    if (p.eq >= peak) {
      if (curStart) longest = Math.max(longest, yearsBetween(curStart, p.d) * 365.25);
      peak = p.eq; curStart = null;
    } else {
      if (!curStart) curStart = p.d;
      const dd = 1 - p.eq / peak;
      if (dd > maxDD) { maxDD = dd; ddStart = curStart; }
    }
  }
  if (curStart) longest = Math.max(longest, yearsBetween(curStart, lastD) * 365.25);
  return {
    from: first, to: lastD, years: +yrs.toFixed(2), endEquity: Math.round(end),
    totalReturn: (end / capital - 1) * 100, cagr, vol,
    sharpe: sd > 0 ? (mean / sd) * Math.sqrt(252) : 0,
    maxDD: maxDD * 100, maxDDFrom: ddStart, longestDDdays: Math.round(longest),
    calmar: maxDD > 0 ? cagr / (maxDD * 100) : null,
  };
}

export function byYear(equity, capital) {
  const out = [];
  let prev = capital;
  for (let i = 0; i < equity.length; i++) {
    const y = equity[i].d.slice(0, 4);
    if (i === equity.length - 1 || equity[i + 1].d.slice(0, 4) !== y) {
      out.push({ year: +y, ret: (equity[i].eq / prev - 1) * 100 });
      prev = equity[i].eq;
    }
  }
  return out;
}

export function tradeStats(trades) {
  const n = trades.length;
  if (!n) return { trades: 0 };
  const net = trades.map((t) => t.pnl - t.costs);
  const wins = net.filter((x) => x > 0);
  const losses = net.filter((x) => x <= 0);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  return {
    trades: n,
    winRate: (wins.length / n) * 100,
    avgNet: sum(net) / n,
    profitFactor: losses.length && sum(losses) !== 0 ? sum(wins) / -sum(losses) : null,
    avgBars: sum(trades.map((t) => t.bars ?? 0)) / n,
    turnover: sum(trades.map((t) => t.value ?? 0)) * 2,
  };
}

// Полная сводка + сравнение с эталоном (100% в фонде за тот же период).
export function summarize(res, benchmark) {
  const s = curveStats(res.equity, res.capital);
  const yrs = s?.years || 1;
  const avgEq = res.equity.reduce((x, p) => x + p.eq, 0) / Math.max(1, res.equity.length);
  const pct = (v) => (v / avgEq / yrs) * 100; // % среднего капитала в год
  const c = res.costs;
  const out = {
    ...s,
    ...tradeStats(res.trades),
    costsPctYear: {
      commission: -pct(c.commission), slippage: -pct(c.slippage), roll: -pct(c.roll),
      marginInterest: -pct(c.marginInterest), premium: -pct(c.premium),
      mmf: pct(c.mmf), dividends: pct(c.dividends),
    },
    turnoverPerYear: (tradeStats(res.trades).turnover ?? 0) / avgEq / yrs, // стороны сделок, в капиталах
    years: byYear(res.equity, res.capital),
  };
  if (benchmark) {
    const b = curveStats(benchmark.equity, benchmark.capital);
    out.benchmarkCagr = b.cagr;
    out.excessCagr = s.cagr - b.cagr;
    out.beatsFund = s.cagr > b.cagr;
  }
  return out;
}
