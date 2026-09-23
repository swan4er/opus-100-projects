// Проверка синтаксиса JS во всех проектах: отдельные .js и встроенные <script> в .html.
//   node _tools/syntax-check.mjs            — все проекты
//   node _tools/syntax-check.mjs 022 024    — только указанные номера
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.slice(2);
const dirs = fs.readdirSync(ROOT).filter((d) => /^\d{3}-[a-z0-9-]+$/.test(d)).sort()
  .filter((d) => !only.length || only.includes(d.slice(0, 3)));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'syn-'));

function check(code, isModule, label) {
  const f = path.join(tmp, `x${Math.random().toString(36).slice(2)}.${isModule ? 'mjs' : 'js'}`);
  fs.writeFileSync(f, code);
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); return null; }
  catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter((l) => l.trim()).slice(0, 4).join(' | ').replace(f, label);
    return msg;
  } finally { fs.rmSync(f, { force: true }); }
}

let bad = 0;
for (const d of dirs) {
  const errs = [];
  for (const file of fs.readdirSync(path.join(ROOT, d))) {
    const full = path.join(ROOT, d, file);
    if (file.endsWith('.js') || file.endsWith('.mjs')) {
      const e = check(fs.readFileSync(full, 'utf8'), file.endsWith('.mjs'), `${d}/${file}`);
      if (e) errs.push(e);
    } else if (file.endsWith('.html')) {
      const html = fs.readFileSync(full, 'utf8');
      let i = 0;
      for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        i++;
        const attrs = m[1];
        if (/\bsrc\s*=/.test(attrs) || /type\s*=\s*["']?(importmap|application\/json|text\/plain|x-shader[^"']*|text\/x-[^"']*)/i.test(attrs)) continue;
        if (/type\s*=\s*["']?[a-z]/i.test(attrs) && !/type\s*=\s*["']?(module|text\/javascript)/i.test(attrs)) continue;
        const isModule = /type\s*=\s*["']?module/i.test(attrs);
        const e = check(m[2], isModule, `${d}/${file} <script #${i}>`);
        if (e) errs.push(e);
      }
    }
  }
  if (errs.length) { bad++; console.log(`✗ ${d}\n   ${errs.join('\n   ')}`); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nПроверено ${dirs.length}, с синтаксическими ошибками: ${bad}`);
