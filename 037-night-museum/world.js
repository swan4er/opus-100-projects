/* Ночной музей — уровень: план этажа, залы, развеска картин, предметы, тайники,
   след вора и запечённый лунный свет. Координаты: x — на восток, y — на юг, z — вверх.
   Одна клетка = 1 единица ≈ 2,4 м. */
(function (root) {
'use strict';
const NM = root.NM = root.NM || {};

// ---------- константы ----------
const MW = 37, MH = 27;
const WALL_H = 1.9, DOOR_H = 1.3, EYE = 0.64;
const T = { FLOOR: 0, DOOR: 1, WALL: 2, WINDOW: 3, PILLAR: 4, SHELF: 5, EXIT: 6 };
// стили стен (номера совпадают с шейдером)
const WS = { STONE: 0, CRIMSON: 1, GREEN: 2, SLATE: 3, VELVET: 4, BURGUNDY: 5, OLIVE: 6, WHITE: 7,
  LILAC: 8, BRICK: 9, WORKSHOP: 10, PILLAR: 11, SHELF: 12, WINDOW: 13, EXIT: 14, JAMB: 15 };
// материалы пола
const FM = { OAK: 0, MARBLE: 1, CONCRETE: 2, POLISHED: 3, DARKOAK: 4, THRESHOLD: 5, MAPLE: 6 };
// рамы
const FR = { CARVED: 0, GOLD: 1, BLACK: 2, NONE: 3, WALNUT: 4, SILVER: 5 };
const FRAME_W = [0.085, 0.056, 0.024, 0.0, 0.05, 0.045];
// состояние картины на стене
const ST = { NORMAL: 0, EMPTY: 1, RETURNED: 2, INTRUDER: 3, GONE: 4 };

const SKY = { x0: 16, y0: 11.5, x1: 21, y1: 15.5 };          // стеклянный фонарь в потолке Большого зала
const BROKEN = { x: 18.25, y: 13.75 };                   // разбитое стекло, верёвка вора
function norm3(x, y, z) { const l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; }
const MOON = norm3(-0.4, 1.0, 0.53);                     // направление на луну (юго-запад, 26°)
const SKYL = norm3(-0.1, 0.22, 1.0);                     // рассеянный свет из фонаря — почти отвесно

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}

// ---------- залы ----------
const HALLS = [null,
  { key: 'v', num: 'I', name: 'Вестибюль', sub: 'Парадный вход', rect: [15, 18, 21, 25], wall: WS.STONE, floor: FM.MARBLE, genres: ['portrait', 'landscape'], frame: FR.CARVED, gap: 2.6, amb: 1.0 },
  { key: 'g', num: 'II', name: 'Большой зал', sub: 'Шпалерная развеска', rect: [12, 9, 24, 16], wall: WS.CRIMSON, floor: FM.OAK, genres: ['landscape', 'sea', 'winter', 'portrait', 'moon', 'still', 'landscape'], frame: FR.CARVED, salon: true, amb: 1.0 },
  { key: 'l', num: 'III', name: 'Зал пейзажа', sub: 'Русский пейзаж', rect: [1, 9, 10, 16], wall: WS.GREEN, floor: FM.OAK, genres: ['landscape', 'landscape', 'winter'], frame: FR.GOLD, gap: 2.1, amb: 1.0 },
  { key: 's', num: 'IV', name: 'Морской зал', sub: 'Марина', rect: [1, 18, 6, 25], wall: WS.SLATE, floor: FM.OAK, genres: ['sea'], frame: FR.GOLD, gap: 2.0, amb: 1.0 },
  { key: 'm', num: 'V', name: 'Лунный зал', sub: 'Одна картина — один свет', rect: [8, 18, 13, 25], wall: WS.VELVET, floor: FM.DARKOAK, genres: ['moon'], frame: FR.CARVED, gap: 2.4, amb: 0.35, single: 4 },
  { key: 'p', num: 'VI', name: 'Портретный зал', sub: 'Лица двух столетий', rect: [26, 9, 35, 16], wall: WS.BURGUNDY, floor: FM.OAK, genres: ['portrait'], frame: FR.CARVED, gap: 1.75, amb: 1.0 },
  { key: 'n', num: 'VII', name: 'Натюрморт', sub: 'Тихая жизнь вещей', rect: [23, 18, 28, 25], wall: WS.OLIVE, floor: FM.OAK, genres: ['still', 'flowers', 'still'], frame: FR.WALNUT, gap: 1.8, amb: 1.0 },
  { key: 'a', num: 'VIII', name: 'Беспредметное', sub: 'Супрематизм и цветовое поле', rect: [30, 18, 35, 25], wall: WS.WHITE, floor: FM.POLISHED, genres: ['suprem', 'field', 'suprem'], frame: FR.NONE, gap: 2.3, amb: 1.2 },
  { key: 'i', num: 'IX', name: 'Сад и вода', sub: 'Импрессионизм', rect: [12, 1, 24, 7], wall: WS.LILAC, floor: FM.MAPLE, genres: ['garden', 'flowers', 'garden'], frame: FR.GOLD, gap: 2.0, amb: 1.0 },
  { key: 'z', num: '', name: 'Запасник', sub: 'Служебное помещение', rect: [1, 1, 10, 7], wall: WS.BRICK, floor: FM.CONCRETE, service: true, amb: 0.5 },
  { key: 'r', num: '', name: 'Реставрационная', sub: 'Служебное помещение', rect: [26, 1, 35, 7], wall: WS.WORKSHOP, floor: FM.CONCRETE, service: true, amb: 1.0 },
];
const HALL_ID = {};
HALLS.forEach((h, i) => { if (h) HALL_ID[h.key] = i; });

const DOORS = [[11, 4], [25, 4], [5, 8], [18, 8], [30, 8], [11, 12], [25, 12], [3, 17], [18, 17], [33, 17], [7, 21], [14, 21], [22, 21], [29, 21]];
const PILLARS = [[15, 11], [21, 11], [15, 14], [21, 14]];
const SHELVES = [[2, 3], [3, 3], [4, 3], [7, 3], [8, 3], [9, 3], [2, 5], [3, 5], [4, 5], [7, 5], [8, 5], [9, 5]];
const WINDOWS = [
  [2, 26], [5, 26], [16, 26], [20, 26], [24, 26], [27, 26], [31, 26], [34, 26], // южный фасад
  [0, 11], [0, 14], [0, 20], [0, 23],                                          // западный
  [36, 11], [36, 14], [36, 20], [36, 23],                                      // восточный
  [15, 0], [18, 0], [21, 0], [28, 0], [31, 0], [34, 0],                        // северный
];
const EXIT = [18, 26];
// над какими проёмами висит «ВЫХОД» и с какой стороны он виден (dx,dy — откуда смотрит зритель)
const EXIT_SIGNS = [{ x: 18, y: 17, from: [0, -1] }, { x: 14, y: 21, from: [-1, 0] }, { x: 22, y: 21, from: [1, 0] }];

// ---------- окно: общая геометрия для лунной карты и шейдера ----------
// s — координата вдоль грани 0..1, z — высота. 1 — стекло, 0 — рама/стена/штора.
function windowGlass(s, z) {
  if (s < 0.235 || s > 0.765 || z < 0.34 || z > 1.6) return 0;
  if (Math.abs(s - 0.5) < 0.017) return 0;                     // средник
  if (Math.abs(z - 1.2) < 0.017) return 0;                     // импост
  if (Math.abs(z - 0.76) < 0.013) return 0;                    // нижняя перекладина
  if (z > 1.2 && Math.abs(s - 0.36) < 0.011) return 0;         // форточка
  return 1;
}

// ---------- мастерписы: семь украденных картин ----------
const MASTER = [
  { n: 'I', genre: 'sea', hall: 's', at: [3.9, 18], seed: 1861, aspect: 1.42, w: 1.05, opts: { mood: 'storm' },
    title: 'Буря у Чёрного мыса', author: 'Лев Ардатов', life: '1824–1893', year: '1861', medium: 'Холст, масло', inv: 'Ж-2318' },
  { n: 'II', genre: 'moon', hall: 'm', at: [11, 18], seed: 1882, aspect: 1.72, w: 1.9, opts: { hero: true },
    title: 'Ночь над рекой', author: 'Пётр Засецкий', life: '1846–1910', year: '1882', medium: 'Холст, масло', inv: 'Ж-3104' },
  { n: 'III', genre: 'landscape', hall: 'l', at: [5.5, 9], seed: 1889, aspect: 1.36, w: 1.0, opts: { season: 'autumn', trees: 'birch' },
    title: 'Берёзы у просёлка', author: 'Николай Тавров', life: '1851–1916', year: '1889', medium: 'Холст, масло', inv: 'Ж-1987' },
  { n: 'IV', genre: 'portrait', hall: 'p', at: [31, 9], seed: 1874, aspect: 0.78, w: 0.66, opts: { female: true, pearls: true },
    title: 'Дама в жемчугах', author: 'Мария Ольховская', life: '1838–1902', year: '1874', medium: 'Холст, масло', inv: 'Ж-4411' },
  { n: 'V', genre: 'still', hall: 'n', at: [25.9, 18], seed: 1853, aspect: 1.26, w: 0.9, opts: { copper: true },
    title: 'Натюрморт с медным кувшином', author: 'Людвиг Штраль', life: '1809–1871', year: '1853', medium: 'Холст, масло', inv: 'Ж-0876' },
  { n: 'VI', genre: 'suprem', hall: 'a', at: [33, 18], seed: 1916, aspect: 0.84, w: 0.82, opts: { rich: true },
    title: 'Супрематизм. Композиция № 7', author: 'Вера Мезенцева', life: '1889–1941', year: '1916', medium: 'Холст, масло', inv: 'Ж-9270' },
  { n: 'VII', genre: 'garden', hall: 'i', at: [18.5, 8], seed: 1908, aspect: 1.22, w: 0.95, opts: { kind: 'pond' },
    title: 'Утро у пруда', author: 'Ксения Лаврова', life: '1872–1937', year: '1908', medium: 'Холст, масло', inv: 'Ж-5530' },
];

// ---------- тайники ----------
// lean — холст прислонён к стене (c — центр у стены, t — вдоль стены, nrm — от стены),
// easel — на мольберте в мастерской, hung — повешен без рамы среди чужих картин.
const SPOTS = [
  { id: 'z-aisle', hall: 'z', kind: 'lean', c: [8.0, 4.0], t: [1, 0], nrm: [0, 1] },
  { id: 'z-corner', hall: 'z', kind: 'lean', c: [1.0, 6.3], t: [0, -1], nrm: [1, 0] },
  { id: 'r-easel', hall: 'r', kind: 'easel', easel: 1 },
  { id: 'r-wall', hall: 'r', kind: 'lean', c: [26.0, 5.6], t: [0, 1], nrm: [1, 0] },
  { id: 'g-pillar', hall: 'g', kind: 'lean', c: [21.5, 15.0], t: [1, 0], nrm: [0, 1] },
  { id: 'v-wall', hall: 'v', kind: 'lean', c: [15.0, 23.6], t: [0, 1], nrm: [1, 0] },
  { id: 'm-corner', hall: 'm', kind: 'lean', c: [8.75, 26.0], t: [1, 0], nrm: [0, -1] },
  { id: 'i-hung', hall: 'i', kind: 'hung' },
  { id: 'a-hung', hall: 'a', kind: 'hung' },
  { id: 'l-window', hall: 'l', kind: 'lean', c: [1.0, 12.55], t: [0, 1], nrm: [1, 0] },
  { id: 's-corner', hall: 's', kind: 'lean', c: [7.0, 24.5], t: [0, 1], nrm: [-1, 0] },
  { id: 'p-corner', hall: 'p', kind: 'lean', c: [36.0, 16.2], t: [0, 1], nrm: [-1, 0] },
  { id: 'n-corner', hall: 'n', kind: 'lean', c: [28.2, 18.0], t: [1, 0], nrm: [0, 1] },
  { id: 'g-west', hall: 'g', kind: 'lean', c: [15.5, 15.0], t: [1, 0], nrm: [0, 1] },
];
// первая ночь собрана вручную: первая находка — рядом со стартом
const NIGHT1 = ['z-aisle', 'r-easel', 'a-hung', 'g-pillar', 'v-wall', 'i-hung', 'm-corner'];

// ---------- надписи для обычных картин ----------
const TITLES = {
  landscape: ['Просёлок', 'После дождя', 'Опушка', 'Над рекой', 'Сенокос', 'Излучина', 'Туман над лугом', 'Берёзовая роща', 'Летний полдень', 'Овраг', 'Весенний разлив', 'Ветреный день', 'Околица', 'Тихая заводь', 'Дорога в Заречье', 'Вечер на пашне'],
  winter: ['Зимний вечер', 'Оттепель', 'Первый снег', 'Деревня в снегу', 'Январские сумерки', 'Синие тени', 'Дымы над деревней'],
  sea: ['Прибой', 'Штиль', 'Шторм у скалистого берега', 'Корабль в бурю', 'Рассвет над заливом', 'Волна', 'После бури', 'Буря на рейде', 'Закат на море', 'Парусник у мыса'],
  moon: ['Лунная ночь', 'Месяц над прудом', 'Ночь на хуторе', 'Лунная дорожка', 'Полнолуние', 'Ночное'],
  portrait: ['Портрет дамы в чёрном', 'Портрет молодого человека', 'Портрет старика', 'Портрет неизвестной в голубом', 'Портрет купца Н.', 'Портрет графини Л.', 'Автопортрет', 'Портрет дамы в красном', 'Портрет офицера', 'Портрет сестры художника', 'Портрет юноши'],
  still: ['Натюрморт с лимоном', 'Натюрморт с медным котелком', 'Яблоки', 'Завтрак', 'Натюрморт с виноградом', 'Кувшин и груши', 'Натюрморт с бутылкой', 'Дары осени'],
  flowers: ['Пионы', 'Сирень', 'Розы в стеклянной вазе', 'Полевые цветы', 'Астры', 'Букет с маками', 'Тюльпаны'],
  suprem: ['Композиция № 12', 'Динамический супрематизм', 'Беспредметное', 'Композиция с чёрной полосой', 'Движение цветных плоскостей', 'Конструкция', 'Ритм'],
  field: ['Без названия', 'Ноль', 'Тишина № 4', 'Красное над охрой', 'Два синих', 'Вечерний свет', 'Порог'],
  garden: ['Утро в саду', 'Пруд с кувшинками', 'Маки', 'Сад в июне', 'Аллея', 'Белая сирень', 'Лодка на пруду'],
};
const YEARS = { landscape: [1858, 1905], winter: [1865, 1910], sea: [1840, 1895], moon: [1870, 1905], portrait: [1790, 1900],
  still: [1820, 1910], flowers: [1830, 1910], suprem: [1915, 1927], field: [1958, 1972], garden: [1890, 1915] };
const ASPECT = { landscape: [1.3, 1.55], winter: [1.3, 1.5], sea: [1.35, 1.65], moon: [1.35, 1.6], portrait: [0.74, 0.82],
  still: [1.15, 1.32], flowers: [0.76, 0.86], suprem: [0.78, 1.0], field: [0.72, 0.84], garden: [1.1, 1.32] };
const MALE = ['Иван', 'Пётр', 'Николай', 'Алексей', 'Михаил', 'Фёдор', 'Василий', 'Павел', 'Сергей', 'Григорий', 'Константин', 'Дмитрий', 'Андрей', 'Егор'];
const FEMALE = ['Анна', 'Мария', 'Елена', 'Ольга', 'Вера', 'Надежда', 'Софья', 'Екатерина', 'Зинаида', 'Лидия'];
const SURN = ['Белецк', 'Вершинин', 'Галанин', 'Дымов', 'Жемчугов', 'Звягин', 'Нелидов', 'Пыжов', 'Ратманов', 'Сабуров', 'Тучков',
  'Хвостов', 'Шеин', 'Щеглов', 'Юрьев', 'Яхонтов', 'Глинск', 'Гурьев', 'Елагин', 'Зотов', 'Кашин', 'Ладыгин', 'Ломов',
  'Мальцев', 'Толбузин', 'Ведерников', 'Осокин', 'Рябинин', 'Синицын', 'Фомин', 'Чеботарёв', 'Эрдели'];
function surname(base, female) {
  if (base.endsWith('ск')) return base + (female ? 'ая' : 'ий');
  if (base === 'Эрдели') return base;
  return base + (female ? 'а' : '');
}
function describe(genre, rng) {
  const female = rng() < 0.22;
  const author = pick(rng, female ? FEMALE : MALE) + ' ' + surname(pick(rng, SURN), female);
  const [y0, y1] = YEARS[genre];
  const year = Math.round(y0 + rng() * (y1 - y0));
  const born = year - 24 - Math.floor(rng() * 30);
  const died = Math.max(year + 2, born + 48 + Math.floor(rng() * 34));
  let medium = 'Холст, масло';
  if (genre === 'field') medium = 'Холст, акрил';
  else if (rng() < 0.12) medium = 'Картон, масло';
  return { title: pick(rng, TITLES[genre]), author, life: born + '–' + died, year: String(year), medium,
    inv: 'Ж-' + String(1000 + Math.floor(rng() * 8999)) };
}

// ---------- сетка ----------
function buildGrid() {
  const type = new Uint8Array(MW * MH).fill(T.WALL);
  const hall = new Uint8Array(MW * MH);
  for (let h = 1; h < HALLS.length; h++) {
    const [x0, y0, x1, y1] = HALLS[h].rect;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { type[y * MW + x] = T.FLOOR; hall[y * MW + x] = h; }
  }
  for (const [x, y] of DOORS) { type[y * MW + x] = T.DOOR; hall[y * MW + x] = 0; }
  for (const [x, y] of PILLARS) type[y * MW + x] = T.PILLAR;
  for (const [x, y] of SHELVES) type[y * MW + x] = T.SHELF;
  for (const [x, y] of WINDOWS) type[y * MW + x] = T.WINDOW;
  type[EXIT[1] * MW + EXIT[0]] = T.EXIT;
  return { type, hall };
}
const isOpen = (t) => t === T.FLOOR || t === T.DOOR;

// ---------- развеска ----------
// Грани стен, выходящие в зал, собираются в непрерывные «пробеги» вдоль одной линии.
function findRuns(g) {
  const groups = new Map();
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const i = y * MW + x;
    if (g.type[i] !== T.FLOOR || !g.hall[i]) continue;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (g.type[ny * MW + nx] !== T.WALL) continue;
      let axis, line, sign, s;
      if (dx === -1) { axis = 0; line = x; sign = 1; s = y; }
      else if (dx === 1) { axis = 0; line = x + 1; sign = -1; s = y; }
      else if (dy === -1) { axis = 1; line = y; sign = 1; s = x; }
      else { axis = 1; line = y + 1; sign = -1; s = x; }
      const key = axis + '|' + line + '|' + sign + '|' + g.hall[i];
      if (!groups.has(key)) groups.set(key, { axis, line, sign, hall: g.hall[i], cells: [] });
      groups.get(key).cells.push(s);
    }
  }
  const runs = [];
  for (const gr of groups.values()) {
    gr.cells.sort((a, b) => a - b);
    let start = gr.cells[0], prev = start;
    for (let k = 1; k <= gr.cells.length; k++) {
      const c = gr.cells[k];
      if (c === prev + 1) { prev = c; continue; }
      runs.push({ axis: gr.axis, line: gr.line, sign: gr.sign, hall: gr.hall, s0: start, s1: prev + 1 });
      start = prev = c;
    }
  }
  return runs;
}
// соседство пробега с проёмами: у дверей оставляем больше места под наличник
function runMargins(g, r) {
  const at = (s) => {
    const x = r.axis === 0 ? (r.sign > 0 ? r.line - 1 : r.line) : s;
    const y = r.axis === 0 ? s : (r.sign > 0 ? r.line - 1 : r.line);
    if (x < 0 || y < 0 || x >= MW || y >= MH) return T.WALL;
    return g.type[y * MW + x];
  };
  const lo = at(r.s0 - 1), hi = at(r.s1);
  const m = (t) => (t === T.DOOR ? 0.42 : t === T.WINDOW ? 0.36 : 0.3);
  return [m(lo), m(hi)];
}

function faceOf(axis, line, sign, s) {
  const x = axis === 0 ? (sign > 0 ? line - 1 : line) : Math.floor(s);
  const y = axis === 0 ? Math.floor(s) : (sign > 0 ? line - 1 : line);
  const code = axis === 0 ? (sign > 0 ? 1 : 0) : (sign > 0 ? 3 : 2);
  return (y * MW + x) * 4 + code;
}

function placePaintings(g, rng) {
  const runs = findRuns(g);
  const decals = [];
  const add = (d) => { d.id = decals.length; decals.push(d); return d; };
  for (const r of runs) {
    const H = HALLS[r.hall];
    if (H.service) continue;
    const [m0, m1] = runMargins(g, r);
    const a = r.s0 + m0, b = r.s1 - m1, usable = b - a;
    if (usable < 0.55) continue;
    if (H.salon) {
      // шпалерная развеска: колонки из большой нижней и малой верхней картины
      const n = Math.max(1, Math.round(usable / 1.62));
      const slot = usable / n;
      for (let k = 0; k < n; k++) {
        const c = a + slot * (k + 0.5);
        const g1 = pick(rng, H.genres), g2 = pick(rng, H.genres);
        const as1 = ASPECT[g1][0] + rng() * (ASPECT[g1][1] - ASPECT[g1][0]);
        const as2 = ASPECT[g2][0] + rng() * (ASPECT[g2][1] - ASPECT[g2][0]);
        let w1 = Math.min(slot - 0.34, 0.62 * as1, 0.95), h1 = w1 / as1;
        if (h1 > 0.72) { h1 = 0.72; w1 = h1 * as1; }
        let w2 = Math.min(slot - 0.4, 0.4 * as2, 0.7), h2 = w2 / as2;
        if (h2 > 0.44) { h2 = 0.44; w2 = h2 * as2; }
        add({ run: r, hall: r.hall, axis: r.axis, line: r.line, sign: r.sign, s0: c - w1 / 2, s1: c + w1 / 2, z0: 0.47, z1: 0.47 + h1,
          genre: g1, aspect: as1, frame: H.frame, label: true, row: 0 });
        add({ run: r, hall: r.hall, axis: r.axis, line: r.line, sign: r.sign, s0: c - w2 / 2, s1: c + w2 / 2, z0: 1.3, z1: 1.3 + h2,
          genre: g2, aspect: as2, frame: rng() < 0.5 ? FR.GOLD : FR.CARVED, label: false, row: 1 });
      }
      continue;
    }
    const n = H.single && usable >= H.single ? 1 : Math.max(1, Math.round(usable / (H.gap || 1.5)));
    const slot = usable / n;
    for (let k = 0; k < n; k++) {
      const c = a + slot * (k + 0.5);
      const genre = pick(rng, H.genres);
      const as = ASPECT[genre][0] + rng() * (ASPECT[genre][1] - ASPECT[genre][0]);
      const fw = FRAME_W[H.frame];
      let w = Math.min(slot - 0.42 - 2 * fw, (genre === 'portrait' ? 0.58 : 0.66) * as + rng() * 0.12, 1.15);
      let h = w / as;
      if (h > 0.82) { h = 0.82; w = h * as; }
      const cz = 0.8 + (h > 0.6 ? (h - 0.6) * 0.3 : 0);
      let frame = H.frame;
      if (genre === 'field' || genre === 'suprem') frame = rng() < 0.3 ? FR.BLACK : FR.NONE;
      add({ run: r, hall: r.hall, axis: r.axis, line: r.line, sign: r.sign, s0: c - w / 2, s1: c + w / 2, z0: cz - h / 2, z1: cz + h / 2,
        genre, aspect: as, frame, label: true, row: 0 });
    }
  }
  return decals;
}

// ---------- предметы ----------
// Спрайты (всегда лицом к камере) и плоские объекты-отрезки (холсты, мольберты, шнур).
const SPR = { BUST: 0, URN: 1, EASEL: 2, POST: 3, ROPE: 4, CLOCK: 5, PALM: 6, SHIP: 7, SCULPT: 8, LADDER: 9, EXIT: 10 };
function buildProps() {
  const sprites = [];
  const sp = (kind, x, y, w, h, mat, solid, info) => sprites.push({ kind, x, y, w, h, z0: 0, mat, solid, info: info || null });
  sp(SPR.BUST, 16.25, 18.95, 0.38, 1.12, 1, 0.24, 'bust');
  sp(SPR.BUST, 20.75, 18.95, 0.38, 1.12, 1, 0.24, 'bust');
  sp(SPR.CLOCK, 21.62, 22.2, 0.44, 1.42, 3, 0.24, 'clock');
  sp(SPR.PALM, 17.2, 25.35, 0.72, 1.25, 0, 0.26, null);
  sp(SPR.PALM, 19.8, 25.35, 0.72, 1.25, 0, 0.26, null);
  sp(SPR.ROPE, BROKEN.x, BROKEN.y, 0.2, WALL_H, 0, 0, 'rope');
  sp(SPR.BUST, 5.5, 12.95, 0.38, 1.12, 1, 0.24, 'bust2');
  sp(SPR.SHIP, 3.9, 23.35, 0.52, 1.12, 3, 0.26, 'ship');
  sp(SPR.POST, 9.72, 18.78, 0.07, 0.42, 2, 0.08, null);
  sp(SPR.POST, 12.28, 18.78, 0.07, 0.42, 2, 0.08, null);
  sp(SPR.BUST, 28.5, 14.4, 0.38, 1.12, 1, 0.24, 'bust3');
  sp(SPR.BUST, 33.5, 14.4, 0.38, 1.12, 1, 0.24, 'bust4');
  sp(SPR.URN, 25.9, 23.4, 0.42, 1.05, 1, 0.24, 'urn');
  sp(SPR.SCULPT, 32.9, 23.3, 0.46, 1.25, 4, 0.25, 'sculpt');
  sp(SPR.PALM, 12.75, 1.75, 0.72, 1.25, 0, 0.26, null);
  sp(SPR.PALM, 24.25, 1.75, 0.72, 1.25, 0, 0.26, null);
  sp(SPR.LADDER, 35.1, 6.3, 0.52, 1.15, 3, 0.24, null);

  const segs = [];
  // шнур на столбиках перед главной картиной Лунного зала
  segs.push({ kind: 'rope', ax: 9.72, ay: 18.78, bx: 12.28, by: 18.78, z0: 0.2, z1: 0.42, tex: SPR.POST, mat: 5 });
  // мольберты мастерской: [x, y, угол нормали]
  const easels = [[28.2, 3.3, 2.2], [30.9, 2.7, 1.45], [33.4, 3.5, 0.9]];
  return { sprites, segs, easels };
}

// ---------- путь вора ----------
function astar(g, sx, sy, tx, ty) {
  const N = MW * MH, open = [], came = new Int32Array(N).fill(-1), gs = new Float32Array(N).fill(1e9);
  const s = sy * MW + sx, t = ty * MW + tx;
  gs[s] = 0; open.push([Math.hypot(tx - sx, ty - sy), s]);
  const closed = new Uint8Array(N);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
    const [, c] = open.splice(bi, 1)[0];
    if (c === t) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const cx = c % MW, cy = (c / MW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const n = ny * MW + nx;
      if (!isOpen(g.type[n])) continue;
      if (dx && dy && (!isOpen(g.type[cy * MW + nx]) || !isOpen(g.type[ny * MW + cx]))) continue;
      const ng = gs[c] + (dx && dy ? 1.414 : 1) + (g.type[n] === T.DOOR ? 0.2 : 0);
      if (ng < gs[n]) { gs[n] = ng; came[n] = c; open.push([ng + Math.hypot(tx - nx, ty - ny), n]); }
    }
  }
  const path = [];
  for (let c = t; c !== -1; c = came[c]) { path.push([c % MW + 0.5, ((c / MW) | 0) + 0.5]); if (c === s) break; }
  return path.reverse();
}
function chaikin(pts, it) {
  for (let k = 0; k < it; k++) {
    const o = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      o.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    o.push(pts[pts.length - 1]);
    pts = o;
  }
  return pts;
}
function buildTrail(g, stops, rng) {
  // маршрут: верёвка → тайники (ближайший сосед) → верёвка
  const order = [];
  const left = stops.slice();
  let cur = [BROKEN.x, BROKEN.y];
  while (left.length) {
    let bi = 0, bd = 1e9;
    left.forEach((p, i) => { const d = Math.hypot(p[0] - cur[0], p[1] - cur[1]); if (d < bd) { bd = d; bi = i; } });
    cur = left.splice(bi, 1)[0];
    order.push(cur);
  }
  const way = [[BROKEN.x, BROKEN.y], ...order, [BROKEN.x + 0.2, BROKEN.y - 0.3]];
  let pts = [];
  for (let i = 0; i < way.length - 1; i++) {
    const a = way[i], b = way[i + 1];
    const cells = astar(g, Math.floor(a[0]), Math.floor(a[1]), Math.floor(b[0]), Math.floor(b[1]));
    const seg = [a, ...cells.slice(1, -1).map(([x, y]) => [x + (rng() - 0.5) * 0.3, y + (rng() - 0.5) * 0.3]), b];
    pts = pts.concat(i ? seg.slice(1) : seg);
  }
  pts = chaikin(pts, 3);
  const prints = [];
  let acc = 0, side = 1;
  const total = pts.reduce((s, p, i) => s + (i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < 1e-6) continue;
    const ux = (bx - ax) / L, uy = (by - ay) / L;
    let t = 0;
    while (acc + (L - t) >= 0.27) {
      t += 0.27 - acc; acc = 0;
      const px = ax + ux * t, py = ay + uy * t;
      side = -side;
      const k = (run + t) / total;
      prints.push({ x: px - uy * 0.065 * side, y: py + ux * 0.065 * side, a: Math.atan2(uy, ux) + (rng() - 0.5) * 0.25, side, k });
    }
    acc += L - t; run += L;
  }
  return { prints, stops: order };
}

// ---------- запечённый лунный свет ----------
// R — свет из окон (луна под 26°), G — рассеянный свет из фонаря Большого зала.
const MOON_RES = 24;
function bakeMoon(g) {
  const W = MW * MOON_RES, Hh = MH * MOON_RES;
  const out = new Uint8Array(W * Hh * 2);
  const trace = (px, py, L, skyOnly) => {
    const lh = Math.hypot(L[0], L[1]), ux = L[0] / lh, uy = L[1] / lh, slope = L[2] / lh;
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = Math.abs(1 / ux), ddy = Math.abs(1 / uy);
    const stx = ux < 0 ? -1 : 1, sty = uy < 0 ? -1 : 1;
    let sdx = (ux < 0 ? px - mx : mx + 1 - px) * ddx, sdy = (uy < 0 ? py - my : my + 1 - py) * ddy;
    let skipping = !isOpen(g.type[my * MW + mx]);
    const tTop = WALL_H / slope;
    for (let it = 0; it < 40; it++) {
      let t, side;
      if (sdx < sdy) { t = sdx; sdx += ddx; mx += stx; side = 0; } else { t = sdy; sdy += ddy; my += sty; side = 1; }
      if (t > tTop) {
        if (!skyOnly || skipping) return 0;
        const qx = px + ux * tTop, qy = py + uy * tTop;
        if (qx < SKY.x0 || qx > SKY.x1 || qy < SKY.y0 || qy > SKY.y1) return 0;
        // железный переплёт фонаря
        const fx = qx * 2 - Math.floor(qx * 2), fy = qy * 2 - Math.floor(qy * 2);
        if (fx < 0.05 || fx > 0.95 || fy < 0.05 || fy > 0.95) return 0.15;
        return 1;
      }
      if (mx < 0 || my < 0 || mx >= MW || my >= MH) return 0;
      const c = g.type[my * MW + mx];
      const z = t * slope;
      if (skipping) { if (isOpen(c)) skipping = false; else continue; }
      if (c === T.DOOR && z > DOOR_H) return 0;
      if (isOpen(c)) continue;
      if (skyOnly) return 0;
      if (c === T.WINDOW) {
        const hx = px + ux * t, hy = py + uy * t;
        let s = side === 0 ? hy - Math.floor(hy) : hx - Math.floor(hx);
        return windowGlass(s, z) ? 1 : 0;
      }
      return 0;
    }
    return 0;
  };
  for (let cy = 0; cy < MH; cy++) for (let cx = 0; cx < MW; cx++) {
    // считаем только клетки рядом с окнами и фонарём
    // окно должно лежать «выше по лучу» — со стороны луны
    let near = false;
    const lh = Math.hypot(MOON[0], MOON[1]), ux = MOON[0] / lh, uy = MOON[1] / lh;
    for (let dy = -5; dy <= 5 && !near; dy++) for (let dx = -5; dx <= 5 && !near; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      if (g.type[y * MW + x] === T.WINDOW && dx * ux + dy * uy > -0.5) near = true;
    }
    const inSky = cx >= SKY.x0 - 2 && cx <= SKY.x1 + 2 && cy >= SKY.y0 - 2 && cy <= SKY.y1 + 2;
    if (!near && !inSky) continue;
    for (let ty = 0; ty < MOON_RES; ty++) for (let tx = 0; tx < MOON_RES; tx++) {
      const px = cx + (tx + 0.5) / MOON_RES, py = cy + (ty + 0.5) / MOON_RES;
      const o = ((cy * MOON_RES + ty) * W + cx * MOON_RES + tx) * 2;
      if (near) out[o] = Math.round(trace(px, py, MOON, false) * 255);
      if (inSky) out[o + 1] = Math.round(trace(px, py, SKYL, true) * 255);
    }
  }
  // рассеянный свет фонаря мягкий: размываем канал G
  const tmp = new Float32Array(W * Hh);
  const bx0 = (SKY.x0 - 3) * MOON_RES, bx1 = (SKY.x1 + 4) * MOON_RES, by0 = (SKY.y0 - 6) * MOON_RES, by1 = (SKY.y1 + 3) * MOON_RES;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      let s = 0, n = 0;
      for (let k = -4; k <= 4; k++) {
        const xx = pass === 0 ? x + k : x, yy = pass === 0 ? y : y + k;
        if (xx < 0 || yy < 0 || xx >= W || yy >= Hh) continue;
        s += out[(yy * W + xx) * 2 + 1]; n++;
      }
      tmp[y * W + x] = s / n;
    }
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) out[(y * W + x) * 2 + 1] = Math.round(tmp[y * W + x]);
  }
  return { data: out, w: W, h: Hh, res: MOON_RES };
}

// ---------- текстура клеток для шейдера ----------
function cellTexture(g, moon) {
  const tex = new Uint8Array(MW * MH * 4);
  // средняя освещённость клетки луной
  const lit = new Float32Array(MW * MH);
  for (let cy = 0; cy < MH; cy++) for (let cx = 0; cx < MW; cx++) {
    let s = 0;
    for (let ty = 0; ty < moon.res; ty += 2) for (let tx = 0; tx < moon.res; tx += 2) {
      const o = ((cy * moon.res + ty) * moon.w + cx * moon.res + tx) * 2;
      s += moon.data[o] + moon.data[o + 1] * 0.8;
    }
    lit[cy * MW + cx] = s / ((moon.res / 2) * (moon.res / 2) * 255);
  }
  for (let cy = 0; cy < MH; cy++) for (let cx = 0; cx < MW; cx++) {
    const i = cy * MW + cx;
    const t = g.type[i];
    const h = g.hall[i];
    let amb = 0;
    if (isOpen(t)) {
      let s = 0, wsum = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        const j = y * MW + x;
        if (!isOpen(g.type[j])) continue;
        if (h && g.hall[j] && g.hall[j] !== h) continue;
        const w = 1 / (1 + dx * dx + dy * dy);
        s += lit[j] * w; wsum += w;
      }
      // рассеянный свет ночного неба из ближних окон (даже без прямой луны)
      let win = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= MW || y >= MH || g.type[y * MW + x] !== T.WINDOW) continue;
        win += Math.max(0, 1 - Math.hypot(dx, dy) / 4.5);
      }
      amb = (Math.min(1, (s / Math.max(wsum, 1e-6)) * 3.2) + Math.min(0.35, win * 0.12)) * (h ? HALLS[h].amb : 0.8) + 0.06;
    }
    let fm = FM.OAK;
    if (t === T.DOOR) fm = FM.THRESHOLD;
    else if (h) fm = HALLS[h].floor;
    tex[i * 4] = t;
    tex[i * 4 + 1] = h;
    tex[i * 4 + 2] = fm;
    tex[i * 4 + 3] = Math.round(Math.min(1, amb) * 255);
  }
  return tex;
}

// ---------- сборка мира ----------
function build(night) {
  const rng = mulberry32(night * 7919 + 13);
  const g = buildGrid();
  const decals = placePaintings(g, rng);
  const props = buildProps();

  // картины: у каждой — сид, жанр и подпись
  const paintings = [];   // слои текстурного массива
  const newPainting = (spec) => { spec.layer = paintings.length; paintings.push(spec); return spec; };
  for (const d of decals) {
    const info = describe(d.genre, rng);
    d.paint = newPainting({ genre: d.genre, aspect: d.aspect, seed: Math.floor(rng() * 1e9), quality: d.row ? 0.6 : 0.85, info, opts: {} });
    d.state = ST.NORMAL;
  }
  // семь мастерписов: занимают картину своего зала, ближайшую к точке at
  const stolen = MASTER.map((m, k) => {
    let best = null, bd = 1e9;
    for (const d of decals) {
      if (HALLS[d.hall].key !== m.hall || d.row) continue;
      const cx = d.axis === 0 ? d.line : (d.s0 + d.s1) / 2, cy = d.axis === 0 ? (d.s0 + d.s1) / 2 : d.line;
      const dist = Math.hypot(cx - m.at[0], cy - m.at[1]);
      if (dist < bd) { bd = dist; best = d; }
    }
    const d = best;
    const c = (d.s0 + d.s1) / 2;
    const run = d.run;
    // размер мастерписа: по его пропорциям, не шире пробега
    let w = m.w, h = w / m.aspect;
    const maxW = Math.min(run.s1 - run.s0 - 0.8, 2.1);
    if (w > maxW) { w = maxW; h = w / m.aspect; }
    if (h > 1.12) { h = 1.12; w = h * m.aspect; }
    d.s0 = c - w / 2; d.s1 = c + w / 2;
    const cz = h > 0.8 ? 0.95 : 0.82;
    d.z0 = cz - h / 2; d.z1 = cz + h / 2;
    d.genre = m.genre; d.aspect = m.aspect; d.frame = FR.CARVED; d.state = ST.EMPTY;
    d.paint.genre = m.genre; d.paint.aspect = m.aspect; d.paint.seed = m.seed + night * 101; d.paint.quality = 1;
    d.paint.opts = m.opts; d.paint.master = k; d.paint.size = 512;
    d.paint.info = { title: m.title, author: m.author, life: m.life, year: m.year, medium: m.medium, inv: m.inv };
    return { k, n: m.n, decal: d, paint: d.paint, w, h, state: 'hidden', spot: null, obj: null };
  });

  // обычные холсты в запаснике и мастерской — «шум» для поиска
  const clutter = [];
  const leanDefs = [
    { c: [2.9, 4.0], t: [1, 0], nrm: [0, 1] }, { c: [3.2, 6.0], t: [1, 0], nrm: [0, -1] },
    { c: [10.0, 2.2], t: [0, -1], nrm: [-1, 0] }, { c: [8.6, 1.0], t: [1, 0], nrm: [0, 1] },
    { c: [36.0, 3.0], t: [0, 1], nrm: [-1, 0] }, { c: [31.8, 1.0], t: [1, 0], nrm: [0, 1] },
  ];
  const clutterGenres = ['landscape', 'portrait', 'still', 'sea', 'winter', 'flowers', 'moon', 'landscape', 'portrait'];
  for (const L of leanDefs) {
    const genre = pick(rng, clutterGenres);
    const as = ASPECT[genre][0] + rng() * (ASPECT[genre][1] - ASPECT[genre][0]);
    const info = describe(genre, rng);
    info.note = 'Фонды. На хранении';
    clutter.push({ spot: L, paint: newPainting({ genre, aspect: as, seed: Math.floor(rng() * 1e9), quality: 0.55, info, opts: {} }) });
  }
  const easelPaints = props.easels.map(() => {
    const genre = pick(rng, ['landscape', 'portrait', 'still', 'sea']);
    const as = ASPECT[genre][0] + rng() * (ASPECT[genre][1] - ASPECT[genre][0]);
    const info = describe(genre, rng);
    info.note = 'В реставрации';
    return newPainting({ genre, aspect: as, seed: Math.floor(rng() * 1e9), quality: 0.75, info, opts: { restore: true } });
  });

  // тайники
  let assign;
  if (night === 1) assign = NIGHT1.map((id) => SPOTS.find((s) => s.id === id));
  else {
    for (let tries = 0; tries < 200; tries++) {
      const pool = shuffle(rng, SPOTS.slice());
      const res = [], usedHall = {};
      for (let k = 0; k < 7; k++) {
        const j = pool.findIndex((s) => s.hall !== MASTER[k].hall && !usedHall[s.hall]);
        if (j < 0) break;
        usedHall[pool[j].hall] = 1; res.push(pool.splice(j, 1)[0]);
      }
      if (res.length === 7) { assign = res; break; }
    }
  }
  const segs = props.segs.slice();
  const easelUsed = {};
  const stops = [];
  stolen.forEach((S, k) => {
    const spot = assign[k];
    S.spot = spot;
    if (spot.kind === 'lean') {
      const w = Math.min(S.w, 0.95), h = Math.min(w / S.paint.aspect, 0.8), ww = h * S.paint.aspect;
      const [cx, cy] = spot.c, [tx, ty] = spot.t, [nx, ny] = spot.nrm;
      const ox = cx + nx * 0.07, oy = cy + ny * 0.07;
      S.obj = segs.length;
      segs.push({ kind: 'canvas', ax: ox - tx * ww / 2, ay: oy - ty * ww / 2, bx: ox + tx * ww / 2, by: oy + ty * ww / 2,
        z0: 0, z1: h, paint: S.paint.layer, stolen: k, ragged: true, nrm: [nx, ny] });
      stops.push([cx + nx * 0.5, cy + ny * 0.5]);
    } else if (spot.kind === 'easel') {
      easelUsed[spot.easel] = k;
      const [ex, ey] = props.easels[spot.easel];
      stops.push([ex + Math.cos(props.easels[spot.easel][2]) * 0.6, ey + Math.sin(props.easels[spot.easel][2]) * 0.6]);
    } else {
      // повешен без рамы на место чужой картины своего зала-тайника
      const cands = decals.filter((d) => HALLS[d.hall].key === spot.hall && d.state === ST.NORMAL && !d.row);
      const d = cands[Math.floor(rng() * cands.length)];
      const c = (d.s0 + d.s1) / 2, cz = (d.z0 + d.z1) / 2;
      let w = Math.min(S.w, 0.9), h = w / S.paint.aspect;
      if (h > 0.75) { h = 0.75; w = h * S.paint.aspect; }
      d.s0 = c - w / 2; d.s1 = c + w / 2; d.z0 = cz - h / 2; d.z1 = cz + h / 2;
      d.state = ST.INTRUDER; d.intruder = k; d.label = false;
      S.hungDecal = d;
      const px = d.axis === 0 ? d.line + d.sign * 0.55 : c, py = d.axis === 0 ? c : d.line + d.sign * 0.55;
      stops.push([px, py]);
    }
  });
  // мольберты: сам мольберт и холст на нём — плоские объекты
  props.easels.forEach(([ex, ey, ang], i) => {
    const nx = Math.cos(ang), ny = Math.sin(ang), tx = -ny, ty = nx;
    const k = easelUsed[i];
    const paint = k !== undefined ? stolen[k].paint : easelPaints[i];
    const h = k !== undefined ? 0.62 : 0.56, w = Math.min(h * paint.aspect, 0.95);
    const hh = w / paint.aspect;
    segs.push({ kind: 'easel', ax: ex - tx * 0.3, ay: ey - ty * 0.3, bx: ex + tx * 0.3, by: ey + ty * 0.3, z0: 0, z1: 1.36, tex: SPR.EASEL, nrm: [nx, ny] });
    const ox = ex + nx * 0.05, oy = ey + ny * 0.05;
    const seg = { kind: 'canvas', ax: ox - tx * w / 2, ay: oy - ty * w / 2, bx: ox + tx * w / 2, by: oy + ty * w / 2,
      z0: 0.5, z1: 0.5 + hh, paint: paint.layer, stolen: k !== undefined ? k : -1, ragged: k !== undefined, nrm: [nx, ny], easel: true };
    if (k !== undefined) stolen[k].obj = segs.length;
    segs.push(seg);
  });
  for (const c of clutter) {
    const [cx, cy] = c.spot.c, [tx, ty] = c.spot.t, [nx, ny] = c.spot.nrm;
    const h = 0.42 + rng() * 0.2, w = Math.min(h * c.paint.aspect, 0.8), hh = w / c.paint.aspect;
    const ox = cx + nx * 0.07, oy = cy + ny * 0.07;
    segs.push({ kind: 'canvas', ax: ox - tx * w / 2, ay: oy - ty * w / 2, bx: ox + tx * w / 2, by: oy + ty * w / 2,
      z0: 0, z1: hh, paint: c.paint.layer, stolen: -1, ragged: false, nrm: [nx, ny] });
  }
  // нормали отрезков: смотрят в зал
  for (const s of segs) {
    if (!s.nrm) { const dx = s.bx - s.ax, dy = s.by - s.ay, L = Math.hypot(dx, dy); s.nrm = [-dy / L, dx / L]; }
  }

  // грани стен → до двух картин на грань
  const faceDecals = new Int16Array(MW * MH * 4 * 2).fill(-1);
  for (const d of decals) {
    const fw = FRAME_W[d.frame] + 0.02;
    const lo = d.s0 - fw - (d.label ? 0.24 : 0), hi = d.s1 + fw + (d.label ? 0.24 : 0);
    for (let s = Math.floor(lo); s <= Math.floor(hi - 1e-4); s++) {
      if (s < d.run.s0 || s >= d.run.s1) continue;
      const f = faceOf(d.axis, d.line, d.sign, s + 0.5);
      if (faceDecals[f * 2] < 0) faceDecals[f * 2] = d.id;
      else if (faceDecals[f * 2 + 1] < 0) faceDecals[f * 2 + 1] = d.id;
    }
  }

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const t0 = now();
  const trail = buildTrail(g, stops, rng);
  const t1 = now();
  const moon = bakeMoon(g);
  const t2 = now();
  const cells = cellTexture(g, moon);
  const timing = { trail: t1 - t0, moon: t2 - t1, cells: now() - t2 };

  // таблички «ВЫХОД» — зелёные огни
  const exitLights = EXIT_SIGNS.map((e) => ({ x: e.x + 0.5 + e.from[0] * 0.62, y: e.y + 0.5 + e.from[1] * 0.62, z: 1.42 }));
  exitLights.push({ x: EXIT[0] + 0.5, y: EXIT[1] - 0.2, z: 1.5 });

  return {
    night, g, decals, paintings, stolen, sprites: props.sprites, segs, faceDecals, trail, moon, cells, exitLights, timing,
    start: { x: 18.5, y: 24.3, a: -Math.PI / 2 },
  };
}

NM.World = {
  MW, MH, WALL_H, DOOR_H, EYE, T, WS, FM, FR, FRAME_W, ST, SKY, BROKEN, MOON, SKYL, SPR,
  HALLS, HALL_ID, MASTER, EXIT_SIGNS, EXIT, windowGlass, isOpen, build, mulberry32, describe,
};
})(typeof window !== 'undefined' ? window : globalThis);
