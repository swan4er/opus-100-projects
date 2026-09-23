/* Мини-Git: настоящий формат объектов и настоящие SHA-1.
   Блоб:   "blob <len>\0<содержимое>"
   Дерево: "tree <len>\0" + записи "<mode> <имя>\0<20 байт SHA>"
   Коммит: "commit <len>\0tree …\nparent …\nauthor …\ncommitter …\n\n<сообщение>\n"
   Хеши совпадают с тем, что посчитал бы настоящий git при тех же данных. */
(function () {
  'use strict';

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  /* ---------- SHA-1 ---------- */
  function sha1(bytes) {
    const ml = bytes.length;
    const total = ((ml + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes); buf[ml] = 0x80;
    const dv = new DataView(buf.buffer);
    const bits = ml * 8;
    dv.setUint32(total - 4, bits >>> 0);
    dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
    let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    const w = new Uint32Array(80);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 80; i++) { const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (x << 1) | (x >>> 31); }
      let a = h0, b = h1, c = h2, d = h3, e = h4;
      for (let i = 0; i < 80; i++) {
        let f, k;
        if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
        else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
        else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
        else { f = b ^ c ^ d; k = 0xca62c1d6; }
        const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
        e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = t;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
    }
    return [h0, h1, h2, h3, h4].map((v) => v.toString(16).padStart(8, '0')).join('');
  }
  function concat(parts) {
    const n = parts.reduce((s, p) => s + p.length, 0);
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const hexBytes = (hex) => { const b = new Uint8Array(20); for (let i = 0; i < 20; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16); return b; };
  const objHash = (type, body) => sha1(concat([enc.encode(`${type} ${body.length}\0`), body]));

  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
  };
  const short = (sha) => (sha ? sha.slice(0, 7) : '');
  const tz = (() => {
    const off = -new Date().getTimezoneOffset();
    const s = off >= 0 ? '+' : '-', a = Math.abs(off);
    return s + String(Math.floor(a / 60)).padStart(2, '0') + String(a % 60).padStart(2, '0');
  })();
  const AUTHOR = 'Вы <you@example.com>';

  class GitError extends Error {}
  const fatal = (m) => { throw new GitError(m); };

  /* ---------- Репозиторий ---------- */
  class Repo {
    constructor() { this.clear(); }

    clear() {
      this.inited = false;
      this.objects = new Map();   // sha → {sha, type, body, seq, …}
      this.seq = 0;
      this.heads = new Map();     // имя ветки → sha
      this.tags = new Map();
      this.head = { ref: 'main' };
      this.work = new Map();      // путь → текст
      this.index = new Map();     // путь → sha блоба
      this.conflicts = new Set();
      this.reflog = [];
      this.merging = null;
      this.lanes = new Map([['main', 0]]);
      this.laneN = 1;
      this.clock = Math.floor(Date.now() / 1000);
      this.changed = { created: new Set() };
    }
    tick() { return this.clock++; }

    /* --- объекты --- */
    write(type, body, extra) {
      const sha = objHash(type, body);
      if (!this.objects.has(sha)) {
        this.objects.set(sha, Object.assign({ sha, type, body, size: body.length, seq: this.seq++ }, extra || {}));
        this.changed.created.add(sha);
      }
      return sha;
    }
    writeBlob(text) { return this.write('blob', enc.encode(text)); }
    hashBlob(text) { return objHash('blob', enc.encode(text)); }
    writeTree(entries) {
      entries.sort((a, b) => {
        const x = a.name + (a.mode === '40000' ? '/' : ''), y = b.name + (b.mode === '40000' ? '/' : '');
        return x < y ? -1 : x > y ? 1 : 0;
      });
      const body = concat(entries.flatMap((e) => [enc.encode(`${e.mode} ${e.name}\0`), hexBytes(e.sha)]));
      return this.write('tree', body, { entries: entries.map((e) => ({ ...e })) });
    }
    writeCommit({ tree, parents, message, authorTime, commitTime, lane }) {
      const at = authorTime ?? this.tick(), ct = commitTime ?? at;
      const text = `tree ${tree}\n` + parents.map((p) => `parent ${p}\n`).join('') +
        `author ${AUTHOR} ${at} ${tz}\ncommitter ${AUTHOR} ${ct} ${tz}\n\n${message}\n`;
      return this.write('commit', enc.encode(text), { commit: { tree, parents: [...parents], message, authorTime: at, commitTime: ct }, lane });
    }
    obj(sha) { return this.objects.get(sha); }
    catFile(sha) {
      const o = this.obj(sha);
      if (!o) fatal(`fatal: не найден объект ${sha}`);
      if (o.type === 'tree') {
        return o.entries.map((e) => `${e.mode === '40000' ? '040000' : e.mode} ${e.mode === '40000' ? 'tree' : 'blob'} ${e.sha}\t${e.name}`).join('\n');
      }
      return dec.decode(o.body).replace(/\n$/, '');
    }

    /* --- снимки --- */
    treeFromIndex() {
      const root = new Map();
      for (const [path, sha] of this.index) {
        const parts = path.split('/');
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!node.has(parts[i]) || typeof node.get(parts[i]) === 'string') node.set(parts[i], new Map());
          node = node.get(parts[i]);
        }
        node.set(parts[parts.length - 1], sha);
      }
      const writeNode = (node) => this.writeTree([...node].map(([name, v]) => (
        typeof v === 'string' ? { name, mode: '100644', sha: v } : { name, mode: '40000', sha: writeNode(v) })));
      return writeNode(root);
    }
    readTree(sha, prefix = '', out = new Map()) {
      const t = this.obj(sha);
      if (!t) return out;
      for (const e of t.entries) {
        if (e.mode === '40000') this.readTree(e.sha, prefix + e.name + '/', out);
        else out.set(prefix + e.name, e.sha);
      }
      return out;
    }
    snapshot(commitSha) { return commitSha ? this.readTree(this.obj(commitSha).commit.tree) : new Map(); }
    text(sha) { return dec.decode(this.obj(sha).body); }

    /* --- ссылки --- */
    branch() { return this.head.ref || null; }
    headSha() { return this.head.ref ? this.heads.get(this.head.ref) : this.head.sha; }
    setHead(sha, msg) {
      if (this.head.ref) this.heads.set(this.head.ref, sha); else this.head.sha = sha;
      this.reflog.unshift({ sha, msg });
    }
    laneFor(name) {
      if (!name) name = '(detached)';
      if (!this.lanes.has(name)) this.lanes.set(name, this.laneN++);
      return this.lanes.get(name);
    }

    parents(sha) { return this.obj(sha).commit.parents; }
    ancestors(sha) {
      const seen = new Set(), stack = sha ? [sha] : [];
      while (stack.length) { const s = stack.pop(); if (seen.has(s)) continue; seen.add(s); stack.push(...this.parents(s)); }
      return seen;
    }
    isAncestor(a, b) { return this.ancestors(b).has(a); }
    mergeBase(a, b) {
      const A = this.ancestors(a);
      let best = null;
      for (const s of this.ancestors(b)) if (A.has(s) && (!best || this.obj(s).seq > this.obj(best).seq)) best = s;
      return best;
    }

    resolve(rev) {
      if (!rev) fatal('fatal: не указана ревизия');
      let m = rev.match(/^(.*)\^\{tree\}$/);
      if (m) return this.obj(this.resolveCommit(m[1])).commit.tree;
      m = rev.match(/^([^:]*):(.+)$/);
      if (m) {
        const snapTree = this.obj(this.resolveCommit(m[1] || 'HEAD')).commit.tree;
        const path = m[2].replace(/\/$/, '');
        let cur = snapTree;
        for (const part of path.split('/')) {
          const e = this.obj(cur).entries.find((x) => x.name === part);
          if (!e) fatal(`fatal: путь «${path}» не существует в «${m[1] || 'HEAD'}»`);
          cur = e.sha;
        }
        return cur;
      }
      return this.resolveCommit(rev);
    }
    resolveCommit(rev) {
      const m = rev.match(/^(.*?)((?:[~^]\d*)*)$/);
      let base = m[1], suffix = m[2];
      let sha;
      const at = base.match(/^(?:HEAD)?@\{(\d+)\}$/);
      if (at) { const e = this.reflog[+at[1]]; if (!e) fatal(`fatal: в reflog нет записи ${base}`); sha = e.sha; }
      else if (base === 'HEAD' || base === '@') { sha = this.headSha(); if (!sha) fatal('fatal: у ветки ещё нет ни одного коммита'); }
      else if (this.heads.has(base)) sha = this.heads.get(base);
      else if (this.heads.has(base.replace(/^refs\/heads\//, ''))) sha = this.heads.get(base.replace(/^refs\/heads\//, ''));
      else if (this.tags.has(base.replace(/^refs\/tags\//, ''))) sha = this.tags.get(base.replace(/^refs\/tags\//, ''));
      else if (/^[0-9a-f]{4,40}$/.test(base)) {
        const hits = [...this.objects.keys()].filter((k) => k.startsWith(base));
        if (hits.length > 1) fatal(`fatal: неоднозначное сокращение ${base}`);
        if (!hits.length) fatal(`fatal: неизвестная ревизия «${base}»`);
        sha = hits[0];
      } else fatal(`fatal: неизвестная ревизия «${rev}»`);
      const ops = suffix.match(/[~^]\d*/g) || [];
      for (const op of ops) {
        const n = op.length > 1 ? +op.slice(1) : 1;
        const o = this.obj(sha);
        if (!o || o.type !== 'commit') fatal(`fatal: «${rev}» — не коммит`);
        if (op[0] === '~') { for (let i = 0; i < n; i++) { const p = this.parents(sha)[0]; if (!p) fatal(`fatal: у «${rev}» нет столько предков`); sha = p; } }
        else { if (n === 0) continue; const p = this.parents(sha)[n - 1]; if (!p) fatal(`fatal: у коммита нет родителя №${n}`); sha = p; }
      }
      return sha;
    }

    /* --- состояние рабочей папки --- */
    status() {
      const headSnap = this.snapshot(this.headSha());
      const staged = [], unstaged = [], untracked = [];
      const all = new Set([...headSnap.keys(), ...this.index.keys()]);
      for (const p of [...all].sort()) {
        const h = headSnap.get(p), i = this.index.get(p);
        if (h === i) continue;
        staged.push([h == null ? 'новый файл' : i == null ? 'удалён' : 'изменён', p]);
      }
      for (const [p, sha] of [...this.index].sort()) {
        if (!this.work.has(p)) unstaged.push(['удалён', p]);
        else if (this.conflicts.has(p)) unstaged.push(['оба изменили', p]);
        else if (this.hashBlob(this.work.get(p)) !== sha) unstaged.push(['изменён', p]);
      }
      for (const p of [...this.work.keys()].sort()) if (!this.index.has(p)) untracked.push(p);
      return { staged, unstaged, untracked };
    }
    isClean() {
      const s = this.status();
      return !s.staged.length && !s.unstaged.length;
    }
    // Переписать рабочую папку и индекс снимком коммита (неотслеживаемые файлы остаются)
    loadSnapshot(sha, { work = true } = {}) {
      const snap = this.snapshot(sha);
      if (work) {
        for (const p of this.index.keys()) if (!snap.has(p)) this.work.delete(p);
        for (const [p, b] of snap) this.work.set(p, this.text(b));
      }
      this.index = new Map(snap);
      this.conflicts.clear();
    }

    reachable() {
      const seen = new Set();
      const visit = (sha) => {
        if (!sha || seen.has(sha)) return;
        const o = this.obj(sha); if (!o) return;
        seen.add(sha);
        if (o.type === 'commit') { visit(o.commit.tree); o.commit.parents.forEach(visit); }
        else if (o.type === 'tree') o.entries.forEach((e) => visit(e.sha));
      };
      for (const s of this.heads.values()) visit(s);
      for (const s of this.tags.values()) visit(s);
      visit(this.headSha());
      if (this.merging) visit(this.merging.sha);
      return seen;
    }
    indexOnly() {
      const r = new Set(this.index.values());
      return r;
    }
  }

  /* ---------- Простой построчный diff (LCS) ---------- */
  function lineDiff(a, b) {
    const A = a ? a.replace(/\n$/, '').split('\n') : [], B = b ? b.replace(/\n$/, '').split('\n') : [];
    const n = A.length, m = B.length;
    const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) { out.push([' ', A[i]]); i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) out.push(['-', A[i++]]);
      else out.push(['+', B[j++]]);
    }
    while (i < n) out.push(['-', A[i++]]);
    while (j < m) out.push(['+', B[j++]]);
    return out;
  }

  window.MiniGit = { Repo, GitError, fatal, sha1, objHash, short, plural, lineDiff, enc, dec };
})();
