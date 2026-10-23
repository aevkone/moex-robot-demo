// Модель издержек и «нулевой стратегии» (рис. 1 промежуточного отчёта).
// Все ставки — доли (0.0003 = 0,03%), годовые результаты — % капитала.

export const DEFAULTS = {
  capital: 500_000,
  commission: 0.0003,      // тариф Премиум, с каждой стороны сделки, от стоимости
  futCommission: 0.0003,   // допущение до брокерского отчёта
  premiumFeeMonth: 0,      // 2 990 ₽, если обслуживание Premium платное
  mmfFee: 0.012,           // разница RUSFAR − доходность фонда (комиссия управления, лаг)
  reserve: 0.125,          // денежный запас вне фонда для ежедневных расчётов
  haircut: 0.9,            // коэффициент принятия паёв в залог
  slipMult: 1,             // множитель проскальзывания (стресс-сценарий ×2)
  limitFillMissBp: 1,      // лимитная заявка исполняется, только если цена прошла лимит на ≥ 1 б.п.
  futExchangeFee: 0.00002, // биржевой сбор по фьючерсам сверх комиссии брокера, с каждой стороны (допущение)
  fundSpreadBp: 0.5,       // спред при ежедневной перекладке денег в паи фонда, б.п. от суммы
  rateShift: 0,            // сдвиг ставки денежного рынка, п.п. (сценарий снижения ключевой ставки)
};

// Режимы для рис. 1: оборот — число полных оборотов капитала «купил+продал» в год.
export const MODES = {
  original: {
    title: 'Как планировалось: интрадей на акциях',
    roundTripsPerYear: 250, slipBpPerSide: 2.0, inFund: false,
  },
  recommended: {
    title: 'С рекомендациями: фьючерсы, меньше сделок, капитал в фонде',
    roundTripsPerYear: 50, slipBpPerSide: 1.0, inFund: true,
  },
};

// Годовой результат счёта, если стратегия сама по себе заработала ноль.
export function zeroStrategy(mode, p = {}) {
  const o = { ...DEFAULTS, ...p };
  const m = { ...MODES[mode] ?? mode, ...(p.mode ?? {}) };
  const fundYield = p.fundYield ?? 12;                         // % годовых фонда сейчас
  const commission = -m.roundTripsPerYear * 2 * o.commission * 100;
  const slippage = -m.roundTripsPerYear * 2 * (m.slipBpPerSide * o.slipMult) / 100;
  const mmf = m.inFund ? fundYield * (1 - o.reserve) : 0;
  const premium = -(o.premiumFeeMonth * 12) / o.capital * 100;
  const total = commission + slippage + mmf + premium;
  return {
    commission, slippage, mmf, premium, total,
    fundOnly: fundYield,
    // сколько должна заработать сама стратегия, чтобы счёт обогнал «всё в фонде»
    hurdle: fundYield - total,
  };
}

// Проскальзывание одной стороны сделки, доля цены.
// Рыночная заявка: spreadBp инструмента (полспреда + удар), растёт с объёмом относительно бара.
export function slippage(instr, { orderType = 'market', notional = 0, barValue = Infinity, slipMult = 1 } = {}) {
  if (orderType === 'limit') return 0;
  const base = (instr.spreadBp ?? 3) / 1e4;
  const impact = barValue > 0 && Number.isFinite(barValue) ? Math.min(0.002, 0.1 * Math.sqrt(notional / barValue) / 100) : 0;
  return (base + impact) * slipMult;
}

export function commissionRate(instr, o = DEFAULTS) {
  return instr.kind === 'fut' ? o.futCommission + (o.futExchangeFee ?? 0) : o.commission;
}

// Дневная доходность фонда ДР по ставке RUSFAR (% годовых) — начисляется по календарным дням.
export function mmfDaily(rusfarPct, days = 1, fee = DEFAULTS.mmfFee) {
  const annual = Math.max(0, rusfarPct / 100 - fee);
  return Math.pow(1 + annual, days / 365) - 1;
}
