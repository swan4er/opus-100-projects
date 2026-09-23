/* ================================================================
   Мозг: запросы к нейросети.
   Новая сцена — два запроса параллельно: быстрый набросок атмосферы
   (время, погода, название — за 1–2 с, без рассуждения) и полный граф
   с рассуждением (think). Правка — один быстрый запрос с текущим графом;
   если модель ничего не поменяла, второй заход уже с рассуждением.
   ================================================================ */
(function () {
  'use strict';
  const L = S3.lang;
  const B = {};

  const HINT = 'reply, title, clear, env, remove, update, add, hints — как описано в системных правилах';

  B.mood = function (text, scene, signal) {
    const cur = scene.objects.length ? `\nСейчас на острове: «${scene.title}», env ${JSON.stringify(scene.env)}.` : '';
    return AI.json([{ role: 'user', content: `Запрос зрителя: «${text}»${cur}\nЭто новая сцена.` }], {
      system: L.SYSTEM_MOOD(), maxTokens: 220, temperature: 0.7, signal, fallback: null, timeout: 20000,
    });
  };

  B.build = async function (text, scene, opts) {
    const fresh = !!opts.fresh;
    const user = fresh
      ? `Новая сцена с нуля (clear: true). Запрос зрителя: «${text}»`
      : `Текущая сцена (граф):\n${JSON.stringify(L.compact(scene))}\n\nЗапрос зрителя: «${text}»\nЭто правка поверх текущей сцены: меняй только то, о чём просят, id сохраняй.`;
    const ask = (think) => AI.json([{ role: 'user', content: user }], {
      system: L.SYSTEM_BUILD(), think, maxTokens: fresh ? 4400 : 1600, temperature: fresh ? 0.75 : 0.5, signal: opts.signal, schemaHint: HINT,
    });
    let resp = await ask(fresh || !!opts.think);
    let res = B.apply(scene, resp, fresh);
    // правка без единого изменения — модель не поняла; второй заход с рассуждением
    if (!fresh && !opts.think && res.empty) {
      resp = await ask(true);
      res = B.apply(scene, resp, false);
    }
    res.resp = resp;
    return res;
  };

  // Применить ответ к сцене со всеми проверками. Возвращает { scene, report, reply, hints, empty }
  B.apply = function (scene, resp, fresh) {
    resp = resp && typeof resp === 'object' ? resp : {};
    if (fresh) resp.clear = true;
    const base = fresh ? { ...L.emptyScene(), env: L.normEnv(resp.env, L.defaultEnv()) } : scene;
    const { scene: next, report } = L.applyOps(base, fresh ? { ...resp, env: undefined } : resp);
    // сцена изменила море — сдвигаем всё, что оказалось не на своём месте
    for (const o of next.objects) if (!o.on && !L.placeOk(o, next.env)) L.place(o, next, next.env);
    const clean = (t) => t.replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '').replace(/\s+/g, ' ').trim();
    const reply = typeof resp.reply === 'string' && clean(resp.reply) ? clean(resp.reply).slice(0, 160) : '';
    const hints = (Array.isArray(resp.hints) ? resp.hints : []).filter((h) => typeof h === 'string' && clean(h)).map((h) => clean(h).slice(0, 40)).slice(0, 4);
    const empty = !fresh && !report.added.length && !report.removed.length && !report.updated.length && !report.envChanged && !(resp.title && resp.title !== scene.title);
    if (fresh && next.objects.length < 4) throw Object.assign(new Error('мало объектов'), { ru: 'Мастер растерялся и собрал почти пустой остров. Попробуйте описать сцену подробнее.' });
    return { scene: next, report, reply, hints, empty };
  };

  S3.brain = B;
})();
