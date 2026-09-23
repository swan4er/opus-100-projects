/* Команды терминала: маленькая оболочка и подмножество git.
   Каждая команда возвращает список строк; строка — массив сегментов [текст, класс]. */
(function () {
  'use strict';
  const { GitError, fatal, short, plural, lineDiff } = window.MiniGit;

  const seg = (t, c = '') => [t, c];
  const line = (...parts) => parts.map((p) => (Array.isArray(p) ? p : seg(p)));
  const txt = (t, c = '') => [[seg(t, c)]];

  function tokenize(s) {
    const out = [];
    const re = /"((?:[^"\\]|\\.)*)"|«([^»]*)»|'([^']*)'|(>>|>)|([^\s"'>«]+)/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[1] != null) out.push(m[1].replace(/\\(.)/g, '$1'));
      else if (m[2] != null) out.push(m[2]);
      else if (m[3] != null) out.push(m[3]);
      else if (m[4] != null) out.push({ op: m[4] });
      else out.push(m[5]);
    }
    return out;
  }
  const cleanPath = (p) => {
    if (!p || typeof p !== 'string') fatal('укажите имя файла');
    p = p.replace(/^\.\//, '');
    if (p.startsWith('/') || p.split('/').some((x) => x === '..' || x === '')) fatal(`недопустимый путь: ${p}`);
    return p;
  };

  function decorations(repo) {
    const map = new Map();
    const add = (sha, label, cls) => { if (!sha) return; if (!map.has(sha)) map.set(sha, []); map.get(sha).push([label, cls]); };
    const cur = repo.branch();
    if (!cur) add(repo.head.sha, 'HEAD', 'hd');
    for (const [name, sha] of [...repo.heads].sort((a, b) => (a[0] === cur ? -1 : b[0] === cur ? 1 : a[0].localeCompare(b[0])))) {
      add(sha, name === cur ? `HEAD -> ${name}` : name, name === cur ? 'hd' : 'br');
    }
    for (const [name, sha] of repo.tags) add(sha, `tag: ${name}`, 'tag');
    return map;
  }
  function decoSegs(dec, sha) {
    const d = dec.get(sha);
    if (!d) return [];
    const out = [seg(' (', 'dim')];
    d.forEach(([t, c], i) => { if (i) out.push(seg(', ', 'dim')); out.push(seg(t, c)); });
    out.push(seg(')', 'dim'));
    return out;
  }
  const fmtDate = (t) => new Date(t * 1000).toLocaleString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  function diffLines(repo, a, b, label) {
    const out = [];
    const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
    for (const p of paths) {
      const x = a.get(p), y = b.get(p);
      if (x === y) continue;
      out.push(line(seg(`diff --git a/${p} b/${p}`, 'hd')));
      if (x == null) out.push(line(seg('новый файл', 'dim')));
      if (y == null) out.push(line(seg('файл удалён', 'dim')));
      const d = lineDiff(x == null ? '' : label(x), y == null ? '' : label(y));
      d.forEach(([k, t]) => out.push(line(seg(k + t, k === '+' ? 'add' : k === '-' ? 'del' : 'dim'))));
    }
    return out;
  }

  /* ---------- Оболочка ---------- */
  function run(repo, raw) {
    const argv = tokenize(raw.trim());
    if (!argv.length) return [];
    try {
      const [cmd, ...args] = argv;
      if (typeof cmd !== 'string') fatal('синтаксическая ошибка');
      switch (cmd) {
        case 'git': return git(repo, args);
        case 'ls': {
          const files = [...repo.work.keys()].sort();
          if (!files.length) return txt('(папка пуста)', 'dim');
          return files.map((f) => line(seg(f, repo.index.has(f) ? '' : 'untracked')));
        }
        case 'cat': {
          if (!args.length) fatal('cat: укажите файл');
          const out = [];
          for (const a of args) {
            const p = cleanPath(a);
            if (!repo.work.has(p)) fatal(`cat: ${p}: нет такого файла`);
            repo.work.get(p).replace(/\n$/, '').split('\n').forEach((l) => out.push(line(seg(l, /^(<{7}|={7}|>{7})/.test(l) ? 'warn' : ''))));
          }
          return out;
        }
        case 'echo': {
          const opIdx = args.findIndex((a) => typeof a === 'object');
          const words = (opIdx < 0 ? args : args.slice(0, opIdx)).filter((a) => typeof a === 'string');
          const text = words.join(' ');
          if (opIdx < 0) return txt(text);
          const p = cleanPath(args[opIdx + 1]);
          const cur = repo.work.get(p);
          if (args[opIdx].op === '>>' && cur != null) repo.work.set(p, cur + text + '\n');
          else repo.work.set(p, text + '\n');
          return [];
        }
        case 'touch': { const p = cleanPath(args[0]); if (!repo.work.has(p)) repo.work.set(p, ''); return []; }
        case 'rm': {
          const p = cleanPath(args[0]);
          if (!repo.work.has(p)) fatal(`rm: невозможно удалить «${p}»: нет такого файла`);
          repo.work.delete(p); return [];
        }
        case 'pwd': return txt('/проект');
        case 'clear': return { clear: true };
        case 'help': return help();
        default: fatal(`команда не найдена: ${cmd}. Наберите help`);
      }
    } catch (e) {
      if (e instanceof GitError) return e.message.split('\n').map((l) => line(seg(l, 'err')));
      console.warn(e);
      return txt('внутренняя ошибка песочницы: ' + e.message, 'err');
    }
  }

  function help() {
    const rows = [
      ['Файлы', 'ls · cat <файл> · echo "текст" > файл · echo "ещё" >> файл · rm · touch · clear'],
      ['Основное', 'git init · status · add <файл|.> · commit -m "…" · commit -am "…" · log [--oneline] [--all]'],
      ['Ветки', 'git branch [имя] · switch [-c] <ветка> · checkout <ревизия> · merge <ветка> · rebase <ветка>'],
      ['Откаты', 'git reset [--soft|--mixed|--hard] <ревизия> · restore [--staged] <файл> · reflog'],
      ['Внутрь', 'git cat-file -p|-t|-s <объект> · hash-object [-w] <файл> · show · diff [--staged] · tag · gc'],
      ['Ревизии', 'HEAD, HEAD~2, HEAD^2, main, v1.0, 3fa0b1c, HEAD@{1}, HEAD^{tree}, HEAD:src/main.js'],
    ];
    return rows.map(([a, b]) => line(seg(a.padEnd(9, ' '), 'hd'), seg(b)));
  }

  /* ---------- git ---------- */
  function git(repo, args) {
    const sub = args[0];
    const rest = args.slice(1).filter((a) => typeof a === 'string');
    if (!sub) return help();
    if (sub === 'init') {
      const again = repo.inited;
      repo.inited = true;
      return txt(again ? 'Повторная инициализация репозитория Git в /проект/.git/' : 'Инициализирован пустой репозиторий Git в /проект/.git/', 'ok');
    }
    if (!repo.inited) fatal('fatal: здесь нет репозитория git (.git не найден). Начните с git init');
    const handler = GIT[sub];
    if (!handler) fatal(`git: «${sub}» — неизвестная команда. Наберите help`);
    return handler(repo, rest);
  }

  const optVal = (arr, names) => {
    for (let i = 0; i < arr.length; i++) {
      for (const n of names) {
        if (arr[i] === n) { const v = arr[i + 1]; arr.splice(i, 2); return v; }
        if (arr[i].startsWith(n) && n.length === 2 && arr[i].length > 2 && !arr[i].startsWith('--')) { const v = arr[i].slice(2); arr.splice(i, 1); return v; }
      }
    }
    return undefined;
  };
  const flag = (arr, ...names) => { const i = arr.findIndex((a) => names.includes(a)); if (i >= 0) { arr.splice(i, 1); return true; } return false; };

  function switchTo(repo, targetSha, { ref = null, msg }) {
    const cur = repo.snapshot(repo.headSha()), nxt = repo.snapshot(targetSha);
    const st = repo.status();
    const dirty = new Set([...st.staged.map((x) => x[1]), ...st.unstaged.map((x) => x[1])]);
    const clash = [...dirty].filter((p) => cur.get(p) !== nxt.get(p));
    if (clash.length) fatal('error: ваши локальные изменения будут перезаписаны при переключении:\n\t' + clash.join('\n\t') + '\nСначала сделайте коммит или отмените изменения (git restore).');
    for (const p of cur.keys()) if (!nxt.has(p) && !dirty.has(p)) { repo.work.delete(p); repo.index.delete(p); }
    for (const [p, b] of nxt) if (!dirty.has(p)) { repo.work.set(p, repo.text(b)); repo.index.set(p, b); }
    repo.head = ref ? { ref } : { sha: targetSha };
    repo.reflog.unshift({ sha: targetSha, msg });
  }

  function mergeCommitCount(repo, a, b) {
    const x = repo.snapshot(a), y = repo.snapshot(b);
    return [...new Set([...x.keys(), ...y.keys()])].filter((p) => x.get(p) !== y.get(p)).length;
  }
  const filesChanged = (n) => ` ${n} ${plural(n, 'файл изменён', 'файла изменено', 'файлов изменено')}`;

  const GIT = {
    status(repo) {
      const out = [];
      const br = repo.branch();
      out.push(br ? line('На ветке ', seg(br, 'br')) : line('HEAD отделён на ', seg(short(repo.head.sha), 'sha')));
      if (!repo.headSha()) out.push(line(seg('Ещё нет коммитов', 'dim')));
      if (repo.merging) out.push(line(seg(`Идёт слияние с «${repo.merging.name}». Исправьте конфликты и запустите git commit.`, 'warn')));
      const s = repo.status();
      if (s.staged.length) {
        out.push(line(seg('Изменения, которые войдут в коммит:', 'hd')));
        s.staged.forEach(([k, p]) => out.push(line(seg(`\t${(k + ':').padEnd(13)} ${p}`, 'add'))));
      }
      if (s.unstaged.length) {
        out.push(line(seg('Изменения не в индексе (git add, чтобы добавить):', 'hd')));
        s.unstaged.forEach(([k, p]) => out.push(line(seg(`\t${(k + ':').padEnd(13)} ${p}`, 'del'))));
      }
      if (s.untracked.length) {
        out.push(line(seg('Неотслеживаемые файлы:', 'hd')));
        s.untracked.forEach((p) => out.push(line(seg('\t' + p, 'del'))));
      }
      if (!s.staged.length && !s.unstaged.length && !s.untracked.length) out.push(line(seg('нечего коммитить, рабочее дерево чистое', 'dim')));
      return out;
    },

    add(repo, args) {
      if (!args.length) fatal('Ничего не указано, ничего не добавлено. Возможно, вы имели в виду «git add .»?');
      const all = args.some((a) => a === '.' || a === '-A' || a === '--all');
      let paths;
      if (all) paths = [...new Set([...repo.work.keys(), ...repo.index.keys()])];
      else {
        paths = [];
        for (const a of args) {
          const p = cleanPath(a.replace(/\/$/, ''));
          const hits = [...new Set([...repo.work.keys(), ...repo.index.keys()])].filter((x) => x === p || x.startsWith(p + '/'));
          if (!hits.length) fatal(`fatal: путь «${p}» не соответствует ни одному файлу`);
          paths.push(...hits);
        }
      }
      const out = [];
      for (const p of paths.sort()) {
        if (repo.work.has(p)) {
          const before = repo.objects.size;
          const sha = repo.writeBlob(repo.work.get(p));
          const changed = repo.index.get(p) !== sha;
          repo.index.set(p, sha);
          repo.conflicts.delete(p);
          if (changed) out.push(line(seg('→ ', 'dim'), seg(repo.objects.size > before ? 'записан блоб ' : 'блоб уже есть ', 'dim'), seg(short(sha), 'sha'), seg(`  ${p}`, 'dim')));
        } else if (repo.index.has(p)) { repo.index.delete(p); out.push(line(seg(`→ удалён из индекса: ${p}`, 'dim'))); }
      }
      return out;
    },

    rm(repo, args) {
      const cached = flag(args, '--cached');
      const p = cleanPath(args[0]);
      if (!repo.index.has(p)) fatal(`fatal: путь «${p}» не отслеживается`);
      repo.index.delete(p);
      if (!cached) repo.work.delete(p);
      return txt(`rm '${p}'`);
    },

    commit(repo, args) {
      const a = [...args];
      let amAll = false;
      const i = a.findIndex((x) => x === '-am' || x === '-ma');
      if (i >= 0) { a[i] = '-m'; amAll = true; }
      if (flag(a, '-a', '--all')) amAll = true;
      const msg = optVal(a, ['-m', '--message']);
      if (amAll) for (const p of [...repo.index.keys()]) {
        if (repo.work.has(p)) repo.index.set(p, repo.writeBlob(repo.work.get(p)));
        else repo.index.delete(p);
      }
      if (repo.conflicts.size) fatal('error: коммит невозможен: есть неразрешённые конфликты\n\t' + [...repo.conflicts].join('\n\t') + '\nИсправьте файлы и выполните git add.');
      if (!msg) fatal('Нужно сообщение коммита: git commit -m "что сделано"');
      if (!repo.index.size && !repo.headSha()) fatal('нечего коммитить (создайте файлы и выполните git add)');
      const parent = repo.headSha();
      const tree = repo.treeFromIndex();
      if (parent && !repo.merging && tree === repo.obj(parent).commit.tree) {
        const s = repo.status();
        fatal(s.unstaged.length || s.untracked.length ? 'нет изменений в индексе для коммита (сначала git add)' : 'нечего коммитить, рабочее дерево чистое');
      }
      const parents = parent ? [parent] : [];
      if (repo.merging) parents.push(repo.merging.sha);
      const br = repo.branch();
      const sha = repo.writeCommit({ tree, parents, message: msg, lane: repo.laneFor(br) });
      const n = parent ? mergeCommitCount(repo, parent, sha) : repo.index.size;
      repo.setHead(sha, `commit${repo.merging ? ' (merge)' : parent ? '' : ' (initial)'}: ${msg}`);
      repo.merging = null;
      return [
        line(seg('['), seg(br || 'отделённый HEAD', 'br'), seg(parent ? ' ' : ' (корневой коммит) '), seg(short(sha), 'sha'), seg('] ' + msg)),
        line(seg(filesChanged(n), 'dim')),
      ];
    },

    log(repo, args) {
      const a = [...args];
      const oneline = flag(a, '--oneline');
      const all = flag(a, '--all');
      flag(a, '--graph', '--decorate');
      let n = Infinity;
      const nv = optVal(a, ['-n']);
      if (nv) n = +nv;
      const numFlag = a.findIndex((x) => /^-\d+$/.test(x));
      if (numFlag >= 0) { n = +a[numFlag].slice(1); a.splice(numFlag, 1); }
      let starts;
      if (a.length) starts = [repo.resolveCommit(a[0])];
      else if (all) starts = [...repo.heads.values(), ...repo.tags.values(), repo.headSha()].filter(Boolean);
      else { const h = repo.headSha(); if (!h) fatal(`fatal: в текущей ветке «${repo.branch()}» ещё нет коммитов`); starts = [h]; }
      const set = new Set();
      starts.forEach((s) => repo.ancestors(s).forEach((x) => set.add(x)));
      const list = [...set].map((s) => repo.obj(s)).sort((x, y) => y.seq - x.seq).slice(0, n);
      const dec = decorations(repo);
      const out = [];
      for (const o of list) {
        const c = o.commit;
        if (oneline) { out.push(line(seg(short(o.sha), 'sha'), ...decoSegs(dec, o.sha), seg(' ' + c.message))); continue; }
        out.push(line(seg('commit ' + o.sha, 'sha'), ...decoSegs(dec, o.sha)));
        if (c.parents.length > 1) out.push(line('Merge: ' + c.parents.map(short).join(' ')));
        out.push(line('Автор: Вы <you@example.com>'));
        out.push(line('Дата:  ' + fmtDate(c.authorTime)));
        out.push(line(''));
        out.push(line('    ' + c.message));
        out.push(line(''));
      }
      if (out.length && out[out.length - 1].length === 1 && out[out.length - 1][0][0] === '') out.pop();
      return out;
    },

    branch(repo, args) {
      const a = [...args];
      if (flag(a, '-d', '--delete')) return delBranch(repo, a[0], false);
      if (flag(a, '-D')) return delBranch(repo, a[0], true);
      if (!a.length) {
        const cur = repo.branch();
        const names = [...repo.heads.keys()].sort();
        const out = [];
        if (!cur) out.push(line(seg(`* (HEAD отделён на ${short(repo.head.sha)})`, 'hd')));
        names.forEach((nm) => out.push(nm === cur ? line(seg('* ', 'hd'), seg(nm, 'br')) : line('  ' + nm)));
        if (!names.length && cur) out.push(line(seg(`(веток ещё нет: у «${cur}» нет коммитов)`, 'dim')));
        return out;
      }
      const name = a[0];
      if (!/^[\p{L}\p{N}._/-]+$/u.test(name) || name.startsWith('-') || name.endsWith('/')) fatal(`fatal: «${name}» — недопустимое имя ветки`);
      if (repo.heads.has(name)) fatal(`fatal: ветка «${name}» уже существует`);
      const sha = repo.resolveCommit(a[1] || 'HEAD');
      repo.heads.set(name, sha);
      return txt(`создана ветка «${name}» на ${short(sha)} — это просто файл refs/heads/${name} с 41 байтом`, 'dim');
    },

    switch(repo, args) {
      const a = [...args];
      const create = optVal(a, ['-c', '--create']);
      if (create) return createAndSwitch(repo, create, a[0]);
      if (flag(a, '--detach')) {
        const sha = repo.resolveCommit(a[0] || 'HEAD');
        switchTo(repo, sha, { msg: `checkout: moving to ${a[0] || 'HEAD'}` });
        return txt(`HEAD теперь на ${short(sha)} ${repo.obj(sha).commit.message}`);
      }
      const name = a[0];
      if (!name) fatal('fatal: укажите ветку');
      if (!repo.heads.has(name)) fatal(`fatal: неверная ссылка: ${name}${/^[0-9a-f]{4,}$/.test(name) || repo.tags.has(name) ? '\n(для перехода на коммит: git switch --detach ' + name + ' или git checkout ' + name + ')' : ''}`);
      if (repo.branch() === name) return txt(`Уже на «${name}»`);
      switchTo(repo, repo.heads.get(name), { ref: name, msg: `checkout: moving from ${repo.branch() || short(repo.head.sha)} to ${name}` });
      return txt(`Переключено на ветку «${name}»`, 'ok');
    },

    checkout(repo, args) {
      const a = [...args];
      const b = optVal(a, ['-b']);
      if (b) return createAndSwitch(repo, b, a[0]);
      const dd = a.indexOf('--');
      if (dd >= 0) return GIT.restore(repo, a.slice(dd + 1));
      const name = a[0];
      if (!name) fatal('fatal: укажите ветку, ревизию или файл');
      if (repo.heads.has(name)) return GIT.switch(repo, [name]);
      if (!repo.work.has(name) && !repo.index.has(name) || /^(HEAD|@)/.test(name) || repo.tags.has(name)) {
        const sha = repo.resolveCommit(name);
        switchTo(repo, sha, { msg: `checkout: moving to ${name}` });
        return [
          line(seg(`Переход на «${name}».`, 'ok')),
          line(seg('Вы в состоянии «отделённого HEAD»: HEAD указывает прямо на коммит, а не на ветку.', 'warn')),
          line(seg('Коммиты отсюда не попадут ни в одну ветку — сохраните их: git switch -c <имя>', 'dim')),
          line('HEAD теперь на ', seg(short(sha), 'sha'), ' ' + repo.obj(sha).commit.message),
        ];
      }
      return GIT.restore(repo, [name]);
    },

    restore(repo, args) {
      const a = [...args];
      const staged = flag(a, '--staged', '-S');
      if (!a.length) fatal('fatal: укажите файл');
      const headSnap = repo.snapshot(repo.headSha());
      for (const x of a) {
        const p = cleanPath(x);
        if (staged) { if (headSnap.has(p)) repo.index.set(p, headSnap.get(p)); else repo.index.delete(p); }
        else {
          if (!repo.index.has(p)) fatal(`error: путь «${p}» не отслеживается git`);
          repo.work.set(p, repo.text(repo.index.get(p)));
          repo.conflicts.delete(p);
        }
      }
      return [];
    },

    merge(repo, args) {
      const a = [...args];
      if (flag(a, '--abort')) {
        if (!repo.merging) fatal('fatal: слияние не идёт (MERGE_HEAD отсутствует)');
        repo.loadSnapshot(repo.headSha()); repo.merging = null;
        return txt('Слияние отменено: рабочая папка и индекс возвращены к HEAD.', 'ok');
      }
      const msg = optVal(a, ['-m']);
      const name = a[0];
      if (!name) fatal('fatal: укажите, что сливать');
      if (repo.merging) fatal('fatal: слияние уже идёт — закончите его (git commit) или отмените (git merge --abort)');
      const ours = repo.headSha();
      if (!ours) fatal('fatal: нечего сливать — в текущей ветке нет коммитов');
      const theirs = repo.resolveCommit(name);
      if (!repo.isClean()) fatal('error: сначала сделайте коммит или отмените изменения — слияние перезапишет их');
      if (repo.isAncestor(theirs, ours)) return txt('Уже актуально.');
      if (repo.isAncestor(ours, theirs)) {
        const n = mergeCommitCount(repo, ours, theirs);
        repo.loadSnapshot(theirs);
        repo.setHead(theirs, `merge ${name}: Fast-forward`);
        return [line(`Обновление ${short(ours)}..${short(theirs)}`), line(seg('Перемотка вперёд: новых коммитов не нужно — ветка просто сдвинулась', 'ok')), line(seg(filesChanged(n), 'dim'))];
      }
      const base = repo.mergeBase(ours, theirs);
      const B = repo.snapshot(base), O = repo.snapshot(ours), T = repo.snapshot(theirs);
      const out = [];
      const conflicts = [];
      const paths = [...new Set([...B.keys(), ...O.keys(), ...T.keys()])].sort();
      for (const p of paths) {
        const b = B.get(p), o = O.get(p), t = T.get(p);
        let res;
        if (o === t) res = o;
        else if (o === b) res = t;
        else if (t === b) res = o;
        else {
          conflicts.push(p);
          const ot = o ? repo.text(o) : '', tt = t ? repo.text(t) : '';
          const nl = (s) => (s && !s.endsWith('\n') ? s + '\n' : s);
          repo.work.set(p, `<<<<<<< HEAD\n${nl(ot)}=======\n${nl(tt)}>>>>>>> ${name}\n`);
          if (o) repo.index.set(p, o); else repo.index.delete(p);
          repo.conflicts.add(p);
          out.push(line(`Автослияние ${p}`));
          out.push(line(seg(`КОНФЛИКТ (содержимое): конфликт слияния в ${p}`, 'err')));
          continue;
        }
        if (res == null) { repo.work.delete(p); repo.index.delete(p); }
        else { repo.work.set(p, repo.text(res)); repo.index.set(p, res); }
      }
      if (conflicts.length) {
        repo.merging = { sha: theirs, name, msg: msg || `Merge branch '${name}'` };
        out.push(line(seg('Автоматическое слияние не удалось. Исправьте файлы (cat, echo), затем git add и git commit.', 'warn')));
        return out;
      }
      const tree = repo.treeFromIndex();
      const m = msg || `Merge branch '${name}'`;
      const sha = repo.writeCommit({ tree, parents: [ours, theirs], message: m, lane: repo.laneFor(repo.branch()) });
      repo.setHead(sha, `merge ${name}: Merge made by the 'ort' strategy.`);
      return [
        line(seg('Слияние выполнено стратегией «ort»: ', 'ok'), seg('коммит ', ''), seg(short(sha), 'sha'), seg(' с двумя родителями')),
        line(seg(`общий предок ${short(base)} · ` + filesChanged(mergeCommitCount(repo, ours, sha)).trim(), 'dim')),
      ];
    },

    rebase(repo, args) {
      const up = args[0];
      if (!up) fatal('fatal: укажите ветку, на которую переносить: git rebase main');
      const br = repo.branch();
      if (!br) fatal('fatal: rebase в песочнице работает только на ветке');
      if (!repo.isClean()) fatal('error: нельзя делать rebase: есть незакоммиченные изменения');
      const head = repo.headSha();
      const upSha = repo.resolveCommit(up);
      if (repo.isAncestor(upSha, head)) return txt(`Текущая ветка ${br} уже актуальна.`);
      if (repo.isAncestor(head, upSha)) {
        repo.loadSnapshot(upSha); repo.setHead(upSha, `rebase (finish): refs/heads/${br} onto ${upSha}`);
        return txt(`Перемотка вперёд: ${br} теперь на ${short(upSha)}.`, 'ok');
      }
      const upAnc = repo.ancestors(upSha);
      const todo = [...repo.ancestors(head)].filter((s) => !upAnc.has(s) && repo.parents(s).length === 1)
        .map((s) => repo.obj(s)).sort((x, y) => x.seq - y.seq);
      let cur = upSha;
      const snap = repo.snapshot(upSha);
      const plan = [];
      for (const o of todo) {
        const ps = repo.snapshot(o.commit.parents[0]), cs = repo.snapshot(o.sha);
        for (const p of new Set([...ps.keys(), ...cs.keys()])) {
          const was = ps.get(p), now = cs.get(p);
          if (was === now) continue;
          const there = snap.get(p);
          if (there === was) { if (now == null) snap.delete(p); else snap.set(p, now); }
          else if (there === now) continue;
          else fatal(`error: не удалось применить ${short(o.sha)} «${o.commit.message}»: конфликт в ${p}.\nВ песочнице rebase с конфликтами не поддерживается — попробуйте git merge ${up}.`);
        }
        plan.push([o, new Map(snap)]);
      }
      const out = [];
      const saveIdx = repo.index;
      for (const [o, s] of plan) {
        repo.index = new Map(s);
        const tree = repo.treeFromIndex();
        if (tree === repo.obj(cur).commit.tree) { out.push(line(seg(`пропущен ${short(o.sha)} — изменения уже есть в ${up}`, 'dim'))); continue; }
        const sha = repo.writeCommit({ tree, parents: [cur], message: o.commit.message, authorTime: o.commit.authorTime, commitTime: repo.tick(), lane: repo.laneFor(br) });
        out.push(line(seg('  ' + short(o.sha), 'sha dead'), seg('  →  '), seg(short(sha), 'sha'), seg('  ' + o.commit.message, 'dim')));
        cur = sha;
      }
      repo.index = saveIdx;
      repo.setHead(cur, `rebase (finish): refs/heads/${br} onto ${upSha}`);
      repo.loadSnapshot(cur);
      out.unshift(line(seg(`Ветка «${br}» перенесена на ${up}. Коммиты скопированы — у копий новые SHA-1:`, 'ok')));
      out.push(line(seg('Старые коммиты стали недостижимыми: на графе они полупрозрачные.', 'dim')));
      return out;
    },

    reset(repo, args) {
      const a = [...args];
      let mode = 'mixed';
      if (flag(a, '--soft')) mode = 'soft';
      if (flag(a, '--hard')) mode = 'hard';
      if (flag(a, '--mixed')) mode = 'mixed';
      const target = a[0] || 'HEAD';
      if (a[0] && mode === 'mixed' && (repo.index.has(a[0]) || repo.work.has(a[0])) && !repo.heads.has(a[0])) return GIT.restore(repo, ['--staged', a[0]]);
      const sha = repo.resolveCommit(target);
      repo.setHead(sha, `reset: moving to ${target}`);
      repo.merging = null;
      if (mode === 'soft') return txt('Ветка передвинута. Индекс и рабочая папка не тронуты — изменения ждут нового коммита.', 'dim');
      if (mode === 'hard') { repo.loadSnapshot(sha); return [line('HEAD теперь на ', seg(short(sha), 'sha'), ' ' + repo.obj(sha).commit.message)]; }
      repo.loadSnapshot(sha, { work: false });
      const s = repo.status();
      if (!s.unstaged.length) return [];
      return [line(seg('Изменения вне индекса после сброса:', 'hd')), ...s.unstaged.map(([k, p]) => line(seg(`M\t${p}`, 'del')))];
    },

    tag(repo, args) {
      const a = [...args];
      if (flag(a, '-d', '--delete')) {
        const nm = a[0];
        if (!repo.tags.has(nm)) fatal(`error: метка «${nm}» не найдена`);
        const was = repo.tags.get(nm); repo.tags.delete(nm);
        return txt(`Метка «${nm}» удалена (была ${short(was)})`);
      }
      if (!a.length) return [...repo.tags.keys()].sort().map((t) => line(seg(t, 'tag')));
      const nm = a[0];
      if (repo.tags.has(nm)) fatal(`fatal: метка «${nm}» уже существует`);
      const sha = repo.resolveCommit(a[1] || 'HEAD');
      repo.tags.set(nm, sha);
      return txt(`метка «${nm}» → ${short(sha)}`, 'dim');
    },

    'cat-file'(repo, args) {
      const a = [...args];
      const p = flag(a, '-p'), t = flag(a, '-t'), s = flag(a, '-s');
      if (!a[0]) fatal('использование: git cat-file (-p | -t | -s) <объект>');
      const sha = repo.resolve(a[0]);
      const o = repo.obj(sha);
      if (t) return txt(o.type);
      if (s) return txt(String(o.size));
      if (!p) fatal('укажите -p, -t или -s');
      return repo.catFile(sha).split('\n').map((l) => {
        const m = l.match(/^(tree|parent) ([0-9a-f]{40})$/);
        if (m) return line(seg(m[1] + ' ', 'hd'), seg(m[2], 'sha'));
        const e = l.match(/^(\d{6}) (blob|tree) ([0-9a-f]{40})\t(.*)$/);
        if (e) return line(seg(`${e[1]} ${e[2]} `, 'dim'), seg(e[3], 'sha'), seg('\t' + e[4]));
        const au = l.match(/^(author|committer) (.*)$/);
        if (au) return line(seg(au[1] + ' ', 'hd'), seg(au[2], 'dim'));
        return line(l);
      });
    },

    'hash-object'(repo, args) {
      const a = [...args];
      const w = flag(a, '-w');
      const p = cleanPath(a[0]);
      if (!repo.work.has(p)) fatal(`fatal: не удалось открыть «${p}»`);
      const sha = w ? repo.writeBlob(repo.work.get(p)) : repo.hashBlob(repo.work.get(p));
      return txt(sha, 'sha');
    },

    show(repo, args) {
      const sha = repo.resolveCommit(args[0] || 'HEAD');
      const c = repo.obj(sha).commit;
      const dec = decorations(repo);
      const out = [line(seg('commit ' + sha, 'sha'), ...decoSegs(dec, sha)), line('Автор: Вы <you@example.com>'), line('Дата:  ' + fmtDate(c.authorTime)), line(''), line('    ' + c.message), line('')];
      const par = c.parents[0] ? repo.snapshot(c.parents[0]) : new Map();
      out.push(...diffLines(repo, par, repo.snapshot(sha), (b) => repo.text(b)));
      return out;
    },

    diff(repo, args) {
      const a = [...args];
      const staged = flag(a, '--staged', '--cached');
      let out;
      if (staged) out = diffLines(repo, repo.snapshot(repo.headSha()), repo.index, (b) => repo.text(b));
      else {
        const workMap = new Map();
        for (const p of repo.index.keys()) if (repo.work.has(p)) workMap.set(p, 'w:' + p);
        const idx = new Map([...repo.index].filter(([p, s]) => !repo.work.has(p) || repo.hashBlob(repo.work.get(p)) !== s));
        const wm = new Map([...workMap].filter(([p]) => idx.has(p)));
        out = diffLines(repo, idx, wm, (v) => (v.startsWith('w:') ? repo.work.get(v.slice(2)) : repo.text(v)));
      }
      return out.length ? out : txt(staged ? '(в индексе нет изменений относительно HEAD)' : '(рабочая папка совпадает с индексом)', 'dim');
    },

    reflog(repo) {
      if (!repo.reflog.length) return txt('(reflog пуст)', 'dim');
      return repo.reflog.map((e, i) => line(seg(short(e.sha), 'sha'), seg(` HEAD@{${i}}: `, 'hd'), seg(e.msg)));
    },

    gc(repo) {
      const keep = repo.reachable();
      for (const s of repo.index.values()) keep.add(s);
      const counts = { commit: 0, tree: 0, blob: 0 };
      for (const [sha, o] of [...repo.objects]) if (!keep.has(sha)) { counts[o.type]++; repo.objects.delete(sha); }
      const total = counts.commit + counts.tree + counts.blob;
      repo.reflog = repo.reflog.filter((e) => repo.objects.has(e.sha));
      if (!total) return txt('Недостижимых объектов нет — удалять нечего.', 'dim');
      return [
        line(seg(`Удалено недостижимых объектов: ${total}`, 'ok'), seg(` (коммитов: ${counts.commit}, деревьев: ${counts.tree}, блобов: ${counts.blob})`, 'dim')),
        line(seg('В настоящем Git их ещё 90 дней защищал бы reflog; здесь чистим сразу, чтобы было видно.', 'dim')),
      ];
    },
  };

  function createAndSwitch(repo, name, start) {
    if (repo.heads.has(name)) fatal(`fatal: ветка «${name}» уже существует`);
    if (!/^[\p{L}\p{N}._/-]+$/u.test(name) || name.startsWith('-')) fatal(`fatal: «${name}» — недопустимое имя ветки`);
    const h = repo.headSha();
    if (!h) { repo.head = { ref: name }; return txt(`Переключено на новую ветку «${name}»`, 'ok'); }
    const sha = start ? repo.resolveCommit(start) : h;
    repo.heads.set(name, sha);
    if (sha !== h) switchTo(repo, sha, { ref: name, msg: `checkout: moving to ${name}` });
    else { repo.head = { ref: name }; repo.reflog.unshift({ sha, msg: `checkout: moving to ${name}` }); }
    return txt(`Переключено на новую ветку «${name}»`, 'ok');
  }
  function delBranch(repo, name, force) {
    if (!name) fatal('fatal: укажите имя ветки');
    if (!repo.heads.has(name)) fatal(`error: ветка «${name}» не найдена`);
    if (repo.branch() === name) fatal(`error: нельзя удалить ветку «${name}»: вы на ней`);
    const sha = repo.heads.get(name);
    const h = repo.headSha();
    if (!force && h && !repo.isAncestor(sha, h)) fatal(`error: ветка «${name}» не слита. Если уверены — git branch -D ${name}`);
    repo.heads.delete(name);
    return txt(`Ветка ${name} удалена (была ${short(sha)}).`);
  }

  const SUBS = ['init', 'status', 'add', 'commit', 'log', 'branch', 'switch', 'checkout', 'restore', 'merge', 'rebase', 'reset', 'tag', 'cat-file', 'hash-object', 'show', 'diff', 'reflog', 'rm', 'gc'];
  function complete(repo, input) {
    const m = input.match(/^(.*?)(\S*)$/);
    const head = m[1], word = m[2];
    const toks = tokenize(head);
    let pool;
    if (!toks.length) pool = ['git', 'ls', 'cat', 'echo', 'rm', 'touch', 'clear', 'help'];
    else if (toks[0] === 'git' && toks.length === 1) pool = SUBS;
    else pool = [...repo.heads.keys(), ...repo.tags.keys(), ...repo.work.keys(), 'HEAD'];
    const hits = [...new Set(pool)].filter((x) => x.startsWith(word));
    if (!hits.length) return null;
    if (hits.length === 1) return head + hits[0] + ' ';
    let pre = hits[0];
    for (const h of hits) while (!h.startsWith(pre)) pre = pre.slice(0, -1);
    return pre.length > word.length ? head + pre : { options: hits };
  }

  window.GitShell = { run, complete, tokenize, decorations };
})();
