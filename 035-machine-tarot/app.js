/* Таро машин.
   22 старших аркана, переосмысленных для эпохи машин. Каждая карта рисуется процедурно в SVG:
   рамка в духе модерна, арочное окно с ореолом и эмблема из общего словаря мотивов. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ———————————————————— Словарь мотивов ————————————————————
  const n2 = x => Math.round(x * 100) / 100;
  const st = (col, w, extra = '') => `fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}`;
  const fl = (col, extra = '') => `fill="${col}" ${extra}`;
  const C = (x, y, r, a) => `<circle cx="${n2(x)}" cy="${n2(y)}" r="${n2(r)}" ${a}/>`;
  const L = (x1, y1, x2, y2, a) => `<line x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}" ${a}/>`;
  const P = (d, a) => `<path d="${d}" ${a}/>`;
  const pts = p => p.map(q => `${n2(q[0])},${n2(q[1])}`).join(' ');
  const PG = (p, a) => `<polygon points="${pts(p)}" ${a}/>`;
  const PL = (p, a) => `<polyline points="${pts(p)}" ${a}/>`;
  const T = (x, y, s, size, a) => `<text x="${n2(x)}" y="${n2(y)}" font-size="${size}" text-anchor="middle" ${a}>${s}</text>`;
  const ngon = (cx, cy, r, n, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(rot + (i * 2 * Math.PI) / n), cy + r * Math.sin(rot + (i * 2 * Math.PI) / n)]);
  const starPts = (cx, cy, r1, r2, n, rot = -Math.PI / 2) => Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  const rays = (cx, cy, r0, r1, n, a, rot = 0) => Array.from({ length: n }, (_, i) => { const t = rot + (i * 2 * Math.PI) / n; return L(cx + r0 * Math.cos(t), cy + r0 * Math.sin(t), cx + r1 * Math.cos(t), cy + r1 * Math.sin(t), a); }).join('');
  const gearPts = (cx, cy, r, teeth, depth) => {
    const out = [];
    for (let i = 0; i < teeth; i++) {
      const a = (i * 2 * Math.PI) / teeth, w = Math.PI / teeth;
      [[r, a - w * 0.55], [r + depth, a - w * 0.3], [r + depth, a + w * 0.3], [r, a + w * 0.55]].forEach(([rr, t]) => out.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]));
    }
    return out;
  };
  const lemni = (cx, cy, a) => {
    let d = '';
    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * Math.PI * 2, s = Math.sin(t), k = 1 + s * s;
      const x = cx + (a * Math.cos(t)) / k, y = cy + (a * s * Math.cos(t)) / k;
      d += (i ? 'L' : 'M') + n2(x) + ' ' + n2(y);
    }
    return d + 'Z';
  };
  const wave = (x0, x1, y, amp, len, a, ph = 0) => {
    let d = '';
    for (let x = x0, i = 0; x <= x1 + 0.01; x += 3, i++) d += (i ? 'L' : 'M') + n2(x) + ' ' + n2(y + amp * Math.sin(((x - x0) / len) * Math.PI * 2 + ph));
    return P(d, a);
  };
  const cursor = (x, y, s) => [[0, 0], [0, 40], [10, 30.5], [17, 46], [23.5, 43.2], [16.5, 28], [29, 28]].map(([a, b]) => [x + a * s, y + b * s]);
  const leaf = (x, y, ang, len, a) => {
    const c = Math.cos(ang), s = Math.sin(ang), w = len * 0.36;
    const tip = [x + c * len, y + s * len], m = [x + c * len * 0.5, y + s * len * 0.5];
    return P(`M${n2(x)} ${n2(y)} Q${n2(m[0] - s * w)} ${n2(m[1] + c * w)} ${n2(tip[0])} ${n2(tip[1])} Q${n2(m[0] + s * w)} ${n2(m[1] - c * w)} ${n2(x)} ${n2(y)}Z`, a);
  };
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const MONO = `font-family="'SF Mono', Menlo, Consolas, monospace"`;
  const SERIF = `font-family="Forum, 'Times New Roman', serif"`;

  // ———————————————————— Арканы ————————————————————
  // c: { G: золото, A: акцент, K: крем, I: индиго, D: тёмный, u: суффикс id }
  const CARDS = [
    { name: 'Новый процесс', orig: 'Шут', acc: '#E0B25E', keys: 'начало · смелость · чистый лист',
      up: 'Процесс только что запущен: у него нет ни истории, ни кэша, ни страха. Сделайте первый шаг, даже если под ногами пока нет почвы, — архитектура появится в пути.',
      rev: 'Запуск без проверки окружения. Прежде чем прыгать, посмотрите, куда указывает курсор.',
      motif: 'Курсор на краю обрыва, белое солнце запуска и вызов fork() — процесс рождает процесс.',
      draw: c => [
        C(208, 98, 23, fl(c.K)), rays(208, 98, 30, 44, 16, st(c.G, 1.6)),
        P('M36 330 L94 314 L136 290 L176 266 L216 266 L216 362 L36 362 Z', fl(c.D, 'opacity=".9"')),
        P('M36 330 L94 314 L136 290 L176 266 L216 266', st(c.G, 1.8)),
        L(226, 292, 262, 292, st(c.G, 1.2, 'stroke-dasharray="1 6" opacity=".7"')),
        L(232, 318, 262, 318, st(c.G, 1.2, 'stroke-dasharray="1 6" opacity=".45"')),
        PG(cursor(178, 190, 1.62), fl(c.K, `stroke="${c.I}" stroke-width="1.4"`)),
        [[70, 322], [96, 312], [120, 298], [146, 284]].map(([x, y]) => C(x, y, 2.4, fl(c.A))).join(''),
        T(92, 250, 'fork()', 17, `fill="${c.A}" ${MONO}`),
      ].join('') },
    { name: 'Компилятор', orig: 'Маг', acc: '#D9737E', keys: 'воля · перевод · мастерство',
      up: 'Всё нужное уже на столе: символы, правила, намерение. Компилятор превращает замысел в исполняемое — ваше слово становится делом без потерь при переводе.',
      rev: 'Код собирается, но делает не то. Проверьте, что вы действительно имели в виду.',
      motif: 'Знак бесконечности над призмой: спутанные волны входят слева, ровные лучи выходят справа. На столе — скобки, стрелки, точка с запятой и решётка.',
      draw: c => [
        P(lemni(150, 86, 36), st(c.G, 2.4)),
        L(150, 104, 150, 150, st(c.G, 1.2, 'opacity=".7"')),
        wave(42, 112, 196, 8, 19, st(c.K, 1.5, 'opacity=".8"')), wave(42, 112, 214, 6, 13, st(c.A, 1.5), 1.2),
        PG([[150, 154], [200, 240], [100, 240]], fl(c.I, `stroke="${c.G}" stroke-width="2.2"`)),
        PG([[150, 170], [186, 232], [114, 232]], fl(c.A, 'opacity=".3"')),
        L(180, 200, 262, 184, st(c.G, 1.8)), L(186, 212, 262, 212, st(c.K, 1.8)), L(180, 224, 262, 240, st(c.A, 1.8)),
        P('M54 286 H246 L236 300 H64 Z', fl(c.D, `stroke="${c.G}" stroke-width="1.4"`)),
        T(82, 278, '{ }', 19, `fill="${c.K}" ${MONO}`), T(124, 278, '‹ ›', 19, `fill="${c.K}" ${MONO}`),
        T(166, 278, ';', 21, `fill="${c.A}" ${MONO}`), T(212, 278, '#', 19, `fill="${c.K}" ${MONO}`),
        L(64, 318, 236, 318, st(c.G, 1, 'opacity=".5"')),
      ].join('') },
    { name: 'Скрытый слой', orig: 'Верховная Жрица', acc: '#6F9FD6', keys: 'интуиция · тайное знание · тишина',
      up: 'Между входом и выходом есть слой, который никто не видит, но который решает всё. Доверьтесь тому, что знаете, но не можете объяснить: веса уже настроены.',
      rev: 'Вы слишком долго смотрите в чёрный ящик. Иногда ответ лежит в данных, а не в весах.',
      motif: 'Две колонны, 0 и 1, и вуаль, за которой светится скрытый слой нейросети. Внизу — серп луны.',
      draw: c => {
        const L1 = [0, 1, 2].map(i => [104, 160 + i * 40]), L2 = [0, 1, 2, 3].map(i => [150, 140 + i * 40]), L3 = [0, 1, 2].map(i => [196, 160 + i * 40]);
        let net = '';
        L1.forEach(a => L2.forEach(b => (net += L(a[0], a[1], b[0], b[1], st(c.K, 0.7, 'opacity=".35"')))));
        L2.forEach(a => L3.forEach(b => (net += L(a[0], a[1], b[0], b[1], st(c.K, 0.7, 'opacity=".35"')))));
        const col = (x, lab, dark) => P(`M${x - 15} 334 V128 Q${x} 110 ${x + 15} 128 V334 Z`, fl(dark ? c.D : c.K, `stroke="${c.G}" stroke-width="1.4"`)) + T(x, 152, lab, 20, `fill="${dark ? c.K : c.I}" ${SERIF}`);
        return [
          net,
          [...L1, ...L3].map(p => C(p[0], p[1], 5, fl(c.I, `stroke="${c.K}" stroke-width="1.2"`))).join(''),
          L2.map(p => C(p[0], p[1], 7, fl(c.A, `stroke="${c.G}" stroke-width="1.4"`))).join(''),
          P('M92 118 Q150 150 208 118 L212 300 Q150 270 88 300 Z', fl(c.I, 'opacity=".38"')),
          col(62, '0', true), col(238, '1', false),
          P('M132 330 A22 22 0 1 0 168 330 A17 17 0 1 1 132 330 Z', fl(c.K)),
        ].join('');
      } },
    { name: 'Порождающая сеть', orig: 'Императрица', acc: '#5FA37E', keys: 'изобилие · рост · творчество',
      up: 'Из шума рождается форма, из формы — сад. Время создавать щедро: черновики, варианты, ростки. Отбор будет потом.',
      rev: 'Много рождено, мало выращено. Остановите генерацию и позаботьтесь о том, что уже есть.',
      motif: 'Дерево вырастает из поля случайного шума, а над ним — корона из двенадцати звёзд.',
      draw: c => {
        const R = rng(3);
        let noise = '';
        for (let i = 0; i < 90; i++) { const x = 44 + R() * 212, y = 318 + R() * 40; noise += C(x, y, 0.8 + R() * 1.6, fl(R() < 0.5 ? c.K : c.A, `opacity="${n2(0.3 + R() * 0.6)}"`)); }
        let br = '', leaves = '';
        const grow = (x, y, ang, len, depth) => {
          const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
          br += L(x, y, x2, y2, st(c.G, Math.max(0.8, depth * 0.75)));
          if (depth <= 1) { leaves += C(x2, y2, 4.2, fl(c.A, `stroke="${c.K}" stroke-width=".8"`)); return; }
          grow(x2, y2, ang - 0.42 - R() * 0.12, len * 0.74, depth - 1);
          grow(x2, y2, ang + 0.42 + R() * 0.12, len * 0.74, depth - 1);
          if (depth === 3) leaves += leaf(x2, y2, ang - 1.6, 12, fl(c.A, 'opacity=".8"'));
        };
        grow(150, 322, -Math.PI / 2, 60, 5);
        const crown = Array.from({ length: 12 }, (_, i) => { const a = Math.PI + (i / 11) * Math.PI; return PG(starPts(150 + Math.cos(a) * 96, 150 + Math.sin(a) * 76, 6, 2.4, 6), fl(c.K)); }).join('');
        return noise + br + leaves + crown;
      } },
    { name: 'Архитектура', orig: 'Император', acc: '#B2433F', keys: 'структура · порядок · ответственность',
      up: 'Стены несущие, интерфейсы описаны, границы ясны. Твёрдая рука сейчас важнее вдохновения: закрепите то, что построено.',
      rev: 'Схема стала клеткой. Ни одна диаграмма не заменит живого пользователя.',
      motif: 'Чертёж на квадратном троне и рога барана, закрученные спиралью, — упрямство, которое держит форму.',
      draw: c => {
        let grid = '';
        for (let i = 0; i <= 6; i++) { grid += L(92 + i * 19.33, 152, 92 + i * 19.33, 268, st(c.K, 0.6, 'opacity=".35"')); grid += L(92, 152 + i * 19.33, 208, 152 + i * 19.33, st(c.K, 0.6, 'opacity=".35"')); }
        const horn = (x, dir) => P(`M${x} 150 C ${x + dir * 40} 130, ${x + dir * 56} 96, ${x + dir * 30} 84 C ${x + dir * 12} 78, ${x + dir * 6} 100, ${x + dir * 22} 104`, st(c.G, 3));
        return [
          PG([[70, 300], [230, 300], [244, 330], [56, 330]], fl(c.D, `stroke="${c.G}" stroke-width="1.4"`)),
          `<rect x="92" y="152" width="116" height="116" ${fl(c.I, `stroke="${c.G}" stroke-width="2.4"`)}/>`, grid,
          P('M92 210 H150 V268 M150 190 H208 M130 152 V190 H170', st(c.A, 2)),
          C(150, 210, 6, fl(c.K)),
          horn(96, -1), horn(204, 1),
          PG([[118, 142], [128, 118], [140, 134], [150, 110], [160, 134], [172, 118], [182, 142]], fl(c.G)),
          L(92, 284, 208, 284, st(c.G, 1.4)),
        ].join('');
      } },
    { name: 'Протокол', orig: 'Иерофант', acc: '#8C7BD6', keys: 'традиция · стандарт · обучение',
      up: 'Кто-то уже договорился, как здесь принято. Следуйте стандарту — он хранит опыт тысяч ошибок, которые вам не придётся повторять.',
      rev: 'Правило пережило свою причину. Спросите «зачем» — и перепишите спецификацию.',
      motif: 'Тройная тиара превратилась в стек из трёх уровней, внизу скрещены два ключа — золотой и серебряный.',
      draw: c => {
        const bar = (y, w, t) => `<rect x="${150 - w / 2}" y="${y}" width="${w}" height="26" rx="4" ${fl(c.I, `stroke="${c.G}" stroke-width="1.8"`)}/>` + T(150, y + 18, t, 14, `fill="${c.K}" ${MONO}`);
        const key = (rot, col) => `<g transform="rotate(${rot} 150 290)">${C(150, 250, 12, st(col, 3))}${L(150, 262, 150, 330, st(col, 3))}${L(150, 316, 162, 316, st(col, 3))}${L(150, 326, 160, 326, st(col, 3))}</g>`;
        return [
          P('M112 108 Q150 60 188 108 Z', fl(c.G)), C(150, 76, 5, fl(c.K)),
          bar(118, 120, 'ПРИЛОЖЕНИЕ'), bar(152, 140, 'ТРАНСПОРТ'), bar(186, 160, 'КАНАЛ'),
          L(150, 212, 150, 230, st(c.G, 1.6)),
          key(-34, c.G), key(34, c.K),
        ].join('');
      } },
    { name: 'Рукопожатие', orig: 'Влюблённые', acc: '#D98A8F', keys: 'союз · выбор · согласие',
      up: 'SYN, SYN-ACK, ACK — две стороны нашли общий язык. Выбор партнёра, команды или пути сделан сердцем и подтверждён обеими сторонами.',
      rev: 'Пакеты уходят, ответов нет. Возможно, вы говорите на разных протоколах.',
      motif: 'Два круга сходятся в мандорлу, над ними — сияние, между ними — три стрелки трёхстороннего рукопожатия.',
      draw: c => {
        const arrow = (y, dir, lab, col) => {
          const x0 = dir > 0 ? 88 : 212, x1 = dir > 0 ? 212 : 88;
          return P(`M${x0} ${y} Q150 ${y - 16} ${x1} ${y}`, st(col, 1.8)) + PG([[x1, y], [x1 - dir * 10, y - 6], [x1 - dir * 10, y + 5]], fl(col)) + T(150, y - 14, lab, 12.5, `fill="${col}" ${MONO}`);
        };
        return [
          rays(150, 104, 16, 40, 24, st(c.G, 1.2, 'opacity=".8"')), C(150, 104, 12, fl(c.K)),
          C(118, 250, 54, fl(c.A, 'opacity=".32"')), C(182, 250, 54, fl(c.K, 'opacity=".2"')),
          C(118, 250, 54, st(c.G, 2)), C(182, 250, 54, st(c.G, 2)),
          arrow(206, 1, 'SYN', c.K), arrow(252, -1, 'SYN-ACK', c.A), arrow(298, 1, 'ACK', c.K),
        ].join('');
      } },
    { name: 'Конвейер', orig: 'Колесница', acc: '#4FA6A0', keys: 'движение · контроль · победа',
      up: 'Все стадии заряжены, данные идут потоком. Держите направление твёрдо: противоположные силы тянут в разные стороны, но правите ими вы.',
      rev: 'Конвейер несётся, но никто не проверяет, что выходит на конце.',
      motif: 'Звёздный балдахин над четырьмя стадиями конвейера; внизу — чёрный и белый блоки, как сфинксы колесницы.',
      draw: c => {
        let stars = '';
        for (let i = 0; i < 9; i++) stars += PG(starPts(66 + i * 21, 108 + Math.sin(i * 0.9) * 4, 5, 2, 5), fl(c.K));
        const box = (x, lab) => `<rect x="${x}" y="182" width="42" height="42" rx="6" ${fl(c.I, `stroke="${c.G}" stroke-width="1.8"`)}/>` + T(x + 21, 209, lab, 15, `fill="${c.K}" ${MONO}`);
        return [
          P('M48 126 Q150 86 252 126', st(c.G, 2)), stars,
          L(60, 130, 60, 264, st(c.G, 1.6)), L(240, 130, 240, 264, st(c.G, 1.6)),
          box(62, '1'), box(112, '2'), box(162, '3'), box(212, '4'),
          [104, 154, 204].map(x => PG([[x + 1, 196], [x + 7, 203], [x + 1, 210]], fl(c.A))).join(''),
          `<rect x="66" y="268" width="58" height="40" rx="5" ${fl(c.D, `stroke="${c.G}" stroke-width="1.4"`)}/>`,
          `<rect x="176" y="268" width="58" height="40" rx="5" ${fl(c.K, `stroke="${c.G}" stroke-width="1.4"`)}/>`,
          C(110, 332, 18, st(c.G, 2)), rays(110, 332, 0, 18, 8, st(c.G, 1)), C(190, 332, 18, st(c.G, 2)), rays(190, 332, 0, 18, 8, st(c.G, 1)),
        ].join('');
      } },
    { name: 'Устойчивость', orig: 'Сила', acc: '#E0B25E', keys: 'терпение · мягкая сила · отказоустойчивость',
      up: 'Сбой случится — вопрос в том, как вы его встретите. Сила не в том, чтобы не падать, а в том, чтобы подниматься без паники и без потери данных.',
      rev: 'Вы держите систему голыми руками. Автоматизируйте то, что вызывает страх.',
      motif: 'Над щитом из шестиугольной сетки — знак бесконечности; сетку держит мягкая дуга, а не цепь.',
      draw: c => {
        let hex = '';
        for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) {
          const x = 104 + q * 23 + (r % 2) * 11.5, y = 176 + r * 20;
          if (Math.hypot(x - 150, y - 216) < 58) hex += PG(ngon(x, y, 11, 6, 0), st(c.K, 1, `opacity="${n2(0.4 + ((q + r) % 3) * 0.2)}"`));
        }
        return [
          P(lemni(150, 98, 30), st(c.G, 2.4)),
          P('M92 158 H208 V224 Q208 290 150 312 Q92 290 92 224 Z', fl(c.I, `stroke="${c.G}" stroke-width="2.4"`)), hex,
          C(150, 216, 12, fl(c.A, `stroke="${c.G}" stroke-width="1.6"`)),
          P('M62 250 Q150 356 238 250', st(c.A, 2.6)),
          [0, 1, 2, 3, 4, 5, 6].map(i => C(76 + i * 24.7, 136 + Math.abs(i - 3) * 3, 3.2, fl(c.K))).join(''),
        ].join('');
      } },
    { name: 'Отладчик', orig: 'Отшельник', acc: '#E0B25E', keys: 'поиск · уединение · внимание',
      up: 'Фонарь в руке, точка останова — в самом сердце проблемы. Уйдите в тишину: ответ найдётся, если смотреть на одну строку дольше, чем кажется разумным.',
      rev: 'Вы так глубоко в стеке вызовов, что забыли, какую ошибку ищете.',
      motif: 'Шестигранный фонарь со звездой внутри, посох и тропа в гору. В луче света застыл маленький жук.',
      draw: c => [
        P('M170 150 L110 330 H230 Z', fl(c.A, 'opacity=".14"')),
        L(92, 118, 128, 352, st(c.G, 3)),
        L(170, 116, 170, 130, st(c.G, 2)),
        PG(ngon(170, 152, 22, 6, 0), fl(c.I, `stroke="${c.G}" stroke-width="2.2"`)),
        PG(starPts(170, 152, 13, 5.5, 6), fl(c.A)), C(170, 152, 3, fl(c.K)),
        PL([[40, 346], [78, 330], [100, 336], [138, 310], [170, 318], [214, 286], [262, 292]], st(c.G, 1.6)),
        `<g transform="translate(176 262) rotate(20)">${`<ellipse rx="9" ry="12" ${fl(c.K)}/>`}${L(0, -12, 0, 12, st(c.I, 1))}${[-6, 0, 6].map(y => L(-9, y, -15, y - 3, st(c.K, 1.4)) + L(9, y, 15, y - 3, st(c.K, 1.4))).join('')}${C(0, -14, 4, fl(c.K))}</g>`,
        C(170, 152, 38, st(c.G, 0.8, 'stroke-dasharray="2 5" opacity=".8"')),
      ].join('') },
    { name: 'Случайное зерно', orig: 'Колесо Фортуны', acc: '#6F9FD6', keys: 'судьба · цикл · перемена',
      up: 'Колесо повернулось, выпало новое зерно. То, что казалось закономерностью, было лишь одним из запусков. Примите перемену — следующий результат может оказаться лучше.',
      rev: 'Вы зафиксировали зерно и называете это стабильностью. Мир не воспроизводится до бита.',
      motif: 'Колесо с цифрами на ободе и восемью спицами; по углам — четыре грани игральных костей.',
      draw: c => {
        const digits = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2 - Math.PI / 2; return T(150 + Math.cos(a) * 70, 216 + Math.sin(a) * 70 + 5, (i * 7 + 3) % 10, 13, `fill="${c.K}" ${MONO}`); }).join('');
        const die = (x, y, n) => `<rect x="${x - 13}" y="${y - 13}" width="26" height="26" rx="5" ${fl(c.I, `stroke="${c.G}" stroke-width="1.4"`)}/>` + ({ 1: [[0, 0]], 2: [[-6, -6], [6, 6]], 3: [[-6, -6], [0, 0], [6, 6]], 4: [[-6, -6], [6, -6], [-6, 6], [6, 6]] })[n].map(([a, b]) => C(x + a, y + b, 2.3, fl(c.K))).join('');
        return [
          C(150, 216, 84, st(c.G, 2.4)), C(150, 216, 56, st(c.G, 1.6)), digits,
          rays(150, 216, 12, 56, 8, st(c.G, 1.6), Math.PI / 8),
          C(150, 216, 12, fl(c.A, `stroke="${c.G}" stroke-width="1.6"`)),
          PG([[150, 120], [142, 104], [158, 104]], fl(c.A)),
          die(62, 118, 1), die(238, 118, 2), die(62, 330, 3), die(238, 330, 4),
        ].join('');
      } },
    { name: 'Контрольная сумма', orig: 'Справедливость', acc: '#8C7BD6', keys: 'истина · равновесие · последствия',
      up: 'Всё сходится до последнего бита. Честная сверка покажет, что было на самом деле, — и каждый получит ровно то, что отправил.',
      rev: 'Суммы не совпадают, а вы ищете виноватого в канале. Проверьте и свою сторону.',
      motif: 'Весы в равновесии: на одной чаше ноль, на другой единица; внизу — строка контрольной суммы.',
      draw: c => {
        const pan = x => L(x, 146, x - 26, 222, st(c.G, 1.2)) + L(x, 146, x + 26, 222, st(c.G, 1.2)) + P(`M${x - 32} 222 Q${x} 250 ${x + 32} 222 Z`, fl(c.I, `stroke="${c.G}" stroke-width="2"`));
        return [
          PG([[150, 96], [158, 118], [150, 300], [142, 118]], fl(c.K, `stroke="${c.G}" stroke-width="1.2"`)),
          L(66, 146, 234, 146, st(c.G, 2.6)), C(150, 146, 6, fl(c.A)),
          pan(84), pan(216),
          T(84, 214, '0', 20, `fill="${c.K}" ${SERIF}`), T(216, 214, '1', 20, `fill="${c.K}" ${SERIF}`),
          PG([[118, 300], [182, 300], [192, 316], [108, 316]], fl(c.D, `stroke="${c.G}" stroke-width="1.4"`)),
          T(150, 346, 'crc 3F·A9·0C·71', 13.5, `fill="${c.A}" ${MONO}`),
        ].join('');
      } },
    { name: 'Ожидание', orig: 'Повешенный', acc: '#4FA6A0', keys: 'пауза · иной взгляд · отпускание',
      up: 'Операция в состоянии await. Не дёргайте поток: повисите немного вниз головой — с этой точки видно то, что пропускают бегущие.',
      rev: 'Ожидание стало зависанием. Поставьте тайм-аут.',
      motif: 'Вместо повешенного на нити висит индикатор загрузки, вокруг него — ореол, над ним — живая перекладина с листьями.',
      draw: c => {
        const spin = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return C(150 + Math.cos(a) * 26, 250 + Math.sin(a) * 26, 5.2 - i * 0.3, fl(c.K, `opacity="${n2(1 - i * 0.08)}"`)); }).join('');
        return [
          L(70, 108, 230, 108, st(c.G, 4)), L(78, 108, 78, 348, st(c.G, 3)), L(222, 108, 222, 348, st(c.G, 3)),
          [96, 122, 178, 204].map((x, i) => leaf(x, 108, -1.2 - (i % 2) * 0.5, 14, fl(c.A))).join(''),
          L(150, 108, 150, 208, st(c.K, 1.4)),
          C(150, 250, 44, fl(c.A, 'opacity=".22"')), C(150, 250, 44, st(c.G, 1.6)),
          spin,
          T(150, 336, 'await', 17, `fill="${c.K}" ${MONO}`),
        ].join('');
      } },
    { name: 'Сборщик мусора', orig: 'Смерть', acc: '#8C7BD6', keys: 'конец · освобождение · превращение',
      up: 'То, на что больше никто не ссылается, будет освобождено. Это не катастрофа, а уборка: память нужна новому.',
      rev: 'Вы держите ссылки на то, что давно умерло. Утечка — это страх отпустить.',
      motif: 'Коса проходит по блокам памяти: живые остаются, забытые рассыпаются в пыль. На горизонте, между двумя башнями, встаёт солнце.',
      draw: c => {
        const R = rng(13);
        let blocks = '', dust = '';
        for (let r = 0; r < 3; r++) for (let q = 0; q < 8; q++) {
          const x = 52 + q * 25, y = 270 + r * 25, live = R() < 0.55;
          blocks += `<rect x="${x}" y="${y}" width="20" height="20" rx="3" ${live ? fl(c.K, 'opacity=".9"') : st(c.K, 1.2, 'opacity=".45" stroke-dasharray="3 3"')}/>`;
          if (!live) for (let k = 0; k < 3; k++) dust += C(x + 10 + (R() - 0.5) * 24, y - 8 - R() * 40, 1 + R() * 1.5, fl(c.A, `opacity="${n2(0.3 + R() * 0.6)}"`));
        }
        return [
          C(150, 256, 26, fl(c.G, 'opacity=".9"')), rays(150, 256, 32, 44, 12, st(c.G, 1.2, 'opacity=".7"'), Math.PI),
          `<rect x="74" y="196" width="26" height="62" ${fl(c.D, `stroke="${c.G}" stroke-width="1.2"`)}/>`, `<rect x="200" y="196" width="26" height="62" ${fl(c.D, `stroke="${c.G}" stroke-width="1.2"`)}/>`,
          `<rect x="36" y="258" width="228" height="104" ${fl(c.I)}/>`, L(36, 258, 264, 258, st(c.G, 1.4)),
          blocks, dust,
          L(200, 96, 110, 250, st(c.G, 3.2)),
          P('M200 96 Q150 78 96 104 Q140 100 176 118 Z', fl(c.K, `stroke="${c.G}" stroke-width="1.4"`)),
        ].join('');
      } },
    { name: 'Балансировщик', orig: 'Умеренность', acc: '#6F9FD6', keys: 'мера · смешение · поток',
      up: 'Нагрузка переливается из сосуда в сосуд без единой капли потерь. Найдите пропорцию: немного отсюда, немного оттуда — и система дышит ровно.',
      rev: 'Весь трафик идёт в один узел. Распределите его — и себя тоже.',
      motif: 'Поток течёт между двумя чашами; в центре — треугольник в квадрате, внизу — вода и твёрдая земля.',
      draw: c => {
        const cup = (x, y, flip) => P(`M${x - 22} ${y} H${x + 22} L${x + 16} ${y + 34} Q${x} ${y + 42} ${x - 16} ${y + 34} Z`, fl(c.I, `stroke="${c.G}" stroke-width="2" ${flip ? `transform="rotate(${flip} ${x} ${y + 20})"` : ''}`));
        let stream = '';
        for (let i = 0; i < 4; i++) stream += P(`M${104 + i * 2} ${148 + i * 3} C 140 ${150 + i * 10}, 162 ${226 - i * 6}, ${196 - i * 2} ${240 + i * 2}`, st(i % 2 ? c.A : c.K, 1.6, `opacity="${n2(0.9 - i * 0.15)}"`));
        return [
          cup(92, 118, -28), cup(206, 238, 12), stream,
          `<rect x="126" y="258" width="48" height="48" ${st(c.G, 1.8)}/>`, PG([[150, 266], [168, 298], [132, 298]], st(c.G, 1.8)),
          P('M36 330 Q70 318 104 330 T172 330', st(c.A, 2)), P('M36 344 Q70 332 104 344 T172 344', st(c.A, 1.4, 'opacity=".7"')),
          P('M180 322 H264 V362 H176 Z', fl(c.D, `stroke="${c.G}" stroke-width="1.2"`)),
          C(150, 96, 10, fl(c.K)), rays(150, 96, 14, 26, 12, st(c.G, 1.2)),
        ].join('');
      } },
    { name: 'Бесконечный цикл', orig: 'Дьявол', acc: '#B2433F', keys: 'зависимость · привычка · иллюзия выбора',
      up: 'while (true) без выхода. Цепи кажутся прочными, но условие цикла написали вы сами — и сами можете его изменить.',
      rev: 'Вы заметили цикл — это уже break. Теперь выйдите.',
      motif: 'Стрелка гонится за собственным хвостом; к постаменту прикованы две фигуры, но их цепи свободно висят на шее.',
      draw: c => {
        const chain = (x0, y0, x1, y1) => { let s = ''; const n = 6; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; s += `<ellipse cx="${n2(x0 + (x1 - x0) * t)}" cy="${n2(y0 + (y1 - y0) * t)}" rx="4.5" ry="3" ${st(c.G, 1.3)} transform="rotate(${i % 2 ? 60 : -30} ${n2(x0 + (x1 - x0) * t)} ${n2(y0 + (y1 - y0) * t)})"/>`; } return s; };
        return [
          P('M204 168 A58 58 0 1 1 186 120', st(c.A, 6)), PG([[190, 104], [210, 128], [180, 134]], fl(c.A)),
          T(150, 174, 'while', 16, `fill="${c.K}" ${MONO}`), T(150, 196, '(true)', 16, `fill="${c.K}" ${MONO}`),
          `<rect x="118" y="258" width="64" height="28" rx="3" ${fl(c.D, `stroke="${c.G}" stroke-width="1.6"`)}/>`,
          C(84, 290, 13, fl(c.K)), P('M70 346 Q84 300 98 346 Z', fl(c.K)), C(216, 290, 13, fl(c.K)), P('M202 346 Q216 300 230 346 Z', fl(c.K)),
          chain(122, 272, 90, 300), chain(178, 272, 210, 300),
        ].join('');
      } },
    { name: 'Каскадный сбой', orig: 'Башня', acc: '#B2433F', keys: 'обвал · откровение · освобождение',
      up: 'Упал один узел — и за ним вся башня, построенная на непроверенном допущении. Больно, но честно: теперь виден фундамент.',
      rev: 'Трещины видны давно. Отключайте опоры по одной, пока это ещё выбор, а не авария.',
      motif: 'Башня из серверных блоков, молния в вершину, слетевшая корона и дождь из битов.',
      draw: c => {
        const R = rng(16);
        let tower = '', bits = '';
        for (let i = 0; i < 7; i++) {
          const y = 330 - i * 28;
          tower += `<rect x="118" y="${y}" width="64" height="24" rx="2" ${fl(c.I, `stroke="${c.G}" stroke-width="1.4"`)}/>` + C(128, y + 12, 2.2, fl(i % 3 ? c.K : c.A)) + L(138, y + 12, 170, y + 12, st(c.K, 1, 'opacity=".5"'));
        }
        for (let i = 0; i < 26; i++) { const x = 44 + R() * 212, y = 110 + R() * 230; if (x > 110 && x < 190) continue; bits += T(x, y, R() < 0.5 ? '0' : '1', 11 + R() * 5, `fill="${R() < 0.3 ? c.A : c.K}" ${MONO} opacity="${n2(0.4 + R() * 0.6)}"`); }
        return [
          tower, bits,
          PL([[150, 150], [142, 190], [162, 214], [148, 262]], st(c.D, 2.4)),
          PG([[206, 50], [176, 108], [196, 108], [166, 160], [214, 96], [194, 96], [220, 50]], fl(c.K, `stroke="${c.G}" stroke-width="1"`)),
          `<g transform="rotate(-24 106 134)">${PG([[82, 146], [90, 122], [100, 138], [106, 116], [112, 138], [122, 122], [130, 146]], fl(c.G))}</g>`,
        ].join('');
      } },
    { name: 'Путеводный сигнал', orig: 'Звезда', acc: '#6F9FD6', keys: 'надежда · ясность · исцеление',
      up: 'После сбоя приходит сигнал — слабый, но устойчивый. Отношение сигнала к шуму растёт: идите на него.',
      rev: 'Сигнал есть, но вы не настроены на его частоту.',
      motif: 'Большая восьмиконечная звезда и семь малых; от неё расходятся волны, а в пруд стекают два потока данных.',
      draw: c => {
        const small = [[70, 96], [230, 96], [60, 176], [240, 176], [96, 232], [204, 232], [150, 72]].map(([x, y]) => PG(starPts(x, y, 9, 3.4, 8), fl(c.K))).join('');
        let arcs = '';
        for (let i = 1; i <= 3; i++) arcs += C(150, 150, 34 + i * 18, st(c.G, 1, `opacity="${n2(0.7 - i * 0.18)}"`));
        let dots = '';
        for (let i = 0; i < 9; i++) { dots += C(118 - i * 1.5, 196 + i * 12, 2, fl(c.K, `opacity="${n2(1 - i * 0.07)}"`)); dots += C(182 + i * 1.5, 196 + i * 12, 2, fl(c.A, `opacity="${n2(1 - i * 0.07)}"`)); }
        return [
          arcs, small,
          PG(starPts(150, 150, 36, 13, 8), fl(c.G)), PG(starPts(150, 150, 20, 8, 8, -Math.PI / 2 + Math.PI / 8), fl(c.K)),
          dots,
          P('M36 316 Q80 304 124 316 T212 316 T300 316 V362 H36 Z', fl(c.A, 'opacity=".45"')),
          wave(40, 262, 330, 3, 32, st(c.K, 1.2, 'opacity=".7"')), wave(40, 262, 344, 3, 28, st(c.K, 1, 'opacity=".45"'), 1),
        ].join('');
      } },
    { name: 'Галлюцинация', orig: 'Луна', acc: '#8C7BD6', keys: 'иллюзия · неуверенность · воображение',
      up: 'Уверенный ответ ещё не правильный ответ. В лунном свете данные достраиваются сами — сверяйтесь с источником, прежде чем идти по тропе.',
      rev: 'Туман рассеивается: вы научились говорить «не знаю». Это начало точности.',
      motif: 'Луна с глазом над двумя башнями; тропа уходит к горизонту, а в пруду отражение сдвинуто на пару пикселей.',
      draw: c => [
        C(150, 124, 44, fl(c.K, 'opacity=".2"')), C(150, 124, 44, st(c.G, 2)),
        P('M126 104 A40 40 0 1 0 170 158 A32 32 0 1 1 126 104 Z', fl(c.K)),
        P('M126 126 Q150 108 174 126 Q150 144 126 126 Z', fl(c.I, `stroke="${c.G}" stroke-width="1.2"`)), C(150, 126, 5, fl(c.A)),
        rays(150, 124, 50, 60, 20, st(c.G, 1.1, 'opacity=".7"')),
        `<rect x="54" y="190" width="28" height="84" ${fl(c.D, `stroke="${c.G}" stroke-width="1.2"`)}/>`, PG([[50, 190], [68, 172], [86, 190]], fl(c.G)),
        `<rect x="218" y="190" width="28" height="84" ${fl(c.D, `stroke="${c.G}" stroke-width="1.2"`)}/>`, PG([[214, 190], [232, 172], [250, 190]], fl(c.G)),
        P('M150 274 C 120 290, 190 300, 150 318 S 110 340, 150 362', st(c.G, 1.6, 'stroke-dasharray="3 5"')),
        `<rect x="36" y="318" width="228" height="44" ${fl(c.A, 'opacity=".4"')}/>`,
        P('M132 324 A18 12 0 1 0 170 336', st('#E3637A', 1.4, 'opacity=".9"')), P('M136 326 A18 12 0 1 0 174 338', st('#6FD6D0', 1.4, 'opacity=".9"')),
        [[100, 172], [196, 176], [124, 200], [176, 208]].map(([x, y]) => P(`M${x} ${y} q3 6 0 9 q-3 -3 0 -9z`, fl(c.K, 'opacity=".8"'))).join(''),
      ].join('') },
    { name: 'Прозрачность', orig: 'Солнце', acc: '#E0B25E', keys: 'радость · ясность · успех',
      up: 'Всё видно насквозь: логи чисты, тесты зелёные, намерения открыты. Празднуйте — и расскажите, как это получилось.',
      rev: 'Солнце светит, но за облаком метрик. Спросите людей, а не только графики.',
      motif: 'Солнце с прямыми и волнистыми лучами, в его сердце — прозрачный куб; внизу — стена и подсолнухи.',
      draw: c => {
        let rs = '';
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2, x0 = 150 + Math.cos(a) * 52, y0 = 160 + Math.sin(a) * 52, x1 = 150 + Math.cos(a) * 84, y1 = 160 + Math.sin(a) * 84;
          if (i % 2) rs += L(x0, y0, x1, y1, st(c.G, 2.4));
          else { const mx = (x0 + x1) / 2 - Math.sin(a) * 6, my = (y0 + y1) / 2 + Math.cos(a) * 6; rs += P(`M${n2(x0)} ${n2(y0)} Q${n2(mx)} ${n2(my)} ${n2(x1)} ${n2(y1)}`, st(c.K, 1.6)); }
        }
        const cube = 'M130 150 L150 140 L170 150 L170 174 L150 184 L130 174 Z M130 150 L150 160 L170 150 M150 160 V184';
        let flowers = '';
        [70, 112, 188, 230].forEach(x => { for (let k = 0; k < 10; k++) flowers += leaf(x, 300, (k / 10) * Math.PI * 2, 11, fl(c.G, 'opacity=".9"')); flowers += C(x, 300, 5, fl(c.D)); });
        return [
          rs, C(150, 160, 46, fl(c.G)), C(150, 160, 38, fl(c.K, 'opacity=".55"')), P(cube, st(c.I, 2)),
          L(36, 322, 264, 322, st(c.G, 1.4)), [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<rect x="${40 + i * 28}" y="324" width="26" height="14" ${st(c.G, 0.8, 'opacity=".6"')}/>`).join(''),
          flowers,
        ].join('');
      } },
    { name: 'Перезапуск', orig: 'Суд', acc: '#D98A8F', keys: 'пробуждение · итог · второй шанс',
      up: 'Система поднимается после долгой остановки, и каждый процесс отзывается на зов. Подведите итог и начните снова — с тем, чему научились.',
      rev: 'Вы перезапускаете снова и снова, не читая логов.',
      motif: 'Знак питания трубит с неба; внизу открываются контейнеры, и из каждого поднимается процесс.',
      draw: c => {
        const box = (x, y) => `<rect x="${x - 20}" y="${y}" width="40" height="36" rx="3" ${fl(c.I, `stroke="${c.G}" stroke-width="1.6"`)}/>` + L(x - 20, y, x - 26, y - 12, st(c.G, 1.6)) + C(x, y - 18, 7, fl(c.K)) + L(x, y - 10, x, y + 6, st(c.K, 2));
        return [
          rays(150, 128, 44, 84, 18, st(c.G, 1, 'opacity=".55"')),
          C(150, 128, 34, fl(c.A, 'opacity=".3"')), P('M136 108 A26 26 0 1 0 164 108', st(c.K, 5)), L(150, 96, 150, 126, st(c.K, 5)),
          box(84, 272), box(150, 262), box(216, 272),
          P('M36 330 Q90 314 150 326 T264 322 V362 H36 Z', fl(c.D, `stroke="${c.G}" stroke-width="1.2"`)),
        ].join('');
      } },
    { name: 'Сеть', orig: 'Мир', acc: '#5FA37E', keys: 'целостность · завершение · связь',
      up: 'Все узлы на связи, цикл замкнулся. Большая работа завершена — и стала частью чего-то большего, чем вы.',
      rev: 'Почти всё готово, но один узел не отвечает. Не сдавайте проект без него.',
      motif: 'Лавровый венок вокруг глобуса из меридианов и узлов; по углам — четыре знака стихий машины.',
      draw: c => {
        let wreath = '';
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2, x = 150 + Math.cos(a) * 80, y = 212 + Math.sin(a) * 104;
          wreath += leaf(x, y, a + Math.PI / 2 + (i % 2 ? 0.5 : -0.5), 15, fl(i % 2 ? c.A : c.G, 'opacity=".95"'));
        }
        const R = rng(21), nodes = [];
        for (let i = 0; i < 11; i++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 40; nodes.push([150 + Math.cos(a) * r, 212 + Math.sin(a) * r]); }
        let net = '';
        nodes.forEach((p, i) => nodes.slice(i + 1).forEach(q => { if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 34) net += L(p[0], p[1], q[0], q[1], st(c.K, 1, 'opacity=".7"')); }));
        const corner = (x, y, inner) => C(x, y, 13, fl(c.I, `stroke="${c.G}" stroke-width="1.4"`)) + inner;
        return [
          wreath,
          C(150, 212, 46, fl(c.I, `stroke="${c.G}" stroke-width="2"`)),
          `<ellipse cx="150" cy="212" rx="20" ry="46" ${st(c.G, 1)}/>`, `<ellipse cx="150" cy="212" rx="46" ry="16" ${st(c.G, 1)}/>`,
          net, nodes.map(p => C(p[0], p[1], 2.6, fl(c.K))).join(''),
          corner(58, 82, PG(ngon(58, 82, 6, 3), fl(c.K))), corner(242, 82, C(242, 82, 5, st(c.K, 1.6))),
          corner(58, 342, `<rect x="53" y="337" width="10" height="10" ${fl(c.K)}/>`), corner(242, 342, PG(starPts(242, 342, 7, 3, 4), fl(c.K))),
        ].join('');
      } },
  ];
  const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];

  // ———————————————————— Рамка и рубашка ————————————————————
  let uid = 0;
  function frameDefs(u, acc) {
    return `<defs>
      <linearGradient id="g${u}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FBE9B7"/><stop offset=".28" stop-color="#D9B46A"/><stop offset=".5" stop-color="#F3DDA2"/>
        <stop offset=".72" stop-color="#B98A3E"/><stop offset="1" stop-color="#E9CB86"/>
      </linearGradient>
      <radialGradient id="bg${u}" cx=".5" cy=".38" r=".8"><stop offset="0" stop-color="#23265E"/><stop offset="1" stop-color="#101234"/></radialGradient>
      <radialGradient id="w${u}" cx=".5" cy=".42" r=".7"><stop offset="0" stop-color="${acc}" stop-opacity=".55"/><stop offset=".55" stop-color="#1A1D4C"/><stop offset="1" stop-color="#121436"/></radialGradient>
      <pattern id="p${u}" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r=".9" fill="#D9B46A" opacity=".35"/></pattern>
      <clipPath id="c${u}"><path d="M36 362 V150 A114 114 0 0 1 264 150 V362 Z"/></clipPath>
    </defs>`;
  }
  const curl = (x, y, sx, sy, g) => `<path d="M${x} ${y + sy * 40} C ${x} ${y + sy * 14}, ${x + sx * 6} ${y + sy * 6}, ${x + sx * 26} ${y + sy * 6} C ${x + sx * 40} ${y + sy * 6}, ${x + sx * 40} ${y + sy * 22}, ${x + sx * 28} ${y + sy * 22} C ${x + sx * 20} ${y + sy * 22}, ${x + sx * 20} ${y + sy * 14}, ${x + sx * 26} ${y + sy * 13}" ${st(g, 1.3)}/>`;
  function cardSVG(i) {
    const k = CARDS[i], u = `t${uid++}`, G = `url(#g${u})`;
    const c = { G, A: k.acc, K: '#F4E7C9', I: '#14173F', D: '#0C0E2A', u };
    const name = k.name.toUpperCase(), fs = Math.min(19, 236 / (name.length * 0.66));
    return `<svg viewBox="0 0 300 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${ROMAN[i]}. ${k.name}">
      ${frameDefs(u, k.acc)}
      <rect x="0" y="0" width="300" height="520" rx="16" fill="url(#bg${u})"/>
      <rect x="0" y="0" width="300" height="520" rx="16" fill="url(#p${u})"/>
      <rect x="10" y="10" width="280" height="500" rx="11" ${st(G, 2.2)}/>
      <rect x="17" y="17" width="266" height="486" rx="7" ${st(G, 0.8, 'opacity=".75"')}/>
      ${curl(24, 24, 1, 1, G)}${curl(276, 24, -1, 1, G)}${curl(24, 496, 1, -1, G)}${curl(276, 496, -1, -1, G)}
      <path d="M36 362 V150 A114 114 0 0 1 264 150 V362 Z" fill="url(#w${u})"/>
      <g clip-path="url(#c${u})">
        ${C(150, 205, 90, st(G, 1, 'opacity=".55"'))}${C(150, 205, 82, st(G, 0.8, 'stroke-dasharray="1.5 5" opacity=".7"'))}
        ${rays(150, 205, 90, 132, 36, st(G, 0.6, 'opacity=".35"'))}
        ${k.draw(c)}
      </g>
      <path d="M36 362 V150 A114 114 0 0 1 264 150 V362 Z" ${st(G, 2.4)}/>
      <path d="M44 362 V152 A106 106 0 0 1 256 152 V362" ${st(G, 0.7, 'opacity=".6"')}/>
      <circle cx="150" cy="30" r="17" fill="#121436" ${st(G, 1.6).replace('fill="none"', '')}/>
      ${T(150, 35.5, ROMAN[i], ROMAN[i].length > 3 ? 11 : 14, `fill="#F3DDA2" ${SERIF} letter-spacing="1"`)}
      <path d="M150 380 C 126 380, 118 368, 96 372 C 78 375, 74 392, 88 396 M150 380 C 174 380, 182 368, 204 372 C 222 375, 226 392, 212 396" ${st(G, 1.2)}/>
      ${C(150, 380, 3, fl(G))}${C(88, 396, 2, fl(G))}${C(212, 396, 2, fl(G))}
      <path d="M30 416 H270 L258 440 L270 464 H30 L42 440 Z" fill="#0E1030" ${st(G, 1.6).replace('fill="none"', '')}/>
      ${T(150, 446.5, name, n2(fs), `fill="#F3DDA2" ${SERIF} letter-spacing="1.2"`)}
      ${PG([[150, 478], [157, 485], [150, 492], [143, 485]], fl(G))}${L(112, 485, 138, 485, st(G, 0.8))}${L(162, 485, 188, 485, st(G, 0.8))}
    </svg>`;
  }
  function backSVG() {
    const u = `b${uid++}`, G = `url(#g${u})`;
    let orn = '';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, x = 150 + Math.cos(a) * 92, y = 260 + Math.sin(a) * 92;
      orn += L(150 + Math.cos(a) * 58, 260 + Math.sin(a) * 58, x, y, st(G, 1)) + C(x, y, i % 2 ? 2.4 : 4, i % 2 ? fl(G) : st(G, 1.2));
    }
    return `<svg viewBox="0 0 300 520" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      ${frameDefs(u, '#8C7BD6')}
      <rect width="300" height="520" rx="16" fill="url(#bg${u})"/>
      <rect width="300" height="520" rx="16" fill="url(#p${u})"/>
      <rect x="10" y="10" width="280" height="500" rx="11" ${st(G, 2.2)}/>
      <rect x="22" y="22" width="256" height="476" rx="6" ${st(G, 0.8, 'opacity=".7"')}/>
      ${curl(24, 24, 1, 1, G)}${curl(276, 24, -1, 1, G)}${curl(24, 496, 1, -1, G)}${curl(276, 496, -1, -1, G)}
      ${C(150, 260, 120, st(G, 1, 'opacity=".5"'))}${C(150, 260, 104, st(G, 0.8, 'stroke-dasharray="2 6"'))}
      ${orn}
      ${PG(starPts(150, 260, 54, 22, 8), st(G, 1.6))}${PG(starPts(150, 260, 32, 14, 8, -Math.PI / 2 + Math.PI / 8), fl(G, 'opacity=".9"'))}
      ${C(150, 260, 10, fl('#121436', `stroke="${G}" stroke-width="1.4"`))}
      ${P(lemni(150, 94, 26), st(G, 1.8))}${P(lemni(150, 426, 26), st(G, 1.8))}
    </svg>`;
  }

  // ———————————————————— Карточка на странице ————————————————————
  function cardEl(i, reversed, open) {
    const el = document.createElement('div');
    el.className = 'card' + (reversed ? ' reversed' : '') + (open ? ' open' : '');
    el.innerHTML = `<div class="tilt"><div class="card-inner"><div class="face front">${cardSVG(i)}<div class="sheen"></div></div><div class="face back">${backSVG()}</div></div></div>`;
    const tilt = el.querySelector('.tilt'), sheen = el.querySelector('.sheen');
    el.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      tilt.style.transform = `rotateY(${(x * 14).toFixed(2)}deg) rotateX(${(-y * 12).toFixed(2)}deg)`;
      sheen.style.setProperty('--sx', `${(50 - x * 120).toFixed(1)}%`);
    });
    el.addEventListener('pointerleave', () => { tilt.style.transform = ''; sheen.style.setProperty('--sx', '100%'); });
    return el;
  }
  const secureRandom = n => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };
  function shuffle(n) { const a = Array.from({ length: n }, (_, i) => i); for (let i = n - 1; i > 0; i--) { const j = secureRandom(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // ———————————————————— Расклад на три карты ————————————————————
  const POS = [['Вход', 'что приходит'], ['Процесс', 'что происходит'], ['Выход', 'к чему ведёт']];
  let dealing = 0;
  function draw3() {
    const box = $('#spread');
    const my = ++dealing;
    const order = shuffle(22).slice(0, 3), rev = order.map(() => secureRandom(100) < 25);
    box.innerHTML = '';
    order.forEach((ci, k) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.innerHTML = `<p class="pos"><b>${['I', 'II', 'III'][k]} · ${POS[k][0]}</b><span>${POS[k][1]}</span></p>`;
      const card = cardEl(ci, rev[k], false);
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Открыть карту ${k + 1}`);
      card.tabIndex = 0;
      const open = () => openCard(ci);
      card.addEventListener('click', () => { if (card.classList.contains('open')) open(); else reveal(); });
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      const k0 = CARDS[ci];
      const reading = document.createElement('div');
      reading.className = 'reading';
      reading.innerHTML = `<h2>${k0.name}</h2><p class="orig">по мотивам аркана «${k0.orig}»${rev[k] ? ' · <span class="rev">перевёрнутая</span>' : ''}</p><p class="keys">${k0.keys}</p><p class="txt">${rev[k] ? k0.rev : k0.up}</p>`;
      slot.append(card, reading);
      box.appendChild(slot);
      const reveal = () => { card.classList.add('open'); setTimeout(() => reading.classList.add('show'), 420); };
      if (window.__SHOT__ && my === 1) { card.classList.add('open', 'instant'); reading.classList.add('show', 'instant'); }
      else setTimeout(() => { if (my === dealing) reveal(); }, 320 + k * 300);
    });
  }
  $('#btn-draw').addEventListener('click', draw3);

  // ———————————————————— Карта дня ————————————————————
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  function renderDay() {
    const d = new Date(), key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    const R = rng(key * 2654435761);
    const ci = Math.floor(R() * 22), rev = R() < 0.25;
    const k = CARDS[ci];
    const box = $('#day');
    box.innerHTML = '';
    const card = cardEl(ci, rev, false);
    card.addEventListener('click', () => openCard(ci));
    const text = document.createElement('div');
    text.className = 'day-text';
    text.innerHTML = `<p class="date">Карта дня · ${d.getDate()}&nbsp;${MONTHS[d.getMonth()]}</p><h2>${ROMAN[ci]}. ${k.name}</h2><p class="orig">по мотивам аркана «${k.orig}»${rev ? ' · <span class="rev">перевёрнутая</span>' : ''}</p><p class="keys">${k.keys}</p><p class="txt">${rev ? k.rev : k.up}</p>`;
    box.append(card, text);
    setTimeout(() => card.classList.add('open'), 350);
  }

  // ———————————————————— Колода ————————————————————
  function renderDeck() {
    const box = $('#deck');
    if (box.childElementCount) return;
    CARDS.forEach((k, i) => {
      const fig = document.createElement('figure');
      const card = cardEl(i, false, true);
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `${ROMAN[i]}. ${k.name}`);
      card.addEventListener('click', () => openCard(i));
      card.addEventListener('keydown', e => { if (e.key === 'Enter') openCard(i); });
      const cap = document.createElement('figcaption');
      cap.innerHTML = `<span>${ROMAN[i]}</span>${k.name}`;
      fig.append(card, cap);
      box.appendChild(fig);
    });
  }

  // ———————————————————— Окно карты ————————————————————
  const modal = $('#modal');
  let current = 0, lastFocus = null;
  function openCard(i) {
    current = i;
    const k = CARDS[i];
    const holder = $('#m-card');
    holder.innerHTML = '';
    holder.appendChild(cardEl(i, false, true));
    $('#m-num').textContent = `Аркан ${ROMAN[i]}`;
    $('#m-title').textContent = k.name;
    $('#m-orig').textContent = `по мотивам аркана «${k.orig}»`;
    $('#m-keys').textContent = k.keys;
    $('#m-up').textContent = k.up;
    $('#m-rev').textContent = k.rev;
    $('#m-motif').textContent = k.motif;
    if (modal.hidden) lastFocus = document.activeElement;
    modal.hidden = false;
    $('#m-close').focus({ preventScroll: true });
  }
  function closeCard() { modal.hidden = true; if (lastFocus) lastFocus.focus({ preventScroll: true }); }
  $('#m-close').addEventListener('click', closeCard);
  $('#m-prev').addEventListener('click', () => openCard((current + 21) % 22));
  $('#m-next').addEventListener('click', () => openCard((current + 1) % 22));
  modal.addEventListener('click', e => { if (e.target === modal) closeCard(); });
  window.addEventListener('keydown', e => {
    if (modal.hidden) return;
    if (e.key === 'Escape') closeCard();
    else if (e.key === 'ArrowRight') openCard((current + 1) % 22);
    else if (e.key === 'ArrowLeft') openCard((current + 21) % 22);
  });

  // ———————————————————— Вкладки ————————————————————
  function setView(v) {
    document.body.dataset.view = v;
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
    $('#view-spread').hidden = v !== 'spread';
    $('#view-day').hidden = v !== 'day';
    $('#view-deck').hidden = v !== 'deck';
    if (v === 'day') renderDay();
    if (v === 'deck') renderDeck();
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

  // ———————————————————— Золотая пыль ————————————————————
  const cv = $('#dust'), g = cv.getContext('2d');
  let W = 0, H = 0, motes = [];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((W * H) / 9000);
    motes = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 0.4 + Math.random() * 1.5, v: 0.05 + Math.random() * 0.22, p: Math.random() * 6.28, s: 0.5 + Math.random() }));
  }
  function dust(t) {
    requestAnimationFrame(dust);
    if (document.hidden) return;
    g.clearRect(0, 0, W, H);
    for (const m of motes) {
      if (!reduce) { m.y -= m.v; m.x += Math.sin(t / 2400 + m.p) * 0.12; if (m.y < -4) { m.y = H + 4; m.x = Math.random() * W; } }
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t / 900 * m.s + m.p));
      g.fillStyle = `rgba(243, 221, 162, ${a.toFixed(3)})`;
      g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.fill();
    }
  }
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(dust);

  draw3();
  window.__tarot = { openCard, setView, CARDS };
})();
