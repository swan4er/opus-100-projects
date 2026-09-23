// Собирает корневой index.html галереи из meta.json всех проектов.
//   node _tools/build-gallery.mjs
// Данные вшиваются прямо в страницу: в file:// браузер не даст загрузить JSON отдельным запросом.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (...p) => path.join(ROOT, ...p);
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const CAT_ACCENT = ['#7cffb2', '#ff9a3c', '#e8d44d', '#5ec8ff', '#ff5f7a', '#c89bff', '#ffd08a', '#e7c6a0', '#62e0c8', '#f2f2f2', '#ffb4a2', '#9be15d'];
const isColor = (c) => typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim());

// Запасные названия и описания — из IDEAS.md, если у проекта ещё нет meta.json
const ideas = {};
const md = fs.readFileSync(rel('IDEAS.md'), 'utf8');
for (const m of md.matchAll(/\*\*(\d{3}) · (.+?)\*\* — `(\d{3}-[a-z0-9-]+)`\n(.+)\n/g)) {
  const plain = (t) => t.replace(/\*\*?|`/g, '').trim();
  ideas[m[3]] = { n: +m[1], title: plain(m[2]), tagline: plain(m[4]) };
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(f));
    else out.push(f);
  }
  return out;
}

const qa = readJSON(rel('_shots', 'qa.json')) || {};
fs.mkdirSync(rel('_gallery', 'thumbs'), { recursive: true });

const dirs = fs.readdirSync(ROOT)
  .filter((d) => /^\d{3}-[a-z0-9-]+$/.test(d) && fs.existsSync(rel(d, 'index.html')))
  .sort();

const projects = [];
let loc = 0, bytes = 0, withMeta = 0;
for (const d of dirs) {
  const n = +d.slice(0, 3);
  const meta = readJSON(rel(d, 'meta.json'));
  // номера перемешаны, поэтому категорию берём из meta.json (поле cat проставлено при перемешивании)
  const cat = Number.isInteger(meta && meta.cat) ? meta.cat : Math.min(11, Math.floor((n - 1) / 10));
  if (meta) withMeta++;
  const m = meta || {};
  const idea = ideas[d] || {};

  let l = 0, b = 0;
  for (const f of walk(rel(d))) {
    if (!/\.(html|js|mjs|css|glsl|frag|vert)$/i.test(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    l += s.split('\n').length;
    b += Buffer.byteLength(s);
  }
  loc += l; bytes += b;

  let thumb = null;
  const prev = rel(d, 'preview.jpg');
  if (fs.existsSync(prev)) {
    const out = `_gallery/thumbs/${d.slice(0, 3)}.webp`;
    await sharp(prev).resize(640, 400, { fit: 'cover', position: 'centre' }).webp({ quality: 80 }).toFile(rel(out));
    thumb = `${out}?v=${Math.round(fs.statSync(prev).mtimeMs)}`;
  }

  projects.push({
    n, slug: d, cat,
    title: String(m.title || idea.title || d),
    tagline: String(m.tagline || idea.tagline || ''),
    tech: Array.isArray(m.tech) ? m.tech.map(String).slice(0, 6) : [],
    strength: String(m.strength || ''),
    controls: String(m.controls || ''),
    accent: isColor(m.accent) ? m.accent.trim() : CAT_ACCENT[cat],
    bg: isColor(m.bg) ? m.bg.trim() : '#161613',
    net: !!m.needsNetwork,
    thumb, loc: l, kb: Math.round(b / 1024),
    qa: qa[d] ?? null,
  });
}

const qaKeys = Object.keys(qa).filter((k) => dirs.includes(k));
const stats = {
  count: projects.length,
  main: projects.filter((p) => p.cat <= 9).length,
  films: projects.filter((p) => p.cat === 10).length,
  aiGames: projects.filter((p) => p.cat === 11).length,
  withMeta,
  loc,
  kb: Math.round(bytes / 1024),
  qaChecked: qaKeys.length === projects.length && projects.length > 0,
  qaErrors: qaKeys.filter((k) => qa[k] && qa[k].errors > 0).length,
  date: new Date().toLocaleDateString('ru-RU'),
  agents: 49, // 20 сборщиков + 9 доделывали после лимита + 10 аниматоров + 10 разработчиков игр с нейросетью
};

const safe = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const tpl = fs.readFileSync(rel('_tools', 'gallery.template.html'), 'utf8');
if (!tpl.includes('/*__DATA__*/[]') || !tpl.includes('/*__STATS__*/{}')) throw new Error('В шаблоне нет меток данных');
const html = tpl.replace('/*__DATA__*/[]', safe(projects)).replace('/*__STATS__*/{}', safe(stats));
fs.writeFileSync(rel('index.html'), html);
console.log(`Галерея: ${projects.length} проектов (meta.json у ${withMeta}), ${loc} строк, ${Math.round(bytes / 1024)} КБ, превью: ${projects.filter((p) => p.thumb).length}`);
