/* ================================================================
   Тихоречинск — население.
   10 000 жителей в типизированных массивах: семья, квартира, возраст,
   профессия, место работы, смена, транспорт, машина, любимое место
   вечером, характер, мысли, тайна, мечта и 1–3 связи с другими жителями.
   ================================================================ */
(function (LC) {
  'use strict';
  const D = window.LC_DATA;

  // типы связей: [мужская форма, женская форма] — подпись по полу того, КЕМ человек приходится
  LC.REL = [
    ['муж', 'жена'],                 // 0 супруг
    ['сын', 'дочь'],                 // 1 ребёнок
    ['отец', 'мать'],                // 2 родитель
    ['брат', 'сестра'],              // 3
    ['друг', 'подруга'],             // 4
    ['коллега', 'коллега'],          // 5
    ['сосед', 'соседка'],            // 6
    ['бывший', 'бывшая'],            // 7
    ['тайная любовь', 'тайная любовь'], // 8 — односторонняя: он(а) не знает
    ['начальник', 'начальница'],     // 9
    ['подчинённый', 'подчинённая'],  // 10
    ['парень', 'девушка'],           // 11 — встречаются
    ['одноклассник', 'одноклассница'], // 12
  ];
  const REV = [0, 2, 1, 3, 4, 5, 6, 7, -1, 10, 9, 11, 12];
  LC.relLabel = (type, otherFemale) => LC.REL[type][otherFemale ? 1 : 0];

  // вечерние предпочтения
  LC.EVE = ['дома', 'бар', 'спортзал', 'прогулка в парке', 'прогулка по набережной', 'театр или кино', 'в гости к другу', 'кафе'];
  // палитра одежды (sRGB)
  LC.CLOTH = [0x2b3445, 0x1d1f24, 0x6b6f76, 0xc9bfae, 0x7a2e35, 0x5d6b3f, 0xe8e4da, 0xb8433a, 0xd7a84a, 0x3f6f8f,
    0x8f5d3a, 0x2f5d50, 0xa7a9ac, 0x4a3b5c, 0xe07b39, 0x355c9a, 0x9c8a6b, 0x5a4636, 0xd9c6a0, 0x234060];
  LC.PANTS = [0x2e3f5c, 0x1f2328, 0x4a4d52, 0x3b4f73, 0x6e6250, 0x2a2a2e, 0x55606b, 0x7c6b55];
  LC.SKIN = [0xf0c8a8, 0xdcae8a, 0xc08c68, 0x9a6a4c];
  LC.HAIR = [0x2a211c, 0x4a3426, 0x7a5a3a, 0xc4a06a, 0x9a4a2a, 0xb9b6b0, 0x151515];

  LC.generatePeople = function (city, seed) {
    const N = LC.CFG.people;
    const rng = LC.makeRng((seed * 2654435761) >>> 0);
    const profs = D.professions;
    const pidx = (t) => profs.findIndex((p) => p.t === t);
    const PR = { pupil: pidx('школьник'), student: pidx('студент'), pens: pidx('пенсионер'), unemp: pidx('безработный'), mat: pidx('в декрете') };

    const pop = {
      n: N,
      sex: new Uint8Array(N), age: new Uint8Array(N),
      first: new Uint16Array(N), pat: new Uint16Array(N), sur: new Uint16Array(N),
      home: new Int16Array(N), apt: new Uint16Array(N), hh: new Int32Array(N),
      prof: new Uint8Array(N), work: new Int16Array(N).fill(-1),
      shiftS: new Uint16Array(N), shiftE: new Uint16Array(N), workDays: new Uint8Array(N),
      wake: new Uint16Array(N), sleep: new Uint16Array(N),
      transport: new Uint8Array(N), car: new Int16Array(N).fill(-1),
      stHome: new Int8Array(N).fill(-1), stWork: new Int8Array(N).fill(-1),
      lunch: new Int16Array(N).fill(-1),
      eve: new Uint8Array(N), fav: new Int16Array(N).fill(-1),
      trait1: new Uint8Array(N), trait2: new Uint8Array(N), hobby: new Uint8Array(N),
      thought: new Uint8Array(N), secret: new Uint8Array(N), dream: new Uint8Array(N), pet: new Int8Array(N).fill(-1),
      rel: new Int32Array(N * 3).fill(-1), relT: new Uint8Array(N * 3), relN: new Uint8Array(N),
      lonely: new Float32Array(N), mood: new Float32Array(N), jobSat: new Float32Array(N), punct: new Float32Array(N),
      speed: new Float32Array(N), height: new Float32Array(N),
      look: new Uint8Array(N * 4), birthday: new Uint16Array(N),
      commute: new Float32Array(N), hhSize: new Uint8Array(N),
    };
    const households = [];

    // ---------------- домохозяйства ----------------
    const homes = city.homes;
    let wsum = 0; const cum = homes.map((b) => (wsum += b.apts * (b.d === 'R' ? 1 : 0.7)));
    const pickHome = () => { const t = rng() * wsum; let lo = 0, hi = cum.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < t) lo = m + 1; else hi = m; } return homes[lo]; };
    const usedApt = new Map();
    const pickApt = (b) => {
      let set = usedApt.get(b.id); if (!set) usedApt.set(b.id, (set = new Set()));
      for (let k = 0; k < 50; k++) { const a = 1 + Math.floor(rng() * b.apts); if (!set.has(a)) { set.add(a); return a; } }
      return 1 + Math.floor(rng() * b.apts);
    };
    const adultAge = (lo, hi) => { // чуть больше молодых и пожилых
      const t = rng();
      return Math.round(lo + (hi - lo) * (t < 0.5 ? t * t * 2 * 0.5 + t * 0.5 : t));
    };
    const HH = [
      { t: 'single', w: 27 }, { t: 'couple', w: 17 }, { t: 'family', w: 24 }, { t: 'parent', w: 7 },
      { t: 'oldcouple', w: 9 }, { t: 'oldsingle', w: 9 }, { t: 'mates', w: 5 }, { t: 'family3', w: 4 },
    ];
    let n = 0;
    while (n < N) {
      const type = rng.weighted(HH, (h) => h.w).t;
      const m = [];
      const kidAge = () => (rng() < 0.82 ? rng.int(7, 17) : rng.int(18, 24));
      if (type === 'single') m.push({ sex: rng() < 0.48 ? 1 : 0, age: adultAge(19, 64) });
      else if (type === 'couple') { const a = rng.int(21, 58); m.push({ sex: 0, age: a + rng.int(0, 4) }, { sex: 1, age: a }); }
      else if (type === 'family' || type === 'family3') {
        const a = rng.int(28, 49);
        m.push({ sex: 0, age: a + rng.int(0, 5) }, { sex: 1, age: a });
        const nk = type === 'family3' ? 3 : rng() < 0.55 ? 1 : 2;
        for (let k = 0; k < nk; k++) m.push({ sex: rng() < 0.5 ? 1 : 0, age: Math.min(kidAge(), a - 19), kid: true });
      } else if (type === 'parent') {
        const a = rng.int(26, 50);
        m.push({ sex: rng() < 0.82 ? 1 : 0, age: a });
        m.push({ sex: rng() < 0.5 ? 1 : 0, age: Math.min(kidAge(), a - 19), kid: true });
      } else if (type === 'oldcouple') { const a = rng.int(60, 82); m.push({ sex: 0, age: a + rng.int(0, 4) }, { sex: 1, age: a }); }
      else if (type === 'oldsingle') m.push({ sex: rng() < 0.7 ? 1 : 0, age: rng.int(62, 91) });
      else { const k = rng.int(2, 3); for (let q = 0; q < k; q++) m.push({ sex: rng() < 0.5 ? 1 : 0, age: rng.int(18, 26), mate: true }); }

      const home = pickHome();
      const apt = pickApt(home);
      const sur = rng.int(0, D.surnames.length - 1);
      const dad = rng.int(0, D.maleFirst.length - 1); // имя отца детей (для отчества)
      const hid = households.length;
      const hh = { id: hid, type, home: home.id, apt, members: [] };
      households.push(hh);
      for (let k = 0; k < m.length && n < N; k++) {
        const x = m[k], id = n++;
        pop.sex[id] = x.sex; pop.age[id] = LC.clamp(x.age, 7, 95);
        pop.sur[id] = x.mate ? rng.int(0, D.surnames.length - 1) : sur;
        pop.first[id] = x.sex ? rng.int(0, D.femaleFirst.length - 1) : rng.int(0, D.maleFirst.length - 1);
        pop.pat[id] = x.kid ? (m[0].sex === 0 ? -1 : dad) : rng.int(0, D.maleFirst.length - 1);
        pop.home[id] = home.id; pop.apt[id] = apt; pop.hh[id] = hid;
        hh.members.push(id);
        home.residents.push(id);
      }
      // отчество детей по имени отца (первый член семьи — отец)
      if (hh.members.length && pop.sex[hh.members[0]] === 0) {
        for (const id of hh.members) if (pop.pat[id] === 65535) pop.pat[id] = pop.first[hh.members[0]];
      }
      for (const id of hh.members) if (pop.pat[id] === 65535) pop.pat[id] = dad;
      for (const id of hh.members) pop.hhSize[id] = hh.members.length;
    }
    pop.households = households;

    // ---------------- профессии и места работы ----------------
    const venues = city.venues;
    const byType = city.venuesByType;
    const fillCount = new Int32Array(venues.length);
    const pickVenue = (type, near) => {
      const list = byType[type];
      if (!list || !list.length) return -1;
      if (near) { // ближайшее (школы для детей)
        let best = -1, bd = 1e9;
        for (const v of list) { const d = Math.abs(venues[v].x - near.doorX) + Math.abs(venues[v].z - near.doorZ) + fillCount[v] * 2; if (d < bd) { bd = d; best = v; } }
        return best;
      }
      // случайное, с учётом заполненности
      let best = -1, bs = -1e9;
      for (let k = 0; k < 6; k++) {
        const v = list[Math.floor(rng() * list.length)];
        const s = venues[v].jobs * 1.6 - fillCount[v] + rng() * 4;
        if (s > bs) { bs = s; best = v; }
      }
      return best;
    };
    const workable = profs.map((p, i) => ({ p, i })).filter((o) => o.p.w > 0 && (o.p.at === 'street' || o.p.at === 'home' || o.p.at === 'none' || (byType[o.p.at] && byType[o.p.at].length)));
    // кэш подходящих профессий по (возраст, пол): список и накопленные веса
    const profCache = new Map();
    const pickProf = (age, sex) => {
      const key = age * 2 + sex;
      let c = profCache.get(key);
      if (!c) {
        const ok = workable.filter((o) => age >= o.p.age[0] && age <= o.p.age[1] && (!o.p.sex || (o.p.sex === 'f') === !!sex));
        let s = 0; const cum = ok.map((o) => (s += o.p.w));
        c = { ok, cum, s };
        profCache.set(key, c);
      }
      if (!c.ok.length) return PR.unemp;
      const t = rng() * c.s;
      let k = 0; while (k < c.cum.length - 1 && c.cum[k] < t) k++;
      return c.ok[k].i;
    };
    for (let id = 0; id < N; id++) {
      const age = pop.age[id], sex = pop.sex[id];
      let pi;
      if (age <= 17) pi = PR.pupil;
      else if (age <= 22 && rng() < 0.6) pi = PR.student;
      else if (age >= 63 && rng() < 0.8) pi = PR.pens;
      else if (age >= 60 && rng() < 0.5) pi = PR.pens;
      else if (sex === 1 && age >= 23 && age <= 38 && rng() < 0.05) pi = PR.mat;
      else pi = pickProf(age, sex);
      pop.prof[id] = pi;
      const p = profs[pi];
      if (p.at !== 'street' && p.at !== 'home' && p.at !== 'none') {
        const v = pickVenue(p.at, p.at === 'school' && age <= 17 ? city.buildings[pop.home[id]] : null);
        if (v >= 0) { pop.work[id] = v; fillCount[v]++; venues[v].staff.push(id); }
      }
    }

    // ---------------- смены ----------------
    const SH = { office: [540, 1080], early: [420, 960], day: [480, 1020], late: [720, 1260], evening: [1020, 120], night: [1320, 420], school: [480, 870], free: [600, 1020] };
    for (let id = 0; id < N; id++) {
      const p = profs[pop.prof[id]];
      let [s, e] = SH[p.shift] || SH.office;
      const jitter = p.shift === 'office' ? rng.pick([-60, -30, 0, 0, 0, 30, 60]) : p.shift === 'school' ? 0 : rng.pick([-30, 0, 0, 30]);
      if (p.t === 'студент') { s = 540 + rng.pick([0, 0, 60, 90]); e = s + rng.pick([300, 360, 420]); }
      if (p.t === 'школьник') { e = pop.age[id] < 11 ? 750 : pop.age[id] < 14 ? 810 : 870; }
      // автобусы и фургоны работают в две смены
      if ((p.street === 'bus' && rng() < 0.5) || (p.street === 'van' && rng() < 0.4)) { s = SH.late[0]; e = SH.late[1]; }
      s = (s + jitter + 1440) % 1440; e = (e + jitter + 1440) % 1440;
      pop.shiftS[id] = s; pop.shiftE[id] = e;
      // 0 — будни, 1 — два через два, 2 — не работает
      pop.workDays[id] = p.at === 'none' || p.at === 'home' ? (p.at === 'home' ? 0 : 2)
        : ['shop', 'cafe', 'bar', 'restaurant', 'hotel', 'street', 'gym', 'culture'].includes(p.at) || p.shift === 'night' ? 1 : 0;
    }

    // ---------------- характер, мысли, облик ----------------
    // противоположные черты не сочетаются: «общительный» не бывает «замкнутым»
    const OPP = { 'soc+': 'soc-', 'soc-': 'soc+', 'mood+': 'mood-', 'mood-': 'mood+', lazy: 'diligent', diligent: 'lazy', calm: 'anx', anx: 'calm',
      generous: 'stingy', stingy: 'generous', bold: 'shy', shy: 'bold', funny: 'grumpy', grumpy: 'funny', pedantic: 'scatter', scatter: 'pedantic' };
    const tagTraits = (tag) => D.traits.map((t, i) => (t[2] === tag ? i : -1)).filter((i) => i >= 0);
    for (let id = 0; id < N; id++) {
      pop.trait1[id] = rng.int(0, D.traits.length - 1);
      do { pop.trait2[id] = rng.int(0, D.traits.length - 1); } while (D.traits[pop.trait2[id]][2] === D.traits[pop.trait1[id]][2] || OPP[D.traits[pop.trait1[id]][2]] === D.traits[pop.trait2[id]][2]);
      pop.hobby[id] = rng.int(0, D.hobbies.length - 1);
      pop.thought[id] = rng.int(0, D.thoughts.length - 1);
      pop.secret[id] = rng.int(0, D.secrets.length - 1);
      pop.dream[id] = rng.int(0, D.dreams.length - 1);
      if (rng() < 0.3) pop.pet[id] = rng.int(0, D.pets.length - 1);
      const age = pop.age[id];
      pop.speed[id] = age < 14 ? rng.range(1.0, 1.2) : age > 70 ? rng.range(0.62, 0.8) : age > 55 ? rng.range(0.8, 0.95) : rng.range(0.9, 1.15);
      pop.height[id] = age < 10 ? rng.range(0.62, 0.72) : age < 14 ? rng.range(0.75, 0.86) : age < 17 ? rng.range(0.88, 0.97) : (pop.sex[id] ? rng.range(0.9, 1.0) : rng.range(0.97, 1.08));
      pop.punct[id] = LC.clamp(0.55 + rng.gauss() * 0.22, 0, 1);
      pop.mood[id] = LC.clamp(0.55 + rng.gauss() * 0.2, 0, 1);
      pop.jobSat[id] = LC.clamp(0.55 + rng.gauss() * 0.25, 0, 1);
      pop.birthday[id] = rng.int(0, 364);
      const L = id * 4;
      pop.look[L] = rng.int(0, LC.CLOTH.length - 1);
      pop.look[L + 1] = rng.int(0, LC.PANTS.length - 1);
      pop.look[L + 2] = rng() < 0.82 ? rng.int(0, 1) : rng.int(2, 3);
      pop.look[L + 3] = age > 62 && rng() < 0.7 ? 5 : rng.int(0, 6);
      // особенности по характеру
      for (const t of [pop.trait1[id], pop.trait2[id]]) {
        const tag = D.traits[t][2];
        if (tag === 'scatter' || tag === 'lazy') pop.punct[id] *= 0.6;
        if (tag === 'pedantic' || tag === 'diligent') pop.punct[id] = Math.min(1, pop.punct[id] + 0.25);
        if (tag === 'mood+' || tag === 'funny') pop.mood[id] = Math.min(1, pop.mood[id] + 0.2);
        if (tag === 'mood-' || tag === 'grumpy') pop.mood[id] *= 0.7;
        if (tag === 'lazy') pop.jobSat[id] *= 0.8;
      }
      const th = D.thoughts[pop.thought[id]].tag;
      if (th === 'quit') pop.jobSat[id] *= 0.45;
      if (th === 'happy') pop.mood[id] = Math.min(1, pop.mood[id] + 0.2);
    }
    void tagTraits;

    // ---------------- связи ----------------
    const addRel = (a, b, t) => {
      if (a === b || a < 0 || b < 0) return false;
      if (pop.relN[a] >= 3) return false;
      for (let k = 0; k < pop.relN[a]; k++) if (pop.rel[a * 3 + k] === b) return false;
      pop.rel[a * 3 + pop.relN[a]] = b; pop.relT[a * 3 + pop.relN[a]] = t; pop.relN[a]++;
      return true;
    };
    const addPair = (a, b, t) => {
      const r = REV[t];
      if (r < 0) return addRel(a, b, t);
      if (pop.relN[a] >= 3 || pop.relN[b] >= 3) return false;
      if (!addRel(a, b, t)) return false;
      addRel(b, a, r);
      return true;
    };
    // семья
    for (const hh of households) {
      const m = hh.members;
      if (['couple', 'family', 'family3', 'oldcouple'].includes(hh.type) && m.length >= 2) addPair(m[0], m[1], 0);
      if (hh.type === 'family' || hh.type === 'family3' || hh.type === 'parent') {
        for (let k = hh.type === 'parent' ? 1 : 2; k < m.length; k++) {
          addPair(m[0], m[k], 1); // m[k] — ребёнок m[0]
          if (hh.type !== 'parent' && rng() < 0.5) addPair(m[1], m[k], 1);
        }
      }
      if (hh.type === 'mates') for (let k = 1; k < m.length; k++) addPair(m[0], m[k], 4);
    }
    // встречаются (пары одиночек), бывшие, тайная любовь
    const singles = [];
    for (let id = 0; id < N; id++) if (pop.age[id] >= 18 && pop.age[id] <= 45 && pop.relN[id] < 3 && !hasType(id, 0)) singles.push(id);
    rng.shuffle(singles);
    pop.dating = [];
    for (let k = 0; k + 1 < singles.length && pop.dating.length < 260; k++) {
      const a = singles[k];
      if (hasType(a, 11)) continue;
      for (let q = k + 1; q < Math.min(singles.length, k + 40); q++) {
        const b = singles[q];
        if (pop.sex[a] === pop.sex[b] || Math.abs(pop.age[a] - pop.age[b]) > 7 || hasType(b, 11) || pop.hh[a] === pop.hh[b]) continue;
        if (addPair(a, b, 11)) { pop.dating.push([a, b]); break; }
      }
    }
    function hasType(id, t) { for (let k = 0; k < pop.relN[id]; k++) if (pop.relT[id * 3 + k] === t) return true; return false; }
    pop.hasRel = hasType;
    // коллеги и начальники
    for (const v of venues) {
      const st = v.staff;
      if (st.length < 2) continue;
      // начальник — самый «высокий» по доходу и возрасту
      let boss = st[0];
      for (const id of st) if (profs[pop.prof[id]].pay * 10 + pop.age[id] / 10 > profs[pop.prof[boss]].pay * 10 + pop.age[boss] / 10) boss = id;
      v.boss = boss;
      const isKid = profs[pop.prof[boss]].pay === 0;
      for (let k = 0; k < Math.min(st.length, 5); k++) {
        const id = st[Math.floor(rng() * st.length)];
        if (id !== boss && !isKid && rng() < 0.5) addPair(id, boss, 9);
      }
      for (let k = 0; k < st.length * 0.45; k++) {
        const a = st[Math.floor(rng() * st.length)], b = st[Math.floor(rng() * st.length)];
        if (a === b) continue;
        addPair(a, b, isKid && pop.age[a] < 18 && pop.age[b] < 18 ? 12 : 5);
      }
    }
    // друзья (похожий возраст)
    const byAge = Array.from({ length: 96 }, () => []);
    for (let id = 0; id < N; id++) byAge[pop.age[id]].push(id);
    for (let id = 0; id < N; id++) {
      if (pop.relN[id] >= 3 || rng() < 0.28) continue;
      const a = LC.clamp(pop.age[id] + rng.int(-5, 5), 7, 95);
      const list = byAge[a];
      if (!list.length) continue;
      const b = list[Math.floor(rng() * list.length)];
      if (pop.hh[b] !== pop.hh[id]) addPair(id, b, 4);
    }
    // братья и сёстры в других семьях, бывшие, тайные влюблённости
    for (let id = 0; id < N; id++) {
      const r = rng();
      if (r < 0.05 && pop.age[id] > 18) {
        const list = byAge[LC.clamp(pop.age[id] + rng.int(-6, 6), 18, 95)];
        const b = list[Math.floor(rng() * list.length)];
        if (b !== undefined && pop.hh[b] !== pop.hh[id]) addPair(id, b, 3);
      } else if (r < 0.1 && pop.age[id] > 20) {
        const list = byAge[LC.clamp(pop.age[id] + rng.int(-4, 4), 18, 95)];
        const b = list[Math.floor(rng() * list.length)];
        if (b !== undefined && pop.sex[b] !== pop.sex[id] && pop.hh[b] !== pop.hh[id]) addPair(id, b, 7);
      } else if (r < 0.16 && pop.age[id] >= 15) {
        const list = byAge[LC.clamp(pop.age[id] + rng.int(-5, 5), 15, 90)];
        const b = list[Math.floor(rng() * list.length)];
        if (b !== undefined && pop.sex[b] !== pop.sex[id] && pop.hh[b] !== pop.hh[id]) addRel(id, b, 8);
      }
    }
    // соседи — всем, у кого пусто
    for (let id = 0; id < N; id++) {
      if (pop.relN[id] > 0) continue;
      const res = city.buildings[pop.home[id]].residents;
      for (let k = 0; k < 8; k++) {
        const b = res[Math.floor(rng() * res.length)];
        if (b !== id && pop.hh[b] !== pop.hh[id] && addPair(id, b, 6)) break;
      }
      if (pop.relN[id] === 0) { // совсем никого в доме — друг наугад
        for (let k = 0; k < 20 && pop.relN[id] === 0; k++) addRel(id, Math.floor(rng() * N), 6);
      }
    }

    // ---------------- транспорт, машины, станции ----------------
    const B = city.buildings;
    const nearestStation = (x, z) => {
      let best = -1, bd = 1e9;
      for (const s of city.stations) { const d = Math.abs(s.x - x) + Math.abs(s.z - z); if (d < bd) { bd = d; best = s.id; } }
      return [best, bd];
    };
    let carsPrivate = 0;
    const carBudget = LC.CFG.cars - 190; // остальное — такси, автобусы, фургоны
    const order = rng.shuffle(Array.from({ length: N }, (_, i) => i));
    pop.workPos = (id) => {
      const v = pop.work[id];
      if (v >= 0) return venues[v];
      return null;
    };
    for (const id of order) {
      const p = profs[pop.prof[id]];
      const hb = B[pop.home[id]];
      const [sh, dh] = nearestStation(hb.doorX, hb.doorZ);
      pop.stHome[id] = sh;
      const wv = pop.work[id] >= 0 ? venues[pop.work[id]] : null;
      if (p.street === 'taxi' || p.street === 'bus' || p.street === 'van') { pop.transport[id] = 3; continue; } // служебная машина
      if (!wv) { pop.transport[id] = 0; continue; }
      const [sw, dw] = nearestStation(wv.x, wv.z);
      pop.stWork[id] = sw;
      const direct = Math.abs(wv.x - hb.doorX) + Math.abs(wv.z - hb.doorZ);
      const adult = pop.age[id] >= 21 && pop.age[id] <= 74;
      const wantsCar = adult && p.pay >= 2 && rng() < (p.pay >= 4 ? 0.55 : 0.28);
      if (wantsCar && direct > 260 && carsPrivate < carBudget) { pop.transport[id] = 2; pop.car[id] = carsPrivate++; }
      else if (direct > 330 && sh !== sw && dh + dw < direct * 0.75) pop.transport[id] = 1;
      else pop.transport[id] = 0;
    }
    pop.privateCars = carsPrivate;

    // ---------------- вечер, обед, любимые места ----------------
    // k ближайших заведений типа type (частичный отбор без сортировки всего списка)
    const bestD = new Float64Array(16), bestV = new Int32Array(16);
    const nearVenue = (type, x, z, k) => {
      const list = byType[type];
      if (!list || !list.length) return -1;
      k = Math.min(k || 4, 16, list.length);
      let n = 0;
      for (let q = 0; q < list.length; q++) {
        const v = list[q], d = Math.abs(venues[v].x - x) + Math.abs(venues[v].z - z);
        if (n < k) { let i = n++; while (i > 0 && bestD[i - 1] > d) { bestD[i] = bestD[i - 1]; bestV[i] = bestV[i - 1]; i--; } bestD[i] = d; bestV[i] = v; }
        else if (d < bestD[k - 1]) { let i = k - 1; while (i > 0 && bestD[i - 1] > d) { bestD[i] = bestD[i - 1]; bestV[i] = bestV[i - 1]; i--; } bestD[i] = d; bestV[i] = v; }
      }
      return bestV[Math.floor(rng() * n)];
    };
    for (let id = 0; id < N; id++) {
      const age = pop.age[id];
      const hb = B[pop.home[id]];
      const t1 = D.traits[pop.trait1[id]][2], t2 = D.traits[pop.trait2[id]][2];
      const tags = { includes: (x) => t1 === x || t2 === x };
      const w = [4, 2, 1, 1.4, 1.2, 0.6, 1.2, 0.8]; // дома, бар, спорт, парк, набережная, культура, гости, кафе
      if (age < 18) { w[1] = 0; w[2] = 0.8; w[3] = 2; w[4] = 1.6; w[6] = 0.8; w[7] = 0.5; }
      else if (age < 32) { w[0] = 2.2; w[1] = 3.4; w[2] = 1.6; w[4] = 1.8; w[7] = 1.4; }
      else if (age > 60) { w[0] = 6; w[1] = 0.4; w[2] = 0.2; w[3] = 2.4; w[5] = 1.2; w[6] = 1.5; }
      if (pop.hhSize[id] >= 3 && age >= 25) { w[0] += 3; w[1] *= 0.5; }
      if (tags.includes('soc+')) { w[1] *= 1.6; w[6] *= 1.8; w[0] *= 0.7; }
      if (tags.includes('soc-') || tags.includes('shy')) { w[0] *= 1.8; w[1] *= 0.5; w[6] *= 0.4; }
      if (tags.includes('sporty')) w[2] *= 3;
      if (tags.includes('romantic') || tags.includes('dreamy')) w[4] *= 2;
      if (tags.includes('curious')) w[5] *= 2;
      const k = rng.weighted([0, 1, 2, 3, 4, 5, 6, 7], (i) => w[i]);
      pop.eve[id] = k;
      const wv = pop.work[id] >= 0 ? venues[pop.work[id]] : null;
      const ax = rng() < 0.5 && wv ? wv.x : hb.doorX, az = rng() < 0.5 && wv ? wv.z : hb.doorZ;
      if (k === 1) pop.fav[id] = nearVenue('bar', ax, az, 8);
      else if (k === 2) pop.fav[id] = nearVenue('gym', ax, az, 3);
      else if (k === 5) pop.fav[id] = nearVenue('culture', ax, az, 5);
      else if (k === 7) pop.fav[id] = nearVenue(rng() < 0.7 ? 'cafe' : 'restaurant', ax, az, 6);
      else pop.fav[id] = nearVenue('bar', hb.doorX, hb.doorZ, 6); // запасной бар — на пятницу
      // обед вне офиса
      const p = profs[pop.prof[id]];
      if (wv && ['office', 'admin', 'clinic', 'college', 'culture', 'shop'].includes(p.at) && rng() < 0.62) pop.lunch[id] = nearVenue(rng() < 0.75 ? 'cafe' : 'restaurant', wv.x, wv.z, 4);
      // одиночество
      let L = 0;
      if (pop.hhSize[id] === 1) L += 0.35;
      if (!hasType(id, 4) && !hasType(id, 11) && !hasType(id, 0)) L += 0.25;
      if (tags.includes('soc-') || tags.includes('shy')) L += 0.15;
      if (D.thoughts[pop.thought[id]].tag === 'lonely') L += 0.2;
      if (D.secrets[pop.secret[id]].tag === 'lonely') L += 0.12;
      if (pop.eve[id] === 0) L += 0.08;
      if (age > 65 && pop.hhSize[id] === 1) L += 0.1;
      pop.lonely[id] = LC.clamp(L + rng() * 0.08, 0, 1);
      // сон
      const s = pop.shiftS[id];
      if (p.shift === 'night') { pop.wake[id] = 900 + rng.int(0, 90); pop.sleep[id] = 480 + rng.int(20, 90); }
      else if (p.shift === 'evening') { pop.wake[id] = 660 + rng.int(-30, 90); pop.sleep[id] = 180 + rng.int(0, 60); }
      else {
        pop.wake[id] = LC.clamp((pop.workDays[id] === 2 ? 480 + rng.int(-60, 120) : s - 70 - rng.int(0, 40)), 300, 720);
        pop.sleep[id] = age < 14 ? 1290 + rng.int(-30, 30) : age > 65 ? 1320 + rng.int(-60, 20) : 1380 + rng.int(-40, 100);
      }
    }
    // мечты, которые не спорят с фактами
    const dreamOk = (id, d) => {
      const t = D.dreams[d], a = pop.age[id];
      if (/жениться/.test(t) && (a >= 38 || a < 18 || pop.sex[id] || hasType(id, 0))) return false;
      if (/внуков|на пенсию/.test(t) && a < 45) return false;
      if (/второе высшее|начальником отдела|шеф-поваром/.test(t) && (a < 20 || a > 64)) return false;
      if (/выспаться|не работать по понедельникам/.test(t) && a < 16) return false;
      if (/помириться с отцом|вернуть долг брату/.test(t) && a < 18) return false;
      return true;
    };
    for (let id = 0; id < N; id++) {
      for (let k = 0; k < 12 && !dreamOk(id, pop.dream[id]); k++) pop.dream[id] = (pop.dream[id] + 7) % D.dreams.length;
    }
    // оценка дороги на работу в минутах (потом уточняется по факту)
    for (let id = 0; id < N; id++) {
      const hb = B[pop.home[id]];
      const wv = pop.work[id] >= 0 ? venues[pop.work[id]] : null;
      if (!wv) { pop.commute[id] = 20; continue; }
      const d = Math.abs(wv.x - hb.doorX) + Math.abs(wv.z - hb.doorZ);
      pop.commute[id] = LC.estimateTrip ? LC.estimateTrip(pop, id, d) : 30;
    }
    return pop;
  };

  // ================================================================
  // Факты о жителе — для карточки, поиска и нейросети
  // ================================================================
  LC.name = function (id, form) {
    const p = LC.pop, f = p.sex[id];
    const first = f ? D.femaleFirst[p.first[id]] : D.maleFirst[p.first[id]][0];
    const sur = D.surnames[p.sur[id]][f ? 1 : 0];
    if (form === 'first') return first;
    if (form === 'full') {
      const pat = p.age[id] >= 18 ? ' ' + D.maleFirst[p.pat[id]][f ? 2 : 1] : '';
      return first + pat + ' ' + sur;
    }
    return first + ' ' + sur;
  };
  LC.profTitle = function (id) {
    const pr = D.professions[LC.pop.prof[id]];
    return LC.pop.sex[id] ? pr.f : pr.t;
  };
  LC.traitWord = (id, k) => { const t = D.traits[k ? LC.pop.trait2[id] : LC.pop.trait1[id]]; return LC.pop.sex[id] ? t[1] : t[0]; };
  LC.relations = function (id) {
    const p = LC.pop, out = [];
    for (let k = 0; k < p.relN[id]; k++) {
      const o = p.rel[id * 3 + k], t = p.relT[id * 3 + k];
      out.push({ id: o, type: t, label: LC.relLabel(t, p.sex[o]), name: LC.name(o) });
    }
    return out;
  };
  LC.workName = function (id) {
    const v = LC.pop.work[id];
    if (v >= 0) return LC.city.venues[v].name;
    const pr = D.professions[LC.pop.prof[id]];
    if (pr.at === 'street') return pr.street === 'taxi' ? 'такси' : pr.street === 'bus' ? 'автобусный парк' : pr.street === 'van' ? 'служба доставки' : 'улицы Тихоречинска';
    if (pr.at === 'home') return 'дома';
    return '';
  };
  // падежи для подписей связей: [м, ж]
  LC.REL_GEN = [['мужа', 'жены'], ['сына', 'дочери'], ['отца', 'матери'], ['брата', 'сестры'], ['друга', 'подруги'], ['коллеги', 'коллеги'],
    ['соседа', 'соседки'], ['бывшего', 'бывшей'], ['знакомого', 'знакомой'], ['начальника', 'начальницы'], ['подчинённого', 'подчинённой'],
    ['парня', 'девушки'], ['одноклассника', 'одноклассницы']];
  LC.REL_DAT = [['мужу', 'жене'], ['сыну', 'дочери'], ['отцу', 'матери'], ['брату', 'сестре'], ['другу', 'подруге'], ['коллеге', 'коллеге'],
    ['соседу', 'соседке'], ['бывшему', 'бывшей'], ['знакомому', 'знакомой'], ['начальнику', 'начальнице'], ['подчинённому', 'подчинённой'],
    ['парню', 'девушке'], ['однокласснику', 'однокласснице']];
  LC.relType = function (id, o) {
    const p = LC.pop;
    for (let k = 0; k < p.relN[id]; k++) if (p.rel[id * 3 + k] === o) return p.relT[id * 3 + k];
    return -1;
  };
  // «у подруги — Анна Смирнова» / «к подруге — Анна Смирнова»
  LC.whoLabel = function (id, o, cas) {
    const t = LC.relType(id, o), f = LC.pop.sex[o];
    const tab = cas === 'dat' ? LC.REL_DAT : LC.REL_GEN;
    const word = t >= 0 ? tab[t][f ? 1 : 0] : (cas === 'dat' ? (f ? 'знакомой' : 'знакомому') : (f ? 'знакомой' : 'знакомого'));
    return word + ' — ' + LC.name(o);
  };
  // заведения: «в баре «Сова»», «в бар «Сова»», иначе «— Школа № 5»
  const VRX = /^(Бар|Кафе|Ресторан) (.+)$/;
  LC.venueName = (v) => LC.city.venues[v].name;
  LC.venueIn = function (v) {
    const n = LC.city.venues[v].name, m = VRX.exec(n);
    if (m) return (m[1] === 'Бар' ? 'в баре ' : m[1] === 'Кафе' ? 'в кафе ' : 'в ресторане ') + m[2];
    return '— ' + n;
  };
  LC.venueTo = function (v) {
    const n = LC.city.venues[v].name, m = VRX.exec(n);
    if (m) return (m[1] === 'Бар' ? 'в бар ' : m[1] === 'Кафе' ? 'в кафе ' : 'в ресторан ') + m[2];
    return '— ' + n;
  };
  LC.worksToday = function (id, day) {
    const w = LC.pop.workDays[id];
    const wd = ((day % 7) + 7) % 7;
    if (w === 2) return false;
    if (w === 0) return wd < 5;
    return ((day + id) % 4) < 2;
  };
})(window.LC);
