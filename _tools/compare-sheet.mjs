// Сравнительный лист: слева обложка с сервера (программный рендер), справа снимок с настоящей видеокарты Mac.
//   node _tools/compare-sheet.mjs <папка со снимками mac> <вых. префикс>
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [macDir, outPrefix] = process.argv.slice(2);
const names = fs.readdirSync(macDir).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();
const W = 320, H = 200, LAB = 20, PER_ROW = 3, ROWS = 5;
const perSheet = PER_ROW * ROWS;
for (let s = 0; s * perSheet < names.length; s++) {
  const chunk = names.slice(s * perSheet, (s + 1) * perSheet);
  const tiles = [];
  for (const [k, n] of chunk.entries()) {
    const x = (k % PER_ROW) * W * 2, y = Math.floor(k / PER_ROW) * (H + LAB);
    const srv = path.join(ROOT, n, 'preview.jpg');
    const mac = path.join(macDir, n + '.png');
    for (const [j, src] of [srv, mac].entries()) {
      if (fs.existsSync(src)) tiles.push({ input: await sharp(src).resize(W - 4, H - 2, { fit: 'cover', position: 'top' }).toBuffer(), left: x + j * W + 2, top: y + LAB });
    }
    const label = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W * 2}" height="${LAB}"><rect width="100%" height="100%" fill="#222"/><text x="6" y="15" font-family="DejaVu Sans Mono, monospace" font-size="13" fill="#eee">${n.slice(0, 30)}  · сервер | Mac</text></svg>`);
    tiles.push({ input: label, left: x, top: y });
  }
  const rows = Math.ceil(chunk.length / PER_ROW);
  const out = `${outPrefix}-${s + 1}.png`;
  await sharp({ create: { width: PER_ROW * W * 2, height: rows * (H + LAB), channels: 3, background: '#111' } }).composite(tiles).png().toFile(out);
  console.log(out);
}
