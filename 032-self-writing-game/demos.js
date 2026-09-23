/* ================================================================
   032 · Игра, которая пишет себя — заготовленные игры для демо-режима.

   Каждая игра написана под то же API, что получает нейросеть (см. prompts.js).
   Тело функции — это и есть исходник игры: страница берёт его через toString()
   и отправляет в песочницу. Сами функции страница не вызывает.
   Глобальный флаг autoplay есть только у заготовок: пока игрок ничего не нажал,
   за него играет простой бот — так обложка живая.
   ================================================================ */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ */
  function GAME_CAT() {
    // title: Кот-рыболов
    // controls: ← → — бегать, пробел — прыжок через собак
    let cat, fish, dogs, gulls, spawnF, spawnD, waves, combo;
    const GROUND = 500;

    function init() {
      cat = { x: W / 2, y: GROUND, vx: 0, vy: 0, air: false, face: 1, squash: 0, hurt: 0 };
      fish = []; dogs = []; spawnF = 0.5; spawnD = 2.6; combo = 0; lives = 3;
      gulls = [0, 1, 2].map((i) => ({ x: 160 + i * 320, y: 90 + i * 22, ph: i * 2 }));
      waves = [];
      for (let i = 0; i < 26; i++) waves.push({ x: rand(0, W), y: rand(350, 590), w: rand(30, 90), s: rand(8, 22) });
    }

    function nearestFish() {
      let best = null, bt = 1e9;
      for (const f of fish) {
        const t = f.landed ? 2 + Math.abs(f.x - cat.x) / 300 : (GROUND - f.y) / Math.max(40, f.vy) + Math.abs(f.x - cat.x) / 600;
        if (t < bt) { bt = t; best = f; }
      }
      return best;
    }

    function update(dt) {
      // бот, пока игрок не вмешался
      let dx = input.dx, jump = tap('jump');
      if (autoplay) {
        const f = nearestFish();
        dx = f ? clamp((f.x - cat.x) / 40, -1, 1) : 0;
        for (const d of dogs) if (Math.abs(d.x - cat.x) < 120 && Math.sign(cat.x - d.x) === Math.sign(d.vx) && !cat.air) jump = true;
      }
      cat.vx = lerp(cat.vx, dx * 430, 1 - Math.pow(0.0005, dt));
      if (dx) cat.face = Math.sign(dx);
      if (jump && !cat.air) { cat.vy = -640; cat.air = true; sound('jump'); cat.squash = -0.25; }
      cat.vy += 1500 * dt;
      cat.x = clamp(cat.x + cat.vx * dt, 40, W - 40);
      cat.y += cat.vy * dt;
      if (cat.y >= GROUND) { if (cat.air) cat.squash = 0.3; cat.y = GROUND; cat.vy = 0; cat.air = false; }
      cat.squash *= Math.pow(0.02, dt);
      cat.hurt = Math.max(0, cat.hurt - dt);

      for (const g of gulls) { g.ph += dt; g.x += Math.sin(g.ph * 0.4) * 60 * dt + 40 * dt; if (g.x > W + 60) g.x = -60; }

      spawnF -= dt;
      if (spawnF <= 0) {
        spawnF = Math.max(0.35, 1.1 - T * 0.012);
        const g = pick(gulls.filter((q) => q.x > 60 && q.x < W - 60)) || { x: rand(100, W - 100), y: 90 };
        const gold = Math.random() < 0.12;
        fish.push({ x: g.x, y: g.y + 10, vy: rand(60, 120), rot: rand(0, 6), spin: rand(-4, 4), gold, landed: 0 });
        sound('blip');
      }
      spawnD -= dt;
      if (spawnD <= 0) {
        spawnD = Math.max(1.1, 3.2 - T * 0.03);
        const left = Math.random() < 0.5;
        dogs.push({ x: left ? -60 : W + 60, vx: (left ? 1 : -1) * rand(150, 230 + T * 3), step: 0, big: Math.random() < 0.25 });
      }

      for (let i = fish.length - 1; i >= 0; i--) {
        const f = fish[i];
        if (!f.landed) { f.vy += 380 * dt; f.y += f.vy * dt; f.rot += f.spin * dt; }
        else { f.landed += dt; f.rot = Math.sin(f.landed * 18) * 0.4; }
        if (!f.landed && f.y >= GROUND + 12) { f.y = GROUND + 12; f.landed = 0.001; }
        if (Math.abs(f.x - cat.x) < 44 && Math.abs(f.y - (cat.y - 30)) < 46) {
          fish.splice(i, 1);
          combo++;
          const pts = (f.gold ? 50 : 10) * Math.min(5, 1 + Math.floor(combo / 5));
          score += pts;
          sound(f.gold ? 'power' : 'coin');
          burst(f.x, f.y, f.gold ? '#ffd166' : '#bfe6f2', f.gold ? 26 : 12);
          floatText(f.x, f.y - 30, '+' + pts, f.gold ? '#ffd166' : '#fff6e6');
          continue;
        }
        if (f.landed > 2.4) { fish.splice(i, 1); combo = 0; floatText(f.x, f.y - 20, 'уплыла', '#bfe6f2'); }
      }

      for (let i = dogs.length - 1; i >= 0; i--) {
        const d = dogs[i];
        d.x += d.vx * dt; d.step += dt * 14;
        for (let j = fish.length - 1; j >= 0; j--) {
          if (fish[j].landed && Math.abs(fish[j].x - d.x) < 30) { fish.splice(j, 1); floatText(d.x, GROUND - 60, 'ням!', '#ffb4a2'); combo = 0; }
        }
        if (!cat.hurt && Math.abs(d.x - cat.x) < (d.big ? 60 : 48) && cat.y > GROUND - (d.big ? 60 : 44)) {
          cat.hurt = 1.4; lives -= 1; combo = 0;
          cat.vx = Math.sign(cat.x - d.x) * 600; cat.vy = -380; cat.air = true;
          sound('hit'); shake(12); burst(cat.x, cat.y - 30, '#f4a261', 18);
        }
        if (!d.jumped && cat.air && Math.abs(d.x - cat.x) < 20 && cat.y < GROUND - 50) {
          d.jumped = true; score += 5; floatText(cat.x, cat.y - 80, 'хоп! +5', '#ffe8a3');
        }
        if (d.x < -120 || d.x > W + 120) dogs.splice(i, 1);
      }
    }

    function drawCat(c) {
      const t = T, sq = c.squash;
      ctx0.save();
      ctx0.translate(c.x, c.y);
      ctx0.scale(c.face * (1 + sq * 0.6), 1 - sq);
      if (c.hurt && Math.floor(t * 16) % 2) ctx0.globalAlpha = 0.45;
      const k = ctx0;
      k.fillStyle = 'rgba(0,0,0,.25)'; k.beginPath(); k.ellipse(0, 2, 38, 7, 0, 0, 6.3); k.fill();
      k.strokeStyle = '#e07b39'; k.lineWidth = 9; k.lineCap = 'round';
      k.beginPath(); k.moveTo(-28, -22); k.quadraticCurveTo(-58, -40 + Math.sin(t * 5) * 10, -48, -72 + Math.sin(t * 4) * 8); k.stroke();
      k.fillStyle = '#f08a3c'; k.beginPath(); k.ellipse(0, -26, 34, 24, 0, 0, 6.3); k.fill();
      k.fillStyle = '#f7b27a'; k.beginPath(); k.ellipse(6, -20, 18, 12, 0, 0, 6.3); k.fill();
      const leg = c.air ? 0 : Math.sin(t * 18) * Math.min(1, Math.abs(c.vx) / 200) * 6;
      k.fillStyle = '#e07b39';
      k.fillRect(-22 + leg, -8, 10, 10); k.fillRect(12 - leg, -8, 10, 10);
      k.fillStyle = '#f08a3c'; k.beginPath(); k.arc(26, -50, 22, 0, 6.3); k.fill();
      k.beginPath(); k.moveTo(10, -64); k.lineTo(14, -86); k.lineTo(26, -70); k.fill();
      k.beginPath(); k.moveTo(30, -70); k.lineTo(42, -84); k.lineTo(44, -62); k.fill();
      k.fillStyle = '#ffb4a2'; k.beginPath(); k.moveTo(15, -67); k.lineTo(16, -79); k.lineTo(23, -70); k.fill();
      k.fillStyle = '#fff'; k.beginPath(); k.ellipse(24, -54, 6, 7, 0, 0, 6.3); k.ellipse(38, -54, 5, 7, 0, 0, 6.3); k.fill();
      k.fillStyle = '#1b1a17'; k.beginPath(); k.arc(26, -53, 3.2, 0, 6.3); k.arc(39, -53, 3, 0, 6.3); k.fill();
      k.fillStyle = '#c2566b'; k.beginPath(); k.arc(44, -46, 3, 0, 6.3); k.fill();
      k.strokeStyle = 'rgba(255,246,230,.8)'; k.lineWidth = 1.5;
      k.beginPath(); k.moveTo(40, -44); k.lineTo(58, -48); k.moveTo(40, -42); k.lineTo(58, -40); k.stroke();
      k.restore();
    }

    function drawDog(d) {
      const k = ctx0, s = d.big ? 1.3 : 1, dir = Math.sign(d.vx);
      k.save(); k.translate(d.x, GROUND); k.scale(dir * s, s);
      k.fillStyle = 'rgba(0,0,0,.25)'; k.beginPath(); k.ellipse(0, 2, 36, 6, 0, 0, 6.3); k.fill();
      const b = Math.abs(Math.sin(d.step)) * 4;
      k.fillStyle = d.big ? '#5b4636' : '#8c6a4f';
      k.fillRect(-26, -18, 8, 18); k.fillRect(16, -18, 8, 18);
      k.fillRect(-20 + Math.sin(d.step) * 4, -16, 7, 16); k.fillRect(10 - Math.sin(d.step) * 4, -16, 7, 16);
      k.beginPath(); k.ellipse(0, -30 - b, 34, 17, 0, 0, 6.3); k.fill();
      k.beginPath(); k.arc(34, -48 - b, 16, 0, 6.3); k.fill();
      k.fillRect(38, -50 - b, 20, 12);
      k.fillStyle = '#2b211a'; k.beginPath(); k.ellipse(24, -48 - b, 7, 14, 0.5, 0, 6.3); k.fill();
      k.beginPath(); k.arc(58, -47 - b, 4, 0, 6.3); k.fill();
      k.fillStyle = '#fff'; k.beginPath(); k.arc(40, -54 - b, 4, 0, 6.3); k.fill();
      k.fillStyle = '#1b1a17'; k.beginPath(); k.arc(41, -54 - b, 2, 0, 6.3); k.fill();
      k.fillStyle = '#e76f7a'; k.fillRect(48, -38 - b, 6, 8 + Math.sin(d.step * 2) * 2);
      k.strokeStyle = d.big ? '#5b4636' : '#8c6a4f'; k.lineWidth = 6; k.lineCap = 'round';
      k.beginPath(); k.moveTo(-32, -36 - b); k.lineTo(-44, -52 - b + Math.sin(d.step * 2) * 6); k.stroke();
      k.restore();
    }

    function drawFish(f) {
      const k = ctx0;
      k.save(); k.translate(f.x, f.y); k.rotate(f.rot);
      k.fillStyle = f.gold ? '#ffd166' : '#8fc9dc';
      k.beginPath(); k.ellipse(0, 0, 20, 10, 0, 0, 6.3); k.fill();
      k.beginPath(); k.moveTo(-16, 0); k.lineTo(-30, -10); k.lineTo(-30, 10); k.fill();
      k.fillStyle = f.gold ? '#fff1c1' : '#e3f4f9'; k.beginPath(); k.ellipse(3, 3, 12, 4, 0, 0, 6.3); k.fill();
      k.fillStyle = '#1b1a17'; k.beginPath(); k.arc(11, -2, 2.5, 0, 6.3); k.fill();
      k.restore();
    }

    let ctx0;
    function draw(ctx) {
      ctx0 = ctx;
      const sky = ctx.createLinearGradient(0, 0, 0, 340);
      sky.addColorStop(0, '#1d2b4a'); sky.addColorStop(0.55, '#8a4a6e'); sky.addColorStop(1, '#f4a261');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 340);
      circle(ctx, 700, 318, 70, '#ffd9a0'); circle(ctx, 700, 318, 54, '#ffe9c7');
      ctx.fillStyle = 'rgba(255,233,199,.18)';
      for (let i = 0; i < 5; i++) ctx.fillRect(0, 60 + i * 34, W, 2);
      // маяк на горизонте
      ctx.fillStyle = '#2a2238'; ctx.fillRect(96, 250, 26, 90); ctx.fillRect(90, 240, 38, 12);
      ctx.fillStyle = '#ffe9a8'; ctx.fillRect(100, 226, 18, 14);
      const a = T * 0.9;
      ctx.fillStyle = 'rgba(255,233,168,.16)';
      ctx.beginPath(); ctx.moveTo(109, 233); ctx.lineTo(109 + Math.cos(a) * 520, 233 + Math.sin(a) * 60 - 40); ctx.lineTo(109 + Math.cos(a) * 520, 233 + Math.sin(a) * 60 + 30); ctx.fill();
      const sea = ctx.createLinearGradient(0, 330, 0, H);
      sea.addColorStop(0, '#3d5a80'); sea.addColorStop(1, '#141f33');
      ctx.fillStyle = sea; ctx.fillRect(0, 330, W, H - 330);
      ctx.fillStyle = 'rgba(255,217,160,.35)';
      for (let i = 0; i < 9; i++) ctx.fillRect(640 + Math.sin(T * 2 + i) * 12 - i * 3, 344 + i * 16, 120 - i * 10, 3);
      ctx.strokeStyle = 'rgba(200,230,255,.18)'; ctx.lineWidth = 2;
      for (const w of waves) {
        const x = (w.x + T * w.s) % (W + 100) - 50;
        ctx.beginPath(); ctx.moveTo(x, w.y); ctx.quadraticCurveTo(x + w.w / 2, w.y - 5, x + w.w, w.y); ctx.stroke();
      }
      // чайки
      ctx.strokeStyle = '#f7ede2'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (const g of gulls) {
        const f = Math.sin(g.ph * 7) * 8;
        ctx.beginPath(); ctx.moveTo(g.x - 18, g.y - f); ctx.quadraticCurveTo(g.x - 8, g.y - 8, g.x, g.y); ctx.quadraticCurveTo(g.x + 8, g.y - 8, g.x + 18, g.y - f); ctx.stroke();
      }
      // причал
      ctx.fillStyle = '#4a3326';
      for (let x = 30; x < W; x += 150) ctx.fillRect(x, GROUND + 20, 16, 90);
      ctx.fillStyle = '#9a6a48'; ctx.fillRect(0, GROUND, W, 26);
      ctx.fillStyle = '#b98460'; ctx.fillRect(0, GROUND, W, 5);
      ctx.fillStyle = 'rgba(40,24,16,.5)';
      for (let x = 0; x < W; x += 48) ctx.fillRect(x, GROUND + 5, 2, 21);
      for (let x = 105; x < W; x += 300) {
        ctx.fillStyle = '#3a2a20'; ctx.fillRect(x, GROUND - 90, 6, 90);
        const glow = ctx.createRadialGradient(x + 3, GROUND - 96, 2, x + 3, GROUND - 96, 60);
        glow.addColorStop(0, 'rgba(255,214,140,.55)'); glow.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = glow; ctx.fillRect(x - 60, GROUND - 156, 126, 120);
        circle(ctx, x + 3, GROUND - 96, 8, '#ffe2a8');
      }
      for (const f of fish) drawFish(f);
      for (const d of dogs) drawDog(d);
      drawCat(cat);
      if (combo >= 5) text(ctx, 'серия ×' + Math.min(5, 1 + Math.floor(combo / 5)), W / 2, 40, 22, '#ffe8a3');
    }
  }

  /* ------------------------------------------------------------------ */
  function GAME_ICE_SNAKE() {
    // title: Змейка на льду
    // controls: ← → — поворачивать, змейка скользит по инерции
    let head, vel, dir, trail, len, berries, holes, scratches, holeTimer, flakes;

    function init() {
      head = { x: W / 2, y: H / 2 }; vel = { x: 150, y: 0 }; dir = 0;
      trail = []; len = 14; berries = []; holes = []; holeTimer = 7; flakes = [];
      for (let i = 0; i < 4; i++) addBerry();
      scratches = [];
      for (let i = 0; i < 40; i++) scratches.push({ x: rand(40, W - 40), y: rand(40, H - 40), r: rand(40, 200), a: rand(0, 6.3), l: rand(0.2, 0.9) });
      for (let i = 0; i < 60; i++) flakes.push({ x: rand(0, W), y: rand(0, H), s: rand(1, 3), v: rand(20, 60) });
    }
    function addBerry() {
      for (let tries = 0; tries < 30; tries++) {
        const b = { x: rand(80, W - 80), y: rand(90, H - 80), r: 13, gold: Math.random() < 0.15, ph: rand(0, 6) };
        if (holes.every((h) => dist(h.x, h.y, b.x, b.y) > h.r + 40) && dist(b.x, b.y, head.x, head.y) > 90) { berries.push(b); return; }
      }
    }

    function update(dt) {
      let turn = input.dx;
      if (pointer.down) {
        const want = angle(head.x, head.y, pointer.x, pointer.y);
        turn = clamp(Math.atan2(Math.sin(want - dir), Math.cos(want - dir)) * 2, -1, 1);
      }
      if (autoplay) {
        let target = null, bd = 1e9;
        for (const b of berries) { const d = dist(head.x, head.y, b.x, b.y); if (d < bd) { bd = d; target = b; } }
        if (target) {
          let want = angle(head.x, head.y, target.x, target.y);
          for (const h of holes) if (dist(head.x, head.y, h.x, h.y) < h.r + 70) want = angle(h.x, h.y, head.x, head.y);
          turn = clamp(Math.atan2(Math.sin(want - dir), Math.cos(want - dir)) * 2.5, -1, 1);
        }
      }
      dir += turn * 3.4 * dt;
      const speed = 190 + len * 2.2;
      // лёд: скорость медленно догоняет направление головы — отсюда занос
      const grip = 1 - Math.pow(0.18, dt);
      vel.x = lerp(vel.x, Math.cos(dir) * speed, grip);
      vel.y = lerp(vel.y, Math.sin(dir) * speed, grip);
      head.x += vel.x * dt; head.y += vel.y * dt;
      // сугробы по краям пружинят
      if (head.x < 30 || head.x > W - 30) { vel.x *= -0.8; head.x = clamp(head.x, 30, W - 30); dir = Math.PI - dir; shake(5); sound('hit'); burst(head.x, head.y, '#ffffff', 10); }
      if (head.y < 30 || head.y > H - 30) { vel.y *= -0.8; head.y = clamp(head.y, 30, H - 30); dir = -dir; shake(5); sound('hit'); burst(head.x, head.y, '#ffffff', 10); }
      trail.unshift({ x: head.x, y: head.y });
      const need = Math.floor(len * 3.2);
      if (trail.length > need) trail.length = need;

      for (let i = berries.length - 1; i >= 0; i--) {
        const b = berries[i]; b.ph += dt * 3;
        if (dist(head.x, head.y, b.x, b.y) < b.r + 14) {
          berries.splice(i, 1);
          len += b.gold ? 6 : 3; score += b.gold ? 50 : 10;
          sound(b.gold ? 'power' : 'coin'); burst(b.x, b.y, b.gold ? '#ffd166' : '#e63956', 16);
          floatText(b.x, b.y - 24, b.gold ? '+50' : '+10', b.gold ? '#ffd166' : '#fff');
          addBerry();
        }
      }
      holeTimer -= dt;
      if (holeTimer <= 0 && holes.length < 7) {
        holeTimer = Math.max(3, 8 - T * 0.05);
        const h = { x: rand(100, W - 100), y: rand(100, H - 100), r: 0, max: rand(26, 48), cr: rand(0, 6) };
        if (dist(h.x, h.y, head.x, head.y) > 180) { holes.push(h); sound('boom'); shake(4); }
      }
      for (const h of holes) {
        h.r = Math.min(h.max, h.r + dt * 16);
        if (h.r > 12 && dist(head.x, head.y, h.x, h.y) < h.r - 6) { burst(head.x, head.y, '#7fb8d6', 30); shake(14); gameOver('Змейка провалилась под лёд'); return; }
      }
      for (let i = 34; i < trail.length; i += 3) {
        if (dist(head.x, head.y, trail[i].x, trail[i].y) < 11) { shake(10); gameOver('Змейка укусила себя за хвост'); return; }
      }
      for (const f of flakes) { f.y += f.v * dt; f.x += Math.sin(T + f.y * 0.02) * 10 * dt; if (f.y > H) { f.y = -5; f.x = rand(0, W); } }
    }

    function draw(ctx) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#dff1f7'); g.addColorStop(0.6, '#b4dbea'); g.addColorStop(1, '#8fc3db');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.2;
      for (const s of scratches) { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, s.a, s.a + s.l); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.moveTo(120, 0); ctx.lineTo(260, 0); ctx.lineTo(80, H); ctx.lineTo(-60, H); ctx.fill();
      for (const h of holes) {
        ctx.strokeStyle = 'rgba(70,120,150,.5)'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) { const a = h.cr + i; ctx.beginPath(); ctx.moveTo(h.x + Math.cos(a) * h.r, h.y + Math.sin(a) * h.r); ctx.lineTo(h.x + Math.cos(a + 0.2) * (h.r + 26), h.y + Math.sin(a + 0.2) * (h.r + 26)); ctx.stroke(); }
        const w = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, Math.max(1, h.r));
        w.addColorStop(0, '#0d2a44'); w.addColorStop(1, '#2d6a8f');
        ctx.fillStyle = w; ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, 6.3); ctx.fill();
        ctx.strokeStyle = '#f4fbff'; ctx.lineWidth = 3; ctx.stroke();
      }
      for (const b of berries) {
        const r = b.r + Math.sin(b.ph) * 1.5;
        ctx.fillStyle = 'rgba(20,60,90,.18)'; ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + r, r, 4, 0, 0, 6.3); ctx.fill();
        circle(ctx, b.x, b.y, r, b.gold ? '#f2b705' : '#d62246');
        circle(ctx, b.x - r * 0.35, b.y - r * 0.35, r * 0.3, 'rgba(255,255,255,.7)');
        ctx.fillStyle = '#2f7a4a'; ctx.beginPath(); ctx.ellipse(b.x + 4, b.y - r, 6, 3, -0.5, 0, 6.3); ctx.fill();
      }
      // тело: от хвоста к голове, полосатое
      for (let i = trail.length - 1; i >= 0; i -= 3) {
        const p = trail[i], t = i / Math.max(1, trail.length);
        const r = 14 - t * 7;
        circle(ctx, p.x + 3, p.y + 5, r, 'rgba(30,70,100,.16)');
        circle(ctx, p.x, p.y, r, Math.floor(i / 9) % 2 ? '#2a9d8f' : '#e9c46a');
      }
      const sx = Math.cos(dir), sy = Math.sin(dir);
      circle(ctx, head.x, head.y, 17, '#264653');
      for (const s of [-1, 1]) {
        const ex = head.x + sx * 7 - sy * 8 * s, ey = head.y + sy * 7 + sx * 8 * s;
        circle(ctx, ex, ey, 5.5, '#fff'); circle(ctx, ex + sx * 2, ey + sy * 2, 2.6, '#111');
      }
      if (Math.sin(T * 6) > 0.2) {
        ctx.strokeStyle = '#e63956'; ctx.lineWidth = 2.5; ctx.beginPath();
        ctx.moveTo(head.x + sx * 16, head.y + sy * 16); ctx.lineTo(head.x + sx * 28, head.y + sy * 28); ctx.stroke();
      }
      ctx.fillStyle = '#f7fbfd';
      for (let x = 0; x < W; x += 40) { circle(ctx, x + 20, 8, 26, '#f7fbfd'); circle(ctx, x + 20, H - 8, 26, '#f7fbfd'); }
      for (let y = 0; y < H; y += 40) { circle(ctx, 6, y + 20, 24, '#f7fbfd'); circle(ctx, W - 6, y + 20, 24, '#f7fbfd'); }
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      for (const f of flakes) ctx.fillRect(f.x, f.y, f.s, f.s);
    }
  }

  /* ------------------------------------------------------------------ */
  function GAME_GARDEN() {
    // title: Огородная оборона
    // controls: мышь или ← → — целиться, клик или пробел — бросить помидор
    let aim, cool, tomatoes, crows, cabbages, wave, spawn, clouds;
    const GX = W / 2, GY = 520;

    function init() {
      aim = -Math.PI / 2; cool = 0; tomatoes = []; crows = []; wave = 1; spawn = 1.2;
      cabbages = [];
      for (let i = 0; i < 6; i++) cabbages.push({ x: 120 + i * 145 + (i > 2 ? 40 : -40), y: 548, taken: false });
      clouds = [];
      for (let i = 0; i < 6; i++) clouds.push({ x: rand(0, W), y: rand(40, 200), s: rand(0.6, 1.3), v: rand(8, 22) });
    }
    function fire() {
      const v = 900;
      tomatoes.push({ x: GX + Math.cos(aim) * 60, y: GY - 60 + Math.sin(aim) * 60, vx: Math.cos(aim) * v, vy: Math.sin(aim) * v, r: 11 });
      cool = 0.28; sound('shoot');
    }
    function update(dt) {
      let fireNow = tap('fire') || pointer.tapped;
      if (pointer.down || pointer.tapped) aim = angle(GX, GY - 60, pointer.x, pointer.y);
      aim += input.dx * 2.4 * dt;
      if (autoplay) {
        let t = null, bd = 1e9;
        for (const c of crows) { const d = dist(GX, GY, c.x, c.y); if (d < bd && c.y < GY - 40) { bd = d; t = c; } }
        if (t) {
          const time = bd / 900;
          aim = lerp(aim, angle(GX, GY - 60, t.x + t.vx * time, t.y + t.vy * time - 200 * time * time), 0.2);
          fireNow = cool <= 0 && Math.random() < 0.08;
        }
      }
      aim = clamp(aim, -Math.PI + 0.12, -0.12);
      cool -= dt;
      if ((fireNow || key('fire')) && cool <= 0) fire();

      spawn -= dt;
      if (spawn <= 0) {
        spawn = Math.max(0.5, 2 - T * 0.02);
        const left = Math.random() < 0.5;
        const alive = cabbages.filter((c) => !c.taken);
        crows.push({ x: left ? -40 : W + 40, y: rand(70, 260), vx: (left ? 1 : -1) * rand(120, 170 + T * 2), vy: 0, dive: rand(1.5, 4), target: pick(alive), flap: rand(0, 6), carry: null, hp: Math.random() < 0.15 ? 2 : 1 });
      }
      for (let i = tomatoes.length - 1; i >= 0; i--) {
        const t = tomatoes[i];
        t.vy += 400 * dt; t.x += t.vx * dt; t.y += t.vy * dt;
        if (t.y > H + 30 || t.x < -30 || t.x > W + 30) { tomatoes.splice(i, 1); continue; }
        for (let j = crows.length - 1; j >= 0; j--) {
          const c = crows[j];
          if (hitCircle(t, { x: c.x, y: c.y, r: 26 })) {
            tomatoes.splice(i, 1);
            burst(t.x, t.y, '#e63946', 14);
            c.hp -= 1;
            if (c.hp <= 0) {
              if (c.carry) { c.carry.taken = false; c.carry.fall = c.y; floatText(c.x, c.y - 30, 'вернул!', '#b7e4a0'); }
              crows.splice(j, 1);
              score += c.carry ? 40 : 15; burst(c.x, c.y, '#2b2d42', 20); sound('boom'); shake(5);
              floatText(c.x, c.y, c.carry ? '+40' : '+15', '#fff6e6');
            } else sound('hit');
            break;
          }
        }
      }
      for (let i = crows.length - 1; i >= 0; i--) {
        const c = crows[i];
        c.flap += dt * 12;
        if (c.carry) { c.vy = -120; c.x += c.vx * dt * 0.6; c.y += c.vy * dt; c.carry.x = c.x; c.carry.y = c.y + 30; if (c.y < -60) { crows.splice(i, 1); c.carry.gone = true; sound('lose'); } continue; }
        c.dive -= dt;
        if (c.dive <= 0 && c.target && !c.target.taken) {
          const a = angle(c.x, c.y, c.target.x, c.target.y - 20);
          c.vx = lerp(c.vx, Math.cos(a) * 260, 0.05); c.vy = lerp(c.vy, Math.sin(a) * 260, 0.05);
          if (dist(c.x, c.y, c.target.x, c.target.y - 20) < 24) { c.carry = c.target; c.target.taken = true; sound('blip'); floatText(c.x, c.y - 30, 'кар!', '#2b2d42'); }
        } else if (c.dive <= 0) { const alive = cabbages.filter((q) => !q.taken && !q.gone); c.target = pick(alive); if (!c.target) c.dive = 2; }
        else c.y += Math.sin(T * 3 + i) * 30 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt;
        if (c.x < -80 || c.x > W + 80) crows.splice(i, 1);
      }
      for (const cb of cabbages) if (cb.fall !== undefined && !cb.taken) { cb.fall = Math.min(548, cb.fall + 400 * dt); cb.y = cb.fall; if (cb.fall >= 548) { cb.fall = undefined; cb.y = 548; } }
      for (const cl of clouds) { cl.x += cl.v * dt; if (cl.x > W + 120) cl.x = -120; }
      if (cabbages.every((c) => c.gone)) gameOver('Вороны унесли всю капусту');
    }

    function crowShape(ctx, c) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(Math.sign(c.vx) || 1, 1);
      const f = Math.sin(c.flap) * 14;
      ctx.fillStyle = c.hp > 1 ? '#3d2c52' : '#23232e';
      ctx.beginPath(); ctx.ellipse(0, 0, 24, 13, 0, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-6, -4); ctx.quadraticCurveTo(-10, -30 - f, -34, -18 - f); ctx.quadraticCurveTo(-18, -8, -6, 4); ctx.fill();
      ctx.beginPath(); ctx.arc(20, -8, 10, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-38, -6); ctx.lineTo(-38, 8); ctx.fill();
      ctx.fillStyle = '#f4a261'; ctx.beginPath(); ctx.moveTo(28, -10); ctx.lineTo(42, -6); ctx.lineTo(28, -3); ctx.fill();
      ctx.fillStyle = '#fff'; circle(ctx, 22, -11, 3.5, '#fff'); circle(ctx, 23, -11, 1.8, '#111');
      ctx.restore();
    }
    function cabbage(ctx, x, y) {
      circle(ctx, x, y, 26, '#6a994e'); circle(ctx, x - 10, y - 4, 16, '#a7c957'); circle(ctx, x + 9, y - 6, 15, '#8fbf4d');
      circle(ctx, x, y - 10, 11, '#c9e4a6');
    }
    function draw(ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#8ecae6'); sky.addColorStop(0.7, '#f1f7d8'); sky.addColorStop(1, '#f6e7b4');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      circle(ctx, 830, 90, 46, '#ffe066'); circle(ctx, 830, 90, 36, '#fff3b0');
      for (const cl of clouds) { ctx.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 4; i++) circle(ctx, cl.x + i * 26 * cl.s, cl.y + (i % 2) * 8, 24 * cl.s, 'rgba(255,255,255,.92)'); }
      ctx.fillStyle = '#a3c585'; ctx.beginPath(); ctx.moveTo(0, 430); ctx.quadraticCurveTo(240, 340, 480, 420); ctx.quadraticCurveTo(720, 350, W, 410); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      ctx.fillStyle = '#7fa65a'; ctx.beginPath(); ctx.moveTo(0, 480); ctx.quadraticCurveTo(300, 430, 620, 470); ctx.quadraticCurveTo(820, 490, W, 460); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
      ctx.fillStyle = '#7a5230'; ctx.fillRect(0, 560, W, 40);
      ctx.fillStyle = '#5e3d22'; for (let x = 0; x < W; x += 34) ctx.fillRect(x, 566 + (x % 3) * 3, 18, 4);
      for (const cb of cabbages) if (!cb.gone && !cb.taken) cabbage(ctx, cb.x, cb.y);
      // пугало-пушка
      ctx.fillStyle = '#6b4226'; ctx.fillRect(GX - 6, GY - 70, 12, 110);
      ctx.save(); ctx.translate(GX, GY - 60); ctx.rotate(aim);
      ctx.fillStyle = '#9c6644'; ctx.fillRect(0, -9, 70, 18); ctx.fillStyle = '#e63946'; circle(ctx, 70, 0, 10, '#e63946');
      ctx.restore();
      ctx.fillStyle = '#e9c46a'; ctx.beginPath(); ctx.moveTo(GX - 50, GY - 50); ctx.lineTo(GX + 50, GY - 50); ctx.lineTo(GX + 30, GY - 10); ctx.lineTo(GX - 30, GY - 10); ctx.fill();
      circle(ctx, GX, GY - 90, 24, '#f2d49b');
      ctx.fillStyle = '#bc6c25'; ctx.beginPath(); ctx.moveTo(GX - 40, GY - 100); ctx.lineTo(GX + 40, GY - 100); ctx.lineTo(GX, GY - 140); ctx.fill();
      circle(ctx, GX - 8, GY - 92, 3, '#111'); circle(ctx, GX + 8, GY - 92, 3, '#111');
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(GX, GY - 84, 8, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.setLineDash([4, 10]); ctx.strokeStyle = 'rgba(80,40,20,.35)'; ctx.lineWidth = 3; ctx.beginPath();
      let px = GX + Math.cos(aim) * 60, py = GY - 60 + Math.sin(aim) * 60, vx = Math.cos(aim) * 900, vy = Math.sin(aim) * 900;
      ctx.moveTo(px, py);
      for (let i = 0; i < 12; i++) { vy += 400 * 0.05; px += vx * 0.05; py += vy * 0.05; ctx.lineTo(px, py); }
      ctx.stroke(); ctx.setLineDash([]);
      for (const t of tomatoes) { circle(ctx, t.x, t.y, t.r, '#e63946'); circle(ctx, t.x - 3, t.y - 4, 3, '#ffb3b8'); }
      for (const c of crows) { if (c.carry) cabbage(ctx, c.carry.x, c.carry.y); crowShape(ctx, c); }
      const left = cabbages.filter((c) => !c.gone).length;
      text(ctx, 'капусты: ' + left, W / 2, 36, 22, '#3a5a40');
    }
  }

  /* ------------------------------------------------------------------ */
  function GAME_CLOUD_FROG() {
    // title: Лягушка в облаках
    // controls: ← → — лететь в сторону, прыжки сами
    let frog, clouds, stars, camY, top, bgStars;

    function init() {
      frog = { x: W / 2, y: 470, vx: 0, vy: -700, face: 1, squash: 0 };
      clouds = []; stars = []; camY = 0; top = 540;
      for (let i = 0; i < 12; i++) addCloud(i === 0 ? W / 2 : null);
      bgStars = [];
      for (let i = 0; i < 90; i++) bgStars.push({ x: rand(0, W), y: rand(0, H), s: rand(1, 2.5), p: rand(0, 6) });
    }
    function addCloud(x) {
      const kind = top < -1500 && Math.random() < 0.22 ? 'storm' : top < -600 && Math.random() < 0.3 ? 'move' : 'soft';
      clouds.push({ x: x ?? rand(90, W - 90), y: top, w: rand(90, 140), kind, vx: kind === 'move' ? pick([-1, 1]) * rand(60, 120) : 0, hit: 0 });
      if (Math.random() < 0.35) stars.push({ x: rand(60, W - 60), y: top - rand(60, 120), ph: rand(0, 6) });
      top -= rand(95, 135);
    }
    function update(dt) {
      let dx = input.dx;
      if (pointer.down) dx = clamp((pointer.x - frog.x) / 80, -1, 1);
      if (autoplay) {
        // на подъёме — к облаку выше, на падении — к ближайшему облаку снизу
        let best = null, bd = 1e9;
        for (const c of clouds) {
          if (c.kind === 'storm' || c.hit) continue;
          const up = frog.y - c.y, far = Math.abs(c.x - frog.x);
          const d = frog.vy < 0 ? (up > 40 && up < 230 ? far - up * 0.4 : 1e9) : (c.y > frog.y - 8 && c.y < frog.y + 420 ? far + (c.y - frog.y) * 0.25 : 1e9);
          if (d < bd) { bd = d; best = c; }
        }
        dx = best ? clamp((best.x - frog.x) / 40, -1, 1) : 0;
      }
      frog.vx = lerp(frog.vx, dx * 420, 1 - Math.pow(0.002, dt));
      if (dx) frog.face = Math.sign(dx);
      frog.vy += 1250 * dt;
      frog.x += frog.vx * dt; frog.y += frog.vy * dt;
      if (frog.x < -30) frog.x = W + 30; if (frog.x > W + 30) frog.x = -30;
      frog.squash *= Math.pow(0.01, dt);
      for (let i = clouds.length - 1; i >= 0; i--) {
        const c = clouds[i];
        c.x += c.vx * dt; if (c.x < 70 || c.x > W - 70) c.vx *= -1;
        if (c.hit) { c.hit += dt; if (c.hit > 0.5) { clouds.splice(i, 1); continue; } }
        if (frog.vy > 0 && Math.abs(frog.x - c.x) < c.w / 2 + 10 && frog.y > c.y - 18 && frog.y < c.y + 10 && !c.hit) {
          frog.vy = c.kind === 'storm' ? -500 : -760; frog.squash = 0.35; frog.y = c.y - 18;
          sound('jump');
          if (c.kind === 'storm') { c.hit = 0.001; sound('boom'); shake(8); burst(c.x, c.y, '#6c757d', 20); }
          else burst(c.x, c.y + 8, '#ffffff', 6);
        }
        if (c.y - camY > H + 80) clouds.splice(i, 1);
      }
      while (clouds.length < 14) addCloud(null);
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i]; s.ph += dt * 3;
        if (dist(frog.x, frog.y - 20, s.x, s.y) < 34) { stars.splice(i, 1); score += 25; sound('coin'); burst(s.x, s.y, '#ffd166', 14); floatText(s.x, s.y - 20, '+25', '#ffd166'); }
        else if (s.y - camY > H + 60) stars.splice(i, 1);
      }
      const want = frog.y - H * 0.55;
      if (want < camY) { const gain = Math.floor((camY - want) / 10); if (gain > 0) score += gain; camY = want; }
      if (frog.y - camY > H + 60) { sound('lose'); gameOver('Лягушка упала на землю'); }
    }
    function draw(ctx) {
      const h = clamp(-camY / 6000, 0, 1);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, h < 0.5 ? '#5aa9e6' : '#1b1f4b'); sky.addColorStop(1, h < 0.35 ? '#ffe5b4' : h < 0.7 ? '#f28482' : '#3d2b56');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      if (h > 0.3) for (const s of bgStars) { ctx.globalAlpha = (h - 0.3) * (0.6 + 0.4 * Math.sin(T * 2 + s.p)); ctx.fillStyle = '#fff'; ctx.fillRect(s.x, (s.y - camY * 0.05) % H, s.s, s.s); }
      ctx.globalAlpha = 1;
      circle(ctx, 780, 140 - camY * 0.02, 60, h < 0.5 ? 'rgba(255,240,200,.8)' : 'rgba(230,230,255,.85)');
      ctx.save(); ctx.translate(0, -camY);
      if (camY > -400) { ctx.fillStyle = '#7fb069'; ctx.fillRect(0, 560, W, 400); ctx.fillStyle = '#5c8d4e'; for (let x = 0; x < W; x += 60) circle(ctx, x + 30, 562, 34, '#5c8d4e'); }
      for (const c of clouds) {
        const a = c.hit ? 1 - c.hit * 2 : 1;
        ctx.globalAlpha = Math.max(0, a);
        const col = c.kind === 'storm' ? '#8d99ae' : c.kind === 'move' ? '#ffe8f0' : '#ffffff';
        ctx.fillStyle = 'rgba(40,40,80,.12)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 16, c.w / 2, 8, 0, 0, 6.3); ctx.fill();
        for (let i = -2; i <= 2; i++) circle(ctx, c.x + i * c.w / 5.5, c.y - (2 - Math.abs(i)) * 7, c.w / 5 + (2 - Math.abs(i)) * 3, col);
        if (c.kind === 'storm') { ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(c.x - 6, c.y + 8); ctx.lineTo(c.x + 4, c.y + 22); ctx.lineTo(c.x - 4, c.y + 24); ctx.lineTo(c.x + 6, c.y + 40); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      for (const s of stars) {
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.ph * 0.4);
        ctx.fillStyle = '#ffd166'; ctx.beginPath();
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 16, a = i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        ctx.fill(); ctx.restore();
      }
      ctx.save(); ctx.translate(frog.x, frog.y); ctx.scale(frog.face * (1 + frog.squash * 0.5), 1 - frog.squash);
      const up = frog.vy < 0;
      ctx.fillStyle = '#4c956c';
      ctx.beginPath(); ctx.ellipse(-14, up ? 6 : -2, 8, up ? 16 : 8, up ? 0.4 : 0, 0, 6.3); ctx.ellipse(14, up ? 6 : -2, 8, up ? 16 : 8, up ? -0.4 : 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#6ab04c'; ctx.beginPath(); ctx.ellipse(0, -18, 24, 20, 0, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#c7e8a7'; ctx.beginPath(); ctx.ellipse(0, -12, 14, 11, 0, 0, 6.3); ctx.fill();
      circle(ctx, -10, -38, 9, '#6ab04c'); circle(ctx, 10, -38, 9, '#6ab04c');
      circle(ctx, -10, -39, 6, '#fff'); circle(ctx, 10, -39, 6, '#fff');
      circle(ctx, -8, -39, 3, '#111'); circle(ctx, 12, -39, 3, '#111');
      ctx.strokeStyle = '#2d6a4f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(2, -26, 9, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.restore();
      ctx.restore();
      text(ctx, Math.floor(-camY / 10) + ' м', W - 70, H - 30, 20, 'rgba(255,255,255,.85)');
    }
  }

  // ---------- извлечение исходника из тела функции ----------
  function bodyOf(fn) {
    const s = fn.toString();
    const body = s.slice(s.indexOf('{') + 1, s.lastIndexOf('}'));
    const lines = body.replace(/^\n/, '').split('\n');
    const pad = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    return lines.map((l) => l.slice(pad)).join('\n').replace(/\s+$/, '') + '\n';
  }

  const list = [
    { id: 'cat', fn: GAME_CAT, phrase: 'кот ловит падающую рыбу, а собаки мешают', words: /кот|кошк|рыб|собак|пёс|пес|лов/i, bg: '#1d2b4a', ink: '#fff3df' },
    { id: 'snake', fn: GAME_ICE_SNAKE, phrase: 'змейка, но на льду', words: /зме|лёд|лед|скольз|каток|зим/i, bg: '#b4dbea', ink: '#12324a' },
    { id: 'garden', fn: GAME_GARDEN, phrase: 'пугало кидается помидорами в ворон, которые воруют капусту', words: /ворон|птиц|огород|капуст|помидор|пугал|стрел|пушк|защит/i, bg: '#8ecae6', ink: '#10304a' },
    { id: 'frog', fn: GAME_CLOUD_FROG, phrase: 'лягушка прыгает по облакам всё выше и выше', words: /лягуш|прыг|облак|небо|выше|жаб/i, bg: '#5aa9e6', ink: '#0c2338' },
  ];
  const demos = list.map((d) => {
    const code = bodyOf(d.fn);
    const title = (code.match(/^\/\/\s*title:\s*(.+)$/m) || [])[1] || d.id;
    const controls = (code.match(/^\/\/\s*controls:\s*(.+)$/m) || [])[1] || '';
    return { id: d.id, phrase: d.phrase, words: d.words, bg: d.bg, ink: d.ink, code, title: title.trim(), controls: controls.trim() };
  });

  // «Поломка» для показа самопочинки в демо-режиме и на обложке:
  // заготовка кота с настоящей ошибкой — движок её действительно ловит.
  const cat = demos[0];
  const brokenCat = cat.code.replace('const d = dogs[i];', 'const d = dogs[i + 1];');

  root.SWG = root.SWG || {};
  root.SWG.demos = { list: demos, brokenCat, pickFor(phrase) {
    const p = String(phrase || '');
    return demos.find((d) => d.words.test(p)) || null;
  } };
})(typeof window !== 'undefined' ? window : globalThis);
