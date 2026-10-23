// Панель: итог исследования, варианты, калькулятор издержек, бэктест в браузере, монитор робота, методика.
import { equityChart, barChart, zeroChart, yearChart } from './charts.js';
import { zeroStrategy, DEFAULTS } from './engine/costs.js';
import { loadJSON, loadRobot } from './data.js';

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
const kpi = (v, l, tone = '') => `<div class="card kpi ${tone}"><div class="v">${v}</div><div class="l">${l}</div></div>`;
const table = (head, rows, { hl = -1 } = {}) => `<div class="tablewrap"><table><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr${i === hl ? ' class="hl"' : ''}>${r.map((c) => (typeof c === 'object' && c ? `<td class="${c.cls ?? ''}">${c.v}</td>` : `<td>${c}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
const vlabel = (k) => `<span class="dot" style="background:var(--${k})"></span>${k}. ${SHORT[k]}`;

// ---------- Итог ----------
function viewOverview() {
  const rec = R.recommendation, V = R.variants, best = V[rec.key], B = R.benchmark;
  const lines = [
    ...['D', 'C', 'B', 'A'].map((k) => ({ label: `${k}. ${SHORT[k]}`, color: C[k], points: V[k].equity, width: k === rec.key ? 3 : 1.8 })),
    { label: 'Фонд ДР', color: C.fund, points: B.equity, dash: '6 4' },
  ];
  return `
  <h1>${rec.go ? `Идём в разработку с вариантом ${rec.key}` : 'Ни один вариант пока не готов к разработке'}</h1>
  <p class="sub">Четыре варианта настройки робота проверены на истории Мосбиржи ${fmtDate(R.meta.from)} — ${fmtDate(R.meta.to)} при тарифе 0,03% и капитале 500 тыс. ₽. Настройки выбирались по 2020–2022 годам, 2023–2026 — независимая проверка.</p>
  <div class="card verdict ${rec.go ? '' : 'no'}">
    <span class="badge ${rec.go ? 'good' : 'bad'}">${rec.go ? 'Обгоняет фонд' : 'Не обгоняет фонд'}</span>
    <div><b>${esc(best.title)}</b><div class="note">${esc(rec.reason)}</div></div>
  </div>
  <div class="grid g4" style="margin-top:14px">
    ${kpi(`${n(best.full.cagr)}%`, `годовых у варианта ${best.key} после всех издержек`, 'good')}
    ${kpi(`${n(B.cagr)}%`, 'годовых у фонда денежного рынка')}
    ${kpi(`${pp(best.outSample.excessCagr)} п.п.`, 'сверх фонда на проверке 2023–2026', best.outSample.excessCagr > 0 ? 'good' : 'bad')}
    ${kpi(`${n(best.full.maxDD)}%`, 'максимальная просадка')}
  </div>
  <h2>Капитал по вариантам</h2>
  <div class="card chart">${equityChart(lines, { width: 1100, height: 420, c: C, log: true, title: 'тыс. ₽, логарифмическая шкала, после всех издержек' })}</div>
  <h2>Сравнение</h2>
  ${table(['Вариант', 'Доходность, % год.', 'Сверх фонда, п.п.', 'Просадка, %', 'Шарп', 'Сделок', 'Издержки, % год.', 'Сверх фонда 2023–26'],
    [...Object.values(V).map((v) => [vlabel(v.key), n(v.full.cagr), { v: pp(v.full.excessCagr), cls: cls(v.full.excessCagr) }, n(v.full.maxDD), n(v.full.sharpe, 2), rub(v.full.trades), n(-costSum(v.full.costsPctYear)), { v: pp(v.outSample.excessCagr), cls: cls(v.outSample.excessCagr) }]),
      [`<span class="dot" style="background:var(--fund)"></span>Фонд денежного рынка`, n(B.cagr), '0', n(B.maxDD), '—', '0', '0', '0']],
    { hl: Object.keys(V).indexOf(rec.key) })}
  <div class="grid g2" style="margin-top:18px">
    <div class="card"><h3 style="margin-top:0">Прогноз на 12 месяцев, вариант ${best.key}</h3>
      <p class="note">Бутстреп месячных результатов сверх фонда, фонд 12% годовых.</p>
      ${forecastBlock(R.forecast.oosOnly, 'по проверке 2023–2026')}
      ${forecastBlock(R.forecast.base, 'по всей истории')}
    </div>
    <div class="card"><h3 style="margin-top:0">Что важно до запуска</h3>
      <ul class="list">
        <li>Плата за Premium съедает почти всё превышение: <b>${pp(R.sensitivity.rows.find((r) => r.id === 'premium').excessCagr)} п.п.</b> вместо ${pp(R.sensitivity.rows[0].excessCagr)}. Проверить тариф.</li>
        <li>Комиссия по фьючерсам 0,05% вместо 0,03%: <b>${pp(R.sensitivity.rows.find((r) => r.id === 'futcomm').excessCagr)} п.п.</b></li>
        <li>Подключить «Маржинальную торговлю» и доступ к фьючерсам.</li>
        <li>Запуск: песочница → бумажная торговля 4–6 недель → часть капитала → весь капитал.</li>
      </ul>
    </div>
  </div>`;
}
function forecastBlock(f, label) {
  return `<div style="margin:12px 0">
    <div class="note">${label}</div>
    <div style="display:flex;justify-content:space-between;font-size:14px;margin:4px 0"><span>плохой год (1 из 10): <b>${n(f.p10)}%</b></span><span>средний: <b>${n(f.p50)}%</b></span><span>хороший: <b>${n(f.p90)}%</b></span></div>
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
  <div class="card verdict ${v.full.excessCagr > 0 && v.outSample.excessCagr > 0 ? '' : 'no'}">
    <span class="badge ${v.full.excessCagr > 0 && v.outSample.excessCagr > 0 ? 'good' : 'bad'}">${v.full.excessCagr > 0 && v.outSample.excessCagr > 0 ? 'Обгоняет фонд' : 'Проигрывает фонду'}</span>
    <div><b>${esc(v.title)}</b><div class="note">Выбранные настройки: риск ×${v.selected.riskMult}, ${v.selected.filter ? 'с ИИ-фильтром' : 'без ИИ-фильтра'}.</div></div>
  </div>
  <div class="grid g4" style="margin-top:14px">
    ${kpi(`${n(v.full.cagr)}%`, 'годовых за весь период', v.full.excessCagr > 0 ? 'good' : 'bad')}
    ${kpi(`${pp(v.full.excessCagr)} п.п.`, 'сверх фонда', v.full.excessCagr > 0 ? 'good' : 'bad')}
    ${kpi(`${n(v.full.maxDD)}%`, 'максимальная просадка')}
    ${kpi(rub(v.full.trades), `сделок, ${n(v.full.turnoverPerYear, 0)} капиталов оборота в год`)}
  </div>
  <h2>По годам</h2>
  <div class="card chart">${yearChart([{ label: `${k}. ${SHORT[k]}`, color: C[k], values: val(v.full.years) }, { label: 'Фонд ДР', color: C.fund, values: val(R.benchmark.years) }], years, { width: 1100, height: 320, c: C })}</div>
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
  <p class="note">Настройку выбирали по лучшему превышению над фондом на 2020–2022 при просадке не больше 15%. Проверочный период в выборе не участвовал.</p>
  ${table(['Риск, фильтр', '2020–22: сверх фонда', '2020–22: просадка', '2023–26: сверх фонда', '2023–26: просадка'],
    v.grid.map((g) => [`×${g.riskMult}, ${g.filter ? 'с фильтром' : 'без фильтра'}${g.riskMult === v.selected.riskMult && g.filter === v.selected.filter ? ' <span class="badge good">выбрано</span>' : ''}`, { v: pp(g.is.excessCagr), cls: cls(g.is.excessCagr) }, n(g.is.maxDD), { v: pp(g.oos.excessCagr), cls: cls(g.oos.excessCagr) }, n(g.oos.maxDD)]),
    { hl: v.grid.findIndex((g) => g.riskMult === v.selected.riskMult && g.filter === v.selected.filter) })}
  <h2>Стресс 2022 года</h2>
  <div class="grid g3">
    ${kpi(`${pp(v.stress2022.totalReturn)}%`, '2022 год целиком', v.stress2022.totalReturn > 0 ? 'good' : 'bad')}
    ${kpi(`${pp(v.stressFebMar2022.totalReturn)}%`, 'февраль–апрель 2022', v.stressFebMar2022.totalReturn > 0 ? 'good' : 'bad')}
    ${kpi(`${n(v.stress2022.maxDD)}%`, 'просадка в 2022')}
  </div>
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
  <p class="sub">Сколько счёт получает или теряет за год, если стратегия сама по себе заработала ровно ноль, — и какую доходность ей нужно показать, чтобы обогнать простой фонд денежного рынка.</p>
  <div class="split">
    <div class="card form" id="calcForm">
      <div class="tabs" role="group" aria-label="Пресет"><button type="button" data-preset="original">Как планировалось</button><button type="button" data-preset="recommended">С рекомендациями</button></div>
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
    <div class="grid g3">
      ${kpi(`${pp(z.total)}%`, 'счёт за год при нулевой стратегии', z.total >= 0 ? 'good' : 'bad')}
      ${kpi(`${n(z.hurdle)}%`, 'нужно заработать стратегии, чтобы обогнать фонд', z.hurdle <= 10 ? 'good' : 'bad')}
      ${kpi(`${n(z.fundOnly)}%`, 'всё просто в фонде, без робота')}
    </div>
    <div class="card chart" style="margin-top:14px">${zeroChart({ original: orig, recommended: { ...z, fundOnly: calc.fundYield } }, { width: 1000, c: C })}</div>
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
    const id = e.target.id.replace('c-', '');
    calc[id] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
    renderCalc();
  });
  form.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    calc = calcPreset(b.dataset.preset);
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
  $('#labReset').onclick = () => { lab = { ...LAB_DEFAULT, strategies: ['breakout', 'impulse', 'portfolio'] }; route(); };
  $('#labRun').onclick = runLab;
  out();
}
function runLab() {
  if (!lab.strategies.length) { $('#labStatus').textContent = 'Выберите хотя бы одну стратегию.'; return; }
  worker ??= new Worker('./lab-worker.js', { type: 'module' });
  const btn = $('#labRun'); btn.disabled = true;
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') { const s = $('#labStatus'); if (s) s.textContent = data.text; return; }
    const b = $('#labRun'); if (b) b.disabled = false;
    if (data.type === 'error') { $('#labStatus').textContent = `Ошибка: ${data.text}`; return; }
    $('#labStatus').textContent = `Готово за ${n(data.ms / 1000, 1)} с.`;
    const s = data.summary, c = s.costsPctYear;
    $('#labOut').innerHTML = `
      <div class="grid g4">
        ${kpi(`${n(s.cagr)}%`, 'годовых после издержек', s.excessCagr > 0 ? 'good' : 'bad')}
        ${kpi(`${pp(s.excessCagr)} п.п.`, `сверх фонда (${n(data.bench.cagr)}%)`, s.excessCagr > 0 ? 'good' : 'bad')}
        ${kpi(`${n(s.maxDD)}%`, 'максимальная просадка')}
        ${kpi(rub(s.trades ?? 0), 'сделок')}
      </div>
      <div class="card chart" style="margin-top:14px">${equityChart([{ label: 'Ваша настройка', color: C.D, points: data.equity, width: 2.5 }, { label: 'Фонд ДР', color: C.fund, points: data.benchEquity, dash: '6 4' }], { width: 1000, height: 360, c: C })}</div>
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
async function viewRobot() {
  const r = await loadRobot();
  if (r.empty) return `<h1>Робот</h1><div class="card empty">Робот ещё не запускался. Запустите <span class="mono">node robot/main.js plan</span>.</div>`;
  const acc = r.account;
  const modeName = { paper: 'Бумажная торговля', sandbox: 'Песочница T-Invest', live: 'Реальный счёт' }[r.mode] ?? r.mode;
  const plan = r.plan;
  const start = 500000;
  return `
  <h1>Робот</h1>
  <p class="sub">${r.live ? 'Состояние обновляется с локального сервера раз в 30 секунд.' : `Демо-снимок состояния на ${fmtDate(r.at)} — на сервере робота здесь живые данные.`} Управление — командами <span class="mono">node robot/main.js plan | execute | monitor | stop | resume</span>.</p>
  <div class="grid g4">
    ${kpi(modeName, 'режим', r.mode === 'live' ? 'bad' : '')}
    ${kpi(acc ? `${rub(acc.equity)} ₽` : '—', acc ? `оценка счёта, ${pp((acc.equity / start - 1) * 100, 2)}% с начала` : 'счёт T-Invest')}
    ${kpi(r.killSwitch ? 'Остановлен' : r.state?.halted ? 'Пауза до завтра' : 'Работает', r.killSwitch ? 'аварийная остановка включена' : r.state?.halted ? 'сработал дневной лимит убытка' : 'аварийная остановка выключена', r.killSwitch || r.state?.halted ? 'bad' : 'good')}
    ${kpi(plan ? fmtDate(plan.asOf) : '—', 'дата последнего плана')}
  </div>
  ${r.mode === 'live' ? '<p class="callout" style="margin-top:14px">Робот торгует на реальном счёте. Аварийная остановка: <span class="mono">node robot/main.js stop</span> — закрывает позиции робота и запрещает новые заявки.</p>' : ''}
  <h2>Позиции</h2>
  ${acc?.positions?.length ? table(['Инструмент', 'Режим', 'Количество', 'Средняя цена', 'Текущая цена', 'Стоимость, ₽'], acc.positions.map((p) => [p.ticker, p.classCode === 'SPBFUT' ? 'фьючерс' : p.ticker === 'LQDT' ? 'фонд ДР' : 'акция', rub(p.qty), n(p.avg, p.avg < 10 ? 4 : 2), n(p.price, p.price < 10 ? 4 : 2), p.classCode === 'SPBFUT' ? '—' : rub(p.qty * p.price)])) : '<div class="card empty">Позиций нет.</div>'}
  <h2>План на следующую сессию</h2>
  ${plan ? table(['Стратегия', 'Контракт', 'Цель, шт.', 'Заявка', 'Лимит', 'Стоп'], plan.items.map((i) => [STRAT[i.strat] ?? i.strat, i.secid, rub(i.target), i.type === 'hold' ? 'держать' : i.type === 'limit' ? 'лимитная' : 'рыночная', i.limitRaw ? n(i.limitRaw, 2) : '—', i.stopRaw ? n(i.stopRaw, 2) : '—'])) : '<div class="card empty">Плана нет.</div>'}
  ${plan?.observed?.length ? `<p class="note">Наблюдение (без торговли): ${plan.observed.map((o) => `${STRAT[o.strat] ?? o.strat} ${o.sym} → ${o.target}`).join(', ')}</p>` : ''}
  <h2>Стопы</h2>
  ${r.stops?.length ? table(['Инструмент', 'Стратегия', 'Количество', 'Стоп', 'Статус'], r.stops.flatMap((s) => s.legs.map((l) => [s.ticker, STRAT[l.strat] ?? l.strat, rub(l.qty), n(l.stop, 2), l.done ? `<span class="badge warn">сработал ${fmtDate(l.done)}</span>` : '<span class="badge good">активен</span>']))) : '<div class="card empty">Активных стопов нет.</div>'}
  <h2>Журнал</h2>
  <div class="tablewrap journal">${table(['Время (МСК)', 'Событие', 'Подробности'], r.journal.slice(0, 80).map((j) => [j.msk, j.type, `<span class="mono">${esc(JSON.stringify(Object.fromEntries(Object.entries(j).filter(([k]) => !['t', 'msk', 'mode', 'type'].includes(k))))).slice(0, 180)}</span>`]))}</div>`;
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
  </div>`;
}

// ---------- роутер ----------
async function route() {
  clearInterval(robotTimer);
  const [, page = 'overview', arg] = location.hash.split('/');
  document.querySelectorAll('.nav a').forEach((a) => { if (a.dataset.r === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const views = { overview: viewOverview, variants: () => viewVariants(arg), calc: viewCalc, lab: viewLab, robot: viewRobot, method: viewMethod };
  const view = views[page] ?? viewOverview;
  main.innerHTML = await view();
  document.title = `${$('h1')?.textContent ?? 'Панель'} — Робот Мосбиржи`;
  if (page === 'variants') main.querySelectorAll('[data-variant]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/variants/${b.dataset.variant}`; }));
  if (page === 'calc') bindCalc();
  if (page === 'lab') bindLab();
  if (page === 'robot') robotTimer = setInterval(async () => { if (location.hash.startsWith('#/robot')) main.innerHTML = await viewRobot(); }, 30000);
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

try {
  R = await loadJSON('data/results.json');
  window.addEventListener('hashchange', route);
  route();
} catch (e) {
  main.innerHTML = `<div class="card empty">Не удалось загрузить результаты исследования: ${esc(e.message)}. Запустите <span class="mono">npm run research && node research/export-web.js</span>.</div>`;
}
