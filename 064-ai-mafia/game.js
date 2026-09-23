/* ================================================================
   game.js — ход партии. Роли, живые/мёртвые, проверки и спасения
   хранит код. Нейросеть получает только открытую запись и тайну
   своего персонажа (brain.js).
   Реплики идут конвейером: пока один говорит, следующий уже
   сгенерирован с учётом его слов — логика последовательная,
   а пауз нет.
   ================================================================ */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const U = window.CastUtil;
  const R = window.ROLES;
  const esc = UI.esc, nb = UI.nb;

  /* ---------- состояние партии ---------- */
  const G = (window.__G = {
    gen: 0, players: [], log: [], priv: {}, used: {}, checks: {}, nights: [], votesLog: [],
    day: 0, night: 0, inbox: [], over: true, phase: 'start', spectator: false, lastHeal: -1, selfHeal: false,
  });
  G.checksOf = (i) => G.checks[i] || [];
  class Cancel extends Error {}
  const guard = (gen) => { if (gen !== G.gen) throw new Cancel(); };
  const wait = (ms, gen) => new Promise((res, rej) => setTimeout(() => (gen != null && gen !== G.gen ? rej(new Cancel()) : res()), ms));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const P = (i) => G.players[i];
  const aliveSeats = () => G.players.filter((p) => p.alive).map((p) => p.seat);
  const roleWord = (i) => (P(i).fem ? R[P(i).role].shortF : R[P(i).role].short);
  const endA = (i) => (P(i).fem ? 'а' : '');

  const store = {
    get(k, d) { try { const v = localStorage.getItem('mafia114.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('mafia114.' + k, JSON.stringify(v)); } catch (e) { /* приватный режим */ } },
  };

  /* ---------- новая партия ---------- */
  function newGame(name, role, fixed) {
    G.gen++;
    const hf = U.humanForms(name);
    const human = { seat: 0, name: hf.nom, forms: hf, fem: /[ая]$/i.test(hf.nom) && !/^(саша|женя|валя|паша|миша|гоша|лёша|леша|коля|петя|вася|дима|ваня|серёжа|сережа|толя|витя|слава|никита|илья|фома|кузьма|гена|стёпа|степа|юра|ося|лёва|лева)$/i.test(hf.nom), human: true, who: 'вы', bio: 'новый жилец', manner: '', demo: null, alive: true };
    const pool = ['maf', 'maf', 'com', 'doc', 'civ', 'civ', 'civ', 'civ'];
    pool.splice(pool.indexOf(role), 1);
    shuffle(pool);
    G.players = [human, ...window.CAST.map((c) => ({ ...c, alive: true, human: false }))];
    G.players.forEach((p, i) => { p.seat = i; });
    human.role = role;
    for (let i = 1; i < 8; i++) G.players[i].role = fixed ? fixed[i] : pool[i - 1];
    Object.assign(G, { log: [], priv: {}, used: {}, checks: {}, nights: [], votesLog: [], day: 0, night: 0, inbox: [], over: false, phase: 'intro', spectator: false, lastHeal: -1, selfHeal: false });
    for (let i = 0; i < 8; i++) { G.priv[i] = []; G.checks[i] = []; }
    // мафия знает напарника
    const maf = G.players.filter((p) => p.role === 'maf').map((p) => p.seat);
    for (const s of maf) G.priv[s].push(`Твой напарник по мафии — ${P(maf.find((x) => x !== s)).name}.`);
    // сцена
    for (let i = 1; i < 8; i++) Stage.restore(i);
    Stage.unflipAll();
    Stage.clearThreads();
    Stage.setNight(false);
    Stage.setSpeaker(-1);
    Stage.camera('table');
    for (let i = 1; i < 8; i++) { Stage.emote(i, 'neutral'); Stage.think(i, false); Stage.talk(i, false); Stage.gesture(i, null); Stage.lookAt(i, -1); }
    UI.makePlates(G.players);
    for (let i = 1; i < 8; i++) UI.plateState(i, { sub: P(i).who.split(',')[0], dead: false, role: '', tag: '', votes: 0 });
    UI.clearBubbles();
    UI.logClear();
    setRoleChip();
  }

  function setRoleChip() {
    const me = P(0);
    const r = R[me.role];
    const chip = $('#roleChip');
    chip.dataset.role = me.role;
    const partner = G.players.find((p) => p.role === 'maf' && p.seat !== 0);
    chip.innerHTML = `<span class="rc-k">Вы — ${esc(me.name)}</span><b>${esc(r.title)}</b>` + (me.role === 'maf' && partner ? `<span class="rc-s">напарник: ${esc(partner.name)}</span>` : '');
    if (me.role === 'maf' && partner) UI.plateState(partner.seat, { tag: 'напарник' });
  }

  /* ---------- ввод игрока ---------- */
  const input = $('#sayInput');
  const dock = $('#dock');
  let humanWaiter = null;
  let picker = null;
  let skipLine = false;

  function dockMode(mode, hint, opts = {}) {
    dock.dataset.mode = mode;
    $('#dockHint').innerHTML = hint ? nb(hint) : '';
    $('#bSkip').hidden = !opts.skip;
    $('#bVote').hidden = !opts.vote;
    $('#bAbstain').hidden = !opts.abstain;
    $('#sayBtn').textContent = opts.send || 'Сказать';
    input.placeholder = opts.placeholder || 'Ваше слово…';
    input.disabled = !!opts.noInput;
    $('#say').hidden = !!opts.noInput;
    const chips = $('#chips');
    chips.innerHTML = '';
    if (opts.chips) {
      for (const s of opts.chips) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.textContent = P(s).name;
        b.onclick = () => resolvePick(s);
        chips.appendChild(b);
      }
    }
    dock.classList.toggle('attn', !!opts.attn);
  }

  function waitHuman(mode, hint, opts = {}) {
    return new Promise((resolve) => {
      humanWaiter = { mode, resolve };
      dockMode(mode, hint, { skip: true, ...opts });
      if (!UI.mobile() && opts.focus !== false) setTimeout(() => input.focus(), 60);
      if (opts.softMs) {
        const t0 = Date.now();
        const iv = setInterval(() => {
          if (!humanWaiter || humanWaiter.resolve !== resolve) { clearInterval(iv); return; }
          if (input.value.trim() || document.activeElement === input && input.value) return;
          if (Date.now() - t0 > opts.softMs) { clearInterval(iv); finishHuman(null); }
        }, 250);
      }
    });
  }
  function finishHuman(v) {
    const w = humanWaiter;
    humanWaiter = null;
    if (w) w.resolve(v);
  }
  $('#say').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = input.value.trim().slice(0, 300);
    if (!t) return;
    input.value = '';
    UI.Sfx.pop();
    if (humanWaiter) { finishHuman(t); return; }
    if (G.phase === 'discuss' && P(0) && P(0).alive && !G.over) {
      G.inbox.push(t);
      UI.toast('Скажете сразу после текущей реплики');
      return;
    }
  });
  $('#bSkip').onclick = () => { if (humanWaiter) finishHuman(null); };
  $('#bVote').onclick = () => { if (humanWaiter) finishHuman({ vote: true }); };
  $('#bAbstain').onclick = () => resolvePick(-1);

  function pickSeat(allowed, hint, opts = {}) {
    return new Promise((resolve) => {
      picker = { allowed: new Set(allowed), resolve };
      for (let i = 1; i < 8; i++) UI.plateState(i, { pick: picker.allowed.has(i) });
      dockMode('pick', hint, { abstain: !!opts.abstain, chips: allowed, noInput: !opts.whisper, placeholder: opts.placeholder, send: opts.send, attn: true });
      document.body.classList.add('picking');
    });
  }
  function resolvePick(s) {
    if (!picker) return;
    if (s !== -1 && !picker.allowed.has(s)) return;
    const p = picker;
    picker = null;
    document.body.classList.remove('picking');
    for (let i = 1; i < 8; i++) UI.plateState(i, { pick: false });
    Stage.highlight(-1, false);
    UI.Sfx.knock();
    p.resolve(s);
  }

  // клик по персонажу или табличке: выбор / обращение по имени
  function seatClicked(s) {
    if (s < 1) return;
    if (picker) { resolvePick(s); return; }
    if (!G.over && G.phase === 'discuss' && P(0).alive && !input.disabled) {
      const name = P(s).name;
      if (!input.value.startsWith(name)) input.value = name + ', ' + input.value;
      input.focus();
    }
  }
  const canvas = $('#scene');
  canvas.addEventListener('click', (e) => {
    if (skipLine === false && G.speaking) { skipLine = true; }
    seatClicked(Stage.pick(e.clientX, e.clientY));
  });
  let hoverQueued = null;
  canvas.addEventListener('pointermove', (e) => {
    if (hoverQueued) return;
    hoverQueued = requestAnimationFrame(() => {
      hoverQueued = null;
      const s = Stage.pick(e.clientX, e.clientY);
      const ok = s > 0 && (!picker || picker.allowed.has(s));
      Stage.highlight(s, ok);
      canvas.style.cursor = ok ? 'pointer' : '';
    });
  });
  $('#plates').addEventListener('click', (e) => {
    const b = e.target.closest('.plate');
    if (b) seatClicked(+b.dataset.seat);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { $('#record').hidden = true; }
    if (e.code === 'Space' && document.activeElement !== input && G.speaking) { e.preventDefault(); skipLine = true; }
  });

  /* ---------- показ реплики: облачко, печать, голос, жест ---------- */
  G.speaking = false;
  function present(seat, job, opts = {}) {
    const gen = G.gen;
    const p = P(seat);
    const b = UI.bubble(seat, { name: p.name, thinking: true, kind: opts.kind });
    Stage.setSpeaker(opts.kind === 'whisper' ? -1 : seat);
    Stage.think(seat, true);
    UI.plateState(seat, { speaking: true });
    G.speaking = true;
    skipLine = false;
    let typed = 0, voiceP = null, voiceDone = false, holdEnd = 0, heckled = false;
    const useVoice = UI.Voice.on && UI.Voice.ok && !opts.silent;
    const cps = useVoice ? 14.5 * (p.voice ? p.voice.rate : 1) : 42;
    job.onMeta = (m) => applyMeta(seat, m, job);
    if (job.meta) applyMeta(seat, job.meta, job);
    return new Promise((resolve) => {
      let last = performance.now();
      const step = (now) => {
        if (gen !== G.gen) { b.close(0); resolve(); return; }
        // печать по реальному времени: темп не зависит от частоты кадров (слабая машина, фоновая вкладка)
        const dt = Math.min(1, (now - last) / 1000);
        last = now;
        const txt = job.say || '';
        if (txt) {
          if (b.full === '') { b.thinking(false); Stage.think(seat, false); Stage.talk(seat, true); }
          b.set(txt);
          if (skipLine && job.done) { typed = txt.length; if (voiceP) UI.Voice.cancel(); voiceDone = true; }
          typed = Math.min(txt.length, typed + dt * cps);
          b.reveal(Math.floor(typed));
          if (!heckled && job.meta && typed > txt.length * 0.45) { heckled = true; heckle(seat, job.meta); }
        }
        if (job.done && txt && !voiceP) {
          if (useVoice) voiceP = UI.Voice.speak(txt, p).then(() => { voiceDone = true; });
          else voiceDone = true;
        }
        if (job.done && typed >= (job.say || '').length && voiceDone) {
          if (!holdEnd) holdEnd = now + (useVoice ? 250 : (skipLine ? 150 : 700 + (job.say || '').length * 14));
          if (now >= holdEnd) {
            Stage.talk(seat, false);
            UI.plateState(seat, { speaking: false });
            G.speaking = false;
            b.reveal(b.full.length);
            b.close(opts.keep ?? 5200);
            opts.onShown && opts.onShown();
            resolve();
            return;
          }
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function applyMeta(seat, m, job) {
    if (!m || job._metaApplied) return;
    job._metaApplied = true;
    Stage.emote(seat, m.emotion || 'calm');
    let g = m.gesture;
    const t = m.target;
    if (g === 'point' && !(t >= 0)) g = 'palms';
    if (!g) g = t >= 0 && Math.random() < 0.5 ? 'point' : 'talk';
    Stage.gesture(seat, g, t >= 0 ? t : null, g === 'point' ? 3.2 : 2.6);
    if (t > 0) Stage.lookAt(seat, t);
    else if (t === 0) Stage.lookAt(seat, 0);
  }

  // реакция с места: тот, на кого показали, вскидывается
  function heckle(seat, m) {
    const t = m.target;
    if (!(t > 0) || !P(t).alive || AI.shot) return;
    const hard = m.gesture === 'point' || m.gesture === 'fist' || m.emotion === 'angry';
    const react = { leva: 'fear', zina: 'surprise', gena: 'angry', semen: 'calm', mila: 'surprise', artur: 'irony', vera: 'angry' }[P(t).id] || 'surprise';
    Stage.emote(t, react);
    if (P(t).id === 'leva') Stage.gesture(t, 'hands', null, 1.6);
    else if (P(t).id === 'artur') Stage.gesture(t, 'cross', null, 2.2);
    if (hard && Math.random() < 0.55 && !UI.mobile()) {
      const hb = UI.bubble(t, { name: '', kind: 'heck' });
      const line = P(t).demo.heck[Math.floor(Math.random() * P(t).demo.heck.length)];
      hb.set(line); hb.reveal(line.length); hb.thinking(false);
      hb.close(1500);
    }
  }

  /* ---------- реплики игрока ---------- */
  async function sayHuman(text, gen) {
    const me = P(0);
    const targets = Brain.mentions(G, text, 0).filter((s) => s > 0);
    G.log.push({ k: 'line', day: G.day, seat: 0, text, thought: '', target: targets[0] ?? -1 });
    UI.logLine(me.name, text, ' <i>вы</i>');
    Stage.setSpeaker(0);
    const b = UI.bubble(0, { name: me.name });
    b.set(text); b.reveal(text.length); b.thinking(false);
    for (const s of targets.slice(0, 2)) { Stage.lookAt(s, 0); }
    await wait(900 + Math.min(1600, text.length * 12), gen);
    b.close(2600);
    return targets;
  }

  /* ---------- задания на реплику (с упреждением) ---------- */
  function startSpeech(seat, ctx) {
    const ctl = new AbortController();
    const job = { seat, ctx, say: '', meta: null, done: false, result: null, ctl };
    job.promise = Brain.speech(G, seat, ctx, {
      signal: ctl.signal,
      onMeta: (m) => { job.meta = m; job.onMeta && job.onMeta(m); },
      onSay: (s) => { if (!job.done) job.say = s; },
    }).then((r) => {
      job.result = r; job.say = r.say; job.done = true;
      if (!job.meta) { job.meta = r; job.onMeta && job.onMeta(r); }
      return r;
    });
    job.promise.catch(() => {});
    return job;
  }

  function commitLine(seat, r) {
    G.log.push({ k: 'line', day: G.day, seat, text: r.say, thought: r.thought || '', target: r.target ?? -1, gesture: r.gesture, emotion: r.emotion });
  }

  function speakingOrder() {
    const lastDeath = [...G.log].reverse().find((e) => (e.k === 'night' && e.victim >= 0) || (e.k === 'votes' && e.out >= 0));
    let start = lastDeath ? (lastDeath.victim ?? lastDeath.out) + 1 : 1 + Math.floor(Math.random() * 7);
    const order = [];
    for (let k = 0; k < 8; k++) { const s = (start + k) % 8; if (P(s).alive) order.push(s); }
    return order;
  }

  /* ---------- день: обсуждение ---------- */
  async function discussion(gen) {
    G.phase = 'discuss';
    const queue = speakingOrder();
    const front = [];
    const said = {};
    let replies = 0, aiLines = 0;
    const MAX_AI = 12;
    const humanIn = () => P(0).alive && !G.spectator;
    const next = () => {
      while (front.length) { const x = front.shift(); if (P(x.seat).alive) return x; }
      while (queue.length) { const s = queue.shift(); if (P(s).alive) return { seat: s, ctx: { reason: 'turn' } }; }
      return null;
    };
    let cur = next();
    let job = null;
    dockMode('talk', humanIn() ? 'Можно вставить слово в любой момент. Нажмите на игрока, чтобы обратиться к нему.' : 'Вы выбыли и видите всё. Досмотрите партию.', { noInput: !humanIn() });
    while (cur) {
      guard(gen);
      if (cur.seat === 0) {
        if (humanIn()) {
          const addressed = cur.ctx.reason === 'addressed';
          const t = await waitHuman('turn', addressed ? `${P(cur.ctx.from).name} обращается к вам. Ответите?` : 'Ваше слово. Скажите, что думаете, — или промолчите.', { softMs: addressed ? 9000 : 0, attn: true });
          guard(gen);
          dockMode('talk', 'Можно вставить слово в любой момент.', {});
          if (typeof t === 'string') {
            const targets = await sayHuman(t, gen);
            targets.slice(0, 2).reverse().forEach((s) => front.unshift({ seat: s, ctx: { reason: 'human', from: 0 } }));
          }
        }
        cur = next(); job = null;
        continue;
      }
      if (aiLines >= MAX_AI) break;
      if (!job || job.seat !== cur.seat) { if (job) job.ctl.abort(); job = startSpeech(cur.seat, cur.ctx); }
      const thisJob = job;
      const shown = present(cur.seat, thisJob, { onShown: () => UI.logLine(P(thisJob.seat).name, thisJob.result ? thisJob.result.say : thisJob.say) });
      let res;
      try { res = await thisJob.promise; } catch (e) {
        guard(gen);
        res = Brain.demoSpeech(G, cur.seat, cur.ctx);
        thisJob.say = res.say; thisJob.result = res; thisJob.done = true; thisJob.meta = res;
      }
      guard(gen);
      commitLine(cur.seat, res);
      aiLines++;
      said[cur.seat] = (said[cur.seat] || 0) + 1;
      const t = res.target;
      if (t === 0 && humanIn() && !front.some((f) => f.seat === 0)) front.unshift({ seat: 0, ctx: { reason: 'addressed', from: cur.seat } });
      else if (t > 0 && P(t).alive && t !== cur.seat && replies < 3 && (said[t] || 0) < 2 && !front.some((f) => f.seat === t)) {
        front.unshift({ seat: t, ctx: { reason: 'reply', from: cur.seat } });
        replies++;
      }
      cur = next();
      job = cur && cur.seat !== 0 ? startSpeech(cur.seat, cur.ctx) : null;
      await shown;
      guard(gen);
      if (G.inbox.length && humanIn()) {
        if (job) { job.ctl.abort(); job = null; }
        if (cur) { if (cur.ctx.reason === 'turn') queue.unshift(cur.seat); else front.unshift(cur); }
        while (G.inbox.length) {
          const txt = G.inbox.shift();
          const targets = await sayHuman(txt, gen);
          targets.slice(0, 2).reverse().forEach((s) => front.unshift({ seat: s, ctx: { reason: 'human', from: 0 } }));
        }
        cur = next();
      }
    }
    if (job) job.ctl.abort();
    guard(gen);
    // обсуждение закончилось: игрок может ещё сказать или перейти к голосованию
    if (!humanIn()) { await wait(1200, gen); return; }
    for (let rounds = 0; rounds < 6; rounds++) {
      const r = await waitHuman('end', 'Все высказались. Скажите ещё что-нибудь — или переходите к голосованию.', { vote: true, skip: false, attn: true });
      guard(gen);
      if (!r || r.vote) break;
      const targets = await sayHuman(r, gen);
      let who = targets.filter((s) => P(s).alive).slice(0, 2);
      if (!who.length) {
        const pool = aliveSeats().filter((s) => s > 0);
        who = [pool[Math.floor(Math.random() * pool.length)]];
      }
      dockMode('talk', '', {});
      for (const s of who) {
        const j = startSpeech(s, { reason: 'human', from: 0 });
        const sh = present(s, j, { onShown: () => UI.logLine(P(s).name, j.say) });
        const res = await j.promise.catch(() => Brain.demoSpeech(G, s, { reason: 'human', from: 0 }));
        if (!j.done) { j.say = res.say; j.done = true; j.result = res; }
        commitLine(s, res);
        await sh;
        guard(gen);
      }
    }
  }

  /* ---------- голосование ---------- */
  async function votePhase(gen) {
    G.phase = 'vote';
    UI.phase(`День ${G.day}`, 'голосование');
    Stage.setSpeaker(-1);
    dockMode('wait', '', { noInput: true });
    const voters = aliveSeats().filter((s) => s > 0);
    const jobs = voters.map((s) => Promise.race([Brain.vote(G, s), wait(20000).then(() => null)]).catch(() => null));
    await UI.banner('Голосование', 'Кого город выгонит сегодня?', 1600);
    guard(gen);
    let hv = -2;
    if (P(0).alive && !G.spectator) {
      hv = await pickSeat(aliveSeats().filter((s) => s > 0), 'Ваш голос: нажмите на того, кого выгоняете.', { abstain: true });
      guard(gen);
    }
    dockMode('wait', 'Считаем голоса…', { noInput: true });
    const res = await Promise.all(jobs);
    guard(gen);
    const votes = voters.map((s, k) => {
      let r = res[k];
      const ally = (x) => P(s).role === 'maf' && P(x).role === 'maf';
      if (!r || !(r.target >= 0) || !P(r.target).alive || r.target === s || ally(r.target)) {
        const cand = aliveSeats().filter((x) => x !== s && !ally(x));
        r = { thought: '', target: cand[Math.floor(Math.random() * cand.length)], say: '' };
      }
      return { from: s, to: r.target, say: r.say || '', thought: r.thought || '' };
    });
    if (hv !== -2) votes.push({ from: 0, to: hv, say: '', thought: '' });
    // на счёт три
    for (const n of ['Раз', 'Два', 'Три!']) { UI.banner(n, '', 520, 'count'); UI.Sfx.knock(); await wait(560, gen); }
    UI.bannerOff();
    const pairs = votes.filter((v) => v.to >= 0).map((v) => [v.from, v.to]);
    for (const v of votes) if (v.from > 0) { Stage.gesture(v.from, 'vote', v.to, 6); Stage.emote(v.from, 'calm'); }
    Stage.threads(pairs);
    dockMode('wait', '', { noInput: true });
    UI.Sfx.slam();
    const tally = {};
    for (const v of votes) if (v.to >= 0) tally[v.to] = (tally[v.to] || 0) + 1;
    for (let i = 1; i < 8; i++) UI.plateState(i, { votes: tally[i] || 0 });
    // короткие фразы при голосовании — одна за другой
    for (const v of votes) {
      if (v.from === 0) continue;
      const line = v.say || `Против ${P(v.to).forms.gen}.`;
      const hb = UI.bubble(v.from, { name: P(v.from).name, kind: 'vote' });
      hb.set(line); hb.reveal(line.length); hb.thinking(false);
      hb.close(2600);
      await wait(380, gen);
    }
    const lines = votes.map((v) => `${esc(P(v.from).name)} → ${v.to >= 0 ? esc(P(v.to).name) : 'воздерж.'}`).join(', ');
    UI.log('sys', `Голоса: ${lines}`);
    await wait(1800, gen);
    let max = 0, out = -1, tie = false;
    for (const k in tally) { if (tally[k] > max) { max = tally[k]; out = +k; tie = false; } else if (tally[k] === max) tie = true; }
    if (tie) out = -1;
    const entry = { k: 'votes', day: G.day, pairs: votes.map((v) => [v.from, v.to]), out, detail: votes };
    if (out < 0) {
      G.log.push(entry);
      UI.log('sys', 'Голоса разделились — никто не уходит.');
      await UI.banner('Голоса разделились', 'Сегодня никто не уходит', 2200);
      Stage.clearThreads();
      for (let i = 1; i < 8; i++) UI.plateState(i, { votes: 0 });
      return;
    }
    await UI.banner(P(out).name, `голосов против: ${max}`, 1700, 'out');
    Stage.clearThreads();
    for (let i = 1; i < 8; i++) UI.plateState(i, { votes: 0 });
    guard(gen);
    // последнее слово
    let last = '';
    if (out === 0) {
      const t = await waitHuman('last', 'Вас выгоняют. Последнее слово?', { skip: true, attn: true, send: 'Сказать' });
      guard(gen);
      if (typeof t === 'string') { last = t; await sayHuman(t, gen); }
    } else {
      for (let i = 1; i < 8; i++) if (i !== out && P(i).alive) Stage.lookAt(i, out);
      const job = { say: '', done: false, meta: { emotion: 'sad', gesture: P(out).role === 'maf' ? 'shrug' : 'palms', target: -1 } };
      const sh = present(out, job, {});
      last = await Brain.lastWords(G, out, { onSay: (s) => { job.say = s; } });
      job.say = last; job.done = true;
      await sh;
      UI.logLine(P(out).name, last, ' <i>последнее слово</i>');
    }
    guard(gen);
    G.log.push(entry);
    if (last) G.log.push({ k: 'last', seat: out, text: last });
    await eliminate(out, 'exec', gen);
  }

  /* ---------- выбывание ---------- */
  async function eliminate(s, how, gen) {
    P(s).alive = false;
    if (s > 0) {
      Stage.remove(s, how);
      Stage.revealCard(s, P(s).role);
      UI.plateState(s, { dead: true, sub: roleWord(s), role: P(s).role, tag: '' });
    }
    UI.Sfx.flip();
    if (how === 'exec') {
      UI.log('death', `${esc(P(s).name)} выгнан${endA(s)}. Роль: <b>${esc(roleWord(s))}</b>.`);
      await UI.banner(`${P(s).name} — ${R[P(s).role].title.toLowerCase()}`, P(s).role === 'maf' ? 'Город поймал мафию' : 'Город ошибся', 2400, P(s).role === 'maf' ? 'good' : 'bad');
    }
    if (s === 0) becomeGhost();
    guard(gen);
  }

  function becomeGhost() {
    G.spectator = true;
    for (let i = 1; i < 8; i++) if (P(i).alive) UI.plateState(i, { role: P(i).role, sub: roleWord(i) });
    document.body.classList.add('ghost');
    UI.toast('Вы выбыли. Теперь вы видите роли и слышите переговоры мафии.', 5200);
    dockMode('talk', 'Вы выбыли и видите всё. Досмотрите партию.', { noInput: true });
  }

  /* ---------- ночь ---------- */
  async function nightPhase(gen) {
    G.night++;
    const n = G.night;
    G.phase = 'night';
    UI.phase(`Ночь ${n}`, 'город спит');
    UI.clearBubbles();
    Stage.setSpeaker(-1);
    Stage.setNight(true);
    UI.Sfx.gong();
    dockMode('wait', '', { noInput: true });
    const rec = { n, chat: [], target: -1, heal: null, check: null, victim: -1 };
    G.nights.push(rec);
    UI.log('night', `Ночь ${n}`);
    await UI.banner(`Ночь ${n}`, 'Город засыпает', 2100, 'night');
    guard(gen);
    const al = aliveSeats();
    const maf = al.filter((s) => P(s).role === 'maf');
    const town = al.filter((s) => P(s).role !== 'maf');
    let killCand = town.filter((s) => !(n === 1 && s === 0));
    if (!killCand.length) killCand = town;
    // доктор и комиссар думают параллельно
    const doc = al.find((s) => P(s).role === 'doc' && s !== 0);
    const com = al.find((s) => P(s).role === 'com' && s !== 0);
    let docCand = [];
    if (doc != null) docCand = al.filter((s) => s !== G.lastHeal && !(s === doc && G.selfHeal));
    const docP = doc != null ? Brain.night(G, doc, 'doc', docCand).catch(() => null) : Promise.resolve(null);
    const comCand = com != null ? al.filter((s) => s !== com && !G.checks[com].some((c) => c.target === s)) : [];
    const comP = com != null && comCand.length ? Brain.night(G, com, 'com', comCand).catch(() => null) : Promise.resolve(null);

    // мафия
    UI.banner('Просыпается мафия', '', 60000, 'night');
    let target = -1;
    const humanMaf = P(0).role === 'maf' && P(0).alive;
    if (humanMaf) {
      const partner = maf.find((s) => s !== 0);
      let prop = null;
      if (partner != null) {
        Stage.wake(partner, true);
        const job = { say: '', done: false, meta: { emotion: 'irony', gesture: 'chin', target: -1 } };
        const sh = present(partner, job, { kind: 'whisper', silent: true, keep: 60000 });
        prop = await Brain.mafia(G, partner, killCand, null);
        job.say = prop.say; job.done = true;
        await sh;
        guard(gen);
        rec.chat.push({ seat: partner, text: prop.say, target: prop.target });
        if (prop.target > 0) UI.plateState(prop.target, { tag: 'выбор напарника' });
      }
      UI.bannerOff();
      const hint = prop && prop.target >= 0 ? `Напарник предлагает: ${P(prop.target).name}. Кого убираете? Можно шепнуть ему пару слов.` : 'Кого убираете этой ночью?';
      const wp = pickSeat(killCand, hint, { whisper: true, placeholder: 'Шепнуть напарнику (необязательно)…', send: 'Шепнуть' });
      let whisper = '';
      const wsub = (e) => { e.preventDefault(); e.stopImmediatePropagation(); whisper = input.value.trim().slice(0, 200); if (whisper) { UI.toast('Шепнули: «' + whisper + '»'); input.value = ''; } };
      $('#say').addEventListener('submit', wsub, true);
      target = await wp;
      $('#say').removeEventListener('submit', wsub, true);
      guard(gen);
      if (prop && prop.target > 0) UI.plateState(prop.target, { tag: '' });
      if (target < 0) target = prop ? prop.target : killCand[0];
      rec.chat.push({ seat: 0, text: whisper || `Берём ${P(target).forms.acc}.`, target });
      if (partner != null) {
        G.priv[partner].push(`Ночь ${n}, переговоры мафии: ты шепнул${endA(partner)} «${prop.say}»; ${P(0).name} ответил${endA(0)}: «${whisper || 'молча выбрал цель'}». Убили: ${P(target).name}.`);
        UI.clearBubbles();
        Stage.wake(partner, false);
      }
    } else {
      const aiMaf = maf.filter((s) => s !== 0);
      const ghost = G.spectator;
      if (aiMaf.length) {
        const a = await Brain.mafia(G, aiMaf[0], killCand, null);
        guard(gen);
        rec.chat.push({ seat: aiMaf[0], text: a.say, target: a.target });
        target = a.target;
        if (ghost) await ghostWhisper(aiMaf[0], a.say, gen);
        if (aiMaf[1] != null) {
          const b = await Brain.mafia(G, aiMaf[1], killCand, a);
          guard(gen);
          rec.chat.push({ seat: aiMaf[1], text: b.say, target: b.target });
          target = b.target;
          if (ghost) await ghostWhisper(aiMaf[1], b.say, gen);
        }
        const chat = rec.chat.map((c) => `${P(c.seat).name}: «${c.text}»`).join(' ');
        for (const s of aiMaf) G.priv[s].push(`Ночь ${n}, переговоры мафии: ${chat} Убили: ${P(target).name}.`);
      }
      if (!ghost) await wait(1400, gen);
      UI.bannerOff();
    }
    if (!(target >= 0) || !killCand.includes(target)) target = killCand[Math.floor(Math.random() * killCand.length)];
    rec.target = target;
    guard(gen);

    // комиссар
    if (P(0).role === 'com' && P(0).alive) {
      const cand = aliveSeats().filter((s) => s > 0 && !G.checks[0].some((c) => c.target === s));
      if (cand.length) {
        await UI.banner('Просыпается комиссар', 'Это вы', 1300, 'night');
        const t = await pickSeat(cand, 'Кого проверить этой ночью?', {});
        guard(gen);
        const isM = P(t).role === 'maf';
        G.checks[0].push({ target: t, maf: isM, n });
        rec.check = { seat: 0, target: t, maf: isM, thought: '' };
        UI.plateState(t, { tag: isM ? 'мафия!' : 'не мафия' });
        UI.log('private', `Ваша проверка: ${esc(P(t).name)} — ${isM ? '<b>мафия</b>' : 'не мафия'}.`);
        await UI.banner(P(t).name, isM ? 'Мафия!' : 'Не мафия', 2000, isM ? 'bad' : 'good');
      }
    } else {
      await UI.banner('Доктор и комиссар', 'делают свой выбор', 1500, 'night');
    }
    guard(gen);
    const [heal, check] = await Promise.all([docP, comP]);
    guard(gen);
    let healT = -1;
    if (doc != null && heal && docCand.includes(heal.target)) {
      healT = heal.target;
      rec.heal = { seat: doc, target: healT, thought: heal.thought || '' };
      G.lastHeal = healT;
      if (healT === doc) G.selfHeal = true;
      G.priv[doc].push(`Ночь ${n}: ты спасал${endA(doc)} ${P(healT).forms.acc}.`);
    } else G.lastHeal = -1;
    if (com != null && check && comCand.includes(check.target)) {
      const isM = P(check.target).role === 'maf';
      G.checks[com].push({ target: check.target, maf: isM, n });
      rec.check = { seat: com, target: check.target, maf: isM, thought: check.thought || '' };
      G.priv[com].push(`Ночь ${n}: ты проверил${endA(com)} ${P(check.target).forms.acc} — ${isM ? 'МАФИЯ' : 'не мафия'}.`);
    }
    const victim = target >= 0 && target !== healT ? target : -1;
    rec.victim = victim;
    if (victim < 0 && doc != null && healT === target) G.priv[doc].push(`Ночь ${n}: твоё спасение сработало — мафия приходила за ${P(target).forms.ins}.`);

    // утро
    G.log.push({ k: 'night', n, victim });
    if (victim > 0) { Stage.remove(victim, 'night'); }
    await wait(500, gen);
    Stage.setNight(false);
    if (victim >= 0) { Stage.flash(); UI.Sfx.thunder(); }
    UI.phase(`Утро ${n}`, '');
    if (victim >= 0) {
      P(victim).alive = false;
      if (victim > 0) { Stage.revealCard(victim, P(victim).role); UI.plateState(victim, { dead: true, sub: roleWord(victim), role: P(victim).role, tag: '' }); }
      UI.log('death', `Этой ночью убит${endA(victim)} ${esc(P(victim).name)}. Роль: <b>${esc(roleWord(victim))}</b>.`);
      await UI.banner('Утро', `Этой ночью убит${endA(victim)} ${P(victim).name} — ${roleWord(victim)}`, 2800, 'morning');
      if (victim === 0) becomeGhost();
    } else {
      UI.log('death', 'Этой ночью никто не погиб.');
      await UI.banner('Утро', 'Этой ночью никто не погиб', 2400, 'morning');
    }
    guard(gen);
  }

  async function ghostWhisper(seat, text, gen) {
    const job = { say: text, done: true, meta: { emotion: 'irony', gesture: 'chin', target: -1 } };
    Stage.wake(seat, true);
    await present(seat, job, { kind: 'whisper', silent: true, keep: 1800 });
    Stage.wake(seat, false);
    guard(gen);
  }

  /* ---------- проверка победы ---------- */
  function winner() {
    const al = aliveSeats();
    const m = al.filter((s) => P(s).role === 'maf').length;
    if (m === 0) return 'town';
    if (m >= al.length - m) return 'mafia';
    return null;
  }

  /* ---------- основной цикл ---------- */
  async function run(gen) {
    try {
      await intro(gen);
      for (;;) {
        await nightPhase(gen);
        let w = winner();
        if (w) return finale(w, gen);
        G.day++;
        G.log.push({ k: 'day', n: G.day });
        UI.log('day', `День ${G.day}`);
        UI.phase(`День ${G.day}`, 'обсуждение');
        await discussion(gen);
        await votePhase(gen);
        w = winner();
        if (w) return finale(w, gen);
      }
    } catch (e) {
      if (e instanceof Cancel) return;
      throw e;
    }
  }

  async function intro(gen) {
    G.phase = 'intro';
    UI.phase('Раздача', 'роли');
    dockMode('wait', '', { noInput: true });
    await UI.banner('Раздача ролей', 'Каждому — одна карта. Свою видите только вы.', 2000);
    guard(gen);
    Stage.flipTable(0, P(0).role);
    UI.Sfx.flip();
    const me = P(0);
    const partner = G.players.find((p) => p.role === 'maf' && p.seat !== 0);
    const sub = R[me.role].goal + (me.role === 'maf' && partner ? ` Напарник — ${partner.name}.` : '');
    if (me.role === 'maf' && partner) { Stage.lookAt(partner.seat, 0); Stage.emote(partner.seat, 'irony'); }
    await UI.banner(`Вы — ${R[me.role].title.toLowerCase()}`, sub, 3600, 'role-' + me.role);
    guard(gen);
  }

  async function finale(w, gen) {
    G.over = true;
    G.phase = 'over';
    const humanWon = (w === 'town') === (P(0).role !== 'maf');
    UI.phase('Финал', w === 'town' ? 'мирные победили' : 'мафия победила');
    Stage.setSpeaker(-1);
    Stage.setNight(false);
    Stage.camera('orbit');
    for (let i = 1; i < 8; i++) {
      UI.plateState(i, { role: P(i).role, sub: roleWord(i) });
      if (P(i).alive) { Stage.flipTable(i, P(i).role); Stage.emote(i, (P(i).role === 'maf') === (w === 'mafia') ? 'irony' : 'sad'); }
    }
    UI.Sfx.sting(humanWon);
    dockMode('wait', '', { noInput: true });
    await UI.banner(w === 'town' ? 'Мирные победили' : 'Мафия победила', humanWon ? 'Вы победили' : 'Вы проиграли', 3000, w === 'town' ? 'good' : 'bad');
    guard(gen);
    showFinal(w, humanWon);
  }

  function showFinal(w, humanWon) {
    const f = $('#final');
    $('#finKicker').textContent = humanWon ? 'Победа' : 'Поражение';
    $('#finTitle').textContent = w === 'town' ? 'Мирные победили' : 'Мафия победила';
    const maf = G.players.filter((p) => p.role === 'maf').map((p) => p.name).join(' и ');
    $('#finSub').innerHTML = nb(`Мафией были ${maf}. Дней: ${G.day}, ночей: ${G.night}.`);
    $('#finRoles').innerHTML = G.players.map((p) => `<li data-role="${p.role}" class="${p.alive ? '' : 'dead'}"><b>${esc(p.name)}</b><span>${esc(p.fem ? R[p.role].shortF : R[p.role].short)}</span></li>`).join('');
    $('#finStats').textContent = AI.demo ? 'Демо-режим: заготовленные ответы.' : `Запросов к нейросети: ${AI.usage.calls}, потрачено $${AI.usage.costUSD.toFixed(4)}.`;
    UI.insetL = UI.mobile() ? 0 : 480;
    setLog(false);
    f.hidden = false;
    requestAnimationFrame(() => f.classList.add('in'));
  }

  /* ---------- «запись ночи»: переговоры мафии и мысли игроков ---------- */
  function buildRecord() {
    const tag = (s) => `<i class="r-role" data-role="${P(s).role}">${esc(s === 0 ? 'вы, ' + roleWord(s) : roleWord(s))}</i>`;
    const who = (s) => `<b>${esc(P(s).name)}</b>${tag(s)}`;
    const out = [];
    out.push('<p class="r-intro">Всё, что было скрыто: ночные переговоры, выбор доктора и комиссара, и что каждый думал, когда говорил.</p>');
    out.push('<div class="r-cast">' + G.players.map((p) => `<span data-role="${p.role}">${esc(p.name)} — ${esc(p.fem ? R[p.role].shortF : R[p.role].short)}</span>`).join('') + '</div>');
    let nightIdx = 0;
    for (const e of G.log) {
      if (e.k === 'night') {
        const r = G.nights[nightIdx++];
        out.push(`<h3>Ночь ${e.n}</h3>`);
        if (r) {
          for (const c of r.chat) out.push(`<p class="r-maf">${who(c.seat)} шепчет: «${nb(c.text)}» <span class="r-arrow">→ ${esc(c.target >= 0 ? P(c.target).name : '—')}</span></p>`);
          if (r.heal) out.push(`<p class="r-doc">${who(r.heal.seat)} спасает ${esc(P(r.heal.target).forms.acc)}${r.heal.thought ? ' — <q>' + nb(r.heal.thought) + '</q>' : ''}</p>`);
          if (r.check) out.push(`<p class="r-com">${who(r.check.seat)} проверяет ${esc(P(r.check.target).forms.acc)}: ${r.check.maf ? '<b>мафия</b>' : 'не мафия'}${r.check.thought ? ' — <q>' + nb(r.check.thought) + '</q>' : ''}</p>`);
        }
        out.push(`<p class="r-res">${e.victim >= 0 ? `Итог: убит${endA(e.victim)} ${esc(P(e.victim).name)}.` : (r && r.target >= 0 ? `Итог: мафия пришла за ${esc(P(r.target).forms.ins)}, но доктор успел.` : 'Итог: никто не погиб.')}</p>`);
      } else if (e.k === 'day') out.push(`<h3>День ${e.n}</h3>`);
      else if (e.k === 'line') {
        out.push(`<div class="r-line">${who(e.seat)}<p class="r-said">«${nb(e.text)}»</p>${e.thought ? `<p class="r-thought">думал${endA(e.seat)}: ${nb(e.thought)}</p>` : ''}</div>`);
      } else if (e.k === 'votes') {
        const items = (e.detail || []).map((v) => `<li>${who(v.from)} → ${v.to >= 0 ? esc(P(v.to).name) : 'воздержал' + (P(v.from).fem ? 'ась' : 'ся')}${v.thought ? ` <span class="r-thought">— ${nb(v.thought)}</span>` : ''}</li>`).join('');
        out.push(`<div class="r-votes"><p>Голосование</p><ul>${items}</ul><p class="r-res">${e.out >= 0 ? `Выгнан${endA(e.out)} ${esc(P(e.out).name)} — ${esc(roleWord(e.out))}.` : 'Голоса разделились.'}</p></div>`);
      } else if (e.k === 'last') out.push(`<p class="r-last">${who(e.seat)} последнее слово: «${nb(e.text)}»</p>`);
    }
    return out.join('');
  }
  $('#bRecord').onclick = () => { $('#recBody').innerHTML = buildRecord(); $('#record').hidden = false; $('#recBody').scrollTop = 0; };
  $('#recClose').onclick = () => { $('#record').hidden = true; };
  $('#record').addEventListener('click', (e) => { if (e.target.id === 'record') $('#record').hidden = true; });
  $('#bAgain').onclick = () => { $('#final').hidden = true; $('#final').classList.remove('in'); showStart(); };

  /* ---------- старт ---------- */
  function showStart() {
    G.gen++;
    G.over = true;
    G.phase = 'start';
    document.body.classList.remove('ghost', 'playing', 'picking');
    document.body.classList.add('at-start');
    $('#start').hidden = false;
    $('#phase').textContent = '';
    UI.clearBubbles();
    UI.bannerOff();
    UI.Voice.cancel();
    Stage.setNight(false);
    Stage.camera('table');
    Stage.setSpeaker(-1);
    UI.insetL = UI.mobile() ? 0 : 480; // кадр сдвигается правее панели
    setLog(false);
    // за столом — те же жильцы, но без ролей
    newGame(store.get('name', 'Саша'), 'civ');
    G.over = true;
    G.phase = 'start';
    dockMode('wait', '', { noInput: true });
  }

  async function start(name, role) {
    store.set('name', name);
    UI.Sfx.init();
    if (!AI.shot && !AI.demo && !AI.hasKey()) await AI.ensureKey();
    else if (!AI.shot && AI.demo && !AI.hasKey()) { const ok = await AI.ensureKey(); if (!ok) AI.demo = true; }
    updateDemoFlag();
    UI.Voice.wanted = store.get('voice', true);
    if (UI.Voice.ok && UI.Voice.wanted) UI.Voice.on = true;
    updateVoiceBtn();
    $('#start').hidden = true;
    document.body.classList.remove('at-start');
    document.body.classList.add('playing');
    newGame(name, role);
    UI.insetL = 0;
    setLog(!UI.mobile());
    const gen = G.gen;
    run(gen);
  }

  $('#startForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const role = (document.querySelector('input[name=role]:checked') || {}).value || 'civ';
    start($('#nameInput').value, role);
  });
  $('#nameInput').value = store.get('name', 'Саша');

  /* ---------- шапка: голоса, звук, протокол, заново ---------- */
  function updateVoiceBtn() {
    const b = $('#bVoice');
    b.setAttribute('aria-pressed', UI.Voice.on ? 'true' : 'false');
    b.disabled = !UI.Voice.ok;
    b.title = UI.Voice.ok ? 'Озвучка реплик' : 'В этом браузере нет русского голоса — реплики идут текстом';
    b.querySelector('span').textContent = UI.Voice.ok ? 'Голоса' : 'Без голоса';
  }
  UI.onVoiceChange = updateVoiceBtn;
  $('#bVoice').onclick = () => {
    if (!UI.Voice.ok) return;
    UI.Voice.on = !UI.Voice.on;
    UI.Voice.wanted = UI.Voice.on;
    store.set('voice', UI.Voice.on);
    if (!UI.Voice.on) UI.Voice.cancel();
    updateVoiceBtn();
  };
  $('#bSound').onclick = () => {
    UI.Sfx.init();
    const on = !UI.Sfx.on;
    UI.Sfx.setOn(on);
    store.set('sound', on);
    $('#bSound').setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  function setLog(open) {
    document.body.classList.toggle('log-open', !!open);
    $('#bLog').setAttribute('aria-pressed', open ? 'true' : 'false');
    const inset = open && !UI.mobile() ? 360 : 0;
    UI.inset = inset;
    Stage.setInsets(UI.insetL || 0, inset);
  }
  $('#bLog').onclick = () => setLog(!document.body.classList.contains('log-open'));
  $('#logClose').onclick = () => setLog(false);
  $('#bRestart').onclick = () => {
    const pop = $('#restartPop');
    pop.hidden = !pop.hidden;
  };
  $('#restartYes').onclick = () => { $('#restartPop').hidden = true; $('#final').hidden = true; showStart(); };
  $('#restartNo').onclick = () => { $('#restartPop').hidden = true; };

  function updateDemoFlag() { $('#demoFlag').hidden = !(AI.demo && !AI.shot); }
  // Ошибка нейросети: ключ/деньги — сразу демо-режим; сеть — после двух провалов подряд
  // (внутри каждого уже по три попытки), чтобы без связи партия не тормозила на ожиданиях.
  let lastErr = 0, netFails = 0;
  Brain.onOk = () => { netFails = 0; };
  Brain.onError = (e) => {
    const kind = e && e.kind;
    const offline = (kind === 'network' || kind === 'timeout') && ++netFails >= 2;
    if (kind === 'auth' || kind === 'credits' || kind === 'nokey' || offline) {
      AI.demo = true;
      updateDemoFlag();
      UI.toast((e.ru || 'Нейросеть недоступна') + '. Дальше — заготовленные ответы.', 5000);
    } else if (Date.now() - lastErr > 8000) {
      lastErr = Date.now();
      UI.toast('Нейросеть не ответила — эта реплика из заготовок.');
    }
  };
  // счётчик расходов: пишем в DOM только при изменении, чтобы не перерисовывать шапку зря
  let costShown = '';
  setInterval(() => {
    const v = '$' + AI.usage.costUSD.toFixed(4);
    if (v === costShown) return;
    costShown = v;
    $('#cost').textContent = v;
    $('#cost').title = `Потрачено на нейросеть: запросов ${AI.usage.calls}`;
  }, 500);

  /* ---------- обложка: сцена спора без обращения к нейросети ---------- */
  function cover() {
    const fixed = [null, 'civ', 'maf', 'civ', 'com', 'civ', 'maf', 'doc'];
    newGame('Саша', 'civ', fixed);
    G.over = true;
    G.phase = 'cover';
    document.body.classList.remove('at-start');
    document.body.classList.add('playing');
    $('#start').hidden = true;
    G.day = 2; G.night = 2;
    const L = (seat, text) => { G.log.push({ k: 'line', day: G.log.filter((e) => e.k === 'day').length, seat, text, thought: '', target: -1 }); UI.logLine(P(seat).name, text, seat === 0 ? ' <i>вы</i>' : ''); };
    G.log.push({ k: 'night', n: 1, victim: 1 });
    UI.log('night', 'Ночь 1');
    UI.log('death', 'Этой ночью убит Гена. Роль: <b>мирный</b>.');
    G.log.push({ k: 'day', n: 1 }); UI.log('day', 'День 1');
    L(2, 'А я вот слышала, будто у Лёвы ночью свет горел. Мне соседка сказала, а она врать не станет!');
    L(3, 'Ну блин, я к сессии готовился! Типа, это теперь преступление?');
    L(6, 'Коллеги, давайте структурируем: Мила весь вечер молчит. Это классический паттерн.');
    L(5, 'Я молчу, потому что слушаю! Какая пошлая мизансцена — обвинить самую внимательную.');
    UI.log('sys', 'Голоса: Артур → Мила, Зина → Мила, Лёва → Мила, Семёныч → Артур, Мила → Артур, Вера Андреевна → Мила, Саша → Артур');
    UI.log('death', 'Мила выгнана. Роль: <b>мирная</b>.');
    UI.log('night', 'Ночь 2');
    UI.log('death', 'Этой ночью никто не погиб.');
    G.log.push({ k: 'day', n: 2 }); UI.log('day', 'День 2');
    L(7, 'Во-первых, вчера Артур первым назвал Милу. Во-вторых, Мила оказалась мирной. Вывод сделайте сами.');
    L(0, 'Лёва, ты вчера говорил, что спал. А Зине — что учил билеты до утра. Так что из этого правда?');
    for (const s of [1, 5]) {
      P(s).alive = false;
      Stage.remove(s, 'night');
      Stage.revealCard(s, 'civ', true);
      UI.plateState(s, { dead: true, sub: s === 5 ? 'мирная' : 'мирный', role: 'civ' });
    }
    UI.phase('День 2', 'обсуждение');
    setLog(!UI.mobile());
    // Семёныч берётся за игрока — все поворачиваются к вам (к камере)
    const semen = 4, leva = 3, zina = 2, artur = 6, vera = 7;
    Stage.setSpeaker(semen);
    for (const i of [leva, zina, artur, vera]) Stage.lookAt(i, 0);
    Stage.emote(semen, 'angry');
    Stage.gesture(semen, 'point', 0, 999);
    Stage.talk(semen, true);
    Stage.emote(leva, 'surprise');
    Stage.emote(zina, 'irony');
    Stage.emote(artur, 'calm');
    Stage.gesture(artur, 'cross', null, 999);
    Stage.emote(vera, 'calm');
    Stage.gesture(vera, 'chin', null, 999);
    Stage.flipTable(0, 'civ', true);
    Stage.settle(40);
    const line = 'Фиксирую, Саша: вчера вы топили Артура, сегодня уже Лёву. Каждый день новый подозреваемый — так воду и мутят, гражданин.';
    const b = UI.bubble(semen, { name: 'Семёныч' });
    b.set(line); b.reveal(line.length); b.thinking(false);
    const h = UI.bubble(zina, { name: '', kind: 'heck' });
    h.set('Вот-вот!'); h.reveal(8); h.thinking(false);
    UI.plateState(semen, { speaking: true });
    dockMode('turn', 'Семёныч обращается к вам. Ответите?', { skip: true, attn: true });
  }

  /* ---------- запуск ---------- */
  UI.Voice.init();
  UI.Sfx.on = store.get('sound', true);
  $('#bSound').setAttribute('aria-pressed', UI.Sfx.on ? 'true' : 'false');
  updateVoiceBtn();
  updateDemoFlag();
  Stage.ready.then(() => {
    Stage.setCast(window.CAST);
    Stage.onFrame = UI.frame;
    Stage.onSlam = () => UI.Sfx.slam();
    document.body.classList.add('ready');
    if (Stage.mode === '2d') $('#cdnNote').hidden = false;
    if (AI.shot) cover();
    else showStart();
  });

  // Доступ для проверки из _tools/shot (живая партия через --actions)
  window.Game = {
    start: (name, role) => start(name || 'Тестер', role || 'civ'),
    say: (t) => { input.value = t; $('#say').requestSubmit(); },
    skip: () => finishHuman(null),
    vote: () => finishHuman({ vote: true }),
    pick: (s) => resolvePick(s),
    state: () => ({
      phase: G.phase, day: G.day, night: G.night, over: G.over, demo: AI.demo,
      alive: aliveSeats().map((s) => P(s).name + ':' + P(s).role),
      lines: G.log.filter((e) => e.k === 'line').length,
      calls: AI.usage.calls, cost: +AI.usage.costUSD.toFixed(5),
      waiting: humanWaiter ? humanWaiter.mode : picker ? 'pick' : null,
    }),
    log: (n) => G.log.slice(-(n || 12)).map((e) => e.k === 'line' ? `${P(e.seat).name}${e.target >= 0 ? '→' + P(e.target).name : ''}: ${e.text}  [${e.thought}]` : e.k === 'votes' ? `ГОЛОСА: ${e.pairs.map(([a, b]) => P(a).name + '→' + (b >= 0 ? P(b).name : '—')).join(', ')} OUT=${e.out >= 0 ? P(e.out).name : '—'}` : JSON.stringify(e)),
    record: buildRecord,
  };
})();
