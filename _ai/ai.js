/* ================================================================
   Общий клиент нейросети для игр с нейросетью (DeepSeek через OpenRouter).
   Работает по принципу BYOK — «принеси свой ключ»: у сайта нет своего ключа,
   каждый игрок подключает собственный ключ OpenRouter. Ключ хранится только
   в localStorage его браузера и уходит напрямую в OpenRouter, никуда больше.

   Подключение в index.html, до своего кода:
     <script src="../_ai/ai.js"></script>

   Как игрок подключает ключ:
     • «Войти через OpenRouter» (OAuth PKCE; только на https или localhost) —
       OpenRouter сам выпускает ключ в аккаунте игрока и возвращает его на страницу;
     • или вставить готовый ключ sk-or-… вручную;
     • или «Играть в демо» — заготовленные ответы без нейросети.

   API:
     AI.model                 модель: 'deepseek/deepseek-v4.1-flash'
     AI.hasKey()              подключён ли ключ
     AI.demo                  true — работаем без нейросети (нет ключа, нет сети или так выбрал игрок)
     AI.shot                  true — идёт съёмка обложки: нейросеть не зовём, показываем готовое демо
     await AI.ensureKey()     нет ключа → окно подключения; вернёт true, если ключ есть
     AI.openKeyDialog()       окно управления ключом (подключить, сменить, отключить)
     AI.maskedKey()           «sk-or-…abcd» для показа в интерфейсе
     await AI.chat(messages, opts) → строка
         messages: [{role:'user'|'assistant'|'system', content:'…'}] или просто строка
         opts: { system, model, temperature = 0.8, maxTokens = 700, onToken(delta, full), signal, timeout = 45000,
                 think = false }  — think: true включает рассуждение модели (медленнее, умнее; бюджет токенов растёт сам)
     await AI.json(messages, opts) → объект
         просит строго JSON, вычищает мусор вокруг, переспрашивает при обрезанном ответе;
         opts.schemaHint — описание полей; opts.fallback — что вернуть при полном сбое (иначе бросит ошибку)
     AI.usage                 { calls, promptTokens, completionTokens, costUSD }
     AI.onStatus = (s) => {}  'thinking' | 'idle' | 'error'
   Ошибки — AIError: .kind = 'nokey' | 'auth' | 'credits' | 'rate' | 'network' | 'timeout' | 'bad', .ru — фраза для интерфейса.
   ================================================================ */
(function () {
  'use strict';
  const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
  const STORE_KEY = 'openrouter_key';
  const PKCE_KEY = 'openrouter_pkce_verifier';
  const APP_LABEL = 'Opus 5.5: 100 проектов';
  const MAX_PARALLEL = 4;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
  };

  class AIError extends Error {
    constructor(kind, ru, detail) { super(ru + (detail ? ' — ' + detail : '')); this.kind = kind; this.ru = ru; this.detail = detail; }
  }
  const RU = {
    nokey: 'Нет ключа OpenRouter — включён демо-режим',
    auth: 'Ключ OpenRouter не подошёл — подключите другой',
    credits: 'На балансе вашего OpenRouter закончились деньги',
    rate: 'Нейросеть перегружена, попробуйте через минуту',
    network: 'Нет связи с нейросетью',
    timeout: 'Нейросеть думает слишком долго',
    bad: 'Нейросеть ответила что-то невразумительное',
  };

  // ---------- очередь: не больше MAX_PARALLEL запросов одновременно ----------
  let active = 0;
  const waiting = [];
  const acquire = () => new Promise((res) => { if (active < MAX_PARALLEL) { active++; res(); } else waiting.push(res); });
  const release = () => { const next = waiting.shift(); if (next) next(); else active--; };

  let busy = 0;
  const status = (s) => { try { AI.onStatus && AI.onStatus(s); } catch {} };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function toMessages(messages, system) {
    const list = typeof messages === 'string' ? [{ role: 'user', content: messages }] : messages.slice();
    if (system) list.unshift({ role: 'system', content: system });
    return list;
  }

  async function request(body, opts) {
    const key = AI.key();
    if (!key) throw new AIError('nokey', RU.nokey);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort('timeout'), opts.timeout || (opts.think ? 150000 : 45000));
    if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort('user'), { once: true });
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'X-Title': 'Opus 5.5: 100 projects' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (ctrl.signal.aborted && ctrl.signal.reason === 'timeout') throw new AIError('timeout', RU.timeout);
      if (ctrl.signal.aborted) throw e;
      throw new AIError('network', RU.network, e.message);
    }
    if (!res.ok) {
      clearTimeout(timer);
      let text = ''; try { text = (await res.text()).slice(0, 300); } catch {}
      if (res.status === 401 || res.status === 403) { store.set(STORE_KEY, null); AI.demo = true; throw new AIError('auth', RU.auth, text); }
      if (res.status === 402) throw new AIError('credits', RU.credits, text);
      if (res.status === 429) throw new AIError('rate', RU.rate, text);
      if (res.status === 400) throw new AIError('bad', 'Запрос не понравился нейросети', text);
      throw new AIError('network', RU.network, 'HTTP ' + res.status + ' ' + text);
    }
    return { res, done: () => clearTimeout(timer) };
  }

  function account(usage) {
    if (!usage) return;
    AI.usage.promptTokens += usage.prompt_tokens || 0;
    AI.usage.completionTokens += usage.completion_tokens || 0;
    AI.usage.costUSD += typeof usage.cost === 'number' ? usage.cost
      : ((usage.prompt_tokens || 0) * 0.15 + (usage.completion_tokens || 0) * 0.6) / 1e6;
  }

  async function once(messages, opts) {
    const body = {
      model: opts.model || AI.model,
      messages: toMessages(messages, opts.system),
      temperature: opts.temperature ?? 0.8,
      max_tokens: (opts.maxTokens || 700) + (opts.think ? 4000 : 0),
      usage: { include: true },
      // DeepSeek v4.1 по умолчанию «думает» и может истратить весь бюджет на рассуждение; для живых реплик выключаем
      reasoning: opts.think ? { effort: 'medium', exclude: true } : { enabled: false },
    };
    if (opts.jsonMode) body.response_format = { type: 'json_object' };
    const streaming = typeof opts.onToken === 'function';
    if (streaming) body.stream = true;

    const { res, done } = await request(body, opts);
    try {
      if (!streaming) {
        const data = await res.json();
        account(data.usage);
        const text = data.choices?.[0]?.message?.content;
        const finish = data.choices?.[0]?.finish_reason || '';
        if (typeof text !== 'string' || (!text && finish === 'length'))
          throw new AIError('bad', RU.bad, 'пустой ответ (' + (finish || '?') + '), увеличьте maxTokens');
        return { text, finish };
      }
      // потоковый ответ: строки SSE вида «data: {...}», служебные строки начинаются с «:»
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', full = '', finish = '';
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '[DONE]') continue;
          let chunk; try { chunk = JSON.parse(payload); } catch { continue; }
          if (chunk.error) throw new AIError('bad', RU.bad, chunk.error.message);
          if (chunk.usage) account(chunk.usage);
          if (chunk.choices?.[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
          const delta = chunk.choices?.[0]?.delta?.content || '';
          if (delta) { full += delta; try { opts.onToken(delta, full); } catch {} }
        }
      }
      return { text: full, finish };
    } finally { done(); }
  }

  async function chat(messages, opts = {}) { return (await chatRaw(messages, opts)).text; }

  async function chatRaw(messages, opts = {}) {
    await acquire();
    busy++; status('thinking');
    AI.usage.calls++;
    try {
      for (let attempt = 0; ; attempt++) {
        try { return await once(messages, opts); }
        catch (e) {
          const retriable = e instanceof AIError && (e.kind === 'rate' || e.kind === 'network' || (e.kind === 'timeout' && !opts.think));
          if (!retriable || attempt >= 2) throw e;
          await sleep(attempt === 0 ? 1200 : 3500);
        }
      }
    } catch (e) {
      status('error');
      throw e;
    } finally {
      busy--; release();
      if (!busy) status('idle');
    }
  }

  // Вытащить объект из «грязного» ответа: ```json …```, текст вокруг, хвостовые запятые
  function extractJSON(text) {
    if (typeof text !== 'string') return null;
    let t = text.replace(/```(?:json)?/gi, '').trim();
    const first = t.search(/[{[]/);
    if (first < 0) return null;
    const open = t[first], close = open === '{' ? '}' : ']';
    const last = t.lastIndexOf(close);
    if (last <= first) return null;
    t = t.slice(first, last + 1);
    try { return JSON.parse(t); } catch {}
    try { return JSON.parse(t.replace(/,\s*([}\]])/g, '$1')); } catch {}
    return null;
  }

  // Спасти обрезанный JSON: отрезать до последнего целого элемента и закрыть открытые скобки
  function salvageJSON(text) {
    if (typeof text !== 'string') return null;
    let t = text.replace(/```(?:json)?/gi, '');
    const start = t.search(/[{[]/);
    if (start < 0) return null;
    t = t.slice(start);
    const stack = [], cuts = [];
    let inStr = false, esc = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
      else if (ch === '}' || ch === ']') { stack.pop(); cuts.push([i + 1, stack.slice()]); if (!stack.length) break; }
    }
    for (let k = cuts.length - 1; k >= Math.max(0, cuts.length - 60); k--) {
      const [at, open] = cuts[k];
      try { return JSON.parse(t.slice(0, at).replace(/,\s*$/, '') + open.reverse().join('')); } catch {}
    }
    return null;
  }

  async function json(messages, opts = {}) {
    const hint = 'Ответь строго одним JSON-объектом без пояснений и без markdown.' + (opts.schemaHint ? ' Поля: ' + opts.schemaHint : '');
    const system = opts.system ? opts.system + '\n\n' + hint : hint;
    const base = { ...opts, system, onToken: undefined, temperature: opts.temperature ?? 0.7 };
    // один запрос в JSON-режиме; если провайдер его не поддерживает (HTTP 400) — тот же запрос без него
    const ask = async (o) => {
      try { return await chatRaw(messages, { ...o, jsonMode: true }); }
      catch (e) { if (e.kind === 'bad' && e.ru !== RU.bad) return chatRaw(messages, o); throw e; }
    };
    let last = '';
    try {
      // 1) как просили (возможно, с рассуждением)
      try {
        const r = await ask(base);
        last = r.text;
        const obj = extractJSON(r.text);
        if (obj) return obj;
      } catch (e) { if (e.kind !== 'bad') throw e; }
      // 2) ответ пустой, обрезан или битый — без рассуждения и с запасом токенов
      const roomy = { ...base, think: false, maxTokens: Math.round((opts.maxTokens || 700) * 1.8) + 1200 };
      try {
        const r = await ask(roomy);
        last = r.text || last;
        const obj = extractJSON(r.text) || (r.finish === 'length' ? salvageJSON(r.text) : null);
        if (obj) return obj;
      } catch (e) { if (e.kind !== 'bad') throw e; }
      // 3) починка тем, что есть
      if (last) {
        const fix = await chatRaw([{ role: 'user', content: 'Исправь, чтобы это стало корректным JSON. Верни только JSON.\n\n' + String(last).slice(0, 9000) }],
          { ...roomy, system: hint, temperature: 0, jsonMode: true });
        const obj = extractJSON(fix.text) || salvageJSON(fix.text) || salvageJSON(last);
        if (obj) return obj;
      }
      throw new AIError('bad', RU.bad, String(last).slice(0, 200));
    } catch (e) {
      if ('fallback' in opts) return typeof opts.fallback === 'function' ? opts.fallback(e) : opts.fallback;
      throw e;
    }
  }

  // ---------- BYOK: вход через OpenRouter (OAuth PKCE) ----------
  const canOAuth = () => location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function startOAuth() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    try { sessionStorage.setItem(PKCE_KEY, verifier); } catch {}
    const back = new URL(location.href); back.hash = ''; back.searchParams.delete('code');
    location.href = 'https://openrouter.ai/auth?callback_url=' + encodeURIComponent(back.toString()) +
      '&code_challenge=' + challenge + '&code_challenge_method=S256&key_label=' + encodeURIComponent(APP_LABEL);
  }

  // Возврат с OpenRouter: ?code=… меняем на ключ и перезагружаем страницу уже с ключом
  async function finishOAuth() {
    if (!canOAuth()) return false;
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    if (!code) return false;
    let verifier = null; try { verifier = sessionStorage.getItem(PKCE_KEY); } catch {}
    url.searchParams.delete('code');
    history.replaceState(null, '', url.toString());
    if (!verifier) return false;
    try {
      const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
      });
      const data = await res.json().catch(() => ({}));
      try { sessionStorage.removeItem(PKCE_KEY); } catch {}
      if (res.ok && typeof data.key === 'string' && data.key) {
        store.set(STORE_KEY, data.key);
        location.replace(url.toString()); // чистый старт страницы, уже с ключом
        return new Promise(() => {});    // дальше страница перезагружается
      }
    } catch {}
    return false;
  }

  // ---------- окно подключения ключа ----------
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function keyDialog(manage) {
    return new Promise((resolve) => {
      const has = AI.hasKey();
      const btn = 'height:44px;border-radius:10px;font-weight:600;font-size:15px;font-family:inherit;cursor:pointer;padding:0 16px';
      const wrap = document.createElement('div');
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      wrap.setAttribute('aria-label', 'Подключение нейросети');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(8,8,10,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1b1a17';
      wrap.innerHTML = `
        <div style="max-width:460px;width:100%;max-height:calc(100vh - 32px);overflow:auto;background:#f4efe6;border-radius:16px;padding:24px 22px 20px;box-shadow:0 30px 80px rgba(0,0,0,.45)">
          <div style="font-weight:700;font-size:20px;margin-bottom:6px">${has ? 'Нейросеть подключена' : 'Подключите свою нейросеть'}</div>
          <div style="color:#55524b;margin-bottom:16px">Игры работают на DeepSeek через OpenRouter по вашему собственному ключу. Ключ хранится только в этом браузере и уходит напрямую в OpenRouter, никуда больше. Партия обычно стоит центы.</div>
          ${has ? `<div style="display:flex;align-items:center;gap:10px;justify-content:space-between;background:#fff;border:1px solid #cfc7b8;border-radius:10px;padding:10px 12px;margin-bottom:14px"><span style="font-family:ui-monospace,Menlo,monospace;font-size:14px">${esc(AI.maskedKey())}</span><button data-a="forget" style="${btn};height:36px;border:1px solid #b3401e;background:transparent;color:#b3401e">Отключить</button></div>` : ''}
          ${canOAuth() ? `<button data-a="oauth" style="${btn};width:100%;border:0;background:#1b1a17;color:#f4efe6">${has ? 'Войти заново через OpenRouter' : 'Войти через OpenRouter'}</button>
          <div style="color:#6b675e;font-size:13px;margin:8px 2px 14px">OpenRouter сам выпустит ключ в вашем аккаунте и вернёт вас сюда.</div>
          <div style="display:flex;align-items:center;gap:10px;color:#8a857a;font-size:13px;margin-bottom:10px"><span style="flex:1;height:1px;background:#d8d0c1"></span>или вставьте ключ<span style="flex:1;height:1px;background:#d8d0c1"></span></div>` : ''}
          <input type="password" autocomplete="off" spellcheck="false" placeholder="sk-or-…" aria-label="Ключ OpenRouter" style="width:100%;box-sizing:border-box;height:44px;padding:0 12px;border-radius:10px;border:1px solid #cfc7b8;background:#fff;font:inherit;color:inherit">
          <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
            <button data-a="save" style="${btn};flex:1;min-width:150px;border:${canOAuth() ? '1px solid #1b1a17' : '0'};background:${canOAuth() ? 'transparent' : '#1b1a17'};color:${canOAuth() ? '#1b1a17' : '#f4efe6'}">Сохранить ключ</button>
            <button data-a="demo" style="${btn};flex:1;min-width:150px;border:1px solid #cfc7b8;background:transparent;color:#55524b">${manage ? 'Закрыть' : 'Играть в демо'}</button>
          </div>
          <div style="color:#6b675e;font-size:13px;margin-top:12px">Нет ключа? Его можно создать на <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" style="color:#b3401e">openrouter.ai/keys</a>.</div>
        </div>`;
      const input = wrap.querySelector('input');
      const close = (ok) => { document.removeEventListener('keydown', onKey); wrap.remove(); resolve(ok); };
      const onKey = (e) => { if (e.key === 'Escape') close(AI.hasKey()); };
      document.addEventListener('keydown', onKey);
      wrap.querySelector('[data-a=save]').onclick = () => {
        const v = input.value.trim();
        if (!/^sk-or-[\w-]{10,}$/.test(v)) { input.style.borderColor = '#b3401e'; input.focus(); return; }
        store.set(STORE_KEY, v); AI.demo = false; close(true);
      };
      wrap.querySelector('[data-a=demo]').onclick = () => { if (!AI.hasKey()) AI.demo = true; close(AI.hasKey()); };
      const oauth = wrap.querySelector('[data-a=oauth]');
      if (oauth) oauth.onclick = () => { oauth.disabled = true; oauth.textContent = 'Открываю OpenRouter…'; startOAuth().catch(() => { oauth.disabled = false; oauth.textContent = 'Войти через OpenRouter'; }); };
      const forget = wrap.querySelector('[data-a=forget]');
      if (forget) forget.onclick = () => { store.set(STORE_KEY, null); AI.demo = true; close(false); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') wrap.querySelector('[data-a=save]').click(); });
      document.body.appendChild(wrap);
      setTimeout(() => (oauth || input).focus(), 50);
    });
  }

  const AI = {
    model: 'deepseek/deepseek-v4.1-flash',
    usage: { calls: 0, promptTokens: 0, completionTokens: 0, costUSD: 0 },
    shot: !!window.__SHOT__,
    demo: false,
    onStatus: null,
    AIError,
    key() { return store.get(STORE_KEY) || ''; },
    hasKey() { return !!AI.key(); },
    maskedKey() { const k = AI.key(); return k ? k.slice(0, 6) + '…' + k.slice(-4) : ''; },
    forgetKey() { store.set(STORE_KEY, null); AI.demo = true; },
    ready: null,
    async ensureKey() {
      if (AI.shot) { AI.demo = true; return false; }
      await AI.ready;
      if (AI.hasKey()) { AI.demo = false; return true; }
      return keyDialog(false);
    },
    openKeyDialog() { return keyDialog(true); },
    chat,
    json,
    extractJSON,
    salvageJSON,
  };
  AI.demo = AI.shot || !AI.hasKey();
  AI.ready = AI.shot ? Promise.resolve(false) : finishOAuth().catch(() => false);
  window.AI = AI;
})();
