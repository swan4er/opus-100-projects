/* Стопа — интерфейс: список стихов, разметка строк, разбор, озвучка ритма, свой текст. */
(function () {
  'use strict';
  const { parseLine, analyze } = window.Meter;
  const POEMS = window.POEMS;
  const $ = (s) => document.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = { mode: 'poem', idx: 4, overrides: new Map(), result: null };

  /* ---------- Оглавление ---------- */
  const listEl = $('#list');
  let lastGroup = '';
  POEMS.forEach((p, i) => {
    if (p.group !== lastGroup) {
      const g = document.createElement('p'); g.className = 'grp'; g.textContent = p.group; listEl.appendChild(g);
      lastGroup = p.group;
    }
    const b = document.createElement('button');
    b.className = 'item'; b.dataset.i = i;
    b.innerHTML = `<span class="t">${p.title}</span><span class="a">${p.author}</span>`;
    b.addEventListener('click', () => selectPoem(i));
    listEl.appendChild(b);
  });
  const ownBtn = $('#ownBtn');
  ownBtn.addEventListener('click', () => selectOwn());

  function markNav() {
    [...listEl.querySelectorAll('.item')].forEach((b) => b.classList.toggle('is-on', state.mode === 'poem' && +b.dataset.i === state.idx));
    ownBtn.classList.toggle('is-on', state.mode === 'own');
  }

  /* ---------- Типографика ---------- */
  const nb = (s) => s.replace(/(^|[\s(«])([вкснуоаиВКСНУОАИ]|за|на|по|от|до|из|не|но|же|ли|со|во|то|как|при|без|для|под|над)\s/g, '$1$2 ');

  /* ---------- Разбор текста ---------- */
  const keyOf = (lineSrc, wi) => lineSrc + '|' + wi;
  function build() {
    const own = state.mode === 'own';
    const src = own ? $('#own').value : POEMS[state.idx].text;
    const rows = src.replace(/\r/g, '').split('\n');
    const mkOverrides = (row) => {
      const m = new Map();
      for (const [k, v] of state.overrides) { const [line, wi] = [k.slice(0, k.lastIndexOf('|')), k.slice(k.lastIndexOf('|') + 1)]; if (line === row) m.set(`0:${wi}`, v); }
      return m;
    };
    let lines = rows.map((row) => parseLine(row, { explicit: !own, overrides: mkOverrides(row), lineIdx: 0 }));
    let result = analyze(lines);
    // В своём тексте угаданные ударения переставляем по найденному размеру
    if (own && result.kind === 'classical') {
      const isI = (p) => p >= result.meter.first && (p - result.meter.first) % result.meter.size === 0;
      for (const l of lines) {
        let pos = 0;
        for (const u of l.units) {
          if (u.type !== 'word') continue;
          const start = pos; pos += u.vowels.length;
          if (!u.guessed) continue;
          const low = u.chars.join('').toLowerCase();
          if (/^вы/.test(low) && u.vowels.length >= 3) { u.stress = 0; continue; }
          const cands = u.vowels.map((_, k) => k).filter((k) => isI(start + k + 1));
          if (!cands.length) continue;
          const pen = u.vowels.length - 2;
          cands.sort((a, b) => Math.abs(a - pen) - Math.abs(b - pen) || b - a);
          u.stress = cands[0];
        }
        l.syl.forEach((s) => { s.stressed = s.u.stress === s.k; s.guessed = s.u.guessed && s.stressed; });
      }
      result = analyze(lines);
    }
    lines.forEach((l, i) => { l.row = rows[i]; });
    state.result = result;
    render(result);
  }

  /* ---------- Отрисовка стиха ---------- */
  const poemEl = $('#poem');
  function sylClass(s) {
    let c = s.stressed ? 's' + (s.extra ? ' x' : '') : s.pyrrhic ? 'p' : 'u';
    if (s.guessed) c += ' g';
    if (s.ictus) c += ' i';
    return c;
  }
  function render(result) {
    poemEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    result.lines.forEach((l, li) => {
      const row = document.createElement('div');
      if (!l.syl.length) { row.className = 'ln gap'; frag.appendChild(row); return; }
      row.className = 'ln';
      const text = document.createElement('div'); text.className = 'lt';
      const sylMap = new Map(l.syl.map((s, i) => [s.u.key + ':' + s.k, [s, i]]));
      for (const u of l.units) {
        if (u.type === 'text') { text.appendChild(document.createTextNode(u.s)); continue; }
        const w = document.createElement('span'); w.className = 'w';
        u.chars.forEach((ch, ci) => {
          const k = u.vowels.indexOf(ci);
          if (k < 0) { w.appendChild(document.createTextNode(ch)); return; }
          const [s, si] = sylMap.get(u.key + ':' + k);
          const v = document.createElement('span');
          v.className = 'v ' + sylClass(s) + (ch !== ch.toLowerCase() ? ' uc' : '');
          v.textContent = ch;
          v.dataset.row = l.row; v.dataset.wi = u.wi; v.dataset.k = k; v.dataset.cur = u.stress;
          v.dataset.li = li; v.dataset.si = si;
          v.title = s.stressed ? (s.extra ? 'сверхсхемное ударение' : 'ударный слог') : s.pyrrhic ? 'пиррихий: сильное место без ударения' : 'безударный слог';
          w.appendChild(v);
        });
        text.appendChild(w);
      }
      const strip = document.createElement('div'); strip.className = 'strip'; strip.setAttribute('aria-hidden', 'true');
      l.syl.forEach((s, si) => { const d = document.createElement('i'); d.className = sylClass(s); d.dataset.li = li; d.dataset.si = si; strip.appendChild(d); });
      const end = document.createElement('div'); end.className = 'end';
      end.innerHTML = `<b>${l.rhyme || ''}</b><span>${l.clausula || ''}</span>`;
      end.title = (l.rhyme ? `рифма ${l.rhyme}, ` : 'без рифмы, ') + ({ м: 'мужская', ж: 'женская', д: 'дактилическая', г: 'гипердактилическая' }[l.clausula] || '') + ' клаузула';
      row.append(text, strip, end);
      frag.appendChild(row);
    });
    poemEl.appendChild(frag);
    renderPanel(result);
  }

  poemEl.addEventListener('click', (e) => {
    const v = e.target.closest('.v');
    if (!v) return;
    stop();
    const key = keyOf(v.dataset.row, v.dataset.wi);
    const k = +v.dataset.k;
    state.overrides.set(key, +v.dataset.cur === k ? -1 : k);
    build();
  });

  /* ---------- Панель разбора ---------- */
  const ABOUT = {
    yamb: 'Двусложная стопа с ударением на втором слоге: та-ТА. Главный размер русской классики — четырёхстопным ямбом написаны «Евгений Онегин» и «Медный всадник».',
    horey: 'Двусложная стопа с ударением на первом слоге: ТА-та. Звучит песенно и напористо — хореем написана «Сказка о царе Салтане».',
    daktil: 'Трёхсложная стопа с ударением на первом слоге: ТА-та-та. Плавный, раскачивающийся ритм, как у Лермонтова в «Тучах».',
    amfibrahiy: 'Трёхсложная стопа с ударением в середине: та-ТА-та. Ритм рассказа — амфибрахием написаны «Крестьянские дети» и «Мороз, Красный нос» Некрасова.',
    anapest: 'Трёхсложная стопа с ударением на последнем слоге: та-та-ТА. Два безударных слога перед ударным дают строке разбег.',
    dolnik: 'Между ударениями то один, то два безударных слога. Размер Серебряного века — им много писали Блок и Ахматова.',
    tonic: 'Постоянно только число ударений, а промежутки между ними свободны. Так писал Маяковский — стих держится на интонации и паузах.',
    none: 'Здесь пока нет ни одного ударного слога — кликните по гласным.',
  };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  function renderPanel(r) {
    $('#meterName').textContent = r.kind === 'none' ? 'Не определён' : r.name;
    const sc = $('#scheme');
    sc.innerHTML = '';
    if (r.kind === 'classical') {
      for (let f = 0; f < r.feet; f++) {
        const box = document.createElement('span'); box.className = 'f';
        r.meter.foot.forEach((x) => { const i = document.createElement('i'); i.className = x === 's' ? 'S' : 'U'; box.appendChild(i); });
        sc.appendChild(box);
      }
      const last = sc.lastElementChild;
      if (last) { const dropN = r.meter.foot.length - 1 - r.meter.foot.lastIndexOf('s'); for (let k = 0; k < dropN; k++) last.children[last.children.length - 1 - k].classList.add('opt'); }
    } else if (r.kind === 'dolnik' || r.kind === 'tonic') {
      for (let k = 0; k < r.icts; k++) {
        const box = document.createElement('span'); box.className = 'f';
        const gap = document.createElement('i'); gap.className = 'U opt'; box.appendChild(gap);
        if (r.kind === 'dolnik' && k) { const g2 = document.createElement('i'); g2.className = 'U opt'; box.appendChild(g2); }
        const s = document.createElement('i'); s.className = 'S'; box.appendChild(s);
        sc.appendChild(box);
      }
    }
    $('#about').textContent = nb(ABOUT[r.kind === 'classical' ? r.meter.id : r.kind]);

    const pb = $('#profileBlock');
    if (r.profile && r.profile.length) {
      pb.hidden = false;
      const prof = $('#profile');
      prof.innerHTML = r.profile.map((v, i) => `<div class="bar ${v < 0.6 ? 'weak' : ''}"><div class="col" style="height:${Math.max(2, v * 100)}%"><span class="pct">${Math.round(v * 100)}%</span></div><span class="k">${ROMAN[i] || i + 1}</span></div>`).join('');
      let weakest = 0;
      r.profile.forEach((v, i) => { if (i < r.profile.length - 1 && v < r.profile[weakest]) weakest = i; });
      const pct = Math.round(r.profile[weakest] * 100);
      $('#profileNote').textContent = nb(pct < 100
        ? `Как часто каждое сильное место действительно под ударением. Слабее всего ${ROMAN[weakest]} стопа — ударна в ${pct}% строк: здесь поэт чаще всего «пропускает» ударение, и строка звучит легче.`
        : 'Как часто каждое сильное место действительно под ударением. Здесь все сильные места ударны — ритм ровный, как шаг.');
    } else pb.hidden = true;

    const lines = r.lines.filter((l) => l.syl.length);
    const syl = lines.map((l) => l.syl.length);
    const facts = [
      ['Строк', lines.length],
      ['Слогов в строке', syl.length ? (Math.min(...syl) === Math.max(...syl) ? Math.min(...syl) : `${Math.min(...syl)}–${Math.max(...syl)}`) : '—'],
      ['Рифмовка', r.scheme || '—'],
      ['Клаузулы', lines.map((l) => l.clausula).join(' ') || '—'],
    ];
    if (r.kind === 'classical') facts.push(['Пиррихиев', r.pyrrhic], ['Сверхсхемных ударений', r.extra]);
    $('#facts').innerHTML = facts.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  }

  /* ---------- Выбор ---------- */
  function selectPoem(i) {
    stop();
    state.mode = 'poem'; state.idx = i; state.overrides = new Map();
    const p = POEMS[i];
    $('#author').textContent = p.author;
    $('#title').textContent = nb(p.title);
    $('#meta').textContent = [p.year, p.note].filter(Boolean).join(' · ');
    $('#editor').hidden = true;
    markNav(); build();
    $('#page').scrollTop = 0;
  }
  function selectOwn() {
    stop();
    state.mode = 'own'; state.overrides = new Map();
    $('#author').textContent = 'Ваш текст';
    $('#title').textContent = 'Проверить свои стихи';
    $('#meta').textContent = 'Ударения угадываются по размеру — кликните по гласной, чтобы поправить';
    $('#editor').hidden = false;
    markNav(); build();
  }
  let t = 0;
  $('#own').addEventListener('input', () => { clearTimeout(t); t = setTimeout(build, 220); });

  /* ---------- Озвучка ритма ---------- */
  let ac = null, timer = 0, playing = false;
  const playBtn = $('#play');
  function tone(time, f0, f1, dur, gain, type = 'sine') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, time); o.frequency.exponentialRampToValueAtTime(f1, time + dur);
    g.gain.setValueAtTime(0.0001, time); g.gain.exponentialRampToValueAtTime(gain, time + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g).connect(ac.destination); o.start(time); o.stop(time + dur + 0.02);
  }
  function noiseHit(time, gain, freq) {
    const len = Math.floor(ac.sampleRate * 0.03), b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ac.createBufferSource(); s.buffer = b;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = gain;
    s.connect(f).connect(g).connect(ac.destination); s.start(time);
  }
  function stop() {
    playing = false; clearTimeout(timer);
    playBtn.classList.remove('is-on'); playBtn.setAttribute('aria-label', 'Прослушать ритм');
    document.querySelectorAll('.on').forEach((e) => e.classList.remove('on'));
  }
  playBtn.addEventListener('click', () => {
    if (playing) { stop(); return; }
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    ac.resume();
    const r = state.result;
    if (!r || r.kind === 'none') return;
    const seq = [];
    r.lines.forEach((l, li) => { l.syl.forEach((s, si) => seq.push({ li, si, s })); seq.push(null, null); });
    playing = true; playBtn.classList.add('is-on'); playBtn.setAttribute('aria-label', 'Остановить');
    const dt = reduceMotion ? 0.3 : 0.24;
    let i = 0, t0 = ac.currentTime + 0.08;
    const tick = () => {
      if (!playing) return;
      document.querySelectorAll('.on').forEach((e) => e.classList.remove('on'));
      if (i >= seq.length) { stop(); return; }
      const e = seq[i];
      const when = t0 + i * dt;
      if (e) {
        if (r.kind === 'classical' && e.s.ictus) tone(when, 1800, 1500, 0.05, 0.05, 'triangle');
        if (e.s.stressed) { tone(when, 150, 62, 0.22, 0.55); noiseHit(when, 0.12, 900); }
        else noiseHit(when, 0.05, 3000);
        document.querySelectorAll(`[data-li="${e.li}"][data-si="${e.si}"]`).forEach((n) => n.classList.add('on'));
      }
      i++;
      timer = setTimeout(tick, Math.max(0, (t0 + i * dt - ac.currentTime) * 1000));
    };
    tick();
  });

  selectPoem(state.idx);
})();
