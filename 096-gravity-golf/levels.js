/* Гравитационный гольф — 20 уровней. Мир 1600 × 1000, ось y вниз.
   gm — «гравитационная масса»: ускорение на расстоянии d равно gm / d².
   Решаемость каждого уровня проверена перебором углов и сил натяжения (см. README). */
(function (root) {
  'use strict';

  const P = (x, y, r, style, deco, k) => ({ kind: 'planet', x, y, r, gm: (k || 700) * r * r, style, deco });
  const MOON = (around, orbitR, speed, phase, r, style) => ({ kind: 'moon', r, gm: 700 * r * r, style, deco: 'craters', orbit: { around, r: orbitR, speed, phase } });
  const BH = (x, y, gm) => ({ kind: 'blackhole', x, y, r: 30, gm });
  const ROCK = (x, y, r) => ({ kind: 'rock', x, y, r: r || 16 });
  const HOLE = (x, y) => ({ kind: 'hole', x, y, r: 34, gm: 1.8e5 }); // лёгкое притяжение прощает почти-попадания
  const belt = (x0, y0, x1, y1, n, skip) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      if (skip && skip.includes(i)) continue;
      const t = n === 1 ? 0 : i / (n - 1);
      const jx = Math.sin(i * 12.9898) * 7, jy = Math.cos(i * 78.233) * 7;
      out.push(ROCK(x0 + (x1 - x0) * t + jx, y0 + (y1 - y0) * t + jy, 13 + ((i * 7) % 5) * 2));
    }
    return out;
  };

  const LEVELS = [
    {
      name: 'Первый толчок',
      hint: 'Потяните зонд назад и отпустите. Чем сильнее натяжение, тем быстрее полёт.',
      start: [240, 600], par: 1, demo: [357, 46], ok: 82,
      bodies: [P(820, 250, 46, 'butter', 'spots', 260), HOLE(1330, 470)],
    },
    {
      name: 'Изгиб',
      hint: 'Планета притягивает. Цельтесь мимо — она сама довернёт.',
      start: [220, 700], par: 1, demo: [16, 106], ok: 63,
      bodies: [P(790, 700, 92, 'peach', 'bands'), HOLE(1360, 690)],
    },
    {
      name: 'Праща',
      hint: 'Облетите планету — она развернёт зонд почти обратно.',
      start: [280, 790], par: 1, demo: [290, 76], ok: 159,
      bodies: [P(930, 520, 96, 'mint', 'craters'), HOLE(520, 250)],
    },
    {
      name: 'Две сестры',
      hint: 'Между двумя планетами силы спорят. Найдите, где победит нужная.',
      start: [200, 520], par: 1, demo: [0, 142], ok: 71,
      bodies: [P(760, 320, 74, 'lavender', 'bands'), P(820, 700, 104, 'peach', 'craters'), HOLE(1400, 600)],
    },
    {
      name: 'Луна на подходе',
      hint: 'Луна начинает движение в момент запуска. Её пунктир — это её путь.',
      start: [180, 650], par: 1, demo: [4, 100], ok: 62,
      bodies: [P(820, 520, 88, 'sky', 'bands'), MOON(0, 215, 0.9, 2.4, 26, 'butter'), HOLE(1420, 380)],
    },
    {
      name: 'Восьмёрка',
      hint: 'Иногда путь к цели проходит сначала мимо неё.',
      start: [800, 880], par: 1, demo: [269, 46], ok: 111,
      bodies: [P(560, 480, 82, 'mint', 'spots'), P(1040, 480, 82, 'peach', 'spots'), HOLE(800, 150)],
    },
    {
      name: 'Пояс астероидов',
      hint: 'Камни не притягивают, но разбивают. Проём один.',
      start: [200, 720], par: 1, demo: [338, 124], ok: 71,
      bodies: [...belt(800, 110, 800, 900, 15, [5, 6, 7]), P(1250, 640, 70, 'lavender', 'craters'), HOLE(1400, 300)],
    },
    {
      name: 'Горизонт',
      hint: 'Чёрная дыра тянет сильнее всего. Не пересекайте тёмный круг.',
      start: [200, 300], par: 1, demo: [37, 118], ok: 88,
      bodies: [BH(800, 520, 7.0e6), HOLE(1320, 800)],
    },
    {
      name: 'Треугольник',
      hint: 'Цель в центре тройки. Войдите мягко.',
      start: [200, 520], par: 1, demo: [3, 88], ok: 147,
      bodies: [P(800, 250, 70, 'butter', 'bands'), P(620, 760, 70, 'mint', 'craters'), P(1010, 760, 70, 'sky', 'spots'), HOLE(810, 590)],
    },
    {
      name: 'За щитом',
      hint: 'Цель прячется за гигантом. Прямо не получится.',
      start: [200, 520], par: 1, demo: [19, 100], ok: 54,
      bodies: [P(900, 510, 150, 'peach', 'bands', 520), HOLE(1330, 510)],
    },
    {
      name: 'Карусель',
      hint: 'Две луны кружат в разные стороны.',
      start: [180, 300], par: 1, demo: [0, 82], ok: 46,
      bodies: [P(800, 520, 80, 'lavender', 'bands'), MOON(0, 175, 1.1, 0.3, 22, 'butter'), MOON(0, 290, -0.7, 3.4, 28, 'mint'), HOLE(1420, 740)],
    },
    {
      name: 'Коридор',
      hint: 'Проход узкий, зато планета помогает повернуть.',
      start: [200, 860], par: 1, demo: [333, 142], ok: 45,
      bodies: [...belt(480, 560, 1000, 140, 11), ...belt(700, 900, 1260, 440, 11), P(1180, 250, 70, 'peach', 'craters'), HOLE(1420, 170)],
    },
    {
      name: 'Двойная звезда',
      hint: 'Звёзды вращаются друг вокруг друга. Подгадайте момент.',
      start: [200, 820], par: 1, demo: [301, 46], ok: 52,
      bodies: [
        { kind: 'planet', r: 54, gm: 700 * 54 * 54, style: 'butter', deco: 'sun', orbit: { around: [800, 500], r: 120, speed: 1.2, phase: 0 } },
        { kind: 'planet', r: 54, gm: 700 * 54 * 54, style: 'peach', deco: 'sun', orbit: { around: [800, 500], r: 120, speed: 1.2, phase: Math.PI } },
        HOLE(1400, 200),
      ],
    },
    {
      name: 'Кольцо',
      hint: 'Цель окружена камнями. Вход — с верхнего левого бока.',
      start: [200, 300], par: 1, demo: [8, 76], ok: 82,
      bodies: [
        ...Array.from({ length: 14 }, (_, i) => i).filter((i) => i !== 8 && i !== 9 && i !== 10).map((i) => {
          const a = i / 14 * Math.PI * 2;
          return ROCK(1120 + Math.cos(a) * 118, 560 + Math.sin(a) * 118, 15);
        }),
        P(690, 720, 78, 'sky', 'bands'),
        HOLE(1120, 560),
      ],
    },
    {
      name: 'Дыра и луна',
      hint: 'Чёрная дыра и планета с луной. Проскользните между ними.',
      start: [200, 820], par: 1, demo: [338, 196], ok: 71,
      bodies: [BH(680, 420, 5.5e6), P(1080, 640, 76, 'mint', 'craters'), MOON(1, 170, 1.0, 4.0, 22, 'butter'), HOLE(1420, 300)],
    },
    {
      name: 'Виток',
      hint: 'Цель прямо за планетой. Обогните её по дуге.',
      start: [800, 890], par: 1, demo: [23, 52], ok: 42,
      bodies: [P(800, 500, 118, 'lavender', 'craters'), ...belt(640, 180, 960, 180, 5, [2]), HOLE(800, 110)],
    },
    {
      name: 'Тихая гавань',
      hint: 'Между двумя гигантами есть точка равновесия. Цель там.',
      start: [200, 840], par: 1, demo: [333, 142], ok: 136,
      bodies: [P(590, 330, 100, 'peach', 'bands'), P(1030, 690, 100, 'sky', 'bands'), HOLE(810, 510)],
    },
    {
      name: 'Лабиринт',
      hint: 'Три пояса, три проёма. Планеты подскажут дорогу.',
      start: [180, 500], par: 1, demo: [1, 166], ok: 10,
      bodies: [
        ...belt(520, 90, 520, 910, 14, [9, 10, 11]),
        ...belt(880, 90, 880, 910, 14, [3, 4]),
        ...belt(1240, 90, 1240, 910, 14, [7, 8, 9]),
        P(700, 360, 52, 'butter', 'spots'), P(1060, 620, 52, 'mint', 'spots'),
        HOLE(1430, 500),
      ],
    },
    {
      name: 'Линза',
      hint: 'Цель точно за чёрной дырой. Свет бы обогнул её — сможете и вы.',
      start: [200, 500], par: 1, demo: [12, 178], ok: 90,
      bodies: [BH(800, 500, 9.0e6), HOLE(1400, 500)],
    },
    {
      name: 'Система',
      hint: 'Всё сразу: луна, пояс, чёрная дыра. Удачи, штурман.',
      start: [160, 860], par: 1, demo: [261, 46], ok: 28,
      bodies: [
        P(560, 600, 84, 'peach', 'bands'), MOON(0, 190, 0.95, 5.2, 24, 'butter'),
        BH(1100, 640, 5.0e6),
        ...belt(840, 120, 1160, 360, 8, [3, 4]),
        P(1300, 300, 60, 'mint', 'craters'),
        HOLE(1440, 160),
      ],
    },
  ];

  root.GGLevels = LEVELS;
})(typeof window !== 'undefined' ? window : globalThis);
