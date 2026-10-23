// Справочник инструментов исследования.
// Акции TQBR: лот задаётся числом бумаг, стоимость позиции = цена × бумаги.
// Фьючерсы FORTS: стоимость одного контракта в рублях считается через pointValue(price, usdrub).

export const SHARES = [
  { sym: 'SBER', name: 'Сбербанк' },
  { sym: 'GAZP', name: 'Газпром' },
  { sym: 'LKOH', name: 'Лукойл' },
  { sym: 'GMKN', name: 'Норникель' },
  { sym: 'NVTK', name: 'Новатэк' },
  { sym: 'ROSN', name: 'Роснефть' },
  { sym: 'TATN', name: 'Татнефть' },
  { sym: 'MGNT', name: 'Магнит' },
  { sym: 'CHMF', name: 'Северсталь' },
  { sym: 'PLZL', name: 'Полюс' },
  { sym: 'MTSS', name: 'МТС' },
  { sym: 'ALRS', name: 'Алроса' },
  { sym: 'VTBR', name: 'ВТБ' },
  { sym: 'SNGSP', name: 'Сургутнефтегаз-п' },
];

// cycle: 'Q' — квартальные контракты (H M U Z), 'M' — месячные.
// margin — гарантийное обеспечение, доля стоимости контракта (допущение; в стрессы ×2).
// spreadBp — полспреда + удар рыночной заявки небольшого объёма, б.п. от цены (шаг цены / 2 и глубина стакана;
// калибровка: в среднем по акциям ≈ 2 б.п. — как в оценке рис. 1).
export const FUTURES = [
  { sym: 'Si', name: 'Доллар/рубль', cycle: 'Q', margin: 0.12, spreadBp: 0.5,
    notional: (p) => p },                         // 1 лот = 1000 $, цена в ₽ за 1000 $
  { sym: 'RI', name: 'Индекс РТС', cycle: 'Q', margin: 0.17, spreadBp: 0.8,
    notional: (p, usd) => p * 0.02 * usd },       // 1 пункт = 0,02 $
  { sym: 'BR', name: 'Нефть Brent', cycle: 'M', margin: 0.18, spreadBp: 1.0,
    notional: (p, usd) => p * 10 * usd },         // 10 баррелей, цена в $
  { sym: 'SR', name: 'Сбербанк (фьюч.)', cycle: 'Q', margin: 0.17, spreadBp: 1.2,
    notional: (p) => p },                         // 100 акций, цена в ₽ за 100 акций
  { sym: 'GZ', name: 'Газпром (фьюч.)', cycle: 'Q', margin: 0.17, spreadBp: 1.5,
    notional: (p) => p },
];

export const MONTH_CODES = 'FGHJKMNQUVXZ';

// Коды контрактов вида SiH0, BRF6 за диапазон лет (последняя цифра года, как на ФОРТС).
export function contractCodes(asset, fromYear, toYear) {
  const spec = FUTURES.find((f) => f.sym === asset);
  const months = spec.cycle === 'Q' ? [3, 6, 9, 12] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const out = [];
  for (let y = fromYear; y <= toYear; y++) {
    for (const m of months) out.push({ secid: `${asset}${MONTH_CODES[m - 1]}${y % 10}`, year: y, month: m });
  }
  return out;
}

export const findInstrument = (sym) =>
  FUTURES.find((f) => f.sym === sym) ? { kind: 'fut', ...FUTURES.find((f) => f.sym === sym) }
    : SHARES.find((s) => s.sym === sym) ? { kind: 'share', spreadBp: shareSpreadBp(sym), ...SHARES.find((s) => s.sym === sym) }
      : null;

// Акции: самые ликвидные дешевле по проскальзыванию.
export function shareSpreadBp(sym) {
  return ({ SBER: 1, GAZP: 1.5, LKOH: 1.5, GMKN: 2, ROSN: 2, VTBR: 2, NVTK: 2.5, TATN: 2.5 })[sym] ?? 3.5;
}
