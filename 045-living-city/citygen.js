/* ================================================================
   Тихоречинск — процедурная карта.
   Сетка кварталов 14×10, проспекты и улицы, районы (спальный, центр,
   промзона, парк, набережная), здания, заведения, адреса, метро,
   граф тротуаров для пешеходов, дорожный граф для машин, фонари,
   деревья, парковочные места.
   Координаты: метры, x — восток, z — юг, y — вверх.
   ================================================================ */
(function (LC) {
  'use strict';
  const D = window.LC_DATA;

  const NX = 14, NZ = 10, P = 76;
  const LANE = 3.5, PARKW = 2.5, S = 4, PROM = 14, MEDIAN = 0.8;
  const X_AVE = new Set([3, 7, 12]), Z_AVE = new Set([3, 6]);
  // карта районов: I — промзона, R — спальный, C — центр, P — парк, E — набережная
  const MAP = [
    'IIIRRRRRRRRRRR',
    'IIRRRRCCRRRRRR',
    'IIRRRCCCCRRRRR',
    'IIRRCCCCCCRRRR',
    'IIRRRCCCCCRRRR',
    'IIRRRRCCCRRRRR',
    'IIRRRRRRRPPPRR',
    'IIRRRRRRRPPPRR',
    'IIRRRRRRRPPPRR',
    'IIEEEEEEEEEEEE',
  ];
  const DIST_NAME = { I: 'промзона', R: 'спальный район', C: 'центр', P: 'парк', E: 'набережная' };

  LC.GEO = { NX, NZ, P, LANE, PARKW, S, PROM, MEDIAN };

  LC.generateCity = function (seed) {
    const rng = LC.makeRng(seed);
    const X = [], Z = [];
    for (let i = 0; i <= NX; i++) X.push((i - NX / 2) * P);
    for (let j = 0; j <= NZ; j++) Z.push((j - NZ / 2) * P);
    const aveX = (i) => X_AVE.has(i), aveZ = (j) => Z_AVE.has(j);
    const lanesX = (i) => (aveX(i) ? 2 : 1), lanesZ = (j) => (aveZ(j) ? 2 : 1);
    const hwX = (i) => (aveX(i) ? 2 * LANE + MEDIAN : LANE + PARKW);
    const hwZ = (j) => (aveZ(j) ? 2 * LANE + MEDIAN : LANE + PARKW);
    const distAt = (bx, bz) => (bx < 0 || bz < 0 || bx >= NX || bz >= NZ ? null : MAP[bz][bx]);

    const city = {
      NX, NZ, P, X, Z, S, PROM, LANE, PARKW, MEDIAN,
      aveX, aveZ, lanesX, lanesZ, hwX, hwZ, distAt, DIST_NAME,
      name: D.city.name,
      blocks: [], buildings: [], venues: [], parts: [], chimneys: [],
      lamps: [], trees: [], benches: [],
      streetNames: { x: [], z: [] },
      venuesByType: {},
    };

    // ---------------- названия улиц ----------------
    const streets = rng.shuffle(D.streets.slice());
    const avenues = rng.shuffle(D.avenues.slice());
    let si = 0, ai = 0;
    for (let i = 0; i <= NX; i++) city.streetNames.x.push(aveX(i) ? avenues[ai++] : 'ул. ' + streets[si++]);
    for (let j = 0; j <= NZ; j++) city.streetNames.z.push(j === NZ ? D.city.river + ' набережная' : aveZ(j) ? avenues[ai++] : 'ул. ' + streets[si++]);

    // ---------------- дороги: какие отрезки существуют ----------------
    // Отрезок вдоль x-линии i между z-линиями j и j+1 убираем, если по обе стороны — парк.
    const parkAt = (bx, bz) => distAt(bx, bz) === 'P';
    city.segX = (i, j) => { // вертикальный отрезок (машины едут вдоль z)
      if (j < 0 || j >= NZ || i < 0 || i > NX) return false;
      return !(parkAt(i - 1, j) && parkAt(i, j) && !aveX(i));
    };
    city.segZ = (i, j) => { // горизонтальный отрезок (машины едут вдоль x)
      if (i < 0 || i >= NX || j < 0 || j > NZ) return false;
      return !(parkAt(i, j - 1) && parkAt(i, j) && !aveZ(j));
    };

    // ---------------- кварталы ----------------
    for (let bz = 0; bz < NZ; bz++) {
      for (let bx = 0; bx < NX; bx++) {
        const d = MAP[bz][bx];
        // плита квартала (уровень тротуара); у парка — растягиваем на убранные улицы
        let sx0 = X[bx] + hwX(bx), sx1 = X[bx + 1] - hwX(bx + 1);
        let sz0 = Z[bz] + hwZ(bz), sz1 = Z[bz + 1] - hwZ(bz + 1);
        const b = {
          id: city.blocks.length, bx, bz, d,
          sx0, sx1, sz0, sz1,
          lx0: sx0 + S, lx1: sx1 - S, lz0: sz0 + S, lz1: sz1 - S,
          buildings: [],
        };
        city.blocks.push(b);
      }
    }
    const blockAt = (bx, bz) => (bx < 0 || bz < 0 || bx >= NX || bz >= NZ ? null : city.blocks[bz * NX + bx]);
    city.blockAt = blockAt;

    // ---------------- граф тротуаров ----------------
    // Узлы: 4 угла каждого квартала (по середине тротуара) + узлы променада у реки.
    // Угол: 0 — СЗ, 1 — СВ, 2 — ЮВ, 3 — ЮЗ. id = block*4 + corner.
    const W = { x: [], z: [], adj: [] }; // adj: [{to, len, cross: intersection|-1, axis:'x'|'z'}]
    const addNode = (x, z) => { W.x.push(x); W.z.push(z); W.adj.push([]); return W.x.length - 1; };
    const addEdge = (a, b, cross, axis) => {
      const len = Math.hypot(W.x[a] - W.x[b], W.z[a] - W.z[b]);
      W.adj[a].push({ to: b, len, cross, axis });
      W.adj[b].push({ to: a, len, cross, axis });
    };
    for (const b of city.blocks) {
      const h = S / 2;
      addNode(b.sx0 + h, b.sz0 + h);
      addNode(b.sx1 - h, b.sz0 + h);
      addNode(b.sx1 - h, b.sz1 - h);
      addNode(b.sx0 + h, b.sz1 - h);
    }
    const cn = (b, c) => b.id * 4 + c;
    // стороны кварталов
    for (const b of city.blocks) {
      addEdge(cn(b, 0), cn(b, 1), -1, 'x');
      addEdge(cn(b, 1), cn(b, 2), -1, 'z');
      addEdge(cn(b, 2), cn(b, 3), -1, 'x');
      addEdge(cn(b, 3), cn(b, 0), -1, 'z');
    }
    const nodeIdx = (i, j) => j * (NX + 1) + i; // перекрёсток
    // переходы на перекрёстках
    for (let j = 0; j <= NZ; j++) {
      for (let i = 0; i <= NX; i++) {
        const inter = nodeIdx(i, j);
        const nw = blockAt(i - 1, j - 1), ne = blockAt(i, j - 1), sw = blockAt(i - 1, j), se = blockAt(i, j);
        // через x-линию i (идём вдоль x): севернее центра и южнее
        if (nw && ne) addEdge(cn(nw, 2), cn(ne, 3), city.segX(i, j - 1) ? inter : -1, 'x');
        if (sw && se) addEdge(cn(sw, 1), cn(se, 0), city.segX(i, j) ? inter : -1, 'x');
        // через z-линию j (идём вдоль z): западнее и восточнее
        if (nw && sw) addEdge(cn(nw, 2), cn(sw, 1), city.segZ(i - 1, j) ? inter : -1, 'z');
        if (ne && se) addEdge(cn(ne, 3), cn(se, 0), city.segZ(i, j) ? inter : -1, 'z');
      }
    }
    // променад вдоль реки: узлы напротив южных углов нижнего ряда
    const promZ = Z[NZ] + hwZ(NZ) + PROM / 2;
    city.promZ = promZ;
    city.riverZ0 = Z[NZ] + hwZ(NZ) + PROM;
    city.riverZ1 = city.riverZ0 + 170;
    const promNodes = [];
    for (let bx = 0; bx < NX; bx++) {
      const b = blockAt(bx, NZ - 1);
      const a = addNode(W.x[cn(b, 3)], promZ), c = addNode(W.x[cn(b, 2)], promZ);
      promNodes.push(a, c);
      addEdge(cn(b, 3), a, bx === 0 ? -1 : nodeIdx(bx, NZ), 'z');
      addEdge(cn(b, 2), c, nodeIdx(bx + 1, NZ), 'z');
    }
    for (let k = 0; k + 1 < promNodes.length; k++) addEdge(promNodes[k], promNodes[k + 1], -1, 'x');
    city.promNodes = promNodes;
    // диагональные дорожки через парк (срезают путь)
    const parkBlocks = city.blocks.filter((b) => b.d === 'P');
    if (parkBlocks.length) {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      for (const b of parkBlocks) { minX = Math.min(minX, b.bx); maxX = Math.max(maxX, b.bx); minZ = Math.min(minZ, b.bz); maxZ = Math.max(maxZ, b.bz); }
      const pb = (bx, bz) => blockAt(bx, bz);
      const c0 = cn(pb(minX, minZ), 0), c2 = cn(pb(maxX, maxZ), 2), c1 = cn(pb(maxX, minZ), 1), c3 = cn(pb(minX, maxZ), 3);
      const mid = addNode((W.x[c0] + W.x[c2]) / 2, (W.z[c0] + W.z[c2]) / 2);
      for (const c of [c0, c1, c2, c3]) addEdge(c, mid, -1, 'd');
      city.park = { x0: pb(minX, minZ).sx0, x1: pb(maxX, maxZ).sx1, z0: pb(minX, minZ).sz0, z1: pb(maxX, maxZ).sz1, cx: W.x[mid], cz: W.z[mid], midNode: mid };
    }
    W.count = W.x.length;
    city.walk = W;

    // ---------------- дорожный граф (перекрёстки и направленные отрезки) ----------------
    const R = { nodes: [], roads: [] };
    for (let j = 0; j <= NZ; j++) for (let i = 0; i <= NX; i++) {
      R.nodes.push({ id: nodeIdx(i, j), i, j, x: X[i], z: Z[j], out: [-1, -1, -1, -1], inn: [-1, -1, -1, -1], hwx: hwX(i), hwz: hwZ(j), street: [city.streetNames.x[i], city.streetNames.z[j]] });
    }
    // dir: 0 — восток (+x), 1 — юг (+z), 2 — запад (−x), 3 — север (−z)
    const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
    const addRoad = (a, b, dir, lanes, ave, name, park) => {
      const na = R.nodes[a], nb = R.nodes[b];
      // стоп-линии: отступ от центра перекрёстка на полуширину поперечной улицы + тротуар (переход) + 1 м
      const offA = (dir % 2 === 0 ? na.hwx : na.hwz) + S + 1;
      const offB = (dir % 2 === 0 ? nb.hwx : nb.hwz) + S + 1;
      const r = {
        id: R.roads.length, a, b, dir, lanes, ave, name, park: !!park,
        dx: DX[dir], dz: DZ[dir], rx: -DZ[dir], rz: DX[dir], // rx,rz — нормаль вправо
        x0: na.x + DX[dir] * offA, z0: na.z + DZ[dir] * offA,
        len: Math.hypot(nb.x - na.x, nb.z - na.z) - offA - offB,
        median: ave ? MEDIAN : 0,
      };
      R.roads.push(r);
      na.out[dir] = r.id; nb.inn[dir] = r.id;
      return r;
    };
    for (let j = 0; j <= NZ; j++) for (let i = 0; i < NX; i++) if (city.segZ(i, j)) {
      const a = nodeIdx(i, j), b = nodeIdx(i + 1, j);
      addRoad(a, b, 0, lanesZ(j), aveZ(j), city.streetNames.z[j]);
      addRoad(b, a, 2, lanesZ(j), aveZ(j), city.streetNames.z[j]);
    }
    for (let i = 0; i <= NX; i++) for (let j = 0; j < NZ; j++) if (city.segX(i, j)) {
      const a = nodeIdx(i, j), b = nodeIdx(i, j + 1);
      addRoad(a, b, 1, lanesX(i), aveX(i), city.streetNames.x[i]);
      addRoad(b, a, 3, lanesX(i), aveX(i), city.streetNames.x[i]);
    }
    for (const n of R.nodes) n.live = n.out.some((r) => r >= 0);
    city.road = R;
    city.nodeIdx = nodeIdx;

    // ---------------- здания ----------------
    const PAL = {
      R: [0xd9d2c3, 0xcfc9bb, 0xe4dccb, 0xbfc4c6, 0xd6cdb8, 0xc9b9a3, 0xe8e1d1, 0xb9b3a6, 0xd8c6a8, 0xa9b4b8],
      Raccent: [0xc47b5a, 0x7e9a8a, 0x8a96b4, 0xd0a45a, 0xb0605a],
      C: [0x8795a3, 0x6f7f8f, 0xa3adb5, 0x5d6b78, 0x9aa49c, 0xb7b1a3, 0x7d8a96, 0x4f5d69],
      E: [0xe3b778, 0xd99a88, 0xa9c7b3, 0xe6d3a3, 0xc9a2b8, 0xb9c9d9, 0xe0c090, 0xd4a26e, 0xf0e0c0],
      I: [0x9a6a55, 0x8e8a82, 0x7a7f84, 0xa47e5f, 0x6f6a63, 0xb08f6a],
    };
    function addPart(bld, x0, z0, x1, z1, y0, h, style, color) {
      const p = { b: bld.id, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, y0, h, style, color: color == null ? bld.color : color };
      city.parts.push(p);
      bld.parts.push(p);
      return p;
    }
    // style окон: 0 — панелька, 1 — стекло офиса, 2 — старый фонд, 3 — промышленный, 4 — без окон, 5 — сталинка/общественное
    function addBuilding(blk, kind, x0, z0, x1, z1, floors, style, color, extra) {
      const floorH = style === 1 ? 3.6 : style === 2 || style === 5 ? 3.5 : style === 3 ? 4.5 : 2.9;
      const h = floors * floorH + (style === 2 ? 1.2 : 0.6);
      const bld = Object.assign({
        id: city.buildings.length, block: blk.id, d: blk.d, kind, floors, floorH, h,
        x0, z0, x1, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, color, style,
        parts: [], venues: [], residents: [], apts: 0, occ: 0,
      }, extra || {});
      city.buildings.push(bld);
      blk.buildings.push(bld.id);
      addPart(bld, x0, z0, x1, z1, 0, h, style, color);
      attachDoor(blk, bld);
      return bld;
    }
    // вход: ближайшая к зданию сторона квартала
    function attachDoor(blk, bld) {
      const dN = bld.z0 - blk.sz0, dS = blk.sz1 - bld.z1, dW = bld.x0 - blk.sx0, dE = blk.sx1 - bld.x1;
      let side = 0, m = dN;
      if (dE < m) { m = dE; side = 1; }
      if (dS < m) { m = dS; side = 2; }
      if (dW < m) { m = dW; side = 3; }
      if (bld.forceSide != null) side = bld.forceSide;
      const h = S / 2;
      let px, pz, fx, fz;
      if (side === 0 || side === 2) {
        px = LC.clamp(bld.cx + (rng() - 0.5) * (bld.x1 - bld.x0) * 0.5, blk.sx0 + h + 1, blk.sx1 - h - 1);
        pz = side === 0 ? blk.sz0 + h : blk.sz1 - h;
        fx = LC.clamp(px, bld.x0 + 1, bld.x1 - 1); fz = side === 0 ? bld.z0 : bld.z1;
      } else {
        pz = LC.clamp(bld.cz + (rng() - 0.5) * (bld.z1 - bld.z0) * 0.5, blk.sz0 + h + 1, blk.sz1 - h - 1);
        px = side === 1 ? blk.sx1 - h : blk.sx0 + h;
        fz = LC.clamp(pz, bld.z0 + 1, bld.z1 - 1); fx = side === 1 ? bld.x1 : bld.x0;
      }
      // узлы стороны: N: 0→1, E: 1→2, S: 2→3, W: 3→0
      const a = blk.id * 4 + side, b = blk.id * 4 + ((side + 1) % 4);
      bld.side = side; bld.nodeA = a; bld.nodeB = b;
      bld.doorX = px; bld.doorZ = pz; // точка на тротуаре
      bld.faceX = fx; bld.faceZ = fz; // точка у фасада
      // улица, на которую выходит вход
      if (side === 0) { bld.line = 'z'; bld.lineIdx = blk.bz; }
      else if (side === 2) { bld.line = 'z'; bld.lineIdx = blk.bz + 1; }
      else if (side === 3) { bld.line = 'x'; bld.lineIdx = blk.bx; }
      else { bld.line = 'x'; bld.lineIdx = blk.bx + 1; }
    }
    function addVenue(bld, type, name, jobs, extra) {
      const v = Object.assign({ id: city.venues.length, type, name, b: bld.id, jobs, staff: [], inside: 0, x: bld.doorX, z: bld.doorZ }, extra || {});
      city.venues.push(v);
      bld.venues.push(v.id);
      (city.venuesByType[type] = city.venuesByType[type] || []).push(v.id);
      return v;
    }
    // пулы названий
    const pools = {};
    const takeName = (key, list) => {
      if (!pools[key] || !pools[key].length) pools[key] = rng.shuffle(list.slice());
      return pools[key].pop();
    };
    const resApts = (bld) => { bld.apts = Math.max(4, Math.round(((bld.x1 - bld.x0) * (bld.z1 - bld.z0) * bld.floors) / 95)); };
    // первый этаж: магазин / кафе / бар
    function groundVenue(bld, weights) {
      const t = rng.weighted(Object.keys(weights), (k) => weights[k]);
      if (t === 'none') return;
      if (t === 'shop') { const s = takeName('shops', D.shops); addVenue(bld, 'shop', s[0] + ' «' + s[1] + '»', 6); }
      else if (t === 'cafe') addVenue(bld, 'cafe', 'Кафе «' + takeName('cafes', D.cafes) + '»', 6);
      else if (t === 'bar') addVenue(bld, 'bar', 'Бар «' + takeName('bars', D.bars) + '»', 5);
      else if (t === 'restaurant') addVenue(bld, 'restaurant', 'Ресторан «' + takeName('rest', D.restaurants) + '»', 9);
      else if (t === 'gym') addVenue(bld, 'gym', takeName('gyms', D.gyms), 6);
    }

    const socialQueue = rng.shuffle(['school', 'school', 'kindergarten', 'clinic', 'school', 'kindergarten', 'gym', 'school', 'clinic', 'kindergarten', 'college', 'culture', 'kindergarten', 'school', 'gym', 'admin', 'school', 'kindergarten', 'clinic', 'culture']);
    let resCounter = 0;

    for (const blk of city.blocks) {
      const { lx0, lx1, lz0, lz1 } = blk;
      const W_ = lx1 - lx0, D_ = lz1 - lz0;
      if (blk.d === 'R') {
        resCounter++;
        // соцобъект вместо части жилья
        if (resCounter % 4 === 2 && socialQueue.length) {
          const t = socialQueue.pop();
          genSocial(blk, t);
          continue;
        }
        const v = rng();
        const col = rng.pick(PAL.R);
        if (v < 0.36) { // двор-колодец из длинных панелек
          const fl = rng.int(9, 16);
          const b1 = addBuilding(blk, 'res', lx0 + 1, lz0 + 1, lx1 - 1, lz0 + 13, fl, 0, col); resApts(b1);
          const b2 = addBuilding(blk, 'res', lx0 + 1, lz1 - 13, lx1 - 1, lz1 - 1, rng.int(9, 16), 0, rng.pick(PAL.R)); resApts(b2);
          if (rng() < 0.6) { const b3 = addBuilding(blk, 'res', lx0 + 1, lz0 + 18, lx0 + 13, lz1 - 18, rng.int(5, 9), 0, col); resApts(b3); }
          groundVenue(b1, { shop: 3, cafe: 1.2, bar: 0.6, gym: 0.3, none: 3 });
          groundVenue(b2, { shop: 2, cafe: 0.8, bar: 0.5, none: 4 });
        } else if (v < 0.62) { // точечные башни
          const fl = rng.int(14, 24);
          const s = 19;
          const b1 = addBuilding(blk, 'res', lx0 + 2, lz0 + 2, lx0 + 2 + s, lz0 + 2 + s, fl, 0, col); resApts(b1);
          const b2 = addBuilding(blk, 'res', lx1 - 2 - s, lz1 - 2 - s, lx1 - 2, lz1 - 2, fl + rng.int(-3, 3), 0, col); resApts(b2);
          if (rng() < 0.5) { const b3 = addBuilding(blk, 'res', lx1 - 2 - s, lz0 + 2, lx1 - 2, lz0 + 2 + s, fl + rng.int(-4, 2), 0, rng.pick(PAL.R)); resApts(b3); }
          else addBuilding(blk, 'shop', lx0 + 2, lz1 - 14, lx0 + 22, lz1 - 2, 1, 3, 0xb9b3a6, { forceSide: null });
          groundVenue(b1, { shop: 2, cafe: 1, none: 3 });
          const last = city.buildings[city.buildings.length - 1];
          if (last.kind === 'shop') { const s2 = takeName('shops', D.shops); addVenue(last, 'shop', s2[0] + ' «' + s2[1] + '»', 8); }
        } else if (v < 0.85) { // хрущёвки рядами
          const rows = 3, gap = (D_ - rows * 11) / (rows - 1);
          for (let k = 0; k < rows; k++) {
            const z0 = lz0 + k * (11 + gap);
            const b = addBuilding(blk, 'res', lx0 + 3, z0, lx1 - 3, z0 + 11, 5, 0, rng.pick(PAL.R)); resApts(b);
            if (k === 0) groundVenue(b, { shop: 2, cafe: 0.6, bar: 0.8, none: 3 });
          }
        } else { // «Г» — буквой
          const fl = rng.int(9, 14);
          const b1 = addBuilding(blk, 'res', lx0 + 1, lz0 + 1, lx1 - 1, lz0 + 13, fl, 0, col); resApts(b1);
          const b2 = addBuilding(blk, 'res', lx1 - 13, lz0 + 15, lx1 - 1, lz1 - 1, fl, 0, col); resApts(b2);
          groundVenue(b1, { shop: 2, cafe: 1, bar: 0.6, none: 3 });
        }
        if (rng() < 0.12) addVenue(city.buildings[blk.buildings[0]], 'office', officeName(), 10);
      } else if (blk.d === 'C') {
        const v = rng();
        if (v < 0.45) { // башня на стилобате
          const pod = addBuilding(blk, 'office', lx0 + 1, lz0 + 1, lx1 - 1, lz1 - 1, 3, 1, rng.pick(PAL.C));
          const tw = rng.range(22, 30), td = rng.range(20, 28);
          const cx = (lx0 + lx1) / 2 + rng.range(-6, 6), cz = (lz0 + lz1) / 2 + rng.range(-6, 6);
          const fl = rng.int(16, 38);
          addPart(pod, cx - tw / 2, cz - td / 2, cx + tw / 2, cz + td / 2, pod.h, fl * 3.6, 1, rng.pick(PAL.C));
          if (rng() < 0.5) addPart(pod, cx - tw / 3, cz - td / 3, cx + tw / 3, cz + td / 3, pod.h + fl * 3.6, rng.int(3, 7) * 3.6, 1, rng.pick(PAL.C));
          pod.floors += fl; pod.h = Math.max(...pod.parts.map((p) => p.y0 + p.h));
          const nc = 2 + Math.floor(fl / 9);
          for (let k = 0; k < nc; k++) addVenue(pod, 'office', officeName(), 22);
          groundVenue(pod, { shop: 2, cafe: 2, restaurant: 1, bar: 0.6, gym: 0.4 });
          if (rng() < 0.5) groundVenue(pod, { shop: 2, cafe: 2 });
        } else if (v < 0.75) { // офисы средней высоты
          const n = 2;
          for (let k = 0; k < n; k++) {
            const x0 = k === 0 ? lx0 + 1 : (lx0 + lx1) / 2 + 2, x1 = k === 0 ? (lx0 + lx1) / 2 - 2 : lx1 - 1;
            const b = addBuilding(blk, 'office', x0, lz0 + 1, x1, lz1 - 1, rng.int(7, 15), 1, rng.pick(PAL.C));
            addVenue(b, 'office', officeName(), 20);
            if (rng() < 0.5) addVenue(b, 'office', officeName(), 14);
            groundVenue(b, { shop: 1.5, cafe: 1.5, bar: 0.7, restaurant: 0.7, none: 1 });
          }
        } else { // квартал по периметру: сталинки с магазинами, жильё наверху
          const fl = rng.int(6, 9), dep = 14;
          const col = rng.pick(PAL.E);
          const parts = [
            [lx0 + 1, lz0 + 1, lx1 - 1, lz0 + 1 + dep], [lx0 + 1, lz1 - 1 - dep, lx1 - 1, lz1 - 1],
            [lx0 + 1, lz0 + 2 + dep, lx0 + 1 + dep, lz1 - 2 - dep], [lx1 - 1 - dep, lz0 + 2 + dep, lx1 - 1, lz1 - 2 - dep],
          ];
          for (const q of parts) {
            const b = addBuilding(blk, 'res', q[0], q[1], q[2], q[3], fl, 5, col); resApts(b);
            groundVenue(b, { shop: 2, cafe: 1.4, bar: 1, restaurant: 0.6, gym: 0.3, none: 0.8 });
            if (rng() < 0.3) addVenue(b, 'office', officeName(), 10);
          }
        }
        // особые здания центра
        if (blk.bx === 7 && blk.bz === 3) blk._special = 'admin';
      } else if (blk.d === 'E') {
        // старый фонд по периметру, бары и рестораны внизу
        const dep = 13;
        const segs = [];
        let x = lx0 + 1;
        while (x < lx1 - 8) { const w = Math.min(rng.range(12, 20), lx1 - 1 - x); segs.push([x, lz1 - dep - 1, x + w, lz1 - 1]); x += w; }
        x = lx0 + 1;
        while (x < lx1 - 8) { const w = Math.min(rng.range(13, 22), lx1 - 1 - x); segs.push([x, lz0 + 1, x + w, lz0 + 1 + dep]); x += w; }
        let k = 0;
        for (const q of segs) {
          const b = addBuilding(blk, 'res', q[0], q[1], q[2], q[3], rng.int(4, 6), 2, rng.pick(PAL.E)); resApts(b);
          const south = q[3] > (lz0 + lz1) / 2;
          if (south) groundVenue(b, { bar: 3, restaurant: 1.6, cafe: 1.5, shop: 0.6 });
          else groundVenue(b, { shop: 1.5, cafe: 1, bar: 1, none: 1.4 });
          if (k++ === 2 && rng() < 0.35) addVenue(b, 'hotel', takeName('hotels', D.hotels), 12);
        }
      } else if (blk.d === 'I') {
        const port = blk.bz >= NZ - 2;
        const col = rng.pick(PAL.I);
        const f = addBuilding(blk, port ? 'warehouse' : 'factory', lx0 + 2, lz0 + 2, lx0 + 2 + W_ * rng.range(0.55, 0.7), lz0 + 2 + D_ * rng.range(0.45, 0.6), rng.int(2, 3), 3, col);
        const v1 = port || rng() < 0.3 ? addVenue(f, 'warehouse', takeName('wh', D.warehouses), 34) : addVenue(f, 'factory', takeName('fac', D.factories), 70);
        const w2 = addBuilding(blk, 'warehouse', lx0 + 2, lz1 - 2 - D_ * 0.3, lx1 - 2, lz1 - 2, 2, 3, rng.pick(PAL.I));
        if (rng() < 0.5) addVenue(w2, 'warehouse', takeName('wh', D.warehouses), 24);
        const off = addBuilding(blk, 'office', lx1 - 18, lz0 + 2, lx1 - 2, lz0 + 16, rng.int(3, 5), 5, 0xb7ab98);
        if (v1.type === 'factory') v1.b2 = off.id;
        if (!port && rng() < 0.75) city.chimneys.push({ x: lx1 - 10, z: lz0 + 26 + rng.range(0, 8), r: rng.range(1.8, 2.8), h: rng.range(38, 64), b: f.id });
        if (port) city.chimneys.push({ x: lx1 - 8, z: lz1 - 4, r: 0, h: 34, crane: true, b: w2.id });
      }
    }
    // особые общественные здания в спальных районах
    function genSocial(blk, t) {
      const { lx0, lx1, lz0, lz1 } = blk;
      let b;
      if (t === 'school') {
        b = addBuilding(blk, 'school', lx0 + 3, lz0 + 3, lx1 - 3, lz0 + 21, 4, 5, 0xd9c7a7);
        addVenue(b, 'school', takeName('school', D.schools), 34);
        blk.field = { x0: lx0 + 6, x1: lx1 - 6, z0: lz0 + 28, z1: lz1 - 6 };
      } else if (t === 'kindergarten') {
        b = addBuilding(blk, 'kindergarten', lx0 + 6, lz0 + 6, lx0 + 36, lz0 + 26, 2, 5, 0xe6c49a);
        addVenue(b, 'kindergarten', takeName('kg', D.kindergartens), 14);
        const r = addBuilding(blk, 'res', lx0 + 1, lz1 - 13, lx1 - 1, lz1 - 1, rng.int(9, 14), 0, rng.pick(PAL.R)); resApts(r);
      } else if (t === 'clinic') {
        b = addBuilding(blk, 'clinic', lx0 + 3, lz0 + 3, lx1 - 3, lz0 + 19, 5, 5, 0xe8e4dc);
        addVenue(b, 'clinic', takeName('clinic', D.clinics), 60);
        const r = addBuilding(blk, 'res', lx0 + 1, lz1 - 13, lx1 - 1, lz1 - 1, rng.int(9, 14), 0, rng.pick(PAL.R)); resApts(r);
      } else if (t === 'college') {
        b = addBuilding(blk, 'college', lx0 + 2, lz0 + 2, lx1 - 2, lz0 + 22, 5, 5, 0xc9b28e);
        addVenue(b, 'college', takeName('college', D.colleges), 60);
        const r = addBuilding(blk, 'res', lx0 + 2, lz1 - 16, lx0 + 24, lz1 - 2, 9, 0, 0xcfc9bb); resApts(r);
      } else if (t === 'gym') {
        b = addBuilding(blk, 'gym', lx0 + 4, lz0 + 4, lx0 + 40, lz0 + 30, 2, 3, 0xa9b4b8);
        addVenue(b, 'gym', takeName('gyms', D.gyms), 12);
        const r = addBuilding(blk, 'res', lx1 - 19, lz1 - 21, lx1 - 2, lz1 - 2, rng.int(14, 20), 0, rng.pick(PAL.R)); resApts(r);
      } else if (t === 'culture') {
        const c = takeName('cult', D.culture);
        b = addBuilding(blk, 'culture', lx0 + 6, lz0 + 6, lx1 - 6, lz0 + 34, 4, 5, 0xe2d6bd);
        addVenue(b, 'culture', c[1], 30, { sub: c[0] });
      } else if (t === 'admin') {
        b = addBuilding(blk, 'admin', lx0 + 4, lz0 + 4, lx1 - 4, lz0 + 22, 4, 5, 0xd8d0c0);
        addVenue(b, 'admin', takeName('admin', D.admin), 30);
        const r = addBuilding(blk, 'res', lx0 + 1, lz1 - 13, lx1 - 1, lz1 - 1, rng.int(9, 12), 0, rng.pick(PAL.R)); resApts(r);
      }
    }
    function officeName() { const c = takeName('comp', D.companies); return c[1] === D.city.paper ? 'Редакция «' + c[1] + '»' : '«' + c[1] + '» (' + c[0] + ')'; }

    // Центр: мэрия, театр, кинотеатр, музей, администрация — добавляем как заведения в офисные здания центра
    const centerBlds = city.buildings.filter((b) => b.d === 'C');
    const cult = rng.shuffle(D.culture.slice());
    for (let k = 0; k < 6 && k < centerBlds.length; k++) {
      const b = centerBlds[Math.floor(rng() * centerBlds.length)];
      const c = cult[k];
      addVenue(b, 'culture', c[1], 20, { sub: c[0] });
    }
    for (const a of D.admin) addVenue(rng.pick(centerBlds), 'admin', a, 22);
    // ещё бары и кафе в центре и на набережной, чтобы вечером было куда пойти
    const embBlds = city.buildings.filter((b) => b.d === 'E');
    for (let k = 0; k < 6; k++) addVenue(rng.pick(embBlds), 'bar', 'Бар «' + takeName('bars', D.bars) + '»', 5);
    // парк: павильон-кафе и летняя сцена (без зданий, заведение у тропинки)
    if (city.park) {
      const pk = city.park;
      const pb = parkBlocks[4] || parkBlocks[0];
      const pav = addBuilding(pb, 'pavilion', pk.cx + 26, pk.cz - 8, pk.cx + 40, pk.cz + 4, 1, 4, 0xc9a26b);
      addVenue(pav, 'cafe', 'Кафе «' + takeName('cafes', D.cafes) + '» в парке', 5);
    }
    // гостиницы, если их не случилось
    if (!(city.venuesByType.hotel || []).length) addVenue(rng.pick(centerBlds), 'hotel', D.hotels[0], 12);

    // ---------------- адреса ----------------
    const byLine = {};
    for (const b of city.buildings) {
      const key = b.line + b.lineIdx;
      (byLine[key] = byLine[key] || []).push(b);
    }
    for (const key in byLine) {
      const list = byLine[key];
      const along = key[0] === 'z' ? (b) => b.doorX : (b) => b.doorZ;
      list.sort((a, b) => along(a) - along(b));
      let odd = 1, even = 2;
      for (const b of list) {
        const oddSide = b.side === 0 || b.side === 3; // северная или западная сторона квартала — нечётные
        b.num = oddSide ? odd : even;
        if (oddSide) odd += 2; else even += 2;
        if (rng() < 0.12) b.korpus = rng.int(1, 3);
      }
    }
    for (const b of city.buildings) {
      const street = b.line === 'z' ? city.streetNames.z[b.lineIdx] : city.streetNames.x[b.lineIdx];
      b.street = street;
      b.address = street + ', ' + b.num + (b.korpus ? ', корп. ' + b.korpus : '');
    }

    // ---------------- метро ----------------
    const stationSpots = [[3, 3], [7, 3], [12, 3], [3, 6], [7, 6], [12, 6], [7, 0], [7, NZ]];
    const stNames = ['Заводская', 'Центральная', 'Кленовая', 'Депо', 'Театральная', 'Парковая', 'Северная', 'Речной вокзал'];
    city.stations = stationSpots.map(([i, j], k) => {
      let blk = blockAt(i, j - 1), c = 3;
      if (!blk) { blk = blockAt(i, j); c = 0; }
      const node = blk.id * 4 + c;
      const sx = c === 3 ? 1 : 1, sz = c === 3 ? -1 : 1;
      const name = stNames[k];
      return {
        id: k, i, j, name, node, x: W.x[node], z: W.z[node],
        px: W.x[node] + sx * (S / 2 + 4.5), pz: W.z[node] + sz * (S / 2 + 4.5),
        closedUntil: -1, crowd: 0,
      };
    });
    // станции с одинаковыми именами (если «Речной вокзал» совпал) — неважно, имена уникальны по списку

    // ---------------- фонари ----------------
    const lamps = [];
    for (const blk of city.blocks) {
      const inset = 0.8;
      const edges = [
        [blk.sx0, blk.sz0 + inset, blk.sx1, blk.sz0 + inset, 0, -1],
        [blk.sx1 - inset, blk.sz0, blk.sx1 - inset, blk.sz1, 1, 0],
        [blk.sx0, blk.sz1 - inset, blk.sx1, blk.sz1 - inset, 0, 1],
        [blk.sx0 + inset, blk.sz0, blk.sx0 + inset, blk.sz1, -1, 0],
      ];
      for (const e of edges) {
        const len = Math.hypot(e[2] - e[0], e[3] - e[1]);
        const n = Math.max(2, Math.round(len / 24));
        for (let k = 0; k <= n; k++) {
          if (k === 0 || k === n) continue;
          const t = k / n;
          lamps.push(e[0] + (e[2] - e[0]) * t, e[1] + (e[3] - e[1]) * t, e[4], e[5], blk.d === 'P' ? 1 : blk.d === 'E' || blk.d === 'C' ? 2 : 0);
        }
      }
    }
    // фонари променада: двойной ряд
    for (let x = X[0]; x <= X[NX]; x += 18) {
      lamps.push(x, city.riverZ0 - 1.2, 0, 1, 3);
      lamps.push(x + 9, Z[NZ] + hwZ(NZ) + 1.2, 0, -1, 3);
    }
    city.lamps = new Float32Array(lamps); // x, z, nx, nz, тип
    city.lampCount = lamps.length / 5;

    // ---------------- деревья ----------------
    const trees = []; // x, z, масштаб, вид (0 — липа, 1 — берёза, 2 — ель, 3 — тополь)
    const inBuilding = (x, z, pad) => {
      const bx = Math.floor((x - X[0]) / P), bz = Math.floor((z - Z[0]) / P);
      const blk = blockAt(bx, bz);
      if (!blk) return false;
      for (const id of blk.buildings) { const b = city.buildings[id]; if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true; }
      return false;
    };
    for (const blk of city.blocks) {
      if (blk.d === 'P') continue;
      // вдоль тротуаров
      if (blk.d !== 'I') {
        const edges = [
          [blk.sx0 + 3, blk.sz0 + 1.9, blk.sx1 - 3, blk.sz0 + 1.9],
          [blk.sx0 + 3, blk.sz1 - 1.9, blk.sx1 - 3, blk.sz1 - 1.9],
          [blk.sx0 + 1.9, blk.sz0 + 3, blk.sx0 + 1.9, blk.sz1 - 3],
          [blk.sx1 - 1.9, blk.sz0 + 3, blk.sx1 - 1.9, blk.sz1 - 3],
        ];
        for (const e of edges) {
          if (blk.d === 'C' && rng() < 0.5) continue;
          const n = Math.floor(Math.hypot(e[2] - e[0], e[3] - e[1]) / 12);
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            trees.push(e[0] + (e[2] - e[0]) * t, e[1] + (e[3] - e[1]) * t, rng.range(0.8, 1.15), blk.d === 'E' ? 0 : rng() < 0.3 ? 1 : 0);
          }
        }
      }
      // во дворах
      const nIn = blk.d === 'R' ? 14 : blk.d === 'E' ? 6 : blk.d === 'I' ? 3 : 3;
      for (let k = 0; k < nIn * 3 && nIn > 0; k++) {
        const x = rng.range(blk.lx0 + 2, blk.lx1 - 2), z = rng.range(blk.lz0 + 2, blk.lz1 - 2);
        if (inBuilding(x, z, 3)) continue;
        if (blk.field && x > blk.field.x0 - 2 && x < blk.field.x1 + 2 && z > blk.field.z0 - 2 && z < blk.field.z1 + 2) continue;
        trees.push(x, z, rng.range(0.8, 1.35), rng() < 0.35 ? 1 : rng() < 0.2 ? 3 : 0);
      }
    }
    // парк: густо, кроме пруда и дорожек
    if (city.park) {
      const pk = city.park;
      pk.pond = { x: pk.cx - 34, z: pk.cz + 30, rx: 42, rz: 26 };
      const pondHit = (x, z) => ((x - pk.pond.x) / (pk.pond.rx + 5)) ** 2 + ((z - pk.pond.z) / (pk.pond.rz + 5)) ** 2 < 1;
      const pathHit = (x, z) => {
        // дорожки: диагонали и бывшие улицы
        const u = (x - pk.x0) / (pk.x1 - pk.x0), v = (z - pk.z0) / (pk.z1 - pk.z0);
        if (Math.abs(u - v) < 0.025 || Math.abs(u + v - 1) < 0.025) return true;
        for (const b of parkBlocks) {
          if (Math.abs(x - b.sx0 - 2) < 3 || Math.abs(x - b.sx1 + 2) < 3 || Math.abs(z - b.sz0 - 2) < 3 || Math.abs(z - b.sz1 + 2) < 3) return true;
        }
        return false;
      };
      for (let k = 0; k < 1400; k++) {
        const x = rng.range(pk.x0 + 3, pk.x1 - 3), z = rng.range(pk.z0 + 3, pk.z1 - 3);
        if (pondHit(x, z) || pathHit(x, z) || inBuilding(x, z, 3)) continue;
        if (Math.hypot(x - pk.cx, z - pk.cz) < 16) continue;
        trees.push(x, z, rng.range(0.9, 1.6), rng() < 0.3 ? 1 : rng() < 0.3 ? 2 : 0);
      }
      // скамейки вдоль дорожек
      for (let k = 0; k < 60; k++) {
        const b = rng.pick(parkBlocks);
        const side = rng.int(0, 3);
        const t = rng();
        let x, z, a;
        if (side === 0) { x = LC.lerp(b.sx0 + 6, b.sx1 - 6, t); z = b.sz0 + 5.5; a = 0; }
        else if (side === 1) { x = b.sx1 - 5.5; z = LC.lerp(b.sz0 + 6, b.sz1 - 6, t); a = Math.PI / 2; }
        else if (side === 2) { x = LC.lerp(b.sx0 + 6, b.sx1 - 6, t); z = b.sz1 - 5.5; a = Math.PI; }
        else { x = b.sx0 + 5.5; z = LC.lerp(b.sz0 + 6, b.sz1 - 6, t); a = -Math.PI / 2; }
        city.benches.push({ x, z, a });
      }
    }
    // лес на окраинах и на том берегу
    const edgeX0 = X[0] - hwX(0), edgeX1 = X[NX] + hwX(NX), edgeZ0 = Z[0] - hwZ(0);
    for (let k = 0; k < 2600; k++) {
      let x, z;
      const r = rng();
      if (r < 0.3) { x = rng.range(edgeX0 - 260, edgeX1 + 260); z = rng.range(edgeZ0 - 260, edgeZ0 - 14); }
      else if (r < 0.48) { x = rng.range(edgeX0 - 260, edgeX0 - 14); z = rng.range(edgeZ0, city.riverZ0 - 4); }
      else if (r < 0.66) { x = rng.range(edgeX1 + 14, edgeX1 + 260); z = rng.range(edgeZ0, city.riverZ0 - 4); }
      else { x = rng.range(edgeX0 - 300, edgeX1 + 300); z = rng.range(city.riverZ1 + 8, city.riverZ1 + 260); }
      trees.push(x, z, rng.range(1.0, 1.9), rng() < 0.5 ? 2 : rng() < 0.5 ? 1 : 0);
    }
    city.trees = new Float32Array(trees);
    city.treeCount = trees.length / 4;

    // ---------------- парковочные места (вдоль обычных улиц, в кармане справа) ----------------
    const spots = [];
    for (const r of R.roads) {
      if (r.ave) continue;
      const off = LANE + PARKW / 2 + 0.2;
      for (let s = 7; s < r.len - 7; s += 6.2) {
        spots.push({ road: r.id, s, x: r.x0 + r.dx * s + r.rx * off, z: r.z0 + r.dz * s + r.rz * off, dir: r.dir, car: -1 });
      }
    }
    city.spots = spots;
    // места у каждого квартала (для поиска парковки у дома и у работы)
    for (const sp of spots) {
      const bx = Math.floor((sp.x - X[0]) / P), bz = Math.floor((sp.z - Z[0]) / P);
      sp.block = bx >= 0 && bz >= 0 && bx < NX && bz < NZ ? bz * NX + bx : -1;
    }
    city.spotsNear = function (x, z, maxN) {
      const out = [];
      for (let k = 0; k < spots.length; k++) {
        const sp = spots[k];
        const d = Math.abs(sp.x - x) + Math.abs(sp.z - z);
        if (d < 140) out.push([d, k]);
      }
      out.sort((a, b) => a[0] - b[0]);
      return out.slice(0, maxN || 20).map((a) => a[1]);
    };

    // ---------------- итоги ----------------
    city.homes = city.buildings.filter((b) => b.kind === 'res' && b.apts > 0);
    city.bounds = { x0: edgeX0, x1: edgeX1, z0: edgeZ0, z1: city.riverZ0 };
    return city;
  };
})(window.LC);
