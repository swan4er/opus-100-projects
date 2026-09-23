/* ================================================================
   game.js — режиссёр партии: ходы, переговоры, доверие, реплики.
   Состояние мира (позиция, характеры, доверие, обещания) — в JS;
   нейросеть получает его в промпте и решает только «пойду или нет».
   ================================================================ */
(function () {
  'use strict';
  const C = window.Chess, CAST = window.CAST;
  const $ = (s) => document.querySelector(s);
  const SHOT = !!window.__SHOT__;
  const KIND = ['', 'P', 'N', 'B', 'R', 'Q', 'K'];
  const KIND_NUM = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6 };
  const ACC = { P: 'пешку', N: 'коня', B: 'слона', R: 'ладью', Q: 'ферзя', K: 'короля' };
  const NOM = CAST.KIND_RU;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // типографика реплик: неразрывный пробел после коротких слов и неразрывный дефис внутри слов («по‑киевски»)
  const nb = (s) => String(s).replace(/(^|\s)(в|к|с|и|а|но|на|по|за|от|до|из|не|о|у|я)\s/gi, '$1$2 ').replace(/([А-Яа-яЁёA-Za-z])-(?=[А-Яа-яЁёA-Za-z])/g, '$1‑');

  let S = null; // 3D-сцена
  const G = {
    s: null, p: {}, phase: 'boot', sel: -1, legal: [], pending: null, last: null,
    events: [], watch: null, gen: 0, forceConsent: false, commenting: false, moveList: [],
  };
  window.__game = G;

  // ================================================================
  // Облачка реплик: печатаются по буквам, держатся над головой фигуры
  // ================================================================
  const bubbles = [];
  const bubLayer = $('#bubbles');
  let bubSeq = 0;

  function bubble(id, text, opt = {}) {
    const p = G.p[id];
    if (!p) return null;
    const old = bubbles.find((b) => b.id === id);
    if (old) dropBubble(old, true);
    const el = document.createElement('div');
    el.className = 'bub' + (p.team === 'b' ? ' bk' : '') + (opt.no ? ' no' : '') + (!p.alive ? ' ghost' : '') + (opt.think ? ' think' : '');
    el.innerHTML = `<span class="who">${esc(p.short)}${!p.alive ? ' · с того света' : ''}</span><span class="txt"></span>`;
    bubLayer.appendChild(el);
    const b = { id, el, txt: el.querySelector('.txt'), full: text || '', shown: 0, t0: performance.now(), until: Infinity, stream: !!opt.stream, think: !!opt.think, logged: false, instant: !!opt.instant, seq: bubSeq++, rot: (Math.random() - 0.5) * 3, cls: opt.no ? 'bad' : '' };
    if (b.instant) { b.shown = b.full.length; b.txt.textContent = nb(b.full); }
    bubbles.push(b);
    requestAnimationFrame(() => el.classList.add('on'));
    const maxB = window.innerWidth <= 760 ? 3 : 5; // на телефоне облачка не должны закрывать доску
    while (bubbles.filter((x) => !x.dying).length > maxB) dropBubble(bubbles.find((x) => !x.dying));
    return b;
  }
  function dropBubble(b, now) {
    if (!b || b.dying) return;
    b.dying = true;
    if (S) S.talk(b.id, false);
    b.el.classList.remove('on');
    setTimeout(() => { b.el.remove(); const i = bubbles.indexOf(b); if (i >= 0) bubbles.splice(i, 1); }, now ? 10 : 300);
  }
  function finishBubble(b, text) {
    if (!b) return;
    if (text != null) b.full = text;
    b.stream = false; b.think = false;
    b.el.classList.remove('think');
  }
  // свободная от панелей зона экрана: облачка не должны прятаться под «Штабом», «Эфиром» и нижней панелью
  let freeZone = null, freeZoneAt = 0;
  function getFreeZone(W, H) {
    const t = performance.now();
    if (freeZone && t - freeZoneAt < 400) return freeZone;
    let x0 = 8, x1 = W - 8, y1 = H - 8;
    if (W > 760) {
      const r = $('#roster'), l = $('#log');
      if (!r.classList.contains('hidden')) x0 = Math.max(x0, r.getBoundingClientRect().right + 8);
      if (!l.classList.contains('hidden')) x1 = Math.min(x1, l.getBoundingClientRect().left - 8);
    }
    y1 = Math.min(y1, dock.getBoundingClientRect().top - 12);
    freeZone = { x0, x1, y1 }; freeZoneAt = t;
    return freeZone;
  }
  function updateBubbles(dt) {
    const W = window.innerWidth, H = window.innerHeight;
    const Z = getFreeZone(W, H);
    const placed = [];
    // отказ важнее всего — его облачко ставим первым, остальные обходят его
    const list = bubbles.filter((b) => !b.dying).sort((a, b) => (b.cls === 'bad') - (a.cls === 'bad') || a.seq - b.seq);
    for (const b of list) {
      // печать по буквам
      if (!b.think && b.shown < b.full.length) {
        const add = Math.max(1, Math.round(dt * 46));
        b.shown = Math.min(b.full.length, b.shown + add);
        b.txt.textContent = nb(b.full.slice(0, b.shown));
        S.talk(b.id, true);
        const p = G.p[b.id];
        if (Math.random() < 0.5) Sound.blip(p && CAST.ALL[b.id] ? CAST.ALL[b.id].voice : 1);
      } else if (!b.think && !b.stream) {
        S.talk(b.id, false);
        if (b.until === Infinity) b.until = performance.now() + (SHOT ? 1e9 : 2600 + b.full.length * 55);
        if (!b.logged) { b.logged = true; logLine(b.id, b.full, b.cls); }
      }
      if (performance.now() > b.until) { dropBubble(b); continue; }
      // позиция над головой
      const sc = S.screenOf(b.id);
      if (!sc) continue;
      const w = b.el.offsetWidth, h = b.el.offsetHeight;
      // кандидаты: над головой, выше, ниже, вбок; берём первый без наложений, иначе с наименьшим
      const bx = sc.x - w / 2, by = sc.y - h - 14;
      const fitX = (v) => (Z.x1 - Z.x0 > w ? clamp(v, Z.x0, Z.x1 - w) : clamp(v, 8, W - w - 8));
      const fitY = (v) => clamp(v, 64, Math.max(64, Z.y1 - h));
      const cands = [[bx, by], [bx, by - h - 10], [bx - w * 0.55, by], [bx + w * 0.55, by], [bx - w * 0.55, by - h - 10], [bx + w * 0.55, by - h - 10], [bx, by - 2 * h - 20], [bx, by + h + 10]];
      let x = 0, y = 0, bestO = Infinity;
      for (const [cx0, cy0] of cands) {
        const cx = fitX(cx0), cy = fitY(cy0);
        let o = 0;
        for (const r of placed) o += Math.max(0, Math.min(cx + w, r.x + r.w) - Math.max(cx, r.x) + 6) * Math.max(0, Math.min(cy + h, r.y + r.h) - Math.max(cy, r.y) + 6);
        if (o < bestO) { bestO = o; x = cx; y = cy; if (!o) break; }
      }
      placed.push({ x, y, w, h });
      const tail = clamp(sc.x - x, 16, w - 16);
      b.el.style.setProperty('--tail', tail + 'px');
      b.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(${b.rot}deg)`;
    }
  }
  function clearBubbles() { for (const b of bubbles.slice()) dropBubble(b, true); }

  // ================================================================
  // «Эфир» — лента всех реплик, «Штаб» — доверие
  // ================================================================
  const logBody = $('#logBody');
  function logLine(id, text, cls = '') {
    const p = id && G.p[id];
    const div = document.createElement('div');
    div.className = 'ln' + (p && p.team === 'b' ? ' bk' : '') + (id ? '' : ' sys') + (cls ? ' ' + cls : '');
    div.innerHTML = id ? `<b>${esc(p ? p.short : '?')}${p && !p.alive ? ' †' : ''}:</b> ${esc(nb(text))}` : text;
    logBody.appendChild(div);
    while (logBody.children.length > 160) logBody.firstChild.remove();
    logBody.scrollTop = logBody.scrollHeight;
  }

  const rosterList = $('#rosterList');
  function buildRoster() {
    rosterList.innerHTML = '';
    for (const id of Object.keys(CAST.WHITE)) {
      const p = G.p[id];
      const li = document.createElement('li');
      li.dataset.id = id;
      li.title = `${p.name} — ${p.tag}`;
      li.innerHTML = `<span class="rn"><span class="nm">${esc(p.short)}</span><small>${esc(NOM[p.kind])}, ${esc(p.tag)}</small></span><span class="bar"><i></i></span><span class="tn"></span>`;
      li.addEventListener('click', () => { if (G.phase === 'player' && p.alive) select(p.sq); });
      rosterList.appendChild(li);
    }
    updateRoster();
  }
  function updateRoster() {
    let sum = 0, n = 0;
    for (const li of rosterList.children) {
      const p = G.p[li.dataset.id];
      li.classList.toggle('dead', !p.alive);
      li.querySelector('small').textContent = `${NOM[p.kind]}, ${p.tag}`; // после превращения пешка становится ферзём
      li.classList.toggle('sel', G.sel >= 0 && G.s.ids[G.sel] === p.id);
      li.querySelector('.bar i').style.width = Math.round(p.trust) + '%';
      li.querySelector('.bar').classList.toggle('low', p.trust < 35);
      li.querySelector('.tn').textContent = Math.round(p.trust);
      if (p.alive) { sum += p.trust; n++; }
    }
    $('#morale').textContent = n ? Math.round(sum / n) : '—';
  }
  function changeTrust(id, d, why) {
    const p = G.p[id];
    if (!p || !d) return;
    p.trust = clamp(p.trust + d, 0, 100);
    if (why) G.trustNotes.push(`${p.short}: ${d > 0 ? '+' : ''}${d} (${why})`);
    updateRoster();
  }
  function changeTrustAll(d, why, filter) {
    for (const p of Object.values(G.p)) if (p.team === 'w' && p.alive && (!filter || filter(p))) p.trust = clamp(p.trust + d, 0, 100);
    if (why) G.trustNotes.push(`у всех ${d > 0 ? '+' : ''}${d} (${why})`);
    updateRoster();
  }

  // ================================================================
  // Шапка, подсказки, нижняя панель
  // ================================================================
  const dock = $('#dock');
  function setStatus(html) { $('#status').innerHTML = html; }
  function setHint(html) { $('#hint').innerHTML = html; }
  function dockMode(m) { dock.dataset.mode = m; }
  function pulseDock() { dock.classList.remove('pulse'); void dock.offsetWidth; dock.classList.add('pulse'); }
  function sqn(sq) { return C.sqName(sq); }
  function pieceAt(sq) { const id = G.s.ids[sq]; return id ? G.p[id] : null; }
  function label(p, acc) { return `${acc ? ACC[p.kind] : NOM[p.kind]} ${p.short}`; }

  // кнопка этюда видна только до первого хода обычной партии
  function freshDock() { dock.classList.toggle('fresh', G.moveList.length === 0 && !G.etude && G.phase === 'player'); }
  function idleHint() {
    freshDock();
    const tips = [
      'Выберите фигуру и поле. Красный <b>«!»</b> — там фигуру могут съесть, и она вправе отказаться.',
      'Фигуры помнят обещания. Пообещали медаль и не дали — об этом узнает вся армия.',
      'Угрозы работают на трусов, но доверие от них падает у всех.',
      'Чем ниже доверие в «Штабе», тем чаще фигуры спорят даже по пустякам.',
    ];
    setHint(rnd(tips));
  }

  function updateCost() {
    $('#cost').textContent = '$' + (AI.usage.costUSD || 0).toFixed(4);
    $('#demoFlag').hidden = !AI.demo || AI.shot; // на обложке метка не нужна: там постановочная сцена
  }

  // ================================================================
  // Новая партия
  // ================================================================
  function newGame(fen) {
    G.gen++;
    clearBubbles();
    logBody.innerHTML = '';
    S.removeAll(); S.resetGraves(); S.unfocus(); S.setGlobalFocus(null);
    G.s = fen ? C.fromFEN(fen) : C.create();
    G.s.ids = new Array(64).fill(null);
    G.p = {}; G.sel = -1; G.pending = null; G.last = null; G.events = []; G.watch = null; G.trustNotes = []; G.moveList = [];
    G.dead = { w: 0, b: 0 }; G.broken = []; G.etude = false; G.forceConsent = false; G.idleCount = 0; G.result = null;
    const files = 'abcdefgh';
    // имена раздаются по исходным полям; в загруженной позиции — по порядку
    const taken = new Set();
    const idFor = (team, kind, sq) => {
      const f = files[sq & 7];
      const pref = team + kind;
      const cands = kind === 'K' || kind === 'Q' ? [pref] : [pref + f];
      const pool = Object.keys(CAST.ALL).filter((id) => id.startsWith(pref) && !taken.has(id));
      const id = cands.find((c) => CAST.ALL[c] && !taken.has(c)) || pool[0];
      if (id) taken.add(id);
      return id;
    };
    for (let sq = 0; sq < 64; sq++) {
      const v = G.s.b[sq];
      if (!v) continue;
      const team = v > 0 ? 'w' : 'b', kind = KIND[Math.abs(v)];
      const id = idFor(team, kind, sq) || `${team}${kind}${sq}`;
      const base = CAST.ALL[id] || { name: 'Фигура', short: 'Фигура', kind, f: false, tag: '', trait: 'обычная фигура', voice: 1 };
      G.s.ids[sq] = id;
      G.p[id] = { ...base, id, team, kind, sq, alive: true, trust: base.trust || 50, promises: [], broken: [] };
      S.addPiece(id, kind, team, sq);
    }
    // кого нет в позиции — те уже пали и смотрят с кладбища
    for (const id of Object.keys(CAST.ALL)) {
      if (G.p[id]) continue;
      const base = CAST.ALL[id], team = id[0];
      G.p[id] = { ...base, id, team, kind: base.kind, sq: -1, alive: false, trust: base.trust || 50, promises: [], broken: [] };
      S.addPiece(id, base.kind, team, team === 'w' ? 0 : 63);
      S.capturePiece(id, { instant: true });
    }
    buildRoster();
    G.phase = 'player';
    G.legal = C.legal(G.s);
    S.setMarks({});
    dockMode('idle');
    idleHint();
    setStatus('<b>Ваш ход, командир.</b> Белые начинают.');
    $('#moveNo').textContent = '';
    logLine(null, 'Партия началась. Белые — ваша армия, у каждого свой характер.');
  }

  // ================================================================
  // Выбор фигуры и поля
  // ================================================================
  function riskOf(m) {
    const u = C.make(G.s, m);
    const risky = C.attacked(G.s, m.to, -1);
    C.unmake(G.s, m, u);
    return risky;
  }
  function select(sq) {
    const p = pieceAt(sq);
    if (!p || p.team !== 'w') return deselect();
    G.sel = sq;
    const moves = G.legal.filter((m) => m.from === sq);
    const seen = new Set(), targets = [];
    for (const m of moves) {
      if (seen.has(m.to)) continue;
      seen.add(m.to);
      targets.push({ sq: m.to, cap: !!m.cap, risky: riskOf(m) });
    }
    S.setMarks({ sel: sq, targets, last: G.last, check: checkSq() });
    S.setGlobalFocus(p.id);
    updateRoster();
    Sound.sfx('lift');
    if (!moves.length) { quip(p, ['Мне некуда, командир. Буквально.', 'Я заперт. Как в метро в час пик.']); return; }
    if (Math.random() < 0.35 && !bubbles.some((b) => b.id === p.id)) {
      const Q = { P: ['Я?', 'Опять я?', 'Только не я…', 'Мам, меня выбрали!'], N: ['Иго-го?', 'Куда скачем?!'], B: ['Внимательно слушаю.', 'Хм?'], R: ['Ну чего ещё…', 'Встаю, встаю.'], Q: ['Дорогуша?', 'Наконец-то.'], K: ['Нас? Лично?', 'Только осторожно!'] };
      quip(p, Q[p.kind]);
    }
    setHint(`<b>${esc(p.name)}</b> — ${esc(p.tag)}. Доверие ${Math.round(p.trust)}. Куда идём?`);
  }
  function deselect() {
    G.sel = -1;
    S.setMarks({ last: G.last, check: checkSq() });
    S.setGlobalFocus(null);
    updateRoster();
    idleHint();
  }
  function quip(p, lines) { const b = bubble(p.id, rnd(lines)); if (b) b.cls = 'quip'; }
  function checkSq() { return C.inCheck(G.s, G.s.turn) ? G.s.k[G.s.turn > 0 ? 0 : 1] : -1; }

  function onPick(hit) {
    if (G.phase !== 'player' || !hit) return;
    const sq = hit.sq;
    if (G.sel >= 0) {
      const mv = G.legal.filter((m) => m.from === G.sel && m.to === sq);
      if (mv.length) { chooseMove(mv); return; }
    }
    const p = pieceAt(sq);
    if (p && p.team === 'w') { if (G.sel === sq) deselect(); else select(sq); }
    else deselect();
  }

  function chooseMove(moves) {
    if (moves.length > 1 && moves[0].promo) {
      G.phase = 'promo';
      dockMode('promo'); pulseDock();
      const pick = (e) => {
        const t = +e.currentTarget.dataset.promo;
        dock.querySelectorAll('[data-promo]').forEach((b) => b.removeEventListener('click', pick));
        G.phase = 'player';
        dockMode('idle');
        attempt(moves.find((m) => m.promo === t) || moves[0]);
      };
      dock.querySelectorAll('[data-promo]').forEach((b) => b.addEventListener('click', pick));
      return;
    }
    attempt(moves[0]);
  }

  // ================================================================
  // Что будет, если так сходить: факты для фигуры и для нейросети
  // ================================================================
  function lossWord(cp) { return cp >= 800 ? 'ферзя' : cp >= 420 ? 'ладью' : cp >= 250 ? 'лёгкую фигуру' : cp >= 60 ? 'пешку' : 'пару крошек'; }
  function assess(m) {
    const s = G.s, mover = pieceAt(m.from);
    const inCheck = C.inCheck(s, s.turn);
    const before = inCheck ? [] : C.hanging(s, 1);
    const capSq = m.flag === 2 ? m.to - 8 : m.to;
    const victim = m.cap ? pieceAt(capSq) : null;
    const u = C.make(s, m);
    const att = C.attackers(s, m.to, -1).map((q) => label(pieceAt(q)));
    const def = C.attackers(s, m.to, 1).map((q) => label(pieceAt(q)));
    const loss = att.length ? C.seeSquare(s, m.to) : 0;
    const check = C.inCheck(s, -1);
    const mate = check && C.legal(s).length === 0;
    const after = check ? [] : C.hanging(s, 1);
    const threats = check ? [] : C.hanging(s, -1).filter((h) => C.attackers(s, h.sq, 1).includes(m.to)).map((h) => label(pieceAt(h.sq), true));
    C.unmake(s, m, u);
    const afterSet = new Set(after.map((h) => h.sq));
    const saves = before.filter((h) => h.sq !== m.from && !afterSet.has(h.sq)).map((h) => label(pieceAt(h.sq), true));
    // мнение штаба: сравниваем ход с лучшим по движку
    const sm = C.scoreMoves(s, 2, 500);
    const mine = sm.find((x) => x.m.from === m.from && x.m.to === m.to && x.m.promo === m.promo);
    const delta = mine ? sm[0].sc - mine.sc : 0;
    const danger = att.length === 0 ? 'none' : loss > 0 ? 'hang' : 'trade';
    let verdict = mate ? 'mate' : delta <= 45 ? (danger === 'hang' ? 'sac-good' : 'good') : delta <= 130 ? 'ok' : delta <= 320 ? 'bad' : 'blunder';
    // возражения по характеру
    let trait = null;
    const k = mover.kind, fromR = m.from >> 3, toR = m.to >> 3, toF = m.to & 7;
    if (k === 'N' && (toF === 0 || toF === 7)) trait = 'rim';
    else if (k === 'Q' && toR < fromR) trait = 'retreat';
    else if (k === 'R' && s.full <= 10) trait = 'opening';
    else if (k === 'K' && m.flag < 3 && toR > fromR && s.full < 30) trait = 'forward';
    else if (mover.id === 'wPg' && Math.random() < 0.5) trait = 'lazy';
    if (!trait && mover.trust < 25) trait = 'sulk';
    return {
      who: label(mover), from: sqn(m.from), to: sqn(m.to), capture: victim ? label(victim, true) : null,
      danger, attackers: att, defenders: def, loss, check, mate, inCheck, saves, threatens: threats,
      verdict, delta, lossWord: lossWord(Math.max(loss, delta)), trait,
      promises: mover.promises.slice(-2), broken: G.broken.slice(-2),
    };
  }

  function needConsent(p, f) {
    if (f.inCheck || f.mate) return false; // под шахом не до споров
    let chance = 0;
    if (f.danger === 'hang') chance = 0.97;
    else if (f.danger === 'trade') chance = p.kind === 'P' ? 0.6 : 0.4;
    if (f.trait) chance = Math.max(chance, f.trait === 'sulk' ? 0.35 : 0.45);
    chance *= clamp(1.3 - p.trust / 100, 0.4, 1.15);
    if (f.danger === 'hang') chance = Math.max(chance, 0.75);
    return Math.random() < chance;
  }

  // ================================================================
  // Переговоры
  // ================================================================
  const talkInput = $('#talkInput');
  const TACTIC_RU = { promise: 'обещание', flatter: 'лесть', threat: 'угроза', logic: 'довод', rude: 'хамство', none: 'разговор' };

  function openTalk(p) {
    $('#talkName').textContent = p.name;
    $('#talkRole').textContent = p.tag;
    setTalkTrust(p);
    const q = $('#talkQuote');
    q.className = 'quote thinking';
    q.textContent = `${p.short} думает`;
    $('#talkWhy').textContent = '';
    talkInput.disabled = true;
    $('#talkSend').disabled = true;
    $('#bOrder').disabled = true;
    dockMode('talk'); pulseDock();
  }
  function setTalkTrust(p) {
    $('#talkTrust').style.width = Math.round(p.trust) + '%';
    $('#talkTrustN').textContent = Math.round(p.trust);
    $('#talkTrust').parentElement.parentElement.classList.toggle('low', p.trust < 35);
  }

  async function attempt(m) {
    const p = pieceAt(m.from);
    if (!p) return;
    const f = assess(m);
    const need = G.forceConsent || needConsent(p, f);
    if (!need) {
      if (f.inCheck && f.danger !== 'none') quip(p, ['Шах же! Иду, но это нечестно!', 'Некогда спорить, король орёт!']);
      else if (f.danger !== 'none' && Math.random() < 0.5) quip(p, ['Ладно… Ради вас, командир.', 'Иду, пока не передумал!', 'Если что — я был смелым.']);
      return execute(m, { consent: 'auto', f, pid: p.id });
    }
    const gen = G.gen;
    G.phase = 'deciding';
    G.pending = { m, f, pid: p.id, history: [], rounds: 0 };
    S.setMarks({ sel: m.from, targets: [{ sq: m.to, cap: !!m.cap, risky: f.danger !== 'none' }], last: G.last, check: checkSq() });
    S.focus(p.id);
    S.setGlobalFocus(p.id);
    S.setExpr(p.id, 'think', 0);
    setStatus(`<b>${esc(p.short)}</b> ${p.f ? 'решает' : 'решает'}, идти ли на ${sqn(m.to)}…`);
    openTalk(p);
    const thinkB = bubble(p.id, '', { think: true });
    const r = await Brain.decide(p, f, [], null);
    if (gen !== G.gen) return;
    answer(r, null, thinkB);
  }

  function answer(r, text, thinkB) {
    const P = G.pending;
    if (!P) return;
    const p = G.p[P.pid];
    if (text) P.history.push({ who: 'cmd', text });
    P.history.push({ who: 'piece', text: r.say });
    if (thinkB) dropBubble(thinkB, true);
    bubble(p.id, r.say, { no: !r.go });
    if (r.trust) changeTrust(p.id, r.trust, text ? TACTIC_RU[r.tactic] || 'уговоры' : 'приказ');
    if (r.promise && text) { p.promises.push(r.promise); logLine(null, `Обещание записано: <em>${esc(p.short)} — «${esc(r.promise)}»</em>`); }
    if (r.tactic === 'threat') changeTrustAll(-2, 'командир угрожает своим', (q) => q.id !== p.id);
    if (r.tactic === 'rude') changeTrustAll(-1, 'командир хамит', (q) => q.id !== p.id);
    S.setExpr(p.id, r.expr || (r.go ? 'happy' : 'fear'), 5200);
    setTalkTrust(p);
    const q = $('#talkQuote');
    q.className = 'quote' + (r.go ? '' : ' no');
    q.textContent = nb(r.say);
    $('#talkWhy').textContent = r.why ? nb('Причина: ' + r.why) : '';
    if (r.failed && !AI.demo) logLine(null, 'Нейросеть не ответила — фигура решила сама по заготовке.');
    if (r.go) {
      Sound.sfx('ok');
      S.nod(p.id);
      G.phase = 'moving';
      setStatus(`<b>${esc(p.short)}</b> ${p.f ? 'согласилась' : 'согласился'}.`);
      const gen = G.gen;
      setTimeout(() => { if (gen === G.gen) execute(P.m, { consent: text ? 'persuaded' : 'agreed', f: P.f, pid: p.id, tactic: r.tactic }); }, SHOT ? 300 : 1500);
      return;
    }
    Sound.sfx('no');
    S.refuse(p.id);
    P.rounds++;
    G.phase = 'negotiate';
    G.events.push(`${p.short} ${p.f ? 'отказалась' : 'отказался'} идти ${P.f.from}–${P.f.to}${r.why ? ` (${r.why})` : ''}${text ? ` даже после слов командира «${text.slice(0, 80)}»` : ''}.`);
    if (r.why) logLine(null, `Отказ: <em>${esc(nb(r.why))}</em>`);
    const final = P.rounds >= 4;
    setStatus(final ? `<b>${esc(p.short)}</b> ${p.f ? 'упёрлась' : 'упёрся'} окончательно.` : `<b>${esc(p.short)}</b> ${p.f ? 'отказывается' : 'отказывается'}. Уговорите или отмените ход.`);
    talkInput.disabled = final;
    $('#talkSend').disabled = final;
    $('#bOrder').disabled = false;
    talkInput.placeholder = final ? 'Разговор окончен. Приказ или отмена.' : 'Уговорите: пообещайте, польстите, пригрозите…';
    if (!final && window.innerWidth > 760 && !SHOT) setTimeout(() => talkInput.focus(), 50);
  }

  async function sendTalk(text) {
    if (G.phase !== 'negotiate' || !G.pending) return;
    text = (text || '').trim().slice(0, 220);
    if (!text) { talkInput.focus(); return; }
    const P = G.pending, p = G.p[P.pid], gen = G.gen;
    G.phase = 'deciding';
    talkInput.value = '';
    talkInput.disabled = true; $('#talkSend').disabled = true; $('#bOrder').disabled = true;
    logLine(null, `<em>Командир → ${esc(p.short)}:</em> ${esc(text)}`);
    const q = $('#talkQuote');
    q.className = 'quote thinking';
    q.textContent = `${p.short} обдумывает ваши слова`;
    $('#talkWhy').textContent = '';
    S.setExpr(p.id, 'think', 0);
    const thinkB = bubble(p.id, '', { think: true });
    const r = await Brain.decide(p, P.f, P.history, text);
    if (gen !== G.gen) return;
    answer(r, text, thinkB);
  }

  async function order() {
    if (G.phase !== 'negotiate' || !G.pending) return;
    const P = G.pending, p = G.p[P.pid], gen = G.gen;
    G.phase = 'moving';
    $('#bOrder').disabled = true; talkInput.disabled = true;
    changeTrust(p.id, -25, 'приказ силой');
    changeTrustAll(-5, 'командир давит', (q) => q.id !== p.id);
    logLine(null, `Приказ силой: <em>${esc(p.short)}</em> идёт против воли. Армия это запомнит.`);
    G.events.push(`Командир силой заставил ${p.short} идти ${P.f.from}–${P.f.to}. Все это видели, доверие упало.`);
    S.setExpr(p.id, 'sad', 5000);
    const b = bubble(p.id, '', { stream: true });
    const sit = `Командир силой приказал тебе сходить ${P.f.from}–${P.f.to}, хотя ты отказывался.${P.f.danger !== 'none' ? ' Там тебя могут съесть.' : ''} Ты подчиняешься, но обижен.`;
    const s = await Brain.line(p, sit, (d, full) => { if (b) b.full = full; }, CAST.DEMO.ordered);
    if (gen !== G.gen) return;
    finishBubble(b, s);
    await sleep(SHOT ? 200 : 1400);
    if (gen !== G.gen) return;
    execute(P.m, { consent: 'ordered', f: P.f, pid: p.id });
  }

  function cancelTalk() {
    if (!(G.phase === 'negotiate' || G.phase === 'promo') || !G.pending) { if (G.phase === 'player') deselect(); return; }
    const p = G.p[G.pending.pid];
    G.pending = null;
    G.phase = 'player';
    S.unfocus();
    dockMode('idle');
    deselect();
    S.setExpr(p.id, 'happy', 2400);
    quip(p, ['Фух. Спасибо, командир.', 'Вот и славно. Я тут постою.', 'Мудрое решение!']);
    setStatus('<b>Ваш ход, командир.</b> Выберите другой ход.');
  }

  // ================================================================
  // Исполнение хода (обе стороны)
  // ================================================================
  function killPiece(id, killer) {
    const v = G.p[id];
    if (!v || !v.alive) return;
    v.alive = false; v.sq = -1;
    S.capturePiece(id);
    if (v.team === 'w') {
      if (v.promises.length) G.broken.push(`${v.short} погиб${v.f ? 'ла' : ''}, так и не получив «${v.promises[v.promises.length - 1]}»`);
      if (v.kind === 'Q') changeTrustAll(-8, 'пала Изольда');
      else changeTrustAll(-3, `пал${v.f ? 'а' : ''} ${v.short}`, (q) => q.kind === v.kind);
    } else if (killer) {
      changeTrust(killer.id, 6, 'трофей');
      changeTrustAll(1, null, (q) => q.id !== killer.id);
    }
    updateRoster();
  }

  const CONSENT_RU = { auto: '', agreed: ' — согласился сам', persuaded: ' — после уговоров', ordered: ' — по приказу, против воли', engine: '' };

  async function execute(m, meta) {
    const gen = G.gen;
    G.phase = 'moving';
    G.pending = null;
    G.sel = -1;
    if (dock.dataset.mode === 'talk') dockMode('idle');
    S.unfocus();
    S.setGlobalFocus(null);
    const legalNow = C.legal(G.s);
    const moverId = G.s.ids[m.from], mover = G.p[moverId];
    const c = m.p > 0 ? 1 : -1;
    const capSq = m.flag === 2 ? m.to - 8 * c : m.to;
    const victimId = m.cap ? G.s.ids[capSq] : null;
    const victim = victimId ? G.p[victimId] : null;
    const san = C.san(G.s, m, legalNow);
    C.play(G.s, m);
    mover.sq = m.to;
    let rookId = null, rookTo = -1;
    if (m.flag === 3 || m.flag === 4) { rookTo = m.flag === 3 ? m.to - 1 : m.to + 1; rookId = G.s.ids[rookTo]; if (rookId) G.p[rookId].sq = rookTo; }
    S.setMarks({ last: [m.from, m.to] });
    const moveNo = c > 0 ? `${G.s.full}.` : `${G.s.full - 1}…`;
    G.moveList.push(san);
    freshDock();
    if (mover.team === 'w') setHint(`<b>${esc(mover.short)}</b> ${mover.f ? 'пошла' : 'пошёл'} ${sqn(m.from)}–${sqn(m.to)}. Барон Мрак готовит ответ…`);
    logLine(null, `${moveNo} <em>${esc(san)}</em> · ${esc(mover.short)}${esc(CONSENT_RU[meta.consent] || '')}${victim ? ` · ${esc(victim.short)} ${victim.f ? 'пала' : 'пал'}` : ''}`);
    // хронику для комментариев
    let ev = `${mover.team === 'w' ? 'Белые' : 'Чёрные'}: ${mover.short} (${NOM[mover.kind]}) ${sqn(m.from)}–${sqn(m.to)}`;
    if (victim) ev += `, съел${mover.f ? 'а' : ''} ${label(victim, true)}`;
    if (m.flag === 3 || m.flag === 4) ev += ' — рокировка';
    if (m.promo) ev += `, превратил${mover.f ? 'ась' : 'ся'} в ${NOM[KIND[m.promo]]}`;
    if (meta.consent === 'persuaded') ev += ` — сначала отказывался, командир уговорил (${TACTIC_RU[meta.tactic] || 'слова'})`;
    if (meta.consent === 'ordered') ev += ' — пошёл по приказу, против воли';
    if (meta.consent === 'agreed' && meta.f && meta.f.danger !== 'none') ev += ' — рискнул и согласился сам';
    if (san.endsWith('#')) ev += '. МАТ!'; else if (san.endsWith('+')) ev += '. Шах!';
    G.events.push(ev);

    const anim = S.movePiece(moverId, m.to, { onLand: () => { if (victimId) killPiece(victimId, mover); } });
    if (rookId) { await sleep(260); S.movePiece(rookId, rookTo); }
    await anim;
    if (gen !== G.gen) return;
    if (m.promo) {
      mover.kind = KIND[m.promo];
      S.rebuild(moverId, mover.kind);
      if (mover.team === 'w') { changeTrust(mover.id, 30, 'повышение'); changeTrustAll(6, 'мечты сбываются', (q) => q.kind === 'P'); }
    }
    if (mover.team === 'w' && (m.flag === 3 || m.flag === 4)) changeTrust('wK', 10, 'спрятали короля');
    G.last = [m.from, m.to];
    if (mover.team === 'w') G.idleCount = 0;
    if (mover.team === 'w' && G.etude) { G.etude = false; G.forceConsent = false; }

    // итоги рискованных ходов белых: выжил ли тот, кто рискнул
    if (mover.team === 'w' && meta.f && meta.f.danger !== 'none' && meta.consent !== 'auto') G.watch = { pid: mover.id, f: meta.f, consent: meta.consent };
    else if (mover.team === 'w' && meta.f && meta.f.danger !== 'none') G.watch = { pid: mover.id, f: meta.f, consent: 'auto' };
    if (mover.team === 'b' && G.watch) {
      const w = G.watch, wp = G.p[w.pid];
      G.watch = null;
      if (wp && !wp.alive) {
        const worth = w.f.verdict === 'sac-good' || w.f.verdict === 'mate' || w.f.saves.length > 0 || w.f.verdict === 'good';
        if (worth) { changeTrustAll(3, 'жертва не напрасна'); G.events.push(`Жертва ${wp.short} была не напрасной — штаб доволен.`); }
        else { changeTrustAll(-6, `${wp.short} погиб зря`); changeTrustAll(-4, null, (q) => q.kind === wp.kind); G.events.push(`${wp.short} погиб${wp.f ? 'ла' : ''} зря — армия ропщет на командира.`); }
      } else if (wp && wp.alive && w.consent !== 'auto') {
        changeTrust(wp.id, 8, 'выжил и был прав');
        changeTrustAll(1, null, (q) => q.id !== wp.id);
      }
    }
    afterMove(mover.team);
  }

  function afterMove(team) {
    const st = C.status(G.s);
    $('#moveNo').textContent = `ход ${G.s.full}`;
    if (st.over) return endGame(st);
    if (team === 'w') { engineTurn(); return; }
    G.phase = 'player';
    G.legal = st.moves;
    S.setMarks({ last: G.last, check: checkSq() });
    if (st.check) {
      setStatus('<b class="alarm">Шах!</b> Под шахом фигуры не спорят — некогда.');
      S.setExpr('wK', 'shock', 5000);
      Sound.sfx('check');
    } else setStatus('<b>Ваш ход, командир.</b>');
    idleHint();
    commentary();
  }

  async function engineTurn() {
    const gen = G.gen;
    G.phase = 'engine';
    setStatus('<b>Барон Мрак</b> думает…');
    S.setExpr('bK', 'think', 1600);
    // движок считает в фоне, пока Барон «думает» — интерфейс не замирает
    const [mv] = await Promise.all([Engine.best(G.s, { depth: 3, ms: 800, noise: 18 }), sleep(SHOT ? 50 : 650)]);
    if (gen !== G.gen || !mv) return;
    await execute(mv, { consent: 'engine' });
  }

  // ================================================================
  // Движок соперника в Web Worker (из Blob — работает и через file://).
  // Тот же chess.js: исходник фабрики передаётся в воркер через toString().
  // Если воркер недоступен — считаем на странице.
  // ================================================================
  const Engine = (() => {
    let w = null, seq = 0;
    const waiting = new Map();
    const local = (s, opts) => { const r = C.search(s, opts); return r ? r.move : null; };
    try {
      const src = `${window.ChessFactory.toString()}
const E = ChessFactory(self);
self.onmessage = (e) => {
  const { id, fen, opts } = e.data;
  let move = null;
  try { const r = E.search(E.fromFEN(fen), opts); if (r && r.move) move = { from: r.move.from, to: r.move.to, promo: r.move.promo || 0 }; } catch (err) { move = null; }
  self.postMessage({ id, move });
};`;
      w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = (e) => { const cb = waiting.get(e.data.id); if (cb) { waiting.delete(e.data.id); cb(e.data.move); } };
      w.onerror = (e) => { e.preventDefault && e.preventDefault(); w = null; for (const cb of waiting.values()) cb(undefined); waiting.clear(); };
    } catch (e) { w = null; }
    return {
      get mode() { return w ? 'worker' : 'page'; },
      best(s, opts) {
        if (!w) return Promise.resolve(local(s, opts));
        return new Promise((res) => {
          const id = ++seq;
          const done = (mv) => {
            clearTimeout(timer);
            if (mv === undefined) return res(local(s, opts)); // воркер сломался или молчит
            res(mv && C.legal(s).find((m) => m.from === mv.from && m.to === mv.to && (m.promo || 0) === mv.promo) || local(s, opts));
          };
          const timer = setTimeout(() => { if (waiting.has(id)) { waiting.delete(id); done(undefined); } }, (opts.ms || 700) + 5000);
          waiting.set(id, done);
          w.postMessage({ id, fen: C.toFEN(s), opts });
        });
      },
    };
  })();

  function endGame(st) {
    G.phase = 'over';
    S.setMarks({ last: G.last, check: st.reason === 'mate' ? checkSq() : -1 });
    const win = st.reason === 'mate' && st.winner > 0, lose = st.reason === 'mate' && st.winner < 0;
    G.result = win ? 'win' : lose ? 'lose' : 'draw';
    const txt = win ? 'Мат! Армия ликует, Барон Мрак рыдает в плащ.'
      : lose ? 'Мат. Король Евлампий упал в обморок. Партия проиграна.'
      : { stalemate: 'Пат. Все растерянно смотрят друг на друга.', fifty: 'Ничья по правилу пятидесяти ходов — все устали.', repetition: 'Ничья: троекратное повторение. Фигуры ходят по кругу.', material: 'Ничья: матовать нечем.' }[st.reason];
    $('#overText').textContent = txt;
    dockMode('over'); pulseDock();
    setStatus(`<b>${win ? 'Победа!' : lose ? 'Поражение.' : 'Ничья.'}</b>`);
    for (const p of Object.values(G.p)) if (p.alive) S.setExpr(p.id, (p.team === 'w') === win ? 'joy' : (win || lose ? 'sad' : 'bored'), 0);
    G.events.push(`Партия окончена: ${txt}`);
    commentary(true);
  }

  // ================================================================
  // Реплики после ходов (поток от нейросети или заготовки)
  // ================================================================
  function commentCtx(evs, final, idle) {
    const alive = Object.values(G.p).filter((p) => p.alive), dead = Object.values(G.p).filter((p) => !p.alive);
    const pick = new Set();
    const lastIds = [G.last && G.s.ids[G.last[1]]].filter(Boolean);
    lastIds.forEach((id) => pick.add(id));
    ['wQ', 'wK', 'bK', 'bQ', 'wRa', 'wRh'].forEach((id) => { if (G.p[id] && G.p[id].alive) pick.add(id); });
    const shuffle = (a) => a.sort(() => Math.random() - 0.5);
    shuffle(alive.filter((p) => p.team === 'w')).slice(0, 4).forEach((p) => pick.add(p.id));
    shuffle(alive.filter((p) => p.team === 'b')).slice(0, 3).forEach((p) => pick.add(p.id));
    dead.slice(-2).forEach((p) => pick.add(p.id));
    const cast = [...pick].map((id) => {
      const p = G.p[id];
      return `${p.short} — ${p.team === 'w' ? 'белый' : 'чёрный'} ${NOM[p.kind]}${p.alive ? ' на ' + sqn(p.sq) : ', уже погиб'}; ${p.tag}${p.team === 'w' ? `, доверие к командиру ${Math.round(p.trust)}` : ''}`;
    }).join('\n');
    const notes = G.trustNotes.splice(0).slice(-4);
    const promises = Object.values(G.p).filter((p) => p.team === 'w' && p.promises.length).map((p) => `${p.short}: «${p.promises[p.promises.length - 1]}»${p.alive ? '' : ' (погиб)'}`).slice(-3);
    let events = evs.join('\n');
    if (notes.length) events += `\nДоверие изменилось: ${notes.join('; ')}.`;
    if (promises.length) events += `\nОбещания командира: ${promises.join('; ')}.`;
    const focusVariants = final
      ? ['реакции на конец партии: победители ликуют, проигравшие страдают, кто-то вспоминает обещания командира']
      : idle ? ['командир долго думает над ходом: одна белая фигура подгоняет его или гадает, что он задумал, одна — издёвка чёрных над паузой']
      : ['одна реплика от белых о том, что сделал командир, одна — перепалка между двумя белыми, одна — троллинг от чёрных',
         'одна от фигуры, которая только что ходила или пострадала, одна — ответ ей от другой белой фигуры, одна — издёвка чёрных',
         'одна от чёрных (подкол), одна — белые спорят между собой, одна — от павшей фигуры с того света или от короля'];
    // заготовки для демо
    const D = CAST.DEMO.comment;
    const wEv = evs.filter((e) => e.startsWith('Белые')).join(' '), bEv = evs.filter((e) => e.startsWith('Чёрные')).join(' ');
    let pool = final ? D.end[G.result || 'draw']
      : idle ? D.idle
      : /Шах|МАТ/.test(bEv) ? D.check
      : /Шах|МАТ/.test(wEv) ? D.giveCheck
      : /съел/.test(bEv) ? D.lost
      : /съел/.test(wEv) ? D.capture
      : evs.some((e) => /отказал|силой/.test(e)) ? D.refused
      : D.quiet;
    pool = pool.filter(([id]) => G.p[id] && G.p[id].alive).sort(() => Math.random() - 0.5).slice(0, 2);
    return { cast, events, n: idle ? 2 : 3, focus: rnd(focusVariants), demo: pool };
  }

  async function commentary(final, idle) {
    if (G.commenting) return;
    const evs = G.events.splice(0);
    if (!evs.length) return;
    G.commenting = true;
    const gen = G.gen, map = new Map();
    try {
      await Brain.comment(commentCtx(evs, final, idle), (i, id, text, done) => {
        if (gen !== G.gen || !G.p[id]) return;
        let b = map.get(i);
        if (!b) {
          b = bubble(id, '', { stream: !done });
          if (!b) return;
          map.set(i, b);
          const p = G.p[id];
          S.setExpr(id, p.team === 'b' ? rnd(['smug', 'joy', 'goofy']) : rnd(['anger', 'sad', 'think', 'happy', 'fear']), 3800);
          if (p.kind === 'Q' && p.team === 'w' && Math.random() < 0.6) S.eyeRoll(id);
        }
        b.full = text;
        if (done) finishBubble(b, text);
      });
    } finally { G.commenting = false; }
  }

  // ================================================================
  // Пока командир думает, армия не молчит: короткая болтовня, не больше трёх раз подряд
  // ================================================================
  let idleT = 0;
  function idleTick(dt) {
    if (SHOT || !G.ready || G.phase !== 'player' || G.commenting || G.idleCount >= 3 || bubbles.some((b) => !b.dying)) { idleT = 0; return; }
    idleT += dt;
    if (idleT < 14) return;
    idleT = 0;
    G.idleCount++;
    G.events.push(G.moveList.length ? 'Командир уже долго думает над ходом.' : 'Партия ещё не началась: командир разглядывает доску и всё никак не сделает первый ход.');
    commentary(false, true);
  }

  // ================================================================
  // Обложка (режим съёмки): живая сцена переговоров без нейросети
  // ================================================================
  function applyUci(list) {
    for (const u of list) {
      const from = C.sqIdx(u.slice(0, 2)), to = C.sqIdx(u.slice(2, 4));
      const m = C.legal(G.s).find((x) => x.from === from && x.to === to);
      if (!m) break;
      const moverId = G.s.ids[from], capId = m.cap ? G.s.ids[m.flag === 2 ? to - 8 * (m.p > 0 ? 1 : -1) : to] : null;
      G.moveList.push(C.san(G.s, m));
      C.play(G.s, m);
      G.p[moverId].sq = to;
      if (capId) { G.p[capId].alive = false; G.p[capId].sq = -1; S.capturePiece(capId, { instant: true }); }
      S.placePiece(moverId, to);
      if (m.flag === 3 || m.flag === 4) { const rt = m.flag === 3 ? to - 1 : to + 1; const rid = G.s.ids[rt]; G.p[rid].sq = rt; S.placePiece(rid, rt); }
      G.last = [from, to];
    }
    G.legal = C.legal(G.s);
  }

  function coverScene() {
    // «Жареная печень»: 1.e4 e5 2.Кf3 Кc6 3.Сc4 Кf6 4.Кg5 d5 5.e×d5 К×d5 — Гоша уже пал на d5
    applyUci(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5', 'e4d5', 'f6d5']);
    Object.assign(G.p.wNg, { trust: 38 }); Object.assign(G.p.wQ, { trust: 47 }); Object.assign(G.p.wPd, { trust: 31 });
    Object.assign(G.p.wPf, { trust: 62 }); Object.assign(G.p.wK, { trust: 74 }); Object.assign(G.p.wBf, { trust: 81 });
    G.p.wPe.promises.push('медаль и отпуск на h8');
    const m = G.legal.find((x) => x.from === C.sqIdx('g5') && x.to === C.sqIdx('f7'));
    const f = assess(m);
    G.pending = { m, f, pid: 'wNg', history: [{ who: 'piece', text: 'На f7?!' }], rounds: 1 };
    G.phase = 'negotiate';
    G.sel = m.from;
    const moves = G.legal.filter((x) => x.from === m.from);
    S.setMarks({ sel: m.from, targets: moves.map((x) => ({ sq: x.to, cap: !!x.cap, risky: riskOf(x) })), last: G.last });
    S.setGlobalFocus('wNg');
    S.setExpr('wNg', 'shock', 0); S.setExpr('wQ', 'smug', 0); S.setExpr('bK', 'joy', 0); S.setExpr('bNb', 'goofy', 0);
    S.setExpr('wPd', 'fear', 0); S.setExpr('wK', 'fear', 0); S.setExpr('bQ', 'smug', 0); S.setExpr('wRa', 'bored', 0); S.setExpr('wRh', 'anger', 0);
    S.lookAt('wNg', 'camera');
    S.setExpr('wBf', 'joy', 0); S.setExpr('bPf', 'bored', 0);
    // средний план: отказ крупно, вокруг — те, кто в кадре
    if (S.portrait) S.focus('wNg', { dist: 12.6, polar: 0.92, az: 0.1, shift: [-1.6, 0, -1.0], instant: true });
    else S.focus('wNg', { dist: 12.2, polar: 0.86, az: 0.2, shift: [-1.4, 0, -0.9], instant: true });
    const lines = [
      ['bNb', 'Цок-цок, Гоша уже в раю. Следующий!'],
      ['wBf', 'Пегасик, это не смерть, это ребрендинг!'],
      ['bPf', 'Ну, прыгай. Я подожду.'],
      ['bK', 'Иди сюда, лошадка. Муа-ха-ха!'],
      ['wNg', 'На f7?! Там король! Я Пегас, а не котлета по-киевски!'],
    ];
    for (const [id, t] of lines) { const b = bubble(id, t, { instant: true, no: id === 'wNg' }); if (b) b.logged = true; }
    for (const [id, t] of [['wPe', 'Можно я сегодня постою? У меня предчувствие.'], ['bPd', 'Слышь, белая, ты с какой горизонтали?'], ['wPe', 'Ой.'], ['wBc', 'Все мы там будем. Гоша — раньше.'], ['wRa', 'Я не сплю, Петровна. Я анализирую.']]) logLine(id, t);
    logLine(null, '5… <em>К×d5</em> · Цык · Гоша пал');
    logLine(null, 'Обещание записано: <em>Гоша — «медаль и отпуск на h8»</em>');
    logLine('wPe', 'Не ходи, Пегасик. Тут скучно, и все в нимбах.');
    logLine('wQ', 'Дорогуша, он сейчас ещё и крылья свои достанет.');
    logLine('bK', 'Иди сюда, лошадка. Муа-ха-ха!');
    logLine('wNg', 'На f7?! Там король! Я Пегас, а не котлета по-киевски!', 'bad');
    logLine(null, `Отказ: <em>${esc(nb(Brain.why(f, false, 'none')))}</em>`);
    updateRoster();
    openTalk(G.p.wNg);
    const q = $('#talkQuote');
    q.className = 'quote no';
    q.textContent = nb('На f7?! Там король! Я Пегас, а не котлета по-киевски!');
    $('#talkWhy').textContent = nb('Причина: ' + Brain.why(f, false, 'none'));
    talkInput.disabled = false; $('#talkSend').disabled = false; $('#bOrder').disabled = false;
    talkInput.value = 'Пегасик, это жертва века! О тебе сложат оды, а твоим именем назовут диагональ.';
    setStatus('<b>Пегасик отказывается</b> прыгать на f7. Уговорите или отмените ход.');
    $('#moveNo').textContent = 'ход 6';
  }

  // ================================================================
  // Этюд «Пешка за ферзя»: слон связал Изольду, спасти её может только пешка
  // ================================================================
  const ETUDE_FEN = 'r2q1rk1/pp3ppp/2p2n2/1b1p4/8/8/PPPPQPPP/RNB2KNR w - - 0 10';
  function etude() {
    newGame(ETUDE_FEN);
    Object.assign(G.p.wPd, { trust: 42 }); Object.assign(G.p.wPc, { trust: 48 }); Object.assign(G.p.wQ, { trust: 50 });
    updateRoster();
    G.etude = true;
    G.forceConsent = true; // в этюде пешка обязательно заговорит
    freshDock();
    logLine(null, 'Этюд: <em>слон Шёпот связал Изольду</em>. Ферзь не может уйти — спасти её может только пешка, вставшая под бой.');
    setStatus('<b>Этюд «Пешка за ферзя».</b> Изольда в беде.');
    setHint('Слон с b5 бьёт Изольду, а за ней король. Закройте её пешкой: <b>d2–d3</b> или <b>c2–c4</b>. Пешка, конечно, будет против.');
    S.setExpr('wQ', 'shock', 0);
    S.setExpr('bBc', 'smug', 0);
    const gen = G.gen;
    (async () => {
      for (const [id, t] of [['wQ', 'Дорогуша, меня тут слегка связали. Сделай что-нибудь, но не мной.'], ['bBc', 'Шепну по секрету: ферзь ваш уже почти мой.'], ['wPd', 'Я ничего не видел. У меня сессия.']]) {
        await sleep(700);
        if (gen !== G.gen || G.phase !== 'player') return;
        bubble(id, t);
        await sleep(1500 + t.length * 22);
      }
    })();
  }

  // ================================================================
  // Начало партии: знакомство
  // ================================================================
  async function intro() {
    const gen = G.gen;
    for (const [id, t] of CAST.DEMO.intro) {
      await sleep(900);
      if (gen !== G.gen || G.phase !== 'player') return;
      bubble(id, t);
      if (id === 'wQ') S.eyeRoll('wQ');
      if (id === 'wPe') S.setExpr('wPe', 'fear', 3000);
      if (id === 'bK') S.setExpr('bK', 'joy', 3000);
      await sleep(1600 + t.length * 25);
    }
  }

  // ================================================================
  // Кнопки, клавиши, указатель
  // ================================================================
  const CHIP = {
    promise: { P: 'Обещаю: дойдёшь до восьмой — станешь ферзём. А пока — медаль и отпуск!', N: 'Обещаю личную конюшню и овёс премиум-класса!', B: 'Обещаю: назову в твою честь диагональ.', R: 'Обещаю: после партии — пенсия и тишина в углу.', Q: 'Обещаю аплодисменты стоя и корону побольше.', K: 'Обещаю охрану из трёх пешек и мягкий трон.' },
    flatter: { P: 'Ты самый храбрый в этой армии. Без тебя мы никто.', N: 'Никто на доске не прыгает красивее тебя!', B: 'Твой ум — наше главное оружие.', R: 'На тебе держится вся армия, как дом на фундаменте.', Q: 'Ты прекраснее Кляксы в сто раз, и все это знают.', K: 'Ваше величество, вы образец мужества!' },
    threat: { P: 'Не пойдёшь — отправлю до конца партии чистить углы доски.', N: 'Не пойдёшь — пущу на колбасу. Шучу. Или нет.', B: 'Не пойдёшь — будешь ходить только по краю.', R: 'Не пойдёшь — лишу пенсии и отдам твой угол соседу.', Q: 'Не пойдёшь — корону отдам Люсе.', K: 'Не пойдёте — объявлю вас пешкой.' },
  };

  function bindUI() {
    const cv = $('#scene');
    let down = null;
    cv.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY };
      if (!Sound.on && !G.soundTouched) { G.soundTouched = true; setSound(true); }
    });
    cv.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 8) onPick(S.pick(e.clientX, e.clientY));
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') S.setPointer(e.clientX, e.clientY);
      if (G.phase !== 'player') { cv.classList.remove('can-pick'); return; }
      const h = S.pick(e.clientX, e.clientY);
      const ok = h && ((pieceAt(h.sq) && pieceAt(h.sq).team === 'w') || (G.sel >= 0 && G.legal.some((m) => m.from === G.sel && m.to === h.sq)));
      cv.classList.toggle('can-pick', !!ok);
    });
    $('#talkForm').addEventListener('submit', (e) => { e.preventDefault(); sendTalk(talkInput.value); });
    dock.querySelectorAll('[data-say]').forEach((b) => b.addEventListener('click', () => {
      if (!G.pending || G.phase !== 'negotiate') return;
      const p = G.p[G.pending.pid];
      talkInput.value = CHIP[b.dataset.say][p.kind] || CHIP[b.dataset.say].P;
      talkInput.focus();
      talkInput.setSelectionRange(talkInput.value.length, talkInput.value.length);
    }));
    $('#bOrder').addEventListener('click', order);
    $('#bCancel').addEventListener('click', cancelTalk);
    $('#bAgain').addEventListener('click', () => { newGame(); intro(); });
    $('#bEtude').addEventListener('click', () => { if (G.phase === 'player' || G.phase === 'over') etude(); });
    $('#bEtude2').addEventListener('click', () => etude());
    $('#bNew').addEventListener('click', () => { newGame(); intro(); });
    $('#bSound').addEventListener('click', () => { G.soundTouched = true; setSound(!Sound.on); });
    const panelToggle = (btn, panel) => $(btn).addEventListener('click', () => {
      const hide = !$(panel).classList.contains('hidden');
      $(panel).classList.toggle('hidden', hide);
      $(btn).setAttribute('aria-pressed', String(!hide));
      if (window.innerWidth <= 760 && !hide) { const other = panel === '#log' ? ['#roster', '#bRoster'] : ['#log', '#bLog']; $(other[0]).classList.add('hidden'); $(other[1]).setAttribute('aria-pressed', 'false'); }
    });
    panelToggle('#bRoster', '#roster');
    panelToggle('#bLog', '#log');
    if (window.innerWidth <= 760) for (const [b, p] of [['#bRoster', '#roster'], ['#bLog', '#log']]) { $(p).classList.add('hidden'); $(b).setAttribute('aria-pressed', 'false'); }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (G.phase === 'negotiate') cancelTalk(); else if (G.phase === 'player') deselect(); }
    });
  }
  function setSound(v) { const on = Sound.set(v); $('#bSound').setAttribute('aria-pressed', String(on)); }

  // ================================================================
  // Запуск
  // ================================================================
  window.bootGame = async function (THREE, OrbitControls) {
    // подписи полей на доске рисуются шрифтом Balsamiq Sans — ждём его, но не дольше 1,5 с
    try { await Promise.race([document.fonts.load('600 40px "Balsamiq Sans"'), sleep(1500)]); } catch (e) { /* нарисуем запасным */ }
    S = window.makeScene(THREE, OrbitControls, $('#scene'), { sfx: (n) => Sound.sfx(n) });
    S.onFrame((dt) => { updateBubbles(dt); idleTick(dt); });
    bindUI();
    newGame();
    updateCost();
    setInterval(updateCost, 600);
    if (SHOT) { coverScene(); S.renderNow(true); return; }
    await AI.ensureKey();
    G.ready = true;
    updateCost();
    intro();
  };

  // Проверочный API для прогонов (живые партии через _tools/shot)
  window.__test = {
    live() { AI.shot = false; AI.demo = !AI.hasKey(); updateCost(); return { demo: AI.demo }; },
    newGame(fen) { newGame(fen); return C.toFEN(G.s); },
    force(v) { G.forceConsent = !!v; return G.forceConsent; },
    play(uci) {
      const from = C.sqIdx(uci.slice(0, 2)), to = C.sqIdx(uci.slice(2, 4));
      const ms = G.legal.filter((m) => m.from === from && m.to === to);
      if (G.phase !== 'player') return 'phase:' + G.phase;
      if (!ms.length) return 'illegal';
      select(from);
      chooseMove(ms.length > 1 ? [ms.find((m) => m.promo === 5)] : ms);
      return 'sent';
    },
    say(text) { if (G.phase !== 'negotiate') return 'phase:' + G.phase; sendTalk(text); return 'said'; },
    order() { order(); return 'ordered'; },
    cancel() { cancelTalk(); return 'cancelled'; },
    state() {
      return {
        phase: G.phase, fen: C.toFEN(G.s), moves: G.moveList.join(' '),
        pending: G.pending ? { pid: G.pending.pid, rounds: G.pending.rounds, danger: G.pending.f.danger, verdict: G.pending.f.verdict, saves: G.pending.f.saves, history: G.pending.history } : null,
        trust: Object.fromEntries(Object.values(G.p).filter((p) => p.team === 'w').map((p) => [p.short, Math.round(p.trust)])),
        cost: +AI.usage.costUSD.toFixed(5), calls: AI.usage.calls, demo: AI.demo, engine: Engine.mode,
        log: [...logBody.children].slice(-14).map((n) => n.textContent),
      };
    },
  };
})();
