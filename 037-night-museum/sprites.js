/* Ночной музей — процедурные спрайты: бюсты, урна, мольберт, столбик ограждения, верёвка вора,
   напольные часы, пальма, модель корабля, скульптура, стремянка и табличка «ВЫХОД».
   Каждый рисуется в мировых единицах (ширина w × высота h) в текстуру 128 × 256. */
(function (root) {
'use strict';
const NM = root.NM = root.NM || {};
const TW = 128, TH = 256;

function lin(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([t, c]) => gr.addColorStop(t, c));
  return gr;
}
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
// мраморная тумба
function pedestal(g, w, h, top, pw, col, dark) {
  const x0 = (w - pw) / 2;
  g.fillStyle = lin(g, x0, 0, x0 + pw, 0, [[0, col], [0.45, col], [1, dark]]);
  g.fillRect(x0, h - top, pw, top);
  g.fillStyle = lin(g, x0 - 0.02, 0, x0 + pw + 0.02, 0, [[0, col], [1, dark]]);
  g.fillRect(x0 - 0.02, h - top - 0.035, pw + 0.04, 0.04);
  g.fillRect(x0 - 0.025, h - 0.06, pw + 0.05, 0.06);
  // прожилки
  g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 0.004;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    let x = x0 + Math.random() * pw, y = h - top + Math.random() * top;
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 0.06; y += 0.03 + Math.random() * 0.04; g.lineTo(Math.min(x0 + pw, Math.max(x0, x)), y); }
    g.stroke();
  }
}

const DRAW = [
  // 0 бюст на тумбе
  { w: 0.38, h: 1.12, draw(g, w, h) {
    pedestal(g, w, h, 0.62, 0.24, '#2d3b33', '#141b17');
    const m = lin(g, 0.02, 0, 0.36, 0, [[0, '#f1ede4'], [0.5, '#dcd6ca'], [1, '#8f897d']]);
    g.fillStyle = m;
    const base = h - 0.655;
    g.beginPath();
    g.moveTo(0.03, base); g.quadraticCurveTo(0.04, base - 0.15, 0.13, base - 0.19);
    g.lineTo(0.25, base - 0.19); g.quadraticCurveTo(0.34, base - 0.15, 0.35, base); g.closePath(); g.fill();
    g.fillRect(0.16, base - 0.25, 0.06, 0.08);
    g.beginPath(); g.ellipse(0.19, base - 0.33, 0.062, 0.084, 0, 0, Math.PI * 2); g.fill();
    // кудри
    g.fillStyle = lin(g, 0.12, 0, 0.27, 0, [[0, '#ece6da'], [1, '#948d80']]);
    for (let i = 0; i < 9; i++) { const a = Math.PI * (1.05 + i * 0.11); g.beginPath(); g.arc(0.19 + Math.cos(a) * 0.058, base - 0.35 + Math.sin(a) * 0.07, 0.018, 0, Math.PI * 2); g.fill(); }
    // тени лица
    g.fillStyle = 'rgba(80,72,60,0.35)';
    g.beginPath(); g.ellipse(0.215, base - 0.335, 0.012, 0.028, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(0.165, base - 0.345, 0.018, 0.006); g.fillRect(0.2, base - 0.345, 0.018, 0.006);
    g.fillStyle = 'rgba(80,72,60,0.25)'; g.fillRect(0.17, base - 0.29, 0.04, 0.005);
    g.fillStyle = 'rgba(60,52,44,0.3)'; g.fillRect(0.03, base - 0.012, 0.32, 0.012);
  } },
  // 1 урна на тумбе
  { w: 0.42, h: 1.05, draw(g, w, h) {
    pedestal(g, w, h, 0.58, 0.26, '#3a2f2a', '#1a1412');
    const base = h - 0.615;
    g.fillStyle = lin(g, 0.05, 0, 0.37, 0, [[0, '#e8e2d6'], [0.45, '#d4cdbf'], [1, '#7f786c']]);
    g.beginPath();
    g.moveTo(0.16, base); g.lineTo(0.26, base); g.lineTo(0.24, base - 0.04);
    g.bezierCurveTo(0.38, base - 0.08, 0.38, base - 0.26, 0.27, base - 0.32);
    g.lineTo(0.29, base - 0.37); g.lineTo(0.13, base - 0.37); g.lineTo(0.15, base - 0.32);
    g.bezierCurveTo(0.04, base - 0.26, 0.04, base - 0.08, 0.18, base - 0.04); g.closePath(); g.fill();
    g.strokeStyle = '#b9b2a4'; g.lineWidth = 0.014;
    g.beginPath(); g.arc(0.075, base - 0.26, 0.035, Math.PI * 0.4, Math.PI * 1.6); g.stroke();
    g.beginPath(); g.arc(0.345, base - 0.26, 0.035, -Math.PI * 0.6, Math.PI * 0.6); g.stroke();
    g.strokeStyle = 'rgba(90,80,66,0.4)'; g.lineWidth = 0.006;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0.08, base - 0.12 - k * 0.05); g.quadraticCurveTo(0.21, base - 0.1 - k * 0.05, 0.34, base - 0.12 - k * 0.05); g.stroke(); }
  } },
  // 2 мольберт
  { w: 0.6, h: 1.36, draw(g, w, h) {
    const wood = lin(g, 0, 0, w, 0, [[0, '#7a5634'], [0.5, '#8c6640'], [1, '#5a3c22']]);
    g.strokeStyle = wood; g.lineCap = 'round';
    g.lineWidth = 0.028;
    g.beginPath(); g.moveTo(0.06, h); g.lineTo(0.27, 0.03); g.stroke();
    g.beginPath(); g.moveTo(0.54, h); g.lineTo(0.33, 0.03); g.stroke();
    g.lineWidth = 0.022; g.strokeStyle = '#4a321e';
    g.beginPath(); g.moveTo(0.3, 0.1); g.lineTo(0.3, h - 0.02); g.stroke();
    g.fillStyle = '#6e4c2e'; g.fillRect(0.04, h - 0.5, 0.52, 0.035);
    g.fillStyle = '#4a321e'; g.fillRect(0.04, h - 0.468, 0.52, 0.01);
    g.fillStyle = '#6e4c2e'; g.fillRect(0.2, 0.12, 0.2, 0.03);
    // пятна краски на лотке
    const cols = ['#c8402a', '#e8c040', '#2a5a9a', '#f0ece0', '#3a7a4a'];
    cols.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(0.1 + i * 0.09, h - 0.49, 0.012, 0, Math.PI * 2); g.fill(); });
  } },
  // 3 латунный столбик ограждения
  { w: 0.07, h: 0.42, draw(g, w, h) {
    const b = lin(g, 0, 0, w, 0, [[0, '#6a5220'], [0.35, '#f2d680'], [0.6, '#b8923a'], [1, '#4a3814']]);
    g.fillStyle = b;
    g.fillRect(w / 2 - 0.0085, 0.04, 0.017, h - 0.06);
    g.beginPath(); g.arc(w / 2, 0.035, 0.026, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(w / 2, h - 0.015, 0.034, 0.015, 0, 0, Math.PI * 2); g.fill();
  } },
  // 4 верёвка вора из разбитого фонаря
  { w: 0.2, h: 1.9, draw(g, w, h) {
    g.strokeStyle = '#8f7a52'; g.lineCap = 'round'; g.lineWidth = 0.02;
    g.beginPath(); g.moveTo(0.1, 0);
    for (let y = 0; y < h - 0.06; y += 0.05) g.lineTo(0.1 + Math.sin(y * 3.1) * 0.012, y);
    g.stroke();
    g.strokeStyle = 'rgba(40,30,15,0.5)'; g.lineWidth = 0.006;
    for (let y = 0.02; y < h - 0.08; y += 0.028) { const x = 0.1 + Math.sin(y * 3.1) * 0.012; g.beginPath(); g.moveTo(x - 0.009, y); g.lineTo(x + 0.009, y + 0.014); g.stroke(); }
    // узел и бухта на полу
    g.fillStyle = '#7a6844'; g.beginPath(); g.ellipse(0.1, h - 0.33, 0.02, 0.028, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8f7a52'; g.lineWidth = 0.018;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(0.1 + (k - 1) * 0.012, h - 0.03 - k * 0.012, 0.085 - k * 0.012, 0.022, 0, 0, Math.PI * 2); g.stroke(); }
  } },
  // 5 напольные часы
  { w: 0.44, h: 1.42, draw(g, w, h) {
    const mah = lin(g, 0.02, 0, 0.42, 0, [[0, '#6a3420'], [0.4, '#5a2a18'], [1, '#2a120a']]);
    g.fillStyle = mah;
    g.fillRect(0.04, h - 0.16, 0.36, 0.16);
    g.fillRect(0.08, 0.42, 0.28, h - 0.58);
    g.fillRect(0.03, 0.08, 0.38, 0.36);
    g.beginPath(); g.moveTo(0.03, 0.09); g.quadraticCurveTo(0.22, -0.04, 0.41, 0.09); g.fill();
    // окно маятника
    g.fillStyle = '#140a06'; rr(g, 0.14, 0.56, 0.16, 0.52, 0.06); g.fill();
    g.strokeStyle = '#c9a24a'; g.lineWidth = 0.006; g.beginPath(); g.moveTo(0.22, 0.58); g.lineTo(0.22, 0.95); g.stroke();
    g.fillStyle = lin(g, 0.18, 0, 0.26, 0, [[0, '#f0d27a'], [1, '#8a6a22']]); g.beginPath(); g.arc(0.22, 0.97, 0.045, 0, Math.PI * 2); g.fill();
    // циферблат
    g.fillStyle = '#e9e0c8'; g.beginPath(); g.arc(0.22, 0.26, 0.13, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#c9a24a'; g.lineWidth = 0.012; g.stroke();
    g.fillStyle = '#2a2018';
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.fillRect(0.22 + Math.cos(a) * 0.1 - 0.005, 0.26 + Math.sin(a) * 0.1 - 0.005, 0.01, 0.01); }
    g.strokeStyle = '#1a120c'; g.lineWidth = 0.01; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0.22, 0.26); g.lineTo(0.22 + 0.05, 0.26 - 0.04); g.stroke();
    g.beginPath(); g.moveTo(0.22, 0.26); g.lineTo(0.22 - 0.02, 0.26 - 0.085); g.stroke();
  } },
  // 6 пальма в кадке
  { w: 0.72, h: 1.25, draw(g, w, h) {
    g.fillStyle = lin(g, 0.22, 0, 0.5, 0, [[0, '#8a4a2a'], [0.5, '#a65a32'], [1, '#4a2412']]);
    g.beginPath(); g.moveTo(0.22, h - 0.3); g.lineTo(0.5, h - 0.3); g.lineTo(0.46, h); g.lineTo(0.26, h); g.closePath(); g.fill();
    g.fillStyle = '#5a2e18'; g.fillRect(0.2, h - 0.32, 0.32, 0.04);
    g.strokeStyle = '#4a3a22'; g.lineWidth = 0.02; g.beginPath(); g.moveTo(0.36, h - 0.3); g.lineTo(0.36, 0.6); g.stroke();
    g.lineCap = 'round';
    const fronds = 11;
    for (let i = 0; i < fronds; i++) {
      const a = -Math.PI / 2 + (i / (fronds - 1) - 0.5) * 2.9;
      const len = 0.32 + Math.random() * 0.08;
      const sx = 0.36, sy = 0.62;
      const ex = sx + Math.cos(a) * len, ey = sy + Math.sin(a) * len * 0.8 + len * 0.35 * Math.abs(Math.cos(a));
      const mx = sx + Math.cos(a) * len * 0.5, my = sy + Math.sin(a) * len * 0.6 - 0.05;
      g.strokeStyle = i % 2 ? '#2f4a26' : '#3d5c2e'; g.lineWidth = 0.01;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      for (let k = 1; k < 12; k++) {
        const t = k / 12;
        const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * ex, py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ey;
        const la = 0.09 * (1 - t * 0.6);
        g.lineWidth = 0.008;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a + 1.1) * la * 0.4, py + la); g.stroke();
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a - 1.1) * la * 0.4, py + la); g.stroke();
      }
    }
  } },
  // 7 модель корабля под стеклянным колпаком
  { w: 0.52, h: 1.12, draw(g, w, h) {
    g.fillStyle = lin(g, 0.1, 0, 0.42, 0, [[0, '#4a2c1a'], [1, '#1e1008']]);
    g.fillRect(0.1, h - 0.62, 0.32, 0.62);
    g.fillStyle = '#5a3620'; g.fillRect(0.06, h - 0.64, 0.4, 0.03);
    const b = h - 0.66;
    // корпус
    g.fillStyle = lin(g, 0, b - 0.1, 0, b, [[0, '#5a3a24'], [1, '#24160c']]);
    g.beginPath(); g.moveTo(0.05, b - 0.1); g.quadraticCurveTo(0.26, b - 0.07, 0.47, b - 0.11); g.lineTo(0.41, b - 0.015); g.quadraticCurveTo(0.26, b + 0.005, 0.11, b - 0.015); g.closePath(); g.fill();
    g.fillStyle = '#c9a24a'; g.fillRect(0.08, b - 0.085, 0.36, 0.006);
    g.fillStyle = '#1a0f08'; for (let k = 0; k < 7; k++) g.fillRect(0.12 + k * 0.042, b - 0.068, 0.012, 0.01);
    // мачты и паруса цвета старого полотна
    g.strokeStyle = '#3a2616'; g.lineWidth = 0.007; g.lineCap = 'round';
    [[0.16, 0.3], [0.26, 0.36], [0.36, 0.28]].forEach(([x, ht]) => {
      g.beginPath(); g.moveTo(x, b - 0.09); g.lineTo(x, b - 0.09 - ht); g.stroke();
      for (let k = 0; k < 3; k++) {
        const sw = 0.052 - k * 0.01, top = b - 0.1 - ht + 0.05 + k * 0.085;
        g.fillStyle = lin(g, x - sw, 0, x + sw, 0, [[0, '#d9cfb4'], [0.6, '#b8ab8c'], [1, '#8a7e64']]);
        g.beginPath(); g.moveTo(x - sw, top); g.quadraticCurveTo(x, top + 0.02, x + sw, top); g.lineTo(x + sw * 0.9, top + 0.066); g.quadraticCurveTo(x, top + 0.08, x - sw * 0.9, top + 0.066); g.closePath(); g.fill();
      }
    });
    g.strokeStyle = 'rgba(40,26,14,0.7)'; g.lineWidth = 0.0035;
    g.beginPath(); g.moveTo(0.05, b - 0.1); g.lineTo(0.16, b - 0.39); g.lineTo(0.26, b - 0.45); g.lineTo(0.36, b - 0.37); g.lineTo(0.48, b - 0.12); g.stroke();
    // стеклянный колпак: только тонкие блики по рёбрам
    g.strokeStyle = 'rgba(210,225,235,0.28)'; g.lineWidth = 0.005;
    g.strokeRect(0.035, b - 0.53, 0.45, 0.53);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0.06, b - 0.51, 0.014, 0.47);
  } },
  // 8 беспредметная скульптура
  { w: 0.46, h: 1.25, draw(g, w, h) {
    g.fillStyle = lin(g, 0.05, 0, 0.41, 0, [[0, '#ecebe6'], [1, '#a9a7a0']]);
    g.fillRect(0.06, h - 0.46, 0.34, 0.46);
    const br = lin(g, 0.08, 0, 0.38, 0, [[0, '#8a5a2a'], [0.4, '#c8904a'], [1, '#3a2410']]);
    g.fillStyle = br;
    const b = h - 0.46;
    g.beginPath(); g.moveTo(0.17, b); g.bezierCurveTo(0.05, b - 0.25, 0.1, b - 0.55, 0.22, b - 0.78);
    g.bezierCurveTo(0.36, b - 0.55, 0.42, b - 0.25, 0.29, b); g.closePath(); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.ellipse(0.23, b - 0.36, 0.045, 0.1, 0.2, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#1e1e22'; g.beginPath(); g.arc(0.3, b - 0.62, 0.055, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c8281e'; g.fillRect(0.08, b - 0.15, 0.3, 0.02);
  } },
  // 9 стремянка
  { w: 0.52, h: 1.15, draw(g, w, h) {
    g.strokeStyle = lin(g, 0, 0, w, 0, [[0, '#9a7a52'], [1, '#6a4e30']]); g.lineWidth = 0.03; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0.06, h); g.lineTo(0.17, 0.03); g.stroke();
    g.beginPath(); g.moveTo(0.46, h); g.lineTo(0.35, 0.03); g.stroke();
    g.lineWidth = 0.022;
    for (let y = 0.2; y < h - 0.05; y += 0.22) { const k = y / h; g.beginPath(); g.moveTo(0.17 - 0.11 * k + 0.01, y); g.lineTo(0.35 + 0.11 * k - 0.01, y); g.stroke(); }
    g.fillStyle = '#7a5a36'; g.fillRect(0.14, 0.0, 0.24, 0.05);
    g.fillStyle = 'rgba(230,220,200,0.8)'; g.fillRect(0.2, 0.45, 0.06, 0.012);
  } },
  // 10 табличка «ВЫХОД» (занимает верхнюю четверть слоя)
  { raw: true, draw(g) {
    g.fillStyle = '#0c3a1e'; g.fillRect(0, 0, TW, 64);
    g.fillStyle = '#23c469'; rr(g, 4, 6, TW - 8, 52, 6); g.fill();
    g.fillStyle = '#f2fff4';
    g.font = '700 26px "Ysabeau Office", "Arial Narrow", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ВЫХОД', TW / 2 + 8, 33, TW - 34);
    // бегущий человек
    g.strokeStyle = '#f2fff4'; g.lineWidth = 3.2; g.lineCap = 'round';
    g.beginPath(); g.arc(15, 17, 3.4, 0, Math.PI * 2); g.fillStyle = '#f2fff4'; g.fill();
    g.beginPath(); g.moveTo(14, 23); g.lineTo(11, 35); g.lineTo(18, 45); g.moveTo(11, 35); g.lineTo(5, 44); g.moveTo(14, 25); g.lineTo(21, 30); g.moveTo(13, 26); g.lineTo(7, 30); g.stroke();
  } },
];

function build() {
  const out = [];
  for (const S of DRAW) {
    const c = NM.Paint.cpuCanvas(TW, TH);
    const g = c.getContext('2d');
    if (S.raw) S.draw(g);
    else { g.setTransform(TW / S.w, 0, 0, TH / S.h, 0, 0); S.draw(g, S.w, S.h); }
    out.push(c);
  }
  return out;
}

NM.Sprites = { TW, TH, build, COUNT: DRAW.length };
})(typeof window !== 'undefined' ? window : globalThis);
