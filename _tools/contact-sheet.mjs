// Контактный лист: обложки проектов сеткой 5×4 на одной картинке — для быстрого просмотра глазами.
//   node _tools/contact-sheet.mjs 1 20        → _shots/sheet-001-020.png
//   node _tools/contact-sheet.mjs 1 20 mobile → мобильные снимки вместо обложек
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Или списком: node _tools/contact-sheet.mjs list 18,38,58 [mobile]
const isList = process.argv[2] === 'list';
const pick = isList ? process.argv[3].split(',').map(Number) : null;
const [from = 1, to = 20] = isList ? [Math.min(...pick), Math.max(...pick)] : process.argv.slice(2, 4).map(Number);
const mobile = process.argv[4] === 'mobile';
const dirs = fs.readdirSync(ROOT).filter((d) => /^\d{3}-/.test(d)).sort()
  .filter((d) => (pick ? pick.includes(+d.slice(0, 3)) : +d.slice(0, 3) >= from && +d.slice(0, 3) <= to));

const cols = mobile ? 10 : 5;
const W = mobile ? 180 : 384, H = mobile ? 390 : 240, LAB = 22;
const rows = Math.max(1, Math.ceil(dirs.length / cols));
const tiles = [];
for (const [k, d] of dirs.entries()) {
  const src = mobile ? path.join(ROOT, '_shots', `${d}-mobile.png`) : path.join(ROOT, d, 'preview.jpg');
  const x = (k % cols) * W, y = Math.floor(k / cols) * (H + LAB);
  if (fs.existsSync(src)) {
    tiles.push({ input: await sharp(src).resize(W - 4, H - 4, { fit: 'cover', position: 'top' }).toBuffer(), left: x + 2, top: y + LAB });
  }
  const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${LAB}"><rect width="100%" height="100%" fill="#222"/><text x="6" y="16" font-family="DejaVu Sans Mono, monospace" font-size="13" fill="${fs.existsSync(src) ? '#eee' : '#f55'}">${d.slice(0, 34)}</text></svg>`);
  tiles.push({ input: label, left: x, top: y });
}
const out = path.join(ROOT, '_shots', `sheet-${isList ? 'list' : String(from).padStart(3, '0') + '-' + String(to).padStart(3, '0')}${mobile ? '-mobile' : ''}.png`);
await sharp({ create: { width: cols * W, height: rows * (H + LAB), channels: 3, background: '#111' } }).composite(tiles).png().toFile(out);
console.log(out);
