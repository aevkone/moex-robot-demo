// Пошаговый бэктест по барам для нескольких инструментов и стратегий в одном счёте.
//
// Счёт: деньги (cash) + паи фонда ДР (fund) + акции по рынку; фьючерсы — вариационная маржа в cash.
// В режиме inFund свободный капитал каждое утро перекладывается в фонд, на счёте остаётся reserve.
// Заявки стратегии исполняются на следующем баре инструмента: рыночная — по открытию с проскальзыванием,
// лимитная — если цена прошла лимит; стоп — внутри бара, при гэпе — по открытию (ночной разрыв).
// Заявки с when:'close' исполняются по закрытию текущего бара (только для выхода по времени).

import { DEFAULTS, slippage, commissionRate, mmfDaily } from './costs.js';

const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const STRESS = [['2022-02-24', '2022-06-30']];
const inStress = (d) => STRESS.some(([a, b]) => d >= a && d <= b);

export function runBacktest(cfg) {
  const o = { ...DEFAULTS, ...cfg.costs };
  const risk = {
    dailyLossLimit: 0.03,   // −3% капитала за день → закрыть всё и не входить до конца дня
    ddHalt: 0.2,            // просадка от пика −20% → риск на сделку ×0,5, пока не восстановится до −10%
    maxGrossLev: 2,         // суммарная стоимость позиций / капитал
    maxTurnoverPerDay: Infinity, // оборот за день / капитал (лимит рекомендации 2)
    marginUse: 0.8,         // ГО не больше 80% залога
    ...cfg.risk,
  };
  const series = cfg.series;
  const syms = Object.keys(series);
  const usdOn = cfg.usd ?? (() => 80);
  const money = cfg.money ?? [];
  const moneyMap = new Map(money.map((m) => [m.d, m.r]));
  let lastRate = money[0]?.r ?? 10;
  const divs = cfg.divDaily ?? new Map(); // дата → дивидендная доходность рынка за день

  const st = {
    cash: o.capital, fund: 0, peak: o.capital, halted: false, ddMode: false,
    pos: {},          // key strat|sym → {qty, mark, stop, entryPx, entryT, feat, tag, bars}
    pending: [],      // заявки на следующий бар
    costs: { commission: 0, slippage: 0, roll: 0, mmf: 0, marginInterest: 0, premium: 0, dividends: 0 },
    turnoverToday: 0, dayStartEq: o.capital, date: null,
  };
  const trades = [];
  const equity = [];   // по дням: {d, eq, fund, cash, gross}
  const last = {};     // sym → последний бар
  const idx = {};      // sym → индекс бара
  const strategies = cfg.strategies;
  for (const s of strategies) s.init?.({ series, syms, cfg });

  // Временная шкала: объединение моментов всех рядов в [start, end].
  const inRange = (t) => (!cfg.start || t >= cfg.start) && (!cfg.end || t.slice(0, 10) <= cfg.end);
  const at = new Map();
  for (const sym of syms) series[sym].bars.forEach((b, i) => { const t = b.t ?? b.d; if (inRange(t)) { if (!at.has(t)) at.set(t, []); at.get(t).push([sym, i]); } });
  const timeline = [...at.keys()].sort();

  const instr = (sym) => series[sym].instr;
  const rubPerPoint = (sym, b) => {
    const ins = instr(sym);
    if (ins.kind !== 'fut') return 1;
    const raw = b.raw ?? b.c;
    return ins.notional(raw, usdOn(st.date)) / raw;
  };
  const contractValue = (sym, b) => instr(sym).kind === 'fut' ? instr(sym).notional(b.raw ?? b.c, usdOn(st.date)) : b.c;
  const marginPer = (sym, b) => {
    const ins = instr(sym);
    if (ins.kind !== 'fut') return 0;
    return ins.margin * (inStress(st.date) ? 2 : 1) * contractValue(sym, b);
  };

  const sharesValue = () => Object.entries(st.pos).reduce((a, [k, p]) => {
    const sym = k.split('|')[1];
    return instr(sym).kind === 'share' && last[sym] ? a + p.qty * last[sym].c : a;
  }, 0);
  const equityNow = () => st.cash + st.fund + sharesValue();
  const gross = () => Object.entries(st.pos).reduce((a, [k, p]) => {
    const sym = k.split('|')[1]; return last[sym] ? a + Math.abs(p.qty) * contractValue(sym, last[sym]) : a;
  }, 0);
  const marginUsed = () => Object.entries(st.pos).reduce((a, [k, p]) => {
    const sym = k.split('|')[1]; return last[sym] ? a + Math.abs(p.qty) * marginPer(sym, last[sym]) : a;
  }, 0);
  const collateral = () => st.cash + st.fund * (cfg.inFund ? o.haircut : 1) + Math.max(0, sharesValue()) * 0.75;

  // Исполнение сделки: изменение позиции strat|sym на dq по цене px (до проскальзывания).
  function fill(key, sym, dq, px, b, t, type, reason) {
    if (!dq) return;
    const ins = instr(sym);
    const slip = slippage(ins, { orderType: type, notional: Math.abs(dq) * contractValue(sym, b), barValue: (b.v || 0) * contractValue(sym, b), slipMult: o.slipMult });
    const execPx = px * (1 + Math.sign(dq) * slip);
    const value = Math.abs(dq) * contractValue(sym, b) * (execPx / px);
    const comm = value * commissionRate(ins, o);
    const slipCost = Math.abs(dq) * Math.abs(execPx - px) * rubPerPoint(sym, b);
    st.cash -= comm;
    st.costs.commission += comm;
    st.costs.slippage += slipCost;
    st.turnoverToday += value;

    const p = st.pos[key] ?? { qty: 0, mark: execPx, cost: 0 };
    if (ins.kind === 'share') st.cash -= dq * execPx;
    else { st.cash += p.qty * (execPx - p.mark) * rubPerPoint(sym, b); p.mark = execPx; }

    // учёт сделок: закрытие/сокращение фиксирует P&L по средней цене входа
    const closing = p.qty && Math.sign(dq) !== Math.sign(p.qty) ? Math.min(Math.abs(dq), Math.abs(p.qty)) : 0;
    if (closing) {
      const share = closing / Math.abs(p.qty);
      const pnl = Math.sign(p.qty) * closing * (execPx - p.entryPx) * rubPerPoint(sym, b);
      trades.push({
        strat: key.split('|')[0], sym, side: Math.sign(p.qty), qty: closing,
        entryT: p.entryT, entryPx: p.entryPx, exitT: t, exitPx: execPx,
        pnl, costs: p.cost * share + comm * (closing / Math.abs(dq)), reason, feat: p.feat, tag: p.tag,
        bars: p.bars, value: closing * contractValue(sym, b),
      });
      p.cost -= p.cost * share;
    }
    const newQty = p.qty + dq;
    if (newQty === 0) { delete st.pos[key]; return; }
    const opening = Math.abs(dq) - closing;
    if (opening > 0) {
      const prevAbs = Math.sign(newQty) === Math.sign(p.qty) ? Math.abs(p.qty) : 0;
      p.entryPx = prevAbs ? (p.entryPx * prevAbs + execPx * opening) / (prevAbs + opening) : execPx;
      if (!prevAbs) { p.entryT = t; p.bars = 0; }
      p.cost += comm * (opening / Math.abs(dq));
    }
    p.qty = newQty;
    st.pos[key] = p;
  }

  // Новый торговый день: доход фонда за календарные дни, процент по отрицательным деньгам,
  // плата за обслуживание, дивиденды, перекладка свободных денег в фонд, сброс дневных лимитов.
  function newDay(d) {
    if (st.date) {
      const days = dayDiff(st.date, d);
      const r = Math.max(0, lastRate + (o.rateShift ?? 0));
      if (st.fund > 0) { const inc = st.fund * mmfDaily(r, days, o.mmfFee); st.fund += inc; st.costs.mmf += inc; }
      if (!cfg.inFund && st.cash > 0 && cfg.cashYield) { const inc = st.cash * mmfDaily(r, days, o.mmfFee); st.cash += inc; st.costs.mmf += inc; }
      if (st.cash < 0) { const int = -st.cash * (Math.pow(1 + (r + 4) / 100, days / 365) - 1); st.cash -= int; st.costs.marginInterest += int; }
      if (o.premiumFeeMonth && d.slice(0, 7) !== st.date.slice(0, 7)) { st.cash -= o.premiumFeeMonth; st.costs.premium += o.premiumFeeMonth; }
    }
    if (moneyMap.has(d)) lastRate = moneyMap.get(d);
    // дивиденды по длинным позициям в акциях: дивидендная доходность рынка за день (MCFTRR/IMOEX), минус НДФЛ 13%
    const dy = divs.get?.(d) ?? 0;
    if (dy > 0) {
      for (const [k, p] of Object.entries(st.pos)) {
        const sym = k.split('|')[1];
        if (p.qty > 0 && instr(sym).kind === 'share' && last[sym]) {
          const inc = p.qty * last[sym].c * dy * 0.87; st.cash += inc; st.costs.dividends += inc;
        }
      }
    }
    st.date = d;
    if (cfg.inFund) {
      const eq = equityNow();
      const target = Math.max(0, eq - sharesValue() - eq * o.reserve);
      const move = target - st.fund;
      st.fund += move; st.cash -= move;
    }
    st.turnoverToday = 0;
    st.dayStartEq = equityNow();
    st.halted = false;
  }

  function recordDay(d) {
    const eq = equityNow();
    equity.push({ d, eq, fund: st.fund, cash: st.cash, gross: gross(), margin: marginUsed() });
    st.peak = Math.max(st.peak, eq);
    const dd = 1 - eq / st.peak;
    if (dd > risk.ddHalt) st.ddMode = true;
    else if (dd < risk.ddHalt / 2) st.ddMode = false;
  }

  function flattenAll(t, reason) {
    for (const [k, p] of Object.entries(st.pos)) {
      const sym = k.split('|')[1]; const b = last[sym];
      fill(k, sym, -p.qty, b.c, b, t, 'market', reason);
    }
    st.pending = [];
  }

  // Ограничение размера заявки: оборот за день, суммарное плечо, гарантийное обеспечение.
  function capDelta(sym, dq, b) {
    if (!dq) return 0;
    const cv = contractValue(sym, b);
    const eq = equityNow();
    let maxQ = Math.abs(dq);
    const turnLeft = risk.maxTurnoverPerDay * eq - st.turnoverToday;
    maxQ = Math.min(maxQ, Math.floor(Math.max(0, turnLeft) / cv));
    const grossLeft = risk.maxGrossLev * eq - gross();
    maxQ = Math.min(maxQ, Math.floor(Math.max(0, grossLeft) / cv));
    if (instr(sym).kind === 'fut') {
      const mLeft = risk.marginUse * collateral() - marginUsed();
      maxQ = Math.min(maxQ, Math.floor(Math.max(0, mLeft) / Math.max(1, marginPer(sym, b))));
    }
    return Math.sign(dq) * Math.max(0, maxQ);
  }

  function processOrder(ord, sym, b, t, atClose) {
    const key = `${ord.strat}|${sym}`;
    const p = st.pos[key];
    const cur = p?.qty ?? 0;
    if (ord.setStop !== undefined) { if (p) p.stop = ord.setStop; return true; }
    let dq = ord.target - cur;
    if (!dq) { if (p && ord.stop !== undefined) p.stop = ord.stop; return true; }
    const reducing = Math.abs(ord.target) < Math.abs(cur) && Math.sign(ord.target || cur) === Math.sign(cur);
    const opening = !reducing;
    if (opening && (st.halted || ord.blocked)) return true;
    if (opening) {
      // при развороте сначала закрываем, остаток ограничиваем лимитами
      const closePart = Math.sign(dq) !== Math.sign(cur) && cur ? -cur : 0;
      const openPart = dq - closePart;
      dq = closePart + capDelta(sym, openPart, b);
      if (!dq) return true;
    }
    let px;
    if (atClose) px = b.c;
    else if (ord.type === 'limit') {
      const miss = ord.limit * o.limitFillMissBp / 1e4;
      const ok = dq > 0 ? b.l < ord.limit - miss : b.h > ord.limit + miss;
      if (!ok) return false;
      px = dq > 0 ? Math.min(ord.limit, b.o) : Math.max(ord.limit, b.o);
    } else px = b.o;
    fill(key, sym, dq, px, b, t, atClose ? 'market' : ord.type ?? 'market', ord.reason ?? 'signal');
    const np = st.pos[key];
    if (np) {
      if (ord.stop !== undefined) np.stop = ord.stop;
      if (ord.feat && !p) np.feat = ord.feat;
      if (ord.tag) np.tag = ord.tag;
    }
    return true;
  }

  function checkStops(sym, b, t) {
    for (const [k, p] of Object.entries(st.pos)) {
      if (!k.endsWith(`|${sym}`) || p.stop == null) continue;
      const long = p.qty > 0;
      const hit = long ? b.l <= p.stop : b.h >= p.stop;
      if (!hit) continue;
      const gap = long ? b.o <= p.stop : b.o >= p.stop;
      fill(k, sym, -p.qty, gap ? b.o : p.stop, b, t, 'market', gap ? 'gap' : 'stop');
    }
  }

  const ctx = {
    get equity() { return equityNow(); },
    get date() { return st.date; },
    get riskScale() { return st.ddMode ? 0.5 : 1; },
    get halted() { return st.halted; },
    pos: (strat, sym) => st.pos[`${strat}|${sym}`]?.qty ?? 0,
    position: (strat, sym) => st.pos[`${strat}|${sym}`],
    bar: (sym) => last[sym],
    index: (sym) => idx[sym],
    contractValue: (sym) => contractValue(sym, last[sym]),
    // размер позиции: риск riskFrac капитала при стопе на stopDist пунктов
    size(sym, stopDist, riskFrac, maxLev = 1) {
      const b = last[sym];
      const perUnitRisk = stopDist * rubPerPoint(sym, b);
      if (!(perUnitRisk > 0)) return 0;
      const eq = equityNow();
      let q = Math.floor((eq * riskFrac * (st.ddMode ? 0.5 : 1)) / perUnitRisk);
      q = Math.min(q, Math.floor((eq * maxLev) / contractValue(sym, b)));
      return Math.max(0, q);
    },
  };

  for (const t of timeline) {
    const d = t.slice(0, 10);
    if (d !== st.date) {
      if (st.date) recordDay(st.date);
      newDay(d);
    }
    const updated = [];
    for (const [sym, i] of at.get(t)) {
      const b = series[sym].bars[i];
      const prev = last[sym];
      last[sym] = b; idx[sym] = i;
      // перекладка фьючерса: открытые позиции платят две стороны сделки
      if (b.roll && instr(sym).kind === 'fut') {
        for (const [k, p] of Object.entries(st.pos)) {
          if (!k.endsWith(`|${sym}`)) continue;
          const v = Math.abs(p.qty) * contractValue(sym, b);
          const c = v * (2 * commissionRate(instr(sym), o) + 2 * slippage(instr(sym), { slipMult: o.slipMult }));
          st.cash -= c; st.costs.roll += c;
        }
      }
      // отложенные заявки этого инструмента
      const keep = [];
      for (const ord of st.pending) {
        if (ord.sym !== sym) { keep.push(ord); continue; }
        const done = processOrder(ord, sym, b, t, false);
        if (!done && (ord.ttl ?? 1) > 1) keep.push({ ...ord, ttl: ord.ttl - 1 });
      }
      st.pending = keep;
      checkStops(sym, b, t);
      // вариационная маржа по закрытию бара
      for (const [k, p] of Object.entries(st.pos)) {
        if (!k.endsWith(`|${sym}`)) continue;
        p.bars = (p.bars ?? 0) + (prev ? 1 : 0);
        if (instr(sym).kind === 'fut') { st.cash += p.qty * (b.c - p.mark) * rubPerPoint(sym, b); p.mark = b.c; }
      }
      updated.push(sym);
    }

    // дневной лимит убытка
    if (!st.halted && equityNow() < st.dayStartEq * (1 - risk.dailyLossLimit)) {
      flattenAll(t, 'daily-loss');
      st.halted = true;
    }

    for (const s of strategies) {
      const mine = updated.filter((x) => s.symbols.includes(x));
      if (!mine.length) continue;
      const orders = s.onBar(ctx, mine, t) ?? [];
      for (const ord of orders) {
        const o2 = { strat: s.id, ...ord };
        if (ord.when === 'close') processOrder(o2, ord.sym, last[ord.sym], t, true);
        else {
          st.pending = st.pending.filter((p) => !(p.strat === s.id && p.sym === ord.sym && p.setStop === undefined && ord.setStop === undefined));
          st.pending.push(o2);
        }
      }
    }
  }
  if (st.date) recordDay(st.date);

  // Итоговое состояние — для робота: какие позиции держать и какие заявки выставить на следующий бар.
  const final = {
    date: st.date, equity: equityNow(), fund: st.fund, cash: st.cash, halted: st.halted, ddMode: st.ddMode,
    positions: Object.entries(st.pos).map(([k, p]) => {
      const [strat, sym] = k.split('|');
      return { strat, sym, qty: p.qty, stop: p.stop ?? null, entryPx: p.entryPx, entryT: p.entryT, bars: p.bars, secid: last[sym]?.secid ?? sym, price: last[sym]?.c, raw: last[sym]?.raw ?? last[sym]?.c };
    }),
    pending: st.pending.map(({ feat, ...o2 }) => o2),
    lastBars: Object.fromEntries(Object.entries(last).map(([s, b]) => [s, { t: b.t ?? b.d, c: b.c, raw: b.raw ?? b.c, secid: b.secid ?? s }])),
  };
  return { equity, trades, costs: st.costs, capital: o.capital, params: { costs: o, risk, inFund: !!cfg.inFund }, final };
}
