'use strict';
/* ==========================================================================
   actors.js — герои: олень (скелет, обратная кинематика ног, рога, которые
   во сне распускаются), снегирь и певчая птица, ласточки, журавли, крупный
   план глаза, подснежник, сосулька с каплей.
   ========================================================================== */

/* ---------- олень ---------- */
const TORSO = [
  [0.82, 0.03], [0.74, 0.23], [0.52, 0.35], [0.2, 0.31], [-0.2, 0.3], [-0.56, 0.33], [-0.8, 0.23], [-0.9, 0.03],
  [-0.84, -0.17], [-0.6, -0.26], [-0.25, -0.3], [0.12, -0.31], [0.46, -0.27], [0.7, -0.16],
];
const HEAD = [
  [-0.09, 0.05], [0.03, 0.11], [0.16, 0.1], [0.3, 0.06], [0.42, 0.02], [0.49, -0.035], [0.47, -0.085],
  [0.39, -0.112], [0.25, -0.12], [0.1, -0.13], [-0.05, -0.1], [-0.11, -0.02],
];
// Рога в мировых смещениях при «нейтральном» наклоне головы H0; при загрузке переводятся в систему головы
const H0 = -0.5;
const ANTLER_SRC = [
  { pts: [[0, 0], [-0.1, 0.18], [-0.22, 0.4], [-0.27, 0.64], [-0.2, 0.86], [-0.1, 1.0]], w0: 0.052, w1: 0.022 },
  { pts: [[-0.02, 0.05], [0.12, 0.12], [0.27, 0.12]], w0: 0.032, w1: 0.013 },
  { pts: [[-0.08, 0.15], [0.04, 0.26], [0.16, 0.3]], w0: 0.03, w1: 0.012 },
  { pts: [[-0.23, 0.44], [-0.1, 0.55], [0.0, 0.64]], w0: 0.028, w1: 0.011 },
  { pts: [[-0.2, 0.86], [-0.33, 1.0]], w0: 0.022, w1: 0.01 },
  { pts: [[-0.1, 1.0], [-0.02, 1.13]], w0: 0.02, w1: 0.009 },
  { pts: [[-0.1, 1.0], [-0.19, 1.15]], w0: 0.02, w1: 0.009 },
];
const toHead = (p) => { const c = Math.cos(-H0), s = Math.sin(-H0); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
const ANTLER = ANTLER_SRC.map((b) => ({ pts: b.pts.map(toHead), w0: b.w0, w1: b.w1 }));
// точки для почек, листьев и цветов вдоль рогов
const ANTLER_DECO = (() => {
  const r = rng(515), out = [];
  ANTLER.forEach((b, bi) => {
    for (let k = 0; k < b.pts.length - 1; k++) {
      const a = b.pts[k], c = b.pts[k + 1], len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const n = Math.max(1, Math.round(len / 0.06));
      for (let j = 0; j < n; j++) {
        if (bi === 0 && k === 0 && j < 2) continue;
        const u = (j + r()) / n;
        const ang = Math.atan2(c[1] - a[1], c[0] - a[0]) + (r() < 0.5 ? 1 : -1) * (0.7 + r() * 0.6);
        out.push({ x: lerp(a[0], c[0], u), y: lerp(a[1], c[1], u), ang, r: r(), g: Math.floor(r() * 4), flower: r() < 0.42 });
      }
    }
  });
  return out;
})();

const COAT_W = hex('#5e4c40'), COAT_S = hex('#9a5834');
const MANE_W = hex('#3b302a'), MANE_S = hex('#6b3d24');
const BELLY_W = hex('#a39080'), BELLY_S = hex('#caa07c');
const RUMP = hex('#d8c6a6');

function deerStand() {
  return { bodyY: 1.0, tilt: 0, neck: 1.02, head: -0.5, ear: 0, tail: 0, legs: [[0.5, 0], [0.44, 0], [-0.56, 0], [-0.5, 0]], blink: 0, stretch: 0 };
}

// 2-звенная обратная кинематика: корень → сустав → копыто; bend задаёт, куда смотрит сустав
function ik(rx, ry, tx, ty, l1, l2, bend) {
  let dx = tx - rx, dy = ty - ry, d = Math.hypot(dx, dy);
  d = clamp(d, Math.abs(l1 - l2) + 0.01, l1 + l2 - 0.001);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx) + bend * a;
  const jx = rx + Math.cos(base) * l1, jy = ry + Math.sin(base) * l1;
  const a2 = Math.atan2(ty - jy, tx - jx);
  return [jx, jy, jx + Math.cos(a2) * l2, jy + Math.sin(a2) * l2];
}
function taper(ctx, x0, y0, x1, y1, w0, w1) {
  const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
  ctx.moveTo(x0 + nx * w0, y0 + ny * w0);
  ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
  ctx.arc(x1, y1, w1, a + Math.PI / 2, a - Math.PI / 2, true);
  ctx.lineTo(x0 - nx * w0, y0 - ny * w0);
  ctx.arc(x0, y0, w0, a - Math.PI / 2, a + Math.PI / 2, true);
}
// Гладкая замкнутая кривая через точки (серединные квадратичные сплайны)
function smoothClosed(ctx, pts) {
  const n = pts.length;
  const mid = (i) => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
  let m = mid(n - 1);
  ctx.moveTo(m[0], m[1]);
  for (let i = 0; i < n; i++) { m = mid(i); ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
  ctx.closePath();
}

/* D: { x, z, facing, pose, coat 0..1, ahue, bud, leaf, bloom, fall, snowBack, mound, breath, rim } */
function drawDeer(ctx, D, t) {
  const p = proj(D.x, D.y || 0, D.z); if (p.d < 0.3) return;
  const P = D.pose, E = ENV, d = p.d;
  const coat = fogged(mixc(COAT_W, COAT_S, D.coat), d);
  const mane = fogged(mixc(MANE_W, MANE_S, D.coat), d);
  const belly = fogged(mixc(BELLY_W, BELLY_S, D.coat), d);
  const litC = lit(coat, 0.75), shC = mixc(coat, E.shadow, 0.45);
  const farC = mixc(coat, E.shadow, 0.5);
  place(ctx, p.x, p.y, p.s, D.facing);
  const ct = Math.cos(P.tilt), st = Math.sin(P.tilt);
  const sx = 1 + (P.stretch || 0), sy = 1 - (P.stretch || 0) * 0.6;
  const B = (x, y) => { x *= sx; y *= sy; return [x * ct - y * st, P.bodyY + x * st + y * ct]; };
  // корни ног
  const roots = [B(0.5, -0.17), B(0.44, -0.15), B(-0.55, -0.02), B(-0.49, 0)];
  const L1 = [0.44, 0.44, 0.57, 0.57], L2 = [0.44, 0.44, 0.5, 0.5], BEND = [1, 1, -1, -1];
  const legW = [[0.1, 0.045, 0.032], [0.09, 0.042, 0.03], [0.14, 0.05, 0.032], [0.13, 0.047, 0.03]];
  const drawLeg = (i, col) => {
    const r = roots[i], tg = P.legs[i];
    const [jx, jy, hx, hy] = ik(r[0], r[1], tg[0], tg[1], L1[i], L2[i], BEND[i]);
    ctx.beginPath();
    taper(ctx, r[0], r[1], jx, jy, legW[i][0], legW[i][1]);
    taper(ctx, jx, jy, hx, hy, legW[i][1] * 0.95, legW[i][2]);
    ctx.fillStyle = css(col); ctx.fill();
    ctx.beginPath();
    const a = Math.atan2(hy - jy, hx - jx);
    ell(ctx, hx + Math.cos(a) * 0.02, hy + Math.sin(a) * 0.02, 0.045, 0.03, a);
    ctx.fillStyle = css(dark(col, 0.55)); ctx.fill();
  };
  // голова и шея
  const nb = B(0.56, 0.13);
  const na = P.neck + P.tilt * 0.5;
  const J = [nb[0] + Math.cos(na) * 0.62, nb[1] + Math.sin(na) * 0.62];
  const ha = P.head, hc = Math.cos(ha), hs = Math.sin(ha);
  const Hp = (u, v) => [J[0] + u * hc - v * hs, J[1] + u * hs + v * hc];
  const antlerPath = (dx, dy, col, scale) => {
    ctx.strokeStyle = css(col);
    ctx.lineCap = 'round';
    for (const b of ANTLER) {
      for (let k = 0; k < b.pts.length - 1; k++) {
        const a = Hp(0.06 + dx + b.pts[k][0] * scale, 0.12 + dy + b.pts[k][1] * scale);
        const c = Hp(0.06 + dx + b.pts[k + 1][0] * scale, 0.12 + dy + b.pts[k + 1][1] * scale);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]);
        ctx.lineWidth = lerp(b.w0, b.w1, (k + 0.5) / (b.pts.length - 1)) * 2;
        ctx.stroke();
      }
    }
  };
  const antlerC = fogged(mixc(hex('#cdbd9e'), E.light, 0.25), d);
  const earPath = (du, dv, extra, col) => {
    const base = Hp(0.0 + du, 0.09 + dv);
    const a = ha + 2.15 + P.ear + extra;
    const tip = [base[0] + Math.cos(a) * 0.22, base[1] + Math.sin(a) * 0.22];
    const nx = -Math.sin(a) * 0.055, ny = Math.cos(a) * 0.055;
    ctx.beginPath();
    ctx.moveTo(base[0] + nx, base[1] + ny);
    ctx.quadraticCurveTo(base[0] + Math.cos(a) * 0.12 + nx * 1.5, base[1] + Math.sin(a) * 0.12 + ny * 1.5, tip[0], tip[1]);
    ctx.quadraticCurveTo(base[0] + Math.cos(a) * 0.12 - nx * 1.3, base[1] + Math.sin(a) * 0.12 - ny * 1.3, base[0] - nx, base[1] - ny);
    ctx.closePath();
    ctx.fillStyle = css(col); ctx.fill();
  };

  // дальний план тела
  drawLeg(1, farC); drawLeg(3, farC);
  earPath(0.03, 0.02, 0.12, farC);
  antlerPath(0.035, 0.01, mixc(antlerC, E.shadow, 0.4), 0.97);
  // хвост
  const tb = B(-0.86, 0.18);
  ctx.beginPath();
  ell(ctx, tb[0] - 0.04, tb[1] - 0.05 + P.tail * 0.05, 0.05, 0.1, 0.3 + P.tail);
  ctx.fillStyle = css(mane); ctx.fill();
  // туловище
  ctx.beginPath();
  smoothClosed(ctx, TORSO.map((q) => B(q[0], q[1] * (1 + (D.breath || 0) * 0.02))));
  const topY = P.bodyY + 0.35, botY = P.bodyY - 0.31;
  ctx.fillStyle = linear(ctx, 0, topY, 0, botY, [[0, css(litC)], [0.45, css(coat)], [0.8, css(mixc(coat, belly, 0.35))], [1, css(shC)]]);
  ctx.fill();
  // объём: плечо и бедро светлее, под брюхом тень
  const sh1 = B(0.42, 0.04), sh2 = B(-0.52, 0.06), bl = B(0.0, -0.24);
  ctx.beginPath(); ell(ctx, sh1[0], sh1[1], 0.24, 0.27, P.tilt - 0.3); ell(ctx, sh2[0], sh2[1], 0.26, 0.26, P.tilt + 0.2);
  ctx.fillStyle = css(litC, 0.28); ctx.fill();
  ctx.beginPath(); ell(ctx, bl[0], bl[1], 0.55, 0.08, P.tilt);
  ctx.fillStyle = css(shC, 0.45); ctx.fill();
  // светлое «зеркало» на крупе
  const rp = B(-0.74, 0.02);
  ctx.beginPath(); ell(ctx, rp[0], rp[1], 0.13, 0.2, P.tilt);
  ctx.fillStyle = css(fogged(RUMP, d), 0.85); ctx.fill();
  // шея
  const wth = B(0.4, 0.33), chest = B(0.8, -0.04);
  const px = -Math.sin(na), py = Math.cos(na);
  ctx.beginPath();
  ctx.moveTo(wth[0], wth[1]);
  ctx.quadraticCurveTo((wth[0] + J[0]) / 2 + px * 0.02, (wth[1] + J[1]) / 2 + py * 0.02, J[0] + px * 0.1, J[1] + py * 0.1);
  ctx.lineTo(J[0] - px * 0.1, J[1] - py * 0.1);
  ctx.quadraticCurveTo((chest[0] + J[0]) / 2 - px * 0.15, (chest[1] + J[1]) / 2 - py * 0.15, chest[0], chest[1]);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, wth[0], wth[1], chest[0], chest[1], [[0, css(lit(coat, 0.5))], [1, css(mixc(mane, coat, 0.3))]]);
  ctx.fill();
  // зимняя грива — лохматая бахрома по горлу
  if (D.coat < 0.8) {
    ctx.beginPath();
    const n = 7;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const bx = lerp(J[0] - px * 0.1, chest[0], u) - px * 0.06 * Math.sin(u * Math.PI), by = lerp(J[1] - py * 0.1, chest[1], u) - py * 0.06 * Math.sin(u * Math.PI);
      if (k === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx - px * 0.04 * (k % 2), by - py * 0.04 * (k % 2) - 0.03 * (k % 2));
    }
    ctx.lineTo(chest[0] + 0.05, chest[1] + 0.1);
    ctx.lineTo(J[0], J[1]);
    ctx.closePath();
    ctx.fillStyle = css(mane, 1 - D.coat); ctx.fill();
  }
  // голова
  ctx.beginPath();
  smoothClosed(ctx, HEAD.map((q) => Hp(q[0], q[1])));
  const hA = Hp(0.1, 0.12), hB = Hp(0.1, -0.13);
  ctx.fillStyle = linear(ctx, hA[0], hA[1], hB[0], hB[1], [[0, css(lit(coat, 0.6))], [1, css(mixc(coat, E.shadow, 0.25))]]);
  ctx.fill();
  // светлая полоса на морде, тёмный влажный нос, светлый подбородок
  ctx.beginPath();
  const mz = Hp(0.36, -0.04), ch = Hp(0.3, -0.11), ns = Hp(0.475, -0.05);
  ell(ctx, mz[0], mz[1], 0.1, 0.05, ha);
  ctx.fillStyle = css(mixc(coat, belly, 0.55), 0.7); ctx.fill();
  ctx.beginPath(); ell(ctx, ch[0], ch[1], 0.1, 0.025, ha);
  ctx.fillStyle = css(light(belly, 0.25), 0.8); ctx.fill();
  ctx.beginPath(); ell(ctx, ns[0], ns[1], 0.035, 0.032, ha);
  ctx.fillStyle = css(fogged(hex('#231c1b'), d)); ctx.fill();
  // светлое кольцо вокруг глаза
  const er = Hp(0.15, 0.035);
  ctx.beginPath(); ell(ctx, er[0], er[1], 0.055, 0.04, ha + 0.15);
  ctx.fillStyle = css(light(mixc(coat, belly, 0.6), 0.1), 0.75); ctx.fill();
  // глаз
  const ey = Hp(0.15, 0.035);
  ctx.beginPath();
  ell(ctx, ey[0], ey[1], 0.035, 0.024 * (1 - clamp(P.blink) * 0.9), ha + 0.15);
  ctx.fillStyle = css(fogged(hex('#140f0e'), d)); ctx.fill();
  if (P.blink < 0.5) {
    ctx.beginPath(); circ(ctx, ey[0] + 0.01, ey[1] + 0.008, 0.008);
    ctx.fillStyle = css(light(E.light, 0.3), 0.9); ctx.fill();
  }
  // ноги ближнего плана
  drawLeg(0, coat); drawLeg(2, coat);
  // контровой свет по спине
  if (D.rim) {
    ctx.beginPath();
    const back = [B(0.52, 0.35), B(0.2, 0.31), B(-0.2, 0.3), B(-0.56, 0.33), B(-0.8, 0.23)];
    ctx.moveTo(back[0][0], back[0][1]);
    for (let k = 1; k < back.length; k++) ctx.lineTo(back[k][0], back[k][1]);
    ctx.lineWidth = 0.035; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = css(light(E.glowC, 0.2), D.rim);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wth[0], wth[1]); ctx.lineTo(J[0] + px * 0.1, J[1] + py * 0.1);
    ctx.stroke();
  }
  earPath(0, 0, 0, lit(coat, 0.3));
  // ближний рог
  antlerPath(0, 0, antlerC, 1);
  drawAntlerDeco(ctx, D, Hp, d, t);
  // снег на спине
  if (D.snowBack > 0.01) {
    ctx.fillStyle = css(light(E.groundNear, 0.15), clamp(D.snowBack * 1.5));
    ctx.beginPath();
    for (let k = 0; k < 7; k++) {
      const q = B(0.45 - k * 0.2, 0.31 + (k === 0 ? 0.02 : 0));
      ell(ctx, q[0], q[1] + 0.02, 0.1 * D.snowBack + 0.02, 0.035 * D.snowBack + 0.01, P.tilt);
    }
    ctx.fill();
  }
  // пар дыхания
  if (D.breath > 0) {
    const nose = Hp(0.5, -0.06);
    const cyc = (t + 0.7) % 3.1;
    if (cyc < 1.8) {
      const k = cyc / 1.8;
      ctx.fillStyle = css(light(E.groundNear, 0.3), 0.33 * (1 - k) * D.breath);
      ctx.beginPath();
      for (let j = 0; j < 4; j++) circ(ctx, nose[0] + (0.08 + k * 0.35) * Math.cos(ha - 0.2) + j * 0.05 * k, nose[1] + k * 0.12 + j * 0.02, 0.03 + k * 0.1 + j * 0.01);
      ctx.fill();
    }
  }
  // сугроб, в котором лежит олень
  if (D.mound > 0.01) {
    const mc = light(E.groundNear, 0.05);
    ctx.fillStyle = linear(ctx, 0, 0.5, 0, 0, [[0, css(mc)], [1, css(mixc(mc, E.snowSh, 0.35))]]);
    ctx.beginPath();
    // невысокий: поджатые ноги и бедро чуть видны над снегом, силуэт читается как лежащий олень
    const mh = D.mound * 0.75;
    ctx.moveTo(-1.35, -0.05);
    ctx.bezierCurveTo(-1.1, 0.3 * mh, -0.3, 0.42 * mh, 0.3, 0.36 * mh);
    ctx.bezierCurveTo(0.8, 0.3 * mh, 1.1, 0.2 * mh, 1.45, -0.05);
    ctx.closePath();
    ctx.fill();
  }
}

function drawAntlerDeco(ctx, D, Hp, d, t) {
  const bud = D.bud || 0, leaf = D.leaf || 0, bloom = D.bloom || 0, fall = D.fall || 0;
  if (bud + leaf + bloom < 0.01) return;
  const E = ENV;
  const sw = Math.sin(t * 2.1) * 0.03 * (0.3 + WIND(t));
  const at = (q) => Hp(0.06 + q.x, 0.12 + q.y);
  // почки
  if (bud > 0.01 && leaf < 0.95) {
    ctx.fillStyle = css(fogged(hex('#9fbe4e'), d), bud * (1 - leaf));
    ctx.beginPath();
    for (const q of ANTLER_DECO) { const p = at(q); circ(ctx, p[0], p[1], 0.012 * bud); }
    ctx.fill();
  }
  // листья
  if (leaf > 0.01) {
    for (let g = 0; g < 4; g++) {
      ctx.fillStyle = css(fogged(lit(leafColor(D.ahue || 0, g), g === 2 ? 0.5 : 0.15), d));
      ctx.beginPath();
      for (const q of ANTLER_DECO) {
        if (q.g !== g || q.r < fall) continue;
        const k = clamp(leaf * 1.6 - q.r * 0.6);
        if (k <= 0) continue;
        const p = at(q), a = q.ang + ha0(D) + sw;
        const L = 0.075 * k;
        ell(ctx, p[0] + Math.cos(a) * L * 0.7, p[1] + Math.sin(a) * L * 0.7, L, L * 0.42, a);
      }
      ctx.fill();
    }
  }
  // цветы
  if (bloom > 0.01) {
    for (const q of ANTLER_DECO) {
      if (!q.flower || q.r < fall) continue;
      const k = clamp(bloom * 1.5 - q.r * 0.5);
      if (k <= 0) continue;
      const p = at(q), a = q.ang + ha0(D);
      const cx = p[0] + Math.cos(a) * 0.05, cy = p[1] + Math.sin(a) * 0.05;
      const r = 0.028 * k;
      ctx.fillStyle = css(fogged(mixc(hex('#fff6f2'), hex('#f2b8c6'), q.r), d));
      ctx.beginPath();
      for (let j = 0; j < 5; j++) circ(ctx, cx + Math.cos(j * 1.2566 + q.r * 6) * r, cy + Math.sin(j * 1.2566 + q.r * 6) * r, r * 0.72);
      ctx.fill();
      ctx.fillStyle = css(hex('#f0c24a'));
      ctx.beginPath(); circ(ctx, cx, cy, r * 0.35); ctx.fill();
    }
  }
}
const ha0 = (D) => D.pose.head;

// Мировая точка кончика рога (для птицы, садящейся на рог)
function antlerTip(D, bi = 2, k = -1) {
  const P = D.pose;
  const ct = Math.cos(P.tilt), st = Math.sin(P.tilt);
  const nbx = 0.56 * ct - 0.13 * st, nby = P.bodyY + 0.56 * st + 0.13 * ct;
  const na = P.neck + P.tilt * 0.5;
  const Jx = nbx + Math.cos(na) * 0.62, Jy = nby + Math.sin(na) * 0.62;
  const b = ANTLER[bi], q = b.pts[k < 0 ? b.pts.length - 1 : k];
  const u = 0.06 + q[0], v = 0.12 + q[1];
  const hc = Math.cos(P.head), hs = Math.sin(P.head);
  return { x: D.x + D.facing * (Jx + u * hc - v * hs), y: Jy + u * hs + v * hc, z: D.z };
}
function deerHead(D) {
  const P = D.pose;
  const ct = Math.cos(P.tilt), st = Math.sin(P.tilt);
  const nbx = 0.56 * ct - 0.13 * st, nby = P.bodyY + 0.56 * st + 0.13 * ct;
  const na = P.neck + P.tilt * 0.5;
  return { x: D.x + D.facing * (nbx + Math.cos(na) * 0.62), y: nby + Math.sin(na) * 0.62, z: D.z };
}

/* ---------- походки: цели копыт как функции фазы ---------- */
function walkLegs(phase, stride, lift) {
  const off = [0.25, 0.75, 0, 0.5], x0 = [0.5, 0.44, -0.56, -0.5];
  const duty = 0.64;
  return off.map((o, i) => {
    const f = fract(phase + o);
    if (f < duty) { const s = f / duty; return [x0[i] + stride * duty * (0.5 - s), 0]; }
    const s = (f - duty) / (1 - duty);
    return [x0[i] + stride * duty * (-0.5 + Ease.sine(s)), lift * Math.sin(Math.PI * s) * (i < 2 ? 1 : 0.8)];
  });
}
// Галоп прыжками: таблица положения копыт по фазе, между ключами — сплайн Катмулла — Рома
const GALLOP = {
  front: [[0.95, 0.42], [1.12, 0.14], [0.62, 0.0], [0.12, 0.02], [0.25, 0.42]],
  hind: [[-0.98, 0.06], [-1.15, 0.36], [-0.62, 0.5], [0.08, 0.06], [-0.42, 0.0]],
  keys: [0, 0.22, 0.45, 0.62, 0.8],
};
function cyclic(tab, keys, f) {
  const n = keys.length;
  let i = 0;
  while (i < n - 1 && f >= keys[i + 1]) i++;
  const k0 = keys[i], k1 = i + 1 < n ? keys[i + 1] : 1;
  const u = (f - k0) / (k1 - k0);
  const p0 = tab[(i - 1 + n) % n], p1 = tab[i], p2 = tab[(i + 1) % n], p3 = tab[(i + 2) % n];
  const cr = (a, b, c, d2) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d2) * u * u + (-a + 3 * b - 3 * c + d2) * u * u * u);
  return [cr(p0[0], p1[0], p2[0], p3[0]), Math.max(0, cr(p0[1], p1[1], p2[1], p3[1]))];
}
function gallopPose(phase) {
  const P = deerStand();
  const f = fract(phase);
  P.legs = [
    cyclic(GALLOP.front, GALLOP.keys, fract(f)), cyclic(GALLOP.front, GALLOP.keys, fract(f - 0.05)),
    cyclic(GALLOP.hind, GALLOP.keys, fract(f)), cyclic(GALLOP.hind, GALLOP.keys, fract(f - 0.05)),
  ];
  P.bodyY = 1.06 + 0.2 * Math.sin(TAU * (f - 0.02));
  P.tilt = 0.14 * Math.sin(TAU * (f + 0.12));
  P.neck = 0.78 + 0.08 * Math.sin(TAU * (f + 0.3));
  P.head = -0.3 + 0.08 * Math.sin(TAU * (f + 0.45));
  P.ear = -0.35;
  P.tail = 0.5 + 0.3 * Math.sin(TAU * f);
  P.stretch = 0.075 * Math.sin(TAU * (f - 0.02));
  return P;
}

/* ---------- птицы ---------- */
const BULLFINCH = { back: hex('#7f8390'), breast: hex('#e2533b'), cap: hex('#1b191d'), wing: hex('#29262c'), bar: hex('#ece7df'), tail: hex('#1b191d'), belly: hex('#f0ebe4'), cheek: hex('#e2533b') };
const ROBIN = { back: hex('#7b6a50'), breast: hex('#ec8a38'), cap: hex('#7b6a50'), wing: hex('#6a5942'), bar: hex('#d9c9a6'), tail: hex('#65553f'), belly: hex('#efe5d2'), cheek: hex('#ec8a38') };

/* B: { x, y, z, facing, tilt, squash, fly 0..1, flap (фаза), sing 0..1, fluff 0..1, look (поворот головы) } */
function drawSongbird(ctx, B, pal, t) {
  const p = proj(B.x, B.y, B.z); if (p.d < 0.2) return;
  const d = p.d;
  const C = (c) => fogged(mixc(c, mulc(c, ENV.light), 0.35), d);
  place(ctx, p.x, p.y, p.s, B.facing);
  ctx.rotate(B.tilt || 0);
  const sq = B.squash || 1, fl = 1 + (B.fluff || 0) * 0.18;
  ctx.scale(1 / Math.sqrt(sq), sq);
  const fly = B.fly || 0;
  // лапки
  if (fly < 0.5) {
    ctx.strokeStyle = css(C(hex('#5a4a44'))); ctx.lineWidth = 0.007;
    ctx.beginPath(); ctx.moveTo(0.005, 0.03); ctx.lineTo(0, 0); ctx.moveTo(0.02, 0.03); ctx.lineTo(0.024, 0); ctx.stroke();
  }
  // дальнее крыло в полёте
  const flapA = fly * (Math.sin(B.flap || 0) * 1.1 + 0.2);
  if (fly > 0.05) {
    ctx.save(); ctx.translate(0.0, 0.075); ctx.rotate(0.6 + flapA);
    ctx.beginPath(); ell(ctx, -0.05, 0, 0.075, 0.028, 0);
    ctx.fillStyle = css(mixc(C(pal.wing), ENV.shadow, 0.3)); ctx.fill(); ctx.restore();
  }
  // хвост
  ctx.beginPath();
  ctx.moveTo(-0.05, 0.065); ctx.lineTo(-0.15, 0.045 + fly * 0.02); ctx.lineTo(-0.145, 0.025); ctx.lineTo(-0.045, 0.04);
  ctx.closePath(); ctx.fillStyle = css(C(pal.tail)); ctx.fill();
  // тело
  ctx.save();
  ctx.beginPath(); ell(ctx, 0, 0.058, 0.072 * fl, 0.05 * fl, -0.1);
  ctx.fillStyle = css(C(pal.back)); ctx.fill();
  ctx.clip();
  ctx.beginPath(); ell(ctx, 0.03, 0.02, 0.07 * fl, 0.055 * fl, 0.3);
  ctx.fillStyle = css(C(pal.breast)); ctx.fill();
  ctx.beginPath(); ell(ctx, -0.04, 0.01, 0.05, 0.03, 0.2);
  ctx.fillStyle = css(C(pal.belly), 0.7); ctx.fill();
  ctx.restore();
  // сложенное крыло
  if (fly < 0.6) {
    ctx.beginPath(); ell(ctx, -0.02, 0.066, 0.052, 0.026, -0.18);
    ctx.fillStyle = css(C(pal.wing)); ctx.fill();
    ctx.beginPath(); ell(ctx, -0.01, 0.058, 0.036, 0.007, -0.2);
    ctx.fillStyle = css(C(pal.bar)); ctx.fill();
  }
  // голова
  const hx = 0.058, hy = 0.108 + (B.sing || 0) * 0.006;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(B.look || 0);
  ctx.beginPath(); circ(ctx, 0, 0, 0.036 * fl);
  ctx.fillStyle = css(C(pal.cheek)); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.beginPath(); ctx.rect(-0.05, 0.004, 0.1, 0.05); ctx.fillStyle = css(C(pal.cap)); ctx.fill();
  ctx.restore();
  // клюв
  const open = (B.sing || 0) * 0.35;
  ctx.fillStyle = css(C(hex('#231f22')));
  ctx.beginPath(); ctx.moveTo(0.028, 0.008); ctx.lineTo(0.06, -0.004 + open * 0.02); ctx.lineTo(0.03, -0.012); ctx.closePath(); ctx.fill();
  if (open > 0.02) { ctx.beginPath(); ctx.moveTo(0.028, -0.01); ctx.lineTo(0.055, -0.02 - open * 0.03); ctx.lineTo(0.03, -0.02); ctx.closePath(); ctx.fill(); }
  // глаз
  ctx.beginPath(); circ(ctx, 0.014, 0.008, 0.007); ctx.fillStyle = '#0d0b0c'; ctx.fill();
  ctx.beginPath(); circ(ctx, 0.016, 0.01, 0.0025); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
  ctx.restore();
  // ближнее крыло в полёте
  if (fly > 0.05) {
    ctx.save(); ctx.translate(0.005, 0.08); ctx.rotate(0.45 - flapA);
    ctx.beginPath(); ell(ctx, -0.055, 0, 0.08, 0.03, 0);
    ctx.fillStyle = css(C(pal.wing)); ctx.fill();
    ctx.beginPath(); ell(ctx, -0.04, 0.004, 0.05, 0.008, 0);
    ctx.fillStyle = css(C(pal.bar)); ctx.fill();
    ctx.restore();
  }
}

// Ласточка: тёмная спина, белое брюхо, длинные крылья, вилка хвоста. flap — фаза взмаха.
function drawSwallow(ctx, x, y, z, facing, flap, bank) {
  const p = proj(x, y, z); if (p.d < 0.3) return;
  const c = fogged(hex('#1d2238'), p.d), w = fogged(hex('#efe6d8'), p.d);
  place(ctx, p.x, p.y, p.s * 1.25, facing);
  ctx.rotate(bank || 0);
  const a = Math.sin(flap) * 0.9;
  ctx.fillStyle = css(c);
  ctx.beginPath();
  ctx.moveTo(0.1, 0.0); ctx.quadraticCurveTo(0.02, 0.03, -0.08, 0.01);
  ctx.lineTo(-0.2, 0.04); ctx.lineTo(-0.1, -0.005); ctx.lineTo(-0.2, -0.03); ctx.lineTo(-0.07, -0.02);
  ctx.quadraticCurveTo(0.02, -0.03, 0.1, 0.0); ctx.fill();
  ctx.beginPath(); ell(ctx, 0.0, -0.012, 0.05, 0.012, 0); ctx.fillStyle = css(w); ctx.fill();
  ctx.fillStyle = css(c);
  for (const s of [1, -0.6]) {
    ctx.save(); ctx.translate(0.01, 0.005); ctx.rotate(Math.PI / 2 * 0 + a * s);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-0.05, 0.12 * s, -0.16, 0.2 * s); ctx.quadraticCurveTo(-0.04, 0.07 * s, -0.03, 0); ctx.fill();
    ctx.restore();
  }
}

// Журавль в полёте: вытянутая шея, ноги назад, широкие крылья с чёрными маховыми
function drawCrane(ctx, x, y, z, facing, flap) {
  const p = proj(x, y, z); if (p.d < 1) return;
  const d = p.d;
  const body = fogged(hex('#a3a7ad'), d), darkC = fogged(hex('#2a2a2e'), d), wing = fogged(hex('#8f959c'), d);
  place(ctx, p.x, p.y, p.s, facing);
  const a = Math.sin(flap);
  ctx.lineCap = 'round';
  // дальнее крыло
  ctx.fillStyle = css(mixc(wing, ENV.shadow, 0.3));
  ctx.beginPath(); ctx.moveTo(0.1, 0.02); ctx.quadraticCurveTo(-0.1, 0.5 * a + 0.2, -0.45, 0.75 * a + 0.1); ctx.lineTo(-0.3, 0.02); ctx.closePath(); ctx.fill();
  // тело
  ctx.fillStyle = css(body);
  ctx.beginPath(); ell(ctx, 0, 0, 0.36, 0.1, 0.03); ctx.fill();
  // шея и голова
  ctx.strokeStyle = css(darkC); ctx.lineWidth = 0.06;
  ctx.beginPath(); ctx.moveTo(0.3, 0.02); ctx.lineTo(0.78, 0.07); ctx.stroke();
  ctx.fillStyle = css(darkC); ctx.beginPath(); ell(ctx, 0.8, 0.07, 0.06, 0.04, 0); ctx.fill();
  ctx.strokeStyle = css(fogged(hex('#6b5a48'), d)); ctx.lineWidth = 0.025;
  ctx.beginPath(); ctx.moveTo(0.85, 0.07); ctx.lineTo(0.98, 0.055); ctx.stroke();
  ctx.strokeStyle = css(fogged(hex('#e8e4dc'), d)); ctx.lineWidth = 0.02;
  ctx.beginPath(); ctx.moveTo(0.5, 0.06); ctx.lineTo(0.75, 0.09); ctx.stroke();
  ctx.fillStyle = css(fogged(hex('#c8322a'), d)); ctx.beginPath(); circ(ctx, 0.8, 0.11, 0.018); ctx.fill();
  // ноги
  ctx.strokeStyle = css(darkC); ctx.lineWidth = 0.025;
  ctx.beginPath(); ctx.moveTo(-0.3, -0.02); ctx.lineTo(-0.85, -0.06); ctx.stroke();
  // ближнее крыло с чёрными маховыми
  ctx.fillStyle = css(wing);
  ctx.beginPath(); ctx.moveTo(0.14, 0.03); ctx.quadraticCurveTo(0.0, -0.5 * a + 0.35, -0.3, -0.9 * a + 0.3); ctx.lineTo(-0.28, 0.02); ctx.closePath(); ctx.fill();
  ctx.fillStyle = css(darkC);
  ctx.beginPath(); ctx.moveTo(-0.1, -0.5 * a + 0.2); ctx.quadraticCurveTo(-0.2, -0.75 * a + 0.3, -0.3, -0.9 * a + 0.3); ctx.lineTo(-0.3, -0.4 * a + 0.1); ctx.closePath(); ctx.fill();
}

// Мелкая птица стаи (в экранных координатах)
function drawFlockBird(ctx, sx, sy, size, flap, col) {
  scr(ctx);
  const a = Math.sin(flap) * 0.9;
  ctx.strokeStyle = css(col); ctx.lineWidth = Math.max(1.4, size * 0.22); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(sx - size, sy - a * size * 0.8);
  ctx.quadraticCurveTo(sx - size * 0.45, sy - a * size * 0.2 - size * 0.25, sx, sy);
  ctx.quadraticCurveTo(sx + size * 0.45, sy - a * size * 0.2 - size * 0.25, sx + size, sy - a * size * 0.8);
  ctx.stroke();
  ctx.fillStyle = css(col); ctx.beginPath(); ell(ctx, sx, sy + size * 0.05, size * 0.22, size * 0.14, 0); ctx.fill();
}

/* ---------- подснежник ---------- */
function drawSnowdrop(ctx, x, z, grow, open, t, seed) {
  if (grow < 0.01) return;
  const p = proj(x, 0, z); if (p.d < 0.2) return;
  const d = p.d;
  place(ctx, p.x, p.y, p.s * grow);
  const sw = Math.sin(t * 1.7 + seed) * 0.05;
  const green = fogged(lit(hex('#5f8f45'), 0.3), d), white = fogged(mixc(hex('#f7f6ee'), ENV.light, 0.15), d);
  ctx.strokeStyle = css(green); ctx.lineCap = 'round';
  ctx.lineWidth = 0.008;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0.004, 0.08, 0.012 + sw * 0.1, 0.13); ctx.quadraticCurveTo(0.03 + sw * 0.2, 0.15, 0.04 + sw * 0.25, 0.125); ctx.stroke();
  ctx.fillStyle = css(green);
  ctx.beginPath(); ell(ctx, -0.012, 0.05, 0.006, 0.05, 0.12); ell(ctx, 0.014, 0.045, 0.006, 0.045, -0.15); ctx.fill();
  const fx = 0.04 + sw * 0.25, fy = 0.115;
  const o = clamp(open);
  const petals = (dx, dy, k) => {
    ctx.beginPath();
    for (const s of [-1, 0, 1]) ell(ctx, fx + s * 0.012 * (0.4 + o) + dx, fy - 0.022 + dy, (0.009 + o * 0.003) * k, 0.024 * k, s * (0.15 + o * 0.35));
    ctx.fill();
  };
  // холодная тень под лепестками — иначе белый цветок растворяется в белом снегу
  ctx.fillStyle = css(mixc(white, ENV.shadow, 0.55), 0.85); petals(0.003, -0.002, 1.22);
  ctx.fillStyle = css(white); petals(0, 0, 1);
  ctx.fillStyle = css(green); ctx.beginPath(); circ(ctx, fx, fy, 0.006); ctx.fill();
}

/* ---------- сосулька и капля ---------- */
function drawIcicle(ctx, x, y, z, len, drop, dropY) {
  const p = proj(x, y, z); if (p.d < 0.2) return;
  place(ctx, p.x, p.y, p.s);
  const ice = mixc(hex('#d9ecf6'), ENV.light, 0.35), glow = light(ENV.glowC, 0.2);
  ctx.fillStyle = linear(ctx, -0.02, 0, 0.02, 0, [[0, css(ice, 0.95)], [0.6, css(glow, 0.9)], [1, css(mixc(ice, ENV.shadow, 0.3), 0.95)]]);
  ctx.beginPath();
  ctx.moveTo(-0.022, 0.01); ctx.quadraticCurveTo(-0.012, -len * 0.5, -0.002, -len); ctx.lineTo(0.002, -len);
  ctx.quadraticCurveTo(0.012, -len * 0.5, 0.022, 0.01); ctx.closePath(); ctx.fill();
  if (drop > 0.01) {
    const r = 0.012 * clamp(drop);
    const yy = dropY != null ? dropY - y : -len - r * 0.8;
    ctx.fillStyle = css(mixc(ice, glow, 0.5), 0.95);
    ctx.beginPath(); ell(ctx, 0, yy, r * 0.85, r * 1.1, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); circ(ctx, -r * 0.3, yy + r * 0.35, r * 0.28); ctx.fill();
  }
}

/* ---------- крупный план: глаз оленя ---------- */
// st: { open 0..1, dawn 0..1, flake {x, y, rot, a}, drop 0..1, zoom, t }
const FUR = (() => {
  const r = rng(333), out = [];
  for (let i = 0; i < 900; i++) {
    const x = r() * 1800 - 100, y = r() * 1100 - 100;
    // поле шерсти: от носа (справа) к уху (слева), обтекает глаз
    const dx = x - 800, dy = (y - 470) * 1.6, rr = Math.hypot(dx, dy);
    let a = Math.PI + Math.sin(y * 0.004) * 0.3;
    if (rr < 520) { const sw = (1 - rr / 520) * 1.2; a += Math.atan2(dy, dx) * 0 + sw * Math.sign(dy || 1) * 0.9; }
    out.push({ x, y, a: a + (r() - 0.5) * 0.4, l: 30 + r() * 55, w: 2 + r() * 4, c: r(), rr });
  }
  return out;
})();
function drawEyeCloseup(ctx, st) {
  scr(ctx);
  const dawn = st.dawn;
  const furBase = mixc(hex('#3c3434'), hex('#6f5242'), dawn);
  const furLight = mixc(hex('#7d8bb0'), hex('#e8a67e'), dawn);
  const furDark = mixc(hex('#1d1a22'), hex('#3b2822'), dawn);
  ctx.save();
  ctx.translate(800, 470); ctx.scale(st.zoom, st.zoom); ctx.translate(-800, -470);
  ctx.fillStyle = radial(ctx, 700, 260, 60, 1300, [[0, css(mixc(furBase, furLight, 0.45))], [0.5, css(furBase)], [1, css(furDark)]]);
  ctx.fillRect(-200, -200, 2000, 1300);
  // шерсть
  ctx.lineCap = 'round';
  for (let g = 0; g < 3; g++) {
    const col = g === 0 ? mixc(furBase, furLight, 0.55) : g === 1 ? dark(furBase, 0.25) : mixc(furBase, furLight, 0.2);
    ctx.strokeStyle = css(col, 0.55);
    ctx.lineWidth = 3 + g;
    ctx.beginPath();
    for (let i = g; i < FUR.length; i += 3) {
      const f = FUR[i];
      if (f.rr < 250) continue;
      ctx.moveTo(f.x, f.y);
      ctx.quadraticCurveTo(f.x + Math.cos(f.a) * f.l * 0.5, f.y + Math.sin(f.a) * f.l * 0.5 - 6, f.x + Math.cos(f.a) * f.l, f.y + Math.sin(f.a) * f.l);
    }
    ctx.stroke();
  }
  // светлое кольцо вокруг глаза и тёмная кожа века
  ctx.fillStyle = radial(ctx, 800, 470, 200, 420, [[0, css(mixc(furBase, furLight, 0.6), 0.8)], [1, css(mixc(furBase, furLight, 0.6), 0)]]);
  ctx.beginPath(); ell(ctx, 800, 470, 420, 300, -0.05); ctx.fill();
  const Ci = [1075, 492], Co = [525, 452];
  const lidCtl = [800, lerp(650, 190, clamp(st.open))];
  const lowCtl = [800, 690];
  ctx.beginPath();
  ctx.moveTo(Co[0] - 40, Co[1] - 10);
  ctx.quadraticCurveTo(800, 150, Ci[0] + 40, Ci[1]);
  ctx.quadraticCurveTo(800, 740, Co[0] - 40, Co[1] - 10);
  ctx.fillStyle = css(dark(furDark, 0.3), 0.9); ctx.fill();
  // глазное яблоко (полная миндалина)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(Co[0], Co[1]); ctx.quadraticCurveTo(800, 190, Ci[0], Ci[1]); ctx.quadraticCurveTo(lowCtl[0], lowCtl[1], Co[0], Co[1]);
  ctx.clip();
  // радужка: тёплый тёмно-карий, к краю почти чёрный; горизонтальный зрачок
  ctx.fillStyle = radial(ctx, 820, 540, 10, 360, [[0, css(mixc(hex('#4a2c1a'), hex('#7a4522'), dawn))], [0.45, css(mixc(hex('#24150f'), hex('#3a2014'), dawn))], [1, '#060405']]);
  ctx.fillRect(400, 150, 800, 600);
  ctx.beginPath(); ell(ctx, 820, 500, 150, 46, -0.03);
  ctx.fillStyle = 'rgba(6,4,4,0.8)'; ctx.fill();
  // отражение неба и леса — серп по верхнему изгибу глаза
  const sky = mixc(hex('#6b82b8'), hex('#f3b890'), dawn);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(560, 470); ctx.quadraticCurveTo(760, 250, 1010, 420);
  ctx.quadraticCurveTo(780, 330, 560, 470); ctx.closePath();
  ctx.fillStyle = linear(ctx, 560, 300, 1000, 420, [[0, css(light(sky, 0.35), 0.85)], [0.6, css(sky, 0.55)], [1, css(sky, 0.1)]]);
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = css(dark(sky, 0.65), 0.7);
  ctx.beginPath();
  for (let k = 0; k < 11; k++) { const x = 600 + k * 36 + hash(k) * 14, h = 40 + hash(k * 3) * 70, b = 430 - k * 6; ctx.moveTo(x, b); ctx.lineTo(x + 8, b - h); ctx.lineTo(x + 16, b); }
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.beginPath(); ell(ctx, 700, 345, 30, 17, -0.45); ctx.fill();
  ctx.beginPath(); circ(ctx, 760, 330, 7); ctx.fill();
  ctx.beginPath(); ell(ctx, 930, 590, 40, 10, 0.25); ctx.fillStyle = css(sky, 0.25); ctx.fill();
  ctx.restore();
  // влажный блик вдоль нижнего века
  ctx.beginPath(); ctx.moveTo(Co[0] + 40, Co[1] + 18); ctx.quadraticCurveTo(lowCtl[0], lowCtl[1] - 26, Ci[0] - 40, Ci[1] + 6);
  ctx.lineWidth = 3; ctx.strokeStyle = css(light(sky, 0.4), 0.5); ctx.stroke();
  // верхнее веко
  ctx.beginPath();
  ctx.moveTo(Co[0] - 30, Co[1] - 6);
  ctx.quadraticCurveTo(800, 120, Ci[0] + 30, Ci[1]);
  ctx.lineTo(Ci[0], Ci[1]);
  ctx.quadraticCurveTo(lidCtl[0], lidCtl[1], Co[0], Co[1]);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, 200, 0, lidCtl[1] * 0.5 + 240, [[0, css(mixc(furBase, furLight, 0.35))], [1, css(dark(furBase, 0.35))]]);
  ctx.fill();
  // край века
  ctx.beginPath();
  ctx.moveTo(Co[0], Co[1]); ctx.quadraticCurveTo(lidCtl[0], lidCtl[1], Ci[0], Ci[1]);
  ctx.lineWidth = 12; ctx.strokeStyle = css(furDark); ctx.stroke();
  // ресницы
  const bez = (u) => [(1 - u) * (1 - u) * Co[0] + 2 * u * (1 - u) * lidCtl[0] + u * u * Ci[0], (1 - u) * (1 - u) * Co[1] + 2 * u * (1 - u) * lidCtl[1] + u * u * Ci[1]];
  ctx.strokeStyle = css(dark(furDark, 0.4)); ctx.lineCap = 'round';
  const lashTips = [];
  for (let i = 0; i < 26; i++) {
    const u = 0.1 + 0.8 * i / 25 + (hash(i * 7.3) - 0.5) * 0.02;
    const [bx, by] = bez(u);
    const out = (u - 0.55) * 1.4 + (hash(i * 3.9) - 0.5) * 0.25;
    const down = lerp(0.9, -0.1, clamp(st.open));
    const L = (70 + Math.sin(u * Math.PI) * 55) * (0.75 + hash(i * 1.7) * 0.45);
    const tx = bx + Math.sin(out) * L - 18, ty = by - Math.cos(out) * L * (1 - down) + down * L * 0.6;
    lashTips.push([tx, ty]);
    const cx1 = bx + (tx - bx) * 0.3 - 10, cy1 = by + (ty - by) * 0.7;
    const mx = 0.25 * bx + 0.5 * cx1 + 0.25 * tx, my = 0.25 * by + 0.5 * cy1 + 0.25 * ty;
    ctx.lineWidth = 6 - i * 0.06;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo((bx + cx1) / 2, (by + cy1) / 2, mx, my); ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo((cx1 + tx) / 2, (cy1 + ty) / 2, tx, ty); ctx.stroke();
  }
  // иней на ресницах
  if (st.frostLash > 0.01) {
    ctx.fillStyle = css(hex('#e9f1fb'), st.frostLash);
    ctx.beginPath();
    for (let i = 2; i < lashTips.length; i += 3) circ(ctx, lashTips[i][0], lashTips[i][1], 5 + hash(i) * 5);
    ctx.fill();
  }
  // нижнее веко
  ctx.beginPath(); ctx.moveTo(Co[0], Co[1]); ctx.quadraticCurveTo(lowCtl[0], lowCtl[1], Ci[0], Ci[1]);
  ctx.lineWidth = 9; ctx.strokeStyle = css(furDark, 0.9); ctx.stroke();
  // снежинка и капля
  const fk = st.flake;
  if (fk && fk.a > 0.01) {
    let fx = fk.x, fy = fk.y;
    if (fk.onLash) { const tip = lashTips[fk.onLash]; fx = tip[0]; fy = tip[1]; }
    const melt = clamp(st.drop || 0);
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(fk.rot);
    ctx.strokeStyle = css(hex('#f1f6ff'), fk.a * (1 - melt)); ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    const R = 34 * (fk.size || 1) * (1 - melt * 0.6);
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a);
      ctx.moveTo(0, 0); ctx.lineTo(ca * R, sa * R);
      for (const u of [0.45, 0.7]) {
        const bx = ca * R * u, by = sa * R * u, l = R * 0.28 * (1.1 - u);
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + 0.8) * l, by + Math.sin(a + 0.8) * l);
        ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - 0.8) * l, by + Math.sin(a - 0.8) * l);
      }
    }
    ctx.stroke();
    if (melt > 0.01) {
      const r = 16 * melt;
      ctx.rotate(-fk.rot);
      ctx.fillStyle = radial(ctx, -r * 0.2, -r * 0.3, 1, r * 1.3, [[0, css(light(sky, 0.6), 0.95 * melt)], [0.7, css(sky, 0.6 * melt)], [1, css(dark(sky, 0.3), 0.8 * melt)]]);
      ctx.beginPath(); ell(ctx, 0, r * 0.4, r, r * 1.2, 0); ctx.fill();
      ctx.fillStyle = css(WHITE, melt); ctx.beginPath(); circ(ctx, -r * 0.35, 0, r * 0.25); ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}
