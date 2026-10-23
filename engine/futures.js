// Склейка фьючерсов в непрерывный ряд.
// Правило: торгуем ближайший контракт, у которого до последнего дня обращения больше rollDays календарных дней.
// Цены в ряду — с аддитивной обратной корректировкой (разница цен внутри контракта сохраняется точно,
// значит P&L в пунктах корректен, включая доход/расход на перекладке); raw — фактическая цена для
// расчёта стоимости контракта и ГО. На первом баре нового контракта стоит roll: true — бэктест
// списывает издержки перекладки, если позиция открыта.

const addDays = (d, n) => {
  const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

// contracts: [{ secid, lastTrade: 'YYYY-MM-DD', daily: [{d,o,h,l,c,v}] }]
export function stitchDaily(contracts, rollDays = 7) {
  const list = contracts.filter((c) => c.daily?.length).sort((a, b) => a.lastTrade.localeCompare(b.lastTrade));
  const byDate = list.map((c) => new Map(c.daily.map((b) => [b.d, b])));
  const dates = [...new Set(list.flatMap((c) => c.daily.map((b) => b.d)))].sort();

  const pick = (d) => list.findIndex((c, i) => addDays(d, rollDays) < c.lastTrade && byDate[i].has(d));
  const raw = [];
  for (const d of dates) {
    const i = pick(d);
    if (i < 0) continue;
    raw.push({ ...byDate[i].get(d), k: i });
  }

  // Поправка контракта: у последнего 0; идя назад, на каждой перекладке старый контракт получает
  // поправку нового + разрыв (закрытие нового минус закрытие старого в последний день старого).
  const offs = new Map();
  let run = 0;
  for (let j = raw.length - 1; j >= 0; j--) {
    const cur = raw[j];
    if (!offs.has(cur.k)) offs.set(cur.k, run);
    const prev = raw[j - 1];
    if (prev && prev.k !== cur.k) {
      const nextOnPrevDay = byDate[cur.k].get(prev.d);
      run = offs.get(cur.k) + (nextOnPrevDay ? nextOnPrevDay.c - prev.c : cur.o - prev.c);
    }
  }

  const out = raw.map((b, j) => {
    const off = offs.get(b.k);
    return {
      d: b.d, o: b.o + off, h: b.h + off, l: b.l + off, c: b.c + off, v: b.v,
      raw: b.c, secid: list[b.k].secid, roll: j > 0 && raw[j - 1].k !== b.k,
    };
  });
  const offsets = Object.fromEntries([...offs].map(([k, v]) => [list[k].secid, v]));
  return { bars: out, offsets };
}

// Часовые бары склеиваются по тем же контрактам и поправкам, что и дневной ряд.
// hourly: { [secid]: [{t,o,h,l,c,v}] }
export function stitchHourly(dailyBars, offsets, hourly) {
  const contractOn = new Map(dailyBars.map((b) => [b.d, b.secid]));
  const out = [];
  let prevSec = null;
  const all = Object.entries(hourly).flatMap(([secid, bars]) => bars.map((b) => ({ ...b, secid })));
  all.sort((a, b) => a.t.localeCompare(b.t));
  for (const b of all) {
    const d = b.t.slice(0, 10);
    if (contractOn.get(d) !== b.secid) continue;
    const off = offsets[b.secid] ?? 0;
    out.push({ t: b.t, o: b.o + off, h: b.h + off, l: b.l + off, c: b.c + off, v: b.v,
      raw: b.c, secid: b.secid, roll: prevSec !== null && prevSec !== b.secid });
    prevSec = b.secid;
  }
  return out;
}
