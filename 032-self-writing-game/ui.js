/* ================================================================
   032 · Игра, которая пишет себя — интерфейс: живой лог, код с подсветкой,
   построчный дифф между версиями, галерея в localStorage.
   ================================================================ */
(function (root) {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // неразрывные пробелы после коротких слов — для русских фраз в интерфейсе
  const nbsp = (s) => String(s).replace(/(^|[\s«(])([вксиаоуяВКСИАОУЯ]|на|по|за|от|до|из|не|но|об|ко|во|со|для|без|при|про|над|под)\s/g, '$1$2\u00a0');

  /* ---------------- живой лог ---------------- */
  const Log = {
    el: null, t0: 0,
    init(el) { this.el = el; this.t0 = performance.now(); },
    stamp() {
      const s = Math.max(0, (performance.now() - this.t0) / 1000);
      const m = Math.floor(s / 60), r = Math.floor(s % 60);
      return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
    },
    // kind: info | think | write | ok | err | fix | play | warn | demo
    add(kind, html, opts) {
      const row = document.createElement('li');
      row.className = 'lg lg-' + kind + (opts && opts.sub ? ' lg-sub' : '');
      const icon = { info: '·', think: '◌', write: '✎', ok: '✓', err: '✗', fix: '↻', play: '▶', warn: '!', demo: '◇', test: '▸' }[kind] || '·';
      row.innerHTML = '<span class="lg-t">' + this.stamp() + '</span><span class="lg-i" aria-hidden="true">' + icon + '</span><span class="lg-x">' + html + '</span>';
      this.el.appendChild(row);
      while (this.el.children.length > 160) this.el.firstChild.remove();
      requestAnimationFrame(() => row.classList.add('in'));
      this.el.scrollTop = this.el.scrollHeight;
      return row;
    },
    // строка, которую можно обновлять (таймер «думает 12 с»)
    live(kind, html) {
      const row = this.add(kind, html);
      return { set: (h) => { const x = row.querySelector('.lg-x'); if (x) x.innerHTML = h; }, kind: (k) => { row.className = 'lg lg-' + k + ' in'; }, row };
    },
    clear() { this.el.innerHTML = ''; this.t0 = performance.now(); },
  };

  /* ---------------- подсветка JS ---------------- */
  const KW = 'const|let|var|function|return|if|else|for|while|do|of|in|new|break|continue|switch|case|default|true|false|null|undefined|this|typeof|instanceof|try|catch|finally|throw|class|extends|delete|void|async|await';
  const API = 'init|update|draw|W|H|T|score|lives|key|tap|input|pointer|gameOver|win|sound|burst|floatText|shake|rand|randi|pick|clamp|lerp|dist|angle|hitRect|hitCircle|circle|rect|text|autoplay|addScore';
  const TOKEN = new RegExp(
    '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$))' +               // 1 комментарий
    '|(`(?:\\\\[\\s\\S]|[^\\\\`])*`?|\'(?:\\\\.|[^\\\\\'\\n])*\'?|"(?:\\\\.|[^\\\\"\\n])*"?)' + // 2 строка
    '|(\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b|\\b0x[0-9a-f]+\\b)' +  // 3 число
    '|\\b(' + KW + ')\\b' +                                          // 4 ключевое слово
    '|\\b(' + API + ')\\b' +                                         // 5 API движка
    '|(\\b[A-Za-z_$][\\w$]*(?=\\s*\\())', 'g');                      // 6 вызов функции
  function tokenize(src) {
    const out = [];
    let i = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(src))) {
      if (m.index > i) out.push(['', src.slice(i, m.index)]);
      const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : m[4] ? 'k' : m[5] ? 'a' : 'f';
      out.push([cls, m[0]]);
      i = TOKEN.lastIndex;
      if (!m[0].length) TOKEN.lastIndex++;
    }
    if (i < src.length) out.push(['', src.slice(i)]);
    return out;
  }
  // токены → массив HTML-строк по строкам кода
  function highlightLines(src) {
    const lines = [''];
    for (const [cls, text] of tokenize(src)) {
      const parts = text.split('\n');
      parts.forEach((p, j) => {
        if (j > 0) lines.push('');
        if (p) lines[lines.length - 1] += cls ? '<span class="t' + cls + '">' + esc(p) + '</span>' : esc(p);
      });
    }
    return lines;
  }

  /* ---------------- построчный дифф: какие строки новые ---------------- */
  function changedLines(oldSrc, newSrc) {
    const a = oldSrc.split('\n').map((s) => s.trim()), b = newSrc.split('\n').map((s) => s.trim());
    const n = a.length, m = b.length;
    if (n * m > 1.2e6) return new Set();
    const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const added = new Set();
    let i = 0, j = 0, removed = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { i++; removed++; }
      else { if (b[j]) added.add(j + 1); j++; }
    }
    while (j < m) { if (b[j]) added.add(j + 1); j++; }
    added.removed = removed + (n - i);
    return added;
  }

  /* ---------------- просмотр кода ---------------- */
  const Code = {
    box: null, meta: null, src: '', streaming: false, pending: null, timer: 0,
    init(box, meta) { this.box = box; this.meta = meta; },
    show(src, opts) {
      opts = opts || {};
      this.src = src;
      const lines = highlightLines(src);
      const add = opts.added || new Set();
      const errLine = opts.errLine || 0;
      let html = '';
      for (let i = 0; i < lines.length; i++) {
        const n = i + 1;
        const cls = (n === errLine ? ' is-err' : '') + (add.has(n) ? ' is-add' : '');
        html += '<div class="ln' + cls + '"><span class="no">' + n + '</span><span class="tx">' + (lines[i] || ' ') + '</span></div>';
      }
      if (opts.streaming) html += '<div class="ln is-caret"><span class="no"></span><span class="tx"><i class="caret"></i></span></div>';
      this.box.innerHTML = html;
      if (opts.streaming) this.box.scrollTop = this.box.scrollHeight;
      else if (errLine) this.scrollTo(errLine);
      else if (add.size) this.scrollTo(Math.min(...add));
      else if (!opts.keepScroll) this.box.scrollTop = 0;
      if (this.meta) this.meta.textContent = opts.label || (lines.length + ' ' + plural(lines.length, 'строка', 'строки', 'строк'));
    },
    // поток: перерисовка не чаще раза в 90 мс
    stream(src) {
      this.pending = src;
      if (this.timer) return;
      this.timer = setTimeout(() => {
        this.timer = 0;
        const s = this.pending;
        const n = s.split('\n').length;
        this.show(s, { streaming: true, label: 'пишет · ' + n + ' ' + plural(n, 'строка', 'строки', 'строк') });
      }, 90);
    },
    stopStream() { clearTimeout(this.timer); this.timer = 0; },
    scrollTo(line) {
      const row = this.box.children[line - 1];
      if (row) this.box.scrollTop = Math.max(0, row.offsetTop - this.box.clientHeight / 3);
    },
    markError(line) {
      this.box.querySelectorAll('.is-err').forEach((r) => r.classList.remove('is-err'));
      const row = line && this.box.children[line - 1];
      if (row) { row.classList.add('is-err'); this.scrollTo(line); }
    },
  };

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  /* ---------------- галерея ---------------- */
  const STORE = 'swg120.gallery';
  const Gallery = {
    read() { try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } },
    write(list) {
      // если не влезает — выкидываем самые старые
      for (let n = list.length; n >= 0; n--) {
        try { localStorage.setItem(STORE, JSON.stringify(list.slice(0, n))); return true; } catch (e) { /* переполнено */ }
      }
      return false;
    },
    upsert(item) {
      const list = this.read().filter((x) => x.id !== item.id);
      list.unshift(item);
      this.write(list.slice(0, 24));
    },
    remove(id) { this.write(this.read().filter((x) => x.id !== id)); },
    render(box, demos, onPick, onRemove) {
      const saved = this.read();
      let html = '';
      if (saved.length) {
        html += '<h3 class="gal-h">Ваши игры</h3><ul class="gal">';
        for (const g of saved) {
          html += '<li class="card" data-id="' + esc(g.id) + '"><button class="card-hit" data-pick="' + esc(g.id) + '" aria-label="Открыть «' + esc(g.title) + '»">' +
            (g.thumb ? '<img alt="" src="' + g.thumb + '">' : '<span class="card-blank"></span>') +
            '<span class="card-t">' + esc(g.title) + '</span><span class="card-p">«' + esc(nbsp(g.phrase)) + '»</span>' +
            '<span class="card-m">' + esc(g.meta || '') + '</span></button>' +
            '<button class="card-x" data-del="' + esc(g.id) + '" aria-label="Удалить из галереи" title="Удалить"><svg viewBox="0 0 16 16" width="14" height="14"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button></li>';
        }
        html += '</ul>';
      } else {
        html += '<p class="gal-empty">Здесь появятся ваши игры: каждая, что прожила 6&nbsp;секунд без ошибок, сохраняется сама — с&nbsp;миниатюрой и&nbsp;фразой.</p>';
      }
      html += '<h3 class="gal-h">Заготовки демо-режима</h3><ul class="gal">';
      for (const d of demos) {
        html += '<li class="card card-demo" style="--c:' + d.bg + ';--ink:' + (d.ink || '#fff') + '"><button class="card-hit" data-demo="' + d.id + '" aria-label="Открыть заготовку «' + esc(d.title) + '»">' +
          '<span class="card-cover" aria-hidden="true">' + esc(d.title) + '</span>' +
          '<span class="card-t">' + esc(d.title) + '</span><span class="card-p">«' + esc(nbsp(d.phrase)) + '»</span></button></li>';
      }
      html += '</ul>';
      box.innerHTML = html;
      box.onclick = (e) => {
        const del = e.target.closest('[data-del]');
        if (del) { onRemove(del.dataset.del); return; }
        const pickEl = e.target.closest('[data-pick],[data-demo]');
        if (pickEl) onPick(pickEl.dataset.pick ? { saved: pickEl.dataset.pick } : { demo: pickEl.dataset.demo });
      };
    },
  };

  root.SWG = root.SWG || {};
  root.SWG.ui = { Log, Code, Gallery, highlightLines, changedLines, plural, esc, nbsp, $ };
})(window);
