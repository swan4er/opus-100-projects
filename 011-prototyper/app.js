/* Прототипатор — узловой редактор анимаций интерфейса (по мотивам Origami Studio).
   Граф потоков данных считается каждый кадр в топологическом порядке; рёбра, замыкающие цикл,
   читают значение источника с прошлого кадра — так работают обратные связи (перетаскивание ↔ пружина). */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const el = {
    editor: $('#editor'), world: $('#world'), wires: $('#wires'), nodes: $('#nodes'), palette: $('#palette'),
    presets: $('#presets'), add: $('#add-btn'), reset: $('#reset-btn'), screen: $('#screen'), phone: $('#phone'),
    ghost: $('#ghost'), cap: $('#viewer-cap'), stats: $('#stats'), hintRow: $('#hint-row'),
  };
  const fmt = (v) => {
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    const a = Math.abs(v);
    const d = a >= 100 ? 0 : a >= 10 ? 1 : 2;
    return v.toFixed(d).replace('.', ',').replace('-', '−');
  };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // =================================================================================
  // Типы патчей
  // =================================================================================
  const CATS = {
    interaction: 'Взаимодействие', logic: 'Логика', animation: 'Анимация', math: 'Математика', layer: 'Слои',
  };
  const PROP_LABEL = { scale: 'Масштаб', opacity: 'Прозрачность', x: 'Сдвиг X', y: 'Сдвиг Y', rotate: 'Поворот', mix: 'Смесь цвета', value: 'Число' };
  const PROP_DEF = { scale: 1, opacity: 1, x: 0, y: 0, rotate: 0, mix: 0, value: 0 };

  const TYPES = {
    tap: {
      cat: 'interaction', title: 'Нажатие', desc: 'касание слоя: «зажато» и одиночный щелчок',
      params: [{ k: 'layer', kind: 'layer', label: 'Слой', filter: 'tap' }],
      inputs: () => [],
      outputs: [{ k: 'down', label: 'Зажато' }, { k: 'tap', label: 'Щелчок' }],
      eval(n, I, dt, env) { const s = env.touch(n.p.layer); return { down: s.down ? 1 : 0, tap: s.pulse ? 1 : 0 }; },
    },
    drag: {
      cat: 'interaction', title: 'Перетаскивание', desc: 'позиция пальца поверх начальной',
      params: [{ k: 'layer', kind: 'layer', label: 'Слой', filter: 'drag' }, { k: 'axis', kind: 'axis', label: 'Ось' }],
      inputs: () => [{ k: 'base', label: 'Начало', def: 0 }],
      outputs: [{ k: 'pos', label: 'Позиция' }, { k: 'velocity', label: 'Скорость' }, { k: 'down', label: 'Зажато' }],
      eval(n, I, dt, env) {
        const t = env.touch(n.p.layer);
        const s = n.s;
        if (t.down && !s.down) s.start = I.base;
        s.down = t.down;
        const d = n.p.axis === 'x' ? t.dx : t.dy;
        const v = n.p.axis === 'x' ? t.vx : t.vy;
        return { pos: t.down ? s.start + d : I.base, velocity: v, down: t.down ? 1 : 0 };
      },
    },
    switch: {
      cat: 'logic', title: 'Переключатель', desc: 'каждый щелчок меняет 0 ↔ 1',
      params: [],
      inputs: () => [{ k: 'flip', label: 'Щелчок', def: 0 }],
      outputs: [{ k: 'on', label: 'Включено' }],
      eval(n, I) {
        const s = n.s;
        if (s.on === undefined) { s.on = 0; s.prev = 0; }
        if (I.flip > 0.5 && s.prev <= 0.5) s.on = 1 - s.on;
        s.prev = I.flip;
        return { on: s.on };
      },
    },
    counter: {
      cat: 'logic', title: 'Счётчик', desc: 'плюс один на каждый щелчок',
      params: [{ k: 'start', kind: 'num', label: 'Начало', step: 1 }],
      inputs: () => [{ k: 'inc', label: 'Плюс один', def: 0 }],
      outputs: [{ k: 'count', label: 'Число' }],
      eval(n, I) {
        const s = n.s;
        if (s.c === undefined) { s.c = n.p.start; s.prev = 0; }
        if (I.inc > 0.5 && s.prev <= 0.5) s.c += 1;
        s.prev = I.inc;
        return { count: s.c };
      },
    },
    option: {
      cat: 'logic', title: 'Выбор', desc: 'одно из двух чисел по условию',
      params: [{ k: 'a', kind: 'num', label: 'Если нет', step: 1 }, { k: 'b', kind: 'num', label: 'Если да', step: 1 }],
      inputs: () => [{ k: 'cond', label: 'Условие', def: 0 }],
      outputs: [{ k: 'value', label: 'Значение' }],
      eval(n, I) { return { value: I.cond > 0.5 ? n.p.b : n.p.a }; },
    },
    snap: {
      cat: 'logic', title: 'Притяжение', desc: 'после броска выбирает ближайшую точку',
      params: [{ k: 'a', kind: 'num', label: 'Точка А', step: 2 }, { k: 'b', kind: 'num', label: 'Точка Б', step: 2 }, { k: 'c', kind: 'num', label: 'Точка В', step: 2, optional: true }, { k: 'flick', kind: 'num', label: 'Бросок, с', step: 0.01 }],
      inputs: () => [{ k: 'value', label: 'Значение', def: 0 }, { k: 'velocity', label: 'Скорость', def: 0 }, { k: 'down', label: 'Зажато', def: 0 }],
      outputs: [{ k: 'target', label: 'Цель' }],
      eval(n, I) {
        const s = n.s;
        const down = I.down > 0.5;
        if (s.target === undefined) s.target = n.p.a;
        if (down) { s.target = I.value; s.was = true; }
        else if (s.was) {
          s.was = false;
          const proj = I.value + I.velocity * n.p.flick;
          const stops = [n.p.a, n.p.b, n.p.c].filter((v) => typeof v === 'number' && isFinite(v));
          s.target = stops.reduce((best, v) => (Math.abs(v - proj) < Math.abs(best - proj) ? v : best), stops[0]);
        }
        return { target: s.target };
      },
    },
    spring: {
      cat: 'animation', title: 'Пружина', desc: 'догоняет цель с упругостью и трением',
      params: [{ k: 'tension', kind: 'num', label: 'Упругость', step: 2, min: 1 }, { k: 'friction', kind: 'num', label: 'Трение', step: 0.2, min: 0 }],
      inputs: () => [{ k: 'target', label: 'Цель', def: 0 }],
      outputs: [{ k: 'value', label: 'Значение' }],
      eval(n, I, dt) {
        const s = n.s;
        if (s.x === undefined) { s.x = I.target; s.v = 0; }
        const k = n.p.tension, c = n.p.friction;
        const steps = Math.max(1, Math.ceil(dt / 0.004));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          const a = k * (I.target - s.x) - c * s.v;
          s.v += a * h;
          s.x += s.v * h;
        }
        return { value: s.x };
      },
    },
    transition: {
      cat: 'animation', title: 'Переход', desc: 'прогресс 0…1 → диапазон значений',
      params: [{ k: 'from', kind: 'num', label: 'От', step: 0.01 }, { k: 'to', kind: 'num', label: 'До', step: 0.01 }],
      inputs: () => [{ k: 'progress', label: 'Прогресс', def: 0 }],
      outputs: [{ k: 'value', label: 'Значение' }],
      eval(n, I) { return { value: n.p.from + (n.p.to - n.p.from) * I.progress }; },
    },
    map: {
      cat: 'math', title: 'Шкала', desc: 'переводит диапазон в диапазон',
      params: [{ k: 'inMin', kind: 'num', label: 'Вход от', step: 1 }, { k: 'inMax', kind: 'num', label: 'Вход до', step: 1 },
        { k: 'outMin', kind: 'num', label: 'Выход от', step: 0.01 }, { k: 'outMax', kind: 'num', label: 'Выход до', step: 0.01 }],
      inputs: () => [{ k: 'value', label: 'Значение', def: 0 }],
      outputs: [{ k: 'value', label: 'Результат' }],
      eval(n, I) {
        const span = n.p.inMax - n.p.inMin || 1;
        const t = clamp((I.value - n.p.inMin) / span, 0, 1);
        return { value: n.p.outMin + t * (n.p.outMax - n.p.outMin) };
      },
    },
    mul: {
      cat: 'math', title: 'Умножить', desc: 'A × B',
      params: [{ k: 'b', kind: 'num', label: 'B, если пусто', step: 0.01 }],
      inputs: () => [{ k: 'a', label: 'A', def: 0 }, { k: 'b', label: 'B', def: null }],
      outputs: [{ k: 'value', label: 'Произведение' }],
      eval(n, I) { return { value: I.a * (I._b ? I.b : n.p.b) }; },
    },
    layer: {
      cat: 'layer', title: 'Слой', desc: 'свойства слоя на экране телефона',
      params: [{ k: 'layer', kind: 'layer', label: 'Слой' }],
      inputs: (n, env) => (env.layerProps(n.p.layer)).map((k) => ({ k, label: PROP_LABEL[k], def: PROP_DEF[k] })),
      outputs: [],
      eval(n, I, dt, env) {
        for (const k of env.layerProps(n.p.layer)) if (I['_' + k]) env.setProp(n.p.layer, k, I[k]);
        return {};
      },
    },
  };
  const PARAM_DEFAULTS = {
    tap: { layer: '' }, drag: { layer: '', axis: 'y' }, switch: {}, counter: { start: 0 }, option: { a: 0, b: 1 },
    snap: { a: 0, b: 300, c: NaN, flick: 0.18 }, spring: { tension: 320, friction: 22 }, transition: { from: 0, to: 1 },
    map: { inMin: 0, inMax: 100, outMin: 0, outMax: 1 }, mul: { b: 1 }, layer: { layer: '' },
  };

  // =================================================================================
  // Экраны телефона (слои)
  // =================================================================================
  const HEART = 'M12 21s-7.5-4.6-9.6-9.3C.9 8.3 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.8 4.3 7.2C19.5 16.4 12 21 12 21z';
  const statusBar = (dark) => `
    <div class="st"${dark ? ' style="color:#fff"' : ''}><b>9:41</b><span class="st-i">
      <svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="7" width="3" height="5" rx="1" fill="currentColor"/><rect x="5" y="5" width="3" height="7" rx="1" fill="currentColor"/><rect x="10" y="2.5" width="3" height="9.5" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor"/></svg>
      <svg viewBox="0 0 26 12" width="24" height="12"><rect x=".5" y=".5" width="21" height="11" rx="3" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor"/><rect x="23" y="4" width="2" height="4" rx="1" fill="currentColor" opacity=".45"/></svg>
    </span></div>`;

  const SCREEN_CSS = `
  .scr { position: absolute; inset: 0; font-family: 'Golos Text', system-ui, sans-serif; color: #15161a; overflow: hidden; }
  .st { position: absolute; left: 0; right: 0; top: 0; height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 6px 30px 0 34px; font-size: 15px; z-index: 3; }
  .st-i { display: flex; gap: 6px; align-items: center; }
  .tb { position: absolute; left: 0; right: 0; top: 52px; padding: 0 20px; font-size: 24px; font-weight: 600; letter-spacing: -.01em; }
  /* лайк */
  .like { background: #fbfaf7; }
  .post { position: absolute; left: 0; right: 0; top: 96px; }
  .ph { display: flex; align-items: center; gap: 10px; padding: 8px 16px; }
  .ava { width: 34px; height: 34px; border-radius: 50%; background: conic-gradient(from 200deg, #ff9f43, #ff3b6b, #a58bff, #ff9f43); padding: 2px; }
  .ava i { display: block; width: 100%; height: 100%; border-radius: 50%; background: radial-gradient(circle at 40% 35%, #f5d7bf, #c98b62); border: 2px solid #fbfaf7; }
  .ph b { display: block; font-size: 14px; } .ph small { font-size: 12px; color: #6b6e76; }
  .photo { position: relative; height: 0; padding-bottom: 100%; overflow: hidden; background: linear-gradient(180deg, #ffd9a8 0%, #ffb58a 30%, #9fc6d9 60%, #2e7d8c 100%); }
  .photo .m1 { position: absolute; inset: 0; background: #3f5f62; clip-path: polygon(0 58%, 14% 44%, 26% 52%, 40% 36%, 55% 50%, 68% 40%, 82% 52%, 100% 44%, 100% 100%, 0 100%); }
  .photo .m2 { position: absolute; inset: 0; background: #294447; clip-path: polygon(0 66%, 18% 58%, 35% 64%, 50% 55%, 66% 62%, 84% 57%, 100% 63%, 100% 100%, 0 100%); }
  .photo .lake { position: absolute; left: 0; right: 0; bottom: 0; height: 30%; background: linear-gradient(180deg, #57c2c9, #1e8d95 60%, #0f5f6a); }
  .photo .sun { position: absolute; left: 62%; top: 22%; width: 18%; aspect-ratio: 1; border-radius: 50%; background: radial-gradient(circle, #fff6df, #ffd28a 60%, rgba(255,210,138,0)); }
  .acts { position: relative; display: flex; align-items: center; gap: 16px; height: 50px; padding: 0 16px; }
  .hwrap { position: relative; width: 30px; height: 30px; }
  .hwrap .lyr { left: 0; top: 0; width: 30px; height: 30px; }
  .hwrap svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .ico { width: 26px; height: 26px; color: #15161a; }
  .likes { padding: 0 16px; font-size: 14px; } .likes b { font-variant-numeric: tabular-nums; }
  .capt { padding: 4px 16px 0; margin: 0; font-size: 14px; line-height: 1.4; color: #2a2c32; }
  .burst { position: absolute; left: 15px; top: 15px; width: 6px; height: 6px; margin: -3px; border-radius: 50%; background: #ff3b6b; pointer-events: none; animation: burst .6s cubic-bezier(.2,.7,.2,1) forwards; }
  @keyframes burst { from { transform: translate(0,0) scale(1); opacity: 1; } to { transform: translate(var(--dx), var(--dy)) scale(.3); opacity: 0; } }
  /* шторка */
  .sheet-scr { background: #e8e4dc; }
  .map { position: absolute; inset: 0; background:
      linear-gradient(115deg, transparent 47%, #fff 47%, #fff 49.5%, transparent 49.5%),
      linear-gradient(25deg, transparent 58%, #fff 58%, #fff 60%, transparent 60%),
      linear-gradient(90deg, transparent 30%, #f6f3ee 30%, #f6f3ee 31.5%, transparent 31.5%),
      linear-gradient(0deg, transparent 64%, #f6f3ee 64%, #f6f3ee 65.5%, transparent 65.5%),
      radial-gradient(ellipse 40% 22% at 78% 22%, #c7dcb4 0 98%, transparent 100%),
      linear-gradient(160deg, transparent 70%, #a9d0e3 70%, #a9d0e3 80%, transparent 80%),
      repeating-linear-gradient(0deg, #e8e4dc 0 26px, #efebe4 26px 27px),
      repeating-linear-gradient(90deg, transparent 0 26px, #efebe4 26px 27px); }
  .pin { position: absolute; left: 52%; top: 34%; width: 34px; height: 34px; margin: -34px 0 0 -17px; }
  .pin::before { content: ''; position: absolute; inset: 0; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: #ff4d3d; box-shadow: 0 4px 10px rgba(0,0,0,.25); }
  .pin::after { content: ''; position: absolute; left: 12px; top: 10px; width: 10px; height: 10px; border-radius: 50%; background: #fff; }
  .pulse { position: absolute; left: 52%; top: 34%; width: 16px; height: 16px; margin: -8px; border-radius: 50%; background: rgba(255,77,61,.35); animation: pls 1.8s ease-out infinite; }
  @keyframes pls { to { transform: scale(4); opacity: 0; } }
  .dim { inset: 0; background: #0b0c0f; opacity: 0; pointer-events: none; }
  .sheet { left: 0; right: 0; top: 0; height: 100%; background: #fff; border-radius: 22px 22px 0 0; box-shadow: 0 -8px 30px rgba(0,0,0,.18); padding: 12px 20px; }
  .handle { display: block; width: 40px; height: 5px; margin: 0 auto 14px; border-radius: 3px; background: #d4d4d8; }
  .sheet h3 { margin: 0; font-size: 22px; letter-spacing: -.01em; }
  .sheet .meta { margin: 4px 0 12px; font-size: 13.5px; color: #6b6e76; }
  .chips { display: flex; gap: 8px; margin-bottom: 16px; }
  .chips span { padding: 8px 12px; border-radius: 999px; background: #f1f1f4; font-size: 13px; font-weight: 500; }
  .chips span:first-child { background: #15161a; color: #fff; }
  .item { display: flex; justify-content: space-between; padding: 12px 0; border-top: 1px solid #efeff2; font-size: 14.5px; }
  .item span:last-child { color: #6b6e76; font-variant-numeric: tabular-nums; }
  /* карточки */
  .cards-scr { background: #f4f1ec; }
  .deck { position: absolute; left: 18px; right: 18px; top: 100px; bottom: 120px; }
  .card { position: absolute; inset: 0; border-radius: 22px; overflow: hidden; box-shadow: 0 16px 40px rgba(20,20,30,.22); background: #ddd; }
  .card.b1 { transform: translateY(12px) scale(.95); opacity: .9; }
  .card.b2 { transform: translateY(24px) scale(.9); opacity: .7; }
  .card .art { position: absolute; inset: 0; }
  .card .shade { position: absolute; left: 0; right: 0; bottom: 0; height: 45%; background: linear-gradient(180deg, transparent, rgba(0,0,0,.65)); }
  .card .ttl { position: absolute; left: 18px; right: 18px; bottom: 18px; color: #fff; }
  .card .ttl b { display: block; font-size: 28px; letter-spacing: -.01em; }
  .card .ttl span { font-size: 14px; opacity: .92; }
  .stamp { position: absolute; top: 26px; padding: 6px 12px; border: 3px solid; border-radius: 8px; font-size: 22px; font-weight: 600; letter-spacing: .06em; opacity: 0; }
  .stamp.yes { left: 20px; color: #37d67a; border-color: #37d67a; transform: rotate(-14deg); }
  .stamp.no { right: 20px; color: #ff4d5e; border-color: #ff4d5e; transform: rotate(14deg); }
  .cbtns { position: absolute; left: 0; right: 0; bottom: 40px; display: flex; justify-content: center; gap: 26px; }
  .cbtns i { width: 58px; height: 58px; border-radius: 50%; background: #fff; box-shadow: 0 8px 20px rgba(0,0,0,.12); display: grid; place-items: center; }
  /* настройки */
  .set-scr { background: #f2f2f7; }
  .grp { position: absolute; left: 16px; right: 16px; border-radius: 14px; background: #fff; overflow: hidden; }
  .rowx { display: flex; align-items: center; gap: 12px; height: 52px; padding: 0 14px; font-size: 15.5px; border-bottom: 1px solid rgba(128,128,140,.18); }
  .rowx:last-child { border-bottom: 0; }
  .rowx .ic { width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; color: #fff; flex: none; }
  .rowx .rt { margin-left: auto; color: #8a8a92; font-size: 15px; }
  .tg { position: relative; margin-left: auto; width: 51px; height: 31px; border-radius: 16px; background: #d9d9de; flex: none; }
  .tg .kn { position: absolute; left: 2px; top: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0,0,0,.2); }
  .tg.static { background: #34c759; } .tg.static .kn { left: 22px; }
  `;

  const DEST = [
    ['Байкал', 'Самое глубокое озеро планеты', ['#bfe3ff', '#6fb3e6', '#2b6fa8', '#0f3a63']],
    ['Камчатка', 'Вулканы и Долина гейзеров', ['#ffd0a6', '#e98a6b', '#6d4d64', '#2b2436']],
    ['Алтай', 'Бирюзовая Катунь и кедры', ['#d6f1e2', '#8fd1b0', '#3a8a6e', '#1d4d3e']],
    ['Карелия', 'Ладога, скалы и шхеры', ['#e7e1ff', '#a9a2e6', '#5d6fb0', '#243a5e']],
    ['Калининград', 'Дюны Куршской косы', ['#fff0c9', '#f2c46e', '#c98e4a', '#6b4a2a']],
  ];
  function destArt(c) {
    return `<div class="art" style="background:linear-gradient(180deg, ${c[0]}, ${c[1]} 45%, ${c[2]} 70%, ${c[3]})">
      <div style="position:absolute;inset:0;background:${c[2]};clip-path:polygon(0 62%,16% 48%,30% 57%,46% 38%,62% 54%,76% 44%,100% 58%,100% 100%,0 100%);opacity:.85"></div>
      <div style="position:absolute;inset:0;background:${c[3]};clip-path:polygon(0 74%,22% 66%,40% 72%,58% 64%,78% 70%,100% 66%,100% 100%,0 100%)"></div>
      <div style="position:absolute;left:66%;top:18%;width:16%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle,#fffbe9,rgba(255,251,233,0) 70%)"></div></div>`;
  }

  const SCREENS = {
    like(root) {
      root.innerHTML = `<div class="scr like">${statusBar()}<div class="tb">Лента</div>
        <div class="post">
          <div class="ph"><span class="ava"><i></i></span><div><b>Мария Соколова</b><small>Карелия, Рускеала</small></div></div>
          <div class="photo"><div class="sun"></div><div class="m1"></div><div class="m2"></div><div class="lake"></div></div>
          <div class="acts">
            <div class="hwrap" id="hwrap">
              <div class="lyr tappable" data-l="heartO"><svg viewBox="0 0 24 24"><path d="${HEART}" fill="none" stroke="#15161a" stroke-width="1.8" stroke-linejoin="round"/></svg></div>
              <div class="lyr" data-l="heartF" style="pointer-events:none"><svg viewBox="0 0 24 24"><path d="${HEART}" fill="#ff3b6b"/></svg></div>
            </div>
            <svg class="ico" viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
            <svg class="ico" viewBox="0 0 24 24"><path d="M21 4L10 14M21 4l-7 17-4-7-7-4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
          </div>
          <div class="likes">Нравится: <b class="lyr" data-l="count" style="position:static">1 204</b></div>
          <p class="capt"><b>Мария</b> Мраморный каньон на рассвете — вода здесь цвета бирюзы.</p>
        </div></div>`;
      return {
        layers: {
          heartO: { name: 'Сердце (контур)', props: ['scale', 'opacity'], tap: true },
          heartF: { name: 'Сердце (заливка)', props: ['scale', 'opacity'], base: { opacity: 0, scale: 0.4 } },
          count: { name: 'Число отметок', props: ['value'], text: true },
        },
        caption: 'Нажмите на сердце',
        hook(vals, env) {
          const f = env.layerState('heartF');
          if (f && f.opacity > 0.5 && !this.lit) { this.lit = true; burst(root.querySelector('#hwrap')); }
          if (f && f.opacity < 0.2) this.lit = false;
        },
        demo: [{ t: 0.6, tap: 'heartO' }, { t: 3.0, tap: 'heartO' }],
        demoLen: 5.2,
      };
    },
    sheet(root) {
      root.innerHTML = `<div class="scr sheet-scr"><div class="map"></div><i class="pulse"></i><i class="pin"></i>${statusBar()}
        <div class="lyr dim" data-l="dim"></div>
        <div class="lyr sheet draggable" data-l="sheet"><i class="handle"></i><h3>Кофейня «Зерно»</h3>
          <p class="meta">4,8 · 312 отзывов · открыто до&nbsp;22:00</p>
          <div class="chips"><span>Маршрут</span><span>Позвонить</span><span>Сохранить</span></div>
          <div class="item"><span>Флэт уайт</span><span>240 ₽</span></div>
          <div class="item"><span>Круассан с&nbsp;миндалём</span><span>210 ₽</span></div>
          <div class="item"><span>Сырники</span><span>320 ₽</span></div>
          <div class="item"><span>Лимонад «Облепиха»</span><span>260 ₽</span></div>
        </div></div>`;
      const H = root.clientHeight;
      return {
        layers: {
          sheet: { name: 'Шторка', props: ['y'], drag: true, base: { y: Math.round(H * 0.64) } },
          dim: { name: 'Затемнение', props: ['opacity'], base: { opacity: 0 } },
        },
        stops: { open: Math.round(H * 0.16), closed: Math.round(H * 0.64) },
        caption: 'Потяните шторку вверх и бросьте',
        demo: [{ t: 0.5, drag: 'sheet', dy: -0.44, dur: 0.55 }, { t: 3.2, drag: 'sheet', dy: 0.3, dur: 0.4 }],
        demoLen: 5.6,
      };
    },
    cards(root) {
      root.innerHTML = `<div class="scr cards-scr">${statusBar()}<div class="tb">Куда поехать?</div>
        <div class="deck"><div class="card b2" id="cb2"></div><div class="card b1" id="cb1"></div>
          <div class="lyr card draggable" data-l="card" id="ctop"></div></div>
        <div class="cbtns"><i><svg viewBox="0 0 24 24" width="24" height="24"><path d="M6 6l12 12M18 6L6 18" stroke="#ff4d5e" stroke-width="2.6" stroke-linecap="round"/></svg></i>
          <i><svg viewBox="0 0 24 24" width="26" height="26"><path d="${HEART}" fill="#37d67a"/></svg></i></div></div>`;
      const W = root.clientWidth;
      let idx = 0;
      const fill = () => {
        const d = (k) => DEST[(idx + k) % DEST.length];
        const top = root.querySelector('#ctop');
        top.innerHTML = destArt(d(0)[2]) + `<div class="shade"></div><div class="ttl"><b>${d(0)[0]}</b><span>${d(0)[1]}</span></div>
          <span class="lyr stamp yes" data-l="yes">ПОЕДУ</span><span class="lyr stamp no" data-l="no">МИМО</span>`;
        root.querySelector('#cb1').innerHTML = destArt(d(1)[2]);
        root.querySelector('#cb2').innerHTML = destArt(d(2)[2]);
      };
      fill();
      return {
        layers: {
          card: { name: 'Карточка', props: ['x', 'rotate'], drag: true },
          yes: { name: 'Штамп «Поеду»', props: ['opacity'], base: { opacity: 0 } },
          no: { name: 'Штамп «Мимо»', props: ['opacity'], base: { opacity: 0 } },
        },
        off: Math.round(W * 1.5),
        caption: 'Смахните карточку вправо или влево',
        hook(vals, env) {
          const c = env.layerState('card');
          if (c && Math.abs(c.x) > this.off * 0.92) {
            idx++;
            fill();
            env.rebindLayers();
            env.resetMotion();
          }
        },
        demo: [{ t: 0.6, drag: 'card', dx: 0.62, dur: 0.45 }, { t: 2.8, drag: 'card', dx: -0.58, dur: 0.45 }],
        demoLen: 5.2,
      };
    },
    toggle(root) {
      root.innerHTML = `<div class="scr set-scr lyr" data-l="bg" style="position:absolute">${statusBar()}
        <div class="tb lyr" data-l="txt" style="position:absolute">Настройки</div>
        <div class="grp lyr" data-l="panel" style="top:110px">
          <div class="rowx"><span class="ic" style="background:#5856d6">${moon()}</span><span class="lyr" data-l="txt2" style="position:static">Тёмная тема</span>
            <span class="tg lyr tappable" data-l="track" style="position:relative"><i class="kn lyr" data-l="knob"></i></span></div>
          <div class="rowx"><span class="ic" style="background:#ff3b30">${bell()}</span><span class="lyr" data-l="txt3" style="position:static">Уведомления</span><span class="tg static"><i class="kn"></i></span></div>
          <div class="rowx"><span class="ic" style="background:#ff9500">${spk()}</span><span class="lyr" data-l="txt4" style="position:static">Звуки</span><span class="rt">Классика</span></div>
        </div>
        <div class="grp lyr" data-l="panel2" style="top:282px">
          <div class="rowx"><span class="ic" style="background:#34c759">${globe()}</span><span class="lyr" data-l="txt5" style="position:static">Язык</span><span class="rt">Русский</span></div>
          <div class="rowx"><span class="ic" style="background:#007aff">${lock()}</span><span class="lyr" data-l="txt6" style="position:static">Конфиденциальность</span><span class="rt">›</span></div>
        </div></div>`;
      root.querySelector('.st').dataset.l = 'txt7';
      return {
        layers: {
          track: { name: 'Переключатель', props: ['mix'], tap: true, mix: ['background', '#d9d9de', '#34c759'] },
          knob: { name: 'Бегунок', props: ['x'] },
          bg: { name: 'Фон экрана', props: ['mix'], mix: ['background', '#f2f2f7', '#0d0e11'] },
          panel: { name: 'Панели', props: ['mix'], mix: ['background', '#ffffff', '#1c1d22'], group: ['panel', 'panel2'] },
          txt: { name: 'Текст', props: ['mix'], mix: ['color', '#15161a', '#f2f2f5'], group: ['txt', 'txt2', 'txt3', 'txt4', 'txt5', 'txt6', 'txt7'] },
        },
        caption: 'Нажмите на переключатель темы',
        demo: [{ t: 0.6, tap: 'track' }, { t: 3.0, tap: 'track' }],
        demoLen: 5.4,
      };
    },
  };
  const svgI = (d) => `<svg viewBox="0 0 24 24" width="17" height="17"><path d="${d}" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const moon = () => svgI('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z');
  const bell = () => svgI('M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 0 0 4 0');
  const spk = () => svgI('M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6');
  const globe = () => svgI('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 12h17M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18');
  const lock = () => svgI('M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3');

  function burst(host) {
    if (!host) return;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const d = document.createElement('i');
      d.className = 'burst';
      d.style.setProperty('--dx', (Math.cos(a) * 26).toFixed(1) + 'px');
      d.style.setProperty('--dy', (Math.sin(a) * 26).toFixed(1) + 'px');
      d.style.background = i % 2 ? '#ff9f43' : '#ff3b6b';
      host.appendChild(d);
      setTimeout(() => d.remove(), 700);
    }
  }

  // =================================================================================
  // Примеры графов
  // =================================================================================
  const PRESETS = {
    like: {
      title: 'Лайк',
      build: () => ({
        nodes: [
          ['tap', 'tap', 20, 150, { layer: 'heartO' }],
          ['sw', 'switch', 262, 40, {}],
          ['spA', 'spring', 504, 20, { tension: 520, friction: 15 }],
          ['LF', 'layer', 746, 40, { layer: 'heartF' }],
          ['spB', 'spring', 262, 230, { tension: 700, friction: 32 }],
          ['trB', 'transition', 504, 230, { from: 1, to: 0.8 }],
          ['LO', 'layer', 746, 240, { layer: 'heartO' }],
          ['opt', 'option', 504, 420, { a: 1204, b: 1205 }],
          ['LC', 'layer', 746, 440, { layer: 'count' }],
        ],
        wires: [
          ['tap.tap', 'sw.flip'], ['sw.on', 'spA.target'], ['spA.value', 'LF.scale'], ['spA.value', 'LF.opacity'],
          ['tap.down', 'spB.target'], ['spB.value', 'trB.progress'], ['trB.value', 'LO.scale'],
          ['sw.on', 'opt.cond'], ['opt.value', 'LC.value'],
        ],
      }),
    },
    sheet: {
      title: 'Шторка',
      build: (scr) => ({
        nodes: [
          ['drag', 'drag', 20, 70, { layer: 'sheet', axis: 'y' }],
          ['snap', 'snap', 256, 40, { a: scr.stops.closed, b: scr.stops.open, c: NaN, flick: 0.2 }],
          ['sp', 'spring', 492, 70, { tension: 260, friction: 24 }],
          ['LS', 'layer', 728, 40, { layer: 'sheet' }],
          ['map', 'map', 728, 190, { inMin: scr.stops.closed, inMax: scr.stops.open, outMin: 0, outMax: 0.45 }],
          ['LD', 'layer', 964, 220, { layer: 'dim' }],
        ],
        wires: [
          ['drag.pos', 'snap.value'], ['drag.velocity', 'snap.velocity'], ['drag.down', 'snap.down'],
          ['snap.target', 'sp.target'], ['sp.value', 'LS.y'], ['sp.value', 'drag.base'], ['sp.value', 'map.value'], ['map.value', 'LD.opacity'],
        ],
      }),
    },
    cards: {
      title: 'Карточки',
      build: (scr) => ({
        nodes: [
          ['drag', 'drag', 20, 60, { layer: 'card', axis: 'x' }],
          ['snap', 'snap', 256, 30, { a: 0, b: scr.off, c: -scr.off, flick: 0.22 }],
          ['sp', 'spring', 492, 60, { tension: 240, friction: 22 }],
          ['LCd', 'layer', 964, 40, { layer: 'card' }],
          ['rot', 'map', 728, 30, { inMin: -200, inMax: 200, outMin: -16, outMax: 16 }],
          ['yes', 'map', 492, 250, { inMin: 20, inMax: 140, outMin: 0, outMax: 1 }],
          ['no', 'map', 492, 450, { inMin: -20, inMax: -140, outMin: 0, outMax: 1 }],
          ['LY', 'layer', 728, 270, { layer: 'yes' }],
          ['LN', 'layer', 728, 470, { layer: 'no' }],
        ],
        wires: [
          ['drag.pos', 'snap.value'], ['drag.velocity', 'snap.velocity'], ['drag.down', 'snap.down'], ['snap.target', 'sp.target'],
          ['sp.value', 'drag.base'], ['sp.value', 'LCd.x'], ['sp.value', 'rot.value'], ['rot.value', 'LCd.rotate'],
          ['sp.value', 'yes.value'], ['sp.value', 'no.value'], ['yes.value', 'LY.opacity'], ['no.value', 'LN.opacity'],
        ],
      }),
    },
    toggle: {
      title: 'Тема',
      build: () => ({
        nodes: [
          ['tap', 'tap', 20, 70, { layer: 'track' }],
          ['sw', 'switch', 262, 60, {}],
          ['sp', 'spring', 504, 60, { tension: 380, friction: 26 }],
          ['tr', 'transition', 746, 20, { from: 0, to: 20 }],
          ['LK', 'layer', 988, 30, { layer: 'knob' }],
          ['LT', 'layer', 746, 190, { layer: 'track' }],
          ['LB', 'layer', 988, 190, { layer: 'bg' }],
          ['LP', 'layer', 746, 320, { layer: 'panel' }],
          ['LX', 'layer', 988, 320, { layer: 'txt' }],
        ],
        wires: [
          ['tap.tap', 'sw.flip'], ['sw.on', 'sp.target'], ['sp.value', 'tr.progress'], ['tr.value', 'LK.x'],
          ['sp.value', 'LT.mix'], ['sp.value', 'LB.mix'], ['sp.value', 'LP.mix'], ['sp.value', 'LX.mix'],
        ],
      }),
    },
  };

  // =================================================================================
  // Состояние графа и окружение
  // =================================================================================
  let nodes = [], wires = [], byId = {}, incoming = {};
  let screen = null, layers = {}, touches = {};
  let presetKey = 'like';
  let nextId = 1;

  const env = {
    touch(name) {
      return touches[name] || (touches[name] = { down: false, pulse: false, dx: 0, dy: 0, vx: 0, vy: 0 });
    },
    layerProps(name) { return layers[name] ? layers[name].props : ['scale', 'opacity', 'x', 'y']; },
    setProp(name, k, v) { const L = layers[name]; if (L) L.cur[k] = v; },
    layerState(name) { const L = layers[name]; return L ? L.cur : null; },
    rebindLayers() { bindLayers(); },
    resetMotion() {
      for (const n of nodes) {
        if (n.type === 'spring') { n.s.x = 0; n.s.v = 0; }
        if (n.type === 'snap') { n.s.target = n.p.a; n.s.was = false; }
      }
    },
  };

  function bindLayers() {
    for (const [name, L] of Object.entries(layers)) {
      const names = L.group || [name];
      L.els = names.flatMap((nm) => Array.from(el.screen.querySelectorAll(`[data-l="${nm}"]`)));
      if (L.tap || L.drag) L.els.forEach((e) => attachTouch(e, name));
    }
  }

  function loadScreen(key) {
    el.screen.innerHTML = '';
    const root = document.createElement('div');
    root.style.cssText = 'position:absolute;inset:0';
    el.screen.appendChild(root);
    screen = SCREENS[key](root);
    layers = {};
    touches = {};
    for (const [name, L] of Object.entries(screen.layers)) {
      layers[name] = Object.assign({ props: [], base: {} }, L);
      layers[name].cur = {};
    }
    bindLayers();
    el.cap.textContent = screen.caption;
  }

  function addNode(type, x, y, p, id) {
    const n = { id: id || 'n' + (nextId++), type, x, y, p: Object.assign({}, PARAM_DEFAULTS[type], p || {}), s: {}, out: {}, inVals: {} };
    nodes.push(n);
    byId[n.id] = n;
    return n;
  }

  function loadPreset(key) {
    presetKey = key;
    loadScreen(key);
    nodes = []; wires = []; byId = {};
    el.nodes.innerHTML = '';
    const g = PRESETS[key].build(screen);
    for (const [id, type, x, y, p] of g.nodes) addNode(type, x, y, p, id);
    for (const [a, b] of g.wires) {
      const [fn, fk] = a.split('.'), [tn, tk] = b.split('.');
      wires.push({ from: { n: fn, k: fk }, to: { n: tn, k: tk } });
    }
    reindex();
    nodes.forEach(renderNode);
    renderWires();
    [...el.presets.children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.k === key)));
    fitView();
    demo.t = 0;
    demo.lastUser = -1e9;
  }

  function reindex() {
    incoming = {};
    for (const w of wires) incoming[w.to.n + '.' + w.to.k] = w;
  }

  // Топологический порядок; ребро, замыкающее цикл, читает прошлый кадр
  function order() {
    const out = [], mark = {};
    const visit = (n) => {
      if (mark[n.id] === 2) return;
      if (mark[n.id] === 1) return;
      mark[n.id] = 1;
      for (const w of wires) if (w.to.n === n.id && byId[w.from.n]) visit(byId[w.from.n]);
      mark[n.id] = 2;
      out.push(n);
    };
    nodes.forEach(visit);
    return out;
  }

  function evaluate(dt) {
    for (const L of Object.values(layers)) L.cur = {};
    for (const n of order()) {
      const T = TYPES[n.type];
      const I = {};
      for (const inp of T.inputs(n, env)) {
        const w = incoming[n.id + '.' + inp.k];
        const src = w && byId[w.from.n];
        if (src && src.out[w.from.k] !== undefined) { I[inp.k] = src.out[w.from.k]; I['_' + inp.k] = true; }
        else I[inp.k] = inp.def ?? 0;
      }
      n.inVals = I;
      const prev = n.out;
      n.out = T.eval(n, I, dt, env) || {};
      n.changed = {};
      for (const k in n.out) n.changed[k] = prev[k] === undefined || Math.abs(n.out[k] - prev[k]) > 1e-3;
    }
    for (const t of Object.values(touches)) t.pulse = false;
    applyLayers();
    if (screen.hook) screen.hook(null, env);
  }

  const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function applyLayers() {
    for (const L of Object.values(layers)) {
      const v = Object.assign({}, PROP_DEF, L.base, L.cur);
      L.cur = v;
      const tf = `translate(${v.x.toFixed(2)}px, ${v.y.toFixed(2)}px) rotate(${v.rotate.toFixed(2)}deg) scale(${v.scale.toFixed(4)})`;
      for (const e of L.els || []) {
        if (L.text) { e.textContent = Math.round(v.value).toLocaleString('ru-RU'); continue; }
        if (L.props.some((p) => p === 'x' || p === 'y' || p === 'scale' || p === 'rotate')) e.style.transform = tf;
        if (L.props.includes('opacity')) e.style.opacity = clamp(v.opacity, 0, 1).toFixed(3);
        if (L.mix) {
          const a = hexRGB(L.mix[1]), b = hexRGB(L.mix[2]), m = clamp(v.mix, 0, 1);
          e.style[L.mix[0]] = `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * m)).join(',')})`;
        }
      }
    }
  }

  // =================================================================================
  // Касания на экране телефона
  // =================================================================================
  function attachTouch(e, name) {
    if (e.dataset.bound === name) return;
    e.dataset.bound = name;
    let sx = 0, sy = 0, lx = 0, ly = 0, lt = 0, t0 = 0, moved = 0;
    e.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      userActed();
      try { e.setPointerCapture(ev.pointerId); } catch (_) { /* не критично */ }
      const s = env.touch(name);
      s.down = true; s.dx = 0; s.dy = 0; s.vx = 0; s.vy = 0;
      sx = lx = ev.clientX; sy = ly = ev.clientY; lt = t0 = performance.now(); moved = 0;
    });
    e.addEventListener('pointermove', (ev) => {
      const s = env.touch(name);
      if (!s.down) return;
      const now = performance.now(), dtm = Math.max(1, now - lt) / 1000;
      s.dx = ev.clientX - sx; s.dy = ev.clientY - sy;
      s.vx += ((ev.clientX - lx) / dtm - s.vx) * 0.4;
      s.vy += ((ev.clientY - ly) / dtm - s.vy) * 0.4;
      moved = Math.max(moved, Math.hypot(s.dx, s.dy));
      lx = ev.clientX; ly = ev.clientY; lt = now;
    });
    const up = () => {
      const s = env.touch(name);
      if (!s.down) return;
      s.down = false;
      if (performance.now() - lt > 80) { s.vx = 0; s.vy = 0; }
      if (moved < 10 && performance.now() - t0 < 450) s.pulse = true;
    };
    e.addEventListener('pointerup', up);
    e.addEventListener('pointercancel', up);
  }

  // =================================================================================
  // Демонстрация: «призрачный палец» работает, пока человек не тронул экран
  // =================================================================================
  const demo = { t: 0, lastUser: -1e9, active: null };
  function userActed() { demo.lastUser = performance.now(); el.ghost.classList.remove('on', 'press'); demo.active = null; }
  function layerCenter(name, grab) {
    const L = layers[name];
    const e = L && L.els && L.els[0];
    if (!e) return [0, 0];
    const r = e.getBoundingClientRect(), p = el.phone.getBoundingClientRect();
    // шторку берём за верхний край, остальное — за середину
    const y = grab && r.height > el.screen.clientHeight * 0.8 ? r.top + 70 : r.top + r.height / 2;
    return [r.left + r.width / 2 - p.left, y - p.top];
  }
  function runDemo(dt) {
    if (performance.now() - demo.lastUser < 9000 || !screen.demo) { el.ghost.classList.remove('on'); return; }
    const prevT = demo.t;
    demo.t = (demo.t + dt) % screen.demoLen;
    if (demo.t < prevT) demo.active = null;
    for (const a of screen.demo) {
      if (prevT <= a.t && demo.t > a.t) demo.active = Object.assign({ start: demo.t }, a, { from: layerCenter(a.tap || a.drag, !!a.drag) });
    }
    const A = demo.active;
    if (!A) { el.ghost.classList.remove('on'); return; }
    const el0 = A.from;
    const k = demo.t - A.start;
    el.ghost.classList.add('on');
    if (A.tap) {
      const s = env.touch(A.tap);
      el.ghost.style.transform = `translate(${el0[0]}px, ${el0[1]}px)`;
      if (k < 0.18) { s.down = true; el.ghost.classList.add('press'); }
      else if (s.down) { s.down = false; s.pulse = true; el.ghost.classList.remove('press'); }
      if (k > 0.9) { demo.active = null; el.ghost.classList.remove('on'); }
    } else {
      const s = env.touch(A.drag);
      const W = el.screen.clientWidth, H = el.screen.clientHeight;
      const tx = (A.dx || 0) * W, ty = (A.dy || 0) * H;
      const u = clamp(k / A.dur, 0, 1);
      const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const de = u < 0.5 ? 4 * u : 4 * (1 - u);
      if (u < 1) {
        s.down = true;
        s.dx = tx * e; s.dy = ty * e;
        s.vx = tx * de / A.dur; s.vy = ty * de / A.dur;
        el.ghost.classList.add('press');
      } else if (s.down) {
        // отпускание — это бросок: скорость как у быстрого жеста, а не нулевая производная сглаживания
        s.vx = tx * 1.4 / A.dur; s.vy = ty * 1.4 / A.dur;
        s.down = false;
        el.ghost.classList.remove('press');
      }
      el.ghost.style.transform = `translate(${el0[0] + tx * e}px, ${el0[1] + ty * e}px)`;
      if (k > A.dur + 0.5) { demo.active = null; el.ghost.classList.remove('on'); }
    }
  }

  // =================================================================================
  // Редактор: узлы
  // =================================================================================
  function paramHTML(n, prm) {
    const v = n.p[prm.k];
    if (prm.kind === 'layer') {
      const opts = Object.entries(layers).filter(([, L]) => !prm.filter || L[prm.filter]).map(([k, L]) => `<option value="${k}"${k === v ? ' selected' : ''}>${L.name}</option>`).join('');
      return `<label class="param"><span class="lab">${prm.label}</span><select data-param="${prm.k}">${opts}</select></label>`;
    }
    if (prm.kind === 'axis') {
      return `<label class="param"><span class="lab">${prm.label}</span><select data-param="axis"><option value="x"${v === 'x' ? ' selected' : ''}>X</option><option value="y"${v === 'y' ? ' selected' : ''}>Y</option></select></label>`;
    }
    const shown = typeof v === 'number' && isFinite(v) ? fmt(v) : '—';
    return `<div class="param"><span class="lab">${prm.label}</span><span class="scrub" tabindex="0" data-param="${prm.k}" data-step="${prm.step || 1}">${shown}</span></div>`;
  }

  function renderNode(n) {
    const T = TYPES[n.type];
    let node = n.el;
    if (!node) {
      node = document.createElement('div');
      n.el = node;
      el.nodes.appendChild(node);
    }
    node.className = 'node cat-' + T.cat;
    node.style.transform = `translate(${n.x}px, ${n.y}px)`;
    node.dataset.id = n.id;
    const sub = n.type === 'layer' || n.type === 'tap' || n.type === 'drag' ? (layers[n.p.layer] ? layers[n.p.layer].name : '') : '';
    const ins = T.inputs(n, env).map((i) => `<div class="row in" data-k="${i.k}"><i class="port" data-dir="in" data-k="${i.k}"></i><span class="lab">${i.label}</span><span class="val" data-iv="${i.k}"></span></div>`).join('');
    const params = T.params.map((prm) => paramHTML(n, prm)).join('');
    const outs = T.outputs.map((o) => `<div class="row out" data-k="${o.k}"><span class="val" data-ov="${o.k}"></span><span class="lab">${o.label}</span><i class="port" data-dir="out" data-k="${o.k}"></i></div>`).join('');
    node.innerHTML = `<div class="n-head"><i class="n-dot"></i><span class="n-title">${T.title}</span><span class="n-sub">${sub}</span>
      <button type="button" class="n-del" aria-label="Удалить патч" title="Удалить"><svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>
      <div class="n-body">${ins}${ins && (params || outs) ? '<div class="sep"></div>' : ''}${params}${params && outs ? '<div class="sep"></div>' : ''}${outs}</div>`;
    n.ports = {};
    node.querySelectorAll('.port').forEach((p) => { n.ports[p.dataset.dir + '.' + p.dataset.k] = p; });
    n.vals = {};
    node.querySelectorAll('[data-iv]').forEach((v) => { n.vals['in.' + v.dataset.iv] = v; });
    node.querySelectorAll('[data-ov]').forEach((v) => { n.vals['out.' + v.dataset.ov] = v; });
    markPorts();
  }

  function portPos(n, dir, k) {
    const p = n.ports && n.ports[dir + '.' + k];
    if (!p) return null;
    const row = p.offsetParent;
    if (!row) return null;
    return [n.x + row.offsetLeft + p.offsetLeft + 6, n.y + row.offsetTop + p.offsetTop + 6];
  }

  // =================================================================================
  // Провода
  // =================================================================================
  const SVGNS = 'http://www.w3.org/2000/svg';
  const catColor = { interaction: '#2ec4b6', logic: '#a58bff', animation: '#ff9f43', math: '#a9aebb', layer: '#4ea8ff' };
  const curve = (a, b) => {
    const dx = Math.max(40, Math.abs(b[0] - a[0]) * 0.5);
    return `M${a[0].toFixed(1)} ${a[1].toFixed(1)} C${(a[0] + dx).toFixed(1)} ${a[1].toFixed(1)}, ${(b[0] - dx).toFixed(1)} ${b[1].toFixed(1)}, ${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  };
  let tempPath = null;
  function renderWires() {
    el.wires.innerHTML = '';
    for (const w of wires) {
      const src = byId[w.from.n];
      const color = src ? catColor[TYPES[src.type].cat] : '#888';
      w.path = document.createElementNS(SVGNS, 'path');
      w.path.setAttribute('class', 'w');
      w.path.setAttribute('stroke', color);
      w.path.setAttribute('stroke-opacity', '.75');
      w.flow = document.createElementNS(SVGNS, 'path');
      w.flow.setAttribute('class', 'flow');
      w.flow.setAttribute('stroke', '#ffffff');
      w.hit = document.createElementNS(SVGNS, 'path');
      w.hit.setAttribute('class', 'hit');
      w.hit.__wire = w;
      el.wires.append(w.path, w.flow, w.hit);
    }
    tempPath = document.createElementNS(SVGNS, 'path');
    tempPath.setAttribute('class', 'temp');
    tempPath.style.display = 'none';
    el.wires.appendChild(tempPath);
    layoutWires();
  }
  function layoutWires() {
    for (const w of wires) {
      const a = byId[w.from.n] && portPos(byId[w.from.n], 'out', w.from.k);
      const b = byId[w.to.n] && portPos(byId[w.to.n], 'in', w.to.k);
      if (!a || !b) { w.path.setAttribute('d', ''); continue; }
      const d = curve(a, b);
      w.path.setAttribute('d', d); w.flow.setAttribute('d', d); w.hit.setAttribute('d', d);
    }
  }
  function markPorts() {
    for (const n of nodes) {
      if (!n.ports) continue;
      for (const [key, p] of Object.entries(n.ports)) {
        const [dir, k] = key.split('.');
        const on = dir === 'in' ? !!incoming[n.id + '.' + k] : wires.some((w) => w.from.n === n.id && w.from.k === k);
        p.classList.toggle('on', on);
      }
    }
  }

  // =================================================================================
  // Редактор: мышь — панорама, перенос узлов, провода, числа
  // =================================================================================
  const view = { x: 0, y: 0, z: 1 };
  function applyView() {
    el.world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    el.editor.style.backgroundPosition = `${view.x}px ${view.y}px`;
    el.editor.style.backgroundSize = `${22 * view.z}px ${22 * view.z}px`;
  }
  function fitView() {
    requestAnimationFrame(() => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const n of nodes) {
        const w = n.el ? n.el.offsetWidth : 206, h = n.el ? n.el.offsetHeight : 120;
        x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + h);
      }
      const W = el.editor.clientWidth, H = el.editor.clientHeight;
      const pad = 44;
      // не мельче 0,85: иначе подписи в узлах станут меньше 11 px; лишнее уходит под поля
      view.z = clamp(Math.min((W - pad * 2) / (x1 - x0), (H - pad * 2 - 30) / (y1 - y0)), W < 700 ? 0.6 : 0.85, 1);
      view.x = (W - (x1 - x0) * view.z) / 2 - x0 * view.z;
      view.y = (H - 30 - (y1 - y0) * view.z) / 2 - y0 * view.z;
      applyView();
      layoutWires();
    });
  }
  const toWorld = (cx, cy) => {
    const r = el.editor.getBoundingClientRect();
    return [(cx - r.left - view.x) / view.z, (cy - r.top - view.y) / view.z];
  };

  let act = null;
  let lastHit = null, lastHitT = 0;
  el.editor.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const hitPath = e.target.closest && e.target.closest('path.hit');
    if (hitPath) {
      // двойной щелчок по проводу — удалить
      const now = performance.now();
      if (lastHit === hitPath && now - lastHitT < 420) {
        wires = wires.filter((x) => x !== hitPath.__wire);
        reindex(); renderWires(); markPorts();
        lastHit = null;
      } else { lastHit = hitPath; lastHitT = now; }
      return;
    }
    const port = e.target.closest('.port');
    const head = e.target.closest('.n-head');
    const scrub = e.target.closest('.scrub');
    const del = e.target.closest('.n-del');
    if (e.target.closest('.palette') || e.target.closest('select') || del) return;
    const nodeEl = e.target.closest('.node');
    document.querySelectorAll('.node.sel').forEach((x) => x.classList.remove('sel'));
    if (nodeEl) nodeEl.classList.add('sel');
    if (port && port.dataset.dir === 'out') {
      const n = byId[nodeEl.dataset.id];
      act = { kind: 'wire', n, k: port.dataset.k, from: portPos(n, 'out', port.dataset.k) };
      tempPath.style.display = '';
    } else if (port && port.dataset.dir === 'in') {
      // тянем от занятого входа — вынимаем провод и ведём его заново
      const n = byId[nodeEl.dataset.id];
      const w = incoming[n.id + '.' + port.dataset.k];
      if (w) {
        wires = wires.filter((x) => x !== w);
        reindex(); renderWires(); markPorts();
        const src = byId[w.from.n];
        act = { kind: 'wire', n: src, k: w.from.k, from: portPos(src, 'out', w.from.k) };
        tempPath.style.display = '';
      }
    } else if (scrub) {
      const n = byId[nodeEl.dataset.id];
      act = { kind: 'scrub', n, k: scrub.dataset.param, step: +scrub.dataset.step, x0: e.clientX, v0: isFinite(n.p[scrub.dataset.param]) ? n.p[scrub.dataset.param] : 0, el: scrub, moved: false };
    } else if (head) {
      const n = byId[nodeEl.dataset.id];
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      act = { kind: 'node', n, ox: wx - n.x, oy: wy - n.y };
      el.nodes.appendChild(nodeEl);
    } else if (!nodeEl) {
      act = { kind: 'pan', x0: e.clientX, y0: e.clientY, vx: view.x, vy: view.y };
      el.editor.classList.add('panning');
      el.palette.hidden = true;
      el.add.setAttribute('aria-expanded', 'false');
    }
    if (act) { try { el.editor.setPointerCapture(e.pointerId); } catch (_) { /* не критично */ } }
  });
  el.editor.addEventListener('pointermove', (e) => {
    if (!act) return;
    if (act.kind === 'pan') {
      view.x = act.vx + e.clientX - act.x0; view.y = act.vy + e.clientY - act.y0;
      applyView();
    } else if (act.kind === 'node') {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      act.n.x = Math.round(wx - act.ox); act.n.y = Math.round(wy - act.oy);
      act.n.el.style.transform = `translate(${act.n.x}px, ${act.n.y}px)`;
      layoutWires();
    } else if (act.kind === 'wire') {
      const p = toWorld(e.clientX, e.clientY);
      tempPath.setAttribute('d', curve(act.from, p));
      document.querySelectorAll('.port.target').forEach((x) => x.classList.remove('target'));
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const tp = t && t.closest && t.closest('.port[data-dir="in"]');
      if (tp) tp.classList.add('target');
    } else if (act.kind === 'scrub') {
      const dx = e.clientX - act.x0;
      if (Math.abs(dx) > 2) act.moved = true;
      if (!act.moved) return;
      const T = TYPES[act.n.type];
      const prm = T.params.find((x) => x.k === act.k);
      let v = act.v0 + Math.round(dx / 2) * act.step * (e.shiftKey ? 10 : 1);
      if (prm && prm.min !== undefined) v = Math.max(prm.min, v);
      v = Math.round(v / act.step) * act.step;
      act.n.p[act.k] = +v.toFixed(4);
      act.el.textContent = fmt(act.n.p[act.k]);
    }
  });
  function endAct(e) {
    if (!act) return;
    if (act.kind === 'wire') {
      tempPath.style.display = 'none';
      document.querySelectorAll('.port.target').forEach((x) => x.classList.remove('target'));
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const tp = t && t.closest && t.closest('.port[data-dir="in"]');
      if (tp) {
        const to = byId[tp.closest('.node').dataset.id];
        if (to && to.id !== act.n.id) {
          wires = wires.filter((w) => !(w.to.n === to.id && w.to.k === tp.dataset.k));
          wires.push({ from: { n: act.n.id, k: act.k }, to: { n: to.id, k: tp.dataset.k } });
          reindex(); renderWires(); markPorts();
        }
      }
    } else if (act.kind === 'scrub' && !act.moved) {
      // щелчок без движения — ввод числа с клавиатуры
      const s = act.el, n = act.n, k = act.k;
      s.contentEditable = 'true';
      s.focus();
      document.getSelection().selectAllChildren(s);
      const commit = () => {
        s.contentEditable = 'false';
        const v = parseFloat(s.textContent.replace(',', '.').replace('−', '-'));
        if (isFinite(v)) n.p[k] = v;
        s.textContent = isFinite(n.p[k]) ? fmt(n.p[k]) : '—';
        s.removeEventListener('blur', commit);
      };
      s.addEventListener('blur', commit);
      s.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); s.blur(); } }, { once: false });
    }
    el.editor.classList.remove('panning');
    act = null;
  }
  el.editor.addEventListener('pointerup', endAct);
  el.editor.addEventListener('pointercancel', endAct);
  el.editor.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = el.editor.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const z = clamp(view.z * Math.exp(-e.deltaY * 0.0015), 0.35, 1.6);
    view.x = mx - (mx - view.x) * (z / view.z);
    view.y = my - (my - view.y) * (z / view.z);
    view.z = z;
    applyView();
  }, { passive: false });
  el.nodes.addEventListener('change', (e) => {
    const s = e.target.closest('select');
    if (!s) return;
    const n = byId[s.closest('.node').dataset.id];
    n.p[s.dataset.param] = s.value;
    n.s = {};
    if (n.type === 'layer') {
      const props = env.layerProps(n.p.layer);
      wires = wires.filter((w) => !(w.to.n === n.id && !props.includes(w.to.k)));
      reindex();
    }
    renderNode(n);
    renderWires();
  });
  el.nodes.addEventListener('click', (e) => {
    const del = e.target.closest('.n-del');
    if (!del) return;
    const n = byId[del.closest('.node').dataset.id];
    nodes = nodes.filter((x) => x !== n);
    delete byId[n.id];
    wires = wires.filter((w) => w.from.n !== n.id && w.to.n !== n.id);
    n.el.remove();
    reindex(); renderWires(); markPorts();
  });

  // ---------- Палитра ----------
  el.palette.innerHTML = Object.entries(CATS).map(([cat, name]) => {
    const items = Object.entries(TYPES).filter(([, T]) => T.cat === cat);
    return `<div class="pal-group">${name}</div>` + items.map(([k, T]) => `<button type="button" class="pal-item cat-${cat}" data-type="${k}"><i></i>${T.title}<small>${T.desc}</small></button>`).join('');
  }).join('');
  el.add.addEventListener('click', () => {
    const open = el.palette.hidden;
    el.palette.hidden = !open;
    el.add.setAttribute('aria-expanded', String(open));
  });
  el.palette.addEventListener('click', (e) => {
    const b = e.target.closest('.pal-item');
    if (!b) return;
    const W = el.editor.clientWidth, H = el.editor.clientHeight;
    const [wx, wy] = toWorld(el.editor.getBoundingClientRect().left + W / 2, el.editor.getBoundingClientRect().top + H / 2);
    const type = b.dataset.type;
    const p = {};
    if (type === 'tap' || type === 'drag' || type === 'layer') {
      const first = Object.entries(layers).find(([, L]) => type === 'layer' || L[type]);
      p.layer = first ? first[0] : '';
    }
    const n = addNode(type, Math.round(wx - 100), Math.round(wy - 60), p);
    renderNode(n);
    el.palette.hidden = true;
    el.add.setAttribute('aria-expanded', 'false');
  });

  el.presets.innerHTML = Object.entries(PRESETS).map(([k, P]) => `<button type="button" class="preset" role="tab" data-k="${k}" aria-selected="false">${P.title}</button>`).join('');
  el.presets.addEventListener('click', (e) => { const b = e.target.closest('.preset'); if (b) loadPreset(b.dataset.k); });
  el.reset.addEventListener('click', () => loadPreset(presetKey));

  // =================================================================================
  // Главный цикл
  // =================================================================================
  let last = performance.now(), frameN = 0, fpsAcc = 0, fps = 60;
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden) return;
    runDemo(Math.min(0.1, (now - (tick.prev || now)) / 1000) || dt);
    tick.prev = now;
    evaluate(dt);
    frameN++;
    fpsAcc += dt;
    // значения на портах и «течение» по проводам
    if (frameN % 3 === 0 || frameN < 3) {
      for (const n of nodes) {
        if (!n.vals) continue;
        for (const [key, v] of Object.entries(n.vals)) {
          const [dir, k] = key.split('.');
          const val = dir === 'in' ? n.inVals[k] : n.out[k];
          v.textContent = typeof val === 'number' ? fmt(val) : '';
        }
      }
      const t = performance.now();
      for (const w of wires) {
        const src = byId[w.from.n];
        if (src && src.changed && src.changed[w.from.k]) w.hot = t + 250;
        if (w.flow) w.flow.classList.toggle('active', (w.hot || 0) > t);
      }
    }
    if (fpsAcc > 0.5) {
      fps = Math.round(frameN / fpsAcc);
      frameN = 0; fpsAcc = 0;
      const springs = nodes.filter((n) => n.type === 'spring').length;
      el.stats.textContent = `${nodes.length} патчей · ${wires.length} проводов · пружин: ${springs} · ${fps} к/с`;
    }
  }

  const style = document.createElement('style');
  style.textContent = SCREEN_CSS;
  document.head.appendChild(style);
  window.addEventListener('resize', () => { fitView(); });
  loadPreset('like');
  demo.t = 0.55;   // первый «щелчок» призрачного пальца — сразу после загрузки
  requestAnimationFrame((n) => { last = n; tick(n); });
})();
