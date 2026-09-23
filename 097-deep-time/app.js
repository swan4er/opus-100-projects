/* 097 · 13,8 миллиарда лет — шкала глубокого времени.
   Три взгляда на одну историю:
   · спираль — логарифмическая: каждый виток в десять раз глубже в прошлое;
   · линейка — честный линейный масштаб с зумом от миллиардов лет до десятилетий;
   · календарь — «космический календарь» Карла Сагана: вся история как один год. */
(function () {
  'use strict';

  const D = window.DT;
  if (!D) return;

  /* ================= константы ================= */
  const TAU = Math.PI * 2;
  const T_BB = D.T_BB * 1e6;              // возраст Вселенной, лет
  const U_BB = Math.log10(T_BB);          // ≈ 10,139
  const T_SUN = D.SUN * 1e6;
  const U_SUN = Math.log10(T_SUN);
  const YEAR_S = 365 * 86400;             // секунд в «космическом годе»
  const YPS = T_BB / YEAR_S;              // лет в одной секунде календаря (≈ 437)
  const SHOT = !!window.__SHOT__;
  const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const SANS = 'Commissioner, "Segoe UI", system-ui, -apple-system, sans-serif';
  const MONO = '"Geist Mono", ui-monospace, Menlo, Consolas, monospace';
  const SERIF = '"Noto Serif Display", Georgia, serif';
  const INK = '#eee6d6';
  const GROUT = 'rgba(13,12,10,0.62)';     // тонкие тёмные линии между ячейками, как на таблице ICS

  // радиальные доли витка спирали: рельс событий, эон, эра, период, эпоха
  const RAIL = 0.2;
  const TIER = [[0.2, 0.29], [0.29, 0.425], [0.425, 0.755], [0.755, 1]];

  /* ================= утилиты ================= */
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgbStr = (c, a) => (a === undefined ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);
  function relLum(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  const L_DARK = relLum([24, 20, 15]), L_LIGHT = relLum([255, 251, 243]);
  const inkCache = {};
  // тёмный или светлый текст — что контрастнее на этом цвете
  function inkFor(col) {
    if (inkCache[col]) return inkCache[col];
    const c = col[0] === '#' ? rgbOf(col) : col.match(/\d+/g).map(Number);
    const L = relLum(c);
    const dark = (L + 0.05) / (L_DARK + 0.05) >= (L_LIGHT + 0.05) / (L + 0.05);
    return (inkCache[col] = dark ? 'rgba(24,20,15,0.9)' : 'rgba(255,251,243,0.96)');
  }

  // русская типографика: неразрывные пробелы после коротких слов, между числом и единицей, перед тире
  const SHORTW = 'в|к|с|и|а|о|у|я|но|на|по|за|от|до|из|не|ни|об|во|со|ко|же|ли|бы|для|при|без|над|под|про|или|что|как|это|их|его|её';
  const reShort = new RegExp('(^|[\\s«(„—–])(' + SHORTW + ')\\s', 'gi');
  function typo(s) {
    if (!s) return '';
    let t = String(s).replace(reShort, '$1$2\u00A0').replace(reShort, '$1$2\u00A0');
    t = t.replace(/(\d)\s(?=\d{3}(?!\d))/g, '$1\u00A0');
    t = t.replace(/(\d)\s(?=[а-яёА-ЯЁ%°«])/g, '$1\u00A0');
    t = t.replace(/≈\s/g, '≈\u00A0').replace(/\s±\s/g, '\u00A0±\u00A0');
    t = t.replace(/\s—/g, '\u00A0—').replace(/н\. э\./g, 'н.\u00A0э.').replace(/г\. до/g, 'г.\u00A0до');
    return t;
  }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const T = (s) => esc(typo(s));

  // число по-русски: десятичная запятая, пробелы в разрядах от 10 000
  function num(x, d, trim) {
    let s = x.toFixed(d);
    if (trim !== false && d > 0) s = s.replace(/\.?0+$/, '');
    let [i, f] = s.split('.');
    if (i.replace('-', '').length > 4) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
    return f ? i + ',' + f : i;
  }
  const sigDec = (v, sig) => Math.max(0, sig - 1 - Math.floor(Math.log10(Math.max(Math.abs(v), 1e-12))));
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
  }
  // «13,8 млрд», «538 млн», «11,7 тыс.», «250»
  function fmtY(y, sig) {
    sig = sig || 3;
    if (y >= 1e9) return num(y / 1e9, sigDec(y / 1e9, sig)) + ' млрд';
    if (y >= 1e6) return num(y / 1e6, sigDec(y / 1e6, sig)) + ' млн';
    if (y >= 1e4) return num(y / 1e3, sigDec(y / 1e3, sig)) + ' тыс.';
    return num(Math.round(y), 0);
  }
  function yearsWord(y) {
    if (y >= 1e4) return 'лет';
    return plural(Math.round(y), 'год', 'года', 'лет');
  }
  function fmtAgo(y, sig) { return fmtY(y, sig) + ' ' + yearsWord(y) + ' назад'; }
  // диапазон «1,4 млрд – 138 млн лет назад»
  function fmtSpanAgo(a, b) {
    const ua = a >= 1e9 ? 'млрд' : a >= 1e6 ? 'млн' : a >= 1e4 ? 'тыс.' : '';
    const ub = b >= 1e9 ? 'млрд' : b >= 1e6 ? 'млн' : b >= 1e4 ? 'тыс.' : '';
    const strip = (s) => s.replace(/\s(млрд|млн|тыс\.)$/, '');
    if (ua === ub) return strip(fmtY(a, 3)) + '–' + fmtY(b, 3) + ' ' + yearsWord(b) + ' назад';
    return fmtY(a, 3) + ' – ' + fmtY(b, 3) + ' ' + yearsWord(b) + ' назад';
  }

  /* ================= данные: производные ================= */
  const UNITS = D.units;
  const COSMOS = D.cosmos;
  UNITS.forEach((u) => {
    u.ua = u.b > 0 ? Math.log10(u.b * 1e6) : -Infinity;
    u.ub = Math.log10(u.a * 1e6);
    u.wa = TIER[u.rank][0];
    u.wb = u.children.length ? TIER[u.rank][1] : 1;
  });
  Object.assign(COSMOS, { ua: U_SUN, ub: U_BB, wa: TIER[0][0], wb: 1, rank: 0, children: [] });
  const EVENTS = D.events;
  EVENTS.forEach((e) => { e.u = Math.log10(Math.max(e.ya, 0.5)); });
  const EV_BY_PRIO = EVENTS.slice().sort((a, b) => a.p - b.p || b.ya - a.ya);

  // единица самого мелкого ранга ≤ maxRank, содержащая момент ya
  function unitAt(ya, maxRank) {
    if (ya > T_SUN) return COSMOS;
    const ma = ya / 1e6;
    let best = null;
    for (const u of UNITS) {
      if (u.rank <= maxRank && ma <= u.a && ma > u.b - 1e-12 && (!best || u.rank > best.rank)) best = u;
    }
    return best || UNITS[3];
  }
  // границы для заданного ранга (по убыванию возраста, в годах)
  const BOUNDS = [0, 1, 2, 3].map((r) => {
    const set = new Set([T_SUN]);
    UNITS.forEach((u) => { if (u.rank <= r) { set.add(u.a * 1e6); set.add(u.b * 1e6); } });
    return [...set].sort((a, b) => b - a);
  });
  // разбиение интервала [старый, молодой] на куски по подразделениям
  function segments(yaOld, yaYoung, maxRank) {
    const out = [];
    let cur = yaOld;
    for (const b of BOUNDS[maxRank]) {
      if (b >= cur) continue;
      if (b <= yaYoung) break;
      out.push([cur, b]);
      cur = b;
    }
    out.push([cur, yaYoung]);
    return out.map(([a, b]) => ({ a, b, unit: unitAt((a + b) / 2, maxRank) }));
  }

  // условные цвета космической части: от горячей плазмы через «тёмные века» к эпохе галактик
  const COS_STOPS = [
    [3.0, [255, 247, 232]], [5.58, [255, 196, 128]], [6.25, [62, 27, 31]], [7.3, [12, 11, 24]],
    [8.2, [17, 16, 38]], [8.9, [30, 27, 76]], [9.3, [44, 37, 110]], [9.58, [54, 45, 132]],
    [9.8, [40, 40, 108]], [9.97, [27, 32, 74]],
  ];
  function cosmicRGB(ya) {
    const l = Math.log10(Math.max(1, T_BB - ya));
    if (l <= COS_STOPS[0][0]) return COS_STOPS[0][1];
    for (let i = 1; i < COS_STOPS.length; i++) {
      const [x1, c1] = COS_STOPS[i];
      if (l <= x1) {
        const [x0, c0] = COS_STOPS[i - 1];
        const t = (l - x0) / (x1 - x0);
        return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
      }
    }
    return COS_STOPS[COS_STOPS.length - 1][1];
  }
  const colorAt = (ya, maxRank) => (ya > T_SUN ? rgbStr(cosmicRGB(ya)) : unitAt(ya, maxRank).col);

  // простые детерминированные случайные числа — одинаковая картинка при каждом открытии
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* ================= календарь: арифметика ================= */
  const calSec = (ya) => (1 - ya / T_BB) * YEAR_S;          // секунды от 1 января 00:00
  const yaOf = (cs) => T_BB * (1 - cs / YEAR_S);
  const pad2 = (n) => String(n).padStart(2, '0');
  function calParts(cs) {
    cs = clamp(cs, 0, YEAR_S - 1e-7);
    const doy = Math.floor(cs / 86400);
    let d = doy, m = 0;
    while (d >= MDAYS[m]) { d -= MDAYS[m]; m++; }
    const sd = cs - doy * 86400;
    const hh = Math.floor(sd / 3600), mm = Math.floor((sd - hh * 3600) / 60), ss = sd - hh * 3600 - mm * 60;
    return { doy, m, d: d + 1, hh, mm, ss };
  }
  const dateStr = (p) => p.d + ' ' + MONTHS[p.m];
  // подпись момента: точность растёт к полуночи
  function calLabel(ya) {
    if (ya <= 0) return 'полночь';
    const cs = calSec(ya), left = YEAR_S - cs, p = calParts(cs);
    if (left > 2 * 86400) return dateStr(p);
    if (left > 3600) return dateStr(p) + ', ' + pad2(p.hh) + ':' + pad2(p.mm);
    if (left > 1) return dateStr(p) + ', ' + pad2(p.hh) + ':' + pad2(p.mm) + ':' + pad2(Math.floor(p.ss));
    const cc = Math.min(99, Math.floor((p.ss % 1) * 100));
    return dateStr(p) + ', ' + pad2(p.hh) + ':' + pad2(p.mm) + ':' + pad2(Math.floor(p.ss)) + ',' + pad2(cc);
  }
  function calRange(yaOld, yaYoung) {
    const a = calParts(calSec(yaOld));
    const leftB = yaYoung <= 0 ? 0 : YEAR_S - calSec(yaYoung);
    if (yaYoung > 0 && YEAR_S - calSec(yaOld) > 2 * 86400 && leftB > 2 * 86400) {
      const b = calParts(calSec(yaYoung));
      if (a.m === b.m) return a.d === b.d ? dateStr(a) : a.d + '–' + b.d + ' ' + MONTHS[a.m];
      return dateStr(a) + ' – ' + dateStr(b);
    }
    const A = calLabel(yaOld);
    let B = calLabel(yaYoung);
    if (yaYoung > 0 && B.startsWith(dateStr(a) + ', ')) B = B.slice(dateStr(a).length + 2);
    return A + ' – ' + B;
  }

  /* ================= подписи единиц ================= */
  function fmtMa(v) { return v >= 1000 ? num(v / 1000, 3) : num(v, 3); }
  function unitRange(u) {
    if (u.range) return u.range;
    const A = u.ax ? '≈ ' : '', B = u.bx ? '≈ ' : '';
    if (u.b === 0) return A + fmtMa(u.a) + (u.a >= 1000 ? ' млрд' : ' млн') + ' лет назад – сегодня';
    if (u.a >= 1000 && u.b >= 1000) return A + fmtMa(u.a) + '–' + B + fmtMa(u.b) + ' млрд лет назад';
    if (u.a >= 1000) return A + fmtMa(u.a) + ' млрд – ' + B + fmtMa(u.b) + ' млн лет назад';
    return A + fmtMa(u.a) + '–' + B + fmtMa(u.b) + ' млн лет назад';
  }
  function unitDur(u) {
    const d = (u.a - u.b) * 1e6;
    if (u.b === 0) return null;
    return (u.ax || u.bx || u.range ? '≈ ' : '') + fmtY(d, 3) + ' ' + yearsWord(d);
  }
  const unitTitle = (u) => u.full || u.name;
  function rankLabel(u) {
    if (u.cosmic) return 'до ICS · условные цвета';
    const r = D.RANKS[u.rank] + (u.note ? ' · ' + u.note : '');
    const p = u.parentUnit;
    return p ? r + ' · ' + p.name.toLowerCase() : r;
  }

  /* ================= DOM ================= */
  const $ = (s) => document.querySelector(s);
  const art = $('#art'), fx = $('#fx');
  // в режиме съёмки — программный холст: на эмуляторе GPU (SwiftShader) сложные пути и текст растеризуются секундами
  const CTX_OPT = SHOT ? { willReadFrequently: true } : undefined;
  const actx = art.getContext('2d', CTX_OPT), fctx = fx.getContext('2d', CTX_OPT);
  const body = document.body;
  const cardEl = $('#card'), sheet = $('#sheet'), tipEl = $('#tip'), hintEl = $('#hint'), pulseEl = $('#pulse');

  /* ================= состояние ================= */
  const S = { mode: 'spiral', sel: null, hover: null, dirty: true, now: 0,
    touch: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) };
  let W = 0, H = 0, DPR = 1, MOBILE = false;
  const VR = { x: 0, y: 0, w: 0, h: 0 };

  function measure() {
    W = window.innerWidth; H = window.innerHeight;
    MOBILE = W < 760;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [art, fx]) {
      c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
      c.style.width = W + 'px'; c.style.height = H + 'px';
    }
    if (MOBILE) {
      const top = $('#top').getBoundingClientRect().bottom;
      const peek = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--peek')) || 138;
      VR.x = 0; VR.y = top + 6; VR.w = W; VR.h = H - peek - VR.y;
    } else {
      const side = $('#side').getBoundingClientRect();
      VR.x = side.right; VR.y = 0; VR.w = W - side.right; VR.h = H;
    }
    wCache.clear();
    spFit(); ruLayout(); caLayout();
    $('#crumbs').style.top = MOBILE ? Math.round(VR.y + 2) + 'px' : '';
    S.dirty = true;
  }

  // измерение текста с кешем
  const wCache = new Map();
  function charW(ctx, font, ch) {
    const k = font + '|' + ch;
    let w = wCache.get(k);
    if (w === undefined) { ctx.font = font; w = ctx.measureText(ch).width; wCache.set(k, w); }
    return w;
  }
  function textW(ctx, font, s, sp) {
    let w = 0;
    for (const ch of s) w += charW(ctx, font, ch) + (sp || 0);
    return w - (sp || 0);
  }
  const fsR = (x) => Math.round(x * 2) / 2;

  /* =====================================================================
     СПИРАЛЬ — логарифмическая: угол и радиус зависят от lg(лет назад)
     ===================================================================== */
  const SP = {
    g: 1.72,              // во сколько раз растёт радиус за виток (за десятичный порядок)
    s: U_BB, sT: U_BB,    // масштаб: какой lg(лет) лежит на опорном радиусе
    sMin: 1.55,
    R: 300, cx: 0, cy: 0, fx0: 0, fy0: 0,
    A0: -Math.PI * 0.36,  // куда смотрит кончик — Большой взрыв
    uLo: 0,
    intro: SHOT || REDUCED ? 1 : 0,
    introT0: 0,
    labels: [],           // интервалы u, занятые подписями событий, — для наведения
  };
  SP.lnG = Math.log(SP.g);
  SP.k = Math.sqrt(1 + Math.pow(SP.lnG / TAU, 2));
  const rad = (u, w) => SP.R * Math.exp(SP.lnG * (u - SP.s - w));
  const ang = (u) => SP.A0 - TAU * (u - SP.s);
  function spPt(u, w) { const r = rad(u, w), a = ang(u); return [SP.cx + r * Math.cos(a), SP.cy + r * Math.sin(a)]; }

  function spFit() {
    // габарит внешнего витка при s = U_BB (в долях R)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i <= 720; i++) {
      const v = i / 720, r = Math.exp(-SP.lnG * v), a = SP.A0 + TAU * v;
      const x = r * Math.cos(a), y = r * Math.sin(a);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const pad = MOBILE ? { l: 14, r: 14, t: 8, b: 64 } : { l: 36, r: 150, t: 40, b: 36 };
    const aw = VR.w - pad.l - pad.r, ah = VR.h - pad.t - pad.b;
    SP.R = Math.min(aw / (x1 - x0), ah / (y1 - y0));
    SP.fx0 = VR.x + pad.l + aw / 2 - ((x0 + x1) / 2) * SP.R;
    SP.fy0 = VR.y + pad.t + ah / 2 - ((y0 + y1) / 2) * SP.R;
    spCenter();
  }
  function spCenter() {
    const k = ease(clamp((U_BB - SP.s) / 1.4, 0, 1));
    SP.cx = lerp(SP.fx0, VR.x + (VR.w - (MOBILE ? 0 : 110)) / 2, k);
    SP.cy = lerp(SP.fy0, VR.y + (VR.h - (MOBILE ? 64 : 0)) / 2, k);
    // «иллюминатор»: при зуме спираль остаётся в круглом окне и не заходит под интерфейс
    const dL = SP.cx - VR.x, dR = VR.x + VR.w - (MOBILE ? 0 : 150) - SP.cx;
    const dT = SP.cy - VR.y + (MOBILE ? 0 : 10), dB = VR.y + VR.h - (MOBILE ? 60 : 0) - SP.cy;
    const fitR = Math.min(dL, dR, dT, dB) + (MOBILE ? 6 : 14);
    SP.clipR = lerp(SP.R * 1.14, Math.max(fitR, SP.R * 0.7), k);
    SP.uLo = SP.s + Math.log(0.5 / SP.R) / SP.lnG;
  }

  // отсчёты u от ub к ua с шагом ≈ 5 px по дуге
  function uSamples(ua, ub) {
    const out = [ub];
    let u = ub;
    while (u > ua) {
      const r = rad(u, 0);
      u -= clamp(5 / (TAU * r), 1 / 500, 1 / 24);
      out.push(u > ua ? u : ua);
    }
    return out;
  }
  function spPath(ctx, ua, ub, wa, wb) {
    const us = uSamples(ua, ub);
    for (let i = 0; i < us.length; i++) {
      const u = us[i], r = rad(u, wa), a = ang(u);
      const x = SP.cx + r * Math.cos(a), y = SP.cy + r * Math.sin(a);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    for (let i = us.length - 1; i >= 0; i--) {
      const u = us[i], r = rad(u, wb), a = ang(u);
      ctx.lineTo(SP.cx + r * Math.cos(a), SP.cy + r * Math.sin(a));
    }
    ctx.closePath();
  }

  // текст по дуге спирали. dirU = +1 — к большим u (против часовой), −1 — по часовой
  function spText(ctx, str, uStart, dirU, w, font, sp) {
    ctx.font = font;
    let u = uStart;
    for (const ch of str) {
      const adv = charW(ctx, font, ch) + (sp || 0);
      const du = adv / (TAU * rad(u, w) * SP.k);
      const um = u + (dirU * du) / 2;
      const a = ang(um), r = rad(um, w);
      if (ch !== ' ') {
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.translate(SP.cx + r * Math.cos(a), SP.cy + r * Math.sin(a));
        ctx.rotate(dirU < 0 ? a + Math.PI / 2 : a - Math.PI / 2);
        ctx.fillText(ch, 0, 0);
      }
      u += dirU * du;
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  const spSpan = (ctx, str, u, w, font, sp) => textW(ctx, font, str, sp) / (TAU * rad(u, w) * SP.k);
  // направление чтения: сверху — по часовой, снизу — против
  const readDir = (u) => (Math.sin(ang(u)) < 0 ? -1 : 1);
  const onScreen = (x, y, m) => x > VR.x - m && x < VR.x + VR.w + m && y > VR.y - m && y < VR.y + VR.h + m &&
    Math.hypot(x - SP.cx, y - SP.cy) < SP.clipR * 0.9 + m;

  const DEC_LABEL = { 10: '10 млрд лет', 9: '1 млрд лет', 8: '100 млн', 7: '10 млн', 6: '1 млн', 5: '100 тыс.', 4: '10 тыс.', 3: '1000 лет', 2: '100 лет', 1: '10 лет', 0: '1 год' };

  // звёзды в космической части — в координатах (u, w), чтобы вращаться вместе со спиралью
  const STARS = (() => {
    const r = rng(84), out = [];
    const uDark = Math.log10(T_BB - 1.6e8);
    while (out.length < 340) {
      const u = lerp(U_SUN + 0.004, U_BB, r());
      if (u > uDark) continue;
      out.push({ u, w: lerp(TIER[0][0] + 0.03, 0.97, r()), m: 0.35 + r() * 0.65 });
    }
    return out;
  })();

  function spDraw(ctx) {
    const p = SP.intro < 1 ? ease(SP.intro) : 1;
    const uHi = U_BB;
    const uCut = lerp(U_BB, SP.uLo, p);
    const lo = Math.max(SP.uLo, uCut);
    ctx.lineJoin = 'round';

    // --- космическая часть: плавный условный градиент ---
    const cLo = Math.max(U_SUN, lo);
    if (cLo < uHi) {
      const N = 150;
      for (let i = 0; i < N; i++) {
        const a = lerp(U_SUN, uHi, i / N), b = lerp(U_SUN, uHi, (i + 1) / N);
        if (b <= cLo) continue;
        const aa = Math.max(a, cLo);
        ctx.beginPath();
        spPath(ctx, aa, Math.min(uHi, b + 0.0012), TIER[0][0], 1);
        ctx.fillStyle = rgbStr(cosmicRGB(Math.pow(10, (aa + b) / 2)));
        ctx.fill();
      }
      // звёзды
      for (const st of STARS) {
        if (st.u < cLo) continue;
        const [x, y] = spPt(st.u, st.w);
        if (!onScreen(x, y, 4)) continue;
        const th = rad(st.u, TIER[0][0]) - rad(st.u, 1);
        const size = clamp(th * 0.012, 0.45, 1.25) * (0.6 + st.m * 0.6);
        ctx.fillStyle = `rgba(236,232,255,${0.25 + st.m * 0.55})`;
        ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.fill();
      }
      ctx.beginPath();
      spPath(ctx, cLo, uHi, TIER[0][0], 1);
      ctx.strokeStyle = 'rgba(190,180,255,0.18)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // --- подразделения ICS ---
    for (const un of UNITS) {
      const ua = Math.max(un.ua, lo), ub = Math.min(un.ub, uHi);
      if (ub <= ua) continue;
      ctx.beginPath();
      spPath(ctx, ua, ub, un.wa, un.wb);
      ctx.fillStyle = un.col;
      ctx.fill();
    }
    spGrout(ctx, lo, uHi);

    // --- центр: «сейчас» — самые короткие витки тонут в свете настоящего ---
    if (p >= 1) {
      ctx.fillStyle = '#fef2e0';
      ctx.beginPath(); ctx.arc(SP.cx, SP.cy, Math.max(rad(SP.uLo, 0), 0.6), 0, TAU); ctx.fill();
      const rg = rad(SP.s - 3.7, 0);
      const g = ctx.createRadialGradient(SP.cx, SP.cy, 0, SP.cx, SP.cy, rg);
      g.addColorStop(0, 'rgba(255,249,236,0.78)');
      g.addColorStop(0.35, 'rgba(255,246,228,0.32)');
      g.addColorStop(1, 'rgba(255,246,228,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(SP.cx, SP.cy, rg, 0, TAU); ctx.fill();
    }

    // --- свечение Большого взрыва на кончике ---
    if (p > 0) {
      const wm = (TIER[0][0] + 1) / 2;
      const [x, y] = spPt(U_BB, wm);
      const th = rad(U_BB, TIER[0][0]) - rad(U_BB, 1);
      const R = Math.max(10, th * 0.72);
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, 'rgba(255,250,236,0.95)');
      g.addColorStop(0.18, 'rgba(255,226,170,0.7)');
      g.addColorStop(0.5, 'rgba(255,150,96,0.22)');
      g.addColorStop(1, 'rgba(255,110,80,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    const la = SP.intro < 1 ? clamp((SP.intro - 0.78) / 0.22, 0, 1) : 1;
    if (la > 0) {
      ctx.globalAlpha = la;
      spUnitLabels(ctx, lo);
      spEventLabels(ctx, lo);
      spNowLabel(ctx);
      ctx.globalAlpha = 1;
    }
    // мягкий край окна
    const Rc = SP.clipR;
    const m = ctx.createRadialGradient(SP.cx, SP.cy, Rc * 0.9, SP.cx, SP.cy, Rc);
    m.addColorStop(0, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    // тонкое кольцо окна — только когда спираль больше окна
    const kz = clamp((U_BB - SP.s) / 0.6, 0, 1);
    if (kz > 0) {
      ctx.strokeStyle = `rgba(238,230,214,${0.16 * kz})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(SP.cx, SP.cy, Rc - 0.5, 0, TAU); ctx.stroke();
    }
  }

  // тонкие тёмные линии между ячейками; толщина следует за размером витка
  function spGrout(ctx, lo, uHi) {
    ctx.strokeStyle = GROUT;
    ctx.lineCap = 'butt';
    const lw = (u) => clamp((rad(u, 0) - rad(u, 1)) * 0.009, 0, 0.9);
    for (const un of UNITS) {
      const ua = Math.max(un.ua, lo), ub = Math.min(un.ub, uHi);
      if (ub <= ua) continue;
      // радиальная граница в начале подразделения
      if (un.ub <= uHi && un.ub >= lo) {
        const w = lw(un.ub);
        if (w > 0.12) {
          const [x0, y0] = spPt(un.ub, un.wa), [x1, y1] = spPt(un.ub, un.wb);
          ctx.lineWidth = w;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        }
      }
      // дуга под ячейкой — граница с дочерним ярусом
      if (un.wb >= 1) continue;
      for (let hi = ub; hi > ua; hi -= 1) {
        const lo2 = Math.max(ua, hi - 1);
        const w = lw(hi);
        if (w <= 0.12) break;
        const us = uSamples(lo2, hi);
        ctx.lineWidth = w;
        ctx.beginPath();
        for (let i = 0; i < us.length; i++) {
          const r = rad(us[i], un.wb), a = ang(us[i]);
          const x = SP.cx + r * Math.cos(a), y = SP.cy + r * Math.sin(a);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
    }
  }

  // подписи подразделений — по дуге, внутри своей полосы
  const MAXFS = [12, 12, 18, 14];
  function spUnitLabels(ctx, lo) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const list = UNITS.concat([COSMOS]);
    for (const un of list) {
      const ua = Math.max(un.ua, lo), ub = Math.min(un.ub, U_BB);
      if (ub - ua < 0.006) continue;
      const merged = !un.children.length && un.rank < 3;
      // капсом с разрядкой — только узкие ярусы эонов и эр; крупные слитые блоки — строчными
      const caps = (un.rank <= 1 && !merged) || un.cosmic;
      const wm = merged && !un.cosmic ? un.wa + (un.wb - un.wa) * 0.4 : (un.wa + un.wb) / 2;
      for (let i = 0; i < 14; i++) {
        const hi = ub - i, lo2 = Math.max(ua, ub - i - 1);
        if (hi <= ua) break;
        const uc = (hi + lo2) / 2;
        const th = rad(uc, un.wa) - rad(uc, un.wb);
        let fs = Math.min(merged ? 19 : MAXFS[un.rank], (th - 3) * (caps ? 1.05 : 0.78));
        if (un.cosmic) fs = Math.min(13, (th - 3) * 0.5);
        fs = fsR(fs);
        if (fs < 11) break;
        const [px, py] = spPt(uc, wm);
        if (!onScreen(px, py, -8)) continue;
        const weight = caps || merged || un.rank === 2 ? 600 : 500;
        let done = false;
        const names = [unitTitleShort(un), un.short].filter(Boolean);
        for (let f = fs; f >= 11 && !done; f = f > 13 ? fsR(f * 0.88) : f - 1) {
          const font = `${weight} ${f}px ${SANS}`;
          const sp = caps ? f * 0.13 : f * 0.01;
          for (const raw of names) {
            const str = caps ? raw.toUpperCase() : raw;
            const du = spSpan(ctx, str, uc, wm, font, sp);
            const padU = 5 / (TAU * rad(uc, wm));
            if (uc - du / 2 - padU < lo2 || uc + du / 2 + padU > hi) continue;
            const dir = readDir(uc);
            ctx.fillStyle = un.cosmic ? 'rgba(226,222,255,0.8)' : inkFor(un.col);
            spText(ctx, str, uc - (dir * du) / 2, dir, wm, font, sp);
            done = true;
            break;
          }
        }
        if (done) break;
      }
    }
  }
  function unitTitleShort(un) {
    if (un.cosmic) return 'Вселенная до Солнца';
    if (un.rank === 3 && un.full && /^(Ранн|Средн|Поздн)/.test(un.name)) return un.full;
    return un.name;
  }

  // события — точки и подписи в тёмном «рельсе» между витками.
  // Сначала важные: их подписи могут закрыть точку менее важного события — тогда оно ждёт зума.
  function spEventLabels(ctx, lo) {
    const occ = [];
    const wr = RAIL * 0.5;
    const free = (a, b) => occ.every(([x, y]) => b < x || a > y);
    const pxU = (u, px) => px / (TAU * rad(u, wr) * SP.k);
    SP.labels = [];
    for (const e of EVENTS) e._dot = null;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    // десятичные порядки: все лежат на одном луче
    for (let k = Math.ceil(lo); k <= Math.floor(U_BB); k++) {
      if (!(k in DEC_LABEL)) continue;
      const railPx = rad(k, 0) - rad(k, RAIL);
      if (railPx < 3) continue;
      const [x0, y0] = spPt(k, 0.015), [x1, y1] = spPt(k, RAIL - 0.015);
      ctx.strokeStyle = 'rgba(238,230,214,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const fs = fsR(Math.min(12, railPx * 0.6));
      if (fs < 11 || !onScreen(x0, y0, -4)) { occ.push([k - pxU(k, 3), k + pxU(k, 3)]); continue; }
      const font = `500 ${fs}px ${MONO}`;
      const du = spSpan(ctx, DEC_LABEL[k], k, wr, font, 0);
      const gap = pxU(k, 6);
      const dir = readDir(k);
      const a = dir > 0 ? k + gap : k - gap - du, b = dir > 0 ? k + gap + du : k - gap;
      ctx.fillStyle = 'rgba(238,230,214,0.6)';
      spText(ctx, DEC_LABEL[k], dir > 0 ? a : b, dir, wr, font, 0);
      occ.push([Math.min(a, k) - gap, Math.max(b, k) + gap]);
    }

    const vis = EV_BY_PRIO.filter((e) => e.u >= lo && e.u <= U_BB + 1e-9);
    const dots = [];
    for (const e of vis) {
      const railPx = rad(e.u, 0) - rad(e.u, RAIL);
      if (railPx < 2.2) continue;
      const [x, y] = spPt(e.u, wr);
      const dotG = pxU(e.u, 2.6);
      if (!free(e.u - dotG, e.u + dotG)) continue;
      let placed = null;
      const fs = fsR(Math.min(14, railPx * 0.54));
      if (fs >= 11 && onScreen(x, y, -6)) {
        const font = `${e.p === 1 ? 600 : 500} ${fs}px ${SANS}`;
        const du = spSpan(ctx, e.label, e.u, wr, font, 0);
        const gap = pxU(e.u, 8), pad = pxU(e.u, 7);
        const dir = readDir(e.u);
        const after = dir > 0 ? [e.u + gap, e.u + gap + du] : [e.u - gap - du, e.u - gap];
        const before = dir > 0 ? [e.u - gap - du, e.u - gap] : [e.u + gap, e.u + gap + du];
        for (const [a, b] of [after, before]) {
          if (b > U_BB + pxU(U_BB, 2) || a < lo) continue;
          if (free(a - pad, b + pad)) { placed = [a, b]; break; }
        }
        if (placed) {
          ctx.fillStyle = e.p === 1 ? INK : 'rgba(238,230,214,0.82)';
          spText(ctx, e.label, dir > 0 ? placed[0] : placed[1], dir, wr, font, 0);
          occ.push(placed);
          SP.labels.push({ e, a: placed[0], b: placed[1] });
        }
      }
      occ.push([e.u - dotG, e.u + dotG]);
      const r = clamp(railPx * 0.1, 1.3, 3) * (e.p === 1 ? 1.2 : 1);
      e._dot = [x, y, r, !!placed];
      dots.push(e);
    }
    for (const e of dots) {
      const [x, y, r, lab] = e._dot;
      ctx.fillStyle = lab ? INK : 'rgba(238,230,214,0.55)';
      ctx.beginPath(); ctx.arc(x, y, lab ? r : r * 0.85, 0, TAU); ctx.fill();
    }
  }

  function spNowLabel(ctx) {
    const x = SP.cx, y = SP.cy;
    ctx.fillStyle = '#fff8ea';
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); ctx.fill();
    const lx = x + 10, ly = y + 16;
    ctx.font = `500 12px ${MONO}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(13,12,10,0.85)'; ctx.lineJoin = 'round';
    ctx.strokeText('сейчас', lx, ly);
    ctx.fillStyle = INK;
    ctx.fillText('сейчас', lx, ly);
    pulseEl.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    pulseEl.classList.add('on');
  }

  // что под курсором: {u, w} → событие / подразделение / «сейчас»
  function spPick(x, y) {
    const dx = x - SP.cx, dy = y - SP.cy, r = Math.hypot(dx, dy);
    if (r > SP.clipR * 0.94) return null;
    if (r < 7) return { kind: 'now' };
    const th = Math.atan2(dy, dx);
    const L = Math.log(r / SP.R) / SP.lnG;
    let f = ((SP.A0 - th) / TAU) % 1;
    if (f < 0) f += 1;
    const k = Math.ceil(L - f - 1e-9);
    const w = f + k - L, u = SP.s + f + k;
    if (u > U_BB + 1e-6) return null;
    if (u < SP.uLo) return { kind: 'now' };
    if (w < RAIL) {
      let best = null, bd = 14;
      for (const e of EVENTS) {
        if (!e._dot) continue;
        const d = Math.hypot(e._dot[0] - x, e._dot[1] - y);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) return best;
      for (const l of SP.labels) if (u >= l.a && u <= l.b) return l.e;
      return null;
    }
    const ya = Math.pow(10, u);
    if (ya > T_SUN) return COSMOS;
    for (const un of UNITS) if (w >= un.wa && w < un.wb && ya / 1e6 <= un.a && ya / 1e6 > un.b) return un;
    return null;
  }

  function spFx(ctx, t) {
    if (SP.intro < 1) return;
    // подсветка
    for (const [it, strong] of [[S.hover, false], [S.sel, true]]) {
      if (!it) continue;
      if (it.kind === 'unit') {
        const ua = Math.max(it.ua, SP.uLo), ub = Math.min(it.ub, U_BB);
        if (ub <= ua) continue;
        ctx.beginPath(); spPath(ctx, ua, ub, it.wa, it.wb);
        ctx.fillStyle = strong ? 'rgba(255,252,244,0.2)' : 'rgba(255,252,244,0.13)';
        ctx.fill();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(13,12,10,0.85)';
        ctx.lineWidth = strong ? 4.5 : 3.5;
        ctx.stroke();
        ctx.strokeStyle = strong ? '#fffaf0' : 'rgba(255,252,244,0.8)';
        ctx.lineWidth = strong ? 2 : 1.3;
        ctx.stroke();
      } else if (it.kind === 'event' && it._dot && it.u >= SP.uLo) {
        const [x, y, r] = it._dot;
        ctx.strokeStyle = strong ? '#fff' : 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r + 4, 0, TAU); ctx.stroke();
      }
    }
  }

  // перейти к моменту: виток с ним оказывается у края
  function spFocus(item) {
    let u;
    if (item.kind === 'event') u = item.u + 0.42;
    else if (item.cosmic) u = U_BB;
    else u = Math.min(item.ub + 0.12, U_BB);
    SP.sT = clamp(u, SP.sMin, U_BB);
  }

  /* ---------- колонка глубины: на десктопе вертикальная, как стратиграфическая колонка (сегодня наверху) ---------- */
  const depthEl = $('#depth'), thumbEl = $('#depth-thumb'), capEl = $('#depth-cap');
  const vOfS = (s) => (U_BB - s) / (U_BB - SP.sMin);
  const sOfV = (v) => lerp(U_BB, SP.sMin, v);
  const depthVertical = () => !MOBILE;
  function buildDepth() {
    const vert = depthVertical();
    const stops = [];
    for (let i = 0; i <= 80; i++) {
      const v = i / 80, ya = Math.pow(10, sOfV(v) - 0.5);
      stops.push(`${colorAt(ya, 2)} ${(v * 100).toFixed(1)}%`);
    }
    depthEl.querySelector('.track').style.background = `linear-gradient(${vert ? '0deg' : '90deg'}, ${stops.join(',')})`;
    const ticks = $('#depth-ticks');
    let html = '';
    for (let k = 10; k >= 2; k--) {
      const v = vOfS(k);
      if (v < 0 || v > 1) continue;
      const pos = vert ? `bottom:${(v * 100).toFixed(2)}%` : `left:${(v * 100).toFixed(2)}%`;
      html += `<i style="${pos}"></i>`;
      const lab = k === 3 ? '1000 лет' : k === 2 ? '100 лет' : DEC_LABEL[k].replace(' лет', '');
      if (vert || k === 9 || k === 6 || k === 3) html += `<span style="${pos}">${typo(lab)}</span>`;
    }
    ticks.innerHTML = html;
    depthEl.setAttribute('aria-orientation', vert ? 'vertical' : 'horizontal');
    capKey = '';
  }
  let capKey = '';
  function updateDepth() {
    const v = clamp(vOfS(SP.s), 0, 1);
    if (depthVertical()) { thumbEl.style.left = ''; thumbEl.style.bottom = (v * 100).toFixed(3) + '%'; }
    else { thumbEl.style.bottom = ''; thumbEl.style.left = (v * 100).toFixed(3) + '%'; }
    depthEl.setAttribute('aria-valuenow', Math.round(v * 100));
    const a = Math.pow(10, Math.min(SP.s, U_BB)), b = Math.pow(10, SP.s - 1);
    const txt = fmtSpanAgo(a, b);
    if (txt !== capKey) {
      capKey = txt;
      capEl.innerHTML = '<span>Край спирали</span> <b>' + esc(typo(txt)) + '</b>';
      depthEl.setAttribute('aria-valuetext', typo(txt));
    }
  }
  (function depthInput() {
    let on = false;
    const set = (e) => {
      const r = depthEl.getBoundingClientRect();
      const v = depthVertical() ? (r.bottom - e.clientY) / r.height : (e.clientX - r.left) / r.width;
      SP.sT = sOfV(clamp(v, 0, 1));
    };
    depthEl.addEventListener('pointerdown', (e) => { on = true; depthEl.setPointerCapture(e.pointerId); depthEl.classList.add('active'); set(e); });
    depthEl.addEventListener('pointermove', (e) => { if (on) set(e); });
    const end = () => { on = false; depthEl.classList.remove('active'); };
    depthEl.addEventListener('pointerup', end);
    depthEl.addEventListener('pointercancel', end);
    depthEl.addEventListener('keydown', (e) => {
      const st = e.shiftKey ? 1 : 0.25;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { SP.sT = clamp(SP.sT - st, SP.sMin, U_BB); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { SP.sT = clamp(SP.sT + st, SP.sMin, U_BB); e.preventDefault(); }
      if (e.key === 'Home') { SP.sT = U_BB; e.preventDefault(); }
      if (e.key === 'End') { SP.sT = SP.sMin; e.preventDefault(); }
    });
  })();

  /* =====================================================================
     ЛИНЕЙКА — линейное время, зум колесом, сдвиг перетаскиванием
     ===================================================================== */
  const RU = {
    tR: 0, span: T_BB, anim: null,
    x0: 0, x1: 0, tierY: [], bandTop: 0, bandBot: 0, axisY: 0, mmY: 0, rowH: 36, rows: 5,
    minSpan: 12, maxSpan: T_BB * 1.06,
    cells: [], evHits: [],
  };
  RU.span = RU.maxSpan; RU.tR = -T_BB * 0.02;
  const ruX = (ya) => RU.x0 + ((RU.tR + RU.span - ya) / RU.span) * (RU.x1 - RU.x0);
  const ruT = (x) => RU.tR + RU.span - ((x - RU.x0) / (RU.x1 - RU.x0)) * RU.span;
  function ruClamp() {
    RU.span = clamp(RU.span, RU.minSpan, RU.maxSpan);
    RU.tR = clamp(RU.tR, -RU.span * 0.035, T_BB + RU.span * 0.02 - RU.span);
    if (RU.span >= RU.maxSpan) RU.tR = -T_BB * 0.02;
  }
  function ruLayout() {
    const m = MOBILE;
    RU.x0 = VR.x + (m ? 14 : 24);
    RU.x1 = VR.x + VR.w - (m ? 14 : 48);
    const th = m ? [18, 24, 50, 30] : [26, 34, 92, 48];
    RU.bandTop = Math.round(VR.y + VR.h * (m ? 0.46 : 0.41));
    let y = RU.bandTop;
    RU.tierY = th.map((h) => { const r = [y, y + h]; y += h; return r; });
    RU.bandBot = y;
    RU.axisY = y + 8;
    RU.mmY = m ? y + 50 : Math.max(y + 70, VR.y + VR.h - 196);
    RU.rowH = m ? 32 : 38;
    RU.rows = m ? 4 : 5;
  }
  function ruView() { return [RU.tR + RU.span, RU.tR]; }

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
    return 10 * p;
  }
  function tickLabel(v, step) {
    if (Math.abs(v) < step * 1e-6) return 'сейчас';
    const div = v >= 1e9 ? 1e9 : v >= 1e6 ? 1e6 : v >= 1e4 ? 1e3 : 1;
    const unit = div === 1e9 ? ' млрд' : div === 1e6 ? ' млн' : div === 1e3 ? ' тыс.' : '';
    const d = Math.max(0, Math.ceil(-Math.log10(step / div) - 1e-9));
    return num(v / div, Math.min(d, 3)) + unit;
  }

  function ruDraw(ctx) {
    const [tL, tRr] = ruView();
    const X0 = RU.x0, X1 = RU.x1;
    RU.cells = [];

    // сетка и ось: шаг подбирается так, чтобы подписи не слипались
    const calendarAxis = tL < 25000;
    ctx.textBaseline = 'top';
    const axFont = `500 12px ${MONO}`;
    ctx.font = axFont;
    const makeTicks = (minPx) => {
      const out = [];
      if (calendarAxis) {
        const yL = D.NOW - tL, yR = D.NOW - tRr;
        const step = niceStep(((yR - yL) * minPx) / (X1 - X0));
        for (let yv = Math.ceil(yL / step) * step; yv <= yR + 1e-9; yv += step) {
          const x = ruX(D.NOW - yv);
          if (x < X0 - 1 || x > X1 + 1) continue;
          let lab;
          if (yv < 0) lab = num(-yv, 0) + ' до н. э.';
          else if (yv === 0) lab = 'рубеж эр';
          else lab = String(Math.round(yv));
          out.push([x, typo(lab)]);
        }
      } else {
        const step = niceStep((RU.span * minPx) / (X1 - X0));
        for (let v = Math.ceil(Math.max(0, tRr) / step) * step; v <= tL + 1e-6; v += step) {
          const x = ruX(v);
          if (x < X0 - 1 || x > X1 + 1) continue;
          out.push([x, typo(tickLabel(v, step))]);
        }
      }
      return out;
    };
    // выравнивание подписи: у краёв — к краю, иначе по центру
    const tickAlign = (x) => (x < X0 + 30 ? 'left' : x > X1 - 30 ? 'right' : 'center');
    const extent = (x, lab) => {
      const w = textW(ctx, axFont, lab, 0), al = tickAlign(x);
      return al === 'left' ? [x, x + w] : al === 'right' ? [x - w, x] : [x - w / 2, x + w / 2];
    };
    let ticks = [];
    for (let minPx = MOBILE ? 74 : 104; minPx < 2000; minPx *= 1.6) {
      ticks = makeTicks(minPx).sort((a, b) => a[0] - b[0]);
      let ok = true;
      for (let i = 1; i < ticks.length; i++) {
        if (extent(...ticks[i])[0] - extent(...ticks[i - 1])[1] < 16) { ok = false; break; }
      }
      if (ok) break;
    }
    const gy0 = RU.bandTop - RU.rows * RU.rowH - 8;
    for (const [x, lab] of ticks) {
      ctx.fillStyle = 'rgba(238,230,214,0.05)';
      ctx.fillRect(Math.round(x) - 0.5, gy0, 1, RU.bandTop - gy0);
      ctx.fillStyle = 'rgba(238,230,214,0.4)';
      ctx.fillRect(Math.round(x) - 0.5, RU.bandBot, 1, 6);
      ctx.fillStyle = 'rgba(238,230,214,0.72)';
      ctx.textAlign = tickAlign(x);
      ctx.font = axFont;
      ctx.fillText(lab, x, RU.axisY + 2);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(238,230,214,0.5)';
    ctx.font = `500 12px ${MONO}`;
    ctx.fillText(calendarAxis ? 'ГОДЫ' : 'ЛЕТ НАЗАД', X0, RU.axisY + 22);

    // космическая часть
    const bandH = RU.bandBot - RU.tierY[0][0];
    if (tL > T_SUN) {
      const xa = Math.max(X0, ruX(Math.min(tL, T_BB))), xb = Math.min(X1, ruX(T_SUN));
      if (xb > xa) {
        const n = Math.max(1, Math.ceil((xb - xa) / 3));
        for (let i = 0; i < n; i++) {
          const a = xa + ((xb - xa) * i) / n, b = xa + ((xb - xa) * (i + 1)) / n;
          ctx.fillStyle = rgbStr(cosmicRGB(ruT((a + b) / 2)));
          ctx.fillRect(a, RU.tierY[0][0], b - a + 0.6, bandH);
        }
        const r = rng(7);
        for (let i = 0; i < 260; i++) {
          const t = lerp(T_SUN, T_BB, r()), yy = lerp(RU.tierY[0][0] + 3, RU.bandBot - 3, r()), m = r();
          if (T_BB - t < 1.6e8) continue;
          const x = ruX(t);
          if (x < xa || x > xb) continue;
          ctx.fillStyle = `rgba(236,232,255,${0.2 + m * 0.5})`;
          ctx.fillRect(x, yy, 1, 1);
        }
        RU.cells.push({ x0: xa, x1: xb, y0: RU.tierY[0][0], y1: RU.bandBot, unit: COSMOS });
        ruCellLabel(ctx, COSMOS, xa, xb, RU.tierY[0][0], RU.bandBot);
      }
    }
    // подразделения ICS
    for (const un of UNITS) {
      const a = un.a * 1e6, b = un.b * 1e6;
      if (a < tRr || b > tL) continue;
      const xa = Math.max(X0, ruX(a)), xb = Math.min(X1, ruX(b));
      if (xb - xa <= 0) continue;
      const y0 = RU.tierY[un.rank][0];
      const y1 = un.children.length ? RU.tierY[un.rank][1] : RU.bandBot;
      ctx.fillStyle = un.col;
      ctx.fillRect(xa, y0, xb - xa, y1 - y0);
      RU.cells.push({ x0: xa, x1: xb, y0, y1, unit: un });
    }
    // тонкие линии между ячейками
    ctx.fillStyle = GROUT;
    for (const c of RU.cells) {
      if (c.x0 > X0 + 0.5 && c.x1 - c.x0 > 1.2) ctx.fillRect(c.x0 - 0.4, c.y0, 0.8, c.y1 - c.y0);
      ctx.fillRect(c.x0, c.y1 - 0.4, c.x1 - c.x0, 0.8);
    }
    ctx.fillRect(X0, RU.tierY[0][0] - 0.4, X1 - X0, 0.8);
    for (const c of RU.cells) if (c.unit !== COSMOS) ruCellLabel(ctx, c.unit, c.x0, c.x1, c.y0, c.y1);

    // «сейчас»
    const xn = ruX(0);
    if (xn >= X0 - 1 && xn <= X1 + 40) {
      ctx.fillStyle = '#fff6e4';
      ctx.fillRect(Math.round(xn), RU.tierY[0][0] - 6, 1.5, RU.bandBot - RU.tierY[0][0] + 12);
    }

    ruEvents(ctx, tL, tRr);
    ruMinimap(ctx);
  }

  function ruCellLabel(ctx, un, xa, xb, y0, y1) {
    const w = xb - xa, h = y1 - y0;
    const merged = !un.children.length && un.rank < 3;
    // капсом — только узкие ярусы эонов и эр; слитые крупные блоки — строчными, как периоды
    const caps = (un.rank <= 1 && !merged) || un.cosmic;
    let fs = caps ? 11.5 : un.rank === 2 ? (MOBILE ? 13.5 : 15.5) : MOBILE ? 12 : 12.5;
    if (merged && !un.cosmic) fs = MOBILE ? 14 : 17;
    fs = Math.min(fs, h - 6 > 0 ? (h - 6) * (caps ? 1.3 : 0.85) : 0);
    if (fs < 10.5) return;
    const weight = caps || merged || un.rank === 2 ? 600 : 500;
    const cands = [unitTitleShort(un), un.short, un.rank === 3 && un.full ? un.name : null].filter(Boolean);
    for (let f = fs; f >= 11; f -= f > 13 ? 1.5 : 1) {
      const font = `${weight} ${f}px ${SANS}`;
      const sp = caps ? f * 0.12 : 0;
      for (const raw of cands) {
        const str = caps ? raw.toUpperCase() : raw;
        const tw = textW(ctx, font, str, sp);
        if (tw + 12 > w) continue;
        const cx = clamp((xa + xb) / 2, xa + tw / 2 + 6, xb - tw / 2 - 6);
        ctx.font = font;
        ctx.fillStyle = un.cosmic ? 'rgba(226,222,255,0.82)' : inkFor(un.col);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        let x = cx - tw / 2;
        if (sp) { for (const ch of str) { ctx.fillText(ch, x, (y0 + y1) / 2 + 0.5); x += charW(ctx, font, ch) + sp; } }
        else ctx.fillText(str, x, (y0 + y1) / 2 + 0.5);
        return;
      }
    }
  }

  function ruEvents(ctx, tL, tRr) {
    const rows = [];
    for (let i = 0; i < RU.rows; i++) rows.push([]);
    RU.evHits = [];
    const top = RU.tierY[0][0];
    const fsA = MOBILE ? 12.5 : 13, fsB = 12;
    const fontA = (p) => `${p === 1 ? 600 : 500} ${fsA}px ${SANS}`, fontB = `500 ${fsB}px ${MONO}`;
    const vis = EV_BY_PRIO.filter((e) => e.ya <= tL && e.ya >= tRr);
    const ticksOnly = [];
    for (const e of vis) {
      const x = ruX(e.ya);
      if (x < RU.x0 - 1 || x > RU.x1 + 1) continue;
      const lw = Math.max(textW(ctx, fontA(e.p), e.label, 0), textW(ctx, fontB, typo(e.when), 0)) + 8;
      let placed = false;
      for (let r = 0; r < RU.rows && !placed; r++) {
        for (const side of [1, -1]) {
          const a = side > 0 ? x - 2 : x - lw, b = side > 0 ? x + lw : x + 2;
          if (a < RU.x0 - 2 || b > Math.min(RU.x1 + 30, W - 8)) continue;
          if (!rows[r].every(([p, q]) => b < p - 6 || a > q + 6)) continue;
          // стебель не должен пересекать подписи нижних рядов
          let ok = true;
          for (let k = 0; k < r; k++) if (rows[k].some(([p, q]) => x > p - 3 && x < q + 3)) ok = false;
          if (!ok) continue;
          rows[r].push([a, b]);
          const yl = top - 12 - r * RU.rowH;
          ctx.fillStyle = e.p === 1 ? 'rgba(238,230,214,0.55)' : 'rgba(238,230,214,0.32)';
          ctx.fillRect(Math.round(x) - 0.5, yl - 4, 1, top - yl + 4);
          ctx.fillStyle = e.p === 1 ? INK : 'rgba(238,230,214,0.82)';
          ctx.beginPath(); ctx.arc(x, top - 1, e.p === 1 ? 3 : 2.3, 0, TAU); ctx.fill();
          ctx.textAlign = side > 0 ? 'left' : 'right';
          ctx.textBaseline = 'alphabetic';
          const tx = side > 0 ? x + 6 : x - 6;
          ctx.font = fontA(e.p);
          ctx.fillStyle = e.p === 1 ? INK : 'rgba(238,230,214,0.86)';
          ctx.fillText(e.label, tx, yl - 16);
          ctx.font = fontB;
          ctx.fillStyle = 'rgba(238,230,214,0.56)';
          ctx.fillText(typo(e.when), tx, yl - 1);
          RU.evHits.push({ e, x0: a, x1: b, y0: yl - 30, y1: top });
          placed = true;
          break;
        }
      }
      if (!placed) ticksOnly.push([x, e]);
    }
    for (const [x, e] of ticksOnly) {
      ctx.fillStyle = 'rgba(238,230,214,0.4)';
      ctx.fillRect(Math.round(x) - 0.5, top - 7, 1, 7);
      RU.evHits.push({ e, x0: x - 4, x1: x + 4, y0: top - 10, y1: top });
    }
  }

  function ruMinimap(ctx) {
    const X0 = RU.x0, X1 = RU.x1, y = RU.mmY, h = 8;
    const mx = (ya) => X0 + ((T_BB - ya) / T_BB) * (X1 - X0);
    const n = Math.ceil((X1 - X0) / 2);
    for (let i = 0; i < n; i++) {
      const a = X0 + ((X1 - X0) * i) / n, b = X0 + ((X1 - X0) * (i + 1)) / n;
      const ya = T_BB * (1 - ((a + b) / 2 - X0) / (X1 - X0));
      ctx.fillStyle = colorAt(ya, 2);
      ctx.fillRect(a, y, b - a + 0.5, h);
    }
    const [tL, tRr] = ruView();
    let a = mx(Math.min(tL, T_BB)), b = mx(Math.max(tRr, 0));
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    if (b - a < 5) {
      const c = (a + b) / 2;
      ctx.beginPath(); ctx.moveTo(c, y - 3); ctx.lineTo(c, y + h + 3); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.moveTo(c - 5, y - 10); ctx.lineTo(c + 5, y - 10); ctx.lineTo(c, y - 4); ctx.closePath(); ctx.fill();
    } else {
      ctx.strokeRect(a, y - 3.5, b - a, h + 7);
    }
    ctx.font = `500 12px ${MONO}`;
    ctx.fillStyle = 'rgba(238,230,214,0.55)';
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText('ВСЯ ИСТОРИЯ', X0, y + h + 7);
    ctx.textAlign = 'right';
    const share = (Math.min(tL, T_BB) - Math.max(tRr, 0)) / T_BB * 100;
    const shareTxt = share >= 99.5 ? '100 %' : share >= 1 ? num(share, share < 10 ? 1 : 0) + ' %' : share >= 1e-4 ? num(share, sigDec(share, 2)) + ' %' : '< 0,0001 %';
    ctx.fillText(typo('НА ЭКРАНЕ ' + shareTxt), X1, y + h + 7);
  }

  function ruPick(x, y) {
    for (const h of RU.evHits) if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h.e;
    for (const c of RU.cells) if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) return c.unit;
    return null;
  }

  function ruFx(ctx) {
    // визир: тонкая линия под курсором и время в этой точке
    const cx = S.cursor && S.cursor.x;
    if (cx && cx > RU.x0 && cx < RU.x1 && S.cursor.y > RU.tierY[0][0] - 40 && S.cursor.y < RU.axisY + 30 && !drag) {
      const t = ruT(cx);
      if (t >= 0 && t <= T_BB) {
        ctx.fillStyle = 'rgba(255,252,244,0.55)';
        ctx.fillRect(Math.round(cx) - 0.5, RU.tierY[0][0], 1, RU.bandBot - RU.tierY[0][0] + 4);
        const cal = ruView()[0] < 25000;
        const lab = cal ? (D.NOW - t < 1 ? Math.round(1 - (D.NOW - t)) + ' г. до н. э.' : Math.floor(D.NOW - t) + ' г.') : '≈ ' + fmtAgo(t, 3);
        const txt = typo(lab);
        ctx.font = `600 12px ${MONO}`;
        const w = textW(ctx, `600 12px ${MONO}`, txt, 0) + 14;
        const x = clamp(cx - w / 2, RU.x0, RU.x1 - w);
        const y = RU.bandBot + 4;
        ctx.fillStyle = '#eee6d6';
        ctx.fillRect(x, y, w, 20);
        ctx.fillStyle = '#16130f';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, x + 7, y + 10.5);
      }
    }
    for (const [it, strong] of [[S.hover, false], [S.sel, true]]) {
      if (!it) continue;
      if (it.kind === 'unit') {
        const a = Math.min(it.a * 1e6, T_BB), b = it.b * 1e6;
        const xa = Math.max(RU.x0, ruX(a)), xb = Math.min(RU.x1, ruX(b));
        if (xb <= xa) continue;
        const y0 = RU.tierY[it.rank][0], y1 = it.children.length ? RU.tierY[it.rank][1] : RU.bandBot;
        ctx.fillStyle = 'rgba(255,252,244,0.16)';
        ctx.fillRect(xa, y0, xb - xa, y1 - y0);
        ctx.strokeStyle = 'rgba(13,12,10,0.85)';
        ctx.lineWidth = strong ? 4 : 3;
        ctx.strokeRect(xa + 1, y0 + 1, Math.max(1, xb - xa - 2), y1 - y0 - 2);
        ctx.strokeStyle = strong ? '#fffaf0' : 'rgba(255,252,244,0.8)';
        ctx.lineWidth = strong ? 2 : 1.3;
        ctx.strokeRect(xa + 1, y0 + 1, Math.max(1, xb - xa - 2), y1 - y0 - 2);
      } else if (it.kind === 'event') {
        const x = ruX(it.ya);
        if (x < RU.x0 || x > RU.x1) continue;
        ctx.strokeStyle = strong ? '#fff' : 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, RU.tierY[0][0] - 1, 7, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(Math.round(x) - 0.5, RU.tierY[0][0], 1, RU.bandBot - RU.tierY[0][0]);
      }
    }
  }

  // плавный перелёт камеры (ван Вейк и Нёйс): сначала отдаляемся, потом приближаемся
  function ruFly(tR1, span1, dur) {
    span1 = clamp(span1, RU.minSpan, RU.maxSpan);
    const c0 = RU.tR + RU.span / 2, w0 = RU.span, c1 = tR1 + span1 / 2, w1 = span1;
    const rho = 1.2, r2 = rho * rho, r4 = r2 * r2;
    const dx = c1 - c0, d2 = dx * dx;
    let S2, fn;
    if (d2 < 1e-9 * w0 * w0) {
      S2 = Math.log(w1 / w0) / rho;
      fn = (t) => [c0 + t * dx, w0 * Math.exp(rho * t * S2)];
    } else {
      const d1 = Math.sqrt(d2);
      const b0 = (w1 * w1 - w0 * w0 + r4 * d2) / (2 * w0 * r2 * d1);
      const b1 = (w1 * w1 - w0 * w0 - r4 * d2) / (2 * w1 * r2 * d1);
      // ln(√(b²+1) − b) = −asinh(b): так нет потери точности при огромной разнице масштабов
      const q0 = -Math.asinh(b0), q1 = -Math.asinh(b1);
      S2 = (q1 - q0) / rho;
      fn = (t) => {
        const s = t * S2, ch = Math.cosh(q0);
        const uu = (w0 / (r2 * d1)) * (ch * Math.tanh(rho * s + q0) - Math.sinh(q0));
        return [c0 + uu * dx, (w0 * ch) / Math.cosh(rho * s + q0)];
      };
    }
    const d = dur || clamp(Math.abs(S2) * 260, 700, 2200);
    if (!isFinite(S2)) { RU.tR = tR1; RU.span = span1; ruClamp(); S.dirty = true; return; }
    RU.anim = { fn, t0: performance.now(), dur: REDUCED ? 1 : d, end: [tR1, span1] };
  }
  function ruFocus(item, dur) {
    if (item.kind === 'unit') {
      const a = Math.min(item.a * 1e6, T_BB), b = item.b * 1e6;
      const w = (a - b) * 1.22 + 10;
      ruFly(b - (a - b) * 0.11 - (item.b === 0 ? w * 0.02 : 0), w, dur);
    } else {
      const span = clamp(item.ya * 0.55, 60, RU.maxSpan);
      ruFly(item.ya - span * 0.5, span, dur);
    }
  }
  const RU_PRESETS = [
    ['Вся история', () => ruFly(-T_BB * 0.02, RU.maxSpan)],
    ['Земля', () => ruFly(-4.7e7, 4.72e9)],
    ['Фанерозой', () => ruFly(-8e6, 5.6e8)],
    ['Мезозой', () => ruFly(5.6e7, 2.08e8)],
    ['Кайнозой', () => ruFly(-1.5e6, 7.1e7)],
    ['Род Homo', () => ruFly(-6e4, 3.7e6)],
    ['Наш вид', () => ruFly(-6000, 3.3e5)],
    ['Цивилизация', () => ruFly(-120, 1.25e4)],
    ['300 лет', () => ruFly(-6, 310)],
  ];
  (function buildChips() {
    const box = $('#ruler-chips');
    RU_PRESETS.forEach(([name, fn]) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = name;
      b.addEventListener('click', fn);
      box.appendChild(b);
    });
  })();
  const rulerRead = $('#ruler-read');
  let ruReadKey = '';
  function updateRuRead() {
    const pxY = RU.span / (RU.x1 - RU.x0);
    const a = fmtY(RU.span, 3) + ' ' + yearsWord(RU.span);
    const b = pxY >= 1 ? fmtY(pxY, 2) + ' ' + yearsWord(pxY) : num(pxY * 365.25, pxY * 365.25 < 10 ? 1 : 0) + ' ' + plural(Math.round(pxY * 365.25), 'день', 'дня', 'дней');
    const html = 'На экране <b>' + esc(typo(a)) + '</b> · 1 пиксель ≈ <b>' + esc(typo(b)) + '</b>';
    if (html !== ruReadKey) { ruReadKey = html; rulerRead.innerHTML = html; }
  }

  /* =====================================================================
     КАЛЕНДАРЬ САГАНА — вся история как один год
     ===================================================================== */
  const LEVELS = [
    { key: 'year', dur: YEAR_S, cell: 86400 },
    { key: 'day', dur: 86400, cell: 3600, n: 24 },
    { key: 'hour', dur: 3600, cell: 60, n: 60 },
    { key: 'min', dur: 60, cell: 1, n: 60 },
    { key: 'sec', dur: 1, cell: 0.1, n: 10 },
  ];
  const CA = { level: 0, c0: 0, trans: null, cells: [], hits: [], grid: null, flash: null };
  function caCols(level) {
    if (MOBILE) return [0, 4, 6, 6, 2][level];
    return [0, 6, 10, 10, 5][level];
  }
  function caLayout() {
    const m = MOBILE;
    CA.grid = m
      ? { x: VR.x + 12, y: VR.y + 58, w: VR.w - 24, h: VR.h - 58 - 62 }
      : { x: VR.x + 30, y: VR.y + 96, w: VR.w - 30 - 44, h: VR.h - 96 - 176 };
  }
  // раскладка клеток уровня в заданный прямоугольник
  function caCells(level, c0, G) {
    const L = LEVELS[level];
    const cells = [];
    if (level === 0) {
      const lab = MOBILE ? 34 : 86, note = MOBILE ? 0 : 236, top = MOBILE ? 0 : 22;
      const gw = G.w - lab - note, gx = G.x + lab;
      const gap = MOBILE ? 1 : 2;
      const cw = Math.min(30, (gw - gap * 30) / 31);
      const rh = Math.min(50, (G.h - top) / 12);
      const ch = rh - (MOBILE ? 4 : 6);
      let doy = 0;
      for (let m = 0; m < 12; m++) {
        for (let d = 0; d < MDAYS[m]; d++) {
          cells.push({ x: gx + d * (cw + gap), y: G.y + top + m * rh, w: cw, h: ch, c0: doy * 86400, c1: (doy + 1) * 86400, m, d: d + 1 });
          doy++;
        }
      }
      CA.year = { gx, cw, gap, rh, ch, lab, top, noteX: gx + 31 * (cw + gap) + 14 };
      return cells;
    }
    const cols = caCols(level), rows = Math.ceil(L.n / cols);
    const gap = MOBILE ? 4 : 6;
    let cw = (G.w - gap * (cols - 1)) / cols, ch = (G.h - gap * (rows - 1)) / rows;
    cw = Math.min(cw, MOBILE ? 180 : 200);
    ch = Math.min(ch, level === 4 ? (MOBILE ? 150 : 250) : MOBILE ? 110 : 150);
    const tw = cols * cw + gap * (cols - 1), th = rows * ch + gap * (rows - 1);
    const ox = G.x + (G.w - tw) / 2, oy = G.y + Math.max(0, (G.h - th) / 2 - (MOBILE ? 0 : 20));
    for (let i = 0; i < L.n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      cells.push({ x: ox + c * (cw + gap), y: oy + r * (ch + gap), w: cw, h: ch, c0: c0 + i * L.cell, c1: c0 + (i + 1) * L.cell, i });
    }
    return cells;
  }
  function cellColors(c, level) {
    const yaOld = yaOf(c.c0), yaYoung = Math.max(0, yaOf(c.c1));
    if (yaYoung >= T_SUN) return [{ f0: 0, f1: 1, col: rgbStr(cosmicRGB((yaOld + yaYoung) / 2)), cosmic: true }];
    const segs = segments(yaOld, yaYoung, level === 0 ? 2 : 3);
    const tot = yaOld - yaYoung;
    let acc = 0;
    return segs.map((s) => {
      const f0 = acc / tot; acc += s.a - s.b;
      const cosmic = s.unit === COSMOS;
      return { f0, f1: acc / tot, col: cosmic ? rgbStr(cosmicRGB((s.a + s.b) / 2)) : s.unit.col, unit: s.unit, cosmic };
    });
  }
  function timeLabel(cs, level) {
    const p = calParts(cs);
    if (level === 1) return pad2(p.hh) + ':00';
    if (level === 2) return pad2(p.hh) + ':' + pad2(p.mm);
    if (level === 3) return pad2(p.hh) + ':' + pad2(p.mm) + ':' + pad2(Math.round(p.ss) % 60);
    return num(p.ss % 60, 1, false) + ' с';
  }
  // перенос строк; слишком длинное слово переносится по слогам (упрощённые правила русского переноса)
  const VOW = 'аеёиоуыэюяАЕЁИОУЫЭЮЯ';
  const isV = (ch) => VOW.includes(ch);
  function hyphenate(ctx, font, word, maxW) {
    for (let i = word.length - 2; i >= 2; i--) {
      const L = word.slice(0, i), R = word.slice(i);
      if ('ьъйЬЪЙ'.includes(word[i])) continue;
      if (!isV(word[i - 1]) && isV(word[i])) continue;
      if (![...L].some(isV) || ![...R].some(isV)) continue;
      if (textW(ctx, font, L + '-', 0) <= maxW) return [L + '-', R];
    }
    return null;
  }
  function wrap(ctx, font, str, maxW) {
    const words = str.split(' '), lines = [];
    let cur = '';
    for (let w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (textW(ctx, font, t, 0) <= maxW) { cur = t; continue; }
      if (cur) { lines.push(cur); cur = ''; }
      while (textW(ctx, font, w, 0) > maxW) {
        const h = hyphenate(ctx, font, w, maxW);
        if (!h) break;
        lines.push(h[0]);
        w = h[1];
      }
      cur = w;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  const evIn = (c0, c1) => EVENTS.filter((e) => { const cs = calSec(e.ya); return cs >= c0 && cs < c1; });

  function caDrawLevel(ctx, level, c0, cells, alpha) {
    ctx.globalAlpha = alpha;
    const hits = [];
    if (level === 0) caYearDecor(ctx);
    const r = rng(1234 + level);
    for (const c of cells) {
      const cols = cellColors(c, level);
      for (const s of cols) {
        ctx.fillStyle = s.col;
        const x0 = c.x + c.w * s.f0, x1 = c.x + c.w * s.f1;
        ctx.fillRect(x0, c.y, Math.max(0.6, x1 - x0 + (s.f1 < 1 ? 0.3 : 0)), c.h);
      }
      if (level === 0 && c.c0 === 0) {
        const g = ctx.createLinearGradient(c.x, 0, c.x + c.w, 0);
        g.addColorStop(0, 'rgba(255,250,236,1)');
        g.addColorStop(0.12, 'rgba(255,214,150,0.95)');
        g.addColorStop(0.5, 'rgba(160,70,60,0.35)');
        g.addColorStop(1, 'rgba(60,27,31,0)');
        ctx.fillStyle = g;
        ctx.fillRect(c.x, c.y, c.w, c.h);
      }
      if (cols[0].cosmic && level === 0) {
        for (let k = 0; k < 2; k++) {
          const m = r();
          if (m < 0.35) continue;
          ctx.fillStyle = `rgba(236,232,255,${0.2 + m * 0.4})`;
          ctx.fillRect(c.x + 2 + r() * (c.w - 4), c.y + 2 + r() * (c.h - 4), 1, 1);
        }
      }
      if (level > 0) caCellText(ctx, c, level, cols, hits);
      else {
        for (const e of evIn(c.c0, c.c1)) {
          const f = (calSec(e.ya) - c.c0) / (c.c1 - c.c0);
          const x = c.x + clamp(f, 0.15, 0.85) * c.w, y = c.y + c.h / 2;
          ctx.fillStyle = cols[0].cosmic ? INK : 'rgba(20,16,12,0.85)';
          ctx.beginPath(); ctx.arc(x, y, e.p === 1 ? 2.6 : 1.9, 0, TAU); ctx.fill();
          if (!cols[0].cosmic) { ctx.strokeStyle = 'rgba(255,252,244,0.9)'; ctx.lineWidth = 1; ctx.stroke(); }
        }
      }
    }
    ctx.globalAlpha = 1;
    return hits;
  }

  // подписи года: месяцы, дни, ключевые даты справа
  const YEAR_NOTES = ['bb', 'noon', 'sun', 'life', 'goe', 'euk', 'cambrian_ex', 'dinos', 'kpg'];
  function caYearDecor(ctx) {
    const Y = CA.year, G = CA.grid;
    ctx.textBaseline = 'middle';
    for (let m = 0; m < 12; m++) {
      const y = G.y + Y.top + m * Y.rh + Y.ch / 2;
      ctx.textAlign = 'right';
      ctx.font = MOBILE ? `500 12px ${MONO}` : `500 13px ${SANS}`;
      ctx.fillStyle = m === 11 ? INK : 'rgba(238,230,214,0.66)';
      ctx.fillText(MOBILE ? MONTHS_SHORT[m] : MONTHS_NOM[m], Y.gx - (MOBILE ? 6 : 14), y);
      if (MOBILE) continue;
      // ключевые события месяца
      const evs = YEAR_NOTES.map((id) => D.byId[id]).filter((e) => calParts(calSec(e.ya)).m === m);
      ctx.textAlign = 'left';
      const step = evs.length > 2 ? 13 : 16;
      let yy = y - ((evs.length - 1) * step) / 2;
      for (const e of evs) {
        const p = calParts(calSec(e.ya));
        ctx.font = `500 11.5px ${MONO}`;
        ctx.fillStyle = 'rgba(238,230,214,0.55)';
        ctx.fillText(pad2(p.d), Y.noteX, yy);
        ctx.font = `500 13px ${SANS}`;
        ctx.fillStyle = 'rgba(238,230,214,0.9)';
        ctx.fillText(e.label, Y.noteX + 26, yy);
        yy += step;
      }
    }
    if (!MOBILE) {
      ctx.textAlign = 'center';
      ctx.font = `500 12px ${MONO}`;
      ctx.fillStyle = 'rgba(238,230,214,0.5)';
      for (const d of [1, 5, 10, 15, 20, 25, 31]) ctx.fillText(String(d), Y.gx + (d - 1) * (Y.cw + Y.gap) + Y.cw / 2, G.y + 8);
      // линия полуночи
      const last = G.y + Y.top + 11 * Y.rh;
      ctx.fillStyle = INK;
      ctx.fillRect(Y.gx + 31 * (Y.cw + Y.gap) - Y.gap / 2 + 1, last - 5, 1.5, Y.ch + 10);
    }
  }

  function caCellText(ctx, c, level, cols, hits) {
    const main = cols[cols.length - 1];
    const ink = main.cosmic ? INK : inkFor(main.col);
    const inkDim = ink.replace(/[\d.]+\)$/, '0.62)');
    const pad = c.w > 100 ? 9 : 7;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const fsT = MOBILE ? 11 : 12;
    ctx.font = `500 ${fsT}px ${MONO}`;
    ctx.fillStyle = inkDim;
    ctx.fillText(timeLabel(c.c0, level), c.x + pad, c.y + pad - 1);
    // начало нового подразделения внутри клетки
    let y = c.y + pad + fsT + 6;
    for (const s of cols) {
      if (!s.unit || s.cosmic) continue;
      if (s.f0 > 0 || c === CA.cells[0]) {
        const fs = MOBILE ? 11 : 12;
        const font = `600 ${fs}px ${SANS}`;
        if (c.w < 70) break;
        const nm = s.unit.full || s.unit.name;
        if (textW(ctx, font, nm, 0) > c.w - pad * 2 - (s.f0 > 0 ? 0 : 0)) break;
        ctx.font = font;
        ctx.fillStyle = inkFor(s.unit.col);
        const tx = s.f0 > 0 ? Math.min(c.x + c.w * s.f0 + 5, c.x + c.w - pad - textW(ctx, font, nm, 0)) : c.x + pad;
        ctx.fillText(nm, tx, c.y + c.h - pad - fs);
      }
    }
    // события в клетке: риска на верхнем крае — точное время внутри клетки
    const evs = evIn(c.c0, c.c1).sort((a, b) => b.ya - a.ya);
    const lineH0 = MOBILE ? 14 : 15;
    const bottomLimit = c.y + c.h - pad - 15;
    const maxW = c.w - pad * 2;
    let shown = 0;
    for (const e of evs) {
      const f = (calSec(e.ya) - c.c0) / (c.c1 - c.c0);
      const xT = c.x + clamp(f, 0.02, 0.98) * c.w;
      ctx.fillStyle = ink;
      ctx.fillRect(Math.round(xT) - 0.75, c.y, 1.5, e.p === 1 ? 7 : 5);
      const hitDot = { e, x0: xT - 7, x1: xT + 7, y0: c.y - 2, y1: c.y + 12 };
      if (c.w < 60) { hits.push(hitDot); continue; }
      // кегль под ширину клетки: 12,5 → 11
      let fs = MOBILE ? 11.5 : 12.5, lines = null, font = null;
      for (; fs >= 11; fs -= 0.5) {
        font = `${e.p === 1 ? 600 : 500} ${fs}px ${SANS}`;
        lines = wrap(ctx, font, typo(e.label), maxW);
        if (lines.length <= 2 && lines.every((ln) => textW(ctx, font, ln, 0) <= maxW)) break;
      }
      if (fs < 11) { fs = 11; font = `${e.p === 1 ? 600 : 500} 11px ${SANS}`; lines = wrap(ctx, font, typo(e.label), maxW).slice(0, 3); }
      const lineH = lineH0;
      const need = lines.length * lineH + 13;
      if (y + need > bottomLimit + 14) { hits.push(hitDot); continue; }
      ctx.font = font;
      ctx.fillStyle = ink;
      const y0 = y;
      let wMax = 0;
      for (let ln of lines) {
        while (textW(ctx, font, ln, 0) > maxW && ln.length > 2) ln = ln.slice(0, -2) + '…';
        ctx.fillText(ln, c.x + pad, y);
        wMax = Math.max(wMax, textW(ctx, font, ln, 0));
        y += lineH;
      }
      ctx.font = `500 11px ${MONO}`;
      ctx.fillStyle = inkDim;
      const tl = calLabel(e.ya);
      ctx.fillText(tl.includes(', ') ? tl.split(', ')[1] : tl, c.x + pad, y);
      y += 16;
      shown++;
      hits.push({ e, x0: c.x + pad - 2, x1: c.x + pad + Math.max(wMax, 60) + 2, y0: y0 - 2, y1: y - 2 }, hitDot);
    }
    if (evs.length > shown && c.w >= 60) {
      const more = evs.length - shown;
      ctx.font = `500 11px ${MONO}`;
      ctx.fillStyle = inkDim;
      const t = shown ? '+ ещё ' + more : more + ' ' + plural(more, 'событие', 'события', 'событий');
      if (y < c.y + c.h - pad - 12) ctx.fillText(typo(t), c.x + pad, Math.min(y, c.y + c.h - pad - 26));
    }
  }

  // вывод под сеткой: одна фраза на уровень, числа — из тех же данных
  function caCaption() {
    const e = D.byId;
    const ago = (id) => YEAR_S - calSec(e[id].ya);
    if (CA.level === 0) return 'Земля появляется только ' + calLabel(e.earth.ya) + ' — через восемь месяцев.';
    if (CA.c0 < YEAR_S - 86400 - 1e-6) return '';
    if (CA.level === 1) return 'Динозавры вымерли вчера утром, а люди прямоходящие появились за час с небольшим до полуночи.';
    if (CA.level === 2) return 'Наш вид появился за ' + Math.round(ago('sapiens') / 60) + ' минут до полуночи.';
    if (CA.level === 3) return 'Вся письменная история — последние ' + Math.round(ago('writing')) + ' секунд.';
    return 'Жизнь человека в 80 лет длится здесь ' + num(80 / YPS, 2) + ' секунды.';
  }

  function caDraw(ctx, t) {
    const tr = CA.trans;
    if (!tr) {
      CA.hits = caDrawLevel(ctx, CA.level, CA.c0, CA.cells, 1);
      caOverlay(ctx);
      return;
    }
    const p = ease(clamp((t - tr.t0) / tr.dur, 0, 1));
    const rect = tr.rect; // клетка старого уровня, из которой растёт новый
    const full = tr.full;  // габарит новой сетки
    // старый уровень: растягиваем так, чтобы клетка заняла всю сетку
    const inOld = tr.dir > 0;
    const pp = inOld ? p : 1 - p;
    const sx = lerp(1, full.w / rect.w, pp), sy = lerp(1, full.h / rect.h, pp);
    const tx = lerp(0, full.x - rect.x * (full.w / rect.w), pp), ty = lerp(0, full.y - rect.y * (full.h / rect.h), pp);
    const oldCells = inOld ? tr.fromCells : CA.cells, oldLevel = inOld ? tr.fromLevel : CA.level, oldC0 = inOld ? tr.fromC0 : CA.c0;
    const newCells = inOld ? CA.cells : tr.fromCells, newLevel = inOld ? CA.level : tr.fromLevel, newC0 = inOld ? CA.c0 : tr.fromC0;
    ctx.save();
    ctx.setTransform(DPR * sx, 0, 0, DPR * sy, DPR * tx, DPR * ty);
    caDrawLevel(ctx, oldLevel, oldC0, oldCells, clamp(1 - pp * 1.6, 0, 1));
    ctx.restore();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // новый уровень вырастает из клетки
    const k = pp;
    const nsx = lerp(rect.w / full.w, 1, k), nsy = lerp(rect.h / full.h, 1, k);
    const ntx = lerp(rect.x - full.x * (rect.w / full.w), 0, k), nty = lerp(rect.y - full.y * (rect.h / full.h), 0, k);
    ctx.save();
    ctx.setTransform(DPR * nsx, 0, 0, DPR * nsy, DPR * ntx, DPR * nty);
    caDrawLevel(ctx, newLevel, newC0, newCells, clamp((pp - 0.25) / 0.75, 0, 1));
    ctx.restore();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (t - tr.t0 >= tr.dur) { CA.trans = null; S.dirty = true; }
  }
  function caOverlay(ctx) {
    const onPath = CA.c0 + LEVELS[CA.level].dur >= YEAR_S - 1e-6;
    const last = CA.cells[CA.cells.length - 1];
    // клетка, в которой полночь, — отмечаем
    if (CA.level < 4 && onPath) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(last.x - 2.5, last.y - 2.5, last.w + 5, last.h + 5);
    }
    if (CA.level === 4 && onPath) {
      ctx.font = `600 12px ${MONO}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = inkFor('#FEF2E0');
      ctx.fillText('ПОЛНОЧЬ · СЕЙЧАС', last.x + last.w - 9, last.y + last.h - 8);
    }
    // вывод под сеткой
    const cap = caCaption();
    if (cap && !MOBILE) {
      const b = caBounds(CA.cells);
      const font = `italic 300 25px ${SERIF}`;
      ctx.font = font;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(238,230,214,0.92)';
      const x = CA.level === 0 ? CA.year.gx : b.x;
      const lines = wrap(ctx, font, typo(cap), VR.x + VR.w - 40 - x);
      let y = Math.min(b.y + b.h + 24, H - 116 - (lines.length - 1) * 30);
      for (const ln of lines.slice(0, 2)) { ctx.fillText(ln, x, y); y += 30; }
    }
  }
  function caBounds(cells) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cells) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x + c.w); y1 = Math.max(y1, c.y + c.h); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function caGo(level, c0, fromCell, dir) {
    const tr = {
      fromLevel: CA.level, fromC0: CA.c0, fromCells: CA.cells,
      t0: performance.now(), dur: REDUCED ? 1 : 760, dir,
    };
    CA.level = level; CA.c0 = c0;
    CA.cells = caCells(level, c0, CA.grid);
    if (dir > 0) { tr.rect = fromCell; tr.full = caBounds(CA.cells); }
    else {
      // выходим наружу: ищем клетку нового уровня, в которой лежал старый
      const holder = CA.cells.find((c) => tr.fromC0 >= c.c0 - 1e-9 && tr.fromC0 < c.c1) || CA.cells[CA.cells.length - 1];
      tr.rect = holder; tr.full = caBounds(tr.fromCells);
    }
    CA.trans = tr;
    CA.hits = [];
    S.dirty = true;
    updateCrumbs();
    select(null);
  }
  function caEnter(cell) {
    if (CA.level >= 4) return;
    caGo(CA.level + 1, cell.c0, cell, 1);
  }
  function caUp() {
    if (CA.level === 0) return;
    const L = LEVELS[CA.level - 1];
    const parentDur = CA.level - 1 === 0 ? YEAR_S : L.dur;
    const c0 = CA.level - 1 === 0 ? 0 : Math.floor(CA.c0 / parentDur + 1e-9) * parentDur;
    caGo(CA.level - 1, c0, null, -1);
  }
  function caDive() {
    if (CA.level >= 4) return;
    const L = LEVELS[CA.level];
    const onPath = CA.c0 + L.dur >= YEAR_S - 1e-6;
    if (onPath) {
      caEnter(CA.cells[CA.cells.length - 1]);
    } else {
      CA.level = 0; CA.c0 = 0; CA.cells = caCells(0, 0, CA.grid);
      caGo(1, YEAR_S - 86400, CA.cells[CA.cells.length - 1], 1);
    }
  }
  // уровень, на котором момент виден лучше всего
  function caFocus(item) {
    const ya = item.kind === 'event' ? item.ya : Math.min(item.a * 1e6, T_BB);
    const cs = calSec(ya), left = YEAR_S - cs;
    let level = 0;
    if (left <= 1) level = 4; else if (left <= 60) level = 3; else if (left <= 3600) level = 2; else if (left <= 86400) level = 1;
    const c0 = level === 0 ? 0 : YEAR_S - LEVELS[level].dur;
    CA.level = level; CA.c0 = c0; CA.trans = null;
    CA.cells = caCells(level, c0, CA.grid);
    CA.flash = { ya, t0: performance.now() };
    updateCrumbs();
    S.dirty = true;
    if (!S.sel) renderCard();
  }
  function caPick(x, y) {
    for (const h of CA.hits) if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h.e;
    return null;
  }
  const caCellAt = (x, y) => CA.cells.find((c) => x >= c.x - 1 && x <= c.x + c.w + 1 && y >= c.y - 1 && y <= c.y + c.h + 1) || null;
  function caFx(ctx, t) {
    if (CA.trans) return;
    const hc = S.hoverCell;
    if (hc) {
      ctx.strokeStyle = 'rgba(255,252,244,0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hc.x - 1, hc.y - 1, hc.w + 2, hc.h + 2);
    }
    if (CA.flash) {
      const age = (t - CA.flash.t0) / 1000;
      if (age > 3) { CA.flash = null; S.fxDirty = true; }
      else {
        const cs = calSec(CA.flash.ya);
        const c = CA.cells.find((cc) => cs >= cc.c0 && cs < cc.c1);
        if (c) {
          const a = 0.9 * (1 - age / 3), k = (age * 1.3) % 1;
          ctx.strokeStyle = `rgba(255,255,255,${a})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(c.x - 3 - k * 6, c.y - 3 - k * 6, c.w + 6 + k * 12, c.h + 6 + k * 12);
        }
      }
    }
  }
  const crumbsEl = $('#crumbs'), calRead = $('#cal-read'), calUp = $('#cal-up'), calDive = $('#cal-dive');
  function levelName(level, c0) {
    const p = calParts(c0);
    if (level === 0) return 'Год';
    if (level === 1) return dateStr(p);
    if (level === 2) return pad2(p.hh) + ':00–' + pad2(p.hh) + ':59';
    if (level === 3) return pad2(p.hh) + ':' + pad2(p.mm);
    return pad2(p.hh) + ':' + pad2(p.mm) + ':' + pad2(Math.round(p.ss) % 60);
  }
  function updateCrumbs() {
    let html = '';
    for (let l = 0; l <= CA.level; l++) {
      const dur = l === 0 ? YEAR_S : LEVELS[l].dur;
      const c0 = l === 0 ? 0 : Math.floor(CA.c0 / dur + 1e-9) * dur;
      if (l) html += '<span class="sep" aria-hidden="true">›</span>';
      html += `<button type="button" data-l="${l}" ${l === CA.level ? 'aria-current="true"' : ''}>${esc(levelName(l, c0))}</button>`;
    }
    crumbsEl.innerHTML = html;
    crumbsEl.scrollLeft = crumbsEl.scrollWidth;
    const L = LEVELS[CA.level];
    const per = ['день', 'час', 'минута', 'секунда', '0,1 секунды'][CA.level];
    const yrs = L.cell * YPS;
    calRead.innerHTML = 'Клетка — ' + per + ' ≈ <b>' + esc(typo(fmtY(yrs, 3) + ' ' + yearsWord(yrs))) + '</b>';
    calUp.disabled = CA.level === 0;
    calDive.disabled = CA.level >= 4;
  }
  crumbsEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-l]');
    if (!b) return;
    const l = +b.dataset.l;
    while (CA.level > l) { const tgt = CA.level - 1; caUp(); if (CA.level !== tgt) break; }
  });

  /* =====================================================================
     КАРТОЧКА
     ===================================================================== */
  const ICON_CAL = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5.5h14v11.5H3z M3 9h14 M7 3v4 M13 3v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  const MODE_NAMES = { spiral: 'Спираль', ruler: 'Линейка', calendar: 'Календарь' };
  function linksHTML() {
    const ms = ['spiral', 'ruler', 'calendar'].filter((m) => m !== S.mode);
    return '<ul class="card-links">' + ms.map((m) => `<li><button type="button" data-go="${m}">Показать: ${MODE_NAMES[m].toLowerCase()}</button></li>`).join('') + '</ul>';
  }
  const CLOSE = '<button type="button" class="card-x" data-x aria-label="Закрыть описание"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>';
  function cardHTML(it) {
    if (!it) return defaultCard();
    return CLOSE + cardBody(it);
  }
  function cardBody(it) {
    if (it.kind === 'now') {
      return `<p class="card-kicker"><i class="sw" style="background:#fef2e0"></i>центр спирали</p><h2>Сейчас</h2>
        <p class="card-range">${T(String(Math.floor(D.NOW)) + ' год')}</p>
        <p class="card-desc">${T('Все витки сходятся сюда. Чем ближе к центру, тем короче виток по времени: последний видимый — это уже годы и месяцы.')}</p>`;
    }
    if (it.kind === 'event') {
      const u = unitAt(it.ya, 3);
      return `<p class="card-kicker"><i class="sw" style="background:${u === COSMOS ? rgbStr(cosmicRGB(it.ya)) : u.col}"></i>${T('событие · ' + it.cat)}</p>
        <h2>${T(it.name)}</h2>
        <p class="card-range">${T(it.when)}</p>
        <p class="card-cal">${ICON_CAL}<span>${T('В календаре: ' + calLabel(it.ya))}</span></p>
        <p class="card-desc">${T(it.desc)}</p>${linksHTML()}`;
    }
    const dur = unitDur(it);
    const ya0 = Math.min(it.a * 1e6, T_BB), ya1 = it.b * 1e6;
    return `<p class="card-kicker"><i class="sw" style="background:${it.cosmic ? '#34307a' : it.col}"></i>${T(rankLabel(it))}</p>
      <h2>${T(unitTitle(it))}</h2>
      <p class="card-range">${T(unitRange(it))}${dur ? ' <span class="dim">·\u00A0' + T(dur).replace(/ /g, '\u00A0') + '</span>' : ''}</p>
      <p class="card-cal">${ICON_CAL}<span>${T('В календаре: ' + calRange(ya0, ya1))}</span></p>
      ${it.desc ? `<p class="card-desc">${T(it.desc)}</p>` : ''}${linksHTML()}`;
  }
  function defaultCard() {
    if (S.mode === 'spiral') {
      return `<p class="card-kicker">как читать спираль</p><h2>Один виток\u00A0—\u00A0×10</h2>
        <p class="card-desc">${T('Внешний виток — от 13,8 до 1,4 млрд лет назад, следующий — до 140 млн, дальше — до 14 млн… В центре — сегодняшний день.')}</p>
        <p class="card-desc">${T('Поперёк витка — ярусы шкалы ICS: эон, эра, период, эпоха. В тёмной бороздке между витками — события.')}</p>
        <p class="card-desc">${T(S.touch ? 'Крутите спираль пальцем или разведите два пальца — приблизитесь к сегодняшнему дню. Коснитесь слоя, чтобы узнать, что это.' : 'Колесо или ползунок — ближе к сегодняшнему дню, спираль можно крутить. Наведите на слой — узнаете, что это.')}</p>`;
    }
    if (S.mode === 'ruler') {
      const px = (3e5 / T_BB) * 1000;
      return `<p class="card-kicker">честный масштаб</p><h2>Время — линейно</h2>
        <p class="card-desc">${T('Если растянуть всю историю на 1000 пикселей, наш вид займёт ' + num(px, 2) + ' пикселя, а вся письменная история — ' + num((5200 / T_BB) * 1000, 4) + '.')}</p>
        <p class="card-desc">${T(S.touch ? 'Сведите или разведите пальцы, чтобы менять масштаб. Коснитесь слоя, чтобы приблизить его.' : 'Колесо — масштаб, перетаскивание — сдвиг, клик по слою — приблизить его. Или выберите готовый масштаб внизу.')}</p>`;
    }
    // календарь. На уровне года — последний день (самое поразительное),
    // глубже — события текущего окна; даты считаются из тех же данных
    if (CA.level === 0) {
      const pick = ['antarctica', 'lucy', 'sapiens', 'farming', 'writing', 'print', 'gagarin'];
      const rows = pick.map((id) => {
        const e = D.byId[id];
        const when = calLabel(e.ya).replace('31 декабря, ', '');
        return `<li><button type="button" data-ev="${id}"><time>${esc(when)}</time><span>${T(e.name)}</span></button></li>`;
      }).join('');
      return `<p class="card-kicker">космический календарь</p><h2>Вся история\u00A0— один год</h2>
        <p class="card-desc">${T('1 января — Большой взрыв, полночь 31 декабря — сейчас. День — 37,8 млн лет, секунда — 437 лет. Вот что случилось в последний день:')}</p>
        <ul class="sagan">${rows}</ul>`;
    }
    const L = LEVELS[CA.level];
    const evs = evIn(CA.c0, CA.c0 + L.dur).sort((a, b) => b.ya - a.ya);
    const yrs = L.cell * YPS;
    const per = ['', 'час', 'минута', 'секунда', '0,1 секунды'][CA.level];
    const title = CA.level === 4 ? 'Последняя секунда' : levelName(CA.level, CA.c0);
    const max = MOBILE ? 6 : 8;
    const rows = evs.slice(0, max).map((e) => {
      let when = calLabel(e.ya);
      if (when.includes(', ')) when = when.split(', ')[1];
      return `<li><button type="button" data-ev="${e.id}"><time>${esc(when)}</time><span>${T(e.name)}</span></button></li>`;
    }).join('');
    const more = evs.length > max ? `<p class="card-desc">${T('И ещё ' + (evs.length - max) + ' — загляните глубже.')}</p>` : '';
    const empty = evs.length ? '' : `<p class="card-desc">${T('В этом окне нет отмеченных событий — время здесь течёт без нас.')}</p>`;
    return `<p class="card-kicker">космический календарь · уровень ${CA.level + 1} из 5</p><h2>${T(title)}</h2>
      <p class="card-desc">${T('Клетка — ' + per + ' ≈ ' + fmtY(yrs, 3) + ' ' + yearsWord(yrs) + '. ' + (MOBILE ? caCaption() || '' : ''))}</p>
      ${rows ? `<ul class="sagan">${rows}</ul>` : ''}${more}${empty}`;
  }
  let cardKey = '';
  function renderCard(force) {
    const it = S.sel;
    const key = S.mode + '|' + (it ? it.id || it.kind : '-') + '|' + (S.touch ? 't' : 'm') + '|' + (S.mode === 'calendar' ? CA.level + ':' + CA.c0 : '');
    if (key === cardKey && !force) return;
    cardKey = key;
    cardEl.innerHTML = cardHTML(it);
    cardEl.style.animation = 'none';
    void cardEl.offsetWidth;
    cardEl.style.animation = '';
  }
  cardEl.addEventListener('click', (e) => {
    if (e.target.closest('button[data-x]')) { select(null); return; }
    const go = e.target.closest('button[data-go]');
    if (go && S.sel) { focusIn(go.dataset.go, S.sel); return; }
    const ev = e.target.closest('button[data-ev]');
    if (ev) { const it = D.byId[ev.dataset.ev]; select(it); caFocus(it); }
  });
  function focusIn(mode, it) {
    if (mode === 'spiral') { if (it.kind !== 'now') spFocus(it); }
    if (mode === 'ruler') ruFocus(it, 1600);
    if (mode === 'calendar') caFocus(it);
    setMode(mode);
  }
  function select(it) {
    S.sel = it || null;
    S.fxDirty = true;
    renderCard();
  }

  /* ---------- подсказка у курсора ---------- */
  let tipKey = '';
  function showTip(it, x, y) {
    if (!it || S.touch) { tipEl.classList.remove('on'); tipKey = ''; return; }
    let key = it.id || it.kind;
    if (key !== tipKey) {
      tipKey = key;
      let html;
      if (it.kind === 'now') html = '<b>Сейчас</b><span class="t-sub">центр спирали</span>';
      else if (it.kind === 'event') html = `<b>${T(it.name)}</b><span class="t-sub">${T(it.when)}</span>`;
      else if (it.kind === 'cell') html = it.html;
      else html = `<b><i class="sw" style="background:${it.cosmic ? '#34307a' : it.col}"></i>${T(unitTitle(it))}</b><span class="t-sub">${T(unitRange(it))}</span>`;
      tipEl.innerHTML = html;
    }
    const r = tipEl.getBoundingClientRect();
    let tx = x + 16, ty = y + 18;
    if (tx + r.width > W - 10) tx = x - r.width - 14;
    if (ty + r.height > H - 10) ty = y - r.height - 12;
    tipEl.style.transform = `translate(${Math.round(tx)}px,${Math.round(ty)}px)`;
    tipEl.classList.add('on');
  }
  function cellTip(c) {
    const yaOld = yaOf(c.c0), yaYoung = Math.max(0, yaOf(c.c1));
    let when;
    if (CA.level === 0) when = c.d + ' ' + MONTHS[c.m];
    else {
      const a = timeLabel(c.c0, CA.level);
      when = CA.level === 4 ? '23:59:59, ' + a : a;
    }
    const cols = cellColors(c, CA.level);
    const names = cols.filter((s) => s.unit && !s.cosmic).map((s) => unitTitle(s.unit));
    const uniq = [...new Set(names)];
    const evs = evIn(c.c0, c.c1);
    const span = yaYoung > 0 ? fmtSpanAgo(yaOld, yaYoung) : fmtY(yaOld, 3) + ' ' + yearsWord(yaOld) + ' назад – сейчас';
    let html = `<b>${T(when)}</b><span class="t-sub">${T(span)}</span>`;
    html += `<span class="t-sub">${T(uniq.length ? uniq.join(' → ') : 'космос, до Солнечной системы')}</span>`;
    if (evs.length) html += `<span class="t-sub" style="color:#eee6d6">${evs.map((e) => T(e.label)).join(' · ')}</span>`;
    return { kind: 'cell', id: 'c' + c.c0 + CA.level, html };
  }

  /* =====================================================================
     РЕЖИМЫ
     ===================================================================== */
  const HINTS = {
    spiral: 'колесо — к сегодняшнему дню · спираль можно крутить',
    ruler: 'колесо — масштаб · перетаскивание — сдвиг · клик по слою — приблизить',
    calendar: '',
  };
  let modeT = 0;
  function setMode(m, instant) {
    if (m === S.mode && !instant) { S.dirty = true; renderCard(true); return; }
    const apply = () => {
      S.mode = m;
      body.classList.remove('m-spiral', 'm-ruler', 'm-calendar');
      body.classList.add('m-' + m);
      document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-selected', b.dataset.mode === m ? 'true' : 'false'));
      hintEl.textContent = typo(HINTS[m]);
      S.hover = null; S.hoverCell = null; S.fxDirty = true;
      showTip(null);
      renderCard(true);
      S.dirty = true;
      body.classList.remove('fade');
    };
    if (instant || REDUCED) { apply(); return; }
    body.classList.add('fade');
    clearTimeout(modeT);
    modeT = setTimeout(apply, 200);
  }
  document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  /* =====================================================================
     ВВОД
     ===================================================================== */
  const ptrs = new Map();
  let drag = null;
  fx.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') setTouch(true);
    fx.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) {
      drag = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, a0: Math.atan2(e.clientY - SP.cy, e.clientX - SP.cx) };
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      drag = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y), s0: SP.s, span0: RU.span, mid: (a.x + b.x) / 2, moved: true };
    }
  });
  fx.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') setTouch(false);
    const p = ptrs.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (drag && drag.pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), k = d / Math.max(20, drag.d0);
      if (S.mode === 'spiral') { SP.s = SP.sT = clamp(drag.s0 - Math.log(k) / SP.lnG, SP.sMin, U_BB); S.dirty = true; }
      if (S.mode === 'ruler') {
        const t = ruT(drag.mid);
        RU.span = drag.span0 / k;
        ruClamp();
        const frac = (drag.mid - RU.x0) / (RU.x1 - RU.x0);
        RU.tR = t - RU.span * (1 - frac);
        ruClamp(); RU.anim = null; S.dirty = true;
      }
      return;
    }
    if (drag && p) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) { drag.moved = true; fx.classList.add('drag'); interacted(); }
      if (drag.moved) {
        if (S.mode === 'spiral') {
          const a = Math.atan2(e.clientY - SP.cy, e.clientX - SP.cx);
          let da = a - drag.a0;
          if (da > Math.PI) da -= TAU; if (da < -Math.PI) da += TAU;
          drag.a0 = a;
          if (Math.hypot(e.clientX - SP.cx, e.clientY - SP.cy) > 24) {
            SP.s = SP.sT = clamp(SP.s + da / TAU, SP.sMin, U_BB);
            S.dirty = true;
          }
        } else if (S.mode === 'ruler') {
          RU.tR += (dx / (RU.x1 - RU.x0)) * RU.span;
          RU.anim = null; ruClamp(); S.dirty = true;
        }
        drag.x = e.clientX; drag.y = e.clientY;
        showTip(null);
        return;
      }
    }
    hoverAt(e.clientX, e.clientY);
  });
  const endPtr = (e) => {
    ptrs.delete(e.pointerId);
    if (drag && !drag.moved && !drag.pinch && e.type === 'pointerup') clickAt(e.clientX, e.clientY);
    if (ptrs.size === 0) { drag = null; fx.classList.remove('drag'); }
    else if (drag && drag.pinch) drag = null;
  };
  fx.addEventListener('pointerup', endPtr);
  fx.addEventListener('pointercancel', endPtr);
  fx.addEventListener('pointerleave', () => { if (!drag) { S.hover = null; S.hoverCell = null; S.cursor = null; S.fxDirty = true; showTip(null); } });
  fx.addEventListener('wheel', (e) => {
    e.preventDefault();
    interacted();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    if (S.mode === 'spiral') {
      SP.sT = clamp(SP.sT - dy * 0.0016, SP.sMin, U_BB);
    } else if (S.mode === 'ruler') {
      const t = ruT(e.clientX);
      const frac = clamp((e.clientX - RU.x0) / (RU.x1 - RU.x0), 0, 1);
      RU.anim = null;
      RU.span *= Math.exp(dy * 0.0022);
      ruClamp();
      RU.tR = t - RU.span * (1 - frac);
      ruClamp();
      S.dirty = true;
    } else if (S.mode === 'calendar' && !CA.trans) {
      if (dy < -30) { const c = caCellAt(e.clientX, e.clientY); if (c && CA.level < 4) caEnter(c); }
      if (dy > 30) caUp();
    }
    showTip(null);
  }, { passive: false });
  fx.addEventListener('dblclick', (e) => {
    if (S.mode !== 'ruler') return;
    const t = ruT(e.clientX), frac = (e.clientX - RU.x0) / (RU.x1 - RU.x0);
    const span = clamp(RU.span / 4, RU.minSpan, RU.maxSpan);
    ruFly(t - span * (1 - frac), span, 700);
  });

  function interacted() {
    if (S.interacted) return;
    S.interacted = true;
    hintEl.style.opacity = '0';
  }
  function hoverAt(x, y) {
    if (S.mode === 'ruler') { S.cursor = { x, y }; S.fxDirty = true; }
    let it = null;
    if (S.mode === 'spiral' && SP.intro >= 1) it = spPick(x, y);
    else if (S.mode === 'ruler') it = ruPick(x, y);
    else if (S.mode === 'calendar' && !CA.trans) {
      const e = caPick(x, y);
      const c = caCellAt(x, y);
      if (S.hoverCell !== c) { S.hoverCell = c; S.fxDirty = true; }
      if (e) it = e; else if (c) { showTip(cellTip(c), x, y); fx.className = 'point'; return; }
    }
    const hv = it && it.kind !== 'cell' ? it : null;
    if (hv !== S.hover) { S.hover = hv; S.fxDirty = true; }
    fx.className = it ? 'point' : S.mode === 'ruler' ? 'cross' : '';
    showTip(it, x, y);
  }
  function clickAt(x, y) {
    if (S.mode === 'spiral') {
      const it = spPick(x, y);
      select(it);
    } else if (S.mode === 'ruler') {
      const it = ruPick(x, y);
      select(it);
      if (it && it.kind === 'unit') ruFocus(it);
    } else if (S.mode === 'calendar') {
      if (CA.trans) return;
      const e = caPick(x, y);
      if (e) { select(e); return; }
      const c = caCellAt(x, y);
      if (c && CA.level < 4) caEnter(c);
    }
  }
  function setTouch(v) {
    if (S.touch === v) return;
    S.touch = v;
    renderCard(true);
  }

  document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.id === 'depth')) return;
    if (e.key === '1') setMode('spiral');
    else if (e.key === '2') setMode('ruler');
    else if (e.key === '3') setMode('calendar');
    else if (e.key === 'Escape') { if (S.mode === 'calendar' && CA.level > 0) caUp(); else select(null); }
    else if (e.key === '+' || e.key === '=') act(S.mode === 'spiral' ? 'sp-in' : S.mode === 'ruler' ? 'ru-in' : 'cal-dive');
    else if (e.key === '-' || e.key === '_') act(S.mode === 'spiral' ? 'sp-out' : S.mode === 'ruler' ? 'ru-out' : 'cal-up');
  });
  function act(a) {
    if (a === 'sp-in') SP.sT = clamp(SP.sT - 0.5, SP.sMin, U_BB);
    if (a === 'sp-out') SP.sT = clamp(SP.sT + 0.5, SP.sMin, U_BB);
    if (a === 'sp-reset') SP.sT = U_BB;
    if (a === 'ru-in' || a === 'ru-out') {
      const k = a === 'ru-in' ? 0.25 : 4;
      const c = RU.tR + RU.span / 2, span = clamp(RU.span * k, RU.minSpan, RU.maxSpan);
      ruFly(c - span / 2, span, 650);
    }
    if (a === 'cal-up') caUp();
    if (a === 'cal-dive') caDive();
  }
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));

  // шторка на телефоне
  function toggleSheet(v) {
    const open = v === undefined ? !sheet.classList.contains('open') : v;
    sheet.classList.toggle('open', open);
    body.classList.toggle('sheet-open', open);
    $('#grip').setAttribute('aria-label', open ? 'Свернуть описание' : 'Развернуть описание');
  }
  $('#grip').addEventListener('click', () => toggleSheet());
  cardEl.addEventListener('click', (e) => {
    if (!MOBILE || e.target.closest('button')) return;
    toggleSheet();
  });

  /* =====================================================================
     КАДР
     ===================================================================== */
  let lastT = performance.now();
  function drawArt(t) {
    actx.setTransform(DPR, 0, 0, DPR, 0, 0);
    actx.clearRect(0, 0, W, H);
    if (S.mode === 'spiral') spDraw(actx);
    else if (S.mode === 'ruler') ruDraw(actx);
    else caDraw(actx, t);
  }
  function drawFx(t) {
    fctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    fctx.clearRect(0, 0, W, H);
    if (S.mode === 'spiral') spFx(fctx, t);
    else if (S.mode === 'ruler') ruFx(fctx, t);
    else caFx(fctx, t);
  }
  function frame(t) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastT = t; return; }
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    S.now = t;
    // вступление спирали: время закручивается от Большого взрыва к сегодняшнему дню
    if (SP.intro < 1) {
      if (!SP.introT0) SP.introT0 = t;
      SP.intro = clamp((t - SP.introT0) / 1900, 0, 1);
      SP.s = SP.sT = U_BB + 0.16 * (1 - ease(SP.intro));
      spCenter();
      S.dirty = true;
    } else if (Math.abs(SP.s - SP.sT) > 1e-5) {
      SP.s += (SP.sT - SP.s) * (1 - Math.exp(-dt * 9));
      if (Math.abs(SP.s - SP.sT) < 1e-5) SP.s = SP.sT;
      spCenter();
      if (S.mode === 'spiral') S.dirty = true;
    }
    if (RU.anim) {
      const a = RU.anim, k = clamp((t - a.t0) / a.dur, 0, 1);
      const [c, w] = a.fn(ease(k));
      if (isFinite(c) && isFinite(w) && w > 0) { RU.span = w; RU.tR = c - w / 2; }
      if (k >= 1) { RU.tR = a.end[0]; RU.span = a.end[1]; RU.anim = null; }
      ruClamp();
      if (S.mode === 'ruler') S.dirty = true;
    }
    if (CA.trans && S.mode === 'calendar') S.dirty = true;
    if (S.dirty) {
      S.dirty = false;
      S.fxDirty = true;
      drawArt(t);
      if (S.mode === 'spiral') updateDepth();
      if (S.mode === 'ruler') updateRuRead();
    }
    // верхний слой — только когда что-то изменилось: на программном рендере полноэкранная перерисовка дорога
    if (S.fxDirty || CA.flash) { S.fxDirty = false; drawFx(t); }
  }

  /* ================= старт ================= */
  function start() {
    if (SHOT) body.classList.add('shot');
    // статичный текст — через типографику
    document.querySelectorAll('.lead').forEach((el) => { el.textContent = typo(el.textContent); });
    measure();
    CA.cells = caCells(0, 0, CA.grid);
    buildDepth();
    updateCrumbs();
    renderCard(true);
    setMode('spiral', true);
    requestAnimationFrame(frame);
  }
  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      measure();
      CA.cells = caCells(CA.level, CA.c0, CA.grid);
      CA.trans = null;
      buildDepth();
    }, 60);
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) S.dirty = true; });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { wCache.clear(); S.dirty = true; });
    const warm = [`500 12px ${SANS}`, `600 12px ${SANS}`, `500 12px ${MONO}`];
    Promise.all(warm.map((f) => document.fonts.load(f, 'АБВабв123'))).then(() => { wCache.clear(); S.dirty = true; }).catch(() => {});
  }
  start();
})();
