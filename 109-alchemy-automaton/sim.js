'use strict';
/* Алхимический автомат — чистая логика без отрисовки.
   Работает и в браузере (window.Alchemy), и в Node (для проверки эталонных решений).

   Доска — шестиугольники в осевых координатах (q, r), вершины «остриём вверх».
   Направления по порядку идут ПРОТИВ часовой стрелки на экране:
   0 — восток, 1 — северо-восток, 2 — северо-запад, 3 — запад, 4 — юго-запад, 5 — юго-восток. */
(function (root) {
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const hk = (q, r) => q + ',' + r;
  const ccw = (q, r, cq, cr) => { const dq = q - cq, dr = r - cr; return [cq + dq + dr, cr - dq]; };
  const cw = (q, r, cq, cr) => { const dq = q - cq, dr = r - cr; return [cq - dr, cr + dq + dr]; };
  const onBoard = (q, r, R) => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= R;
  const bk = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  const ELEMENTS = {
    fire: { name: 'Огонь' }, water: { name: 'Вода' }, air: { name: 'Воздух' }, earth: { name: 'Земля' },
    salt: { name: 'Соль' }, mercury: { name: 'Ртуть' }, sulfur: { name: 'Сера' }, gold: { name: 'Золото' },
  };
  const CARDINAL = new Set(['fire', 'water', 'air', 'earth']);
  const PARTS = {
    arm1: { name: 'Рука', cost: 20 },
    arm2: { name: 'Длинная рука', cost: 30 },
    calc: { name: 'Кальцинация', cost: 10, hexes: 1 },
    bond: { name: 'Спайка', cost: 10, hexes: 2 },
    unbond: { name: 'Распайка', cost: 10, hexes: 2 },
    opus: { name: 'Великое делание', cost: 40, hexes: 3 },
  };
  const INSTR = ['G', 'D', 'L', 'R', 'P', 'Q', '.'];

  function partHexes(p) {
    const out = [[p.q, p.r]];
    if (p.type === 'bond' || p.type === 'unbond') out.push([p.q + DIRS[p.dir][0], p.r + DIRS[p.dir][1]]);
    if (p.type === 'opus') {
      out.push([p.q + DIRS[p.dir][0], p.r + DIRS[p.dir][1]]);
      const d2 = DIRS[(p.dir + 5) % 6];
      out.push([p.q + d2[0], p.r + d2[1]]);
    }
    return out;
  }
  function armTip(a) { const d = DIRS[a.dir]; return [a.q + d[0] * a.len, a.r + d[1] * a.len]; }
  function isArm(p) { return p.type === 'arm1' || p.type === 'arm2'; }

  function periodOf(programs) {
    let n = 1;
    for (const prog of programs) {
      for (let i = prog.length - 1; i >= 0; i--) if (prog[i] && prog[i] !== '.') { n = Math.max(n, i + 1); break; }
    }
    return n;
  }

  function create(puzzle, solution) {
    const arms = [], glyphs = [];
    for (const p of solution.parts) {
      if (isArm(p)) arms.push({ q: p.q, r: p.r, dir: p.dir, len: p.type === 'arm2' ? 2 : 1, hold: null, dir0: p.dir });
      else glyphs.push({ ...p });
    }
    const S = {
      puzzle, arms, glyphs,
      programs: arms.map((_, i) => solution.programs[i] || []),
      period: periodOf(solution.programs.slice(0, arms.length)),
      t: 0, atoms: new Map(), bonds: new Set(), nextId: 1,
      produced: puzzle.outputs.map(() => 0), won: false, error: null, errorAt: null,
      area: new Set(), cost: solution.parts.reduce((s, p) => s + PARTS[p.type].cost, 0),
    };
    touchArea(S);
    return S;
  }
  function touchArea(S) {
    for (const a of S.arms) { S.area.add(hk(a.q, a.r)); const t = armTip(a); S.area.add(hk(t[0], t[1])); if (a.len === 2) S.area.add(hk(a.q + DIRS[a.dir][0], a.r + DIRS[a.dir][1])); }
    for (const g of S.glyphs) for (const h of partHexes(g)) S.area.add(hk(h[0], h[1]));
    for (const at of S.atoms.values()) S.area.add(hk(at.q, at.r));
  }
  function occupancy(S) {
    const m = new Map();
    for (const a of S.atoms.values()) m.set(hk(a.q, a.r), a.id);
    return m;
  }
  function componentsOf(S) {
    const adj = new Map();
    for (const id of S.atoms.keys()) adj.set(id, []);
    for (const b of S.bonds) { const [x, y] = b.split('|').map(Number); adj.get(x).push(y); adj.get(y).push(x); }
    const comp = new Map(); const list = [];
    for (const id of S.atoms.keys()) {
      if (comp.has(id)) continue;
      const c = list.length, stack = [id], members = [];
      comp.set(id, c);
      while (stack.length) {
        const v = stack.pop(); members.push(v);
        for (const w of adj.get(v)) if (!comp.has(w)) { comp.set(w, c); stack.push(w); }
      }
      list.push(members);
    }
    return { comp, list };
  }
  function fail(S, msg, q, r) { S.error = msg; S.errorAt = q === undefined ? null : [q, r]; }

  /* Один цикл. Возвращает события для анимации. */
  function step(S) {
    const ev = { t: S.t, moves: new Map(), arms: S.arms.map((a) => ({ from: a.dir, to: a.dir, grab: false, drop: false, pivot: 0 })),
      spawned: [], bonded: [], unbonded: [], transmuted: [], consumed: [], fused: [], error: null };
    if (S.error || S.won) return ev;
    const idx = S.t % S.period;

    // 1. входы выдают реагенты, если их клетки свободны
    let occ = occupancy(S);
    S.puzzle.inputs.forEach((inp) => {
      if (inp.atoms.some((a) => occ.has(hk(a.q, a.r)))) return;
      const ids = inp.atoms.map((a) => { const id = S.nextId++; S.atoms.set(id, { id, el: a.el, q: a.q, r: a.r }); return id; });
      for (const [i, j] of inp.bonds || []) S.bonds.add(bk(ids[i], ids[j]));
      ev.spawned.push(...ids);
    });
    occ = occupancy(S);

    // 2. команды рук
    const { comp, list } = componentsOf(S);
    const plans = [];
    const movedBy = new Map();
    S.arms.forEach((a, i) => {
      const ins = S.programs[i][idx] || '.';
      const tip = armTip(a);
      if (ins === 'G') {
        if (a.hold === null) {
          const id = occ.get(hk(tip[0], tip[1]));
          if (id !== undefined) { a.hold = id; ev.arms[i].grab = true; }
        }
      } else if (ins === 'D') {
        if (a.hold !== null) { a.hold = null; ev.arms[i].drop = true; }
      } else if (ins === 'L' || ins === 'R') {
        const nd = (a.dir + (ins === 'L' ? 1 : 5)) % 6;
        ev.arms[i].to = ins === 'L' ? a.dir + 1 : a.dir - 1;
        if (a.hold !== null) plans.push({ c: comp.get(a.hold), center: [a.q, a.r], ccw: ins === 'L', arm: i });
        a.dir = nd;
      } else if (ins === 'P' || ins === 'Q') {
        if (a.hold !== null) { plans.push({ c: comp.get(a.hold), center: tip, ccw: ins === 'P', arm: i }); ev.arms[i].pivot = ins === 'P' ? 1 : -1; }
      }
    });
    for (const pl of plans) {
      if (movedBy.has(pl.c)) {
        const at = S.atoms.get(list[pl.c][0]);
        fail(S, 'Одну молекулу двигают две руки сразу', at.q, at.r); ev.error = S.error; return ev;
      }
      movedBy.set(pl.c, pl.arm);
      for (let j = 0; j < S.arms.length; j++) {
        if (j === pl.arm || S.arms[j].hold === null) continue;
        if (comp.get(S.arms[j].hold) === pl.c) {
          const at = S.atoms.get(S.arms[j].hold);
          fail(S, 'Молекулу держат две руки, а двигает одна', at.q, at.r); ev.error = S.error; return ev;
        }
      }
    }
    for (const pl of plans) {
      for (const id of list[pl.c]) {
        const at = S.atoms.get(id);
        const [nq, nr] = (pl.ccw ? ccw : cw)(at.q, at.r, pl.center[0], pl.center[1]);
        ev.moves.set(id, { from: [at.q, at.r], center: pl.center, ccw: pl.ccw });
        at.q = nq; at.r = nr;
      }
    }

    // 3. столкновения и край доски
    const seen = new Map();
    for (const at of S.atoms.values()) {
      if (!onBoard(at.q, at.r, S.puzzle.R)) { fail(S, 'Атом вынесен за край доски', at.q, at.r); ev.error = S.error; S.t++; return ev; }
      const k = hk(at.q, at.r);
      if (seen.has(k)) { fail(S, 'Столкновение атомов', at.q, at.r); ev.error = S.error; S.t++; return ev; }
      seen.set(k, at.id);
    }

    // 4. знаки-глифы
    const held = new Set(S.arms.filter((a) => a.hold !== null).map((a) => a.hold));
    for (const g of S.glyphs) {
      const hx = partHexes(g);
      const ids = hx.map(([q, r]) => seen.get(hk(q, r)));
      if (g.type === 'calc') {
        const at = ids[0] !== undefined ? S.atoms.get(ids[0]) : null;
        if (at && CARDINAL.has(at.el)) { ev.transmuted.push({ id: at.id, from: at.el }); at.el = 'salt'; }
      } else if (g.type === 'bond' || g.type === 'unbond') {
        if (ids[0] === undefined || ids[1] === undefined) continue;
        const key = bk(ids[0], ids[1]);
        if (g.type === 'bond' && !S.bonds.has(key)) { S.bonds.add(key); ev.bonded.push([ids[0], ids[1]]); }
        if (g.type === 'unbond' && S.bonds.has(key)) { S.bonds.delete(key); ev.unbonded.push([ids[0], ids[1]]); }
      } else if (g.type === 'opus') {
        if (ids.some((id) => id === undefined)) continue;
        const els = ids.map((id) => S.atoms.get(id).el).sort().join(',');
        if (els !== 'mercury,salt,sulfur') continue;
        if (ids.some((id) => held.has(id))) continue;
        const { comp: cmap } = componentsOf(S);
        // атомы должны быть свободны от связей с чем-то ещё
        const free = ids.every((id) => [...S.bonds].every((b) => { const [x, y] = b.split('|').map(Number); return (x !== id && y !== id) || (ids.includes(x) && ids.includes(y)); }));
        if (!free || cmap === null) continue;
        for (const b of [...S.bonds]) { const [x, y] = b.split('|').map(Number); if (ids.includes(x) || ids.includes(y)) S.bonds.delete(b); }
        const src = ids.map((id) => ({ ...S.atoms.get(id) }));
        for (const id of ids) S.atoms.delete(id);
        const nid = S.nextId++;
        S.atoms.set(nid, { id: nid, el: 'gold', q: hx[0][0], r: hx[0][1] });
        ev.fused.push({ from: src, to: nid, at: hx[0] });
      }
    }

    // 5. выходы забирают готовые молекулы
    const heldNow = new Set(S.arms.filter((a) => a.hold !== null).map((a) => a.hold));
    const occ2 = occupancy(S);
    const { comp: comp2, list: list2 } = componentsOf(S);
    S.puzzle.outputs.forEach((out, oi) => {
      if (S.produced[oi] >= out.need) return;
      const ids = out.atoms.map((a) => occ2.get(hk(a.q, a.r)));
      if (ids.some((id) => id === undefined)) return;
      if (ids.some((id, j) => S.atoms.get(id).el !== out.atoms[j].el)) return;
      const c = comp2.get(ids[0]);
      if (ids.some((id) => comp2.get(id) !== c)) return;
      if (list2[c].length !== ids.length) return;
      if (ids.some((id) => heldNow.has(id))) return;
      let nb = 0;
      for (const b of S.bonds) { const [x, y] = b.split('|').map(Number); if (ids.includes(x) || ids.includes(y)) nb++; }
      const want = out.bonds || [];
      if (nb !== want.length) return;
      if (!want.every(([i, j]) => S.bonds.has(bk(ids[i], ids[j])))) return;
      const gone = [];
      for (const b of [...S.bonds]) { const [x, y] = b.split('|').map(Number); if (ids.includes(x)) { S.bonds.delete(b); gone.push([x, y]); } }
      const atoms = ids.map((id) => ({ ...S.atoms.get(id) }));
      for (const id of ids) S.atoms.delete(id);
      ev.consumed.push({ output: oi, atoms, bonds: gone });
      S.produced[oi]++;
    });

    touchArea(S);
    S.t++;
    if (S.puzzle.outputs.every((o, i) => S.produced[i] >= o.need)) S.won = true;
    return ev;
  }

  function run(puzzle, solution, limit) {
    const S = create(puzzle, solution);
    while (!S.won && !S.error && S.t < (limit || 2000)) step(S);
    return { won: S.won, error: S.error, cycles: S.t, cost: S.cost, area: S.area.size, produced: S.produced };
  }

  /* ---------- головоломки ---------- */
  const P = (s) => s.split(' ');
  const PUZZLES = [
    {
      id: 'transfer', name: 'Перенос', R: 4,
      text: 'Перенесите соль с входа на выход. Возьмите, поверните руку, отпустите — и верните руку назад.',
      allowed: ['arm1', 'arm2'],
      inputs: [{ atoms: [{ el: 'salt', q: -2, r: 0 }] }],
      outputs: [{ atoms: [{ el: 'salt', q: 2, r: 0 }], need: 4 }],
      ref: { parts: [{ type: 'arm2', q: 0, r: 0, dir: 3 }], programs: [P('G R R R D L L L')] },
    },
    {
      id: 'calc', name: 'Кальцинация', R: 4,
      text: 'Знак кальцинации превращает любую из четырёх стихий в соль. Проведите огонь через знак.',
      allowed: ['arm1', 'arm2', 'calc'],
      inputs: [{ atoms: [{ el: 'fire', q: -2, r: 0 }] }],
      outputs: [{ atoms: [{ el: 'salt', q: 0, r: 2 }], need: 4 }],
      ref: { parts: [{ type: 'arm2', q: 0, r: 0, dir: 3 }, { type: 'calc', q: -2, r: 2 }], programs: [P('G L L D R R')] },
    },
    {
      id: 'split', name: 'Разлом', R: 4,
      text: 'Знак распайки рвёт связь между атомами, которые на нём лежат. Разделите огонь и воду.',
      allowed: ['arm1', 'arm2', 'unbond'],
      inputs: [{ atoms: [{ el: 'fire', q: 0, r: 0 }, { el: 'water', q: 1, r: 0 }], bonds: [[0, 1]] }],
      outputs: [
        { atoms: [{ el: 'fire', q: -2, r: 0 }], need: 3 },
        { atoms: [{ el: 'water', q: 3, r: 0 }], need: 3 },
      ],
      ref: {
        parts: [{ type: 'arm1', q: -1, r: 0, dir: 0 }, { type: 'arm1', q: 2, r: 0, dir: 3 }, { type: 'unbond', q: 0, r: 0, dir: 0 }],
        programs: [P('G L L L D R R R'), P('G R R R D L L L')],
      },
    },
    {
      id: 'bond', name: 'Первая связь', R: 4,
      text: 'Знак спайки связывает два атома на своих клетках. Соберите пару «земля — вода».',
      allowed: ['arm1', 'arm2', 'bond'],
      inputs: [{ atoms: [{ el: 'water', q: -3, r: 0 }] }, { atoms: [{ el: 'earth', q: 2, r: 0 }] }],
      outputs: [{ atoms: [{ el: 'earth', q: 0, r: 1 }, { el: 'water', q: -1, r: 2 }], bonds: [[0, 1]], need: 4 }],
      ref: {
        parts: [{ type: 'arm1', q: -2, r: 0, dir: 3 }, { type: 'arm1', q: 1, r: 0, dir: 0 }, { type: 'bond', q: -1, r: 0, dir: 0 }],
        programs: [P('G L L L D R R R'), P('G L L L . L D L L')],
      },
    },
    {
      id: 'wrist', name: 'Поворот запястья', R: 4,
      text: 'Команда «крутить» поворачивает молекулу вокруг захвата. Выход ждёт пару в другом положении.',
      allowed: ['arm1', 'arm2'],
      inputs: [{ atoms: [{ el: 'air', q: -1, r: 0 }, { el: 'earth', q: -2, r: 0 }], bonds: [[0, 1]] }],
      outputs: [{ atoms: [{ el: 'air', q: 1, r: 0 }, { el: 'earth', q: 2, r: -1 }], bonds: [[0, 1]], need: 4 }],
      ref: { parts: [{ type: 'arm1', q: 0, r: 0, dir: 3 }], programs: [P('G P R R R D L L L')] },
    },
    {
      id: 'bridge', name: 'Соляной мост', R: 4,
      text: 'Из двух огней сделайте две соли и спаяйте их в пару.',
      allowed: ['arm1', 'arm2', 'calc', 'bond'],
      inputs: [{ atoms: [{ el: 'fire', q: -3, r: 0 }] }, { atoms: [{ el: 'fire', q: 2, r: 0 }] }],
      outputs: [{ atoms: [{ el: 'salt', q: 0, r: 1 }, { el: 'salt', q: -1, r: 2 }], bonds: [[0, 1]], need: 4 }],
      ref: {
        parts: [{ type: 'arm1', q: -2, r: 0, dir: 3 }, { type: 'arm1', q: 1, r: 0, dir: 0 }, { type: 'bond', q: -1, r: 0, dir: 0 },
          { type: 'calc', q: -3, r: 1 }, { type: 'calc', q: 2, r: -1 }],
        programs: [P('G L L L D R R R'), P('G L L L . L D L L')],
      },
    },
    {
      id: 'select', name: 'Выборочная кальцинация', R: 4,
      text: 'Превратите в соль только огонь — вода должна пройти мимо знака.',
      allowed: ['arm1', 'arm2', 'calc'],
      inputs: [{ atoms: [{ el: 'fire', q: -1, r: 0 }, { el: 'water', q: -2, r: 0 }], bonds: [[0, 1]] }],
      outputs: [{ atoms: [{ el: 'salt', q: 0, r: 1 }, { el: 'water', q: 0, r: 2 }], bonds: [[0, 1]], need: 4 }],
      ref: { parts: [{ type: 'arm1', q: 0, r: 0, dir: 3 }, { type: 'calc', q: -1, r: 1 }], programs: [P('G L L D R R')] },
    },
    {
      id: 'opus', name: 'Великое делание', R: 4,
      text: 'Сера, ртуть и соль, сведённые на треугольном знаке, сплавляются в золото.',
      allowed: ['arm1', 'arm2', 'opus'],
      inputs: [{ atoms: [{ el: 'sulfur', q: -2, r: 0 }] }, { atoms: [{ el: 'mercury', q: 3, r: -1 }] }, { atoms: [{ el: 'salt', q: -1, r: 3 }] }],
      outputs: [{ atoms: [{ el: 'gold', q: -2, r: 1 }], need: 3 }],
      ref: {
        parts: [{ type: 'arm1', q: -1, r: 0, dir: 3 }, { type: 'arm1', q: 2, r: -1, dir: 0 }, { type: 'arm1', q: 0, r: 2, dir: 4 },
          { type: 'opus', q: 0, r: 0, dir: 0 }],
        programs: [P('G L L L D G R R D R'), P('G R R D L L'), P('G R R D L L')],
      },
    },
  ];

  root.Alchemy = { DIRS, ELEMENTS, PARTS, INSTR, PUZZLES, create, step, run, armTip, partHexes, isArm, periodOf, onBoard, hk, ccw, cw };
})(typeof window !== 'undefined' ? window : globalThis);
