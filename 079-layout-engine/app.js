/* Движок вёрстки — интерфейс: редакторы с подсветкой, окно страницы, 3D-разбор на слои, инспектор каскада. */
(function () {
  'use strict';
  const LE = window.LE, PRESETS = window.PRESETS;
  const $ = (id) => document.getElementById(id);
  const DEG = Math.PI / 180;
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const LAYER = ['#ff5f45', '#ff9f1c', '#ffd23f', '#3ddc97', '#2ec4f1', '#6c8cff', '#b084f5', '#f25f9c', '#ff7a5c', '#ffc24a'];
  const layerColor = (d) => LAYER[d % LAYER.length];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmtMs = (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)}`.replace('.', ',') + ' мс';
  const plural = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many; };

  // ---------- Состояние ----------
  const state = {
    preset: 'article', view: '3d',
    vw: 720, spread: 0, spreadTarget: 34,
    yaw: -30, pitch: 54, auto: true,
    selected: null, hover: null,
    res: null, paintMs: 0, scroll2d: 0, t0: performance.now(),
  };
  const view = $('view'), ctx = view.getContext('2d');
  const stage = $('stage');
  let W = 0, H = 0, DPR = 1;
  let layers = [], fit = null;

  // ---------- Подсветка синтаксиса ----------
  function hlHTML(src) {
    let out = '';
    const re = /(<!--[\s\S]*?-->)|(<\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?>)|([^<]+)|(<)/g;
    let m;
    while ((m = re.exec(src))) {
      if (m[1]) out += `<span class="cm">${esc(m[1])}</span>`;
      else if (m[3]) {
        const attrs = esc(m[4]).replace(/([^\s=]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s"']+)/g, '<span class="an">$1</span><span class="pu">$2</span><span class="av">$3</span>');
        out += `<span class="tg">${esc(m[2] + m[3])}</span>${attrs}<span class="tg">${esc(m[5])}</span>`;
      } else out += esc(m[6] || m[7] || '');
    }
    return out + '\n';
  }
  function hlValue(v) {
    return esc(v)
      .replace(/(!important)/g, '<span class="at">$1</span>')
      .replace(/(#[0-9a-fA-F]{3,8})\b/g, '<span class="hx">$1</span>')
      .replace(/(^|[\s(,])(-?\d*\.?\d+)(px|em|rem|%|vw|vh)?/g, '$1<span class="nu">$2$3</span>');
  }
  function hlCSS(src) {
    let out = '';
    const stack = [];
    const re = /(\/\*[\s\S]*?\*\/)|([{}])|(;)|([^{};/]+|\/)/g;
    let m;
    while ((m = re.exec(src))) {
      if (m[1]) { out += `<span class="cm">${esc(m[1])}</span>`; continue; }
      if (m[2] === '{') { out += '<span class="pu">{</span>'; continue; }
      if (m[2] === '}') { stack.pop(); out += '<span class="pu">}</span>'; continue; }
      if (m[3]) { out += '<span class="pu">;</span>'; continue; }
      const text = m[4];
      const inRule = stack.length && stack[stack.length - 1] === 'rule';
      const next = src[re.lastIndex];
      if (!inRule) {
        if (next === '{') stack.push(/^\s*@/.test(text) ? 'media' : 'rule');
        out += /^\s*@/.test(text) ? `<span class="at">${esc(text)}</span>` : `<span class="sel">${esc(text)}</span>`;
      } else {
        const i = text.indexOf(':');
        if (i < 0) out += esc(text);
        else out += `<span class="pr">${esc(text.slice(0, i))}</span><span class="pu">:</span><span class="va">${hlValue(text.slice(i + 1))}</span>`;
      }
    }
    return out + '\n';
  }

  const srcHtml = $('srcHtml'), srcCss = $('srcCss');
  function syncHl() {
    $('hlHtml').innerHTML = hlHTML(srcHtml.value);
    $('hlCss').innerHTML = hlCSS(srcCss.value);
  }
  for (const [ta, pre] of [[srcHtml, $('hlHtml').parentElement], [srcCss, $('hlCss').parentElement]]) {
    ta.addEventListener('scroll', () => { pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft; });
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, en = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(en);
        ta.selectionStart = ta.selectionEnd = s + 2;
        onEdit();
      }
    });
    ta.addEventListener('input', onEdit);
  }
  let editTimer = 0;
  function onEdit() {
    syncHl();
    clearTimeout(editTimer);
    editTimer = setTimeout(() => runPipeline(true), 90);
  }

  // ---------- Конвейер ----------
  function runPipeline(keepSelection) {
    let res;
    try {
      res = LE.run(srcHtml.value, srcCss.value, state.vw);
      $('err').hidden = true;
    } catch (err) {
      $('err').hidden = false; $('err').textContent = 'Ошибка разбора: ' + err.message;
      return;
    }
    const prevSel = state.selected;
    state.res = res;
    // Восстанавливаем выбор по пути в дереве
    if (keepSelection && prevSel) state.selected = findByPath(res.doc, pathOf(prevSel)) || null;
    buildLayers();
    const t = res.timing;
    $('pParse').textContent = `${res.nodes} ${plural(res.nodes, 'узел', 'узла', 'узлов')} · ${fmtMs(t.parse)}`;
    $('pStyle').textContent = `${res.rules.length} ${plural(res.rules.length, 'правило', 'правила', 'правил')} · ${fmtMs(t.style)}`;
    $('pLayout').textContent = `${res.root.boxCount} ${plural(res.root.boxCount, 'коробка', 'коробки', 'коробок')} · ${fmtMs(t.layout)}`;
    renderInspector();
    draw();
  }
  function pathOf(node) { const p = []; for (let n = node; n && n.parent; n = n.parent) p.unshift(n.parent.children.indexOf(n)); return p; }
  function findByPath(doc, path) { let n = doc; for (const i of path) { if (!n.children || !n.children[i]) return null; n = n.children[i]; } return n.type === 'el' ? n : null; }
  function selectBySelector(sel) {
    if (!state.res) return;
    const parsed = LE.parseCSS(`${sel}{x:y}`, 'author')[0];
    if (!parsed) return;
    let found = null;
    (function walk(n) { if (found || n.type !== 'el') return; if (n.style && n.tag !== '#document' && matches(n, parsed.selectors[0])) { found = n; return; } n.children.forEach(walk); })(state.res.doc);
    state.selected = found;
  }
  function matches(n, sel) {
    // Лёгкая проверка через каскад движка: у узла в matched не будет нашего правила, поэтому сверяем вручную
    const test = (el, part) => el && el.type === 'el' && (!part.tag || part.tag === el.tag) && (!part.id || part.id === el.elId) && part.classes.every((c) => el.classes.includes(c));
    let i = sel.parts.length - 1, el = n;
    if (!test(el, sel.parts[i])) return false;
    for (i = i - 1; i >= 0; i--) { el = el.parent; while (el && !test(el, sel.parts[i])) { if (sel.combs[i] === '>') return false; el = el.parent; } if (!el) return false; }
    return true;
  }

  // ---------- Слои для 3D ----------
  function buildLayers() {
    layers = [];
    const res = state.res;
    let maxDepth = 0;
    for (const b of res.boxes) {
      layers.push({ box: b, depth: b.depth, kind: 'box' });
      if (b.lines) for (const L of b.lines) layers.push({ box: b, line: L, depth: b.depth + 1, kind: 'line' });
      maxDepth = Math.max(maxDepth, b.depth + (b.lines ? 1 : 0));
    }
    layers.sort((a, b) => a.depth - b.depth);
    state.maxDepth = maxDepth;
    const legend = $('legend');
    const tags = new Map();
    for (const b of res.boxes) if (b.node && !tags.has(b.depth)) tags.set(b.depth, b.node.tag);
    legend.innerHTML = [...tags.entries()].slice(0, 8).map(([d, t]) => `<span><i style="background:${layerColor(d)}"></i>${d} · ${esc(t)}</span>`).join('');
  }

  // ---------- Камера ----------
  function basis() {
    const ps = state.yaw * DEG, ph = state.pitch * DEG;
    return { ex: [Math.cos(ps), Math.sin(ps) * Math.cos(ph)], ey: [-Math.sin(ps), Math.cos(ps) * Math.cos(ph)], ez: [0, -Math.sin(ph)] };
  }
  function computeFit() {
    const res = state.res; if (!res) return null;
    const PW = state.vw, PH = Math.max(res.root.h, 200);
    const B = basis();
    const zMax = (state.maxDepth || 1) * state.spreadTarget;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of [[0, 0], [PW, 0], [0, PH], [PW, PH]]) for (const z of [0, zMax]) {
      const sx = x * B.ex[0] + y * B.ey[0] + z * B.ez[0], sy = x * B.ex[1] + y * B.ey[1] + z * B.ez[1];
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    const padX = 36, padTop = 60, padBot = 96;
    const k = Math.min((W - padX * 2) / (x1 - x0), (H - padTop - padBot) / (y1 - y0));
    const ox = (W - (x1 - x0) * k) / 2 - x0 * k, oy = padTop + ((H - padTop - padBot) - (y1 - y0) * k) / 2 - y0 * k;
    return { B, k, ox, oy, PW, PH };
  }
  function layerTransform(z) {
    const f = fit, B = f.B, k = f.k;
    const zz = z * state.spread;
    return [B.ex[0] * k, B.ex[1] * k, B.ey[0] * k, B.ey[1] * k, f.ox + zz * B.ez[0] * k, f.oy + zz * B.ez[1] * k];
  }
  function toPage(m, px, py) {
    const [a, b, c, d, e, f] = m;
    const det = a * d - b * c;
    const x = ((px - e) * d - (py - f) * c) / det, y = (-(px - e) * b + (py - f) * a) / det;
    return [x, y];
  }

  // ---------- Отрисовка ----------
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    view.width = Math.round(W * DPR); view.height = Math.round(H * DPR);
    draw();
  }
  function pageBg() {
    const root = state.res.root;
    const body = root.children.find((c) => c.node && c.node.tag === 'body');
    return root.style['background-color'] || (body && body.style['background-color']) || '#ffffff';
  }

  function draw() {
    if (!state.res) return;
    const t0 = performance.now();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (state.view === '3d') draw3d(); else draw2d();
    state.paintMs = performance.now() - t0;
    $('pPaint').textContent = `${layers.length} ${plural(layers.length, 'слой', 'слоя', 'слоёв')} · ${fmtMs(state.paintMs)}`;
  }

  function drawGrid(m) {
    // Точечная сетка «пола» под страницей
    ctx.save();
    ctx.setTransform(m[0] * DPR, m[1] * DPR, m[2] * DPR, m[3] * DPR, m[4] * DPR, m[5] * DPR);
    const PW = fit.PW, PH = fit.PH, step = 40;
    ctx.fillStyle = 'rgba(160,170,190,0.22)';
    const r = 1.4 / fit.k;
    for (let x = -step * 3; x <= PW + step * 3; x += step) for (let y = -step * 3; y <= PH + step * 3; y += step) { ctx.fillRect(x - r / 2, y - r / 2, r, r); }
    ctx.restore();
  }

  function draw3d() {
    fit = computeFit(); if (!fit) return;
    const base = layerTransform(-0.6);
    drawGrid(base);
    // Тень страницы на «полу»
    ctx.save();
    ctx.setTransform(base[0] * DPR, base[1] * DPR, base[2] * DPR, base[3] * DPR, base[4] * DPR, base[5] * DPR);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(8, 12, fit.PW, fit.PH);
    ctx.restore();
    const bg = pageBg();
    const sel = state.selected, hov = state.hover;
    for (const L of layers) {
      const m = layerTransform(L.depth);
      ctx.setTransform(m[0] * DPR, m[1] * DPR, m[2] * DPR, m[3] * DPR, m[4] * DPR, m[5] * DPR);
      const b = L.box, col = layerColor(L.depth);
      const px = 1 / fit.k;
      const isSel = sel && b.node === sel, isHov = hov && hov.box === b && hov.kind === L.kind;
      if (L.kind === 'box') {
        if (b.depth === 0) { ctx.fillStyle = bg; ctx.fillRect(b.x, b.y, b.w, Math.max(b.h, fit.PH)); }
        const s = b.style;
        const visible = s['background-color'] || b.e.bt || b.e.bl;
        ctx.globalAlpha = s.opacity;
        if (visible) LE.paintDecor(ctx, b);
        if (!visible || isSel || isHov) {
          ctx.fillStyle = col; ctx.globalAlpha = isHov ? 0.28 : isSel ? 0.2 : 0.07; ctx.fillRect(b.x, b.y, b.w, b.h);
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = col; ctx.lineWidth = (isSel || isHov ? 2.2 : 1) * px;
        ctx.globalAlpha = isSel || isHov ? 1 : visible ? 0.75 : 0.9;
        ctx.strokeRect(b.x, b.y, b.w, b.h);
        ctx.globalAlpha = 1;
        if (b.marker) LE.paintText(ctx, { marker: b.marker, lines: null });
      } else {
        const ln = L.line;
        ctx.strokeStyle = col; ctx.globalAlpha = isHov ? 0.9 : 0.32; ctx.lineWidth = px;
        ctx.strokeRect(ln.x + 0.5 * px, ln.y + 0.5 * px, Math.max(ln.used, 2), ln.h - px);
        ctx.globalAlpha = b.style.opacity;
        LE.paintText(ctx, { lines: [ln] });
        ctx.globalAlpha = 1;
      }
    }
    // Стойки от выбранного блока к родителю
    if (sel) {
      const b = state.res.boxes.find((x) => x.node === sel);
      if (b) {
        const m1 = layerTransform(b.depth), m0 = layerTransform(Math.max(0, b.depth - 1));
        const P = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.strokeStyle = layerColor(b.depth); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath();
        for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) { const a = P(m1, x, y), c = P(m0, x, y); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); }
        ctx.stroke(); ctx.setLineDash([]);
        const tag = P(m1, b.x, b.y);
        label(tag[0], tag[1] - 8, describe(b), layerColor(b.depth));
      }
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function label(x, y, text, col) {
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.font = '600 12px "JetBrains Mono", monospace';
    const w = ctx.measureText(text).width + 14;
    x = Math.max(8, Math.min(W - w - 8, x)); y = Math.max(22, y);
    ctx.fillStyle = 'rgba(14,16,20,0.92)'; LE.roundRect(ctx, x, y - 18, w, 22, 5); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ebe7dd'; ctx.fillText(text, x + 7, y - 3);
    ctx.restore();
  }
  function selText(n) {
    if (!n) return 'анонимный блок';
    return n.tag + (n.elId ? '#' + n.elId : '') + (n.classes.length ? '.' + n.classes.join('.') : '');
  }
  const describe = (b) => `${selText(b.node)}  ${Math.round(b.w)} × ${Math.round(b.h)}`;

  function draw2d() {
    const res = state.res;
    const PW = state.vw, PH = Math.max(res.root.h, 120);
    const k = Math.min(1, (W - 64) / PW);
    const chrome = 34;
    const x0 = Math.round((W - PW * k) / 2), yTop = 58;
    const maxScroll = Math.max(0, PH * k + chrome + yTop + 110 - H);
    state.scroll2d = Math.max(0, Math.min(state.scroll2d, maxScroll));
    const y0 = yTop - state.scroll2d;
    // Окно браузера
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    ctx.fillStyle = '#1b1f27'; LE.roundRect(ctx, x0 - 1, y0 - 1, PW * k + 2, PH * k + chrome + 2, 10); ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#1f242d'; LE.roundRect(ctx, x0, y0, PW * k, chrome + 10, 10); ctx.fill();
    for (let i = 0; i < 3; i++) { ctx.fillStyle = ['#ff5f57', '#febc2e', '#28c840'][i]; ctx.beginPath(); ctx.arc(x0 + 16 + i * 16, y0 + chrome / 2, 4.5, 0, 6.29); ctx.fill(); }
    const addrW = Math.min(360, PW * k - 150);
    if (addrW > 60) {
      ctx.fillStyle = '#12151b'; LE.roundRect(ctx, x0 + (PW * k - addrW) / 2, y0 + 7, addrW, chrome - 14, 6); ctx.fill();
      ctx.fillStyle = '#9aa0ab'; ctx.font = '12px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
      ctx.fillText(`коробка://${state.preset} · ${state.vw} px`, x0 + PW * k / 2, y0 + chrome / 2 + 4); ctx.textAlign = 'left';
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0 + chrome, PW * k, PH * k); ctx.clip();
    ctx.translate(x0, y0 + chrome); ctx.scale(k, k);
    ctx.fillStyle = pageBg(); ctx.fillRect(0, 0, PW, PH);
    LE.paintTree(ctx, res.root);
    // Подсветка как в инструментах разработчика
    const target = state.hover ? state.hover.box : state.selected ? res.boxes.find((b) => b.node === state.selected) : null;
    if (target) boxOverlay(target, 1 / k);
    ctx.restore();
    state.frame2d = { x0, y0: y0 + chrome, k };
    if (target) {
      label(x0 + target.x * k, y0 + chrome + target.y * k - 6, describe(target), layerColor(target.depth));
    }
  }
  function boxOverlay(b, px) {
    const e = b.e;
    const mx = b.x - e.ml, my = b.y - e.mt, mw = b.w + e.ml + e.mr, mh = b.h + e.mt + e.mb;
    ctx.fillStyle = 'rgba(249,164,90,0.42)';
    ctx.fillRect(mx, my, mw, e.mt); ctx.fillRect(mx, b.y + b.h, mw, e.mb); ctx.fillRect(mx, b.y, e.ml, b.h); ctx.fillRect(b.x + b.w, b.y, e.mr, b.h);
    ctx.fillStyle = 'rgba(255,221,120,0.5)';
    ctx.fillRect(b.x, b.y, b.w, e.bt); ctx.fillRect(b.x, b.y + b.h - e.bb, b.w, e.bb); ctx.fillRect(b.x, b.y, e.bl, b.h); ctx.fillRect(b.x + b.w - e.br, b.y, e.br, b.h);
    ctx.fillStyle = 'rgba(147,196,125,0.5)';
    const ix = b.x + e.bl, iy = b.y + e.bt, iw = b.w - e.bl - e.br, ih = b.h - e.bt - e.bb;
    ctx.fillRect(ix, iy, iw, e.pt); ctx.fillRect(ix, iy + ih - e.pb, iw, e.pb); ctx.fillRect(ix, iy + e.pt, e.pl, ih - e.pt - e.pb); ctx.fillRect(ix + iw - e.pr, iy + e.pt, e.pr, ih - e.pt - e.pb);
    ctx.fillStyle = 'rgba(111,168,220,0.45)';
    ctx.fillRect(ix + e.pl, iy + e.pt, iw - e.pl - e.pr, ih - e.pt - e.pb);
    void px;
  }

  // ---------- Наведение и выбор ----------
  function hitTest(px, py) {
    if (!state.res) return null;
    if (state.view === '3d') {
      if (!fit) return null;
      for (let i = layers.length - 1; i >= 0; i--) {
        const L = layers[i];
        const [x, y] = toPage(layerTransform(L.depth), px, py);
        if (L.kind === 'line') { const ln = L.line; if (x >= ln.x && x <= ln.x + Math.max(ln.used, 2) && y >= ln.y && y <= ln.y + ln.h) return L; }
        else { const b = L.box; if (b.depth > 0 && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return L; }
      }
      return null;
    }
    const f = state.frame2d; if (!f) return null;
    const x = (px - f.x0) / f.k, y = (py - f.y0) / f.k;
    let best = null;
    for (const b of state.res.boxes) if (b.depth > 0 && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) best = { box: b, kind: 'box' };
    return best;
  }
  const tip = $('tip');
  function showTip(L, px, py) {
    if (!L) { tip.hidden = true; return; }
    const b = L.box;
    const kind = L.kind === 'line' ? `строка ${b.lines.indexOf(L.line) + 1} из ${b.lines.length} · ${Math.round(L.line.used)} × ${Math.round(L.line.h)}` : `${Math.round(b.w)} × ${Math.round(b.h)} · слой ${b.depth}`;
    tip.innerHTML = `<b>${esc(selText(b.node))}</b><br><span>${kind}</span>`;
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(W - r.width - 10, px + 16)}px`; tip.style.top = `${Math.max(8, py - r.height - 12)}px`;
  }

  let drag = null;
  view.addEventListener('pointerdown', (e) => {
    view.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, yaw: state.yaw, pitch: state.pitch, moved: false, scroll: state.scroll2d };
    state.auto = false;
  });
  view.addEventListener('pointermove', (e) => {
    const r = view.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      if (drag.moved) {
        view.classList.add('dragging');
        if (state.view === '3d') { state.yaw = drag.yaw + dx * 0.3; state.pitch = Math.max(0, Math.min(80, drag.pitch - dy * 0.25)); }
        else state.scroll2d = drag.scroll - dy;
        tip.hidden = true; draw(); return;
      }
    }
    const L = hitTest(px, py);
    const changed = (L && L.box) !== (state.hover && state.hover.box) || (L && L.kind) !== (state.hover && state.hover.kind);
    state.hover = L;
    view.classList.toggle('pointing', !!L);
    showTip(L, px, py);
    if (changed) draw();
  });
  const endDrag = (e) => {
    if (!drag) return;
    const wasClick = !drag.moved;
    drag = null; view.classList.remove('dragging');
    if (wasClick) {
      const r = view.getBoundingClientRect();
      const L = hitTest(e.clientX - r.left, e.clientY - r.top);
      if (L) {
        let n = L.box.node, b = L.box;
        while (!n && b.parent) { b = b.parent; n = b.node; }
        state.selected = n; renderInspector(); draw();
      }
    }
  };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', () => { drag = null; view.classList.remove('dragging'); });
  view.addEventListener('pointerleave', () => { state.hover = null; tip.hidden = true; draw(); });
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (state.view === '3d') { state.spreadTarget = Math.max(0, Math.min(80, state.spreadTarget - e.deltaY * 0.05)); state.spread = state.spreadTarget; syncSpread(); }
    else state.scroll2d += e.deltaY;
    draw();
  }, { passive: false });

  // ---------- Инспектор ----------
  function renderInspector() {
    const body = $('inspBody');
    const n = state.selected;
    if (!n || !state.res) { body.innerHTML = '<p class="empty">Выберите блок: нажмите на него в окне справа. Здесь появятся его коробочная модель и все правила каскада — победившие и перекрытые.</p>'; return; }
    const b = state.res.boxes.find((x) => x.node === n);
    const chain = [];
    for (let a = n; a && a.tag !== '#document'; a = a.parent) chain.unshift(a);
    const crumbs = chain.map((a, i) => (i === chain.length - 1 ? `<b>${esc(selText(a))}</b>` : esc(selText(a)))).join('<i>›</i>');
    let bm = '';
    if (b) {
      const e = b.e, r = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
      const cw = b.w - e.bl - e.br - e.pl - e.pr, ch = b.h - e.bt - e.bb - e.pt - e.pb;
      bm = `<div class="bm"><div class="m"><span class="lbl">margin</span><span class="v t">${r(e.mt)}</span><span class="v b">${r(e.mb)}</span><span class="v l">${r(e.ml)}</span><span class="v r">${r(e.mr)}</span>
        <div class="b"><span class="lbl">border</span><span class="v t">${r(e.bt)}</span><span class="v b">${r(e.bb)}</span><span class="v l">${r(e.bl)}</span><span class="v r">${r(e.br)}</span>
          <div class="p"><span class="lbl">padding</span><span class="v t">${r(e.pt)}</span><span class="v b">${r(e.pb)}</span><span class="v l">${r(e.pl)}</span><span class="v r">${r(e.pr)}</span>
            <div class="c">${r(cw)} × ${r(ch)}</div></div></div></div></div>`;
    }
    const rules = (n.matched || []).map((m) => {
      const origin = m.origin === 'ua' ? '<span class="ua">стили браузера</span>' : m.origin === 'inline' ? '<span class="ua">атрибут style</span>' : `<span class="spec" title="специфичность: идентификаторы · классы · теги">${m.spec.join('·')}</span>`;
      const decls = m.decls.map((d) => `<div class="d${d.overridden ? ' over' : ''}"><span class="p">${esc(d.prop)}</span>: ${esc(d.value)}${d.important ? ' <span class="imp">!important</span>' : ''};</div>`).join('');
      return `<div class="rule">${m.media ? `<div class="media">@media ${esc(m.media)}</div>` : ''}<div class="rh"><code>${esc(m.selector)}</code>${origin}</div>${decls}</div>`;
    }).join('');
    const s = n.style;
    const comp = b ? [
      ['display', s.display], ['width', `${Math.round(b.w)}px`], ['height', `${Math.round(b.h)}px`],
      ['font', `${s['font-weight']} ${Math.round(s['font-size'] * 10) / 10}px ${s['font-family'].split(',')[0]}`],
      ['color', s.color], ['background', s['background-color'] || 'transparent'],
    ] : [['display', s.display]];
    body.innerHTML = `<div class="crumbs">${crumbs}</div>${bm}
      <div class="sec-title">Каскад — сверху сильнейшие</div><div class="rules">${rules || '<p class="empty">Ни одно правило не подошло — действуют унаследованные значения.</p>'}</div>
      <div class="sec-title">Итоговые значения</div><div class="computed">${comp.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>`;
  }

  // ---------- Управление ----------
  function loadPreset(name) {
    const p = PRESETS[name];
    state.preset = name;
    srcHtml.value = p.html; srcCss.value = p.css;
    srcHtml.scrollTop = srcCss.scrollTop = 0;
    syncHl();
    state.scroll2d = 0;
    runPipeline(false);
    selectBySelector(p.select);
    renderInspector(); draw();
  }
  $('preset').addEventListener('change', (e) => { loadPreset(e.target.value); state.spread = 0; state.spreadTarget = 34; syncSpread(); state.t0 = performance.now(); });
  for (const b of document.querySelectorAll('.seg button')) b.addEventListener('click', () => setView(b.dataset.view));
  function setView(v) {
    state.view = v;
    for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-selected', String(b.dataset.view === v));
    $('spreadWrap').style.display = v === '3d' ? '' : 'none';
    $('legend').style.display = v === '3d' ? '' : 'none';
    $('resetView').style.display = v === '3d' ? '' : 'none';
    state.hover = null; tip.hidden = true;
    draw();
  }
  for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => {
    const t = b.dataset.tab;
    for (const x of document.querySelectorAll('.tabs button')) x.setAttribute('aria-selected', String(x === b));
    $('edHtml').hidden = t !== 'html'; $('edCss').hidden = t !== 'css';
    document.querySelector('.left').classList.toggle('show-insp', t === 'insp');
  });
  const vwIn = $('vw');
  function syncRange(el) { el.style.setProperty('--p', `${((el.value - el.min) / (el.max - el.min) * 100).toFixed(1)}%`); }
  vwIn.addEventListener('input', () => { state.vw = +vwIn.value; $('vwVal').textContent = `${state.vw} px`; syncRange(vwIn); runPipeline(true); });
  const spIn = $('spread');
  function syncSpread() { spIn.value = Math.round(state.spreadTarget); $('spreadVal').textContent = Math.round(state.spreadTarget); syncRange(spIn); }
  spIn.addEventListener('input', () => { state.spreadTarget = +spIn.value; state.spread = state.spreadTarget; state.auto = false; syncSpread(); draw(); });
  $('resetView').addEventListener('click', () => { state.yaw = -30; state.pitch = 54; state.spreadTarget = 34; state.spread = 34; syncSpread(); draw(); });

  // ---------- Анимация появления и лёгкое покачивание ----------
  function tick(now) {
    const t = (now - state.t0) / 1000;
    let need = false;
    if (state.view === '3d') {
      if (Math.abs(state.spread - state.spreadTarget) > 0.05) {
        const k = reduceMotion ? 1 : 1 - Math.exp(-3.2 * 1 / 60);
        state.spread += (state.spreadTarget - state.spread) * k * 1.4;
        if (Math.abs(state.spread - state.spreadTarget) < 0.05) state.spread = state.spreadTarget;
        need = true;
      }
      if (state.auto && !reduceMotion && !document.hidden) { state.yaw = -30 + Math.sin(t * 0.35) * 9; need = true; }
    }
    if (need) draw();
    requestAnimationFrame(tick);
  }

  // ---------- Старт ----------
  window.addEventListener('resize', () => { resize(); });
  const narrow = window.innerWidth < 860;
  state.vw = narrow ? 360 : 720;
  vwIn.value = state.vw; $('vwVal').textContent = `${state.vw} px`; syncRange(vwIn); syncSpread();
  if (window.__SHOT__) { state.spread = state.spreadTarget; }
  resize();
  loadPreset('article');
  setView('3d');
  requestAnimationFrame(tick);
  // Шрифты подгрузились — перемеряем текст и раскладываем заново
  if (document.fonts && document.fonts.ready) {
    const fams = ['400 16px "IBM Plex Sans"', '600 16px "IBM Plex Sans"', '700 16px "IBM Plex Sans"', 'italic 400 16px "IBM Plex Sans"', '400 16px "PT Serif"', '700 16px "PT Serif"', 'italic 400 16px "PT Serif"', '700 16px "Unbounded"', '400 16px "JetBrains Mono"'];
    Promise.all(fams.map((f) => document.fonts.load(f).catch(() => null))).then(() => { LE.clearCaches(); runPipeline(true); });
  }
})();
