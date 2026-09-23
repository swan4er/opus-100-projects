/* Внутренности Git — интерфейс: терминал, граф объектов, уроки, три дерева. */
(function () {
  'use strict';
  const { Repo, short } = window.MiniGit;
  const { run, complete } = window.GitShell;

  const $ = (s) => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const SHOT = !!window.__SHOT__;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const LANE_COLORS = ['#ff7a59', '#4cc9f0', '#b5e655', '#ff6fae', '#f7c04a', '#7fa7ff'];
  const laneColor = (lane) => LANE_COLORS[(lane ?? 0) % LANE_COLORS.length];
  const C_TREE = '#a594ff', C_BLOB = '#62e0b0', C_TAG = '#f7c04a';

  let repo = new Repo();

  /* ================= Терминал ================= */
  const outEl = $('#out'), cmdEl = $('#cmd'), promptEl = $('#prompt');
  const history = [];
  let hIdx = -1;

  function promptHTML() {
    const br = repo.branch();
    const lane = br ? repo.lanes.get(br) : null;
    const label = br ? br : repo.head.sha ? short(repo.head.sha) : '';
    const color = br ? laneColor(lane ?? 0) : '#e9edf5';
    return `<span class="p-path">~/проект</span>${repo.inited ? ` <span class="p-br" style="color:${color}">(${esc(label)})</span>` : ''} <span class="p-d">$</span>`;
  }
  function printLines(lines) {
    const frag = document.createDocumentFragment();
    for (const l of lines) {
      const d = document.createElement('div');
      d.className = 'l';
      d.innerHTML = l.map(([t, c]) => (c ? `<span class="${c}">${esc(t)}</span>` : esc(t))).join('') || '&nbsp;';
      frag.appendChild(d);
    }
    outEl.appendChild(frag);
  }
  function echoCommand(cmd) {
    const d = document.createElement('div');
    d.className = 'l cmdline';
    d.innerHTML = promptHTML() + ' <span class="c">' + esc(cmd) + '</span>';
    outEl.appendChild(d);
  }
  function trim() { while (outEl.children.length > 600) outEl.removeChild(outEl.firstChild); }
  function scrollDown() { outEl.scrollTop = outEl.scrollHeight; }

  function exec(cmd, { echo = true, quiet = false } = {}) {
    repo.changed.created = new Set();
    const res = run(repo, cmd);
    if (!quiet) {
      if (echo) echoCommand(cmd);
      if (res && res.clear) outEl.innerHTML = '';
      else if (Array.isArray(res)) printLines(res);
      trim(); scrollDown();
    }
    if (!res || !res.clear) afterChange();
    return res;
  }
  function afterChange() {
    promptEl.innerHTML = promptHTML();
    $('#termBranch').textContent = repo.inited ? (repo.branch() ? 'ветка ' + repo.branch() : 'HEAD отделён') : 'нет репозитория';
    syncGraph();
    renderTrees();
    renderSuggest();
    lessonCheck();
  }

  cmdEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = cmdEl.value;
      cmdEl.value = '';
      if (v.trim()) { history.unshift(v); hIdx = -1; }
      exec(v);
    } else if (e.key === 'ArrowUp') {
      if (hIdx < history.length - 1) { hIdx++; cmdEl.value = history[hIdx]; }
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      if (hIdx > 0) { hIdx--; cmdEl.value = history[hIdx]; } else { hIdx = -1; cmdEl.value = ''; }
      e.preventDefault();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const r = complete(repo, cmdEl.value);
      if (typeof r === 'string') cmdEl.value = r;
      else if (r && r.options) { echoCommand(cmdEl.value); printLines([[[r.options.join('   '), 'dim']]]); scrollDown(); }
    } else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); outEl.innerHTML = ''; }
  });
  $('#term').addEventListener('click', (e) => { if (!window.getSelection().toString() && !e.target.closest('button')) cmdEl.focus({ preventScroll: true }); });

  // Печать команды «вживую», как будто её набирают
  let typing = null;
  function typeAndRun(cmd) {
    if (typing) { clearInterval(typing); typing = null; }
    if (reduceMotion || SHOT) { cmdEl.value = ''; history.unshift(cmd); exec(cmd); return; }
    cmdEl.value = '';
    let i = 0;
    typing = setInterval(() => {
      cmdEl.value = cmd.slice(0, ++i);
      if (i >= cmd.length) {
        clearInterval(typing); typing = null;
        setTimeout(() => { cmdEl.value = ''; history.unshift(cmd); exec(cmd); }, 160);
      }
    }, 22);
  }

  /* ================= Подсказки ================= */
  function suggestions() {
    if (!repo.inited) return ['git init', 'help'];
    const s = repo.status();
    const out = [];
    if (repo.merging) return ['git status', 'cat README.md', 'git merge --abort'];
    if (s.untracked.length || s.unstaged.length) out.push('git add .', 'git status', 'git diff');
    if (s.staged.length) out.push('git commit -m "Мой коммит"', 'git diff --staged');
    if (!out.length) {
      out.push('echo "новая строка" >> README.md');
      const others = [...repo.heads.keys()].filter((b) => b !== repo.branch());
      if (others.length) out.push(`git merge ${others[0]}`);
      else out.push('git switch -c idea');
      out.push('git log --oneline --all', 'git cat-file -p HEAD');
    }
    return out.slice(0, 4);
  }
  function renderSuggest() {
    const el = $('#suggest');
    el.innerHTML = suggestions().map((c) => `<button class="chip" data-cmd="${esc(c)}">${esc(c)}</button>`).join('');
  }
  $('#suggest').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    if (b) typeAndRun(b.dataset.cmd);
  });

  /* ================= Три дерева ================= */
  function renderTrees() {
    const body = $('#treesBody');
    if (!repo.inited) { body.innerHTML = '<tr><td colspan="4" class="empty">Репозитория ещё нет</td></tr>'; return; }
    const headSnap = repo.snapshot(repo.headSha());
    const paths = [...new Set([...repo.work.keys(), ...repo.index.keys(), ...headSnap.keys()])].sort();
    if (!paths.length) { body.innerHTML = '<tr><td colspan="4" class="empty">Файлов нет — создайте: echo "текст" &gt; файл.txt</td></tr>'; return; }
    body.innerHTML = paths.map((p) => {
      const w = repo.work.has(p) ? repo.hashBlob(repo.work.get(p)) : null;
      const i = repo.index.get(p) || null, h = headSnap.get(p) || null;
      const cell = (v, cls) => (v ? `<td class="h ${cls}">${short(v)}</td>` : '<td class="h none">—</td>');
      const wc = !w ? '' : w !== i ? 'mod' : '';
      const ic = !i ? '' : i !== h ? 'stg' : '';
      return `<tr><td class="p" title="${esc(p)}">${esc(p)}</td>${cell(w, wc)}${cell(i, ic)}${cell(h, '')}</tr>`;
    }).join('');
  }

  /* ================= Граф объектов ================= */
  const svg = $('#svg');
  const gBack = svg.querySelector('.g-back'), gEdges = svg.querySelector('.g-edges'), gNodes = svg.querySelector('.g-nodes'), gRefs = svg.querySelector('.g-refs');
  const G = { nodes: new Map(), refs: new Map(), edges: new Map(), view: null, target: null, autoFit: true, layout: null, sel: null };
  const DX = 136, LANE = 96, GAP = 128, LEVEL = 100;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function resolveRow(items, gap) {
    items.sort((a, b) => a.want - b.want || a.seq - b.seq);
    let prev = -Infinity;
    for (const it of items) { it.x = Math.max(it.want, prev + gap); prev = it.x; }
    if (!items.length) return;
    const shift = items.reduce((s, it) => s + (it.want - it.x), 0) / items.length;
    items.forEach((it) => { it.x += shift; });
  }

  function computeLayout() {
    const objs = [...repo.objects.values()];
    const commits = objs.filter((o) => o.type === 'commit').sort((a, b) => a.seq - b.seq);
    const reach = repo.reachable();
    const indexBlobs = new Set(repo.index.values());
    const lanesUsed = [...new Set(commits.map((c) => c.lane ?? 0))].sort((a, b) => a - b);
    const laneRow = new Map(lanesUsed.map((l, i) => [l, i]));
    const nodes = new Map();
    commits.forEach((c, i) => nodes.set(c.sha, { id: c.sha, type: 'commit', x: i * DX, y: laneRow.get(c.lane ?? 0) * LANE, o: c, lane: c.lane ?? 0, dead: !reach.has(c.sha) }));
    const rowsBottom = Math.max(0, lanesUsed.length - 1) * LANE;

    // Деревья по уровням вложенности и блобы
    const treeDepth = new Map(), treeParents = new Map(), blobParents = new Map(), blobNames = new Map(), treeNames = new Map();
    const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
    for (const c of commits) { push(treeParents, c.commit.tree, c.sha); treeDepth.set(c.commit.tree, 0); }
    // Незакоммиченные деревья (например, осиротевшие после gc — их нет) и все деревья из объектов
    const trees = objs.filter((o) => o.type === 'tree');
    let changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      for (const t of trees) {
        if (!treeDepth.has(t.sha)) continue;
        const d = treeDepth.get(t.sha);
        for (const e of t.entries) {
          if (e.mode === '40000') {
            if (!treeDepth.has(e.sha) || treeDepth.get(e.sha) < d + 1) { treeDepth.set(e.sha, d + 1); changed = true; }
          }
        }
      }
    }
    for (const t of trees) {
      if (!treeDepth.has(t.sha)) treeDepth.set(t.sha, 0);
      for (const e of t.entries) {
        if (e.mode === '40000') { push(treeParents, e.sha, t.sha); if (!treeNames.has(e.sha)) treeNames.set(e.sha, e.name + '/'); }
        else { push(blobParents, e.sha, t.sha); if (!blobNames.has(e.sha)) blobNames.set(e.sha, new Set()); blobNames.get(e.sha).add(e.name); }
      }
    }
    for (const [p, sha] of repo.index) { if (!blobNames.has(sha)) blobNames.set(sha, new Set()); blobNames.get(sha).add(p.split('/').pop()); }
    const maxDepth = Math.max(0, ...treeDepth.values());
    const treeY = (d) => rowsBottom + GAP + d * LEVEL;
    const blobY = treeY(maxDepth) + LEVEL + 6;
    const lastX = Math.max(0, commits.length - 1) * DX;

    for (let d = 0; d <= maxDepth; d++) {
      const row = trees.filter((t) => treeDepth.get(t.sha) === d).map((t) => {
        const ps = (treeParents.get(t.sha) || []).map((p) => nodes.get(p)).filter(Boolean);
        return { t, want: ps.length ? ps.reduce((s, p) => s + p.x, 0) / ps.length : lastX + DX, seq: t.seq };
      });
      resolveRow(row, 74);
      row.forEach((it) => nodes.set(it.t.sha, { id: it.t.sha, type: 'tree', x: it.x, y: treeY(d), o: it.t, name: treeNames.get(it.t.sha) || '', dead: !reach.has(it.t.sha) }));
    }
    const blobs = objs.filter((o) => o.type === 'blob').map((b) => {
      const ps = (blobParents.get(b.sha) || []).map((p) => nodes.get(p)).filter(Boolean);
      return { b, want: ps.length ? ps.reduce((s, p) => s + p.x, 0) / ps.length : lastX + DX * 0.8, seq: b.seq };
    });
    resolveRow(blobs, 84);
    blobs.forEach((it) => {
      const staged = indexBlobs.has(it.b.sha) && !reach.has(it.b.sha);
      nodes.set(it.b.sha, { id: it.b.sha, type: 'blob', x: it.x, y: blobY, o: it.b, names: [...(blobNames.get(it.b.sha) || [])], dead: !reach.has(it.b.sha) && !staged, staged });
    });

    // Рёбра
    const edges = [];
    for (const c of commits) {
      c.commit.parents.forEach((p, i) => {
        if (!nodes.has(p)) return;
        edges.push({ id: `p:${c.sha}:${p}`, a: c.sha, b: p, kind: 'parent', color: laneColor(i === 0 ? c.lane : nodes.get(p).lane) });
      });
      edges.push({ id: `t:${c.sha}`, a: c.sha, b: c.commit.tree, kind: 'ctree' });
    }
    for (const t of trees) for (const e of t.entries) {
      if (!nodes.has(e.sha)) continue;
      edges.push({ id: `e:${t.sha}:${e.sha}:${e.name}`, a: t.sha, b: e.sha, kind: e.mode === '40000' ? 'tsub' : 'tblob' });
    }

    // Ссылки: стопкой над коммитом
    const refs = [];
    const stack = new Map();
    const place = (sha, ref) => {
      const n = nodes.get(sha); if (!n) return;
      const k = stack.get(sha) || 0; stack.set(sha, k + 1);
      refs.push(Object.assign(ref, { x: n.x, y: -58 - k * 32, target: sha, ny: n.y }));
    };
    const cur = repo.branch();
    const bySha = new Map();
    for (const [name, sha] of repo.heads) { if (!bySha.has(sha)) bySha.set(sha, []); bySha.get(sha).push(name); }
    for (const [sha, names] of bySha) {
      names.sort((a, b) => (a === cur ? -1 : b === cur ? 1 : a.localeCompare(b)));
      for (const nm of names) place(sha, { id: 'b:' + nm, kind: 'branch', label: nm, color: laneColor(repo.lanes.get(nm) ?? 0), current: nm === cur });
    }
    for (const [name, sha] of repo.tags) place(sha, { id: 't:' + name, kind: 'tag', label: name, color: C_TAG });
    if (!cur && repo.head.sha) place(repo.head.sha, { id: 'HEAD', kind: 'head', label: 'HEAD', color: '#eef1f7' });
    else if (cur && repo.heads.has(cur)) place(repo.heads.get(cur), { id: 'HEAD', kind: 'head', label: 'HEAD', color: '#eef1f7' });

    const bands = lanesUsed.map((l) => {
      const name = [...repo.lanes].find(([, v]) => v === l)?.[0] || '';
      return { lane: l, y: laneRow.get(l) * LANE, name: name === '(detached)' ? 'без ветки' : name };
    });
    return { nodes, edges, refs, bands, treeRows: maxDepth + 1, treeY, blobY, rowsBottom, commitsCount: commits.length };
  }

  /* --- создание элементов --- */
  const DOC = 'M-11 -14 H5 L11 -8 V14 H-11 Z';
  function makeNode(n) {
    const g = el('g', { class: `n n-${n.type}`, 'data-id': n.id, tabindex: 0 });
    const inner = el('g', { class: 'in' }, g);
    if (n.type === 'commit') {
      el('circle', { r: 17, class: 'hit' }, inner);
      el('circle', { r: 16, class: 'body' }, inner);
      el('circle', { r: 11.5, class: 'ring2' }, inner);
      el('circle', { r: 5.5, class: 'dot' }, inner);
      el('text', { y: 36, class: 't-sha', 'text-anchor': 'middle' }, inner);
      el('text', { y: 53, class: 't-msg', 'text-anchor': 'middle' }, inner);
    } else if (n.type === 'tree') {
      el('rect', { x: -12, y: -12, width: 24, height: 24, rx: 5, transform: 'rotate(45)', class: 'body' }, inner);
      el('path', { d: 'M-5 -3.5 H5 M-5 0.5 H5 M-5 4.5 H2', class: 'lines' }, inner);
      el('text', { x: 22, y: -4, class: 't-name' }, inner);
      el('text', { x: 22, y: 12, class: 't-sha' }, inner);
    } else {
      el('path', { d: DOC, class: 'body' }, inner);
      el('path', { d: 'M5 -14 V-8 H11', class: 'fold' }, inner);
      el('path', { d: 'M-6 -3 H6 M-6 2 H6 M-6 7 H2', class: 'lines' }, inner);
      el('text', { y: 33, class: 't-name', 'text-anchor': 'middle' }, inner);
      el('text', { y: 49, class: 't-sha', 'text-anchor': 'middle' }, inner);
    }
    gNodes.appendChild(g);
    g.addEventListener('click', (e) => { e.stopPropagation(); select(n.id); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(n.id); } });
    g.addEventListener('pointerenter', () => hover(n.id, true));
    g.addEventListener('pointerleave', () => hover(n.id, false));
    return { g, inner, cur: null, tgt: null, data: n };
  }
  function updateNode(rec, n) {
    rec.data = n;
    const g = rec.g;
    g.classList.toggle('dead', !!n.dead);
    g.classList.toggle('staged', !!n.staged);
    g.classList.toggle('merge', n.type === 'commit' && n.o.commit.parents.length > 1);
    const texts = g.querySelectorAll('text');
    if (n.type === 'commit') {
      g.style.setProperty('--c', laneColor(n.lane));
      texts[0].textContent = short(n.id);
      texts[1].textContent = clip(n.o.commit.message, 17);
    } else if (n.type === 'tree') {
      texts[0].textContent = n.name || 'корень';
      texts[1].textContent = short(n.id);
    } else {
      texts[0].textContent = clip(n.names.join(', ') || '(без имени)', 16) + (n.staged ? ' ·' : '');
      texts[1].textContent = n.staged ? short(n.id) + ' в индексе' : short(n.id);
    }
    g.setAttribute('aria-label', `${n.type === 'commit' ? 'коммит' : n.type === 'tree' ? 'дерево' : 'блоб'} ${short(n.id)}`);
  }
  function makeRef(r) {
    const g = el('g', { class: `ref ref-${r.kind}` });
    el('line', { class: 'lead', x1: 0, y1: 12, x2: 0, y2: 40 }, g);
    const box = el('g', { class: 'box' }, g);
    el('rect', { class: 'pill', rx: 7, ry: 7, height: 24, y: -12 }, box);
    el('text', { class: 'label', y: 4.5, 'text-anchor': 'middle' }, box);
    gRefs.appendChild(g);
    return { g, cur: null, tgt: null, data: r, w: 0 };
  }
  function updateRef(rec, r) {
    rec.data = r;
    const text = rec.g.querySelector('.label');
    text.textContent = r.kind === 'tag' ? '◆ ' + r.label : r.label;
    const w = Math.max(44, r.label.length * 7.6 + (r.kind === 'tag' ? 30 : 22));
    rec.w = w;
    const rect = rec.g.querySelector('.pill');
    rect.setAttribute('width', w); rect.setAttribute('x', -w / 2);
    rec.g.style.setProperty('--c', r.color);
    rec.g.classList.toggle('current', !!r.current);
  }

  function syncGraph() {
    const L = computeLayout();
    G.layout = L;
    const fresh = repo.changed.created;
    // узлы
    for (const [id, n] of L.nodes) {
      let rec = G.nodes.get(id);
      if (!rec) {
        rec = makeNode(n);
        G.nodes.set(id, rec);
        let from = null;
        if (n.type === 'commit') from = n.o.commit.parents.map((p) => G.nodes.get(p)).find(Boolean);
        else {
          const parentEdge = L.edges.find((e) => e.b === id);
          if (parentEdge) from = G.nodes.get(parentEdge.a);
        }
        rec.cur = from && from.cur ? { x: from.cur.x, y: from.cur.y } : { x: n.x, y: n.y };
        if (fresh.has(id) && G.view) { rec.g.classList.add('born'); setTimeout(() => rec.g.classList.remove('born'), 1400); }
      }
      rec.tgt = { x: n.x, y: n.y };
      updateNode(rec, n);
    }
    for (const [id, rec] of G.nodes) if (!L.nodes.has(id)) {
      rec.g.classList.add('gone');
      G.nodes.delete(id);
      setTimeout(() => rec.g.remove(), 700);
      if (G.sel === id) closeInspector();
    }
    // ссылки
    const seen = new Set();
    for (const r of L.refs) {
      seen.add(r.id);
      let rec = G.refs.get(r.id);
      if (!rec) { rec = makeRef(r); G.refs.set(r.id, rec); rec.cur = { x: r.x, y: r.y - 16 }; }
      rec.tgt = { x: r.x, y: r.y, ny: r.ny };
      updateRef(rec, r);
    }
    for (const [id, rec] of G.refs) if (!seen.has(id)) { rec.g.remove(); G.refs.delete(id); }
    // рёбра
    const eSeen = new Set();
    for (const e of L.edges) {
      eSeen.add(e.id);
      let rec = G.edges.get(e.id);
      if (!rec) {
        const p = el('path', { class: `e e-${e.kind}` });
        gEdges.appendChild(p);
        rec = { p, data: e };
        G.edges.set(e.id, rec);
        if (G.view && !reduceMotion) { p.classList.add('draw'); setTimeout(() => p.classList.remove('draw'), 1200); }
      }
      rec.data = e;
      if (e.color) rec.p.style.stroke = e.color;
      const dead = L.nodes.get(e.a)?.dead;
      rec.p.classList.toggle('dead', !!dead);
    }
    for (const [id, rec] of G.edges) if (!eSeen.has(id)) { rec.p.remove(); G.edges.delete(id); }
    drawBack(L);
    fitTarget();
    if (!G.view) { G.view = { ...G.target }; for (const r of G.nodes.values()) r.cur = { ...r.tgt }; for (const r of G.refs.values()) r.cur = { ...r.tgt }; }
    if (G.sel && G.nodes.has(G.sel)) fillInspector(G.sel);
    $('#emptyGraph').hidden = L.nodes.size > 0;
  }

  function drawBack(L) {
    gBack.innerHTML = '';
    if (!L.nodes.size) return;
    const xs = [...L.nodes.values()].map((n) => n.x);
    const x0 = Math.min(...xs) - 120, x1 = Math.max(...xs) + 120;
    L.bands.forEach((b) => {
      el('rect', { x: x0, y: b.y - 34, width: x1 - x0, height: 68, rx: 12, class: 'band', style: `--c:${laneColor(b.lane)}` }, gBack);
      const t = el('text', { x: x0 + 14, y: b.y - 40, class: 'band-t', style: `fill:${laneColor(b.lane)}` }, gBack);
      t.textContent = b.name;
    });
    const layer = (y, name) => {
      el('line', { x1: x0, x2: x1, y1: y, y2: y, class: 'layer-l' }, gBack);
      const t = el('text', { x: x0 + 14, y: y + 18, class: 'layer-t' }, gBack);
      t.textContent = name;
    };
    const hasTrees = [...L.nodes.values()].some((n) => n.type === 'tree');
    if (hasTrees) layer(L.treeY(0) - 52, 'деревья');
    if ([...L.nodes.values()].some((n) => n.type === 'blob')) layer(L.blobY - 56, 'блобы');
  }

  function bbox() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of G.nodes.values()) { const t = r.tgt; x0 = Math.min(x0, t.x - 70); x1 = Math.max(x1, t.x + 70); y0 = Math.min(y0, t.y - 40); y1 = Math.max(y1, t.y + 64); }
    for (const r of G.refs.values()) { const t = r.tgt; x0 = Math.min(x0, t.x - r.w / 2 - 10); x1 = Math.max(x1, t.x + r.w / 2 + 10); y0 = Math.min(y0, t.y - 18); }
    if (!isFinite(x0)) return { x: -300, y: -200, w: 600, h: 400 };
    return { x: x0 - 30, y: y0 - 28, w: x1 - x0 + 60, h: y1 - y0 + 48 };
  }
  function fitTarget(force) {
    if (!G.autoFit && !force) return;
    const b = bbox();
    const r = svg.getBoundingClientRect();
    const pad = { l: 40, r: 40, t: r.width < 600 ? 108 : 76, b: 40 };
    const aw = Math.max(100, r.width - pad.l - pad.r), ah = Math.max(100, r.height - pad.t - pad.b);
    const narrow = r.width < 600;
    let scale = Math.min(1.35, aw / b.w, ah / b.h);
    let cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    // на телефоне не ужимаем граф до нечитаемого: держим масштаб и показываем окрестность HEAD
    if (narrow && scale < 0.74) {
      scale = 0.74;
      const hs = repo.headSha(), hn = hs && G.nodes.get(hs);
      if (hn) cx = Math.min(b.x + b.w - aw / scale / 2, Math.max(b.x + aw / scale / 2, hn.tgt.x - aw / scale * 0.18));
    }
    const w = r.width / scale, h = r.height / scale;
    G.target = { x: cx - w / 2 - (pad.l - pad.r) / 2 / scale, y: cy - h / 2 - (pad.t - pad.b) / 2 / scale, w, h };
  }

  function edgePath(e) {
    const A = G.nodes.get(e.a), B = G.nodes.get(e.b);
    if (!A || !B) return '';
    const a = A.cur, b = B.cur;
    if (e.kind === 'parent') {
      const x1 = a.x - 17, x2 = b.x + 17;
      if (Math.abs(a.y - b.y) < 1) return `M${x1} ${a.y} L${x2} ${b.y}`;
      // как на схеме метро: переход между полосами — у узла в верхней полосе, дальше прямо
      const w = Math.min(78, Math.max(24, (x1 - x2) * 0.7));
      if (a.y < b.y) return `M${x1} ${a.y} C${x1 - w * 0.55} ${a.y} ${x1 - w * 0.45} ${b.y} ${x1 - w} ${b.y} L${x2} ${b.y}`;
      return `M${x1} ${a.y} L${x2 + w} ${a.y} C${x2 + w * 0.45} ${a.y} ${x2 + w * 0.55} ${b.y} ${x2} ${b.y}`;
    }
    const y1 = a.y + (e.kind === 'ctree' ? 18 : 17), y2 = b.y - (B.data.type === 'blob' ? 16 : 17);
    const my = (y1 + y2) / 2;
    return `M${a.x} ${y1} C${a.x} ${my} ${b.x} ${my} ${b.x} ${y2}`;
  }

  function frame() {
    requestAnimationFrame(frame);
    const k = reduceMotion ? 1 : 0.16;
    for (const r of G.nodes.values()) {
      r.cur.x += (r.tgt.x - r.cur.x) * k; r.cur.y += (r.tgt.y - r.cur.y) * k;
      r.g.setAttribute('transform', `translate(${r.cur.x.toFixed(2)} ${r.cur.y.toFixed(2)})`);
    }
    for (const r of G.refs.values()) {
      r.cur.x += (r.tgt.x - r.cur.x) * k; r.cur.y += (r.tgt.y - r.cur.y) * k;
      r.g.setAttribute('transform', `translate(${r.cur.x.toFixed(2)} ${r.cur.y.toFixed(2)})`);
      const node = G.nodes.get(r.data.target);
      const lead = r.g.querySelector('.lead');
      const bottom = node ? node.cur.y - 19 - r.cur.y : 20;
      lead.setAttribute('y2', Math.max(12, bottom).toFixed(1));
      lead.style.display = r.data.y === Math.max(...[...G.refs.values()].filter((q) => q.data.target === r.data.target).map((q) => q.data.y)) ? '' : 'none';
    }
    for (const r of G.edges.values()) r.p.setAttribute('d', edgePath(r.data));
    if (G.view && G.target) {
      const v = G.view, t = G.target, q = reduceMotion ? 1 : 0.12;
      v.x += (t.x - v.x) * q; v.y += (t.y - v.y) * q; v.w += (t.w - v.w) * q; v.h += (t.h - v.h) * q;
      svg.setAttribute('viewBox', `${v.x.toFixed(1)} ${v.y.toFixed(1)} ${v.w.toFixed(1)} ${v.h.toFixed(1)}`);
    }
  }

  /* --- наведение и выбор --- */
  function hover(id, on) {
    svg.classList.toggle('hovering', on);
    for (const r of G.edges.values()) if (r.data.a === id || r.data.b === id) r.p.classList.toggle('hot', on);
    const n = G.nodes.get(id); if (n) n.g.classList.toggle('hot', on);
  }
  const insp = $('#insp');
  function select(id) {
    if (G.sel) G.nodes.get(G.sel)?.g.classList.remove('sel');
    G.sel = id;
    G.nodes.get(id)?.g.classList.add('sel');
    fillInspector(id);
    insp.hidden = false;
    requestAnimationFrame(() => insp.classList.add('open'));
  }
  function closeInspector() {
    if (G.sel) G.nodes.get(G.sel)?.g.classList.remove('sel');
    G.sel = null;
    insp.classList.remove('open');
    setTimeout(() => { if (!G.sel) insp.hidden = true; }, 250);
  }
  $('#inspClose').addEventListener('click', closeInspector);
  svg.addEventListener('click', () => closeInspector());

  const TYPE_RU = { commit: 'Коммит', tree: 'Дерево', blob: 'Блоб' };
  const NOTES = {
    commit: 'Коммит — это ссылка на дерево-снимок, родители, автор, время и сообщение. Измените хоть байт — SHA-1 изменится у него и у всех потомков.',
    tree: 'Дерево — список записей: права, тип, SHA-1 и имя. Одинаковые папки в разных коммитах — это один и тот же объект.',
    blob: 'Блоб хранит только содержимое: без имени и прав доступа. Имя файла записано в дереве, поэтому одинаковые файлы — один блоб.',
  };
  function fillInspector(id) {
    const n = G.layout.nodes.get(id);
    if (!n) return;
    const o = n.o;
    $('#inspType').textContent = TYPE_RU[o.type];
    $('#inspType').className = 'badge b-' + o.type;
    $('#inspSha').textContent = o.sha;
    $('#inspSize').textContent = `${o.size} ${o.size % 10 === 1 && o.size % 100 !== 11 ? 'байт' : 'байт'} + заголовок «${o.type} ${o.size}\\0»`;
    const body = repo.catFile(o.sha).split('\n').map((l) => {
      let m = l.match(/^(tree|parent) ([0-9a-f]{40})$/);
      if (m) return `<span class="k">${m[1]}</span> <button class="ln" data-sha="${m[2]}">${m[2]}</button>`;
      m = l.match(/^(\d{6}) (blob|tree) ([0-9a-f]{40})\t(.*)$/);
      if (m) return `<span class="dim">${m[1]} ${m[2]}</span> <button class="ln" data-sha="${m[3]}">${m[3].slice(0, 12)}…</button>  ${esc(m[4])}`;
      m = l.match(/^(author|committer) (.*)$/);
      if (m) return `<span class="k">${m[1]}</span> <span class="dim">${esc(m[2])}</span>`;
      return esc(l) || '&nbsp;';
    }).join('\n');
    $('#inspBody').innerHTML = body;
    let note = NOTES[o.type];
    if (n.dead) note = 'Недостижим: к нему не ведёт ни одна ветка, тег или HEAD. Команда git gc его удалит. ' + note;
    else if (n.staged) note = 'Этот блоб записан командой git add и лежит в индексе — ни одно дерево на него пока не ссылается. ' + note;
    $('#inspNote').textContent = note;
    $('#inspCmd').dataset.cmd = `git cat-file -p ${short(o.sha)}`;
    $('#inspCmd').textContent = `git cat-file -p ${short(o.sha)}`;
  }
  $('#inspBody').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sha]');
    if (b && G.nodes.has(b.dataset.sha)) select(b.dataset.sha);
  });
  $('#inspCmd').addEventListener('click', (e) => typeAndRun(e.currentTarget.dataset.cmd));

  /* --- панорама и масштаб --- */
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.n')) return;
    drag = { x: e.clientX, y: e.clientY, v: { ...G.view }, moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const s = G.view.w / r.width;
    const dx = (e.clientX - drag.x) * s, dy = (e.clientY - drag.y) * s;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) { drag.moved = true; G.autoFit = false; }
    if (drag.moved) { G.target = { ...drag.v, x: drag.v.x - dx, y: drag.v.y - dy }; G.view = { ...G.target }; }
  });
  svg.addEventListener('pointerup', () => { drag = null; });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    G.autoFit = false;
    const r = svg.getBoundingClientRect();
    const f = Math.exp(e.deltaY * 0.0015);
    const t = G.target;
    const px = t.x + ((e.clientX - r.left) / r.width) * t.w, py = t.y + ((e.clientY - r.top) / r.height) * t.h;
    const w = Math.min(6000, Math.max(200, t.w * f)), h = t.h * (w / t.w);
    G.target = { x: px - ((px - t.x) * w) / t.w, y: py - ((py - t.y) * h) / t.h, w, h };
  }, { passive: false });
  $('#fitBtn').addEventListener('click', () => { G.autoFit = true; fitTarget(true); });
  window.addEventListener('resize', () => { if (G.autoFit) fitTarget(true); else { const r = svg.getBoundingClientRect(); G.target.h = G.target.w * r.height / r.width; } });

  /* ================= Уроки ================= */
  const LESSONS = [
    {
      name: 'Снимки', title: 'Снимки, а не разница', setup: [],
      steps: [
        { t: 'Git хранит историю как объекты в папке .git. Создадим пустой репозиторий.', c: ['git init'] },
        { t: 'Создадим файл. Пока Git его не отслеживает — это просто файл в рабочей папке.', c: ['echo "Привет, Git" > hello.txt'] },
        { t: 'git add уже пишет объект: появился блоб. Его имя — SHA-1 от строки «blob 20\\0» и содержимого.', c: ['git add hello.txt'] },
        { t: 'Коммит записывает дерево (имя → блоб) и сам коммит: ссылку на дерево, автора, время, сообщение.', c: ['git commit -m "Первый коммит"'] },
        { t: 'Добавим второй файл. Блоб hello.txt не изменился — новое дерево сошлётся на тот же объект.', c: ['echo "Второй" > second.txt', 'git add .', 'git commit -m "Второй файл"'] },
        { t: 'Загляните внутрь коммита и его дерева. Кликайте по хешам в панели справа.', c: ['git cat-file -p HEAD', 'git cat-file -p HEAD^{tree}'] },
      ],
    },
    {
      name: 'Ветки', title: 'Ветка — это 41 байт',
      setup: ['git init', 'echo "Проект" > README.md', 'git add .', 'git commit -m "Начало"'],
      steps: [
        { t: 'Ветка — файл refs/heads/<имя> с 40 символами SHA-1 и переводом строки. Создать её — почти ничего не стоит.', c: ['git branch idea'] },
        { t: 'Переключимся: теперь HEAD указывает на ветку idea, а она — на тот же коммит.', c: ['git switch idea'] },
        { t: 'Новый коммит сдвигает только текущую ветку. main остаётся на месте.', c: ['echo "идея" > idea.txt', 'git add .', 'git commit -m "Идея"'] },
        { t: 'Вернитесь на main: idea.txt исчезнет из папки, но его блоб останется в базе объектов.', c: ['git switch main', 'ls'] },
        { t: 'Вся история сразу — с решёткой веток.', c: ['git log --oneline --all'] },
      ],
    },
    {
      name: 'Слияние', title: 'Слияние: коммит с двумя родителями',
      setup: ['git init', 'echo "Основа" > base.txt', 'git add .', 'git commit -m "Основа"', 'git switch -c feature', 'echo "фича" > feature.txt', 'git add .', 'git commit -m "Фича"', 'git switch main', 'echo "исправление" > fix.txt', 'git add .', 'git commit -m "Исправление"'],
      steps: [
        { t: 'Ветки разошлись: у каждой свой коммит после общего предка.', c: ['git log --oneline --all'] },
        { t: 'Git найдёт общего предка, сравнит обе стороны и соберёт новый снимок.', c: ['git merge feature'] },
        { t: 'У коммита слияния две строки parent — в этом вся «магия» слияния.', c: ['git cat-file -p HEAD'] },
      ],
    },
    {
      name: 'Rebase', title: 'Rebase переписывает историю',
      setup: ['git init', 'echo "Основа" > base.txt', 'git add .', 'git commit -m "Основа"', 'git switch -c feature', 'echo "шаг 1" > a.txt', 'git add .', 'git commit -m "Шаг 1"', 'echo "шаг 2" > b.txt', 'git add .', 'git commit -m "Шаг 2"', 'git switch main', 'echo "срочно" > hotfix.txt', 'git add .', 'git commit -m "Срочная правка"', 'git switch feature'],
      steps: [
        { t: 'Мы на feature, а main ушла вперёд. Перенесём наши коммиты поверх main.', c: ['git rebase main'] },
        { t: 'Коммиты скопированы: у копий новые SHA-1, потому что изменились родители. Старые стали недостижимыми — они полупрозрачные.', c: ['git log --oneline'] },
        { t: 'Reflog всё помнит — до старой версии ветки можно вернуться.', c: ['git reflog'] },
        { t: 'А сборка мусора удалит недостижимые объекты.', c: ['git gc'] },
      ],
    },
    {
      name: 'Reset', title: 'Reset и reflog',
      setup: ['git init', 'echo "1" > log.txt', 'git add .', 'git commit -m "Раз"', 'echo "2" >> log.txt', 'git commit -am "Два"', 'echo "3" >> log.txt', 'git commit -am "Три"'],
      steps: [
        { t: 'Откатим ветку на два коммита назад. --hard перепишет и индекс, и рабочую папку.', c: ['git reset --hard HEAD~2'] },
        { t: 'Коммиты «Два» и «Три» никуда не делись — на них просто не указывает ни одна ссылка.', c: ['git reflog'] },
        { t: 'Вернём ветку туда, где был HEAD шаг назад.', c: ['git reset --hard HEAD@{1}'] },
      ],
    },
    {
      name: 'Конфликт', title: 'Конфликт слияния',
      setup: ['git init', 'echo "Привет" > README.md', 'git add .', 'git commit -m "Начало"', 'git switch -c feature', 'echo "Здравствуйте" > README.md', 'git commit -am "Вежливее"', 'git switch main', 'echo "Хай" > README.md', 'git commit -am "Проще"'],
      steps: [
        { t: 'Обе ветки поменяли одну и ту же строку. Автоматически Git это не решит.', c: ['git merge feature'] },
        { t: 'Git вписал в файл обе версии между маркерами.', c: ['cat README.md', 'git status'] },
        { t: 'Решите конфликт: запишите итоговый текст и добавьте файл в индекс.', c: ['echo "Добрый день" > README.md', 'git add README.md'] },
        { t: 'Коммит завершит слияние — у него будет два родителя.', c: ['git commit -m "Разрешить конфликт"'] },
      ],
    },
  ];
  const DEMO = ['git init', 'echo "# Звёздный атлас" > README.md', 'echo "console.log(\'привет\')" > src/main.js', 'git add .', 'git commit -m "Первый снимок"',
    'echo "const stars = 88" > src/stars.js', 'git add .', 'git commit -m "Добавить звёзды"', 'git switch -c orbit', 'echo "const orbit = \'эллипс\'" > src/orbit.js',
    'git add .', 'git commit -m "Орбиты"', 'git switch main', 'echo "## Как запустить" >> README.md', 'git commit -am "Инструкция"', 'git merge orbit', 'git tag v1.0'];

  const L = { cur: -1, step: 0, done: new Set() };
  const tabsEl = $('#lessonTabs');
  tabsEl.innerHTML = LESSONS.map((l, i) => `<button class="ltab" data-i="${i}"><span class="ln-n">${i + 1}</span>${esc(l.name)}</button>`).join('');
  tabsEl.addEventListener('click', (e) => { const b = e.target.closest('.ltab'); if (b) startLesson(+b.dataset.i); });

  function freshRepo(cmds, note) {
    repo = new Repo();
    G.autoFit = true;
    for (const r of G.nodes.values()) r.g.remove();
    for (const r of G.refs.values()) r.g.remove();
    for (const r of G.edges.values()) r.p.remove();
    G.nodes.clear(); G.refs.clear(); G.edges.clear(); G.view = null; G.sel = null;
    insp.hidden = true; insp.classList.remove('open');
    outEl.innerHTML = '';
    for (const c of cmds) exec(c, { quiet: !note });
    if (note) { /* демо — показываем историю целиком */ }
    else if (cmds.length) printLines([[['# подготовлено: ' + cmds.filter((c) => c.startsWith('git commit') || c.startsWith('git switch')).length + ' шагов истории — посмотрите на граф', 'dim']]]);
    afterChange();
    G.view = null; syncGraph();
  }
  function startLesson(i) {
    L.cur = i; L.step = 0; L.done = new Set();
    freshRepo(LESSONS[i].setup);
    renderLesson();
  }
  function renderLesson() {
    [...tabsEl.children].forEach((b, j) => b.classList.toggle('is-on', j === L.cur));
    const box = $('#lessonBody');
    if (L.cur < 0) {
      box.innerHTML = `<p class="l-meta">Демо-репозиторий</p><p class="l-text">Две ветки, слияние и тег — уже в базе объектов. Кликните по кружку, ромбу или листку на графе: увидите, что лежит внутри. Или выберите урок выше.</p>`;
      return;
    }
    const les = LESSONS[L.cur], st = les.steps[L.step];
    box.innerHTML = `
      <p class="l-meta">Урок ${L.cur + 1} · шаг ${L.step + 1} из ${les.steps.length} · ${esc(les.title)}</p>
      <p class="l-text">${esc(st.t)}</p>
      <div class="l-cmds">${st.c.map((c, k) => `<button class="lcmd ${L.done.has(L.step + ':' + k) ? 'done' : ''}" data-k="${k}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5l6 4.5-6 4.5z"/></svg>${esc(c)}</button>`).join('')}</div>
      <div class="l-nav">
        <button class="lnav" data-d="-1" ${L.step === 0 ? 'disabled' : ''} aria-label="Предыдущий шаг">←</button>
        <button class="lnav" data-d="1" ${L.step === les.steps.length - 1 ? 'disabled' : ''} aria-label="Следующий шаг">→</button>
      </div>`;
  }
  $('#lessonBody').addEventListener('click', (e) => {
    const c = e.target.closest('.lcmd');
    if (c) {
      const k = +c.dataset.k;
      L.done.add(L.step + ':' + k);
      typeAndRun(LESSONS[L.cur].steps[L.step].c[k]);
      return;
    }
    const n = e.target.closest('.lnav');
    if (n && !n.disabled) { L.step += +n.dataset.d; renderLesson(); }
  });
  function lessonCheck() {
    if (L.cur < 0) return;
    const st = LESSONS[L.cur].steps[L.step];
    const all = st.c.every((_, k) => L.done.has(L.step + ':' + k));
    if (all && L.step < LESSONS[L.cur].steps.length - 1) setTimeout(() => { L.step++; renderLesson(); }, 700);
    else renderLesson();
  }

  $('#demoBtn').addEventListener('click', () => { L.cur = -1; freshRepo(DEMO, true); renderLesson(); });
  $('#newBtn').addEventListener('click', () => { L.cur = -1; freshRepo([], false); renderLesson(); printLines([[['# пустая папка: начните с git init', 'dim']]]); cmdEl.focus(); });

  /* ================= Старт ================= */
  freshRepo(DEMO, true);
  renderLesson();
  requestAnimationFrame(frame);
  if (document.fonts) document.fonts.ready.then(() => { scrollDown(); fitTarget(true); });
  if (matchMedia('(pointer: fine)').matches && !SHOT) cmdEl.focus({ preventScroll: true });
  window.__git = { get repo() { return repo; }, exec };
})();
