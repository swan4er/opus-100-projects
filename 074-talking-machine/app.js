/* Говорящая машина — формантный синтезатор речи.
   Источник — периодическая «глоттальная» волна (гармоники спадают как k^−1,35) плюс шум;
   фильтр — параллельный банк из четырёх формантных резонаторов, носовой резонанс с антирезонансом
   и отдельная ветка шумов для фрикативных и смычных. Фонемы задаются целями параметров,
   переходы между ними — экспоненциальные, как у мышц артикуляции. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const el = {
    plane: $('#plane'), spec: $('#spec'), tract: $('#tract'), tractLabel: $('#tract-label'),
    f1: $('#f1'), f2: $('#f2'), f0: $('#f0'), note: $('#dial-note'),
    vowelKeys: $('#vowel-keys'), consKeys: $('#cons-keys'), words: $('#words'),
    form: $('#say-form'), say: $('#say'), pitch: $('#pitch'), whisper: $('#whisper'), sing: $('#sing'),
    voiceSeg: $('#voice-seg'), rays: $('#rays'), mute: $('#mute'),
  };

  // ---------- Фонетика ----------
  // Усреднённые форманты русских гласных для мужского голоса, Гц
  const VOWELS = {
    'и': { F: [240, 2250, 3000, 3700], A: [1.0, 0.42, 0.42, 0.28] },
    'э': { F: [440, 1800, 2550, 3500], A: [1.0, 0.70, 0.42, 0.24] },
    'а': { F: [700, 1220, 2600, 3500], A: [1.0, 0.85, 0.45, 0.25] },
    'о': { F: [535, 840, 2500, 3400], A: [1.0, 0.90, 0.32, 0.18] },
    'у': { F: [300, 625, 2500, 3400], A: [1.0, 0.55, 0.22, 0.14] },
    'ы': { F: [300, 1500, 2450, 3400], A: [1.0, 0.62, 0.36, 0.22] },
  };
  const VOWEL_ORDER = ['а', 'о', 'у', 'ы', 'и', 'э'];
  // Артикуляция гласных для схемы тракта: точка спинки языка, раствор челюсти, округление губ
  const ART = {
    'и': { bx: 118, by: 120, jaw: 0.15, round: 0 },
    'э': { bx: 126, by: 138, jaw: 0.45, round: 0 },
    'а': { bx: 150, by: 172, jaw: 1.0, round: 0.05 },
    'о': { bx: 174, by: 146, jaw: 0.55, round: 0.65 },
    'у': { bx: 184, by: 124, jaw: 0.2, round: 1.0 },
    'ы': { bx: 156, by: 118, jaw: 0.2, round: 0 },
  };
  // Согласные: вид, форманты или шум, длительность и «жест» артикуляторов
  const CONS = {
    'м': { kind: 'nasal', F: [250, 1100, 2200, 3300], A: [1, 0.12, 0.06, 0.03], NF: 1000, dur: 0.085, art: { lips: 1, velum: 1 } },
    'н': { kind: 'nasal', F: [250, 1600, 2500, 3300], A: [1, 0.12, 0.06, 0.03], NF: 1800, dur: 0.075, art: { tip: 1, velum: 1 } },
    'л': { kind: 'lat', F: [360, 950, 2450, 3300], A: [1, 0.5, 0.2, 0.1], dur: 0.07, art: { tip: 1, back: 0.4 } },
    'р': { kind: 'trill', F: [450, 1250, 1650, 3300], A: [1, 0.6, 0.35, 0.1], dur: 0.09, art: { tip: 0.85 } },
    'й': { kind: 'glide', F: [260, 2150, 2900, 3600], A: [1, 0.45, 0.4, 0.25], dur: 0.06, art: { front: 1 } },
    'в': { kind: 'vfric', F: [280, 1150, 2300, 3300], A: [1, 0.3, 0.15, 0.1], FF: 1600, QF: 0.6, AF: 0.16, dur: 0.07, art: { lips: 0.75 } },
    'ф': { kind: 'fric', FF: 3200, QF: 0.5, AF: 0.3, dur: 0.1, art: { lips: 0.75 } },
    'з': { kind: 'vfric', F: [280, 1700, 2600, 3500], A: [1, 0.3, 0.15, 0.1], FF: 5500, QF: 1.4, AF: 0.34, dur: 0.08, art: { tip: 0.9 } },
    'с': { kind: 'fric', FF: 6200, QF: 1.5, AF: 0.5, dur: 0.11, art: { tip: 0.9 } },
    'ж': { kind: 'vfric', F: [280, 1600, 2300, 3300], A: [1, 0.3, 0.15, 0.1], FF: 2500, QF: 1.2, AF: 0.34, dur: 0.08, art: { tip: 0.7, back: 0.3, round: 0.3 } },
    'ш': { kind: 'fric', FF: 2600, QF: 1.1, AF: 0.5, dur: 0.12, art: { tip: 0.7, back: 0.3, round: 0.4 } },
    'щ': { kind: 'fric', FF: 3600, QF: 1.2, AF: 0.46, dur: 0.16, art: { tip: 0.6, front: 0.8 } },
    'х': { kind: 'fric', FF: 1500, QF: 0.9, AF: 0.34, dur: 0.1, art: { back: 1 } },
    'п': { kind: 'stop', burst: 900, QB: 0.6, AB: 0.42, asp: 0.035, art: { lips: 1 } },
    'б': { kind: 'vstop', burst: 900, QB: 0.6, AB: 0.3, art: { lips: 1 } },
    'т': { kind: 'stop', burst: 4200, QB: 1.0, AB: 0.46, asp: 0.035, art: { tip: 1 } },
    'д': { kind: 'vstop', burst: 4000, QB: 1.0, AB: 0.34, art: { tip: 1 } },
    'к': { kind: 'stop', burst: 1900, QB: 1.2, AB: 0.46, asp: 0.04, art: { back: 1 } },
    'г': { kind: 'vstop', burst: 1900, QB: 1.2, AB: 0.34, art: { back: 1 } },
    'ц': { kind: 'affric', burst: 4200, QB: 1.0, AB: 0.4, FF: 6200, QF: 1.5, AF: 0.46, art: { tip: 1 } },
    'ч': { kind: 'affric', burst: 3000, QB: 1.0, AB: 0.4, FF: 3400, QF: 1.2, AF: 0.46, art: { tip: 0.8, front: 0.6 } },
  };
  const CONS_ORDER = ['м', 'н', 'л', 'р', 'й', 'в', 'ф', 'з', 'с', 'ж', 'ш', 'щ', 'х', 'б', 'п', 'д', 'т', 'г', 'к', 'ц', 'ч'];
  const DEVOICE = { 'б': 'п', 'в': 'ф', 'г': 'к', 'д': 'т', 'ж': 'ш', 'з': 'с' };
  const VOICELESS = new Set(['п', 'ф', 'к', 'т', 'ш', 'с', 'х', 'ц', 'ч', 'щ']);
  const IOTATED = { 'е': 'э', 'ё': 'о', 'ю': 'у', 'я': 'а' };
  const VOICES = { male: { scale: 1, f0: 110 }, female: { scale: 1.17, f0: 205 }, child: { scale: 1.3, f0: 270 } };
  const BW = [80, 100, 150, 250];       // полосы формант, Гц
  const SIGN = [1, -1, 1, -1];          // чередование знаков при параллельном сложении

  let voice = 'male';
  let scale = 1;
  let baseF0 = 110;
  let whisper = false;

  // ---------- Плоскость гласных (логарифмические оси) ----------
  const F2_HI = 2600, F2_LO = 520, F1_LO = 200, F1_HI = 880;
  const L = Math.log;
  const toPlane = (F1, F2) => [(L(F2_HI) - L(F2)) / (L(F2_HI) - L(F2_LO)), (L(F1) - L(F1_LO)) / (L(F1_HI) - L(F1_LO))];
  const fromPlane = (x, y) => [Math.exp(L(F1_LO) + y * (L(F1_HI) - L(F1_LO))), Math.exp(L(F2_HI) - x * (L(F2_HI) - L(F2_LO)))];
  const VPOS = Object.fromEntries(Object.entries(VOWELS).map(([k, v]) => [k, toPlane(v.F[0], v.F[1])]));

  function idw(x, y) {
    let sw = 0;
    const w = {};
    for (const k of VOWEL_ORDER) {
      const [vx, vy] = VPOS[k];
      const d2 = (x - vx) ** 2 + (y - vy) ** 2;
      w[k] = 1 / (d2 * d2 + 1e-5);
      sw += w[k];
    }
    for (const k in w) w[k] /= sw;
    return w;
  }
  function vowelAt(F1, F2) {
    const [x, y] = toPlane(F1, F2);
    const w = idw(x, y);
    const F = [F1, F2, 0, 0], A = [0, 0, 0, 0];
    const art = { bx: 0, by: 0, jaw: 0, round: 0 };
    for (const k in w) {
      const v = VOWELS[k], a = ART[k];
      F[2] += v.F[2] * w[k]; F[3] += v.F[3] * w[k];
      for (let i = 0; i < 4; i++) A[i] += v.A[i] * w[k];
      art.bx += a.bx * w[k]; art.by += a.by * w[k]; art.jaw += a.jaw * w[k]; art.round += a.round * w[k];
    }
    return { F, A, art };
  }
  function nearestVowel(F1, F2) {
    const [x, y] = toPlane(F1, F2);
    let best = 'а', bd = Infinity;
    for (const k of VOWEL_ORDER) {
      const d = (x - VPOS[k][0]) ** 2 + (y - VPOS[k][1]) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return { v: best, d: Math.sqrt(bd) };
  }

  // ---------- Кадры параметров ----------
  function frame(F, A, extra) {
    return Object.assign({ F: F.slice(), A: A.slice(), AV: 1, AH: 0.02, AF: 0, FF: 3000, QF: 1, AN: 0, NF: 12000, F0: baseF0 }, extra || {});
  }
  const silenceLike = (p) => Object.assign({}, p, { AV: 0, AH: 0, AF: 0, AN: 0 });

  // ---------- Текст → фонемы ----------
  function phonemize(text) {
    const tokens = [];
    const parts = text.toLowerCase().replace(/́/g, '+').split(/([\s,.!?;:—–-]+)/);
    for (const part of parts) {
      if (!part) continue;
      if (/^[\s,.!?;:—–-]+$/.test(part)) {
        tokens.push({ pause: /[,.!?;:—–]/.test(part) ? 0.26 : 0.1 });
        continue;
      }
      const word = [];
      let stressNext = false, hasStress = part.includes('+');
      let prev = '';
      for (const ch of part) {
        if (ch === '+') { stressNext = true; continue; }
        if (ch === 'ь' || ch === 'ъ') { prev = ch; continue; }
        if (IOTATED[ch]) {
          if (!prev || 'аоуыэиеёюяьъ'.includes(prev)) word.push({ ph: 'й' });
          word.push({ ph: IOTATED[ch], v: true, stress: stressNext, iot: true, soft: !(!prev || 'аоуыэиеёюяьъ'.includes(prev)) });
          stressNext = false;
        } else if (VOWELS[ch]) {
          word.push({ ph: ch, v: true, stress: stressNext });
          stressNext = false;
        } else if (CONS[ch]) {
          word.push({ ph: ch });
        }
        prev = ch;
      }
      // редукция безударных при известном ударении: о → а, «е/я» после согласной → и
      if (hasStress) {
        for (const t of word) {
          if (!t.v || t.stress) continue;
          if (t.ph === 'о') t.ph = 'а';
          else if (t.soft && (t.ph === 'э' || t.ph === 'а')) t.ph = 'и';
        }
      } else {
        // без пометок: ударной считаем первую гласную односложного слова
        const vs = word.filter((t) => t.v);
        if (vs.length === 1) vs[0].stress = true;
      }
      // оглушение перед глухими и на конце слова
      for (let i = word.length - 1; i >= 0; i--) {
        const t = word[i];
        if (!DEVOICE[t.ph]) continue;
        const next = word[i + 1];
        if (!next || (!next.v && VOICELESS.has(next.ph))) t.ph = DEVOICE[t.ph];
      }
      tokens.push(...word);
    }
    return tokens;
  }

  // ---------- Фонемы → расписание кадров ----------
  function plan(tokens) {
    const frames = [];
    const vIdx = tokens.map((t, i) => (t.v ? i : -1)).filter((i) => i >= 0);
    const lastV = vIdx[vIdx.length - 1];
    let est = 0;
    for (const t of tokens) est += t.pause || (t.v ? (t.stress ? 0.2 : 0.12) : 0.08);
    const nextVowel = (i) => {
      for (let j = i + 1; j < tokens.length; j++) { if (tokens[j].v) return tokens[j].ph; if (tokens[j].pause) break; }
      for (let j = i - 1; j >= 0; j--) if (tokens[j].v) return tokens[j].ph;
      return 'а';
    };
    let t = 0;
    let lastP = frame(VOWELS['а'].F, VOWELS['а'].A, { AV: 0 });
    const f0At = (tt, stressed, own) => own || baseF0 * (1.1 - 0.22 * Math.min(1, tt / Math.max(0.3, est))) * (stressed ? 1.13 : 1);
    const push = (p, tau, label, art) => { frames.push({ t, p, tau, label, art }); lastP = p; };

    tokens.forEach((tk, i) => {
      if (tk.pause) { push(silenceLike(lastP), 0.03, '', null); t += tk.pause; return; }
      if (tk.v) {
        const V = VOWELS[tk.ph];
        let dur = tk.dur || (tk.stress ? 0.2 : 0.12);
        if (i === lastV && !tk.dur) dur *= 1.4;
        const p = frame(V.F, V.A, { F0: f0At(t, tk.stress, tk.f0) });
        push(p, tk.f0 ? 0.035 : 0.03, tk.ph, ART[tk.ph]);
        if (i === lastV && !tk.f0) {
          const tt = t;
          t += dur * 0.55;
          push(Object.assign({}, p, { F0: p.F0 * 0.86 }), 0.09, tk.ph, ART[tk.ph]);
          t = tt;
        }
        t += dur;
        return;
      }
      const C = CONS[tk.ph];
      const nvKey = nextVowel(i);
      const nv = VOWELS[nvKey];
      const art = Object.assign({}, ART[nvKey], C.art);
      const F0 = f0At(t, false, tk.f0);
      switch (C.kind) {
        case 'nasal':
          push(frame(C.F, C.A, { AV: 0.55, AN: 0.9, NF: C.NF, F0 }), 0.015, tk.ph, art); t += C.dur; break;
        case 'lat':
        case 'glide':
          push(frame(C.F, C.A, { AV: 0.7, F0 }), 0.02, tk.ph, art); t += C.dur; break;
        case 'trill':
          for (let k = 0; k < 3; k++) {
            push(frame(C.F, C.A, { AV: 0.65, F0 }), 0.004, tk.ph, art); t += 0.018;
            push(frame(C.F, C.A, { AV: 0.12, F0 }), 0.004, tk.ph, art); t += 0.012;
          }
          break;
        case 'fric':
          push(frame(nv.F, nv.A, { AV: 0, AH: 0, AF: C.AF, FF: C.FF, QF: C.QF, F0 }), 0.012, tk.ph, art); t += C.dur; break;
        case 'vfric':
          push(frame(C.F, C.A, { AV: 0.35, AF: C.AF, FF: C.FF, QF: C.QF, F0 }), 0.015, tk.ph, art); t += C.dur; break;
        default: {
          const voiced = C.kind === 'vstop';
          push(frame([200, nv.F[1], nv.F[2], nv.F[3]], [1, 0.02, 0.01, 0.01], { AV: voiced ? 0.16 : 0, AH: 0, F0 }), 0.01, tk.ph, art);
          t += voiced ? 0.05 : 0.065;
          push(frame(nv.F, nv.A, { AV: 0, AH: 0, AF: C.AB, FF: C.burst, QF: C.QB, F0 }), 0.002, tk.ph, art);
          t += 0.014;
          if (C.kind === 'affric') {
            push(frame(nv.F, nv.A, { AV: 0, AH: 0, AF: C.AF, FF: C.FF, QF: C.QF, F0 }), 0.008, tk.ph, art); t += 0.075;
          } else if (C.kind === 'stop') {
            push(frame(nv.F, nv.A, { AV: 0, AH: 0.28, F0 }), 0.006, tk.ph, art); t += C.asp;
          }
        }
      }
    });
    push(silenceLike(lastP), 0.035, '', null);
    t += 0.12;
    return { frames, dur: t };
  }

  // ---------- Звуковой движок ----------
  function buildEngine(ac, destination) {
    const N = 80;
    const real = new Float32Array(N), imag = new Float32Array(N);
    for (let k = 1; k < N; k++) imag[k] = -Math.pow(k, -1.35);
    const wave = ac.createPeriodicWave(real, imag);
    const osc = ac.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = baseF0;
    const vib = ac.createOscillator();
    vib.frequency.value = 5.2;
    const vibG = ac.createGain();
    vibG.gain.value = 1.1;
    vib.connect(vibG).connect(osc.frequency);

    const noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const noise = ac.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    const av = ac.createGain(); av.gain.value = 0;
    const ah = ac.createGain(); ah.gain.value = 0;
    osc.connect(av);
    noise.connect(ah);
    const src = ac.createGain();
    av.connect(src);
    ah.connect(src);

    const mix = ac.createGain();
    const formants = [0, 1, 2, 3].map((i) => {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = VOWELS['а'].F[i];
      bp.Q.value = VOWELS['а'].F[i] / BW[i];
      const g = ac.createGain();
      g.gain.value = 0;
      src.connect(bp).connect(g).connect(mix);
      return { bp, g };
    });
    const nasal = ac.createBiquadFilter();
    nasal.type = 'bandpass'; nasal.frequency.value = 270; nasal.Q.value = 4;
    const an = ac.createGain(); an.gain.value = 0;
    av.connect(nasal).connect(an).connect(mix);
    const notch = ac.createBiquadFilter();
    notch.type = 'notch'; notch.frequency.value = 12000; notch.Q.value = 3;
    mix.connect(notch);

    const fric = ac.createBiquadFilter();
    fric.type = 'bandpass'; fric.frequency.value = 3000; fric.Q.value = 1;
    const af = ac.createGain(); af.gain.value = 0;
    noise.connect(fric).connect(af);

    const out = ac.createGain();
    out.gain.value = 1.6;
    notch.connect(out);
    af.connect(out);
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.15;
    const master = ac.createGain();
    master.gain.value = 0.8;
    out.connect(comp).connect(master).connect(destination);

    osc.start(); vib.start(); noise.start();

    const params = () => [osc.frequency, av.gain, ah.gain, an.gain, notch.frequency, af.gain, fric.frequency, fric.Q,
      ...formants.flatMap((f) => [f.bp.frequency, f.bp.Q, f.g.gain])];
    return {
      master,
      apply(p, t, tau) {
        const set = (param, v, k = tau) => param.setTargetAtTime(v, t, Math.max(0.001, k));
        const w = whisper;
        set(av.gain, w ? 0 : p.AV);
        set(ah.gain, w ? Math.max(p.AV * 0.9, p.AH) : p.AH);
        set(an.gain, w ? 0 : p.AN);
        set(notch.frequency, p.NF === 12000 ? 12000 : p.NF * scale);
        set(af.gain, p.AF);
        set(fric.frequency, Math.min(9000, p.FF * scale));
        set(fric.Q, p.QF);
        set(osc.frequency, p.F0, Math.max(tau, 0.03));
        for (let i = 0; i < 4; i++) {
          const f = Math.min(ac.sampleRate / 2.4, p.F[i] * scale);
          set(formants[i].bp.frequency, f);
          set(formants[i].bp.Q, f / (BW[i] * (scale > 1 ? 1.1 : 1)));
          set(formants[i].g.gain, SIGN[i] * p.A[i]);
        }
      },
      hold(t) {
        for (const p of params()) {
          if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
          else { p.cancelScheduledValues(t); }
        }
      },
    };
  }

  let ctx = null, engine = null, analyser = null, soundOn = true;
  function ensureAudio() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.connect(ctx.destination);
    engine = buildEngine(ctx, analyser);
    engine.master.gain.value = soundOn ? 0.8 : 0;
    el.note.classList.add('gone');
    return true;
  }

  // ---------- Состояние и расписание для визуализации ----------
  let mode = 'idle';            // idle | plane | key | speech
  let lastInput = -1e9;
  let timeline = [], timelineEnd = 0;
  const vis = {
    F: VOWELS['а'].F.slice(), A: VOWELS['а'].A.slice(), AV: 0, AH: 0, AF: 0, FF: 3000, QF: 1, AN: 0, F0: baseF0,
    art: { bx: 150, by: 172, jaw: 1, round: 0, lips: 0, tip: 0, back: 0, velum: 0, front: 0 },
    label: 'а',
  };
  let target = { p: frame(VOWELS['а'].F, VOWELS['а'].A, { AV: 0 }), tau: 0.08, art: Object.assign({ lips: 0, tip: 0, back: 0, velum: 0, front: 0 }, ART['а']), label: 'а' };
  let stylus = toPlane(700, 1220);
  const trail = [];

  function now() { return performance.now() / 1000; }
  function touch() { lastInput = now(); }

  function speakTokens(tokens) {
    if (!ensureAudio()) return;
    const pl = plan(tokens);
    const t0 = ctx.currentTime + 0.06;
    engine.hold(ctx.currentTime + 0.02);
    for (const f of pl.frames) engine.apply(f.p, t0 + f.t, f.tau);
    timeline = pl.frames.map((f) => Object.assign({}, f, { at: t0 + f.t }));
    timelineEnd = t0 + pl.dur;
    mode = 'speech';
    touch();
  }
  function speakText(text) { speakTokens(phonemize(text)); }

  function sustain(p, art, label) {
    target = { p, tau: 0.02, art: Object.assign({ lips: 0, tip: 0, back: 0, velum: 0, front: 0 }, art), label };
    if (!ensureAudio()) return;
    engine.hold(ctx.currentTime);
    engine.apply(p, ctx.currentTime, 0.02);
  }
  function release() {
    if (ctx && engine) {
      engine.hold(ctx.currentTime);
      engine.apply(silenceLike(target.p), ctx.currentTime, 0.04);
    }
    target = Object.assign({}, target, { p: silenceLike(target.p), tau: 0.06 });
    mode = 'idle-wait';
    touch();
  }

  // ---------- Плоскость гласных: рисование и ввод ----------
  const pctx = el.plane.getContext('2d');
  const PAD = { l: 64, r: 30, t: 42, b: 46 };
  let planeW = 0, planeH = 0, dpr = 1;
  function sizePlane() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    planeW = el.plane.clientWidth; planeH = el.plane.clientHeight;
    el.plane.width = Math.round(planeW * dpr);
    el.plane.height = Math.round(planeH * dpr);
    const narrow = planeW < 500;
    PAD.l = narrow ? 46 : 64; PAD.r = narrow ? 18 : 30; PAD.t = narrow ? 34 : 42; PAD.b = narrow ? 44 : 46;
  }
  const px = (x) => PAD.l + x * (planeW - PAD.l - PAD.r);
  const py = (y) => PAD.t + y * (planeH - PAD.t - PAD.b);

  function drawPlane(t) {
    const g = pctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, planeW, planeH);
    // сетка
    g.lineWidth = 1;
    g.font = '500 12px Jura, monospace';
    g.textBaseline = 'middle';
    const narrow = planeW < 500;
    const f2Ticks = narrow ? [2500, 1500, 1000, 600] : [2500, 2000, 1500, 1200, 1000, 800, 600];
    const f1Ticks = narrow ? [200, 400, 600, 800] : [200, 300, 400, 500, 600, 700, 800];
    g.strokeStyle = 'rgba(255, 181, 74, .10)';
    g.fillStyle = 'rgba(255, 213, 150, .72)';
    g.textAlign = 'center';
    for (const f of f2Ticks) {
      const x = px(toPlane(500, f)[0]);
      g.beginPath(); g.moveTo(x + 0.5, PAD.t); g.lineTo(x + 0.5, planeH - PAD.b); g.stroke();
      g.fillText(String(Math.round(f * scale)), x, PAD.t - 14);
    }
    g.textAlign = 'right';
    for (const f of f1Ticks) {
      const y = py(toPlane(f, 1000)[1]);
      g.beginPath(); g.moveTo(PAD.l, y + 0.5); g.lineTo(planeW - PAD.r, y + 0.5); g.stroke();
      g.fillText(String(Math.round(f * scale)), PAD.l - 10, y);
    }
    if (!narrow) {
      g.textAlign = 'left';
      g.fillStyle = 'rgba(255, 213, 150, .62)';
      g.fillText('F2, Гц', PAD.l, PAD.t - 30);
      g.save();
      g.translate(PAD.l - 46, planeH - PAD.b);
      g.rotate(-Math.PI / 2);
      g.fillText('F1, Гц', 0, 0);
      g.restore();
    }

    // многоугольник гласных
    const ring = ['и', 'э', 'а', 'о', 'у', 'ы'];
    g.beginPath();
    ring.forEach((k, i) => { const [x, y] = VPOS[k]; if (i) g.lineTo(px(x), py(y)); else g.moveTo(px(x), py(y)); });
    g.closePath();
    g.setLineDash([3, 6]);
    g.strokeStyle = 'rgba(255, 181, 74, .32)';
    g.stroke();
    g.setLineDash([]);

    // след и перо
    const cur = nearestVowel(vis.F[0], vis.F[1]);
    for (const k of VOWEL_ORDER) {
      const [x, y] = VPOS[k];
      const near = k === cur.v ? Math.max(0, 1 - cur.d / 0.22) : 0;
      g.font = `400 ${planeW < 500 ? 34 : 46}px "Poiret One", serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(255, 170, 60, ' + (0.25 + near * 0.6) + ')';
      g.shadowBlur = 8 + near * 22;
      g.fillStyle = `rgba(255, ${200 + near * 40}, ${140 + near * 60}, ${0.55 + near * 0.45})`;
      g.fillText(k, px(x), py(y) - 2);
    }
    g.shadowBlur = 0;
    if (trail.length > 1) {
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i], b = trail[i - 1];
        const age = t - a[2];
        g.strokeStyle = `rgba(255, 190, 90, ${Math.max(0, 0.55 - age * 0.4)})`;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(px(b[0]), py(b[1])); g.lineTo(px(a[0]), py(a[1])); g.stroke();
      }
    }
    const sx = px(stylus[0]), sy = py(stylus[1]);
    const glow = g.createRadialGradient(sx, sy, 0, sx, sy, 34);
    const lit = 0.35 + Math.min(1, vis.AV + vis.AH + vis.AF) * 0.65;
    glow.addColorStop(0, `rgba(255, 220, 150, ${0.9 * lit})`);
    glow.addColorStop(0.25, `rgba(255, 170, 70, ${0.45 * lit})`);
    glow.addColorStop(1, 'rgba(255, 140, 40, 0)');
    g.fillStyle = glow;
    g.beginPath(); g.arc(sx, sy, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff3dc';
    g.beginPath(); g.arc(sx, sy, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255, 243, 220, .8)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(sx, sy, 11 + Math.sin(t * 6) * 1.5 * lit, 0, Math.PI * 2); g.stroke();
  }

  function planeToXY(e) {
    const r = el.plane.getBoundingClientRect();
    const x = (e.clientX - r.left - PAD.l) / (r.width - PAD.l - PAD.r);
    const y = (e.clientY - r.top - PAD.t) / (r.height - PAD.t - PAD.b);
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
  }
  let planeDown = false;
  function planeSustain(x, y) {
    const [F1, F2] = fromPlane(x, y);
    const v = vowelAt(F1, F2);
    const p = frame(v.F, v.A, { AV: 1, F0: baseF0 });
    sustain(p, v.art, nearestVowel(F1, F2).v);
  }
  el.plane.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    planeDown = true;
    mode = 'plane';
    try { el.plane.setPointerCapture(e.pointerId); } catch (_) { /* не критично */ }
    const [x, y] = planeToXY(e);
    planeSustain(x, y);
    touch();
  });
  el.plane.addEventListener('pointermove', (e) => {
    if (!planeDown) return;
    const [x, y] = planeToXY(e);
    planeSustain(x, y);
    touch();
  });
  const planeUp = () => { if (!planeDown) return; planeDown = false; release(); };
  el.plane.addEventListener('pointerup', planeUp);
  el.plane.addEventListener('pointercancel', planeUp);

  // ---------- Речевой тракт ----------
  const NS = 'http://www.w3.org/2000/svg';
  el.tract.innerHTML = `
    <defs>
      <linearGradient id="tongueFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b5502e"/><stop offset="1" stop-color="#5a1f10"/>
      </linearGradient>
      <radialGradient id="cavity" cx=".45" cy=".45" r=".6">
        <stop offset="0" stop-color="#2a1a0c"/><stop offset="1" stop-color="#120c06"/>
      </radialGradient>
    </defs>
    <path d="M128 4 C 92 12, 70 40, 62 70 C 55 92, 38 106, 25 118 L 41 128 C 37 134, 35 141, 37 148 L 52 148 L 70 134 C 80 116, 108 106, 140 104 C 160 103, 176 106, 188 112 L 214 112 C 232 96, 246 60, 236 24 C 214 4, 170 -2, 128 4 Z" fill="#2a1d10"/>
    <path id="t-lowface" fill="#2a1d10"/>
    <path d="M58 112 C 72 92, 112 80, 150 80 C 186 80, 206 94, 214 112 L 188 112 C 176 106, 160 103, 140 104 C 108 106, 80 116, 70 134 Z" fill="#1a120a"/>
    <g fill="none" stroke="#caa65b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M128 4 C 92 12, 70 40, 62 70 C 55 92, 38 106, 25 118 L 41 128" opacity=".7"/>
      <path d="M58 112 C 72 92, 112 80, 150 80 C 186 80, 206 94, 214 112" opacity=".75"/>
      <path d="M70 134 C 80 116, 108 106, 140 104 C 160 103, 176 106, 188 112"/>
      <path d="M214 112 C 222 150, 222 200, 219 252"/>
      <path d="M200 262 L 200 296 M 222 258 L 222 296" opacity=".8"/>
      <path d="M66 132 L 64 146 L 71 146 L 73 134 Z" fill="#efe4cc" stroke-width="1"/>
    </g>
    <path id="t-velum" fill="none" stroke="#caa65b" stroke-width="1.6" stroke-linecap="round"/>
    <path id="t-ulip" fill="#3a2414" stroke="#caa65b" stroke-width="1.6" stroke-linejoin="round"/>
    <path id="t-jaw" fill="none" stroke="#caa65b" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
    <path id="t-llip" fill="#3a2414" stroke="#caa65b" stroke-width="1.6" stroke-linejoin="round"/>
    <path id="t-lteeth" fill="#efe4cc" stroke="#caa65b" stroke-width="1"/>
    <path id="t-tongue" fill="url(#tongueFill)" stroke="#e7c27a" stroke-width="1.6" stroke-linejoin="round"/>
    <g id="t-folds" stroke="#ffb54a" stroke-width="2" stroke-linecap="round">
      <line id="t-fold1" x1="201" y1="258" x2="209" y2="258"/>
      <line id="t-fold2" x1="221" y1="258" x2="213" y2="258"/>
    </g>
    <g id="t-waves" fill="none" stroke="#ffb54a" stroke-linecap="round"></g>
    <g id="t-noise" fill="#ffd79a"></g>`;
  const T = {
    velum: $('#t-velum'), ulip: $('#t-ulip'), llip: $('#t-llip'), jaw: $('#t-jaw'), lteeth: $('#t-lteeth'),
    tongue: $('#t-tongue'), fold1: $('#t-fold1'), fold2: $('#t-fold2'), waves: $('#t-waves'), noise: $('#t-noise'),
    lowface: $('#t-lowface'),
  };
  for (let i = 0; i < 3; i++) { const p = document.createElementNS(NS, 'path'); T.waves.appendChild(p); }
  for (let i = 0; i < 14; i++) { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', '1.1'); T.noise.appendChild(c); }
  const f1 = (v) => v.toFixed(1);

  function catmull(pts) {
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${f1(c1[0])} ${f1(c1[1])}, ${f1(c2[0])} ${f1(c2[1])}, ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d;
  }

  const tjTop = (jawD) => 150 + jawD;
  function drawTract(t) {
    const a = vis.art;
    const jawD = a.jaw * 17 * (1 - a.lips * 0.7);
    const pr = a.round * 9;
    // верхняя губа
    T.ulip.setAttribute('d', `M42 127 C 36 133, ${f1(34 - pr)} 141, ${f1(37 - pr)} 148 L 52 148 C 50 140, 48 133, 46 128 Z`);
    // нижняя губа и челюсть
    const openY = 152 + jawD + a.round * 1.5;
    const ly = openY + (149.5 - openY) * a.lips;
    T.llip.setAttribute('d', `M${f1(37 - pr)} ${f1(ly)} C ${f1(34 - pr)} ${f1(ly + 7)}, 42 ${f1(ly + 13)}, 55 ${f1(ly + 14)} L 58 ${f1(ly + 6)} C 52 ${f1(ly + 3)}, 48 ${f1(ly + 1)}, 50 ${f1(ly)} Z`);
    T.jaw.setAttribute('d', `M55 ${f1(ly + 14)} C 48 ${f1(ly + 30)}, 50 ${f1(200 + jawD)}, 62 ${f1(212 + jawD * 0.8)} C 90 ${f1(236 + jawD * 0.5)}, 120 250, 150 262`);
    // нижняя часть лица следует за челюстью; внутри — полость рта
    T.lowface.setAttribute('d', `M${f1(37 - pr)} ${f1(ly)} C ${f1(34 - pr)} ${f1(ly + 7)}, 42 ${f1(ly + 13)}, 55 ${f1(ly + 14)} C 48 ${f1(ly + 30)}, 50 ${f1(200 + jawD)}, 62 ${f1(212 + jawD * 0.8)} C 90 ${f1(236 + jawD * 0.5)}, 120 250, 150 262 L 200 296 L 200 262 C 196 250, 200 240, 202 232 C 190 244, 160 ${f1(226 + jawD * 0.6)}, 120 ${f1(208 + jawD * 0.8)} C 100 ${f1(196 + jawD)}, 88 ${f1(182 + jawD)}, 76 ${f1(168 + jawD)} L 66 ${f1(tjTop(jawD))} Z`);
    const tj = 150 + jawD;
    T.lteeth.setAttribute('d', `M64 ${f1(tj)} L 66 ${f1(tj + 13)} L 72 ${f1(tj + 13)} L 71 ${f1(tj)} Z`);
    // нёбная занавеска: опускается для носовых
    const vy = 140 + a.velum * 10, vx = 203 - a.velum * 6;
    T.velum.setAttribute('d', `M188 112 C 198 117, 204 127, ${f1(vx)} ${f1(vy)}`);
    // язык
    const tipRest = [80, 158 + jawD * 0.9];
    const tipUp = [77, 137];
    const tipX = tipRest[0] + (tipUp[0] - tipRest[0]) * a.tip;
    const tipY = tipRest[1] + (tipUp[1] - tipRest[1]) * a.tip;
    let bx = a.bx, by = a.by + jawD * 0.35;
    if (a.back > 0) { bx += (178 - bx) * a.back; by += (113 - by) * a.back; }
    if (a.front > 0) { bx += (116 - bx) * a.front; by += (116 - by) * a.front; }
    const blade = [tipX + 18, (tipY + by) / 2 - 4 * (1 - a.tip)];
    const back = [bx + 30, by + 26];
    const root = [202, 232];
    const upper = catmull([[tipX, tipY], blade, [bx, by], back, root]);
    const lower = ` C 190 244, 160 ${f1(226 + jawD * 0.6)}, 120 ${f1(208 + jawD * 0.8)} C 100 ${f1(196 + jawD)}, 88 ${f1(182 + jawD)}, ${f1(tipX)} ${f1(tipY + 2)} Z`;
    T.tongue.setAttribute('d', upper + lower);
    // голосовые складки
    const amp = (vis.AV > 0.05 ? vis.AV : 0) * 2.2;
    const vib = Math.sin(t * 90) * amp;
    T.fold1.setAttribute('y2', f1(258 + vib));
    T.fold2.setAttribute('y2', f1(258 - vib));
    // волны у губ
    const voiced = Math.min(1, vis.AV + vis.AH * 0.8 + vis.AN * 0.5);
    [...T.waves.children].forEach((p, i) => {
      const ph = ((t * 1.4 + i / 3) % 1);
      const r = 8 + ph * 26;
      const cx = 32 - pr, cy = 150 + jawD * 0.3;
      p.setAttribute('d', `M${f1(cx - r * 0.35)} ${f1(cy - r)} A ${f1(r)} ${f1(r)} 0 0 0 ${f1(cx - r * 0.35)} ${f1(cy + r)}`);
      p.setAttribute('stroke-width', '1.4');
      p.setAttribute('opacity', f1(voiced * (1 - ph) * 0.9));
    });
    // шум в месте сужения
    const fr = Math.min(1, vis.AF * 2.2);
    const nx = a.lips > 0.5 ? 44 - pr : a.back > 0.5 ? 170 : 72, ny = a.back > 0.5 ? 118 : 142;
    [...T.noise.children].forEach((c, i) => {
      const r = (i * 97.3 + t * 900) % 100 / 100;
      c.setAttribute('cx', f1(nx - r * 26 - (i % 3) * 3));
      c.setAttribute('cy', f1(ny + Math.sin(i * 12.9 + t * 40) * (5 + r * 7)));
      c.setAttribute('opacity', f1(fr * (1 - r)));
    });
  }

  // ---------- Спектр ----------
  const sctx = el.spec.getContext('2d');
  function bpMag(f, fc, q) { const r = f / fc - fc / f; return 1 / Math.sqrt(1 + q * q * r * r); }
  function envelope(f) {
    let s = 0;
    for (let i = 0; i < 4; i++) {
      const fc = vis.F[i] * scale;
      const m = vis.A[i] * bpMag(f, fc, fc / BW[i]);
      s += m * m;
    }
    if (vis.AN > 0.01) { const m = vis.AN * bpMag(f, 270 * scale, 4); s += m * m; }
    return Math.sqrt(s);
  }
  function drawSpec(t) {
    const d = Math.min(2, window.devicePixelRatio || 1);
    const w = el.spec.clientWidth, h = el.spec.clientHeight;
    if (el.spec.width !== Math.round(w * d)) { el.spec.width = Math.round(w * d); el.spec.height = Math.round(h * d); }
    const g = sctx;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, w, h);
    g.save();
    g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2); g.clip();
    const x0 = w * 0.14, x1 = w * 0.9, y0 = h * 0.2, y1 = h * 0.78;
    const FX = (f) => x0 + (f / 5000) * (x1 - x0);
    const dbY = (db) => y0 + (Math.min(0, Math.max(-60, db)) / -60) * (y1 - y0);
    // сетка
    g.strokeStyle = 'rgba(255, 181, 74, .1)';
    g.lineWidth = 1;
    for (let f = 1000; f < 5000; f += 1000) { g.beginPath(); g.moveTo(FX(f), y0 - 6); g.lineTo(FX(f), y1); g.stroke(); }
    for (let db = -20; db > -60; db -= 20) { g.beginPath(); g.moveTo(x0, dbY(db)); g.lineTo(x1, dbY(db)); g.stroke(); }
    // шумовая полоса
    if (vis.AF > 0.01 || vis.AH > 0.01) {
      g.beginPath();
      g.moveTo(FX(50), y1);
      for (let f = 50; f <= 5000; f += 25) {
        let m = vis.AF * bpMag(f, vis.FF * scale, vis.QF) * 1.6 + vis.AH * envelope(f) * 0.9;
        g.lineTo(FX(f), dbY(20 * Math.log10(m + 1e-4)));
      }
      g.lineTo(FX(5000), y1);
      g.closePath();
      g.fillStyle = 'rgba(255, 200, 120, .16)';
      g.fill();
    }
    // гармоники
    const f0 = vis.F0;
    const voiced = vis.AV;
    if (voiced > 0.02) {
      g.strokeStyle = 'rgba(255, 190, 90, .85)';
      g.lineWidth = 1.2;
      for (let k = 1; k * f0 < 5000; k++) {
        const f = k * f0;
        const m = voiced * Math.pow(k, -0.35) * envelope(f) * 1.8;
        const y = dbY(20 * Math.log10(m + 1e-5));
        if (y >= y1) continue;
        g.beginPath(); g.moveTo(FX(f), y1); g.lineTo(FX(f), y); g.stroke();
      }
    }
    // огибающая
    g.beginPath();
    for (let f = 40; f <= 5000; f += 20) {
      const y = dbY(20 * Math.log10(envelope(f) * 1.3 + 1e-4));
      if (f === 40) g.moveTo(FX(f), y); else g.lineTo(FX(f), y);
    }
    g.strokeStyle = '#ffd08a';
    g.lineWidth = 1.6;
    g.shadowColor = 'rgba(255, 170, 60, .6)';
    g.shadowBlur = 6;
    g.stroke();
    g.shadowBlur = 0;
    // подписи формант
    g.font = '600 12px Jura, monospace';
    g.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const f = vis.F[i] * scale;
      if (f > 5000) continue;
      const y = dbY(20 * Math.log10(envelope(f) * 1.3 + 1e-4)) - 10;
      g.fillStyle = 'rgba(255, 225, 170, .9)';
      g.fillText('F' + (i + 1), FX(f), Math.max(y0, y));
    }
    g.fillStyle = 'rgba(255, 213, 150, .65)';
    g.font = '500 12px Jura, monospace';
    g.fillText('0', FX(0) + 4, y1 + 14);
    g.fillText('5 кГц', FX(5000) - 14, y1 + 14);
    g.restore();
  }

  // ---------- Демонстрация без пользователя ----------
  const DEMO = ['а', 'э', 'и', 'ы', 'у', 'о', 'а'];
  function demoTarget(t) {
    const period = 2.4;
    const seg = Math.floor(t / period) % (DEMO.length - 1);
    const u = (t % period) / period;
    const e = u < 0.55 ? 0 : (1 - Math.cos((u - 0.55) / 0.45 * Math.PI)) / 2;
    const a = VPOS[DEMO[seg]], b = VPOS[DEMO[seg + 1]];
    return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
  }

  // ---------- Клавиши ----------
  el.vowelKeys.innerHTML = VOWEL_ORDER.map((v) => `<button type="button" class="key" data-ph="${v}" aria-label="Гласная ${v}">${v}</button>`).join('');
  el.consKeys.innerHTML = CONS_ORDER.map((c) => `<button type="button" class="key" data-ph="${c}" aria-label="Слог с ${c}">${c}</button>`).join('');
  const keyEls = {};
  document.querySelectorAll('.key').forEach((k) => { keyEls[k.dataset.ph] = k; });

  function pressVowel(v) {
    const V = VOWELS[v];
    mode = 'key';
    sustain(frame(V.F, V.A, { AV: 1, F0: baseF0 }), ART[v], v);
    keyEls[v] && keyEls[v].classList.add('down');
    touch();
  }
  function releaseVowel(v) {
    keyEls[v] && keyEls[v].classList.remove('down');
    if (mode === 'key') release();
  }
  function syllable(c) {
    const v = nearestVowel(vis.F[0], vis.F[1]).v;
    speakTokens([{ ph: c }, { ph: v, v: true, stress: true }]);
    const k = keyEls[c];
    if (k) { k.classList.add('down'); setTimeout(() => k.classList.remove('down'), 160); }
  }
  document.querySelectorAll('.vowels .key').forEach((k) => {
    k.addEventListener('pointerdown', (e) => { e.preventDefault(); pressVowel(k.dataset.ph); });
    k.addEventListener('pointerup', () => releaseVowel(k.dataset.ph));
    k.addEventListener('pointerleave', () => { if (k.classList.contains('down')) releaseVowel(k.dataset.ph); });
    k.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); pressVowel(k.dataset.ph); } });
    k.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') releaseVowel(k.dataset.ph); });
  });
  document.querySelectorAll('.consonants .key').forEach((k) => {
    k.addEventListener('click', () => syllable(k.dataset.ph));
  });

  const CODE_TO_RU = {
    KeyQ: 'й', KeyW: 'ц', KeyE: 'у', KeyR: 'к', KeyT: 'е', KeyY: 'н', KeyU: 'г', KeyI: 'ш', KeyO: 'щ', KeyP: 'з', BracketLeft: 'х',
    KeyA: 'ф', KeyS: 'ы', KeyD: 'в', KeyF: 'а', KeyG: 'п', KeyH: 'р', KeyJ: 'о', KeyK: 'л', KeyL: 'д', Semicolon: 'ж', Quote: 'э',
    KeyZ: 'я', KeyX: 'ч', KeyC: 'с', KeyV: 'м', KeyB: 'и', KeyN: 'т', Comma: 'б', Period: 'ю', Backquote: 'ё',
  };
  const held = new Set();
  window.addEventListener('keydown', (e) => {
    if (e.target === el.say || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.target && e.target.classList && e.target.classList.contains('key') && (e.key === 'Enter' || e.key === ' ')) return;
    let ch = (e.key || '').toLowerCase();
    if (!/^[а-яё]$/.test(ch)) ch = CODE_TO_RU[e.code] || '';
    if (!ch) return;
    const v = IOTATED[ch] || ch;
    if (VOWELS[v]) { e.preventDefault(); held.add(e.code); pressVowel(v); }
    else if (CONS[ch]) { e.preventDefault(); syllable(ch); }
  });
  window.addEventListener('keyup', (e) => {
    if (!held.has(e.code)) return;
    held.delete(e.code);
    let ch = (e.key || '').toLowerCase();
    if (!/^[а-яё]$/.test(ch)) ch = CODE_TO_RU[e.code] || '';
    releaseVowel(IOTATED[ch] || ch);
  });

  // ---------- Слова и фразы ----------
  const WORDS = [
    ['Ау', 'а+у'], ['Мама', 'м+ама'], ['Мир', 'м+ир'], ['Луна', 'лун+а'], ['Ура', 'ур+а'],
    ['Привет', 'прив+ет'], ['Спасибо', 'спас+ибо'], ['Машина', 'маш+ина'], ['Здравствуйте', 'здр+аствуйтэ'],
    ['Я говорящая машина', 'я гавар+ящая маш+ина'],
  ];
  el.words.innerHTML = WORDS.map(([label, ph], i) => `<button type="button" class="word" data-i="${i}">${label}</button>`).join('');
  el.words.addEventListener('click', (e) => {
    const b = e.target.closest('.word');
    if (!b) return;
    el.words.querySelectorAll('.word').forEach((w) => w.classList.remove('speaking'));
    b.classList.add('speaking');
    speakText(WORDS[+b.dataset.i][1]);
    const toks = phonemize(WORDS[+b.dataset.i][1]);
    setTimeout(() => b.classList.remove('speaking'), plan(toks).dur * 1000 + 100);
  });
  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = el.say.value.trim() || 'привет';
    speakText(text);
  });

  // ---------- Голос, высота, шёпот, гамма ----------
  function syncFill(inp) { inp.style.setProperty('--fill', ((inp.value - inp.min) / (inp.max - inp.min)) * 100 + '%'); }
  el.voiceSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    voice = b.dataset.v;
    scale = VOICES[voice].scale;
    baseF0 = VOICES[voice].f0;
    el.pitch.value = baseF0;
    syncFill(el.pitch);
    el.voiceSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    speakText(voice === 'male' ? 'прив+ет' : voice === 'female' ? 'здр+аствуйтэ' : 'ур+а');
  });
  el.pitch.addEventListener('input', () => {
    baseF0 = +el.pitch.value;
    syncFill(el.pitch);
    if ((mode === 'plane' || mode === 'key') && engine) {
      target.p.F0 = baseF0;
      engine.apply(target.p, ctx.currentTime, 0.03);
    }
  });
  syncFill(el.pitch);
  el.mute.addEventListener('click', () => {
    soundOn = !soundOn;
    el.mute.setAttribute('aria-pressed', String(soundOn));
    el.mute.setAttribute('aria-label', soundOn ? 'Звук включён' : 'Звук выключен');
    el.mute.textContent = soundOn ? 'Звук' : 'Без звука';
    if (engine) engine.master.gain.setTargetAtTime(soundOn ? 0.8 : 0, ctx.currentTime, 0.03);
  });
  el.whisper.addEventListener('click', () => {
    whisper = !whisper;
    el.whisper.setAttribute('aria-pressed', String(whisper));
    speakText(whisper ? 'ш+ёпат' : 'г+олас');
  });
  el.sing.addEventListener('click', () => {
    const notes = [['д', 'о', 0], ['р', 'э', 2], ['м', 'и', 4], ['ф', 'а', 5], ['с', 'о', 7], ['л', 'а', 9], ['с', 'и', 11], ['д', 'о', 12]];
    const tokens = [];
    const root = baseF0 * 1.05;
    for (const [c, v, semi] of notes) {
      const f0 = root * Math.pow(2, semi / 12);
      tokens.push({ ph: c, f0 });
      if (c === 'с' && v === 'о') tokens.push({ ph: v, v: true, stress: true, f0, dur: 0.34 }, { ph: 'л', f0 });
      else tokens.push({ ph: v, v: true, stress: true, f0, dur: 0.34 });
    }
    speakTokens(tokens);
  });

  // ---------- Солнечные лучи шапки ----------
  (function rays() {
    let s = '';
    const cx = 600, cy = 250;
    for (let i = 0; i <= 36; i++) {
      const a = Math.PI + (i / 36) * Math.PI;
      const r0 = 60, r1 = 620;
      const op = i % 2 ? 0.07 : 0.16;
      s += `<line x1="${cx + Math.cos(a) * r0}" y1="${cy + Math.sin(a) * r0}" x2="${cx + Math.cos(a) * r1}" y2="${cy + Math.sin(a) * r1}" stroke="#caa65b" stroke-opacity="${op}" stroke-width="${i % 2 ? 1 : 1.5}"/>`;
    }
    s += `<path d="M 480 250 A 120 120 0 0 1 720 250" fill="none" stroke="#caa65b" stroke-opacity=".3"/>`;
    s += `<path d="M 420 250 A 180 180 0 0 1 780 250" fill="none" stroke="#caa65b" stroke-opacity=".16"/>`;
    el.rays.innerHTML = s;
  })();

  // ---------- Главный цикл ----------
  let lastT = now();
  function step() {
    requestAnimationFrame(step);
    const t = now();
    const dt = Math.min(0.05, t - lastT);
    lastT = t;
    if (document.hidden) return;

    // откуда берётся цель
    if (mode === 'speech' && ctx) {
      const at = ctx.currentTime;
      let cur = null;
      for (const f of timeline) { if (f.at <= at) cur = f; else break; }
      if (cur) {
        target = {
          p: cur.p, tau: cur.tau,
          art: Object.assign({ lips: 0, tip: 0, back: 0, velum: 0, front: 0 }, cur.art || target.art),
          label: cur.label || target.label,
        };
        for (const k of Object.keys(keyEls)) keyEls[k].classList.toggle('down', k === cur.label && cur.p.AV + cur.p.AF + cur.p.AH > 0.05);
      }
      if (at > timelineEnd) { mode = 'idle-wait'; for (const k of Object.keys(keyEls)) keyEls[k].classList.remove('down'); }
    }
    if ((mode === 'idle' || mode === 'idle-wait') && t - lastInput > 5) mode = 'idle';
    if (mode === 'idle') {
      const [x, y] = demoTarget(t);
      const [F1, F2] = fromPlane(x, y);
      const v = vowelAt(F1, F2);
      target = { p: frame(v.F, v.A, { AV: 0.55, F0: baseF0 }), tau: 0.12, art: Object.assign({ lips: 0, tip: 0, back: 0, velum: 0, front: 0 }, v.art), label: nearestVowel(F1, F2).v };
    }

    // сглаживание к цели — как у мышц
    const k = 1 - Math.exp(-dt / Math.max(0.004, target.tau));
    const p = target.p;
    for (let i = 0; i < 4; i++) { vis.F[i] += (p.F[i] - vis.F[i]) * k; vis.A[i] += (p.A[i] - vis.A[i]) * k; }
    for (const key of ['AV', 'AH', 'AF', 'FF', 'QF', 'AN', 'F0']) vis[key] += (p[key] - vis[key]) * k;
    const ka = 1 - Math.exp(-dt / Math.max(0.02, target.tau * 1.4));
    for (const key of Object.keys(vis.art)) vis.art[key] += ((target.art[key] ?? 0) - vis.art[key]) * ka;
    vis.label = target.label;

    // перо на плоскости следует за формантами
    const sp = toPlane(Math.max(F1_LO, Math.min(F1_HI, vis.F[0])), Math.max(F2_LO, Math.min(F2_HI, vis.F[1])));
    stylus = sp;
    trail.push([sp[0], sp[1], t]);
    while (trail.length && t - trail[0][2] > 1.4) trail.shift();

    el.f1.textContent = Math.round(vis.F[0] * scale);
    el.f2.textContent = Math.round(vis.F[1] * scale);
    el.f0.textContent = Math.round(vis.F0);
    el.tractLabel.textContent = vis.label ? `[${vis.label}]` : '[ ]';

    drawPlane(t);
    drawTract(t);
    drawSpec(t);
  }

  // ---------- Проверка звука в режиме съёмки (без динамиков: считаем спектр офлайн) ----------
  if (window.__SHOT__) {
    window.__talkTest = async () => {
      const sr = 32000;
      const oac = new OfflineAudioContext(1, sr * 1.6, sr);
      const eng = buildEngine(oac, oac.destination);
      const pl = plan(phonemize('м+ама'));
      for (const f of pl.frames) eng.apply(f.p, 0.05 + f.t, f.tau);
      const buf = await oac.startRendering();
      const x = buf.getChannelData(0);
      let peak = 0, sum = 0;
      for (let i = 0; i < x.length; i++) { peak = Math.max(peak, Math.abs(x[i])); sum += x[i] * x[i]; }
      // спектр ударной «а»: окно 4096 отсчётов в её середине
      const aFrame = pl.frames.find((f) => f.label === 'а' && f.p.AV > 0.9);
      const start = Math.floor((0.05 + aFrame.t + 0.07) * sr);
      const n = 4096;
      const mags = [];
      for (let bin = 4; bin < 450; bin++) {
        let re = 0, im = 0;
        for (let i = 0; i < n; i++) {
          const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n);
          const v = x[start + i] * w;
          const ph = 2 * Math.PI * bin * i / n;
          re += v * Math.cos(ph); im -= v * Math.sin(ph);
        }
        mags.push([bin * sr / n, Math.hypot(re, im)]);
      }
      // сглаженная огибающая: максимум в окне ±150 Гц, затем локальные пики
      const env = mags.map(([f], i) => [f, Math.max(...mags.slice(Math.max(0, i - 19), i + 20).map((m) => m[1]))]);
      const peaks = env.filter((m, i) => i > 0 && i < env.length - 1 && m[1] >= env[i - 1][1] && m[1] > env[i + 1][1]);
      const top = peaks.sort((a, b) => b[1] - a[1]).slice(0, 4).map((m) => Math.round(m[0])).sort((a, b) => a - b);
      return { rms: +Math.sqrt(sum / x.length).toFixed(4), peak: +peak.toFixed(3), strongestEnvelopePeaksHz: top, duration: +pl.dur.toFixed(2) };
    };
  }

  sizePlane();
  window.addEventListener('resize', sizePlane);
  requestAnimationFrame(step);
})();
