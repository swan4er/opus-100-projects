/* КС-8 «Кремниевое сердце» — ядро: система команд, ассемблер, процессор.
   Файл подключается обычным <script> и работает и в браузере, и в Node (для тестов). */
(function (root) {
  'use strict';

  /* ── Архитектура ─────────────────────────────────────────────
     8 регистров R0–R7 по 8 бит, индексный регистр I (12 бит),
     указатель стека SP, счётчик команд PC, флаги Z (ноль), C (перенос/заём), N (знак).
     Память 4 КБ: 0x000–0xAFF программа и данные, 0xB00–0xBFF стек,
     0xC00–0xFFF видеопамять 32×32 (младшие 4 бита байта — цвет).
     Порты: IN 0 — клавиша (1↑ 2→ 3↓ 4← 5 пробел), IN 1 — случайный байт, IN 2 — номер кадра;
     OUT 2 — табло, OUT 3 — звук (0 — тишина), OUT 4 — линейка светодиодов. */

  const MEM_SIZE = 0x1000;
  const VRAM = 0xC00;
  const STACK_TOP = 0xBFF;
  const REG_NAMES = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'];

  // Форматы операндов: n — нет, r — регистр, rr — два регистра, ri — регистр и байт,
  // a — адрес, ra — регистр и адрес, ar — адрес и регистр, rI — регистр и [I], Ir — [I] и регистр,
  // rp — регистр и порт, pr — порт и регистр, i16 — 16-битное значение
  const OPS = [
    // mnem, base, form, size, класс для анимации тракта
    ['NOP', 0x00, 'n', 1, 'none'],
    ['HLT', 0x01, 'n', 1, 'none'],
    ['RET', 0x02, 'n', 1, 'stack'],
    ['WAIT', 0x03, 'n', 1, 'none'],
    ['JMP', 0x04, 'a', 3, 'jump'],
    ['JZ', 0x05, 'a', 3, 'jump'],
    ['JNZ', 0x06, 'a', 3, 'jump'],
    ['JC', 0x07, 'a', 3, 'jump'],
    ['JNC', 0x08, 'a', 3, 'jump'],
    ['JN', 0x09, 'a', 3, 'jump'],
    ['JNN', 0x0A, 'a', 3, 'jump'],
    ['CALL', 0x0B, 'a', 3, 'stack'],
    ['LDI', 0x0C, 'i16', 3, 'index'],
    ['INCI', 0x0D, 'n', 1, 'index'],
    ['PUSHI', 0x0E, 'n', 1, 'stack'],
    ['POPI', 0x0F, 'n', 1, 'stack'],
    ['MOV', 0x10, 'rr', 2, 'reg'],
    ['MOV', 0x18, 'ri', 2, 'reg'],
    ['LD', 0x20, 'ra', 3, 'load'],
    ['ST', 0x28, 'ar', 3, 'store'],
    ['LD', 0x30, 'rI', 1, 'load'],
    ['ST', 0x38, 'Ir', 1, 'store'],
    ['ADD', 0x40, 'rr', 2, 'alu'], ['ADD', 0x48, 'ri', 2, 'alu'],
    ['SUB', 0x50, 'rr', 2, 'alu'], ['SUB', 0x58, 'ri', 2, 'alu'],
    ['AND', 0x60, 'rr', 2, 'alu'], ['AND', 0x68, 'ri', 2, 'alu'],
    ['OR', 0x70, 'rr', 2, 'alu'], ['OR', 0x78, 'ri', 2, 'alu'],
    ['XOR', 0x80, 'rr', 2, 'alu'], ['XOR', 0x88, 'ri', 2, 'alu'],
    ['CMP', 0x90, 'rr', 2, 'alu'], ['CMP', 0x98, 'ri', 2, 'alu'],
    ['INC', 0xA0, 'r', 1, 'alu'],
    ['DEC', 0xA8, 'r', 1, 'alu'],
    ['SHL', 0xB0, 'r', 1, 'alu'],
    ['SHR', 0xB8, 'r', 1, 'alu'],
    ['PUSH', 0xC0, 'r', 1, 'stack'],
    ['POP', 0xC8, 'r', 1, 'stack'],
    ['IN', 0xD0, 'rp', 2, 'io'],
    ['OUT', 0xD8, 'pr', 2, 'io'],
    ['ADDI', 0xE0, 'r', 1, 'index'],
    ['VID', 0xE8, 'rr', 2, 'index'],
  ];
  const ALIASES = { JE: 'JZ', JNE: 'JNZ', JL: 'JC', JGE: 'JNC' };

  // Таблица декодирования: байт → описание команды
  const DECODE = new Array(256).fill(null);
  for (const [mnem, base, form, size, cls] of OPS) {
    const regForm = form[0] === 'r' || form === 'Ir' || form === 'ar' || form === 'pr';
    if (regForm) for (let r = 0; r < 8; r++) DECODE[base + r] = { mnem, base, form, size, cls, r };
    else DECODE[base] = { mnem, base, form, size, cls, r: 0 };
  }

  /* ── Ассемблер ───────────────────────────────────────────── */

  class AsmError extends Error {
    constructor(line, msg) { super(msg); this.line = line; }
  }

  function parseNumber(tok) {
    const t = tok.trim();
    if (/^'(\\?.)'$/.test(t)) return t.charCodeAt(1);
    if (/^-?0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
    if (/^-?0b[01]+$/i.test(t)) return t.startsWith('-') ? -parseInt(t.slice(3), 2) : parseInt(t.slice(2), 2);
    if (/^-?\d+$/.test(t)) return parseInt(t, 10);
    return null;
  }

  // Выражение: слагаемые через + и − (числа, метки, константы)
  function evalExpr(expr, symbols, line, pass) {
    const s = expr.replace(/\s+/g, '');
    if (!s) throw new AsmError(line, 'пустое выражение');
    const parts = s.match(/[+-]?[^+-]+/g);
    if (!parts) throw new AsmError(line, `не понимаю «${expr}»`);
    let v = 0;
    for (let p of parts) {
      let sign = 1;
      if (p[0] === '+') p = p.slice(1);
      else if (p[0] === '-') { sign = -1; p = p.slice(1); }
      let n = parseNumber(p);
      if (n === null) {
        const key = p.toUpperCase();
        if (key in symbols) n = symbols[key];
        else if (pass === 1) n = 0;
        else throw new AsmError(line, `неизвестная метка «${p}»`);
      }
      v += sign * n;
    }
    return v;
  }

  function splitOperands(str) {
    const out = [];
    let cur = '', q = false;
    for (const ch of str) {
      if (ch === '"') q = !q;
      if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  const isReg = (t) => /^R[0-7]$/i.test(t.trim());
  const regIdx = (t) => +t.trim()[1];
  const isMemI = (t) => /^\[\s*I\s*\]$/i.test(t.trim());
  const memInner = (t) => { const m = t.trim().match(/^\[(.*)\]$/); return m ? m[1] : null; };

  function assemble(src) {
    const lines = src.split('\n');
    const symbols = {};
    const errors = [];
    let bytes = null, lineOf = null;

    for (let pass = 1; pass <= 2; pass++) {
      bytes = new Uint8Array(MEM_SIZE);
      lineOf = new Int32Array(MEM_SIZE).fill(-1);
      let pc = 0;
      const emit = (b, ln) => {
        if (pc >= VRAM) throw new AsmError(ln, 'программа залезла в видеопамять (0xC00)');
        bytes[pc] = b & 0xFF;
        if (lineOf[pc] < 0) lineOf[pc] = ln;
        pc++;
      };
      for (let ln = 0; ln < lines.length; ln++) {
        let text = lines[ln];
        // комментарий, но не внутри строки
        let q = false, cut = text.length;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '"') q = !q;
          if (text[i] === ';' && !q) { cut = i; break; }
        }
        text = text.slice(0, cut).trim();
        if (!text) continue;
        try {
          // константа NAME = value
          let m = text.match(/^([A-Za-z_][\w]*)\s*=\s*(.+)$/);
          if (m) { symbols[m[1].toUpperCase()] = evalExpr(m[2], symbols, ln, 2); continue; }
          // метки
          while ((m = text.match(/^([A-Za-z_.][\w.]*):\s*(.*)$/))) {
            const name = m[1].toUpperCase();
            if (pass === 1 && name in symbols) throw new AsmError(ln, `метка «${m[1]}» уже есть`);
            symbols[name] = pc;
            text = m[2].trim();
          }
          if (!text) continue;
          const sp = text.search(/\s/);
          const head = (sp < 0 ? text : text.slice(0, sp)).toUpperCase();
          const rest = sp < 0 ? '' : text.slice(sp + 1).trim();
          const ops = splitOperands(rest);

          if (head === '.ORG') { pc = evalExpr(ops[0], symbols, ln, pass) & 0xFFF; continue; }
          if (head === '.EQU') { symbols[ops[0].toUpperCase()] = evalExpr(ops[1], symbols, ln, 2); continue; }
          if (head === '.DB') {
            for (const o of ops) {
              if (/^".*"$/.test(o)) for (const ch of o.slice(1, -1)) emit(ch.charCodeAt(0), ln);
              else emit(evalExpr(o, symbols, ln, pass), ln);
            }
            continue;
          }
          const mnem = ALIASES[head] || head;
          const cands = OPS.filter((o) => o[0] === mnem);
          if (!cands.length) throw new AsmError(ln, `нет такой команды «${head}»`);

          // выбор формы по операндам
          let form;
          const n = ops.length;
          if (n === 0) form = 'n';
          else if (n === 1) {
            if (isReg(ops[0])) form = 'r';
            else form = cands.some((c) => c[2] === 'i16') ? 'i16' : 'a';
          } else if (n === 2) {
            const [a, b] = ops;
            if (mnem === 'IN') form = 'rp';
            else if (mnem === 'OUT') form = 'pr';
            else if (isReg(a) && isReg(b)) form = 'rr';
            else if (isReg(a) && isMemI(b)) form = 'rI';
            else if (isMemI(a) && isReg(b)) form = 'Ir';
            else if (isReg(a) && memInner(b) !== null) form = 'ra';
            else if (memInner(a) !== null && isReg(b)) form = 'ar';
            else if (isReg(a)) form = 'ri';
            else throw new AsmError(ln, 'странные операнды');
          } else throw new AsmError(ln, 'слишком много операндов');

          const op = cands.find((c) => c[2] === form);
          if (!op) throw new AsmError(ln, `у ${mnem} нет формы с такими операндами`);
          const base = op[1];
          const num = (t) => evalExpr(t.replace(/^#/, ''), symbols, ln, pass);
          const byte = (v) => { if (pass === 2 && (v < -128 || v > 255)) throw new AsmError(ln, `число ${v} не влезает в байт`); return v & 0xFF; };
          switch (form) {
            case 'n': emit(base, ln); break;
            case 'r': emit(base + regIdx(ops[0]), ln); break;
            case 'rr': emit(base + regIdx(ops[0]), ln); emit(regIdx(ops[1]), ln); break;
            case 'ri': emit(base + regIdx(ops[0]), ln); emit(byte(num(ops[1])), ln); break;
            case 'rI': emit(base + regIdx(ops[0]), ln); break;
            case 'Ir': emit(base + regIdx(ops[1]), ln); break;
            case 'rp': emit(base + regIdx(ops[0]), ln); emit(byte(num(ops[1])), ln); break;
            case 'pr': emit(base + regIdx(ops[1]), ln); emit(byte(num(ops[0])), ln); break;
            case 'a': case 'i16': {
              const v = num(ops[0]) & 0xFFFF;
              emit(base, ln); emit(v & 0xFF, ln); emit(v >> 8, ln); break;
            }
            case 'ra': {
              const v = evalExpr(memInner(ops[1]), symbols, ln, pass) & 0xFFFF;
              emit(base + regIdx(ops[0]), ln); emit(v & 0xFF, ln); emit(v >> 8, ln); break;
            }
            case 'ar': {
              const v = evalExpr(memInner(ops[0]), symbols, ln, pass) & 0xFFFF;
              emit(base + regIdx(ops[1]), ln); emit(v & 0xFF, ln); emit(v >> 8, ln); break;
            }
          }
        } catch (e) {
          if (e instanceof AsmError) { if (pass === 2 || /уже есть|нет такой|странные|слишком|нет формы/.test(e.message)) errors.push({ line: e.line, msg: e.message }); }
          else throw e;
        }
      }
      if (pass === 1 && errors.length) break;
      var size = 0;
      for (let i = VRAM - 1; i >= 0; i--) if (lineOf[i] >= 0) { size = i + 1; break; }
    }
    const uniq = [];
    const seen = new Set();
    for (const e of errors) { const k = e.line + e.msg; if (!seen.has(k)) { seen.add(k); uniq.push(e); } }
    return { bytes, lineOf, symbols, errors: uniq, size: size || 0 };
  }

  /* ── Дизассемблер одной команды (для подписей на плате) ─────── */
  function disasm(mem, addr) {
    const op = DECODE[mem[addr & 0xFFF]];
    if (!op) return { text: `.DB 0x${hex2(mem[addr & 0xFFF])}`, size: 1 };
    const b1 = mem[(addr + 1) & 0xFFF], b2 = mem[(addr + 2) & 0xFFF];
    const R = REG_NAMES;
    let t = op.mnem;
    switch (op.form) {
      case 'r': t += ' ' + R[op.r]; break;
      case 'rr': t += ` ${R[op.r]}, ${R[b1 & 7]}`; break;
      case 'ri': t += ` ${R[op.r]}, ${b1}`; break;
      case 'rI': t += ` ${R[op.r]}, [I]`; break;
      case 'Ir': t += ` [I], ${R[op.r]}`; break;
      case 'rp': t += ` ${R[op.r]}, ${b1}`; break;
      case 'pr': t += ` ${b1}, ${R[op.r]}`; break;
      case 'a': case 'i16': t += ' 0x' + hex3(b1 | (b2 << 8)); break;
      case 'ra': t += ` ${R[op.r]}, [0x${hex3(b1 | (b2 << 8))}]`; break;
      case 'ar': t += ` [0x${hex3(b1 | (b2 << 8))}], ${R[op.r]}`; break;
    }
    return { text: t, size: op.size, op };
  }
  const hex2 = (v) => v.toString(16).toUpperCase().padStart(2, '0');
  const hex3 = (v) => v.toString(16).toUpperCase().padStart(3, '0');

  /* ── Процессор ───────────────────────────────────────────── */

  class CPU {
    constructor() {
      this.mem = new Uint8Array(MEM_SIZE);
      this.reads = new Float32Array(MEM_SIZE);   // «тепло» обращений — для карты памяти
      this.writes = new Float32Array(MEM_SIZE);
      this.activity = { fetch: 0, alu: 0, load: 0, store: 0, io: 0, stack: 0, jump: 0, index: 0, reg: 0 };
      this.out = { 2: 0, 3: 0, 4: 0 };
      this.key = 0;
      this.frame = 0;
      this.rng = 0x2F6B;
      this.reset();
    }
    reset() {
      this.r = new Uint8Array(8);
      this.I = 0; this.SP = STACK_TOP; this.PC = 0;
      this.Z = 0; this.C = 0; this.N = 0;
      this.halted = false; this.waiting = false;
      this.cycles = 0;
      this.last = null;       // последняя команда: для анимации тракта
      this.out[2] = 0; this.out[3] = 0; this.out[4] = 0;
    }
    load(bytes) {
      this.mem.set(bytes.subarray(0, VRAM));
      this.mem.fill(0, VRAM);
      this.reads.fill(0); this.writes.fill(0);
      this.reset();
    }
    random() {
      // xorshift16
      let x = this.rng;
      x ^= (x << 7) & 0xFFFF; x ^= x >> 9; x ^= (x << 8) & 0xFFFF;
      this.rng = x & 0xFFFF || 1;
      return this.rng & 0xFF;
    }
    rd(a) { a &= 0xFFF; this.reads[a] = 1; return this.mem[a]; }
    wr(a, v) { a &= 0xFFF; this.writes[a] = 1; this.mem[a] = v & 0xFF; }
    zn(v) { v &= 0xFF; this.Z = v === 0 ? 1 : 0; this.N = v >> 7; return v; }

    step() {
      if (this.halted || this.waiting) return false;
      const pc = this.PC;
      const opb = this.rd(pc);
      const op = DECODE[opb];
      const b1 = op && op.size > 1 ? this.rd(pc + 1) : 0;
      const b2 = op && op.size > 2 ? this.rd(pc + 2) : 0;
      this.activity.fetch++;
      if (!op) { this.halted = true; this.last = { pc, op: null }; return false; }
      this.PC = (pc + op.size) & 0xFFF;
      const r = this.r, ri = op.r;
      const a16 = (b1 | (b2 << 8)) & 0xFFF;
      let addr = -1, data = -1;
      this.activity[op.cls]++;
      switch (op.base) {
        case 0x00: break;
        case 0x01: this.halted = true; break;
        case 0x02: this.SP = (this.SP + 1) & 0xFFF; { const lo = this.rd(this.SP); this.SP = (this.SP + 1) & 0xFFF; const hi = this.rd(this.SP); this.PC = (lo | (hi << 8)) & 0xFFF; addr = this.SP; } break;
        case 0x03: this.waiting = true; break;
        case 0x04: this.PC = a16; break;
        case 0x05: if (this.Z) this.PC = a16; break;
        case 0x06: if (!this.Z) this.PC = a16; break;
        case 0x07: if (this.C) this.PC = a16; break;
        case 0x08: if (!this.C) this.PC = a16; break;
        case 0x09: if (this.N) this.PC = a16; break;
        case 0x0A: if (!this.N) this.PC = a16; break;
        case 0x0B: { const ret = this.PC; this.wr(this.SP, ret >> 8); this.SP = (this.SP - 1) & 0xFFF; this.wr(this.SP, ret & 0xFF); this.SP = (this.SP - 1) & 0xFFF; this.PC = a16; addr = this.SP; } break;
        case 0x0C: this.I = a16; break;
        case 0x0D: this.I = (this.I + 1) & 0xFFF; break;
        case 0x0E: this.wr(this.SP, this.I >> 8); this.SP = (this.SP - 1) & 0xFFF; this.wr(this.SP, this.I & 0xFF); this.SP = (this.SP - 1) & 0xFFF; addr = this.SP; break;
        case 0x0F: this.SP = (this.SP + 1) & 0xFFF; { const lo = this.rd(this.SP); this.SP = (this.SP + 1) & 0xFFF; const hi = this.rd(this.SP); this.I = (lo | (hi << 8)) & 0xFFF; addr = this.SP; } break;
        case 0x10: r[ri] = this.zn(r[b1 & 7]); data = r[ri]; break;
        case 0x18: r[ri] = this.zn(b1); data = b1; break;
        case 0x20: addr = a16; r[ri] = this.zn(this.rd(a16)); data = r[ri]; break;
        case 0x28: addr = a16; data = r[ri]; this.wr(a16, r[ri]); break;
        case 0x30: addr = this.I; r[ri] = this.zn(this.rd(this.I)); data = r[ri]; break;
        case 0x38: addr = this.I; data = r[ri]; this.wr(this.I, r[ri]); break;
        case 0x40: case 0x48: { const v = op.base === 0x40 ? r[b1 & 7] : b1; const s = r[ri] + v; this.C = s > 255 ? 1 : 0; r[ri] = this.zn(s); data = r[ri]; } break;
        case 0x50: case 0x58: { const v = op.base === 0x50 ? r[b1 & 7] : b1; const s = r[ri] - v; this.C = s < 0 ? 1 : 0; r[ri] = this.zn(s); data = r[ri]; } break;
        case 0x60: case 0x68: { const v = op.base === 0x60 ? r[b1 & 7] : b1; this.C = 0; r[ri] = this.zn(r[ri] & v); data = r[ri]; } break;
        case 0x70: case 0x78: { const v = op.base === 0x70 ? r[b1 & 7] : b1; this.C = 0; r[ri] = this.zn(r[ri] | v); data = r[ri]; } break;
        case 0x80: case 0x88: { const v = op.base === 0x80 ? r[b1 & 7] : b1; this.C = 0; r[ri] = this.zn(r[ri] ^ v); data = r[ri]; } break;
        case 0x90: case 0x98: { const v = op.base === 0x90 ? r[b1 & 7] : b1; const s = r[ri] - v; this.C = s < 0 ? 1 : 0; this.zn(s); data = s & 0xFF; } break;
        case 0xA0: r[ri] = this.zn(r[ri] + 1); data = r[ri]; break;
        case 0xA8: r[ri] = this.zn(r[ri] - 1); data = r[ri]; break;
        case 0xB0: this.C = r[ri] >> 7; r[ri] = this.zn(r[ri] << 1); data = r[ri]; break;
        case 0xB8: this.C = r[ri] & 1; r[ri] = this.zn(r[ri] >> 1); data = r[ri]; break;
        case 0xC0: addr = this.SP; data = r[ri]; this.wr(this.SP, r[ri]); this.SP = (this.SP - 1) & 0xFFF; break;
        case 0xC8: this.SP = (this.SP + 1) & 0xFFF; addr = this.SP; r[ri] = this.zn(this.rd(this.SP)); data = r[ri]; break;
        case 0xD0: {
          let v = 0;
          if (b1 === 0) { v = this.key; this.key = 0; }
          else if (b1 === 1) v = this.random();
          else if (b1 === 2) v = this.frame & 0xFF;
          r[ri] = this.zn(v); data = v;
        } break;
        case 0xD8: this.out[b1] = r[ri]; data = r[ri]; break;
        case 0xE0: this.I = (this.I + r[ri]) & 0xFFF; break;
        case 0xE8: this.I = VRAM + ((r[b1 & 7] & 31) << 5) + (r[ri] & 31); break;
      }
      this.cycles++;
      this.last = { pc, op, b1, b2, addr, data };
      return true;
    }
    // Выполнить до n команд; останавливается на WAIT (синхронизация с кадром) и HLT
    run(n) {
      let k = 0;
      while (k < n && !this.halted && !this.waiting) { this.step(); k++; }
      return k;
    }
    // Новый кадр дисплея: снимает ожидание WAIT
    tick() { this.frame = (this.frame + 1) & 0xFFFF; this.waiting = false; }
  }

  const api = { MEM_SIZE, VRAM, STACK_TOP, REG_NAMES, OPS, DECODE, assemble, disasm, CPU, hex2, hex3 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KS8 = api;
})(typeof window !== 'undefined' ? window : globalThis);
