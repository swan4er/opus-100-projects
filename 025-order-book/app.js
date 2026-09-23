'use strict';
/* Биржевой стакан — терминал поверх движка market.js.
   Графики рисуются на Canvas, стакан и лента — обычным DOM (их обновление троттлится). */
(function () {
  const M = window.Market;
  const $ = (s) => document.querySelector(s);
  const NB = ' ', MINUS = '−';
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const C = { ink: '#e1e6ee', dim: '#8a96a8', line: '#1a212b', line2: '#273140', amber: '#ffb000', up: '#2fd07d', down: '#ff5a6e', cyan: '#47c6f2', pane: '#0c1016' };
  const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const px = (t) => (t / 100).toFixed(2).replace('.', ',');
  const sgn = (x) => (x > 0 ? '+' : x < 0 ? MINUS : '');
  const clock = (t) => { const s = 36000 + t; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; };
  function rub(v) {
    const a = Math.abs(v);
    const s = a >= 1e6 ? `${(a / 1e6).toFixed(2).replace('.', ',')}${NB}млн` : a >= 1e3 ? `${nf0.format(Math.round(a / 1e3))}${NB}тыс.` : nf0.format(Math.round(a));
    return `${sgn(v)}${s}${NB}₽`;
  }
  const WHO = { mm: 'ММ', fund: 'Ф', trend: 'Т', noise: 'Ш', prog: 'П' };
  const CLS_NAME = { mm: 'Маркетмейкеры', fund: 'Фундаменталисты', trend: 'Трендовые', noise: 'Шумовые', prog: 'Крупный продавец' };

  /* ============================ рынок и предыстория ============================ */
  // Предыстория — торговый час с сюжетом: новость, уход ликвидности, флеш-крэш, плохая новость.
  const mkt = new M.Market(20260922);
  const PRE = { 300: (m) => m.news(1), 1320: (m) => m.liquidityShock(), 2160: (m) => m.flashCrash(), 3060: (m) => m.news(-1) };
  for (let t = 1; t <= 3600; t++) { if (PRE[t]) PRE[t](mkt); mkt.step(); }
  const OPEN = 10000;
  // лента на старте уже заполнена последними сделками предыстории
  const st = { speed: 1, acc: 0, paused: false, fair: true, hover: null, seen: mkt.nTrades - mkt.tape.length, uiT: 0, depthR: 0, evKey: '' };

  /* ============================ холсты ============================ */
  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  function fit(cv) {
    const r = cv.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width * DPR)), h = Math.max(10, Math.round(r.height * DPR));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    c.clearRect(0, 0, r.width, r.height);
    return { c, w: r.width, h: r.height };
  }
  const cChart = $('#cChart'), cDepth = $('#cDepth'), cHist = $('#cHist'), cPnl = $('#cPnl');
  const depthNote = $('#depthNote');

  /* ---------- свечи ---------- */
  function drawChart() {
    const { c, w, h } = fit(cChart);
    const padR = 66, padB = 22, padT = 50, padL = 8;
    const volH = Math.max(34, (h - padB) * 0.15);
    const step = 9, body = 6;
    const n = Math.max(10, Math.floor((w - padR - padL) / step));
    const cs = mkt.candles.slice(-n);
    let lo = Infinity, hi = -Infinity;
    for (const k of cs) { lo = Math.min(lo, k.l); hi = Math.max(hi, k.h); if (st.fair) { lo = Math.min(lo, k.V); hi = Math.max(hi, k.V); } }
    const pad = (hi - lo) * 0.08 + 5;
    lo -= pad; hi += pad;
    const top = padT, bottom = h - padB - volH - 6;
    const Y = (p) => top + ((hi - p) / (hi - lo)) * (bottom - top);
    const X = (i) => padL + i * step + step / 2 + (n - cs.length) * step;
    // сетка и шкала цен
    c.font = '400 11.5px "JetBrains Mono", monospace';
    c.textBaseline = 'middle';
    const range = hi - lo;
    const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => range / s <= 7) || 1000;
    c.strokeStyle = C.line; c.lineWidth = 1;
    for (let p = Math.ceil(lo / nice) * nice; p <= hi; p += nice) {
      const y = Math.round(Y(p)) + 0.5;
      c.beginPath(); c.moveTo(padL, y); c.lineTo(w - padR, y); c.stroke();
      c.fillStyle = C.dim; c.fillText(px(p), w - padR + 8, y);
    }
    // время
    c.textBaseline = 'alphabetic';
    cs.forEach((k, i) => {
      if (Math.round(k.t0 / mkt.candleLen) % 10 !== 0) return;
      const x = X(i);
      c.strokeStyle = C.line; c.beginPath(); c.moveTo(Math.round(x) + 0.5, top); c.lineTo(Math.round(x) + 0.5, h - padB); c.stroke();
      c.fillStyle = C.dim; c.fillText(clock(k.t0).slice(0, 5), x - 16, h - 6);
    });
    // остановки торгов — штрихованные полосы
    c.save();
    cs.forEach((k, i) => {
      if (!k.halt) return;
      const x0 = X(i) - step / 2;
      c.fillStyle = 'rgba(255, 90, 110, 0.08)';
      c.fillRect(x0, 4, step, h - padB - 4);
      c.beginPath(); c.rect(x0, 4, step, h - padB - 4); c.clip();
      c.strokeStyle = 'rgba(255, 90, 110, 0.22)'; c.lineWidth = 1;
      c.beginPath();
      for (let y = -step; y < h; y += 6) { c.moveTo(x0, y + step); c.lineTo(x0 + step, y); }
      c.stroke();
      c.restore(); c.save();
    });
    c.restore();
    // справедливая цена (подпись — в легенде шапки)
    if (st.fair) {
      c.strokeStyle = C.cyan; c.lineWidth = 1.3; c.setLineDash([4, 4]);
      c.beginPath();
      cs.forEach((k, i) => { const y = Y(k.V); i ? c.lineTo(X(i), y) : c.moveTo(X(i), y); });
      c.stroke(); c.setLineDash([]);
    }
    // объём
    const vmax = Math.max(1, ...cs.map((k) => k.v));
    cs.forEach((k, i) => {
      const hh = (k.v / vmax) * volH;
      c.fillStyle = k.c >= k.o ? 'rgba(47, 208, 125, 0.35)' : 'rgba(255, 90, 110, 0.35)';
      c.fillRect(X(i) - body / 2, h - padB - hh, body, hh);
    });
    // свечи
    cs.forEach((k, i) => {
      const x = X(i);
      const col = k.c > k.o ? C.up : k.c < k.o ? C.down : C.dim;
      c.strokeStyle = col; c.lineWidth = 1;
      c.beginPath(); c.moveTo(Math.round(x) + 0.5, Y(k.h)); c.lineTo(Math.round(x) + 0.5, Y(k.l)); c.stroke();
      const y0 = Y(Math.max(k.o, k.c)), y1 = Y(Math.min(k.o, k.c));
      c.fillStyle = col;
      c.fillRect(Math.round(x - body / 2), y0, body, Math.max(1, y1 - y0));
    });
    // флажки событий: тонкая линия к свече и подпись в верхней полосе (в два ряда, без наложений)
    const FLAG = { up: ['▲ Новость +5 %', C.up], down: ['▼ Новость −5 %', C.down], liq: ['Ликвидность ушла', C.cyan], crash: ['Программа продаж', C.amber], halt: ['Стоп торгов', C.down] };
    c.font = '500 12px "IBM Plex Sans Condensed", sans-serif';
    c.textBaseline = 'middle';
    const rowEnd = [-1e9, -1e9];
    for (const e of mkt.events) {
      const f = FLAG[e.kind];
      if (!f) continue;
      const i = Math.floor((e.t - cs[0].t0) / mkt.candleLen);
      if (i < 0 || i >= cs.length) continue;
      const x = Math.round(X(i)) + 0.5, [label, col] = f;
      const tw = c.measureText(label).width + 12;
      let lx = x - 6;
      if (lx + tw > w - padR) lx = w - padR - tw;
      const row = rowEnd.findIndex((end) => lx > end + 6);
      c.strokeStyle = col; c.globalAlpha = 0.45; c.setLineDash([2, 3]);
      c.beginPath(); c.moveTo(x, row < 0 ? 8 : 18 + row * 22); c.lineTo(x, Math.max(top, Y(cs[i].h) - 4)); c.stroke();
      c.setLineDash([]); c.globalAlpha = 1;
      if (row < 0) continue;
      rowEnd[row] = lx + tw;
      const y = 8 + row * 22;
      c.fillStyle = C.pane; c.fillRect(lx, y, tw, 19);
      c.strokeStyle = col; c.strokeRect(lx + 0.5, y + 0.5, tw - 1, 18);
      c.fillStyle = col; c.fillText(label, lx + 6, y + 10);
    }
    c.textBaseline = 'alphabetic';
    // последняя цена
    const ly = Y(mkt.last);
    c.strokeStyle = C.amber; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(padL, ly); c.lineTo(w - padR, ly); c.stroke(); c.setLineDash([]);
    c.fillStyle = C.amber; c.fillRect(w - padR + 2, ly - 9, padR - 4, 18);
    c.fillStyle = '#07090c'; c.font = '700 11.5px "JetBrains Mono", monospace'; c.textBaseline = 'middle';
    c.fillText(px(mkt.last), w - padR + 7, ly);
    // перекрестье
    if (st.hover) {
      const i = Math.floor((st.hover.x - padL - (n - cs.length) * step) / step);
      const k = cs[i];
      if (k) {
        const x = X(i);
        c.strokeStyle = 'rgba(225, 230, 238, 0.35)'; c.setLineDash([3, 3]);
        c.beginPath(); c.moveTo(x, top); c.lineTo(x, h - padB); c.moveTo(padL, st.hover.y); c.lineTo(w - padR, st.hover.y); c.stroke(); c.setLineDash([]);
        const txt = `${clock(k.t0)}  О ${px(k.o)}  М ${px(k.h)}  Н ${px(k.l)}  З ${px(k.c)}  объём ${nf0.format(k.v)}`;
        c.font = '400 12px "JetBrains Mono", monospace';
        const tw = c.measureText(txt).width + 14;
        const bx = clamp(x - tw / 2, padL, w - padR - tw);
        c.fillStyle = 'rgba(7, 9, 12, 0.92)'; c.strokeStyle = C.line2;
        c.fillRect(bx, h - padB - volH - 34, tw, 22); c.strokeRect(bx + 0.5, h - padB - volH - 33.5, tw - 1, 21);
        c.fillStyle = C.ink; c.fillText(txt, bx + 7, h - padB - volH - 23);
      }
    }
  }

  /* ---------- глубина ---------- */
  function drawDepth() {
    const { c, w, h } = fit(cDepth);
    const bids = mkt.book.depth('buy', 600), asks = mkt.book.depth('sell', 600);
    const mid = mkt.mid();
    // окно — там, где лежит 85 % объёма в пределах ±3 %: в спокойствии узкое, при уходе ликвидности широкое
    const reach = (lv) => {
      let tot = 0; for (const [p, q] of lv) { if (Math.abs(p / mid - 1) > 0.03) break; tot += q; }
      let s = 0; for (const [p, q] of lv) { s += q; if (s >= tot * 0.85) return Math.abs(p / mid - 1); }
      return 0.003;
    };
    const want = clamp(Math.max(reach(bids), reach(asks)) * 1.3, 0.002, 0.03);
    st.depthR = st.depthR ? st.depthR + (want - st.depthR) * 0.2 : want;
    const pct = (st.depthR * 100).toFixed(st.depthR < 0.01 ? 1 : 0).replace('.', ',');
    if (depthNote.textContent !== `накопленный объём, ±${pct}${NB}%`) depthNote.textContent = `накопленный объём, ±${pct}${NB}%`;
    const R = mid * st.depthR;
    const lo = mid - R, hi = mid + R;
    const padB = 20, padT = 6;
    const X = (p) => ((p - lo) / (hi - lo)) * w;
    const cum = (lv, dir) => { let s = 0; const out = []; for (const [p, q] of lv) { if ((dir < 0 && p < lo) || (dir > 0 && p > hi)) break; s += q; out.push([p, s]); } return out; };
    const cb = cum(bids, -1), ca = cum(asks, 1);
    const vmax = Math.max(1, cb.length ? cb[cb.length - 1][1] : 0, ca.length ? ca[ca.length - 1][1] : 0);
    const Y = (v) => h - padB - (v / vmax) * (h - padB - padT - 10);
    const area = (arr, col, fill, dir) => {
      if (!arr.length) return;
      c.beginPath();
      c.moveTo(X(arr[0][0]), h - padB);
      let prevY = h - padB;
      for (const [p, v] of arr) { const x = X(p); c.lineTo(x, prevY); c.lineTo(x, Y(v)); prevY = Y(v); }
      c.lineTo(dir < 0 ? 0 : w, prevY);
      c.lineTo(dir < 0 ? 0 : w, h - padB);
      c.closePath();
      c.fillStyle = fill; c.fill();
      c.strokeStyle = col; c.lineWidth = 1.4; c.stroke();
    };
    area(cb, C.up, 'rgba(47, 208, 125, 0.16)', -1);
    area(ca, C.down, 'rgba(255, 90, 110, 0.16)', 1);
    c.strokeStyle = 'rgba(255, 176, 0, 0.6)'; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(X(mid), padT); c.lineTo(X(mid), h - padB); c.stroke(); c.setLineDash([]);
    c.fillStyle = C.dim; c.font = '400 11.5px "JetBrains Mono", monospace';
    c.fillText(px(lo), 4, h - 5);
    const t2 = px(hi); c.fillText(t2, w - c.measureText(t2).width - 4, h - 5);
    const tm = px(mid); c.fillStyle = C.amber; c.fillText(tm, X(mid) - c.measureText(tm).width / 2, h - 5);
    c.fillStyle = C.dim; c.fillText(nf0.format(vmax), 4, padT + 10);
  }

  /* ---------- распределение доходностей ---------- */
  function drawHist() {
    const { c, w, h } = fit(cHist);
    const r = mkt.r5;   // 5-секундные лог-доходности за последние ~2 часа
    if (r.length < 40) return;
    const mu = r.reduce((a, b) => a + b, 0) / r.length;
    const v = r.reduce((a, b) => a + (b - mu) ** 2, 0) / r.length;
    const sd = Math.sqrt(v) || 1e-9;
    const kurt = r.reduce((a, b) => a + (b - mu) ** 4, 0) / r.length / (v * v) - 3;
    $('#kurt').textContent = `5${NB}с · эксцесс ${kurt.toFixed(0).replace('-', MINUS)}, у${NB}нормы 0`;
    const B = 36, zmax = 9, bw = (2 * zmax) / B;
    const cnt = new Array(B).fill(0);
    for (const x of r) { const z = (x - mu) / sd; const k = Math.floor((z + zmax) / bw); if (k >= 0 && k < B) cnt[k]++; }
    const dens = cnt.map((k) => k / (r.length * bw));
    const padB = 20, padT = 8;
    const lmin = Math.log10(0.0006), lmax = Math.log10(2.5);
    const Y = (d) => h - padB - ((Math.log10(Math.max(d, 0.0006)) - lmin) / (lmax - lmin)) * (h - padB - padT);
    const X = (z) => ((z + zmax) / (2 * zmax)) * w;
    c.strokeStyle = C.line; c.lineWidth = 1;
    for (const d of [0.001, 0.01, 0.1]) { const y = Math.round(Y(d)) + 0.5; c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    dens.forEach((d, k) => {
      if (!d) return;
      const x0 = X(-zmax + k * bw) + 1, x1 = X(-zmax + (k + 1) * bw) - 1;
      const tail = Math.abs(-zmax + (k + 0.5) * bw) > 3;
      c.fillStyle = tail ? 'rgba(255, 176, 0, 0.85)' : 'rgba(255, 176, 0, 0.4)';
      c.fillRect(x0, Y(d), x1 - x0, h - padB - Y(d));
    });
    c.strokeStyle = C.cyan; c.lineWidth = 1.5; c.setLineDash([4, 3]);
    c.beginPath();
    for (let z = -zmax; z <= zmax; z += 0.05) { const d = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI); const y = Y(d); z === -zmax ? c.moveTo(X(z), y) : c.lineTo(X(z), y); }
    c.stroke(); c.setLineDash([]);
    c.fillStyle = C.dim; c.font = '400 11.5px "JetBrains Mono", monospace';
    for (const z of [-8, -4, 0, 4, 8]) { const t = `${z > 0 ? '+' : z < 0 ? MINUS : ''}${Math.abs(z)}σ`; c.fillText(t, X(z) - c.measureText(t).width / 2, h - 5); }
    c.font = '500 12px "IBM Plex Sans Condensed", sans-serif';
    c.fillStyle = C.cyan; c.fillText('нормальное', X(1.3), Y(0.2));
    // подпись — над тем хвостом, где наблюдений больше
    let left = 0, right = 0;
    for (const x of r) { const z = (x - mu) / sd; if (z < -4) left++; else if (z > 4) right++; }
    const tx = left >= right ? X(-zmax) + 4 : X(zmax) - c.measureText('тяжёлые хвосты').width - 4;
    c.fillStyle = C.amber; c.fillText('тяжёлые хвосты', tx, Y(0.05));
  }

  /* ---------- прибыль по типам агентов ---------- */
  function drawPnl() {
    const { c, w, h } = fit(cPnl);
    const rows = M.CLASSES.filter((k) => k !== 'prog' || mkt.pnl.prog.pos !== 0 || mkt.pnl.prog.cash !== 0)
      .map((k) => [k, (mkt.pnl[k].cash + mkt.pnl[k].pos * mkt.last) / 100]);
    const vmax = Math.max(1, ...rows.map((r) => Math.abs(r[1])));
    const lab = 132, valW = 96;
    const cx = lab + (w - lab - valW) / 2;
    const half = (w - lab - valW) / 2 - 6;
    const rh = Math.min(30, (h - 16) / rows.length);
    c.strokeStyle = C.line2; c.beginPath(); c.moveTo(cx + 0.5, 4); c.lineTo(cx + 0.5, h - 6); c.stroke();
    rows.forEach(([k, v], i) => {
      const y = 8 + i * rh;
      c.fillStyle = C.ink; c.font = '500 13px "IBM Plex Sans Condensed", sans-serif'; c.textBaseline = 'middle';
      c.fillText(CLS_NAME[k], 4, y + rh / 2 - 2);
      const len = (Math.abs(v) / vmax) * half;
      c.fillStyle = v >= 0 ? 'rgba(47, 208, 125, 0.75)' : 'rgba(255, 90, 110, 0.75)';
      c.fillRect(v >= 0 ? cx : cx - len, y + 5, len, rh - 14);
      c.fillStyle = v >= 0 ? C.up : C.down; c.font = '500 12.5px "JetBrains Mono", monospace';
      const t = rub(v);
      c.fillText(t, w - c.measureText(t).width - 4, y + rh / 2 - 2);
    });
    c.textBaseline = 'alphabetic';
  }

  /* ============================ стакан и лента ============================ */
  const LEVELS = 10;
  const ladder = $('#ladder');
  const rows = [];
  for (let i = 0; i < LEVELS * 2 + 1; i++) {
    const r = document.createElement('div');
    r.className = 'lrow ' + (i < LEVELS ? 'ask' : i === LEVELS ? 'mid' : 'bid');
    r.innerHTML = '<span class="b"><i></i><u></u></span><span class="p"></span><span class="a"><i></i><u></u></span>';
    ladder.appendChild(r);
    rows.push({ el: r, b: r.querySelector('.b u'), bi: r.querySelector('.b i'), p: r.querySelector('.p'), a: r.querySelector('.a u'), ai: r.querySelector('.a i') });
  }
  function updateLadder() {
    const asks = mkt.book.depth('sell', LEVELS), bids = mkt.book.depth('buy', LEVELS);
    const vmax = Math.max(1, ...asks.map((x) => x[1]), ...bids.map((x) => x[1]));
    for (let i = 0; i < LEVELS; i++) {
      const lv = asks[LEVELS - 1 - i], r = rows[i];
      r.p.textContent = lv ? px(lv[0]) : '—';
      r.a.textContent = lv ? nf0.format(lv[1]) : '';
      r.ai.style.transform = `scaleX(${lv ? (lv[1] / vmax).toFixed(3) : 0})`;
      r.b.textContent = ''; r.bi.style.transform = 'scaleX(0)';
    }
    const m = rows[LEVELS];
    const ba = mkt.book.best('sell'), bb = mkt.book.best('buy');
    m.p.textContent = px(mkt.last);
    m.b.textContent = bb !== null && ba !== null ? `спред ${ba - bb}` : 'нет встречных';
    m.a.textContent = bb !== null && ba !== null ? `${px(ba - bb)}${NB}₽` : '';
    for (let i = 0; i < LEVELS; i++) {
      const lv = bids[i], r = rows[LEVELS + 1 + i];
      r.p.textContent = lv ? px(lv[0]) : '—';
      r.b.textContent = lv ? nf0.format(lv[1]) : '';
      r.bi.style.transform = `scaleX(${lv ? (lv[1] / vmax).toFixed(3) : 0})`;
      r.a.textContent = ''; r.ai.style.transform = 'scaleX(0)';
    }
  }
  const tapeEl = $('#trades');
  function updateTape() {
    const fresh = Math.min(mkt.nTrades - st.seen, mkt.tape.length);
    st.seen = mkt.nTrades;
    if (fresh <= 0) return;
    const list = mkt.tape.slice(-fresh);
    const agg = [];
    for (const tr of list) {
      const who = tr.aggr === 'buy' ? tr.buyer.cls : tr.seller.cls;
      const last = agg[agg.length - 1];
      if (last && last.t === tr.t && last.aggr === tr.aggr && last.who === who) { last.qty += tr.qty; last.px = tr.px; }
      else agg.push({ t: tr.t, px: tr.px, qty: tr.qty, aggr: tr.aggr, who });
    }
    const fresh6 = agg.slice(-8);
    fresh6.forEach((a, k) => {
      const li = document.createElement('li');
      if (k >= fresh6.length - 2) li.className = 'new';   // вспыхивают только самые свежие
      li.innerHTML = `<span class="t">${clock(a.t)}</span><span class="${a.aggr === 'buy' ? 'up' : 'down'}">${px(a.px)}</span><span class="q">${nf0.format(a.qty)}</span><span class="w">${WHO[a.who]}</span>`;
      tapeEl.prepend(li);
    });
    while (tapeEl.children.length > 14) tapeEl.lastChild.remove();
  }
  // последнее событие — в шапке графика; новое вспыхивает, а не закрывает свечи
  const evEl = $('#evline');
  function updateEvLine() {
    const e = mkt.events[mkt.events.length - 1];
    if (!e) return;
    const key = e.t + e.kind;
    if (key === st.evKey) return;
    const first = !st.evKey;
    st.evKey = key;
    evEl.className = 'evline ' + e.kind;
    evEl.innerHTML = `<b>${clock(e.t)}</b>${e.text.replace(/ %/g, NB + '%').replace(/(\d) (\d{3})/g, '$1' + NB + '$2')}`;
    if (!first) { evEl.classList.remove('flash'); void evEl.offsetWidth; evEl.classList.add('flash'); }
  }
  function updateKpis() {
    const last = mkt.last;
    $('#qLast').textContent = px(last);
    const chg = (last / OPEN - 1) * 100;
    const q = $('#qChg');
    q.textContent = `${sgn(chg)}${Math.abs(chg).toFixed(2).replace('.', ',')}${NB}%`;
    q.className = chg >= 0 ? 'up' : 'down';
    const ba = mkt.book.best('sell'), bb = mkt.book.best('buy');
    $('#kSpread').textContent = ba !== null && bb !== null ? `${px(ba - bb)}${NB}₽` : '—';
    $('#kVol').textContent = nf0.format(mkt.volume);
    const cs = mkt.candles.slice(-61);
    let s = 0, n = 0;
    for (let i = 1; i < cs.length; i++) { const r = Math.log(cs[i].c / cs[i - 1].c); s += r * r; n++; }
    $('#kVolat').textContent = n ? `${(Math.sqrt(s / n) * 100).toFixed(2).replace('.', ',')}${NB}%` : '—';
    $('#kTime').textContent = clock(mkt.t);
    const stEl = $('#status');
    stEl.className = 'status' + (mkt.halt > 0 ? ' halt' : st.paused ? ' pause' : '');
    stEl.querySelector('span').textContent = mkt.halt > 0 ? `Остановка · ${mkt.halt}${NB}с` : st.paused ? 'Пауза' : 'Торги идут';
  }

  /* ============================ цикл ============================ */
  let lastNow = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (document.hidden) return;
    if (!st.paused) {
      // ×60 — минута рынка за секунду, независимо от частоты экрана
      st.acc += st.speed * 60 * dt;
      let n = Math.min(40, Math.floor(st.acc));
      st.acc -= Math.floor(st.acc);
      while (n-- > 0) mkt.step();
    }
    drawChart();
    if (now - st.uiT > 90) {
      st.uiT = now;
      drawDepth(); drawHist(); drawPnl();
      updateLadder(); updateTape(); updateEvLine(); updateKpis();
    }
  }

  /* ============================ управление ============================ */
  $('#eUp').addEventListener('click', () => mkt.news(1));
  $('#eDown').addEventListener('click', () => mkt.news(-1));
  $('#eLiq').addEventListener('click', () => mkt.liquidityShock());
  $('#eCrash').addEventListener('click', () => mkt.flashCrash());
  const tCB = $('#tCB'), tFair = $('#tFair');
  tCB.addEventListener('click', () => { mkt.cbOn = !mkt.cbOn; tCB.setAttribute('aria-pressed', String(mkt.cbOn)); });
  tFair.addEventListener('click', () => { st.fair = !st.fair; tFair.setAttribute('aria-pressed', String(st.fair)); $('#legFair').hidden = !st.fair; });
  const bPlay = $('#bPlay');
  function setPaused(v) { st.paused = v; bPlay.classList.toggle('paused', v); bPlay.setAttribute('aria-label', v ? 'Пуск' : 'Пауза'); }
  bPlay.addEventListener('click', () => setPaused(!st.paused));
  document.querySelectorAll('.speed button[data-s]').forEach((b) => b.addEventListener('click', () => {
    st.speed = +b.dataset.s;
    document.querySelectorAll('.speed button[data-s]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    setPaused(false);
  }));
  const AG = [['mm', 'ММ', 1, 0, 10], ['fund', 'Фунд.', 5, 0, 80], ['trend', 'Тренд.', 5, 0, 80], ['noise', 'Шум.', 10, 0, 150]];
  const agBox = $('#agents');
  agBox.innerHTML = '<span class="lbl">Агенты</span>';
  for (const [k, name, stepV, lo, hi] of AG) {
    const d = document.createElement('div');
    d.className = 'ag';
    d.title = CLS_NAME[k];
    d.innerHTML = `<span>${name}</span><button aria-label="Меньше: ${CLS_NAME[k]}">−</button><b>${mkt.mix[k]}</b><button aria-label="Больше: ${CLS_NAME[k]}">+</button>`;
    const [, minus, val, plus] = d.children;
    const set = (dv) => { const mix = { ...mkt.mix }; mix[k] = clamp(mix[k] + dv, lo, hi); mkt.setMix(mix); val.textContent = String(mix[k]); };
    minus.addEventListener('click', () => set(-stepV));
    plus.addEventListener('click', () => set(stepV));
    agBox.appendChild(d);
  }
  cChart.addEventListener('pointermove', (e) => { const r = cChart.getBoundingClientRect(); st.hover = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  cChart.addEventListener('pointerleave', () => { st.hover = null; });
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // Ctrl+C — это копирование, а не флеш-крэш
    if (e.code === 'Space') { e.preventDefault(); setPaused(!st.paused); }
    else if (e.code === 'ArrowUp') mkt.news(1);
    else if (e.code === 'ArrowDown') mkt.news(-1);
    else if (e.code === 'KeyL') mkt.liquidityShock();
    else if (e.code === 'KeyC') mkt.flashCrash();
  });
  window.addEventListener('resize', () => { DPR = Math.min(window.devicePixelRatio || 1, 2); });

  requestAnimationFrame(frame);
})();
