// Клиент публичного MOEX ISS (iss.moex.com). Работает в Node 18+ и в браузере (fetch).
const BASE = 'https://iss.moex.com/iss';

async function getJson(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`ISS ${r.status} ${url}`);
      return await r.json();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
}

const rows = (block) => block.data.map((r) => Object.fromEntries(block.columns.map((c, i) => [c, r[i]])));

// История дневных итогов с пагинацией по history.cursor.
export async function history(path, from, till, columns) {
  const out = [];
  for (let start = 0; ; ) {
    const url = `${BASE}/history/${path}.json?from=${from}&till=${till}&start=${start}&iss.meta=off`
      + (columns ? `&history.columns=${columns.join(',')}` : '');
    const j = await getJson(url);
    const page = rows(j.history);
    out.push(...page);
    const [, total, size] = j['history.cursor'].data[0] ?? [0, 0, 100];
    start += size;
    if (!page.length || start >= total) break;
  }
  return out;
}

// Свечи (interval: 1, 10, 60, 24) — пагинация по start, пока страница не пустая.
export async function candles(path, from, till, interval = 60) {
  const out = [];
  for (let start = 0; ; ) {
    const url = `${BASE}/${path}/candles.json?from=${from}&till=${till}&interval=${interval}&start=${start}&iss.meta=off`;
    const page = rows((await getJson(url)).candles);
    out.push(...page);
    if (page.length < 500) break;
    start += page.length;
  }
  return out.map((c) => ({ t: c.begin, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume }));
}

export async function description(secid) {
  const j = await getJson(`${BASE}/securities/${secid}.json?iss.meta=off&iss.only=description`);
  return Object.fromEntries(j.description.data.map((r) => [r[0], r[2]]));
}

export const shareDaily = (sym, from, till) =>
  history(`engines/stock/markets/shares/boards/TQBR/securities/${sym}`, from, till,
    ['TRADEDATE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME'])
    .then((r) => r.filter((x) => x.CLOSE).map((x) => ({ d: x.TRADEDATE, o: x.OPEN, h: x.HIGH, l: x.LOW, c: x.CLOSE, v: x.VOLUME })));

export const shareHourly = (sym, from, till) =>
  candles(`engines/stock/markets/shares/boards/TQBR/securities/${sym}`, from, till, 60);

export const futDaily = (secid, from, till) =>
  history(`engines/futures/markets/forts/securities/${secid}`, from, till,
    ['TRADEDATE', 'OPEN', 'HIGH', 'LOW', 'CLOSE', 'VOLUME', 'OPENPOSITION'])
    .then((r) => r.filter((x) => x.CLOSE).map((x) => ({ d: x.TRADEDATE, o: x.OPEN ?? x.CLOSE, h: x.HIGH ?? x.CLOSE, l: x.LOW ?? x.CLOSE, c: x.CLOSE, v: x.VOLUME, oi: x.OPENPOSITION })));

export const futHourly = (secid, from, till) =>
  candles(`engines/futures/markets/forts/securities/${secid}`, from, till, 60);

// RUSFAR — ставка овернайт денежного рынка Мосбиржи, % годовых (доходность ФДР ≈ RUSFAR − комиссия фонда).
export const rusfar = (from, till) =>
  history('engines/stock/markets/index/securities/RUSFAR', from, till, ['TRADEDATE', 'CLOSE'])
    .then((r) => r.filter((x) => x.CLOSE != null).map((x) => ({ d: x.TRADEDATE, r: x.CLOSE })));

// Индексы Мосбиржи (IMOEX — ценовой, MCFTRR — полной доходности): разница даёт дивидендную доходность рынка.
export const indexDaily = (sym, from, till) =>
  history(`engines/stock/markets/index/securities/${sym}`, from, till, ['TRADEDATE', 'CLOSE'])
    .then((r) => r.filter((x) => x.CLOSE != null).map((x) => ({ d: x.TRADEDATE, c: x.CLOSE })));

// Текущая котировка (у бесплатного ISS — с задержкой до 15 минут): last/bid/offer, лот и шаг цены.
export async function quote(secid, classCode) {
  const path = classCode === 'SPBFUT' ? `engines/futures/markets/forts/securities/${secid}`
    : `engines/stock/markets/shares/boards/${classCode}/securities/${secid}`;
  const j = await getJson(`${BASE}/${path}.json?iss.meta=off&iss.only=securities,marketdata`);
  const s = rows(j.securities)[0] ?? {}, m = rows(j.marketdata)[0] ?? {};
  const last = m.LAST ?? m.LCURRENTPRICE ?? m.MARKETPRICE ?? s.PREVSETTLEPRICE ?? s.PREVPRICE ?? null;
  return {
    secid, classCode, last, bid: m.BID ?? null, offer: m.OFFER ?? null,
    lot: classCode === 'SPBFUT' ? 1 : s.LOTSIZE ?? 1, step: s.MINSTEP ?? null,
    margin: s.INITIALMARGIN ?? null, stepPrice: s.STEPPRICE ?? null, lastTrade: s.LASTTRADEDATE ?? null,
    time: m.UPDATETIME ?? m.TIME ?? null,
  };
}
