// Виртуальная экскурсия по панели: подсветка элемента + карточка с пояснением.
// Запускается при первом визите и по кнопке «Экскурсия» в шапке. Клавиши: → / Enter — дальше, ← — назад, Esc — выйти.
const KEY = 'moex-tour-done';

const STEPS = [
  { route: '#/overview', sel: '.verdict', title: 'Главный вывод', text: 'Сразу — решение исследования: какой вариант робота идёт в разработку и почему. Зелёный цвет — вариант прошёл все проверки, жёлтый — проходит с условием (сначала бумажная торговля), красный — не прошёл.' },
  { route: '#/overview', sel: '.stats', title: 'Четыре цифры для решения', text: 'Доходность варианта после всех издержек, превышение над фондом на проверочном периоде, самая глубокая просадка и шанс обогнать фонд за год — в процентах и в рублях на 500 тысяч. Подчёркнутые пунктиром термины поясняются при наведении.' },
  { route: '#/overview', sel: '.grid.g2', title: 'Насколько уверены и что дальше', text: 'Слева — честно о силе результата и прогноз на год. Справа — этапы запуска с условиями перехода к реальным деньгам и что нужно от вас.' },
  { route: '#/overview', sel: '.chart', title: 'Капитал по вариантам', text: 'Как менялись 500 тысяч рублей на старте у каждого варианта. Пунктир — деньги просто в фонде. Красная линия — изначальный план (интрадей на акциях): он теряет деньги на издержках.' },
  { route: '#/overview', sel: '.tablewrap', title: 'Сравнение вариантов', text: 'Все четыре варианта в одной таблице: доходность, превышение над фондом, просадка, издержки и результат на проверке 2023–2026. Выбранный вариант подсвечен.' },
  { route: '#/variants', sel: '.tabs', title: 'Каждый вариант подробно', text: 'Переключайте варианты: доходность по годам, из чего складываются издержки, какие стратегии заработали, как выбирали настройки и как вариант пережил 2022 год.' },
  { route: '#/calc', sel: '#calcForm', title: 'Калькулятор издержек', text: 'Двигайте ползунки: сколько сделок, какое проскальзывание, какая доходность фонда. Справа видно, сколько счёт теряет или получает до работы стратегии и какую доходность ей нужно показать, чтобы обогнать фонд.' },
  { route: '#/lab', sel: '#labForm', title: 'Лаборатория', text: 'Тот же движок, что в исследовании, работает прямо в браузере. Выберите инструменты и стратегии, поменяйте риск, комиссию или проскальзывание и нажмите «Рассчитать» — результат на истории Мосбиржи за несколько секунд.' },
  { route: '#/robot', sel: '.stats', title: 'Монитор робота', text: 'Режим, оценка счёта, жив ли робот и план на следующую сессию. На компьютере с роботом здесь же кнопки «Остановить» и «Возобновить». Ниже — позиции с расшифровкой контрактов, стопы и журнал на русском.' },
  { route: '#/method', sel: 'h1', title: 'Методика', text: 'Откуда данные, как считаются издержки, как исключена подгонка под историю, какие допущения нужно подтвердить, и словарь терминов.' },
  { route: '#/overview', sel: '#tourBtn', title: 'Экскурсия всегда под рукой', text: 'Её можно пройти ещё раз — кнопка в шапке. Тема оформления переключается кнопкой рядом.' },
];

let active = null;

function waitFor(sel, timeout = 4000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const el = document.querySelector(sel);
      if (el && el.getBoundingClientRect().width > 0) return resolve(el);
      if (Date.now() - t0 > timeout) return resolve(null);
      setTimeout(tick, 60);
    };
    tick();
  });
}

function build() {
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = `
    <div class="tour-hole" aria-hidden="true"></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text" tabindex="-1">
      <div class="tour-step"></div>
      <h2 id="tour-title"></h2>
      <p id="tour-text"></p>
      <div class="tour-dots" aria-hidden="true"></div>
      <div class="tour-actions">
        <button class="tour-skip" type="button" data-t="skip">Пропустить</button>
        <span style="flex:1"></span>
        <button class="btn" type="button" data-t="prev">Назад</button>
        <button class="btn primary" type="button" data-t="next">Далее</button>
      </div>
    </div>`;
  document.body.appendChild(root);
  return root;
}

function place(root, el) {
  const hole = root.querySelector('.tour-hole');
  const card = root.querySelector('.tour-card');
  const pad = 6;
  const r = el.getBoundingClientRect();
  const h = Math.min(r.height, innerHeight * 0.55);
  hole.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${h + pad * 2}px`;
  if (innerWidth < 640) { card.style.cssText = ''; card.classList.add('docked'); return; }
  card.classList.remove('docked');
  const cw = Math.min(380, innerWidth - 32);
  const ch = card.offsetHeight || 220;
  let top = r.top + h + pad + 14;
  if (top + ch > innerHeight - 12) top = r.top - ch - pad - 14;
  if (top < 12) top = Math.min(innerHeight - ch - 12, Math.max(12, r.top + 20));
  let left = r.width < cw ? r.left + r.width / 2 - cw / 2 : r.left;
  if (left + cw > innerWidth - 16) left = innerWidth - cw - 16;
  card.style.cssText = `top:${Math.max(12, top)}px;left:${Math.max(16, left)}px;width:${cw}px`;
}

async function show(i) {
  const t = active;
  if (!t) return;
  t.i = i;
  const s = STEPS[i];
  if (s.route && !location.hash.startsWith(s.route)) location.hash = s.route;
  const el = await waitFor(s.sel);
  if (active !== t || t.i !== i) return;
  if (!el) { if (i < STEPS.length - 1) return show(t.dir < 0 && i > 0 ? i - 1 : i + 1); return finish(true); }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  const card = t.root.querySelector('.tour-card');
  t.root.querySelector('.tour-step').textContent = `Шаг ${i + 1} из ${STEPS.length}`;
  t.root.querySelector('#tour-title').textContent = s.title;
  t.root.querySelector('#tour-text').textContent = s.text;
  t.root.querySelector('.tour-dots').innerHTML = STEPS.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'past' : ''}"></i>`).join('');
  t.root.querySelector('[data-t=prev]').disabled = i === 0;
  t.root.querySelector('[data-t=next]').textContent = i === STEPS.length - 1 ? 'Готово' : 'Далее';
  t.el = el;
  place(t.root, el);
  setTimeout(() => { if (active === t && t.i === i) { place(t.root, el); card.focus({ preventScroll: true }); } }, reduce ? 0 : 320);
}

const next = () => { if (!active) return; active.dir = 1; if (active.i >= STEPS.length - 1) finish(true); else show(active.i + 1); };
const prev = () => { if (!active || active.i === 0) return; active.dir = -1; show(active.i - 1); };

function finish(done) {
  if (!active) return;
  const t = active;
  active = null;
  window.removeEventListener('resize', t.onResize);
  window.removeEventListener('scroll', t.onResize, true);
  document.removeEventListener('keydown', t.onKey, true);
  t.root.classList.add('out');
  setTimeout(() => t.root.remove(), 180);
  try { localStorage.setItem(KEY, done ? 'done' : 'skipped'); } catch { /* приватный режим */ }
  t.prevFocus?.focus?.();
}

export function startTour(force = false) {
  if (active) return;
  let seen = null;
  try { seen = localStorage.getItem(KEY); } catch { seen = 'n/a'; }
  if (seen && !force) return;
  const root = build();
  const t = { root, i: 0, dir: 1, prevFocus: document.activeElement };
  active = t;
  t.onResize = () => t.el && place(root, t.el);
  t.onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    else if (e.key === 'ArrowRight' || (e.key === 'Enter' && e.target.tagName !== 'BUTTON')) { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    else if (e.key === 'Tab') {
      const f = [...root.querySelectorAll('.tour-card button:not(:disabled)')];
      const idx = f.indexOf(document.activeElement);
      if (e.shiftKey && idx <= 0) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && idx === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  };
  window.addEventListener('resize', t.onResize);
  window.addEventListener('scroll', t.onResize, true);
  document.addEventListener('keydown', t.onKey, true);
  root.addEventListener('click', (e) => {
    const a = e.target.closest('[data-t]')?.dataset.t;
    if (a === 'next') next(); else if (a === 'prev') prev(); else if (a === 'skip') finish(false);
  });
  show(0);
}
