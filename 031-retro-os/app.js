/* «Рассвет-86» — вымышленная операционная система 1986 года.
   Оконный менеджер, файловая система в localStorage, терминал, блокнот, холст, сапёр, пианола, панель управления. */
'use strict';
(() => {

/* ===================== УТИЛИТЫ ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) { if (k == null || k === false) continue; e.append(k.nodeType ? k : document.createTextNode(String(k))); }
  return e;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* нет доступа */ } },
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const isMobile = () => innerWidth <= 700;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function plural(n, a, b, c) { n = Math.abs(n) % 100; const d = n % 10; if (n > 10 && n < 20) return c; if (d > 1 && d < 5) return b; if (d === 1) return a; return c; }
const fmtNum = n => n.toLocaleString('ru-RU');

/* ===================== НАСТРОЙКИ И ВРЕМЯ ===================== */
const SET_KEY = 'rassvet86-settings-v1';
const settings = Object.assign({ theme: 'dawn', wall: 'dawn', sounds: true, crt: false }, store.get(SET_KEY, {}));
const saveSettings = () => store.set(SET_KEY, settings);
const THEME_NAMES = { dawn: 'Рассвет', night: 'Полночь', moss: 'Мох', chalk: 'Мел' };
const WALL_NAMES = { dawn: 'Рассвет', mountains: 'Горы', space: 'Космос', pattern: 'Узор' };

const YEAR = 1986, bootTime = Date.now();
function now86() { const d = new Date(); return new Date(YEAR, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()); }
const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WDF = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONF = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONG = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function uptime() { const s = Math.floor((Date.now() - bootTime) / 1000), m = Math.floor(s / 60), hh = Math.floor(m / 60); return hh ? `${hh} ч ${m % 60} мин` : m ? `${m} мин ${s % 60} с` : `${s} с`; }

/* ===================== ПИКСЕЛЬНЫЕ ЗНАЧКИ ===================== */
const IPAL = { K: '#2b1d14', W: '#fffaf0', P: '#f4ead4', O: '#e2572b', Y: '#f0a53a', B: '#7a3b1e', T: '#2f6f6a', N: '#2d3f7a', S: '#6f8fd8',
  G: '#8a8378', g: '#c9c2b4', R: '#c0392b', M: '#4f7a3a', L: '#a4c46a', A: '#ffb347', D: '#1e140d', Z: '#5b4a3c' };
const ICONS = {
  disk: ['................', '.KKKKKKKKKKKKK..', '.KNNKgggggggKNK.', '.KNNKgggKKggKNNK', '.KNNKgggKKggKNNK', '.KNNKgggggggKNNK', '.KNNNKKKKKKKNNNK', '.KNNNNNNNNNNNNNK',
    '.KNNWWWWWWWWWNNK', '.KNNWKKKKKKKWNNK', '.KNNWWWWWWWWWNNK', '.KNNWKKKKKWWWNNK', '.KNNWWWWWWWWWNNK', '.KNNWWWWWWWWWNNK', '.KKKKKKKKKKKKKKK', '................'],
  terminal: ['................', '.KKKKKKKKKKKKKK.', '.KggggggggggggK.', '.KgDDDDDDDDDDgK.', '.KgDADDDDDDDDgK.', '.KgDDADDDDDDDgK.', '.KgDADDDDDDDDgK.', '.KgDDDDAAAADDgK.',
    '.KgDDDDDDDDDDgK.', '.KggggggggggggK.', '.KggggggggggOgK.', '.KKKKKKKKKKKKKK.', '.....KggggK.....', '...KKKKKKKKKK...', '...KZZZZZZZZK...', '...KKKKKKKKKK...'],
  notepad: ['................', '...K.K.K.K.K....', '..KKKKKKKKKKK...', '..KWWWWWWWWWKK..', '..KWWWWWWWWWKOK.', '..KWKKKKKKKWKOK.', '..KWWWWWWWWWKOK.', '..KWKKKKKKWWKOK.',
    '..KWWWWWWWWWKOK.', '..KWKKKKKKKWKOK.', '..KWWWWWWWWWKOK.', '..KWKKKKKWWWKOK.', '..KWWWWWWWWWKOK.', '..KKKKKKKKKKKOK.', '...KKKKKKKKKKKK.', '................'],
  paint: ['................', '...........KK...', '..........KYK...', '.........KYK....', '...KKKKKKYKK....', '..KPPPPPKBKPK...', '.KPPOOPPKKPPPK..', '.KPPOOPPPPPPPK..',
    'KPPPPPPPPTTPPPK.', 'KPPNNPPPPTTPPPK.', 'KPPNNPPPKKKPPPK.', '.KPPPPPK...KPK..', '.KPPMMPPK..KPK..', '..KPMMPPPKKPPK..', '...KKPPPPPPKK...', '.....KKKKKK.....'],
  mines: ['................', '..........Y.....', '.........YAY....', '..........K.....', '.........K......', '......KKKKK.....', '....KKKKKKKKK...', '...KKWWKKKKKKK..',
    '...KKWKKKKKKKK..', '..KKKKKKKKKKKKK.', '..KKKKKKKKKKKKK.', '...KKKKKKKKKKK..', '...KKKKKKKKKKK..', '....KKKKKKKKK...', '......KKKKK.....', '................'],
  piano: ['................', '.OOOOOOOOOOOOOO.', 'KKKKKKKKKKKKKKKK', 'KWKKWKKWWKWKKWWK', 'KWKKWKKWWKWKKWWK', 'KWKKWKKWWKWKKWWK', 'KWKKWKKWWKWKKWWK', 'KWKKWKKWWKWKKWWK',
    'KWKKWKKWWKWKKWWK', 'KWWKWWKWWKWWKWWK', 'KWWKWWKWWKWWKWWK', 'KWWKWWKWWKWWKWWK', 'KWWKWWKWWKWWKWWK', 'KKKKKKKKKKKKKKKK', '................', '................'],
  control: ['................', '.KKKKKKKKKKKKKK.', '.KPPPPPPPPPPPPK.', '.KPPKPPPKPPPKPK.', '.KPPKPPOOOPPKPK.', '.KPPKPPOOOPPKPK.', '.KPPKPPPKPPPKPK.', '.KPPKPPPKPPOOOK.',
    '.KPPKPPPKPPOOOK.', '.KPOOOPPKPPPKPK.', '.KPOOOPPKPPPKPK.', '.KPPKPPPKPPPKPK.', '.KPPKPPPKPPPKPK.', '.KPPPPPPPPPPPPK.', '.KKKKKKKKKKKKKK.', '................'],
  trash: ['................', '......KKKK......', '...KKKKKKKKKK...', '...KggggggggK...', '...KKKKKKKKKK...', '....KgZgZgZgK...', '....KgZgZgZgK...', '....KgZgZgZgK...',
    '....KgZgZgZgK...', '....KgZgZgZgK...', '....KgZgZgZgK...', '....KgZgZgZgK...', '....KgZgZgZgK...', '....KgggggggK...', '....KKKKKKKKK...', '................'],
  folder: ['................', '................', '.KKKKK..........', 'KYYYYYK.........', 'KYYYYYYKKKKKKKK.', 'KYYYYYYYYYYYYYYK', 'KAAAAAAAAAAAAAAK', 'KYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYK', 'KYYYYYYYYYYYYYYK', 'KYYYYYYYYYYYYYYK', 'KYYYYYYYYYYYYYYK', 'KBBBBBBBBBBBBBBK', 'KKKKKKKKKKKKKKKK', '................', '................'],
  doc: ['................', '...KKKKKKKK.....', '...KWWWWWWKK....', '...KWWWWWWKWK...', '...KWKKKKWKKKK..', '...KWWWWWWWWWK..', '...KWKKKKKKKWK..', '...KWWWWWWWWWK..',
    '...KWKKKKKKWWK..', '...KWWWWWWWWWK..', '...KWKKKKKKKWK..', '...KWWWWWWWWWK..', '...KWKKKKWWWWK..', '...KWWWWWWWWWK..', '...KKKKKKKKKKK..', '................'],
  picture: ['................', '.KKKKKKKKKKKKKK.', '.KBBBBBBBBBBBBK.', '.KBSSSSSSSSSSBK.', '.KBSSSSSSYYSSBK.', '.KBSSSSSYYYYSBK.', '.KBSSSSSSYYSSBK.', '.KBSSSMSSSSSSBK.',
    '.KBSSMMMSSSSSBK.', '.KBSMMMMMSSMSBK.', '.KBMMMMMMMMMMBK.', '.KBMMMMMMMMMMBK.', '.KBBBBBBBBBBBBK.', '.KKKKKKKKKKKKKK.', '................', '................'],
  app: ['................', '.KKKKKKKKKKKKKK.', '.KOOOOOOOOOOOOK.', '.KKKKKKKKKKKKKK.', '.KPPPPPPPPPPPPK.', '.KPKKKKKPPPPPPK.', '.KPPPPPPPPPPPPK.', '.KPKKKPPPPPPPPK.',
    '.KPPPPPPPPPPPPK.', '.KPKKKKKKPPPPPK.', '.KPPPPPPPPPPPPK.', '.KKKKKKKKKKKKKK.', '................', '................', '................', '................'],
  sun: ['................', '................', '................', '......YYYY......', '....YYYYYYYY....', '...YYYYYYYYYY...', '..AAAAAAAAAAAA..', '..AAAAAAAAAAAA..',
    '................', '.OOOOOOOOOOOOOO.', '................', '..OOOOOOOOOOOO..', '................', '....OOOOOOOO....', '................', '................'],
  flag: ['................', '................', '.....KOOO.......', '.....KOOOOO.....', '.....KOOOOOOO...', '.....KOOOOO.....', '.....KOOO.......', '.....K..........',
    '.....K..........', '.....K..........', '...KKKKK........', '..KKKKKKKK......', '................', '................', '................', '................'],
  pencil: ['............KK..', '...........KOOK.', '..........KYYOK.', '.........KYYYK..', '........KYYYK...', '.......KYYYK....', '......KYYYK.....', '.....KYYYK......',
    '....KYYYK.......', '...KgYYK........', '...KggK.........', '..KKKK..........', '..KK............', '................', '................', '................'],
  brush: ['............KK..', '...........KBBK.', '..........KBBK..', '.........KBBK...', '........KBBK....', '.......KBBK.....', '......KggK......', '.....KggK.......',
    '....KOOOK.......', '...KOOOOK.......', '..KOOOOK........', '..KOOOK.........', '.KOOKK..........', '.KKK............', '................', '................'],
  spray: ['................', '..K.K...........', '...K.K..KKKK....', '..K.K...KggK....', '........KKKK....', '.......KOOOOK...', '.......KOOOOK...', '.......KWWWWK...',
    '.......KWKKWK...', '.......KWWWWK...', '.......KOOOOK...', '.......KOOOOK...', '.......KOOOOK...', '.......KKKKKK...', '................', '................'],
  eraser: ['................', '................', '........KKKKK...', '.......KPPPPPK..', '......KPPPPPKK..', '.....KPPPPPKOK..', '....KPPPPPKOOK..', '...KPPPPPKOOK...',
    '..KKKKKKKOOK....', '..KOOOOOKOK.....', '..KOOOOOKK......', '..KKKKKKK.......', '................', '................', '................', '................'],
  fill: ['................', '.....KK.........', '....K..K........', '....K..KK.......', '...KKKKKKK......', '..KPPPPPPPK.....', '.KPPPPPPPPPK....', 'KPPPPPPPPPPPK...',
    '.KPPPPPPPPPKSS..', '..KPPPPPPPK.SSS.', '...KPPPPPK..SSS.', '....KPPPK....S..', '.....KKK........', '................', '................', '................'],
  line: ['................', '.............KK.', '............KK..', '...........KK...', '..........KK....', '.........KK.....', '........KK......', '.......KK.......',
    '......KK........', '.....KK.........', '....KK..........', '...KK...........', '..KK............', '.KK.............', '................', '................'],
  rect: ['................', '................', '..KKKKKKKKKKKK..', '..K..........K..', '..K..........K..', '..K..........K..', '..K..........K..', '..K..........K..',
    '..K..........K..', '..K..........K..', '..K..........K..', '..K..........K..', '..KKKKKKKKKKKK..', '................', '................', '................'],
  ellipse: ['................', '................', '.....KKKKKK.....', '...KK......KK...', '..K..........K..', '.K............K.', '.K............K.', '.K............K.',
    '.K............K.', '..K..........K..', '...KK......KK...', '.....KKKKKK.....', '................', '................', '................', '................'],
  picker: ['............KK..', '...........KKKK.', '..........KKKKK.', '.........KKKKK..', '........KgKKK...', '.......KgWgK....', '......KgWgK.....', '.....KgWgK......',
    '....KgWgK.......', '...KgWgK........', '..KSSgK.........', '..KSSK..........', '.KKKK...........', '................', '................', '................'],
};
// рожицы сапёра
const FACE = ['.....KKKKKK.....', '...KKYYYYYYKK...', '..KYYYYYYYYYYK..', '.KYYYYYYYYYYYYK.', '.KYYYKYYYYKYYYK.', 'KYYYYKYYYYKYYYYK', 'KYYYYYYYYYYYYYYK', 'KYYYYYYYYYYYYYYK',
  'KYYKYYYYYYYYKYYK', 'KYYYKYYYYYYKYYYK', '.KYYYKKKKKKYYYK.', '.KYYYYYYYYYYYYK.', '..KYYYYYYYYYYK..', '...KKYYYYYYKK...', '.....KKKKKK.....', '................'];
function faceWith(rows) { const f = FACE.slice(); for (const [i, r] of Object.entries(rows)) f[i] = r; return f; }
ICONS.face = FACE;
ICONS.faceWow = faceWith({ 4: '.KYYKKYYYYKKYYK.', 5: 'KYYYKKYYYYKKYYYK', 8: 'KYYYYYYYYYYYYYYK', 9: 'KYYYYYYKKYYYYYYK', 10: '.KYYYYKYYKYYYYK.', 11: '.KYYYYYKKYYYYYK.' });
ICONS.faceDead = faceWith({ 3: '.KYYKYKYYKYKYYK.', 4: '.KYYYKYYYYKYYYK.', 5: 'KYYYKYKYYKYKYYYK', 8: 'KYYYYYYYYYYYYYYK', 9: 'KYYYYKKKKKKYYYYK', 10: '.KYYKYYYYYYKYYK.' });
ICONS.faceCool = faceWith({ 4: '.KKKKKKKKKKKKKK.', 5: 'KYKKKKYYYYKKKKYK', 6: 'KYYKKYYYYYYKKYYK' });

const iconCache = {};
function iconURL(name) {
  if (iconCache[name]) return iconCache[name];
  const bm = ICONS[name] || ICONS.app, c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const x = c.getContext('2d');
  bm.forEach((row, y) => { for (let i = 0; i < 16; i++) { const ch = row[i]; if (!ch || ch === '.') continue; x.fillStyle = IPAL[ch]; x.fillRect(i, y, 1, 1); } });
  return (iconCache[name] = c.toDataURL());
}
function ico(name, cls) { const e = h('i', { class: 'ico' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }); e.style.backgroundImage = `url(${iconURL(name)})`; return e; }
const SVG = {
  x: '<svg viewBox="0 0 10 10"><path d="M1 1h2v1h1v1h2V2h1V1h2v2H8v1H7v2h1v1h1v2H7V8H6V7H4v1H3v1H1V7h1V6h1V4H2V3H1z"/></svg>',
  min: '<svg viewBox="0 0 10 10"><path d="M1 7h8v2H1z"/></svg>',
  max: '<svg viewBox="0 0 10 10"><path d="M1 1h8v8H1zM3 4v3h4V4z"/></svg>',
  snd: '<svg viewBox="0 0 16 16"><path d="M2 6h3l3-3h2v10H8l-3-3H2zM12 5h1v1h1v4h-1v1h-1z"/></svg>',
  mute: '<svg viewBox="0 0 16 16"><path d="M2 6h3l3-3h2v10H8l-3-3H2zM11 6h1v1h1V6h1v1h-1v2h1v1h-1V9h-1v1h-1V9h1V7h-1z"/></svg>',
  check: '<svg viewBox="0 0 12 12"><path d="M1 6h2v2h2V6h1V4h2V2h2v2H9v2H8v2H7v2H5v-1H3V8H1z"/></svg>',
};

/* ===================== ТЕКСТЫ ПО УМОЛЧАНИЮ ===================== */
const README = `Добро пожаловать в «Рассвет-86»!

Это рабочее место из 1986 года, собранное в 2026-м. Всё здесь настоящее: окна двигаются и меняют размер, файлы сохраняются на диск, «Сапёр» взрывается, а пианола звучит.

С чего начать:
 • Дважды щёлкните по значку на рабочем столе.
 • В «Терминале» наберите help — там 26 команд.
 • Нарисуйте что-нибудь в «Холсте» и сохраните в папку «Картинки».
 • В «Панели управления» — четыре темы и четыре вида обоев.
 • Правый щелчок по рабочему столу открывает меню.

Диск «А:» живёт в памяти вашего браузера и переживёт перезагрузку. Если что-то пойдёт не так: «Панель управления» → «Сбросить диск».

Хорошего рассвета!`;
const LETTER = `Здравствуй, 2026-й!

Пишу тебе с машины, у которой 640 килобайт памяти и янтарный экран. Когда она думает, гудит вентилятор и немного пахнет тёплой пылью. Мы зовём это прогрессом.

Говорят, у вас компьютеры помещаются в карман, рисуют картины и разговаривают. Если это правда, передай им от нас привет и попроси не зазнаваться: мы тоже когда-то были самыми умными в комнате.

У нас всё хорошо. Дискеты по-прежнему теряются, программы по-прежнему не сохраняются в самый важный момент, а по утрам в окне всё тот же рассвет. Надеюсь, хоть это у вас не изменилось.

Не забывай сохраняться.
Твой 1986-й`;
const TODO = `1. Купить дискеты (10 штук, лучше 20).
2. Дописать «Змейку».
3. Не забыть сохранить файл.
4. Сохранить файл.
5. Проверить, что файл сохранился.
6. Выйти на улицу и посмотреть на настоящий рассвет.`;
const POEM = `Рассвет

Экран светлеет раньше неба,
курсор мерцает у черты.
Я набираю: «Где ты не был?»
Машина отвечает: «Ты».

Шуршит дискета, помня что-то,
гудит машина в тишине —
и кажется, что вся работа
сейчас загрузится во мне.`;
const CONFIG = `; Конфигурация «Рассвет-86»
ПАМЯТЬ=640
ДИСК=А:
КОДИРОВКА=КОИ-8
ЭКРАН=16 ЦВЕТОВ
; Не редактируйте этот файл, если не уверены.
; А если уверены — всё равно подумайте.`;
const FORTUNES = [
  'Сохраняйся чаще, чем думаешь. Дискета помнит только то, что ей сказали.',
  'Программа без ошибок — это программа, которую ещё никто не запускал.',
  'Лучший алгоритм — тот, что можно объяснить соседу по лестничной клетке.',
  'Если компьютер молчит, он думает. Если молчит долго — он думает о вас.',
  'Не спорь с компилятором: у него больше терпения.',
  'Каждая перезагрузка — маленький рассвет.',
  'Байт за байтом — и вот уже килобайт.',
  'Курсор мигает не от нетерпения, а из вежливости.',
  'Не знаешь, что делать, — набери help. Знаешь — всё равно набери.',
  'Будущее наступит в 2026 году. Проверено.',
  'Хорошая программа как хороший чай: крепкая, горячая и без лишнего сахара.',
  'Ошибка — это вопрос, на который машина ответила честно.',
  'В памяти 640 килобайт, а в голове — бесконечность. Используй обе.',
  'Самая надёжная резервная копия — та, которую ты уже сделал.',
];

/* ===================== ХОЛСТ: ПАЛИТРА, УЗОРЫ, РИСОВАЛЬЩИК ===================== */
const PPAL = ['#1b120c', '#fbf4e4', '#e2572b', '#f0a53a', '#7a3b1e', '#b8784a', '#2f6f6a', '#6aa6a0',
  '#2d3f7a', '#6f8fd8', '#8c2f39', '#e58fa6', '#4f7a3a', '#a4c46a', '#6b6b6b', '#c9c2b4'];
const PATS = [[255, 255, 255, 255, 255, 255, 255, 255], [170, 85, 170, 85, 170, 85, 170, 85], [136, 0, 34, 0, 136, 0, 34, 0],
  [255, 0, 255, 0, 255, 0, 255, 0], [17, 34, 68, 136, 17, 34, 68, 136], [119, 221, 119, 221, 119, 221, 119, 221]];
const PCW = 288, PCH = 192;
const hex32 = hx => { const n = parseInt(hx.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0; };
const PAL32 = PPAL.map(hex32);

function makePainter(W, H, px) {
  const P = { W, H, px, pat: 0 };
  P.on = (x, y) => (PATS[P.pat][y & 7] >> (7 - (x & 7))) & 1;
  P.plot = (x, y, c) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H || !P.on(x, y)) return; px[y * W + x] = c; };
  P.stamp = (x, y, c, s) => {
    if (s <= 1) return P.plot(x, y, c);
    if (s === 2) { P.plot(x, y, c); P.plot(x + 1, y, c); P.plot(x, y + 1, c); P.plot(x + 1, y + 1, c); return; }
    const r = s / 2, r2 = r * r;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) if (dx * dx + dy * dy <= r2) P.plot(x + dx, y + dy, c);
  };
  P.line = (x0, y0, x1, y1, c, s = 1) => {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (;;) { P.stamp(x0, y0, c, s); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  };
  P.rect = (x0, y0, x1, y1, c, fill, s = 1) => {
    const a = Math.min(x0, x1), b = Math.min(y0, y1), e = Math.max(x0, x1), f = Math.max(y0, y1);
    if (fill) { for (let y = b; y <= f; y++) for (let x = a; x <= e; x++) P.plot(x, y, c); }
    else { P.line(a, b, e, b, c, s); P.line(e, b, e, f, c, s); P.line(e, f, a, f, c, s); P.line(a, f, a, b, c, s); }
  };
  P.ellipse = (x0, y0, x1, y1, c, fill, s = 1) => {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    if (rx < 0.5 || ry < 0.5) return P.line(x0, y0, x1, y1, c, s);
    if (fill) { for (let y = Math.ceil(cy - ry); y <= cy + ry; y++) { const t = (y - cy) / ry, w = rx * Math.sqrt(Math.max(0, 1 - t * t)); for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) P.plot(x, y, c); } return; }
    const n = Math.max(24, Math.round((rx + ry) * 3)); let px0 = cx + rx, py0 = cy;
    for (let i = 1; i <= n; i++) { const a = i / n * Math.PI * 2, x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry; P.line(Math.round(px0), Math.round(py0), Math.round(x), Math.round(y), c, s); px0 = x; py0 = y; }
  };
  P.fill = (x, y, c) => {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return;
    const target = px[y * W + x], seen = new Uint8Array(W * H), st = [y * W + x], region = [];
    seen[y * W + x] = 1;
    while (st.length) {
      const i = st.pop(); region.push(i); const xx = i % W, yy = (i / W) | 0;
      if (xx > 0 && !seen[i - 1] && px[i - 1] === target) { seen[i - 1] = 1; st.push(i - 1); }
      if (xx < W - 1 && !seen[i + 1] && px[i + 1] === target) { seen[i + 1] = 1; st.push(i + 1); }
      if (yy > 0 && !seen[i - W] && px[i - W] === target) { seen[i - W] = 1; st.push(i - W); }
      if (yy < H - 1 && !seen[i + W] && px[i + W] === target) { seen[i + W] = 1; st.push(i + W); }
    }
    for (const i of region) { const xx = i % W, yy = (i / W) | 0; if (P.on(xx, yy)) px[i] = c; }
  };
  return P;
}
function pictureToURL(draw) {
  const c = document.createElement('canvas'); c.width = PCW; c.height = PCH; const x = c.getContext('2d');
  const img = x.createImageData(PCW, PCH), px = new Uint32Array(img.data.buffer); const P = makePainter(PCW, PCH, px);
  draw(P); x.putImageData(img, 0, 0); return c.toDataURL('image/png');
}
function makePicDawn() {
  return pictureToURL(P => {
    const C = PAL32; P.pat = 0; P.rect(0, 0, PCW - 1, PCH - 1, C[8], true);
    const bands = [[0, 30, 8, 10, 1], [30, 60, 10, 11, 1], [60, 95, 11, 2, 1], [95, 118, 2, 3, 1]];
    for (const [a, b, c1, c2] of bands) { P.pat = 0; P.rect(0, a, PCW - 1, b, C[c1], true); P.pat = 2; P.rect(0, a, PCW - 1, b, C[c2], true); P.pat = 1; P.rect(0, b - 6, PCW - 1, b, C[c2], true); }
    P.pat = 0; P.ellipse(150, 64, 250, 164, C[3], true);
    P.pat = 1; P.ellipse(150, 90, 250, 164, C[2], true);
    P.pat = 0; for (let k = 0; k < 6; k++) { const y = 100 + k * 3 + k * k; P.rect(140, y, 260, y + 1 + (k >> 1), C[2 + (k > 3 ? 8 : 0)] || C[10], true); }
    P.pat = 0; P.rect(0, 118, PCW - 1, PCH - 1, C[4], true);
    for (let i = -14; i < 20; i++) { P.pat = i & 1 ? 1 : 0; P.line(200, 118, 200 + i * 26, PCH - 1, C[5], 2); }
    P.pat = 0; for (let k = 0; k < 5; k++) { const y = 122 + k * k * 3; P.line(0, y, PCW - 1, y, C[0], 1); }
    // холмы
    for (let x = 0; x < PCW; x++) { const hh = 6 + Math.round(5 * Math.sin(x * 0.045) + 4 * Math.sin(x * 0.11 + 1)); P.line(x, 118 - hh, x, 118, C[0], 1); }
    // домик
    P.rect(40, 96, 76, 118, C[10], true); P.pat = 0; for (let i = 0; i < 20; i++) P.line(36 + i, 96 - i * 0.9, 80 - i, 96 - i * 0.9, C[0], 1);
    P.rect(52, 104, 62, 112, C[3], true); P.line(57, 104, 57, 112, C[0]); P.line(52, 108, 62, 108, C[0]);
    // берёза
    P.rect(100, 70, 102, 118, C[1], true); for (let y = 74; y < 118; y += 7) P.line(100, y, 102, y, C[0]);
    P.pat = 1; P.ellipse(86, 52, 116, 86, C[12], true); P.pat = 0; P.ellipse(90, 58, 112, 80, C[13], false);
    // птицы
    for (const [bx, by] of [[40, 30], [58, 24], [70, 36], [230, 22]]) { P.line(bx - 4, by - 3, bx, by, C[0]); P.line(bx, by, bx + 4, by - 3, C[0]); }
  });
}
function makePicCat() {
  return pictureToURL(P => {
    const C = PAL32; P.pat = 0; P.rect(0, 0, PCW - 1, PCH - 1, C[8], true);
    P.pat = 2; P.rect(0, 0, PCW - 1, 150, C[9], true); P.pat = 0;
    for (let i = 0; i < 40; i++) { const x = (i * 97 + 13) % PCW, y = (i * 53 + 7) % 140; P.plot(x, y, C[1]); }
    P.ellipse(196, 22, 236, 62, C[3], true); P.ellipse(206, 26, 240, 58, C[8], true);
    // рама окна
    P.rect(0, 0, 12, PCH - 1, C[4], true); P.rect(PCW - 13, 0, PCW - 1, PCH - 1, C[4], true); P.rect(0, 0, PCW - 1, 10, C[4], true);
    P.rect(140, 0, 146, 150, C[4], true); P.rect(0, 150, PCW - 1, PCH - 1, C[5], true); P.pat = 3; P.rect(0, 152, PCW - 1, PCH - 1, C[4], true); P.pat = 0;
    // кот
    const K = C[0];
    P.ellipse(60, 96, 118, 152, K, true); P.ellipse(70, 64, 106, 100, K, true);
    for (let i = 0; i < 12; i++) { P.line(72 + i * 0.5, 72 - i, 78 + i * 0.1, 72, K, 2); P.line(104 - i * 0.5, 72 - i, 98 - i * 0.1, 72, K, 2); }
    P.line(114, 146, 132, 140, K, 4); P.line(132, 140, 136, 126, K, 4); P.line(136, 126, 130, 116, K, 3);
    P.rect(79, 80, 83, 83, C[13], true); P.rect(93, 80, 97, 83, C[13], true);
    // горшок с цветком
    P.rect(200, 128, 224, 150, C[10], true); P.line(212, 128, 212, 106, C[12], 2); P.ellipse(203, 96, 221, 110, C[11], true); P.ellipse(209, 100, 215, 106, C[3], true);
  });
}

/* ===================== ФАЙЛОВАЯ СИСТЕМА ===================== */
const FS_KEY = 'rassvet86-fs-v1', DISK_CAP = 720 * 1024;
const mkFile = (k, v) => ({ t: 'f', k, v, m: Date.now() });
const mkDir = (c = {}) => ({ t: 'd', c, m: Date.now() });
function defaultFS() {
  return mkDir({
    'readme.txt': mkFile('txt', README),
    'Документы': mkDir({ 'письмо в 2026.txt': mkFile('txt', LETTER), 'список дел.txt': mkFile('txt', TODO), 'стихи.txt': mkFile('txt', POEM) }),
    'Картинки': mkDir({ 'рассвет.pic': mkFile('pic', makePicDawn()), 'кот на окне.pic': mkFile('pic', makePicCat()) }),
    'Программы': mkDir({ 'Терминал.прг': mkFile('app', 'terminal'), 'Блокнот.прг': mkFile('app', 'notepad'), 'Холст.прг': mkFile('app', 'paint'),
      'Сапёр.прг': mkFile('app', 'mines'), 'Пианола.прг': mkFile('app', 'piano'), 'Панель управления.прг': mkFile('app', 'control') }),
    'Система': mkDir({ 'конфиг.сис': mkFile('txt', CONFIG) }),
    'Корзина': mkDir({}),
  });
}
let FS = store.get(FS_KEY, null);
if (!FS || FS.t !== 'd') { FS = defaultFS(); store.set(FS_KEY, FS); }
if (!FS.c['Корзина']) FS.c['Корзина'] = mkDir({});
const fsSubs = new Set();
let fsWarned = false;
function saveFS() {
  if (!store.set(FS_KEY, FS) && !fsWarned) { fsWarned = true; notify('Не удалось записать на диск: в браузере кончилось место.'); }
  fsSubs.forEach(f => { try { f(); } catch (e) { /* окно закрыто */ } });
}
const splitP = p => String(p).replace(/^а:/i, '').split(/[\\/]+/).filter(Boolean);
function resolveP(p, cwd = []) {
  const abs = /^(а:)?[\\/]/i.test(p) || /^а:$/i.test(p.trim());
  const parts = abs ? [] : cwd.slice();
  for (const s of splitP(p)) { if (s === '.') continue; if (s === '..') { parts.pop(); continue; } parts.push(s); }
  return parts;
}
function findKey(d, name) {
  if (!d || d.t !== 'd') return null;
  if (Object.prototype.hasOwnProperty.call(d.c, name)) return name;
  const l = name.toLowerCase().replace(/ё/g, 'е');
  for (const k in d.c) if (k.toLowerCase().replace(/ё/g, 'е') === l) return k;
  return null;
}
function realParts(parts) { let n = FS; const r = []; for (const p of parts) { const k = findKey(n, p); if (k == null) return null; r.push(k); n = n.c[k]; } return r; }
function getNode(parts) { const r = realParts(parts); if (!r) return null; let n = FS; for (const p of r) n = n.c[p]; return n; }
const pathStr = parts => 'А:\\' + parts.join('\\');
function fsPut(parts, node) {
  const par = getNode(parts.slice(0, -1)); if (!par || par.t !== 'd' || !parts.length) return false;
  const name = parts[parts.length - 1], k = findKey(par, name) || name; node.m = Date.now(); par.c[k] = node; saveFS(); return true;
}
function fsDel(parts) { const r = realParts(parts); if (!r || !r.length) return false; const par = getNode(r.slice(0, -1)); delete par.c[r[r.length - 1]]; saveFS(); return true; }
function nodeSize(n) { if (n.t === 'f') return n.k === 'app' ? 4096 : String(n.v || '').length; let s = 0; for (const k in n.c) s += nodeSize(n.c[k]); return s; }
function countFiles(n) { if (n.t === 'f') return 1; let s = 0; for (const k in n.c) s += countFiles(n.c[k]); return s; }
const fmtSize = b => b < 1024 ? `${fmtNum(b)} байт` : `${(b / 1024).toFixed(1).replace('.', ',')} КБ`;
const kindOf = name => /\.pic$/i.test(name) ? 'pic' : /\.прг$/i.test(name) ? 'app' : 'txt';
function iconFor(name, node) { if (node.t === 'd') return name === 'Корзина' ? 'trash' : 'folder'; if (node.k === 'pic') return 'picture'; if (node.k === 'app') return (APPS[node.v] || {}).icon || 'app'; return 'doc'; }
function uniqueName(dir, base, ext = '') { let n = base + ext, i = 2; while (findKey(dir, n) != null) n = `${base} (${i++})${ext}`; return n; }
function sortKeys(d) { return Object.keys(d.c).sort((a, b) => (d.c[b].t === 'd') - (d.c[a].t === 'd') || a.localeCompare(b, 'ru')); }
function allFiles(kind, n = FS, parts = [], out = []) {
  for (const k of sortKeys(n)) { const c = n.c[k]; if (c.t === 'd') { if (k !== 'Корзина') allFiles(kind, c, [...parts, k], out); } else if (c.k === kind) out.push([...parts, k]); }
  return out;
}
function allDirs(n = FS, parts = [], out = [[]]) { for (const k of sortKeys(n)) { const c = n.c[k]; if (c.t === 'd' && k !== 'Корзина') { out.push([...parts, k]); allDirs(c, [...parts, k], out); } } return out; }
function openPath(parts) {
  const r = realParts(parts); if (!r) return false; const n = getNode(r);
  if (n.t === 'd') { launch('disk', { path: r }); return true; }
  if (n.k === 'txt') { launch('notepad', { path: r }); return true; }
  if (n.k === 'pic') { launch('paint', { path: r }); return true; }
  if (n.k === 'app') { launch(n.v); return true; }
  return false;
}

/* ===================== ОБОИ ===================== */
const WP = {
  dawn: { skyTop: [40, 20, 38], skyMid: [112, 42, 52], skyLow: [232, 116, 56], sunA: [255, 224, 136], sunB: [226, 84, 40], hill: [58, 26, 36],
    g1: [84, 42, 32], g2: [116, 62, 36], line: [150, 86, 42], star: [255, 226, 190], patA: [224, 206, 168], patB: [206, 182, 138], patC: [217, 84, 42] },
  night: { skyTop: [8, 10, 24], skyMid: [20, 28, 62], skyLow: [58, 84, 150], sunA: [236, 240, 255], sunB: [140, 168, 236], hill: [12, 16, 34],
    g1: [16, 22, 44], g2: [26, 34, 66], line: [52, 70, 120], star: [220, 230, 255], patA: [30, 36, 56], patB: [40, 48, 74], patC: [127, 178, 255] },
  moss: { skyTop: [24, 38, 34], skyMid: [62, 90, 64], skyLow: [196, 204, 122], sunA: [252, 244, 176], sunB: [206, 160, 56], hill: [30, 50, 34],
    g1: [42, 64, 36], g2: [64, 92, 48], line: [104, 134, 64], star: [236, 246, 210], patA: [214, 222, 192], patB: [196, 208, 166], patC: [71, 122, 54] },
  chalk: { skyTop: [18, 18, 18], skyMid: [52, 52, 52], skyLow: [196, 196, 196], sunA: [255, 255, 255], sunB: [170, 170, 170], hill: [28, 28, 28],
    g1: [30, 30, 30], g2: [62, 62, 62], line: [120, 120, 120], star: [255, 255, 255], patA: [236, 236, 230], patB: [212, 210, 200], patC: [18, 18, 18] },
};
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const dth = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function dmix(a, b, t, th, steps = 5) { t = clamp(t, 0, 1) * steps; const i = Math.floor(t), f = t - i; const k = f > th ? i + 1 : i; return lerp3(a, b, Math.min(steps, k) / steps); }
function hash2(x, y) { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function putPx(d, w, x, y, c) { const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }

function wpDawn(d, w, h, P) {
  const hy = Math.round(h * 0.66), sx = Math.round(w * 0.66), sr = Math.round(Math.min(h * 0.34, w * 0.22)), sy = hy + Math.round(sr * 0.12);
  const per = Math.max(4, Math.round(sr * 0.14));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const th = dth(x, y); let c;
    if (y < hy) {
      const t = y / hy; c = t < 0.55 ? dmix(P.skyTop, P.skyMid, t / 0.55, th, 6) : dmix(P.skyMid, P.skyLow, (t - 0.55) / 0.45, th, 6);
      if (t < 0.5 && hash2(x, y) < 0.004) c = P.star;
      const dx = x - sx, dy = y - sy, dd = dx * dx + dy * dy;
      if (dd <= sr * sr) {
        const k = hy - y, rel = k / sr, gap = rel < 0.62 ? Math.round((0.62 - rel) * per * 1.25) : 0;
        if (k % per >= gap) c = dmix(P.sunA, P.sunB, (y - (sy - sr)) / (sr * 1.05), th, 5);
      } else if (dd <= (sr * 1.5) ** 2) { const a = 1 - (Math.sqrt(dd) - sr) / (sr * 0.5); if (th < a * 0.3) c = lerp3(c, P.sunA, 0.3); }
    } else {
      const dyy = y - hy + 1, u = (x - sx) / dyy, stripe = Math.floor(u * 3.2) & 1, depth = dyy / (h - hy);
      c = stripe ? P.g1 : P.g2;
      if (depth < 0.35 && th > depth / 0.35) c = lerp3(c, P.skyLow, 0.35);
      const row = Math.sqrt(dyy * 2.2) % 3; if (row < 0.35) c = P.line;
    }
    putPx(d, w, x, y, c);
  }
  for (let x = 0; x < w; x++) {
    const hh = Math.max(0, Math.round(h * 0.022 * (Math.sin(x * 0.041) * 1.3 + Math.sin(x * 0.013 + 1) * 1.8 + 2.2)));
    for (let y = hy - hh; y < hy; y++) putPx(d, w, x, y, P.hill);
  }
  for (const [bx, by] of [[0.2, 0.26], [0.24, 0.22], [0.27, 0.3], [0.8, 0.18]]) {
    const x0 = Math.round(w * bx), y0 = Math.round(h * by);
    for (const [ox, oy] of [[-2, -1], [-1, 0], [0, 0], [1, 0], [2, -1]]) if (x0 + ox >= 0 && x0 + ox < w) putPx(d, w, x0 + ox, y0 + oy, P.hill);
  }
}
function wpMountains(d, w, h, P) {
  const mx = Math.round(w * 0.24), my = Math.round(h * 0.26), mr = Math.round(h * 0.08);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const th = dth(x, y), t = y / h; let c = t < 0.6 ? dmix(P.skyTop, P.skyMid, t / 0.6, th, 6) : dmix(P.skyMid, P.skyLow, (t - 0.6) / 0.4, th, 6);
    if (hash2(x, y) < 0.003 && t < 0.5) c = P.star;
    const dd = (x - mx) ** 2 + (y - my) ** 2; if (dd < mr * mr) c = dmix(P.sunA, P.sunB, (y - my + mr) / (mr * 2.4), th, 3);
    putPx(d, w, x, y, c);
  }
  const layers = [[0.5, 0.2, 0.009, lerp3(P.skyLow, P.hill, 0.45)], [0.62, 0.16, 0.014, lerp3(P.skyMid, P.hill, 0.7)], [0.76, 0.12, 0.02, P.g1]];
  layers.forEach(([base, amp, fr, col], li) => {
    for (let x = 0; x < w; x++) {
      const r = h * (base - amp * (0.55 * Math.abs(Math.sin(x * fr + li * 2)) + 0.3 * Math.abs(Math.sin(x * fr * 2.7 + li)) + 0.15 * Math.sin(x * fr * 7)));
      for (let y = Math.max(0, Math.round(r)); y < h; y++) { let c = col; if (li === 0 && y < r + 3) c = P.sunA; else if (dth(x, y) < (y - r) / (h * 0.6) * 0.5) c = lerp3(col, [0, 0, 0], 0.25); putPx(d, w, x, y, c); }
    }
  });
}
function wpSpace(d, w, h, P) {
  const px = Math.round(w * 0.7), py = Math.round(h * 0.52), pr = Math.round(h * 0.2);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const th = dth(x, y); let c = dmix(P.skyTop, lerp3(P.skyTop, P.skyMid, 0.6), y / h, th, 4);
    const r = hash2(x, y); if (r < 0.006) c = r < 0.0015 ? P.sunA : P.star;
    const dx = x - px, dy = y - py, dd = dx * dx + dy * dy;
    if (dd < pr * pr) { const l = clamp((-dx - dy) / (pr * 1.4) + 0.55, 0, 1); c = dmix(P.hill, P.sunB, l, th, 5); if (Math.abs(((dy / pr) * 6 + Math.sin(dx / pr * 3)) % 2) < 0.35) c = lerp3(c, P.sunA, 0.18); }
    const rx = dx * Math.cos(-0.3) - dy * Math.sin(-0.3), ry = dx * Math.sin(-0.3) + dy * Math.cos(-0.3), e = (rx * rx) / (pr * pr * 3.6) + (ry * ry) / (pr * pr * 0.1);
    if (e > 0.78 && e < 1 && (ry > 0 || dd > pr * pr)) c = th < 0.7 ? P.sunA : P.line;
    putPx(d, w, x, y, c);
  }
  const mx = Math.round(w * 0.2), my = Math.round(h * 0.3), mr = Math.round(h * 0.04);
  for (let y = my - mr; y <= my + mr; y++) for (let x = mx - mr; x <= mx + mr; x++) if (x >= 0 && y >= 0 && x < w && y < h && (x - mx) ** 2 + (y - my) ** 2 <= mr * mr) putPx(d, w, x, y, dmix(P.sunA, P.line, (x - mx + mr) / (mr * 2), dth(x, y), 3));
}
function wpPattern(d, w, h, P) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tx = x % 12, ty = y % 12, m = Math.abs(tx - 6) + Math.abs(ty - 6);
    let c = (x + y) & 1 ? P.patA : lerp3(P.patA, P.patB, 0.5);
    if (m === 5 || m === 2) c = P.patB; if (m === 0) c = P.patC; if (tx === 0 && ty === 0) c = P.patC;
    putPx(d, w, x, y, c);
  }
}
const WALLS = { dawn: wpDawn, mountains: wpMountains, space: wpSpace, pattern: wpPattern };
function renderWall(canvas, w, h, key = settings.wall, theme = settings.theme) {
  canvas.width = w; canvas.height = h; const x = canvas.getContext('2d'), img = x.createImageData(w, h);
  (WALLS[key] || wpDawn)(img.data, w, h, WP[theme] || WP.dawn); x.putImageData(img, 0, 0);
}
function drawWall() { const c = $('#wall'), r = c.getBoundingClientRect(), S = 3; renderWall(c, Math.max(40, Math.ceil(r.width / S)), Math.max(30, Math.ceil(r.height / S))); }

/* ===================== ЗВУК ===================== */
let AC = null;
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; } } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function blip(f = 880, d = 0.04, type = 'square', vol = 0.03, delay = 0) {
  if (!settings.sounds || !AC) return; const a = AC, t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.02);
}
const sndOpen = () => { blip(660, 0.05); blip(990, 0.06, 'square', 0.03, 0.05); };
const sndClose = () => { blip(700, 0.05); blip(420, 0.07, 'square', 0.03, 0.05); };
const sndErr = () => blip(140, 0.18, 'sawtooth', 0.04);
function sndBoom() {
  if (!settings.sounds || !AC) return; const a = AC, t = a.currentTime, len = a.sampleRate * 0.6, buf = a.createBuffer(1, len, a.sampleRate), dd = buf.getChannelData(0);
  for (let i = 0; i < len; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = buf; f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0.5;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}

/* ===================== ОКОННЫЙ МЕНЕДЖЕР ===================== */
const deskEl = $('#desk'), winsEl = $('#wins');
let zTop = 100, activeWin = null;
const WINS = [];
const deskRect = () => deskEl.getBoundingClientRect();
class Win {
  constructor(o) {
    Object.assign(this, { app: o.app, title: o.title, iconName: o.icon, minW: o.minW || 240, minH: o.minH || 150, fixed: !!o.fixed, maxed: false, min: false });
    const e = this.el = h('div', { class: 'win anim' + (o.fixed ? ' fixed' : ''), role: 'dialog', 'aria-label': o.title });
    this.ttText = h('span', null, o.title);
    this.tt = h('div', { class: 'tt' }, ico(o.icon), this.ttText);
    const bClose = h('button', { class: 'wb', title: 'Закрыть', 'aria-label': 'Закрыть', html: SVG.x });
    const bMin = h('button', { class: 'wb', title: 'Свернуть', 'aria-label': 'Свернуть', html: SVG.min });
    const bMax = o.fixed ? null : h('button', { class: 'wb', title: 'Развернуть', 'aria-label': 'Развернуть', html: SVG.max });
    this.tb = h('div', { class: 'tb' }, bClose, h('div', { class: 'st' }), this.tt, h('div', { class: 'st' }), bMin, bMax);
    this.body = h('div', { class: 'wbody ' + (o.cls || '') });
    this.grip = h('div', { class: 'grip' });
    e.append(this.tb, this.body, this.grip);
    winsEl.append(e);
    bClose.addEventListener('click', () => this.close());
    bMin.addEventListener('click', () => this.minimize());
    if (bMax) bMax.addEventListener('click', () => this.toggleMax());
    this.tb.addEventListener('dblclick', ev => { if (!this.fixed && !ev.target.closest('.wb')) this.toggleMax(); });
    e.addEventListener('pointerdown', () => this.focus(), true);
    e.addEventListener('animationend', () => e.classList.remove('anim'));
    this.bindDrag(); if (!this.fixed) this.bindResize();
    const D = deskRect(); let w = o.w || 480, hh = o.h || 360, x = o.x, y = o.y;
    if (isMobile()) { w = D.width - 12; x = 6; y = o.my != null ? o.my : 6; hh = o.mh != null ? o.mh : D.height - 12 - (y - 6); }
    else {
      w = Math.min(w, D.width - 16); hh = Math.min(hh, D.height - 16);
      if (x == null) { const n = WINS.length; x = Math.round((D.width - w) / 2 + ((n * 28) % 168) - 84); y = Math.round((D.height - hh) / 3 + ((n * 28) % 168) - 40); }
    }
    this.setRect(clamp(x, 0, Math.max(0, D.width - w)), clamp(y, 0, Math.max(0, D.height - hh)), w, hh);
    if (this.fixed) { e.style.width = ''; e.style.height = ''; }
    WINS.push(this); this.focus(); renderTray();
  }
  setRect(x, y, w, hh) { Object.assign(this, { x, y, w, h: hh }); const s = this.el.style; s.left = x + 'px'; s.top = y + 'px'; if (!this.fixed) { s.width = w + 'px'; s.height = hh + 'px'; } }
  fitFixed(o) {
    const D = deskRect(), r = { width: this.el.offsetWidth, height: this.el.offsetHeight };
    let x = o.x, y = o.y; if (x == null || isMobile()) x = Math.round((D.width - r.width) / 2); if (y == null) y = Math.round((D.height - r.height) / 3); if (isMobile() && o.y == null) y = Math.round((D.height - r.height) / 2);
    this.x = clamp(x, 0, Math.max(0, D.width - r.width)); this.y = clamp(y, 0, Math.max(0, D.height - r.height)); this.w = r.width; this.h = r.height;
    this.el.style.left = this.x + 'px'; this.el.style.top = this.y + 'px';
  }
  setTitle(t) { this.title = t; this.ttText.textContent = t; this.el.setAttribute('aria-label', t); renderTray(); if (activeWin === this) updateMbTitle(); }
  focus() {
    if (activeWin === this && +this.el.style.zIndex === zTop) return;
    this.el.style.zIndex = ++zTop; activeWin = this;
    WINS.forEach(w => w.el.classList.toggle('active', w === this)); updateMbTitle(); renderTray(); if (this.onFocus) this.onFocus();
  }
  close() {
    if (this.onClose) this.onClose(); this.el.remove(); WINS.splice(WINS.indexOf(this), 1); sndClose();
    if (activeWin === this) { activeWin = null; const t = topWin(); if (t) t.focus(); else updateMbTitle(); }
    renderTray();
  }
  minimize() {
    const from = this.el.getBoundingClientRect(); this.min = true; this.el.hidden = true;
    if (activeWin === this) { activeWin = null; const t = topWin(); if (t) t.focus(); else updateMbTitle(); }
    renderTray(); const to = this.trayBtn && this.trayBtn.getBoundingClientRect(); if (to) zoomRects(from, to);
  }
  restore() { this.min = false; this.el.hidden = false; this.focus(); }
  toggleMax() {
    const D = deskRect();
    if (this.maxed) { this.maxed = false; this.setRect(...this.prev); } else { this.prev = [this.x, this.y, this.w, this.h]; this.maxed = true; this.setRect(0, 0, D.width, D.height); }
    if (this.onResize) this.onResize();
  }
  bindDrag() {
    let sx, sy, ox, oy, id = null;
    this.tb.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('.wb') || this.maxed || isMobile()) return;
      id = e.pointerId; this.tb.setPointerCapture(id); sx = e.clientX; sy = e.clientY; ox = this.x; oy = this.y;
    });
    this.tb.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return; const D = deskRect();
      this.setRect(clamp(ox + e.clientX - sx, -this.w + 90, D.width - 90), clamp(oy + e.clientY - sy, 0, D.height - 34), this.w, this.h);
    });
    const end = e => { if (e.pointerId === id) id = null; };
    this.tb.addEventListener('pointerup', end); this.tb.addEventListener('pointercancel', end);
  }
  bindResize() {
    let sx, sy, ow, oh, id = null; const g = this.grip;
    g.addEventListener('pointerdown', e => { e.stopPropagation(); id = e.pointerId; g.setPointerCapture(id); sx = e.clientX; sy = e.clientY; ow = this.w; oh = this.h; this.focus(); });
    g.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return; const D = deskRect(); this.maxed = false;
      this.setRect(this.x, this.y, clamp(ow + e.clientX - sx, this.minW, D.width - this.x), clamp(oh + e.clientY - sy, this.minH, D.height - this.y));
      if (this.onResize) this.onResize();
    });
    const end = e => { if (e.pointerId === id) id = null; };
    g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
  }
}
function topWin() { let best = null, z = -1; for (const w of WINS) { if (w.min) continue; const zz = +w.el.style.zIndex || 0; if (zz > z) { z = zz; best = w; } } return best; }
function zoomRects(from, to, cb) {
  if (reduceMotion || !from || !to) { if (cb) cb(); return; }
  const N = 6;
  for (let i = 1; i <= N; i++) {
    const t = i / N, r = { l: from.left + (to.left - from.left) * t, t: from.top + (to.top - from.top) * t, w: from.width + (to.width - from.width) * t, h: from.height + (to.height - from.height) * t };
    setTimeout(() => { const z = h('div', { class: 'zr' }); Object.assign(z.style, { left: r.l + 'px', top: r.t + 'px', width: r.w + 'px', height: r.h + 'px' }); document.body.append(z); setTimeout(() => z.remove(), 70); }, i * 20);
  }
  setTimeout(() => cb && cb(), N * 20 + 20);
}
function renderTray() {
  const t = $('#trayWins'); t.innerHTML = '';
  for (const w of WINS) {
    const b = h('button', { class: 'tw' + (w === activeWin ? ' active' : '') + (w.min ? ' min' : ''), title: w.title }, ico(w.iconName), h('span', null, w.title));
    b.addEventListener('click', () => { if (w.min) w.restore(); else if (w === activeWin) w.minimize(); else w.focus(); });
    w.trayBtn = b; t.append(b);
  }
  $('#trayMem').textContent = `ОЗУ ${212 + WINS.length * 23} КБ из 640 · диск ${Math.round(nodeSize(FS) / 1024)} из 720 КБ`;
}
function updateMbTitle() { $('#mbTitle').textContent = activeWin ? activeWin.title : 'Рабочий стол'; }
function cascade() { const D = deskRect(); WINS.filter(w => !w.min).forEach((w, i) => { if (w.maxed) w.toggleMax(); w.setRect(120 + i * 30, 12 + i * 30, Math.min(w.w, D.width - 140), Math.min(w.h, D.height - 30)); w.focus(); }); }

/* ===================== МЕНЮ ===================== */
let openMenu = null;
const MENUS = {
  sys: () => [{ l: 'О системе…', ico: 'sun', f: () => launch('about') }, { l: 'Панель управления…', ico: 'control', f: () => launch('control') }, '-',
    { l: 'Перезагрузить', f: reboot }, { l: 'Выключить…', f: shutdown }],
  apps: () => APP_ORDER.map(id => ({ l: APPS[id].title, ico: APPS[id].icon, f: () => launch(id) })),
  wins: () => {
    const a = WINS.map(w => ({ l: w.title, ico: w.iconName, k: w === activeWin ? 'активно' : w.min ? 'свёрнуто' : '', f: () => (w.min ? w.restore() : w.focus()) }));
    if (!a.length) a.push({ l: 'Нет открытых окон', dis: true });
    a.push('-', { l: 'Свернуть все', f: () => WINS.slice().forEach(w => w.min || w.minimize()) }, { l: 'Каскадом', f: cascade }, { l: 'Закрыть все', f: () => WINS.slice().forEach(w => w.close()) });
    return a;
  },
  help: () => [{ l: 'Прочитать readme.txt', ico: 'doc', f: () => openPath(['readme.txt']) }, { l: 'Команды терминала', ico: 'terminal', f: () => launch('terminal', { cmd: 'help' }) },
    { l: 'Мудрость дня', ico: 'terminal', f: () => launch('terminal', { cmd: 'мудрость' }) }, '-', { l: 'О системе…', ico: 'sun', f: () => launch('about') }],
  cal: () => 'calendar',
};
function buildMenu(items) {
  const m = h('div', { class: 'menu', role: 'menu' });
  if (items === 'calendar') { m.append(calendarEl()); return m; }
  for (const it of items) {
    if (it === '-') { m.append(h('div', { class: 'msep' })); continue; }
    const b = h('button', { class: 'mi' + (it.dis ? ' dis' : ''), role: 'menuitem' }, h('span', { class: 'l' }, it.ico ? ico(it.ico) : null, it.l), h('span', { class: 'k' }, it.k || ''));
    b.addEventListener('click', () => { closeMenu(); blip(1300, 0.02); if (it.f) it.f(); });
    m.append(b);
  }
  return m;
}
function showMenu(key, anchor) {
  closeMenu(); const m = buildMenu(MENUS[key]()); $('#menus').append(m);
  const r = anchor.getBoundingClientRect(); let left = key === 'cal' ? r.right - m.offsetWidth : r.left;
  m.style.left = clamp(left, 4, innerWidth - m.offsetWidth - 4) + 'px'; m.style.top = r.bottom + 'px';
  anchor.classList.add('open'); openMenu = { m, anchor };
}
function showCtx(items, x, y) { closeMenu(); const m = buildMenu(items); $('#menus').append(m); m.style.left = clamp(x, 4, innerWidth - m.offsetWidth - 4) + 'px'; m.style.top = clamp(y, 4, innerHeight - m.offsetHeight - 4) + 'px'; openMenu = { m, anchor: null }; }
function closeMenu() { if (!openMenu) return; openMenu.m.remove(); if (openMenu.anchor) openMenu.anchor.classList.remove('open'); openMenu = null; }
$$('#menubar [data-menu]').forEach(b => {
  b.addEventListener('click', e => { e.stopPropagation(); ac(); if (openMenu && openMenu.anchor === b) { closeMenu(); return; } showMenu(b.dataset.menu, b); blip(1300, 0.02); });
  b.addEventListener('pointerenter', () => { if (openMenu && openMenu.anchor && openMenu.anchor !== b) showMenu(b.dataset.menu, b); });
});
document.addEventListener('pointerdown', e => { if (openMenu && !e.target.closest('.menu') && !e.target.closest('#menubar [data-menu]')) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
function calendarEl() {
  const d = now86(), m = d.getMonth(), first = new Date(YEAR, m, 1), start = (first.getDay() + 6) % 7, days = new Date(YEAR, m + 1, 0).getDate();
  const t = h('table'), hr = h('tr'); ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].forEach(s => hr.append(h('th', null, s))); t.append(hr);
  let row = h('tr'); for (let i = 0; i < start; i++) row.append(h('td'));
  for (let day = 1; day <= days; day++) { if ((start + day - 1) % 7 === 0 && day > 1) { t.append(row); row = h('tr'); } row.append(h('td', { class: day === d.getDate() ? 't' : null }, day)); }
  t.append(row);
  return h('div', { class: 'cal' }, h('h3', null, `${MONF[m]} ${YEAR}`), t, h('div', { class: 'note' }, `${WDF[d.getDay()]}, ${d.getDate()} ${MONG[m]} ${YEAR} г.`), h('div', { class: 'note' }, 'Будущее ещё не наступило'));
}
function tickClock() { const d = now86(); $('#mbClock').textContent = `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${YEAR} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function updSoundIcon() { const b = $('#mbSound'); b.innerHTML = settings.sounds ? SVG.snd : SVG.mute; b.title = settings.sounds ? 'Звуки включены' : 'Звуки выключены'; }
$('#mbSound').addEventListener('click', () => { settings.sounds = !settings.sounds; saveSettings(); updSoundIcon(); ac(); blip(880, 0.05); });
$$('.ico[data-icon]').forEach(e => { e.style.backgroundImage = `url(${iconURL(e.dataset.icon)})`; });

/* ===================== РАБОЧИЙ СТОЛ ===================== */
const DESK_ICONS = [['disk', 'Диск А:'], ['terminal', 'Терминал'], ['notepad', 'Блокнот'], ['paint', 'Холст'], ['mines', 'Сапёр'], ['piano', 'Пианола'], ['control', 'Панель управления'], ['trash', 'Корзина']];
function buildIcons() {
  const box = $('#icons'); box.innerHTML = '';
  for (const [id, label] of DESK_ICONS) {
    const e = h('div', { class: 'dicon', tabindex: '0', role: 'button', 'aria-label': label }, ico(APPS[id].icon || id), h('span', { class: 'lbl' }, label));
    e.dataset.app = id;
    const open = () => { e.classList.remove('sel'); launch(id, {}, e.getBoundingClientRect()); };
    e.addEventListener('pointerdown', ev => { ev.stopPropagation(); $$('.dicon.sel').forEach(x => x.classList.remove('sel')); e.classList.add('sel'); ac(); if (ev.pointerType === 'touch') open(); });
    e.addEventListener('dblclick', open);
    e.addEventListener('keydown', ev => { if (ev.key === 'Enter') open(); });
    box.append(e);
  }
  layoutIcons();
}
function layoutIcons() {
  const D = deskRect(), items = $$('#icons .dicon');
  if (isMobile()) {
    const cols = 4, cw = (D.width - 8) / cols;
    items.forEach((e, i) => { e.style.left = Math.round(4 + (i % cols) * cw + (cw - 86) / 2) + 'px'; e.style.top = Math.round(8 + Math.floor(i / cols) * 90) + 'px'; });
    return;
  }
  const perCol = Math.max(1, Math.floor((D.height - 16) / 92));
  items.forEach((e, i) => {
    if (e.dataset.app === 'trash') { e.style.left = (D.width - 110) + 'px'; e.style.top = (D.height - 100) + 'px'; return; }
    e.style.left = (12 + Math.floor(i / perCol) * 104) + 'px'; e.style.top = (10 + (i % perCol) * 92) + 'px';
  });
}
deskEl.addEventListener('pointerdown', e => { if (!e.target.closest('.dicon')) $$('.dicon.sel').forEach(x => x.classList.remove('sel')); });
deskEl.addEventListener('contextmenu', e => {
  if (e.target.closest('.win')) return; e.preventDefault();
  showCtx([{ l: 'Новая папка', ico: 'folder', f: () => newRootItem('dir') }, { l: 'Новый документ', ico: 'doc', f: () => newRootItem('txt') }, '-',
    { l: 'Сменить обои', ico: 'picture', f: () => { const k = Object.keys(WALL_NAMES); settings.wall = k[(k.indexOf(settings.wall) + 1) % k.length]; saveSettings(); drawWall(); } },
    { l: 'Упорядочить значки', f: layoutIcons }, '-', { l: 'Панель управления…', ico: 'control', f: () => launch('control') }], e.clientX, e.clientY);
});
function newRootItem(kind) {
  const name = kind === 'dir' ? uniqueName(FS, 'Новая папка') : uniqueName(FS, 'новый', '.txt');
  fsPut([name], kind === 'dir' ? mkDir() : mkFile('txt', ''));
  if (kind === 'txt') launch('notepad', { path: [name] }); else launch('disk', { path: [], select: name });
}
function notify(text) {
  const w = launch('about', { note: text });
  return w;
}

/* ===================== ПРИЛОЖЕНИЯ: РЕЕСТР ===================== */
const APPS = {
  disk: { title: 'Диск А:', icon: 'disk', w: 620, h: 430, cls: 'disk', build: appDisk },
  terminal: { title: 'Терминал', icon: 'terminal', w: 640, h: 420, cls: 'term', build: appTerminal, minW: 320 },
  notepad: { title: 'Блокнот', icon: 'notepad', w: 580, h: 440, build: appNotepad, minW: 320 },
  paint: { title: 'Холст', icon: 'paint', w: 720, h: 540, cls: 'paint', build: appPaint, minW: 440, minH: 340 },
  mines: { title: 'Сапёр', icon: 'mines', fixed: true, cls: 'mines', build: appMines },
  piano: { title: 'Пианола', icon: 'piano', w: 700, h: 360, cls: 'piano', build: appPiano, minW: 440, minH: 290 },
  control: { title: 'Панель управления', icon: 'control', w: 560, h: 560, cls: 'ctl', build: appControl, single: true, minW: 360 },
  about: { title: 'О системе', icon: 'sun', fixed: true, cls: 'about', build: appAbout, single: true },
  trash: { alias: 'disk', icon: 'trash', arg: { path: ['Корзина'] } },
};
const APP_ORDER = ['disk', 'terminal', 'notepad', 'paint', 'mines', 'piano', 'control'];
function findApp(q) {
  q = q.toLowerCase().replace(/ё/g, 'е').replace(/\.прг$/, '').trim();
  const names = { disk: ['disk', 'диск'], terminal: ['terminal', 'терминал', 'cmd'], notepad: ['notepad', 'блокнот', 'edit'], paint: ['paint', 'холст'],
    mines: ['mines', 'сапер', 'minesweeper'], piano: ['piano', 'пианола'], control: ['control', 'панель', 'панель управления'], about: ['about', 'о системе'] };
  for (const [id, arr] of Object.entries(names)) if (arr.includes(q)) return id;
  return null;
}
function launch(id, arg = {}, from) {
  let A = APPS[id]; if (!A) return null;
  if (A.alias) { arg = Object.assign({}, A.arg, arg); id = A.alias; A = APPS[id]; }
  if (A.single) { const ex = WINS.find(w => w.app === id); if (ex) { if (ex.min) ex.restore(); else ex.focus(); if (ex.onArg) ex.onArg(arg); return ex; } }
  const w = new Win({ app: id, title: A.title, icon: A.icon, w: arg.w || A.w, h: arg.h || A.h, x: arg.x, y: arg.y, my: arg.my, mh: arg.mh, fixed: A.fixed, cls: A.cls, minW: A.minW, minH: A.minH });
  A.build(w, arg);
  if (A.fixed) w.fitFixed(arg);
  sndOpen();
  if (from) zoomRects(from, w.el.getBoundingClientRect());
  return w;
}
function btn(label, onClick, opts = {}) {
  const b = h('button', { class: 'btn' + (opts.cls ? ' ' + opts.cls : ''), title: opts.title || null, type: 'button' }, opts.icon ? ico(opts.icon) : null, label);
  b.addEventListener('click', onClick); return b;
}
function modal(w, build) {
  const m = h('div', { class: 'modal' }), dlg = h('div', { class: 'dlg', role: 'dialog' }); m.append(dlg); w.body.append(m);
  const close = () => m.remove(); build(dlg, close); m.addEventListener('pointerdown', e => { if (e.target === m) close(); });
  const f = dlg.querySelector('input,button'); if (f) setTimeout(() => f.focus(), 30);
  return close;
}

/* ===================== ТЕРМИНАЛ ===================== */
function tokenize(s) { const out = []; const re = /"([^"]*)"|«([^»]*)»|(\S+)/g; let m; while ((m = re.exec(s))) out.push(m[1] ?? m[2] ?? m[3]); return out; }
function wrapText(t, wid) { const lines = []; let cur = ''; for (const w of t.split(/\s+/)) { if ((cur + ' ' + w).trim().length > wid && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) lines.push(cur); return lines.length ? lines : ['']; }
function calcExpr(src) {
  const s = src.replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '').toLowerCase(); let i = 0;
  const num = () => { const m = /^\d*\.?\d+(e[+-]?\d+)?/.exec(s.slice(i)); if (!m) throw new Error('не понимаю выражение'); i += m[0].length; return parseFloat(m[0]); };
  function atom() {
    if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') throw new Error('не хватает скобки'); i++; return v; }
    if (s[i] === '-') { i++; return -atom(); } if (s[i] === '+') { i++; return atom(); }
    const f = /^(sqrt|корень|sin|cos|tan|ln|log|abs|pi|пи|e)/.exec(s.slice(i));
    if (f) { i += f[1].length; if (f[1] === 'pi' || f[1] === 'пи') return Math.PI; if (f[1] === 'e' && s[i] !== '(') return Math.E; const v = atom();
      return { sqrt: Math.sqrt, корень: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log10, abs: Math.abs, e: Math.exp }[f[1]](v); }
    return num();
  }
  const pow = () => { const b = atom(); if (s[i] === '^') { i++; return Math.pow(b, pow()); } return b; };
  function term() { let v = pow(); while (s[i] === '*' || s[i] === '/' || s[i] === '%') { const o = s[i++], r = pow(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
  function expr() { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++], r = term(); v = o === '+' ? v + r : v - r; } return v; }
  const v = expr(); if (i < s.length) throw new Error('лишние символы: ' + s.slice(i)); return v;
}
function appTerminal(w, arg) {
  const scr = h('div', { class: 'tscr' }), out = h('div'), pr = h('span'), tx = h('span'), cur = h('span', { class: 'tcur' }, ' ');
  const inl = h('div', { class: 'tin' }, pr, tx, cur); scr.append(out, inl);
  const cap = h('textarea', { class: 'tcap', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Командная строка' });
  w.body.append(scr, cap); w.body.classList.add('blur');
  let cwd = [], buf = ''; const hist = store.get('rassvet86-hist', []); let hi = hist.length;
  const P = () => `${pathStr(cwd)}>`;
  const render = () => { pr.textContent = P() + ' '; tx.textContent = buf; scr.scrollTop = scr.scrollHeight; };
  const line = (s = '', cls) => { const d = h('div', { class: 'tl' + (cls ? ' ' + cls : '') }); d.textContent = s; out.append(d); return d; };
  const html = s => { const d = h('div', { class: 'tl' }); d.innerHTML = s; out.append(d); };
  const focusCap = () => cap.focus({ preventScroll: true });
  w.onFocus = () => { if (!isMobile()) setTimeout(focusCap, 0); };
  w.body.addEventListener('pointerup', () => { if (!String(window.getSelection())) focusCap(); });
  cap.addEventListener('focus', () => w.body.classList.remove('blur'));
  cap.addEventListener('blur', () => w.body.classList.add('blur'));

  const CMDS = {
    help: { a: ['помощь', '?'], d: 'список команд', f: (a, say) => {
      say('Команды «Рассвета» (регистр не важен, в скобках — синонимы):', 'h');
      for (const [k, c] of Object.entries(CMDS)) say(`  ${(k + (c.a && c.a.length ? ' (' + c.a.slice(0, 2).join(', ') + ')' : '')).padEnd(24)} ${c.d}`);
      say(''); say('Путь «..» — на уровень выше. Tab дополняет имена, ↑ ↓ — история, Ctrl+L — очистить.', 'd');
    } },
    dir: { a: ['ls'], d: 'содержимое папки', f: (a, say) => {
      const parts = a.length ? resolveP(a.join(' '), cwd) : cwd, r = realParts(parts), n = r && getNode(r);
      if (!n) return say('Нет такой папки.', 'o');
      if (n.t !== 'd') return say(`${r[r.length - 1]} — ${fmtSize(nodeSize(n))}`);
      say(' Том в дисководе А — РАССВЕТ', 'd'); say(` Содержимое папки ${pathStr(r)}`, 'd'); say('');
      let files = 0, bytes = 0; const keys = sortKeys(n);
      for (const k of keys) {
        const c = n.c[k], dt = new Date(c.m || Date.now()), ds = `${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}.86`;
        if (c.t === 'd') say(`  ${k.padEnd(26)} <ПАПКА>     ${ds}`, 'a');
        else { files++; const sz = nodeSize(c); bytes += sz; say(`  ${k.padEnd(26)} ${fmtNum(sz).padStart(9)}   ${ds}`); }
      }
      if (!keys.length) say('  (пусто)', 'd');
      say(''); say(`  ${files} ${plural(files, 'файл', 'файла', 'файлов')}, ${fmtNum(bytes)} байт`, 'd');
      say(`  ${Math.max(0, Math.round((DISK_CAP - nodeSize(FS)) / 1024))} КБ свободно`, 'd');
    } },
    cd: { a: ['chdir'], d: 'перейти в папку', f: (a, say) => {
      if (!a.length) return say(pathStr(cwd));
      const r = realParts(resolveP(a.join(' '), cwd)), n = r && getNode(r);
      if (!n || n.t !== 'd') return say('Нет такой папки.', 'o'); cwd = r;
    } },
    type: { a: ['cat'], d: 'показать текстовый файл', f: (a, say) => {
      if (!a.length) return say('Какой файл показать?', 'o');
      const r = realParts(resolveP(a.join(' '), cwd)), n = r && getNode(r);
      if (!n) return say('Нет такого файла.', 'o'); if (n.t === 'd') return say('Это папка. Наберите dir.', 'o');
      if (n.k !== 'txt') return say(`Это ${n.k === 'pic' ? 'картинка' : 'программа'}. Откройте её командой open.`, 'o');
      String(n.v).split('\n').forEach(l => say(l));
    } },
    echo: { d: 'вывести текст; echo текст > файл.txt', f: (a, say) => say(a.join(' ')) },
    md: { a: ['mkdir'], d: 'создать папку', f: (a, say) => {
      if (!a.length) return say('Укажите имя папки.', 'o'); const p = resolveP(a.join(' '), cwd);
      if (getNode(p)) return say('Такое имя уже занято.', 'o'); if (!fsPut(p, mkDir())) say('Нет родительской папки.', 'o');
    } },
    del: { a: ['rm', 'erase'], d: 'удалить файл или папку', f: (a, say) => {
      if (!a.length) return say('Что удалить?', 'o'); const r = realParts(resolveP(a.join(' '), cwd));
      if (!r || !r.length) return say('Нет такого файла.', 'o'); fsDel(r); say(`Удалено: ${pathStr(r)}`, 'd');
    } },
    ren: { a: ['mv', 'move'], d: 'переименовать или переместить', f: (a, say) => {
      if (a.length < 2) return say('Формат: ren старое новое (имена с пробелами — в кавычках)', 'o');
      const r = realParts(resolveP(a[0], cwd)); if (!r || !r.length) return say('Нет такого файла.', 'o');
      let to = resolveP(a[1], cwd); const tn = getNode(to); if (tn && tn.t === 'd') to = [...realParts(to), r[r.length - 1]];
      if (to.join('\\').toLowerCase().startsWith(r.join('\\').toLowerCase() + '\\')) return say('Нельзя переместить папку внутрь себя.', 'o');
      const node = getNode(r); if (!fsPut(to, node)) return say('Нет папки назначения.', 'o');
      if (realParts(to).join('\\') !== r.join('\\')) fsDel(r);
    } },
    copy: { a: ['cp'], d: 'скопировать файл', f: (a, say) => {
      if (a.length < 2) return say('Формат: copy откуда куда', 'o'); const r = realParts(resolveP(a[0], cwd)); if (!r) return say('Нет такого файла.', 'o');
      let to = resolveP(a[1], cwd); const tn = getNode(to); if (tn && tn.t === 'd') to = [...realParts(to), r[r.length - 1]];
      if (!fsPut(to, JSON.parse(JSON.stringify(getNode(r))))) return say('Нет папки назначения.', 'o'); say('Скопирован 1 файл.', 'd');
    } },
    open: { a: ['start', 'запуск'], d: 'открыть файл или программу', f: (a, say) => {
      const q = a.join(' '); if (!q) return say('Что открыть?', 'o'); const app = findApp(q);
      if (app) { launch(app); return say(`Запускаю: ${APPS[app].title}`, 'd'); }
      if (!openPath(resolveP(q, cwd))) say('Нечего открыть по этому пути.', 'o');
    } },
    tree: { d: 'дерево папок', f: (a, say) => {
      const walk = (n, pre) => { const ks = sortKeys(n); ks.forEach((k, i) => { const last = i === ks.length - 1, c = n.c[k]; say(`${pre}${last ? '`-- ' : '|-- '}${k}${c.t === 'd' ? '\\' : ''}`, c.t === 'd' ? 'a' : null); if (c.t === 'd') walk(c, pre + (last ? '    ' : '|   ')); }); };
      say(pathStr(cwd)); walk(getNode(cwd) || FS, '');
    } },
    cls: { a: ['clear'], d: 'очистить экран', f: () => { out.innerHTML = ''; } },
    date: { a: ['time'], d: 'дата и время', f: (a, say) => { const d = now86(); say(`Сегодня ${WDF[d.getDay()]}, ${d.getDate()} ${MONG[d.getMonth()]} ${YEAR} г., ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`); } },
    ver: { a: ['uname'], d: 'версия системы', f: (a, say) => say('Рассвет-86, версия 2.3 (сборка 23.09.86), командный процессор КП-2.3') },
    sysinfo: { a: ['рассвет', 'neofetch'], d: 'сведения о машине', f: (a, say) => sysinfo(say) },
    calc: { a: ['счёт', 'счет'], d: 'калькулятор: calc 2*(3+4)^2', f: (a, say) => {
      if (!a.length) return say('Например: calc sqrt(2)*100', 'o'); const v = calcExpr(a.join(''));
      say(`= ${Number.isFinite(v) ? String(+v.toPrecision(12)).replace('.', ',') : 'бесконечность'}`, 'h');
    } },
    кот: { a: ['cowsay'], d: 'кот скажет что угодно', f: (a, say) => {
      const lines = wrapText(a.join(' ') || 'Мяу. Сохраняйтесь чаще.', 30), m = Math.max(...lines.map(l => l.length));
      say(' ' + '_'.repeat(m + 2));
      lines.forEach((l, i) => { const n = lines.length; const L = n === 1 ? '<' : i === 0 ? '/' : i === n - 1 ? '\\' : '|', R = n === 1 ? '>' : i === 0 ? '\\' : i === n - 1 ? '/' : '|'; say(`${L} ${l.padEnd(m)} ${R}`); });
      say(' ' + '-'.repeat(m + 2)); say('    \\    /\\_/\\'); say('     \\  ( o.o )'); say('         > ^ <', 'a');
    } },
    мудрость: { a: ['fortune'], d: 'случайная мудрость', f: (a, say) => say(`«${FORTUNES[Math.floor(Math.random() * FORTUNES.length)]}»`, 'h') },
    theme: { a: ['тема'], d: 'тема: рассвет, полночь, мох, мел', f: (a, say) => {
      const map = { рассвет: 'dawn', полночь: 'night', мох: 'moss', мел: 'chalk', dawn: 'dawn', night: 'night', moss: 'moss', chalk: 'chalk' }, t = map[(a[0] || '').toLowerCase()];
      if (!t) return say('Темы: рассвет, полночь, мох, мел.', 'o'); applyTheme(t); say(`Тема «${THEME_NAMES[t]}» включена.`, 'd');
    } },
    cal: { a: ['календарь'], d: 'календарь месяца', f: (a, say) => {
      const d = now86(), m = d.getMonth(), start = (new Date(YEAR, m, 1).getDay() + 6) % 7, days = new Date(YEAR, m + 1, 0).getDate();
      say(`      ${MONF[m]} ${YEAR}`, 'h'); say(' пн вт ср чт пт сб вс', 'd');
      let row = '   '.repeat(start);
      for (let day = 1; day <= days; day++) { row += String(day).padStart(3); if ((start + day) % 7 === 0 || day === days) { say(row, day >= d.getDate() && d.getDate() > day - 7 ? 'a' : null); row = ''; } }
    } },
    find: { a: ['поиск'], d: 'найти файлы по части имени', f: (a, say) => {
      const q = a.join(' ').toLowerCase(); if (!q) return say('Что искать? Например: find кот', 'o'); let n = 0;
      const walk = (node, parts) => { for (const k of sortKeys(node)) { const c = node.c[k], p = [...parts, k]; if (k.toLowerCase().includes(q)) { say(pathStr(p) + (c.t === 'd' ? '\\' : ''), c.t === 'd' ? 'a' : null); n++; } if (c.t === 'd') walk(c, p); } };
      walk(FS, []); say(`Найдено: ${n}`, 'd');
    } },
    wc: { d: 'строки, слова и знаки в файле', f: (a, say) => {
      const r = realParts(resolveP(a.join(' '), cwd)), n = r && getNode(r);
      if (!n || n.t !== 'f' || n.k !== 'txt') return say('Нужен текстовый файл.', 'o');
      const v = String(n.v), l = v.split('\n').length, wds = (v.match(/\S+/g) || []).length;
      say(`${l} ${plural(l, 'строка', 'строки', 'строк')}, ${wds} ${plural(wds, 'слово', 'слова', 'слов')}, ${fmtNum(v.length)} ${plural(v.length, 'знак', 'знака', 'знаков')}`);
    } },
    history: { d: 'история команд', f: (a, say) => hist.slice(-20).forEach((c, i) => say(`${String(Math.max(0, hist.length - 20) + i + 1).padStart(4)}  ${c}`)) },
    whoami: { d: 'кто вы', f: (a, say) => say('гость — пользователь без пароля. В 1986 году пароли ещё были роскошью.') },
    reboot: { a: ['перезагрузка'], d: 'перезагрузить машину', f: () => setTimeout(reboot, 300) },
    exit: { a: ['выход'], d: 'закрыть терминал', f: () => setTimeout(() => w.close(), 60) },
  };
  function findCmd(name) { if (CMDS[name]) return CMDS[name]; for (const c of Object.values(CMDS)) if (c.a && c.a.includes(name)) return c; return null; }
  function sysinfo(say) {
    if (say !== sayDirect) return say('Сведения выводятся только на экран.');
    const logo = [
      ['              |', 'a'], ['        \\     |     /', 'a'], ['          .-"""""-.', 'a'], ['   ---- .\'         \'. ----', 'a'], ['       /             \\', 'a'],
      [' =====|===============|=====', 'o'], ['   =======================', 'o'], ['      =================', 'o'], ['         ===========', 'd'], ['', ''], ['', ''], ['', '']];
    const d = now86(), used = Math.round(nodeSize(FS) / 1024);
    const info = [['гость@рассвет-86', 'h'], ['-'.repeat(16), 'd'], ['ОС:        Рассвет-86, версия 2.3'], ['Процессор: К1810ВМ86, 4,77 МГц'], [`Память:    640 КБ, занято ${212 + WINS.length * 23} КБ`],
      [`Диск А:    ${countFiles(FS)} ${plural(countFiles(FS), 'файл', 'файла', 'файлов')}, ${used} из 720 КБ`], [`Экран:     ${innerWidth}×${innerHeight}, 16 цветов`],
      [`Время:     ${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${YEAR}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`], [`Работает:  ${uptime()}`],
      [`Окон:      ${WINS.length}`], [`Тема:      ${THEME_NAMES[settings.theme]}`], ['__sw']];
    for (let i = 0; i < logo.length; i++) {
      const [lt, lc] = logo[i], [it, ic] = info[i] || [''];
      let right = it === '__sw' ? PPAL.slice(0, 8).map(c => `<span style="background:${c}">   </span>`).join('') : `<span class="${ic || ''}">${esc(it)}</span>`;
      if (it && it.includes(':') && !ic) { const k = it.indexOf(':'); right = `<span class="a">${esc(it.slice(0, k + 1))}</span>${esc(it.slice(k + 1))}`; }
      html(`<span class="${lc}">${esc(lt.padEnd(31))}</span>${right}`);
    }
  }
  const sayDirect = (t, c) => line(t, c);
  function exec(raw) {
    let s = raw.trim(); if (!s) return;
    let redirect = null, append = false;
    const m = /^(.*?)\s*(>>?)\s*([^>]+)$/.exec(s);
    if (m && m[1].trim() && !/^calc|^счёт|^счет/i.test(m[1].trim())) { s = m[1].trim(); append = m[2] === '>>'; redirect = m[3].trim(); }
    const args = tokenize(s), name = (args.shift() || '').toLowerCase(), C = findCmd(name);
    if (!C) { line(`«${name}» — нет такой команды. Наберите help.`, 'o'); sndErr(); return; }
    const collected = [], say = redirect ? t => collected.push(t) : sayDirect;
    try { C.f(args, say); } catch (err) { line('Ошибка: ' + (err.message || err), 'o'); sndErr(); return; }
    if (redirect) {
      const p = resolveP(redirect, cwd), n = getNode(p);
      if (n && n.t === 'd') return line('Это папка, а не файл.', 'o');
      const prev = append && n && n.k === 'txt' ? n.v + '\n' : '';
      if (fsPut(p, mkFile(kindOf(p[p.length - 1]), prev + collected.join('\n')))) line(`Записано: ${pathStr(realParts(p) || p)}`, 'd'); else line('Нет такой папки.', 'o');
    }
  }
  function complete() {
    const tokens = buf.split(' ');
    if (tokens.length === 1) {
      const all = Object.keys(CMDS).concat(...Object.values(CMDS).map(c => c.a || [])), ms = all.filter(k => k.startsWith(buf.toLowerCase()));
      if (ms.length === 1) buf = ms[0] + ' '; else if (ms.length > 1) line(ms.join('   '), 'd');
    } else {
      const partial = tokens.slice(1).join(' '), dirParts = resolveP(partial.replace(/[^\\/]*$/, '') || '.', cwd), n = getNode(dirParts), stem = partial.replace(/^.*[\\/]/, '').toLowerCase();
      if (n && n.t === 'd') {
        const ms = Object.keys(n.c).filter(k => k.toLowerCase().startsWith(stem));
        if (ms.length === 1) { const pre = partial.slice(0, partial.length - stem.length); buf = tokens[0] + ' ' + pre + ms[0] + (n.c[ms[0]].t === 'd' ? '\\' : ''); }
        else if (ms.length > 1) { line(ms.join('   '), 'd'); let common = ms[0]; for (const k of ms) while (!k.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1); if (common.length > stem.length) buf = tokens[0] + ' ' + partial.slice(0, partial.length - stem.length) + common; }
      }
    }
    render();
  }
  cap.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const cmd = buf; line(P() + ' ' + cmd, 'echo'); buf = ''; if (cmd.trim()) { hist.push(cmd); if (hist.length > 60) hist.splice(0, hist.length - 60); store.set('rassvet86-hist', hist); } hi = hist.length; exec(cmd); render(); blip(1600, 0.012, 'square', 0.015); return; }
    if (e.key === 'Backspace') { e.preventDefault(); buf = buf.slice(0, -1); render(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) { hi--; buf = hist[hi] || ''; } render(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); if (hi < hist.length - 1) { hi++; buf = hist[hi]; } else { hi = hist.length; buf = ''; } render(); return; }
    if (e.key === 'Tab') { e.preventDefault(); complete(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') { e.preventDefault(); out.innerHTML = ''; render(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !String(window.getSelection())) { e.preventDefault(); line(P() + ' ' + buf + '^C', 'echo'); buf = ''; render(); }
  });
  cap.addEventListener('input', () => { const v = cap.value.replace(/\r?\n/g, ''); if (v) buf += v; cap.value = ''; render(); });
  line('Рассвет-86 · командный процессор КП-2.3', 'h'); line('Наберите help — список команд, мудрость — совет на день.', 'd'); line('');
  if (arg.cmd) { line(P() + ' ' + arg.cmd, 'echo'); exec(arg.cmd); }
  render();
}

/* ===================== БЛОКНОТ ===================== */
function appNotepad(w, arg) {
  let path = null, dirty = false;
  const ta = h('textarea', { class: 'pad', spellcheck: 'false', 'aria-label': 'Текст документа' });
  const sPos = h('span'), sWords = h('span'), sFile = h('span', { style: 'margin-left:auto' });
  const status = h('div', { class: 'status' }, sPos, sWords, sFile);
  const bar = h('div', { class: 'toolbar' },
    btn('Новый', () => launch('notepad', {}), { icon: 'notepad' }), btn('Открыть…', openDlg, { icon: 'folder' }), btn('Сохранить', save, { icon: 'disk', title: 'Ctrl+S' }),
    btn('Как…', saveAs, { title: 'Сохранить как' }), h('span', { class: 'sp' }));
  w.body.append(bar, ta, status);
  function updTitle() { const name = path ? path[path.length - 1] : 'Без имени'; w.setTitle(`${name}${dirty ? ' •' : ''} — Блокнот`); sFile.textContent = path ? pathStr(path) : 'не сохранён'; }
  function updStatus() {
    const v = ta.value, p = ta.selectionStart || 0, before = v.slice(0, p), ln = before.split('\n').length, col = p - before.lastIndexOf('\n'), words = (v.match(/\S+/g) || []).length;
    sPos.textContent = `стр. ${ln}, симв. ${col}`; sWords.textContent = `${words} ${plural(words, 'слово', 'слова', 'слов')} · ${fmtNum(v.length)} ${plural(v.length, 'знак', 'знака', 'знаков')}`;
  }
  function load(p) { const r = realParts(p), n = r && getNode(r); if (n && n.t === 'f' && n.k === 'txt') { path = r; ta.value = n.v; dirty = false; ta.scrollTop = 0; updTitle(); updStatus(); } }
  function save() { if (!path) return saveAs(); fsPut(path, mkFile('txt', ta.value)); dirty = false; updTitle(); sFile.textContent = 'сохранено: ' + pathStr(path); blip(1046, 0.05, 'triangle', 0.05); }
  function saveAs() {
    modal(w, (dlg, close) => {
      const name = h('input', { class: 'field', value: path ? path[path.length - 1] : 'новый.txt', 'aria-label': 'Имя файла' });
      const sel = h('select', { class: 'field', 'aria-label': 'Папка' }); allDirs().forEach(p => sel.append(h('option', { value: p.join('\\') }, pathStr(p))));
      sel.value = path ? path.slice(0, -1).join('\\') : 'Документы';
      const ok = () => { let n = name.value.trim(); if (!n) return; if (!/\.[^.]+$/.test(n)) n += '.txt'; path = [...splitP(sel.value), n]; close(); save(); };
      name.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      dlg.append(h('h2', null, ico('disk'), 'Сохранить как'), name, sel, h('div', { class: 'row' }, btn('Отмена', close), btn('Сохранить', ok, { cls: 'pri' })));
    });
  }
  function openDlg() {
    modal(w, (dlg, close) => {
      const list = h('div', { class: 'list' }); const files = allFiles('txt');
      files.forEach(p => { const b = h('button', null, ico('doc'), pathStr(p)); b.addEventListener('click', () => { close(); load(p); }); list.append(b); });
      if (!files.length) list.append(h('p', { style: 'padding:10px' }, 'Текстовых файлов нет.'));
      dlg.append(h('h2', null, ico('folder'), 'Открыть документ'), list, h('div', { class: 'row' }, btn('Отмена', close)));
    });
  }
  ta.addEventListener('input', () => { if (!dirty) { dirty = true; updTitle(); } updStatus(); });
  ['keyup', 'click', 'select'].forEach(ev => ta.addEventListener(ev, updStatus));
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('    ', s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
  });
  w.onClose = () => { if (dirty && path) fsPut(path, mkFile('txt', ta.value)); };
  w.onFocus = () => { if (!isMobile()) setTimeout(() => ta.focus({ preventScroll: true }), 0); };
  if (arg.path) load(arg.path); else { updTitle(); updStatus(); }
}

/* ===================== ХОЛСТ ===================== */
function appPaint(w, arg) {
  const cv = h('canvas', { width: PCW, height: PCH, 'aria-label': 'Холст для рисования' }), ov = h('canvas', { class: 'ov', width: PCW, height: PCH });
  const ctx = cv.getContext('2d'), octx = ov.getContext('2d');
  let img = ctx.createImageData(PCW, PCH), px = new Uint32Array(img.data.buffer), P = makePainter(PCW, PCH, px);
  let tool = 'pencil', size = 2, fillShapes = false, c1 = 0, c2 = 1, path = null, dirty = false, scale = 2;
  const undo = [];
  const put = () => ctx.putImageData(img, 0, 0);
  function setBuffer(newImg) { img = newImg; px = new Uint32Array(img.data.buffer); P = makePainter(PCW, PCH, px); P.pat = patIdx; }
  let patIdx = 0;
  function clearTo(ci) { px.fill(PAL32[ci]); put(); }
  // --- панель инструментов
  const TOOLS = [['pencil', 'Карандаш'], ['brush', 'Кисть'], ['spray', 'Распылитель'], ['eraser', 'Ластик'], ['fill', 'Заливка'], ['picker', 'Пипетка'], ['line', 'Линия'], ['rect', 'Прямоугольник'], ['ellipse', 'Овал']];
  const toolsEl = h('div', { class: 'pt-tools' });
  const toolBtns = {};
  TOOLS.forEach(([id, t]) => { const b = h('button', { title: t, 'aria-label': t }, ico(id)); b.addEventListener('click', () => setTool(id)); toolBtns[id] = b; toolsEl.append(b); });
  const szEl = h('div', { class: 'sz' }), szBtns = {};
  [1, 2, 4, 8].forEach(s => { const b = h('button', { title: `Размер ${s}` }, s); b.addEventListener('click', () => { size = s; Object.values(szBtns).forEach(x => x.classList.toggle('on', x === b)); }); szBtns[s] = b; szEl.append(b); });
  const fchk = h('button', { class: 'chk', html: SVG.check, 'aria-label': 'Заливать фигуры' }); fchk.addEventListener('click', () => { fillShapes = !fillShapes; fchk.classList.toggle('on', fillShapes); });
  toolsEl.append(szEl, h('div', { class: 'fillsh' }, fchk, 'залить'));
  function setTool(id) { tool = id; Object.entries(toolBtns).forEach(([k, b]) => b.classList.toggle('on', k === id)); cv.style.cursor = id === 'fill' || id === 'picker' ? 'copy' : 'crosshair'; }
  // --- палитра и узоры
  const cur1 = h('i'), cur2 = h('i'), curEl = h('div', { class: 'pt-cur', title: 'Основной и второй цвет' }, cur1, cur2);
  const sw = h('div', { class: 'pt-sw' });
  PPAL.forEach((c, i) => { const b = h('button', { title: `Цвет ${i + 1} — ЛКМ основной, ПКМ второй`, 'aria-label': `Цвет ${i + 1}`, style: `background:${c}` });
    b.addEventListener('click', () => { c1 = i; updCur(); }); b.addEventListener('contextmenu', e => { e.preventDefault(); c2 = i; updCur(); }); sw.append(b); });
  function updCur() { cur1.style.background = PPAL[c1]; cur2.style.background = PPAL[c2]; }
  const pats = h('div', { class: 'pt-pats' }), patBtns = [];
  PATS.forEach((p, i) => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 8; const x = c.getContext('2d'); x.fillStyle = '#2b1d14';
    for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 8; xx++) if ((p[yy] >> (7 - xx)) & 1) x.fillRect(xx, yy, 1, 1);
    const b = h('button', { title: `Узор ${i + 1}`, 'aria-label': `Узор ${i + 1}`, style: `background-image:url(${c.toDataURL()});background-size:16px 16px;image-rendering:pixelated` });
    b.addEventListener('click', () => { patIdx = i; P.pat = i; patBtns.forEach(x => x.classList.toggle('on', x === b)); }); patBtns.push(b); pats.append(b);
  });
  const palEl = h('div', { class: 'pt-pal' }, curEl, sw, pats);
  // --- верхняя панель
  const bar = h('div', { class: 'toolbar' },
    btn('Новый', () => { pushUndo(); clearTo(1); path = null; dirty = false; updTitle(); }, { icon: 'paint' }), btn('Открыть…', openDlg, { icon: 'folder' }),
    btn('Сохранить', save, { icon: 'disk' }), btn('Отменить', doUndo, { title: 'Ctrl+Z' }), h('span', { class: 'sp' }));
  const wrap = h('div', { class: 'pt-wrap' }, cv, ov), area = h('div', { class: 'pt-area' }, wrap);
  const coords = h('span'), stFile = h('span', { style: 'margin-left:auto' });
  const main = h('div', { class: 'pt-main' }, bar, area, palEl, h('div', { class: 'status' }, coords, h('span', null, `${PCW}×${PCH}, 16 цветов`), stFile));
  w.body.append(toolsEl, main);
  function fit() {
    const r = area.getBoundingClientRect(); if (!r.width) return;
    const fitS = Math.min((r.width - 20) / PCW, (r.height - 20) / PCH);
    scale = fitS >= 1 ? Math.max(1, Math.min(4, Math.floor(fitS + 0.12))) : fitS;
    [cv, ov].forEach(c => { c.style.width = PCW * scale + 'px'; c.style.height = PCH * scale + 'px'; });
  }
  w.onResize = fit; new ResizeObserver(fit).observe(area);
  function pushUndo() { undo.push(new Uint32Array(px)); if (undo.length > 16) undo.shift(); }
  function doUndo() { const u = undo.pop(); if (!u) return; px.set(u); put(); }
  function updTitle() { const name = path ? path[path.length - 1] : 'Без имени'; w.setTitle(`${name}${dirty ? ' •' : ''} — Холст`); stFile.textContent = path ? pathStr(path) : ''; }
  function save() {
    if (!path) {
      return modal(w, (dlg, close) => {
        const name = h('input', { class: 'field', value: 'картинка.pic', 'aria-label': 'Имя файла' });
        const ok = () => { let n = name.value.trim(); if (!n) return; if (!/\.pic$/i.test(n)) n += '.pic'; path = ['Картинки', n]; close(); save(); };
        name.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
        dlg.append(h('h2', null, ico('picture'), 'Сохранить в «Картинки»'), name, h('div', { class: 'row' }, btn('Отмена', close), btn('Сохранить', ok, { cls: 'pri' })));
      });
    }
    fsPut(path, mkFile('pic', cv.toDataURL('image/png'))); dirty = false; updTitle(); stFile.textContent = 'сохранено: ' + pathStr(path); blip(1046, 0.05, 'triangle', 0.05);
  }
  function load(p) {
    const r = realParts(p), n = r && getNode(r); if (!n || n.k !== 'pic') return;
    const im = new Image(); im.onload = () => { ctx.clearRect(0, 0, PCW, PCH); ctx.drawImage(im, 0, 0, PCW, PCH); setBuffer(ctx.getImageData(0, 0, PCW, PCH)); path = r; dirty = false; updTitle(); }; im.src = n.v;
  }
  function openDlg() {
    modal(w, (dlg, close) => {
      const list = h('div', { class: 'list' }), files = allFiles('pic');
      files.forEach(p => { const b = h('button', null, ico('picture'), pathStr(p)); b.addEventListener('click', () => { close(); load(p); }); list.append(b); });
      if (!files.length) list.append(h('p', { style: 'padding:10px' }, 'Картинок пока нет.'));
      dlg.append(h('h2', null, ico('folder'), 'Открыть картинку'), list, h('div', { class: 'row' }, btn('Отмена', close)));
    });
  }
  // --- рисование
  let down = false, sx = 0, sy = 0, lx = 0, ly = 0, col = 0, sprayT = null;
  const toXY = e => { const r = cv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left) / r.width * PCW), Math.floor((e.clientY - r.top) / r.height * PCH)]; };
  function preview(x, y) {
    octx.clearRect(0, 0, PCW, PCH); if (!down) return;
    const oimg = octx.createImageData(PCW, PCH), opx = new Uint32Array(oimg.data.buffer), OP = makePainter(PCW, PCH, opx); OP.pat = patIdx;
    if (tool === 'line') OP.line(sx, sy, x, y, col, size); else if (tool === 'rect') OP.rect(sx, sy, x, y, col, fillShapes, size); else if (tool === 'ellipse') OP.ellipse(sx, sy, x, y, col, fillShapes, size);
    octx.putImageData(oimg, 0, 0);
  }
  function sprayAt(x, y) { const r = size * 3 + 3; for (let k = 0; k < 14; k++) { const a = Math.random() * 6.283, d = Math.random() * r; P.plot(x + Math.cos(a) * d, y + Math.sin(a) * d, col); } put(); }
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); const [x, y] = toXY(e); col = PAL32[e.button === 2 ? c2 : c1];
    if (tool === 'picker') { const v = px[y * PCW + x], i = PAL32.indexOf(v); if (i >= 0) { if (e.button === 2) c2 = i; else c1 = i; updCur(); } return; }
    pushUndo(); down = true; sx = lx = x; sy = ly = y; dirty = true; updTitle();
    if (tool === 'eraser') col = PAL32[1];
    if (tool === 'fill') { P.fill(x, y, col); put(); down = false; return; }
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') { P.stamp(x, y, col, tool === 'pencil' ? 1 : tool === 'eraser' ? size * 2 : size); put(); }
    if (tool === 'spray') { sprayAt(x, y); sprayT = setInterval(() => sprayAt(lx, ly), 40); }
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = toXY(e); coords.textContent = `x ${clamp(x, 0, PCW - 1)}, y ${clamp(y, 0, PCH - 1)}`;
    if (!down) return;
    if (tool === 'pencil' || tool === 'brush' || tool === 'eraser') { P.line(lx, ly, x, y, col, tool === 'pencil' ? 1 : tool === 'eraser' ? size * 2 : size); put(); }
    else if (tool === 'line' || tool === 'rect' || tool === 'ellipse') preview(x, y);
    lx = x; ly = y;
  });
  const up = e => {
    if (!down) return; down = false; clearInterval(sprayT); const [x, y] = toXY(e);
    if (tool === 'line') P.line(sx, sy, x, y, col, size); else if (tool === 'rect') P.rect(sx, sy, x, y, col, fillShapes, size); else if (tool === 'ellipse') P.ellipse(sx, sy, x, y, col, fillShapes, size);
    octx.clearRect(0, 0, PCW, PCH); put();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  w.body.tabIndex = -1;
  w.body.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(); } });
  setTool('pencil'); szBtns[2].classList.add('on'); patBtns[0].classList.add('on'); updCur(); clearTo(1); updTitle();
  if (arg.path) load(arg.path);
  requestAnimationFrame(fit);
}

/* ===================== САПЁР ===================== */
function appMines(w) {
  const LV = [{ n: 'Новичок', c: 9, r: 9, m: 10 }, { n: 'Любитель', c: 16, r: 16, m: 40 }];
  let lv = 0, cells = [], state = 'ready', flags = 0, opened = 0, t0 = 0, timer = null, flagMode = false;
  const segM = h('div', { class: 'seg', 'aria-label': 'Осталось мин' }), segT = h('div', { class: 'seg', 'aria-label': 'Время' });
  const faceI = ico('face'), face = h('button', { class: 'face', title: 'Новая игра', 'aria-label': 'Новая игра' }, faceI);
  const grid = h('div', { class: 'mn-grid', role: 'grid', 'aria-label': 'Минное поле' });
  const lvBtns = LV.map((L, i) => { const b = btn(L.n, () => { lv = i; lvBtns.forEach(x => x.classList.toggle('on', x === b)); newGame(); }); return b; });
  const flagBtn = btn('Флажки', () => { flagMode = !flagMode; flagBtn.classList.toggle('on', flagMode); }, { icon: 'flag', cls: 'mn-flag' });
  w.body.append(h('div', { class: 'mn-head' }, segM, face, segT), grid, h('div', { class: 'mn-lv' }, ...lvBtns, flagBtn));
  lvBtns[0].classList.add('on');
  const setFace = n => { faceI.style.backgroundImage = `url(${iconURL(n)})`; };
  const seg = n => String(clamp(n, -99, 999)).padStart(3, '0');
  function newGame() {
    const L = LV[lv]; state = 'ready'; flags = 0; opened = 0; clearInterval(timer); timer = null;
    const cs = isMobile() ? Math.min(24, Math.floor((innerWidth - 60) / L.c)) : 24;
    grid.innerHTML = ''; grid.style.gridTemplateColumns = `repeat(${L.c}, ${cs}px)`; cells = [];
    for (let i = 0; i < L.c * L.r; i++) {
      const e = h('div', { class: 'mc', role: 'gridcell' }); e.style.width = e.style.height = cs + 'px';
      const c = { i, x: i % L.c, y: (i / L.c) | 0, mine: false, adj: 0, open: false, flag: false, e }; cells.push(c); grid.append(e);
      let lp = null;
      e.addEventListener('pointerdown', ev => { if (state === 'over') return; setFace('faceWow'); if (ev.pointerType === 'touch') lp = setTimeout(() => { lp = 'done'; toggleFlag(c); }, 420); });
      e.addEventListener('pointerup', ev => {
        if (state !== 'over') setFace('face'); if (lp === 'done') { lp = null; return; } clearTimeout(lp); lp = null;
        if (ev.button === 2 || flagMode) toggleFlag(c); else if (c.open) chord(c); else openCell(c);
      });
      e.addEventListener('contextmenu', ev => ev.preventDefault());
    }
    segM.textContent = seg(L.m); segT.textContent = '000'; setFace('face');
    if (w.x != null) requestAnimationFrame(() => { if (!isMobile()) { const D = deskRect(), r = w.el.getBoundingClientRect(); if (w.x + r.width > D.width) { w.x = Math.max(0, D.width - r.width); w.el.style.left = w.x + 'px'; } } });
  }
  const nbrs = c => { const L = LV[lv], out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const x = c.x + dx, y = c.y + dy; if (x >= 0 && y >= 0 && x < L.c && y < L.r) out.push(cells[y * L.c + x]); } return out; };
  function place(safe) {
    const L = LV[lv], ban = new Set([safe.i, ...nbrs(safe).map(c => c.i)]); let n = 0;
    while (n < L.m) { const c = cells[Math.floor(Math.random() * cells.length)]; if (c.mine || ban.has(c.i)) continue; c.mine = true; n++; }
    cells.forEach(c => { c.adj = nbrs(c).filter(x => x.mine).length; });
  }
  function toggleFlag(c) { if (c.open || state === 'over') return; c.flag = !c.flag; flags += c.flag ? 1 : -1; c.e.innerHTML = ''; if (c.flag) c.e.append(ico('flag')); segM.textContent = seg(LV[lv].m - flags); blip(c.flag ? 1400 : 900, 0.025); }
  function openCell(c) {
    if (c.flag || c.open || state === 'over') return;
    if (state === 'ready') { place(c); state = 'play'; t0 = Date.now(); timer = setInterval(() => { segT.textContent = seg(Math.floor((Date.now() - t0) / 1000)); }, 250); }
    if (c.mine) return lose(c);
    const st = [c];
    while (st.length) {
      const k = st.pop(); if (k.open || k.flag) continue; k.open = true; opened++; k.e.classList.add('o');
      if (k.adj) { k.e.textContent = k.adj; k.e.classList.add('n' + k.adj); } else nbrs(k).forEach(n => { if (!n.open) st.push(n); });
    }
    blip(1200, 0.015, 'square', 0.02);
    const L = LV[lv]; if (opened === L.c * L.r - L.m) win();
  }
  function chord(c) { if (!c.adj) return; const ns = nbrs(c); if (ns.filter(n => n.flag).length === c.adj) ns.forEach(n => { if (!n.open && !n.flag) openCell(n); }); }
  function lose(c) {
    state = 'over'; clearInterval(timer); setFace('faceDead'); sndBoom();
    cells.forEach(k => { if (k.mine && !k.flag) { k.e.innerHTML = ''; k.e.append(ico('mines')); k.e.classList.add('o'); } });
    c.e.classList.add('boom');
  }
  function win() { state = 'over'; clearInterval(timer); setFace('faceCool'); cells.forEach(k => { if (k.mine && !k.flag) { k.flag = true; k.e.innerHTML = ''; k.e.append(ico('flag')); } }); segM.textContent = '000'; [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.12, 'square', 0.04, i * 0.1)); }
  face.addEventListener('click', newGame);
  w.onClose = () => clearInterval(timer);
  newGame();
}

/* ===================== ПИАНОЛА ===================== */
function appPiano(w) {
  const scope = h('canvas', { class: 'pn-scope', width: 210, height: 56, 'aria-label': 'Осциллограф' }), sctx = scope.getContext('2d');
  let wave = 'square', attack = 0.01, release = 0.35, echo = true, octave = 0, playing = null;
  const WAVES = [['square', 'Квадрат', 'M1 12V3h5v9h5V3h5v9h5'], ['sawtooth', 'Пила', 'M1 12L8 3v9l7-9v9l6-8'], ['triangle', 'Треугольник', 'M1 12l5-9 5 9 5-9 5 9'], ['sine', 'Синус', 'M1 8c3-7 5-7 7 0s5 7 7 0 4-6 6-2']];
  const wvEl = h('div', { class: 'pn-wv' }), wvBtns = [];
  WAVES.forEach(([id, t, d]) => { const b = h('button', { title: t, 'aria-label': t, html: `<svg viewBox="0 0 22 14"><path d="${d}"/></svg>` }); b.addEventListener('click', () => { wave = id; wvBtns.forEach(x => x.classList.toggle('on', x === b)); }); wvBtns.push(b); wvEl.append(b); });
  wvBtns[0].classList.add('on');
  const slA = h('input', { type: 'range', class: 'slider', min: '0', max: '100', value: '5', 'aria-label': 'Атака' }), slR = h('input', { type: 'range', class: 'slider', min: '0', max: '100', value: '30', 'aria-label': 'Затухание' });
  slA.addEventListener('input', () => { attack = 0.002 + slA.value / 100 * 0.6; }); slR.addEventListener('input', () => { release = 0.05 + slR.value / 100 * 1.6; });
  const echoB = btn('Эхо', () => { echo = !echo; echoB.classList.toggle('on', echo); if (fb) fb.gain.value = echo ? 0.32 : 0; }); echoB.classList.add('on');
  const octLbl = h('span', { style: 'font-family:var(--mono);font-size:14px;min-width:28px;text-align:center' }, '0');
  const octDn = btn('−', () => { octave = Math.max(-2, octave - 1); octLbl.textContent = octave > 0 ? '+' + octave : octave; }), octUp = btn('+', () => { octave = Math.min(2, octave + 1); octLbl.textContent = octave > 0 ? '+' + octave : octave; });
  const demoB = btn('Мелодия', () => (playing ? stopDemo() : playDemo()), { icon: 'piano' });
  const top = h('div', { class: 'pn-top' }, scope, h('div', { class: 'pn-grp' }, h('span', { class: 'cap' }, 'Волна'), wvEl),
    h('div', { class: 'pn-grp' }, h('span', { class: 'cap' }, 'Атака'), slA), h('div', { class: 'pn-grp' }, h('span', { class: 'cap' }, 'Затухание'), slR),
    h('div', { class: 'pn-grp' }, h('span', { class: 'cap' }, 'Октава'), h('div', { style: 'display:flex;gap:4px;align-items:center' }, octDn, octLbl, octUp)), echoB, demoB);
  const keys = h('div', { class: 'pn-keys', 'aria-label': 'Клавиатура' });
  w.body.append(top, keys);
  // клавиши C4–B5
  const KB = { KeyZ: 60, KeyS: 61, KeyX: 62, KeyD: 63, KeyC: 64, KeyV: 65, KeyG: 66, KeyB: 67, KeyH: 68, KeyN: 69, KeyJ: 70, KeyM: 71,
    KeyQ: 72, Digit2: 73, KeyW: 74, Digit3: 75, KeyE: 76, KeyR: 77, Digit5: 78, KeyT: 79, Digit6: 80, KeyY: 81, Digit7: 82, KeyU: 83 };
  const LBL = {}; Object.entries(KB).forEach(([k, n]) => { LBL[n] = k.replace('Key', '').replace('Digit', ''); });
  const keyEls = {}; const whites = []; for (let n = 60; n < 84; n++) if (![1, 3, 6, 8, 10].includes(n % 12)) whites.push(n);
  whites.forEach((n, i) => { const e = h('div', { class: 'wk' }, isMobile() ? '' : LBL[n] || ''); e.style.left = (i / whites.length * 100) + '%'; e.style.width = (100 / whites.length) + '%'; e.dataset.n = n; keyEls[n] = e; keys.append(e); });
  for (let n = 60; n < 84; n++) if ([1, 3, 6, 8, 10].includes(n % 12)) {
    const wi = whites.indexOf(n - 1), e = h('div', { class: 'bk' }, isMobile() ? '' : LBL[n] || ''); const kw = 100 / whites.length;
    e.style.left = ((wi + 1) * kw - kw * 0.3) + '%'; e.style.width = (kw * 0.6) + '%'; e.dataset.n = n; keyEls[n] = e; keys.append(e);
  }
  // звук
  let master = null, fb = null, an = null, raf = 0; const voices = {};
  function audio() {
    const a = ac(); if (!a) return null; if (master) return a;
    master = a.createGain(); master.gain.value = 0.22; const dl = a.createDelay(1); dl.delayTime.value = 0.28; fb = a.createGain(); fb.gain.value = echo ? 0.32 : 0;
    an = a.createAnalyser(); an.fftSize = 1024; master.connect(an); master.connect(dl); dl.connect(fb); fb.connect(dl); fb.connect(an); an.connect(a.destination); return a;
  }
  function noteOn(n, vel = 1) {
    const a = audio(); if (!a) return; noteOff(n, true); const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = wave; o.frequency.value = 440 * Math.pow(2, (n + octave * 12 - 69) / 12);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * vel, t + attack); g.gain.setTargetAtTime(0.32 * vel, t + attack, 0.2);
    o.connect(g).connect(master); o.start(t); voices[n] = { o, g }; if (keyEls[n]) keyEls[n].classList.add('on');
  }
  function noteOff(n, quick) {
    const v = voices[n]; if (!v) return; const t = AC.currentTime; v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t);
    v.g.gain.setTargetAtTime(0.0001, t, quick ? 0.01 : release / 4); v.o.stop(t + (quick ? 0.05 : release + 0.2)); delete voices[n]; if (keyEls[n]) keyEls[n].classList.remove('on');
  }
  // мышь и касание — со «скольжением» по клавишам
  const ptrNote = {};
  const noteAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.dataset && el.dataset.n ? +el.dataset.n : null; };
  keys.addEventListener('pointerdown', e => { keys.setPointerCapture(e.pointerId); const n = noteAt(e); if (n != null) { ptrNote[e.pointerId] = n; noteOn(n); } });
  keys.addEventListener('pointermove', e => { if (!(e.pointerId in ptrNote)) return; const n = noteAt(e); if (n != null && n !== ptrNote[e.pointerId]) { noteOff(ptrNote[e.pointerId]); ptrNote[e.pointerId] = n; noteOn(n); } });
  const upP = e => { if (e.pointerId in ptrNote) { noteOff(ptrNote[e.pointerId]); delete ptrNote[e.pointerId]; } };
  keys.addEventListener('pointerup', upP); keys.addEventListener('pointercancel', upP);
  const kd = e => { if (activeWin !== w || e.repeat || e.metaKey || e.ctrlKey) return; const n = KB[e.code]; if (n != null) { e.preventDefault(); noteOn(n); } };
  const ku = e => { const n = KB[e.code]; if (n != null) noteOff(n); };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  // мелодия «Рассвет» (своя, 8 тактов)
  const MEL = [[76, 1], [79, .5], [81, .5], [79, 1], [76, 1], [74, 1], [76, .5], [74, .5], [72, 2], [76, 1], [79, .5], [81, .5], [83, 1], [81, 1], [79, 3], [0, 1],
    [77, 1], [81, .5], [79, .5], [77, 1], [76, 1], [74, 1], [77, .5], [76, .5], [74, 1], [71, 1], [72, 1], [76, .5], [79, .5], [81, 1], [79, 1], [72, 3], [0, 1]];
  const BASS = [60, 67, 67, 60, 60, 64, 67, 62, 65, 60, 62, 67, 60, 65, 60, 60];
  let demoT = [];
  function playDemo() {
    if (!audio()) return; stopDemo(); playing = true; demoB.classList.add('on'); const beat = 0.34; let t = 0;
    MEL.forEach(([n, d]) => { if (n) { demoT.push(setTimeout(() => noteOn(n, 0.9), t * 1000)); demoT.push(setTimeout(() => noteOff(n), (t + d * beat * 0.92) * 1000)); } t += d * beat; });
    BASS.forEach((n, i) => { const tt = i * 2 * beat; demoT.push(setTimeout(() => noteOn(n - 12 < 60 ? n : n - 12, 0.5), tt * 1000)); demoT.push(setTimeout(() => noteOff(n - 12 < 60 ? n : n - 12), (tt + 1.8 * beat) * 1000)); });
    demoT.push(setTimeout(stopDemo, t * 1000 + 400));
  }
  function stopDemo() { demoT.forEach(clearTimeout); demoT = []; playing = null; demoB.classList.remove('on'); Object.keys(voices).forEach(n => noteOff(+n)); }
  // осциллограф
  const data = new Uint8Array(512);
  function drawScope() {
    raf = requestAnimationFrame(drawScope); if (document.hidden || w.min) return;
    const cs = getComputedStyle(document.documentElement), fg = cs.getPropertyValue('--term-fg').trim() || '#ffb347', bg = cs.getPropertyValue('--term-bg').trim() || '#1c130c';
    sctx.fillStyle = bg; sctx.fillRect(0, 0, 210, 56); sctx.fillStyle = cs.getPropertyValue('--term-dim').trim(); for (let x = 0; x < 210; x += 21) sctx.fillRect(x, 27, 1, 2);
    sctx.fillStyle = fg;
    if (an) { an.getByteTimeDomainData(data); for (let x = 0; x < 210; x++) { const v = data[Math.floor(x / 210 * 400)], y = Math.round((v / 255) * 52) + 2; sctx.fillRect(x, y, 2, 2); } }
    else for (let x = 0; x < 210; x++) sctx.fillRect(x, 28, 2, 1);
  }
  drawScope();
  w.onClose = () => { stopDemo(); cancelAnimationFrame(raf); removeEventListener('keydown', kd); removeEventListener('keyup', ku); Object.keys(voices).forEach(n => noteOff(+n, true)); };
}

/* ===================== ДИСК ===================== */
function appDisk(w, arg) {
  let cur = realParts(arg.path || []) || [], sel = arg.select || null;
  const pathEl = h('span', { class: 'dk-path' });
  const upB = btn('Вверх', () => { if (cur.length) { sel = cur[cur.length - 1]; cur = cur.slice(0, -1); render(); } }, { title: 'На уровень выше' });
  const nfB = btn('Папка', () => { const d = getNode(cur), n = uniqueName(d, 'Новая папка'); fsPut([...cur, n], mkDir()); sel = n; render(); }, { icon: 'folder', title: 'Новая папка' });
  const ndB = btn('Документ', () => { const d = getNode(cur), n = uniqueName(d, 'новый', '.txt'); fsPut([...cur, n], mkFile('txt', '')); sel = n; render(); }, { icon: 'doc', title: 'Новый документ' });
  const rnB = btn('Имя…', rename, { title: 'Переименовать' });
  const delB = btn('Удалить', remove, { icon: 'trash', title: 'Удалить (Delete)' });
  const emptyB = btn('Очистить корзину', () => { const t = getNode(['Корзина']); t.c = {}; saveFS(); }, { icon: 'trash' });
  const bar = h('div', { class: 'toolbar' }, upB, pathEl, nfB, ndB, rnB, delB, emptyB);
  const grid = h('div', { class: 'dk-grid', tabindex: '0', role: 'listbox', 'aria-label': 'Файлы' }), st = h('div', { class: 'status' });
  w.body.append(bar, grid, st);
  function render() {
    let n = getNode(cur); if (!n || n.t !== 'd') { cur = []; n = FS; }
    pathEl.textContent = pathStr(cur); w.setTitle(cur.length ? `${cur[cur.length - 1]} — Диск А:` : 'Диск А:'); upB.disabled = !cur.length;
    const inTrash = cur[0] === 'Корзина' && cur.length === 1; emptyB.hidden = !inTrash; nfB.hidden = ndB.hidden = inTrash;
    grid.innerHTML = ''; const keys = sortKeys(n);
    for (const k of keys) {
      const c = n.c[k], it = h('button', { class: 'dk-it' + (k === sel ? ' sel' : ''), role: 'option', 'aria-selected': k === sel ? 'true' : 'false', title: c.t === 'd' ? 'Папка' : fmtSize(nodeSize(c)) }, ico(iconFor(k, c)), h('span', null, k));
      it.addEventListener('click', ev => { sel = k; $$('.dk-it', grid).forEach(x => x.classList.toggle('sel', x === it)); if (ev.pointerType === 'touch' || ev.detail === 0 && ev.pointerType === 'touch') openItem(k); });
      it.addEventListener('dblclick', () => openItem(k));
      it.addEventListener('keydown', ev => { if (ev.key === 'Enter') openItem(k); });
      grid.append(it);
    }
    if (!keys.length) grid.append(h('div', { class: 'dk-empty' }, inTrash ? 'Корзина пуста.' : 'Папка пуста.'));
    const files = keys.filter(k => n.c[k].t === 'f').length, dirs = keys.length - files;
    st.textContent = `${dirs} ${plural(dirs, 'папка', 'папки', 'папок')}, ${files} ${plural(files, 'файл', 'файла', 'файлов')} · ${fmtSize(nodeSize(n))} · свободно ${Math.max(0, Math.round((DISK_CAP - nodeSize(FS)) / 1024))} КБ`;
  }
  function openItem(k) { const n = getNode(cur).c[k]; if (n.t === 'd') { cur = [...cur, k]; sel = null; render(); } else openPath([...cur, k]); }
  function remove() {
    if (!sel) return; const p = [...cur, sel];
    if (cur[0] === 'Корзина' || (cur.length === 0 && sel === 'Корзина')) { if (sel === 'Корзина') return; fsDel(p); sel = null; return; }
    const tr = getNode(['Корзина']), name = uniqueName(tr, sel.replace(/(\.[^.]+)$/, ''), (sel.match(/(\.[^.]+)$/) || [''])[0]);
    tr.c[name] = getNode(p); fsDel(p); sel = null; sndClose();
  }
  function rename() {
    if (!sel || (cur.length === 0 && sel === 'Корзина')) return;
    modal(w, (dlg, close) => {
      const inp = h('input', { class: 'field', value: sel, 'aria-label': 'Новое имя' });
      const ok = () => { const nn = inp.value.trim().replace(/[\\/]/g, '-'); if (!nn || nn === sel) return close(); const d = getNode(cur); if (findKey(d, nn) != null) { inp.select(); sndErr(); return; } d.c[nn] = d.c[sel]; delete d.c[sel]; sel = nn; saveFS(); close(); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      dlg.append(h('h2', null, ico('doc'), 'Переименовать'), inp, h('div', { class: 'row' }, btn('Отмена', close), btn('Готово', ok, { cls: 'pri' })));
    });
  }
  grid.addEventListener('keydown', e => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); } if (e.key === 'F2') rename(); });
  fsSubs.add(render); w.onClose = () => fsSubs.delete(render); render();
}

/* ===================== ПАНЕЛЬ УПРАВЛЕНИЯ ===================== */
function applyTheme(t) {
  settings.theme = t; saveSettings(); document.documentElement.dataset.theme = t; drawWall();
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--paper');
  fsSubs.forEach(f => { try { f(); } catch (e) { /* окно закрыто */ } });
}
function appControl(w) {
  const render = () => {
    w.body.innerHTML = '';
    const themes = h('div', { class: 'opts' });
    Object.entries(THEME_NAMES).forEach(([k, name]) => {
      const P = WP[k], sw = h('div', { class: 'sw', 'aria-hidden': 'true' });
      [P.skyMid, P.sunB, P.patA, P.hill].forEach(c => sw.append(h('i', { style: `background:rgb(${c.map(Math.round).join(',')})` })));
      const o = h('button', { class: 'opt' + (settings.theme === k ? ' on' : ''), 'aria-pressed': settings.theme === k ? 'true' : 'false' }, sw, name);
      o.addEventListener('click', () => { applyTheme(k); render(); }); themes.append(o);
    });
    const walls = h('div', { class: 'opts' });
    Object.entries(WALL_NAMES).forEach(([k, name]) => {
      const c = h('canvas', { class: 'sw' }); renderWall(c, 84, 54, k);
      const o = h('button', { class: 'opt' + (settings.wall === k ? ' on' : ''), 'aria-pressed': settings.wall === k ? 'true' : 'false' }, c, name);
      o.addEventListener('click', () => { settings.wall = k; saveSettings(); drawWall(); render(); }); walls.append(o);
    });
    const chk = (on, label, f) => { const b = h('button', { class: 'chk' + (on ? ' on' : ''), html: SVG.check, 'aria-label': label, 'aria-pressed': on ? 'true' : 'false' }); b.addEventListener('click', f); return h('div', { class: 'line' }, b, label); };
    const used = nodeSize(FS), meter = h('div', { class: 'meter' }, h('i', { style: `width:${Math.min(100, used / DISK_CAP * 100).toFixed(1)}%` }));
    w.body.append(
      h('section', null, h('h2', null, 'Тема оформления'), themes),
      h('section', null, h('h2', null, 'Обои'), walls),
      h('section', null, h('h2', null, 'Система'),
        chk(settings.sounds, 'Звуки интерфейса', () => { settings.sounds = !settings.sounds; saveSettings(); updSoundIcon(); render(); }),
        chk(settings.crt, 'Эффект кинескопа (строчная развёртка)', () => { settings.crt = !settings.crt; saveSettings(); $('#crt').hidden = !settings.crt; render(); })),
      h('section', null, h('h2', null, 'Диск А:'), h('div', { class: 'line' }, meter, `${fmtSize(used)} из 720 КБ`),
        h('div', { class: 'line', style: 'margin-top:10px' }, `${countFiles(FS)} ${plural(countFiles(FS), 'файл', 'файла', 'файлов')} в памяти браузера.`,
          btn('Сбросить диск…', () => modal(w, (dlg, close) => {
            dlg.append(h('h2', null, ico('disk'), 'Сбросить диск?'), h('p', null, 'Все ваши файлы и картинки будут удалены, диск вернётся к заводскому виду.'),
              h('div', { class: 'row' }, btn('Отмена', close), btn('Сбросить', () => { FS = defaultFS(); saveFS(); close(); render(); }, { cls: 'pri' })));
          })))));
  };
  fsSubs.add(render); w.onClose = () => fsSubs.delete(render); render();
}

/* ===================== О СИСТЕМЕ ===================== */
function drawSunLogo(c, t = 1) {
  const W = 96, H = 56; c.width = W; c.height = H; const x = c.getContext('2d'); const img = x.createImageData(W, H), d = img.data;
  const hy = 40, sr = 26, sy = hy + Math.round((1 - t) * 30) + 4;
  const P = { a: [255, 214, 120], b: [226, 84, 42], l: [217, 84, 42] };
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
    let col = null; const dx = xx - 48, dy = y - sy;
    if (y < hy && dx * dx + dy * dy <= sr * sr) { const k = hy - y, gap = k < 16 ? Math.round((16 - k) / 5) : 0; if (k % 5 >= gap) col = dmix(P.a, P.b, (y - (sy - sr)) / (sr * 1.1), dth(xx, y), 4); }
    if (y >= hy && (y - hy) % 4 < 2) { const half = 44 - (y - hy) * 2; if (Math.abs(dx) < half) col = P.l; }
    if (col) putPx(d, W, xx, y, col);
  }
  x.putImageData(img, 0, 0);
}
function appAbout(w, arg) {
  const c = h('canvas'); drawSunLogo(c);
  const parts = [c, h('div', { class: 'nm' }, 'РАССВЕТ-86')];
  if (arg.note) parts.push(h('p', { style: 'color:var(--ink)' }, arg.note));
  parts.push(h('p', null, 'Версия 2.3 · сборка 23.09.86', h('br'), 'Процессор К1810ВМ86 · 640 КБ ОЗУ'),
    h('p', null, 'Собрано Opus 5.5 в 2026 году — так, будто на дворе 1986-й.'), btn('Хорошо', () => w.close(), { cls: 'pri' }));
  w.body.append(...parts);
  w.onArg = a => { if (a.note) { w.close(); launch('about', a); } };
}

/* ===================== ЗАГРУЗКА ===================== */
let resizeT = 0;
addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    drawWall(); layoutIcons(); const D = deskRect();
    WINS.forEach(w => { if (w.maxed) w.setRect(0, 0, D.width, D.height); else if (!w.fixed) w.setRect(clamp(w.x, 0, Math.max(0, D.width - 90)), clamp(w.y, 0, Math.max(0, D.height - 34)), Math.min(w.w, D.width), Math.min(w.h, D.height)); if (w.onResize) w.onResize(); });
  }, 120);
});
function reboot() { WINS.slice().forEach(w => w.close()); runBoot(true); }
function shutdown() {
  WINS.slice().forEach(w => w.close()); $('#os').style.visibility = 'hidden'; $('#off').hidden = false;
  $('#powerOn').onclick = () => { $('#off').hidden = true; $('#os').style.visibility = ''; runBoot(true); };
}
function openDefaults() {
  const D = deskRect();
  if (isMobile()) { launch('notepad', { path: ['readme.txt'], my: 196 }); return; }
  const W = D.width, H = D.height;
  launch('paint', { path: ['Картинки', 'рассвет.pic'], x: 126, y: 14, w: Math.min(700, W * 0.5), h: Math.min(610, H * 0.72) });
  launch('terminal', { cmd: 'sysinfo', x: W - Math.min(640, W * 0.46) - 22, y: 14, w: Math.min(640, W * 0.46), h: Math.min(410, H * 0.5) });
  launch('mines', { x: W - 290, y: H - 350 });
  launch('notepad', { path: ['readme.txt'], x: Math.round(W * 0.27), y: Math.round(H * 0.34), w: Math.min(560, W * 0.4), h: Math.min(440, H * 0.56) });
}
function runBoot(again) {
  const boot = $('#boot'), bios = $('#bios'), logo = $('#bootLogo'), bar = $('#bootBar'), sun = $('#bootSun');
  boot.classList.remove('fade'); boot.hidden = false; bios.innerHTML = ''; logo.classList.remove('on'); bar.style.transform = 'scaleX(0)';
  const d = now86(); let done = false; const timers = [];
  const at = (ms, f) => timers.push(setTimeout(f, ms));
  const add = (t, cls) => { const e = h('div', { class: cls || null }, t); bios.append(e); return e; };
  function finish() {
    if (done) return; done = true; timers.forEach(clearTimeout);
    boot.classList.add('fade'); setTimeout(() => { boot.hidden = true; }, 360);
    drawWall(); layoutIcons(); openDefaults();
  }
  boot.onclick = finish;
  add('РАССВЕТ-86 · ПЗУ версии 2.3 · НПО «Заря», 1986', 'ok');
  at(90, () => add('Процессор К1810ВМ86, 4,77 МГц'));
  at(180, () => { const e = add('Проверка памяти: 0 КБ'); let k = 0; const it = setInterval(() => { k = Math.min(640, k + 64); e.textContent = `Проверка памяти: ${k} КБ${k === 640 ? '  — в порядке' : ''}`; if (k === 640) clearInterval(it); }, 22); timers.push(it); });
  at(480, () => add(`Дисковод А: 720 КБ, ${countFiles(FS)} ${plural(countFiles(FS), 'файл', 'файла', 'файлов')}  — в порядке`));
  at(580, () => add(`Часы: ${WDF[d.getDay()]}, ${d.getDate()} ${MONG[d.getMonth()]} ${YEAR} г.`));
  at(680, () => add('Загрузка «Рассвета»…'));
  at(780, () => {
    bios.innerHTML = ''; logo.classList.add('on'); const t0 = performance.now();
    const anim = () => { if (done) return; const t = Math.min(1, (performance.now() - t0) / 620); drawSunLogo(sun, 1 - Math.pow(1 - t, 3)); bar.style.transform = `scaleX(${t})`; if (t < 1) requestAnimationFrame(anim); };
    anim();
  });
  at(again ? 1500 : 1560, finish);
}

/* ===================== СТАРТ ===================== */
document.documentElement.dataset.theme = settings.theme;
$('#crt').hidden = !settings.crt;
updSoundIcon(); tickClock(); setInterval(tickClock, 1000 * 15);
buildIcons(); drawWall(); renderTray(); updateMbTitle();
runBoot(false);
})();
