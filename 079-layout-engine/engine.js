/* Движок вёрстки: HTML → DOM → каскад CSS → дерево коробок → раскладка → отрисовка на Canvas.
   Всё с нуля, без DOM браузера. Классический скрипт: API в window.LE. */
(function (root) {
  'use strict';

  // ================= HTML =================
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr']);
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', laquo: '«', raquo: '»', hellip: '…', copy: '©', times: '×', rarr: '→', larr: '←', deg: '°', middot: '·', thinsp: ' ' };
  const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    const v = ENT[e.toLowerCase()];
    return v === undefined ? m : v;
  });

  let uid = 0;
  function makeEl(tag, attrs, parent) {
    return { type: 'el', tag, attrs, children: [], parent, uid: ++uid, classes: (attrs.class || '').split(/\s+/).filter(Boolean), elId: attrs.id || null };
  }

  function parseHTML(src) {
    uid = 0;
    const doc = makeEl('#document', {}, null);
    const stack = [doc];
    const re = /<!--[\s\S]*?-->|<![^>]*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)|(<)/g;
    let m;
    while ((m = re.exec(src))) {
      const top = stack[stack.length - 1];
      if (m[0].startsWith('<!')) continue;
      if (m[4] !== undefined || m[5] !== undefined) {
        top.children.push({ type: 'text', text: decode(m[4] !== undefined ? m[4] : '<'), parent: top, uid: ++uid });
        continue;
      }
      const tag = m[1].toLowerCase();
      if (m[0][1] === '/') {
        for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
        continue;
      }
      // Неявное закрытие <p> и <li>
      if ((tag === 'p' || tag === 'li') && top.tag === tag) stack.pop();
      const attrs = {};
      const ar = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let a;
      while ((a = ar.exec(m[2] || ''))) attrs[a[1].toLowerCase()] = decode(a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '');
      const parent = stack[stack.length - 1];
      const node = makeEl(tag, attrs, parent);
      parent.children.push(node);
      if (!VOID.has(tag) && !m[3]) stack.push(node);
    }
    // Гарантируем html > body
    let html = doc.children.find((n) => n.type === 'el' && n.tag === 'html');
    if (!html) {
      html = makeEl('html', {}, doc);
      html.children = doc.children; html.children.forEach((c) => (c.parent = html));
      doc.children = [html];
    }
    let body = html.children.find((n) => n.type === 'el' && n.tag === 'body');
    if (!body) {
      body = makeEl('body', {}, html);
      const keep = [];
      for (const c of html.children) { if (c.type === 'el' && c.tag === 'head') keep.push(c); else { c.parent = body; body.children.push(c); } }
      html.children = keep.concat([body]);
    }
    let count = 0;
    (function walk(n) { count++; if (n.children) n.children.forEach(walk); })(doc);
    doc.count = count - 1;
    return doc;
  }

  // ================= CSS =================
  function parseSelector(text) {
    const t = text.trim();
    if (!t) return null;
    const tokens = t.replace(/\s*>\s*/g, ' > ').split(/\s+/);
    const parts = [], combs = [];
    let pending = null;
    for (const tok of tokens) {
      if (tok === '>') { pending = '>'; continue; }
      const part = { tag: null, id: null, classes: [], pseudo: [] };
      const re = /(#[\w-]+)|(\.[\w-]+)|(:[\w-]+(?:\([^)]*\))?)|(\*)|([a-zA-Z][\w-]*)/g;
      let m, consumed = 0;
      while ((m = re.exec(tok))) {
        consumed += m[0].length;
        if (m[1]) part.id = m[1].slice(1);
        else if (m[2]) part.classes.push(m[2].slice(1));
        else if (m[3]) part.pseudo.push(m[3].slice(1));
        else if (m[5]) part.tag = m[5].toLowerCase();
      }
      if (consumed !== tok.length) return null; // неподдерживаемый селектор
      if (parts.length) combs.push(pending || ' ');
      pending = null;
      parts.push(part);
    }
    let a = 0, b = 0, c = 0;
    for (const p of parts) { if (p.id) a++; b += p.classes.length + p.pseudo.length; if (p.tag) c++; }
    return { parts, combs, spec: [a, b, c], text: t };
  }

  const elementSiblings = (el) => (el.parent ? el.parent.children.filter((n) => n.type === 'el') : [el]);
  function matchPart(el, p) {
    if (!el || el.type !== 'el') return false;
    if (p.tag && p.tag !== el.tag) return false;
    if (p.id && p.id !== el.elId) return false;
    for (const c of p.classes) if (!el.classes.includes(c)) return false;
    for (const ps of p.pseudo) {
      const sib = elementSiblings(el);
      if (ps === 'first-child' && sib[0] !== el) return false;
      else if (ps === 'last-child' && sib[sib.length - 1] !== el) return false;
      else if (ps.startsWith('nth-child(')) {
        const arg = ps.slice(10, -1).trim(), idx = sib.indexOf(el) + 1;
        if (arg === 'odd' ? idx % 2 !== 1 : arg === 'even' ? idx % 2 !== 0 : +arg !== idx) return false;
      } else if (!['first-child', 'last-child'].includes(ps) && !ps.startsWith('nth-child(')) return false;
    }
    return true;
  }
  function matchSelector(el, sel, i) {
    if (i === undefined) i = sel.parts.length - 1;
    if (!matchPart(el, sel.parts[i])) return false;
    if (i === 0) return true;
    const comb = sel.combs[i - 1];
    if (comb === '>') return matchSelector(el.parent, sel, i - 1);
    for (let a = el.parent; a && a.type === 'el' && a.tag !== '#document'; a = a.parent) if (matchSelector(a, sel, i - 1)) return true;
    return false;
  }

  // Раскрытие сокращённых свойств в полные
  const SIDES = ['top', 'right', 'bottom', 'left'];
  function four(v) {
    const p = splitValue(v);
    if (p.length === 1) return [p[0], p[0], p[0], p[0]];
    if (p.length === 2) return [p[0], p[1], p[0], p[1]];
    if (p.length === 3) return [p[0], p[1], p[2], p[1]];
    return p.slice(0, 4);
  }
  function splitValue(v) {
    const out = []; let depth = 0, cur = '';
    for (const ch of v.trim()) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (/\s/.test(ch) && !depth) { if (cur) out.push(cur); cur = ''; } else cur += ch;
    }
    if (cur) out.push(cur);
    return out;
  }
  const isColor = (t) => /^(#|rgb|hsl)/i.test(t) || t in NAMED || t === 'transparent' || t === 'currentcolor';
  const BORDER_STYLES = new Set(['none', 'solid', 'dashed', 'dotted', 'double', 'hidden']);
  function expand(prop, value) {
    const v = value.trim();
    switch (prop) {
      case 'margin': case 'padding': return four(v).map((x, i) => [`${prop}-${SIDES[i]}`, x]);
      case 'border-width': case 'border-color': case 'border-style': {
        const kind = prop.split('-')[1];
        return four(v).map((x, i) => [`border-${SIDES[i]}-${kind}`, x]);
      }
      case 'border': case 'border-top': case 'border-right': case 'border-bottom': case 'border-left': {
        const sides = prop === 'border' ? SIDES : [prop.slice(7)];
        let w = 'medium', st = 'none', c = 'currentcolor';
        for (const t of splitValue(v)) { if (BORDER_STYLES.has(t)) st = t; else if (isColor(t.toLowerCase())) c = t; else w = t; }
        const out = [];
        for (const s of sides) out.push([`border-${s}-width`, w], [`border-${s}-style`, st], [`border-${s}-color`, c]);
        return out;
      }
      case 'border-radius': return [['border-radius', splitValue(v)[0]]];
      case 'background': {
        const t = splitValue(v).find((x) => isColor(x.toLowerCase()));
        return [['background-color', t || 'transparent']];
      }
      case 'flex': {
        if (v === 'none') return [['flex-grow', '0'], ['flex-shrink', '0'], ['flex-basis', 'auto']];
        if (v === 'auto') return [['flex-grow', '1'], ['flex-shrink', '1'], ['flex-basis', 'auto']];
        const p = splitValue(v);
        const g = p[0] || '0', sh = p[1] && /^[\d.]+$/.test(p[1]) ? p[1] : '1';
        const b = p.length === 3 ? p[2] : p.length === 2 && !/^[\d.]+$/.test(p[1]) ? p[1] : '0px';
        return [['flex-grow', g], ['flex-shrink', sh], ['flex-basis', b]];
      }
      case 'gap': { const p = splitValue(v); return [['row-gap', p[0]], ['column-gap', p[1] || p[0]]]; }
      case 'flex-flow': { const out = []; for (const t of splitValue(v)) out.push([t.includes('wrap') ? 'flex-wrap' : 'flex-direction', t]); return out; }
      default: return [[prop, v]];
    }
  }

  function parseDecls(body) {
    const decls = [];
    for (const chunk of body.split(';')) {
      const i = chunk.indexOf(':');
      if (i < 0) continue;
      const prop = chunk.slice(0, i).trim().toLowerCase();
      let value = chunk.slice(i + 1).trim();
      if (!prop || !value) continue;
      let important = false;
      if (/!important\s*$/i.test(value)) { important = true; value = value.replace(/!important\s*$/i, '').trim(); }
      decls.push({ prop, value, important, longhands: expand(prop, value) });
    }
    return decls;
  }

  function parseMedia(head) {
    const cond = {};
    const mx = /max-width\s*:\s*([\d.]+)px/.exec(head), mn = /min-width\s*:\s*([\d.]+)px/.exec(head);
    if (mx) cond.max = +mx[1];
    if (mn) cond.min = +mn[1];
    cond.text = head.replace(/^@media\s*/, '').trim();
    return cond;
  }

  function parseCSS(src, origin) {
    src = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    let pos = 0;
    const run = (end, media) => {
      while (pos < end) {
        const open = src.indexOf('{', pos);
        if (open < 0 || open >= end) { pos = end; break; }
        const head = src.slice(pos, open).trim();
        if (head.startsWith('@media')) {
          let depth = 1, j = open + 1;
          while (j < src.length && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
          const cond = parseMedia(head);
          pos = open + 1; run(j - 1, cond); pos = j;
          continue;
        }
        let close = src.indexOf('}', open);
        if (close < 0 || close > end) close = end;
        const body = src.slice(open + 1, close);
        pos = close + 1;
        const selectors = head.split(',').map(parseSelector).filter(Boolean);
        const decls = parseDecls(body);
        if (selectors.length && decls.length) rules.push({ selectors, decls, media, origin, text: head });
      }
    };
    run(src.length, null);
    return rules;
  }

  // ================= Значения =================
  const NAMED = {
    black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080',
    silver: '#c0c0c0', orange: '#ffa500', gold: '#ffd700', yellow: '#ffff00', purple: '#800080', crimson: '#dc143c', teal: '#008080',
    navy: '#000080', maroon: '#800000', olive: '#808000', tomato: '#ff6347', coral: '#ff7f50', salmon: '#fa8072', pink: '#ffc0cb',
    tan: '#d2b48c', ivory: '#fffff0', beige: '#f5f5dc', linen: '#faf0e6', lavender: '#e6e6fa', indigo: '#4b0082', violet: '#ee82ee',
    orchid: '#da70d6', plum: '#dda0dd', khaki: '#f0e68c', chocolate: '#d2691e', sienna: '#a0522d', peru: '#cd853f', steelblue: '#4682b4',
    royalblue: '#4169e1', slategray: '#708090', darkslategray: '#2f4f4f', dimgray: '#696969', lightgray: '#d3d3d3', whitesmoke: '#f5f5f5',
    seagreen: '#2e8b57', forestgreen: '#228b22', limegreen: '#32cd32', turquoise: '#40e0d0', cyan: '#00ffff', magenta: '#ff00ff', skyblue: '#87ceeb',
    rebeccapurple: '#663399', hotpink: '#ff69b4', firebrick: '#b22222', darkorange: '#ff8c00', midnightblue: '#191970', cornsilk: '#fff8dc',
    wheat: '#f5deb3', snow: '#fffafa', mintcream: '#f5fffa', honeydew: '#f0fff0', aliceblue: '#f0f8ff', ghostwhite: '#f8f8ff',
  };
  function parseColor(v, current) {
    if (!v) return null;
    const s = v.trim().toLowerCase();
    if (s === 'transparent') return null;
    if (s === 'currentcolor') return current || '#000000';
    if (NAMED[s]) return NAMED[s];
    if (/^#[0-9a-f]{3,8}$/.test(s)) {
      if (s.length === 4 || s.length === 5) return '#' + [...s.slice(1)].map((c) => c + c).join('');
      return s;
    }
    if (/^(rgb|hsl)a?\(/.test(s)) return s;
    return undefined;
  }
  function parseLen(v) {
    if (v === undefined || v === null) return null;
    const s = String(v).trim().toLowerCase();
    if (s === 'auto') return 'auto';
    if (s === 'none') return 'none';
    const m = /^(-?[\d.]+)(px|em|rem|%|vw|vh)?$/.exec(s);
    if (!m) return undefined;
    const n = parseFloat(m[1]);
    if (!m[2] && n !== 0) return undefined;
    return { n, u: m[2] || 'px' };
  }
  const WIDTHS = { thin: 1, medium: 3, thick: 5 };

  // ================= Каскад =================
  const UA_CSS = `
    html, body, div, p, h1, h2, h3, h4, h5, h6, ul, ol, header, footer, nav, section, article, main, aside, blockquote, figure, figcaption, hr, form, pre, address, dl, dt, dd { display: block }
    li { display: list-item }
    head, style, script, title, meta, link { display: none }
    body { margin: 8px }
    h1 { font-size: 2em; margin: 0.67em 0; font-weight: 700 }
    h2 { font-size: 1.5em; margin: 0.83em 0; font-weight: 700 }
    h3 { font-size: 1.17em; margin: 1em 0; font-weight: 700 }
    h4 { margin: 1.33em 0; font-weight: 700 }
    p, ul, ol, pre { margin: 1em 0 }
    blockquote, figure { margin: 1em 40px }
    ul, ol { padding-left: 40px }
    strong, b { font-weight: 700 }
    em, i { font-style: italic }
    code, kbd, pre { font-family: monospace }
    small { font-size: 0.83em }
    a { color: #0b57d0; text-decoration: underline }
    mark { background-color: #ffe56b; color: #111111 }
    hr { border-top: 1px solid #9a9a9a; margin: 0.5em 0 }
  `;
  const UA_RULES = parseCSS(UA_CSS, 'ua');

  const INHERITED = new Set(['color', 'font-size', 'font-weight', 'font-style', 'font-family', 'line-height', 'text-align', 'text-transform', 'letter-spacing', 'white-space', 'list-style-type']);
  const FAMILY = { serif: '"PT Serif", Georgia, serif', 'sans-serif': '"IBM Plex Sans", Arial, sans-serif', monospace: '"JetBrains Mono", Menlo, monospace' };
  function resolveFamily(v) {
    const first = v.split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (FAMILY[first.toLowerCase()]) return FAMILY[first.toLowerCase()];
    const generic = /monospace/.test(v) ? 'monospace' : /sans-serif/.test(v) ? 'sans-serif' : /serif/.test(v) ? 'serif' : 'sans-serif';
    return `"${first}", ${FAMILY[generic]}`;
  }

  function specCmp(a, b) { return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; }

  function cascade(doc, rules, viewportW) {
    const all = UA_RULES.concat(rules);
    const mediaOk = (m) => !m || ((m.max === undefined || viewportW <= m.max) && (m.min === undefined || viewportW >= m.min));
    let order = 0;
    const walk = (node, parentStyle) => {
      if (node.type !== 'el') return;
      if (node.tag === '#document') { node.children.forEach((c) => walk(c, null)); return; }
      const matched = [];
      for (const r of all) {
        if (!mediaOk(r.media)) continue;
        let best = null;
        for (const sel of r.selectors) if (matchSelector(node, sel) && (!best || specCmp(sel.spec, best.spec) > 0)) best = sel;
        if (best) matched.push({ rule: r, sel: best, order: all.indexOf(r) });
      }
      if (node.attrs.style) {
        const r = { selectors: [], decls: parseDecls(node.attrs.style), media: null, origin: 'inline', text: 'style=""' };
        matched.push({ rule: r, sel: { spec: [9, 0, 0], text: 'style' }, order: 1e6 });
      }
      // Все объявления в порядке возрастания приоритета
      const flat = [];
      for (const m of matched) for (const d of m.rule.decls) {
        flat.push({ d, m, rank: [d.important ? 1 : 0, m.rule.origin === 'ua' ? 0 : 1, ...m.sel.spec, m.order] });
      }
      flat.sort((x, y) => { for (let i = 0; i < x.rank.length; i++) if (x.rank[i] !== y.rank[i]) return x.rank[i] - y.rank[i]; return 0; });
      const spec = {}, winner = {};
      for (const f of flat) for (const [p, v] of f.d.longhands) { spec[p] = v; winner[p] = f.d; }
      // Отметим перекрытые объявления для инспектора
      const used = new Set(Object.values(winner));
      node.matched = matched.map((m) => ({
        selector: m.sel.text, spec: m.sel.spec, origin: m.rule.origin, media: m.rule.media ? m.rule.media.text : null,
        decls: m.rule.decls.map((d) => ({ prop: d.prop, value: d.value, important: d.important, overridden: !used.has(d) })),
        rank: [m.rule.origin === 'ua' ? 0 : 1, ...m.sel.spec, m.order],
      })).sort((a, b) => { for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return b.rank[i] - a.rank[i]; return 0; });
      node.style = computeStyle(spec, parentStyle, node);
      node.order = order++;
      node.children.forEach((c) => walk(c, node.style));
    };
    walk(doc, null);
  }

  function computeStyle(spec, ps, node) {
    const P = ps || { color: '#000000', 'font-size': 16, 'font-weight': 400, 'font-style': 'normal', 'font-family': FAMILY.serif, 'line-height': 'normal', 'text-align': 'left', 'text-transform': 'none', 'letter-spacing': 0, 'white-space': 'normal', 'list-style-type': node.tag === 'ol' ? 'decimal' : 'disc' };
    const s = {};
    const get = (p, def) => (spec[p] !== undefined && spec[p] !== 'inherit' ? spec[p] : (INHERITED.has(p) || spec[p] === 'inherit') && ps ? undefined : def);
    // font-size первым: от него зависят em
    const fsRaw = spec['font-size'];
    let fs = P['font-size'];
    if (fsRaw) {
      const l = parseLen(fsRaw);
      if (l && l !== 'auto' && l !== 'none') fs = l.u === 'em' ? l.n * P['font-size'] : l.u === 'rem' ? l.n * 16 : l.u === '%' ? l.n / 100 * P['font-size'] : l.n;
      else if (fsRaw === 'smaller') fs = P['font-size'] * 0.83;
      else if (fsRaw === 'larger') fs = P['font-size'] * 1.2;
    }
    s['font-size'] = fs;
    const toPx = (l, fallback) => {
      if (!l || l === 'auto' || l === 'none') return fallback;
      return l.u === 'em' ? l.n * fs : l.u === 'rem' ? l.n * 16 : l.n;
    };
    for (const p of INHERITED) if (p !== 'font-size') s[p] = spec[p] !== undefined && spec[p] !== 'inherit' ? spec[p] : P[p];
    if (node.tag === 'ol' || node.tag === 'ul') s['list-style-type'] = spec['list-style-type'] || (node.tag === 'ol' ? 'decimal' : 'disc');
    const col = parseColor(String(s.color), P.color);
    s.color = col || P.color;
    const fw = String(s['font-weight']);
    s['font-weight'] = fw === 'bold' ? 700 : fw === 'normal' ? 400 : fw === 'bolder' ? Math.min(900, (P['font-weight'] || 400) + 300) : parseInt(fw, 10) || 400;
    if (spec['font-family']) s['font-family'] = resolveFamily(spec['font-family']);
    const lh = String(s['line-height']);
    if (spec['line-height']) {
      const l = parseLen(lh);
      if (/^[\d.]+$/.test(lh)) s['line-height'] = { mul: parseFloat(lh) };
      else if (l && l.u === '%') s['line-height'] = { mul: l.n / 100 };
      else if (l && typeof l === 'object') s['line-height'] = { px: toPx(l, fs * 1.2) };
      else s['line-height'] = 'normal';
    }
    s['letter-spacing'] = typeof s['letter-spacing'] === 'number' ? s['letter-spacing'] : toPx(parseLen(s['letter-spacing']), 0) || 0;

    s.display = spec.display || 'inline';
    s['box-sizing'] = spec['box-sizing'] || 'content-box';
    for (const p of ['width', 'height', 'min-width', 'max-width', 'min-height', 'flex-basis']) {
      const def = p === 'max-width' ? 'none' : p.startsWith('min') ? { n: 0, u: 'px' } : 'auto';
      const l = spec[p] !== undefined ? parseLen(spec[p]) : def;
      s[p] = l === undefined ? def : l;
      if (s[p] && typeof s[p] === 'object' && s[p].u === 'em') s[p] = { n: s[p].n * fs, u: 'px' };
      if (s[p] && typeof s[p] === 'object' && s[p].u === 'rem') s[p] = { n: s[p].n * 16, u: 'px' };
    }
    for (const box of ['margin', 'padding']) for (const side of SIDES) {
      const p = `${box}-${side}`;
      let l = spec[p] !== undefined ? parseLen(spec[p]) : { n: 0, u: 'px' };
      if (l === undefined || (box === 'padding' && l === 'auto')) l = { n: 0, u: 'px' };
      if (l && typeof l === 'object' && (l.u === 'em' || l.u === 'rem')) l = { n: toPx(l, 0), u: 'px' };
      s[p] = l;
    }
    for (const side of SIDES) {
      const st = spec[`border-${side}-style`] || 'none';
      const wRaw = spec[`border-${side}-width`] || 'medium';
      const w = WIDTHS[wRaw] !== undefined ? WIDTHS[wRaw] : toPx(parseLen(wRaw), 0);
      s[`border-${side}-width`] = st === 'none' || st === 'hidden' ? 0 : Math.max(0, w || 0);
      s[`border-${side}-style`] = st;
      s[`border-${side}-color`] = parseColor(spec[`border-${side}-color`] || 'currentcolor', s.color) || null;
    }
    s['border-radius'] = toPx(parseLen(spec['border-radius'] || '0'), 0) || 0;
    s['background-color'] = parseColor(spec['background-color'] || 'transparent', s.color) || null;
    s['text-decoration'] = spec['text-decoration'] ? (spec['text-decoration'].includes('underline') ? 'underline' : spec['text-decoration'].includes('line-through') ? 'line-through' : 'none') : (ps && ps['text-decoration-inh']) || 'none';
    s['text-decoration-inh'] = s['text-decoration'] !== 'none' ? s['text-decoration'] : (ps && ps['text-decoration-inh']) || 'none';
    s['flex-direction'] = spec['flex-direction'] || 'row';
    s['flex-wrap'] = spec['flex-wrap'] || 'nowrap';
    s['justify-content'] = spec['justify-content'] || 'flex-start';
    s['align-items'] = spec['align-items'] || 'stretch';
    s['align-self'] = spec['align-self'] || 'auto';
    s['flex-grow'] = parseFloat(spec['flex-grow'] || '0') || 0;
    s['flex-shrink'] = spec['flex-shrink'] !== undefined ? parseFloat(spec['flex-shrink']) || 0 : 1;
    s['row-gap'] = toPx(parseLen(spec['row-gap'] || '0'), 0) || 0;
    s['column-gap'] = toPx(parseLen(spec['column-gap'] || '0'), 0) || 0;
    s.opacity = spec.opacity !== undefined ? Math.max(0, Math.min(1, parseFloat(spec.opacity))) : 1;
    return s;
  }

  // ================= Измерение текста =================
  const mcv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const mctx = mcv ? mcv.getContext('2d') : null;
  const fontOf = (s) => `${s['font-style'] === 'italic' ? 'italic ' : ''}${s['font-weight']} ${s['font-size']}px ${s['font-family']}`;
  const measureCache = new Map();
  function measure(text, s) {
    const f = fontOf(s);
    const key = f + '|' + s['letter-spacing'] + '|' + text;
    let w = measureCache.get(key);
    if (w === undefined) {
      mctx.font = f;
      w = mctx.measureText(text).width + s['letter-spacing'] * [...text].length;
      measureCache.set(key, w);
      if (measureCache.size > 20000) measureCache.clear();
    }
    return w;
  }
  const metricCache = new Map();
  function fontMetrics(s) {
    const f = fontOf(s);
    let m = metricCache.get(f);
    if (!m) {
      mctx.font = f;
      const t = mctx.measureText('Hgйр');
      const asc = t.fontBoundingBoxAscent || s['font-size'] * 0.8, desc = t.fontBoundingBoxDescent || s['font-size'] * 0.2;
      m = { asc, desc };
      metricCache.set(f, m);
    }
    return m;
  }
  const lineHeightPx = (s) => { const lh = s['line-height']; const fs = s['font-size']; return lh === 'normal' ? fs * 1.25 : lh.mul !== undefined ? lh.mul * fs : lh.px; };
  const transform = (t, s) => (s['text-transform'] === 'uppercase' ? t.toUpperCase() : s['text-transform'] === 'lowercase' ? t.toLowerCase() : t);

  // ================= Дерево коробок =================
  const isBlockLevel = (d) => d === 'block' || d === 'flex' || d === 'list-item';
  function buildBoxes(doc) {
    const htmlEl = doc.children.find((n) => n.type === 'el' && n.tag === 'html');
    let count = 0;
    const make = (node, parent, depth) => {
      count++;
      const s = node.style;
      const box = { node, style: s, kind: s.display === 'flex' ? 'flex' : 'block', parent, depth, children: [], inline: null, lines: null };
      if (s.display === 'list-item') box.listItem = true;
      if (box.kind === 'flex') {
        let anonRun = [];
        const flush = () => {
          if (anonRun.some((r) => r.text && r.text.trim())) {
            const a = { node: null, style: anonStyle(s), kind: 'block', parent: box, depth: depth + 1, children: [], anon: true, inline: anonRun, lines: null };
            box.children.push(a); count++;
          }
          anonRun = [];
        };
        for (const c of node.children) {
          if (c.type === 'text') { anonRun.push({ text: c.text, style: s, stack: [] }); continue; }
          if (!c.style || c.style.display === 'none') continue;
          flush();
          box.children.push(make(c, box, depth + 1));
        }
        flush();
        return box;
      }
      // Блочный контейнер: либо только строчное содержимое, либо блоки (строчное оборачиваем в анонимные)
      const hasBlock = node.children.some((c) => c.type === 'el' && c.style && isBlockLevel(c.style.display));
      if (!hasBlock) { box.inline = collectInline(node, []); return box; }
      let run = [];
      const flush = () => {
        if (run.some((r) => r.br || (r.text && r.text.trim()))) {
          box.children.push({ node: null, style: anonStyle(s), kind: 'block', parent: box, depth: depth + 1, children: [], anon: true, inline: run, lines: null });
          count++;
        }
        run = [];
      };
      for (const c of node.children) {
        if (c.type === 'text') { run.push({ text: c.text, style: s, stack: [] }); continue; }
        if (!c.style || c.style.display === 'none') continue;
        if (isBlockLevel(c.style.display)) { flush(); box.children.push(make(c, box, depth + 1)); }
        else run.push(...collectInline(c, [c]));
      }
      flush();
      return box;
    };
    const rootBox = make(htmlEl, null, 0);
    rootBox.count = count;
    return rootBox;
  }
  function anonStyle(ps) {
    const s = Object.assign({}, ps);
    for (const side of SIDES) { s[`margin-${side}`] = { n: 0, u: 'px' }; s[`padding-${side}`] = { n: 0, u: 'px' }; s[`border-${side}-width`] = 0; }
    s.width = 'auto'; s.height = 'auto'; s['max-width'] = 'none'; s['min-width'] = { n: 0, u: 'px' }; s['background-color'] = null; s['border-radius'] = 0; s.display = 'block';
    s['flex-grow'] = 0; s['flex-shrink'] = 1; s['flex-basis'] = 'auto'; s['align-self'] = 'auto'; s.opacity = 1;
    return s;
  }
  function collectInline(node, stack) {
    const out = [];
    if (node.type === 'text') return [{ text: node.text, style: node.parent.style, stack: stack.slice(0, -1) }];
    if (node.tag === 'br') return [{ br: true }];
    if (node.style && node.style.display === 'none') return out;
    for (const c of node.children) {
      if (c.type === 'text') out.push({ text: c.text, style: node.style, stack: stack.slice() });
      else if (c.style && c.style.display !== 'none') {
        if (c.tag === 'br') out.push({ br: true });
        else out.push(...collectInline(c, stack.concat([c])));
      }
    }
    return out;
  }

  // ================= Раскладка =================
  const lenPx = (l, base, fallback) => {
    if (l === 'auto' || l === 'none' || l === null || l === undefined) return fallback;
    if (l.u === '%') return base * l.n / 100;
    if (l.u === 'vw') return VW * l.n / 100;
    if (l.u === 'vh') return VW * 0.625 * l.n / 100;
    return l.n;
  };
  let VW = 800;

  function edges(box, cbw) {
    const s = box.style;
    const e = {};
    e.ml = s['margin-left'] === 'auto' ? 0 : lenPx(s['margin-left'], cbw, 0);
    e.mr = s['margin-right'] === 'auto' ? 0 : lenPx(s['margin-right'], cbw, 0);
    e.mt = s['margin-top'] === 'auto' ? 0 : lenPx(s['margin-top'], cbw, 0);
    e.mb = s['margin-bottom'] === 'auto' ? 0 : lenPx(s['margin-bottom'], cbw, 0);
    e.pl = lenPx(s['padding-left'], cbw, 0); e.pr = lenPx(s['padding-right'], cbw, 0);
    e.pt = lenPx(s['padding-top'], cbw, 0); e.pb = lenPx(s['padding-bottom'], cbw, 0);
    e.bl = s['border-left-width']; e.br = s['border-right-width']; e.bt = s['border-top-width']; e.bb = s['border-bottom-width'];
    return e;
  }

  function layoutBlock(box, cbw, x, y, forced) {
    const s = box.style;
    const e = edges(box, cbw);
    const hp = e.pl + e.pr + e.bl + e.br, vp = e.pt + e.pb + e.bt + e.bb;
    let w;
    const hasW = s.width !== 'auto';
    if (forced && forced.w !== undefined) { w = forced.w - hp; e.ml = forced.ml !== undefined ? forced.ml : e.ml; e.mr = forced.mr !== undefined ? forced.mr : e.mr; }
    else if (hasW) { w = lenPx(s.width, cbw, 0); if (s['box-sizing'] === 'border-box') w -= hp; }
    else w = cbw - e.ml - e.mr - hp;
    const maxW = s['max-width'] !== 'none' ? lenPx(s['max-width'], cbw, Infinity) - (s['box-sizing'] === 'border-box' ? hp : 0) : Infinity;
    const minW = lenPx(s['min-width'], cbw, 0);
    let clamped = false;
    if (w > maxW) { w = maxW; clamped = true; }
    if (w < minW) w = minW;
    w = Math.max(0, w);
    if (!(forced && forced.w !== undefined) && (hasW || clamped)) {
      const rest = cbw - w - hp - e.ml - e.mr;
      const la = s['margin-left'] === 'auto', ra = s['margin-right'] === 'auto';
      if (la && ra) { e.ml += rest / 2; e.mr += rest / 2; } else if (la) e.ml += rest; else if (ra) e.mr += rest;
    }
    box.e = e;
    box.x = x + e.ml; box.y = y; box.w = w + hp;
    const cx = box.x + e.bl + e.pl, cy = box.y + e.bt + e.pt;
    box.cx = cx; box.cy = cy; box.cw = w;
    let contentH = 0;
    if (box.kind === 'flex') contentH = layoutFlex(box, cx, cy, w);
    else if (box.inline) contentH = layoutInline(box, cx, cy, w);
    else {
      let cursor = cy, prevMB = 0, first = true;
      let idx = 0;
      for (const c of box.children) {
        const ce = edges(c, w);
        const top = first ? cursor + ce.mt : cursor + Math.max(prevMB, ce.mt);
        layoutBlock(c, w, cx, top);
        if (c.listItem) c.marker = markerFor(c, box, idx);
        idx++;
        cursor = c.y + c.h; prevMB = c.e.mb; first = false;
      }
      contentH = box.children.length ? cursor + prevMB - cy : 0;
    }
    let h = contentH;
    if (forced && forced.h !== undefined) h = forced.h - vp;
    else if (s.height !== 'auto') { h = lenPx(s.height, cbw, contentH); if (s['box-sizing'] === 'border-box') h -= vp; }
    const minH = lenPx(s['min-height'], cbw, 0);
    box.h = Math.max(h, minH, 0) + vp;
    return box;
  }

  function markerFor(li, list, idx) {
    const s = li.style;
    const firstLine = findFirstLine(li);
    const type = list.style['list-style-type'] || 'disc';
    const text = type === 'decimal' ? `${idx + 1}.` : type === 'none' ? '' : '•';
    const ms = Object.assign({}, s);
    const w = measure(text, ms);
    return { text, x: li.x + li.e.bl - w - 8, y: firstLine ? firstLine.base : li.y + lineHeightPx(s) * 0.8, style: ms };
  }
  function findFirstLine(b) {
    if (b.lines && b.lines.length) return b.lines[0];
    for (const c of b.children) { const f = findFirstLine(c); if (f) return f; }
    return null;
  }

  function shiftBox(b, dx, dy) {
    b.x += dx; b.y += dy; b.cx += dx; b.cy += dy;
    if (b.lines) for (const L of b.lines) { L.x += dx; L.y += dy; L.base += dy; for (const f of L.frags) f.x += dx; }
    if (b.marker) { b.marker.x += dx; b.marker.y += dy; }
    for (const c of b.children) shiftBox(c, dx, dy);
  }

  // Максимальная ширина содержимого без переносов (для флекс-элементов)
  function maxContent(box) {
    const s = box.style;
    const e = edges(box, 0);
    const hp = e.pl + e.pr + e.bl + e.br;
    if (s.width !== 'auto' && s.width.u !== '%') return lenPx(s.width, 0, 0) + (s['box-sizing'] === 'border-box' ? 0 : hp);
    let inner = 0;
    if (box.inline) {
      let cur = 0;
      for (const it of tokenize(box.inline)) { if (it.br) { inner = Math.max(inner, cur); cur = 0; } else cur += it.w; }
      inner = Math.max(inner, cur);
    } else if (box.kind === 'flex' && s['flex-direction'].startsWith('row')) {
      box.children.forEach((c, i) => { const ce = edges(c, 0); inner += maxContent(c) + ce.ml + ce.mr + (i ? s['column-gap'] : 0); });
    } else {
      for (const c of box.children) { const ce = edges(c, 0); inner = Math.max(inner, maxContent(c) + ce.ml + ce.mr); }
    }
    const maxW = s['max-width'] !== 'none' && s['max-width'].u === 'px' ? s['max-width'].n : Infinity;
    return Math.min(inner, maxW) + hp;
  }

  function layoutFlex(box, cx, cy, cw) {
    const s = box.style;
    const row = s['flex-direction'].startsWith('row');
    const items = box.children;
    if (!items.length) return 0;
    const gapM = row ? s['column-gap'] : s['row-gap'], gapC = row ? s['row-gap'] : s['column-gap'];
    const wrap = s['flex-wrap'] === 'wrap';
    if (!row) {
      // Колонка: элементы друг под другом
      let cursor = cy, maxH = 0;
      const heightDef = s.height !== 'auto';
      const out = [];
      for (const it of items) {
        const e = edges(it, cw);
        const al = it.style['align-self'] !== 'auto' ? it.style['align-self'] : s['align-items'];
        let forcedW;
        if (al !== 'stretch' && it.style.width === 'auto') forcedW = Math.min(cw - e.ml - e.mr, maxContent(it));
        layoutBlock(it, cw, cx, cursor + e.mt, forcedW !== undefined ? { w: forcedW, ml: e.ml, mr: e.mr } : undefined);
        if (forcedW !== undefined) {
          const free = cw - it.w - e.ml - e.mr;
          const dx = al === 'center' ? free / 2 : al === 'flex-end' ? free : 0;
          if (dx) shiftBox(it, dx, 0);
        }
        out.push(it);
        cursor = it.y + it.h + e.mb + gapM;
      }
      let total = cursor - gapM - cy;
      if (heightDef) {
        const H = lenPx(s.height, cw, total) - (s['box-sizing'] === 'border-box' ? edges(box, cw).pt + edges(box, cw).pb : 0);
        const free = H - total;
        const n = out.length;
        const jc = s['justify-content'];
        let off = jc === 'center' ? free / 2 : jc === 'flex-end' ? free : jc === 'space-around' ? free / n / 2 : jc === 'space-evenly' ? free / (n + 1) : 0;
        const between = jc === 'space-between' && n > 1 ? free / (n - 1) : jc === 'space-around' ? free / n : jc === 'space-evenly' ? free / (n + 1) : 0;
        out.forEach((it, i) => shiftBox(it, 0, off + between * i));
        total = Math.max(total, H);
      }
      void maxH;
      return total;
    }
    // Строка: базовые размеры
    const info = items.map((it) => {
      const e = edges(it, cw);
      const st = it.style;
      let basis;
      if (st['flex-basis'] !== 'auto' && st['flex-basis'] !== undefined) basis = lenPx(st['flex-basis'], cw, 0) + (st['box-sizing'] === 'border-box' ? 0 : e.pl + e.pr + e.bl + e.br);
      else if (st.width !== 'auto') basis = lenPx(st.width, cw, 0) + (st['box-sizing'] === 'border-box' ? 0 : e.pl + e.pr + e.bl + e.br);
      else basis = maxContent(it);
      const minW = e.pl + e.pr + e.bl + e.br;
      return { it, e, basis, grow: st['flex-grow'], shrink: st['flex-shrink'], min: minW };
    });
    // Разбиение на строки
    const lines = [];
    let cur = [], used = 0;
    for (const f of info) {
      const outer = f.basis + f.e.ml + f.e.mr;
      if (wrap && cur.length && used + gapM + outer > cw) { lines.push(cur); cur = []; used = 0; }
      used += (cur.length ? gapM : 0) + outer; cur.push(f);
    }
    if (cur.length) lines.push(cur);
    let y = cy;
    lines.forEach((ln, li) => {
      const sumOuter = ln.reduce((a, f) => a + f.basis + f.e.ml + f.e.mr, 0) + gapM * (ln.length - 1);
      let free = cw - sumOuter;
      const sizes = ln.map((f) => f.basis);
      if (free > 0) {
        const G = ln.reduce((a, f) => a + f.grow, 0);
        if (G > 0) { ln.forEach((f, i) => { sizes[i] += free * f.grow / G; }); free = 0; }
      } else if (free < 0) {
        const S = ln.reduce((a, f) => a + f.shrink * f.basis, 0);
        if (S > 0) { ln.forEach((f, i) => { sizes[i] = Math.max(f.min, sizes[i] + free * f.shrink * f.basis / S); }); free = cw - (sizes.reduce((a, b) => a + b, 0) + ln.reduce((a, f) => a + f.e.ml + f.e.mr, 0) + gapM * (ln.length - 1)); }
      }
      const n = ln.length, jc = s['justify-content'];
      let off = jc === 'center' ? free / 2 : jc === 'flex-end' ? free : jc === 'space-around' ? free / n / 2 : jc === 'space-evenly' ? free / (n + 1) : 0;
      const extra = jc === 'space-between' && n > 1 ? free / (n - 1) : jc === 'space-around' ? free / n : jc === 'space-evenly' ? free / (n + 1) : 0;
      if (free < 0 && jc !== 'center' && jc !== 'flex-end') off = 0;
      let x = cx + off;
      let lineH = 0;
      ln.forEach((f, i) => {
        layoutBlock(f.it, cw, x, y + f.e.mt, { w: sizes[i], ml: f.e.ml, mr: f.e.mr });
        lineH = Math.max(lineH, f.it.h + f.e.mt + f.e.mb);
        x = f.it.x + f.it.w + f.e.mr + gapM + extra;
      });
      if (lines.length === 1 && s.height !== 'auto') {
        const e = edges(box, cw);
        lineH = Math.max(lineH, lenPx(s.height, cw, lineH) - (s['box-sizing'] === 'border-box' ? e.pt + e.pb + e.bt + e.bb : 0));
      }
      // Выравнивание по поперечной оси
      ln.forEach((f) => {
        const al = f.it.style['align-self'] !== 'auto' ? f.it.style['align-self'] : s['align-items'];
        const outerH = f.it.h + f.e.mt + f.e.mb;
        if (al === 'stretch' && f.it.style.height === 'auto') {
          const target = lineH - f.e.mt - f.e.mb;
          if (target > f.it.h) f.it.h = target;
        } else if (al === 'center') shiftBox(f.it, 0, (lineH - outerH) / 2);
        else if (al === 'flex-end') shiftBox(f.it, 0, lineH - outerH);
      });
      y += lineH + (li < lines.length - 1 ? gapC : 0);
    });
    return y - cy;
  }

  function tokenize(runs) {
    const items = [];
    for (const r of runs) {
      if (r.br) { items.push({ br: true }); continue; }
      const pre = r.style['white-space'] === 'pre';
      let t = pre ? r.text : r.text.replace(/[\t\n\r ]+/g, ' ');
      t = transform(t, r.style);
      const re = pre ? /(\n)|([^\n]+)/g : /( )|([^ ]+)/g;
      let m;
      while ((m = re.exec(t))) {
        if (pre && m[1]) { items.push({ br: true }); continue; }
        const space = !pre && !!m[1];
        const text = m[0];
        items.push({ text, space, style: r.style, stack: r.stack, w: measure(text, r.style) });
      }
    }
    return items;
  }

  function layoutInline(box, cx, cy, cw) {
    const items = tokenize(box.inline);
    const lines = [];
    let line = { items: [], w: 0 };
    const trim = (L) => { while (L.items.length && L.items[L.items.length - 1].space) L.w -= L.items.pop().w; };
    for (const it of items) {
      if (it.br) { trim(line); line.forced = true; lines.push(line); line = { items: [], w: 0 }; continue; }
      if (it.space) {
        if (!line.items.length || line.items[line.items.length - 1].space) continue;
        line.items.push(it); line.w += it.w; continue;
      }
      if (line.w + it.w > cw + 0.01 && line.items.length) { trim(line); lines.push(line); line = { items: [], w: 0 }; }
      line.items.push(it); line.w += it.w;
    }
    trim(line);
    if (line.items.length || !lines.length) lines.push(line);
    const bs = box.style;
    const align = bs['text-align'];
    const out = [];
    let y = cy;
    for (const L of lines) {
      let A = 0, D = 0;
      const strut = [bs].concat(L.items.map((i) => i.style));
      for (const st of strut) {
        const lh = lineHeightPx(st), fm = fontMetrics(st);
        const half = (lh - (fm.asc + fm.desc)) / 2;
        A = Math.max(A, half + fm.asc); D = Math.max(D, half + fm.desc);
      }
      const h = A + D;
      const free = cw - L.w;
      let x = cx + (align === 'center' ? free / 2 : align === 'right' || align === 'end' ? free : 0);
      const frags = [];
      for (const it of L.items) {
        const last = frags[frags.length - 1];
        if (last && last.style === it.style && last.stack === it.stack) { last.text += it.text; last.w += it.w; }
        else frags.push({ x, text: it.text, w: it.w, style: it.style, stack: it.stack });
        x += it.w;
      }
      out.push({ x: cx, y, w: cw, h, base: y + A, frags, used: L.w });
      y += h;
    }
    box.lines = out;
    return y - cy;
  }

  function layout(rootBox, viewportW) {
    VW = viewportW;
    const t = rootBox;
    layoutBlock(t, viewportW, 0, 0);
    let count = 0, lines = 0;
    (function walk(b) { count++; if (b.lines) lines += b.lines.length; b.children.forEach(walk); })(t);
    t.boxCount = count; t.lineCount = lines;
    return t;
  }

  // ================= Отрисовка =================
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }
  function paintDecor(ctx, b) {
    const s = b.style, e = b.e;
    const r = s['border-radius'];
    if (s['background-color']) { ctx.fillStyle = s['background-color']; roundRect(ctx, b.x, b.y, b.w, b.h, r); ctx.fill(); }
    const bw = [e.bt, e.br, e.bb, e.bl], bc = SIDES.map((sd) => s[`border-${sd}-color`]);
    if (bw.some((v) => v > 0)) {
      const uniform = bw.every((v) => v === bw[0]) && bc.every((c) => c === bc[0]);
      if (uniform && bc[0]) {
        ctx.strokeStyle = bc[0]; ctx.lineWidth = bw[0];
        const dashed = s['border-top-style'] === 'dashed' ? [bw[0] * 3, bw[0] * 2] : s['border-top-style'] === 'dotted' ? [bw[0], bw[0]] : [];
        ctx.setLineDash(dashed);
        roundRect(ctx, b.x + bw[0] / 2, b.y + bw[0] / 2, b.w - bw[0], b.h - bw[0], Math.max(0, r - bw[0] / 2)); ctx.stroke();
        ctx.setLineDash([]);
      } else {
        if (bw[0] && bc[0]) { ctx.fillStyle = bc[0]; ctx.fillRect(b.x, b.y, b.w, bw[0]); }
        if (bw[2] && bc[2]) { ctx.fillStyle = bc[2]; ctx.fillRect(b.x, b.y + b.h - bw[2], b.w, bw[2]); }
        if (bw[3] && bc[3]) { ctx.fillStyle = bc[3]; ctx.fillRect(b.x, b.y, bw[3], b.h); }
        if (bw[1] && bc[1]) { ctx.fillStyle = bc[1]; ctx.fillRect(b.x + b.w - bw[1], b.y, bw[1], b.h); }
      }
    }
  }
  function paintText(ctx, b) {
    if (b.marker && b.marker.text) {
      const m = b.marker; ctx.font = fontOf(m.style); ctx.fillStyle = m.style.color; ctx.letterSpacing = '0px';
      ctx.fillText(m.text, m.x, m.y);
    }
    if (!b.lines) return;
    for (const L of b.lines) {
      for (const f of L.frags) {
        // Фон строчных элементов (mark, code)
        for (const el of f.stack) {
          const bg = el.style['background-color'];
          if (bg) {
            const fm = fontMetrics(f.style);
            const pad = Math.max(0, lenPx(el.style['padding-left'], 0, 0));
            ctx.fillStyle = bg; roundRect(ctx, f.x - pad, L.base - fm.asc - 1, f.w + pad * 2, fm.asc + fm.desc + 2, Math.min(4, el.style['border-radius'] || 3)); ctx.fill();
          }
        }
      }
      for (const f of L.frags) {
        ctx.font = fontOf(f.style);
        ctx.letterSpacing = `${f.style['letter-spacing']}px`;
        ctx.fillStyle = f.style.color;
        ctx.fillText(f.text, f.x, L.base);
        const deco = f.style['text-decoration-inh'];
        if (deco && deco !== 'none') {
          const fs = f.style['font-size'];
          ctx.fillRect(f.x, deco === 'underline' ? L.base + fs * 0.12 : L.base - fs * 0.3, f.w - (f.text.endsWith(' ') ? measure(' ', f.style) : 0), Math.max(1, fs / 15));
        }
      }
    }
    ctx.letterSpacing = '0px';
  }
  function paintBox(ctx, b) { paintDecor(ctx, b); paintText(ctx, b); }
  function paintTree(ctx, b) {
    const op = b.style.opacity;
    const prev = ctx.globalAlpha;
    if (op < 1) ctx.globalAlpha = prev * op;
    paintBox(ctx, b);
    for (const c of b.children) paintTree(ctx, c);
    ctx.globalAlpha = prev;
  }

  function flatten(rootBox) {
    const out = [];
    (function walk(b) { out.push(b); b.children.forEach(walk); })(rootBox);
    return out;
  }

  // ================= Конвейер целиком =================
  function run(html, css, viewportW) {
    const t0 = performance.now();
    const doc = parseHTML(html);
    const t1 = performance.now();
    const rules = parseCSS(css, 'author');
    cascade(doc, rules, viewportW);
    const t2 = performance.now();
    const rootBox = buildBoxes(doc);
    layout(rootBox, viewportW);
    const t3 = performance.now();
    return { doc, rules, root: rootBox, boxes: flatten(rootBox), timing: { parse: t1 - t0, style: t2 - t1, layout: t3 - t2 }, nodes: doc.count };
  }

  root.LE = { parseHTML, parseCSS, cascade, buildBoxes, layout, run, paintTree, paintBox, paintDecor, paintText, flatten, fontOf, measure, roundRect, clearCaches: () => { measureCache.clear(); metricCache.clear(); } };
})(typeof window !== 'undefined' ? window : globalThis);
