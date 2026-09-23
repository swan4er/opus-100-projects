// Общий прогон проверки: каждый проект снимается на десктопе и мобильном, результат пишется в _shots/qa.json.
//   node _tools/qa-all.mjs                 — все проекты, где есть meta.json и README.md
//   node _tools/qa-all.mjs 001 017         — только указанные номера
//   node _tools/qa-all.mjs --covers ...    — снимать без тега: заодно обновить обложки preview.jpg
// Параллельность задаёт QA_WORKERS (по умолчанию 1): очередь снимков общая с агентами.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const covers = args.includes('--covers');
const only = args.filter((a) => /^\d{3}$/.test(a));
const workers = Number(process.env.QA_WORKERS || 1);
// Тяжёлым и «проявляющимся» сценам нужно больше времени до снимка
const WAIT = { '114': 20000, '041': 20000, '080': 8000, '061': 8000, '022': 6000, '086': 6000, '076': 6000 };

// 082 тянет живую сетку Open-Meteo: одна загрузка = 1028 вызовов из 10 000 в сутки. Снимаем только по явному номеру.
const SKIP = new Set(['115']);
const dirs = fs.readdirSync(ROOT)
  .filter((d) => /^\d{3}-[a-z0-9-]+$/.test(d) && fs.existsSync(path.join(ROOT, d, 'index.html')))
  .filter((d) => (only.length ? only.includes(d.slice(0, 3)) : !SKIP.has(d.slice(0, 3)) && fs.existsSync(path.join(ROOT, d, 'meta.json')) && fs.existsSync(path.join(ROOT, d, 'README.md'))))
  .sort();

const qaFile = path.join(ROOT, '_shots', 'qa.json');
const readQa = () => { try { return JSON.parse(fs.readFileSync(qaFile, 'utf8')); } catch { return {}; } };

function shoot(d) {
  const wait = String(WAIT[d.slice(0, 3)] || 5000);
  const a = covers ? [d, '--wait', wait] : [d, '--tag', 'qa', '--wait', wait];
  return new Promise((resolve) => {
    const p = spawn(path.join(ROOT, '_tools', 'shot'), a, { cwd: ROOT });
    let out = '';
    p.stdout.on('data', (b) => (out += b));
    p.stderr.on('data', (b) => (out += b));
    p.on('close', (code) => {
      const problems = out.split('\n').filter((l) => /^\s+\[(desktop|mobile)\]/.test(l)).map((l) => l.trim());
      resolve({ code, problems, tail: out.trim().split('\n').slice(-2).join(' ') });
    });
  });
}

let i = 0;
async function worker() {
  while (i < dirs.length) {
    const d = dirs[i++];
    const t = Date.now();
    const { code, problems, tail } = await shoot(d);
    const qa = readQa(); // перечитываем: параллельные воркеры пишут в тот же файл
    qa[d] = { errors: code === 0 ? 0 : Math.max(1, problems.length), code, problems: problems.slice(0, 12), at: new Date().toISOString() };
    fs.writeFileSync(qaFile, JSON.stringify(qa, null, 1));
    console.log(`${d}: ${code === 0 ? 'OK' : `ПРОБЛЕМЫ (код ${code})`} ${Math.round((Date.now() - t) / 1000)} с`);
    for (const p of problems.slice(0, 5)) console.log('   ' + p);
    if (code !== 0 && !problems.length) console.log('   ' + tail);
  }
}
await Promise.all(Array.from({ length: workers }, worker));
const qa = readQa();
const bad = dirs.filter((d) => qa[d]?.errors);
console.log(`\nИтог: ${dirs.length - bad.length}/${dirs.length} без ошибок${bad.length ? '; с ошибками: ' + bad.join(', ') : ''}`);
