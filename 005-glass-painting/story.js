'use strict';
/* ==========================================================================
   story.js — сценарий «Сна зимнего леса».
   Семь планов, между ними — «перетекания» пальцем по стеклу. У каждого плана
   своя камера, палитра, сезон и игра героев. Кадр — чистая функция от t.

   Зима (0–21): олень бредёт через метель, снегирь слетает к нему, олень ложится.
   Глаз (21–26): снежинка садится на ресницы, глаз закрывается — лес засыпает.
   Весна (26–48): снег тает в ручей, подснежники, на рогах распускаются цветы.
   Лето (48–71): олень летит прыжками по лугу, ласточки, закат, светлячки.
   Осень (71–89): листья на рогах золотеют и облетают, журавли улетают, иней.
   Глаз (89–93): иней тает, глаз открывается на рассвете.
   Утро (93–114): олень встаёт, снегирь поёт, с сосульки падает капля — и
   из-под снега проклёвывается подснежник. Олень уходит к солнцу.
   ========================================================================== */

const Story = (() => {
  /* ---------- ветер на весь фильм ---------- */
  buildWind(track([
    [0, 0.25], [11, 0.3], [12.6, 0.95], [18.5, 0.8], [20.5, 0.35], [24, 0.08], [27, 0.2], [44, 0.3], [45.8, 0.85],
    [48.5, 0.45], [50.5, 0.25], [66, 0.2], [72, 0.35], [80, 0.45], [84.5, 1.0], [88, 0.85], [90, 0.1], [104, 0.15], [114, 0.1],
  ]));

  /* ---------- вспомогательное ---------- */
  function travel(u, a) {                 // трапеция скорости: разгон a, торможение a
    u = clamp(u); const v = 1 / (1 - a);
    if (u < a) return 0.5 * v * u * u / a;
    if (u > 1 - a) return 1 - 0.5 * v * (1 - u) * (1 - u) / a;
    return 0.5 * v * a + v * (u - a);
  }
  function mixPose(a, b, k) {
    const o = {};
    for (const key in a) {
      if (key === 'legs') o.legs = a.legs.map((l, i) => [lerp(l[0], b.legs[i][0], k), lerp(l[1], b.legs[i][1], k)]);
      else o[key] = lerp(a[key], b[key], k);
    }
    return o;
  }
  // Ноги поджаты: запястья передних ног выходят вперёд у груди, скакательные суставы — назад за круп.
  // Копыта подобраны так, чтобы оба сустава оставались на уровне снега, а не уходили под землю.
  const LIE_LEGS = [[0.43, 0.05], [0.37, 0.05], [-0.465, 0.05], [-0.4, 0.05]];
  function lyingPose(neck, head) {
    const P = deerStand();
    P.bodyY = 0.46; P.legs = LIE_LEGS.map((l) => l.slice()); P.neck = neck; P.head = head;
    return P;
  }
  const blinkAt = (t, list) => { let b = 0; for (const s of list) b = Math.max(b, win(t, s, s + 0.08, s + 0.14, s + 0.24)); return b; };
  function earTwitch(t, list) { let e = 0; for (const s of list) e += Math.sin(clamp((t - s) / 0.35) * Math.PI) * 0.35; return e; }
  // Точка ветки рябины (с учётом качания, как при отрисовке дерева)
  function rowanPoint(t, bi, k, dy = 0) {
    const tr = ROWAN, q = tr.branches[bi].pts[k];
    const sway = gust(t, tr.seed) * 0.05;
    return { x: tr.x + q[0] + sway * q[1] * q[1] / tr.h, y: q[1] + dy, z: tr.z };
  }
  const bez = (a, c, b, u) => (1 - u) * (1 - u) * a + 2 * u * (1 - u) * c + u * u * b;
  // halo — цвет мягкого ореола: тёмный под светлыми буквами, светлый под тёмными
  function drawTitle(ctx, text, x, y, size, alpha, col, halo = [20, 24, 40]) {
    if (alpha < 0.01) return;
    scr(ctx);
    ctx.save();
    ctx.font = `400 ${size}px Kurale, "Palatino Linotype", Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = css(halo, 0.55 * alpha); ctx.shadowBlur = 26; ctx.shadowOffsetY = 4;
    ctx.fillStyle = css(col, alpha);
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function seasonOf(o) { return Object.assign({ snow: 0, leaf: 0, hue: 0, blossom: 0, berries: 0 }, o); }

  /* ---------- общий рисовальщик леса ---------- */
  function bandColors(b) {
    const E = ENV;
    const green = b.kind === 'mixed' ? mixc(E.spruce, leafColor(Math.min(E.hue * 1.2, 3), 1), 0.55 * E.leaf) : E.spruce;
    const top = mixc(green, light(E.groundNear, 0.05), E.snow * 0.5);
    return { top: lit(top, 0.35), bot: mixc(green, E.shadow, 0.3) };
  }
  function drawWorld(ctx, t, trees, actors, groundFx) {
    drawSky(ctx, t);
    drawBands(ctx, bandColors);
    drawGroundBase(ctx);
    drawGroundStrokes(ctx, t);
    if (groundFx) groundFx(ctx);
    const items = [];
    for (const tr of trees) if (tr.z - CAM.z > 0.8) items.push({ z: tr.z, tree: tr });
    for (const a of actors) items.push(a);
    items.sort((a, b) => b.z - a.z);
    for (const it of items) { if (it.tree) drawTree(ctx, it.tree, t); else it.draw(ctx); }
  }

  /* ======================= 1. ЗИМА ======================= */
  const W_START = { x: -7.6, z: 12.8 }, W_END = { x: 0.9, z: 11.2 };
  const W_DIST = Math.hypot(W_END.x - W_START.x, W_END.z - W_START.z), STRIDE = 1.36;
  function deerWinter(t) {
    const u = (t - 2.2) / 9.2;
    const dist = W_DIST * travel(u, 0.12);
    const k = dist / W_DIST;
    const x = lerp(W_START.x, W_END.x, k), z = lerp(W_START.z, W_END.z, k);
    const phase = dist / STRIDE;
    let P = deerStand();
    const walking = t > 2.0 && t < 11.6;
    if (walking) {
      P.legs = walkLegs(phase, STRIDE, 0.2);
      P.bodyY = 1.0 + 0.018 * Math.cos(phase * TAU * 2);
      P.neck = 0.96 + 0.035 * Math.sin(phase * TAU * 2 + 1);
      P.head = -0.55 + 0.03 * Math.sin(phase * TAU * 2);
    } else if (t >= 11.6) {
      const stop = walkLegs(W_DIST / STRIDE, STRIDE, 0.2);
      const k2 = ramp(t, 11.6, 12.3);
      P.legs = stop.map((l, i) => [lerp(l[0], P.legs[i][0], k2), lerp(l[1], 0, k2)]);
    }
    // смотрит вверх на снегиря, вздрагивает от снега, пригибается от ветра
    P.neck += 0.24 * win(t, 11.9, 12.8, 13.3, 14.2) - 0.14 * ramp(t, 13.4, 14.4);
    P.head += 0.42 * win(t, 11.9, 12.8, 13.2, 14.0) - 0.18 * ramp(t, 13.4, 14.4);
    P.ear = -0.25 * ramp(t, 12.9, 13.3) + earTwitch(t, [6.3, 9.8, 12.7]);
    P.head += Math.sin(clamp((t - 12.8) / 0.5) * Math.PI * 3) * 0.06 * (t > 12.8 && t < 13.3 ? 1 : 0);
    // ложится: сначала передом, потом задом
    if (t > 14.7) {
      const antic = win(t, 14.7, 15.0, 15.1, 15.4);
      P.tilt += 0.05 * antic;
      const front = ramp(t, 15.2, 16.2, Ease.inOut), hind = ramp(t, 15.9, 16.9, Ease.inOut), settle = ramp(t, 16.8, 17.4, Ease.back);
      const L = lyingPose(0.9, -0.45);
      const midY = lerp(1.0, 0.74, front);
      P.bodyY = lerp(midY, L.bodyY, hind * 0.94 + settle * 0.06);
      P.tilt += -0.34 * front * (1 - hind) + 0.0;
      P.legs = P.legs.map((l, i) => {
        const k3 = i < 2 ? front : hind;
        return [lerp(l[0], LIE_LEGS[i][0], k3), lerp(l[1], LIE_LEGS[i][1], k3)];
      });
      P.neck = lerp(P.neck, 0.9, front);
      P.head = lerp(P.head, -0.42, front);
      // засыпает
      P.neck -= 0.14 * ramp(t, 18.2, 20.6);
      P.head -= 0.3 * ramp(t, 18.4, 20.8);
    }
    P.blink = blinkAt(t, [4.6, 8.3, 12.4, 17.9]) + 0.5 * ramp(t, 19.4, 20.8);
    return {
      x, z, facing: 1, pose: P, coat: 0, breath: 1, rim: 0.25,
      snowBack: 0.7 * ramp(t, 16.5, 20.8), mound: ramp(t, 15.3, 17.2),
    };
  }
  function birdWinter(t) {
    const perch = rowanPoint(t, 0, 3, 0.02);
    const ground = { x: 2.2, y: 0.02, z: 10.8 };
    const nest = { x: 2.05, y: 0.18, z: 10.95 };
    const B = { x: perch.x, y: perch.y, z: perch.z, facing: -1, tilt: 0, squash: 1, fly: 0, flap: 0, sing: 0, fluff: 0.2, look: 0 };
    const hop = (s) => { const k = clamp((t - s) / 0.32); return Math.sin(k * Math.PI); };
    const h = hop(6.8) + hop(9.1);
    B.y += h * 0.07; B.squash = 1 + h * 0.12 - 0.12 * win(t, 6.65, 6.8, 6.8, 6.95) - 0.12 * win(t, 8.95, 9.1, 9.1, 9.25);
    B.look = 0.25 * win(t, 9.8, 10.2, 12.0, 12.2);
    B.squash -= 0.2 * win(t, 12.15, 12.4, 12.4, 12.5);
    if (t > 12.45) {
      const u = clamp((t - 12.45) / 1.25);
      const ue = Ease.sine(u);
      B.x = bez(perch.x, perch.x + 0.9, ground.x, ue);
      B.y = bez(perch.y, perch.y + 0.7, ground.y, ue);
      B.z = lerp(perch.z, ground.z, ue);
      B.fly = u < 1 ? 1 : 0; B.flap = t * 42; B.tilt = u < 1 ? -0.25 : 0;
      B.facing = u < 0.35 ? 1 : -1;
      if (u >= 1) {
        B.squash = 1 - 0.25 * win(t, 13.7, 13.78, 13.8, 14.05);
        const h2 = hop(15.3) + hop(16.4);
        const k = ramp(t, 15.3, 16.8);
        B.x = lerp(ground.x, nest.x, k); B.y = lerp(ground.y, nest.y, k) + h2 * 0.06; B.z = lerp(ground.z, nest.z, k);
        B.fluff = 0.2 + 0.8 * ramp(t, 17.4, 18.6);
        B.facing = -1;
      }
    }
    return B;
  }
  function trackDots(ctx, t) {
    // следы оленя на снегу
    const u = (t - 2.2) / 9.2, dist = W_DIST * travel(u, 0.12);
    ctx.fillStyle = css(ENV.snowSh, 0.55);
    ctx.beginPath();
    for (let s = 0.2; s < dist - 0.9; s += 0.46) {
      const k = s / W_DIST, i = Math.round(s / 0.46);
      const x = lerp(W_START.x, W_END.x, k) - 0.25, z = lerp(W_START.z, W_END.z, k) + (i % 2 ? 0.14 : -0.14);
      const p = proj(x, 0, z); if (p.d < 1) continue;
      scr(ctx); ell(ctx, p.x, p.y, 0.09 * p.s, 0.03 * p.s, 0);
    }
    ctx.fill();
  }
  const winterPal = palTrack([[0, 'winterDusk'], [11.5, 'winterDusk'], [14, 'winterStorm'], [18.5, 'winterStorm'], [21.5, 'winterNight']]);
  const winterCam = track([
    [0, [-2.6, 1.7, -3.6, 900, 590]], [6, [-1.6, 1.66, -2.0, 900, 575]], [11.5, [0.1, 1.55, 1.8, 900, 540]],
    [14.2, [0.8, 1.35, 4.3, 900, 505]], [17.6, [1.25, 1.1, 6.4, 900, 495]], [21.6, [1.55, 1.02, 7.9, 960, 500]],
  ]);
  const snowAmt = track([[0, 0.45], [11.5, 0.5], [13, 1.0], [18.5, 0.9], [21, 0.55]]);
  const snowStreak = track([[0, 0], [12, 0], [13.2, 0.85], [18, 0.7], [20.5, 0.15]]);
  function drawWinter(ctx, t) {
    setCam(winterCam(t));
    ENV = Object.assign({}, winterPal(t), seasonOf({ snow: 1, berries: 1 }));
    const D = deerWinter(t), B = birdWinter(t);
    const actors = [
      { z: D.z, draw: (c) => drawDeer(c, D, t) },
      { z: B.z - 0.35, draw: (c) => drawSongbird(c, B, BULLFINCH, t) },
    ];
    // ком снега с ветки, когда снегирь взлетает
    if (t > 12.4 && t < 14.2) {
      const perch = rowanPoint(12.45, 0, 3, 0.05);
      actors.push({ z: perch.z - 0.1, draw: (c) => {
        const dt = t - 12.45;
        scr(c);
        c.fillStyle = css(light(ENV.groundNear, 0.1), 0.9 * (1 - clamp((dt - 1.1) / 0.6)));
        c.beginPath();
        for (let i = 0; i < 22; i++) {
          const vx = (hash(i * 3.3) - 0.5) * 0.8, vy = hash(i * 1.7) * 0.6;
          const y = perch.y + vy * dt - 4.9 * dt * dt * (0.8 + hash(i) * 0.3);
          if (y < 0) continue;
          const p = proj(perch.x + vx * dt - 0.3 * hash(i * 9.1), y, perch.z + (hash(i * 5.5) - 0.5) * 0.4);
          circ(c, p.x, p.y, Math.max(1.2, (0.02 + hash(i * 7) * 0.03) * p.s));
        }
        c.fill();
      } });
    }
    drawWorld(ctx, t, FOREST, actors, (c) => trackDots(c, t));
    drawSnowfall(ctx, t, snowAmt(t), { streak: snowStreak(t), n: 800 });
    drawForeBoughs(ctx, t, 1 - ramp(t, 13.5, 16.5), null, 1);
    drawTitle(ctx, 'Сон зимнего леса', 800, 150, 118, win(t, 0.5, 2.3, 5.2, 7.0), hex('#f4ecdc'));
  }

  /* ======================= 2 и 6. ГЛАЗ ======================= */
  const eyeCam = [0, 1.6, 0, 900, 470];
  const sleepOpen = track([[20.8, 1], [23.0, 1], [23.6, 0.42, 'quadOut'], [24.0, 0.62], [24.9, 0.0]]);
  function drawEyeSleep(ctx, t) {
    setCam(eyeCam);
    ENV = Object.assign({}, PAL.winterNight, seasonOf({ snow: 1 }));
    const u = clamp((t - 20.9) / 1.7);
    const flake = { x: lerp(700, 817, u) + Math.sin(u * 5) * 50 * (1 - u), y: lerp(-60, 207, Ease.quadOut(u)), rot: t * 0.6, a: 1, onLash: t > 22.6 ? 15 : 0, size: 1 };
    drawEyeCloseup(ctx, { open: sleepOpen(t), dawn: 0, flake, drop: 0, zoom: 1.34 + 0.1 * ramp(t, 20.8, 25.8), frostLash: 0.5 });
    drawSnowfall(ctx, t, 0.5, { n: 260, freezeAt: 24.3, size: 1.4, alpha: 0.8 });
  }
  const wakeOpen = track([[89, 0], [89.9, 0], [90.35, 0.36, 'quadOut'], [90.75, 0.3], [91.5, 1.0, 'quadOut']]);
  function drawEyeWake(ctx, t) {
    setCam(eyeCam);
    ENV = Object.assign({}, PAL.winterDawn, seasonOf({ snow: 1 }));
    const flake = { x: 0, y: 0, rot: 0.4, a: 1, onLash: 15, size: 1 };
    drawEyeCloseup(ctx, { open: wakeOpen(t), dawn: 1, flake, drop: ramp(t, 89.6, 91.4), zoom: 1.48 - 0.12 * ramp(t, 89, 92.6), frostLash: 0.6 * (1 - ramp(t, 89.5, 91.5)) });
    drawSnowfall(ctx, t, 0.15, { n: 200, size: 1.3, alpha: 0.7, fall: 0.4 });
  }

  /* ======================= 3. ВЕСНА ======================= */
  const S_DEER = { x: -1.2, z: 12.5 };
  function deerSpring(t) {
    const P = deerStand();
    // пасётся, потом поднимает голову к весне
    const graze = 1 - ramp(t, 30.8, 32.0);
    P.neck = lerp(1.02, 0.62, graze); P.head = lerp(-0.5, -1.15, graze);
    P.legs[0][0] = 0.56; P.legs[2][0] = -0.6;
    P.bodyY = 1.0 + 0.01 * Math.sin(t * 1.6);
    // смотрит на птицу
    const look = win(t, 39.4, 40.4, 44.2, 45.2);
    P.neck += 0.2 * look; P.head += 0.28 * look;
    P.head += 0.02 * Math.sin(t * 1.3);
    P.ear = earTwitch(t, [28.4, 33.2, 36.9, 40.6, 42.4, 45.5]);
    P.tail = 0.3 * Math.sin(t * 5) * win(t, 34, 34.3, 35, 35.3);
    P.blink = blinkAt(t, [29.2, 34.1, 38.0, 43.1, 46.3]);
    return {
      x: S_DEER.x, z: S_DEER.z, facing: 1, pose: P, coat: 0.45, breath: 0, rim: 0.35,
      bud: ramp(t, 31.4, 33.0), leaf: ramp(t, 32.8, 36.0), bloom: ramp(t, 35.0, 38.0), ahue: 0,
    };
  }
  function birdSpring(t, D) {
    const tip = antlerTip(D, 3);
    const B = { x: tip.x, y: tip.y - 0.005, z: tip.z - 0.02, facing: -1, tilt: 0, squash: 1, fly: 0, flap: 0, sing: 0, fluff: 0, look: 0 };
    if (t < 38.3) {
      const u = clamp((t - 36.6) / 1.7), ue = Ease.quadOut(u);
      B.x = bez(tip.x + 6.5, tip.x + 1.2, tip.x, ue); B.y = bez(tip.y + 2.6, tip.y + 1.4, tip.y, ue); B.z = lerp(tip.z - 3, tip.z - 0.02, ue);
      B.fly = 1; B.flap = t * 40; B.tilt = 0.2 * (1 - u);
      if (u <= 0) B.y = -100;
    } else {
      B.squash = 1 - 0.25 * win(t, 38.3, 38.38, 38.4, 38.65);
      const sing = (s) => win(t, s, s + 0.08, s + 0.6, s + 0.72) * (0.6 + 0.4 * Math.abs(Math.sin((t - s) * 28)));
      B.sing = sing(39.6) + sing(40.9) + sing(42.3);
      B.look = 0.25 * B.sing - 0.1;
      B.tilt = 0.08 * Math.sin(t * 3);
      if (t > 44.6) {
        const u = clamp((t - 44.6) / 1.6);
        B.x = tip.x - u * 3.5; B.y = tip.y + u * u * 3 + u * 0.8; B.fly = 1; B.flap = t * 40; B.facing = -1;
      }
    }
    return B;
  }
  const SNOWDROPS = [
    [-0.4, 9.2], [0.2, 8.6], [1.9, 9.0], [2.6, 8.4], [-1.0, 10.3], [3.4, 9.8], [1.2, 8.1], [-0.6, 7.6], [0.7, 7.2],
    [2.2, 7.4], [3.0, 11.8], [-1.7, 8.8], [1.6, 12.4], [-0.2, 12.9], [0.4, 9.9], [2.9, 10.4],
  ].map((a, i) => ({ x: a[0] - 1.8, z: a[1] + 1.4, at: 29.6 + hash(i * 3.1) * 2.6, seed: i }));
  function brookX(z) { return -4.7 + 0.18 * (z - 5) + 1.2 * Math.sin(z * 0.21); }
  function drawBrook(ctx, t, alpha) {
    if (alpha < 0.01) return;
    scr(ctx);
    const E = ENV, L = [], R = [];
    for (let z = 60; z >= CAM.z + 1.3; z -= 0.8) {
      const w = 0.45 + 0.012 * z, x = brookX(z);
      const a = proj(x - w, 0, z), b = proj(x + w, 0, z);
      L.push([a.x, a.y]); R.push([b.x, b.y]);
    }
    if (L.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(L[0][0], L[0][1]);
    for (const p of L) ctx.lineTo(p[0], p[1]);
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, CAM.hy, 0, VH, [[0, css(mixc(E.hor, E.mid, 0.3), alpha)], [1, css(mixc(E.mid, E.top, 0.45), alpha)]]);
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = css(dark(E.groundNear, 0.35), 0.6 * alpha); ctx.stroke();
    // блики течения
    ctx.fillStyle = css(WHITE, 0.8 * alpha);
    ctx.beginPath();
    for (let i = 0; i < 70; i++) {
      const z = CAM.z + 1.5 + ((hash(i * 2.2) * 50 - t * 0.9 * (0.7 + hash(i))) % 50 + 50) % 50;
      const w = 0.45 + 0.012 * z;
      const p = proj(brookX(z) + (hash(i * 4.4) - 0.5) * w * 1.4, 0, z);
      if (p.d < 1.2) continue;
      ell(ctx, p.x, p.y, Math.max(1, 0.14 * p.s), Math.max(0.6, 0.02 * p.s), 0);
    }
    ctx.fill();
  }
  function drawMeltPatches(ctx, snow) {
    if (snow < 0.01) return;
    scr(ctx);
    ctx.fillStyle = css(light(PAL.winterDusk.groundNear, 0.15), clamp(snow * 2));
    ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const x = (hash(i * 7.7) - 0.5) * 30, z = 5 + hash(i * 3.9) * 40;
      const p = proj(x, 0, z); if (p.d < 1) continue;
      const r = (0.6 + hash(i * 1.1) * 1.8) * snow * p.s;
      ell(ctx, p.x, p.y, r, r * 0.22, 0);
    }
    ctx.fill();
  }
  function drawGrassTufts(ctx, t, amount, colA, colB) {
    if (amount < 0.01) return;
    scr(ctx);
    ctx.lineCap = 'round';
    for (let g = 0; g < 2; g++) {
      ctx.strokeStyle = css(g ? colB : colA);
      ctx.beginPath();
      for (let i = g; i < 260; i += 2) {
        const x = (hash(i * 1.3) - 0.5) * 26 + CAM.x * 0, z = 3 + hash(i * 2.9) * 30;
        const p = proj(x, 0, z); if (p.d < 1 || p.x < -20 || p.x > VW + 20) continue;
        const h = (0.1 + hash(i * 5.1) * 0.18) * amount * p.s;
        const bend = (Math.sin(t * 1.8 + i) * 0.1 + gust(t, i) * 0.25) * h;
        for (let k = -1; k <= 1; k++) {
          ctx.moveTo(p.x + k * 0.03 * p.s, p.y);
          ctx.quadraticCurveTo(p.x + k * 0.05 * p.s, p.y - h * 0.6, p.x + k * 0.08 * p.s + bend, p.y - h * (1 - Math.abs(k) * 0.25));
        }
      }
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  const springPal = palTrack([[25.8, 'springMorning'], [47.8, 'springMorning']]);
  const springCam = track([
    [24.6, [-0.3, 1.5, 3.4, 900, 474]], [31, [-0.6, 1.45, 4.4, 900, 474]], [36, [-0.2, 1.6, 6.0, 900, 470]],
    [38.9, [0.3, 2.3, 9.3, 900, 470]], [44.2, [0.4, 2.35, 9.5, 900, 470]], [47.8, [0.5, 5.0, 9.8, 900, 760]], [49.2, [0.5, 5.8, 9.9, 900, 820]],
  ]);
  const springSnow = track([[24.6, 0.9], [27.4, 0.75], [30.5, 0.15], [32.5, 0]]);
  const springLeaf = track([[24.6, 0], [29, 0.1], [34, 0.45], [47.8, 0.62]]);
  function drawSpring(ctx, t) {
    setCam(springCam(t));
    const snow = springSnow(t);
    ENV = Object.assign({}, springPal(t), seasonOf({ snow: snow * 0.6, leaf: springLeaf(t), hue: 0, blossom: ramp(t, 33, 37) * 0.9 }));
    ENV.groundNear = mixc(ENV.groundNear, hex('#8a7a5a'), snow * 0.6);
    const D = deerSpring(t), B = birdSpring(t, D);
    const actors = [
      { z: D.z, draw: (c) => drawDeer(c, D, t) },
      { z: B.z - 0.05, draw: (c) => drawSongbird(c, B, ROBIN, t) },
    ];
    for (const s of SNOWDROPS) {
      const g = ramp(t, s.at, s.at + 0.9, Ease.back);
      actors.push({ z: s.z, draw: (c) => drawSnowdrop(c, s.x, s.z, g * 1.25, ramp(t, s.at + 0.6, s.at + 2), t, s.seed) });
    }
    drawWorld(ctx, t, FOREST, actors, (c) => {
      drawBrook(c, t, ramp(t, 26.5, 30));
      drawMeltPatches(c, snow);
      const gcol = lit(hex('#7fb24a'), 0.3);
      drawGrassTufts(c, t, ramp(t, 27.5, 33), gcol, mixc(gcol, hex('#3f6a2a'), 0.5));
    });
    // стая возвращается
    if (t > 34 && t < 39.5) {
      for (let i = 0; i < 13; i++) {
        const u = (t - 34 - hash(i * 3) * 0.8) / 4.6;
        if (u < 0 || u > 1) continue;
        const sx = lerp(VW + 80, -120, u) + Math.sin(i * 1.7) * 90, sy = 150 + Math.sin(u * 5 + i) * 30 + hash(i * 7) * 130 - (CAM.hy - 470) * 0.3;
        drawFlockBird(ctx, sx, sy, 9 + hash(i * 5) * 6, t * 16 + i, mixc(hex('#3a3440'), ENV.fog, 0.3));
      }
    }
    // снежинки превращаются в лепестки
    const toPetal = ramp(t, 26.2, 29.5);
    const petalAmt = track([[24.6, 0.9], [29, 0.55], [44, 0.45], [45.8, 1.3], [49, 1.3]])(t);
    const pc = [hex('#fff4f4'), hex('#f7cfd8'), hex('#fbe3e6'), hex('#f0b6c4')];
    drawFlutter(ctx, t, petalAmt, {
      n: 190, size: 0.03, fall: lerp(0.15, 0.7, toPetal),
      colorAt: (i) => mixc(hex('#eef4ff'), pc[i % 4], toPetal), round: toPetal < 0.5,
      swirl: t > 44.5 ? (tt, i, x, y, z) => {
        const k = ramp(tt, 44.5, 47.5);
        const a = k * (2 + hash(i) * 3);
        return [x * Math.cos(a) - (y - 2) * Math.sin(a) * 0.6, y + k * 3 * hash(i * 2), z];
      } : null,
    });
    drawLightRays(ctx, 0.55, t);
  }

  /* ======================= 4. ЛЕТО ======================= */
  const G_X0 = 15.5, G_X1 = -3.6;
  function deerSummer(t) {
    // прыжками справа налево, потом шаг и остановка на пригорке
    const runU = (t - 50.2) / 9.8;
    const dist = (G_X0 - G_X1) * travel(runU, 0.1);
    const x = G_X0 - dist;
    const speed = runU > 0 && runU < 1 ? 1 : 0;
    let P = gallopPose(dist / 3.3);
    const toStand = ramp(t, 58.6, 60.4);
    const stand = deerStand();
    stand.neck = 1.12; stand.head = -0.38; stand.ear = 0.1;
    P = mixPose(P, stand, toStand);
    if (t < 50.2) P = mixPose(gallopPose(0), stand, 0.0);
    P.blink = blinkAt(t, [61.5, 64.8, 68.2]);
    P.head += 0.06 * Math.sin(t * 0.9) * toStand;
    P.ear += earTwitch(t, [62.2, 66.1, 69.3]);
    return { x, z: 13, facing: -1, pose: P, coat: 1, breath: 0, rim: 0.3 + 0.6 * ramp(t, 62, 67), leaf: 1, ahue: 1, bloom: 0, speed };
  }
  function drawMeadow(ctx, t) {
    scr(ctx);
    const E = ENV;
    ctx.lineCap = 'round';
    const rows = [40, 34, 29, 25, 22, 19.5, 17.5, 15.8, 14.4, 13.2, 12.2, 11.3, 10.5, 9.8, 9.2, 8.7];
    for (let ri = 0; ri < rows.length; ri++) {
      const z = rows[ri], d = z - CAM.z; if (d < 2.4) continue;
      const s = CAM.f / d, gy = groundY(z);
      const sp = 0.06 + d * 0.035;
      const x0 = CAM.x - (VW / 2 + 40) / s, x1 = CAM.x + (VW / 2 + 40) / s;
      const i0 = Math.floor(x0 / sp), i1 = Math.ceil(x1 / sp);
      const kf = fogK(d);
      const cA = mixc(mixc(hex('#8a9c3c'), E.light, 0.25), E.fog, kf), cB = mixc(mixc(hex('#5f7a2a'), E.shadow, 0.2), E.fog, kf);
      for (let g = 0; g < 2; g++) {
        ctx.strokeStyle = css(g ? cB : lit(cA, 0.4));
        ctx.lineWidth = Math.max(1, 0.012 * s);
        ctx.beginPath();
        for (let i = i0; i <= i1; i++) {
          if ((i & 1) !== g) continue;
          const hx = hash2(i, ri), wx = i * sp + (hx - 0.5) * sp;
          const sx = VW / 2 + (wx - CAM.x) * s;
          const hgt = (0.35 + hash2(i, ri + 50) * 0.5) * s;
          const bend = (Math.sin(t * 1.6 + wx * 1.3) * 0.08 + gust(t, wx * 0.1) * 0.2) * hgt;
          ctx.moveTo(sx, gy + 2);
          ctx.quadraticCurveTo(sx + bend * 0.2, gy - hgt * 0.6, sx + bend, gy - hgt);
        }
        ctx.stroke();
      }
      // ромашки и васильки
      if (d < 26) {
        ctx.fillStyle = css(mixc(hex('#fbf7ee'), E.fog, kf * 0.8));
        ctx.beginPath();
        const flowers = [];
        for (let i = i0; i <= i1; i++) {
          if (hash2(i, ri + 99) > 0.2) continue;
          const wx = i * sp + (hash2(i, ri) - 0.5) * sp;
          const sx = VW / 2 + (wx - CAM.x) * s;
          const hgt = (0.35 + hash2(i, ri + 50) * 0.5) * s;
          const bend = (Math.sin(t * 1.6 + wx * 1.3) * 0.08 + gust(t, wx * 0.1) * 0.2) * hgt;
          const fx = sx + bend, fy = gy - hgt, r = Math.max(1.5, 0.035 * s);
          flowers.push([fx, fy, r, hash2(i, ri + 7) < 0.25]);
          if (hash2(i, ri + 7) >= 0.25) ell(ctx, fx, fy, r * 1.3, r * 0.7, 0);
        }
        ctx.fill();
        ctx.fillStyle = css(mixc(hex('#4a6fd0'), E.fog, kf * 0.8));
        ctx.beginPath(); for (const f of flowers) if (f[3]) circ(ctx, f[0], f[1], f[2] * 0.9); ctx.fill();
        ctx.fillStyle = css(mixc(hex('#f2c230'), E.fog, kf * 0.8));
        ctx.beginPath(); for (const f of flowers) if (!f[3]) circ(ctx, f[0], f[1] - f[2] * 0.1, f[2] * 0.42); ctx.fill();
      }
    }
  }
  function drawForeGrass(ctx, t, col) {
    scr(ctx);
    ctx.lineCap = 'round';
    ctx.strokeStyle = css(col);
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 24; i++) {
      const wx = i * 0.21 + hash(i) * 0.15 - 2.4;
      const z = CAM.z + 0.9 + hash(i * 3.3) * 0.5;
      const p = proj(CAM.x + ((wx - CAM.x * 0.0) % 5 + 5) % 5 - 2.5, 0, z);
      const h = (0.5 + hash(i * 7.7) * 0.5) * p.s;
      const bend = (Math.sin(t * 1.4 + i) * 0.06 + gust(t, i) * 0.12) * h;
      ctx.lineWidth = 7 + hash(i * 2) * 7;
      const lean = (hash(i * 5.5) - 0.5) * h * 0.5;
      ctx.beginPath(); ctx.moveTo(p.x, VH + 20); ctx.quadraticCurveTo(p.x + bend * 0.3 + lean * 0.3, p.y - h * 0.5, p.x + bend + lean, p.y - h); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  const summerPal = palTrack([[47.8, 'summerDay'], [60, 'summerDay'], [66.5, 'summerSunset'], [72, 'summerSunset']]);
  const summerCam = track([
    [46.6, [10.5, 1.0, 5.4, 900, 560]], [50.4, [10.0, 1.0, 5.8, 900, 560]], [53.5, [6.3, 1.0, 5.9, 900, 555]], [56.5, [1.2, 1.0, 6.1, 900, 550]],
    [59.5, [-2.3, 1.0, 6.3, 900, 545]], [62, [-2.9, 1.02, 6.6, 900, 540]], [72, [-3.3, 1.08, 8.0, 900, 540]],
  ]);
  function drawSummer(ctx, t) {
    setCam(summerCam(t));
    ENV = Object.assign({}, summerPal(t), seasonOf({ leaf: 1, hue: 1 + 0.35 * ramp(t, 66, 72) }));
    const D = deerSummer(t);
    const actors = [{ z: D.z, draw: (c) => drawDeer(c, D, t) }];
    // ласточки вьются вокруг бегущего оленя
    for (let i = 0; i < 6; i++) {
      const ph = t * (1.6 + hash(i) * 0.7) + i * 1.9;
      const on = win(t, 49 + i * 0.3, 50 + i * 0.3, 61 + i * 0.4, 63 + i * 0.4);
      if (on < 0.01) continue;
      const x = D.x + Math.cos(ph) * (2.2 + hash(i * 3) * 1.5) - 0.8, y = 1.3 + Math.sin(ph * 1.7) * 0.6 + (1 - on) * 6, z = D.z + Math.sin(ph) * 2.8;
      const facing = -Math.sin(ph) > 0 ? 1 : -1;
      actors.push({ z, draw: (c) => drawSwallow(c, x, y, z, facing, t * 22 + i, 0.2 * Math.cos(ph)) });
    }
    drawWorld(ctx, t, MEADOW, actors, (c) => drawMeadow(c, t));
    drawSnowfall(ctx, t, 0.35 * (1 - ramp(t, 63, 67)), { n: 160, color: hex('#fff3c8'), fall: -0.05, size: 0.5, alpha: 0.7 });
    drawFireflies(ctx, t, ramp(t, 64.5, 68.5));
    drawForeGrass(ctx, t, mixc(hex('#3a4a1c'), ENV.shadow, 0.3));
    drawLightRays(ctx, 0.5 + 0.4 * ramp(t, 62, 68), t);
  }

  /* ======================= 5. ОСЕНЬ ======================= */
  const A_DEER = { x: 0.4, z: 11.6 };
  function deerAutumn(t) {
    const P = deerStand();
    const look = win(t, 75.6, 76.8, 82.6, 84.0);
    P.neck = 1.02 + 0.3 * look - 0.18 * ramp(t, 84.6, 86.2);
    P.head = -0.5 + 0.55 * look - 0.3 * ramp(t, 84.6, 86.2);
    P.ear = 0.25 * look + earTwitch(t, [72.4, 74.3, 79.4, 81.2]) - 0.3 * ramp(t, 84.5, 85.5);
    P.bodyY = 1.0 + 0.008 * Math.sin(t * 1.5);
    P.legs[0][0] = 0.54; P.legs[3][0] = -0.46;
    P.blink = blinkAt(t, [73.1, 78.2, 82.9, 86.8]);
    return {
      x: A_DEER.x, z: A_DEER.z, facing: -1, pose: P, coat: 0.6, breath: ramp(t, 85, 88), rim: 0.3,
      leaf: 1, bloom: 0, ahue: track([[70.8, 1.3], [74, 2.0], [79, 2.6], [83, 2.95]])(t), fall: ramp(t, 77.5, 84.5),
    };
  }
  const autumnPal = palTrack([[70.8, 'autumnDay'], [82, 'autumnDay'], [86.5, 'autumnStorm'], [90, 'autumnStorm']]);
  const autumnCam = track([
    [69.5, [-1.2, 1.5, 3.2, 900, 520]], [75, [-1.0, 1.6, 3.6, 900, 540]], [79, [-0.9, 1.9, 3.9, 900, 610]],
    [83, [-0.8, 1.7, 4.3, 900, 540]], [90, [-0.6, 1.5, 6.4, 900, 500]],
  ]);
  function drawAutumn(ctx, t) {
    setCam(autumnCam(t));
    const leafAmt = track([[70.8, 1], [80, 0.85], [86, 0.25], [90, 0.1]])(t);
    ENV = Object.assign({}, autumnPal(t), seasonOf({ leaf: leafAmt, hue: track([[69, 1.3], [74, 2.0], [80, 2.2]])(t), berries: 1, snow: ramp(t, 84.5, 88.8) * 0.6 }));
    ENV.groundNear = mixc(ENV.groundNear, hex('#dfe4ea'), ramp(t, 85, 89) * 0.7);
    const D = deerAutumn(t);
    const actors = [{ z: D.z, draw: (c) => drawDeer(c, D, t) }];
    // журавлиный клин
    if (t > 73.5 && t < 85.5) {
      const u = (t - 73.8) / 10.5;
      for (let i = 0; i < 11; i++) {
        const row = Math.ceil(i / 2), side = i === 0 ? 0 : i % 2 ? 1 : -1;
        const x = lerp(34, -34, u) + row * 2.3, y = 17 + side * row * 0.75 + Math.sin(t * 0.8 + i) * 0.15, z = 45 + side * row * 1.6;
        const facing = -1;
        actors.push({ z, draw: (c) => drawCrane(c, x, y, z, facing, t * 5.6 + i * 0.7) });
      }
    }
    drawWorld(ctx, t, FOREST, actors, (c) => {
      // ковёр листьев
      scr(c);
      for (let g = 0; g < 4; g++) {
        c.fillStyle = css(fogged(mixc(leafColor(2 + (g % 2) * 0.8, g), hex('#e9edf2'), ramp(t, 85.5, 88.5) * 0.8), 8));
        c.beginPath();
        for (let i = g; i < 420; i += 4) {
          const x = (hash(i * 2.3) - 0.5) * 24, z = 3.5 + hash(i * 5.7) * 26;
          const p = proj(x, 0, z); if (p.d < 1 || p.x < -20 || p.x > VW + 20) continue;
          ell(c, p.x, p.y, 0.07 * p.s, 0.025 * p.s, hash(i) * 3);
        }
        c.fill();
      }
    });
    // листья с рогов и с деревьев; к концу закручиваются вихрем и белеют — становятся снегом
    const autumnC = [hex('#e8b83c'), hex('#d8662e'), hex('#f3d25a'), hex('#b84a2a'), hex('#c7802a')];
    const toSnow = ramp(t, 85.3, 87.6);
    drawFlutter(ctx, t, track([[70.8, 0.35], [80, 0.6], [84, 1.0], [89, 1.2]])(t), {
      n: 170, size: 0.05 * (1 - toSnow * 0.55), fall: 0.8, windK: 1.4,
      colorAt: (i) => mixc(autumnC[i % 5], hex('#eef3fb'), toSnow), round: toSnow > 0.5,
      swirl: t > 83.5 ? (tt, i, x, y, z) => {
        const k = ramp(tt, 83.5, 86.5);
        const cx = A_DEER.x - CAM.x, cz = A_DEER.z - CAM.z;
        const ang = tt * (1.2 + hash(i) * 1.5) + i, rad = 1.2 + hash(i * 3) * 3.2;
        return [lerp(x, cx + Math.cos(ang) * rad, k), lerp(y, 0.5 + hash(i * 7) * 3.5 + Math.sin(tt + i) * 0.4, k), lerp(z, cz + Math.sin(ang) * rad * 0.6, k)];
      } : null,
    });
    drawSnowfall(ctx, t, ramp(t, 86, 88.5) * 0.6, { n: 600, streak: 0.5 });
    drawLightRays(ctx, 0.45 * (1 - ramp(t, 82, 86)), t);
  }

  /* ======================= 7. УТРО ======================= */
  const R_DEER = { x: 0.9, z: 11.2 };
  // уходит в глубину поляны левее рябины: прежний путь с камеры шёл ровно за её стволом
  const WALK_END = { x: 2.6, z: 24 };
  const WK_DIST = Math.hypot(WALK_END.x - R_DEER.x, WALK_END.z - R_DEER.z);
  function deerWake(t) {
    let P = lyingPose(0.76, -0.78);
    const headUp = ramp(t, 93.2, 94.1);
    P.neck += 0.24 * headUp; P.head += 0.33 * headUp;
    const hind = ramp(t, 94.1, 95.1, Ease.inOut), front = ramp(t, 94.9, 95.9, Ease.inOut);
    const stand = deerStand();
    if (hind > 0) {
      P.bodyY = lerp(0.46, 0.74, hind) + (1.0 - 0.74) * front;
      P.tilt = -0.3 * hind * (1 - front);
      P.legs = P.legs.map((l, i) => { const k = i < 2 ? front : hind; return [lerp(l[0], stand.legs[i][0], k), lerp(l[1], 0, k)]; });
      P.neck = lerp(P.neck, stand.neck, front); P.head = lerp(P.head, stand.head, front);
    }
    // отряхивается
    const sh = win(t, 96.2, 96.35, 97.2, 97.7);
    P.tilt += Math.sin(t * 44) * 0.035 * sh;
    P.neck += Math.sin(t * 44 + 1) * 0.12 * sh;
    P.head += Math.sin(t * 44 + 2) * 0.3 * sh;
    P.ear += Math.sin(t * 44 + 3) * 0.5 * sh;
    // смотрит на снегиря, потом на подснежник
    const up = win(t, 98.0, 98.8, 100.8, 101.6), down = win(t, 102.0, 102.9, 104.0, 104.6);
    P.neck += 0.22 * up - 0.4 * down; P.head += 0.35 * up - 0.5 * down;
    // уходит
    let x = R_DEER.x, z = R_DEER.z;
    if (t > 104.4) {
      const u = (t - 104.4) / 9.0, dist = WK_DIST * travel(u, 0.15);
      const k = dist / WK_DIST;
      x = lerp(R_DEER.x, WALK_END.x, k); z = lerp(R_DEER.z, WALK_END.z, k);
      const w = walkLegs(dist / STRIDE, STRIDE, 0.2);
      const kk = ramp(t, 104.4, 104.9);
      P.legs = P.legs.map((l, i) => [lerp(l[0], w[i][0], kk), lerp(l[1], w[i][1], kk)]);
      P.bodyY += 0.018 * Math.cos(dist / STRIDE * TAU * 2) * kk;
    }
    P.blink = blinkAt(t, [93.8, 99.6, 103.2, 106.5]);
    return {
      x, z, facing: 1, pose: P, coat: 0, breath: 1, rim: 0.55,
      snowBack: 0.75 * (1 - ramp(t, 96.3, 97.4)), mound: 1 - ramp(t, 94.4, 95.8),
    };
  }
  function birdWake(t) {
    const perch = rowanPoint(t, 0, 3, 0.02);
    const nest = { x: 2.05, y: 0.18, z: 10.95 };
    const B = { x: nest.x, y: nest.y, z: nest.z, facing: -1, tilt: 0, squash: 1, fly: 0, flap: 0, sing: 0, fluff: 0.8 * (1 - ramp(t, 95, 96)), look: 0 };
    if (t > 96.3) {
      const u = clamp((t - 96.3) / 1.5), ue = Ease.sine(u);
      B.x = bez(nest.x, nest.x + 1.2, perch.x, ue); B.y = bez(nest.y, perch.y + 1.0, perch.y, ue); B.z = lerp(nest.z, perch.z, ue);
      B.fly = u < 1 ? 1 : 0; B.flap = t * 42; B.facing = u < 0.5 ? 1 : -1;
      if (u >= 1) {
        B.squash = 1 - 0.22 * win(t, 97.8, 97.88, 97.9, 98.1);
        const sing = (s) => win(t, s, s + 0.06, s + 0.5, s + 0.6) * (0.6 + 0.4 * Math.abs(Math.sin((t - s) * 24)));
        B.sing = sing(98.1) + sing(99.1) + sing(100.2);
        B.look = 0.2 * B.sing;
        const hop = Math.sin(clamp((t - 101.15) / 0.3) * Math.PI);
        B.y += hop * 0.06; B.squash -= 0.15 * win(t, 101.0, 101.15, 101.15, 101.25);
      }
    }
    if (t > 104.8) {
      const u = clamp((t - 104.8) / 2.2);
      B.x = perch.x + u * 5; B.y = perch.y + u * 2.2 + Math.sin(u * 9) * 0.2; B.z = perch.z + u * 6; B.fly = 1; B.flap = t * 42; B.facing = 1;
    }
    return B;
  }
  const DROP_T = 101.4;
  function dropState(t) {
    const br = rowanPoint(t, 0, 2);
    const ic = { x: br.x, y: br.y - 0.02, z: br.z - 0.05 };
    const len = 0.24;
    if (t < DROP_T) return { ic, len, grow: ramp(t, 99.4, DROP_T), y: null, hit: false };
    const dt = t - DROP_T, y = ic.y - len - 0.01 - 4.9 * dt * dt;
    return { ic, len, grow: 1, y: Math.max(0, y), hit: y <= 0, hitT: DROP_T + Math.sqrt((ic.y - len - 0.01) / 4.9) };
  }
  const wakePal = palTrack([[92.6, 'winterDawn'], [100, 'winterDawn'], [110, 'winterMorning']]);
  const wakeCam = track([
    [92, [1.4, 0.9, 7.2, 900, 492]], [95.6, [1.0, 1.3, 5.4, 900, 480]], [98.6, [1.8, 1.9, 6.4, 1000, 470]],
    [100.8, [2.1, 2.1, 7.6, 1300, 470]], [101.6, [2.15, 1.7, 7.9, 1250, 460]], [102.5, [2.2, 0.5, 8.4, 1150, 440]],
    [104.3, [2.25, 0.42, 8.9, 1100, 440]], [108.5, [0.9, 1.7, 1.0, 900, 555]], [114, [1.0, 1.8, 0.4, 900, 570]],
  ]);
  function drawWake(ctx, t) {
    setCam(wakeCam(t));
    ENV = Object.assign({}, wakePal(t), seasonOf({ snow: 1, berries: 1 }));
    const D = deerWake(t), B = birdWake(t), dr = dropState(t);
    const actors = [
      { z: D.z, draw: (c) => drawDeer(c, D, t) },
      { z: B.z - 0.35, draw: (c) => drawSongbird(c, B, BULLFINCH, t) },
      { z: dr.ic.z - 0.01, draw: (c) => drawIcicle(c, dr.ic.x, dr.ic.y, dr.ic.z, dr.len, dr.grow, dr.y != null && !dr.hit ? dr.y : null) },
    ];
    // подснежник там, куда упала капля: цветок-герой, крупнее весенних, чтобы читался на крупном плане
    const sproutAt = dr.hitT || 102.1;
    actors.push({ z: dr.ic.z - 0.02, draw: (c) => {
      if (t > sproutAt) {
        // брызги снега
        const dt = t - sproutAt;
        if (dt < 0.8) {
          scr(c); c.fillStyle = css(light(ENV.groundNear, 0.1), 0.9 * (1 - dt / 0.8)); c.beginPath();
          for (let i = 0; i < 16; i++) {
            const a = hash(i * 3.7) * Math.PI, v = 0.3 + hash(i) * 0.5;
            const p = proj(dr.ic.x + Math.cos(a) * v * dt, Math.max(0, Math.sin(a) * v * dt * 1.5 - 4.9 * dt * dt), dr.ic.z);
            circ(c, p.x, p.y, Math.max(1, 0.006 * p.s));
          }
          c.fill();
        }
        // тёмная лунка в снегу
        const p = proj(dr.ic.x + 0.03, 0, dr.ic.z);
        scr(c); c.fillStyle = css(mixc(ENV.snowSh, hex('#5b5040'), 0.4), 0.8 * ramp(t, sproutAt, sproutAt + 0.4));
        c.beginPath(); ell(c, p.x, p.y, 0.05 * p.s, 0.016 * p.s, 0); c.fill();
      }
      drawSnowdrop(c, dr.ic.x + 0.0, dr.ic.z, ramp(t, sproutAt + 0.2, sproutAt + 1.6, Ease.back) * 2.2, ramp(t, sproutAt + 1.2, sproutAt + 2.6), t, 3);
    } });
    // снег, стряхнутый со спины
    if (t > 96.2 && t < 99) {
      const dt = t - 96.2;
      actors.push({ z: D.z - 0.3, draw: (c) => {
        scr(c); c.fillStyle = css(light(ENV.groundNear, 0.1), 0.9 * (1 - clamp((dt - 1.4) / 1.2))); c.beginPath();
        for (let i = 0; i < 60; i++) {
          const x0 = D.x + (hash(i * 1.9) - 0.6) * 1.5, y0 = 1.25 + hash(i * 2.7) * 0.2;
          const vx = (hash(i * 3.1) - 0.5) * 2.4, vy = 0.8 + hash(i * 4.3) * 1.8, st = hash(i * 5.9) * 0.9;
          const tt = dt - st; if (tt < 0) continue;
          const y = y0 + vy * tt - 4.9 * tt * tt; if (y < 0) continue;
          const p = proj(x0 + vx * tt, y, D.z + (hash(i * 6.1) - 0.5) * 0.8);
          circ(c, p.x, p.y, Math.max(1, (0.02 + hash(i) * 0.02) * p.s));
        }
        c.fill();
      } });
    }
    drawWorld(ctx, t, FOREST, actors, (c) => {
      // вмятина-лёжка в снегу после ухода
      if (t > 95.6) {
        const p = proj(R_DEER.x, 0, R_DEER.z);
        scr(c); c.fillStyle = css(ENV.snowSh, 0.45 * ramp(t, 95.6, 96.6));
        c.beginPath(); ell(c, p.x, p.y, 1.1 * p.s, 0.2 * p.s, 0); c.fill();
      }
    });
    drawSnowfall(ctx, t, 0.14, { n: 500, fall: 0.35, size: 0.8 });
    drawLightRays(ctx, 0.7, t);
    drawForeBoughs(ctx, t, ramp(t, 104.5, 108.5), null, 1);
    // утреннее небо почти белое: титр пишется тёмной краской со светлым ореолом
    drawTitle(ctx, 'Конец', 800, 190, 96, ramp(t, 108.6, 110.6), hex('#3b3450'), [255, 246, 232]);
  }

  /* ======================= МОНТАЖ ======================= */
  const SHOTS = [
    { id: 'winter', draw: drawWinter },
    { id: 'eye', draw: drawEyeSleep },
    { id: 'spring', draw: drawSpring },
    { id: 'summer', draw: drawSummer },
    { id: 'autumn', draw: drawAutumn },
    { id: 'eye2', draw: drawEyeWake },
    { id: 'wake', draw: drawWake },
  ];
  // Переходы между соседними планами: момент, длительность, как «ведёт палец»
  const CUTS = [
    { at: 20.8, dur: 1.7, mode: 3, cx: 0.6, cy: 0.52, seed: 1.3 },
    { at: 25.8, dur: 2.6, mode: 0, cx: 0.5, cy: 0.52, seed: 2.1 },
    { at: 47.8, dur: 2.6, mode: 1, seed: 3.7 },
    { at: 70.8, dur: 2.8, mode: 2, seed: 4.2 },
    { at: 89.0, dur: 1.2, mode: 3, cx: 0.5, cy: 0.5, seed: 5.5 },
    { at: 92.6, dur: 1.6, mode: 4, seed: 6.6 },
  ];
  // Сцены для шкалы плеера
  const SCENES = [
    { name: 'Зима', short: 'Зима', t: 0 },
    { name: 'Весна', short: 'Весна', t: 25.8 },
    { name: 'Лето', short: 'Лето', t: 47.8 },
    { name: 'Осень', short: 'Осень', t: 70.8 },
    { name: 'Пробуждение', short: 'Утро', t: 89.0 },
  ];

  function frame(t) {
    let i = 0;
    while (i < CUTS.length && t >= CUTS[i].at) i++;
    for (const k of [i - 1, i]) {
      const c = CUTS[k];
      if (c && Math.abs(t - c.at) < c.dur / 2) {
        return { a: k, b: k + 1, p: Ease.sine((t - (c.at - c.dur / 2)) / c.dur), mode: c.mode, cx: c.cx, cy: c.cy, seed: c.seed };
      }
    }
    return { a: i, b: -1, p: 0 };
  }

  // Параметры живописи во времени
  const lookLen = track([[0, 1.25], [20, 1.3], [24, 1.75], [45, 1.8], [60, 1.6], [84, 1.7], [89, 1.5], [93, 1.25], [114, 1.25]]);
  const lookWarm = track([[0, -0.25], [21, -0.3], [26, 0.1], [46, 0.15], [55, 0.2], [66, 0.5], [70.8, 0.4], [80, 0.3], [86, -0.2], [90, 0.25], [110, 0.2]]);
  const lookSat = track([[0, 0.95], [24, 0.95], [27, 1.08], [66, 1.1], [80, 1.05], [84.5, 1.0], [87.5, 0.55], [90, 0.95], [114, 1.0]]);
  const lookFrost = track([[0, 0.22], [8, 0.14], [19, 0.16], [21.5, 0.12], [24.5, 0], [84.4, 0, 'inOut'], [88.2, 1.0], [114, 1.0]]);
  const lookMelt = track([[0, 0.0], [88.4, 0.0, 'quadIn'], [91.6, 1.5], [114, 1.5]]);
  const lookBloom = track([[0, 0.3], [20, 0.25], [27, 0.45], [60, 0.5], [67, 0.75], [72, 0.45], [86, 0.3], [92, 0.55], [114, 0.5]]);
  function look(t) {
    const frame12 = Math.floor(t * 12);
    let frost = lookFrost(t), melt = lookMelt(t);
    if (t < 30) melt = 0;
    return {
      len: lookLen(t), free: 0.85, bump: 1.05, bloom: lookBloom(t), bloomThr: 0.6, grain: 0.035, vig: 0.55,
      frost, melt, sat: lookSat(t), warm: lookWarm(t), expo: 1.0, edge: 0.3,
      fade: 0.55 * ramp(t, 112.3, 114), fadeCol: [0.08, 0.063, 0.055],
      seed: (frame12 % 7) * 0.173, frame: frame12,
      weave: [(hash(frame12) - 0.5) * 0.7, (hash(frame12 + 0.5) - 0.5) * 0.7],
    };
  }

  function draw(ctx, shotIndex, t, pixelScale) {
    BK = pixelScale;
    TNOW = t;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    SHOTS[clamp(shotIndex, 0, SHOTS.length - 1)].draw(ctx, t);
  }

  // Фазы походок — по ним звук ставит шаги и удары копыт точно в такт анимации
  const phases = {
    winter: (t) => (t > 2.0 && t < 11.6 ? W_DIST * travel((t - 2.2) / 9.2, 0.12) / STRIDE : null),
    wake: (t) => (t > 104.4 ? WK_DIST * travel((t - 104.4) / 9.0, 0.15) / STRIDE : null),
    gallop: (t) => (t > 50.2 && t < 59.2 ? (G_X0 - G_X1) * travel((t - 50.2) / 9.8, 0.1) / 3.3 : null),
  };
  const dropHitT = () => dropState(103).hitT;

  return { frame, draw, look, SCENES, SHOTS, CUTS, phases, dropHitT };
})();
