// Подготовка данных для бэктеста (одинаково в Node и в браузере):
// корректировка сплитов акций, курс доллара из Si, дивидендная доходность рынка, ставка денег.
import { findInstrument } from './instruments.js';

// Коэффициенты сплитов на бирже «круглые»: разрыв 99,3 → 100, 5018 → 5000.
const NICE = [2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 30, 40, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
export const niceRatio = (r) => NICE.reduce((a, b) => (Math.abs(Math.log(b / r)) < Math.abs(Math.log(a / r)) ? b : a));

// Сплит/консолидация: разрыв цены больше чем в 3 раза за ночь. Цены до даты делятся на коэффициент.
// Поправка нужна только дневной истории ISS: свечи (/candles, в т.ч. часовые) ISS отдаёт уже скорректированными.
export function splitAdjust(daily, hourly = []) {
  const events = [];
  for (let i = 1; i < daily.length; i++) {
    const r = daily[i - 1].c / daily[i].o;
    if (r > 3 || r < 1 / 3) events.push({ d: daily[i].d, k: r > 1 ? niceRatio(r) : 1 / niceRatio(1 / r) });
  }
  if (!events.length) return { daily, hourly, events };
  const factor = (date) => events.reduce((f, e) => (date < e.d ? f * e.k : f), 1);
  const adj = (b, date) => { const f = factor(date); return f === 1 ? b : { ...b, o: b.o / f, h: b.h / f, l: b.l / f, c: b.c / f, v: b.v * f }; };
  return { daily: daily.map((b) => adj(b, b.d)), hourly, events };
}

// Дневная дивидендная доходность рынка = рост индекса полной доходности (брутто) сверх IMOEX (только положительная часть).
export function dividendYieldDaily(imoex, mcftrr) {
  const im = new Map(imoex.map((x) => [x.d, x.c]));
  const out = new Map();
  let prev = null;
  for (const x of mcftrr) {
    const i = im.get(x.d);
    if (i == null) continue;
    if (prev) {
      const dy = (x.c / prev.t) / (i / prev.i) - 1;
      if (dy > 1e-6) out.set(x.d, dy);
    }
    prev = { t: x.c, i };
  }
  return out;
}

export function usdFromSi(siDaily) {
  const m = new Map(siDaily.map((b) => [b.d, b.raw / 1000]));
  const dates = [...m.keys()].sort();
  let lastD = dates[0];
  return (d) => {
    if (m.has(d)) return m.get(d);
    // ближайшая предыдущая дата
    let lo = 0, hi = dates.length - 1, ans = dates[0];
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (dates[mid] <= d) { ans = dates[mid]; lo = mid + 1; } else hi = mid - 1; }
    lastD = ans;
    return m.get(lastD);
  };
}

// Исполнение дневных стратегий — по открытию часовой свечи 10:00 (как у робота), а не по открытию
// торгового дня (у фьючерсов это вечерняя сессия накануне). Нужны часовые свечи; без них ряд не меняется.
export function openAt10(daily, hourly) {
  if (!hourly?.length) return daily;
  const o10 = new Map();
  for (const h of hourly) {
    const d = h.t.slice(0, 10), hr = +h.t.slice(11, 13);
    if (hr >= 10 && !o10.has(d)) o10.set(d, h.o);
  }
  return daily.map((b) => {
    const o = o10.get(b.d);
    return o == null ? b : { ...b, o, h: Math.max(b.h, o), l: Math.min(b.l, o) };
  });
}

// raw: { series: { SYM: { daily, hourly } }, RUSFAR, IMOEX, MCFTR }
// Возвращает фабрику входных данных бэктеста для нужного набора инструментов и таймфрейма.
export function buildDataset(raw) {
  const series = {};
  for (const [sym, s] of Object.entries(raw.series)) {
    const instr = findInstrument(sym);
    if (!instr) continue;
    const adj = instr.kind === 'share' ? splitAdjust(s.daily, s.hourly ?? []) : s;
    const daily = raw.dailyOpen10 === false ? adj.daily : openAt10(adj.daily, adj.hourly);
    series[sym] = { instr, daily, hourly: adj.hourly ?? [] };
  }
  const usd = series.Si ? usdFromSi(series.Si.daily) : () => 80;
  const tr = raw.MCFTR ?? raw.MCFTRR;
  const divDaily = raw.IMOEX && tr ? dividendYieldDaily(raw.IMOEX, tr) : new Map();
  return {
    series,
    usd,
    divDaily,
    money: raw.RUSFAR ?? [],
    pick(syms, tf = 'D') {
      return Object.fromEntries(syms.filter((s) => series[s]).map((s) => [s, { instr: series[s].instr, bars: tf === 'H' ? series[s].hourly : series[s].daily }]));
    },
  };
}
