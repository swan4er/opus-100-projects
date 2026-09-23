/* ================================================================
   Язык сцены: каталог типов, синонимы, проверка и нормализация графа.
   Нейросеть пишет JSON на этом языке, движок доверяет только тому,
   что прошло через normObj / normEnv / applyOps.
   ================================================================ */
window.S3 = window.S3 || {};
(function () {
  'use strict';
  const L = {};
  L.R = 10; // радиус острова в мировых единицах

  L.TIMES = ['morning', 'day', 'sunset', 'night'];
  L.WEATHER = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];
  L.GROUNDS = ['grass', 'meadow', 'autumn', 'snow', 'sand', 'desert', 'rock', 'moon', 'mars'];
  L.MATS = ['matte', 'glossy', 'metal', 'glass', 'glow'];
  L.ANIMS = ['none', 'spin', 'sway', 'blink', 'bob', 'fly', 'walk', 'hop', 'wave', 'dance', 'pulse', 'swim', 'sleep'];
  L.SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule', 'pyramid', 'ring'];

  // hab: где живёт объект (land — на земле, water — на воде, air — в воздухе)
  // r: радиус «пятна» на земле при s=1 (для раздвигания), 0 — не мешает соседям
  // n: [мин, макс, по умолчанию] для целочисленного параметра, если он есть
  L.TYPES = {
    house:      { kinds: ['izba', 'cottage', 'modern', 'castle', 'barn', 'shop', 'tower'], hab: 'land', r: 1.9, n: [1, 3, 1], d: 'дом; color стены, color2 крыша, n этажей 1–3' },
    tree:       { kinds: ['oak', 'pine', 'birch', 'apple', 'palm', 'sakura', 'autumn', 'fir', 'dead'], hab: 'land', r: 0.9, d: 'дерево; color листва' },
    bush:       { kinds: ['round', 'berry', 'rose'], hab: 'land', r: 0.6, d: 'куст' },
    flowers:    { kinds: ['meadow', 'tulips', 'sunflowers'], hab: 'land', r: 0, d: 'клумба цветов; color цветы' },
    grass:      { kinds: ['tuft', 'reeds'], hab: 'land', r: 0, d: 'пучки травы или камыш' },
    rock:       { kinds: ['boulder', 'flat', 'crystal'], hab: 'any', r: 0.7, d: 'камень; crystal — светящийся кристалл' },
    cliff:      { kinds: ['rock', 'sand'], hab: 'land', r: 1.7, n: [1, 6, 3], d: 'скала-утёс с плоской вершиной, n высота 1–6; на неё ставят через on' },
    mountain:   { kinds: ['snowy', 'green', 'volcano'], hab: 'land', r: 3.2, d: 'гора, большая' },
    mushroom:   { kinds: ['amanita', 'boletus'], hab: 'land', r: 0.25, d: 'гриб' },
    stump:      { kinds: ['stump', 'log'], hab: 'land', r: 0.5, d: 'пень или бревно' },
    pond:       { kinds: ['pond', 'lilies'], hab: 'land', r: 2.2, d: 'пруд; на него ставят уток и лодки через on' },
    lighthouse: { kinds: ['classic'], hab: 'land', r: 1.3, d: 'маяк; color, color2 — полосы; anim spin крутит луч' },
    windmill:   { kinds: ['classic'], hab: 'land', r: 1.5, d: 'мельница; anim spin крутит крылья' },
    well:       { kinds: ['classic'], hab: 'land', r: 0.9, d: 'колодец' },
    fence:      { kinds: ['picket', 'rail', 'stone'], hab: 'land', r: 0, n: [2, 12, 5], d: 'забор, n длина 2–12, идёт вдоль rot' },
    bridge:     { kinds: ['wood', 'stone'], hab: 'any', r: 0, d: 'мостик' },
    tent:       { kinds: ['camp', 'circus'], hab: 'land', r: 1.3, d: 'палатка или шатёр' },
    campfire:   { kinds: ['classic'], hab: 'land', r: 0.7, d: 'костёр, горит и светит' },
    lamp:       { kinds: ['street', 'lantern', 'paper'], hab: 'land', r: 0.3, d: 'фонарь; светит ночью; paper — бумажный' },
    bench:      { kinds: ['wood', 'park'], hab: 'land', r: 0.7, d: 'скамейка' },
    table:      { kinds: ['wood', 'round', 'picnic'], hab: 'land', r: 0.8, d: 'стол; color2 скатерть; на него ставят через on' },
    chair:      { kinds: ['wood', 'rocking'], hab: 'land', r: 0.35, d: 'стул' },
    samovar:    { kinds: ['brass'], hab: 'land', r: 0.25, d: 'самовар, дымит' },
    barrel:     { kinds: ['wood'], hab: 'any', r: 0.4, d: 'бочка' },
    crate:      { kinds: ['wood', 'hay'], hab: 'land', r: 0.45, d: 'ящик или тюк сена' },
    car:        { kinds: ['sedan', 'truck', 'retro', 'bus'], hab: 'land', r: 1.2, d: 'машинка; anim walk — ездит по кругу' },
    boat:       { kinds: ['rowboat', 'sail', 'ship'], hab: 'water', r: 1.2, d: 'лодка или корабль, на воде; anim bob качается' },
    balloon:    { kinds: ['hot', 'party'], hab: 'air', r: 0, d: 'воздушный шар; anim bob или fly' },
    rocket:     { kinds: ['retro'], hab: 'land', r: 0.9, d: 'ракета' },
    ufo:        { kinds: ['saucer'], hab: 'air', r: 0, d: 'летающая тарелка' },
    snowman:    { kinds: ['classic'], hab: 'land', r: 0.6, d: 'снеговик' },
    sign:       { kinds: ['post', 'arrow'], hab: 'land', r: 0.4, d: 'табличка; text — надпись до 16 знаков' },
    flag:       { kinds: ['cloth'], hab: 'land', r: 0.3, d: 'флаг на флагштоке' },
    umbrella:   { kinds: ['beach', 'cafe'], hab: 'land', r: 0.6, d: 'зонт' },
    gift:       { kinds: ['box'], hab: 'land', r: 0.35, d: 'подарок' },
    person:     { kinds: ['man', 'woman', 'child', 'grandpa', 'grandma', 'fisher', 'wizard', 'knight', 'astronaut', 'chef'], hab: 'land', r: 0.35, d: 'человечек; color одежда, color2 шапка/волосы' },
    animal:     { kinds: ['cat', 'dog', 'cow', 'sheep', 'pig', 'horse', 'rabbit', 'fox', 'bear', 'deer', 'chicken', 'duck', 'frog', 'hedgehog', 'penguin'], hab: 'land', r: 0.5, d: 'животное; color окрас; утка может плавать (on пруд или anim swim)' },
    bird:       { kinds: ['gull', 'crow', 'songbird'], hab: 'air', r: 0, n: [1, 7, 3], d: 'стайка птиц, n штук; anim fly' },
    fish:       { kinds: ['carp', 'dolphin'], hab: 'water', r: 0, d: 'рыба/дельфин, выпрыгивает из воды' },
    cloud:      { kinds: ['puffy', 'storm'], hab: 'air', r: 0, d: 'облако; y высота 6–11' },
    rainbow:    { kinds: ['arc'], hab: 'air', r: 0, d: 'радуга над островом' },
    custom:     { kinds: ['parts'], hab: 'land', r: 0.8, d: 'своя вещь из деталей parts — для всего, чего нет в каталоге' },
  };

  // «кот» → animal/cat и т. п.: модель иногда путает тип с видом
  L.KIND_TYPE = {};
  for (const [t, def] of Object.entries(L.TYPES)) for (const k of def.kinds) if (!L.KIND_TYPE[k] && k !== t) L.KIND_TYPE[k] = t;

  const SYN = {
    building: 'house', home: 'house', cabin: 'house', hut: 'house', castle: ['house', 'castle'], barn: ['house', 'barn'], shop: ['house', 'shop'], tower: ['house', 'tower'],
    izba: ['house', 'izba'], church: ['house', 'tower'], palace: ['house', 'castle'],
    pine: ['tree', 'pine'], oak: ['tree', 'oak'], birch: ['tree', 'birch'], palm: ['tree', 'palm'], sakura: ['tree', 'sakura'], fir: ['tree', 'fir'], spruce: ['tree', 'fir'], christmas_tree: ['tree', 'fir'], appletree: ['tree', 'apple'], apple_tree: ['tree', 'apple'],
    shrub: 'bush', hedge: 'bush', flower: 'flowers', flowerbed: 'flowers', tulip: ['flowers', 'tulips'], sunflower: ['flowers', 'sunflowers'], reeds: ['grass', 'reeds'],
    stone: 'rock', boulder: 'rock', crystal: ['rock', 'crystal'], cliffs: 'cliff', hill: ['mountain', 'green'], volcano: ['mountain', 'volcano'], lake: 'pond', pool: 'pond',
    log: ['stump', 'log'], lantern: 'lamp', streetlight: 'lamp', street_lamp: 'lamp', lamppost: 'lamp', torch: ['lamp', 'lantern'], fire: 'campfire', bonfire: 'campfire',
    sofa: 'bench', seat: 'chair', desk: 'table', teapot: 'samovar', box: 'crate', hay: ['crate', 'hay'], truck: ['car', 'truck'], bus: ['car', 'bus'], ship: ['boat', 'ship'],
    sailboat: ['boat', 'sail'], yacht: ['boat', 'sail'], hot_air_balloon: 'balloon', airship: 'balloon', saucer: 'ufo', spaceship: 'rocket', signpost: 'sign', banner: 'flag',
    parasol: 'umbrella', present: 'gift', human: 'person', man: ['person', 'man'], woman: ['person', 'woman'], girl: ['person', 'child'], boy: ['person', 'child'], kid: ['person', 'child'],
    people: 'person', character: 'person', fisherman: ['person', 'fisher'], seagull: ['bird', 'gull'], birds: 'bird', dolphin: ['fish', 'dolphin'], clouds: 'cloud', statue: 'custom', robot: 'custom',
    kitten: ['animal', 'cat'], puppy: ['animal', 'dog'], lamb: ['animal', 'sheep'], hen: ['animal', 'chicken'], rooster: ['animal', 'chicken'], bunny: ['animal', 'rabbit'], goose: ['animal', 'duck'],
  };

  L.ANIM_SYN = { dancing: 'dance', waving: 'wave', hopping: 'hop', jumping: 'hop', spinning: 'spin', swaying: 'sway', blinking: 'blink', bobbing: 'bob', sleeping: 'sleep', pulsing: 'pulse', rotate: 'spin', rotating: 'spin', turn: 'spin', swing: 'sway', rock: 'sway', flash: 'blink', flicker: 'blink', glow: 'blink', float: 'bob', floating: 'bob', drift: 'bob',
    flying: 'fly', circle: 'fly', orbit: 'fly', jump: 'hop', bounce: 'hop', run: 'walk', walking: 'walk', drive: 'walk', ride: 'walk', idle: 'none', static: 'none', breathe: 'none',
    wag: 'none', sit: 'sleep', rest: 'sleep', beat: 'pulse', swimming: 'swim', sail: 'swim', sailing: 'swim' };
  const TIME_SYN = { dawn: 'morning', sunrise: 'morning', noon: 'day', afternoon: 'day', evening: 'sunset', dusk: 'sunset', twilight: 'sunset', midnight: 'night' };
  const WEATHER_SYN = { sunny: 'clear', none: 'clear', overcast: 'cloudy', clouds: 'cloudy', rainy: 'rain', drizzle: 'rain', thunderstorm: 'storm', thunder: 'storm', lightning: 'storm', snowy: 'snow', blizzard: 'snow', foggy: 'fog', mist: 'fog' };
  const GROUND_SYN = { lawn: 'grass', field: 'meadow', forest: 'grass', beach: 'sand', dune: 'desert', stone: 'rock', rocky: 'rock', lunar: 'moon', ice: 'snow', winter: 'snow', fall: 'autumn', martian: 'mars' };

  const CSS_COLORS = { red: '#d9443a', orange: '#ec8a2f', yellow: '#f2c94c', green: '#5c9e48', blue: '#3f7fd0', lightblue: '#8cc4ec', navy: '#26356b', purple: '#8356b8', violet: '#8356b8',
    pink: '#ef8fb1', brown: '#8a5a3b', white: '#f4f1ea', black: '#26242a', gray: '#8c8a86', grey: '#8c8a86', gold: '#d8a93a', silver: '#bfc4c9', beige: '#e3d3b0', cyan: '#56c6d0', teal: '#2f8f89' };

  // ---------- мелкие помощники ----------
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && v.trim() !== '' && isFinite(+v)) ? +v : d;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const low = (v) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/[\s-]+/g, '_') : '');
  L.clamp = clamp;

  L.color = function (v) {
    if (typeof v !== 'string') return undefined;
    let s = v.trim().toLowerCase();
    if (CSS_COLORS[s]) return CSS_COLORS[s];
    if (/^#?[0-9a-f]{6}$/.test(s)) return s[0] === '#' ? s : '#' + s;
    if (/^#?[0-9a-f]{3}$/.test(s)) { s = s.replace('#', ''); return '#' + s[0] + s[0] + s[1] + s[1] + s[2] + s[2]; }
    return undefined;
  };

  L.resolveType = function (rawType, rawKind) {
    let t = low(rawType), k = low(rawKind);
    if (!L.TYPES[t]) {
      const syn = SYN[t] || SYN[t.replace(/s$/, '')];
      if (Array.isArray(syn)) { t = syn[0]; if (!k || !L.TYPES[t].kinds.includes(k)) k = syn[1]; }
      else if (syn) t = syn;
      else if (L.KIND_TYPE[t]) { k = t; t = L.KIND_TYPE[t]; }
      else if (L.KIND_TYPE[t.replace(/s$/, '')]) { k = t.replace(/s$/, ''); t = L.KIND_TYPE[k]; }
    }
    if (!L.TYPES[t]) return null;
    const kinds = L.TYPES[t].kinds;
    if (!kinds.includes(k)) {
      const alt = SYN[k];
      k = Array.isArray(alt) && alt[0] === t && kinds.includes(alt[1]) ? alt[1] : kinds[0];
    }
    return { type: t, kind: k };
  };

  L.anim = function (v) {
    const a = low(v);
    if (L.ANIMS.includes(a)) return a;
    return L.ANIM_SYN[a] || 'none';
  };

  // Радиус суши при данном уровне моря
  L.landRadius = (sea) => L.R * (1 - 0.6 * clamp(num(sea, 0), 0, 1));

  L.defaultEnv = () => ({ time: 'day', weather: 'clear', ground: 'grass', sea: 0, wind: 0.3, sky: null });

  L.normEnv = function (e, base) {
    const out = Object.assign(L.defaultEnv(), base || {});
    if (!e || typeof e !== 'object') return out;
    const t = low(e.time); if (L.TIMES.includes(t)) out.time = t; else if (TIME_SYN[t]) out.time = TIME_SYN[t];
    const w = low(e.weather); if (L.WEATHER.includes(w)) out.weather = w; else if (WEATHER_SYN[w]) out.weather = WEATHER_SYN[w];
    const g = low(e.ground); if (L.GROUNDS.includes(g)) out.ground = g; else if (GROUND_SYN[g]) out.ground = GROUND_SYN[g];
    if ('sea' in e) out.sea = clamp(num(e.sea === true ? 0.5 : e.sea === false ? 0 : e.sea, out.sea), 0, 1);
    if ('wind' in e) out.wind = clamp(num(e.wind, out.wind), 0, 1);
    if ('sky' in e) {
      if (Array.isArray(e.sky) && e.sky.length >= 2 && L.color(e.sky[0]) && L.color(e.sky[1])) out.sky = [L.color(e.sky[0]), L.color(e.sky[1])];
      else if (e.sky === null || e.sky === false || e.sky === 'default') out.sky = null;
    }
    return out;
  };

  function normPart(p) {
    if (!p || typeof p !== 'object') return null;
    let shape = low(p.shape || p.type);
    if (shape === 'cube') shape = 'box'; if (shape === 'ball') shape = 'sphere'; if (shape === 'cylinder_' ) shape = 'cylinder';
    if (!L.SHAPES.includes(shape)) shape = 'box';
    const v3 = (a, d, lo, hi) => {
      const arr = Array.isArray(a) ? a : [a, a, a];
      return [0, 1, 2].map((i) => clamp(num(arr[i], d[i]), lo[i], hi[i]));
    };
    return {
      shape,
      p: v3(p.p || p.pos, [0, 0.5, 0], [-6, -1, -6], [6, 14, 6]),
      s: v3(p.s || p.size, [1, 1, 1], [0.04, 0.04, 0.04], [8, 12, 8]),
      r: v3(p.r || p.rot, [0, 0, 0], [-360, -360, -360], [360, 360, 360]),
      color: L.color(p.color) || '#c9bfae',
      mat: L.MATS.includes(low(p.mat)) ? low(p.mat) : 'matte',
    };
  }

  // Нормализация одного объекта. Возвращает чистый объект или null.
  L.normObj = function (o) {
    if (!o || typeof o !== 'object') return null;
    const rt = L.resolveType(o.type, o.kind) || (Array.isArray(o.parts) ? { type: 'custom', kind: 'parts' } : null);
    if (!rt) return null;
    const def = L.TYPES[rt.type];
    const out = { id: '', type: rt.type, kind: rt.kind };
    const id = typeof o.id === 'string' ? o.id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 28) : '';
    out.id = id || '';
    const x = num(o.x, NaN), z = num(o.z, NaN);
    out.x = isFinite(x) ? clamp(x, -L.R, L.R) : NaN;
    out.z = isFinite(z) ? clamp(z, -L.R, L.R) : NaN;
    if ('y' in o) out.y = clamp(num(o.y, 0), 0, 14);
    out.rot = ((num(o.rot, 0) % 360) + 360) % 360;
    out.s = clamp(num(o.s ?? o.scale, 1), 0.3, rt.type === 'mountain' || rt.type === 'cloud' ? 2.2 : 3);
    const c = L.color(o.color), c2 = L.color(o.color2);
    if (c) out.color = c;
    if (c2) out.color2 = c2;
    const m = low(o.mat || o.material);
    if (L.MATS.includes(m)) out.mat = m;
    out.anim = L.anim(o.anim || o.animation || o.action);
    out.speed = clamp(num(o.speed, 1), 0.1, 4);
    if (typeof o.on === 'string' && o.on.trim()) out.on = o.on.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    if (def.n) out.n = Math.round(clamp(num(o.n, def.n[2]), def.n[0], def.n[1]));
    if (rt.type === 'sign') out.text = String(o.text || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if (rt.type === 'custom') {
      out.parts = (Array.isArray(o.parts) ? o.parts : []).slice(0, 18).map(normPart).filter(Boolean);
      if (!out.parts.length) out.parts = [normPart({ shape: 'box', p: [0, 0.5, 0], s: [1, 1, 1] })];
      if (typeof o.name === 'string') out.name = o.name.slice(0, 24);
    }
    return out;
  };

  // Точка по умолчанию: полярный «золотой» разброс, чтобы новые объекты не липли в центр
  let seedN = 7;
  L.freeSpot = function () {
    seedN++;
    const a = seedN * 2.39996, r = 2 + ((seedN * 0.618) % 1) * (L.R - 3.5);
    return [Math.cos(a) * r, Math.sin(a) * r];
  };

  L.footprint = (o) => (L.TYPES[o.type] ? L.TYPES[o.type].r : 0.5) * (o.s || 1) * (o.type === 'animal' ? animalSize(o.kind) : 1);
  function animalSize(k) {
    return { cow: 1.8, horse: 1.8, bear: 1.6, deer: 1.5, sheep: 1.2, pig: 1.1, dog: 1, fox: 0.9, cat: 0.7, rabbit: 0.6, chicken: 0.6, duck: 0.6, frog: 0.5, hedgehog: 0.5, penguin: 0.8 }[k] || 1;
  }

  // Где объект должен жить с учётом моря: land — на суше, water — в кольце воды
  L.placeOk = function (o, env) {
    const hab = L.TYPES[o.type].hab;
    const landR = L.landRadius(env.sea), r = Math.hypot(o.x, o.z), fp = L.footprint(o);
    if (o.on) return true;
    if (hab === 'air') return r <= L.R - 0.5;
    if (hab === 'water') return env.sea > 0.05 ? (r >= landR + fp * 0.6 + 0.3 && r <= L.R - fp * 0.6 - 0.3) : r <= landR - fp - 0.2;
    if (hab === 'any') return r <= L.R - fp * 0.6 - 0.3;
    return r <= landR - Math.max(0.35, fp * 0.7);
  };

  // Раздвигаем только новый объект: соседи остаются на местах
  L.place = function (o, scene, env) {
    if (!isFinite(o.x) || !isFinite(o.z)) { const [x, z] = L.freeSpot(); o.x = x; o.z = z; }
    if (o.on) return o;
    const hab = L.TYPES[o.type].hab;
    const fp = L.footprint(o);
    const others = scene.objects.filter((q) => q.id !== o.id && !q.on && L.footprint(q) > 0 && L.TYPES[q.type].hab !== 'air');
    const free = (x, z) => {
      const probe = { ...o, x, z };
      if (!L.placeOk(probe, env)) return false;
      if (fp <= 0 || hab === 'air') return true;
      for (const q of others) {
        const need = (fp + L.footprint(q)) * 0.82;
        if (Math.hypot(q.x - x, q.z - z) < need) return false;
      }
      return true;
    };
    if (free(o.x, o.z)) return o;
    // если объект водный, а воды нет — перенос в кольцо у берега; сухопутный в воде — к берегу
    const landR = L.landRadius(env.sea);
    let bx = o.x, bz = o.z;
    const r0 = Math.hypot(bx, bz) || 1;
    if (hab === 'water' && env.sea > 0.05) { const rr = (landR + L.R) / 2; bx = bx / r0 * rr; bz = bz / r0 * rr; }
    else if (hab === 'land' && r0 > landR - fp) { const rr = Math.max(0, landR - fp - 0.4); bx = bx / r0 * rr; bz = bz / r0 * rr; }
    for (let ring = 0; ring <= 18; ring++) {
      const rad = ring * 0.45, steps = Math.max(1, ring * 6);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + ring;
        const x = bx + Math.cos(a) * rad, z = bz + Math.sin(a) * rad;
        if (Math.hypot(x, z) > L.R) continue;
        if (free(x, z)) { o.x = +x.toFixed(2); o.z = +z.toFixed(2); return o; }
      }
    }
    o.x = +bx.toFixed(2); o.z = +bz.toFixed(2);
    return o;
  };

  L.uniqueId = function (base, scene, taken) {
    let id = base || 'obj';
    const has = (v) => scene.objects.some((q) => q.id === v) || (taken && taken.has(v));
    if (!has(id)) return id;
    const stem = id.replace(/\d+$/, '') || 'obj';
    for (let i = 2; i < 999; i++) if (!has(stem + i)) return stem + i;
    return stem + Date.now();
  };

  L.emptyScene = () => ({ title: 'Пустой постамент', env: L.defaultEnv(), objects: [] });
  L.clone = (s) => JSON.parse(JSON.stringify(s));

  // Проверить опоры: on указывает на существующий объект и без циклов
  L.fixSupports = function (scene) {
    const byId = new Map(scene.objects.map((o) => [o.id, o]));
    for (const o of scene.objects) {
      if (!o.on) continue;
      let p = byId.get(o.on), guard = 0;
      if (!p || p.id === o.id) { delete o.on; continue; }
      while (p && p.on && guard++ < 6) { if (p.on === o.id) { delete o.on; break; } p = byId.get(p.on); }
      if (o.on) { const sup = byId.get(o.on); if (sup && Math.hypot(o.x - sup.x, o.z - sup.z) > 3 * (sup.s || 1)) { o.x = sup.x; o.z = sup.z; } }
    }
  };

  /* Применить ответ нейросети к сцене. Возвращает { scene, report }.
     resp: { title, clear, env, remove:[id], update:[{id,…}], add:[{…}] } */
  L.applyOps = function (prev, resp) {
    const scene = L.clone(prev);
    const report = { added: [], removed: [], updated: [], dropped: 0, envChanged: false };
    if (!resp || typeof resp !== 'object') return { scene, report };
    if (typeof resp.title === 'string' && resp.title.trim()) scene.title = resp.title.trim().slice(0, 40);
    if (resp.clear === true) { report.removed.push(...scene.objects.map((o) => o.id)); scene.objects = []; }
    if (resp.env && typeof resp.env === 'object') {
      const before = JSON.stringify(scene.env);
      scene.env = L.normEnv(resp.env, scene.env);
      report.envChanged = before !== JSON.stringify(scene.env);
    }
    for (const rid of Array.isArray(resp.remove) ? resp.remove : []) L.removeFrom(scene, rid, report);
    for (const u of Array.isArray(resp.update) ? resp.update : []) L.updateIn(scene, u, report);
    for (const a of Array.isArray(resp.add) ? resp.add : []) L.addTo(scene, a, report);
    L.fixSupports(scene);
    return { scene, report };
  };

  L.removeFrom = function (scene, rid, report) {
    if (typeof rid !== 'string') return;
    const id = rid.trim().toLowerCase();
    let idx = scene.objects.findIndex((o) => o.id === id);
    if (idx < 0) {
      // нейросеть назвала вид вместо id: «cat» — убираем первого подходящего
      const rt = L.resolveType(id, id);
      if (rt) idx = scene.objects.findIndex((o) => o.type === rt.type && (o.kind === id || o.type === id || rt.kind === o.kind));
    }
    if (idx < 0) return;
    const [gone] = scene.objects.splice(idx, 1);
    report && report.removed.push(gone.id);
    // всё, что стояло на удалённом, опускаем на землю
    for (const o of scene.objects) if (o.on === gone.id) delete o.on;
  };

  L.updateIn = function (scene, u, report) {
    if (!u || typeof u !== 'object' || typeof u.id !== 'string') return;
    // модель иногда пишет {id, field, value} или {id, changes:{…}} — разворачиваем в плоский вид
    if (typeof u.field === 'string' && 'value' in u) u = { id: u.id, [u.field]: u.value };
    for (const k of ['changes', 'set', 'fields', 'props']) if (u[k] && typeof u[k] === 'object' && !Array.isArray(u[k])) u = { ...u[k], ...u, [k]: undefined };
    if (Array.isArray(u.fields)) { const f = {}; for (const x of u.fields) if (x && typeof x.field === 'string') f[x.field] = x.value; u = { id: u.id, ...f }; }
    const id = u.id.trim().toLowerCase();
    const i = scene.objects.findIndex((o) => o.id === id);
    if (i < 0) { if (u.type) L.addTo(scene, u, report); return; }
    const cur = scene.objects[i];
    const merged = L.normObj({ ...cur, ...u, id: cur.id, type: u.type || cur.type, kind: u.kind || (u.type && u.type !== cur.type ? undefined : cur.kind) });
    if (!merged) return;
    if (!('x' in u) && !('z' in u)) { merged.x = cur.x; merged.z = cur.z; }
    const moved = 'x' in u || 'z' in u || 's' in u || merged.type !== cur.type;
    scene.objects[i] = merged;
    if (moved) L.place(merged, { objects: scene.objects }, scene.env);
    report && report.updated.push(merged.id);
  };

  L.addTo = function (scene, a, report, taken) {
    const o = L.normObj(a);
    if (!o) { report && report.dropped++; return null; }
    if (scene.objects.length >= 90) { report && report.dropped++; return null; }
    o.id = L.uniqueId(o.id || (o.kind !== o.type && o.type !== 'custom' ? o.kind : o.type) + '1', scene, taken);
    L.place(o, scene, scene.env);
    scene.objects.push(o);
    report && report.added.push(o.id);
    return o;
  };

  // Компактная запись сцены для промпта: без полей по умолчанию
  L.compact = function (scene) {
    const objs = scene.objects.map((o) => {
      const c = { id: o.id, type: o.type };
      if (o.kind && o.kind !== L.TYPES[o.type].kinds[0]) c.kind = o.kind;
      c.x = +(+o.x).toFixed(1); c.z = +(+o.z).toFixed(1);
      if (o.y) c.y = +(+o.y).toFixed(1);
      if (o.rot) c.rot = Math.round(o.rot);
      if (o.s && o.s !== 1) c.s = +o.s.toFixed(2);
      if (o.color) c.color = o.color;
      if (o.color2) c.color2 = o.color2;
      if (o.mat) c.mat = o.mat;
      if (o.anim && o.anim !== 'none') c.anim = o.anim;
      if (o.speed && o.speed !== 1) c.speed = o.speed;
      if (o.on) c.on = o.on;
      if (o.n != null && L.TYPES[o.type].n && o.n !== L.TYPES[o.type].n[2]) c.n = o.n;
      if (o.text) c.text = o.text;
      if (o.parts) c.parts = o.parts;
      return c;
    });
    const env = { ...scene.env };
    if (!env.sky) delete env.sky;
    return { title: scene.title, env, objects: objs };
  };

  // ---------- промпты ----------
  L.catalogText = function () {
    return Object.entries(L.TYPES).map(([t, d]) => `${t}${d.kinds.length > 1 ? ' [' + d.kinds.join('|') + ']' : ''} — ${d.d}`).join('\n');
  };

  L.SYSTEM_BUILD = () => `Ты — Мастер диорам: из слов собираешь игрушечную 3D-сцену на круглом острове-постаменте. Ты пишешь граф сцены на строгом языке, движок его строит.

МИР: остров — круг радиусом 10 с центром (0,0). x — вправо, z — к зрителю (зритель смотрит с +z сверху). Земля y=0. Размеры при s=1: человечек 1.1, кот 0.45, корова 1.2, дом 3.5×3.5, дерево 3.5–4.5, маяк 7, мельница 6, скала 1–6 (n). Если env.sea>0, суша — круг радиусом 10·(1−0.6·sea), вокруг вода: лодки, корабли, рыбы ставь в воду (расстояние от центра больше радиуса суши).

ТИПЫ (type [kind] — смысл):
${L.catalogText()}

ПОЛЯ ОБЪЕКТА: id (латиница, уникальный: house1, cat1), type, kind, x, z, rot (градусы, 0 — фасадом к зрителю), s (масштаб 0.4–2.5), color, color2 ("#rrggbb"), mat (matte|glossy|metal|glass|glow), anim, speed (0.3–3), on (id опоры: кот на крыльце — on дома, самовар — on стола, маяк — on скалы; x,z тогда как у опоры или рядом), y (высота для летающего: облака 7–11, птицы 5–8), n, text.
anim: none|spin (крутится: крылья мельницы, луч маяка)|sway (качается на ветру)|blink (мигает)|bob (качается на волнах, парит)|fly (летает кругами)|walk (гуляет, ездит)|hop (прыгает)|wave (машет рукой)|dance|pulse|swim (плавает по воде)|sleep (спит).
custom: parts — до 14 деталей {"shape":"box|sphere|cylinder|cone|torus|capsule|pyramid|ring","p":[x,y,z] от основания объекта,"s":[ширина,высота,глубина],"r":[градусы x,y,z],"color":"#","mat":"…"}. Собирай из деталей всё, чего нет в каталоге: статую, робота, ракету-кафе, беседку.

ОКРУЖЕНИЕ env: time (morning|day|sunset|night), weather (clear|cloudy|rain|storm|snow|fog), ground (grass|meadow|autumn|snow|sand|desert|rock|moon|mars), sea (0 — нет моря, 0.3–0.7 — остров в море), wind (0–1), sky (необязательно: ["#верх","#низ"] для необычного неба).

ОТВЕТ — JSON с ключами строго в таком порядке (лишние опускай):
{"reply":"одна живая фраза Мастера, что сделано, до 100 знаков, с юмором, без эмодзи","title":"название сцены 2–4 слова","clear":true|false,"env":{…только изменённое…},"remove":["id"],"update":[{"id":"mill1","anim":"spin","speed":2},{"id":"cat1","color":"#f2c94c"}],"add":[{объект},…],"hints":["3 идеи следующей правки, до 4 слов, «добавь…», «сделай…»"]}
В update каждый элемент — id и сами изменённые поля объекта с новыми значениями (как в примере), без обёрток вроде field/value.

ПРАВИЛА:
- Новая сцена (текущая пуста или просят совсем другое): clear:true, полный env, 22–32 объекта в add (не больше 34), числа округляй до одного знака. Порядок в add: от крупного к мелкому — сначала рельеф и постройки, потом деревья, потом мебель и мелочи, потом персонажи и животные, в конце облака и птицы.
- Композиция как у хорошей диорамы: главный объект чуть в стороне от центра, вокруг — группы по смыслу, по краям — деревья, кусты, камни, цветы. Сцена плотная и живая: 2–5 персонажей или животных с анимацией, детали быта. Не ставь крупные объекты ближе 2.5 друг к другу. Всё внутри круга радиусом 9.
- Правка: меняй только то, о чём просят. Сохраняй id. update — только меняемые поля. «Убери кота» → remove. «Ещё два дерева» → add двух новых рядом с остальными. «Сделай ночь» → env.time.
- Цвета подбирай в единой палитре сцены, мягкие и сочные, не кислотные.
- Весь текст по-русски.`;

  L.SYSTEM_MOOD = () => `Ты — помощник Мастера диорам. По просьбе зрителя мгновенно решаешь атмосферу сцены на острове: название, время суток, погоду, грунт, море. Не строишь объекты.
env: time (morning|day|sunset|night), weather (clear|cloudy|rain|storm|snow|fog), ground (grass|meadow|autumn|snow|sand|desert|rock|moon|mars), sea (0 — нет моря, 0.3–0.7 — остров в море: для маяков, кораблей, пиратов), wind (0–1), sky (необязательно, ["#верх","#низ"] для необычного неба: космос, Марс, сказка).
Ответ: {"title":"название сцены 2–4 слова","ack":"короткая живая реплика Мастера, что сейчас начнёт делать, до 60 знаков","env":{…}}.
Если это правка, а не новая сцена, в env клади только то, что меняется (или пустой объект), title не меняй без причины. Весь текст по-русски.`;

  S3.lang = L;
})();
