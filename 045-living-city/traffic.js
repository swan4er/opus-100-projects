/* ================================================================
   Тихоречинск — движение.
   Машины горожан и служебный транспорт (такси, автобусы, фургоны):
   полосы, модель следования IDM, светофоры с «зелёной волной»,
   правило «не выезжай на занятый перекрёсток», парковка у тротуара,
   поиск маршрута по графу дорог, учёт пробок для газеты.
   Единицы: метры и игровые минуты (при ×1 — м/с на экране).
   ================================================================ */
(function (LC) {
  'use strict';
  const D = window.LC_DATA;
  const T = LC.traffic = {};
  let city, pop, R, roads, nodes, G;

  // ---------------- параметры ----------------
  const KIND = { CAR: 0, TAXI: 1, BUS: 2, VAN: 3 };
  const LEN = [4.4, 4.6, 11.5, 5.6];
  const V_STREET = 13.5, V_AVE = 17, V_TURN = 7;
  const ACC = 2.8, DEC = 3.4, S0 = 2.0, HEAD = 1.0;
  const STATE = { PARKED: 0, DRIVE: 1, DEPOT: 2, PULL: 3, UNPARK: 4, GARAGE: 5 };
  T.KIND = KIND; T.STATE = STATE; T.LEN = LEN;
  // цвета машин (sRGB): спокойные «городские»
  T.COLORS = [0xe9e7e1, 0xc3c6c9, 0x2a2d31, 0x1f3a5f, 0x8f1f1f, 0xb8ab8c, 0x3d5a45, 0x5c6670, 0xd9d4c7, 0x6a2f3f, 0x9aa3ab, 0x2f4f6f];
  T.TAXI = 0xe6b422; T.BUS = 0xd4672a; T.VAN = 0xf0efe9;

  // ---------------- светофоры ----------------
  // фаза A — движение вдоль x (восток/запад), фаза B — вдоль z (север/юг)
  function setupLights() {
    for (const n of nodes) {
      let cnt = 0; for (let d = 0; d < 4; d++) if (n.out[d] >= 0) cnt++;
      const aveA = city.aveZ(n.j), aveB = city.aveX(n.i);
      // светофоры только там, где есть проспект; тихие перекрёстки улиц — без них
      n.signal = cnt >= 3 && (aveA || aveB);
      n.gA = aveA && !aveB ? 11 : !aveA && aveB ? 7 : 9;
      n.gB = aveB && !aveA ? 11 : !aveB && aveA ? 7 : 9;
      n.cyc = n.gA + n.gB + 6;
      n.off = (n.i * 5.3 + n.j * 7.1) % n.cyc;
      n.phase = 0; n.tc = 0;
    }
  }
  // 2 — зелёный, 1 — жёлтый, 0 — красный
  function lightFor(n, dir) {
    if (!n.signal) return 2;
    const tc = n.tc, a = dir % 2 === 0;
    if (tc < n.gA) return a ? 2 : 0;
    if (tc < n.gA + 2) return a ? 1 : 0;
    if (tc < n.gA + 3) return 0;
    if (tc < n.gA + 3 + n.gB) return a ? 0 : 2;
    if (tc < n.gA + 5 + n.gB) return a ? 0 : 1;
    return 0;
  }
  T.lightFor = (node, dir) => lightFor(nodes[node], dir);
  // пешеходам: ось 0 — идут вдоль x (пересекают дорогу север-юг) → зелёный в фазе A
  T.pedGreen = function (node, axis) {
    const n = nodes[node];
    if (!n || !n.signal) return true;
    const tc = n.tc;
    if (axis === 0) return tc > 0.4 && tc < n.gA - 0.8;
    return tc > n.gA + 3.4 && tc < n.gA + 3 + n.gB - 0.8;
  };

  // ---------------- машины ----------------
  function alloc(n) {
    T.n = n;
    T.kind = new Uint8Array(n); T.color = new Uint32Array(n); T.owner = new Int32Array(n).fill(-1);
    T.driver = new Int32Array(n).fill(-1);
    T.state = new Uint8Array(n);
    T.road = new Int16Array(n).fill(-1); T.lane = new Uint8Array(n);
    T.s = new Float32Array(n); T.v = new Float32Array(n); T.acc = new Float32Array(n);
    T.x = new Float32Array(n); T.z = new Float32Array(n); T.hd = new Float32Array(n);
    T.spot = new Int16Array(n).fill(-1);      // где стоит
    T.target = new Int16Array(n).fill(-1);    // где встанет
    T.route = new Array(n).fill(null); T.ri = new Int16Array(n);
    T.turn = new Array(n).fill(null);
    T.pull = new Float32Array(n);             // 0..1 — манёвр у бордюра
    T.until = new Float64Array(n);            // конец смены (служебные)
    T.hazard = new Uint8Array(n);             // аварийка у фургона при разгрузке
    T.waitT = new Float64Array(n);            // простой до (фургон, автобус на остановке)
    T.busLoop = new Int8Array(n).fill(-1);
    T.km = new Float32Array(n);
    T.plan = new Int16Array(n).fill(-1); T.planFrom = new Int16Array(n).fill(-1);
    T.served = new Int16Array(n).fill(-1);
  }
  const laneKey = (r, l) => r * 2 + l;
  const laneOff = (r, l) => (roads[r].ave ? city.MEDIAN / 2 + city.LANE / 2 + l * city.LANE : city.LANE / 2);
  T.laneOff = laneOff;
  const vmax = (r) => (roads[r].ave ? V_AVE : V_STREET);

  function posOn(r, s, off) {
    const q = roads[r];
    return [q.x0 + q.dx * s + q.rx * off, q.z0 + q.dz * s + q.rz * off];
  }
  function spotCurb(sp) { // точка на краю тротуара напротив места
    const q = roads[sp.road];
    const off = city.LANE + city.PARKW + 1.2;
    return [q.x0 + q.dx * sp.s + q.rx * off, q.z0 + q.dz * sp.s + q.rz * off];
  }

  // ---------------- места для парковки ----------------
  function freeSpotNear(x, z, avoid) {
    const spots = city.spots;
    let best = -1, bd = 1e18;
    for (let k = 0; k < spots.length; k++) {
      const sp = spots[k];
      if (sp.car >= 0 || k === avoid) continue;
      const d = Math.abs(sp.x - x) + Math.abs(sp.z - z);
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  function parkAt(c, k) {
    const sp = city.spots[k];
    sp.car = c;
    T.spot[c] = k; T.state[c] = STATE.PARKED; T.road[c] = -1; T.v[c] = 0;
    T.x[c] = sp.x; T.z[c] = sp.z;
    T.hd[c] = Math.atan2(roads[sp.road].dx, roads[sp.road].dz);
  }

  // ---------------- маршрут по дорогам (без разворотов) ----------------
  let rHeap;
  const rDist = [], rPrev = [];
  function findRoute(fromRoad, toRoad) {
    const n = roads.length;
    if (!rDist.length) { for (let i = 0; i < n; i++) { rDist.push(0); rPrev.push(-1); } }
    for (let i = 0; i < n; i++) { rDist[i] = 1e18; rPrev[i] = -1; }
    rHeap.clear();
    rDist[fromRoad] = 0; rHeap.push(0, fromRoad);
    while (rHeap.n) {
      const r = rHeap.pop(), dr = rHeap.lastKey;
      if (dr > rDist[r]) continue;
      if (r === toRoad && r !== fromRoad) break;
      const q = roads[r], nb = nodes[q.b];
      for (let d = 0; d < 4; d++) {
        const r2 = nb.out[d];
        if (r2 < 0 || d === (q.dir + 2) % 4) continue;
        const q2 = roads[r2];
        const turnPen = d === q.dir ? 0 : d === (q.dir + 1) % 4 ? 4 : 12; // правый поворот дешевле левого
        const cost = dr + q2.len / vmax(r2) + turnPen / 10 + (G.queue[r2] || 0) * 0.35 + (nb.signal ? 1.2 : 0);
        if (cost < rDist[r2]) { rDist[r2] = cost; rPrev[r2] = r; rHeap.push(cost, r2); }
      }
    }
    if (rPrev[toRoad] < 0 && toRoad !== fromRoad) return null;
    const out = [];
    let r = toRoad, guard = 0;
    while (r !== fromRoad && r >= 0 && guard++ < 600) { out.push(r); r = rPrev[r]; }
    if (r !== fromRoad) return null;
    out.reverse();
    return Int16Array.from(out);
  }
  T.findRoute = findRoute;

  // ---------------- полосы ----------------
  function laneList(r, l) { return G.lanes[laneKey(r, l)]; }
  function insertSorted(list, c) { // по убыванию s (первый — самый дальний)
    let i = 0;
    while (i < list.length && T.s[list[i]] > T.s[c]) i++;
    list.splice(i, 0, c);
  }
  function removeFrom(list, c) { const i = list.indexOf(c); if (i >= 0) list.splice(i, 1); }
  function chooseLane(r, nextRoad) {
    if (!roads[r].ave) return 0;
    if (nextRoad < 0) return 1;
    const q = roads[r], q2 = roads[nextRoad];
    if (q2.dir === (q.dir + 1) % 4) return 1;        // направо — правый ряд
    if (q2.dir === (q.dir + 3) % 4) return 0;        // налево — левый
    const a = laneList(r, 0), b = laneList(r, 1);
    return a.length <= b.length ? 0 : 1;
  }
  function laneSpace(r, l, need) { // хватит ли места у въезда на дорогу
    const list = laneList(r, l);
    if (!list.length) return true;
    const last = list[list.length - 1];
    return T.s[last] - LEN[T.kind[last]] > need;
  }

  // ---------------- отправить машину ----------------
  // выезд с места стоянки к точке (tx, tz)
  // ближайшая к точке обычная улица и позиция на ней (въезд в подземный паркинг)
  function nearestStreet(x, z) {
    let best = -1, bd = 1e18, bs = 0;
    for (const q of roads) {
      if (q.ave || q.len < 20) continue;
      const s = LC.clamp((x - q.x0) * q.dx + (z - q.z0) * q.dz, 6, q.len - 6);
      const px = q.x0 + q.dx * s + q.rx * 5, pz = q.z0 + q.dz * s + q.rz * 5;
      const d = Math.abs(px - x) + Math.abs(pz - z);
      if (d < bd) { bd = d; best = q.id; bs = s; }
    }
    return [best, bs];
  }
  T.startDrive = function (c, driver, tx, tz) {
    const st = T.state[c];
    if (st !== STATE.PARKED && st !== STATE.GARAGE) return false;
    // откуда: место у тротуара или въезд паркинга
    let r0, s0;
    if (st === STATE.PARKED) { const sp0 = city.spots[T.spot[c]]; r0 = sp0.road; s0 = sp0.s; }
    else { r0 = G.garage[c * 2]; s0 = G.garage[c * 2 + 1]; }
    // куда: свободное место рядом, иначе подземный паркинг у входа
    const k = freeSpotNear(tx, tz, st === STATE.PARKED ? T.spot[c] : -1);
    const spd = k >= 0 ? Math.abs(city.spots[k].x - tx) + Math.abs(city.spots[k].z - tz) : 1e9;
    let r1, s1, garage = false;
    if (k >= 0 && spd < 95) { r1 = city.spots[k].road; s1 = city.spots[k].s; }
    else { [r1, s1] = nearestStreet(tx, tz); garage = true; if (r1 < 0) return false; }
    const route = routeTo(r0, r1, s0, s1);
    if (!route) return false;
    if (garage) { T.target[c] = -4; G.garage[c * 2] = r1; G.garage[c * 2 + 1] = s1; }
    else { city.spots[k].car = c; T.target[c] = k; }
    T.route[c] = route; T.ri[c] = 0;
    T.driver[c] = driver;
    T.state[c] = STATE.UNPARK; T.pull[c] = 1;
    T.road[c] = r0; T.s[c] = s0; T.v[c] = 0;
    T.lane[c] = chooseLane(r0, route.length ? route[0] : -1);
    T.hazard[c] = 0;
    return true;
  };
  T.canDrive = function (c, x, z) {
    if (T.state[c] === STATE.GARAGE) return Math.abs(G.gx[c] - x) + Math.abs(G.gz[c] - z) < 260;
    if (T.state[c] !== STATE.PARKED || T.spot[c] < 0) return false;
    const sp = city.spots[T.spot[c]];
    return Math.abs(sp.x - x) + Math.abs(sp.z - z) < 260;
  };
  T.carSpotPos = function (c) {
    if (T.state[c] === STATE.GARAGE) return [G.gx[c], G.gz[c]];
    return spotCurb(city.spots[T.spot[c]]);
  };
  T.carOf = (id) => pop.car[id];

  // служебный транспорт: водитель пришёл в депо — машина выезжает
  T.startService = function (id, until) {
    const c = G.serviceOf.get(id);
    if (c == null) return false;
    if (T.kind[c] === KIND.TAXI) { // такси ночует у дома водителя
      if (T.state[c] !== STATE.PARKED) return false;
      const sp = city.spots[T.spot[c]];
      T.driver[c] = id; T.until[c] = until;
      T.road[c] = sp.road; T.s[c] = sp.s; T.v[c] = 0;
      T.state[c] = STATE.UNPARK; T.pull[c] = 1; T.target[c] = -1;
      nextServiceLeg(c);
      T.lane[c] = chooseLane(T.road[c], T.route[c] && T.route[c].length ? T.route[c][0] : -1);
      return true;
    }
    if (T.state[c] !== STATE.DEPOT) return false;
    T.driver[c] = id; T.until[c] = until;
    const ex = G.depotExits[G.exitK++ % G.depotExits.length];
    T.road[c] = ex[0]; T.s[c] = ex[1]; T.v[c] = 0;
    T.state[c] = STATE.UNPARK; T.pull[c] = 1;
    T.spot[c] = -1; T.target[c] = -1;
    T.waitT[c] = LC.clock.t + (G.exitK % 5) * 0.4;
    nextServiceLeg(c);
    T.lane[c] = chooseLane(T.road[c], T.route[c] && T.route[c].length ? T.route[c][0] : -1);
    return true;
  };
  function nextServiceLeg(c) {
    const kind = T.kind[c];
    const cur = T.road[c];
    const now = LC.clock.t;
    let dest;
    if (now >= T.until[c] && kind === KIND.TAXI) { // смена кончилась: к дому водителя
      const hb = city.buildings[pop.home[T.driver[c]]];
      const k = freeSpotNear(hb.doorX, hb.doorZ, -1);
      if (k >= 0) {
        city.spots[k].car = c; T.target[c] = k;
        const rt = routeTo(cur, city.spots[k].road, T.s[c], city.spots[k].s);
        if (rt) { T.route[c] = rt; T.ri[c] = 0; return; }
        city.spots[k].car = -1;
      }
      dest = Math.floor(Math.random() * roads.length); T.target[c] = -3;
    } else if (now >= T.until[c]) { dest = G.depotRoads[Math.floor(Math.random() * G.depotRoads.length)]; T.target[c] = -2; } // в депо
    else if (kind === KIND.BUS) {
      const loop = G.busLoops[T.busLoop[c]];
      // ближайшая дорога петли впереди
      dest = loop[(loop.indexOf(cur) + 1 + loop.length) % loop.length];
      if (loop.indexOf(cur) < 0) dest = loop[0];
      T.target[c] = -3;
    } else if (kind === KIND.VAN) {
      const shops = city.venuesByType.shop.concat(city.venuesByType.cafe || []);
      const v = city.venues[shops[Math.floor(Math.random() * shops.length)]];
      const k = freeSpotNear(v.x, v.z, -1);
      if (k >= 0) { city.spots[k].car = c; T.target[c] = k; dest = city.spots[k].road; }
      else { dest = Math.floor(Math.random() * roads.length); T.target[c] = -3; }
    } else {
      dest = Math.floor(Math.random() * roads.length); T.target[c] = -3;
    }
    let route = dest === cur ? (T.target[c] >= 0 ? routeTo(cur, dest, T.s[c], city.spots[T.target[c]].s) : new Int16Array(0)) : findRoute(cur, dest);
    if (!route) { route = new Int16Array(0); if (T.target[c] >= 0) city.spots[T.target[c]].car = -1; T.target[c] = -3; }
    T.route[c] = route; T.ri[c] = 0;
  }

  // ---------------- шаг движения ----------------
  function idm(v, v0, gap, dv) {
    const ss = S0 + Math.max(0, v * HEAD + (v * dv) / (2 * Math.sqrt(ACC * DEC)));
    const g = Math.max(gap, 0.1);
    return ACC * (1 - Math.pow(v / v0, 4) - (ss / g) * (ss / g));
  }

  // следующая дорога: по маршруту или случайный поворот (запоминается)
  function nextRoadOf(c, q) {
    const route = T.route[c];
    if (route && T.ri[c] < route.length) return route[T.ri[c]];
    if (T.planFrom[c] !== T.road[c]) { T.plan[c] = pickAny(q); T.planFrom[c] = T.road[c]; }
    return T.plan[c];
  }

  function stepCars(dt) {
    const now = LC.clock.t;
    // светофоры
    for (const n of nodes) if (n.signal) n.tc = (now + n.off) % n.cyc;
    // выезды с парковки и заезды в карман
    for (let c = 0; c < T.n; c++) {
      const st = T.state[c];
      if (st === STATE.UNPARK) {
        const r = T.road[c], l = T.lane[c], list = laneList(r, l);
        let ok = T.waitT[c] <= now;
        if (ok) for (let k = 0; k < list.length; k++) { const d = T.s[list[k]] - T.s[c]; if (d > -14 && d < 8) { ok = false; break; } }
        if (ok) {
          T.pull[c] -= dt * 1.6;
          if (T.pull[c] <= 0) {
            T.pull[c] = 0; T.state[c] = STATE.DRIVE;
            if (T.spot[c] >= 0) { const sp = city.spots[T.spot[c]]; if (sp.car === c) sp.car = -1; T.spot[c] = -1; }
            T.planFrom[c] = -1;
            insertSorted(list, c);
          }
        }
        placePulled(c);
      } else if (st === STATE.PULL) {
        T.pull[c] += dt * 1.6;
        if (T.pull[c] >= 1) { T.pull[c] = 1; finishPark(c); }
        else placePulled(c);
      }
    }
    // по полосам
    for (let key = 0; key < G.lanes.length; key++) {
      const list = G.lanes[key];
      if (!list.length) continue;
      const r = key >> 1, q = roads[r], v0r = vmax(r);
      const stopS = G.stopAt[r];
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const s = T.s[c], v = T.v[c];
        let gap = 1e4, dv = 0;
        if (i > 0) { const lead = list[i - 1]; gap = T.s[lead] - LEN[T.kind[lead]] - s; dv = v - T.v[lead]; }
        const v0 = s < 0 ? V_TURN : v0r;
        const route = T.route[c];
        const last = !route || T.ri[c] >= route.length;
        const tg = T.target[c];
        const parkHere = last && tg >= 0 && city.spots[tg].road === r && city.spots[tg].s >= s - 2;
        // своё место на этой дороге — тормозим к нему
        if (parkHere) { const sg = city.spots[tg].s - s + 1.2; if (sg < gap) { gap = Math.max(0.1, sg); dv = v; } }
        if (last && tg === -4 && G.garage[c * 2] === r) { const sg = G.garage[c * 2 + 1] - s + 2.5; if (sg > 0 && sg < gap) { gap = sg; dv = v * 0.5; } }
        // автобусная остановка
        if (stopS != null && T.kind[c] === KIND.BUS && T.served[c] !== r && s < stopS) { const sg = stopS - s + 0.6; if (sg < gap) { gap = sg; dv = v; } }
        // конец дороги: светофор и место на следующей
        if (i === 0 && !parkHere) {
          const toEnd = q.len - s;
          const nextR = nextRoadOf(c, q);
          const lt = lightFor(nodes[q.b], q.dir);
          const nl = nextR >= 0 ? chooseLane(nextR, -1) : 0;
          const blocked = nextR < 0 || lt === 0 || (lt === 1 && toEnd > v * 1.4 + 2) || !laneSpace(nextR, nl, 2.5);
          if (blocked) { if (toEnd + 0.4 < gap) { gap = toEnd + 0.4; dv = v; } }
          else {
            const nlist = laneList(nextR, nl);
            if (nlist.length) { const tail = nlist[nlist.length - 1]; const g2 = toEnd + 8 + T.s[tail] - LEN[T.kind[tail]]; if (g2 < gap) { gap = g2; dv = v - T.v[tail]; } }
          }
        }
        let a = idm(v, v0, gap, dv);
        if (a < -14) a = -14;
        let nv = v + a * dt;
        if (nv < 0) nv = 0;
        if (T.waitT[c] > now) nv = 0;
        let ns = s + nv * dt;
        if (i > 0) { const lead = list[i - 1]; const lim = T.s[lead] - LEN[T.kind[lead]] - 0.4; if (ns > lim) { ns = Math.max(s, lim); nv = Math.min(nv, T.v[lead]); } }
        T.v[c] = nv; T.s[c] = ns; T.acc[c] = nv < 0.3 ? -1 : a;
        T.km[c] += nv * dt;
        // остановка отработана
        if (stopS != null && T.kind[c] === KIND.BUS && T.served[c] !== r && ns > stopS - 2.5 && nv < 1) { T.served[c] = r; T.waitT[c] = now + 1.1; }
      }
      // первые машины: переезд перекрёстка
      for (let guard = 0; guard < 3 && list.length; guard++) {
        const c = list[0];
        const s = T.s[c];
        if (s < q.len) break;
        const nr = nextRoadOf(c, q);
        if (nr < 0) { T.s[c] = q.len; T.v[c] = 0; break; }
        const route = T.route[c];
        if (route && T.ri[c] < route.length) T.ri[c]++;
        list.shift();
        enterRoad(c, r, nr, s - q.len);
      }
      // парковка: машина у своего места и почти стоит; проскочила — круг через квартал
      for (let i = list.length - 1; i >= 0; i--) {
        const c = list[i], tg = T.target[c];
        if (tg < 0) continue;
        const route = T.route[c];
        if (route && T.ri[c] < route.length) continue;
        const sp = city.spots[tg];
        if (sp.road !== r) continue;
        if (Math.abs(T.s[c] - sp.s) < 2.4 && T.v[c] < 2.4) {
          list.splice(i, 1);
          T.state[c] = STATE.PULL; T.pull[c] = 0; T.v[c] = 0;
          T.spot[c] = tg; T.s[c] = sp.s;
        } else if (T.s[c] > sp.s + 2.4) {
          const loop = routeLoop(r);
          if (loop) { T.route[c] = loop; T.ri[c] = 0; }
        }
      }
    }
    // въезд в подземный паркинг
    for (let c = 0; c < T.n; c++) {
      if (T.state[c] !== STATE.DRIVE || T.target[c] !== -4) continue;
      const route = T.route[c];
      if (route && T.ri[c] < route.length) continue;
      if (T.road[c] !== G.garage[c * 2] || T.s[c] < G.garage[c * 2 + 1] - 2) continue;
      removeFrom(laneList(T.road[c], T.lane[c]), c);
      T.state[c] = STATE.GARAGE; T.v[c] = 0; T.target[c] = -1; T.route[c] = null;
      const q = roads[T.road[c]], gs = G.garage[c * 2 + 1];
      G.gx[c] = q.x0 + q.dx * gs + q.rx * (city.LANE + city.PARKW + 1.2); G.gz[c] = q.z0 + q.dz * gs + q.rz * (city.LANE + city.PARKW + 1.2);
      const d = T.driver[c]; T.driver[c] = -1;
      if (d >= 0 && LC.life) LC.life.onCarParked(d, G.gx[c], G.gz[c]);
    }
    // служебные: конец маршрута
    for (let c = 0; c < T.n; c++) {
      if (T.state[c] !== STATE.DRIVE || T.kind[c] === KIND.CAR) continue;
      const route = T.route[c];
      if (route && T.ri[c] < route.length) continue;
      const tg = T.target[c];
      if (tg === -2 && G.depotRoads.includes(T.road[c]) && T.s[c] > roads[T.road[c]].len * 0.3) { toDepot(c); continue; }
      if (tg === -3 || tg === -2) nextServiceLeg(c);
    }
    // координаты движущихся
    for (let c = 0; c < T.n; c++) if (T.state[c] === STATE.DRIVE) placeDriving(c);
  }
  // маршрут «вокруг квартала» обратно на ту же дорогу
  function routeLoop(r) {
    const q = roads[r], na = nodes[q.a];
    let best = null;
    for (let d = 0; d < 4; d++) {
      const rin = na.inn[d];
      if (rin < 0 || rin === r) continue;
      if (roads[rin].a === q.b) continue; // встречная полоса этой же улицы — это разворот
      const rt = findRoute(r, rin);
      if (rt && (!best || rt.length < best.length)) best = rt;
    }
    if (!best) return null;
    const out = new Int16Array(best.length + 1);
    out.set(best); out[best.length] = r;
    return out;
  }
  function routeTo(fromR, toR, sFrom, sTo) {
    if (fromR !== toR) return findRoute(fromR, toR);
    if (sTo > sFrom + 8) return new Int16Array(0);
    return routeLoop(fromR);
  }
  function pickAny(q) { // случайный разрешённый выезд (кроме разворота)
    const nb = nodes[q.b];
    const opts = [];
    for (let d = 0; d < 4; d++) if (nb.out[d] >= 0 && d !== (q.dir + 2) % 4) opts.push(nb.out[d]);
    if (!opts.length) return nb.out[(q.dir + 2) % 4];
    return opts[Math.floor(Math.random() * opts.length)];
  }
  function enterRoad(c, fromR, toR, over) {
    const route = T.route[c];
    const after = route && T.ri[c] < route.length ? route[T.ri[c]] : -1;
    const l0 = T.lane[c];
    const l = chooseLane(toR, after);
    // дуга поворота: из конца fromR (полоса l0) в начало toR (полоса l)
    const a = roads[fromR], b = roads[toR];
    const [x0, z0] = posOn(fromR, a.len, laneOff(fromR, l0));
    const [x2, z2] = posOn(toR, 0, laneOff(toR, l));
    let cx, cz;
    if (a.dir === b.dir) { cx = (x0 + x2) / 2; cz = (z0 + z2) / 2; }
    else if (a.dx !== 0) { cx = x2; cz = z0; } else { cx = x0; cz = z2; }
    const L = (Math.hypot(cx - x0, cz - z0) + Math.hypot(x2 - cx, z2 - cz) + Math.hypot(x2 - x0, z2 - z0)) / 2;
    T.turn[c] = { x0, z0, cx, cz, x2, z2, L };
    T.road[c] = toR; T.lane[c] = l; T.s[c] = over - L; T.planFrom[c] = -1;
    if (T.s[c] > 0) T.s[c] = 0;
    laneList(toR, l).push(c);
  }
  function placeDriving(c) {
    const s = T.s[c], r = T.road[c];
    if (s < 0 && T.turn[c]) {
      const tn = T.turn[c], u = Math.max(0, Math.min(1, 1 + s / tn.L)), w = 1 - u;
      T.x[c] = w * w * tn.x0 + 2 * w * u * tn.cx + u * u * tn.x2;
      T.z[c] = w * w * tn.z0 + 2 * w * u * tn.cz + u * u * tn.z2;
      const dx = 2 * w * (tn.cx - tn.x0) + 2 * u * (tn.x2 - tn.cx), dz = 2 * w * (tn.cz - tn.z0) + 2 * u * (tn.z2 - tn.cz);
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) T.hd[c] = Math.atan2(dx, dz);
    } else {
      const q = roads[r], off = laneOff(r, T.lane[c]);
      T.x[c] = q.x0 + q.dx * s + q.rx * off; T.z[c] = q.z0 + q.dz * s + q.rz * off;
      T.hd[c] = Math.atan2(q.dx, q.dz);
    }
  }
  function placePulled(c) { // между полосой и карманом
    const r = T.road[c], q = roads[r];
    const lo = laneOff(r, T.lane[c]), po = city.LANE + city.PARKW / 2 + 0.2;
    const k = T.pull[c], e = k * k * (3 - 2 * k);
    const off = lo + (po - lo) * e;
    const s = T.s[c];
    T.x[c] = q.x0 + q.dx * s + q.rx * off; T.z[c] = q.z0 + q.dz * s + q.rz * off;
    T.hd[c] = Math.atan2(q.dx, q.dz) + (e * (1 - e)) * 0.9 * (T.state[c] === STATE.PULL ? 1 : -1);
    if (T.kind[c] !== KIND.CAR && T.spot[c] < 0 && T.state[c] === STATE.UNPARK) T.hd[c] = Math.atan2(q.dx, q.dz);
  }
  function finishPark(c) {
    const k = T.spot[c];
    const sp = city.spots[k];
    parkAt(c, k);
    T.target[c] = -1; T.route[c] = null;
    const d = T.driver[c];
    if (T.kind[c] === KIND.VAN) { // разгрузка и дальше
      T.hazard[c] = 1;
      T.state[c] = STATE.PARKED;
      G.vanWait.push([c, LC.clock.t + 2 + Math.random() * 4]);
      return;
    }
    T.driver[c] = -1;
    if (d >= 0 && LC.life) {
      const [x, z] = spotCurb(sp);
      if (T.kind[c] === KIND.TAXI) LC.life.onServiceDone(d, x, z); else LC.life.onCarParked(d, x, z);
    }
  }
  function toDepot(c) {
    const q = laneList(T.road[c], T.lane[c]);
    removeFrom(q, c);
    T.state[c] = STATE.DEPOT; T.road[c] = -1; T.v[c] = 0;
    const d = T.driver[c]; T.driver[c] = -1;
    const B = city.buildings[T.depotB];
    if (d >= 0 && LC.life) LC.life.onServiceDone(d, B.doorX, B.doorZ);
  }
  function stepVans() {
    const now = LC.clock.t;
    for (let k = G.vanWait.length - 1; k >= 0; k--) {
      const [c, t] = G.vanWait[k];
      if (now < t) continue;
      G.vanWait.splice(k, 1);
      T.hazard[c] = 0;
      const sp = T.spot[c];
      T.state[c] = STATE.UNPARK; T.pull[c] = 1;
      T.road[c] = city.spots[sp].road; T.s[c] = city.spots[sp].s; T.v[c] = 0;
      city.spots[sp].car = -1;
      T.spot[c] = -1;
      nextServiceLeg(c);
      T.lane[c] = chooseLane(T.road[c], T.route[c] && T.route[c].length ? T.route[c][0] : -1);
    }
  }
  // ---------------- пробки для газеты ----------------
  function measureQueues() {
    const q = G.queue;
    q.fill(0);
    for (let key = 0; key < G.lanes.length; key++) {
      const list = G.lanes[key], r = key >> 1;
      for (const c of list) if (T.v[c] < 1 && T.s[c] > 0) q[r]++;
    }
    const now = LC.clock.t;
    const hour = Math.floor(now / 60);
    for (const n of nodes) {
      let sum = 0;
      for (let d = 0; d < 4; d++) if (n.inn[d] >= 0) sum += q[n.inn[d]];
      if (sum >= 7) {
        const prev = G.jamHour.get(n.id);
        if (!prev || prev.hour !== hour || prev.cars < sum) {
          const ev = { node: n.id, cars: sum, street1: n.street[0], street2: n.street[1] };
          if (!prev || prev.hour !== hour) { G.jamHour.set(n.id, { hour, cars: sum, ev }); if (LC.life) LC.life.logEvent('jam', ev); }
          else { prev.cars = sum; prev.ev.cars = sum; }
        }
      }
    }
  }

  let accT = 0, queueT = 0;
  T.step = function (dt) {
    accT += dt;
    // подшаги не длиннее 0,08 мин
    const steps = Math.max(1, Math.ceil(dt / 0.08));
    const h = dt / steps;
    for (let k = 0; k < steps; k++) stepCars(h);
    stepVans();
    queueT += dt;
    if (queueT > 2) { queueT = 0; measureQueues(); }
  };

  // ================================================================
  // Инициализация
  // ================================================================
  T.init = function (c, p) {
    city = c; pop = p; R = city.road; roads = R.roads; nodes = R.nodes;
    rHeap = new LC.Heap(1024);
    G = T.G = { lanes: [], queue: new Int16Array(roads.length), jamHour: new Map(), serviceOf: new Map(), vanWait: [], buses: [], busLoops: [], stopAt: {}, garage: null, gx: null, gz: null };
    for (let r = 0; r < roads.length; r++) { G.lanes.push([], []); }
    setupLights();
    // депо — склад в промзоне у реки или первый склад
    const whs = city.buildings.filter((b) => b.kind === 'warehouse');
    const depot = whs.sort((a, b) => a.cx - b.cx + (b.cz - a.cz) * 0.2)[0] || city.buildings[0];
    T.depotB = depot.id;
    // дорога у депо: ближайшая к двери
    let bestR = 0, bd = 1e18;
    for (const q of roads) {
      if (q.ave) continue;
      const mx = q.x0 + q.dx * q.len / 2, mz = q.z0 + q.dz * q.len / 2;
      const d = Math.abs(mx - depot.doorX) + Math.abs(mz - depot.doorZ);
      if (d < bd) { bd = d; bestR = q.id; }
    }
    G.depotRoad = bestR;
    depot.depot = true;
    // выезды из депо: все улицы вокруг квартала депо
    const blk = city.blocks[depot.block];
    G.depotRoads = [];
    G.depotExits = [];
    G.exitK = 0;
    for (const q of roads) {
      const mx = q.x0 + q.dx * q.len / 2 + q.rx * 4, mz = q.z0 + q.dz * q.len / 2 + q.rz * 4;
      if (mx > blk.sx0 - 12 && mx < blk.sx1 + 12 && mz > blk.sz0 - 12 && mz < blk.sz1 + 12 && q.len > 30) {
        G.depotRoads.push(q.id);
        for (const f of [0.25, 0.5, 0.75]) G.depotExits.push([q.id, q.len * f]);
      }
    }
    if (!G.depotRoads.length) { G.depotRoads.push(bestR); G.depotExits.push([bestR, roads[bestR].len / 2]); }
    // автобусные петли
    const ni = city.nodeIdx;
    const loopOf = (pts) => { // список перекрёстков → список дорог
      const out = [];
      for (let k = 0; k < pts.length; k++) {
        const a = pts[k], b = pts[(k + 1) % pts.length];
        const di = Math.sign(b[0] - a[0]), dj = Math.sign(b[1] - a[1]);
        let i = a[0], j = a[1];
        while (i !== b[0] || j !== b[1]) {
          const n = nodes[ni(i, j)];
          const dir = di > 0 ? 0 : di < 0 ? 2 : dj > 0 ? 1 : 3;
          const r = n.out[dir];
          if (r < 0) return null;
          out.push(r);
          i += di; j += dj;
        }
      }
      return out;
    };
    const loops = [
      [[3, 3], [12, 3], [12, 6], [3, 6]],
      [[3, 6], [12, 6], [12, 3], [3, 3]],
      [[7, 0], [7, 10], [3, 10], [3, 6], [7, 6]].slice(0, 0),
      [[1, 1], [13, 1], [13, 9], [1, 9]],
      [[7, 1], [7, 9], [10, 9], [10, 1]].slice(0, 0),
    ].filter((l) => l.length).map(loopOf).filter(Boolean);
    G.busLoops = loops;
    for (const loop of loops) for (let k = 0; k < loop.length; k += 2) G.stopAt[loop[k]] = roads[loop[k]].len * 0.55;

    // сколько машин
    const serviceDrivers = [];
    for (let id = 0; id < pop.n; id++) if (pop.transport[id] === 3) serviceDrivers.push(id);
    const nPriv = pop.privateCars;
    const total = nPriv + serviceDrivers.length;
    alloc(total);
    const rng = LC.makeRng(LC.CFG.seed * 7 + 3);
    // личные машины: owner по pop.car
    for (let id = 0; id < pop.n; id++) {
      const c = pop.car[id];
      if (c < 0) continue;
      T.kind[c] = KIND.CAR; T.owner[c] = id;
      T.color[c] = T.COLORS[Math.floor(rng() * T.COLORS.length)];
    }
    let busK = 0;
    serviceDrivers.forEach((id, k) => {
      const c = nPriv + k;
      const st = D.professions[pop.prof[id]].street;
      T.kind[c] = st === 'taxi' ? KIND.TAXI : st === 'bus' ? KIND.BUS : KIND.VAN;
      T.owner[c] = id;
      T.color[c] = T.kind[c] === KIND.TAXI ? T.TAXI : T.kind[c] === KIND.BUS ? T.BUS : T.VAN;
      T.state[c] = STATE.DEPOT;
      if (T.kind[c] === KIND.BUS) { T.busLoop[c] = busK++ % Math.max(1, loops.length); G.buses.push(c); }
      G.serviceOf.set(id, c);
      pop.car[id] = c;
    });
    T.privateCount = nPriv; T.serviceCount = serviceDrivers.length;
    G.garage = new Float32Array(total * 2); G.gx = new Float32Array(total); G.gz = new Float32Array(total);
  };
  // расставить личные машины по местам рядом с тем, где сейчас хозяин
  T.placeParked = function () {
    const L = LC.life;
    const order = [];
    for (let c = 0; c < T.n; c++) if (T.kind[c] === KIND.CAR || T.kind[c] === KIND.TAXI) order.push(c);
    for (const c of order) {
      const id = T.owner[c];
      if (T.kind[c] === KIND.TAXI && L.st[id] === LC.ST.CAR) continue;
      const b = L.inB[id] >= 0 ? L.inB[id] : pop.home[id];
      const B = city.buildings[b];
      const k = freeSpotNear(B.doorX + (Math.random() - 0.5) * 30, B.doorZ + (Math.random() - 0.5) * 30, -1);
      if (k >= 0) parkAt(c, k);
    }
  };

  // ---------------- для отрисовки и интерфейса ----------------
  T.visible = (c) => T.state[c] !== STATE.DEPOT && T.state[c] !== STATE.GARAGE;
  T.moving = (c) => T.state[c] === STATE.DRIVE || T.state[c] === STATE.UNPARK || T.state[c] === STATE.PULL;
  T.countMoving = function () { let k = 0; for (let c = 0; c < T.n; c++) if (T.state[c] === STATE.DRIVE) k++; return k; };
  T.carOfDriver = function (id) {
    const c = pop.car[id];
    if (c >= 0 && T.driver[c] === id) return c;
    return -1;
  };
  T.whoIn = function (c) { return T.driver[c] >= 0 ? T.driver[c] : T.owner[c]; };
})(window.LC);
