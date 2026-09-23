/* ==========================================================================
   Анатомия JPEG — встроенные картинки. Всё рисуется процедурно:
   файлов нет, холст остаётся «чистым» и в file://.
   Каждая картинка подобрана так, чтобы на ней были видны все артефакты:
   плавные градиенты (блоки), резкие края (звон), насыщенный цвет (подтёки),
   мелкая текстура (размытие).
   ========================================================================== */
(function (root) {
  'use strict';

  const W = 448, H = 288;

  /* ---------- Шум ---------- */

  // Шум значений на решётке 256×256 со сглаживанием — быстро и без повторов на нашем масштабе
  const LAT = new Float32Array(256 * 256 * 8);
  (() => {
    let s = 20260923 >>> 0;
    for (let i = 0; i < LAT.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; LAT[i] = s / 4294967296; }
  })();
  function vnoise(x, y, seed) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const base = (seed & 7) << 16;
    const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
    const a = LAT[base + y0 + x0], b = LAT[base + y0 + x1], c = LAT[base + y1 + x0], d = LAT[base + y1 + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { sum += amp * vnoise(x * f + i * 31.7, y * f + i * 17.3, s + i); norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hash01 = (k) => { let h = Math.imul(k + 1, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function fontFamily(kind) {
    if (kind === 'pixel') return '"Handjet", "Courier New", monospace';
    if (kind === 'mono') return '"Geist Mono", "JetBrains Mono", "Courier New", monospace';
    return '"Piazzolla", "Georgia", "Times New Roman", serif';
  }

  // Семисегментные цифры, как у даты на плёночной мыльнице
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  function drawSeg(ctx, ch, x, y, w, h, t) {
    const segs = SEG[ch];
    if (!segs) return;
    const hh = h / 2;
    const r = {
      a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, y + hh - t / 2, w - 2 * t, t],
      f: [x, y + t * 0.6, t, hh - t * 0.8], b: [x + w - t, y + t * 0.6, t, hh - t * 0.8],
      e: [x, y + hh + t * 0.2, t, hh - t * 0.8], c: [x + w - t, y + hh + t * 0.2, t, hh - t * 0.8],
    };
    for (const s of segs) { const q = r[s]; ctx.fillRect(q[0], q[1], q[2], q[3]); }
  }

  /* ======================================================================
     1. «Маяк»: закат над заливом
     ====================================================================== */
  function lighthouse() {
    const c = canvas(W, H), ctx = c.getContext('2d', { willReadFrequently: true });
    const HOR = 178;

    // Небо
    const sky = ctx.createLinearGradient(0, 0, 0, HOR);
    sky.addColorStop(0.0, '#10183a');
    sky.addColorStop(0.28, '#2e2865');
    sky.addColorStop(0.52, '#7c3a78');
    sky.addColorStop(0.7, '#d25e5a');
    sky.addColorStop(0.85, '#f39a4c');
    sky.addColorStop(1.0, '#ffd488');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, HOR);

    // Звёзды в верхней, самой тёмной части
    const R = rng(62);
    for (let i = 0; i < 46; i++) {
      const x = R() * W, y = Math.pow(R(), 1.8) * 80;
      const a = (1 - y / 85) * (0.35 + R() * 0.65);
      ctx.fillStyle = `rgba(255, 244, 230, ${a.toFixed(3)})`;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
    }

    // Солнце и ореол
    const SX = 322, SY = 171, SR = 25;
    const glow = ctx.createRadialGradient(SX, SY, SR * 0.6, SX, SY, 176);
    glow.addColorStop(0, 'rgba(255, 214, 140, 0.55)');
    glow.addColorStop(0.35, 'rgba(255, 150, 90, 0.18)');
    glow.addColorStop(1, 'rgba(255, 120, 80, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, HOR);
    ctx.restore();
    const sun = ctx.createRadialGradient(SX - 6, SY - 8, 2, SX, SY, SR);
    sun.addColorStop(0, '#fffbea');
    sun.addColorStop(0.7, '#fff0c2');
    sun.addColorStop(1, '#ffd98e');
    ctx.fillStyle = sun;
    ctx.beginPath(); ctx.arc(SX, SY, SR, 0, Math.PI * 2); ctx.fill();

    // Облака: вытянутые полосы шума, подсвеченные снизу
    let img = ctx.getImageData(0, 0, W, HOR);
    let d = img.data;
    const CY0 = 30, CY1 = 174;
    const field = new Float32Array(W * (CY1 - CY0 + 3));
    for (let y = CY0; y < CY1 + 3; y++) for (let x = 0; x < W; x++) field[(y - CY0) * W + x] = fbm(x / 95, y / 8.6, 5, 4) + 0.08 * Math.sin(x / 37);
    for (let y = CY0; y < CY1; y++) {
      const band = smooth(34, 80, y) * (1 - smooth(134, 170, y));
      if (band <= 0) continue;
      for (let x = 0; x < W; x++) {
        const n = field[(y - CY0) * W + x];
        const dens = smooth(0.53, 0.72, n) * band;
        if (dens <= 0.002) continue;
        const i = (y * W + x) * 4;
        // нижний край облака ярче: шум чуть ниже слабее
        const rim = clamp((n - field[(y - CY0 + 2) * W + x]) * 9, 0, 1);
        const dist = Math.hypot((x - SX) / 1.6, y - SY) / 240;
        const warm = clamp(1 - dist, 0, 1);
        const cr = mix(mix(64, 150, warm), 255, rim * 0.85);
        const cg = mix(mix(34, 64, warm), mix(150, 214, warm), rim * 0.85);
        const cb = mix(mix(84, 96, warm), mix(110, 150, warm), rim * 0.85);
        const a = dens * 0.92;
        d[i] = mix(d[i], cr, a); d[i + 1] = mix(d[i + 1], cg, a); d[i + 2] = mix(d[i + 2], cb, a);
      }
    }
    ctx.putImageData(img, 0, 0);

    // Дальний берег справа: две гряды в дымке
    const ridge = (y0, amp, sc, seed, color, x0, x1) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x0, HOR + 1);
      for (let x = x0; x <= x1; x += 2) {
        const t = (x - x0) / (x1 - x0);
        const env = Math.sin(Math.PI * clamp(t, 0, 1)) ** 0.7;
        const h = amp * env * (0.45 + fbm(x / sc, seed, seed, 4));
        ctx.lineTo(x, y0 - h);
      }
      ctx.lineTo(x1, HOR + 1);
      ctx.closePath();
      ctx.fill();
    };
    ridge(HOR, 20, 38, 3, '#8a5a86', 214, 470);
    ridge(HOR, 11, 22, 9, '#5d3f6e', 250, 420);

    // Море: отражение неба
    const sea = ctx.createLinearGradient(0, HOR, 0, H);
    sea.addColorStop(0, '#f2a067');
    sea.addColorStop(0.18, '#b85a67');
    sea.addColorStop(0.5, '#5a3566');
    sea.addColorStop(1, '#1d1a3d');
    ctx.fillStyle = sea;
    ctx.fillRect(0, HOR, W, H - HOR);

    img = ctx.getImageData(0, HOR, W, H - HOR);
    d = img.data;
    for (let y = HOR; y < H; y++) {
      const depth = (y - HOR) / (H - HOR); // 0 у горизонта, 1 у зрителя
      const freq = mix(1.9, 0.42, Math.sqrt(depth));
      for (let x = 0; x < W; x++) {
        const i = ((y - HOR) * W + x) * 4;
        // рябь: горизонтальные гребни, сбитые шумом
        const n = fbm(x / mix(26, 70, depth), y / mix(1.2, 6, depth), 11, 3);
        const wave = Math.sin(y * freq * 3.1 + n * 9);
        const crest = smooth(0.55, 0.95, wave);
        const trough = smooth(-0.2, -0.95, wave);
        let r = d[i], g = d[i + 1], b = d[i + 2];
        r = r * (1 - 0.22 * trough) + 40 * crest; g = g * (1 - 0.24 * trough) + 24 * crest; b = b * (1 - 0.18 * trough) + 30 * crest;
        // солнечная дорожка
        const pathW = mix(10, 64, depth);
        const px = Math.abs(x - SX + (n - 0.5) * 30 * depth) / pathW;
        const along = Math.exp(-px * px * 1.6) * mix(1, 0.35, depth);
        const sp = fbm(x / 3.2, y / mix(0.9, 2.4, depth), 23, 2);
        const glint = smooth(0.62 - along * 0.2, 0.8, sp) * along;
        r += 255 * glint * 0.95; g += 205 * glint * 0.9; b += 140 * glint * 0.8;
        r += along * 36; g += along * 18;
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
      }
    }
    ctx.putImageData(img, 0, HOR);

    // Мыс слева: скала с рваным обрывом, фактурой камня и подсветкой заката по кромке
    const cape = [];
    for (let x = -4; x <= 198; x += 2) {
      const t = x / 198;
      const base = mix(134, HOR - 4, smooth(0.5, 1, t));
      const top = base - 10 * fbm(x / 18, 1.5, 31, 4) - (t < 0.62 ? 16 * (1 - t / 0.62) ** 0.6 : 0);
      cape.push([x, top]);
    }
    const cliffTop = cape[cape.length - 1][1];
    const cliff = [];
    for (let y = cliffTop; y <= H + 3; y += 3) {
      const t = (y - cliffTop) / (H - cliffTop);
      cliff.push([198 + 34 * t ** 0.8 + 14 * (fbm(y / 11, 7.7, 44, 3) - 0.5) + (Math.floor(y / 17) % 2) * 4, y]);
    }
    const capePath = () => {
      ctx.beginPath();
      ctx.moveTo(-4, H + 2);
      for (const [x, y] of cape) ctx.lineTo(x, y);
      for (const [x, y] of cliff) ctx.lineTo(x, y);
      ctx.lineTo(-4, H + 2);
      ctx.closePath();
    };
    const rock = ctx.createLinearGradient(40, 120, 150, H);
    rock.addColorStop(0, '#3b2748');
    rock.addColorStop(0.45, '#231733');
    rock.addColorStop(1, '#120d1f');
    capePath();
    ctx.fillStyle = rock;
    ctx.fill();
    // фактура камня: шум, наложенный только на скалу
    const tex = canvas(W, H), tctx = tex.getContext('2d'), timg = tctx.createImageData(W, H);
    for (let y = 110; y < H; y++) {
      for (let x = 0; x < 240; x++) {
        const n = fbm(x / 7, y / 4.2, 3, 4), v = 128 + (n - 0.5) * 150;
        const i = (y * W + x) * 4;
        timg.data[i] = timg.data[i + 1] = timg.data[i + 2] = v; timg.data[i + 3] = 255;
      }
    }
    tctx.putImageData(timg, 0, 0);
    ctx.save();
    capePath();
    ctx.clip();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.55;
    ctx.drawImage(tex, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    // пласты породы
    for (let k = 0; k < 10; k++) {
      ctx.strokeStyle = `rgba(150, 100, 150, ${0.14 + 0.06 * (k % 3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const yb = 142 + k * 14;
      for (let x = -4; x <= 240; x += 4) ctx.lineTo(x, yb + 7 * Math.sin(x / 23 + k) + 6 * fbm(x / 11, k, 41, 3));
      ctx.stroke();
    }
    // тёплый отсвет на обращённой к солнцу стене обрыва
    const warmWall = ctx.createLinearGradient(150, 0, 236, 0);
    warmWall.addColorStop(0, 'rgba(255, 120, 90, 0)');
    warmWall.addColorStop(1, 'rgba(255, 120, 90, 0.32)');
    ctx.fillStyle = warmWall;
    ctx.fillRect(140, cliffTop - 4, 110, H - cliffTop + 8);
    ctx.restore();
    // кромка, освещённая закатом
    ctx.strokeStyle = 'rgba(255, 150, 110, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    cape.forEach(([x, y], k) => (k ? ctx.lineTo(x, y + 0.6) : ctx.moveTo(x, y + 0.6)));
    for (const [x, y] of cliff.slice(0, 12)) ctx.lineTo(x - 0.6, y);
    ctx.stroke();
    // пена у подножия обрыва
    ctx.fillStyle = 'rgba(255, 226, 206, 0.5)';
    for (let k = 0; k < cliff.length; k++) {
      const [x, y] = cliff[k];
      if (y < HOR + 8) continue;
      if (hash01(k) > 0.55) ctx.fillRect(Math.round(x + 1), Math.round(y), 2 + Math.round(hash01(k + 99) * 3), 1);
    }

    // Маяк
    const LX = 88, LB = cape[Math.round((LX + 4) / 2)][1] + 2, LT = LB - 76;
    const bw0 = 17, bw1 = 11;
    const towerX = (y, side) => { const t = (LB - y) / (LB - LT); return LX + side * mix(bw0, bw1, t) / 2; };
    // корпус: белый, с тенью слева (солнце справа)
    for (let y = LT; y <= LB; y++) {
      const xl = towerX(y, -1), xr = towerX(y, 1);
      const band = Math.floor(((LB - y) / (LB - LT)) * 6);
      const red = band % 2 === 1;
      const g = ctx.createLinearGradient(xl, 0, xr, 0);
      if (red) { g.addColorStop(0, '#6e1a2a'); g.addColorStop(0.55, '#c8302e'); g.addColorStop(1, '#ff6a4a'); }
      else { g.addColorStop(0, '#8d7f9c'); g.addColorStop(0.55, '#ece2e4'); g.addColorStop(1, '#fff1dc'); }
      ctx.fillStyle = g;
      ctx.fillRect(xl, y, xr - xl, 1.05);
    }
    // окна-бойницы
    ctx.fillStyle = '#231a33';
    for (let k = 0; k < 3; k++) ctx.fillRect(LX - 1, LB - 22 - k * 22, 2, 4);
    // галерея с перилами
    const GY = LT - 2;
    ctx.fillStyle = '#1e1528';
    ctx.fillRect(LX - 10, GY, 20, 2);
    for (let x = LX - 9; x <= LX + 9; x += 2) ctx.fillRect(x, GY - 5, 1, 5);
    ctx.fillRect(LX - 10, GY - 6, 20, 1);
    // фонарная: стекло со светом
    const lamp = ctx.createRadialGradient(LX, GY - 9, 1, LX, GY - 9, 7);
    lamp.addColorStop(0, '#fffdf0'); lamp.addColorStop(1, '#ffd36a');
    ctx.fillStyle = lamp;
    ctx.fillRect(LX - 5, GY - 14, 10, 8);
    ctx.fillStyle = '#1e1528';
    ctx.fillRect(LX - 5, GY - 14, 1, 8); ctx.fillRect(LX + 4, GY - 14, 1, 8); ctx.fillRect(LX - 1, GY - 14, 1, 8);
    // купол
    ctx.fillStyle = '#7a1b26';
    ctx.beginPath(); ctx.moveTo(LX - 7, GY - 14); ctx.quadraticCurveTo(LX, GY - 24, LX + 7, GY - 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1e1528'; ctx.fillRect(LX, GY - 27, 1, 5);
    // луч и ореол фонаря
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const beam = ctx.createLinearGradient(LX, GY - 10, LX - 150, GY - 40);
    beam.addColorStop(0, 'rgba(255, 236, 170, 0.34)');
    beam.addColorStop(1, 'rgba(255, 236, 170, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath(); ctx.moveTo(LX - 3, GY - 11); ctx.lineTo(LX - 190, GY - 58); ctx.lineTo(LX - 190, GY - 8); ctx.closePath(); ctx.fill();
    const halo = ctx.createRadialGradient(LX, GY - 10, 2, LX, GY - 10, 26);
    halo.addColorStop(0, 'rgba(255, 230, 160, 0.55)'); halo.addColorStop(1, 'rgba(255, 200, 120, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(LX - 30, GY - 40, 60, 60);
    ctx.restore();

    // Домик смотрителя у подножия
    const HX = 106, HB = LB + 3;
    ctx.fillStyle = '#e9ddd8';
    ctx.fillRect(HX, HB - 12, 26, 12);
    ctx.fillStyle = '#9d8aa5';
    ctx.fillRect(HX, HB - 12, 5, 12);
    ctx.fillStyle = '#b3262d';
    ctx.beginPath(); ctx.moveTo(HX - 3, HB - 11); ctx.lineTo(HX + 13, HB - 21); ctx.lineTo(HX + 29, HB - 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffcf5a';
    ctx.fillRect(HX + 16, HB - 8, 4, 4);
    ctx.fillStyle = '#2a1d33';
    ctx.fillRect(HX + 8, HB - 7, 3, 7);

    // Птицы
    ctx.strokeStyle = 'rgba(30, 18, 40, 0.85)';
    ctx.lineWidth = 1;
    for (const [bx, by, s] of [[228, 86, 5], [240, 78, 4], [252, 89, 3.5], [214, 96, 3]]) {
      ctx.beginPath(); ctx.moveTo(bx - s, by - s * 0.5); ctx.quadraticCurveTo(bx - s * 0.4, by - s * 0.7, bx, by); ctx.quadraticCurveTo(bx + s * 0.4, by - s * 0.7, bx + s, by - s * 0.5); ctx.stroke();
    }

    // Лодка с красным парусом у дальнего берега
    const BX = 392, BY = HOR + 18;
    ctx.fillStyle = '#1f1530';
    ctx.beginPath(); ctx.moveTo(BX - 9, BY); ctx.lineTo(BX + 9, BY); ctx.lineTo(BX + 6, BY + 3); ctx.lineTo(BX - 6, BY + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8413a';
    ctx.beginPath(); ctx.moveTo(BX, BY - 1); ctx.lineTo(BX, BY - 17); ctx.lineTo(BX + 8, BY - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd9b0';
    ctx.beginPath(); ctx.moveTo(BX - 1, BY - 1); ctx.lineTo(BX - 1, BY - 13); ctx.lineTo(BX - 6, BY - 2); ctx.closePath(); ctx.fill();

    // Дата на кадре — как у плёночной мыльницы
    ctx.save();
    ctx.fillStyle = '#ff8a1e';
    ctx.shadowColor = 'rgba(255, 110, 20, 0.8)';
    ctx.shadowBlur = 3;
    const date = "'92 9 18";
    let dx = 350;
    for (const ch of date) {
      if (ch === ' ') { dx += 5; continue; }
      if (ch === "'") { ctx.fillRect(dx, 262, 1.6, 4); dx += 4; continue; }
      drawSeg(ctx, ch, dx, 262, 8, 14, 1.8);
      dx += 11;
    }
    ctx.restore();

    // Зерно и виньетка
    img = ctx.getImageData(0, 0, W, H);
    d = img.data;
    const G = rng(9);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const vx = (x - W / 2) / (W / 2), vy = (y - H / 2) / (H / 2);
        const vig = 1 - 0.16 * Math.pow(vx * vx * 0.8 + vy * vy, 1.4);
        const gr = (G() + G() - 1) * 7;
        d[i] = d[i] * vig + gr; d[i + 1] = d[i + 1] * vig + gr; d[i + 2] = d[i + 2] * vig + gr;
      }
    }
    ctx.putImageData(img, 0, 0);
    return {
      w: W, h: H, data: ctx.getImageData(0, 0, W, H).data,
      tour: [[LX, LB - 22], [LX, GY - 10], [SX - SR + 3, SY - 8], [BX + 2, BY - 8], [372, 268], [HX + 16, HB - 7], [236, 84], [SX + 6, HOR + 30]],
      crops: { blocks: [412, 150], ringing: [LX, GY - 8], bleed: [BX + 2, BY - 6], texture: [SX - 4, HOR + 34] },
      probe: [LX + 4, LB - 30],
    };
  }

  /* ======================================================================
     2. «Таблица»: испытательная таблица
     ====================================================================== */
  function testChart() {
    const c = canvas(W, H), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#6f6f72';
    ctx.fillRect(0, 0, W, H);
    // сетка
    ctx.fillStyle = '#e8e8e8';
    for (let x = 16; x < W; x += 32) ctx.fillRect(x, 0, 1, H);
    for (let y = 16; y < H; y += 32) ctx.fillRect(0, y, W, 1);

    const CX = 224, CY = 144, CR = 112;
    const top = CY - CR;
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, CR, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#1a1a1c'; ctx.fillRect(0, 0, W, H);
    // цветные полосы
    const bars = ['#bfbfbf', '#bfbf00', '#00bfbf', '#00bf00', '#bf00bf', '#bf0000', '#0000bf'];
    const bw = (CR * 2) / bars.length;
    bars.forEach((col, k) => { ctx.fillStyle = col; ctx.fillRect(Math.round(CX - CR + k * bw), top, Math.ceil(bw) + 1, 64); });
    // ступени серого
    for (let k = 0; k < 11; k++) {
      const v = Math.round((k / 10) * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.round(CX - CR + k * ((CR * 2) / 11)), top + 64, Math.ceil((CR * 2) / 11) + 1, 20);
    }
    // полоса с надписью
    ctx.fillStyle = '#f4f2ec';
    ctx.fillRect(CX - CR, top + 84, CR * 2, 26);
    ctx.fillStyle = '#111';
    ctx.font = `400 22px ${fontFamily('pixel')}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('АНАТОМИЯ JPEG · 040', CX, top + 98);
    // частотные решётки: от крупных полос к мелким
    const periods = [16, 8, 6, 4, 3, 2];
    const gw = (CR * 2 - 16) / periods.length;
    periods.forEach((per, k) => {
      const x0 = CX - CR + 8 + k * gw;
      for (let x = 0; x < gw - 4; x++) {
        ctx.fillStyle = Math.floor(x / (per / 2)) % 2 === 0 ? '#f0f0f0' : '#101010';
        ctx.fillRect(Math.round(x0 + x), top + 112, 1, 36);
      }
    });
    // плавная растяжка и радуга
    const ramp = ctx.createLinearGradient(CX - CR, 0, CX + CR, 0);
    ramp.addColorStop(0, '#000'); ramp.addColorStop(1, '#fff');
    ctx.fillStyle = ramp; ctx.fillRect(CX - CR, top + 150, CR * 2, 14);
    const hue = ctx.createLinearGradient(CX - CR, 0, CX + CR, 0);
    ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'].forEach((col, k) => hue.addColorStop(k / 6, col));
    ctx.fillStyle = hue; ctx.fillRect(CX - CR, top + 164, CR * 2, 14);
    ctx.fillStyle = '#e9e5dc'; ctx.fillRect(CX - CR, top + 178, CR * 2, 60);
    ctx.fillStyle = '#16161a';
    ctx.font = `600 10px ${fontFamily('serif')}`;
    ctx.fillText('Съешь же ещё этих мягких', CX, top + 190);
    ctx.font = `400 8px ${fontFamily('serif')}`;
    ctx.fillText('французских булок, да выпей чаю', CX, top + 203);
    ctx.restore();
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(CX, CY, CR, 0, Math.PI * 2); ctx.stroke();

    // зонная пластина Френеля
    const Z = 88, zx = 12, zy = 12;
    const zimg = ctx.getImageData(zx, zy, Z, Z);
    for (let y = 0; y < Z; y++) for (let x = 0; x < Z; x++) {
      const dx = x - Z / 2 + 0.5, dy = y - Z / 2 + 0.5;
      const v = 128 + 127 * Math.cos((dx * dx + dy * dy) * 0.042);
      const i = (y * Z + x) * 4;
      zimg.data[i] = zimg.data[i + 1] = zimg.data[i + 2] = v;
    }
    ctx.putImageData(zimg, zx, zy);

    // звезда для резкости
    const sx = 56, sy = 150, sr = 32;
    for (let k = 0; k < 36; k++) {
      ctx.fillStyle = k % 2 ? '#f4f4f4' : '#0e0e0e';
      ctx.beginPath(); ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, sr, (k / 36) * Math.PI * 2, ((k + 1) / 36) * Math.PI * 2);
      ctx.closePath(); ctx.fill();
    }

    // палитра заплат
    const patches = [
      [115, 82, 68], [194, 150, 130], [98, 122, 157], [87, 108, 67], [133, 128, 177], [103, 189, 170],
      [214, 126, 44], [80, 91, 166], [193, 90, 99], [94, 60, 108], [157, 188, 64], [224, 163, 46],
      [56, 61, 150], [70, 148, 73], [175, 54, 60], [231, 199, 31], [187, 86, 149], [8, 133, 161],
    ];
    patches.forEach(([r, g, b], k) => {
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(12 + (k % 6) * 15, 200 + Math.floor(k / 6) * 15, 14, 14);
    });

    // цветные шахматки справа сверху
    const checks = [['#e8262b', '#1f3fd8'], ['#e8262b', '#21a044'], ['#f0d020', '#6a2bd0']];
    checks.forEach(([a, b], k) => {
      const x0 = W - 100, y0 = 12 + k * 28;
      const sz = k === 0 ? 1 : k === 1 ? 2 : 4;
      for (let yy = 0; yy < 22; yy++) for (let xx = 0; xx < 88; xx++) {
        ctx.fillStyle = (Math.floor(xx / sz) + Math.floor(yy / sz)) % 2 ? a : b;
        ctx.fillRect(x0 + xx, y0 + yy, 1, 1);
      }
    });
    // красный текст на синем
    ctx.fillStyle = '#2233c9'; ctx.fillRect(W - 100, 98, 88, 34);
    ctx.fillStyle = '#ff3b2f';
    ctx.font = `700 24px ${fontFamily('serif')}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('ЦВЕТ', W - 56, 116);

    // косой край
    ctx.save();
    ctx.translate(W - 56, 208); ctx.rotate(0.09);
    ctx.fillStyle = '#f2f2f2'; ctx.fillRect(-38, -38, 76, 76);
    ctx.fillStyle = '#0c0c0c'; ctx.fillRect(-38, -38, 38, 38); ctx.fillRect(0, 0, 38, 38);
    ctx.restore();
    return {
      w: W, h: H, data: ctx.getImageData(0, 0, W, H).data,
      tour: [[W - 56, 114], [56, 56], [150, top + 130], [56, 150], [300, top + 30], [W - 56, 40], [236, top + 98], [W - 60, 206]],
      crops: { blocks: [200, top + 160], ringing: [56, 150], bleed: [W - 56, 116], texture: [56, 56] },
      probe: [W - 48, 116],
    };
  }

  /* ======================================================================
     3. «Вёрстка»: журнальная полоса — буквы, растр, штрихкод
     ====================================================================== */
  function layoutPage() {
    const c = canvas(W, H), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#f3f0e8';
    ctx.fillRect(0, 0, W, H);

    // синий блок с красной буквой
    ctx.fillStyle = '#2336c8';
    ctx.fillRect(0, 0, 184, H);
    ctx.fillStyle = '#ff4a2e';
    ctx.font = `700 160px ${fontFamily('serif')}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Ж', 92, 200);
    ctx.fillStyle = '#f3f0e8';
    ctx.font = `500 11px ${fontFamily('mono')}`;
    ctx.textAlign = 'left';
    ctx.fillText('№ 040 · 1992', 14, 22);
    ctx.fillText('ITU-T T.81', 14, 272);

    // заголовок
    ctx.fillStyle = '#121216';
    ctx.font = `700 27px ${fontFamily('serif')}`;
    ctx.fillText('Буквы', 204, 38);
    ctx.fillText('не любят', 204, 65);
    ctx.fillStyle = '#d8321e';
    ctx.fillText('квадраты', 204, 92);
    ctx.fillStyle = '#121216';
    ctx.fillRect(204, 103, 228, 2);

    // колонка текста
    const text = 'Каждый блок восемь на восемь пикселей JPEG описывает суммой косинусных волн. Резкий край буквы требует множества высоких частот, а квантование срезает их первыми. Поэтому вокруг штрихов появляется рябь, а цветной текст расплывается: цвет хранится с половинным разрешением.';
    ctx.font = `400 8px ${fontFamily('serif')}`;
    const words = text.split(' ');
    let line = '', yy = 120;
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (ctx.measureText(t).width > 108) { ctx.fillText(line, 204, yy); line = wd; yy += 10.5; if (yy > 222) break; }
      else line = t;
    }
    if (line && yy <= 222) ctx.fillText(line, 204, yy);

    // растровая картинка: шар точками
    const hx = 324, hy = 116, hw = 108, hh = 92;
    ctx.fillStyle = '#e6e0d2'; ctx.fillRect(hx, hy, hw, hh);
    ctx.fillStyle = '#18181c';
    for (let y = 0; y < hh; y += 4) {
      for (let x = 0; x < hw; x += 4) {
        const u = (x - hw * 0.52) / 34, v = (y - hh * 0.46) / 34;
        const rr = u * u + v * v;
        let tone = rr < 1 ? 0.22 + 0.78 * clamp(1 - (0.55 * u + 0.62 * v + 0.55 * Math.sqrt(1 - rr)) * 0.9, 0, 1) : 0.1 + 0.12 * (y / hh);
        if (rr >= 1 && y > hh * 0.7) tone = 0.32;
        ctx.beginPath(); ctx.arc(hx + x + 2, hy + y + 2, Math.sqrt(tone) * 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // штрихкод
    const R = rng(1992);
    let bx = 204;
    ctx.fillStyle = '#111';
    while (bx < 306) { const w = 1 + Math.floor(R() * 3); if (R() > 0.45) ctx.fillRect(bx, 232, w, 34); bx += w; }
    ctx.font = `500 8px ${fontFamily('mono')}`;
    ctx.fillText('4 606224 040', 210, 278);

    // пиксельное сердце
    const heart = ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000'];
    ctx.fillStyle = '#d8321e';
    heart.forEach((row, y) => [...row].forEach((b, x) => { if (b === '1') ctx.fillRect(330 + x * 5, 226 + y * 5, 5, 5); }));
    ctx.fillStyle = '#121216';
    ctx.font = `400 16px ${fontFamily('pixel')}`;
    ctx.fillText('8×8', 382, 244);
    ctx.font = `400 8px ${fontFamily('serif')}`;
    ctx.fillText('стр. 62', 396, 278);
    return {
      w: W, h: H, data: ctx.getImageData(0, 0, W, H).data,
      tour: [[40, 120], [260, 60], [378, 156], [240, 250], [346, 236], [92, 160], [230, 150], [300, 94]],
      crops: { blocks: [378, 160], ringing: [236, 60], bleed: [44, 128], texture: [248, 160] },
      probe: [60, 130],
    };
  }

  /* ---------- Своя картинка: вписываем в рабочий размер ---------- */
  function fromBitmap(bmp, maxW, maxH) {
    maxW = maxW || W; maxH = maxH || H;
    const s = Math.min(1, maxW / bmp.width, maxH / bmp.height);
    const w = Math.max(16, Math.round(bmp.width * s)), h = Math.max(16, Math.round(bmp.height * s));
    const c = canvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bmp, 0, 0, w, h);
    return { w, h, data: ctx.getImageData(0, 0, w, h).data };
  }

  root.IMAGES = {
    W, H,
    list: [
      { id: 'lighthouse', title: 'Маяк', make: lighthouse },
      { id: 'chart', title: 'Таблица', make: testChart },
      { id: 'page', title: 'Вёрстка', make: layoutPage },
    ],
    fromBitmap,
  };
})(window);
