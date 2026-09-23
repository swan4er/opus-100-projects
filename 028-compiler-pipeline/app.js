/* Конвейер компилятора.
   Язык «Ёж» проходит весь путь: лексер → парсер Пратта → синтаксическое дерево →
   байткод → стековая машина с черепашьей графикой. Все этапы связаны между собой. */
(() => {
  'use strict';

  // ———————————————————— Утилиты ————————————————————
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = v => {
    if (typeof v === 'boolean') return v ? 'истина' : 'ложь';
    if (typeof v === 'string') return `«${v}»`;
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 1000) / 1000);
  };
  const group = n => n.toLocaleString('ru-RU');
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
  function lev(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ———————————————————— Язык «Ёж» ————————————————————
  const KEYWORDS = new Set(['пусть', 'если', 'иначе', 'пока', 'повтори', 'функция', 'вернуть', 'и', 'или', 'не', 'истина', 'ложь']);
  const BUILTINS = {
    'вперёд': { n: 1, doc: 'пройти вперёд, оставляя след' },
    'назад': { n: 1, doc: 'отступить назад' },
    'налево': { n: 1, doc: 'повернуть налево на угол в градусах' },
    'направо': { n: 1, doc: 'повернуть направо на угол в градусах' },
    'поднять': { n: 0, doc: 'поднять перо — идти без следа' },
    'опустить': { n: 0, doc: 'опустить перо — снова рисовать' },
    'цвет': { n: 1, doc: 'оттенок пера по кругу 0–360°' },
    'толщина': { n: 1, doc: 'толщина линии' },
    'точка': { n: 1, doc: 'поставить точку заданного радиуса' },
    'прыжок': { n: 2, doc: 'перенестись в точку (x, y) без следа' },
    'курс': { n: 1, doc: 'повернуться точно на угол: 0° — вправо, 90° — вверх' },
    'домой': { n: 0, doc: 'вернуться в центр лицом вверх' },
    'печать': { n: 1, doc: 'вывести значение в окно «Печать»' },
    'корень': { n: 1, doc: 'квадратный корень' },
    'синус': { n: 1, doc: 'синус угла в градусах' },
    'косинус': { n: 1, doc: 'косинус угла в градусах' },
    'модуль': { n: 1, doc: 'абсолютная величина' },
    'округлить': { n: 1, doc: 'округлить до целого' },
    'случайное': { n: 2, doc: 'случайное число от a до b (одно и то же при каждом запуске)' },
  };
  const OPS = { '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD', '==': 'EQ', '!=': 'NE', '<': 'LT', '>': 'GT', '<=': 'LE', '>=': 'GE' };
  const OP_NAMES = { '+': 'сложение', '-': 'вычитание', '*': 'умножение', '/': 'деление', '%': 'остаток', '==': 'равно', '!=': 'не равно', '<': 'меньше', '>': 'больше', '<=': 'не больше', '>=': 'не меньше', 'и': 'логическое и', 'или': 'логическое или' };
  const OPCODES = {
    PUSH: ['o-stack', 'положить константу на вершину стека'],
    DUP: ['o-stack', 'продублировать вершину стека'],
    POP: ['o-stack', 'снять значение со стека и забыть'],
    LOAD: ['o-var', 'прочитать глобальную переменную на стек'],
    STORE: ['o-var', 'снять вершину стека в глобальную переменную'],
    LOADL: ['o-var', 'прочитать локальную переменную текущего вызова'],
    STOREL: ['o-var', 'записать вершину стека в локальную переменную'],
    ADD: ['o-math', 'сложить два верхних значения'], SUB: ['o-math', 'вычесть верхнее из предыдущего'],
    MUL: ['o-math', 'перемножить'], DIV: ['o-math', 'разделить'], MOD: ['o-math', 'остаток от деления'],
    NEG: ['o-math', 'сменить знак'], NOT: ['o-math', 'логическое отрицание'],
    EQ: ['o-math', 'равны ли два значения'], NE: ['o-math', 'различаются ли два значения'],
    LT: ['o-math', 'меньше ли'], GT: ['o-math', 'больше ли'], LE: ['o-math', 'не больше ли'], GE: ['o-math', 'не меньше ли'],
    JMP: ['o-jump', 'перейти по адресу'],
    JZ: ['o-jump', 'снять условие; если ложь — перейти'],
    JNZ: ['o-jump', 'снять условие; если истина — перейти'],
    CALL: ['o-call', 'вызвать функцию: аргументы уходят в новый кадр'],
    RET: ['o-call', 'вернуться из функции со значением на стеке'],
    SYS: ['o-sys', 'встроенная команда машины'],
    HALT: ['o-call', 'остановить машину'],
  };

  class CompileError extends Error {
    constructor(msg, start, end, stage, partial) { super(msg); this.start = start; this.end = end; this.stage = stage; this.partial = partial; }
  }
  const tokName = t => (t.type === 'eof' ? 'конец программы' : `«${t.text}»`);

  // ——— Лексер ———
  function lex(src) {
    const tokens = [], comments = [];
    const n = src.length;
    const idStart = c => /[A-Za-zА-Яа-яЁё_]/.test(c), idPart = c => /[A-Za-zА-Яа-яЁё_0-9]/.test(c), digit = c => c >= '0' && c <= '9';
    let i = 0;
    const fail = (msg, s, e) => { throw new CompileError(msg, s, e, 'lex', { tokens, comments }); };
    while (i < n) {
      const c = src[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { const s = i; while (i < n && src[i] !== '\n') i++; comments.push({ start: s, end: i }); continue; }
      const s = i;
      if (digit(c) || (c === '.' && digit(src[i + 1] || ''))) {
        while (i < n && digit(src[i])) i++;
        if (src[i] === '.' && digit(src[i + 1] || '')) { i++; while (i < n && digit(src[i])) i++; }
        if (i < n && idStart(src[i])) fail(`Число «${src.slice(s, i)}» слиплось с буквами. Поставьте пробел или знак.`, s, i + 1);
        tokens.push({ type: 'num', value: parseFloat(src.slice(s, i)), text: src.slice(s, i), start: s, end: i });
        continue;
      }
      if (idStart(c)) {
        while (i < n && idPart(src[i])) i++;
        const text = src.slice(s, i);
        tokens.push({ type: KEYWORDS.has(text) ? 'kw' : 'id', value: text, text, start: s, end: i });
        continue;
      }
      if (c === '«' || c === '"') {
        const close = c === '«' ? '»' : '"';
        i++;
        while (i < n && src[i] !== close && src[i] !== '\n') i++;
        if (src[i] !== close) fail(`Строка не закрыта: не хватает ${close === '»' ? '«»»' : '«"»'}.`, s, i);
        i++;
        tokens.push({ type: 'str', value: src.slice(s + 1, i - 1), text: src.slice(s, i), start: s, end: i });
        continue;
      }
      const two = src.substr(i, 2);
      if (two === '==' || two === '!=' || two === '<=' || two === '>=') { i += 2; tokens.push({ type: 'op', value: two, text: two, start: s, end: i }); continue; }
      if ('+-*/%<>='.includes(c)) { i++; tokens.push({ type: 'op', value: c, text: c, start: s, end: i }); continue; }
      if ('(){},;'.includes(c)) { i++; tokens.push({ type: 'punc', value: c, text: c, start: s, end: i }); continue; }
      fail(`Непонятный символ «${c}». В «Еже» его нет.`, s, s + 1);
    }
    tokens.push({ type: 'eof', value: '', text: '', start: n, end: n });
    return { tokens, comments };
  }

  // ——— Парсер: рекурсивный спуск для команд, Пратт для выражений ———
  const BP = { 'или': 1, 'и': 2, '==': 3, '!=': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  function parse(tokens) {
    let p = 0, nid = 0;
    const peek = (k = 0) => tokens[Math.min(p + k, tokens.length - 1)];
    const mk = (type, start, end, props) => Object.assign({ type, id: nid++, start, end }, props);
    const fail = (msg, t) => { throw new CompileError(msg, t.start, Math.max(t.end, t.start + 1), 'parse'); };
    const isP = v => peek().type === 'punc' && peek().value === v;
    const isKw = v => peek().type === 'kw' && peek().value === v;
    function expect(type, value, what) {
      const t = peek();
      if (t.type === type && (value === undefined || t.value === value)) { p++; return t; }
      if (value === '{' && t.type === 'op' && t.value === '=') fail('В условии нужно «==»: одиночное «=» — это присваивание.', t);
      fail(`Ожидалось ${what}, а встретилось ${tokName(t)}.`, t);
    }
    const semi = () => expect('punc', ';', '«;» в конце команды');

    function program() {
      const body = [];
      while (peek().type !== 'eof') body.push(statement());
      return mk('Program', 0, tokens[tokens.length - 1].end, { body });
    }
    function block() {
      const open = expect('punc', '{', '«{» — начало блока');
      const body = [];
      while (!isP('}')) {
        if (peek().type === 'eof') fail('Блок не закрыт: не хватает «}».', open);
        body.push(statement());
      }
      const close = expect('punc', '}', '«}»');
      return mk('Block', open.start, close.end, { body });
    }
    function statement() {
      const t = peek();
      if (t.type === 'kw') {
        if (t.value === 'пусть') {
          p++;
          const name = expect('id', undefined, 'имя переменной после «пусть»');
          expect('op', '=', '«=» после имени');
          const init = expr(0);
          return mk('Let', t.start, semi().end, { name: name.value, nameTok: name, init });
        }
        if (t.value === 'функция') {
          p++;
          const name = expect('id', undefined, 'имя функции');
          expect('punc', '(', '«(» перед параметрами');
          const params = [];
          if (!isP(')')) {
            for (;;) {
              params.push(expect('id', undefined, 'имя параметра').value);
              if (!isP(',')) break;
              p++;
            }
          }
          expect('punc', ')', '«)» после параметров');
          const body = block();
          return mk('Func', t.start, body.end, { name: name.value, nameTok: name, params, body });
        }
        if (t.value === 'если') {
          p++;
          const test = expr(0);
          const cons = block();
          let alt = null;
          if (isKw('иначе')) { p++; alt = isKw('если') ? statement() : block(); }
          return mk('If', t.start, (alt || cons).end, { test, cons, alt });
        }
        if (t.value === 'пока') { p++; const test = expr(0); const body = block(); return mk('While', t.start, body.end, { test, body }); }
        if (t.value === 'повтори') { p++; const count = expr(0); const body = block(); return mk('Repeat', t.start, body.end, { count, body }); }
        if (t.value === 'вернуть') {
          p++;
          const arg = isP(';') ? null : expr(0);
          return mk('Return', t.start, semi().end, { arg });
        }
        if (t.value === 'иначе') fail('«иначе» без «если» перед ним.', t);
      }
      if (isP('{')) return block();
      if (t.type === 'id' && peek(1).type === 'op' && peek(1).value === '=') {
        p += 2;
        const value = expr(0);
        return mk('Assign', t.start, semi().end, { name: t.value, nameTok: t, value });
      }
      const e = expr(0);
      return mk('ExprStmt', e.start, semi().end, { expr: e });
    }
    function expr(minBp) {
      let left = prefix();
      for (;;) {
        const t = peek();
        const bp = (t.type === 'op' || t.type === 'kw') ? BP[t.value] : undefined;
        if (bp === undefined || bp <= minBp) break;
        p++;
        const right = expr(bp);
        left = mk('Binary', left.start, right.end, { op: t.value, left, right });
      }
      return left;
    }
    function prefix() {
      const t = peek();
      if (t.type === 'num') { p++; return mk('Num', t.start, t.end, { value: t.value }); }
      if (t.type === 'str') { p++; return mk('Str', t.start, t.end, { value: t.value }); }
      if (t.type === 'kw' && (t.value === 'истина' || t.value === 'ложь')) { p++; return mk('Bool', t.start, t.end, { value: t.value === 'истина' }); }
      if (t.type === 'op' && t.value === '-') { p++; const arg = expr(7); return mk('Unary', t.start, arg.end, { op: '-', arg }); }
      if (t.type === 'kw' && t.value === 'не') { p++; const arg = expr(7); return mk('Unary', t.start, arg.end, { op: 'не', arg }); }
      if (t.type === 'punc' && t.value === '(') {
        p++;
        const e = expr(0);
        expect('punc', ')', '«)»');
        return e;
      }
      if (t.type === 'id') {
        p++;
        if (isP('(')) {
          p++;
          const args = [];
          if (!isP(')')) {
            for (;;) { args.push(expr(0)); if (!isP(',')) break; p++; }
          }
          const c = expect('punc', ')', '«)» после аргументов');
          return mk('Call', t.start, c.end, { name: t.value, nameTok: t, args });
        }
        return mk('Name', t.start, t.end, { name: t.value });
      }
      if (t.type === 'op' && t.value === '=') fail('Одиночное «=» — это присваивание. Для сравнения нужно «==».', t);
      fail(`Ожидалось выражение, а встретилось ${tokName(t)}.`, t);
    }
    const ast = program();
    let pre = 0;
    (function link(n, parent, depth) {
      n.parent = parent; n.depth = depth; n.pre = pre++;
      n.kids = kidsOf(n);
      n.kids.forEach(k => link(k, n, depth + 1));
      n.last = pre - 1;
    })(ast, null, 0);
    return ast;
  }
  function kidsOf(n) {
    switch (n.type) {
      case 'Program': case 'Block': return n.body;
      case 'Let': return [n.init];
      case 'Assign': return [n.value];
      case 'Func': return [n.body];
      case 'If': return n.alt ? [n.test, n.cons, n.alt] : [n.test, n.cons];
      case 'While': return [n.test, n.body];
      case 'Repeat': return [n.count, n.body];
      case 'Return': return n.arg ? [n.arg] : [];
      case 'ExprStmt': return [n.expr];
      case 'Binary': return [n.left, n.right];
      case 'Unary': return [n.arg];
      case 'Call': return n.args;
      default: return [];
    }
  }

  // ——— Генератор байткода ———
  function generate(ast) {
    const code = [], globals = new Map(), funcs = new Map(), declared = new Set();
    const sections = [{ title: 'главная программа', pc: 0 }];
    const tokErr = (msg, n) => new CompileError(msg, n.start, n.end, 'gen');
    for (const st of ast.body) {
      if (st.type !== 'Func') continue;
      const at = { start: st.nameTok.start, end: st.nameTok.end };
      if (BUILTINS[st.name]) throw tokErr(`«${st.name}» — встроенная команда машины. Назовите функцию по-другому.`, at);
      if (funcs.has(st.name)) throw tokErr(`Функция «${st.name}» объявлена дважды.`, at);
      funcs.set(st.name, { name: st.name, node: st, params: st.params, addr: -1, nlocals: st.params.length });
    }
    (function collect(n, inFunc) {
      if (n.type === 'Func') {
        if (n.parent && n.parent.type !== 'Program') throw tokErr('Функции объявляются только на верхнем уровне программы.', n.nameTok);
        n.kids.forEach(k => collect(k, true));
        return;
      }
      if (n.type === 'Let' && !inFunc) declared.add(n.name);
      n.kids.forEach(k => collect(k, inFunc));
    })(ast, false);

    let fn = null, locals = null;
    const slot = name => (locals && locals.has(name) ? locals.get(name) : -1);
    const gIdx = name => { if (!globals.has(name)) globals.set(name, globals.size); return globals.get(name); };
    const emit = (op, arg, node, extra) => {
      const ins = Object.assign({ op, arg, node, pc: code.length, span: [node.start, node.end] }, extra);
      code.push(ins);
      return ins;
    };
    function pool() {
      return [...declared, ...(locals ? [...locals.keys()].filter(k => k[0] !== '#') : [])];
    }
    function undeclared(name, at) {
      const cand = pool(), s = suggest(name, cand);
      return tokErr(s ? `Переменная «${name}» не объявлена. Может быть, «${s}»?` : `Переменная «${name}» не объявлена. Добавьте выше «пусть ${name} = …;».`, at);
    }
    function stmt(n) {
      switch (n.type) {
        case 'Let': {
          expr(n.init);
          if (fn) {
            let s = slot(n.name);
            if (s < 0) { s = fn.nlocals++; locals.set(n.name, s); }
            emit('STOREL', s, n, { name: n.name });
          } else emit('STORE', gIdx(n.name), n, { name: n.name });
          break;
        }
        case 'Assign': {
          expr(n.value);
          const s = slot(n.name);
          if (s >= 0) emit('STOREL', s, n, { name: n.name });
          else if (declared.has(n.name)) emit('STORE', gIdx(n.name), n, { name: n.name });
          else throw undeclared(n.name, n.nameTok);
          break;
        }
        case 'ExprStmt': expr(n.expr); emit('POP', null, n); break;
        case 'Block': n.body.forEach(stmt); break;
        case 'If': {
          const head = [n.start, n.test.end];
          expr(n.test);
          const jz = emit('JZ', -1, n, { span: head });
          stmt(n.cons);
          if (n.alt) {
            const jmp = emit('JMP', -1, n, { span: head });
            jz.arg = code.length;
            stmt(n.alt);
            jmp.arg = code.length;
          } else jz.arg = code.length;
          break;
        }
        case 'While': {
          const head = [n.start, n.test.end], top = code.length;
          expr(n.test);
          const jz = emit('JZ', -1, n, { span: head });
          stmt(n.body);
          emit('JMP', top, n, { span: head });
          jz.arg = code.length;
          break;
        }
        case 'Repeat': {
          const head = [n.start, n.count.end], hidden = '#' + n.id;
          expr(n.count);
          let ld, st;
          if (fn) { const s = fn.nlocals++; locals.set(hidden, s); ld = ['LOADL', s]; st = ['STOREL', s]; }
          else { const g = gIdx(hidden); ld = ['LOAD', g]; st = ['STORE', g]; }
          const x = { span: head, name: 'счётчик' };
          emit(st[0], st[1], n, x);
          const top = code.length;
          emit(ld[0], ld[1], n, x);
          emit('PUSH', 0, n, { span: head });
          emit('GT', null, n, { span: head });
          const jz = emit('JZ', -1, n, { span: head });
          stmt(n.body);
          emit(ld[0], ld[1], n, x);
          emit('PUSH', 1, n, { span: head });
          emit('SUB', null, n, { span: head });
          emit(st[0], st[1], n, x);
          emit('JMP', top, n, { span: head });
          jz.arg = code.length;
          break;
        }
        case 'Return': {
          if (!fn) throw tokErr('«вернуть» работает только внутри функции.', { start: n.start, end: n.start + 7 });
          if (n.arg) expr(n.arg); else emit('PUSH', 0, n);
          emit('RET', null, n);
          break;
        }
        case 'Func': break;
      }
    }
    function expr(n) {
      switch (n.type) {
        case 'Num': case 'Str': case 'Bool': emit('PUSH', n.value, n); break;
        case 'Name': {
          const s = slot(n.name);
          if (s >= 0) emit('LOADL', s, n, { name: n.name });
          else if (declared.has(n.name)) emit('LOAD', gIdx(n.name), n, { name: n.name });
          else if (funcs.has(n.name) || BUILTINS[n.name]) throw tokErr(`«${n.name}» — это функция. Вызов пишется со скобками: ${n.name}(…).`, n);
          else throw undeclared(n.name, n);
          break;
        }
        case 'Unary': expr(n.arg); emit(n.op === '-' ? 'NEG' : 'NOT', null, n); break;
        case 'Binary': {
          if (n.op === 'и' || n.op === 'или') {
            expr(n.left);
            emit('DUP', null, n);
            const j = emit(n.op === 'и' ? 'JZ' : 'JNZ', -1, n);
            emit('POP', null, n);
            expr(n.right);
            j.arg = code.length;
          } else { expr(n.left); expr(n.right); emit(OPS[n.op], null, n); }
          break;
        }
        case 'Call': {
          const b = BUILTINS[n.name];
          const argWord = k => `${k} ${plural(k, 'аргумент', 'аргумента', 'аргументов')}`;
          if (b) {
            if (n.args.length !== b.n) throw tokErr(`«${n.name}» ждёт ${argWord(b.n)}, а получила ${n.args.length}.`, n);
            n.args.forEach(expr);
            emit('SYS', n.name, n, { argc: n.args.length });
            break;
          }
          const f = funcs.get(n.name);
          if (!f) {
            const s = suggest(n.name, [...Object.keys(BUILTINS), ...funcs.keys()]);
            throw tokErr(s ? `Неизвестная команда «${n.name}». Может быть, «${s}»?` : `Неизвестная команда «${n.name}».`, n.nameTok);
          }
          if (n.args.length !== f.params.length) throw tokErr(`Функция «${n.name}» ждёт ${argWord(f.params.length)}, а получила ${n.args.length}.`, n);
          n.args.forEach(expr);
          emit('CALL', -1, n, { argc: n.args.length, fname: n.name });
          break;
        }
      }
    }
    ast.body.forEach(st => { if (st.type !== 'Func') stmt(st); });
    emit('HALT', null, ast, { span: null });
    for (const f of funcs.values()) {
      sections.push({ title: `функция ${f.name}(${f.params.join(', ')})`, pc: code.length });
      f.addr = code.length;
      fn = f;
      locals = new Map(f.params.map((q, i) => [q, i]));
      stmt(f.node.body);
      const tail = { span: [f.node.body.end - 1, f.node.body.end] };
      emit('PUSH', 0, f.node, tail);
      emit('RET', null, f.node, tail);
      fn = null; locals = null;
    }
    code.forEach(ins => {
      if (ins.op === 'CALL') { const f = funcs.get(ins.fname); ins.arg = f.addr; ins.nlocals = f.nlocals; }
    });
    return { code, globals: [...globals.keys()], funcs, sections };
  }
  function suggest(name, pool) {
    const norm = s => s.toLowerCase().replace(/ё/g, 'е');
    let best = null, bd = name.length <= 2 ? 1 : name.length > 4 ? 3 : 2;
    for (const c of pool) {
      const d = lev(norm(name), norm(c));
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // ———————————————————— Черепаха ————————————————————
  const WORLD = 640;
  const cv = $('#turtle'), ctx = cv.getContext('2d');
  const ink = document.createElement('canvas'), ictx = ink.getContext('2d');
  const bg = document.createElement('canvas'), bctx = bg.getContext('2d');
  const FILTERS = 'filter' in ctx;
  const Turtle = {
    x: 0, y: 0, a: 90, pen: true, hue: 30, width: 1.4, prims: [], dirty: true,
    reset() { this.x = 0; this.y = 0; this.a = 90; this.pen = true; this.hue = 30; this.width = 1.4; this.prims = []; ictx.clearRect(0, 0, ink.width, ink.height); this.dirty = true; },
    move(d) {
      const r = (this.a * Math.PI) / 180;
      const nx = this.x + Math.cos(r) * d, ny = this.y + Math.sin(r) * d;
      if (this.pen) this.prim({ k: 0, x1: this.x, y1: this.y, x2: nx, y2: ny, h: this.hue, w: this.width });
      this.x = nx; this.y = ny; this.dirty = true;
    },
    dot(r) { this.prim({ k: 1, x: this.x, y: this.y, r: Math.max(0.3, r), h: this.hue }); },
    prim(p) { if (this.prims.length < 400000) { this.prims.push(p); drawPrim(p); } this.dirty = true; },
  };
  let scale = 1;
  function drawPrim(p) {
    const cx = ink.width / 2, cy = ink.height / 2;
    if (p.k === 0) {
      ictx.strokeStyle = `hsl(${p.h}, 88%, 66%)`;
      ictx.lineWidth = Math.max(0.7, p.w * scale * 0.9);
      ictx.beginPath();
      ictx.moveTo(cx + p.x1 * scale, cy - p.y1 * scale);
      ictx.lineTo(cx + p.x2 * scale, cy - p.y2 * scale);
      ictx.stroke();
    } else {
      ictx.fillStyle = `hsl(${p.h}, 90%, 70%)`;
      ictx.beginPath();
      ictx.arc(cx + p.x * scale, cy - p.y * scale, p.r * scale, 0, Math.PI * 2);
      ictx.fill();
    }
  }
  function sizeCanvas() {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.max(64, Math.round(Math.min(r.width, r.height) * dpr));
    if (cv.width === s) return;
    cv.width = cv.height = ink.width = ink.height = bg.width = bg.height = s;
    scale = s / WORLD;
    ictx.lineCap = 'round'; ictx.lineJoin = 'round';
    // фон: точечная сетка и лёгкая виньетка
    const g = bctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.75);
    g.addColorStop(0, '#0B0E13'); g.addColorStop(1, '#05070A');
    bctx.fillStyle = g; bctx.fillRect(0, 0, s, s);
    bctx.fillStyle = 'rgba(255,255,255,0.07)';
    const step = 40 * scale;
    for (let x = s / 2 % step; x < s; x += step) for (let y = s / 2 % step; y < s; y += step) bctx.fillRect(x - 0.6 * dpr, y - 0.6 * dpr, 1.2 * dpr, 1.2 * dpr);
    bctx.strokeStyle = 'rgba(255,255,255,0.05)'; bctx.lineWidth = dpr;
    bctx.beginPath(); bctx.moveTo(s / 2, 0); bctx.lineTo(s / 2, s); bctx.moveTo(0, s / 2); bctx.lineTo(s, s / 2); bctx.stroke();
    Turtle.prims.forEach(drawPrim);
    Turtle.dirty = true;
  }
  function paintTurtle() {
    if (!Turtle.dirty) return;
    Turtle.dirty = false;
    const s = cv.width;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    if (FILTERS) {
      ctx.filter = `blur(${Math.round(s / 90)}px)`; ctx.globalAlpha = 0.85; ctx.drawImage(ink, 0, 0);
      ctx.filter = `blur(${Math.max(1, Math.round(s / 400))}px)`; ctx.globalAlpha = 0.6; ctx.drawImage(ink, 0, 0);
      ctx.filter = 'none';
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(ink, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    // сама черепаха
    const cx = s / 2 + Turtle.x * scale, cy = s / 2 - Turtle.y * scale, a = (-Turtle.a * Math.PI) / 180, k = Math.max(7, s / 70);
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(a);
    ctx.fillStyle = 'rgba(255, 138, 122, 0.22)';
    ctx.beginPath(); ctx.arc(0, 0, k * 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = Turtle.pen ? '#FF8A7A' : '#8C95A3';
    ctx.beginPath(); ctx.moveTo(k * 1.1, 0); ctx.lineTo(-k * 0.7, k * 0.62); ctx.lineTo(-k * 0.35, 0); ctx.lineTo(-k * 0.7, -k * 0.62); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ———————————————————— Машина ————————————————————
  const vm = { prog: null, pc: 0, stack: [], frames: [], frame: null, globals: [], halted: true, error: null, steps: 0, counts: null, out: [], rng: null, lastJump: null };
  const STEP_LIMIT = 8e6;
  const num = v => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0);
  const truthy = v => !(v === 0 || v === false || v === '' || v == null);
  const show = v => (typeof v === 'string' ? v : fmt(v));
  function vmReset() {
    Object.assign(vm, {
      pc: 0, stack: [], frames: [], frame: null, halted: !vm.prog, error: null, steps: 0, out: [], lastJump: null,
      globals: vm.prog ? new Array(vm.prog.globals.length).fill(undefined) : [],
      counts: vm.prog ? new Uint32Array(vm.prog.code.length) : null,
      rng: makeRng(20260923),
    });
    Turtle.reset();
    consoleDirty = true;
  }
  function vmFail(msg, ins) {
    vm.error = { msg, ins };
    vm.halted = true;
  }
  const SYS = {
    'вперёд': a => Turtle.move(num(a[0])),
    'назад': a => Turtle.move(-num(a[0])),
    'налево': a => { Turtle.a += num(a[0]); Turtle.dirty = true; },
    'направо': a => { Turtle.a -= num(a[0]); Turtle.dirty = true; },
    'поднять': () => { Turtle.pen = false; Turtle.dirty = true; },
    'опустить': () => { Turtle.pen = true; Turtle.dirty = true; },
    'цвет': a => { Turtle.hue = ((num(a[0]) % 360) + 360) % 360; },
    'толщина': a => { Turtle.width = Math.max(0.2, num(a[0])); },
    'точка': a => Turtle.dot(num(a[0])),
    'прыжок': a => { Turtle.x = num(a[0]); Turtle.y = num(a[1]); Turtle.dirty = true; },
    'курс': a => { Turtle.a = num(a[0]); Turtle.dirty = true; },
    'домой': () => { Turtle.x = 0; Turtle.y = 0; Turtle.a = 90; Turtle.pen = true; Turtle.dirty = true; },
    'печать': a => { vm.out.push(show(a[0])); if (vm.out.length > 200) vm.out.shift(); consoleDirty = true; },
    'корень': (a, ins) => { const v = num(a[0]); if (v < 0) { vmFail(`Корень из отрицательного числа (${fmt(v)}).`, ins); return 0; } return Math.sqrt(v); },
    'синус': a => Math.sin((num(a[0]) * Math.PI) / 180),
    'косинус': a => Math.cos((num(a[0]) * Math.PI) / 180),
    'модуль': a => Math.abs(num(a[0])),
    'округлить': a => Math.round(num(a[0])),
    'случайное': a => num(a[0]) + vm.rng() * (num(a[1]) - num(a[0])),
  };
  function vmStep() {
    const code = vm.prog.code, ins = code[vm.pc], st = vm.stack;
    vm.counts[vm.pc]++;
    vm.steps++;
    let next = vm.pc + 1;
    switch (ins.op) {
      case 'PUSH': st.push(ins.arg); break;
      case 'DUP': st.push(st[st.length - 1]); break;
      case 'POP': st.pop(); break;
      case 'LOAD': {
        const v = vm.globals[ins.arg];
        if (v === undefined) return vmFail(`Переменная «${vm.prog.globals[ins.arg]}» читается раньше, чем получила значение.`, ins);
        st.push(v); break;
      }
      case 'STORE': vm.globals[ins.arg] = st.pop(); break;
      case 'LOADL': st.push(vm.frame.locals[ins.arg]); break;
      case 'STOREL': vm.frame.locals[ins.arg] = st.pop(); break;
      case 'ADD': { const b = st.pop(), a = st.pop(); st.push(typeof a === 'string' || typeof b === 'string' ? show(a) + show(b) : num(a) + num(b)); break; }
      case 'SUB': { const b = st.pop(), a = st.pop(); st.push(num(a) - num(b)); break; }
      case 'MUL': { const b = st.pop(), a = st.pop(); st.push(num(a) * num(b)); break; }
      case 'DIV': { const b = num(st.pop()), a = num(st.pop()); if (b === 0) return vmFail('Деление на ноль.', ins); st.push(a / b); break; }
      case 'MOD': { const b = num(st.pop()), a = num(st.pop()); if (b === 0) return vmFail('Остаток от деления на ноль.', ins); st.push(a % b); break; }
      case 'NEG': st.push(-num(st.pop())); break;
      case 'NOT': st.push(!truthy(st.pop())); break;
      case 'EQ': { const b = st.pop(), a = st.pop(); st.push(a === b); break; }
      case 'NE': { const b = st.pop(), a = st.pop(); st.push(a !== b); break; }
      case 'LT': { const b = st.pop(), a = st.pop(); st.push(num(a) < num(b)); break; }
      case 'GT': { const b = st.pop(), a = st.pop(); st.push(num(a) > num(b)); break; }
      case 'LE': { const b = st.pop(), a = st.pop(); st.push(num(a) <= num(b)); break; }
      case 'GE': { const b = st.pop(), a = st.pop(); st.push(num(a) >= num(b)); break; }
      case 'JMP': next = ins.arg; vm.lastJump = ins.pc; break;
      case 'JZ': if (!truthy(st.pop())) { next = ins.arg; vm.lastJump = ins.pc; } break;
      case 'JNZ': if (truthy(st.pop())) { next = ins.arg; vm.lastJump = ins.pc; } break;
      case 'CALL': {
        if (vm.frames.length >= 600) return vmFail('Слишком глубокая рекурсия: больше 600 вложенных вызовов. Где-то не хватает условия выхода.', ins);
        const args = st.splice(st.length - ins.argc, ins.argc);
        while (args.length < ins.nlocals) args.push(0);
        const f = { fn: ins.fname, ret: next, base: st.length, locals: args, params: vm.prog.funcs.get(ins.fname).params };
        vm.frames.push(f); vm.frame = f; next = ins.arg;
        break;
      }
      case 'RET': {
        const v = st.pop(), f = vm.frames.pop();
        st.length = f.base; st.push(v);
        next = f.ret;
        vm.frame = vm.frames[vm.frames.length - 1] || null;
        break;
      }
      case 'SYS': {
        const args = st.splice(st.length - ins.argc, ins.argc);
        const r = SYS[ins.arg](args, ins);
        if (vm.error) return;
        st.push(r === undefined ? 0 : r);
        break;
      }
      case 'HALT': vm.halted = true; next = vm.pc; break;
    }
    vm.pc = next;
    if (vm.steps >= STEP_LIMIT) vmFail(`Машина сделала ${group(STEP_LIMIT)} шагов и остановилась — похоже на бесконечный цикл.`, ins);
  }

  // ———————————————————— Примеры ————————————————————
  const EXAMPLES = [
    { name: 'Дерево', note: 'Рекурсия: ветка вызывает саму себя', code:
`// Фрактальное дерево: функция вызывает сама себя
функция ветка(длина, глубина) {
  если глубина == 0 {
    цвет(335);
    точка(2.4);          // цветок на кончике
    вернуть;
  }
  толщина(глубина * 0.8);
  цвет(24 + (9 - глубина) * 13);
  вперёд(длина);
  налево(23);
  ветка(длина * 0.74, глубина - 1);
  направо(46);
  ветка(длина * 0.74, глубина - 1);
  налево(23);
  поднять();
  назад(длина);
  опустить();
}

прыжок(0, -208);
ветка(118, 9);
` },
    { name: 'Подсолнух', note: 'Цикл «пока» и золотой угол 137,5°', code:
`// Подсолнух: каждое семечко повёрнуто на золотой угол
пусть n = 0;
пока n < 460 {
  пусть угол = n * 137.508;
  пусть радиус = 12 * корень(n);
  прыжок(0, 0);
  курс(угол);
  поднять();
  вперёд(радиус);
  опустить();
  цвет(50 - n * 0.065);
  точка(1.6 + n / 140);
  n = n + 1;
}
` },
    { name: 'Снежинка Коха', note: 'Четыре уровня самоподобия', code:
`// Снежинка Коха: каждая сторона — четыре уменьшенные копии
функция кох(длина, уровень) {
  если уровень == 0 {
    вперёд(длина);
    вернуть;
  }
  кох(длина / 3, уровень - 1);
  налево(60);
  кох(длина / 3, уровень - 1);
  направо(120);
  кох(длина / 3, уровень - 1);
  налево(60);
  кох(длина / 3, уровень - 1);
}

прыжок(-180, 104);
курс(0);
толщина(1.3);
пусть сторона = 0;
повтори 3 {
  цвет(188 + сторона * 26);
  кох(360, 4);
  направо(120);
  сторона = сторона + 1;
}
` },
    { name: 'Спираль', note: 'Переменные меняются на каждом витке', code:
`// Квадратная спираль: шаг и оттенок растут с каждым витком
пусть шаг = 3;
пусть оттенок = 170;
повтори 130 {
  цвет(оттенок);
  толщина(1 + шаг / 150);
  вперёд(шаг);
  направо(91);
  шаг = шаг + 3.3;
  оттенок = оттенок + 1.4;
}
` },
    { name: 'Розетка', note: 'Функция с параметрами и вложенный цикл', code:
`// Розетка: шестиугольник, повёрнутый 36 раз
функция многоугольник(стороны, длина) {
  повтори стороны {
    вперёд(длина);
    направо(360 / стороны);
  }
}

пусть k = 0;
толщина(1.1);
повтори 36 {
  цвет(k * 10);
  многоугольник(6, 105);
  направо(10);
  k = k + 1;
}
` },
    { name: 'Дракон', note: 'Кривая дракона: 4096 отрезков', code:
`// Кривая дракона: полоску бумаги сложили пополам 12 раз
функция дракон(длина, уровень, знак) {
  если уровень == 0 {
    цвет(190 + отрезок / 30);
    вперёд(длина);
    отрезок = отрезок + 1;
    вернуть;
  }
  налево(45 * знак);
  дракон(длина / 1.41421, уровень - 1, 1);
  направо(90 * знак);
  дракон(длина / 1.41421, уровень - 1, -1);
  налево(45 * знак);
}

пусть отрезок = 0;
прыжок(-141, -57);
курс(0);
толщина(1.2);
дракон(340, 12, 1);
` },
    { name: 'Фибоначчи', note: 'Печать и двойная рекурсия', code:
`// Числа Фибоначчи: печать и двойная рекурсия
функция фиб(n) {
  если n < 2 {
    вернуть n;
  }
  вернуть фиб(n - 1) + фиб(n - 2);
}

пусть i = 0;
прыжок(-285, -250);
пока i < 16 {
  пусть f = фиб(i);
  печать(«фиб(» + i + «) = » + f);
  курс(90);                    // столбик растёт вверх
  цвет(20 + i * 12);
  толщина(12);
  вперёд(корень(f) * 15);
  поднять();
  назад(корень(f) * 15);
  курс(0);
  вперёд(38);
  опустить();
  i = i + 1;
}
` },
  ];

  // ———————————————————— Состояние интерфейса ————————————————————
  const src = $('#src'), hl = $('#hl'), gutter = $('#gutter'), diag = $('#diag');
  const SPEEDS = [0.05, 0.2, 1, 3, 10, 40, 150, 600, 3000, 25000];
  const S = { tokens: [], comments: [], ast: null, prog: null, err: null, link: null, exec: null, running: true, speed: 6, acc: 0, example: 0, nodes: [] };
  let consoleDirty = true;

  // ——— подсветка исходника ———
  function tokClass(t) {
    if (t.type === 'kw') return 't-kw';
    if (t.type === 'id') return BUILTINS[t.value] ? 't-bi' : (S.funcNames && S.funcNames.has(t.value) ? 't-fn' : 't-id');
    return { num: 't-num', str: 't-str', op: 't-op', punc: 't-pun' }[t.type] || '';
  }
  function renderHL() {
    const text = src.value, n = text.length;
    const marks = [];
    for (const t of S.tokens) if (t.type !== 'eof') marks.push([t.start, t.end, tokClass(t)]);
    for (const c of S.comments) marks.push([c.start, c.end, 't-com']);
    if (S.link) marks.push([S.link[0], S.link[1], 'm-link']);
    if (S.exec) marks.push([S.exec[0], S.exec[1], 'm-exec']);
    let tail = '';
    if (S.err) {
      const e0 = Math.min(S.err.start, n), e1 = Math.min(Math.max(S.err.end, S.err.start + 1), n);
      if (e1 > e0) marks.push([e0, e1, 'm-err']); else tail = '<span class="m-err"> </span>';
    }
    const cuts = new Set([0, n]);
    for (const m of marks) { cuts.add(Math.max(0, Math.min(n, m[0]))); cuts.add(Math.max(0, Math.min(n, m[1]))); }
    const pts = [...cuts].sort((a, b) => a - b);
    let html = '';
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      if (a === b) continue;
      let cls = '';
      for (const m of marks) if (m[0] <= a && m[1] >= b) cls += (cls ? ' ' : '') + m[2];
      const piece = esc(text.slice(a, b));
      html += cls ? `<span class="${cls}">${piece}</span>` : piece;
    }
    hl.innerHTML = html + tail + '\n';
    hl.scrollTop = src.scrollTop; hl.scrollLeft = src.scrollLeft;
  }
  function lineOf(off) { let l = 1; const t = src.value; for (let i = 0; i < off && i < t.length; i++) if (t.charCodeAt(i) === 10) l++; return l; }
  function renderGutter() {
    const lines = src.value.split('\n').length;
    const cur = S.exec ? lineOf(S.exec[0]) : -1, bad = S.err ? lineOf(S.err.start) : -1;
    let h = '';
    for (let i = 1; i <= lines; i++) h += `<div class="${i === bad ? 'err' : i === cur ? 'cur' : ''}">${i}</div>`;
    gutter.innerHTML = h;
    gutter.scrollTop = src.scrollTop;
  }
  src.addEventListener('scroll', () => { hl.scrollTop = src.scrollTop; hl.scrollLeft = src.scrollLeft; gutter.scrollTop = src.scrollTop; });

  // ——— лексемы ———
  const TOK_NAMES = { kw: 'ключевое слово', id: 'имя', num: 'число', str: 'строка', op: 'оператор', punc: 'знак препинания' };
  function renderTokens() {
    const box = $('#tokens');
    const byLine = new Map();
    S.tokens.forEach((t, i) => {
      if (t.type === 'eof') return;
      const l = lineOf(t.start);
      if (!byLine.has(l)) byLine.set(l, []);
      byLine.get(l).push(`<span class="tok ${tokClass(t)}" data-i="${i}">${esc(t.text)}</span>`);
    });
    let h = '';
    for (const [l, chips] of byLine) h += `<div class="tl"><span class="ln">${l}</span><span class="chips">${chips.join('')}</span></div>`;
    if (S.err && S.err.stage === 'lex') h += `<div class="tl"><span class="ln">${lineOf(S.err.start)}</span><span class="chips"><span class="tok bad">?</span></span></div>`;
    box.innerHTML = h;
  }

  // ——— дерево ———
  const KIND = { decl: '#7EE0B5', stmt: '#E6E1D6', ctrl: '#F2B84B', expr: '#C3A8FF', lit: '#6CB6FF', call: '#FF8A7A' };
  function nodeInfo(n) {
    switch (n.type) {
      case 'Program': return ['программа', `${n.body.length} ${plural(n.body.length, 'команда', 'команды', 'команд')}`, 'decl'];
      case 'Func': return ['функция', `${n.name}(${n.params.join(', ')})`, 'decl'];
      case 'Let': return ['пусть', n.name, 'stmt'];
      case 'Assign': return ['присвоить', n.name, 'stmt'];
      case 'If': return ['если', n.alt ? 'с веткой «иначе»' : '', 'ctrl'];
      case 'While': return ['пока', 'цикл с условием', 'ctrl'];
      case 'Repeat': return ['повтори', 'цикл со счётчиком', 'ctrl'];
      case 'Return': return ['вернуть', '', 'ctrl'];
      case 'Block': return ['блок', `${n.body.length} ${plural(n.body.length, 'команда', 'команды', 'команд')}`, 'stmt'];
      case 'ExprStmt': return ['команда', '', 'stmt'];
      case 'Binary': return [n.op, OP_NAMES[n.op], 'expr'];
      case 'Unary': return [n.op === '-' ? '−' : 'не', n.op === '-' ? 'смена знака' : 'отрицание', 'expr'];
      case 'Call': return ['вызов', BUILTINS[n.name] ? n.name : n.name + '()', 'call'];
      case 'Num': return [fmt(n.value), 'число', 'lit'];
      case 'Str': return [`«${n.value}»`, 'строка', 'lit'];
      case 'Bool': return [n.value ? 'истина' : 'ложь', 'логическое', 'lit'];
      case 'Name': return [n.name, 'переменная', 'expr'];
      default: return [n.type, '', 'stmt'];
    }
  }
  const ROW = 22;
  const astPaths = new Map();
  function renderAST() {
    const rows = $('#ast-rows'), svg = $('#ast-lines');
    astPaths.clear();
    if (!S.ast) { rows.innerHTML = ''; svg.innerHTML = ''; S.nodes = []; return; }
    const list = [];
    (function walk(n) { list.push(n); n.kids.forEach(walk); })(S.ast);
    S.nodes = list;
    let h = '';
    list.forEach((n, i) => {
      n.row = i;
      const [lbl, det, kind] = nodeInfo(n);
      h += `<div class="an" data-id="${n.pre}" style="--d:${n.depth};--k:${KIND[kind]}"><span class="lbl">${esc(lbl)}</span>${det ? `<span class="det">${esc(det)}</span>` : ''}</div>`;
    });
    rows.innerHTML = h;
    const dotX = d => 12 + d * 16 + 3.5;
    let p = '';
    list.forEach(n => {
      if (!n.parent) return;
      const px = dotX(n.parent.depth), x = dotX(n.depth) - 7, y0 = n.parent.row * ROW + ROW / 2 + 5, y = n.row * ROW + ROW / 2;
      p += `<path data-id="${n.pre}" d="M${px} ${y0} V${y - 5} Q${px} ${y} ${px + 5} ${y} H${x}"/>`;
    });
    svg.setAttribute('width', 400);
    svg.setAttribute('height', list.length * ROW + 10);
    svg.innerHTML = p;
    $$('path', svg).forEach(el => astPaths.set(Number(el.dataset.id), el));
  }

  // ——— байткод ———
  let insEls = [], jumpPaths = new Map(), heatTick = 0;
  function argText(ins) {
    switch (ins.op) {
      case 'PUSH': return esc(fmt(ins.arg));
      case 'LOAD': case 'STORE': return esc(S.prog.globals[ins.arg][0] === '#' ? 'счётчик' : S.prog.globals[ins.arg]);
      case 'LOADL': case 'STOREL': return `${ins.arg} <span style="color:#5B6472">${esc(ins.name || '')}</span>`;
      case 'JMP': case 'JZ': case 'JNZ': return `→ ${String(ins.arg).padStart(3, '0')}`;
      case 'CALL': return `${esc(ins.fname)}/${ins.argc} → ${String(ins.arg).padStart(3, '0')}`;
      case 'SYS': return `${esc(ins.arg)}/${ins.argc}`;
      default: return '';
    }
  }
  function renderCode() {
    const rows = $('#code-rows'), svg = $('#jumps');
    insEls = []; jumpPaths.clear();
    if (!S.prog) { rows.innerHTML = ''; svg.innerHTML = ''; return; }
    const code = S.prog.code;
    // дорожки для стрелок переходов
    const jumps = code.filter(i => i.op === 'JMP' || i.op === 'JZ' || i.op === 'JNZ').map(i => ({ from: i.pc, to: i.arg, lo: Math.min(i.pc, i.arg), hi: Math.max(i.pc, i.arg) }));
    jumps.sort((a, b) => (a.hi - a.lo) - (b.hi - b.lo));
    const lanes = [];
    jumps.forEach(j => {
      let l = 0;
      while ((lanes[l] || []).some(o => !(j.hi < o.lo || j.lo > o.hi))) l++;
      (lanes[l] = lanes[l] || []).push(j);
      j.lane = l;
    });
    const nl = Math.min(lanes.length, 9);
    const jl = 16 + nl * 6 + 8;
    rows.style.setProperty('--jl', jl + 'px');
    const secAt = new Map(S.prog.sections.map(s => [s.pc, s.title]));
    let h = '', y = 0;
    const yOf = [];
    code.forEach(ins => {
      if (secAt.has(ins.pc)) { h += `<div class="sec">${esc(secAt.get(ins.pc))}</div>`; y += 28; }
      yOf[ins.pc] = y + ROW / 2;
      const [cls] = OPCODES[ins.op];
      h += `<div class="ins" data-pc="${ins.pc}"><span class="heat"></span><span class="pc">${String(ins.pc).padStart(3, '0')}</span><span class="op ${cls}">${ins.op}</span><span class="arg">${argText(ins)}</span></div>`;
      y += ROW;
    });
    yOf[code.length] = y + ROW / 2;
    rows.innerHTML = h;
    insEls = $$('.ins', rows);
    let p = '';
    jumps.forEach(j => {
      const lane = Math.min(j.lane, nl - 1), x0 = jl - 6, x = jl - 12 - lane * 6;
      const y1 = yOf[j.from], y2 = yOf[j.to] !== undefined ? yOf[j.to] : y;
      const dir = y2 > y1 ? 1 : -1;
      p += `<path data-pc="${j.from}" d="M${x0} ${y1} H${x + 3} Q${x} ${y1} ${x} ${y1 + 3 * dir} V${y2 - 3 * dir} Q${x} ${y2} ${x + 3} ${y2} H${x0 - 1} M${x0 - 5} ${y2 - 3} L${x0 - 1} ${y2} L${x0 - 5} ${y2 + 3}"/>`;
    });
    svg.setAttribute('width', jl);
    svg.setAttribute('height', y + 20);
    svg.innerHTML = p;
    $$('path', svg).forEach(el => jumpPaths.set(Number(el.dataset.pc), el));
  }
  function updateHeat() {
    if (!vm.counts || !insEls.length) return;
    let max = 1;
    for (let i = 0; i < vm.counts.length; i++) if (vm.counts[i] > max) max = vm.counts[i];
    const lm = Math.log(1 + max);
    insEls.forEach((el, i) => { el.firstChild.style.setProperty('--h', vm.counts[i] ? (100 * Math.log(1 + vm.counts[i]) / lm).toFixed(1) + '%' : '0%'); });
  }

  // ——— машина: панели ———
  let lastHot = { pc: -1, node: -1, jump: -1 };
  function setHot(ins) {
    const pc = ins ? ins.pc : -1;
    if (pc === lastHot.pc) return;
    if (lastHot.pc >= 0 && insEls[lastHot.pc]) insEls[lastHot.pc].classList.remove('hot');
    if (pc >= 0 && insEls[pc]) insEls[pc].classList.add('hot');
    // узел дерева и путь к корню
    $$('.an.hot').forEach(e => e.classList.remove('hot'));
    $$('#ast-lines path.hot').forEach(e => e.classList.remove('hot'));
    if (ins && ins.node && ins.node.type !== 'Program') {
      const el = S.nodes.length ? $(`.an[data-id="${ins.node.pre}"]`) : null;
      if (el) el.classList.add('hot');
      for (let n = ins.node; n && n.parent; n = n.parent) { const pth = astPaths.get(n.pre); if (pth) pth.classList.add('hot'); }
    }
    if (lastHot.jump >= 0 && jumpPaths.get(lastHot.jump)) jumpPaths.get(lastHot.jump).classList.remove('hot');
    const jp = vm.lastJump != null ? jumpPaths.get(vm.lastJump) : null;
    if (jp && ins) { jp.classList.add('hot'); lastHot.jump = vm.lastJump; } else lastHot.jump = -1;
    lastHot.pc = pc;
    S.exec = ins && ins.span ? ins.span : null;
  }
  function follow() {
    if (!S.running) return;
    const hotIns = $('.ins.hot'), hotNode = $('.an.hot');
    [[hotIns, $('#code')], [hotNode, $('#ast')]].forEach(([el, box]) => {
      if (!el) return;
      const top = el.offsetTop, h = box.clientHeight;
      if (top < box.scrollTop + 30 || top > box.scrollTop + h - 50) box.scrollTop = top - h * 0.4;
    });
    if (document.activeElement !== src && S.exec) {
      const line = lineOf(S.exec[0]), top = (line - 1) * 20, h = src.clientHeight;
      if (top < src.scrollTop + 20 || top > src.scrollTop + h - 60) src.scrollTop = top - h * 0.4;
    }
  }
  function renderVM() {
    const st = $('#vm-state');
    let state, cls = 'st';
    if (!vm.prog) { state = 'нет программы'; cls += ' err'; }
    else if (vm.error) { state = 'ошибка'; cls += ' err'; }
    else if (vm.halted) { state = 'готово'; cls += ' done'; }
    else state = S.running ? 'работает' : 'пауза';
    const ins = vm.prog && !vm.halted ? vm.prog.code[vm.pc] : null;
    st.innerHTML = `<span class="${cls}">${state}</span><span>шаг <b>${group(vm.steps)}</b></span>${ins ? `<span>команда <b>${String(ins.pc).padStart(3, '0')} ${ins.op}</b></span>` : ''}<span>глубина <b>${vm.frames.length}</b></span>`;
    $('#meta-vm').textContent = `${group(vm.steps)} ${plural(vm.steps, 'шаг', 'шага', 'шагов')}`;
    // стек: вершина — первой
    const s = vm.stack, top = s.slice(-7).reverse();
    $('#stack').innerHTML = top.length ? top.map(v => `<div class="cell">${esc(fmt(v))}</div>`).join('') + (s.length > 7 ? `<div class="empty">… ещё ${s.length - 7}</div>` : '') : '<div class="empty">пусто</div>';
    const fr = vm.frames.slice(-6).reverse();
    $('#frames').innerHTML = fr.length
      ? fr.map(f => `<div>${esc(f.fn)}(${f.params.map((p, i) => `${esc(p)}: ${esc(fmt(f.locals[i]))}`).join(', ')})</div>`).join('') + (vm.frames.length > 6 ? `<div>… ещё ${vm.frames.length - 6}</div>` : '')
      : '<div class="empty">главная программа</div>';
    const g = vm.prog ? vm.prog.globals.map((name, i) => [name, vm.globals[i]]).filter(([name, v]) => name[0] !== '#' && v !== undefined) : [];
    $('#globals').innerHTML = g.length ? g.map(([name, v]) => `<div><span>${esc(name)} =</span> ${esc(fmt(v))}</div>`).join('') : '<div class="empty">нет</div>';
    if (consoleDirty) {
      const c = $('#console');
      c.innerHTML = vm.out.length ? vm.out.map(t => `<div>${esc(t)}</div>`).join('') : '<div class="empty">пусто</div>';
      c.scrollTop = c.scrollHeight;
      consoleDirty = false;
    }
    if (vm.error) {
      diag.className = 'diag err';
      diag.innerHTML = `${ICON_ERR}<span>Строка ${vm.error.ins && vm.error.ins.span ? lineOf(vm.error.ins.span[0]) : '?'}: ${esc(vm.error.msg)}</span>`;
    }
  }
  const ICON_OK = '<svg viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_ERR = '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.8v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="8" cy="11.2" r=".9" fill="currentColor"/></svg>';

  // ———————————————————— Компиляция ————————————————————
  function compile() {
    const text = src.value;
    const t0 = performance.now();
    S.err = null; S.ast = null; S.prog = null; S.link = null; S.exec = null;
    let stageReached = 'lex';
    try {
      const L = lex(text);
      S.tokens = L.tokens; S.comments = L.comments;
      stageReached = 'parse';
      S.ast = parse(L.tokens);
      S.funcNames = new Set(S.ast.body.filter(n => n.type === 'Func').map(n => n.name));
      stageReached = 'gen';
      S.prog = generate(S.ast);
      stageReached = 'vm';
    } catch (e) {
      if (!(e instanceof CompileError)) throw e;
      S.err = e;
      if (e.partial) { S.tokens = e.partial.tokens; S.comments = e.partial.comments; }
      if (e.stage !== 'gen') S.ast = null;
    }
    const ms = performance.now() - t0;
    vm.prog = S.prog;
    lastHot = { pc: -1, node: -1, jump: -1 };
    vmReset();
    // метки этапов
    const lines = text.split('\n').length;
    $('#meta-src').textContent = `${lines} ${plural(lines, 'строка', 'строки', 'строк')}`;
    const nt = S.tokens.length - (S.tokens.length && S.tokens[S.tokens.length - 1].type === 'eof' ? 1 : 0);
    $('#meta-lex').textContent = `${nt} ${plural(nt, 'лексема', 'лексемы', 'лексем')}`;
    const nn = S.ast ? S.ast.last + 1 : 0;
    $('#meta-parse').textContent = S.ast ? `${nn} ${plural(nn, 'узел', 'узла', 'узлов')}` : '—';
    $('#meta-gen').textContent = S.prog ? `${S.prog.code.length} ${plural(S.prog.code.length, 'команда', 'команды', 'команд')}` : '—';
    const order = ['lex', 'parse', 'gen', 'vm'];
    const reached = S.err ? order.indexOf(S.err.stage) : 4;
    $$('.stage').forEach(el => {
      const k = order.indexOf(el.dataset.stage);
      el.classList.toggle('off', k > reached || (S.err && k === reached && el.dataset.stage !== 'lex' && el.dataset.stage !== 'src'));
    });
    if (S.err && S.err.stage === 'gen') $('.stage[data-stage="parse"]').classList.remove('off');
    renderHL(); renderGutter(); renderTokens(); renderAST(); renderCode(); renderVM();
    if (S.err) {
      diag.className = 'diag err';
      diag.innerHTML = `${ICON_ERR}<span>Строка ${lineOf(S.err.start)}: ${esc(S.err.message)}</span>`;
    } else {
      diag.className = 'diag';
      diag.innerHTML = `${ICON_OK}<span>Собрано за ${ms.toFixed(1).replace('.', ',')} мс: ${S.prog.code.length} ${plural(S.prog.code.length, 'команда', 'команды', 'команд')}, ${S.prog.funcs.size} ${plural(S.prog.funcs.size, 'функция', 'функции', 'функций')}</span>`;
    }
    pulse(reached);
    Turtle.dirty = true;
  }
  function pulse(reached) {
    const order = ['src', 'lex', 'parse', 'gen', 'vm'];
    order.forEach((k, i) => {
      if (i > reached + 1) return;
      setTimeout(() => {
        const el = $(`.stage[data-stage="${k}"]`);
        el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse', 'flow');
        setTimeout(() => el.classList.remove('flow'), 600);
      }, i * 95);
    });
  }

  // ———————————————————— Связи при наведении ————————————————————
  const tip = $('#tip');
  function showTip(html, e) {
    tip.innerHTML = html; tip.hidden = false;
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 16, innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; }
  function nodeAt(off) {
    if (!S.ast) return null;
    let best = null;
    (function walk(n) { if (off >= n.start && off < n.end) { best = n; n.kids.forEach(walk); } })(S.ast);
    return best && best.type !== 'Program' ? best : null;
  }
  function clearLink() {
    S.link = null;
    $$('.an.link, .ins.link, .tok.lit').forEach(e => e.classList.remove('link', 'lit'));
    $$('#ast-lines path.link, #jumps path.link').forEach(e => e.classList.remove('link'));
  }
  function linkSpan(a, b, node) {
    clearLink();
    S.link = [a, b];
    S.tokens.forEach((t, i) => { if (t.type !== 'eof' && t.start >= a && t.end <= b) { const el = $(`.tok[data-i="${i}"]`); if (el) el.classList.add('lit'); } });
    if (node) {
      const el = $(`.an[data-id="${node.pre}"]`);
      if (el) el.classList.add('link');
      for (let n = node; n && n.parent; n = n.parent) { const pth = astPaths.get(n.pre); if (pth) pth.classList.add('link'); }
      if (S.prog) S.prog.code.forEach((ins, i) => { if (ins.node && ins.node.pre >= node.pre && ins.node.pre <= node.last && insEls[i]) insEls[i].classList.add('link'); });
    }
    renderHL();
  }
  $('#tokens').addEventListener('mouseover', e => {
    const el = e.target.closest('.tok'); if (!el || el.dataset.i === undefined) return;
    const t = S.tokens[+el.dataset.i];
    linkSpan(t.start, t.end, nodeAt(t.start));
    const doc = t.type === 'id' && BUILTINS[t.value] ? ` — ${BUILTINS[t.value].doc}` : '';
    showTip(`<b>${esc(t.text)}</b> — ${TOK_NAMES[t.type]}${esc(doc)}`, e);
  });
  $('#ast-rows').addEventListener('mouseover', e => {
    const el = e.target.closest('.an'); if (!el) return;
    const n = S.nodes.find(x => x.pre === +el.dataset.id); if (!n) return;
    linkSpan(n.start, n.end, n);
  });
  $('#code-rows').addEventListener('mouseover', e => {
    const el = e.target.closest('.ins'); if (!el) return;
    const ins = S.prog.code[+el.dataset.pc];
    if (ins.node && ins.node.type !== 'Program') linkSpan(ins.span[0], ins.span[1], ins.node);
    else clearLink();
    el.classList.add('link');
    const count = vm.counts ? vm.counts[ins.pc] : 0;
    showTip(`<b>${ins.op}</b> — ${OPCODES[ins.op][1]}.<br>Выполнена ${group(count)} ${plural(count, 'раз', 'раза', 'раз')}.`, e);
  });
  ['#tokens', '#ast-rows', '#code-rows'].forEach(sel => $(sel).addEventListener('mouseleave', () => { clearLink(); renderHL(); hideTip(); }));
  $('#tokens').addEventListener('mousemove', e => { if (!tip.hidden) showTip(tip.innerHTML, e); });
  $('#code-rows').addEventListener('mousemove', e => { if (!tip.hidden) showTip(tip.innerHTML, e); });
  $('#tokens').addEventListener('mouseout', e => { if (!e.relatedTarget || !e.relatedTarget.closest('.tok')) hideTip(); });
  // наведение на текст: смещение по координатам моноширинной сетки
  let charW = 7.8;
  function measureChar() { const m = document.createElement('canvas').getContext('2d'); m.font = getComputedStyle(src).font; charW = m.measureText('жжжжжжжжжж').width / 10 || 7.8; }
  let srcHoverT = 0;
  src.addEventListener('mousemove', e => {
    const now = performance.now(); if (now - srcHoverT < 40) return; srcHoverT = now;
    const r = src.getBoundingClientRect();
    const line = Math.floor((e.clientY - r.top + src.scrollTop - 12) / 20), col = Math.round((e.clientX - r.left + src.scrollLeft - 8) / charW - 0.5);
    const lines = src.value.split('\n');
    if (line < 0 || line >= lines.length || col < 0 || col >= lines[line].length) { if (S.link) { clearLink(); renderHL(); } return; }
    let off = 0; for (let i = 0; i < line; i++) off += lines[i].length + 1;
    off += col;
    const n = nodeAt(off);
    if (n) linkSpan(n.start, n.end, n); else if (S.link) { clearLink(); renderHL(); }
  });
  src.addEventListener('mouseleave', () => { if (S.link) { clearLink(); renderHL(); } });
  // клик по узлу или команде — прокрутить исходник к нужному месту
  function revealSource(a) {
    const line = lineOf(a), top = (line - 1) * 20;
    src.scrollTop = Math.max(0, top - src.clientHeight * 0.35);
  }
  $('#ast-rows').addEventListener('click', e => { const el = e.target.closest('.an'); if (el) { const n = S.nodes.find(x => x.pre === +el.dataset.id); if (n) revealSource(n.start); } });
  $('#code-rows').addEventListener('click', e => { const el = e.target.closest('.ins'); if (el) { const ins = S.prog.code[+el.dataset.pc]; if (ins.span) revealSource(ins.span[0]); } });

  // ———————————————————— Управление ————————————————————
  const body = document.body;
  function setRunning(on) {
    S.running = on;
    body.classList.toggle('paused', !on);
    $('#run-label').textContent = on ? 'Пауза' : 'Пуск';
    renderVM();
  }
  $('#btn-run').addEventListener('click', () => {
    if (!vm.prog) return;
    if (vm.halted) { vmReset(); setRunning(true); return; }
    setRunning(!S.running);
  });
  function stepOnce() {
    if (!vm.prog) return;
    if (vm.halted) vmReset();
    setRunning(false);
    vmStep();
    const ins = !vm.halted ? vm.prog.code[vm.pc] : null;
    setHot(ins); renderHL(); renderGutter(); updateHeat(); renderVM(); follow();
  }
  $('#btn-step').addEventListener('click', stepOnce);
  $('#btn-reset').addEventListener('click', () => { vmReset(); lastHot = { pc: -1, node: -1, jump: -1 }; setHot(null); renderHL(); renderGutter(); updateHeat(); setRunning(true); });
  const speed = $('#speed'), speedOut = $('#speed-out');
  function setSpeed(i) {
    S.speed = i; speed.value = i;
    const v = SPEEDS[i];
    speedOut.textContent = v < 1 ? `1 команда за ${Math.round(1 / v)} кадров` : `${group(v)} ${plural(v, 'команда', 'команды', 'команд')}/кадр`;
    speed.style.setProperty('--p', (i / 9) * 100 + '%');
  }
  speed.addEventListener('input', () => setSpeed(+speed.value));
  speed.title = 'Сколько команд машина выполняет за кадр';

  // примеры
  const exBtn = $('#ex-btn'), exMenu = $('#ex-menu');
  exMenu.innerHTML = EXAMPLES.map((x, i) => `<button class="ex-item" role="option" data-i="${i}"><b>${esc(x.name)}</b><small>${esc(x.note)}</small></button>`).join('');
  function loadExample(i) {
    S.example = i;
    $('#ex-name').textContent = EXAMPLES[i].name;
    $$('.ex-item').forEach((b, k) => b.setAttribute('aria-selected', String(k === i)));
    src.value = EXAMPLES[i].code;
    src.scrollTop = 0;
    compile();
    setRunning(!!S.prog);
  }
  exBtn.addEventListener('click', e => { e.stopPropagation(); const open = exMenu.hidden; exMenu.hidden = !open; exBtn.setAttribute('aria-expanded', String(open)); });
  exMenu.addEventListener('click', e => { const b = e.target.closest('.ex-item'); if (!b) return; exMenu.hidden = true; exBtn.setAttribute('aria-expanded', 'false'); loadExample(+b.dataset.i); });
  document.addEventListener('click', e => { if (!e.target.closest('.examples')) { exMenu.hidden = true; exBtn.setAttribute('aria-expanded', 'false'); } });

  // живая компиляция при правке
  let editTimer = 0;
  src.addEventListener('input', () => {
    S.exec = null;
    renderHL(); renderGutter();
    clearTimeout(editTimer);
    editTimer = setTimeout(() => { compile(); if (S.prog) setRunning(true); }, 320);
  });
  src.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); const a = src.selectionStart, b = src.selectionEnd; src.setRangeText('  ', a, b, 'end'); src.dispatchEvent(new Event('input')); }
  });
  window.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('#btn-run').click(); }
    else if (e.key === 'F10') { e.preventDefault(); stepOnce(); }
    else if (e.key === 'Escape') { exMenu.hidden = true; hideTip(); }
  });

  // вкладки на телефоне
  $$('.tabs button').forEach(b => b.addEventListener('click', () => {
    body.dataset.tab = b.dataset.tab;
    $$('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    requestAnimationFrame(sizeCanvas);
  }));
  $$('.tabs button').forEach(x => x.setAttribute('aria-selected', String(x.dataset.tab === body.dataset.tab)));

  // ———————————————————— Главный цикл ————————————————————
  let frameNo = 0;
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    frameNo++;
    if (S.running && vm.prog && !vm.halted) {
      S.acc += SPEEDS[S.speed];
      let n = Math.floor(S.acc);
      S.acc -= n;
      const t0 = performance.now(), before = vm.steps;
      while (n-- > 0 && !vm.halted) {
        vmStep();
        if ((n & 1023) === 0 && performance.now() - t0 > 12) break;
      }
      if (vm.steps !== before) {
        setHot(!vm.halted ? vm.prog.code[vm.pc] : null);
        renderHL(); renderGutter(); renderVM(); follow();
        if (++heatTick % 6 === 0 || vm.halted) updateHeat();
      }
      if (vm.halted) { setHot(null); renderHL(); renderGutter(); setRunning(false); updateHeat(); }
    }
    paintTurtle();
  }

  // старт
  measureChar();
  if (document.fonts) document.fonts.ready.then(() => { measureChar(); renderHL(); });
  new ResizeObserver(() => sizeCanvas()).observe($('.canvas-wrap'));
  setSpeed(6);
  sizeCanvas();
  loadExample(0);
  // для обложки: промотать до того состояния, в котором машина была бы на MacBook через ~2,5 с
  if (window.__SHOT__ && vm.prog) {
    while (!vm.halted && vm.steps < 20000) vmStep();
    setHot(!vm.halted ? vm.prog.code[vm.pc] : null);
    renderHL(); renderGutter(); renderVM(); updateHeat(); follow();
  }
  requestAnimationFrame(frame);
})();
