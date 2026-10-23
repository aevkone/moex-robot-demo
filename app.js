// Панель: итог исследования, варианты, калькулятор издержек, бэктест в браузере, монитор робота, методика.
import { equityChart, barChart, zeroChart, yearChart } from './charts.js';
import { zeroStrategy, DEFAULTS } from './engine/costs.js';
import { loadJSON, loadRobot } from './data.js';
import { startTour } from './tour.js';

const $ = (s, el = document) => el.querySelector(s);
const main = $('#main');
const C = { A: 'var(--A)', B: 'var(--B)', C: 'var(--C)', D: 'var(--D)', fund: 'var(--fund)', text: 'var(--text)', muted: 'var(--muted)', grid: 'var(--grid)', bg: 'transparent', commission: 'color-mix(in srgb, var(--bad) 45%, var(--surface))', slippage: 'color-mix(in srgb, var(--bad) 22%, var(--surface))', mmf: 'color-mix(in srgb, var(--accent) 45%, var(--surface))' };
const n = (x, d = 1) => (x == null || Number.isNaN(x) ? '—' : x.toFixed(d).replace('.', ',').replace('-', '−'));
const pp = (x, d = 1) => (x == null ? '—' : `${x > 0 ? '+' : ''}${n(x, d)}`);
const rub = (x) => (x == null ? '—' : Math.round(x).toLocaleString('ru-RU').replace('-', '−'));
const cls = (x) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const STRAT = { breakout: 'Пробой канала', impulse: 'Импульс', pullback: 'Откат в тренде', portfolio: 'Портфель акций', orb: 'Пробой диапазона открытия' };
const SHORT = { A: 'Интрадей акции', B: 'Интрадей фьючерсы', C: 'Свинг фьючерсы', D: 'Свинг + портфель' };
const costSum = (c) => c.commission + c.slippage + c.roll + c.marginInterest + c.premium;
const fmtDate = (d) => (d ? d.slice(0, 10).split('-').reverse().join('.') : '—');

let R = null;

// ---------- тема ----------
const themeBtn = $('#theme');
const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
try { applyTheme(localStorage.getItem('theme')); } catch { /* без хранилища */ }
themeBtn.onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const t = dark ? 'light' : 'dark';
  applyTheme(t);
  try { localStorage.setItem('theme', t); } catch { /* без хранилища */ }
};

// ---------- общие куски ----------
const kpi = (v, l, tone = '') => `<div class="${tone}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
const stats = (...items) => `<div class="stats" style="--n:${items.length}">${items.join('')}</div>`;
const ICON_OK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_NO = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const ICON_WARN = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 7v6M12 16.5v.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
// tone: true / 'yes' — зелёный, 'conditional' — жёлтый, false / 'no' — красный
const verdict = (tone, title, note) => {
  const t = tone === true || tone === 'yes' ? 'yes' : tone === 'conditional' ? 'warn' : 'no';
  return `<div class="card verdict ${t === 'yes' ? '' : t}" role="note"><span class="ico">${t === 'yes' ? ICON_OK : t === 'warn' ? ICON_WARN : ICON_NO}</span><b>${title}</b><div class="note">${note}</div></div>`;
};
// термин с расшифровкой: подчёркнут пунктиром, пояснение — по наведению/фокусу и в «Словаре» на странице «Методика»
const GLOSSARY = {
  'п.п.': 'процентный пункт: разница между процентами (16% и 10% — это 6 п.п.)',
  'просадка': 'насколько счёт опускался от своего максимума до следующего минимума',
  'фонд ДР': 'фонд денежного рынка: вкладывает в однодневные займы под ставку, близкую к ключевой, почти без колебаний',
  'свинг': 'сделки на несколько дней (здесь — до 10)',
  'интрадей': 'сделки внутри одного дня',
  'ГО': 'гарантийное обеспечение — часть стоимости фьючерса, которая блокируется на время сделки',
  'Шарп': 'доходность на единицу колебаний; чем выше, тем ровнее рост',
  'проверка': 'годы 2023–2026: на них настройки не подбирались — ближайший аналог будущей торговли',
  'бумажная торговля': 'робот работает на живых котировках, но сделки только записываются — денег нет',
  'проскальзывание': 'разница между ценой, которую видит робот, и ценой, по которой реально прошла сделка',
  'ИИ-фильтр': 'модель, которая отсекает слабые сигналы; на дневных данных результата не дала',
  'бутстреп': 'способ прогноза: из прошлых месяцев много раз случайно собирается «следующий год»',
};
const term = (w, label = w) => `<abbr class="term" title="${esc(GLOSSARY[w] ?? '')}" tabindex="0">${label}</abbr>`;
const tr = (pct, cap = 500000) => `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${rub(Math.abs(pct / 100 * cap) / 1000)} тыс. ₽`;
// ширина графика = ширина контента, чтобы подписи оставались читаемыми и на телефоне
const cw = () => Math.round(Math.min(1100, Math.max(340, main.clientWidth - 48)));
const table = (head, rows, { hl = -1 } = {}) => `<div class="tablewrap"><table><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr${i === hl ? ' class="hl"' : ''}>${r.map((c) => (typeof c === 'object' && c ? `<td class="${c.cls ?? ''}">${c.v}</td>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
const vlabel = (k) => `<span class="dot" style="background:var(--${k})"></span>${k}. ${SHORT[k]}`;

// ---------- Итог ----------
function viewOverview() {
  const rec = R.recommendation, V = R.variants, best = V[rec.key], B = R.benchmark;
  const lines = [
    ...['D', 'C', 'B', 'A'].map((k) => ({ label: `${k}. ${SHORT[k]}`, color: C[k], points: V[k].equity, width: k === rec.key ? 3 : 1.8 })),
    { label: 'Фонд ДР', color: C.fund, points: B.equity, dash: '6 4' },
  ];
  const F = R.forecast.base, FH = R.forecast.fullHistory;
  const sens = Object.fromEntries(R.sensitivity.rows.map((r) => [r.id, r]));
  const lost = best.full.yearsLost ?? [];
  const head = { yes: `Идём в разработку с вариантом ${rec.key}`, conditional: `Вариант ${rec.key} — в разработку с условием`, no: 'Ни один вариант пока не готов к разработке' }[rec.go];
  return `
  <h1>${head}</h1>
  <p class="sub">Четыре варианта настройки робота проверены на истории Мосбиржи ${fmtDate(R.meta.from)} — ${fmtDate(R.meta.to)} при тарифе 0,03% и капитале 500 тыс. ₽. Настройки выбирались по 2020–2022 годам, 2023–2026 — ${term('проверка')}.</p>
  ${verdict(rec.go, esc(best.title) + (rec.go === 'conditional' ? ' — сначала бумажная торговля' : ''), esc(rec.reason))}
  <div style="margin-top:14px">${stats(
    kpi(`${n(best.full.cagr)}%`, `годовых у варианта ${best.key} после всех издержек; ${term('фонд ДР')} — ${n(B.cagr)}%`, 'good'),
    kpi(`${pp(best.outSample.excessCagr)} ${term('п.п.')}`, `сверх фонда на проверке 2023–2026 — около ${tr(best.outSample.excessCagr)} в год`, best.outSample.excessCagr > 0 ? 'good' : 'bad'),
    kpi(`${n(best.full.maxDD)}%`, `${term('просадка')} — около ${tr(-best.full.maxDD)} на 500 тыс.`),
    kpi(`${n(F.probBeatFund * 100, 0)}%`, 'шанс обогнать фонд за следующий год'))}
  </div>
  <div class="grid g2" style="margin-top:18px">
    <div class="card"><h3 style="margin-top:0">Насколько мы уверены</h3>
      <ul class="list">
        <li>Преимущество небольшое и неровное: на проверке ${n(best.outSample.cagr)}% против ${n(best.outSample.benchmarkCagr)}% у фонда.${lost.length ? ` Фонд был выгоднее в ${lost.map((y) => `${y.year} (${n(y.ret)}% против ${n(y.fund)}%)`).join(', ')}.` : ''}</li>
        <li>Статистически не доказано: t-статистика ${n(best.full.tStat, 1)}, для уверенности нужно больше 2.</li>
        <li>Без ${term('ИИ-фильтр', 'ИИ-фильтра')} решили уже после проверки — поэтому финальная проверка будет на ${term('бумажная торговля', 'бумажной торговле')}.</li>
        <li>Если обслуживание Premium платное, превышение падает до ${pp(sens.premium?.excessCagr)} п.п. — проверить тариф.</li>
      </ul>
      ${forecastBlock(F, `прогноз на 12 месяцев по проверке 2023–2026 (${term('бутстреп')}, фонд 12%)`)}
      ${forecastBlock(FH, 'для сравнения — по всей истории 2020–2026')}
    </div>
    <div class="card"><h3 style="margin-top:0">Что дальше</h3>
      <ol class="list steps">
        <li><b>Песочница T-Invest</b>, 1–2 недели: заявки, ГО, фонд и стопы без ошибок.</li>
        <li><b>Бумажная торговля</b>, 3 месяца: без сбоев, расхождение с расчётом меньше 1 п.п. в месяц.</li>
        <li><b>Реальный счёт, 25% капитала</b>, 3 месяца: результат не хуже бумажной торговли.</li>
        <li><b>Весь капитал.</b> Автоостановка при просадке 20% (около ${tr(-20)}) и убытке 4% за день.</li>
      </ol>
      <h3>Что нужно от вас</h3>
      <ul class="list">
        <li>Подтвердить вариант ${best.key} (портфель акций — изменение объёма работ) или выбрать C.</li>
        <li>Брокерский отчёт: ставки по акциям и фьючерсам, плата за Premium.</li>
        <li>Отдельный счёт для робота, «Маржинальная торговля», доступ к фьючерсам, токен API для песочницы.</li>
      </ul>
    </div>
  </div>
  <h2>Капитал по вариантам</h2>
  <div class="card chart">${equityChart(lines, { width: cw(), height: cw() < 640 ? 300 : 420, c: C, log: true, title: 'тыс. ₽, логарифмическая шкала (равные расстояния — равные проценты), после всех издержек' })}</div>
  <h2>Сравнение</h2>
  ${table(['Вариант', 'Доходность, % год.', `Сверх фонда, ${term('п.п.')}`, `${term('просадка', 'Просадка')}, %`, term('Шарп'), 'Сделок', 'Издержки, % год.', 'Сверх фонда 2023–26'],
    [...Object.values(V).map((v) => [vlabel(v.key), n(v.full.cagr), { v: pp(v.full.excessCagr), cls: cls(v.full.excessCagr) }, n(v.full.maxDD), n(v.full.sharpe, 2), rub(v.full.trades), n(-costSum(v.full.costsPctYear)), { v: pp(v.outSample.excessCagr), cls: cls(v.outSample.excessCagr) }]),
      [`<span class="dot" style="background:var(--fund)"></span>Фонд денежного рынка`, n(B.cagr), '0', n(B.maxDD), '—', '0', '0', '0']],
    { hl: Object.keys(V).indexOf(rec.key) })}
  <p class="note">Доходность фонда: ${n(B.cagr)}% годовых за 2020–2026 и ${n(best.outSample.benchmarkCagr)}% за 2023–2026 (ставки были выше); в прогнозе — 12% как ориентир на ближайший год. Расчёт до налогов.</p>`;
}
function forecastBlock(f, label) {
  return `<div style="margin:12px 0">
    <div class="note">${label}</div>
    <div style="display:flex;justify-content:space-between;font-size:14px;margin:4px 0"><span>плохой год (1 из 10): <b>${n(f.p10)}%</b> (${tr(f.p10)})</span><span>средний: <b>${n(f.p50)}%</b></span><span>хороший: <b>${n(f.p90)}%</b></span></div>
    <div class="bar" title="Вероятность обогнать фонд"><i style="width:${(f.probBeatFund * 100).toFixed(0)}%"></i></div>
    <div class="note">обогнать фонд — ${n(f.probBeatFund * 100, 0)}%, год в минусе — ${n(f.probLoss * 100, 0)}%</div></div>`;
}

// ---------- Варианты ----------
function viewVariants(key) {
  const V = R.variants;
  const k = V[key] ? key : R.recommendation.key;
  const v = V[k];
  const years = R.benchmark.years.map((y) => y.year);
  const val = (ys) => Object.fromEntries(ys.map((y) => [y.year, y.ret]));
  const c = v.full.costsPctYear;
  return `
  <h1>Варианты робота</h1>
  <p class="sub">Подробности по каждому варианту: доходность по годам, выбор настроек на обучающем периоде, стресс 2022 года и вклад стратегий.</p>
  <div class="tabs" role="group" aria-label="Вариант">${Object.keys(V).map((x) => `<button type="button" data-variant="${x}" aria-pressed="${x === k}">${x}. ${SHORT[x]}</button>`).join('')}</div>
  ${verdict(v.full.excessCagr > 0 && v.outSample.excessCagr > 0, `${esc(v.title)} — ${v.full.excessCagr > 0 && v.outSample.excessCagr > 0 ? 'обгоняет фонд' : 'проигрывает фонду'}`, `Выбранные настройки: риск ×${v.selected.riskMult}, ${v.selected.filter ? 'с ИИ-фильтром' : 'без ИИ-фильтра'}. На проверке 2023–2026: ${pp(v.outSample.excessCagr)} п.п. к фонду.`)}
  <div style="margin-top:14px">${stats(
    kpi(`${n(v.full.cagr)}%`, 'годовых за весь период', v.full.excessCagr > 0 ? 'good' : 'bad'),
    kpi(`${pp(v.full.excessCagr)} п.п.`, 'сверх фонда', v.full.excessCagr > 0 ? 'good' : 'bad'),
    kpi(`${n(v.full.maxDD)}%`, 'максимальная просадка'),
    kpi(rub(v.full.trades), `сделок, ${n(v.full.turnoverPerYear, 0)} капиталов оборота в год`))}
  </div>
  <h2>По годам</h2>
  <div class="card chart">${yearChart([{ label: `${k}. ${SHORT[k]}`, color: C[k], values: val(v.full.years) }, { label: 'Фонд ДР', color: C.fund, values: val(R.benchmark.years) }], years, { width: cw(), height: 300, c: C })}</div>
  <div class="grid g2" style="margin-top:18px">
    <div><h2 style="margin-top:0">Издержки и доходы, % в год</h2>
      ${table(['Статья', '% среднего капитала'], [
        ['Комиссии', { v: n(c.commission, 2), cls: 'neg' }], ['Проскальзывание', { v: n(c.slippage, 2), cls: 'neg' }], ['Перекладка фьючерсов', { v: n(c.roll, 2), cls: c.roll ? 'neg' : '' }],
        ['Проценты по займу', n(c.marginInterest, 2)], ['Обслуживание Premium', n(c.premium, 2)],
        ['Доход фонда ДР', { v: pp(c.mmf, 2), cls: 'pos' }], ['Дивиденды', { v: pp(c.dividends, 2), cls: c.dividends ? 'pos' : '' }]])}
    </div>
    <div><h2 style="margin-top:0">Вклад стратегий</h2>
      ${table(['Стратегия', 'Сделок', 'Прибыльных', 'До издержек, ₽', 'Издержки, ₽'], v.byStrategy.map((s) => [STRAT[s.strat] ?? s.strat, rub(s.trades), `${n(s.winRate, 0)}%`, { v: rub(s.pnl), cls: cls(s.pnl) }, rub(s.costs)]))}
    </div>
  </div>
  <h2>Выбор настроек: 2020–2022 → проверка 2023–2026</h2>
  <p class="note">Правило: лучшее превышение над фондом на 2020–2022 при просадке не больше 15%.${v.revised ? ` По нему выбиралась настройка «×${v.strict.riskMult}, с фильтром» (на проверке ${pp(v.strict.outSample.excessCagr)} п.п.); после проверки совет директоров отказался от ИИ-фильтра — он хуже и на 2020–2022 при любом риске. Поэтому цифры проверки для выбранной настройки не полностью независимы.` : ' Проверочный период в выборе не участвовал.'}</p>
  ${table(['Риск, фильтр', '2020–22: сверх фонда', '2020–22: просадка', '2023–26: сверх фонда', '2023–26: просадка'],
    v.grid.map((g) => [`×${g.riskMult}, ${g.filter ? 'с фильтром' : 'без фильтра'}${g.riskMult === v.selected.riskMult && g.filter === v.selected.filter ? ' <span class="badge good">выбрано</span>' : ''}${v.revised && g.riskMult === v.strict.riskMult && g.filter === v.strict.filter ? ' <span class="badge warn">строгое правило</span>' : ''}`, { v: pp(g.is.excessCagr), cls: cls(g.is.excessCagr) }, n(g.is.maxDD), { v: pp(g.oos.excessCagr), cls: cls(g.oos.excessCagr) }, n(g.oos.maxDD)]),
    { hl: v.grid.findIndex((g) => g.riskMult === v.selected.riskMult && g.filter === v.selected.filter) })}
  <h2>Стресс 2022 года</h2>
  ${stats(
    kpi(`${pp(v.stress2022.totalReturn)}%`, '2022 год целиком', v.stress2022.totalReturn > 0 ? 'good' : 'bad'),
    kpi(`${pp(v.stressFebMar2022.totalReturn)}%`, 'февраль–апрель 2022', v.stressFebMar2022.totalReturn > 0 ? 'good' : 'bad'),
    kpi(`${n(v.stress2022.maxDD)}%`, 'просадка в 2022'))}
  <h2>Последние сделки</h2>
  ${table(['Стратегия', 'Инструмент', 'Сторона', 'Вход', 'Выход', 'Причина', 'Результат, ₽'], v.lastTrades.slice().reverse().slice(0, 15).map((t) => [STRAT[t.strat] ?? t.strat, t.sym, t.side > 0 ? 'покупка' : 'продажа', fmtDate(t.entryT), fmtDate(t.exitT), t.reason, { v: rub(t.pnl - t.costs), cls: cls(t.pnl - t.costs) }]))}`;
}

// ---------- Калькулятор ----------
const CALC_FIELDS = [
  ['roundTripsPerYear', 'Оборотов капитала в год (купил + продал)', 10, 400, 10, (v) => n(v, 0)],
  ['slipBpPerSide', 'Проскальзывание на сторону, б.п.', 0, 5, 0.25, (v) => n(v, 2)],
  ['commission', 'Комиссия, %', 0.01, 0.1, 0.005, (v) => `${n(v, 3)}%`],
  ['fundYield', 'Доходность фонда ДР, % годовых', 4, 20, 0.5, (v) => `${n(v, 1)}%`],
  ['reserve', 'Денежный запас вне фонда, %', 0, 50, 2.5, (v) => `${n(v, 1)}%`],
  ['premiumFeeMonth', 'Плата за обслуживание, ₽/мес', 0, 4990, 500, (v) => rub(v)],
  ['capital', 'Капитал, тыс. ₽', 100, 5000, 50, (v) => rub(v)],
];
let calc = null;
function calcPreset(name) {
  const m = name === 'original' ? { roundTripsPerYear: 250, slipBpPerSide: 2, inFund: false } : { roundTripsPerYear: 50, slipBpPerSide: 1, inFund: true };
  return { ...m, commission: 0.03, fundYield: 12, reserve: 12.5, premiumFeeMonth: 0, capital: 500 };
}
function viewCalc() {
  calc ??= calcPreset('recommended');
  return `
  <h1>Калькулятор издержек</h1>
  <p class="sub">Представьте, что сигналы робота сами по себе не дают ни прибыли, ни убытка. Калькулятор показывает, сколько счёт всё равно потеряет на комиссиях и проскальзывании и сколько получит от фонда на свободные деньги, — и сколько стратегия должна заработать сверху, чтобы робот имел смысл. «С рекомендациями» — настройка, близкая к варианту D.</p>
  <div class="split">
    <div class="card form" id="calcForm">
      <div class="tabs" role="group" aria-label="Пресет"><button type="button" data-preset="original" aria-pressed="false">Как планировалось</button><button type="button" data-preset="recommended" aria-pressed="true">С рекомендациями</button></div>
      ${CALC_FIELDS.map(([id, label, min, max, step]) => `<div class="field"><label for="c-${id}">${label} <b id="o-${id}"></b></label><input id="c-${id}" type="range" min="${min}" max="${max}" step="${step}" value="${calc[id]}"></div>`).join('')}
      <div class="checks"><label><input type="checkbox" id="c-inFund" ${calc.inFund ? 'checked' : ''}> Свободные деньги в фонде ДР</label></div>
    </div>
    <div id="calcOut"></div>
  </div>`;
}
function renderCalc() {
  for (const [id, , , , , f] of CALC_FIELDS) $(`#o-${id}`).textContent = f(calc[id]);
  const mode = { roundTripsPerYear: calc.roundTripsPerYear, slipBpPerSide: calc.slipBpPerSide, inFund: calc.inFund };
  const p = { commission: calc.commission / 100, reserve: calc.reserve / 100, premiumFeeMonth: calc.premiumFeeMonth, capital: calc.capital * 1000, fundYield: calc.fundYield };
  const z = zeroStrategy(mode, p);
  const orig = zeroStrategy('original', { ...p, mode: {} });
  $('#calcOut').innerHTML = `
    ${stats(
      kpi(`${pp(z.total)}%`, 'счёт за год при нулевой стратегии', z.total >= 0 ? 'good' : 'bad'),
      kpi(`${n(z.hurdle)}%`, 'нужно заработать стратегии, чтобы обогнать фонд', z.hurdle <= 10 ? 'good' : 'bad'),
      kpi(`${n(z.fundOnly)}%`, 'всё просто в фонде, без робота'))}
    <div class="card chart" style="margin:14px 0">${zeroChart({ original: orig, recommended: { ...z, fundOnly: calc.fundYield } }, { width: Math.max(600, $('#calcOut').clientWidth - 40), c: C })}</div>
    ${table(['Статья, % капитала в год', 'Ваша настройка', 'Изначальный план'], [
      ['Комиссии', { v: pp(z.commission), cls: cls(z.commission) }, pp(orig.commission)],
      ['Проскальзывание', { v: pp(z.slippage), cls: cls(z.slippage) }, pp(orig.slippage)],
      ['Доход фонда ДР', { v: pp(z.mmf), cls: cls(z.mmf) }, pp(orig.mmf)],
      ['Обслуживание', { v: pp(z.premium), cls: cls(z.premium) }, pp(orig.premium)],
      ['<b>Итог</b>', { v: `<b>${pp(z.total)}</b>`, cls: cls(z.total) }, `<b>${pp(orig.total)}</b>`],
      ['Планка, чтобы обогнать фонд', `<b>${n(z.hurdle)}%</b>`, `${n(orig.hurdle)}%`],
    ])}
    <p class="note">Верхняя полоса графика — изначальный план при тех же комиссии, фонде и плате за обслуживание; нижняя — ваша настройка.</p>`;
}
function bindCalc() {
  const form = $('#calcForm');
  form.addEventListener('input', (e) => {
    form.querySelectorAll('[data-preset]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    const id = e.target.id.replace('c-', '');
    calc[id] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
    renderCalc();
  });
  form.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    calc = calcPreset(b.dataset.preset);
    form.querySelectorAll('[data-preset]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    for (const [id] of CALC_FIELDS) $(`#c-${id}`).value = calc[id];
    $('#c-inFund').checked = calc.inFund;
    renderCalc();
  }));
  renderCalc();
}

// ---------- Лаборатория ----------
const LAB_DEFAULT = { instruments: ['Si', 'RI', 'BR', 'SR', 'GZ'], strategies: ['breakout', 'impulse', 'pullback', 'portfolio'], riskMult: 2, filter: false, inFund: true, limit: true, futCommission: 0.03, commission: 0.03, slipMult: 1, premium: false, reserve: 12.5, portfolioWeight: 0.2, dailyLossLimit: 0.04, from: '2020-01-01', to: '2026-12-31', capital: 500000 };
let lab = { ...LAB_DEFAULT };
let worker = null;
function viewLab() {
  const chk = (name, list, labels) => `<div class="checks" data-group="${name}">${list.map((x) => `<label><input type="checkbox" value="${x}" ${lab[name].includes(x) ? 'checked' : ''}> ${labels[x] ?? x}</label>`).join('')}</div>`;
  return `
  <h1>Лаборатория</h1>
  <p class="sub">Тот же движок, что в исследовании, работает прямо в браузере на дневной истории Мосбиржи. Меняйте условия и смотрите, как меняется результат. Внутридневные варианты (A, B) требуют часовых данных и считаются только в исследовании.</p>
  <div class="split">
    <form class="card form" id="labForm" onsubmit="return false">
      <div class="field"><label>Фьючерсы</label>${chk('instruments', ['Si', 'RI', 'BR', 'SR', 'GZ'], { Si: 'Доллар', RI: 'РТС', BR: 'Brent', SR: 'Сбербанк', GZ: 'Газпром' })}</div>
      <div class="field"><label>Стратегии</label>${chk('strategies', ['breakout', 'impulse', 'pullback', 'portfolio'], STRAT)}</div>
      <div class="field"><label for="l-riskMult">Уровень риска <b id="lo-riskMult"></b></label><input id="l-riskMult" type="range" min="0.5" max="4" step="0.5" value="${lab.riskMult}"></div>
      <div class="field"><label for="l-futCommission">Комиссия по фьючерсам, % <b id="lo-futCommission"></b></label><input id="l-futCommission" type="range" min="0.01" max="0.1" step="0.005" value="${lab.futCommission}"></div>
      <div class="field"><label for="l-slipMult">Проскальзывание, × <b id="lo-slipMult"></b></label><input id="l-slipMult" type="range" min="0" max="4" step="0.5" value="${lab.slipMult}"></div>
      <div class="field"><label for="l-reserve">Денежный запас, % <b id="lo-reserve"></b></label><input id="l-reserve" type="range" min="0" max="50" step="2.5" value="${lab.reserve}"></div>
      <div class="field"><label for="l-portfolioWeight">Доля портфеля акций <b id="lo-portfolioWeight"></b></label><input id="l-portfolioWeight" type="range" min="0.05" max="0.5" step="0.05" value="${lab.portfolioWeight}"></div>
      <div class="grid g2"><div class="field"><label for="l-from">С</label><input id="l-from" type="date" value="${lab.from}" min="2020-01-01" max="2026-12-31"></div><div class="field"><label for="l-to">По</label><input id="l-to" type="date" value="${lab.to.slice(0, 10)}" min="2020-01-01" max="2026-12-31"></div></div>
      <div class="checks">
        <label><input type="checkbox" id="l-inFund" ${lab.inFund ? 'checked' : ''}> Свободные деньги в фонде</label>
        <label><input type="checkbox" id="l-limit" ${lab.limit ? 'checked' : ''}> Лимитные заявки</label>
        <label><input type="checkbox" id="l-filter" ${lab.filter ? 'checked' : ''}> ИИ-фильтр</label>
        <label><input type="checkbox" id="l-premium" ${lab.premium ? 'checked' : ''}> Premium платный</label>
      </div>
      <div style="display:flex;gap:8px"><button class="btn primary" id="labRun" type="button">Рассчитать</button><button class="btn" id="labReset" type="button">Как вариант D</button></div>
      <div class="note" id="labStatus" role="status" aria-live="polite"></div>
    </form>
    <div id="labOut"><div class="card empty">Нажмите «Рассчитать» — расчёт занимает несколько секунд.</div></div>
  </div>`;
}
function bindLab() {
  const form = $('#labForm');
  const fmt = { riskMult: (v) => `×${n(v, 1)}`, futCommission: (v) => `${n(v, 3)}%`, slipMult: (v) => `×${n(v, 1)}`, reserve: (v) => `${n(v, 1)}%`, portfolioWeight: (v) => `${n(v * 100, 0)}%` };
  const out = () => { for (const k of Object.keys(fmt)) $(`#lo-${k}`).textContent = fmt[k](lab[k]); };
  form.addEventListener('input', (e) => {
    const t = e.target;
    const g = t.closest('[data-group]');
    if (g) lab[g.dataset.group] = [...g.querySelectorAll('input:checked')].map((x) => x.value);
    else if (t.type === 'checkbox') lab[t.id.slice(2)] = t.checked;
    else if (t.type === 'date') lab[t.id.slice(2)] = t.value;
    else lab[t.id.slice(2)] = +t.value;
    out();
  });
  $('#labReset').onclick = () => { lab = { ...LAB_DEFAULT, riskMult: R.variants.D.selected.riskMult, filter: R.variants.D.selected.filter }; route(); };
  $('#labRun').onclick = runLab;
  out();
}
function runLab() {
  if (!lab.strategies.length) { $('#labStatus').textContent = 'Выберите хотя бы одну стратегию.'; return; }
  worker ??= new Worker('./lab-worker.js', { type: 'module' });
  const btn = $('#labRun'); btn.disabled = true; btn.textContent = 'Считаю…';
  $('#labOut').innerHTML = '<div class="skeleton" style="height:86px"></div><div class="skeleton" style="height:340px;margin-top:14px"></div>';
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') { const s = $('#labStatus'); if (s) s.textContent = data.text; return; }
    const b = $('#labRun'); if (b) { b.disabled = false; b.textContent = 'Рассчитать'; }
    if (data.type === 'error') { $('#labStatus').textContent = `Не получилось посчитать: ${data.text}. Попробуйте другой период или набор стратегий.`; $('#labOut').innerHTML = ''; return; }
    $('#labStatus').textContent = `Готово за ${n(data.ms / 1000, 1)} с.`;
    const s = data.summary, c = s.costsPctYear;
    $('#labOut').innerHTML = `
      ${stats(
        kpi(`${n(s.cagr)}%`, 'годовых после издержек', s.excessCagr > 0 ? 'good' : 'bad'),
        kpi(`${pp(s.excessCagr)} п.п.`, `сверх фонда (${n(data.bench.cagr)}%)`, s.excessCagr > 0 ? 'good' : 'bad'),
        kpi(`${n(s.maxDD)}%`, 'максимальная просадка'),
        kpi(rub(s.trades ?? 0), 'сделок'))}
      <div class="card chart" style="margin-top:14px">${equityChart([{ label: 'Ваша настройка', color: C.D, points: data.equity, width: 2.5 }, { label: 'Фонд ДР', color: C.fund, points: data.benchEquity, dash: '6 4' }], { width: Math.max(360, $('#labOut').clientWidth - 40), height: 340, c: C })}</div>
      <div class="grid g2" style="margin-top:14px">
        ${table(['Статья', '% в год'], [['Комиссии', n(c.commission, 2)], ['Проскальзывание', n(c.slippage, 2)], ['Перекладка', n(c.roll, 2)], ['Обслуживание', n(c.premium, 2)], ['Доход фонда', pp(c.mmf, 2)], ['Дивиденды', pp(c.dividends, 2)], ['Шарп', n(s.sharpe, 2)]])}
        ${table(['Стратегия', 'Сделок', 'Итог, ₽'], data.byStrategy.map((x) => [STRAT[x.strat] ?? x.strat, rub(x.trades), { v: rub(x.pnl - x.costs), cls: cls(x.pnl - x.costs) }]))}
      </div>
      <h2>По годам</h2>
      ${table(['Год', ...s.years.map((y) => y.year)], [['Настройка, %', ...s.years.map((y) => ({ v: n(y.ret), cls: cls(y.ret) }))], ['Фонд, %', ...data.bench.years.map((y) => n(y.ret))]])}`;
  };
  worker.postMessage({ params: lab });
}

// ---------- Робот ----------
let robotTimer = null;
const MONTHS = { F: 'январь', G: 'февраль', H: 'март', J: 'апрель', K: 'май', M: 'июнь', N: 'июль', Q: 'август', U: 'сентябрь', V: 'октябрь', X: 'ноябрь', Z: 'декабрь' };
const ASSET = { Si: 'доллар/рубль', RI: 'индекс РТС', BR: 'нефть Brent', SR: 'Сбербанк', GZ: 'Газпром' };
// SiZ6 → «доллар/рубль, декабрь 2026»; LQDT → фонд денежного рынка
function instrName(ticker, classCode) {
  if (classCode === 'SPBFUT') {
    const m = ticker.match(/^(.+)([FGHJKMNQUVXZ])(\d)$/);
    if (m) return `${ASSET[m[1]] ?? m[1]}, ${MONTHS[m[2]]} 202${m[3]}`;
  }
  if (ticker === 'LQDT') return 'фонд денежного рынка';
  return ticker;
}
const EVENT = {
  plan: 'План', order: 'Заявка', executed: 'Исполнение плана', skip: 'Пропуск', rejected: 'Отклонено риск-менеджером', risk: 'Риск',
  'kill-switch': 'Аварийная остановка', error: 'Ошибка', fill: 'Исполнение лимитной', 'stop-hit': 'Стоп', watch: 'Запуск по расписанию',
};
function journalText(j) {
  const ev = j.event ?? j.type;
  if (ev === 'order') return `${j.side ?? ''} ${j.ticker} — ${j.lots} лот., ${j.orderType === 'limit' || j.type === 'limit' ? `лимитная ${n(j.price, 2)}` : 'рыночная'}; ${j.status === 'filled' ? `исполнена${j.fillPrice ? ` по ${n(j.fillPrice, 2)}` : ''}` : j.status === 'placed' ? 'выставлена' : j.status}${j.reason ? ` (${j.reason})` : ''}`;
  if (ev === 'plan') return `по данным на ${fmtDate(j.asOf)}: ${(j.items ?? []).length} позиций, капитал ${rub(j.equity)} ₽`;
  if (ev === 'executed') return j.summary ?? `заявок ${j.orders ?? 0}, отклонено ${j.rejected ?? 0}`;
  const msg = j.message ?? j.reason ?? '';
  return `${j.ticker ? `${j.ticker}: ` : ''}${msg}` || esc(JSON.stringify(Object.fromEntries(Object.entries(j).filter(([k]) => !['t', 'msk', 'mode', 'type', 'event'].includes(k))))).slice(0, 160);
}
async function robotAction(action) {
  const sure = action === 'stop'
    ? confirm('Остановить робота? Он закроет свои позиции по рынку и перестанет выставлять заявки, пока вы не нажмёте «Возобновить».')
    : confirm('Снять аварийную остановку? Робот продолжит работу по расписанию.');
  if (!sure) return;
  const st = $('#robotStatus');
  st.textContent = action === 'stop' ? 'Останавливаю…' : 'Возобновляю…';
  try {
    const r = await fetch(`api/robot/${action}`, { method: 'POST', headers: { 'x-robot-action': action } });
    st.textContent = r.ok ? (action === 'stop' ? 'Робот остановлен.' : 'Остановка снята.') : `Не получилось: ${(await r.json()).error ?? r.status}`;
  } catch (e) { st.textContent = `Не получилось: ${e.message}`; }
  main.innerHTML = await viewRobot(); bindRobot();
}
function bindRobot() { main.querySelectorAll('[data-robot]').forEach((b) => b.addEventListener('click', () => robotAction(b.dataset.robot))); }
async function viewRobot() {
  const r = await loadRobot();
  if (r.empty) return `<h1>Робот</h1><div class="card empty"><p><b>Робот ещё не запускался.</b></p><p>Посчитайте первый план командой <span class="mono">node robot/main.js plan</span>, затем выставьте заявки: <span class="mono">node robot/main.js execute</span>. По умолчанию это бумажная торговля — реальные деньги не участвуют.</p></div>`;
  const acc = r.account;
  const modeName = { paper: 'Бумажная торговля', sandbox: 'Песочница T-Invest', live: 'Реальный счёт' }[r.mode] ?? r.mode;
  const plan = r.plan;
  const start = r.startCapital ?? 500000;
  const hbAge = r.heartbeat ? (Date.now() - Date.parse(r.heartbeat.at)) / 60000 : null;
  const alive = r.live && hbAge != null && hbAge < 15;
  const state = r.killSwitch ? ['Остановлен', 'аварийная остановка включена', 'bad']
    : r.state?.halted ? ['Пауза до завтра', 'сработал дневной лимит убытка', 'bad']
      : r.live && !alive ? ['Не отвечает', hbAge == null ? 'робот ещё не запускался по расписанию' : `последний сигнал ${Math.round(hbAge)} мин назад`, 'bad']
        : ['Работает', r.live ? `последний сигнал ${Math.max(0, Math.round(hbAge))} мин назад` : 'аварийная остановка выключена', 'good'];
  const activeStops = r.stops?.reduce((a, x) => a + x.legs.filter((l) => !l.done).length, 0) ?? 0;
  return `
  <div class="pagehead"><h1>Робот</h1><span class="badge ${r.mode === 'live' ? 'bad' : r.mode === 'sandbox' ? 'warn' : 'good'}">${modeName}</span></div>
  <p class="sub">${r.live ? 'Состояние обновляется раз в 30 секунд.' : `Демо-снимок состояния на ${fmtDate(r.at)}; на компьютере с роботом здесь живые данные и кнопки управления.`} ${r.mode === 'paper' ? 'Бумажная торговля: сделки только записываются, денег нет.' : ''}</p>
  ${stats(
    kpi(acc ? `${rub(acc.equity)} ₽` : '—', acc ? `оценка счёта, ${pp((acc.equity / start - 1) * 100, 2)}% с начала (${rub(start)} ₽)` : 'счёт T-Invest'),
    kpi(state[0], state[1], state[2]),
    kpi(plan ? fmtDate(plan.asOf) : '—', 'план по данным на эту дату'),
    kpi(String(activeStops), 'активных стопов'))}
  ${r.live ? `<div class="actions"><button class="btn danger" type="button" data-robot="stop" ${r.killSwitch ? 'disabled' : ''}>Остановить робота</button><button class="btn" type="button" data-robot="resume" ${r.killSwitch ? '' : 'disabled'}>Возобновить</button><span class="note" id="robotStatus" role="status" aria-live="polite"></span></div>` : ''}
  ${r.mode === 'live' ? '<p class="callout" style="margin-top:14px">Робот торгует на реальном счёте. «Остановить робота» закрывает его позиции по рынку и запрещает новые заявки.</p>' : ''}
  <h2>Позиции</h2>
  ${acc?.positions?.length ? table(['Инструмент', 'Что это', 'Количество', 'Средняя цена', 'Текущая цена', 'Стоимость, ₽'], acc.positions.map((p) => [p.ticker, instrName(p.ticker, p.classCode), `${rub(Math.abs(p.qty))} ${p.qty < 0 ? '(продажа)' : ''}`, n(p.avg, p.avg < 10 ? 4 : 2), n(p.price, p.price < 10 ? 4 : 2), p.classCode === 'SPBFUT' ? 'фьючерс — ГО' : rub(p.qty * p.price)])) : '<div class="card empty">Позиций нет.</div>'}
  <h2>План на следующую сессию</h2>
  <p class="note">«Держать» — позиция остаётся; без нового сигнала робот не догоняет вход по рынку. Отрицательная цель — продажа (ставка на снижение).</p>
  ${plan ? table(['Стратегия', 'Контракт', 'Цель', 'Заявка', 'Лимит', 'Стоп'], plan.items.map((i) => [STRAT[i.strat] ?? i.strat, `${i.secid} <span class="note">${instrName(i.secid, i.classCode)}</span>`, `${rub(Math.abs(i.target))} ${i.target < 0 ? 'продажа' : 'покупка'}`, i.type === 'hold' ? 'держать' : i.type === 'limit' ? 'лимитная' : 'рыночная', i.limitRaw ? n(i.limitRaw, 2) : '—', i.stopRaw ? n(i.stopRaw, 2) : '—'])) : '<div class="card empty">Плана нет.</div>'}
  <h2>Стопы</h2>
  ${r.stops?.length ? table(['Инструмент', 'Стратегия', 'Количество', 'Стоп', 'Статус'], r.stops.flatMap((s) => s.legs.map((l) => [`${s.ticker} <span class="note">${instrName(s.ticker, s.classCode)}</span>`, STRAT[l.strat] ?? l.strat, rub(l.qty), n(l.stop, 2), l.done ? `<span class="badge warn">сработал ${fmtDate(l.done)}</span>` : '<span class="badge good">активен</span>']))) : '<div class="card empty">Активных стопов нет.</div>'}
  <h2>Журнал</h2>
  <div class="tablewrap journal">${table(['Время (МСК)', 'Событие', 'Что произошло'], r.journal.slice(0, 80).map((j) => [j.msk, EVENT[j.event ?? j.type] ?? (j.event ?? j.type), journalText(j)]))}</div>`;
}

// ---------- Методика ----------
function viewMethod() {
  return `
  <h1>Методика</h1>
  <p class="sub">Как устроено исследование и какие допущения в нём приняты.</p>
  <div class="grid g2">
    <div class="card"><h3 style="margin-top:0">Данные</h3><ul class="list">
      <li>Мосбиржа, публичный ISS: дневные и часовые свечи ${fmtDate(R.meta.from)} — ${fmtDate(R.meta.to)}.</li>
      <li>Фьючерсы Si, RI, BR, SR, GZ — 194 контракта, склейка в непрерывный ряд с перекладкой за 7 дней до экспирации.</li>
      <li>14 акций TQBR с поправкой на сплиты; дивиденды — по дивидендной доходности рынка (MCFTRR против IMOEX), минус 13% налога.</li>
      <li>Доходность фонда ДР — ставка RUSFAR минус 1,2 п.п. (комиссия фонда и отставание).</li></ul></div>
    <div class="card"><h3 style="margin-top:0">Модель счёта</h3><ul class="list">
      <li>Комиссия 0,03% с каждой стороны; проскальзывание рыночной заявки 0,5–3,5 б.п. по ликвидности плюс удар по объёму; лимитная — без проскальзывания, но исполняется только если цена прошла лимит.</li>
      <li>Гарантийное обеспечение 12–18% стоимости контракта, в 24.02–30.06.2022 — вдвое выше; паи фонда — залог с коэффициентом 0,9.</li>
      <li>Стопы внутри бара, при гэпе — по цене открытия; перекладка фьючерса стоит две стороны сделки.</li>
      <li>Дневной лимит убытка, снижение риска вдвое при просадке больше 20%, лимиты плеча и ГО.</li></ul></div>
    <div class="card"><h3 style="margin-top:0">Защита от подгонки</h3><ul class="list">
      <li>Индикаторы и сигналы используют только прошлые бары — это проверяется автотестами (сделки до даты X не меняются, если обрезать данные после X).</li>
      <li>ИИ-фильтр обучается walk-forward: модель года Y видит только сделки, закрытые до 1 января Y.</li>
      <li>Уровень риска и фильтр выбраны на 2020–2022; 2023–2026 — независимая проверка.</li>
      <li>Стратегии не убирались задним числом, даже убыточные.</li></ul></div>
    <div class="card"><h3 style="margin-top:0">Допущения на согласование</h3><ul class="list">
      <li>Капитал 500 тыс. ₽ на счёте («250–500 тысяч в день» — уточнить).</li>
      <li>Обслуживание Premium бесплатное (платное — сценарий чувствительности).</li>
      <li>Комиссия по фьючерсам = 0,03% до брокерского отчёта.</li>
      <li>Минимальная гранулярность интрадея — часовые свечи.</li></ul></div>
  </div>
  <h2 id="glossary">Словарь</h2>
  ${table(['Термин', 'Что значит'], Object.entries(GLOSSARY).map(([k, v]) => [`<b>${k}</b>`, v]))}`;
}

// ---------- роутер ----------
async function route() {
  clearInterval(robotTimer);
  const [, page = 'overview', arg] = location.hash.split('/');
  document.querySelectorAll('.nav a').forEach((a) => { if (a.dataset.r === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const views = { overview: viewOverview, variants: () => viewVariants(arg), calc: viewCalc, lab: viewLab, robot: viewRobot, method: viewMethod };
  const view = views[page] ?? viewOverview;
  if (page === 'robot') main.innerHTML = '<h1>Робот</h1><div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:260px;margin-top:14px"></div>';
  main.innerHTML = await view();
  document.title = `${$('h1')?.textContent ?? 'Панель'} — Робот Мосбиржи`;
  if (page === 'variants') main.querySelectorAll('[data-variant]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/variants/${b.dataset.variant}`; }));
  if (page === 'calc') bindCalc();
  if (page === 'lab') bindLab();
  if (page === 'robot') { bindRobot(); robotTimer = setInterval(async () => { if (location.hash.startsWith('#/robot') && !main.contains(document.activeElement?.closest?.('[data-robot]') ?? null)) { main.innerHTML = await viewRobot(); bindRobot(); } }, 30000); }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

try {
  R = await loadJSON('data/results.json');
  $('#dataMeta').textContent = `Данные Мосбиржи ${fmtDate(R.meta.from)} — ${fmtDate(R.meta.to)}, расчёт от ${fmtDate(R.meta.generated)}.`;
  window.addEventListener('hashchange', route);
  await route();
  $('#tourBtn').addEventListener('click', () => startTour(true));
  setTimeout(() => startTour(false), 600); // при первом визите
} catch (e) {
  main.innerHTML = `<div class="card empty">Не удалось загрузить результаты исследования: ${esc(e.message)}. Запустите <span class="mono">npm run research && node research/export-web.js</span>.</div>`;
}
