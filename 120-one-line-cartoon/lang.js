/* ================================================================
   lang.js — язык сцен «Мультфильма из одной фразы».
   1) словарь: места, куклы, действия, эмоции, камера, музыка, реквизит;
   2) normalize(): проверка сценария нейросети по схеме и починка;
   3) compile(): сценарий → таймлайн (всё — функция от времени t);
   4) toScreenplay(): сценарий → читаемый текст.
   ================================================================ */
(function () {
  'use strict';

  // ---------- словарь ----------
  const PLACES = {
    city:     { ru: 'Город',       time: 'day' },
    forest:   { ru: 'Лес',         time: 'day' },
    sea:      { ru: 'Берег моря',  time: 'day' },
    space:    { ru: 'Космос',      time: 'night' },
    kitchen:  { ru: 'Кухня',       time: 'day' },
    roof:     { ru: 'Крыша',       time: 'night' },
    meadow:   { ru: 'Луг',         time: 'day' },
    winter:   { ru: 'Зимний двор', time: 'day' },
    room:     { ru: 'Комната',     time: 'evening' },
    junkyard: { ru: 'Свалка',      time: 'day' },
  };
  const TIMES = { day: 'день', evening: 'вечер', night: 'ночь' };

  // h — рост куклы в пикселях сцены 1600×900; fly — умеет летать; float — без ног, парит; alt — высота по умолчанию
  const KINDS = {
    cat:     { ru: 'кот',           h: 250, voice: 560 },
    dog:     { ru: 'пёс',           h: 250, voice: 310 },
    robot:   { ru: 'робот',         h: 290, voice: 190 },
    girl:    { ru: 'девочка',       h: 270, voice: 480 },
    boy:     { ru: 'мальчик',       h: 272, voice: 400 },
    oldman:  { ru: 'старик',        h: 300, voice: 150 },
    grandma: { ru: 'бабушка',       h: 280, voice: 300 },
    bird:    { ru: 'птица',         h: 150, voice: 1250, fly: true },
    moon:    { ru: 'луна',          h: 230, voice: 250, fly: true, float: true, alt: 60 },
    sun:     { ru: 'солнце',        h: 230, voice: 340, fly: true, float: true, alt: 62 },
    mouse:   { ru: 'мышь',          h: 165, voice: 930 },
    bear:    { ru: 'медведь',       h: 330, voice: 115 },
    ghost:   { ru: 'привидение',    h: 250, voice: 380, fly: true, float: true, alt: 6 },
    alien:   { ru: 'инопланетянин', h: 240, voice: 690 },
  };

  const ACTIONS = {
    walk: 'идёт', run: 'бежит', jump: 'прыгает', say: 'говорит', sing: 'поёт', think: 'думает',
    hug: 'обнимает', fall: 'падает', look: 'смотрит', wave: 'машет', dance: 'танцует', cry: 'плачет',
    laugh: 'смеётся', sleep: 'засыпает', shake: 'дрожит', fly: 'летит', enter: 'входит', exit: 'уходит',
    turn: 'оборачивается', take: 'берёт', give: 'отдаёт', push: 'толкает', chase: 'гонится',
    appear: 'появляется', vanish: 'исчезает', wait: 'ждёт',
  };
  const EMOTIONS = {
    neutral: 'спокойно', happy: 'радостно', sad: 'грустно', angry: 'сердито', scared: 'испуганно',
    surprised: 'удивлённо', love: 'влюблённо', sly: 'хитро', tired: 'устало',
  };
  const MOODS = {
    happy: 'весёлая', romantic: 'романтичная', sad: 'грустная', tense: 'тревожная', chase: 'погоня',
    mystery: 'загадочная', epic: 'эпичная', silly: 'дурашливая', calm: 'спокойная',
  };
  const CAMS = { wide: 'общий план', medium: 'средний план', close: 'крупный план', pan: 'панорама', shake: 'тряска' };
  const PROPS = {
    battery: 'батарейка', flower: 'цветок', fish: 'рыба', ball: 'мяч', star: 'звезда', cake: 'торт',
    bone: 'косточка', gift: 'подарок', key: 'ключ', umbrella: 'зонт', apple: 'яблоко', balloon: 'шарик',
    letter: 'письмо', cheese: 'сыр', heart: 'сердце',
  };
  const LOOKS = { none: 'как есть', tophat: 'цилиндр', crown: 'корона', bow: 'бантик', glasses: 'очки', scarf: 'шарф', cap: 'кепка', mustache: 'усы' };

  // ---------- синонимы: нейросеть иногда пишет по-русски или своими словами ----------
  const syn = (s) => {
    const m = {};
    for (const [k, list] of Object.entries(s)) for (const w of list.split(',')) m[w.trim()] = k;
    return m;
  };
  const PLACE_SYN = syn({
    city: 'город,street,улица,town,downtown,площадь,двор,yard,park_city',
    forest: 'лес,woods,wood,jungle,джунгли,роща,чаща',
    sea: 'море,beach,пляж,ocean,океан,берег,shore,coast,lake,озеро,river,река,island,остров',
    space: 'космос,орбита,orbit,moon_surface,planet,планета,stars,звёзды,ufo,rocket',
    kitchen: 'кухня,cafe,кафе,restaurant,ресторан,bakery,пекарня',
    roof: 'крыша,rooftop,roof_night,крыша_ночью,attic,чердак',
    meadow: 'луг,поле,field,park,парк,garden,сад,farm,ферма,village,деревня,hill,холм,countryside',
    winter: 'зима,snow,снег,зимний_двор,winter_yard,ice,лёд,каток,rink,north,север',
    room: 'комната,home,дом,house,bedroom,спальня,living_room,apartment,квартира,school,школа,class,office',
    junkyard: 'свалка,scrapyard,junk,dump,garage,гараж,factory,завод,workshop,мастерская',
  });
  const KIND_SYN = syn({
    cat: 'кот,кошка,котик,котёнок,котенок,kitten,kitty,tomcat,lion,лев,tiger,тигр',
    dog: 'пёс,пес,собака,щенок,puppy,doggo,wolf,волк,fox,лиса,лис',
    robot: 'робот,android,андроид,bot,бот,droid,cyborg,machine',
    girl: 'девочка,девушка,woman,женщина,princess,принцесса,mom,мама,lady,daughter,дочка',
    boy: 'мальчик,парень,man,мужчина,кid,kid,ребёнок,human,person,человек,dad,папа,son,сын,prince,принц',
    oldman: 'старик,дед,дедушка,grandpa,old_man,elder,wizard,волшебник,king,король',
    grandma: 'бабушка,бабуля,старушка,granny,grandmother,old_woman,witch,ведьма',
    bird: 'птица,птичка,воробей,ворона,голубь,sparrow,crow,pigeon,parrot,попугай,owl,сова,chicken,курица,duck,утка,penguin,пингвин',
    moon: 'луна,месяц,moon_face',
    sun: 'солнце,солнышко,sunny',
    mouse: 'мышь,мышка,мышонок,rat,крыса,hamster,хомяк,squirrel,белка,rabbit,заяц,кролик,hare',
    bear: 'медведь,мишка,медвежонок,teddy,panda,панда',
    ghost: 'привидение,призрак,spirit,дух,phantom',
    alien: 'инопланетянин,пришелец,марсианин,martian,ufo_pilot,monster,монстр,frog,лягушка,dragon,дракон,dino,динозавр',
  });
  const ACT_SYN = syn({
    walk: 'идёт,идет,go,goes,move,moves,walks,walk_to,approach,come,comes,step,sneak,крадётся,подходит,шагает',
    run: 'бежит,runs,run_to,flee,flees,escape,rush,dash,убегает,несётся',
    jump: 'прыгает,jumps,hop,hops,leap,bounce,подпрыгивает',
    say: 'говорит,says,talk,talks,speak,speaks,shout,shouts,кричит,whisper,шепчет,reply,answer,отвечает,asks,спрашивает,line',
    sing: 'поёт,поет,sings,song,serenade,серенада',
    think: 'думает,thinks,dream,dreams,мечтает,wonder,ponder',
    hug: 'обнимает,hugs,embrace,kiss,целует,cuddle',
    fall: 'падает,falls,trip,trips,faint,slip,поскальзывается,спотыкается,crash,врезается',
    look: 'смотрит,looks,look_at,watch,watches,see,sees,stare,глядит,замечает,notice',
    wave: 'машет,waves,greet,greets,hello,bye,прощается,здоровается',
    dance: 'танцует,dances,celebrate,радуется,party',
    cry: 'плачет,cries,sob,sobs,weep,рыдает',
    laugh: 'смеётся,смеется,laughs,giggle,хохочет,chuckle',
    sleep: 'спит,засыпает,sleeps,nap,rest,отдыхает,лежит,lie',
    shake: 'дрожит,трясётся,tremble,trembles,shiver,fear,боится,panic',
    fly: 'летит,flies,float,floats,soar,взлетает,парит,descend,спускается,rise,поднимается',
    enter: 'входит,enters,arrive,arrives,come_in,приходит,прибегает,прилетает',
    exit: 'уходит,exits,leave,leaves,go_away,убегает_прочь,улетает',
    turn: 'оборачивается,turns,turn_around,поворачивается',
    take: 'берёт,берет,takes,pick,picks,grab,grabs,поднимает,хватает,find,находит',
    give: 'отдаёт,отдает,gives,дарит,hand,hands,offer,share,делится,протягивает',
    push: 'толкает,pushes,hit,hits,kick,kicks,punch,бьёт,пинает,shove',
    chase: 'гонится,chases,pursue,догоняет,преследует,погоня',
    appear: 'появляется,appears,poof,materialize,возникает',
    vanish: 'исчезает,vanishes,disappear,disappears,пропадает',
    wait: 'ждёт,ждет,waits,pause,idle,stand,stands,стоит,sit,sits,сидит,sigh,вздыхает',
  });
  const EMO_SYN = syn({
    neutral: 'спокойно,calm,normal,none,нейтрально',
    happy: 'радостно,joy,joyful,excited,cheerful,glad,радость,весело,proud,гордо',
    sad: 'грустно,upset,lonely,грусть,sorrow,печально,disappointed,hurt,обиженно',
    angry: 'сердито,mad,furious,rage,evil,злой,злость,annoyed,jealous,ревниво,grumpy',
    scared: 'испуганно,afraid,fear,frightened,nervous,страх,panic,worried,тревожно',
    surprised: 'удивлённо,удивленно,shocked,amazed,wow,shock,изумлённо,confused,растерянно',
    love: 'влюблённо,влюбленно,in_love,romantic,dreamy,tender,нежно,loving,adoring',
    sly: 'хитро,sneaky,cunning,smug,mischievous,evil_grin,злодейски,villain,plotting',
    tired: 'устало,sleepy,exhausted,bored,weak,сонно,слабо,drained',
  });
  const MOOD_SYN = syn({
    happy: 'весёлая,веселая,joyful,cheerful,upbeat,bright',
    romantic: 'романтичная,love,romance,tender,нежная',
    sad: 'грустная,melancholy,sorrow,drama,драма',
    tense: 'тревожная,suspense,danger,scary,villain,dark,conflict',
    chase: 'погоня,action,fast,race,гонка,battle,битва,fight',
    mystery: 'загадочная,mysterious,magic,wonder,night,dreamy,space,тайна',
    epic: 'эпичная,heroic,triumph,finale,grand',
    silly: 'дурашливая,funny,comic,comedy,playful,смешная,комедия',
    calm: 'спокойная,peaceful,gentle,quiet,cozy,уютная',
  });
  const CAM_SYN = syn({
    wide: 'общий,general,long,establishing,full,wide_shot',
    medium: 'средний,mid,medium_shot,two_shot',
    close: 'крупный,closeup,close_up,close-up,zoom,zoom_in,face',
    pan: 'панорама,panorama,track,dolly',
    shake: 'тряска,shake_cam,impact,quake',
  });
  const PROP_SYN = syn({
    battery: 'батарейка,батарея,energy,charger,power',
    flower: 'цветок,цветы,rose,роза,bouquet,букет',
    fish: 'рыба,рыбка,sausage,колбаса,sardine',
    ball: 'мяч,мячик,toy,игрушка',
    star: 'звезда,звёздочка,звездочка,comet',
    cake: 'торт,пирог,pie,cookie,печенье,candy,конфета,food,еда,sandwich,бутерброд,blin,блин',
    bone: 'косточка,кость',
    gift: 'подарок,present,box,коробка',
    key: 'ключ,ключик',
    umbrella: 'зонт,зонтик',
    apple: 'яблоко,fruit,фрукт,pear,груша,orange,апельсин',
    balloon: 'шарик,воздушный_шарик,balloon',
    letter: 'письмо,note,записка,card,открытка,map,карта',
    cheese: 'сыр,сырок',
    heart: 'сердце,сердечко,love',
  });
  const LOOK_SYN = syn({
    none: 'нет,no,без,plain',
    tophat: 'цилиндр,hat,шляпа,top_hat,villain_hat',
    crown: 'корона,king,queen,tiara',
    bow: 'бантик,бант,ribbon,лента',
    glasses: 'очки,spectacles,sunglasses',
    scarf: 'шарф,шарфик,cape,плащ',
    cap: 'кепка,кепочка,cap_hat,beanie,шапка',
    mustache: 'усы,усики,moustache',
  });

  // ---------- утилиты ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v) => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() && isFinite(+v) ? +v : null);
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function clean(v, max) {
    if (typeof v !== 'string') return '';
    let s = v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^["'«]+|["'»]+$/g, '').trim();
    if (s.length > max) s = s.slice(0, max - 1).replace(/[\s,.;:—-]+\S*$/, '') + '…';
    return s;
  }
  // приведение значения к ключу словаря: точное совпадение → синоним → вхождение
  function pick(v, dict, synMap, def) {
    if (typeof v !== 'string' || !v.trim()) return def;
    const k = v.trim().toLowerCase().replace(/ё/g, 'ё').replace(/[\s-]+/g, '_');
    if (dict[k]) return k;
    if (synMap[k]) return synMap[k];
    const k2 = k.replace(/ё/g, 'е');
    for (const s in synMap) if (s.replace(/ё/g, 'е') === k2) return synMap[s];
    for (const d in dict) if (k.includes(d)) return d;
    for (const s in synMap) if (s.length > 2 && k.includes(s)) return synMap[s];
    return def;
  }

  // Кого узнаём во фразе без нейросети (для демо и для запасного кастинга)
  function detectKinds(text) {
    const t = ' ' + String(text || '').toLowerCase() + ' ';
    const found = [];
    for (const [w, k] of Object.entries(KIND_SYN)) {
      if (w.length < 3) continue;
      const stem = w.replace(/[аяоеыьйиу]$/, '');
      if (stem.length >= 3 && t.includes(stem) && !found.includes(k)) found.push(k);
    }
    return found;
  }

  // ================================================================
  //  normalize: всё, что прислала нейросеть, проверяется и чинится.
  //  Никогда не бросает исключение; возвращает { script, fixes }.
  // ================================================================
  function normalize(raw, phrase) {
    const fixes = [];
    const fix = (m) => { if (fixes.length < 30 && !fixes.includes(m)) fixes.push(m); };
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (src !== raw) fix('ответ не объект — собран запасной сценарий');
    const out = { title: '', phrase: clean(phrase || src.phrase || '', 120), mood: 'happy', cast: [], scenes: [] };
    out.title = clean(src.title, 44) || clean(phrase, 44) || 'Мультфильм';
    out.mood = pick(src.mood || src.music, MOODS, MOOD_SYN, 'happy');

    // --- актёры ---
    const castIn = Array.isArray(src.cast) ? src.cast : Array.isArray(src.characters) ? src.characters : [];
    const byId = {};
    for (const c of castIn) {
      if (out.cast.length >= 5) { fix('актёров больше пяти — лишние убраны'); break; }
      if (!c || typeof c !== 'object') continue;
      const kind = pick(c.kind || c.type || c.puppet, KINDS, KIND_SYN, null) || pick(c.name, KINDS, KIND_SYN, null);
      const k = kind || 'boy';
      if (!kind) fix(`кукла «${clean(String(c.kind || '?'), 20)}» не из набора — заменена`);
      let id = clean(String(c.id || c.name || k), 24) || k;
      while (byId[id]) id += '2';
      const a = {
        id, kind: k,
        name: clean(c.name, 18) || KINDS[k].ru[0].toUpperCase() + KINDS[k].ru.slice(1),
        look: pick(c.look || c.accessory || c.outfit, LOOKS, LOOK_SYN, 'none'),
        villain: c.villain === true || c.role === 'villain' || /злод|villain/i.test(String(c.role || '')),
      };
      byId[id] = a; out.cast.push(a);
    }
    if (!out.cast.length) {
      fix('в сценарии не было актёров — взяты из фразы');
      const kinds = detectKinds(phrase);
      if (!kinds.length) kinds.push('cat');
      kinds.slice(0, 3).forEach((k, i) => {
        const a = { id: k + (i ? i : ''), kind: k, name: KINDS[k].ru[0].toUpperCase() + KINDS[k].ru.slice(1), look: 'none', villain: false };
        byId[a.id] = a; out.cast.push(a);
      });
    }
    const who = (v) => {
      if (typeof v !== 'string' || !v.trim()) return null;
      const s = v.trim();
      if (byId[s]) return s;
      const low = s.toLowerCase();
      for (const a of out.cast) if (a.id.toLowerCase() === low || a.name.toLowerCase() === low) return a.id;
      const kind = pick(s, KINDS, KIND_SYN, null);
      if (kind) { const a = out.cast.find((c) => c.kind === kind); if (a) return a.id; }
      for (const a of out.cast) if (low.includes(a.name.toLowerCase()) || a.name.toLowerCase().includes(low)) return a.id;
      return null;
    };
    const target = (v) => {
      const n = num(v);
      if (n != null) return clamp(n, -20, 120);
      if (typeof v !== 'string') return null;
      const w = who(v);
      if (w) return w;
      const s = v.toLowerCase();
      if (/left|лев|слева/.test(s)) return 'left';
      if (/right|прав|справа/.test(s)) return 'right';
      if (/center|центр|middle|середин/.test(s)) return 50;
      if (/out|away|прочь|за кадр|offscreen/.test(s)) return 'out';
      if (/up|sky|небо|вверх/.test(s)) return 'up';
      return null;
    };

    // --- сцены ---
    let scenesIn = Array.isArray(src.scenes) ? src.scenes : [];
    if (scenesIn.length > 7) { fix('сцен больше семи — лишние убраны'); scenesIn = scenesIn.slice(0, 7); }
    for (const scIn of scenesIn) {
      if (!scIn || typeof scIn !== 'object') continue;
      const place = pick(scIn.place || scIn.location || scIn.background, PLACES, PLACE_SYN, null);
      if (!place) fix(`место «${clean(String(scIn.place || '?'), 20)}» не из набора — выбран луг`);
      const sc = {
        place: place || 'meadow',
        time: pick(scIn.time, TIMES, { утро: 'day', morning: 'day', полдень: 'day', noon: 'day', sunset: 'evening', закат: 'evening', вечер: 'evening', ночь: 'night', midnight: 'night', dusk: 'evening', dawn: 'evening', рассвет: 'evening' }, null),
        mood: pick(scIn.mood || scIn.music, MOODS, MOOD_SYN, null),
        shot: pick(scIn.shot || scIn.camera, CAMS, CAM_SYN, 'wide'),
        props: [], cast: [], beats: [],
      };
      if (!sc.time) sc.time = PLACES[sc.place].time;
      if (sc.place === 'space') sc.time = 'night';
      if (!sc.mood) sc.mood = out.mood;
      if (sc.shot === 'shake' || sc.shot === 'pan') sc.shot = 'wide';
      // реквизит
      for (const p of (Array.isArray(scIn.props) ? scIn.props : []).slice(0, 5)) {
        const kind = pick(typeof p === 'string' ? p : p && (p.kind || p.type || p.id), PROPS, PROP_SYN, null);
        if (!kind) { fix('неизвестный реквизит убран'); continue; }
        const x = num(p && p.x);
        sc.props.push({ id: clean(String((p && p.id) || kind), 20) || kind, kind, x: x == null ? 50 : clamp(x, 4, 96) });
      }
      // расстановка
      for (const c of (Array.isArray(scIn.cast) ? scIn.cast : []).slice(0, 5)) {
        const id = who(typeof c === 'string' ? c : c && (c.id || c.who || c.name));
        if (!id || sc.cast.some((q) => q.id === id)) continue;
        const x = num(c && c.x), y = num(c && (c.y ?? c.alt));
        sc.cast.push({
          id, x: x == null ? null : clamp(x, -20, 120), y: y == null ? null : clamp(y, 0, 100),
          face: /left|лев/i.test(String(c && (c.face || c.facing) || '')) ? 'left' : /right|прав/i.test(String(c && (c.face || c.facing) || '')) ? 'right' : null,
          emotion: pick(c && (c.emotion || c.emo), EMOTIONS, EMO_SYN, null),
        });
      }
      // действия
      let beatsIn = Array.isArray(scIn.beats) ? scIn.beats : Array.isArray(scIn.actions) ? scIn.actions : [];
      if (beatsIn.length > 14) { fix('в сцене больше 14 действий — лишние убраны'); beatsIn = beatsIn.slice(0, 14); }
      for (const b of beatsIn) {
        if (!b || typeof b !== 'object') continue;
        const cam = b.camera || (/^camera$|^камера$/i.test(String(b.do || '')) ? b.shot || b.type : null);
        if (cam) {
          const c = pick(cam, CAMS, CAM_SYN, null);
          if (c) sc.beats.push({ camera: c, on: who(b.on || b.who || b.target) });
          else fix('непонятный план камеры убран');
          continue;
        }
        const id = who(b.who || b.actor || b.character || b.by);
        if (!id) { fix(`действие без понятного исполнителя «${clean(String(b.who || '?'), 16)}» убрано`); continue; }
        let text = clean(b.text || b.line || b.says || b.say || '', 90);
        let act = pick(b.do || b.action || b.act, ACTIONS, ACT_SYN, null);
        if (!act) { act = text ? 'say' : 'wait'; fix(`действие «${clean(String(b.do || '?'), 16)}» не из набора — заменено`); }
        if ((act === 'say' || act === 'sing') && !text) act = 'wait';
        const beat = { who: id, do: act };
        if (text && (act === 'say' || act === 'sing' || act === 'think')) beat.text = text;
        const emo = pick(b.emotion || b.emo || b.feel, EMOTIONS, EMO_SYN, null);
        if (emo) beat.emotion = emo;
        const tg = target(b.to ?? b.target ?? b.at ?? b.x);
        if (tg != null && tg !== id) beat.to = tg;
        const y = num(b.y ?? b.alt ?? b.height);
        if (y != null) beat.y = clamp(y, 0, 100);
        const what = pick(b.what || b.item || b.prop || b.object, PROPS, PROP_SYN, null);
        if (what) beat.what = what;
        const d = num(b.dur ?? b.duration);
        if (d != null && act === 'wait') beat.dur = clamp(d, 0.3, 4);
        if (b.with === true || b.together === true || b.parallel === true) beat.with = true;
        sc.beats.push(beat);
      }
      if (!sc.beats.length) fix('пустая сцена убрана');
      else out.scenes.push(sc);
    }
    if (!out.scenes.length) {
      fix('сцен не было — собрана одна сцена по фразе');
      const a = out.cast[0], b = out.cast[1];
      const sc = { place: 'meadow', time: 'day', mood: out.mood, shot: 'wide', props: [], cast: [], beats: [] };
      sc.beats.push({ who: a.id, do: 'enter', emotion: 'happy' });
      if (b) sc.beats.push({ who: b.id, do: 'enter', with: true, emotion: 'surprised' });
      sc.beats.push({ who: a.id, do: 'say', text: out.phrase ? out.phrase.slice(0, 80) : 'Кажется, сценарист проспал.' });
      if (b) sc.beats.push({ who: b.id, do: 'hug', to: a.id, emotion: 'love' });
      else sc.beats.push({ who: a.id, do: 'dance' });
      out.scenes.push(sc);
    }
    return { script: out, fixes };
  }

  // ================================================================
  //  compile: сценарий → фильм. Время абсолютное, в секундах фильма.
  //  Сцена = набор дорожек: тело актёра (сегменты), эмоции, реплики,
  //  реквизит, камера, толчки камеры, эффекты, звуковые события.
  // ================================================================
  const WALK = 26, RUN = 54, FLY = 30;   // скорость: единиц сцены (0–100) в секунду
  const GAP = 0.14;                      // вдох между действиями
  const OFF_L = -16, OFF_R = 116;        // за кадром
  const inFrame = (x) => x > -4 && x < 104;

  function moveEase(u, dur) {
    const a = Math.min(0.3, 0.2 / Math.max(dur, 0.01));
    const v = 1 / (1 - a);
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    if (u < a) return (v * u * u) / (2 * a);
    if (u > 1 - a) { const r = 1 - u; return 1 - (v * r * r) / (2 * a); }
    return v * (u - a / 2);
  }

  function compile(script, opts) {
    const pace = (opts && opts.pace) || 1;   // < 1 — сжать реплики и паузы, если фильм вышел длинным
    const film = {
      title: script.title, phrase: script.phrase, mood: script.mood,
      seed: hashStr(JSON.stringify(script).slice(0, 5000)),
      cast: {}, scenes: [], events: [], duration: 0, finalWho: null,
    };
    const kindCount = {};
    for (const c of script.cast) {
      const n = (kindCount[c.kind] = (kindCount[c.kind] || 0) + 1) - 1;
      film.cast[c.id] = { ...c, variant: n, def: KINDS[c.kind], seed: hashStr(c.id + ':' + c.kind) };
    }
    const lastEmo = {};
    const lastHold = {};   // реквизит в руках переходит в следующую сцену
    let T = 0;

    script.scenes.forEach((sc, si) => {
      const last = si === script.scenes.length - 1;
      const S = {
        i: si, t0: T, t1: T, place: sc.place, time: sc.time, mood: sc.mood,
        actors: {}, props: {}, cams: [], shakes: [], talks: [], fx: [], lastSpeaker: null,
      };
      const st = {};
      const ev = (t, type, who, extra) => film.events.push({ t, type, who, ...(extra || {}) });

      // --- кто играет в сцене и где стоит ---
      const used = [];
      const use = (id) => { if (id && film.cast[id] && !used.includes(id)) used.push(id); };
      sc.cast.forEach((c) => use(c.id));
      sc.beats.forEach((b) => { use(b.who); if (typeof b.to === 'string') use(b.to); use(b.on); });
      const spots = used.length === 1 ? [50] : used.map((_, k) => 20 + (k * 60) / (used.length - 1));
      used.forEach((id, k) => {
        const def = film.cast[id].def;
        const pl = sc.cast.find((c) => c.id === id);
        const first = sc.beats.find((b) => b.who === id);
        const hidden = !!first && (first.do === 'enter' || first.do === 'appear');
        const x = pl && pl.x != null ? pl.x : spots[k];
        const alt = pl && pl.y != null ? pl.y : def.alt || 0;
        const face = pl && pl.face ? (pl.face === 'left' ? -1 : 1) : x < 50 ? 1 : -1;
        const emo = (pl && pl.emotion) || lastEmo[id] || (film.cast[id].villain ? 'sly' : 'neutral');
        st[id] = { x, alt, face, emo, vis: hidden ? 0 : 1, lie: 0, hold: null };
      });
      // нейросеть не следит за координатами: двоих на одной отметке разводим в стороны
      const ground = (id) => st[id].alt < 25;
      for (let pass = 0; pass < 4; pass++) {
        const row = used.filter((id) => st[id].vis && ground(id) && inFrame(st[id].x)).sort((a, b) => st[a].x - st[b].x);
        for (let k = 1; k < row.length; k++) {
          const a = st[row[k - 1]], b = st[row[k]], d = b.x - a.x;
          if (d >= 13) continue;
          const push = (13 - d) / 2;
          a.x = clamp(a.x - push, 6, 94); b.x = clamp(b.x + push, 6, 94);
        }
      }
      used.forEach((id) => {
        const pl = sc.cast.find((c) => c.id === id);
        if (!(pl && pl.face)) st[id].face = st[id].x < 50 ? 1 : -1;
        S.actors[id] = { init: { ...st[id] }, segs: [], emo: [{ t: S.t0, e: st[id].emo }], talk: [] };
      });
      for (const p of sc.props) S.props[p.id] = { id: p.id, kind: p.kind, ev: [{ t: S.t0, holder: null, x: p.x }] };

      // --- помощники ---
      const seg = (id, t0, dur, act, to, p) => {
        const a = { ...st[id] };
        const b = { ...a, ...(to || {}) };
        const s = { t0, t1: t0 + dur, act, a, b, p: p || {} };
        S.actors[id].segs.push(s);
        st[id] = { ...b };
        return s;
      };
      const busy = (id, t) => S.actors[id].segs.some((s) => s.t0 <= t + 0.01 && t < s.t1 - 0.05);
      const fx = (type, t0, t1, who, extra) => S.fx.push({ type, t0, t1, who, ...(extra || {}) });
      const setEmo = (id, t, e) => {
        if (!e || st[id].emo === e) return;
        st[id].emo = e;
        S.actors[id].emo.push({ t, e });
        const react = { love: 'hearts', surprised: 'excl', angry: 'steam', scared: 'sweat', sad: 'rain', happy: 'sparkle', sly: 'glint' }[e];
        if (react && t > S.t0 + 0.05) { fx(react, t, t + (e === 'sad' ? 2.4 : 1.4), id); ev(t, 'emo', id, { e }); }
      };
      const visibleOthers = (id) => used.filter((o) => o !== id && st[o].vis && inFrame(st[o].x));
      const nearest = (id) => {
        let best = null, bd = 1e9;
        for (const o of visibleOthers(id)) { const d = Math.abs(st[o].x - st[id].x); if (d < bd) { bd = d; best = o; } }
        return best;
      };
      const freeSpot = (id) => {
        let best = 50, bs = -1;
        for (const x of [22, 36, 50, 64, 78]) {
          let m = 1e9;
          for (const o of visibleOthers(id)) m = Math.min(m, Math.abs(st[o].x - x));
          const score = m - Math.abs(x - 50) * 0.05;
          if (score > bs) { bs = score; best = x; }
        }
        return best;
      };
      // --- чтобы куклы не вставали друг в друга ---
      const sameLevel = (a, b) => Math.abs(st[a].alt - st[b].alt) < 25;
      const clearance = (id, x, skip) => {
        let m = 1e9;
        for (const o of used) {
          if (o === id || o === skip || !st[o].vis || !inFrame(st[o].x) || !sameLevel(o, id)) continue;
          m = Math.min(m, Math.abs(st[o].x - x));
        }
        return m;
      };
      // место рядом с other: сначала со своей стороны, если там занято — с другой
      const besideOf = (id, other, gap) => {
        const tx = st[other].x, pref = st[id].x <= tx ? -1 : 1;
        let best = null, bestC = -1;
        for (const s of [pref, -pref]) {
          const g = tx + s * gap;
          if (g < 3 || g > 97) continue;
          const c = clearance(id, g, other);
          if (c >= 10) return g;
          if (c > bestC) { bestC = c; best = g; }
        }
        return best == null ? clamp(tx + pref * gap, -2, 102) : best;
      };
      // цель ходьбы занята — ближайшая к ней свободная точка (сначала не доходя, потом дальше)
      const unblock = (id, goal) => {
        if (!inFrame(goal) || clearance(id, goal) >= 10) return goal;
        const dir = Math.sign(goal - st[id].x) || 1;
        let best = goal, bestC = -1;
        for (let d = 4; d <= 48; d += 4) {
          for (const c of [goal - dir * d, goal + dir * d]) {
            if (c < 4 || c > 96) continue;
            const cl = clearance(id, c);
            if (cl >= 10) return c;
            if (cl > bestC) { bestC = cl; best = c; }
          }
        }
        return best;
      };
      const steps = (id, t0, dur, rate) => { for (let k = 0.5; k / rate < dur; k++) ev(t0 + k / rate, 'step', id, { soft: rate < 3 }); };
      const move = (id, t0, toX, act, extra) => {
        const dx = toX - st[id].x;
        const dAlt = extra && extra.alt != null ? Math.abs(extra.alt - st[id].alt) : 0;
        const speed = act === 'run' ? RUN : act === 'fly' ? FLY : WALK;
        const dur = clamp(Math.max(Math.abs(dx), dAlt * 0.8) / speed, 0.5, act === 'run' ? 2.8 : 4.4);
        const face = Math.abs(dx) > 0.6 ? Math.sign(dx) : st[id].face;
        seg(id, t0, dur, act, { x: toX, face, lie: 0, ...(extra || {}) });
        if (act === 'walk') steps(id, t0, dur, 2.7);
        if (act === 'run') { steps(id, t0, dur, 4.6); fx('dust', t0, t0 + dur, id); }
        if (act === 'fly' && film.cast[id].def.fly && !film.cast[id].def.float) ev(t0, 'flap', id);
        return dur;
      };
      const turnTo = (id, x, t) => {
        const f = Math.sign(x - st[id].x);
        if (!f || f === st[id].face || busy(id, t)) return 0;
        seg(id, t, 0.26, 'turn', { face: f });
        return 0.26;
      };
      const approach = (id, other, t, gap) => {
        const tx = st[other].x, x = st[id].x;
        if (Math.abs(Math.abs(tx - x) - gap) < 2.5) return turnTo(id, tx, t);
        const goal = besideOf(id, other, gap);
        if (Math.abs(goal - x) < 2.5) return turnTo(id, tx, t);
        const extra = film.cast[id].def.float ? {} : { alt: 0 };
        const d = move(id, t, goal, film.cast[id].def.fly && st[id].alt > 4 ? 'fly' : 'walk', extra);
        return d + turnTo(id, tx, t + d);
      };
      const ensureOn = (id, t) => {
        if (st[id].vis && inFrame(st[id].x)) return 0;
        const def = film.cast[id].def;
        const goal = freeSpot(id);
        st[id].x = goal < 50 ? OFF_L : OFF_R;
        st[id].vis = 1;
        if (def.fly && !def.float) st[id].alt = 24;
        return move(id, t, goal, def.fly ? 'fly' : 'walk', { alt: def.float ? (def.alt || 0) : 0 });
      };
      const resolveX = (id, to, fallbackShift) => {
        if (typeof to === 'number') return unblock(id, to);
        if (to === 'left') return unblock(id, 14);
        if (to === 'right') return unblock(id, 86);
        if (to === 'out') return st[id].x < 50 ? OFF_L : OFF_R;
        if (typeof to === 'string' && st[to]) return besideOf(id, to, 12);
        const x = st[id].x;
        return clamp(x < 50 ? x + fallbackShift : x - fallbackShift, 8, 92);
      };
      const findProp = (kind, t) => {
        for (const p of Object.values(S.props)) {
          const last = p.ev[p.ev.length - 1];
          if ((!kind || p.kind === kind) && !last.holder) return p;
        }
        return null;
      };
      let propN = 0;
      const spawnProp = (kind, t, holder, x) => {
        const id = kind + '#' + ++propN;
        S.props[id] = { id, kind, ev: [{ t: S.t0, holder: null, x: -999, hidden: true }, { t, holder, x }] };
        return S.props[id];
      };
      // подойти к предмету, наклониться и взять; что было в руках — положить рядом
      const pickUp = (id, p, t) => {
        const def = film.cast[id].def;
        const heldId = st[id].hold;
        const px = p.ev[p.ev.length - 1].x;
        if (Math.abs(px - st[id].x) > 7 || Math.sign(px - st[id].x) !== st[id].face) {
          const goal = clamp(px - Math.sign(px - st[id].x || 1) * 6, -2, 102);
          if (Math.abs(goal - st[id].x) > 1.5) t += move(id, t, goal, 'walk', def.float ? {} : { alt: 0 });
          t += turnTo(id, px, t);
        }
        if (heldId && heldId !== p.id) S.props[heldId].ev.push({ t: t + 0.5, holder: null, x: clamp(st[id].x - st[id].face * 5, 2, 98) });
        seg(id, t, 1.05, 'take', { hold: p.id }, { prop: p.id });
        p.ev.push({ t: t + 0.5, holder: id });
        ev(t + 0.5, 'take', id);
        return t + 1.05;
      };
      for (const id of used) {
        if (!lastHold[id]) continue;
        let p = Object.values(S.props).find((q) => q.kind === lastHold[id] && !q.ev[q.ev.length - 1].holder);
        if (p) p.ev = [{ t: S.t0, holder: id, x: p.ev[0].x }];
        else p = spawnProp(lastHold[id], S.t0, id, 0);
        st[id].hold = p.id; S.actors[id].init.hold = p.id;
      }

      // --- камера ---
      // план режиссёра из сценария держится camLock секунд, дальше снова работает автомонтаж
      S.cams.push({ t: S.t0, mode: sc.shot || 'wide', on: [], blend: 0 });
      let lastCamT = S.t0, camLock = 0;
      const cam = (t, mode, on, hold) => {
        if (t < camLock) return;
        const prev = S.cams[S.cams.length - 1];
        if (prev.mode === mode && String(prev.on) === String(on || [])) return;
        if (t - lastCamT < (hold || 1.6)) return;
        S.cams.push({ t, mode, on: on || [], blend: mode === 'close' ? 0.55 : 0.8 });
        lastCamT = t;
      };

      // --- действия по очереди ---
      let cursor = S.t0 + (si === 0 ? 2.0 : 0.8);
      let groupStart = cursor;
      let says = 0;
      for (const b of sc.beats) {
        if (b.camera) {
          if (b.camera === 'shake') S.shakes.push({ t: cursor, amp: 1 });
          else {
            S.cams.push({ t: cursor, mode: b.camera, on: b.on ? [b.on] : [], blend: b.camera === 'close' ? 0.55 : 0.85 });
            lastCamT = cursor; camLock = cursor + 3.2;
          }
          continue;
        }
        const id = b.who;
        if (!st[id]) continue;
        const def = film.cast[id].def;
        let t = b.with ? groupStart : cursor;
        groupStart = t;
        if (!['enter', 'appear', 'wait'].includes(b.do)) t += ensureOn(id, t);
        if (b.emotion) setEmo(id, t, b.emotion);
        const other = typeof b.to === 'string' && st[b.to] ? b.to : null;
        let end = t;

        switch (b.do) {
          case 'walk': case 'run': case 'fly': {
            if (other) t += ensureOn(other, t);
            const goal = resolveX(id, b.to, b.do === 'run' ? 40 : 26);
            const extra = {};
            if (b.do === 'fly') extra.alt = b.y != null ? b.y : b.to === 'up' ? 62 : def.float ? (def.alt || 20) : Math.max(st[id].alt, 30);
            else if (!def.float) extra.alt = 0;
            if (!inFrame(goal)) extra.vis = 0;
            end = t + move(id, t, goal, b.do, extra);
            if (other && inFrame(goal)) end += turnTo(id, st[other].x, end);
            if (inFrame(goal)) cam(t, 'full', [], 1.2);
            break;
          }
          case 'enter': {
            let goal = typeof b.to === 'number' ? unblock(id, b.to) : other ? resolveX(id, other, 0) : null;
            if (st[id].vis && inFrame(st[id].x)) {
              if (goal == null) goal = st[id].x;
              end = t + (Math.abs(goal - st[id].x) > 2 ? move(id, t, goal, def.fly ? 'fly' : 'walk', def.float ? {} : { alt: 0 }) : 0.3);
            } else {
              if (goal == null) goal = S.actors[id].init.vis === 0 ? S.actors[id].init.x : freeSpot(id);
              st[id].x = b.to === 'right' || goal >= 50 ? OFF_R : OFF_L;
              st[id].vis = 1;
              if (def.fly && !def.float) st[id].alt = 26;
              const alt = b.y != null ? b.y : def.float ? (def.alt || 0) : 0;
              end = t + move(id, t, clamp(goal, 4, 96), def.fly ? 'fly' : 'walk', { alt });
            }
            if (other) end += turnTo(id, st[other].x, end);
            cam(t, t - S.t0 < 2.5 ? 'wide' : 'full', [], 1.0);
            break;
          }
          case 'exit': {
            let side = b.to === 'left' ? -1 : b.to === 'right' ? 1 : typeof b.to === 'number' ? (b.to < 50 ? -1 : 1) : st[id].x < 50 ? -1 : 1;
            const act = def.fly && (st[id].alt > 4 || def.float) ? 'fly' : st[id].emo === 'scared' ? 'run' : 'walk';
            end = t + move(id, t, side < 0 ? OFF_L : OFF_R, act, { vis: 0 });
            break;
          }
          case 'jump': {
            const goal = b.to != null && b.to !== 'up' ? resolveX(id, b.to, 12) : st[id].x;
            const h = b.y != null ? 8 + b.y * 0.6 : b.to === 'up' ? 42 : 22;
            const dur = 0.95 + h * 0.008;
            seg(id, t, dur, 'jump', { x: goal, lie: 0, face: Math.abs(goal - st[id].x) > 1 ? Math.sign(goal - st[id].x) : st[id].face }, { h });
            ev(t + dur * 0.22, 'jump', id);
            ev(t + dur * 0.8, 'land', id);
            S.shakes.push({ t: t + dur * 0.8, amp: 0.25 });
            fx('dust', t + dur * 0.8, t + dur * 0.8 + 0.6, id, { puff: 1 });
            end = t + dur;
            break;
          }
          case 'say': case 'sing': case 'think': {
            const text = b.text || (b.do === 'think' ? '…' : '…');
            const dur = clamp((0.95 + text.length * 0.06) * pace, 1.5, 5.4) + (b.do === 'sing' ? 0.7 : 0);
            const to = other || (b.do !== 'think' ? nearest(id) : null);
            if (to) turnTo(id, st[to].x, t);
            S.actors[id].talk.push({ t0: t, t1: t + dur, kind: b.do, text, to });
            S.talks.push({ who: id, t0: t, t1: t + dur, kind: b.do, text, emo: st[id].emo });
            ev(t, b.do, id, { dur, text });
            if (to && b.do !== 'think') turnTo(to, st[id].x, t + 0.25);
            if (b.do === 'sing') fx('notes', t, t + dur, id);
            const strong = ['angry', 'sad', 'love', 'scared', 'surprised'].includes(st[id].emo);
            says++;
            if (strong && says % 2 === 0) cam(t, 'close', [id]);
            else if (says % 3 !== 0 && to) cam(t, 'medium', [id, to]);
            else cam(t, strong ? 'close' : 'medium', [id]);
            S.lastSpeaker = id;
            end = t + dur;
            break;
          }
          case 'hug': {
            const to = other || nearest(id);
            if (!to) { seg(id, t, 1.4, 'selfhug'); end = t + 1.4; break; }
            t += ensureOn(to, t);
            t += approach(id, to, t, 9.5);
            const dir = Math.sign(st[to].x - st[id].x) || st[id].face;
            const dur = 2.2;
            seg(id, t, dur, 'hug', { face: dir }, { other: to, lead: 1 });
            if (!busy(to, t)) seg(to, t, dur, 'hug', { face: -dir }, { other: id, lead: 0 });
            if (st[id].emo !== 'sly' && st[id].emo !== 'angry') fx('hearts', t + 0.45, t + dur, id, { other: to });
            ev(t + 0.4, 'hug', id);
            cam(t, 'medium', [id, to], 1.0);
            end = t + dur;
            break;
          }
          case 'fall': {
            const dur = 1.95;
            seg(id, t, dur, 'fall', { x: clamp(st[id].x + st[id].face * 5, -2, 102), lie: 0 });
            ev(t + 0.08, 'slip', id); ev(t + 0.45, 'bonk', id);
            S.shakes.push({ t: t + 0.45, amp: 0.9 });
            fx('stars', t + 0.5, t + 1.5, id); fx('dust', t + 0.45, t + 1.1, id, { puff: 1 });
            cam(t, 'full', [], 1.0);
            end = t + dur;
            break;
          }
          case 'look': {
            const tx = other ? st[other].x : typeof b.to === 'number' ? b.to : null;
            const up = b.to === 'up' || (other && st[other].alt > 25) ? 1 : 0;
            const face = tx != null && Math.abs(tx - st[id].x) > 1 ? Math.sign(tx - st[id].x) : st[id].face;
            seg(id, t, 1.05, 'look', { face }, { up, other });
            if (st[id].emo === 'surprised') fx('excl', t, t + 1, id);
            else if (!b.emotion && st[id].emo === 'neutral') fx('quest', t + 0.2, t + 1.05, id);
            end = t + 1.05;
            break;
          }
          case 'wave': {
            if (other) t += turnTo(id, st[other].x, t);
            seg(id, t, 1.5, 'wave', {}, { other });
            ev(t, 'wave', id);
            end = t + 1.5;
            break;
          }
          case 'dance': {
            seg(id, t, 2.8, 'dance');
            ev(t, 'dance', id, { dur: 2.8 });
            fx('notes', t, t + 2.8, id);
            cam(t, 'full', [], 1.2);
            end = t + 2.8;
            break;
          }
          case 'cry': {
            if (!['sad', 'scared', 'love', 'happy'].includes(st[id].emo)) setEmo(id, t, 'sad');
            seg(id, t, 2.3, 'cry');
            fx('tears', t + 0.2, t + 2.3, id);
            ev(t, 'cry', id, { dur: 2.3 });
            cam(t, 'close', [id], 1.2);
            end = t + 2.3;
            break;
          }
          case 'laugh': {
            if (!['happy', 'sly', 'love'].includes(st[id].emo)) setEmo(id, t, film.cast[id].villain ? 'sly' : 'happy');
            seg(id, t, 1.9, 'laugh');
            fx('haha', t, t + 1.9, id);
            ev(t, 'laugh', id, { dur: 1.9, evil: st[id].emo === 'sly' });
            end = t + 1.9;
            break;
          }
          case 'sleep': {
            seg(id, t, 2.6, 'sleep', { lie: 1 });
            fx('zzz', t + 0.8, S.t0 + 999, id);
            ev(t + 0.8, 'snore', id);
            end = t + 2.6;
            break;
          }
          case 'shake': {
            if (st[id].emo === 'neutral' || st[id].emo === 'happy') setEmo(id, t, 'scared');
            seg(id, t, 1.5, 'shake');
            fx('sweat', t, t + 1.5, id);
            ev(t, 'shiver', id, { dur: 1.5 });
            end = t + 1.5;
            break;
          }
          case 'turn': {
            seg(id, t, 0.35, 'turn', { face: other ? Math.sign(st[other].x - st[id].x) || -st[id].face : -st[id].face });
            end = t + 0.35;
            break;
          }
          case 'take': {
            const heldId = st[id].hold, held = heldId && S.props[heldId];
            let p = findProp(b.what, t);
            // уже держит нужное (или «берёт» без уточнения, а в руках что-то есть) — просто показывает
            if (held && (!b.what || held.kind === b.what)) {
              seg(id, t, 1.3, 'show', {}, { prop: heldId });
              ev(t + 0.3, 'take', id);
              end = t + 1.3;
              break;
            }
            if (!p && !b.what) { seg(id, t, 1.05, 'look', {}, { up: 0 }); end = t + 1.05; break; }
            if (!p) p = spawnProp(b.what, S.t0, null, clamp(st[id].x + st[id].face * 9, 4, 96));
            end = pickUp(id, p, t);
            break;
          }
          case 'give': {
            const to = other || nearest(id);
            let pid = st[id].hold;
            if (!pid || (b.what && S.props[pid].kind !== b.what)) {
              const lying = b.what ? findProp(b.what, t) : null;
              if (lying && to) { t = pickUp(id, lying, t) + 0.1; pid = lying.id; }
              else pid = spawnProp(b.what || 'heart', t, id, 0).id;
            }
            if (!to) { seg(id, t, 1.2, 'wave'); end = t + 1.2; break; }
            t += ensureOn(to, t);
            t += approach(id, to, t, 10);
            const dir = Math.sign(st[to].x - st[id].x) || st[id].face;
            seg(id, t, 1.5, 'give', { hold: null, face: dir }, { other: to, prop: pid });
            if (!busy(to, t)) seg(to, t, 1.5, 'receive', { hold: pid, face: -dir }, { other: id, prop: pid });
            else st[to].hold = pid;
            S.props[pid].ev.push({ t: t + 0.75, holder: to });
            ev(t + 0.75, 'give', id);
            cam(t, 'medium', [id, to], 1.2);
            end = t + 1.5;
            break;
          }
          case 'push': {
            const to = other || nearest(id);
            if (!to) { seg(id, t, 1.1, 'push', {}, {}); end = t + 1.1; break; }
            t += approach(id, to, t, 9);
            const dir = Math.sign(st[to].x - st[id].x) || st[id].face;
            seg(id, t, 1.1, 'push', { face: dir }, { other: to });
            const kx = clamp(st[to].x + dir * 17, -8, 108);
            seg(to, t + 0.36, 2.05, 'knock', { x: kx, face: -dir, lie: 0 }, { dir });
            ev(t + 0.36, 'whack', id); ev(t + 0.75, 'bonk', to);
            S.shakes.push({ t: t + 0.38, amp: 1.1 });
            fx('pow', t + 0.36, t + 0.8, to);
            fx('stars', t + 0.9, t + 2.1, to);
            cam(t, 'full', [id, to], 1.0);
            end = t + 2.45;
            break;
          }
          case 'chase': {
            const to = other || nearest(id);
            if (!to) { end = t + move(id, t, resolveX(id, null, 40), 'run'); break; }
            t += ensureOn(to, t);
            const dir = Math.sign(st[to].x - st[id].x) || 1;
            if (st[to].emo !== 'angry' && st[to].emo !== 'sly') setEmo(to, t, 'scared');
            fx('excl', t, t + 0.6, to);
            // первый проход: убегающий впереди, догоняющий следом — оба за кадр
            const out = dir > 0 ? OFF_R + 6 : OFF_L - 6, back = dir > 0 ? OFF_L - 6 : OFF_R + 6;
            const d1 = move(to, t + 0.25, out, 'run', { vis: 0, alt: def.float ? st[to].alt : 0 });
            const d2 = move(id, t + 0.55, out, 'run', { vis: 0, alt: 0 });
            // мультяшный круг: влетают с другой стороны и снова пересекают кадр
            const t2 = t + 0.55 + d2 + 0.35;
            st[to].x = back; st[id].x = back - dir * 14; st[to].vis = 1; st[id].vis = 1;
            const d3 = move(to, t2, out, 'run', { vis: 0 });
            const d4 = move(id, t2 + 0.3, out, 'run', { vis: 0 });
            fx('speed', t, t2 + 0.3 + d4, id); fx('speed', t, t2 + d3, to);
            ev(t, 'chase', id, { dur: t2 + d4 - t });
            S.cams.push({ t, mode: 'wide', on: [], blend: 0.5 }); lastCamT = t;
            end = Math.max(t2 + 0.3 + d4, t + 0.25 + d1);
            break;
          }
          case 'appear': {
            const goal = typeof b.to === 'number' ? unblock(id, b.to) : st[id].vis && inFrame(st[id].x) ? st[id].x : freeSpot(id);
            st[id].x = clamp(goal, 4, 96); st[id].vis = 0;
            if (b.y != null) st[id].alt = b.y;
            seg(id, t, 0.9, 'appear', { vis: 1 });
            fx('poof', t, t + 0.8, id); ev(t, 'pop', id);
            end = t + 0.9;
            break;
          }
          case 'vanish': {
            seg(id, t, 0.8, 'vanish', { vis: 0 });
            fx('poof', t + 0.15, t + 0.95, id); ev(t + 0.15, 'pop', id);
            end = t + 0.9;
            break;
          }
          case 'wait':
          default:
            end = t + (b.dur || 1.0) * pace;
        }
        cursor = Math.max(cursor, end + GAP * pace);
        if (!b.with) S.lastActor = id;
      }

      // --- конец сцены ---
      S.cams.sort((a, b) => a.t - b.t);
      S.t1 = cursor + (last ? 3.2 : 0.95 * pace);
      for (const f of S.fx) f.t1 = Math.min(f.t1, S.t1);
      used.forEach((id) => {
        lastEmo[id] = st[id].emo;
        let held = null;
        for (const p of Object.values(S.props)) { const e = p.ev[p.ev.length - 1]; if (e.holder === id) held = p.kind; }
        lastHold[id] = held;
      });
      if (last) {
        // диафрагма «Конец» закрывается на том, кто виден в последнем кадре: последний действовавший, потом говоривший
        const seen = (id) => id && st[id] && st[id].vis && inFrame(st[id].x);
        film.finalWho = [S.lastActor, S.lastSpeaker].find(seen) || used.find(seen) || null;
      }
      T = S.t1;
      film.scenes.push(S);
    });

    film.duration = T;
    film.events.sort((a, b) => a.t - b.t);
    return film;
  }

  // ================================================================
  //  Состояние актёра в момент t (для движка кадра)
  // ================================================================
  function evalActor(S, id, t) {
    const A = S.actors[id];
    let seg = null, prev = null;
    for (const s of A.segs) {
      if (s.t0 <= t && t < s.t1) { if (!seg || s.t0 >= seg.t0) seg = s; }
      else if (s.t1 <= t && (!prev || s.t1 >= prev.t1)) prev = s;
    }
    const base = prev ? prev.b : A.init;
    const r = { id, act: 'idle', u: 0, lt: t - S.t0, dur: 1, p: {}, x: base.x, alt: base.alt, face: base.face, vis: base.vis, lie: base.lie, a: base, b: base };
    if (seg) {
      const dur = seg.t1 - seg.t0, lt = t - seg.t0, u = clamp(lt / dur, 0, 1);
      const a = seg.a, b = seg.b;
      Object.assign(r, { act: seg.act, u, lt, dur, p: seg.p, a, b, vis: a.vis || b.vis ? 1 : 0, face: b.face, lie: a.lie });
      switch (seg.act) {
        case 'walk': case 'run': case 'fly': {
          const e = moveEase(u, dur);
          r.x = a.x + (b.x - a.x) * e;
          const s = u * u * (3 - 2 * u);
          r.alt = a.alt + (b.alt - a.alt) * s;
          break;
        }
        case 'jump': {
          const s = clamp((u - 0.22) / 0.58, 0, 1);
          const e = s * s * (3 - 2 * s);
          r.x = a.x + (b.x - a.x) * e;
          r.alt = a.alt + (b.alt - a.alt) * e + seg.p.h * 4 * s * (1 - s);
          break;
        }
        case 'knock': {
          const s = clamp(u / 0.32, 0, 1);
          r.x = a.x + (b.x - a.x) * (1 - (1 - s) * (1 - s));
          r.alt = a.alt + 7 * 4 * s * (1 - s);
          break;
        }
        case 'fall': {
          const s = clamp(u / 0.3, 0, 1);
          r.x = a.x + (b.x - a.x) * (1 - (1 - s) * (1 - s));
          r.alt = a.alt;
          break;
        }
        case 'turn':
          r.face = u < 0.45 ? a.face : b.face;
          r.x = a.x; r.alt = a.alt;
          break;
        default:
          r.x = a.x; r.alt = a.alt + (b.alt - a.alt) * u;
      }
    }
    // эмоция
    let e = A.emo[0].e, et = A.emo[0].t;
    for (const q of A.emo) if (q.t <= t) { e = q.e; et = q.t; }
    r.emo = e; r.emoT = t - et;
    // реплика
    r.talk = null;
    for (const q of A.talk) if (q.t0 <= t && t < q.t1) r.talk = q;
    return r;
  }

  // Где реквизит в момент t: у кого в руках или где лежит
  function evalProp(P, t) {
    let cur = P.ev[0], x = P.ev[0].x;
    for (const q of P.ev) if (q.t <= t) { cur = q; if (q.x != null && !q.holder) x = q.x; }
    return { holder: cur.holder, x, hidden: !!cur.hidden };
  }

  function sceneAt(film, t) {
    const sc = film.scenes;
    for (let i = 0; i < sc.length; i++) if (t < sc[i].t1) return sc[i];
    return sc[sc.length - 1];
  }

  // ================================================================
  //  Сценарий → текст (сценарная запись для панели «Сценарий»)
  // ================================================================
  function toScreenplay(script) {
    const name = (id) => { const a = script.cast.find((c) => c.id === id); return a ? a.name : id; };
    const lines = [];
    lines.push({ k: 'title', text: script.title });
    if (script.phrase) lines.push({ k: 'logline', text: '«' + script.phrase + '»' });
    lines.push({ k: 'cast', text: 'В ролях: ' + script.cast.map((c) => `${c.name} (${KINDS[c.kind].ru}${c.villain ? ', злодей' : ''}${c.look !== 'none' ? ', ' + LOOKS[c.look] : ''})`).join(', ') });
    script.scenes.forEach((sc, i) => {
      lines.push({ k: 'scene', i, text: `Сцена ${i + 1}. ${PLACES[sc.place].ru}, ${TIMES[sc.time]}. Музыка ${MOODS[sc.mood]}.` });
      if (sc.props.length) lines.push({ k: 'note', text: 'Реквизит: ' + sc.props.map((p) => PROPS[p.kind]).join(', ') + '.' });
      for (const b of sc.beats) {
        if (b.camera) { lines.push({ k: 'camera', text: 'Камера: ' + CAMS[b.camera] + (b.on ? ' — ' + name(b.on) : '') + '.' }); continue; }
        const emo = b.emotion ? ` (${EMOTIONS[b.emotion]})` : '';
        const w = b.with ? 'Одновременно: ' : '';
        if (b.do === 'say' || b.do === 'sing' || b.do === 'think') {
          const verb = b.do === 'sing' ? ' (поёт)' : b.do === 'think' ? ' (думает)' : '';
          lines.push({ k: 'line', who: name(b.who), text: w + (b.text || '…'), meta: (verb + emo).trim() });
        } else {
          // имена придумывает нейросеть, склонять их ненадёжно — адресат через стрелку, как в раскадровке
          let tail = '';
          if (typeof b.to === 'string' && b.to.length && script.cast.some((c) => c.id === b.to)) tail = ' → ' + name(b.to);
          else if (typeof b.to === 'number') tail = ` к\u00a0точке ${Math.round(b.to)}`;
          else if (b.to === 'left' || b.to === 'right') tail = b.to === 'left' ? ' влево' : ' вправо';
          if (b.what) tail += `: ${PROPS[b.what]}`;
          lines.push({ k: 'action', text: `${w}${name(b.who)} ${ACTIONS[b.do]}${tail}${emo}.` });
        }
      }
    });
    return lines;
  }

  // Собрать фильм и, если он вышел длиннее минуты, поджать темп
  function build(script) {
    let film = compile(script);
    if (film.duration > 62) film = compile(script, { pace: Math.max(0.7, 60 / film.duration) });
    if (film.duration > 66) film = compile(script, { pace: 0.62 });
    return film;
  }

  window.Lang = {
    build,
    PLACES, TIMES, KINDS, ACTIONS, EMOTIONS, MOODS, CAMS, PROPS, LOOKS,
    normalize, compile, evalActor, evalProp, sceneAt, toScreenplay, detectKinds, hashStr, moveEase, clamp,
  };
})();
