/* ================================================================
   032 · Игра, которая пишет себя — что нейросеть знает о движке.

   Здесь описано маленькое API песочницы (оно же реализовано в runtime.js),
   три вида запросов — «напиши», «поправь», «почини» — и разбор ответа.
   Модуль работает и в браузере (window.SWG.prompts), и в Node (для проверок).
   ================================================================ */
(function (root) {
  'use strict';

  // ---------- API движка: ровно то, что реализует runtime.js ----------
  const API_DOC = `ДВИЖОК-ПЕСОЧНИЦА
Твой код — обычный скрипт JavaScript (не модуль). Он выполняется в песочнице с одним холстом 960×600.
Нет DOM, нет сети, нет картинок и аудиофайлов: всё рисуется примитивами Canvas 2D.

Ты объявляешь ровно три функции верхнего уровня:
  function init()      — (пере)создаёт ВСЁ состояние игры. Вызывается при старте и при каждом рестарте.
  function update(dt)  — логика кадра; dt — секунды с прошлого кадра (не больше 0.05).
  function draw(ctx)   — рисует кадр целиком, начиная с фона (холст сам не очищается).
Состояние игры — переменные верхнего уровня через let, значения им присваивает init().

Готовые глобальные помощники (НЕ объявляй их заново):
  W, H                 ширина 960 и высота 600 поля; координаты x вправо, y вниз
  T                    секунды с начала текущей партии
  score                счёт: пиши score += 10 (или addScore(10)); движок сам рисует его и рекорд
  lives                жизни: присвой в init() (например lives = 3), уменьшай lives -= 1; при 0 — конец игры сам.
                       Не нужны жизни — не трогай переменную.
  key(name)            зажата ли клавиша: 'left' 'right' 'up' 'down' (стрелки и WASD), 'fire' (пробел, X, Enter),
                       'jump' (пробел, стрелка вверх, W) или код клавиши вроде 'KeyE', 'ShiftLeft'
  tap(name)            нажата ли клавиша именно в этом кадре (одно срабатывание)
  input.dx, input.dy   направление от −1 до 1 (стрелки, WASD и экранный джойстик на телефоне)
  pointer              мышь и палец: pointer.x, pointer.y (координаты поля), pointer.down (зажат),
                       pointer.tapped (нажат в этом кадре)
  gameOver(text)       проигрыш: движок покажет экран «Игра окончена» и сам перезапустит игру через init()
  win(text)            победа — то же самое, но экран победы
  sound(name)          звук: 'coin' 'hit' 'jump' 'shoot' 'boom' 'power' 'blip' 'lose' 'win'
  burst(x, y, color, n)   взрыв частиц; floatText(x, y, text, color) — всплывающая надпись; shake(0…20) — тряска
  rand(a, b)  randi(a, b)  pick(arr)  clamp(v, a, b)  lerp(a, b, t)  dist(x1, y1, x2, y2)  angle(x1, y1, x2, y2)
  hitRect(a, b)        пересекаются ли прямоугольники {x, y, w, h} (x, y — левый верхний угол)
  hitCircle(a, b)      пересекаются ли круги {x, y, r}
  circle(ctx, x, y, r, color)   rect(ctx, x, y, w, h, color)   text(ctx, str, x, y, size, color, align='center')
Движок сам рисует поверх кадра: счёт, рекорд, жизни, частицы, всплывающие надписи и экраны конца игры.`;

  // ---------- маленький пример, чтобы модель видела стиль и API в деле ----------
  const EXAMPLE = `// title: Звездолов
// controls: ← → или мышь — двигать корзину
let bx, stars, rocks, spawn;
function init() {
  bx = W / 2; stars = []; rocks = []; spawn = 0; lives = 3;
}
function update(dt) {
  bx += input.dx * 520 * dt;
  if (pointer.down) bx = lerp(bx, pointer.x, 0.25);
  bx = clamp(bx, 60, W - 60);
  spawn -= dt;
  if (spawn <= 0) {
    spawn = Math.max(0.25, 0.9 - T * 0.01);
    (Math.random() < 0.7 ? stars : rocks).push({ x: rand(40, W - 40), y: -20, r: 14, vy: rand(160, 240) + T * 3 });
  }
  for (const list of [stars, rocks]) for (let i = list.length - 1; i >= 0; i--) {
    const o = list[i]; o.y += o.vy * dt;
    if (hitCircle(o, { x: bx, y: H - 60, r: 46 })) {
      list.splice(i, 1);
      if (list === stars) { score += 10; sound('coin'); burst(o.x, o.y, '#ffd24a', 14); }
      else { lives -= 1; sound('hit'); shake(10); burst(o.x, o.y, '#ff5a3c', 20); }
    } else if (o.y > H + 30) list.splice(i, 1);
  }
}
function draw(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1a3a'); g.addColorStop(1, '#3a2356');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const s of stars) { circle(ctx, s.x, s.y, s.r, '#ffd24a'); circle(ctx, s.x - 4, s.y - 4, 4, '#fff6c8'); }
  for (const r of rocks) circle(ctx, r.x, r.y, r.r + 4, '#6b5a52');
  rect(ctx, bx - 50, H - 70, 100, 30, '#e8b36a');
  rect(ctx, bx - 50, H - 70, 100, 6, '#fff0cf');
}`;

  const RULES = `ПРАВИЛА
1. Ответ — только код JavaScript, без markdown и без пояснений. Первые две строки — метаданные:
   // title: название игры по-русски, 1–3 слова
   // controls: управление по-русски, одна короткая строка
2. Игра сразу играбельна: понятная цель, нарастающая сложность, проигрыш через gameOver() или lives.
   Управление — клавиатура (key, tap, input.dx/dy). Если по смыслу нужна мышь — pointer.
3. Красиво: продуманная палитра из 3–5 цветов, градиентный или многослойный фон, тени и блики,
   персонажи из фигур с глазами и деталями, лёгкая анимация (покачивание, мигание через T).
   Отклик на события: burst, shake, floatText, sound. Весь экран 960×600 используется.
4. Надёжно: все массивы и объекты создаются в init(); удаляешь из массива в цикле — иди с конца;
   никаких while(true) и бесконечных циклов; не трогай setTransform/resetTransform/canvas/document/window;
   не используй setTimeout, setInterval, requestAnimationFrame — время считай через dt и T.
   Все тексты в игре — по-русски. Объём — 150–300 строк.
5. Думай коротко: план из 5–8 пунктов (механика, объекты, управление, палитра) — без черновиков кода.
   Код пиши один раз, сразу в ответе.`;

  const SYSTEM_WRITE = `Ты — автор маленьких браузерных аркад. По фразе игрока пишешь игру целиком — сразу рабочую и красивую.

${API_DOC}

${RULES}

ПРИМЕР (коротко, твоя игра должна быть богаче):
${EXAMPLE}`;

  // ---------- план игры: здесь модель рассуждает (think: true), ответ маленький ----------
  const SYSTEM_PLAN = `Ты — геймдизайнер маленьких браузерных аркад на холсте 960×600 (Canvas 2D, всё рисуется фигурами, без картинок).
По фразе игрока придумай игру на 1–3 минуты: сохрани идею игрока и добавь одну неожиданную, но уместную механику.
Игра должна быть выполнима в 150–300 строках кода и красивой: продуманная палитра, живой фон, выразительные персонажи.
Все тексты — по-русски. Думай коротко.`;
  const PLAN_HINT = 'title (1–3 слова), pitch (одна фраза), controls (строка), palette (4 цвета #rrggbb), ' +
    'scene (фон и мир, 1–2 фразы), entities (массив {name, look, behavior}), rules (массив: цель, очки, проигрыш, рост сложности), ' +
    'twist (неожиданная механика), juice (массив эффектов)';

  function planText(plan) {
    if (!plan || typeof plan !== 'object') return '';
    const list = (v) => (Array.isArray(v) ? v.map((x) => (typeof x === 'object' ? Object.values(x).join(' — ') : String(x))).join('; ') : String(v || ''));
    return [
      plan.title && 'Название: ' + plan.title,
      plan.pitch && 'Суть: ' + plan.pitch,
      plan.controls && 'Управление: ' + plan.controls,
      plan.palette && 'Палитра: ' + list(plan.palette),
      plan.scene && 'Сцена: ' + plan.scene,
      plan.entities && 'Объекты: ' + list(plan.entities),
      plan.rules && 'Правила: ' + list(plan.rules),
      plan.twist && 'Изюминка: ' + plan.twist,
      plan.juice && 'Отклик: ' + list(plan.juice),
    ].filter(Boolean).join('\n');
  }

  // ---------- запросы ----------
  function userNew(phrase, plan) {
    const p = planText(plan);
    return `Фраза игрока: «${phrase}»\n` + (p
      ? `План геймдизайнера (следуй ему):\n${p}\n\nНапиши игру по этому плану.`
      : 'Напиши игру по этой фразе. Сохрани идею игрока и добавь одну неожиданную, но уместную механику.');
  }

  // ---------- правки блоками SEARCH/REPLACE: быстрее, чем переписывать всё ----------
  const PATCH_RULES = `ФОРМАТ ОТВЕТА — только блоки правок, без пояснений:
<<<<<<< SEARCH
точные строки из текущего кода (2–12 строк, чтобы место было однозначным)
=======
новые строки
>>>>>>> REPLACE
Блоков может быть несколько, по порядку сверху вниз. Строки в SEARCH копируй буква в букву, с отступами,
без номеров строк. Новую функцию добавляй так: найди строку-соседа и замени её на неё же плюс новый код.
Если меняется больше половины кода, вместо блоков верни полный код игры целиком (с метаданными в начале).`;

  function userEditPatch(code, instruction, phrase) {
    return `Исходная фраза игрока: «${phrase || '—'}»\n\nТекущий код игры:\n${code}\n\n` +
      `Правка игрока: «${instruction}»\n` +
      `Внеси правку. Всё, о чём игрок не просил, оставь как было. Если суть игры меняется — поправь и строку // title.\n\n${PATCH_RULES}`;
  }

  function userFixPatch(code, err, phrase) {
    const where = err.line ? ` в строке ${err.line}` : '';
    const ctx = errorContext(code, err);
    return `Исходная фраза игрока: «${phrase || '—'}»\n\nКод игры:\n${code}\n\n` +
      `Игра упала${where}${err.phase ? ' (' + phaseRu(err.phase) + ')' : ''}:\n${err.message}\n` +
      (ctx ? `\nМесто ошибки (номера строк только для справки):\n${ctx}` : '') +
      `\nНайди настоящую причину и исправь её. Геймплей без необходимости не меняй.\n\n${PATCH_RULES}`;
  }

  function parsePatches(text) {
    const t = String(text || '').replace(/\r\n?/g, '\n');
    const re = /<{5,9}\s*SEARCH\s*\n([\s\S]*?)\n?={5,9}\s*\n([\s\S]*?)\n?>{5,9}\s*REPLACE/g;
    const blocks = [];
    let m;
    while ((m = re.exec(t))) blocks.push({ search: stripNums(m[1]), replace: stripNums(m[2]) });
    return blocks;
  }
  // модель иногда копирует номера строк «  12| » — снимаем, если они на всех строках
  function stripNums(s) {
    const lines = s.split('\n');
    if (lines.length && lines.every((l) => /^\s*\d+\|\s?/.test(l) || !l.trim())) return lines.map((l) => l.replace(/^\s*\d+\|\s?/, '')).join('\n');
    return s;
  }

  // Применить блоки: сначала точное совпадение, потом — без учёта отступов и пробелов по краям строк
  function applyPatches(code, blocks) {
    let out = code;
    const failed = [];
    for (const b of blocks) {
      if (!b.search.trim()) { failed.push(b); continue; }
      const i = out.indexOf(b.search);
      if (i >= 0 && (i === 0 || out[i - 1] === '\n')) { out = out.slice(0, i) + b.replace + out.slice(i + b.search.length); continue; }
      const lines = out.split('\n');
      const want = b.search.split('\n').map((l) => l.trim()).filter((l, k, arr) => l || (k > 0 && k < arr.length - 1));
      let at = -1;
      outer: for (let s = 0; s + want.length <= lines.length; s++) {
        for (let q = 0; q < want.length; q++) if (lines[s + q].trim() !== want[q]) continue outer;
        at = s; break;
      }
      if (at < 0) { failed.push(b); continue; }
      lines.splice(at, want.length, ...b.replace.split('\n'));
      out = lines.join('\n');
    }
    return { code: out, failed, applied: blocks.length - failed.length };
  }

  // ---------- обрезанный ответ: грубый баланс скобок без строк и комментариев ----------
  function looksTruncated(code) {
    let depth = 0, i = 0;
    const s = code;
    while (i < s.length) {
      const c = s[i], n = s[i + 1];
      if (c === '/' && n === '/') { i = s.indexOf('\n', i); if (i < 0) break; continue; }
      if (c === '/' && n === '*') { const e = s.indexOf('*/', i + 2); if (e < 0) return true; i = e + 2; continue; }
      if (c === '"' || c === "'" || c === '`') {
        let j = i + 1;
        while (j < s.length && s[j] !== c) { if (s[j] === '\\') j++; else if (c !== '`' && s[j] === '\n') break; j++; }
        if (j >= s.length) return true;
        i = j + 1; continue;
      }
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') depth--;
      i++;
    }
    return depth > 0;
  }
  const CONTINUE = 'Ответ оборвался. Продолжи код ровно с того символа, на котором он оборвался: без повторов, без пояснений и без markdown.';

  function numbered(code) {
    return code.split('\n').map((l, i) => String(i + 1).padStart(3, ' ') + '| ' + l).join('\n');
  }

  function userEdit(code, instruction, phrase) {
    return `Исходная фраза игрока: «${phrase || '—'}»\n\nТекущий код игры:\n${code}\n\n` +
      `Правка игрока: «${instruction}»\n` +
      `Внеси правку и верни ПОЛНЫЙ новый код игры целиком (с метаданными в начале). ` +
      `Всё, о чём игрок не просил, сохрани как было. Если правка меняет суть — обнови // title.`;
  }

  function errorContext(code, err) {
    const lines = code.split('\n');
    let ctx = '';
    if (err.line && err.line >= 1 && err.line <= lines.length) {
      const a = Math.max(1, err.line - 3), b = Math.min(lines.length, err.line + 2);
      for (let i = a; i <= b; i++) ctx += (i === err.line ? '>>' : '  ') + String(i).padStart(4, ' ') + '| ' + lines[i - 1] + '\n';
    }
    return ctx;
  }

  function userFix(code, err, phrase) {
    const where = err.line ? ` в строке ${err.line}` : '';
    const ctx = errorContext(code, err);
    return `Исходная фраза игрока: «${phrase || '—'}»\n\nКод игры (номера строк слева только для справки, в ответ их НЕ пиши):\n${numbered(code)}\n\n` +
      `Игра упала${where}${err.phase ? ' (' + phaseRu(err.phase) + ')' : ''}:\n${err.message}\n` +
      (ctx ? `\nМесто ошибки:\n${ctx}` : '') +
      (err.hint ? `\nПодсказка движка: ${err.hint}\n` : '') +
      `\nНайди настоящую причину и верни ПОЛНЫЙ исправленный код игры целиком (с метаданными в начале). ` +
      `Геймплей не меняй без необходимости.`;
  }

  function phaseRu(p) {
    return { load: 'при загрузке кода', init: 'в init()', update: 'в update()', draw: 'в draw()', autotest: 'на автотесте со случайными нажатиями', blank: 'экран пустой' }[p] || p;
  }

  // ---------- разбор ответа: код, название, управление ----------
  function parseAnswer(text) {
    let t = String(text || '').replace(/\r\n?/g, '\n');
    // если модель всё-таки завернула код в ```…```, берём самый длинный блок
    const blocks = [...t.matchAll(/```[a-zA-Z]*\n([\s\S]*?)```/g)].map((m) => m[1]);
    if (blocks.length) t = blocks.sort((a, b) => b.length - a.length)[0];
    else t = t.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '');
    // отрезать болтовню до кода: первая строка-комментарий или объявление
    const start = t.search(/^(\/\/|\/\*|let |const |var |function |'use strict')/m);
    if (start > 0) t = t.slice(start);
    t = t.replace(/\s+$/, '') + '\n';
    const title = (t.match(/^\/\/\s*title\s*:\s*(.+)$/im) || [])[1];
    const controls = (t.match(/^\/\/\s*controls\s*:\s*(.+)$/im) || [])[1];
    return {
      code: t,
      title: title ? title.trim().slice(0, 40) : '',
      controls: controls ? controls.trim().slice(0, 120) : '',
    };
  }

  // Быстрая проверка до запуска: есть ли обязательные функции
  function staticCheck(code) {
    const miss = ['init', 'update', 'draw'].filter((f) => !new RegExp('function\\s+' + f + '\\s*\\(|\\b' + f + '\\s*=\\s*(function|\\()').test(code));
    if (!miss.length) return null;
    return { phase: 'load', message: 'В коде нет функци' + (miss.length > 1 ? 'й ' : 'и ') + miss.map((m) => m + '()').join(', ') + ' — движку нечего вызывать.' };
  }

  const api = {
    API_DOC, SYSTEM_WRITE, SYSTEM_PLAN, PLAN_HINT, EXAMPLE, CONTINUE, planText,
    userNew, userEdit, userFix, userEditPatch, userFixPatch, parsePatches, applyPatches, looksTruncated,
    parseAnswer, staticCheck, numbered, phaseRu,
  };
  root.SWG = root.SWG || {};
  root.SWG.prompts = api;
})(typeof window !== 'undefined' ? window : globalThis);
