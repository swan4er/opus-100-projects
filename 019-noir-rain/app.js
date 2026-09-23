/* «Дождь над Лиговкой» — движок: сцены, время, улики, доска, дождь на стекле, звук. */
(() => {
'use strict';

const { CLUES, DEDUCTIONS, SUSPECTS, PLACES, VISIT, S, ENDINGS } = window.NOIR;
const $ = (id) => document.getElementById(id);
const NB = ' ';
const SHOT = !!window.__SHOT__;
const DAWN = 7 * 60;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ═══ Состояние ═══════════════════════════════════════════════ */
let G;
function fresh() {
  G = { scene: 'intro', time: 50, clues: new Set(), deds: new Set(), used: new Set(), seen: new Set(), links: [], at: 'office', over: false };
}
fresh();

const fmtTime = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
function paintClock() {
  $('clock').textContent = fmtTime(G.time);
  const left = DAWN - G.time;
  const el = $('left');
  if (left <= 0) { el.textContent = 'рассвет'; el.classList.add('late'); return; }
  el.textContent = `до рассвета ${Math.floor(left / 60)}${NB}ч ${left % 60}${NB}мин`;
  el.classList.toggle('late', left <= 60);
  $('clueN').textContent = String(G.clues.size + G.deds.size);
}

/* ═══ Типографика: неразрывные пробелы после коротких слов ══════ */
const SHORT = /(?<=^|[\s«(—\u00a0])(в|к|с|о|у|а|и|я|во|ко|со|об|от|до|по|на|за|из|не|ни|но) /gi;
const typo = (s) => s.replace(SHORT, `$1${NB}`).replace(/ —/g, `${NB}—`);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// «[[id|слова]]» → кнопка-улика; каждое слово — отдельный span для печати
function words(text) { return esc(text).split(/(\s+)/).map((w) => (/\s/.test(w) ? w : `<span class="w">${w}</span>`)).join(''); }
function paraHTML(raw) {
  let out = '', last = 0;
  const re = /\[\[(\w+)\|([^\]]+)\]\]/g;
  let m;
  const t = typo(raw);
  while ((m = re.exec(t))) {
    out += words(t.slice(last, m.index));
    const got = G.clues.has(m[1]);
    out += `<button type="button" class="clue${got ? ' got' : ''}" data-clue="${m[1]}" title="${got ? 'В блокноте' : 'Взять в блокнот'}">${words(m[2])}</button>`;
    last = m.index + m[0].length;
  }
  return out + words(t.slice(last));
}

/* ═══ Сцены ═══════════════════════════════════════════════════ */
const sceneEl = $('scene');
let revealTimer = 0, revealing = false;

function go(id, cost = 0) {
  if (G.over) return;
  G.time += cost;
  if (G.time >= DAWN && id !== 'accuse') { G.time = Math.max(G.time, DAWN); end('dawn'); return; }
  G.scene = id;
  const place = PLACES.find((p) => p.id === id);
  if (place) G.at = id;
  G.seen.add(id);
  paintClock();
  render();
}

function render() {
  const sc = S[G.scene];
  clearInterval(revealTimer);
  let html = `<div class="place fade-in">${esc(sc.place)} · ${fmtTime(G.time)}</div><h1 class="fade-in">${esc(sc.title)}</h1>`;
  html += sc.text.map((p) => `<p class="para${p.startsWith('—') ? ' dialog' : ''}">${paraHTML(p)}</p>`).join('');
  html += '<div id="after"></div>';
  sceneEl.innerHTML = html;
  sceneEl.scrollTop = 0;
  bindClues(sceneEl);
  reveal(() => renderAfter(sc));
}

function reveal(done) {
  const ws = Array.from(sceneEl.querySelectorAll('.para .w'));
  if (reduce || SHOT) { ws.forEach((w) => w.classList.add('v')); done(); return; }
  revealing = true;
  let i = 0;
  const finish = () => { clearInterval(revealTimer); ws.forEach((w) => w.classList.add('v')); revealing = false; done(); };
  revealTimer = setInterval(() => {
    for (let k = 0; k < 2 && i < ws.length; k++, i++) ws[i].classList.add('v');
    if (i >= ws.length) finish();
  }, 34);
  reveal.skip = finish;
}

function renderAfter(sc) {
  const after = $('after');
  if (sc.map) { after.innerHTML = mapSVG(); bindMap(after); return; }
  if (sc.accuse) {
    after.innerHTML = `<div class="sus-list fade-in">${SUSPECTS.map((s) => `<button type="button" class="sus" data-sus="${s.id}"><b>${esc(s.t)}</b><span>${esc(typo(s.d))}</span></button>`).join('')}</div>
      <ol class="choices fade-in"><li><button type="button" class="choice" data-back="1"><span class="k">${SUSPECTS.length + 1}</span><span class="t">Ещё подумать — вернуться к доске</span><span class="c"></span></button></li></ol>`;
    after.querySelectorAll('.sus').forEach((b) => b.addEventListener('click', () => accuse(b.dataset.sus)));
    after.querySelector('[data-back]').addEventListener('click', () => go('office', 0));
    return;
  }
  const list = sc.choices.filter((c) => !c.if || c.if());
  after.innerHTML = `<ol class="choices fade-in">${list.map((c, i) => {
    const used = c.once && G.used.has(G.scene + ':' + c.to);
    const cost = c.time ? `+${c.time}${NB}мин` : '';
    return `<li><button type="button" class="choice" data-i="${i}"${used ? ' disabled' : ''}><span class="k">${i + 1}</span><span class="t">${esc(typo(c.t))}${used ? ` <small style="color:var(--muted)">— осмотрено</small>` : ''}</span><span class="c">${cost}</span></button></li>`;
  }).join('')}</ol>`;
  after.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => choose(list[+b.dataset.i])));
}

function choose(c) {
  if (!c) return;
  if (c.board) { openBoard(); return; }
  if (c.once) G.used.add(G.scene + ':' + c.to);
  go(c.to, c.time || 0);
}

/* ── Улики ─────────────────────────────────────────────────── */
function bindClues(root) {
  root.querySelectorAll('.clue').forEach((b) => b.addEventListener('click', () => take(b.dataset.clue, b)));
}
function take(id, btn) {
  if (G.clues.has(id)) return;
  G.clues.add(id);
  document.querySelectorAll(`.clue[data-clue="${id}"]`).forEach((b) => { b.classList.add('got'); b.title = 'В блокноте'; });
  say(`В блокнот: <b>${esc(CLUES[id].t)}</b>`);
  paintClock();
  paintNote();
  tick();
}

let sayT = 0;
function say(html) {
  const v = $('verdict');
  v.innerHTML = html;
  v.classList.add('on');
  clearTimeout(sayT);
  sayT = setTimeout(() => v.classList.remove('on'), 3000);
}

/* ═══ Карта ═══════════════════════════════════════════════════ */
function mapSVG() {
  const W = 120, H = 92;
  const X = (p) => (p.x / 100) * W, Y = (p) => (p.y / 100) * H;
  const pins = PLACES.map((p) => {
    const here = p.id === G.at;
    const cost = here ? 0 : p.go + (VISIT[p.id] || 0);
    const seen = G.seen.has(p.id);
    const anchor = p.x > 60 ? 'end' : 'start';
    const tx = anchor === 'end' ? X(p) - 3 : X(p) + 3;
    return `<g class="pin${here ? ' here' : ''}${seen ? ' seen' : ''}" tabindex="0" role="button" data-go="${p.id}" aria-label="${esc(p.t)}, ${cost} минут">
      <circle class="dot" cx="${X(p)}" cy="${Y(p)}" r="1.7"/>
      <text x="${tx}" y="${Y(p) - 1.2}" text-anchor="${anchor}" font-size="3.1">${esc(p.t)}</text>
      <text class="go" x="${tx}" y="${Y(p) + 3.4}" text-anchor="${anchor}" font-size="2.6">${here ? 'вы здесь' : `+${cost}${NB}мин${seen ? ' · были' : ''}`}</text>
    </g>`;
  }).join('');
  return `<div class="map fade-in"><svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Карта ночного города">
    <defs><pattern id="hatch" width="2" height="2" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><line x1="0" y1="0" x2="0" y2="2" stroke="rgba(235,230,220,.08)" stroke-width=".5"/></pattern></defs>
    <rect x="0" y="0" width="${W}" height="${H}" fill="rgba(7,8,10,.55)" stroke="rgba(235,230,220,.18)" stroke-width=".3"/>
    <path d="M0 9 C 20 6, 40 14, 58 9 S 96 3, 120 12 L120 0 L0 0 Z" fill="url(#hatch)" stroke="rgba(235,230,220,.35)" stroke-width=".35"/>
    <text x="80" y="6.2" font-size="3" fill="rgba(235,230,220,.5)" font-style="italic" font-family="Old Standard TT, serif">Нева</text>
    <path d="M46 10 C 40 26, 28 34, 24 48 S 30 70, 44 74" fill="none" stroke="rgba(235,230,220,.3)" stroke-width="1.1"/>
    <text x="23" y="40" font-size="2.6" fill="rgba(235,230,220,.45)" font-style="italic" font-family="Old Standard TT, serif" transform="rotate(-62 23 40)">Фонтанка</text>
    <path d="M4 84 C 30 80, 60 86, 116 72" fill="none" stroke="rgba(235,230,220,.3)" stroke-width="1.3"/>
    <text x="84" y="84" font-size="2.6" fill="rgba(235,230,220,.45)" font-style="italic" font-family="Old Standard TT, serif">Обводный канал</text>
    <path d="M28 17 L 78 44" stroke="rgba(235,230,220,.5)" stroke-width=".6"/>
    <text x="44" y="24.5" font-size="2.6" fill="rgba(235,230,220,.55)" font-family="Anonymous Pro, monospace" transform="rotate(28 44 24.5)">Невский</text>
    <path d="M78 44 L 86 82" stroke="rgba(235,230,220,.5)" stroke-width=".6"/>
    <text x="84" y="50" font-size="2.6" fill="rgba(235,230,220,.55)" font-family="Anonymous Pro, monospace" transform="rotate(79 84 50)">Лиговка</text>
    ${pins}
  </svg></div>
  <ol class="choices fade-in"><li><button type="button" class="choice" data-board="1"><span class="k">B</span><span class="t">Сначала подумать над доской улик</span><span class="c">0${NB}мин</span></button></li></ol>`;
}
function bindMap(root) {
  root.querySelectorAll('.pin').forEach((g) => {
    const goto = () => {
      const id = g.dataset.go;
      if (id === G.at) { if (id === 'shop' || id === 'office') go(id, 0); return; }
      const p = PLACES.find((q) => q.id === id);
      go(id, p.go + (VISIT[id] || 0));
    };
    g.addEventListener('click', goto);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goto(); } });
  });
  root.querySelector('[data-board]').addEventListener('click', openBoard);
}

/* ═══ Блокнот ═════════════════════════════════════════════════ */
function paintNote() {
  const list = $('noteList');
  const cl = [...G.clues].map((id) => `<div class="entry"><b>${esc(CLUES[id].t)}</b><span>${esc(typo(CLUES[id].d))}</span></div>`).join('');
  const dd = [...G.deds].map((id) => { const d = DEDUCTIONS.find((x) => x.id === id); return `<div class="entry ded"><b>${esc(d.t)}</b><span>${esc(typo(d.d))}</span></div>`; }).join('');
  list.innerHTML = `<h3>Выводы · ${G.deds.size} из ${DEDUCTIONS.length}</h3>${dd || '<p class="empty">Пока ни одного. Свяжите улики на доске.</p>'}
    <h3>Улики · ${G.clues.size} из ${Object.keys(CLUES).length}</h3>${cl || '<p class="empty">Подчёркнутые слова в тексте — это улики. Щёлкните, чтобы записать.</p>'}`;
}
function openNote() { paintNote(); $('note').classList.add('open'); $('noteBtn').setAttribute('aria-pressed', 'true'); }
function closeNote() { $('note').classList.remove('open'); $('noteBtn').setAttribute('aria-pressed', 'false'); }
$('noteBtn').addEventListener('click', () => ($('note').classList.contains('open') ? closeNote() : openNote()));
$('noteX').addEventListener('click', closeNote);

/* ═══ Доска улик ══════════════════════════════════════════════ */
const cardsEl = $('cards');
let pick = null;
const itemOf = (id) => CLUES[id] ? { t: CLUES[id].t, d: CLUES[id].d, ded: false } : (() => { const d = DEDUCTIONS.find((x) => x.id === id); return { t: d.t, d: d.d, ded: true }; })();
function rot(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997; return ((h % 9) - 4) * 0.6; }

function buildBoard(newId) {
  const ids = [...G.deds, ...G.clues];
  const svg = $('threads');
  cardsEl.innerHTML = '';
  cardsEl.appendChild(svg);
  if (!ids.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.style.cssText = 'grid-column:1/-1;font-size:16px;color:#e5d8c4';
    p.textContent = 'Доска пуста. Щёлкайте подчёркнутые слова в тексте, чтобы собирать улики.';
    cardsEl.appendChild(p);
  }
  ids.forEach((id) => {
    const it = itemOf(id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card' + (it.ded ? ' ded' : '') + (id === newId ? ' new' : '');
    b.dataset.id = id;
    b.style.setProperty('--r', rot(id) + 'deg');
    b.innerHTML = `<b>${esc(it.t)}</b>${esc(typo(it.d))}`;
    b.addEventListener('click', () => pickCard(id, b));
    cardsEl.appendChild(b);
  });
  requestAnimationFrame(drawThreads);
}
function pinOf(id) {
  const c = cardsEl.querySelector(`.card[data-id="${id}"]`);
  if (!c) return null;
  const r = c.getBoundingClientRect(), R = cardsEl.getBoundingClientRect();
  return { x: r.left - R.left + r.width / 2, y: r.top - R.top };
}
function curve(a, b) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + Math.min(80, Math.hypot(b.x - a.x, b.y - a.y) * 0.18);
  return `M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`;
}
function drawThreads(extra) {
  const svg = $('threads');
  const R = cardsEl.getBoundingClientRect();
  svg.setAttribute('width', R.width); svg.setAttribute('height', cardsEl.scrollHeight);
  svg.setAttribute('viewBox', `0 0 ${R.width} ${cardsEl.scrollHeight}`);
  let s = '';
  for (const [a, b, d] of G.links) {
    const pa = pinOf(a), pb = pinOf(b), pd = pinOf(d);
    if (pa && pb) s += `<path d="${curve(pa, pb)}"/>`;
    if (pd && pa && pb) s += `<path d="${curve({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 + 20 }, pd)}" style="opacity:.55"/>`;
  }
  if (extra) s += extra;
  svg.innerHTML = s;
}
function pickCard(id, el) {
  if (!pick) { pick = id; el.classList.add('sel'); return; }
  if (pick === id) { pick = null; el.classList.remove('sel'); return; }
  const a = pick, b = id;
  pick = null;
  cardsEl.querySelectorAll('.card.sel').forEach((c) => c.classList.remove('sel'));
  const d = DEDUCTIONS.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  if (d && G.deds.has(d.id)) { say(`Это уже известно: <b>${esc(d.t)}</b>.`); return; }
  if (d) {
    G.deds.add(d.id);
    G.links.push([a, b, d.id]);
    buildBoard(d.id);
    say(`Вывод: <b>${esc(d.t)}</b>. ${esc(typo(d.d))}`);
    paintClock(); paintNote();
    thread();
    return;
  }
  const pa = pinOf(a), pb = pinOf(b);
  if (pa && pb) {
    drawThreads(`<path class="snap" d="${curve(pa, pb)}"/>`);
    setTimeout(() => drawThreads(), 900);
  }
  say('Нитка не держится: эти две вещи ничего не говорят друг о друге.');
}
function openBoard() { closeNote(); buildBoard(); $('board').classList.add('open'); }
function closeBoard() { $('board').classList.remove('open'); pick = null; }
$('boardBtn').addEventListener('click', () => ($('board').classList.contains('open') ? closeBoard() : openBoard()));
$('boardX').addEventListener('click', closeBoard);
addEventListener('resize', () => { if ($('board').classList.contains('open')) drawThreads(); });

/* ═══ Обвинение и финалы ══════════════════════════════════════ */
function accuse(who) {
  if (who === 'ark') {
    const score = ['dArkKey', 'dMotive', 'dLie', 'dBurn', 'dTime', 'dWet'].filter((d) => G.deds.has(d)).length;
    end(score >= 3 ? 'truth' : 'unproven');
  } else end(who === 'zhuk' ? 'convenient' : 'wrong');
}
function end(key) {
  G.over = true;
  closeBoard(); closeNote();
  const e = ENDINGS[key];
  sceneEl.innerHTML = `<div class="place fade-in">Финал · ${fmtTime(G.time)}</div><h1 class="fade-in">${esc(e.title)}</h1>` +
    e.text.map((p) => `<p class="para${p.startsWith('—') ? ' dialog' : ''}">${words(typo(p))}</p>`).join('') +
    `<div id="after"></div>`;
  sceneEl.scrollTop = 0;
  paintClock();
  reveal(() => {
    const ends = { truth: 'Правда', unproven: 'Недоказанное', convenient: 'Удобный виновный', wrong: 'Чужая вина', dawn: 'Рассвет' };
    $('after').innerHTML = `<div class="end-stats fade-in">Улик собрано: ${G.clues.size} из ${Object.keys(CLUES).length}<br>Выводов сделано: ${G.deds.size} из ${DEDUCTIONS.length}<br>Финалов в игре пять: ${Object.values(ends).join(', ')}.</div>
      <button type="button" class="big fade-in" id="again">Начать заново</button><button type="button" class="big ghost fade-in" id="seeBoard">Посмотреть доску</button>`;
    $('again').addEventListener('click', () => { fresh(); paintNote(); go('intro', 0); });
    $('seeBoard').addEventListener('click', openBoard);
  });
}

/* ═══ Клавиатура ══════════════════════════════════════════════ */
addEventListener('keydown', (e) => {
  if (!$('titleCard').classList.contains('gone')) { if (e.key === 'Enter') startGame(false); return; }
  if (e.key === 'Escape') { closeBoard(); closeNote(); return; }
  if (revealing && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal.skip(); return; }
  if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') { $('note').classList.contains('open') ? closeNote() : openNote(); return; }
  if (e.key === 'b' || e.key === 'B' || e.key === 'и' || e.key === 'И') { $('board').classList.contains('open') ? closeBoard() : openBoard(); return; }
  if (/^[1-9]$/.test(e.key) && !$('board').classList.contains('open')) {
    const btn = sceneEl.querySelectorAll('.choice[data-i]:not([disabled]), .sus, .choice[data-back]')[+e.key - 1];
    if (btn) btn.click();
  }
});
sceneEl.addEventListener('click', (e) => { if (revealing && !e.target.closest('.clue')) reveal.skip(); });

/* ═══ Дождь на стекле (WebGL2) ════════════════════════════════ */
const canvas = $('rain');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
let flash = 0, nextFlash = 25 + Math.random() * 30;
const FS = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime, uFlash;

float h11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
vec3 h31(float p) { vec3 q = fract(vec3(p) * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }
vec3 h32(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yzz) * q.zyx); }

// Ночная улица за стеклом, не в фокусе. blur: 1 — запотевшее стекло, 0 — сквозь каплю.
vec3 street(vec2 uv, float blur, float aspect) {
  vec3 col = mix(vec3(.012, .013, .018), vec3(.026, .026, .032), smoothstep(.0, 1., uv.y));
  col += vec3(.09, .07, .05) * exp(-pow((uv.y - .3) * 4.5, 2.)) * .8;         // мокрая мостовая светится
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    vec3 r = h31(fi * 7.31 + 1.7);
    vec2 p = vec2(r.x * aspect, .16 + r.y * .52);
    float size = mix(.018, .06, r.z) * (.45 + blur * .9);
    vec3 lc = r.z > .86 ? vec3(1., .22, .16) : (r.z > .55 ? vec3(.95, .9, .82) : vec3(1., .74, .42));
    float fl = .85 + .15 * sin(uTime * (.4 + r.x) + fi * 3.);
    float d = length(uv - p);
    float soft = mix(.18, .72, blur);
    col += lc * smoothstep(size, size * (1. - soft), d) * .30 * fl * (.55 + r.y);
    col += lc * exp(-d * d / (size * size * 9.)) * .05;
    // отражение в лужах — вертикальная полоса под фонарём
    if (uv.y < p.y) col += lc * exp(-abs(uv.x - p.x) / (.006 + blur * .012)) * exp(-(p.y - uv.y) * 3.5) * .06 * fl;
  }
  // проезжающий трамвай и извозчик
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float x = fract(uTime * (.018 + fk * .011) + fk * .43) * (aspect + .6) - .3;
    vec2 p = vec2(k == 0 ? x : aspect - x, .24 + fk * .04);
    vec3 lc = k == 0 ? vec3(1., .86, .6) : vec3(1., .3, .2);
    float size = (.03 + blur * .03);
    col += lc * smoothstep(size, size * .3, length(uv - p)) * .45;
    col += lc * smoothstep(size, size * .3, length(uv - p - vec2(.07, 0.))) * .45;
  }
  return col;
}

// Высота водяной плёнки: неподвижные капли + стекающие дорожки
float drops(vec2 uv, float t, float aspect, out float trail) {
  // неподвижные капли
  vec2 g = uv * 26.;
  vec2 id = floor(g), f = fract(g) - .5;
  vec3 r = h32(id + 11.);
  vec2 p = (r.xy - .5) * .34;
  float rad = mix(.1, .3, r.z * r.z);
  float life = fract(t * .04 + r.x * 7.);
  float fade = smoothstep(0., .08, life) * smoothstep(1., .85, life) * step(.35, r.y);
  float d = length(f - p) / rad;
  float h = d < 1. ? sqrt(1. - d * d) * fade * rad * .9 : 0.;
  // стекающие капли: одна на колонку
  float cols = floor(15. * aspect / 1.6);
  float cx = uv.x / aspect * cols;
  float cid = floor(cx);
  vec3 q = h31(cid * 13.7 + 3.);
  float x = fract(cx) - .5 - (q.x - .5) * .5;
  float speed = mix(.05, .16, q.y);
  float ph = fract(t * speed + q.z);
  float y = 1.12 - 1.3 * (ph + .014 * sin(ph * 44.));
  x += sin(uv.y * 26. + q.z * 6.) * .05;                                   // извилистая дорожка
  vec2 e = vec2(x / .28, (uv.y - y) / .026);
  float dd = length(e);
  float drop = dd < 1. ? sqrt(1. - dd * dd) * .18 : 0.;
  float behind = uv.y - y;
  trail = step(0., behind) * smoothstep(.34, 0., behind) * smoothstep(.16, .02, abs(x));
  // мелкие капельки в дорожке
  float yy = fract(uv.y * 38. + q.x * 3.) - .5;
  float td = length(vec2(x * 2.2, yy));
  float tiny = td < .34 ? sqrt(1. - (td / .34) * (td / .34)) * .05 * step(.45, h11(floor(uv.y * 38. + q.x * 3.) + cid)) : 0.;
  return max(h, max(drop, tiny * trail));
}

void main() {
  float aspect = uRes.x / uRes.y;
  vec2 uv = gl_FragCoord.xy / uRes.y;
  float t = uTime;
  float trail, tr2;
  float h = drops(uv, t, aspect, trail);
  vec2 ep = vec2(1.6 / uRes.y, 0.);
  float hx = drops(uv + ep.xy, t, aspect, tr2) - h;
  float hy = drops(uv + ep.yx, t, aspect, tr2) - h;
  vec2 n = vec2(hx, hy) / ep.x;                                            // наклон поверхности воды
  float wet = smoothstep(.0, .015, h);
  float focus = max(wet, trail * .7);
  vec3 col = street(uv - n * .045, mix(1., .18, focus), aspect);
  col *= 1. - .35 * smoothstep(.4, 3., length(n)) * wet;                  // тёмный ободок капли
  vec3 N = normalize(vec3(-n * .6, 1.));
  col += vec3(.9, .88, .84) * pow(max(dot(N, normalize(vec3(-.5, .7, .6))), 0.), 40.) * .35 * wet;
  col += vec3(.55, .6, .75) * uFlash * (.35 + .65 * uv.y);
  vec2 q = gl_FragCoord.xy / uRes - .5;
  col *= 1. - .6 * dot(q, q);
  col = pow(col, vec3(.95));
  o = vec4(col, 1.);
}`;
const VS = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }`;

let prog = null, U = {}, scale = SHOT ? 0.8 : 0.75;
if (gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindVertexArray(gl.createVertexArray());
    ['uRes', 'uTime', 'uFlash'].forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));
  } catch (err) { prog = null; }
}
if (!prog) canvas.style.background = 'radial-gradient(ellipse at 60% 60%, #2a2320, #07080a 70%)';

function resize() {
  const dpr = SHOT ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.max(1, Math.floor(innerWidth * dpr * scale));
  canvas.height = Math.max(1, Math.floor(innerHeight * dpr * scale));
}
addEventListener('resize', resize);
resize();

let last = 0, acc = 0, accN = 0, frames = 0, shotDone = false;
function loop(now) {
  requestAnimationFrame(loop);
  if (!prog || document.hidden) return;
  if (SHOT && shotDone) return;
  const dt = last ? now - last : 16;
  last = now;
  // адаптивное разрешение (кроме режима съёмки)
  if (!SHOT && frames > 5) {
    acc += dt; accN++;
    if (accN >= 30) {
      const avg = acc / accN; acc = 0; accN = 0;
      const prev = scale;
      if (avg > 30) scale = Math.max(0.4, scale * 0.85); else if (avg < 17) scale = Math.min(1, scale * 1.08);
      if (Math.abs(prev - scale) > 0.01) resize();
    }
  }
  const t = now / 1000;
  if (!reduce && t > nextFlash) { flash = 1; nextFlash = t + 45 + Math.random() * 60; thunder(); }
  flash *= 0.86;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(U.uRes, canvas.width, canvas.height);
  gl.uniform1f(U.uTime, SHOT ? 37.0 : (reduce ? t * 0.3 : t));
  gl.uniform1f(U.uFlash, flash > 0.02 ? flash * (0.6 + 0.4 * Math.sin(t * 60)) : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  frames++;
  if (SHOT && frames >= 1) shotDone = true;
}
requestAnimationFrame(loop);

/* ═══ Звук: дождь, трамвай, гром ══════════════════════════════ */
let ac = null, soundOn = false, rainBus = null, patter = 0, tramT = 0;
function audioOn() {
  if (!ac) {
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    const nb = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate);
    const d = nb.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {              // розовый шум (фильтр Келлета)
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    ac.noise = nb;
    rainBus = ac.createGain(); rainBus.gain.value = 0; rainBus.connect(ac.destination);
    const hiss = ac.createBufferSource(); hiss.buffer = nb; hiss.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6500;
    const hg = ac.createGain(); hg.gain.value = 0.22;
    hiss.connect(hp).connect(lp).connect(hg).connect(rainBus); hiss.start();
    const rum = ac.createBufferSource(); rum.buffer = nb; rum.loop = true; rum.playbackRate.value = 0.5;
    const lp2 = ac.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 260;
    const rg = ac.createGain(); rg.gain.value = 0.35;
    rum.connect(lp2).connect(rg).connect(rainBus); rum.start();
  }
  if (ac.state === 'suspended') ac.resume();
  soundOn = true;
  rainBus.gain.setTargetAtTime(0.5, ac.currentTime, 0.8);
  $('sndBtn').setAttribute('aria-pressed', 'true');
  clearInterval(patter);
  patter = setInterval(drip, 45);
  tramT = ac.currentTime + 8 + Math.random() * 10;
}
function audioOff() {
  soundOn = false;
  if (ac) rainBus.gain.setTargetAtTime(0, ac.currentTime, 0.3);
  clearInterval(patter);
  $('sndBtn').setAttribute('aria-pressed', 'false');
}
function drip() {
  if (!soundOn) return;
  const t = ac.currentTime;
  for (let i = 0; i < 3; i++) {
    if (Math.random() < 0.55) continue;
    const s = ac.createBufferSource(); s.buffer = ac.noise;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 4200; bp.Q.value = 6;
    const g = ac.createGain(); const at = t + Math.random() * 0.045;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.12, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
    s.connect(bp).connect(g).connect(rainBus); s.start(at, Math.random() * 2, 0.05);
  }
  if (t > tramT) { tram(t); tramT = t + 40 + Math.random() * 40; }
}
function tram(t) {
  [0, 0.34].forEach((d) => {
    [[1310, 0.05], [2620 * 1.01, 0.02], [3950, 0.01]].forEach(([f, a]) => {
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = ac.createGain(); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(a, t + d + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.4);
      o.connect(lp).connect(g).connect(rainBus); o.start(t + d); o.stop(t + d + 1.5);
    });
  });
}
function thunder() {
  if (!soundOn || !ac) return;
  const t = ac.currentTime + 0.6 + Math.random() * 1.2;
  const s = ac.createBufferSource(); s.buffer = ac.noise; s.playbackRate.value = 0.35;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
  s.connect(lp).connect(g).connect(rainBus); s.start(t, 0, 5);
}
$('sndBtn').addEventListener('click', () => (soundOn ? audioOff() : audioOn()));

/* ═══ Старт ═══════════════════════════════════════════════════ */
function startGame(withSound) {
  $('titleCard').classList.add('gone');
  if (withSound) audioOn();
  go('intro', 0);
}
$('startBtn').addEventListener('click', () => startGame(false));
$('startSnd').addEventListener('click', () => startGame(true));
paintClock();
paintNote();
function thread() { /* звук нитки — тихий щелчок */ if (!soundOn || !ac) return; tick(); }
function tick() {
  if (!soundOn || !ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = 900;
  const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.1);
}
})();
