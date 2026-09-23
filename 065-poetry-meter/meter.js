/* Стиховедческий движок: слоги, ударения, размер, отклонения, клаузулы, рифмы, профиль ударности. */
(function () {
  'use strict';
  const VOWELS = 'аеёиоуыэюя';
  const isVowel = (c) => VOWELS.includes(c.toLowerCase());
  // Безударные служебные односложные слова (для своего текста)
  const CLITICS = new Set('в во на с со к ко по за от до из у о об обо при про без над под пред и а но да же ли бы б не ни то как что чтоб уж ль ж'.split(' '));

  /* ---------- Разбор строки ---------- */
  function parseLine(src, { explicit = true, overrides = null, lineIdx = 0 } = {}) {
    const units = [];
    const re = /([А-Яа-яЁёA-Za-z'’́-]+)|([^А-Яа-яЁёA-Za-z'’́-]+)/g;
    let m, wi = 0;
    while ((m = re.exec(src))) {
      if (m[2] != null) { units.push({ type: 'text', s: m[2] }); continue; }
      const raw = m[1];
      const chars = [], vowels = [];
      let stress = -1, hasYo = -1;
      for (const ch of raw) {
        if (ch === "'" || ch === '’' || ch === '́') {
          if (chars.length && isVowel(chars[chars.length - 1])) stress = vowels.length - 1;
          continue;
        }
        chars.push(ch);
        if (isVowel(ch)) { vowels.push(chars.length - 1); if (ch === 'ё' || ch === 'Ё') hasYo = vowels.length - 1; }
      }
      if (!vowels.length) { units.push({ type: 'text', s: chars.join('') }); continue; }
      const word = chars.join('');
      const lower = word.toLowerCase().replace(/-/g, '');
      let guessed = false;
      if (stress < 0 && hasYo >= 0) stress = hasYo;
      if (stress < 0) {
        if (vowels.length === 1) stress = explicit || CLITICS.has(lower) ? -1 : 0;
        else if (explicit) stress = -1;            // в размеченных стихах слово без пометы безударно («и́з лесу»)
        else { stress = vowels.length - 2; guessed = true; }
      }
      const key = `${lineIdx}:${wi}`;
      if (overrides && overrides.has(key)) { stress = overrides.get(key); guessed = false; }
      units.push({ type: 'word', chars, vowels, stress, guessed, mono: vowels.length === 1, wi, key });
      wi++;
    }
    const syl = [];
    for (const u of units) if (u.type === 'word') u.vowels.forEach((ci, k) => syl.push({ u, k, stressed: u.stress === k, mono: u.mono, guessed: u.guessed && u.stress === k }));
    return { src, units, syl };
  }

  /* ---------- Размеры ---------- */
  const METERS = [
    { id: 'yamb', name: 'ямб', size: 2, first: 2, foot: ['u', 's'] },
    { id: 'horey', name: 'хорей', size: 2, first: 1, foot: ['s', 'u'] },
    { id: 'daktil', name: 'дактиль', size: 3, first: 1, foot: ['s', 'u', 'u'] },
    { id: 'amfibrahiy', name: 'амфибрахий', size: 3, first: 2, foot: ['u', 's', 'u'] },
    { id: 'anapest', name: 'анапест', size: 3, first: 3, foot: ['u', 'u', 's'] },
  ];
  const isIctus = (m, p) => p >= m.first && (p - m.first) % m.size === 0;

  function scoreLine(m, syl) {
    let last = -1;
    syl.forEach((s, i) => { if (s.stressed) last = i; });
    if (last < 0) return { sc: 0, feet: 0, offPoly: 0, offMono: 0, on: 0, stresses: 0 };
    let sc = 0, offPoly = 0, offMono = 0, on = 0, stresses = 0;
    syl.forEach((s, i) => {
      if (!s.stressed) return;
      stresses++;
      if (isIctus(m, i + 1)) { sc += 1; on++; }
      else if (s.mono) { sc -= 0.35; offMono++; }
      else { sc -= 2; offPoly++; }
    });
    if (!isIctus(m, last + 1)) sc -= 4;
    let feet = 0;
    for (let p = 1; p <= last + 1; p++) if (isIctus(m, p)) feet++;
    for (let p = 1; p <= last + 1; p++) if (isIctus(m, p) && !syl[p - 1].stressed) sc -= 0.12;
    return { sc, feet, offPoly, offMono, on, stresses };
  }

  const FEET = { 1: 'одностопный', 2: 'двухстопный', 3: 'трёхстопный', 4: 'четырёхстопный', 5: 'пятистопный', 6: 'шестистопный', 7: 'семистопный', 8: 'восьмистопный' };
  const ICTS = { 2: 'двухиктный', 3: 'трёхиктный', 4: 'четырёхиктный', 5: 'пятииктный', 6: 'шестииктный' };
  const mode = (arr) => {
    const c = new Map(); arr.forEach((x) => c.set(x, (c.get(x) || 0) + 1));
    let best = null, n = -1; for (const [k, v] of c) if (v > n || (v === n && k > best)) { best = k; n = v; }
    return best;
  };

  function analyze(lines) {
    const real = lines.filter((l) => l.syl.some((s) => s.stressed));
    if (!real.length) return { kind: 'none', lines };
    // лучший классический размер
    let best = null;
    for (const m of METERS) {
      let sc = 0, offPoly = 0, stresses = 0; const feet = [];
      for (const l of real) { const r = scoreLine(m, l.syl); sc += r.sc; offPoly += r.offPoly; stresses += r.stresses; feet.push(r.feet); }
      if (!best || sc > best.sc) best = { m, sc, offPoly, stresses, feet };
    }
    const classical = best.offPoly / Math.max(1, best.stresses) <= 0.12;
    let result;
    if (classical) {
      const f = mode(best.feet);
      const same = best.feet.every((x) => x === f);
      result = { kind: 'classical', meter: best.m, feet: f, mixed: !same, name: (same ? FEET[f] || f + '-стопный' : 'разностопный') + ' ' + best.m.name };
    } else {
      // дольник: между ударениями 1–2 безударных
      let ok = 0; const icts = [];
      for (const l of real) {
        const pos = l.syl.map((s, i) => (s.stressed ? i : -1)).filter((i) => i >= 0);
        icts.push(pos.length);
        const gaps = pos.slice(1).map((p, i) => p - pos[i] - 1);
        if (gaps.every((g) => g === 1 || g === 2) && pos[0] <= 2) ok++;
      }
      const n = mode(icts);
      if (ok / real.length >= 0.75) result = { kind: 'dolnik', name: (ICTS[n] || n + '-иктный') + ' дольник', icts: n };
      else result = { kind: 'tonic', name: 'тонический стих', icts: n };
    }
    // разметка слогов: схемные позиции, пиррихии, сверхсхемные ударения
    let pyrrhic = 0, extra = 0;
    for (const l of lines) {
      l.syl.forEach((s, i) => {
        s.ictus = result.kind === 'classical' ? isIctus(result.meter, i + 1) : s.stressed;
        s.pyrrhic = false; s.extra = false;
      });
      if (result.kind === 'classical') {
        let last = -1; l.syl.forEach((s, i) => { if (s.stressed) last = i; });
        l.syl.forEach((s, i) => {
          if (i > last) { s.ictus = false; return; }
          if (s.ictus && !s.stressed) { s.pyrrhic = true; pyrrhic++; }
          if (!s.ictus && s.stressed) { s.extra = true; extra++; }
        });
      }
      let last = -1; l.syl.forEach((s, i) => { if (s.stressed) last = i; });
      const tail = last < 0 ? 0 : l.syl.length - 1 - last;
      l.clausula = last < 0 ? '' : tail === 0 ? 'м' : tail === 1 ? 'ж' : tail === 2 ? 'д' : 'г';
    }
    result.pyrrhic = pyrrhic; result.extra = extra;
    // профиль ударности
    if (result.kind === 'classical') {
      const N = Math.max(...best.feet);
      const hit = new Array(N).fill(0), tot = new Array(N).fill(0);
      for (const l of real) {
        let k = 0, last = -1; l.syl.forEach((s, i) => { if (s.stressed) last = i; });
        for (let i = 0; i <= last; i++) {
          if (isIctus(result.meter, i + 1)) { tot[k]++; if (l.syl[i].stressed) hit[k]++; k++; }
        }
      }
      result.profile = hit.map((h, i) => (tot[i] ? h / tot[i] : 0));
    }
    rhymes(lines);
    result.scheme = schemeName(lines);
    return Object.assign(result, { lines });
  }

  /* ---------- Рифмы ---------- */
  const VMAP = { я: 'а', ю: 'у', ё: 'о', е: 'э', и: 'ы' };
  const DEVOICE = { б: 'п', в: 'ф', г: 'к', д: 'т', ж: 'ш', з: 'с' };
  function rhymeKey(l) {
    let lastSyl = null;
    for (const s of l.syl) if (s.stressed) lastSyl = s;
    if (!lastSyl) return null;
    const u = lastSyl.u;
    let tail = u.chars.slice(u.vowels[lastSyl.k]).join('').toLowerCase().replace(/[ьъ\-]/g, '');
    tail = [...tail].map((c) => VMAP[c] || c).join('');
    if (tail.length > 1 && DEVOICE[tail[tail.length - 1]]) tail = tail.slice(0, -1) + DEVOICE[tail[tail.length - 1]];
    return { v: tail[0], rest: tail.slice(1) };
  }
  // Совпадает ударная гласная и согласные сразу после неё (для женских и дактилических рифм),
  // а в мужских — весь хвост: «обветша́лой — запозда́лый», «середи́ны — журавли́ный»
  const cluster = (r) => { let i = 0; while (i < r.length && !'аоуыэ'.includes(r[i])) i++; return { head: r.slice(0, i), open: i < r.length }; };
  function rhymeMatch(a, b) {
    if (!a || !b || a.v !== b.v) return false;
    if (a.rest === b.rest) return true;
    const x = cluster(a.rest), y = cluster(b.rest);
    return x.open && y.open && x.head.length > 0 && x.head === y.head;
  }
  const LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ';
  function rhymes(lines) {
    let next = 0;
    const keys = lines.map(rhymeKey);
    lines.forEach((l, i) => {
      l.rhyme = '';
      if (!keys[i]) return;
      for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
        if (rhymeMatch(keys[i], keys[j])) {
          if (!lines[j].rhyme) lines[j].rhyme = LETTERS[next++ % LETTERS.length];
          l.rhyme = lines[j].rhyme;
          break;
        }
      }
    });
  }
  function schemeName(lines) {
    const withText = lines.filter((l) => l.syl.length);
    if (!withText.length) return '';
    const rhymed = withText.filter((l) => l.rhyme).length;
    if (!rhymed) return 'без рифмы';
    const names = [];
    for (let i = 0; i + 3 < withText.length + 3; i += 4) {
      const q = withText.slice(i, i + 4);
      if (q.length < 4) break;
      const map = new Map(); let c = 0;
      const pat = q.map((l) => { if (!l.rhyme) return 'x'; if (!map.has(l.rhyme)) map.set(l.rhyme, 'abcd'[c++]); return map.get(l.rhyme); }).join('');
      names.push(pat === 'abab' ? 'перекрёстная' : pat === 'aabb' ? 'парная' : pat === 'abba' ? 'опоясывающая' : /^xaxa$|^xbxb$|^.a.a$/.test(pat) ? 'рифмуются чётные строки' : 'сложная');
    }
    const uniq = [...new Set(names)];
    return uniq.length ? uniq.join(', ') : 'есть рифмы';
  }

  window.Meter = { parseLine, analyze, METERS, isVowel };
})();
