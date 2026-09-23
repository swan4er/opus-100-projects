/* ================================================================
   tex.js — процедурные текстуры квартиры (Canvas 2D).
   Всё рисуется кодом: обои, ковёр, паркет «ёлочкой», плитка,
   фасады, календарь 1975 года, настроечная таблица телевизора.
   THREE появляется позже, в KR_BOOT (см. game.js).
   ================================================================ */
'use strict';
let THREE = null;           // пространство имён three.js (выставляет KR_BOOT)
let LIB = null;             // дополнения three.js (RoomEnvironment и т. п.)
const TX = {};              // кэш готовых текстур

function rnd(seed) { let s = (seed >>> 0) || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
// холсты рисуются на процессоре: так быстрее для тысяч мелких операций и чтения пикселей
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; ctx2d(c); return c; }
function toTex(c, rx = 1, ry = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// зерно: одним проходом по пикселям (в сотни раз быстрее тысяч fillRect)
function speckle(g, w, h, n, r, a = 0.06) {
  const amp = Math.min(90, 255 * a * 1.6 * Math.min(1.6, n / (w * h) * 60 + 0.4));
  const im = g.getImageData(0, 0, w, h), d = im.data;
  let s = (r() * 4294967295) >>> 0 || 1;
  for (let i = 0; i < d.length; i += 4) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const v = ((s >>> 0) / 4294967296 - 0.5) * amp;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  }
  g.putImageData(im, 0, 0);
}
function blotches(g, w, h, n, r, color, a = 0.05, rmin = 20, rmax = 120) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = rmin + r() * (rmax - rmin);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, color.replace('A', a * (0.4 + r() * 0.6)));
    gr.addColorStop(1, color.replace('A', 0));
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
// рисовать фигуру с «обёрткой» по краям, чтобы текстура была бесшовной
function wrapDraw(w, h, x, y, pad, fn) {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
    if (x + dx < -pad || x + dx > w + pad || y + dy < -pad || y + dy > h + pad) continue;
    fn(x + dx, y + dy);
  }
}
function flower5(g, x, y, R, petal, center, rot = 0) {
  for (let i = 0; i < 5; i++) {
    const a = rot + i * Math.PI * 2 / 5;
    g.fillStyle = petal;
    g.beginPath(); g.ellipse(x + Math.cos(a) * R * 0.55, y + Math.sin(a) * R * 0.55, R * 0.55, R * 0.38, a, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = center; g.beginPath(); g.arc(x, y, R * 0.28, 0, Math.PI * 2); g.fill();
}
function leaf(g, x, y, len, wid, ang, col) {
  g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = col;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -wid, len, 0); g.quadraticCurveTo(len * 0.5, wid, 0, 0); g.fill();
  g.restore();
}

/* ---------- старые обои зала: выцветший беж, букетики, полоски ---------- */
function texWallOld() {
  const S = 512, c = cnv(S, S), g = c.getContext('2d'), r = rnd(11);
  g.fillStyle = '#d6c49e'; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 128) {
    g.fillStyle = 'rgba(140,105,60,0.13)'; g.fillRect(x + 50, 0, 26, S);
    g.fillStyle = 'rgba(140,105,60,0.10)'; g.fillRect(x + 44, 0, 3, S); g.fillRect(x + 79, 0, 3, S);
    g.fillStyle = 'rgba(255,250,235,0.18)'; g.fillRect(x + 8, 0, 10, S);
  }
  const bouquet = (cx, cy) => {
    g.strokeStyle = 'rgba(95,90,50,0.75)'; g.lineWidth = 2.2;
    for (const a of [-0.35, 0, 0.35]) { g.beginPath(); g.moveTo(cx, cy + 34); g.quadraticCurveTo(cx + a * 20, cy + 10, cx + a * 40, cy - 12); g.stroke(); }
    leaf(g, cx, cy + 22, 22, 6, -2.4, 'rgba(96,110,62,0.8)');
    leaf(g, cx, cy + 20, 22, 6, -0.7, 'rgba(96,110,62,0.8)');
    flower5(g, cx - 14, cy - 12, 13, 'rgba(160,82,70,0.78)', 'rgba(90,50,30,0.9)', 0.3);
    flower5(g, cx + 14, cy - 12, 11, 'rgba(178,112,86,0.78)', 'rgba(90,50,30,0.9)', 1.0);
    flower5(g, cx, cy - 22, 12, 'rgba(150,70,64,0.8)', 'rgba(90,50,30,0.9)', 0.7);
  };
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++)
    wrapDraw(S, S, i * 128 + ((j % 2) ? 64 : 0) + 0, j * 128 + 64, 60, (x, y) => bouquet(x, y));
  blotches(g, S, S, 8, r, 'rgba(120,90,40,A)', 0.07);
  speckle(g, S, S, 5000, r, 0.07);
  return c;
}

/* ---------- новые обои «в цветочек»: маки и птички, у узора есть верх ---------- */
function texWallNew() {
  const S = 512, c = cnv(S, S), g = c.getContext('2d'), r = rnd(21);
  g.fillStyle = '#f2e6c9'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) { g.fillStyle = 'rgba(200,170,120,0.25)'; g.fillRect(r() * S, r() * S, 2, 2); }
  const poppy = (x, y) => {
    g.strokeStyle = '#4b7a3b'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x, y + 8); g.bezierCurveTo(x - 10, y + 50, x + 12, y + 80, x + 2, y + 118); g.stroke();
    leaf(g, x + 1, y + 70, 42, 11, -2.6, '#5b8a44');
    leaf(g, x + 4, y + 92, 40, 10, -0.5, '#4b7a3b');
    // бутон-чашечка сверху — у цветка ясно, где верх
    g.fillStyle = '#c3352b';
    g.beginPath(); g.moveTo(x - 30, y - 6); g.bezierCurveTo(x - 36, y - 44, x - 8, y - 50, x, y - 34); g.bezierCurveTo(x + 8, y - 50, x + 36, y - 44, x + 30, y - 6); g.quadraticCurveTo(x, y + 18, x - 30, y - 6); g.fill();
    g.fillStyle = '#8f1f1a'; g.beginPath(); g.moveTo(x - 6, y - 30); g.quadraticCurveTo(x, y - 6, x + 6, y - 30); g.fill();
    g.fillStyle = '#2b2118'; g.beginPath(); g.arc(x, y - 4, 7, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 7; k++) { const a = -Math.PI + k * Math.PI / 6; g.fillRect(x + Math.cos(a) * 11 - 1.5, y - 4 + Math.sin(a) * 11 - 1.5, 3, 3); }
  };
  const bird = (x, y) => {
    g.strokeStyle = '#6b4a2e'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x - 44, y + 24); g.quadraticCurveTo(x, y + 14, x + 44, y + 22); g.stroke();
    leaf(g, x - 30, y + 21, 18, 6, -1.2, '#5b8a44'); leaf(g, x + 28, y + 19, 18, 6, -2.1, '#5b8a44');
    g.fillStyle = '#4c6a88'; g.beginPath(); g.ellipse(x, y, 20, 13, -0.15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e07a3a'; g.beginPath(); g.ellipse(x + 8, y + 4, 10, 8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4c6a88'; g.beginPath(); g.arc(x + 17, y - 10, 9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d9a441'; g.beginPath(); g.moveTo(x + 25, y - 12); g.lineTo(x + 34, y - 9); g.lineTo(x + 25, y - 7); g.fill();
    g.fillStyle = '#1d1712'; g.beginPath(); g.arc(x + 19, y - 12, 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a5470'; g.beginPath(); g.moveTo(x - 16, y - 3); g.lineTo(x - 36, y - 14); g.lineTo(x - 30, y + 4); g.fill();
    g.strokeStyle = '#6b4a2e'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 2, y + 12); g.lineTo(x - 4, y + 20); g.moveTo(x + 6, y + 12); g.lineTo(x + 6, y + 20); g.stroke();
  };
  wrapDraw(S, S, 128, 104, 130, poppy); wrapDraw(S, S, 384, 360, 130, poppy);
  wrapDraw(S, S, 384, 120, 60, bird); wrapDraw(S, S, 128, 376, 60, bird);
  for (const [x, y] of [[250, 250], [10, 250], [250, 10], [10, 10]])
    wrapDraw(S, S, x, y, 20, (a, b) => flower5(g, a, b, 9, '#e8b04a', '#8f1f1a', 0.4));
  return c;
}

/* ---------- ковёр на стену: красное поле, медальон, бордюры ---------- */
function texCarpet() {
  const W = 1024, H = 680, c = cnv(W, H), g = c.getContext('2d'), r = rnd(5);
  const red = '#8a1b1d', dark = '#1c1d36', cream = '#e3cfa2', gold = '#c08434', rose = '#b24a45', teal = '#285a55';
  g.fillStyle = dark; g.fillRect(0, 0, W, H);
  const frame = (m, col) => { g.fillStyle = col; g.fillRect(m, m, W - 2 * m, H - 2 * m); };
  frame(10, cream); frame(18, dark); frame(26, red); frame(86, cream); frame(92, dark); frame(100, red);
  // бордюр: ромбики и крючки по периметру
  const borderMotif = (x, y, s) => {
    g.fillStyle = cream; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.fill();
    g.fillStyle = dark; g.beginPath(); g.moveTo(x, y - s * 0.6); g.lineTo(x + s * 0.6, y); g.lineTo(x, y + s * 0.6); g.lineTo(x - s * 0.6, y); g.fill();
    g.fillStyle = gold; g.fillRect(x - 4, y - 4, 8, 8);
  };
  for (let x = 58; x < W - 40; x += 46) { borderMotif(x, 56, 18); borderMotif(x, H - 56, 18); }
  for (let y = 102; y < H - 80; y += 46) { borderMotif(56, y, 18); borderMotif(W - 56, y, 18); }
  // ступенчатый ромб (как на кавказских коврах)
  const stepDiamond = (cx, cy, rx, ry, col, step = 10) => {
    g.fillStyle = col;
    for (let y = -ry; y <= ry; y += step) {
      const w = rx * (1 - Math.abs(y) / ry);
      g.fillRect(cx - Math.ceil(w / step) * step, cy + y - step / 2, Math.ceil(w / step) * step * 2, step);
    }
  };
  const medallion = (cx, cy, k) => {
    const layers = [[dark, 1], [cream, 0.88], [rose, 0.76], [dark, 0.64], [gold, 0.52], [red, 0.42], [cream, 0.3], [teal, 0.2], [gold, 0.1]];
    for (const [col, f] of layers) stepDiamond(cx, cy, 220 * k * f, 150 * k * f, col, 8);
    // крючки на концах
    g.fillStyle = cream;
    for (const s of [-1, 1]) {
      g.fillRect(cx + s * 222 * k - 8, cy - 24, 16, 48);
      g.fillRect(cx + s * 222 * k - 8 + s * 12, cy - 24, 16, 12);
      g.fillRect(cx - 8, cy + s * 152 * k - (s > 0 ? 0 : 16), 16, 16);
    }
  };
  medallion(W / 2, H / 2, 1);
  // угловые четверти медальонов
  g.save(); g.beginPath(); g.rect(100, 100, W - 200, H - 200); g.clip();
  for (const [x, y] of [[100, 100], [W - 100, 100], [100, H - 100], [W - 100, H - 100]]) medallion(x, y, 0.55);
  g.restore();
  // мелкие звёздочки на поле
  const star = (x, y, s, col) => { g.fillStyle = col; g.fillRect(x - s, y - s / 3, 2 * s, 2 * s / 3); g.fillRect(x - s / 3, y - s, 2 * s / 3, 2 * s); };
  for (const [x, y] of [[250, 200], [W - 250, 200], [250, H - 200], [W - 250, H - 200], [180, H / 2], [W - 180, H / 2], [W / 2, 150], [W / 2, H - 150]]) {
    star(x, y, 16, cream); star(x, y, 8, rose); star(x, y, 3, dark);
  }
  // ворс и потёртости
  for (let y = 0; y < H; y += 3) { g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`; g.fillRect(0, y, W, 1); }
  speckle(g, W, H, 26000, r, 0.12);
  blotches(g, W, H, 5, r, 'rgba(255,230,200,A)', 0.07, 60, 200);
  return c;
}
// бахрома ковра (с прозрачностью)
function texFringe() {
  const c = cnv(256, 32), g = c.getContext('2d'), r = rnd(9);
  for (let x = 0; x < 256; x += 3) { g.strokeStyle = `rgba(${220 + r() * 20},${200 + r() * 20},${160 + r() * 20},1)`; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 4, 20 + r() * 12); g.stroke(); }
  return c;
}
/* ---------- палас на пол ---------- */
function texRug() {
  const W = 512, H = 340, c = cnv(W, H), g = c.getContext('2d'), r = rnd(15);
  g.fillStyle = '#3d4a36'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#b8a67a'; g.fillRect(14, 14, W - 28, H - 28);
  g.fillStyle = '#566246'; g.fillRect(26, 26, W - 52, H - 52);
  g.strokeStyle = '#c9b88a'; g.lineWidth = 4;
  for (let i = 0; i < 5; i++) { g.strokeRect(46 + i * 24, 46 + i * 18, W - 92 - i * 48, H - 92 - i * 36); }
  g.fillStyle = '#8e3b2e'; g.beginPath(); g.ellipse(W / 2, H / 2, 60, 40, 0, 0, Math.PI * 2); g.fill();
  flower5(g, W / 2, H / 2, 30, '#d8c08a', '#3d4a36', 0);
  speckle(g, W, H, 12000, r, 0.14);
  return c;
}

/* ---------- паркет «ёлочкой»: 1 м × 1 м, бесшовно ---------- */
function texParquet() {
  const S = 1024, c = cnv(S, S), g = c.getContext('2d'), r = rnd(3);
  const cols = 4, cw = S / cols, rows = 12, rh = S / rows;
  g.fillStyle = '#3a2211'; g.fillRect(0, 0, S, S);
  for (let ci = 0; ci < cols; ci++) {
    const s = ci % 2 ? -1 : 1;
    for (let ri = -4; ri < rows + 4; ri++) {
      const xL = ci * cw, xR = xL + cw, yL = ri * rh, yR = yL - s * cw;
      const l = 30 + r() * 14, sat = 42 + r() * 14, hue = 24 + r() * 8;
      g.save();
      g.beginPath(); g.moveTo(xL, yL); g.lineTo(xR, yR); g.lineTo(xR, yR + rh); g.lineTo(xL, yL + rh); g.closePath();
      g.fillStyle = `hsl(${hue},${sat}%,${l}%)`; g.fill();
      g.clip();
      for (let k = 0; k < 7; k++) {
        const off = r() * rh;
        g.strokeStyle = `rgba(${r() < 0.5 ? '40,20,8' : '255,220,170'},${0.08 + r() * 0.1})`;
        g.lineWidth = 0.8 + r() * 1.4;
        g.beginPath(); g.moveTo(xL, yL + off); g.lineTo(xR, yR + off + (r() - 0.5) * 6); g.stroke();
      }
      g.restore();
      g.strokeStyle = 'rgba(30,14,5,0.75)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(xL, yL); g.lineTo(xR, yR); g.lineTo(xR, yR + rh); g.stroke();
    }
  }
  blotches(g, S, S, 7, r, 'rgba(20,10,0,A)', 0.12, 80, 260);
  speckle(g, S, S, 9000, r, 0.08);
  return c;
}
/* ---------- линолеум кухни «под плитку» ---------- */
function texLinoKitchen() {
  const S = 512, c = cnv(S, S), g = c.getContext('2d'), r = rnd(31);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const v = (i + j) % 2 ? 0 : 1;
    g.fillStyle = v ? '#c9b99a' : '#b8a684'; g.fillRect(i * 128, j * 128, 128, 128);
    for (let k = 0; k < 5; k++) { g.strokeStyle = 'rgba(120,100,70,0.18)'; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(i * 128 + r() * 128, j * 128); g.bezierCurveTo(i * 128 + r() * 128, j * 128 + 40, i * 128 + r() * 128, j * 128 + 90, i * 128 + r() * 128, j * 128 + 128); g.stroke(); }
  }
  g.strokeStyle = 'rgba(80,60,40,0.45)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, S); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(S, i * 128); g.stroke(); }
  blotches(g, S, S, 5, r, 'rgba(60,40,20,A)', 0.1, 40, 140);
  speckle(g, S, S, 6000, r, 0.08);
  return c;
}
/* ---------- линолеум прихожей: красно-коричневый с решёткой ---------- */
function texLinoHall() {
  const S = 512, c = cnv(S, S), g = c.getContext('2d'), r = rnd(41);
  g.fillStyle = '#6e3a26'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(214,160,110,0.35)'; g.lineWidth = 6;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const x = i * 128 + 64, y = j * 128 + 64;
    g.beginPath(); g.moveTo(x, y - 48); g.lineTo(x + 48, y); g.lineTo(x, y + 48); g.lineTo(x - 48, y); g.closePath(); g.stroke();
  }
  g.fillStyle = 'rgba(214,160,110,0.4)';
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { g.beginPath(); g.arc(i * 128, j * 128, 9, 0, Math.PI * 2); g.fill(); }
  blotches(g, S, S, 6, r, 'rgba(20,8,0,A)', 0.14, 50, 160);
  speckle(g, S, S, 8000, r, 0.08);
  return c;
}
/* ---------- пол ванной: мелкая «метлахская» плитка ---------- */
function texBathFloor() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(51);
  g.fillStyle = '#8a8378'; g.fillRect(0, 0, S, S);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const v = (i + j) % 2;
    g.fillStyle = v ? `hsl(18,${40 + r() * 10}%,${40 + r() * 5}%)` : `hsl(40,${30 + r() * 8}%,${78 + r() * 5}%)`;
    g.fillRect(i * 32 + 1.5, j * 32 + 1.5, 29, 29);
  }
  speckle(g, S, S, 3000, r, 0.1);
  return c;
}
/* ---------- старая бирюзовая плитка ванной ---------- */
function texTileOld() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(61);
  g.fillStyle = '#e9ece6'; g.fillRect(0, 0, S, S);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    g.fillStyle = `hsl(${176 + r() * 6},${34 + r() * 8}%,${62 + r() * 6}%)`;
    g.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(i * 64 + 4, j * 64 + 4, 56, 8);
  }
  g.strokeStyle = 'rgba(40,60,60,0.5)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(70, 70); g.lineTo(96, 88); g.lineTo(104, 124); g.stroke();
  speckle(g, S, S, 1500, r, 0.08);
  return c;
}
/* ---------- голая стена под плитку: цемент, следы гребёнки ---------- */
function texPlaster() {
  const S = 512, c = cnv(S, S), g = c.getContext('2d'), r = rnd(71);
  g.fillStyle = '#9a968c'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 15, r, 'rgba(70,66,58,A)', 0.2, 30, 110);
  blotches(g, S, S, 10, r, 'rgba(200,196,186,A)', 0.2, 30, 90);
  for (let k = 0; k < 9; k++) {
    const y0 = r() * S, x0 = r() * S, len = 120 + r() * 200;
    for (let t = 0; t < 7; t++) { g.strokeStyle = 'rgba(60,58,52,0.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y0 + t * 9); g.bezierCurveTo(x0 + len * 0.3, y0 + t * 9 - 12, x0 + len * 0.6, y0 + t * 9 + 12, x0 + len, y0 + t * 9); g.stroke(); }
  }
  speckle(g, S, S, 14000, r, 0.14);
  return c;
}
/* ---------- новая плитка: кремовая, с прожилками; декор с корабликом ---------- */
function texTileNew(decor) {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(decor ? 83 : 81);
  const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, '#f4efe4'); gr.addColorStop(1, '#e6dccb');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  for (let k = 0; k < 6; k++) { g.strokeStyle = `rgba(150,140,120,${0.1 + r() * 0.15})`; g.lineWidth = 0.6 + r() * 1.2; g.beginPath(); g.moveTo(r() * S, 0); g.bezierCurveTo(r() * S, S * 0.3, r() * S, S * 0.7, r() * S, S); g.stroke(); }
  if (decor) {
    // кораблик на волнах: у рисунка есть верх
    g.fillStyle = '#2d5f9a';
    g.beginPath(); g.moveTo(60, 150); g.lineTo(196, 150); g.lineTo(172, 184); g.lineTo(84, 184); g.closePath(); g.fill();
    g.fillStyle = '#e8eef5'; g.beginPath(); g.moveTo(128, 50); g.lineTo(128, 142); g.lineTo(70, 142); g.closePath(); g.fill();
    g.fillStyle = '#c3352b'; g.beginPath(); g.moveTo(134, 64); g.lineTo(134, 142); g.lineTo(184, 142); g.closePath(); g.fill();
    g.strokeStyle = '#2d5f9a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(128, 40); g.lineTo(128, 150); g.stroke();
    g.lineWidth = 6;
    for (let y = 204; y < 240; y += 18) { g.beginPath(); for (let x = 24; x <= 232; x += 4) g.lineTo(x, y + Math.sin(x / 16) * 5); g.stroke(); }
    g.fillStyle = '#d9a441'; g.beginPath(); g.arc(206, 56, 16, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.strokeRect(4, 4, S - 8, S - 8);
  return c;
}
/* ---------- побелка потолка ---------- */
function texCeiling() {
  const S = 512, c = cnv(S, S), g = c.getContext('2d'), r = rnd(91);
  g.fillStyle = '#ece6da'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 15, r, 'rgba(160,150,130,A)', 0.08, 30, 160);
  speckle(g, S, S, 6000, r, 0.05);
  return c;
}
/* ---------- кухня: масляная краска до 1,5 м, побелка выше ---------- */
function texKitchenWall() {
  const W = 256, H = 500, c = cnv(W, H), g = c.getContext('2d'), r = rnd(101);
  const cut = H * (1 - 1.5 / 2.5);
  g.fillStyle = '#e8e2d4'; g.fillRect(0, 0, W, cut);
  g.fillStyle = '#93b39a'; g.fillRect(0, cut, W, H - cut);
  g.fillStyle = '#4f6f5a'; g.fillRect(0, cut - 2, W, 5);
  blotches(g, W, cut, 5, r, 'rgba(150,140,120,A)', 0.08, 20, 80);
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(r() * W, cut + r() * (H - cut), 1, 20 + r() * 40); }
  speckle(g, W, H, 3000, r, 0.06);
  return c;
}
/* ---------- обои прихожей: 70-е, круги ---------- */
function texWallHall() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(111);
  g.fillStyle = '#c7a576'; g.fillRect(0, 0, S, S);
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const x = i * 128 + 64, y = j * 128 + 64, alt = (i + j) % 2;
    for (let k = 5; k > 0; k--) { g.fillStyle = k % 2 ? (alt ? '#a95b2a' : '#6a4a2c') : '#d9b98a'; g.beginPath(); g.arc(x, y, k * 11, 0, Math.PI * 2); g.fill(); }
  }
  blotches(g, S, S, 4, r, 'rgba(90,60,30,A)', 0.1, 30, 90);
  speckle(g, S, S, 3000, r, 0.07);
  return c;
}
function texBathWall() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(121);
  g.fillStyle = '#bccfd4'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 6, r, 'rgba(90,110,110,A)', 0.1, 20, 90);
  speckle(g, S, S, 3000, r, 0.06);
  return c;
}
/* ---------- дерево: полированный орех, светлое дерево ---------- */
function texWood(base, seed, lines = 70) {
  const S = 512, c = cnv(S, S), g = c.getContext('2d'), r = rnd(seed);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < lines; i++) {
    const y = r() * S, amp = 4 + r() * 18, ph = r() * 6;
    g.strokeStyle = r() < 0.6 ? `rgba(30,12,4,${0.1 + r() * 0.2})` : `rgba(255,210,160,${0.05 + r() * 0.08})`;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let x = 0; x <= S; x += 8) g.lineTo(x, y + Math.sin(x / 70 + ph) * amp + Math.sin(x / 23 + ph * 2) * amp * 0.2);
    g.stroke();
  }
  speckle(g, S, S, 4000, r, 0.05);
  return c;
}
/* ---------- обивка дивана ---------- */
function texFabric() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(131);
  g.fillStyle = '#7c4b2a'; g.fillRect(0, 0, S, S);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    g.fillStyle = (i + j) % 2 ? '#8e5a33' : '#6d4024';
    g.beginPath(); g.moveTo(i * 32 + 16, j * 32 + 4); g.lineTo(i * 32 + 28, j * 32 + 16); g.lineTo(i * 32 + 16, j * 32 + 28); g.lineTo(i * 32 + 4, j * 32 + 16); g.fill();
  }
  for (let y = 0; y < S; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.05})`; g.fillRect(0, y, S, 1); }
  speckle(g, S, S, 5000, r, 0.12);
  return c;
}
/* ---------- шторы: плотная ткань и тюль ---------- */
function texCurtain() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(141);
  g.fillStyle = '#b07a2c'; g.fillRect(0, 0, S, S);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    g.fillStyle = 'rgba(120,70,20,0.45)';
    g.beginPath(); g.ellipse(i * 64 + 32 + (j % 2) * 32, j * 64 + 32, 12, 20, 0, 0, Math.PI * 2); g.fill();
  }
  speckle(g, S, S, 3000, r, 0.1);
  return c;
}
function texTulle() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,0.42)'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = i * 64 + 32, y = j * 64 + 32;
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); } g.closePath(); g.stroke();
    g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.stroke();
  }
  return c;
}
/* ---------- кружевная салфетка ---------- */
function texDoily() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d');
  g.translate(128, 128);
  g.fillStyle = '#f4f0e6';
  g.beginPath(); for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2, R = 118 + (k % 2 ? -10 : 6); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); } g.closePath(); g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let ring = 1; ring < 5; ring++) for (let k = 0; k < ring * 8; k++) {
    const a = k / (ring * 8) * Math.PI * 2, R = ring * 24;
    g.beginPath(); g.arc(Math.cos(a) * R, Math.sin(a) * R, 5, 0, Math.PI * 2); g.fill();
  }
  return c;
}
/* ---------- дерматин входной двери с пуговками ---------- */
function texPadded() {
  const W = 256, H = 512, c = cnv(W, H), g = c.getContext('2d'), r = rnd(151);
  g.fillStyle = '#5a2f1f'; g.fillRect(0, 0, W, H);
  for (let j = 0; j < 9; j++) for (let i = 0; i < 5; i++) {
    const x = i * 64 + (j % 2 ? 32 : 0), y = j * 64;
    const gr = g.createRadialGradient(x, y, 4, x, y, 44);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(0.3, 'rgba(255,220,190,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)');
    g.fillStyle = gr; g.fillRect(x - 46, y - 46, 92, 92);
    g.fillStyle = '#c9a36a'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
  }
  speckle(g, W, H, 4000, r, 0.1);
  return c;
}
/* ---------- фасады ---------- */
function texFacadeOwn() {
  const S = 512, c = cnv(S, S), g = c.getContext('2d'), r = rnd(161);
  g.fillStyle = '#bdb8ae'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 10, r, 'rgba(90,85,78,A)', 0.14, 30, 120);
  g.fillStyle = '#8c877e'; g.fillRect(0, S - 6, S, 6); g.fillRect(S - 6, 0, 6, S);
  g.fillStyle = '#d8d3c9'; g.fillRect(0, S - 10, S, 3); g.fillRect(S - 10, 0, 3, S);
  speckle(g, S, S, 9000, r, 0.1);
  return c;
}
// дом напротив: белый силикатный кирпич, окна парами, балконы; окна вечером горят
function texFacadeFar(seed, lit) {
  const W = 1024, H = 256, c = cnv(W, H), g = c.getContext('2d'), r = rnd(seed);
  g.fillStyle = '#d6d0c2'; g.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 3) { g.fillStyle = 'rgba(120,110,95,0.10)'; g.fillRect(0, y, W, 1); }
  const floors = 5, fh = H / floors, bays = 16, bw = W / bays; g.lineWidth = 2;
  for (let f = 0; f < floors; f++) for (let b = 0; b < bays; b++) {
    const x = b * bw, y = f * fh;
    const balcony = b % 4 === 1 && f < 4;
    const ww = bw * 0.46, wh = fh * 0.52;
    const wx = x + (bw - ww) / 2, wy = y + fh * 0.2;
    const on = lit && r() < 0.3;
    g.fillStyle = on ? `hsl(${34 + r() * 10},80%,${62 + r() * 12}%)` : `hsl(210,${10 + r() * 10}%,${22 + r() * 16}%)`;
    g.fillRect(wx, wy, ww, wh);
    if (r() < 0.6) { g.fillStyle = ['rgba(200,120,60,0.55)', 'rgba(230,220,200,0.6)', 'rgba(150,60,50,0.5)', 'rgba(120,150,110,0.5)'][Math.floor(r() * 4)]; g.fillRect(wx, wy, ww * (0.2 + r() * 0.25), wh); g.fillRect(wx + ww * 0.75, wy, ww * 0.25, wh); }
    g.strokeStyle = '#efece4'; g.lineWidth = 2; g.strokeRect(wx, wy, ww, wh);
    g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh * 0.3); g.lineTo(wx + ww / 2, wy + wh * 0.3); g.stroke();
    if (balcony) {
      g.fillStyle = '#9a958a'; g.fillRect(x + bw * 0.08, y + fh * 0.68, bw * 0.84, fh * 0.32);
      g.fillStyle = 'rgba(60,60,55,0.5)'; for (let k = 0; k < 12; k++) g.fillRect(x + bw * 0.1 + k * bw * 0.07, y + fh * 0.7, 2, fh * 0.28);
      if (r() < 0.5) { g.fillStyle = ['#e9e4d8', '#c9d6e3', '#e3c9c9'][Math.floor(r() * 3)]; g.fillRect(x + bw * 0.2, y + fh * 0.6, bw * 0.3, fh * 0.14); }
    }
    g.fillStyle = 'rgba(80,72,60,0.35)'; g.fillRect(wx - 3, wy + wh, ww + 6, 4);
  }
  blotches(g, W, H, 20, r, 'rgba(90,80,60,A)', 0.1, 30, 140);
  return c;
}
function texGround() {
  const S = 512, c = cnv(S, S), g = c.getContext('2d'), r = rnd(171);
  g.fillStyle = '#6f7a45'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 35, r, 'rgba(140,130,70,A)', 0.35, 20, 120);
  blotches(g, S, S, 20, r, 'rgba(50,70,30,A)', 0.3, 20, 100);
  g.fillStyle = '#5a5a58';
  g.fillRect(0, 350, S, 45);                       // проезд вдоль дома
  g.fillRect(235, 0, 30, 350);                     // дорожка через двор
  g.fillStyle = '#6a6a66'; g.fillRect(0, 395, S, 7);
  blotches(g, S, S, 15, r, 'rgba(40,40,38,A)', 0.2, 10, 50);
  speckle(g, S, S, 30000, r, 0.1);
  g.fillStyle = '#c9b48a'; g.fillRect(100, 150, 45, 45);  // песочница
  return c;
}
/* ---------- календарь 1975 года: картинка + сетка месяца ---------- */
function texCalendar() {
  const W = 256, H = 384, c = cnv(W, H), g = c.getContext('2d');
  g.fillStyle = '#f3ecd9'; g.fillRect(0, 0, W, H);
  const sky = g.createLinearGradient(0, 16, 0, 180); sky.addColorStop(0, '#7fa6c9'); sky.addColorStop(1, '#e9d2a8');
  g.fillStyle = sky; g.fillRect(16, 16, W - 32, 170);
  g.fillStyle = '#5d6f86'; g.beginPath(); g.moveTo(16, 140); g.lineTo(80, 70); g.lineTo(130, 120); g.lineTo(180, 60); g.lineTo(240, 130); g.lineTo(240, 186); g.lineTo(16, 186); g.fill();
  g.fillStyle = '#e9eef3'; g.beginPath(); g.moveTo(180, 60); g.lineTo(196, 78); g.lineTo(164, 78); g.fill();
  g.fillStyle = '#4f7fa3'; g.fillRect(16, 150, W - 32, 36);
  g.fillStyle = '#3f5f38'; g.beginPath(); g.moveTo(16, 186); g.quadraticCurveTo(100, 150, 240, 176); g.lineTo(240, 186); g.fill();
  g.fillStyle = '#b8322a'; g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('1975', W / 2, 228);
  g.fillStyle = '#2b2118'; g.font = 'bold 15px Arial, sans-serif'; g.fillText('СЕНТЯБРЬ', W / 2, 252);
  g.font = '12px Arial, sans-serif';
  const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  for (let i = 0; i < 7; i++) { g.fillStyle = i > 4 ? '#b8322a' : '#2b2118'; g.fillText(days[i], 34 + i * 31, 274); }
  let d = 1;
  for (let row = 0; row < 5 && d <= 30; row++) for (let i = 0; i < 7 && d <= 30; i++) {
    g.fillStyle = i > 4 ? '#b8322a' : '#2b2118'; g.fillText(String(d++), 34 + i * 31, 294 + row * 18);
  }
  g.fillStyle = '#c9b48a'; g.beginPath(); g.arc(W / 2, 8, 5, 0, Math.PI * 2); g.fill();
  return c;
}
/* ---------- дыра в стене: рваные края, кирпич, провод ---------- */
function texHole() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(191);
  g.clearRect(0, 0, S, S);
  const pts = []; for (let k = 0; k < 22; k++) { const a = k / 22 * Math.PI * 2, R = 88 + r() * 30; pts.push([128 + Math.cos(a) * R, 128 + Math.sin(a) * R * 0.85]); }
  const path = (k) => { g.beginPath(); pts.forEach(([x, y], i) => { const X = 128 + (x - 128) * k, Y = 128 + (y - 128) * k; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.closePath(); };
  path(1.12); g.fillStyle = '#b8b2a4'; g.fill();          // осыпавшаяся штукатурка
  path(1.0); g.fillStyle = '#4a3a30'; g.fill();
  g.save(); path(0.96); g.clip();
  for (let y = 20; y < 240; y += 22) for (let x = (y / 22 % 2) * 30; x < 256; x += 60) { g.fillStyle = `hsl(12,${35 + r() * 15}%,${28 + r() * 10}%)`; g.fillRect(x, y, 56, 19); }
  const gr = g.createRadialGradient(128, 128, 20, 128, 128, 130); gr.addColorStop(0, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.restore();
  g.strokeStyle = '#1c1c1c'; g.lineWidth = 6; g.beginPath(); g.moveTo(40, 150); g.bezierCurveTo(90, 130, 120, 190, 170, 160); g.stroke();
  g.strokeStyle = '#c9772e'; g.lineWidth = 3; g.beginPath(); g.moveTo(170, 160); g.lineTo(186, 150); g.stroke();
  return c;
}
/* ---------- настроечная таблица телевизора ---------- */
function texTVOn(t = 0) {
  const W = 256, H = 192, c = TX._tvCanvas || (TX._tvCanvas = cnv(W, H)), g = c.getContext('2d'), r = rnd(1 + Math.floor(t * 30));
  g.fillStyle = '#6f7470'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 16) for (let y = 0; y < H; y += 16) { g.fillStyle = ((x + y) / 16) % 2 ? '#8a8f8b' : '#5f6360'; g.fillRect(x, y, 16, 16); }
  g.fillStyle = '#d9dbd6'; g.beginPath(); g.arc(W / 2, H / 2, 70, 0, Math.PI * 2); g.fill();
  const bars = ['#e8e8e8', '#e8e05a', '#5ad8d8', '#5ad85a', '#d85ad8', '#d85a5a', '#5a5ad8', '#202020'];
  bars.forEach((col, i) => { g.fillStyle = col; g.fillRect(W / 2 - 64 + i * 16, H / 2 - 28, 16, 40); });
  g.fillStyle = '#202020'; g.fillRect(W / 2 - 64, H / 2 + 14, 128, 14);
  g.fillStyle = '#e8e8e8'; g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.fillText('ПЕРВАЯ ПРОГРАММА', W / 2, H / 2 + 25);
  for (let i = 0; i < 1400; i++) { const v = r() * 255; g.fillStyle = `rgba(${v},${v},${v},0.22)`; g.fillRect(r() * W, r() * H, 2, 1); }
  for (let y = 0; y < H; y += 2) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, y, W, 1); }
  return c;
}
/* ---------- циферблат часов ---------- */
function texClock() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d');
  g.fillStyle = '#f1e9d4'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2b2118'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#2b2118'; g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let h = 1; h <= 12; h++) { const a = h / 12 * Math.PI * 2 - Math.PI / 2; g.fillText(String(h), 128 + Math.cos(a) * 94, 128 + Math.sin(a) * 94); }
  for (let m = 0; m < 60; m++) { const a = m / 60 * Math.PI * 2; g.fillRect(128 + Math.cos(a) * 112 - 1.5, 128 + Math.sin(a) * 112 - 1.5, 3, 3); }
  return c;
}
/* ---------- картина: берёзовая роща у реки ---------- */
function texPainting() {
  const W = 256, H = 180, c = cnv(W, H), g = c.getContext('2d'), r = rnd(201);
  const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#9fb7c4'); sky.addColorStop(0.55, '#e7d7aa'); sky.addColorStop(1, '#6f7f4a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  g.fillStyle = '#5e7a88'; g.fillRect(0, 118, W, 22);
  g.fillStyle = '#56703c'; g.beginPath(); g.moveTo(0, 130); g.quadraticCurveTo(120, 110, W, 126); g.lineTo(W, H); g.lineTo(0, H); g.fill();
  for (let i = 0; i < 9; i++) {
    const x = 20 + i * 26 + r() * 12;
    g.fillStyle = '#efe9dc'; g.fillRect(x, 30 + r() * 30, 5, 130);
    for (let k = 0; k < 8; k++) { g.fillStyle = '#2b2118'; g.fillRect(x, 40 + r() * 110, 5, 2); }
    g.fillStyle = `rgba(${150 + r() * 60},${160 + r() * 40},60,0.75)`; g.beginPath(); g.arc(x + 2, 40 + r() * 20, 16 + r() * 10, 0, Math.PI * 2); g.fill();
  }
  speckle(g, W, H, 3000, r, 0.15);
  return c;
}
/* ---------- этикетка пива «Пятиэтажное» ---------- */
function texBeerLabel() {
  const W = 256, H = 96, c = cnv(W, H), g = c.getContext('2d');
  g.fillStyle = '#e9d9a8'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#b8322a'; g.fillRect(0, 0, W, 14); g.fillRect(0, H - 14, W, 14);
  g.fillStyle = '#2b2118'; g.font = 'bold 26px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('ПЯТИЭТАЖНОЕ', W / 2, 52);
  g.font = '14px Arial, sans-serif'; g.fillText('пиво светлое', W / 2, 72);
  return c;
}
/* ---------- клеёнка в клетку, кружевная скатерть ---------- */
function texOilcloth() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d');
  g.fillStyle = '#f2ece0'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(184,50,42,0.45)'; g.fillRect(i * 32, 0, 16, S); g.fillRect(0, i * 32, S, 16); }
  return c;
}
function texTablecloth() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d');
  g.fillStyle = '#f1ece1'; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(190,180,160,0.7)'; g.lineWidth = 2;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(i * 64 + 32, j * 64 + 32, 18, 0, Math.PI * 2); g.stroke(); flower5(g, i * 64 + 32, j * 64 + 32, 8, 'rgba(200,190,170,0.8)', 'rgba(170,160,140,1)'); }
  return c;
}
/* ---------- ржавчина старой батареи ---------- */
function texRust() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(211);
  g.fillStyle = '#a8a298'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 15, r, 'rgba(120,60,30,A)', 0.5, 6, 30);
  blotches(g, S, S, 10, r, 'rgba(230,226,215,A)', 0.4, 6, 24);
  speckle(g, S, S, 4000, r, 0.2);
  return c;
}
/* ---------- диск телефона ---------- */
function texDial() {
  const S = 128, c = cnv(S, S), g = c.getContext('2d');
  g.fillStyle = '#e8e2d2'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b2118'; g.font = 'bold 11px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI * 0.35 - i * Math.PI * 1.45 / 9;
    g.fillStyle = '#3a302a'; g.beginPath(); g.arc(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44, 11, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#f3ecd9'; g.fillText(String((i + 1) % 10), 64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44);
  }
  g.fillStyle = '#c9b48a'; g.beginPath(); g.arc(64, 64, 18, 0, Math.PI * 2); g.fill();
  return c;
}
/* ---------- обведённый кружок красной ручкой (пометка учительницы) ---------- */
function texRedCircle() {
  const S = 256, c = cnv(S, S), g = c.getContext('2d'), r = rnd(221);
  g.strokeStyle = 'rgba(200,36,30,0.95)'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath();
  for (let k = 0; k <= 70; k++) {
    const a = k / 60 * Math.PI * 2 - 0.4, R = 104 + Math.sin(k * 0.4) * 6 + (k / 70) * 8 + r() * 2;
    const x = 128 + Math.cos(a) * R, y = 128 + Math.sin(a) * R * 0.86;
    k ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  return c;
}

// Собрать все текстуры (один раз)
function buildTextures() {
  const T = TX;
  T.wallOld = toTex(texWallOld(), 1 / 0.53, 1 / 0.53);
  T.wallNew = toTex(texWallNew(), 1, 1);
  T.carpet = toTex(texCarpet()); T.carpet.wrapS = T.carpet.wrapT = THREE.ClampToEdgeWrapping;
  T.fringe = toTex(texFringe(), 6, 1);
  T.rug = toTex(texRug()); T.rug.wrapS = T.rug.wrapT = THREE.ClampToEdgeWrapping;
  T.parquet = toTex(texParquet(), 1, 1);
  T.linoK = toTex(texLinoKitchen(), 1, 1);
  T.linoH = toTex(texLinoHall(), 1 / 0.9, 1 / 0.9);
  T.bathFloor = toTex(texBathFloor(), 1 / 0.8, 1 / 0.8);
  T.tileOld = toTex(texTileOld(), 1 / 0.6, 1 / 0.6);
  T.plaster = toTex(texPlaster(), 1 / 1.2, 1 / 1.2);
  T.tileNew = toTex(texTileNew(false)); T.tileDecor = toTex(texTileNew(true));
  T.ceiling = toTex(texCeiling(), 1 / 1.6, 1 / 1.6);
  T.kitchenWall = toTex(texKitchenWall(), 1 / 0.8, 1 / 2.5);
  T.wallHall = toTex(texWallHall(), 1 / 0.36, 1 / 0.36);
  T.bathWall = toTex(texBathWall(), 1, 1);
  T.walnut = toTex(texWood('#5b331c', 7), 1, 1);
  T.lightWood = toTex(texWood('#9a6a3c', 8, 50), 1, 1);
  T.fabric = toTex(texFabric(), 3, 3);
  T.curtain = toTex(texCurtain(), 3, 3);
  T.tulle = toTex(texTulle(), 6, 6);
  T.doily = toTex(texDoily()); T.doily.wrapS = T.doily.wrapT = THREE.ClampToEdgeWrapping;
  T.padded = toTex(texPadded(), 1, 1);
  T.facade = toTex(texFacadeOwn(), 1 / 3, 1 / 2.75);
  T.farA = toTex(texFacadeFar(301, false), 1, 1);
  T.farB = toTex(texFacadeFar(302, true), 1, 1);
  T.ground = toTex(texGround(), 1, 1);
  T.calendar = toTex(texCalendar()); T.calendar.wrapS = T.calendar.wrapT = THREE.ClampToEdgeWrapping;
  T.hole = toTex(texHole()); T.hole.wrapS = T.hole.wrapT = THREE.ClampToEdgeWrapping;
  T.tv = toTex(texTVOn(0)); T.tv.wrapS = T.tv.wrapT = THREE.ClampToEdgeWrapping;
  T.clock = toTex(texClock()); T.painting = toTex(texPainting());
  T.beer = toTex(texBeerLabel()); T.oilcloth = toTex(texOilcloth(), 4, 4); T.tablecloth = toTex(texTablecloth(), 2, 2);
  T.rust = toTex(texRust(), 1, 1); T.dial = toTex(texDial()); T.redCircle = toTex(texRedCircle());
  return T;
}
