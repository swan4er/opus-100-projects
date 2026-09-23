/* ================================================================
   Тихоречинск — жизнь горожан.
   Распорядок дня каждого из 10 000 жителей, поездки (пешком, на метро,
   на своей машине), тротуарный навигатор, очередь событий по времени,
   журнал происшествий для газеты и факты «что с человеком сейчас».
   Время мира — игровые минуты; при скорости ×1 минута идёт секунду.
   ================================================================ */
(function (LC) {
  'use strict';
  const D = window.LC_DATA;

  // состояние на улице / внутри
  const ST = LC.ST = { IN: 0, WALK: 1, WAIT: 2, METRO: 3, CAR: 4, STAND: 5 };
  // занятия
  const A = LC.A = {
    SLEEP: 0, HOME: 1, WORK: 2, LUNCH: 3, BAR: 4, GYM: 5, CULTURE: 6, CAFE: 7, SHOP: 8,
    VISIT: 9, PARK: 10, PROM: 11, STREET: 12, DATE: 13, STUDY: 14, CLINIC: 15, SMOKE: 16,
  };
  const ACT_WHERE = ['спит', 'дома', 'на работе', 'обедает', 'в баре', 'в спортзале', 'в театре или кино', 'в кафе', 'в магазине',
    'в гостях', 'гуляет в парке', 'гуляет по набережной', 'работает на улице', 'на свидании', 'на учёбе', 'у врача', 'курит у входа'];
  const ACT_TO = ['домой', 'домой', 'на работу', 'на обед', 'в бар', 'в спортзал', 'в театр', 'в кафе', 'в магазин',
    'в гости', 'в парк', 'на набережную', 'на работу', 'на свидание', 'на учёбу', 'в поликлинику', 'покурить'];
  LC.ACT_WHERE = ACT_WHERE; LC.ACT_TO = ACT_TO;

  const WALK_V = 4.6;      // метров за игровую минуту при pop.speed = 1 (при ×1 — м/с на экране)
  const METRO_V = 55;      // средняя скорость метро с учётом остановок, м/мин

  const S = LC.life = {};
  let city, pop, W, N;

  // ================================================================
  // Тротуарный навигатор: Дейкстра от цели, кэш по цели
  // ================================================================
  const cache = new Map();
  let heap;
  function field(key, targets) { // targets: [[node, extra], …]
    let f = cache.get(key);
    if (f) return f;
    const n = W.count;
    const dist = new Float64Array(n).fill(1e9), next = new Int16Array(n).fill(-1);
    heap.clear();
    for (const [node, extra] of targets) { if (extra < dist[node]) { dist[node] = extra; heap.push(extra, node); } }
    while (heap.n) {
      const u = heap.pop(), du = heap.lastKey;
      if (du > dist[u]) continue;
      const adj = W.adj[u];
      for (let k = 0; k < adj.length; k++) {
        const e = adj[k], nd = du + e.len + (e.cross >= 0 ? 22 : 0); // переход через дорогу: ожидание светофора
        if (nd < dist[e.to]) { dist[e.to] = nd; next[e.to] = u; heap.push(nd, e.to); }
      }
    }
    f = { dist, next };
    if (cache.size > 1400) cache.clear();
    cache.set(key, f);
    return f;
  }
  function edgeInfo(a, b) {
    const adj = W.adj[a];
    for (let k = 0; k < adj.length; k++) if (adj[k].to === b) return adj[k];
    return null;
  }
  // точки привязки: [x, z, [[node, extra],…], faceX, faceZ, key, side]
  function attachBuilding(b) {
    const B = city.buildings[b];
    const dA = Math.hypot(B.doorX - W.x[B.nodeA], B.doorZ - W.z[B.nodeA]);
    const dB = Math.hypot(B.doorX - W.x[B.nodeB], B.doorZ - W.z[B.nodeB]);
    return { x: B.doorX, z: B.doorZ, t: [[B.nodeA, dA], [B.nodeB, dB]], fx: B.faceX, fz: B.faceZ, key: 'b' + b, side: B.nodeA * 1000 + B.nodeB };
  }
  function attachNode(node, x, z) {
    x = x == null ? W.x[node] : x; z = z == null ? W.z[node] : z;
    return { x, z, t: [[node, Math.hypot(x - W.x[node], z - W.z[node])]], key: 'n' + node + (x === W.x[node] ? '' : ':' + x.toFixed(1) + ':' + z.toFixed(1)), side: -1 };
  }
  function nearestNode(x, z) {
    let best = 0, bd = 1e18;
    for (let i = 0; i < W.count; i++) { const d = (W.x[i] - x) ** 2 + (W.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  S.nearestNode = (x, z) => nearestNode(x, z);

  // путь между привязками; off — боковое смещение (правостороннее движение)
  function buildPath(from, to, off) {
    const xs = [], zs = [], cr = [], ax = [];
    if (from.fx != null) { xs.push(from.fx); zs.push(from.fz); cr.push(-1); ax.push(0); }
    xs.push(from.x); zs.push(from.z);
    const direct = from.side >= 0 && from.side === to.side;
    const f = direct ? null : field(to.key, to.t);
    let start = -1;
    if (f) {
      let bd = 1e18;
      for (const [node, extra] of from.t) { const d = extra + f.dist[node]; if (d < bd) { bd = d; start = node; } }
      if (bd > 1e8) start = -1;
    }
    if (start >= 0) {
      let u = start, guard = 0;
      cr.push(-1); ax.push(0);
      xs.push(W.x[u]); zs.push(W.z[u]);
      while (f.next[u] >= 0 && guard++ < 400) {
        const v = f.next[u];
        const e = edgeInfo(u, v);
        cr.push(e && e.cross >= 0 ? e.cross : -1); ax.push(e && e.axis === 'z' ? 1 : 0);
        xs.push(W.x[v]); zs.push(W.z[v]);
        u = v;
      }
    }
    cr.push(-1); ax.push(0);
    xs.push(to.x); zs.push(to.z);
    if (to.fx != null) { cr.push(-1); ax.push(0); xs.push(to.fx); zs.push(to.fz); }
    // выкидываем совпадающие точки
    const X = [xs[0]], Z = [zs[0]], C = [], AX = [];
    for (let i = 1; i < xs.length; i++) {
      if (Math.abs(xs[i] - X[X.length - 1]) + Math.abs(zs[i] - Z[Z.length - 1]) < 0.05) continue;
      X.push(xs[i]); Z.push(zs[i]); C.push(cr[i - 1] !== undefined ? cr[i - 1] : -1); AX.push(ax[i - 1] || 0);
    }
    const n = X.length;
    const p = { x: new Float32Array(n), z: new Float32Array(n), len: new Float32Array(Math.max(1, n - 1)), cr: new Int16Array(Math.max(1, n - 1)), ax: new Uint8Array(Math.max(1, n - 1)), n, seg: 0, u: 0, total: 0, v: undefined };
    // боковое смещение внутренних точек (угловое соединение)
    const firstIn = from.fx != null ? 1 : 0, lastIn = to.fx != null ? n - 2 : n - 1;
    for (let i = 0; i < n; i++) {
      let ox = 0, oz = 0;
      if (off && i >= firstIn && i <= lastIn && n > 1) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        let ax0 = X[i] - X[i0], az0 = Z[i] - Z[i0], ax1 = X[i1] - X[i], az1 = Z[i1] - Z[i];
        const l0 = Math.hypot(ax0, az0) || 1, l1 = Math.hypot(ax1, az1) || 1;
        ax0 /= l0; az0 /= l0; ax1 /= l1; az1 /= l1;
        if (i === i0) { ax0 = ax1; az0 = az1; }
        if (i === i1) { ax1 = ax0; az1 = az0; }
        // правая нормаль: (-dz, dx)
        let nx = -(az0 + az1), nz = ax0 + ax1;
        const nl = Math.hypot(nx, nz);
        if (nl > 0.2) { const k = Math.min(1.8, 2 / (nl * nl / 2 || 1)) ; nx = (nx / nl) * k; nz = (nz / nl) * k; }
        else { nx = -az1; nz = ax1; }
        ox = nx * off; oz = nz * off;
      }
      p.x[i] = X[i] + ox; p.z[i] = Z[i] + oz;
    }
    for (let i = 0; i < n - 1; i++) {
      p.len[i] = Math.hypot(p.x[i + 1] - p.x[i], p.z[i + 1] - p.z[i]);
      p.cr[i] = C[i]; p.ax[i] = AX[i];
      p.total += p.len[i];
    }
    return p;
  }
  S.buildPath = buildPath;

  // ================================================================
  // Состояние жителей
  // ================================================================
  function alloc() {
    S.st = new Uint8Array(N); S.act = new Uint8Array(N);
    S.inB = new Int16Array(N).fill(-1); S.inV = new Int16Array(N).fill(-1);
    S.x = new Float32Array(N); S.z = new Float32Array(N); S.hd = new Float32Array(N); S.ph = new Float32Array(N);
    S.nextT = new Float64Array(N).fill(1e12);
    S.path = new Array(N).fill(null);
    S.trip = new Array(N).fill(null);
    S.ag = new Array(N).fill(null);   // распорядок на сегодня
    S.agi = new Int16Array(N);        // текущий пункт распорядка
    S.km = new Float32Array(N);       // пройдено сегодня, м
    S.lateWork = new Int16Array(N).fill(-1);
    S.lateDate = new Int16Array(N).fill(-1);
    S.drank = new Uint8Array(N);
    S.off = new Float32Array(N);
    S.day = new Int16Array(N);        // день, к которому относится распорядок
    S.log = [];                       // журнал событий
    S.meets = new Array(N).fill(null);
    S.walkers = []; S.wIdx = new Int32Array(N).fill(-1);
    S.bHome = new Int16Array(city.buildings.length);   // жильцов дома
    S.bAwake = new Int16Array(city.buildings.length);  // из них не спят
    S.vIn = city.venues.map(() => new Set());
    S.stCrowd = new Float32Array(city.stations.length);
    S.dates = new Map();              // id → {with, v, t}
  }

  // ---------------- очередь событий: колесо по минутам ----------------
  const WHEEL = 4096;
  let wheel, lastM;
  function schedule(id, t) {
    S.nextT[id] = t;
    wheel[Math.floor(t) & (WHEEL - 1)].push(id);
  }
  S.schedule = schedule;

  // ---------------- видимость и учёт на улице ----------------
  function addWalker(id) { if (S.wIdx[id] < 0) { S.wIdx[id] = S.walkers.length; S.walkers.push(id); } }
  function dropWalker(id) {
    const i = S.wIdx[id]; if (i < 0) return;
    const last = S.walkers.pop();
    if (last !== id) { S.walkers[i] = last; S.wIdx[last] = i; }
    S.wIdx[id] = -1;
  }

  // ---------------- попасть внутрь / выйти ----------------
  function enter(id, b, v, act) {
    S.st[id] = ST.IN; S.inB[id] = b; S.inV[id] = v; S.act[id] = act;
    S.path[id] = null;
    dropWalker(id);
    if (v < 0 && b === pop.home[id]) { S.bHome[b]++; if (act !== A.SLEEP) S.bAwake[b]++; }
    if (v >= 0) {
      const set = S.vIn[v];
      // встречи знакомых
      if (set.size && (act === A.BAR || act === A.CAFE || act === A.DATE || act === A.GYM || act === A.CULTURE || act === A.LUNCH)) {
        for (let k = 0; k < pop.relN[id]; k++) {
          const o = pop.rel[id * 3 + k], t = pop.relT[id * 3 + k];
          if (set.has(o) && t !== 0 && t !== 1 && t !== 2 && t !== 11 && !(S.dates.get(id) && S.dates.get(id).with === o)) {
            logEvent('meet', { a: id, b: o, rel: t, v });
            (S.meets[id] = S.meets[id] || []).push({ o, v, t: LC.clock.t, rel: t });
          }
        }
      }
      set.add(id);
    }
  }
  function leave(id) {
    const b = S.inB[id], v = S.inV[id];
    if (b >= 0 && v < 0 && b === pop.home[id]) { S.bHome[b]--; if (S.act[id] !== A.SLEEP) S.bAwake[b]--; }
    if (v >= 0) S.vIn[v].delete(id);
    S.inB[id] = -1; S.inV[id] = -1;
  }
  function setAct(id, act) { // смена занятия, не выходя из здания
    const b = S.inB[id];
    if (b >= 0 && S.inV[id] < 0 && b === pop.home[id]) {
      if (S.act[id] === A.SLEEP && act !== A.SLEEP) S.bAwake[b]++;
      else if (S.act[id] !== A.SLEEP && act === A.SLEEP) S.bAwake[b]--;
    }
    S.act[id] = act;
  }

  // ---------------- журнал ----------------
  function logEvent(type, data) {
    data.type = type; data.t = LC.clock.t;
    S.log.push(data);
    if (S.log.length > 6000) S.log.splice(0, 1000);
    LC.emit('event', data);
  }
  S.logEvent = logEvent;

  // ================================================================
  // Места: координаты и привязки
  // ================================================================
  function placeOf(item) { // пункт распорядка → {b, v}
    return item;
  }
  function posOfPlace(b) { const B = city.buildings[b]; return [B.doorX, B.doorZ]; }
  const bld = (b) => city.buildings[b];
  const ven = (v) => city.venues[v];

  // оценка времени в пути (мин) — для планирования выхода
  function estTrip(id, bFrom, bTo) {
    if (bFrom === bTo) return 0;
    const A_ = bld(bFrom), B_ = bld(bTo);
    const d = Math.abs(A_.doorX - B_.doorX) + Math.abs(A_.doorZ - B_.doorZ);
    const v = WALK_V * pop.speed[id];
    // коэффициенты сверены с фактическими поездками в модели (медиана факт/оценка ≈ 1)
    const walk = ((d * 1.08) / v + 2 + (d / 76) * 2.2) * 0.94;
    const tr = pop.transport[id];
    if (tr === 2 && d > 380) return (70 / v + (d * 1.3) / 12 + 14) * 1.5;
    if (d > 380) {
      const sa = nearestStation(A_.doorX, A_.doorZ), sb = nearestStation(B_.doorX, B_.doorZ);
      if (sa[0] !== sb[0]) {
        const via = ((sa[1] + sb[1]) * 1.1 / v + metroRide(sa[0], sb[0]) + 4) * 1.1;
        if (via < walk) return via;
      }
    }
    return walk;
  }
  S.estTrip = estTrip;
  S.nearestStation = nearestStation;
  function nearestStation(x, z) {
    let best = 0, bd = 1e9;
    for (const s of city.stations) { const d = Math.abs(s.px - x) + Math.abs(s.pz - z); if (d < bd) { bd = d; best = s.id; } }
    return [best, bd];
  }
  function metroRide(a, b) {
    const A_ = city.stations[a], B_ = city.stations[b];
    return 3 + (Math.abs(A_.x - B_.x) + Math.abs(A_.z - B_.z)) / METRO_V;
  }

  // ================================================================
  // Исполнитель распорядка
  // ================================================================
  function beginItem(id, i, arrivedT) {
    const ag = S.ag[id], it = ag[i];
    S.agi[id] = i;
    const now = LC.clock.t;
    if (it.a === A.PARK || it.a === A.PROM) { startStroll(id, it); return; }
    if (it.a === A.STREET) { startStreetJob(id, it); return; }
    enter(id, it.b, it.v, it.a);
    if (it.fx && (it.a === A.WORK || it.a === A.STUDY) && arrivedT != null) {
      const late = Math.round(arrivedT - it.s);
      if (late >= 3 && it.a === A.WORK) { S.lateWork[id] = late; logEvent('late', { id, min: late, v: it.v }); }
      else if (i <= 2 && S.lateWork[id] < 0) S.lateWork[id] = 0;
    }
    if (it.a === A.DATE && arrivedT != null) {
      const late = Math.round(arrivedT - it.s);
      S.lateDate[id] = Math.max(0, late);
      if (late >= 5) logEvent('dateLate', { id, min: late, v: it.v, with: S.dates.get(id) ? S.dates.get(id).with : -1 });
    }
    if (it.a === A.BAR) S.drank[id] = 1;
    let end = Math.max(it.e, now + 3);
    // курильщики выходят к дверям бара
    if ((it.a === A.BAR || it.a === A.DATE) && LC.hash2(id, 77) < 0.28) end = Math.min(end, now + 25 + LC.hash2(id, Math.floor(now)) * 40);
    schedule(id, end);
  }

  function think(id) {
    const st = S.st[id];
    const now = LC.clock.t;
    if (st === ST.WALK || st === ST.WAIT || st === ST.METRO || st === ST.CAR) return; // в пути: событие от прибытия
    const ag = S.ag[id];
    if (!ag) return;
    let i = S.agi[id];
    const it = ag[i];
    if (st === ST.STAND) { // стоял у входа / на улице
      if (it && it.a === A.STREET) { streetNext(id, it); return; }
      if (S.standB && S.standB[id] >= 0) { const sb = S.standB[id]; S.standB[id] = -1; S.st[id] = ST.IN; enter(id, sb, S.standV[id], it ? it.a : A.BAR); schedule(id, Math.max(it ? it.e : now, now + 10 + LC.hash2(id, Math.floor(now)) * 30)); dropWalker(id); return; }
    }
    // перекур у бара
    if (st === ST.IN && it && (it.a === A.BAR || it.a === A.DATE) && now < it.e - 8 && LC.hash2(id, 77) < 0.28) {
      const b = S.inB[id], v = S.inV[id];
      standOutside(id, b, v, 5 + LC.hash2(id, Math.floor(now) + 1) * 6);
      return;
    }
    if (it && it.a === A.SLEEP) { // проснулся — новый день
      wakeUp(id);
      return;
    }
    // следующий пункт
    if (i + 1 >= ag.length) { S.ag[id] = null; wakeUp(id); return; }
    const nx = ag[i + 1];
    if (nx.a === A.SLEEP && S.inB[id] === pop.home[id]) { setAct(id, A.SLEEP); S.agi[id] = i + 1; schedule(id, nx.e); S.drank[id] = 0; return; }
    if (nx.b >= 0 && nx.b === S.inB[id] && nx.v === S.inV[id]) { // то же место
      S.agi[id] = i + 1; setAct(id, nx.a);
      schedule(id, Math.max(nx.e, now + 2));
      return;
    }
    goTo(id, i + 1);
  }

  function wakeUp(id) {
    const now = LC.clock.t;
    const day = Math.floor(now / 1440 - (LC.clock.min < 240 ? 1 : 0));
    const d = Math.max(day, S.day[id] + 1);
    S.day[id] = d;
    S.km[id] = 0; S.lateWork[id] = -1; S.lateDate[id] = -1; S.meets[id] = null; S.drank[id] = 0;
    if (S.inB[id] === pop.home[id] && S.act[id] === A.SLEEP) setAct(id, A.HOME);
    const ag = S.genAgenda(id, Math.floor(now / 1440), now);
    S.ag[id] = ag; S.agi[id] = 0;
    if (S.inB[id] !== pop.home[id]) { goTo(id, 0); return; }
    schedule(id, Math.max(ag[0].e, now + 1));
  }

  // ---------------- поездка к пункту i ----------------
  function curPoint(id) { // откуда выходим
    const b = S.inB[id];
    if (b >= 0) return attachBuilding(b);
    const n = nearestNode(S.x[id], S.z[id]);
    return attachNode(n, S.x[id], S.z[id]);
  }
  function goTo(id, i) {
    const it = S.ag[id][i];
    const from = curPoint(id);
    const fx = S.inB[id] >= 0 ? bld(S.inB[id]).doorX : S.x[id], fz = S.inB[id] >= 0 ? bld(S.inB[id]).doorZ : S.z[id];
    leave(id);
    if (it.b < 0) { S.agi[id] = i; beginItem(id, i, LC.clock.t); return; } // прогулка/улица стартуют с места
    const to = attachBuilding(it.b);
    const tx = to.x, tz = to.z;
    const d = Math.abs(tx - fx) + Math.abs(tz - fz);
    const legs = [];
    // своя машина рядом?
    const car = pop.car[id];
    if (car >= 0 && d > 380 && !S.drank[id] && LC.traffic && LC.traffic.canDrive(car, fx, fz)) {
      const spot = LC.traffic.carSpotPos(car);
      legs.push({ k: 'walk', to: attachNode(nearestNode(spot[0], spot[1]), spot[0], spot[1]) });
      legs.push({ k: 'car', car, tx, tz });
      legs.push({ k: 'walkTo' }); // до двери — строится по месту парковки
    } else {
      let useMetro = false, sa, sb;
      if (d > 380) {
        sa = nearestStation(fx, fz); sb = nearestStation(tx, tz);
        const v = WALK_V * pop.speed[id];
        if (sa[0] !== sb[0] && (sa[1] + sb[1]) / v + metroRide(sa[0], sb[0]) + 4 < d / v * 0.85) useMetro = true;
      }
      if (useMetro) {
        const A_ = city.stations[sa[0]], B_ = city.stations[sb[0]];
        legs.push({ k: 'walk', to: attachNode(A_.node, A_.px, A_.pz) });
        legs.push({ k: 'metro', a: sa[0], b: sb[0] });
        legs.push({ k: 'walkFrom', from: attachNode(B_.node, B_.px, B_.pz) });
      } else legs.push({ k: 'walk', to });
    }
    S.trip[id] = { legs, li: -1, dest: i, to, t0: LC.clock.t };
    S.agi[id] = i;
    S.act[id] = it.a;
    nextLeg(id, from);
  }

  function startWalk(id, from, to) {
    const p = buildPath(from, to, S.off[id]);
    S.path[id] = p;
    S.st[id] = ST.WALK;
    S.x[id] = p.x[0]; S.z[id] = p.z[0];
    addWalker(id);
  }

  function nextLeg(id, from) {
    const tr = S.trip[id];
    tr.li++;
    if (tr.li >= tr.legs.length) { arrive(id); return; }
    const L = tr.legs[tr.li];
    if (L.k === 'walk') startWalk(id, from, L.to);
    else if (L.k === 'walkFrom') { S.x[id] = L.from.x; S.z[id] = L.from.z; startWalk(id, L.from, tr.to); }
    else if (L.k === 'walkTo') { const n = nearestNode(S.x[id], S.z[id]); startWalk(id, attachNode(n, S.x[id], S.z[id]), tr.to); }
    else if (L.k === 'metro') {
      S.st[id] = ST.METRO; dropWalker(id);
      S.stCrowd[L.a] += 1;
      L.until = LC.clock.t + metroRide(L.a, L.b);
      schedule(id, L.until);
    } else if (L.k === 'car') {
      S.st[id] = ST.CAR; dropWalker(id);
      if (!LC.traffic.startDrive(L.car, id, L.tx, L.tz)) { // не удалось — пешком
        S.st[id] = ST.WALK;
        tr.legs = [{ k: 'walkTo' }]; tr.li = -1;
        nextLeg(id, null);
      }
    }
  }
  S.onCarParked = function (id, x, z) {
    const tr = S.trip[id];
    if (!tr) return;
    S.x[id] = x; S.z[id] = z;
    nextLeg(id, null);
  };

  function arrive(id) {
    const tr = S.trip[id];
    S.trip[id] = null;
    dropWalker(id);
    const i = tr ? tr.dest : S.agi[id];
    beginItem(id, i, LC.clock.t);
  }

  // метро: событие окончания поездки
  function metroDone(id) {
    const tr = S.trip[id];
    const L = tr.legs[tr.li];
    S.stCrowd[L.a] = Math.max(0, S.stCrowd[L.a] - 1);
    nextLeg(id, null);
  }

  // ---------------- прогулки ----------------
  function strollTarget(id, it) {
    const r = Math.random();
    if (it.a === A.PROM && city.promNodes.length) return city.promNodes[Math.floor(r * city.promNodes.length)];
    if (city.park) {
      const pn = S.parkNodes;
      return pn[Math.floor(r * pn.length)];
    }
    return nearestNode(S.x[id], S.z[id]);
  }
  function startStroll(id, it) {
    S.act[id] = it.a;
    const from = S.inB[id] >= 0 ? attachBuilding(S.inB[id]) : attachNode(nearestNode(S.x[id], S.z[id]), S.x[id], S.z[id]);
    leave(id);
    const tgt = strollTarget(id, it);
    S.trip[id] = { legs: [{ k: 'walk', to: attachNode(tgt) }], li: -1, dest: S.agi[id], stroll: true, t0: LC.clock.t };
    nextLeg(id, from);
  }
  // уличная работа
  function startStreetJob(id, it) {
    S.act[id] = A.STREET;
    const from = S.inB[id] >= 0 ? attachBuilding(S.inB[id]) : attachNode(nearestNode(S.x[id], S.z[id]), S.x[id], S.z[id]);
    leave(id);
    S.trip[id] = null;
    streetStep(id, it, from);
  }
  function streetStep(id, it, from) {
    const kind = it.street;
    const now = LC.clock.t;
    if (now >= it.e) { // смена кончилась — домой
      S.agi[id] = Math.min(S.ag[id].length - 1, S.agi[id]);
      const i = S.agi[id] + 1 < S.ag[id].length ? S.agi[id] + 1 : S.agi[id];
      if (S.st[id] === ST.STAND) { S.st[id] = ST.WALK; }
      goToFromStreet(id, i);
      return;
    }
    if (kind === 'taxi' || kind === 'bus' || kind === 'van') {
      if (LC.traffic && LC.traffic.startService(id, it.e)) { S.st[id] = ST.CAR; dropWalker(id); return; }
      // нет машины — «на линии» у депо
      S.st[id] = ST.IN; S.inB[id] = LC.traffic ? LC.traffic.depotB : pop.home[id]; S.inV[id] = -1; dropWalker(id);
      schedule(id, it.e);
      return;
    }
    if (kind === 'promoter' || kind === 'musician') {
      if (S.st[id] !== ST.STAND || !S.standSpot) {
        const spots = kind === 'musician' ? S.musicSpots : S.promoSpots;
        const sp = spots[id % spots.length];
        if (from && Math.hypot(sp[0] - from.x, sp[1] - from.z) > 3) {
          S.trip[id] = { legs: [{ k: 'walk', to: attachNode(nearestNode(sp[0], sp[1]), sp[0] + (LC.hash2(id, 5) - 0.5) * 3, sp[1] + (LC.hash2(id, 6) - 0.5) * 3) }], li: -1, dest: S.agi[id], street: true, t0: now };
          nextLeg(id, from);
          return;
        }
      }
      S.st[id] = ST.STAND; addWalker(id);
      schedule(id, Math.min(it.e, now + 60));
      return;
    }
    // курьер, дворник, патруль: ходят между точками
    let tgt;
    const x = from ? from.x : S.x[id], z = from ? from.z : S.z[id];
    if (kind === 'courier') {
      const all = city.venues;
      const v = all[Math.floor(Math.random() * all.length)];
      const b = Math.random() < 0.5 ? v.b : city.homes[Math.floor(Math.random() * city.homes.length)].id;
      if (Math.abs(bld(b).doorX - x) + Math.abs(bld(b).doorZ - z) > 700) tgt = attachNode(nearestNode(x + (Math.random() - 0.5) * 500, z + (Math.random() - 0.5) * 400));
      else tgt = attachBuilding(b);
    } else {
      const rad = kind === 'sweeper' ? 90 : 320;
      const hb = bld(pop.home[id]);
      const cx = kind === 'sweeper' ? hb.doorX : x, cz = kind === 'sweeper' ? hb.doorZ : z;
      tgt = attachNode(nearestNode(cx + (Math.random() - 0.5) * rad * 2, cz + (Math.random() - 0.5) * rad * 2));
    }
    if (!from) from = attachNode(nearestNode(S.x[id], S.z[id]), S.x[id], S.z[id]);
    S.trip[id] = { legs: [{ k: 'walk', to: tgt }], li: -1, dest: S.agi[id], street: true, t0: now };
    nextLeg(id, from);
  }
  function streetNext(id, it) { streetStep(id, it, attachNode(nearestNode(S.x[id], S.z[id]), S.x[id], S.z[id])); }
  S.onServiceDone = function (id, x, z) { // водитель вернул машину
    S.x[id] = x; S.z[id] = z; S.st[id] = ST.WALK;
    const i = Math.min(S.agi[id] + 1, S.ag[id].length - 1);
    goToFromStreet(id, i);
  };
  function goToFromStreet(id, i) {
    const it = S.ag[id][i];
    if (!it || it.b < 0) { S.agi[id] = i; beginItem(id, i, LC.clock.t); return; }
    S.inB[id] = -1; S.inV[id] = -1;
    goTo(id, i);
  }

  // постоять у входа (перекур)
  function standOutside(id, b, v, dur) {
    leave(id);
    const B = bld(b);
    S.standB[id] = b; S.standV[id] = v;
    const a = LC.hash2(id, Math.floor(LC.clock.t)) * Math.PI * 2;
    S.x[id] = B.doorX + Math.cos(a) * 1.6; S.z[id] = B.doorZ + Math.sin(a) * 1.2;
    S.hd[id] = a + Math.PI;
    S.st[id] = ST.STAND; S.act[id] = A.SMOKE;
    addWalker(id);
    schedule(id, LC.clock.t + dur);
  }

  // ================================================================
  // Движение пешеходов
  // ================================================================
  function stepWalkers(dt) {
    const T = LC.traffic;
    const list = S.walkers;
    for (let k = list.length - 1; k >= 0; k--) {
      const id = list[k];
      const st = S.st[id];
      if (st === ST.STAND) { S.ph[id] += dt * 0.3; continue; }
      const p = S.path[id];
      if (!p) continue;
      if (p.v === undefined) p.v = WALK_V * pop.speed[id] * (S.act[id] === A.STREET && pop.prof[id] === S.courierProf ? 1.5 : S.act[id] === A.PARK || S.act[id] === A.PROM ? 0.78 : 1);
      let dist = p.v * dt;
      let moved = 0;
      while (dist > 0) {
        const seg = p.seg;
        if (seg >= p.n - 1) break;
        if (p.u === 0 && p.cr[seg] >= 0 && T && !T.pedGreen(p.cr[seg], p.ax[seg])) { S.st[id] = ST.WAIT; break; }
        S.st[id] = ST.WALK;
        const rem = p.len[seg] - p.u;
        if (dist < rem) { p.u += dist; moved += dist; dist = 0; }
        else { dist -= rem; moved += rem; p.seg++; p.u = 0; }
      }
      S.km[id] += moved;
      S.ph[id] += moved * 0.9;
      const seg = Math.min(p.seg, p.n - 2);
      if (p.n >= 2) {
        const L = p.len[seg] || 1, t = p.seg >= p.n - 1 ? 1 : p.u / L;
        const x0 = p.x[seg], z0 = p.z[seg], x1 = p.x[seg + 1], z1 = p.z[seg + 1];
        S.x[id] = x0 + (x1 - x0) * t; S.z[id] = z0 + (z1 - z0) * t;
        if (L > 0.01) S.hd[id] = Math.atan2(x1 - x0, z1 - z0);
      }
      if (p.seg >= p.n - 1) walkDone(id);
    }
  }
  function walkDone(id) {
    const tr = S.trip[id];
    S.path[id] = null;
    if (!tr) { dropWalker(id); return; }
    const L = tr.legs[tr.li];
    // вход в метро: немного постоять у турникетов
    if (tr.legs[tr.li + 1] && tr.legs[tr.li + 1].k === 'metro' && !L.queued) {
      L.queued = true;
      S.st[id] = ST.STAND;
      S.path[id] = null;
      const hour = LC.clock.min / 60;
      const rush = (hour > 7 && hour < 9.5) || (hour > 17 && hour < 19.5) ? 1 : 0.3;
      tr.queueUntil = LC.clock.t + Math.random() * 3 * rush + 0.3;
      S.queueing.push(id);
      return;
    }
    if (tr.stroll) { // прогулка: следующая точка или домой
      const it = S.ag[id][S.agi[id]];
      if (LC.clock.t < it.e - 5) {
        const tgt = strollTarget(id, it);
        tr.legs = [{ k: 'walk', to: attachNode(tgt) }]; tr.li = -1;
        const n = nearestNode(S.x[id], S.z[id]);
        nextLeg(id, attachNode(n, S.x[id], S.z[id]));
        return;
      }
      S.trip[id] = null;
      dropWalker(id);
      const i = S.agi[id];
      S.inB[id] = -1;
      if (i + 1 < S.ag[id].length) goTo(id, i + 1); else { S.ag[id] = null; wakeUp(id); }
      return;
    }
    if (tr.street) {
      const it = S.ag[id][S.agi[id]];
      S.trip[id] = null;
      if (it && it.a === A.STREET) {
        if (it.street === 'courier' && LC.clock.t < it.e) { // доставка у двери
          S.st[id] = ST.STAND;
          schedule(id, LC.clock.t + 1 + Math.random() * 2.5);
          return;
        }
        streetStep(id, it, attachNode(nearestNode(S.x[id], S.z[id]), S.x[id], S.z[id]));
        return;
      }
    }
    nextLeg(id, null);
  }

  // очередь у турникетов
  function stepQueues() {
    const q = S.queueing, now = LC.clock.t;
    for (let k = q.length - 1; k >= 0; k--) {
      const id = q[k], tr = S.trip[id];
      if (!tr || now >= tr.queueUntil) {
        q[k] = q[q.length - 1]; q.pop();
        if (tr) { dropWalker(id); nextLeg(id, null); }
      }
    }
  }

  // ================================================================
  // Шаг мира
  // ================================================================
  S.step = function (dt) {
    const c = LC.clock;
    const prevDay = Math.floor(c.t / 1440);
    c.t += dt;
    c.day = Math.floor(c.t / 1440); c.min = c.t - c.day * 1440;
    if (c.day !== prevDay) S.planDates(c.day);
    // события по минутам
    const m = Math.floor(c.t);
    while (lastM < m) {
      lastM++;
      const bucket = wheel[lastM & (WHEEL - 1)];
      if (!bucket.length) continue;
      wheel[lastM & (WHEEL - 1)] = [];
      for (let k = 0; k < bucket.length; k++) {
        const id = bucket[k];
        if (Math.floor(S.nextT[id]) !== lastM) continue;
        S.nextT[id] = 1e12;
        if (S.st[id] === ST.METRO) { metroDone(id); continue; }
        think(id);
      }
    }
    stepQueues();
    stepWalkers(dt);
    if (LC.traffic) LC.traffic.step(dt);
    // пешеходов много в метро — считаем толпу у входов
  };

  // ================================================================
  // Старт: расставить всех по распорядку и прогреть мир
  // ================================================================
  S.init = function (c, p, startT) {
    city = c; pop = p; W = city.walk; N = pop.n;
    heap = new LC.Heap(1024);
    alloc();
    S.standB = new Int16Array(N).fill(-1); S.standV = new Int16Array(N).fill(-1);
    S.queueing = [];
    S.courierProf = D.professions.findIndex((q) => q.street === 'courier');
    wheel = Array.from({ length: WHEEL }, () => []);
    // точки для прогулок и уличных профессий
    S.parkNodes = [];
    if (city.park) {
      const pb = city.blocks.filter((b) => b.d === 'P');
      for (const b of pb) for (let c2 = 0; c2 < 4; c2++) S.parkNodes.push(b.id * 4 + c2);
      S.parkNodes.push(city.park.midNode);
    }
    S.promoSpots = city.stations.map((s) => [s.px + 3, s.pz - 3]);
    S.musicSpots = [];
    for (let k = 2; k < city.promNodes.length; k += 5) S.musicSpots.push([W.x[city.promNodes[k]], W.z[city.promNodes[k]] + 3]);
    for (let id = 0; id < N; id++) S.off[id] = 0.35 + LC.hash2(id, 99) * 1.25;

    const c0 = LC.clock;
    c0.t = startT; c0.day = Math.floor(startT / 1440); c0.min = startT - c0.day * 1440;
    lastM = Math.floor(startT);
    S.planDates(c0.day);
    const now = startT;
    for (let id = 0; id < N; id++) {
      // распорядок начинается с утреннего подъёма (или вчерашнего — для тех, кто ещё не спал)
      let day = c0.day;
      let wake = day * 1440 + pop.wake[id];
      if (wake > now) { day--; wake -= 1440; }
      let ag = S.genAgenda(id, day, wake);
      if (ag[ag.length - 1].e <= now) { day++; wake = day * 1440 + pop.wake[id]; ag = S.genAgenda(id, day, wake); }
      S.ag[id] = ag; S.day[id] = day;
      // найти текущий пункт
      let i = 0;
      while (i < ag.length - 1 && ag[i].e <= now) i++;
      let it = ag[i];
      if (now < it.s) { i = Math.max(0, i - 1); it = ag[i]; }
      S.agi[id] = i;
      if (it.b >= 0 && it.a !== A.PARK && it.a !== A.PROM && it.a !== A.STREET) {
        enter(id, it.b, it.v, it.a);
        if (it.a === A.WORK || it.a === A.STUDY) S.lateWork[id] = 0;
        schedule(id, Math.max(now + LC.hash2(id, 5) * 6, it.e));
      } else {
        // прогулка или уличная работа: стартуем из дома (водители автобусов и фургонов — из депо)
        enter(id, it.b >= 0 ? it.b : pop.home[id], -1, it.b >= 0 ? A.STREET : A.HOME);
        S.agi[id] = i;
        S.pendingStart = S.pendingStart || [];
        S.pendingStart.push(id);
      }
    }
  };
  // после того как машины расставлены: начать прогулки и смены на улице
  S.startPending = function () {
    for (const id of S.pendingStart || []) { S.nextT[id] = 1e12; beginItem(id, S.agi[id], null); }
    S.pendingStart = null;
  };

  // прогрев: прокрутить мир вперёд крупными шагами
  S.warm = function (minutes, dt) {
    const steps = Math.ceil(minutes / dt);
    for (let k = 0; k < steps; k++) S.step(dt);
  };

})(window.LC);
