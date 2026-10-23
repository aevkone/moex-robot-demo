// Загрузка данных панели. Компактный daily.json разворачивается в формат buildDataset.
export async function loadJSON(path) {
  const r = await fetch(path, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

export function decodeDaily(d) {
  const series = {};
  for (const [sym, s] of Object.entries(d.series)) {
    const rolls = new Set(s.roll ?? []);
    series[sym] = {
      daily: s.d.map((date, i) => ({
        d: date, o: s.o[i], h: s.h[i], l: s.l[i], c: s.c[i], v: s.v[i],
        ...(s.raw ? { raw: s.raw[i], secid: s.secid[i], roll: rolls.has(i) } : {}),
      })),
      hourly: [],
    };
  }
  return {
    series, meta: d.meta,
    RUSFAR: d.RUSFAR.map(([dd, r]) => ({ d: dd, r })),
    IMOEX: d.IMOEX.map(([dd, c]) => ({ d: dd, c })),
    MCFTR: (d.MCFTR ?? d.MCFTRR).map(([dd, c]) => ({ d: dd, c })),
  };
}

// Состояние робота: живое с локального сервера, иначе — снимок для демо.
export async function loadRobot() {
  try {
    const r = await fetch('api/robot', { cache: 'no-store' });
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return { live: true, ...(await r.json()) };
  } catch { /* статический хостинг */ }
  try { return { live: false, ...(await loadJSON('data/robot.json')) }; } catch { return { live: false, empty: true }; }
}
