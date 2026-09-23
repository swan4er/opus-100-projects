/* ════════════════════════════════════════════════════════════
   090 · Как модель читает текст
   Byte Pair Encoding, который учится прямо на странице:
   считает соседние пары, склеивает самую частую, повторяет.
   ════════════════════════════════════════════════════════════ */
'use strict';
(function () {

  // ───────────────────────── 0. Утилиты ─────────────────────────
  const $ = (id) => document.getElementById(id);
  const SHOT = !!window.__SHOT__;
  const REDUCED = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const NO_HOVER = !!(window.matchMedia && matchMedia('(hover: none)').matches);
  const nf = (n) => Number(n).toLocaleString('ru-RU');
  const nf2 = (x) => x.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
  const esc = (s) => s.replace(/[&<>"]/g, (ch) => ESC[ch]);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b === 1) return one;
    if (b >= 2 && b <= 4) return few;
    return many;
  }
  // Неразрывный пробел после коротких предлогов, союзов и частиц — чтобы они не висели в конце строки
  const NB_RE = /(?<=^|[\s(«>—\u00A0])(в|к|с|у|о|и|а|я|на|по|за|от|до|из|не|но|об|во|со|ни|для|при|без|про|под|над|или|её|их|это) /giu;
  const nb = (str) => str.replace(NB_RE, '$1\u00A0');
  const NL_SVG = '<svg class="nl" viewBox="0 0 12 12" aria-hidden="true"><path d="M10 2v4.5H3M5.5 4L3 6.5 5.5 9"/></svg>';
  const HEX = (b) => b.toString(16).toUpperCase().padStart(2, '0');
  const UTF8 = new TextEncoder();
  const DEC = new TextDecoder();

  // ─────────────────── 1. Корпус и предтокенизация ───────────────────
  // Как у GPT-2: пробел приклеен к началу следующего слова, буквы, числа и знаки
  // идут отдельными кусками, склейки никогда не переходят через границу куска.
  // Упрощение: подряд идущие переводы строк — один кусок.
  const PRE = / ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\n+| +|\s+/gu;
  const normalize = (t) => t.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[\t\u00A0\u2007\u2009\u202F]/g, ' ');
  const pretokenize = (t) => normalize(t).match(PRE) || [];

  const BLOCKS = [];
  for (const [head, ...paras] of window.CORPUS) {
    BLOCKS.push({ hd: true, text: head });
    for (const p of paras) BLOCKS.push({ hd: false, text: p });
  }
  const BLOCK_PRE = BLOCKS.map((b, i) => {
    const arr = pretokenize(b.text);
    if (i < BLOCKS.length - 1) arr.push('\n\n');
    return arr;
  });
  const WORD_INDEX = new Map();   // предтокен → номер уникального куска
  const WORDS = [];               // уникальные куски
  const FREQ = [];                // сколько раз каждый встречается
  for (const arr of BLOCK_PRE) for (const w of arr) {
    let i = WORD_INDEX.get(w);
    if (i === undefined) { i = WORDS.length; WORD_INDEX.set(w, i); WORDS.push(w); FREQ.push(0); }
    FREQ[i]++;
  }

  // ─────────────────── 2. Исходный алфавит ───────────────────
  const RU = 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
  const LAT = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const PUNCT = '.,:;!?…-–—«»„“”"\'()[]/%+=№@#&*<>';
  function charAlphabet() {
    const seen = new Set(), list = [];
    const add = (ch) => { if (!seen.has(ch)) { seen.add(ch); list.push(ch); } };
    add(' '); add('\n');
    for (const ch of PUNCT) add(ch);
    for (const ch of '0123456789') add(ch);
    for (const ch of RU + RU.toLowerCase() + LAT + LAT.toLowerCase()) add(ch);
    for (const w of WORDS) for (const ch of w) add(ch);
    return list;
  }
  // знаки, которых нет в словаре, получают отрицательные номера
  const UNK = [], UNK_ID = new Map();
  function unkId(ch) {
    let i = UNK_ID.get(ch);
    if (i === undefined) { UNK.push(ch); i = -UNK.length; UNK_ID.set(ch, i); }
    return i;
  }

  // ─────────────────── 3. Обучение BPE ───────────────────
  const KEY = 8192;          // ключ пары: a * KEY + b
  const MAX_MERGES = 2000;   // обучение останавливается раньше: когда пар с частотой ≥ 2 не остаётся
  const PALETTE = 7;         // число красок для склеенных токенов (.k0 … .k6 в style.css)
  function train(mode) {
    let K, base = null, charId = null, words;
    if (mode === 'char') {
      base = charAlphabet(); K = base.length;
      charId = new Map(base.map((c, i) => [c, i]));
      words = WORDS.map((w) => Array.from(w, (c) => charId.get(c)));
    } else {
      K = 256;
      words = WORDS.map((w) => Array.from(UTF8.encode(w)));
    }
    const init = words.map((s) => s.slice());
    // Частоты пар и куча с «ленивым» удалением: приоритет = частота, при равенстве — меньший ключ.
    // Оба числа упакованы в одно: частота · 2^26 + (2^26 − 1 − ключ).
    const pc = new Map();
    const SH = 67108864;   // 2^26 > KEY²
    const heap = [];
    const hpush = (c, k) => {
      const v = c * SH + (SH - 1 - k);
      let i = heap.push(v) - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heap[p] >= v) break; heap[i] = heap[p]; i = p; }
      heap[i] = v;
    };
    const hpop = () => {
      const top = heap[0], x = heap.pop();
      if (heap.length) {
        let i = 0; const n = heap.length;
        for (;;) {
          let c = 2 * i + 1; if (c >= n) break;
          if (c + 1 < n && heap[c + 1] > heap[c]) c++;
          if (heap[c] <= x) break;
          heap[i] = heap[c]; i = c;
        }
        heap[i] = x;
      }
      return top;
    };
    let total = 0;
    words.forEach((s, wi) => {
      const f = FREQ[wi]; total += s.length * f;
      for (let j = 0; j < s.length - 1; j++) { const k = s[j] * KEY + s[j + 1]; pc.set(k, (pc.get(k) || 0) + f); }
    });
    for (const [k, c] of pc) hpush(c, k);
    const L = [], R = [], CNT = [], TA = [total], AFF = [], COL = [];
    const changed = new Set();
    for (let m = 0; m < MAX_MERGES; m++) {
      // самая частая пара (устаревшие записи кучи отбрасываем)
      let bk = -1, bc = 0;
      while (heap.length) {
        const v = heap[0], c = Math.floor(v / SH), k = SH - 1 - (v % SH);
        if (c >= 2 && pc.get(k) === c) { bk = k; bc = c; break; }
        hpop();
        if (c < 2) { heap.length = 0; break; }
      }
      if (bk < 0) break;
      hpop();
      const a = (bk / KEY) | 0, b = bk % KEY, id = K + m;
      // куски, где пара встречается
      const affL = [];
      for (let wi = 0; wi < words.length; wi++) {
        const s = words[wi];
        for (let j = 0; j < s.length - 1; j++) if (s[j] === a && s[j + 1] === b) { affL.push(wi); break; }
      }
      const aff = Int32Array.from(affL);
      let red = 0;
      changed.clear();
      for (let q = 0; q < aff.length; q++) {
        const wi = aff[q], s = words[wi], f = FREQ[wi];
        for (let j = 0; j < s.length - 1; j++) {
          const k = s[j] * KEY + s[j + 1];
          const v = pc.get(k) - f; if (v > 0) pc.set(k, v); else pc.delete(k);
          changed.add(k);
        }
        const ns = [];
        for (let j = 0; j < s.length;) {
          if (j < s.length - 1 && s[j] === a && s[j + 1] === b) { ns.push(id); j += 2; red += f; }
          else ns.push(s[j++]);
        }
        for (let j = 0; j < ns.length - 1; j++) {
          const k = ns[j] * KEY + ns[j + 1];
          pc.set(k, (pc.get(k) || 0) + f);
          changed.add(k);
        }
        words[wi] = ns;
      }
      for (const k of changed) { const c = pc.get(k); if (c >= 2) hpush(c, k); }
      L.push(a); R.push(b); CNT.push(bc); AFF.push(aff); TA.push(TA[m] - red);
      // Краска нового токена: не как у «родителей» и не как у самых частых соседей в тексте,
      // чтобы рядом стоящие фишки не сливались
      const pen = new Float64Array(PALETTE);
      if (a >= K) pen[COL[a - K]] += 1e6;
      if (b >= K) pen[COL[b - K]] += 1e6;
      for (let q = 0; q < aff.length; q++) {
        const s = words[aff[q]], f = FREQ[aff[q]];
        for (let j = 0; j < s.length; j++) {
          if (s[j] !== id) continue;
          if (j > 0 && s[j - 1] >= K) pen[COL[s[j - 1] - K]] += f;
          if (j < s.length - 1 && s[j + 1] >= K) pen[COL[s[j + 1] - K]] += f;
        }
      }
      let bestC = (id * 3) % PALETTE;
      for (let t = 0; t < PALETTE; t++) { const c = (id * 3 + t) % PALETTE; if (pen[c] < pen[bestC]) bestC = c; }
      COL.push(bestC);
    }
    const N = L.length;
    const M = {
      mode, K, N, base, charId, init, AFF,
      L: Int32Array.from(L), R: Int32Array.from(R), CNT: Int32Array.from(CNT), TA: Int32Array.from(TA), COL,
      rank: new Map(), str: [], bytes: [], parts: [], hFlow: [], hLab: [], nl: [],
    };
    for (let m = 0; m < N; m++) M.rank.set(M.L[m] * KEY + M.R[m], m);
    return M;
  }

  // ─────────────────── 4. Содержимое токенов и кодирование ───────────────────
  function tokStr(M, id) {
    let s = M.str[id];
    if (s === undefined) s = M.str[id] = id < M.K ? M.base[id] : tokStr(M, M.L[id - M.K]) + tokStr(M, M.R[id - M.K]);
    return s;
  }
  function tokBytes(M, id) {
    let b = M.bytes[id];
    if (b === undefined) b = M.bytes[id] = id < M.K ? [id] : tokBytes(M, M.L[id - M.K]).concat(tokBytes(M, M.R[id - M.K]));
    return b;
  }
  // Части токена: готовый текст {s} и «висящие» байты недособранных букв {x}
  function tokParts(M, id) {
    if (id < 0) return [{ s: UNK[-id - 1] }];
    let p = M.parts[id];
    if (p) return p;
    if (M.mode === 'char') p = [{ s: tokStr(M, id) }];
    else {
      const bytes = tokBytes(M, id);
      p = [];
      for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        const n = b < 0x80 ? 1 : (b >> 5) === 6 ? 2 : (b >> 4) === 14 ? 3 : (b >> 3) === 30 ? 4 : 0;
        let ok = n > 0 && i + n <= bytes.length;
        for (let j = 1; ok && j < n; j++) if ((bytes[i + j] & 0xC0) !== 0x80) ok = false;
        if (ok) {
          const ch = DEC.decode(Uint8Array.from(bytes.slice(i, i + n)));
          const last = p[p.length - 1];
          if (last && last.s !== undefined) last.s += ch; else p.push({ s: ch });
          i += n;
        } else { p.push({ x: HEX(b) }); i++; }
      }
    }
    return (M.parts[id] = p);
  }
  const tokText = (M, id) => tokParts(M, id).map((p) => p.s || '').join('');
  function isNl(M, id) {
    if (id < 0) return false;
    let v = M.nl[id];
    if (v === undefined) v = M.nl[id] = /^\n+$/.test(tokParts(M, id).map((p) => (p.s !== undefined ? p.s : '#')).join(''));
    return v;
  }
  // HTML для сплошного текста: пробелы остаются пробелами, а токен-пробел сам по себе
  // показан «коробочкой» — иначе он выглядит пустым квадратиком
  function innerFlow(M, id) {
    if (id < 0) return esc(UNK[-id - 1]);
    let h = M.hFlow[id];
    if (h === undefined) {
      const parts = tokParts(M, id);
      h = M.hFlow[id] = parts.length === 1 && /^ +$/.test(parts[0].s || '')
        ? '<i class="sp"></i>'.repeat(parts[0].s.length)
        : parts.map((p) => (p.x ? '<i class="x">' + p.x + '</i>' : esc(p.s).replace(/\n/g, NL_SVG))).join('');
    }
    return h;
  }
  // HTML для отдельной фишки: пробел показан «коробочкой»
  function innerLabel(M, id) {
    if (id < 0) return esc(UNK[-id - 1]);
    let h = M.hLab[id];
    if (h === undefined) {
      h = M.hLab[id] = tokParts(M, id).map((p) => (p.x ? '<i class="x">' + p.x + '</i>'
        : esc(p.s).replace(/ /g, '<i class="sp"></i>').replace(/\n/g, NL_SVG))).join('');
    }
    return h;
  }
  function cls(M, id) {
    if (id < 0) return 'u';
    if (isNl(M, id)) return 'n';
    if (id < M.K) return 'b';
    return 'k' + M.COL[id - M.K];
  }
  function mergeArr(s, a, b, id) {
    const out = [];
    for (let j = 0; j < s.length;) {
      if (j < s.length - 1 && s[j] === a && s[j + 1] === b) { out.push(id); j += 2; }
      else out.push(s[j++]);
    }
    return out;
  }
  function splitArr(s, id, a, b) {
    const out = [];
    for (let j = 0; j < s.length; j++) { if (s[j] === id) out.push(a, b); else out.push(s[j]); }
    return out;
  }
  // Кодирование одного куска словарём после k склеек: всегда склеиваем пару с самым ранним номером склейки
  function encodeWord(M, w, k) {
    let s = M.mode === 'char'
      ? Array.from(w, (ch) => { const i = M.charId.get(ch); return i === undefined ? unkId(ch) : i; })
      : Array.from(UTF8.encode(w));
    for (;;) {
      let best = Infinity;
      for (let j = 0; j < s.length - 1; j++) {
        if (s[j] < 0 || s[j + 1] < 0) continue;
        const r = M.rank.get(s[j] * KEY + s[j + 1]);
        if (r !== undefined && r < k && r < best) best = r;
      }
      if (best === Infinity) return s;
      s = mergeArr(s, M.L[best], M.R[best], M.K + best);
    }
  }
  const encCache = new Map();
  function encode(w) {
    let r = encCache.get(w);
    if (!r) { r = encodeWord(M, w, S.k); encCache.set(w, r); }
    return r;
  }
  // ─────────────────── 5. Состояние ───────────────────
  const S = {
    k: 0, playing: false, speed: 1,
    view: 'text', scene: 'corpus',
    sel: null, hov: null,
  };
  const MODELS = {};
  let M = MODELS.char = train('char');
  let cur = M.init.map((a) => a.slice());   // текущее разбиение каждого уникального куска

  const page = $('page'), sheet = $('sheet'), title = $('title'), eq = $('mEq');
  const wall = $('wall'), tree = $('tree'), tip = $('tip');
  const hlStyle = document.createElement('style');
  document.head.appendChild(hlStyle);

  // Чтение размеров откладываем на начало следующего кадра: тогда вёрстка уже готова
  // и не пересчитывается принудительно посреди шага
  const postQ = new Set();
  const afterLayout = (fn) => postQ.add(fn);
  function runPost() { if (!postQ.size) return; const q = [...postQ]; postQ.clear(); for (const fn of q) fn(); }

  // ─────────────────── 6. Фишки и поток текста ───────────────────
  function chipsHTML(ids, fresh, view, model) {
    const asIds = (view || S.view) === 'ids', Mm = model || M;
    let h = '';
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      h += '<span class="c ' + cls(Mm, id) + (fresh && fresh.has(id) ? ' nw' : '') + '" data-t="' + id + '">'
        + (asIds ? (id < 0 ? '?' : id) : innerFlow(Mm, id)) + '</span>';
    }
    return h;
  }
  const SHORT = new Set(['в', 'к', 'с', 'у', 'о', 'и', 'а', 'я', 'на', 'по', 'за', 'от', 'до', 'из', 'не', 'но', 'об', 'во', 'со', 'ко', 'ни']);
  const POST = new Set(['же', 'ли', 'бы']);
  // Поток кусков → HTML. Перенос строки возможен только перед куском с ведущим пробелом:
  // всё, что идёт вплотную (знаки, дефисы, части «7:45»), держится за предыдущее слово,
  // тире и частицы «же», «ли», «бы» — тоже, а короткие предлоги — за следующее.
  function flowHTML(pre, occ) {
    let out = '', group = '', glue = false;
    const flush = () => { if (group) { out += '<span class="w">' + group + '</span><wbr>'; group = ''; } };
    for (let i = 0; i < pre.length; i++) {
      const w = pre[i], h = occ(w, i);
      if (w[0] === '\n') {
        group += h; flush(); glue = false;
        if (i < pre.length - 1) out += w.length > 1 ? '<br><br>' : '<br>';
        continue;
      }
      const t = w.trimStart(), low = t.toLowerCase(), sp = w[0] === ' ';
      const attachPrev = group !== '' && (!sp || /^[—–]$/.test(t) || POST.has(low));
      if (!attachPrev && !glue) flush();
      group += h;
      glue = (!sp && t === '—') || (/^\p{L}{1,2}$/u.test(t) && SHORT.has(low));
    }
    flush();
    return out;
  }

  // ─────────────────── 7. Лист учебного текста ───────────────────
  let OCC = [], OCC_N = 1;
  function buildPage() {
    OCC = WORDS.map(() => []);
    const order = [];
    let html = '';
    BLOCK_PRE.forEach((pre, bi) => {
      html += BLOCKS[bi].hd ? '<p class="hd">' : '<p>';
      html += flowHTML(pre, (w) => {
        const wi = WORD_INDEX.get(w); order.push(wi);
        return '<span class="o">' + chipsHTML(cur[wi], null) + '</span>';
      });
      html += '</p>';
    });
    page.innerHTML = html;
    const els = page.getElementsByClassName('o');
    for (let i = 0; i < els.length; i++) { els[i]._ord = i; OCC[order[i]].push(els[i]); }
    OCC_N = Math.max(1, els.length);
  }
  // Перерисовать изменившиеся куски. Новые токены вспыхивают волной сверху вниз —
  // только в видимой части листа: вспышки за краем никто не увидит, а стоят они дорого.
  function flushPage(dirty, fresh, ripple) {
    if (!dirty.size) return;
    let sf = 0, vf = 1;
    const wave = fresh && S.scene === 'corpus';
    if (wave) { const sh = page.scrollHeight || 1; sf = page.scrollTop / sh; vf = Math.max(0.04, page.clientHeight / sh); }
    for (const wi of dirty) {
      const list = OCC[wi];
      let plain = null, lit = null;
      for (let i = 0; i < list.length; i++) {
        const el = list[i];
        const pos = wave ? (el._ord / OCC_N - sf) / vf : -1;   // 0…1 — в окне листа
        if (pos > -0.08 && pos < 1.08) {
          if (lit === null) lit = chipsHTML(cur[wi], fresh);
          el.innerHTML = lit;
          el.style.setProperty('--d', Math.round(clamp(pos, 0, 1) * ripple) + 'ms');
        } else {
          if (plain === null) plain = chipsHTML(cur[wi], null);
          el.innerHTML = plain;
        }
      }
    }
  }
  function rerenderPage() {
    for (let wi = 0; wi < WORDS.length; wi++) {
      const html = chipsHTML(cur[wi], null), list = OCC[wi];
      for (let i = 0; i < list.length; i++) list[i].innerHTML = html;
    }
  }

  // ─────────────────── 8. Шаг обучения ───────────────────
  let freqCache = null;
  const FRESH_MAX = 3;
  function setStep(k, animate, fast) {
    k = clamp(Math.round(k), 0, M.N);
    if (k === S.k) return;
    const fresh = animate && k > S.k && !REDUCED ? new Set() : null;
    const dirty = new Set();
    while (S.k < k) {
      const m = S.k, a = M.L[m], b = M.R[m], id = M.K + m, aff = M.AFF[m];
      for (let i = 0; i < aff.length; i++) { const wi = aff[i]; cur[wi] = mergeArr(cur[wi], a, b, id); dirty.add(wi); }
      if (fresh && k - m <= FRESH_MAX) fresh.add(id);   // вспыхивают только последние склейки пачки
      S.k++;
    }
    while (S.k > k) {
      S.k--;
      const m = S.k, a = M.L[m], b = M.R[m], id = M.K + m, aff = M.AFF[m];
      for (let i = 0; i < aff.length; i++) { const wi = aff[i]; cur[wi] = splitArr(cur[wi], id, a, b); dirty.add(wi); }
    }
    encCache.clear();
    freqCache = null;
    flushPage(dirty, fresh, fast ? 260 : 520);
    renderTitle(fresh);
    renderMerge(!!fresh && !fast);
    syncWall(fresh);
    renderTimeline();
    renderStats();
    if (S.scene === 'own') renderOwn(fresh);
    if (S.scene === 'count') renderCount(fresh);
    renderInspector();
    if (tipFor !== null) refreshTip();
  }
  // частота каждого токена в учебном тексте на текущем шаге
  function freqNow(id) {
    if (!freqCache) {
      freqCache = new Map();
      for (let wi = 0; wi < WORDS.length; wi++) {
        const f = FREQ[wi], s = cur[wi];
        for (let j = 0; j < s.length; j++) freqCache.set(s[j], (freqCache.get(s[j]) || 0) + f);
      }
    }
    return freqCache.get(id) || 0;
  }

  // ─────────────────── 9. Заголовок и табло склейки ───────────────────
  const TITLE_LINES = [['Как', ' модель'], [' читает', ' текст']];
  let titleKey = '';
  function renderTitle(fresh) {
    const segs = TITLE_LINES.map((line) => line.map((w) => encode(w)));
    const key = M.mode + ':' + segs.map((l) => l.map((ids) => ids.join(',')).join('|')).join('/');
    if (key === titleKey) return;
    titleKey = key;
    title.innerHTML = segs.map((l) => '<span class="ln">' + l.map((ids) => chipsHTML(ids, fresh, 'text')).join('') + '</span>').join('');
  }
  // Кегль заголовка подбирается по самому широкому состоянию — шагу 0, когда каждая буква отдельно
  const TITLE_MAX = 60;
  function fitTitle() {
    const probe = title.cloneNode(false);
    probe.removeAttribute('id');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;font-size:100px;width:auto';
    const C = MODELS.char;   // меряем по буквам: в байтовой основе заголовок может переноситься
    probe.innerHTML = TITLE_LINES.map((line) => '<span class="ln">' + line.map((w) => chipsHTML(encodeWord(C, w, 0), null, 'text', C)).join('') + '</span>').join('');
    title.parentNode.appendChild(probe);
    let maxW = 1;
    for (const ln of probe.children) maxW = Math.max(maxW, ln.scrollWidth);
    probe.remove();
    const avail = title.clientWidth || 360;
    title.style.fontSize = Math.min(TITLE_MAX, Math.floor((100 * avail) / maxW)) + 'px';
  }
  const bigChip = (id) => '<span class="c ' + cls(M, id) + '" data-t="' + id + '">' + innerLabel(M, id) + '</span>';
  const cell = (id, c) => '<div class="cell ' + c + '">' + bigChip(id) + '<span class="cid">№\u00A0' + id + '</span></div>';
  // Уравнение склейки должно влезать в карточку: при длинных токенах кегль уменьшается
  let eqBase = 0;
  function fitEq() {
    eq.style.fontSize = '';
    afterLayout(() => {
      const avail = eq.clientWidth, w = eq.scrollWidth;
      if (!avail || w <= avail + 1) return;
      if (!eqBase) eqBase = parseFloat(getComputedStyle(eq).fontSize) || 36;
      eq.style.fontSize = Math.max(15, Math.floor(eqBase * (avail / w) * 0.98)) + 'px';
    });
  }
  function renderMerge(animate) {
    const k = S.k;
    $('mStep').textContent = nf(k) + ' / ' + nf(M.N);
    if (k === 0) {
      $('mTitle').textContent = 'Шаг';
      eq.classList.remove('go');
      const sample = encodeWord(M, M.mode === 'char' ? 'слово' : 'сл', 0);
      eq.innerHTML = '<div class="letters0">' + sample.map((id) => cell(id, '')).join('') + '</div>';
      $('mNote').innerHTML = nb(M.mode === 'char'
        ? 'Пока каждый знак — отдельный токен. В словаре <b>' + nf(M.K) + '</b> ' + plural(M.K, 'знак', 'знака', 'знаков') + '.'
        : 'Пока каждый байт — отдельный токен. Русская буква в UTF-8 — это два байта.');
      return;
    }
    $('mTitle').textContent = 'Склейка';
    const m = k - 1, a = M.L[m], b = M.R[m], id = M.K + m;
    eq.className = 'eq hov' + (animate ? ' go' : '');
    eq.innerHTML = cell(a, 'A') + '<span class="op">+</span>' + cell(b, 'B') + '<span class="op">→</span>' + cell(id, 'N');
    fitEq();
    let note = 'Пара встретилась <b>' + nf(M.CNT[m]) + '</b> ' + plural(M.CNT[m], 'раз', 'раза', 'раз') + ' — чаще всех остальных.';
    if (k === M.N) note += ' Пар, которые встречаются хотя бы дважды, больше нет: словарь готов.';
    $('mNote').innerHTML = nb(note);
  }

  // ─────────────────── 10. Словарь ───────────────────
  let wallN = 0, wallStick = true;
  wall.addEventListener('scroll', () => { wallStick = wall.scrollTop + wall.clientHeight >= wall.scrollHeight - 40; }, { passive: true });
  function syncWall(fresh) {
    const k = S.k;
    if (k > wallN) {
      let html = '';
      for (let m = wallN; m < k; m++) {
        const id = M.K + m;
        html += '<span class="c ' + cls(M, id) + (fresh && k - m <= 4 ? ' nw' : '') + '" data-t="' + id + '">' + innerLabel(M, id) + '</span>';
      }
      wall.insertAdjacentHTML('beforeend', html);
    } else if (k < wallN) {
      for (let i = wallN; i > k && wall.lastElementChild; i--) wall.lastElementChild.remove();
    }
    wallN = k;
    const prev = wall.querySelector('.last');
    if (prev) prev.classList.remove('last');
    if (k > 0 && wall.lastElementChild) wall.lastElementChild.classList.add('last');
    if (wallStick) afterLayout(() => { wall.scrollTop = wall.scrollHeight; });
    $('vocabCount').textContent = nf(M.K + k);
    $('vocabNote').innerHTML = nb(nf(M.K) + ' ' + (M.mode === 'char' ? plural(M.K, 'исходный знак', 'исходных знака', 'исходных знаков') : plural(M.K, 'исходный байт', 'исходных байта', 'исходных байтов')) + ' и ' + nf(k) + ' '
      + plural(k, 'склейка', 'склейки', 'склеек') + (k ? ' — по порядку, от самой частой:' : '. Склейки появятся здесь.'));
  }
  function resetWall() { wall.innerHTML = ''; wallN = 0; wallStick = true; syncWall(null); }

  // ─────────────────── 11. Как собран токен ───────────────────
  function inspectedId() {
    if (S.sel !== null) return S.sel;
    if (S.hov !== null) return S.hov;
    return S.k > 0 ? M.K + S.k - 1 : null;
  }
  let lastInsp = '', treeW = 0;
  function renderInspector() {
    const id = inspectedId();
    $('insTitle').textContent = S.sel !== null ? 'Выбранный токен' : S.hov !== null ? 'Токен под курсором' : S.k > 0 ? 'Последняя склейка' : 'Как собран токен';
    $('unpin').hidden = S.sel === null;
    $('insHint').textContent = nb(S.sel === null && S.hov === null && S.k > 0
      ? (NO_HOVER ? 'Нажмите на любую фишку — в тексте, словаре или заголовке: она подсветится везде, где встречается.'
        : 'Наведите на любую фишку — в тексте, словаре или заголовке. Щелчок закрепляет выбор и подсвечивает все её места в тексте.') : '');
    const key = M.mode + '|' + id + '|' + S.k + '|' + treeW;
    if (key === lastInsp) return;
    lastInsp = key;
    const head = $('insHead');
    if (id === null) {
      head.innerHTML = '<div class="ins-meta">' + nb('Склеек пока нет. Когда они появятся, здесь будет видно, из каких кусков собран каждый токен.') + '</div>';
      tree.innerHTML = ''; tree.style.height = '0px'; $('insEx').innerHTML = '';
      return;
    }
    const f = freqNow(id);
    let meta = '<div class="iid">№\u00A0' + (id < 0 ? '?' : id) + '</div>';
    if (id < 0) meta += '<div>Этого знака нет в словаре</div>';
    else if (id < M.K) meta += '<div>' + (M.mode === 'char' ? 'Исходный знак' : 'Исходный байт ' + HEX(id)) + '</div>';
    else {
      const m = id - M.K;
      meta += '<div>Шаг ' + nf(m + 1) + ': ' + bigChipSmall(M.L[m]) + '+' + bigChipSmall(M.R[m]) + '</div>';
    }
    meta += '<div>' + (f ? 'В учебном тексте ' + nf(f) + ' ' + plural(f, 'раз', 'раза', 'раз') : id >= M.K ? 'Отдельно больше не встречается: вошёл в длинные токены' : 'Отдельно в тексте не встречается') + '</div>';
    head.innerHTML = '<span class="c big ' + cls(M, id) + '" data-t="' + id + '">' + innerLabel(M, id) + '</span><div class="ins-meta">' + nb(meta) + '</div>';
    renderTree(id);
    renderExamples(id);
  }
  // Где живёт токен: самые частые слова учебного текста, в которых он сейчас стоит
  function renderExamples(id) {
    const box = $('insEx');
    if (id === null || id < 0 || isNl(M, id)) { box.innerHTML = ''; return; }
    const found = [];
    for (let wi = 0; wi < WORDS.length; wi++) if (cur[wi].includes(id) && !/^\s+$/.test(WORDS[wi])) found.push(wi);
    if (!found.length) { box.innerHTML = ''; return; }
    found.sort((a, b) => FREQ[b] - FREQ[a] || a - b);
    box.innerHTML = '<span class="ex-l">В\u00A0словах</span>' + found.slice(0, 7).map((wi) =>
      '<span class="exw">' + cur[wi].map((t) => '<span class="c ' + (t === id ? cls(M, t) + ' on' : 'dim') + '" data-t="' + t + '">' + innerLabel(M, t) + '</span>').join('') + '</span>').join('')
      + (found.length > 7 ? '<span class="ex-more">и\u00A0ещё ' + nf(found.length - 7) + '</span>' : '');
  }
  const bigChipSmall = (id) => '<span class="c ' + cls(M, id) + '">' + innerLabel(M, id) + '</span>';
  // Дерево склеек: листья — исходные знаки, каждый токен лежит «кирпичом» над своими половинками
  function renderTree(id) {
    if (id < M.K) { tree.innerHTML = ''; tree.style.height = '0px'; return; }
    const nodes = [];
    let leaves = 0;
    (function walk(t) {
      if (t < M.K) { const n = { id: t, lo: leaves, hi: leaves + 1, h: 0 }; leaves++; nodes.push(n); return n; }
      const m = t - M.K;
      const l = walk(M.L[m]), r = walk(M.R[m]);
      const n = { id: t, lo: l.lo, hi: r.hi, h: Math.max(l.h, r.h) + 1, kids: [l, r] };
      nodes.push(n); return n;
    })(id);
    const root = nodes[nodes.length - 1], H = root.h;
    const W = treeW || 280;
    const lw = Math.min(M.mode === 'byte' ? 44 : 52, Math.floor(W / leaves));
    const rh = clamp(Math.floor(220 / (H + 1)), 24, 40), bh = rh - 9;
    const totalW = lw * leaves, x0 = Math.round((W - totalW) / 2);
    const fs = clamp(Math.min(lw * 0.62, bh * 0.62), 11, 19);
    let svg = '<svg width="' + W + '" height="' + (H + 1) * rh + '" aria-hidden="true">';
    let bricks = '';
    for (const n of nodes) {
      const x = x0 + n.lo * lw, w = (n.hi - n.lo) * lw - 3, y = (H - n.h) * rh;
      if (n.kids) for (const c of n.kids) {
        const cx = x0 + ((c.lo + c.hi) / 2) * lw - 1.5;
        svg += '<line x1="' + cx + '" y1="' + (y + bh) + '" x2="' + cx + '" y2="' + (H - c.h) * rh + '"/>';
      }
      bricks += '<span class="c tb ' + cls(M, n.id) + '" data-t="' + n.id + '" style="transform:translate(' + x + 'px,' + y + 'px);width:' + w + 'px;height:' + bh + 'px;font-size:' + fs.toFixed(1) + 'px">'
        + innerLabel(M, n.id) + '</span>';
    }
    tree.style.height = (H + 1) * rh - 6 + 'px';
    tree.innerHTML = svg + '</svg>' + bricks;
  }

  // ─────────────────── 12. Шкала обучения ───────────────────
  const timeline = $('timeline'), thumb = $('thumb');
  let tlW = 0;
  function buildCurve() {
    const N = Math.max(1, M.N), TA = M.TA, hi = TA[0];
    const stepN = Math.max(1, Math.ceil(N / 400));
    const y = (i) => (100 - (TA[i] / hi) * 86).toFixed(2);
    let d = 'M0,' + y(0);
    for (let i = stepN; i < M.N; i += stepN) d += 'L' + ((i / N) * 1000).toFixed(1) + ',' + y(i);
    d += 'L1000,' + y(M.N);
    const area = d + 'L1000,100L0,100Z';
    $('curveLineBg').setAttribute('d', d); $('curveLine').setAttribute('d', d);
    $('curveAreaBg').setAttribute('d', area); $('curveArea').setAttribute('d', area);
    $('tlMax').textContent = nf(M.N) + ' ' + plural(M.N, 'склейка', 'склейки', 'склеек');
    timeline.setAttribute('aria-valuemax', M.N);
  }
  function renderTimeline() {
    if (!tlW) tlW = timeline.clientWidth;
    const f = M.N ? S.k / M.N : 0;
    thumb.style.transform = 'translateX(' + (f * tlW).toFixed(1) + 'px)';
    $('clipRect').setAttribute('width', (f * 1000).toFixed(1));
    timeline.setAttribute('aria-valuenow', S.k);
    timeline.setAttribute('aria-valuetext', 'шаг ' + S.k + ' из ' + M.N);
  }
  let dragging = false;
  function stepFromX(clientX) {
    const r = timeline.getBoundingClientRect();
    return Math.round(clamp((clientX - r.left) / r.width, 0, 1) * M.N);
  }
  timeline.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true; timeline.classList.add('drag');
    timeline.setPointerCapture(e.pointerId);
    stopAuto();
    setStep(stepFromX(e.clientX), false);
  });
  timeline.addEventListener('pointermove', (e) => { if (dragging) setStep(stepFromX(e.clientX), false); });
  const endDrag = () => { dragging = false; timeline.classList.remove('drag'); };
  timeline.addEventListener('pointerup', endDrag);
  timeline.addEventListener('pointercancel', endDrag);
  timeline.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 25, PageDown: -25 }[e.key];
    if (d) { e.preventDefault(); e.stopPropagation(); stopAuto(); setStep(S.k + d * (e.shiftKey ? 10 : 1), d > 0); }
    else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); stopAuto(); setStep(0, false); }
    else if (e.key === 'End') { e.preventDefault(); e.stopPropagation(); stopAuto(); setStep(M.N, false); }
  });

  // ─────────────────── 13. Подвал листа ───────────────────
  let ownStatsHTML = '', countStatsHTML = '';
  function renderStats() {
    const el = $('stats');
    if (S.scene === 'own') { el.innerHTML = ownStatsHTML; return; }
    if (S.scene === 'count') { el.innerHTML = countStatsHTML; return; }
    const units = M.TA[0], t = M.TA[S.k];
    const u = M.mode === 'char' ? plural(units, 'знак', 'знака', 'знаков') : plural(units, 'байт', 'байта', 'байтов');
    el.innerHTML = '<b>' + nf(units) + '</b> ' + u + ' → <b>' + nf(t) + '</b> ' + plural(t, 'токен', 'токена', 'токенов')
      + ' · короче в <b>' + nf2(units / t) + '</b> раза';
  }

  // ─────────────────── 14. Свой текст ───────────────────
  const ownInput = $('ownInput'), ownOut = $('ownOut');
  // Примеры и то, что в каждом стоит заметить
  const OWN_PRESETS = [
    ['Фраза', 'Модель читает текст не по буквам, а кусочками.',
      'Слова, которые часто встречались в учебном тексте, становятся целыми токенами. Редкие режутся на куски.'],
    ['Опечатки', 'Мдоель чиатет тскет не по бкувам, а ксуочками.',
      'Те же слова с переставленными буквами. Знакомых пар стало мало, и слова рассыпаются на мелкие куски: для модели это почти новый текст.'],
    ['КАПСОМ', 'МОДЕЛЬ ЧИТАЕТ ТЕКСТ НЕ ПО БУКВАМ, А КУСОЧКАМИ.',
      'Заглавные буквы в учебном тексте редки, поэтому <b>МОДЕЛЬ</b> и <b>модель</b> для неё разные последовательности номеров. Капс дробится сильнее.'],
    ['English', 'The model reads text in pieces, not letters.',
      'Словарь учился на русском, английских склеек в нём нет — текст идёт по буквам. Обратное тоже верно: у моделей, которые учились в основном на английском, русский текст дробится сильнее.'],
    ['Числа', 'Поезд в 7:45, вагон 12, место 146.',
      'Числа режутся на куски цифр. В «146» модель видит не число, а один или несколько номеров токенов. Отчасти поэтому ей бывает трудно складывать и сравнивать длинные числа.'],
    ['Длинное слово', 'Сколько букв «о» в слове «обороноспособность»?',
      'Длинное слово распалось на несколько кусков, и буквы «о» спрятаны внутри номеров. Подробнее — во вкладке «Счёт букв».'],
  ];
  let ownPreset = 0;
  function initOwn() {
    const box = $('ownPresets');
    box.innerHTML = OWN_PRESETS.map((p, i) => '<button class="pill" type="button" data-i="' + i + '" aria-pressed="' + (i === 0) + '">' + esc(p[0]) + '</button>').join('');
    ownInput.value = OWN_PRESETS[0][1];
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.pill'); if (!b) return;
      ownPreset = +b.dataset.i;
      ownInput.value = OWN_PRESETS[ownPreset][1];
      box.querySelectorAll('.pill').forEach((x) => x.setAttribute('aria-pressed', x === b));
      renderOwn(null);
    });
    ownInput.addEventListener('input', () => {
      ownPreset = -1;
      box.querySelectorAll('.pill').forEach((x) => x.setAttribute('aria-pressed', 'false'));
      renderOwn(null);
    });
  }
  function renderOwn(fresh) {
    const text = normalize(ownInput.value);
    const pre = pretokenize(text);
    let tokens = 0, unk = 0;
    const html = flowHTML(pre, (w) => {
      const ids = encode(w); tokens += ids.length;
      for (const id of ids) if (id < 0) unk++;
      return '<span class="o">' + chipsHTML(ids, fresh) + '</span>';
    });
    ownOut.innerHTML = html || '<span class="empty">Пусто — напишите что-нибудь выше.</span>';
    const chars = Array.from(text).length, bytes = UTF8.encode(text).length;
    let s = '<b>' + nf(chars) + '</b> ' + plural(chars, 'знак', 'знака', 'знаков');
    if (M.mode === 'byte') s += ' (<b>' + nf(bytes) + '</b> ' + plural(bytes, 'байт', 'байта', 'байтов') + ')';
    s += ' → <b>' + nf(tokens) + '</b> ' + plural(tokens, 'токен', 'токена', 'токенов');
    if (unk) s += ' · <b>' + unk + '</b> ' + plural(unk, 'знака', 'знаков', 'знаков') + ' нет в словаре';
    else if (tokens) s += (M.mode === 'byte' ? ' · по байтам вышло бы <b>' + nf(bytes) : ' · по знакам вышло бы <b>' + nf(chars)) + '</b>';
    ownStatsHTML = s = nb(s);
    if (S.scene === 'own') $('stats').innerHTML = s;
    let hint = ownPreset >= 0 ? OWN_PRESETS[ownPreset][2]
      : (NO_HOVER ? 'Нажмите' : 'Наведите') + ' на фишку, чтобы увидеть её номер и то, из каких кусков она собрана.';
    if (unk) hint = 'Знаки со штриховкой не встречались при обучении, и номера для них нет. При основе из байтов такого не бывает: любой знак раскладывается на байты.';
    $('ownHint').innerHTML = nb(hint);
  }

  // ─────────────────── 15. Счёт букв ───────────────────
  const COUNT_PRESETS = [
    ['обороноспособность', 'о'],
    ['достопримечательность', 'т'],
    ['параллелепипед', 'п'],
    ['переосмысление', 'е'],
    ['водоворот', 'о'],
  ];
  let cWord = COUNT_PRESETS[0][0], cLetter = COUNT_PRESETS[0][1];
  function initCount() {
    $('count').innerHTML =
      '<h2 class="cq" id="cQ"></h2>' +
      '<div class="cform" id="cForm">' + COUNT_PRESETS.map((p, i) => '<button class="pill" type="button" data-i="' + i + '">' + p[0] + '</button>').join('') +
      '<input id="cInput" type="text" maxlength="28" placeholder="своё слово" aria-label="Своё слово" autocomplete="off" spellcheck="false"></div>' +
      '<div class="crow"><div class="clabel"><span class="label">Так видите вы</span><span class="cval" id="cHum"></span></div><div class="letters" id="cLetters"></div></div>' +
      '<div class="crow"><div class="clabel"><span class="label">Так видит модель</span><span class="cval" id="cMod"></span>' +
      '<button class="pill run" id="cRun" type="button"></button></div><div class="toks hov" id="cToks"></div></div>' +
      '<p class="cexp" id="cExp"></p>' +
      '<div class="crow hist-wrap"><div class="clabel"><span class="label">Как слово слипалось</span><span class="cval" id="cHistN"></span></div><div class="hist hov" id="cHist"></div></div>';
    $('cForm').addEventListener('click', (e) => {
      const b = e.target.closest('.pill'); if (!b) return;
      [cWord, cLetter] = COUNT_PRESETS[+b.dataset.i];
      $('cInput').value = '';
      renderCount();
    });
    $('cInput').addEventListener('input', (e) => {
      const v = normalize(e.target.value).replace(/[^\p{L}-]/gu, '').slice(0, 28);
      if (!v) return;
      cWord = v;
      const low = Array.from(v.toLowerCase());
      if (!low.includes(cLetter)) {   // буква по умолчанию — самая частая
        const cnt = new Map(); low.forEach((ch) => cnt.set(ch, (cnt.get(ch) || 0) + 1));
        cLetter = [...cnt].sort((a, b) => b[1] - a[1])[0][0];
      }
      renderCount();
    });
    $('cLetters').addEventListener('click', (e) => {
      const b = e.target.closest('.lt'); if (!b) return;
      cLetter = b.dataset.l; renderCount();
    });
    // «Склеивать дальше»: быстрый прогон обучения прямо на этом слове
    $('cRun').addEventListener('click', () => {
      if (S.playing && S.speed === 25) { setPlaying(false); return; }
      intro = null;
      if (S.k >= M.N) setStep(0, false);
      setSpeed(25);
      acc = SPEED_MS[25];
      setPlaying(true);
    });
  }
  // Все шаги обучения, на которых менялось разбиение слова
  const histCache = new Map();
  function wordHistory(w) {
    const key = M.mode + '|' + w;
    let rows = histCache.get(key);
    if (rows) return rows;
    let s = M.mode === 'char'
      ? Array.from(w, (ch) => { const i = M.charId.get(ch); return i === undefined ? unkId(ch) : i; })
      : Array.from(UTF8.encode(w));
    rows = [{ k: 0, s }];
    for (let m = 0; m < M.N; m++) {
      const a = M.L[m], b = M.R[m];
      for (let j = 0; j < s.length - 1; j++) {
        if (s[j] === a && s[j + 1] === b) { s = mergeArr(s, a, b, M.K + m); rows.push({ k: m + 1, s }); break; }
      }
    }
    histCache.set(key, rows);
    return rows;
  }
  function updateRunBtn() {
    const b = $('cRun'); if (!b) return;
    const on = S.playing && S.speed === 25;
    b.textContent = on ? 'Пауза' : S.k >= M.N ? 'Обучить заново' : 'Склеивать дальше ×25';
    b.setAttribute('aria-pressed', on);
  }
  function renderCount(fresh) {
    const letters = Array.from(cWord);
    const low = letters.map((ch) => ch.toLowerCase());
    const total = low.filter((ch) => ch === cLetter).length;
    $('cQ').innerHTML = 'Сколько букв <span class="pk">«' + esc(cLetter) + '»</span> в&nbsp;слове «' + esc(cWord) + '»?';
    $('cForm').querySelectorAll('.pill').forEach((b) => b.setAttribute('aria-pressed', COUNT_PRESETS[+b.dataset.i][0] === cWord));
    $('cLetters').innerHTML = letters.map((ch, i) => '<button class="lt' + (low[i] === cLetter ? ' on' : '') + '" type="button" data-l="' + esc(low[i]) + '" aria-label="Считать букву ' + esc(low[i]) + '">' + esc(ch) + '</button>').join('');
    $('cHum').innerHTML = nb(nf(letters.length) + ' ' + plural(letters.length, 'буква', 'буквы', 'букв') + ', из них «' + esc(cLetter) + '» — <b>' + total + '</b>');

    // модель видит слово так, как оно стоит во фразе: с пробелом впереди
    const ids = encodeWord(M, ' ' + cWord, S.k);
    const inside = ids.map(() => 0);
    // для каждой буквы — токен, в котором она начинается
    let pos = 1;   // пропускаем ведущий пробел (1 знак или 1 байт)
    const owner = [];
    let off = 0;
    ids.forEach((id, t) => {
      const n = M.mode === 'char' ? (id < 0 ? 1 : Array.from(tokStr(M, id)).length) : tokBytes(M, id).length;
      for (let i = 0; i < n; i++) owner[off + i] = t;
      off += n;
    });
    letters.forEach((ch, i) => {
      if (low[i] === cLetter) inside[owner[pos]]++;
      pos += M.mode === 'char' ? 1 : UTF8.encode(ch).length;
    });
    $('cToks').innerHTML = ids.map((id, t) =>
      '<div class="tk"><span class="c ' + cls(M, id) + (fresh && fresh.has(id) ? ' nw' : '') + '" data-t="' + id + '">' + innerLabel(M, id) + '</span>' +
      '<span class="tid">' + (id < 0 ? '?' : id) + '</span>' +
      '<span class="tin' + (inside[t] ? ' has' : '') + '">' + (inside[t] ? inside[t] + '\u00A0«' + esc(cLetter) + '»' : '—') + '</span></div>').join('');
    $('cMod').innerHTML = '<b>' + ids.length + '</b> ' + plural(ids.length, 'токен', 'токена', 'токенов');

    const nums = ids.map((id) => (id < 0 ? '?' : id)).join('\u00A0· ');
    const parts = inside.filter((x) => x > 0);
    const maxIn = Math.max(0, ...inside);
    let exp;
    if (S.k === 0) {
      exp = 'Пока словарь состоит из ' + (M.mode === 'char' ? 'отдельных знаков, и модель видит каждую букву — сосчитать легко.' : 'байтов, и модель видит каждую букву по частям.')
        + ' Но и текст для неё в <b>' + nf2(M.TA[0] / Math.max(1, M.TA[Math.min(M.N, 300)])) + '</b> раза длиннее, чем после 300 склеек. Запустите обучение и посмотрите, как буквы прячутся внутри токенов.';
    } else if (ids.length >= letters.length + 1) {
      exp = 'Это слово модель пока видит по буквам: частых пар в нём ещё не склеено. Запустите обучение дальше.';
    } else if (maxIn <= 1) {
      exp = 'Модели приходят только числа <span class="mono">' + nums + '</span>. Чтобы ответить «' + total + '», ей нужно помнить, в&nbsp;каких из этих номеров спрятана «' + esc(cLetter) + '»: в&nbsp;' + parts.length + ' из ' + ids.length
        + '. Из самих чисел этого не видно. Нажмите «Склеивать дальше» — куски станут крупнее, и&nbsp;буквы спрячутся глубже.';
    } else {
      exp = 'Модели приходят только числа <span class="mono">' + nums + '</span>. Чтобы ответить «' + total + '», ей нужно помнить, сколько «' + esc(cLetter) + '» спрятано в&nbsp;каждом номере: <b>' + parts.join(' + ') + '</b>.'
        + ' Из самих чисел этого не видно — такие сведения модель может вынести только из обучающих текстов. Поэтому вопрос, простой для человека, для неё трудный.';
    }
    $('cExp').innerHTML = nb(exp);
    countStatsHTML = 'Шаг обучения <b>' + nf(S.k) + '</b> · ' + nf(letters.length) + ' ' + plural(letters.length, 'буква', 'буквы', 'букв') + ' → <b>' + ids.length + '</b> ' + plural(ids.length, 'токен', 'токена', 'токенов');
    if (S.scene === 'count') $('stats').innerHTML = countStatsHTML;

    // история: строка на каждый шаг, который задел это слово; будущие шаги бледные
    const rows = wordHistory(' ' + cWord);
    let now = 0;
    for (let i = 0; i < rows.length; i++) if (rows[i].k <= S.k) now = i;
    $('cHistN').innerHTML = (rows.length - 1) + ' ' + plural(rows.length - 1, 'склейка задела', 'склейки задели', 'склеек задели') + ' это слово';
    $('cHist').innerHTML = rows.map((r, i) =>
      '<div class="hrow' + (i === now ? ' now' : i > now ? ' fut' : '') + '"><span class="hk">' + (r.k ? 'шаг\u00A0' + nf(r.k) : 'начало') + '</span><span class="hc">'
      + r.s.map((id) => '<span class="c ' + cls(M, id) + '" data-t="' + id + '">' + innerLabel(M, id) + '</span>').join('') + '</span></div>').join('');
    updateRunBtn();
  }

  // ─────────────────── 16. Наведение, выбор, подсказка ───────────────────
  let tipFor = null, tipEl = null, hovTimer = 0;
  function applyHighlight() {
    const id = S.sel !== null ? S.sel : S.hov;
    document.body.classList.toggle('hl', id !== null);
    document.body.classList.toggle('pin', S.sel !== null);
    hlStyle.textContent = id === null ? ''
      : '.hl .hov .c[data-t="' + id + '"]{opacity:1!important;box-shadow:0 0 0 2px var(--ink)}'
      + '.hl .night .hov .c[data-t="' + id + '"]{box-shadow:0 0 0 2px #fff}';
  }
  function tipHTML(id) {
    let d;
    if (id < 0) d = 'Этого знака нет в словаре. При основе из байтов такого не бывает: любой знак — это несколько байтов.';
    else if (id < M.K) d = M.mode === 'char' ? 'Исходный знак.' : 'Исходный байт ' + HEX(id) + '.';
    else d = 'Склеен на шаге ' + nf(id - M.K + 1) + '.';
    if (id >= 0) { const f = freqNow(id); d += ' В учебном тексте: ' + nf(f) + ' ' + plural(f, 'раз', 'раза', 'раз') + '.'; }
    return '<div class="tt"><span class="c ' + cls(M, id) + '">' + innerLabel(M, id) + '</span><span class="tno">№\u00A0' + (id < 0 ? '?' : id) + '</span></div>' + nb(d);
  }
  function showTip(el, id) {
    tipFor = id; tipEl = el;
    tip.innerHTML = tipHTML(id);
    tip.hidden = false;
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = r.left + r.width / 2 - tw / 2, y = r.top - th - 10;
    if (y < 8) y = r.bottom + 10;
    x = clamp(x, 8, innerWidth - tw - 8);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
    tip.classList.add('on');
  }
  function refreshTip() { if (tipEl && tipEl.isConnected) tip.innerHTML = tipHTML(tipFor); else hideTip(); }
  function hideTip() { tipFor = null; tipEl = null; tip.classList.remove('on'); tip.hidden = true; }
  function setHover(id, el) {
    if (id === S.hov && el === tipEl) return;
    S.hov = id;
    applyHighlight();
    renderInspector();
    if (id !== null && el && !el.closest('.tree')) showTip(el, id); else hideTip();
  }
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest && e.target.closest('.c[data-t]');
    if (el && el.closest('.hov')) { clearTimeout(hovTimer); setHover(+el.dataset.t, el); }
    else if (S.hov !== null) { clearTimeout(hovTimer); hovTimer = setTimeout(() => setHover(null), 110); }
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('.c[data-t]');
    if (!el || !el.closest('.hov')) {
      if (S.sel !== null && !e.target.closest('.right, .tip, button, .timeline')) { S.sel = null; applyHighlight(); renderInspector(); hideTip(); }
      return;
    }
    const id = +el.dataset.t;
    S.sel = S.sel === id ? null : id;
    applyHighlight();
    lastInsp = '';
    renderInspector();
    if (S.sel !== null) showTip(el, id); else hideTip();
  });
  $('unpin').addEventListener('click', () => { S.sel = null; applyHighlight(); renderInspector(); hideTip(); });
  page.addEventListener('scroll', () => { if (tipEl && tipEl.closest('#page')) hideTip(); }, { passive: true });

  // ─────────────────── 17. Кнопки и клавиши ───────────────────
  const SPEED_MS = { 1: 1150, 5: 230, 25: 46 };
  const bPlay = $('bPlay');
  function setPlaying(p) {
    S.playing = p;
    const ended = !p && S.k >= M.N;
    bPlay.classList.toggle('paused', !p && !ended);
    bPlay.classList.toggle('ended', ended);
    bPlay.setAttribute('aria-label', p ? 'Пауза' : ended ? 'Сначала' : 'Пуск');
    updateRunBtn();
  }
  function stopAuto() { intro = null; setPlaying(false); }
  bPlay.addEventListener('click', () => {
    if (intro) { stopAuto(); return; }
    if (S.playing) { setPlaying(false); return; }
    if (S.k >= M.N) setStep(0, false);
    acc = SPEED_MS[S.speed];   // первая склейка — сразу
    setPlaying(true);
  });
  $('bBack').addEventListener('click', () => { stopAuto(); setStep(S.k - 1, false); });
  $('bFwd').addEventListener('click', () => { stopAuto(); setStep(S.k + 1, true); });
  $('bReset').addEventListener('click', () => { stopAuto(); setStep(0, false); });
  function setSpeed(v) {
    S.speed = v;
    $('segSpeed').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', +x.dataset.speed === v));
    updateRunBtn();
  }
  $('segSpeed').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setSpeed(+b.dataset.speed);
  });
  $('segBase').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $('segBase').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    switchBase(b.dataset.base);
  });
  $('segView').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    setView(b.dataset.view);
  });
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('.tab'); if (!b) return;
    setScene(b.dataset.scene);
  });
  document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ' && tag !== 'button') { e.preventDefault(); bPlay.click(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stopAuto(); setStep(S.k + (e.shiftKey ? 10 : 1), true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stopAuto(); setStep(S.k - (e.shiftKey ? 10 : 1), false); }
    else if (e.key === 'Home') { e.preventDefault(); stopAuto(); setStep(0, false); }
    else if (e.key === 'End') { e.preventDefault(); stopAuto(); setStep(M.N, false); }
    else if (e.key === 'Escape') { S.sel = null; S.hov = null; applyHighlight(); renderInspector(); hideTip(); }
    else if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') setView(S.view === 'ids' ? 'text' : 'ids');
  });

  function setView(v) {
    if (v === S.view) return;
    S.view = v;
    $('segView').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.view === v));
    sheet.classList.toggle('night', v === 'ids');
    page.classList.toggle('ids', v === 'ids');
    ownOut.classList.toggle('ids', v === 'ids');
    rerenderPage();
    renderOwn(null);
    const sc = document.querySelector('.scene:not([hidden])');
    if (sc && !REDUCED) { sc.classList.remove('enter'); void sc.offsetWidth; sc.classList.add('enter'); }
  }
  function setScene(s) {
    if (s === S.scene) return;
    S.scene = s;
    hideTip();
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', t.dataset.scene === s));
    const map = { corpus: 'sCorpus', own: 'sOwn', count: 'sCount' };
    for (const [k, id] of Object.entries(map)) {
      const el = $(id);
      el.hidden = k !== s;
      if (k === s && !REDUCED) { el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
    }
    if (s === 'own') renderOwn(null);
    if (s === 'count') renderCount();
    renderStats();
  }
  function renderBaseNote() {
    $('baseNote').innerHTML = nb(M.mode === 'char'
      ? 'Сейчас словарь начинается с отдельных знаков: букв, цифр, пробела и&nbsp;знаков препинания. Так нагляднее.'
      : 'Как у&nbsp;многих настоящих токенизаторов: в&nbsp;начале 256 байтов. Русская буква в&nbsp;UTF-8 — это два байта, и&nbsp;первые склейки собирают буквы обратно.');
  }
  function switchBase(mode) {
    if (M.mode === mode) return;
    stopAuto();
    const k = S.k;
    M = MODELS[mode] || (MODELS[mode] = train(mode));
    cur = M.init.map((a) => a.slice());
    S.k = 0;
    const target = Math.min(k, M.N);
    for (let m = 0; m < target; m++) {
      const a = M.L[m], b = M.R[m], id = M.K + m, aff = M.AFF[m];
      for (let i = 0; i < aff.length; i++) cur[aff[i]] = mergeArr(cur[aff[i]], a, b, id);
    }
    S.k = target;
    document.body.classList.toggle('byte', mode === 'byte');
    S.sel = null; S.hov = null; applyHighlight(); hideTip();
    encCache.clear(); freqCache = null; lastInsp = '';
    buildPage(); buildCurve(); resetWall();
    renderTitle(null); renderMerge(false); renderTimeline(); renderStats(); renderInspector(); renderBaseNote();
    if (S.scene === 'own') renderOwn(null);
    if (S.scene === 'count') renderCount();
  }

  // ─────────────────── 18. Главный цикл и вступление ───────────────────
  // Вступление: пауза на «чистых буквах», затем быстрый прогон первых склеек —
  // текст на глазах собирается из букв в слоги. Дальше — спокойный темп ×1.
  // При съёмке обложки (window.__SHOT__) вступление начинается без паузы, чтобы к кадру всё успокоилось
  const INTRO_K = 132, INTRO_DELAY = SHOT ? 0 : 420, INTRO_DUR = 1400, INTRO_REST = 450;   // шаг 132 — «␣чит + ает → ␣читает»
  let intro = { t0: -1 };
  let rafId = 0, last = 0, acc = 0;
  function frame(now) {
    rafId = 0;
    if (document.hidden) return;
    rafId = requestAnimationFrame(frame);
    runPost();
    const dt = last ? Math.min(200, now - last) : 16;
    last = now;
    if (intro) {
      if (intro.t0 < 0) intro.t0 = now;
      const p = clamp((now - intro.t0 - INTRO_DELAY) / INTRO_DUR, 0, 1);
      const target = Math.round(Math.min(INTRO_K, M.N) * easeInOut(p));
      if (target > S.k) setStep(target, true, true);
      if (p >= 1) { intro = null; acc = -INTRO_REST; setPlaying(true); }
      return;
    }
    if (!S.playing || dragging) return;
    acc += dt;
    const iv = SPEED_MS[S.speed];
    if (acc >= iv) {
      const n = Math.min(Math.floor(acc / iv), 60);
      acc -= n * iv;
      setStep(S.k + n, true, iv < 400);
      if (S.k >= M.N) setPlaying(false);
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !rafId) { last = 0; rafId = requestAnimationFrame(frame); }
  });
  function measure() { tlW = timeline.clientWidth; treeW = tree.clientWidth; eqBase = 0; }
  addEventListener('resize', () => { measure(); renderTimeline(); fitTitle(); lastInsp = ''; renderInspector(); renderMerge(false); hideTip(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); fitTitle(); lastInsp = ''; renderInspector(); renderMerge(false); });

  // Зерно бумаги: крошечная шумовая текстура, нарисованная один раз
  function makeGrain() {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 120;
      const g = c.getContext('2d'), img = g.createImageData(120, 120);
      let x = 7;
      for (let i = 0; i < img.data.length; i += 4) {
        x = (Math.imul(x, 1103515245) + 12345) & 0x7fffffff;
        img.data[i] = 27; img.data[i + 1] = 29; img.data[i + 2] = 58; img.data[i + 3] = (x >> 16) % 15;
      }
      g.putImageData(img, 0, 0);
      document.body.style.setProperty('--grain', 'url(' + c.toDataURL('image/png') + ')');
    } catch (e) { /* без зерна тоже хорошо */ }
  }

  // ─────────────────── 19. Старт ───────────────────
  makeGrain();
  measure();
  buildPage();
  buildCurve();
  renderTitle(null);
  fitTitle();
  renderMerge(false);
  resetWall();
  renderTimeline();
  renderStats();
  renderInspector();
  renderBaseNote();
  initOwn();
  initCount();
  renderOwn(null);
  renderCount();
  setPlaying(true);
  rafId = requestAnimationFrame(frame);
})();
