/* ================================================================
   talk.js — люди и нейросеть.
   Хозяйка звонит, Михалыч на балконе травит байки, сосед снизу
   приходит из-за потопа, а в 18:00 — приёмка: бабушка получает
   точный список косяков, ходит по квартире и решает, сколько заплатить.
   Решения, меняющие игру, — только через AI.json со схемой и проверкой.
   ================================================================ */
'use strict';
const PRICE = 40000;
const STYLE = 'Говори по-русски живым разговорным языком, коротко: 1–3 предложения, не больше 45 слов. Без мата, без реальных людей и брендов, без политики, без эмодзи, без ремарок в скобках и звёздочках. Юмор — да, травля — нет.';
const BABA = 'Ты — Зинаида Петровна, 81 год, хозяйка двушки в хрущёвке 1974 года постройки, живёшь тут с новоселья. Бывшая учительница русского языка и литературы: строгая, ехидная, въедливая, но с чувством юмора. Мастера зовёшь «молодой человек» или «голубчик». Покойного мужа Колю, который всё делал на совесть, вспоминаешь редко — не чаще раза за разговор; школьные оценки ставишь тоже не в каждой реплике. Любишь кота Барсика. Ты наняла шабашника сделать за один день ремонт за 40 000 ₽.';
const MIH = 'Ты — Валерий Михайлович, все зовут тебя Михалыч, 67 лет, сосед Зинаиды Петровны по балкону, пенсионер, бывший сантехник шестого разряда. Куришь на балконе в майке и трениках. Травишь байки: про то, как сдавали дом в 1974-м, про армию, рыбалку, жену Люсю, соседей и ремонт «в наше время». Байки смешные, с неожиданным поворотом в конце, ты слегка привираешь. Говоришь неторопливо, с присказками вроде «я тебе так скажу».';
const GENA = 'Ты — Геннадий Аркадьевич, 52 года, сосед снизу, нервный бывший инженер-сметчик. Ты в халате, с полотенцем на голове и с ведром: у тебя с потолка на кухне течёт вода, потому что шабашник сверху устроил потоп. Ты пришёл разбираться и хочешь денег на побелку. На хамство злишься сильнее и грозишь позвонить Зинаиде Петровне. Искренние извинения, помощь или угощение пивом могут тебя смягчить.';

const TALK = { kind: null, busy: false, onSend: null, limit: 240, log: [] };
let aiWarned = false;
function aiFail(e) { if (!aiWarned) { aiWarned = true; toast(e && e.ru ? e.ru + ' — отвечаю заготовкой' : 'Нейросеть молчит — отвечаю заготовкой', 'warn', 3200); } }
const useAI = () => !AI.demo && !AI.shot;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

/* ---------- окно разговора ---------- */
function initTalk() {
  $('talkForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('talkIn'); const text = inp.value.trim();
    if (!text || TALK.busy || !TALK.onSend) return;
    inp.value = ''; updateLeft();
    TALK.onSend(text);
  });
  $('talkIn').addEventListener('input', updateLeft);
  $('talkIn').addEventListener('keydown', (e) => e.stopPropagation());
  $('bAgain').addEventListener('click', () => location.reload());
}
function updateLeft() {
  const inp = $('talkIn'), left = TALK.limit - inp.value.length;
  if (inp.value.length > TALK.limit) inp.value = inp.value.slice(0, TALK.limit);
  const el = $('talkLeft'); el.textContent = Math.max(0, left) + '';
  el.classList.toggle('low', left < 15);
}
function openTalk(o) {
  TALK.kind = o.kind; TALK.onSend = o.onSend || null; TALK.limit = o.limit || 200;
  G.prevMode = G.mode === 'talk' ? G.prevMode : G.mode;
  if (o.pause !== false) G.mode = 'talk';
  G.holding = false;
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e) { /* ок */ }
  $('talk').classList.remove('hidden'); document.body.classList.add('talking');
  $('talkWho').textContent = o.who || ''; $('talkWhere').textContent = o.where || '';
  $('talkLog').innerHTML = '';
  $('talkIn').placeholder = o.placeholder || 'Что скажете?';
  $('talkIn').maxLength = TALK.limit;
  setChips(o.chips || []); setButtons(o.buttons || []);
  $('talkForm').classList.toggle('hidden', !o.onSend);
  enableInput(false); updateLeft();
}
function closeTalk(resume = true) {
  $('talk').classList.add('hidden'); document.body.classList.remove('talking'); TALK.onSend = null; TALK.kind = null;
  if (resume && G.mode === 'talk') { G.mode = 'play'; lockPointer(); }
}
function enableInput(on) {
  TALK.busy = !on;
  $('talkIn').disabled = !on; $('talkSend').disabled = !on;
  document.querySelectorAll('#chips .chip').forEach((c) => { c.disabled = !on; });
  if (on && !isTouch()) setTimeout(() => $('talkIn').focus(), 30);
}
function setChips(list) {
  $('chips').innerHTML = list.map((c) => `<button type="button" class="chip">${c}</button>`).join('');
  document.querySelectorAll('#chips .chip').forEach((b) => b.addEventListener('click', () => { const i = $('talkIn'); i.value = b.textContent.slice(0, TALK.limit); updateLeft(); i.focus(); }));
}
function setButtons(list) {
  $('talkBtns').innerHTML = '';
  list.forEach((b) => { const el = document.createElement('button'); el.type = 'button'; el.className = 'tb2' + (b.red ? ' red' : ''); el.textContent = b.text; el.addEventListener('click', b.fn); $('talkBtns').appendChild(el); });
}
function addLine(kind, name, text) {
  const d = document.createElement('div'); d.className = 'line ' + kind;
  d.innerHTML = (name ? `<span class="n">${name}</span>` : '') + '<span class="t"></span>';
  d.querySelector('.t').textContent = text || '';
  if (kind === 'them' && !text) d.querySelector('.t').innerHTML = '<span class="typing"></span>';
  $('talkLog').appendChild(d); $('talkLog').scrollTop = 1e6;
  TALK.log.push({ kind, name, text });
  return d;
}
// поток токенов → текст + «бормотание» голосом персонажа
function streamTo(el, voice, bubble) {
  let n = 0;
  return (delta, full) => {
    const t = el.querySelector('.t'); t.textContent = full;
    if (bubble) setBubble(full);
    $('talkLog').scrollTop = 1e6;
    n += delta.length; while (n > 3) { n -= 3; SFX.voice(voice); }
    const who = voice === 'baba' ? PEOPLE.baba : voice === 'mih' ? PEOPLE.mih : voice === 'gena' ? PEOPLE.gena : null;
    if (who) who.talking = 0.35;
  };
}
// заготовленная реплика печатается так же, как живая
function typeOut(text, onTok, speed = 38) {
  return new Promise((res) => {
    let i = 0; const step = () => {
      if (i >= text.length) { res(text); return; }
      const k = Math.min(text.length, i + 2 + Math.floor(Math.random() * 3)); const d = text.slice(i, k); i = k;
      onTok(d, text.slice(0, i)); setTimeout(step, speed);
    };
    step();
  });
}
async function say(voice, el, aiCall, fallback, bubble) {
  const onTok = streamTo(el, voice, bubble);
  if (useAI()) {
    try { const txt = await aiCall(onTok); if (txt && txt.trim()) { const clean = cleanLine(txt); onTok('', clean); return clean; } }
    catch (e) { aiFail(e); }
  }
  const fb = typeof fallback === 'function' ? fallback() : fallback;
  await typeOut(fb, onTok);
  return fb;
}
function cleanLine(s) { return String(s).replace(/\*[^*]*\*/g, '').replace(/^["«»\s]+|["«»\s]+$/g, '').replace(/^(Зинаида Петровна|Михалыч|Геннадий)[^:]{0,20}:\s*/i, '').trim(); }

/* ---------- заплетающийся язык ---------- */
function slur(text, d) {
  if (d < 2.5) return text;
  const p = Math.min(0.55, (d - 2) * 0.16);
  return text.split(' ').map((w) => {
    if (w.length < 4 || Math.random() > p) return w;
    const r = Math.random(), i = 1 + Math.floor(Math.random() * (w.length - 2));
    if (r < 0.4) return w.slice(0, i) + w[i] + w.slice(i);                    // дребезг буквы
    if (r < 0.75) return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);    // перестановка
    return w.slice(0, i) + w.slice(i + 1);                                    // проглотил
  }).join(' ') + (d >= 4 && Math.random() < 0.6 ? ' (ик)' : '');
}
function excuseLimit() { return clamp(40 + courage() * 2, 50, 240); }

/* ---------- правда о квартире: что видит нейросеть ---------- */
function positives() {
  const good = [];
  const okStrips = JOB.strips.filter((s) => s.done && !s.flipped && Math.abs(s.tilt) < THREE.MathUtils.degToRad(1.3) && !s.overCarpet && !s.overSwitch).length;
  if (okStrips) good.push(`${okStrips} полос обоев поклеены ровно`);
  const okTiles = JOB.tiles.cells.filter((c) => c.mesh && Math.abs(c.rot) < THREE.MathUtils.degToRad(2.2) && !c.flipped).length;
  if (okTiles) good.push(`${okTiles} плиток положены ровно`);
  if (JOB.hole.state === 'patched' && JOB.hole.lumps <= 3) good.push('дыра в прихожей аккуратно заделана');
  if (JOB.tap.stage === 2 && JOB.tap.flax) good.push('новый кран поставлен как надо, со льном');
  if (JOB.cat.fed) good.push('кот накормлен');
  if (JOB.carpet.onWall && JOB.carpet.everRemoved && !JOB.carpet.covered) good.push('ковёр снимали и аккуратно повесили обратно поверх новых обоев');
  return good;
}
function mastersState() {
  const b = G.beers;
  return b === 0 ? 'мастер трезв' : `мастер выпил ${plural(b, 'бутылку', 'бутылки', 'бутылок')} пива${G.drunk >= 3 ? ', от него разит пивом, язык заплетается' : ', пахнет пивом'}`;
}
function truthText(flaws) {
  const f = (flaws || collectFlaws()).map((x) => '— ' + x.fact).join('\n') || '— явных косяков нет';
  const g = positives();
  return `ПРАВДА О РЕМОНТЕ (ты видишь это своими глазами):\n${f}\nЧТО СДЕЛАНО ХОРОШО: ${g.length ? g.join('; ') : 'ничего примечательного'}.\nСОСТОЯНИЕ МАСТЕРА: ${mastersState()}; перекуров на балконе: ${JOB.smokes}.`;
}
function heardText() {
  const L = G.log.slice(-8).map((s) => s.replace(/^\d\d:\d\d /, '')).join('; ');
  return L || 'пока ничего особенного';
}

/* ================================================================
   ЗВОНКИ ХОЗЯЙКИ
   ================================================================ */
const CALLS = [
  { at: 10 * 60 + 40, topic: 'Проверяешь, как дела. Напоминаешь покормить Барсика и строго предупреждаешь: пиво в ящике — для зятя Толика, не трогать. Спрашиваешь, какие обои он взял.' },
  { at: 13 * 60 + 30, topic: 'Одной фразой рассказываешь новость от сестры. Спрашиваешь, как там плитка в ванной и перекрыл ли он воду, прежде чем менять кран.' },
  { at: 16 * 60 + 20, topic: 'Сообщаешь, что выезжаешь и будешь ровно к шести. Строго спрашиваешь, всё ли будет готово, и предупреждаешь, что будешь принимать работу, как контрольную.' },
];
const RING = { on: false, t: 0, idx: -1, beat: 0, retried: {}, queue: [] };
const DOOR = { on: false, t: 0, beat: 0 };
const PROMISES = [];
function onDayStart() {
  RING.queue = CALLS.map((c, i) => ({ at: c.at + Math.round((Math.random() - 0.5) * 20), idx: i }));
  // телефон, балкон, дверь — точки взаимодействия
  W.objs.phone.traverse((o) => { if (o.isMesh) markInter(o, { look: () => RING.on
    ? { name: 'Телефон надрывается', e: { text: 'снять трубку', fn: answerPhone } }
    : { name: 'Телефон', e: { text: 'позвонить хозяйке: «всё готово»', fn: askFinish } } }); });
  const rail = hitBox(2.55, 0.6, -1.34, 4.85, 1.2, -1.2, null);
  rail.userData.it = { look: () => ({ name: 'Перила балкона. Михалыч курит рядом', e: { text: 'перекурить (15 мин)', fn: startSmoke } }) };
  W.objs.entrance.traverse((o) => { if (o.isMesh) markInter(o, { look: () => DOOR.on ? { name: 'Звонят в дверь', e: { text: 'открыть', fn: openDoorGena } } : { name: 'Входная дверь', e: { text: 'не выходить: работа ждёт', off: true } } }); });
  pickList = W.inter.concat(W.occl);
  PEOPLE.mih.root.visible = true;
  updateRollPreview();
  logEvent('начал работу');
}
function dayEvents(dt) {
  // хозяйка звонит по расписанию
  if (!RING.on && RING.queue.length && G.t >= RING.queue[0].at && G.t < G.end - 10) { const c = RING.queue.shift(); startRing(c.idx); }
  if (RING.on) {
    RING.t += dt; RING.beat -= dt; G.stress = Math.min(100, G.stress + dt * 0.8);
    if (RING.beat <= 0) { RING.beat = 3.4; SFX.play('ring'); }
    if (RING.t > 26) missCall();
  }
  // сосед снизу приходит, если натекло
  const T = JOB.tap;
  if (!JOB.gena.visited && T.liters > 14 && !JOB.gena.due) JOB.gena.due = G.t + 22 + Math.random() * 10;
  if (JOB.gena.due && !JOB.gena.visited && !DOOR.on && G.t >= JOB.gena.due) { DOOR.on = true; DOOR.t = 0; toast('Звонят в дверь. Настойчиво.', 'warn', 3000); }
  if (DOOR.on) {
    DOOR.t += dt; DOOR.beat -= dt;
    if (DOOR.beat <= 0) { DOOR.beat = 4.5; SFX.play('doorbell'); }
    if (DOOR.t > 40) { DOOR.on = false; JOB.gena.visited = true; JOB.gena.told = true; JOB.gena.demand = 5000; toast('За дверью ушли, громко топая. Кажется, звонить хозяйке.', 'bad', 3600); logEvent('не открыл дверь соседу снизу, тот ушёл жаловаться хозяйке'); }
  }
  // икота
  if (G.drunk >= 3 && Math.random() < dt * 0.05) SFX.play('hic');
  // шесть вечера — приёмка
  if (G.t >= G.end && !G.accepting) startAcceptance();
}
function startRing(idx) {
  RING.on = true; RING.t = 0; RING.idx = idx; RING.beat = 0;
  $('phoneRing').classList.remove('hidden');
  $('ringText').textContent = 'Звонит телефон — в прихожей';
}
function stopRing() { RING.on = false; $('phoneRing').classList.add('hidden'); }
function missCall() {
  stopRing(); JOB.missed++; G.stress = Math.min(100, G.stress + 8);
  logEvent('не взял трубку, когда звонила хозяйка');
  toast('Телефон замолчал. Хозяйка это запомнит.', 'bad', 2800);
  if (!RING.retried[RING.idx]) { RING.retried[RING.idx] = 1; RING.queue.unshift({ at: G.t + 25, idx: RING.idx }); }
}
function onBlackout() { if (RING.on) missCall(); }
function answerPhone() {
  const idx = RING.idx; stopRing(); JOB.calls++;
  W.objs.handset.visible = false;
  const call = CALLS[idx];
  const hist = [];
  const sys = `${BABA}\nСейчас ${clockStr()}. Ты у сестры за городом и звонишь мастеру на домашний телефон. Квартиру ты НЕ видишь и знаешь только то, что мастер скажет. Но вот что на самом деле (прямо об этом не говори, но можешь подозревать и задавать неудобные вопросы; если что-то слышно в трубке — реагируй): ${mastersState()}; мастер сегодня делал: ${heardText()}.${JOB.missed ? ' До этого он не брал трубку ' + JOB.missed + ' раз(а) — ты недовольна.' : ''}${JOB.gena.told ? ' Тебе уже звонил сосед снизу Геннадий: мастер его затопил. Ты в ярости.' : ''}\nТема звонка: ${call.topic}\n${STYLE}`;
  let turns = 0;
  const end = () => { W.objs.handset.visible = true; spend(6); closeTalk(); };
  openTalk({ kind: 'call', who: 'Зинаида Петровна', where: 'по телефону', placeholder: 'Ответить в трубку…', limit: 200,
    chips: pick([['Всё идёт по плану', 'Работаю, не волнуйтесь', 'Какие обои? А, эти…'], ['Плитка — огонь', 'Воду? Конечно перекрыл', 'Всё под контролем'], ['Будет готово!', 'Почти закончил', 'Ещё чуть-чуть']]),
    buttons: [{ text: 'Положить трубку', fn: end }],
    onSend: async (text) => {
      const my = slur(text, G.drunk);
      addLine('me', '', my); hist.push({ role: 'user', content: 'Мастер: ' + my }); PROMISES.push(`по телефону в ${clockStr()} мастер сказал: «${my}»`);
      turns++; enableInput(false);
      const el = addLine('them', 'Зинаида Петровна');
      const last = turns >= 2;
      const txt = await say('phone', el, (onToken) => AI.chat(hist, { system: sys + (last ? '\nЭто конец разговора: закругляйся, попрощайся по-своему и положи трубку.' : ''), maxTokens: 150, temperature: 0.9, onToken }), () => demoPhone(idx, text, last));
      hist.push({ role: 'assistant', content: txt });
      if (last) { setButtons([{ text: 'Повесить трубку', fn: end }]); $('talkForm').classList.add('hidden'); setChips([]); }
      else enableInput(true);
    } });
  const el = addLine('them', 'Зинаида Петровна');
  say('phone', el, (onToken) => AI.chat([{ role: 'user', content: 'Мастер снял трубку: «Алло».' }], { system: sys, maxTokens: 150, temperature: 0.9, onToken }), () => demoPhone(idx, '', false))
    .then((t) => { hist.push({ role: 'user', content: 'Мастер снял трубку: «Алло».' }, { role: 'assistant', content: t }); enableInput(true); });
  SFX.play('click');
}
function askFinish() {
  openTalk({ kind: 'finish', who: 'Позвонить хозяйке?', where: 'закончить день раньше', buttons: [
    { text: 'Звоню: «Всё готово!»', fn: () => { closeTalk(); G.t = Math.max(G.t, Math.min(G.end - 1, G.t + 30)); G.end = G.t + 1; logEvent('позвонил хозяйке и сказал, что всё готово'); PROMISES.push('мастер сам позвонил и сказал: «Всё готово, принимайте»'); toast('Зинаида Петровна едет. Полчаса пролетели как минута.', '', 3000); } },
    { text: 'Ещё поработаю', fn: () => closeTalk() },
  ] });
  addLine('sys', '', 'Она приедет и начнёт приёмку. Всё, что не сделано, — тоже косяк.');
}

/* ================================================================
   ПЕРЕКУР С МИХАЛЫЧЕМ
   ================================================================ */
const MIH_MEM = [];
function mihTip() {
  const T = JOB.tap;
  if (T.stage === 0 && !T.valveClosed) return 'перед тем как снимать кран, перекрой вентиль под мойкой, он там красный, — а то будет как у Гены в восемьдесят шестом';
  if (JOB.hole.state === 'calendar') return 'Зинка под все календари заглядывает: у неё покойный Коля заначку за календарём прятал';
  if (JOB.carpet.onWall && !JOB.carpet.covered && JOB.strips.some((s) => !s.done && s.wall === 'W')) return 'ковёр со стены сперва сними, а то был у нас умелец — обои прямо на ковёр поклеил';
  if (G.beers >= 3) return 'с пивом притормози: Зинка пустые бутылки считает, у неё глаз-алмаз';
  if (JOB.tiles.placed < 20) return 'плитку клади не спеша и от середины: Зинка за кривые строчки в школе двойки ставила';
  if (!JOB.cat.fed) return 'кота покорми, а то Зинка за Барсика тебе голову открутит';
  return 'на приёмке с Зинкой спорь уверенно, она это уважает, но не хами — не любит';
}
function startSmoke() {
  if (G.busy) return;
  JOB.smokes++;
  const m = PEOPLE.mih; m.root.visible = true; m.pose = 'smoke';
  G.mode = 'talk';
  const cam0 = { x: P.x, z: P.z, yaw: P.yaw, pitch: P.pitch };
  P.x = 4.12; P.z = -0.8; P.yaw = P.tyaw = -1.64; P.pitch = P.tpitch = -0.05;
  camera.position.set(P.x, P.h, P.z); camera.rotation.set(P.pitch, P.yaw, 0);
  showToolModel('cig'); vm.root.visible = true;
  SFX.play('lighter'); setTimeout(() => SFX.play('inhale'), 700);
  G.smoking = true; G.smokeT = 0;
  const hist = [];
  const topics = ['как в 1974-м сдавали этот дом и что забыли в ванной', 'как ты в армии красил траву перед приездом генерала', 'как вы с Люсей клеили обои в восьмидесятом', 'про рыбалку и щуку, которая утащила удочку', 'как Гена снизу в прошлом году сам себя затопил', 'как Зинаида Петровна в молодости принимала экзамены', 'про первого мастера, которого Зинка выгнала'];
  const topic = topics[(JOB.smokes - 1) % topics.length];
  const sys = `${MIH}\nСейчас ${clockStr()}. К тебе на соседний балкон вышел покурить шабашник, который делает ремонт у Зинаиды Петровны. Через стенку ты слышал, что он сегодня делал: ${heardText()}. ${mastersState()}.\nРаньше ты ему уже рассказывал: ${MIH_MEM.join('; ') || 'ничего'}.\nСейчас расскажи байку: ${topic}. Мимоходом дай ему один дельный совет: ${mihTip()}.\n${STYLE} Для байки можно до 60 слов.`;
  let turns = 0;
  const finish = () => {
    closeTalk(false); G.smoking = false;
    G.stress = Math.max(0, G.stress - 40); spend(15);
    showToolModel(toolId());
    P.x = cam0.x; P.z = cam0.z; P.yaw = P.tyaw = cam0.yaw; P.pitch = P.tpitch = cam0.pitch;
    G.mode = 'play'; lockPointer();
    toast('Докурили. Нервы — как новые. Время — минус 15 минут.', '', 2600);
    logEvent('курил на балконе с Михалычем');
  };
  openTalk({ kind: 'smoke', who: 'Михалыч', where: 'с соседнего балкона', placeholder: 'Поддержать разговор…', limit: 160,
    chips: ['А дальше что?', 'Да ладно!', 'Михалыч, дай совет'], buttons: [{ text: 'Докурить и за работу', fn: finish }],
    onSend: async (text) => {
      const my = slur(text, G.drunk);
      addLine('me', '', my); hist.push({ role: 'user', content: 'Шабашник: ' + my }); turns++; enableInput(false);
      const el = addLine('them', 'Михалыч');
      const txt = await say('mih', el, (onToken) => AI.chat(hist, { system: sys + (turns >= 2 ? '\nСигарета догорает: закругляйся одной фразой.' : ''), maxTokens: 200, temperature: 1.0, onToken }), () => demoMih(text));
      hist.push({ role: 'assistant', content: txt });
      if (turns >= 2) { $('talkForm').classList.add('hidden'); setChips([]); } else enableInput(true);
    } });
  const el = addLine('them', 'Михалыч');
  say('mih', el, (onToken) => AI.chat([{ role: 'user', content: 'Шабашник вышел на балкон и закурил: «Здоро́во, сосед».' }], { system: sys, maxTokens: 260, temperature: 1.0, onToken }), () => demoMihStory())
    .then((t) => { hist.push({ role: 'user', content: 'Шабашник вышел на балкон и закурил.' }, { role: 'assistant', content: t }); MIH_MEM.push(topic); enableInput(true); });
}
function talkTick(dt) {
  if (G.smoking) {
    G.smokeT += dt;
    camera.position.set(P.x, P.h, P.z);
    camera.rotation.set(P.pitch + Math.sin(simTime * 0.3) * 0.01, P.yaw + Math.sin(simTime * 0.2) * 0.02, 0);
    if (Math.random() < dt * 2.5) smokePuff(camera.localToWorld(new THREE.Vector3(0.05, -0.05, -0.35)), 0.6);
    const e = vm.tools.cig.userData.ember; if (e) e.material.color.setHSL(0.05, 1, 0.5 + Math.sin(simTime * 4) * 0.1);
  }
}

/* ================================================================
   СОСЕД СНИЗУ
   ================================================================ */
function openDoorGena() {
  DOOR.on = false; JOB.gena.visited = true;
  const g = PEOPLE.gena; g.root.visible = true; g.mood = -1; g.pose = 'angry';
  W.objs.entrance.rotation.y = 1.3; SFX.play('creak');
  G.mode = 'talk';
  P.x = 6.9; P.z = 4.75; P.yaw = P.tyaw = Math.PI; P.pitch = P.tpitch = -0.05;
  camera.position.set(P.x, P.h, P.z); camera.rotation.set(P.pitch, P.yaw, 0);
  const hist = [];
  let anger = 8, turns = 0, gaveBeer = false, closed = false;
  const litres = Math.round(JOB.tap.liters);
  const sys = `${GENA}\nСейчас ${clockStr()}. Сверху натекло около ${litres} литров. ${mastersState()}. Не повторяйся.\n${STYLE}`;
  const schema = '{"reply": "твоя реплика мастеру, 1–3 предложения", "anger": "злость от 0 до 10", "demand": "сколько рублей требуешь за побелку, целое 0–15000", "done": "true, если разговор окончен и ты уходишь", "callOwner": "true, если идёшь звонить Зинаиде Петровне"}';
  const leave = (res) => {
    closed = true; g.pose = null; g.mood = res.callOwner ? -1 : 0;
    JOB.gena.demand = res.demand; JOB.gena.told = !!res.callOwner; JOB.gena.mood = res.callOwner ? 'пошёл жаловаться хозяйке' : 'ушёл';
    logEvent(res.callOwner ? `сосед снизу ушёл жаловаться хозяйке, требует ${res.demand} ₽` : `сосед снизу успокоился и ушёл${res.demand ? ', требует ' + res.demand + ' ₽' : ''}`);
    setTimeout(() => { g.root.visible = false; W.objs.entrance.rotation.y = 0; SFX.play('thud'); closeTalk(); }, 900);
  };
  const turn = async (userMsg) => {
    enableInput(false);
    const el = addLine('them', 'Геннадий Аркадьевич');
    let res;
    const fb = () => demoGena(userMsg, anger, gaveBeer, turns);
    if (useAI()) {
      g.pose = 'angry';
      res = await AI.json([...hist, { role: 'user', content: userMsg }], { system: sys, schemaHint: schema, maxTokens: 220, temperature: 0.8, fallback: (e) => { aiFail(e); return fb(); } });
    } else res = fb();
    res = checkGena(res, anger);
    anger = res.anger; g.mood = anger > 5 ? -1 : anger < 3 ? 1 : 0; g.pose = anger > 6 ? 'angry' : null;
    await typeOut(res.reply, streamTo(el, 'gena'));
    hist.push({ role: 'user', content: userMsg }, { role: 'assistant', content: JSON.stringify(res) });
    if (res.done || turns >= 3) { if (!res.done) res.callOwner = anger > 5; addLine('sys', '', res.callOwner ? `Геннадий уходит звонить хозяйке.${res.demand ? ' Требует ' + rub(res.demand) + '.' : ''}` : `Геннадий уходит.${res.demand ? ' Но просит ' + rub(res.demand) + ' на побелку.' : ' Претензий нет.'}`); leave(res); return; }
    enableInput(true);
  };
  openTalk({ kind: 'gena', who: 'Геннадий Аркадьевич', where: 'сосед снизу, в дверях', placeholder: 'Объясниться…', limit: excuseLimit(),
    chips: ['Извините, сейчас всё уберу', 'Это не я, это трубы', 'Хотите пива?'],
    buttons: [
      { text: 'Дать бутылку пива', fn: () => { if (closed || TALK.busy) return; const b = W.objs.bottles.filter((q) => q.visible).pop(); if (!b) { toast('Пиво кончилось.', 'warn'); return; } b.visible = false; gaveBeer = true; JOB.gena.gaveBeer = true; turns++; addLine('me', '', '(протягиваю бутылку «Пятиэтажного»)'); turn('Мастер молча протянул тебе бутылку холодного пива.'); } },
      { text: 'Закрыть дверь перед носом', red: true, fn: () => { if (closed) return; addLine('me', '', '(закрываю дверь)'); leave({ reply: '', anger: 10, demand: 8000, callOwner: true }); } },
    ],
    onSend: (text) => { const my = slur(text, G.drunk); addLine('me', '', my); turns++; turn('Мастер: ' + my); } });
  turn('Мастер открыл дверь.');
}
function checkGena(r, prevAnger) {
  const o = r && typeof r === 'object' ? r : {};
  const reply = typeof o.reply === 'string' && o.reply.trim() ? cleanLine(o.reply).slice(0, 320) : 'У меня с потолка льёт! Вы там что, бассейн открыли?';
  let anger = Number(o.anger); if (!isFinite(anger)) anger = prevAnger; anger = clamp(Math.round(anger), 0, 10);
  let demand = Number(o.demand); if (!isFinite(demand)) demand = 3000; demand = clamp(Math.round(demand / 500) * 500, 0, 15000);
  const done = o.done === true || o.done === 'true';
  const callOwner = o.callOwner === true || o.callOwner === 'true';
  return { reply, anger, demand, done, callOwner };
}

/* ================================================================
   ПРИЁМКА
   ================================================================ */
const ACC = { list: [], i: -1, tally: PRICE, rows: [], missed: [], transcript: [], openers: {}, circle: null, cam: null, look: null, stage: '' };
const ROOM_ORDER = { hall: 0, zal: 1, kit: 2, bath: 3 };
const CHIPS = {
  generic: ['Так задумано', 'Это евроремонт', 'Сейчас так модно', 'Оно само', 'Это усадка дома', 'Зато быстро', 'Это временно', 'Дизайнерское решение'],
  wp_carpet: ['Это утепление', 'Ковёр внутри — для акустики'], wp_upside: ['Это для лежачих', 'Так в Европе клеят'], paint_cat: ['Барсик сам полез'], beer: ['Это от давления'],
  paint_tv: ['Это эффект снега'], wp_switch: ['Свет — это лишнее'], hole_cal: ['Зато какой календарь!'], tile_decor: ['Кораблик возвращается'], flood: ['Проверял стояк'],
};
async function startAcceptance() {
  if (G.accepting) return;
  G.accepting = true; stopRing(); DOOR.on = false; closeTalk(false);
  G.mode = 'cine'; G.holding = false;
  try { document.exitPointerLock && document.exitPointerLock(); } catch (e) { /* ок */ }
  $('tools').classList.add('hidden'); $('note').classList.add('hidden'); $('cross').classList.add('hidden'); $('prompt').innerHTML = '';
  $('touch').classList.add('hidden');
  SFX.play('creak');
  toast('Щёлкнул замок. Зинаида Петровна вернулась. <b>Приёмка.</b>', '', 4000);
  const { found, missed } = visibleFlaws();
  found.sort((a, b) => (ROOM_ORDER[a.room] - ROOM_ORDER[b.room]) || (b.sev - a.sev));
  let list = found;
  if (list.length > 7) { const keep = [...list].sort((a, b) => b.sev - a.sev).slice(0, 7); list = list.filter((f) => keep.includes(f)); ACC.rest = found.filter((f) => !keep.includes(f)); } else ACC.rest = [];
  ACC.list = list; ACC.missed = missed; ACC.all = found;
  $('envelope').classList.remove('hidden'); renderEnvelope();
  // бабушка входит
  const b = PEOPLE.baba; b.root.visible = true; b.root.position.set(6.9, 0, 5.35); b.root.rotation.y = Math.PI; b.targetYaw = Math.PI; b.mood = 0; b.pose = null;
  W.objs.entrance.rotation.y = 1.3;
  ACC.cam = new THREE.Vector3(5.6, 1.55, 4.6); ACC.look = new THREE.Vector3(6.9, 1.2, 5.3);
  camera.position.copy(ACC.cam);
  // все первые реплики готовим заранее и параллельно (очередь клиента — до 4 запросов)
  const shift = Math.floor(Math.random() * ANGLES.length);
  if (useAI()) ACC.list.forEach((f, i) => { ACC.openers[f.id] = openerAI(f, i + shift); });
  await sleepMs(1200);
  walkTo(b, [[6.9, 4.7]], () => { W.objs.entrance.rotation.y = 0; SFX.play('thud'); });
  await sleepMs(1400);
  const hello = useAI() ? null : pick(['Ну-с, молодой человек, показывайте, что тут наработали.', 'Здравствуйте, мастер. Пойдёмте смотреть. Очки я взяла.']);
  bubbleFor(b);
  await say('baba', addLine('them', 'Зинаида Петровна'), (onToken) => AI.chat([{ role: 'user', content: 'Ты вошла в квартиру. Мастер встречает тебя в прихожей.' }], { system: `${BABA}\n${truthText(ACC.all)}\nТы только вошла и ещё ничего не рассмотрела. Поздоровайся и скажи, что начинаешь приёмку. Можешь принюхаться, если мастер пил.\n${STYLE}`, maxTokens: 90, onToken }), hello || 'Ну-с, молодой человек, показывайте.', true);
  $('talk').classList.add('hidden');
  await sleepMs(1500);
  nextFlaw();
}
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
// первые реплики пишутся параллельно и не видят друг друга — каждой свой приём, чтобы не повторялись
const ANGLES = [
  'сравни с чем-то из школьной жизни: диктант, дневник, двоечник у доски',
  'сравни с бытом: очередь в гастрономе, дача, соседки у подъезда',
  'задай ехидный вопрос с подвохом',
  'сделай вид, что восхищена, и тут же уничтожь',
  'поправь его «ремонтный русский», как учительница',
  'пригрози рассказать сестре и всему подъезду',
  'обратись к коту Барсику как к свидетелю',
  'вспомни, как это сделал бы покойный Коля',
];
function openerAI(f, k) {
  return AI.chat([{ role: 'user', content: `Ты подошла и видишь косяк: ${f.fact}. Возмутись или съязви — конкретно про то, что видишь. Приём: ${ANGLES[k % ANGLES.length]}. Это твоя первая реплика про этот косяк.` }],
    { system: `${BABA}\n${truthText(ACC.all)}\n${STYLE}`, maxTokens: 130, temperature: 0.9 }).then(cleanLine).catch((e) => { aiFail(e); return null; });
}
function nextFlaw() {
  ACC.i++;
  const b = PEOPLE.baba;
  if (ACC.i >= ACC.list.length) { finalVerdict(); return; }
  const f = ACC.list[ACC.i];
  b.pose = null; b.pointAt = null; hideCircle(); hideBubble();
  $('talk').classList.add('hidden');
  const p = b.root.position, far = Math.hypot(p.x - f.stand[0], p.z - f.stand[1]) > 1.4;
  // в другую комнату или через весь зал — монтажная склейка через затемнение, рядом — пешком
  if (far || roomAt(p.x, p.z) !== roomAt(f.stand[0], f.stand[1])) cutTo(() => { b.path = null; b.state = 'idle'; p.set(f.stand[0], 0, f.stand[1]); b.root.rotation.y = Math.atan2(f.where.x - f.stand[0], f.where.z - f.stand[1]); arriveFlaw(f); });
  else walkTo(b, [f.stand], () => arriveFlaw(f));
}
// затемнение-склейка: пока экран чёрный, переставляем людей и камеру
function cutTo(fn) {
  const sh = $('shade'); sh.classList.add('cut', 'on');
  setTimeout(() => { fn(); setTimeout(() => sh.classList.remove('on'), 80); setTimeout(() => sh.classList.remove('cut'), 600); }, 340);
}
// Ракурс на приёмке: видно лицо бабушки (в три четверти) и сам косяк, камера в той же
// комнате, не в мебели и не за стеной. Перебираем сетку точек и берём лучшую.
const _rc = { ray: null };
function camFrame(f) {
  const b = PEOPLE.baba;
  const S = new THREE.Vector3(f.stand[0], 0, f.stand[1]), F = f.where.clone();
  const face = headWorld(b); face.x = S.x; face.z = S.z; face.y -= 0.12;
  const gaze = new THREE.Vector3(F.x - S.x, 0, F.z - S.z).normalize();
  const key = roomAt(S.x, S.z);
  const areas = [W.rooms[key] || W.rooms.zal]; if (key === 'bath') areas.push(W.rooms.hall);
  const vfov = THREE.MathUtils.degToRad(baseFov()), hfov = 2 * Math.atan(Math.tan(vfov / 2) * innerWidth / innerHeight);
  // от мебели — с запасом: вплотную к столу в кадр лезут гладиолусы
  const free = (x, z) => !W.colliders.some((c) => { const m = c[2] - c[0] < 1.4 && c[3] - c[1] < 1.4 && c[2] - c[0] > 0.9 ? 0.45 : 0.28; return x > c[0] - m && x < c[2] + m && z > c[1] - m && z < c[3] + m; });
  const ray = _rc.ray || (_rc.ray = new THREE.Raycaster()); ray.camera = camera;
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const inside = scene.children.filter((o) => o !== W.objs.outside && o !== W.objs.sky && !o.isLight);   // двор за окном не заслоняет
  // заслоняет всё видимое и непрозрачное, кроме самой бабушки и того, что рядом с целью
  const seen = (from, to) => {
    const d = to.clone().sub(from), L = d.length(); ray.set(from, d.normalize()); ray.far = L - 0.1;
    return !ray.intersectObjects(inside, true).some((h) => h.object.isMesh && shown(h.object) && h.object.material && h.object.material.visible !== false
      && !(h.object.material.transparent && h.object.material.opacity < 0.6) && h.object.userData.tag !== 'baba' && h.point.distanceTo(to) > 0.3);
  };
  const camY = F.y < 0.6 ? 1.62 : 1.5;
  const cands = [];
  for (const R of areas) for (let x = R.x0 + 0.24; x <= R.x1 - 0.24; x += 0.16) for (let z = R.z0 + 0.24; z <= R.z1 - 0.24; z += 0.16) {
    if (!free(x, z) || (key === 'zal' && Math.hypot(x - 2.5, z - 1.9) < 0.95)) continue;      // не под люстрой
    const c = new THREE.Vector3(x, camY, z);
    const toC = new THREE.Vector3(x - S.x, 0, z - S.z), dist = toC.length();
    if (dist < 1.0 || dist > 3.4) continue;
    const ang = THREE.MathUtils.radToDeg(gaze.angleTo(toC.normalize()));        // 0 — камера там, куда она смотрит
    const a = face.clone().sub(c).normalize(), bb = F.clone().sub(c).normalize();
    const hs = Math.abs(Math.atan2(a.x, a.z) - Math.atan2(bb.x, bb.z)); const sep = Math.min(hs, Math.PI * 2 - hs);
    if (sep > hfov * 0.78) continue;                                           // оба не влезают по ширине
    // лучше всего — сбоку и чуть спереди: лицо в три четверти и косяк в одном кадре
    cands.push({ c, score: -Math.abs(ang - 68) / 30 - Math.abs(dist - 2.0) * 0.8 - sep / hfov * 0.5 });
  }
  cands.sort((p, q) => q.score - p.score);
  let best = null;
  for (let i = 0; i < cands.length && i < 60 && !best; i++) if (seen(cands[i].c, face) && seen(cands[i].c, F)) best = cands[i].c;
  if (!best) { const R = areas[0]; best = new THREE.Vector3(THREE.MathUtils.clamp(S.x - gaze.x * 1.2, R.x0 + 0.3, R.x1 - 0.3), 1.5, THREE.MathUtils.clamp(S.z - gaze.z * 1.2, R.z0 + 0.3, R.z1 - 0.3)); }
  // другая комната — монтажная склейка, а не пролёт сквозь стену
  const cut = roomAt(camera.position.x, camera.position.z) !== roomAt(best.x, best.z) || camera.position.distanceTo(best) > 1.6;
  ACC.cam = best;
  ACC.look = F.clone().lerp(face, 0.5);
  if (cut) { camera.position.copy(best); camera.lookAt(ACC.look); }
}
function arriveFlaw(f) {
  const b = PEOPLE.baba;
  faceTo(b, f.where.x, f.where.z);
  camFrame(f);
  setTimeout(() => { b.pose = 'point'; b.pointAt = f.where.clone(); showCircle(f.where); SFX.play('pen'); }, 500);
  setTimeout(() => confront(f), 900);
}
async function confront(f) {
  const b = PEOPLE.baba;
  b.mood = -1;
  bubbleFor(b);
  openTalk({ kind: 'accept', who: `Косяк ${ACC.i + 1} из ${ACC.list.length}: ${f.title}`, where: 'приёмка', placeholder: 'Ваша отмазка…', limit: excuseLimit(), pause: false,
    chips: [...(CHIPS[f.id] || []), ...pickN(CHIPS.generic, 4)].slice(0, 5),
    buttons: [{ text: 'Промолчать', fn: () => { if (TALK.busy) return; respond(f, '(молчит, смотрит в пол)'); } }],
    onSend: (text) => respond(f, text) });
  G.mode = 'cine';
  const el = addLine('them', 'Зинаида Петровна');
  let pre = null;
  if (useAI() && ACC.openers[f.id]) { b.pose = 'point'; pre = await ACC.openers[f.id]; }
  const line = pre || demoOpener(f);
  await typeOut(line, streamTo(el, 'baba', true), 32);
  f.opener = line;
  ACC.transcript.push(`Косяк «${f.title}». Бабушка: «${line}»`);
  enableInput(true);
  const hint = addLine('sys', '', `Смелость: ${courage()} из 100 — ${TALK.limit} знаков на отмазку.`);
  void hint;
}
function pickN(a, n) { const c = [...a]; const out = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(Math.random() * c.length), 1)[0]); return out; }
async function respond(f, text) {
  const b = PEOPLE.baba;
  enableInput(false); setButtons([]); setChips([]);
  const my = text.startsWith('(') ? text : slur(text, G.drunk);
  addLine('me', '', my);
  f.excuse = my;
  b.pose = 'think'; b.mood = 0;
  const el = addLine('them', 'Зинаида Петровна');
  setBubble('<span class="typing"></span>');
  const sys = `${BABA}\n${truthText(ACC.all)}\nСейчас приёмка. Ты стоишь у косяка: ${f.fact}.\nТвоя первая реплика: «${f.opener}».\n${STYLE}`;
  const reply = await say('baba', el, (onToken) => AI.chat([{ role: 'user', content: `Мастер оправдывается: «${my}»${G.drunk >= 3 ? ' (язык заплетается, разит пивом)' : ''}. Ответь ему: прими, отчасти прими или разнеси отмазку — по существу его слов, не повторяя приёмов своей первой реплики.` }], { system: sys, maxTokens: 150, temperature: 0.9, onToken }), () => demoReply(f, text), true);
  b.pose = null;
  ACC.transcript.push(`Мастер: «${my}». Бабушка: «${reply}»`);
  // решение по косяку — строго через JSON
  const fb = () => demoJudge(f, text);
  let j = useAI() ? await AI.json([{ role: 'user', content: `Косяк: ${f.fact}.\nТы сказала: «${f.opener}».\nМастер ответил: «${my}».\nТы ответила: «${reply}».\nРеши, сколько вычесть за этот косяк из оплаты. Максимум — ${f.max} ₽. Серьёзный косяк и наглая ложь — ближе к максимуму. Остроумная или честная отмазка может скостить. Пометка — как красной ручкой в тетради.` }],
    { system: `${BABA}\n${mastersState()}.`, schemaHint: `{"verdict": "принято | частично | не принято", "deduct": "целое число рублей от 0 до ${f.max}", "note": "пометка красной ручкой, 2–6 слов"}`, maxTokens: 120, temperature: 0.4, fallback: (e) => { aiFail(e); return fb(); } }) : fb();
  j = checkJudge(j, f);
  f.judge = j;
  ACC.tally -= j.deduct;
  ACC.rows.push({ title: f.title, deduct: j.deduct, note: j.note, verdict: j.verdict });
  b.mood = j.verdict === 'принято' ? 1 : j.verdict === 'частично' ? 0 : -1;
  if (j.verdict === 'принято') b.pose = null;
  renderEnvelope(true);
  SFX.play(j.deduct > 0 ? 'thud' : 'coin');
  setButtons([{ text: ACC.i + 1 < ACC.list.length ? 'Дальше →' : 'К расчёту →', fn: () => { if (ACC._next) { clearTimeout(ACC._next); ACC._next = null; } nextFlaw(); } }]);
  ACC._next = setTimeout(() => { ACC._next = null; if (TALK.kind === 'accept') nextFlaw(); }, 9000);
}
function checkJudge(j, f) {
  const o = j && typeof j === 'object' ? j : {};
  let v = String(o.verdict || '').toLowerCase();
  v = v.includes('не') ? 'не принято' : v.includes('част') ? 'частично' : v.includes('прин') ? 'принято' : 'частично';
  let d = Number(String(o.deduct).replace(/[^\d.-]/g, '')); if (!isFinite(d)) d = f.max * 0.6;
  d = clamp(Math.round(d / 100) * 100, 0, f.max);
  if (v === 'принято' && d > f.max * 0.5) v = 'частично';
  let note = typeof o.note === 'string' ? o.note.trim().replace(/^["«]|["»]$/g, '') : '';
  if (!note || note.length > 48) note = v === 'принято' ? 'Зачтено' : v === 'частично' ? 'Слабо' : 'Неуд!';
  return { verdict: v, deduct: d, note };
}
function renderEnvelope(hit) {
  $('envSum').innerHTML = rub(Math.max(0, ACC.tally));
  $('envSum').classList.toggle('hit', !!hit);
  if (hit) setTimeout(() => $('envSum').classList.remove('hit'), 900);
  $('envList').innerHTML = ACC.rows.slice(-5).map((r) => `<li><span>${r.title}<em>${r.note}</em></span><b class="${r.deduct ? '' : 'ok'}">${r.deduct ? '−' + rub(r.deduct) : '0'}</b></li>`).join('');
}
async function finalVerdict() {
  const b = PEOPLE.baba;
  hideCircle(); b.pose = 'count'; b.pointAt = null; b.mood = 0;
  // расчёт — в зале, у балконной двери, лицом к мастеру
  cutTo(() => {
    b.path = null; b.state = 'idle'; b.root.position.set(3.72, 0, 1.25); faceTo(b, 3.2, 3.3); b.root.rotation.y = b.targetYaw;
    ACC.cam = new THREE.Vector3(3.15, 1.5, 3.3); ACC.look = new THREE.Vector3(3.6, 1.12, 1.3);
    camera.position.copy(ACC.cam); camera.lookAt(ACC.look);
  });
  openTalk({ kind: 'final', who: 'Расчёт', where: 'Зинаида Петровна считает деньги', pause: false });
  G.mode = 'cine';
  const el = addLine('sys', '', 'Зинаида Петровна надевает очки поудобнее и пересчитывает купюры…');
  void el;
  setBubble('<span class="typing"></span>');
  const rest = ACC.rest.length ? `Ещё она заметила, но не стала разбирать: ${ACC.rest.map((f) => f.fact).join('; ')}.` : '';
  const fb = () => demoFinal();
  let r = useAI() ? await AI.json([{ role: 'user', content: `Итог приёмки. По твоим пометкам выходит ${Math.max(0, ACC.tally)} ₽ из ${PRICE} ₽.\nРазговор на приёмке:\n${ACC.transcript.join('\n')}\n${rest}\nЧто мастер обещал по телефону: ${PROMISES.join('; ') || 'ничего'}. Трубку не брал: ${JOB.missed} раз. ${JOB.gena.told ? 'Сосед снизу жаловался тебе на потоп.' : ''}\nРеши окончательно: сколько заплатить (можешь отклониться от пометок, если мастер насмешил, был честен или обнаглел; если он врал тебе по телефону — припомни), оценки за ремонт и за поведение, замечание в дневник, финальные слова и что даёшь с собой.` }],
    { system: `${BABA}\n${truthText(ACC.all)}`, think: true, schemaHint: '{"pay": "целое, сколько рублей платишь, 0–44000", "gradeWork": "оценка за ремонт 1–5", "gradeBehavior": "оценка за поведение 1–5", "remark": "замечание в дневник красной ручкой, одно предложение", "words": "финальная реплика мастеру, 1–3 предложения", "gift": "что даёшь с собой: пирожки, банку огурцов или пустая строка"}', maxTokens: 400, temperature: 0.8, fallback: (e) => { aiFail(e); return fb(); } }) : fb();
  r = checkFinal(r);
  b.pose = null; b.mood = r.pay >= PRICE * 0.7 ? 1 : r.pay < PRICE * 0.4 ? -1 : 0;
  await typeOut(r.words, streamTo(addLine('them', 'Зинаида Петровна'), 'baba', true), 30);
  await sleepMs(2200);
  showResult(r);
}
function checkFinal(r) {
  const o = r && typeof r === 'object' ? r : {};
  let pay = Number(String(o.pay).replace(/[^\d.-]/g, '')); if (!isFinite(pay)) pay = ACC.tally;
  pay = clamp(Math.round(pay / 100) * 100, 0, 44000);
  const g = (x, d) => { const n = Math.round(Number(x)); return n >= 1 && n <= 5 ? n : d; };
  const ratio = Math.max(0, ACC.tally) / PRICE;
  return {
    pay,
    gradeWork: g(o.gradeWork, ratio > 0.85 ? 5 : ratio > 0.65 ? 4 : ratio > 0.4 ? 3 : 2),
    gradeBehavior: g(o.gradeBehavior, G.beers > 3 ? 2 : 4),
    remark: (typeof o.remark === 'string' && o.remark.trim()) ? cleanLine(o.remark).slice(0, 200) : 'Работал спустя рукава. Родителей — в школу.',
    words: (typeof o.words === 'string' && o.words.trim()) ? cleanLine(o.words).slice(0, 360) : 'Держите, молодой человек. И учитесь у Коли.',
    gift: typeof o.gift === 'string' ? cleanLine(o.gift).slice(0, 80) : '',
  };
}
function showResult(r) {
  G.mode = 'result';
  hideBubble(); $('talk').classList.add('hidden'); $('envelope').classList.add('hidden');
  $('result').classList.remove('hidden');
  $('gWork').textContent = r.gradeWork; $('gBeh').textContent = r.gradeBehavior;
  $('dPay').innerHTML = rub(r.pay); $('dOf').innerHTML = 'из&nbsp;' + rub(PRICE);
  $('dRemark').textContent = r.remark; $('dWords').textContent = '«' + r.words + '»';
  $('dGift').textContent = r.gift ? 'С собой: ' + r.gift : '';
  const rows = ACC.rows.map((x) => `<li><span>${x.title} — <i>${x.note}</i></span><b>${x.deduct ? '−' + rub(x.deduct) : 'зачтено'}</b></li>`);
  ACC.rest.forEach((f) => rows.push(`<li><span>${f.title}</span><b>заметила</b></li>`));
  ACC.missed.forEach((f) => rows.push(`<li class="hid"><span>${f.title}</span><b>не нашла</b></li>`));
  $('dList').innerHTML = rows.join('');
  SFX.play(r.pay > PRICE * 0.6 ? 'good' : 'bad');
}
// камера на приёмке плавно следует за кадром
function cineTick(dt) {
  if (!ACC.cam) return;
  frameAbovePanel(dt);
  const k = 1 - Math.exp(-dt * 1.8);
  camera.position.lerp(ACC.cam, k);
  const q0 = camera.quaternion.clone();
  const m = new THREE.Matrix4().lookAt(camera.position, ACC.look, new THREE.Vector3(0, 1, 0));
  const q1 = new THREE.Quaternion().setFromRotationMatrix(m);
  camera.quaternion.copy(q0.slerp(q1, k));
  if (PEOPLE.baba.root.visible && PEOPLE.baba.state === 'walk' && ACC.i >= 0) ACC.look.lerp(headWorld(PEOPLE.baba), k * 0.5);
  if (!$('bubble').classList.contains('hidden')) bubbleFor(PEOPLE.baba);
}

// Кадр «над окном диалога»: смещаем центр проекции вверх, чтобы бабушка и косяк
// были в видимой части экрана, а не под панелью. Угол обзора при этом сохраняется.
const FRAME = { d: 0 };
function frameAbovePanel(dt) {
  const w = innerWidth, h = innerHeight, t = $('talk');
  const top = t.classList.contains('hidden') ? h : Math.min(h, t.getBoundingClientRect().top);
  const hud = w < 760 ? 96 : 64;
  const want = Math.max(0, h / 2 - (hud + top) / 2);
  FRAME.d = dt == null ? want : lerp(FRAME.d, want, 1 - Math.exp(-dt * 3));
  const d = Math.round(FRAME.d), base = baseFov();
  if (d < 2) { if (camera.view && camera.view.enabled) { camera.clearViewOffset(); camera.fov = base; camera.aspect = w / h; camera.updateProjectionMatrix(); } return; }
  // виртуальный экран выше настоящего на 2d: угол и пропорции те же, центр — выше
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(base) / 2) * (h + 2 * d) / h));
  camera.aspect = w / (h + 2 * d);
  camera.setViewOffset(w, h + 2 * d, 0, 2 * d, w, h);
}

/* ---------- пузырь реплики и красный кружок ---------- */
function setBubble(html) { const b = $('bubble'); b.classList.remove('hidden'); $('bubbleText').innerHTML = html; }
function hideBubble() { $('bubble').classList.add('hidden'); }
function bubbleFor(p) {
  const v = headWorld(p).project(camera);
  const el = $('bubble'); const w = innerWidth, h = innerHeight;
  let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h - 16;
  const bw = el.offsetWidth || 300, bh = el.offsetHeight || 80;
  const talkTop = $('talk').classList.contains('hidden') ? h : $('talk').getBoundingClientRect().top;
  x = clamp(x, bw / 2 + 12, w - bw / 2 - 12);
  y = clamp(y, bh + 70, Math.max(bh + 70, talkTop - 20));
  if (v.z > 1) { x = w / 2; y = bh + 80; }
  el.style.left = x + 'px'; el.style.top = y + 'px';
}
function showCircle(p) {
  if (!ACC.circle) { ACC.circle = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.redCircle, depthTest: false, transparent: true })); ACC.circle.renderOrder = 999; W.scene.add(ACC.circle); }
  ACC.circle.position.copy(p); ACC.circle.scale.set(0.62, 0.62, 1); ACC.circle.visible = true;
}
function hideCircle() { if (ACC.circle) ACC.circle.visible = false; }

/* ================================================================
   ДЕМО-РЕЖИМ: заготовленные реплики
   ================================================================ */
const DEMO_OPEN = {
  wp_upside: ['Молодой человек, у меня маки растут вниз, а птички висят, как летучие мыши. Это что за натюрморт?', 'Цветочки вверх тормашками. Вы обои клеили или на голове стояли?'],
  wp_tilt: ['Полоса стоит, как пьяный на остановке. Коля по отвесу клеил, а вы — по настроению?', 'Это что за косая линейка? У меня в третьем классе тетради ровнее были.'],
  wp_carpet: ['А где мой ковёр? Под обоями?! Вы его замуровали, как в склепе! Бахрома вон торчит!', 'Голубчик, это горб на стене. Там ковёр, тридцать лет висел. Вы в своём уме?'],
  wp_switch: ['Я тянусь к выключателю — а там бугорок. Свет мне теперь спичками зажигать?'],
  wp_missing: ['Половина стены в новых обоях, половина в старых. Вы мне зебру сделали?'],
  carpet_down: ['Ковёр на полу в рулоне. Он что, на выход собрался?'],
  hole_cal: ['Календарь за семьдесят пятый год… А под ним — дыра! Это вы так «заделали»?'],
  hole_open: ['Дыра как была, так и есть. Кирпич видно, провод торчит. Это экспозиция?'],
  hole_lumps: ['Заделали, спасибо. Буграми. Теперь у меня в прихожей рельеф местности.'],
  paint_tv: ['Телевизор в белую крапинку! Мне новости теперь сквозь горошек смотреть?'],
  paint_cat: ['Барсик! Барсик, кто тебя покрасил?! Молодой человек, это кот, а не батарея!'],
  paint_rad: ['Батарея наполовину ржавая. Вы её красили или только кисточку показали?'],
  paint_frame: ['Рама облезлая, как была. Хоть с одной стороны мазнули бы.'],
  paint_misc: ['У меня тут кляксы по всему залу. Вы красили или стреляли краской?'],
  tile_crooked: ['Плитка пляшет, как второклассник у доски. Где тут шов, а где овраг?'],
  tile_decor: ['Кораблик вверх дном. Он у вас тонет, молодой человек.'],
  tile_missing: ['Плитки половина, а остальное — голый цемент. Это мозаика «недострой»?'],
  tap_old: ['Кран у меня тот же, старенький. А новый где? Я его за свои деньги покупала!'],
  tap_none: ['Из стены торчит труба. А кран где? В кармане у вас?'],
  valve: ['Кран новый, а воды нет. Вы мне сухой кран поставили, для красоты?'],
  flood: ['Тут озеро! Мне Геннадий снизу уже в тазик собирает, между прочим.'],
  drip: ['Под мойкой кап-кап-кап. Это вы мне метроном поставили?'],
  beer: ['Раз, два, три… Это что за почётный караул на подоконнике? Это ж Толиково пиво!'],
  cat: ['Барсик голодный. Я одно просила — кота покормить!'],
  calls: ['Я вам звонила — трубку никто не брал. Вы где были, на Луне?'],
  gena: ['Мне Геннадий звонил. Говорит, у него с потолка льёт. Это вы ему устроили?'],
};
function demoOpener(f) { return pick(DEMO_OPEN[f.id] || ['Это что такое, молодой человек? Объяснитесь.']); }
function demoReply(f, text) {
  const t = text.toLowerCase();
  if (/^\(молч/.test(t)) return 'Молчите? Правильно. Мне тоже нечего сказать хорошего.';
  if (/извин|прост|виноват|исправ|передела/.test(t)) return 'Хоть честно. Ладно, частично засчитаю, но осадочек остался.';
  if (/задуман|так и было|так надо/.test(t)) return 'Задумано? Кем задумано — вами или пивом? Садитесь, два.';
  if (/евро|модн|дизайн|тренд|стиль/.test(t)) return 'Евроремонт у меня будет, когда в Европе так клеят. Сказки внукам расскажете.';
  if (/кот|барсик/.test(t)) return 'Барсика не впутывайте. Он, в отличие от вас, трезвый.';
  if (/сам|случайн|оно/.test(t)) return 'Само только тесто подходит. А тут руки, молодой человек.';
  if (/усадк|дом|трубы|стояк/.test(t)) return 'Дом стоит с семьдесят четвёртого, и до вас ничего не усаживалось.';
  if (t.length > 70) return 'Много слов, мало дела. Но красиво врёте, отдаю должное.';
  return pick(['Сказки будете внукам рассказывать. Записываю.', 'Не убедили. Ставлю на вид.', 'Ну-ну. Коля бы за такое ремень снял.']);
}
function demoJudge(f, text) {
  const t = text.toLowerCase(); let k = 0.9, v = 'не принято', note = 'Неуд!';
  if (/^\(молч/.test(t)) { k = 1; note = 'Молчание — не ответ'; }
  else if (/извин|прост|виноват|исправ|передела/.test(t)) { k = 0.45; v = 'частично'; note = 'За честность — тройка'; }
  else if (t.length > 70) { k = 0.6; v = 'частично'; note = 'Красиво, но нет'; }
  else if (/задуман|евро|модн|дизайн/.test(t)) { k = 0.95; note = 'Враньё!'; }
  return { verdict: v, deduct: Math.round(f.max * k / 100) * 100, note };
}
function demoFinal() {
  const pay = Math.max(0, ACC.tally), ratio = pay / PRICE;
  return {
    pay, gradeWork: ratio > 0.85 ? 5 : ratio > 0.65 ? 4 : ratio > 0.4 ? 3 : 2, gradeBehavior: G.beers > 3 ? 2 : JOB.missed ? 3 : 4,
    remark: ratio > 0.7 ? 'Старался. Почерк неровный, но душа есть.' : G.beers > 2 ? 'Пил на уроке. Обои вверх ногами. Родителей в школу!' : 'Работал спустя рукава. Переделать к понедельнику.',
    words: ratio > 0.7 ? 'Ну что ж, голубчик, не Коля, но и не хуже Толика. Держите.' : 'Вот ваши деньги, молодой человек. Остальное — на переделку. И ковёр мне повесьте, как было.',
    gift: ratio > 0.5 ? 'пирожки с капустой' : '',
  };
}
function demoPhone(idx, text, last) {
  if (last) return pick(['Ну всё, у меня автобус. К шести буду, и чтобы всё блестело!', 'Ладно, некогда мне. Барсика покормите, я проверю.']);
  if (!text) return ['Алло, молодой человек? Это Зинаида Петровна. Как там дела? Барсика покормили? И пиво в ящике не трогайте — это Толику!', 'Алло! Это я. Сестра говорит, у неё опять давление. А у вас как плитка? Воду перекрыли, прежде чем кран крутить?', 'Алло, я выезжаю! В шесть буду, и принимать буду как контрольную. Всё готово?'][idx] || 'Алло, это Зинаида Петровна. Как успехи?';
  const t = text.toLowerCase();
  if (/всё|готов|отлично|норм|контрол/.test(t)) return 'Все вы так говорите. «Всё» — это слишком общее слово, молодой человек. Конкретнее!';
  return pick(['Что-что? Говорите внятнее, у меня тут автобус гудит.', 'Хм. Ну смотрите у меня. Я всё увижу.']);
}
const DEMO_MIH_STORY = [
  'Я тебе так скажу: когда этот дом в семьдесят четвёртом сдавали, в Зинкиной ванной забыли трубу подключить. Комиссия пришла, кран открыла — и воду пустили прямо в квартиру к Гене. С тех пор Гена снизу на нервах. Кстати, кран будешь менять — вентиль под мойкой перекрой, он красный.',
  'В армии, значит, приезжает генерал, а трава жёлтая. Нам говорят: покрасить! Красили до утра. Генерал посмотрел и спросил, почему у нас трава зеленее, чем небо голубое. Ты плитку-то не спеши класть, Зинка за кривые строчки в школе двойки ставила.',
  'Мы с Люсей в восьмидесятом обои клеили. Я говорю: «Люся, узор совпадает?» Она: «Совпадает». А потом выяснилось, что она без очков. Так и живём, узор до сих пор в разные стороны. Ты ковёр со стены сними сперва, был у нас умелец — прямо на ковёр поклеил.',
];
function demoMihStory() { return DEMO_MIH_STORY[(JOB.smokes - 1) % DEMO_MIH_STORY.length]; }
function demoMih(text) { return /совет/.test(text.toLowerCase()) ? `Совет тебе такой: ${mihTip()}. Вот.` : pick(['Да я тебе говорю! Вот те крест. Ну, почти.', 'А дальше Люся меня с балкона и позвала. Как тебя сейчас Зинка позовёт.', 'Ну ты понял. Жизнь — она как стояк: течёт, пока не перекроешь.']); }
function demoGena(msg, anger, beer, turns) {
  const t = msg.toLowerCase();
  if (/открыл дверь/.test(t)) return { reply: 'У меня с потолка льёт! Люстра как душ! Вы там что, бассейн открыли?!', anger: 9, demand: 6000, done: false, callOwner: false };
  if (beer) return { reply: 'Ну… Пиво — это аргумент. Ладно. Но за побелку пять тысяч, и чтоб больше ни капли!', anger: 3, demand: 5000, done: true, callOwner: false };
  if (/извин|прост|помог|уберу|виноват/.test(t)) return { reply: 'Извинения принимаются. Побелку оплатите, три тысячи, и живите.', anger: 4, demand: 3000, done: turns >= 2, callOwner: false };
  return { reply: 'Ах вы ещё и огрызаетесь! Всё, звоню Зинаиде Петровне!', anger: 10, demand: 8000, done: true, callOwner: true };
}

/* ================================================================
   ОБЛОЖКА: постановочная сцена приёмки (без вызовов нейросети)
   ================================================================ */
function stageCover() {
  G.t = 18 * 60 + 4; setDaylight(G.t / 60);
  // косяки, которые видно в кадре: полосы поверх ковра, одна пропущена — посередине торчит ковёр
  const S = JOB.strips;
  const glue = (i, flip, tiltDeg, off = 0) => { G.drunk = 0; G.stress = 0; JOB.roll.flipped = flip; glueStrip(S[i]); S[i].tilt = THREE.MathUtils.degToRad(tiltDeg); S[i].mesh.rotation.z = 0; S[i].mesh.rotateZ(S[i].tilt); S[i].mesh.position.z += off; S[i].anim = 1; S[i].mesh.scale.y = 1; };
  glue(0, false, 0.4); glue(1, false, -1.8); glue(3, true, 2.6, 0.03);
  glue(5, false, -1.2); glue(6, true, 0.3); glue(7, false, 2.6);
  W.shadowDirty = true;
  G.t = 18 * 60 + 4;
  // краска на телевизоре, батарея покрашена наполовину
  for (let i = 0; i < 9; i++) splat(new THREE.Vector3(0.62 + (Math.random() - 0.5) * 0.3, 0.72 + Math.random() * 0.2, 0.62), new THREE.Vector3(0.707, 0, 0.707), W.objs.tvScreen, 0.012 + Math.random() * 0.02);
  W.objs.radiator.forEach((s, i) => { const p = JOB.paint.find((q) => q.mesh === s); if (p && i < 5) { p.cov = 1; p.coat.material.opacity = 1; } });
  // бабушка у горба на стене, указывает тростью; ракурс — тот же, что в игре
  const f = { id: 'wp_carpet', where: new THREE.Vector3(0.06, 1.55, 1.55), stand: [1.3, 3.05] };
  const b = PEOPLE.baba; b.root.visible = true; b.root.position.set(f.stand[0], 0, f.stand[1]); b.mood = -1; b.pose = 'point'; b.pointAt = f.where.clone();
  b.root.rotation.y = Math.atan2(f.where.x - f.stand[0], f.where.z - f.stand[1]); b.targetYaw = b.root.rotation.y;
  b.root.updateMatrixWorld(true);
  PEOPLE.cat.root.position.set(0.55, 0.53, 2.75);
  G.mode = 'cover';
  $('hud').classList.remove('hidden'); $('tools').classList.add('hidden'); $('note').classList.add('hidden'); $('cross').classList.add('hidden');
  $('envelope').classList.remove('hidden');
  ACC.rows = [{ title: 'Краска на телевизоре', deduct: 3500, note: 'Горошек!' }, { title: 'Обои вверх ногами', deduct: 3000, note: 'Маки вниз — неуд' }];
  ACC.tally = PRICE - 6500; renderEnvelope();
  $('talk').classList.remove('hidden'); $('talkWho').textContent = 'Косяк 3 из 7: Обои на ковре'; $('talkWhere').textContent = 'приёмка';
  $('talkLog').innerHTML = ''; setButtons([]);
  addLine('them', 'Зинаида Петровна', 'Голубчик, это горб на стене. Там ковёр тридцать лет висел. Вы его замуровали?!');
  addLine('me', '', 'Так задумано. Ковёр внутри — для тепла, это евроремонт.');
  setChips(['Так задумано', 'Это утепление', 'Сейчас так модно', 'Оно само']);
  $('talkIn').value = ''; $('talkIn').placeholder = 'Ваша отмазка…'; TALK.limit = 76; updateLeft(); enableInput(false);
  setBubble('Евро… ремонт? Молодой человек, у&nbsp;меня сквозь обои <b>ковёр просвечивает</b>! Вы&nbsp;его замуровали!');
  camFrame(f);
  camera.position.copy(ACC.cam); camera.lookAt(ACC.look);
  showCircle(f.where);
  frameAbovePanel();
}
