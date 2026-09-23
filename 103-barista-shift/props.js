/* ================================================================
   Смена — всё, что внутри киоска: прилавок, кофемашина, кофемолка,
   стаканы, холодильник с молоком, ящик пива под прилавком, телефон.
   И анимации шагов: помол, темпер, пролив, пар, заливка, пиво.
   ================================================================ */
(function () {
  'use strict';
  window.PropsKit = function (K, View) {
    const THREE = K.THREE, scene = K.scene, rnd = K.rnd, lerp = K.lerp, clamp = K.clamp;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = (a, b, h, s = 10, hs = 1, open = false) => new THREE.CylinderGeometry(a, b, h, s, hs, open);
    const api = {};
    const TOP = 1.18; // высота столешницы
    const pick = (obj, station) => { obj.userData.station = station; View.pickables.push(obj); return obj; };
    const mat = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
    const chrome = new THREE.MeshPhongMaterial({ color: 0xb9bcc4, specular: 0xffffff, shininess: 90 });
    const chromeDark = new THREE.MeshPhongMaterial({ color: 0x5a5e66, specular: 0x999999, shininess: 60 });

    // ================================================================
    // Статика интерьера (один меш)
    // ================================================================
    const B = new K.Batch();
    // столешница и тумба
    B.add(box, 0xc99a68, 0, 1.15, .86, 0, 0, 0, 2.86, .06, .62);
    B.add(box, 0x9a6f48, 0, 1.115, .552, 0, 0, 0, 2.86, .012, .02);
    B.add(box, 0x7a5236, 0, .7, 1.12, 0, 0, 0, 2.84, .86, .04);
    for (const x of [-1.38, -.02, 1.38]) B.add(box, 0x8a6040, x, .7, .86, 0, 0, 0, .04, .86, .56);
    // стенная полка с сиропами справа
    B.add(box, 0x9a6f48, 1.36, 1.6, .38, 0, 0, 0, .16, .03, .9);
    B.add(box, 0x9a6f48, 1.36, 2.02, .38, 0, 0, 0, .16, .03, .9);
    // кофемашина
    const MX = -.78, MZ = .9;
    B.add(box, 0xb8382a, MX, TOP + .24, MZ + .02, 0, 0, 0, .66, .44, .46);
    B.add(box, 0x2a2224, MX, TOP + .06, MZ - .02, 0, 0, 0, .64, .1, .5);
    B.add(box, 0xd9dde2, MX, TOP + .475, MZ + .02, 0, 0, 0, .68, .03, .48, .02);
    for (let i = 0; i < 3; i++) B.add(cyl(.035, .028, .08), 0xf4efe6, MX - .18 + i * .12, TOP + .53, MZ + .08, Math.PI, 0, 0);
    // кофемолка
    const GX = -1.2, GZ = .86;
    B.add(box, 0x2a2a2e, GX, TOP + .04, GZ, 0, 0, 0, .2, .08, .26);
    B.add(cyl(.075, .085, .3, 8), 0x303036, GX, TOP + .22, GZ + .03);
    B.add(box, 0x1e1e22, GX, TOP + .13, GZ - .1, 0, 0, 0, .05, .06, .06);
    // стопки стаканов
    const cupStacks = [[.16, .09, 'S'], [.3, .11, 'M'], [.46, .135, 'L']];
    for (const [x, h] of cupStacks) {
      for (let i = 0; i < 5; i++) B.add(cyl(.045 + h * .04, .033 + h * .02, h * .5, 12), i % 2 ? 0xf3ede2 : 0xece4d6, x, TOP + h * .25 + i * .022, .92, 0, 0, 0, 1, 1, 1, 0);
      B.add(cyl(.045 + h * .04, .045 + h * .04, .012, 12), 0xc9543a, x, TOP + h * .5 + .09, .92, 0, 0, 0, 1, 1, 1, 0);
    }
    for (let i = 0; i < 8; i++) B.add(cyl(.05, .05, .012, 12), 0x3a2a24, .64, TOP + .006 + i * .013, .95);
    // кассовый аппарат
    B.add(box, 0x2b2d33, 1.08, TOP + .06, .88, 0, 0, 0, .34, .12, .3);
    B.add(box, 0x3a3d44, 1.08, TOP + .16, .96, -.5, 0, 0, .3, .02, .16);
    B.add(box, 0x1b1c20, .86, TOP + .03, .7, 0, .3, 0, .08, .05, .14);
    // банки: сахар и соль
    for (const [x, c] of [[-.3, 0xfaf8f2], [-.18, 0xfaf8f2]]) { B.add(cyl(.04, .04, .1, 10), c, x, TOP + .05, 1.0); B.add(cyl(.043, .043, .02, 10), 0xc9543a, x, TOP + .11, 1.0); }
    // питчер-кувшин, темпер, нок-бокс
    B.add(box, 0x2a2a2e, -1.2, TOP + .04, .64, 0, 0, 0, .12, .08, .12);
    // под прилавком: мусорка
    B.add(cyl(.14, .12, .4, 10), 0x3a3f48, .24, .47, .86);
    // потолочная лампа
    B.add(box, 0xf8f2e6, 0, 2.49, .35, 0, 0, 0, 1.4, .04, .12);
    // плакат на левой стене
    scene.add(B.mesh());

    // табличка «Улыбайся» и плакат шефа
    const posterTex = K.canvasTex(256, 340, (x, w, h) => {
      x.fillStyle = '#f7efe0'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#c9543a'; x.fillRect(0, 0, w, 60);
      x.fillStyle = '#fff'; x.font = 'bold 32px Rubik, sans-serif'; x.textAlign = 'center'; x.fillText('СТАНДАРТЫ', w / 2, 42);
      x.fillStyle = '#231b16'; x.textAlign = 'left'; x.font = '22px Rubik, sans-serif';
      ['1. Улыбка!', '2. Имя на стакане', '3. Не больше 5 минут', '4. Чистота — лицо', '5. НЕ КУРИТЬ', '    в рабочее время'].forEach((t, i) => x.fillText(t, 18, 100 + i * 36));
      x.font = '30px Caveat, cursive'; x.fillStyle = '#1e3a8a'; x.fillText('В. И. следит!', 60, 322);
    });
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(.36, .48), mat(0xffffff, { map: posterTex }));
    poster.position.set(-1.425, 1.85, .25); poster.rotation.y = Math.PI / 2; scene.add(poster);
    const lampTube = new THREE.Mesh(new THREE.BoxGeometry(1.3, .02, .08), new THREE.MeshBasicMaterial({ color: 0xfff4de }));
    lampTube.position.set(0, 2.465, .35); scene.add(lampTube);

    // наклейка шефа и манометр на задней стенке кофемашины (смотрят на бариста)
    const stickerTex = K.canvasTex(256, 128, (x, w, h) => {
      x.fillStyle = '#f7e27a'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#231b16'; x.textAlign = 'center';
      x.font = 'bold 36px Rubik, sans-serif'; x.fillText('УЛЫБАЙСЯ!', w / 2, 56, w - 24);
      x.font = '28px Caveat, cursive'; x.fillStyle = '#1e3a8a'; x.fillText('клиент всё видит. В. И.', w / 2, 102, w - 20);
    });
    const sticker = new THREE.Mesh(new THREE.PlaneGeometry(.17, .085), mat(0xffffff, { map: stickerTex }));
    sticker.position.set(MX + .205, TOP + .31, MZ - .212); sticker.rotation.set(0, Math.PI, .04); scene.add(sticker);
    const gaugeTex = K.canvasTex(128, 128, (x, w) => {
      const r = w / 2;
      x.fillStyle = '#1c1614'; x.beginPath(); x.arc(r, r, r, 0, 7); x.fill();
      x.fillStyle = '#f4efe6'; x.beginPath(); x.arc(r, r, r - 8, 0, 7); x.fill();
      x.lineWidth = 10; x.strokeStyle = '#3f8f5e'; x.beginPath(); x.arc(r, r, r - 20, Math.PI * 1.05, Math.PI * 1.55); x.stroke();
      x.strokeStyle = '#c0392b'; x.beginPath(); x.arc(r, r, r - 20, Math.PI * 1.75, Math.PI * 2.1); x.stroke();
      x.strokeStyle = '#231b16'; x.lineWidth = 5; x.beginPath(); x.moveTo(r, r); x.lineTo(r - 30, r - 30); x.stroke();
      x.fillStyle = '#231b16'; x.beginPath(); x.arc(r, r, 7, 0, 7); x.fill();
    });
    const gaugeFace = new THREE.Mesh(new THREE.CircleGeometry(.045, 20), mat(0xffffff, { map: gaugeTex }));
    gaugeFace.position.set(MX - .15, TOP + .32, MZ - .212); gaugeFace.rotation.y = Math.PI; scene.add(gaugeFace);

    // ---------- интерактивные части ----------
    const machineHit = pick(new THREE.Mesh(new THREE.BoxGeometry(.7, .5, .5), new THREE.MeshBasicMaterial({ visible: false })), 'machine');
    machineHit.position.set(MX, TOP + .25, MZ); scene.add(machineHit);
    // группа, холдер
    const group = new THREE.Mesh(cyl(.055, .06, .06, 12), chrome); group.position.set(MX, TOP + .31, .64); scene.add(group);
    const holder = new THREE.Group();
    { const basket = new THREE.Mesh(cyl(.05, .045, .04, 12), chromeDark); holder.add(basket);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(.03, .025, .16), mat(0x1c1614)); handle.position.set(0, -.005, -.11); handle.rotation.x = .15; holder.add(handle);
      const spout = new THREE.Mesh(cyl(.012, .008, .03, 6), chromeDark); spout.position.y = -.035; holder.add(spout); }
    holder.position.set(MX, TOP + .255, .64); scene.add(holder);
    const puckMat = mat(0x3b2616);
    const heap = new THREE.Mesh(new THREE.ConeGeometry(.045, .05, 10), puckMat); heap.position.set(GX, TOP + .08, .72); heap.visible = false; scene.add(heap);
    const doser = new THREE.Mesh(cyl(.05, .045, .04, 12), chromeDark); doser.position.set(GX, TOP + .06, .72); scene.add(doser);
    const grinderHit = pick(new THREE.Mesh(new THREE.BoxGeometry(.26, .5, .34), new THREE.MeshBasicMaterial({ visible: false })), 'grinder');
    grinderHit.position.set(GX, TOP + .22, GZ - .04); scene.add(grinderHit);
    const hopper = new THREE.Mesh(cyl(.1, .05, .18, 8), new THREE.MeshLambertMaterial({ color: 0xcfe0ea, transparent: true, opacity: .35, depthWrite: false })); hopper.position.set(GX, TOP + .46, GZ + .03); scene.add(hopper);
    const beans = new THREE.Mesh(cyl(.085, .05, .11, 8), mat(0x4a2a16)); beans.position.set(GX, TOP + .43, GZ + .03); scene.add(beans);
    const grinderBody = new THREE.Group(); grinderBody.add(hopper); grinderBody.add(beans); scene.add(grinderBody);
    // темпер
    const tamper = new THREE.Group();
    { const base = new THREE.Mesh(cyl(.047, .047, .018, 12), chrome); tamper.add(base);
      const h = new THREE.Mesh(cyl(.018, .024, .07, 8), mat(0x5a3a22)); h.position.y = .045; tamper.add(h);
      const k = new THREE.Mesh(new THREE.SphereGeometry(.028, 8, 6), mat(0x5a3a22)); k.position.y = .09; tamper.add(k); }
    tamper.position.set(-1.0, TOP + .01, .66); scene.add(tamper);
    // паровая трубка
    const wand = new THREE.Mesh(cyl(.008, .008, .26, 6), chrome); wand.position.set(MX + .38, TOP + .2, .66); wand.rotation.z = .25; scene.add(wand);
    // кран кипятка
    const tap = new THREE.Mesh(cyl(.01, .012, .1, 6), chrome); tap.position.set(MX - .24, TOP + .22, .66); scene.add(tap);
    // питчер
    const pitcher = new THREE.Group();
    { const p = new THREE.Mesh(cyl(.042, .05, .11, 12, 1, true), new THREE.MeshPhongMaterial({ color: 0xc4c8d0, specular: 0xffffff, shininess: 90, side: THREE.DoubleSide })); p.position.y = .055; pitcher.add(p);
      const hd = new THREE.Mesh(new THREE.BoxGeometry(.012, .07, .05), chrome); hd.position.set(-.055, .06, 0); pitcher.add(hd);
      const milkIn = new THREE.Mesh(cyl(.04, .046, .06, 12), mat(0xf4f1ea)); milkIn.position.y = .035; milkIn.visible = false; pitcher.add(milkIn); pitcher.userData.milk = milkIn; }
    const PITCH_HOME = new THREE.Vector3(-.36, TOP, .74);
    pitcher.position.copy(PITCH_HOME); scene.add(pitcher);
    // струи
    const streamMat = new THREE.MeshBasicMaterial({ color: 0x5a3018, transparent: true, opacity: .95 });
    const streams = [-.012, .012].map((dx) => { const s = new THREE.Mesh(cyl(.004, .003, 1, 5), streamMat); s.visible = false; scene.add(s); s.userData.dx = dx; return s; });
    const pourStream = new THREE.Mesh(cyl(.007, .005, 1, 6), new THREE.MeshBasicMaterial({ color: 0xf4efe6, transparent: true, opacity: .95 })); pourStream.visible = false; scene.add(pourStream);
    const grindStream = new THREE.Mesh(cyl(.008, .006, 1, 5), mat(0x3b2616)); grindStream.visible = false; scene.add(grindStream);

    // ---------- стаканы (клик — взять) ----------
    const cupsHit = pick(new THREE.Mesh(new THREE.BoxGeometry(.5, .3, .2), new THREE.MeshBasicMaterial({ visible: false })), 'cups');
    cupsHit.position.set(.3, TOP + .12, .92); scene.add(cupsHit);
    const jarsHit = pick(new THREE.Mesh(new THREE.BoxGeometry(.26, .16, .14), new THREE.MeshBasicMaterial({ visible: false })), 'jars');
    jarsHit.position.set(-.24, TOP + .06, 1.0); scene.add(jarsHit);
    // этикетки на банках
    const jarLabel = (txt) => K.canvasTex(128, 64, (x, w, h) => { x.fillStyle = '#fbf7ee'; x.fillRect(0, 0, w, h); x.fillStyle = '#231b16'; x.font = 'bold 30px Rubik, sans-serif'; x.textAlign = 'center'; x.fillText(txt, w / 2, 42); });
    [['САХАР', -.3], ['СОЛЬ', -.18]].forEach(([t, x]) => { const l = new THREE.Mesh(new THREE.PlaneGeometry(.07, .035), mat(0xffffff, { map: jarLabel(t) })); l.position.set(x, TOP + .05, .958); l.rotation.y = Math.PI; scene.add(l); });

    // ---------- сиропы на полке ----------
    const shelfHit = pick(new THREE.Mesh(new THREE.BoxGeometry(.2, .45, .9), new THREE.MeshBasicMaterial({ visible: false })), 'shelf');
    shelfHit.position.set(1.34, 1.8, .38); scene.add(shelfHit);
    const syrupBottles = {};
    [['caramel', 0xb8651e, .08], ['vanilla', 0xe8d9a8, .26], ['nut', 0x7a4a2a, .44], ['caramel2', 0xc0392b, .62]].forEach(([k, c, z]) => {
      const g = new THREE.Group();
      const b = new THREE.Mesh(cyl(.035, .035, .22, 8), new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: .9 })); b.position.y = .11; g.add(b);
      const n = new THREE.Mesh(cyl(.012, .02, .06, 6), mat(0x1c1614)); n.position.y = .25; g.add(n);
      const p = new THREE.Mesh(new THREE.BoxGeometry(.04, .012, .012), mat(0x1c1614)); p.position.set(0, .285, -.015); g.add(p);
      g.position.set(1.34, 1.615, z); scene.add(g); syrupBottles[k] = g;
    });
    // коробки на верхней полке
    for (let i = 0; i < 3; i++) { const bx = new THREE.Mesh(box, mat([0xd9c29a, 0xc9543a, 0x8a9a7a][i])); bx.scale.set(.14, .16, .24); bx.position.set(1.35, 2.115, .12 + i * .27); scene.add(bx); }

    // ---------- телефон ----------
    const phone = new THREE.Group();
    { const body = new THREE.Mesh(new THREE.BoxGeometry(.075, .012, .15), mat(0x16181d)); phone.add(body);
      const scrTex = K.canvasTex(128, 256, (x, w, h) => { x.fillStyle = '#0b0d10'; x.fillRect(0, 0, w, h); });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(.066, .136), new THREE.MeshBasicMaterial({ map: scrTex })); scr.rotation.x = -Math.PI / 2; scr.position.y = .0065; phone.add(scr);
      phone.userData.scr = scrTex; }
    phone.position.set(.24, TOP + .006, .7); phone.rotation.y = .3; scene.add(phone);
    pick(phone, 'phone');
    function drawPhone(on) {
      const x = phone.userData.scr.userData.ctx, w = 128, h = 256;
      x.fillStyle = on ? '#1f5a3a' : '#0b0d10'; x.fillRect(0, 0, w, h);
      if (on) { x.fillStyle = '#fff'; x.font = 'bold 24px Rubik, sans-serif'; x.textAlign = 'center'; x.fillText('ШЕФ', w / 2, 90); x.font = '16px Rubik, sans-serif'; x.fillText('звонит…', w / 2, 120); x.fillStyle = '#3fcf6a'; x.beginPath(); x.arc(w / 2, 200, 22, 0, 7); x.fill(); }
      phone.userData.scr.needsUpdate = true;
    }
    drawPhone(false);
    let phoneRing = false;
    api.phone = (on) => { phoneRing = on; drawPhone(on); };

    // ---------- банка для чаевых ----------
    const tipJar = new THREE.Group();
    { const g = new THREE.Mesh(cyl(.06, .055, .15, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xd8e8f0, transparent: true, opacity: .35, side: THREE.DoubleSide, depthWrite: false })); g.position.y = .075; tipJar.add(g);
      const coins = new THREE.Mesh(cyl(.052, .052, .02, 10), mat(0xb08a3a)); coins.position.y = .012; tipJar.add(coins); tipJar.userData.coins = coins;
      const lt = K.canvasTex(128, 48, (x, w, h) => { x.fillStyle = '#f6efe2'; x.fillRect(0, 0, w, h); x.fillStyle = '#231b16'; x.font = '30px Caveat, cursive'; x.textAlign = 'center'; x.fillText('на учёбу :)', w / 2, 34); });
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(.1, .038), mat(0xffffff, { map: lt, side: THREE.DoubleSide })); lbl.position.set(0, .08, .062); tipJar.add(lbl); }
    tipJar.position.set(.58, TOP, 1.08); scene.add(tipJar);
    api.tips = (rub) => { const c = tipJar.userData.coins; const hgt = clamp(.02 + rub / 1500 * .12, .02, .13); c.scale.y = hgt / .02; c.position.y = hgt / 2; };

    // ---------- холодильник под прилавком ----------
    const fridge = new THREE.Group();
    { const FB = new K.Batch();
      FB.add(box, 0xeef0f2, 0, .38, 0, 0, 0, 0, .56, .76, .5);
      FB.add(box, 0x1c2a36, 0, .4, -.251, 0, 0, 0, .48, .62, .01, 0);
      FB.add(box, 0xb8bcc4, .2, .4, -.27, 0, 0, 0, .025, .3, .025);
      fridge.add(FB.mesh());
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(.4, .012, .02), new THREE.MeshBasicMaterial({ color: 0xe8f4ff })); lamp.position.set(0, .7, -.2); fridge.add(lamp); }
    fridge.position.set(.74, .27, .9); scene.add(fridge); pick(fridge, 'fridge');
    const cartons = {};
    const cartonTex = (kind) => { const M = window.DATA.MILKS[kind]; return K.canvasTex(128, 192, (x, w, h) => {
      x.fillStyle = '#f7f7f4'; x.fillRect(0, 0, w, h); x.fillStyle = M.label; x.fillRect(0, 110, w, 82);
      x.fillStyle = M.label; x.font = 'bold 30px Rubik, sans-serif'; x.textAlign = 'center';
      const t = M.ru.split(' '); x.fillText(t[0].toUpperCase(), w / 2, 60); if (t[1]) { x.font = '24px Rubik, sans-serif'; x.fillText(t.slice(1).join(' '), w / 2, 92); }
      x.fillStyle = '#fff'; x.beginPath(); x.arc(w / 2, 150, 22, 0, 7); x.fill(); }); };
    ['milk', 'oat', 'kefir', 'cream'].forEach((k, i) => {
      const g = new THREE.Group();
      const tx = cartonTex(k);
      const body = new THREE.Mesh(new THREE.BoxGeometry(.075, .15, .075), [mat(0xf2f2ee), mat(0xf2f2ee), mat(0xf2f2ee), mat(0xf2f2ee), mat(0xffffff, { map: tx }), mat(0xffffff, { map: tx })]);
      body.position.y = .075; g.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(.055, .04, 4), mat(0xf2f2ee)); roof.position.y = .17; roof.rotation.y = Math.PI / 4; g.add(roof);
      g.position.set(.74 - .18 + i * .12, .38, .82); scene.add(g); cartons[k] = { g, home: g.position.clone() };
    });
    const cartonOnCounter = { k: null };
    api.carton = function (kind) {
      if (cartonOnCounter.k) { const c = cartons[cartonOnCounter.k]; c.g.position.copy(c.home); c.g.rotation.set(0, 0, 0); }
      cartonOnCounter.k = kind;
      if (kind && cartons[kind]) { const c = cartons[kind]; c.g.position.set(-.1, TOP, .78); c.g.rotation.y = Math.PI; }
    };

    // ---------- ящик пива ----------
    const crate = new THREE.Group();
    { const CB = new K.Batch(), c = 0x2f6a4a;
      for (const [x, z, w, d] of [[0, -.18, .52, .02], [0, .18, .52, .02], [-.26, 0, .02, .38], [.26, 0, .02, .38]]) CB.add(box, c, x, .14, z, 0, 0, 0, w, .28, d);
      CB.add(box, c, 0, .01, 0, 0, 0, 0, .52, .02, .38);
      for (let i = 1; i < 4; i++) CB.add(box, c, -.26 + i * .13, .1, 0, 0, 0, 0, .01, .2, .36);
      crate.add(CB.mesh()); }
    crate.position.set(-.42, .27, .86); scene.add(crate); pick(crate, 'crate');
    const bottleGeo = new K.Batch();
    bottleGeo.add(cyl(.028, .028, .16, 8), 0x5a2e0e, 0, .08, 0);
    bottleGeo.add(cyl(.012, .026, .06, 8), 0x5a2e0e, 0, .19, 0);
    bottleGeo.add(cyl(.013, .013, .018, 8), 0xc9a23a, 0, .228, 0);
    const bottleG = bottleGeo.geometry();
    const bottleMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const crateBottles = [];
    for (let i = 0; i < 12; i++) {
      const b = new THREE.Mesh(bottleG, bottleMat);
      b.position.set(-.42 - .195 + (i % 4) * .13, .28, .86 - .12 + Math.floor(i / 4) * .12);
      scene.add(b); crateBottles.push(b);
    }
    const noteTex = K.canvasTex(256, 160, (x, w, h) => {
      x.fillStyle = '#fff38a'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#b3261e'; x.font = 'bold 40px Caveat, cursive'; x.fillText('НЕ ТРОГАТЬ!!!', 16, 52);
      x.fillStyle = '#1e3a8a'; x.font = '34px Caveat, cursive'; x.fillText('Серёже на юбилей.', 16, 98); x.fillText('Я всё посчитал. В. И.', 16, 138);
    });
    const note = new THREE.Mesh(new THREE.PlaneGeometry(.2, .125), mat(0xffffff, { map: noteTex })); note.position.set(-.42, .45, .66); note.rotation.set(-.35, Math.PI, .06); scene.add(note);
    // пустые бутылки на полу (последствия)
    const empties = [];
    for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(bottleG, bottleMat); b.visible = false; b.position.set(-1.0 + (i % 6) * .07, .27, .55 - Math.floor(i / 6) * .08); if (i % 3 === 2) { b.rotation.z = Math.PI / 2; b.position.y = .3; } scene.add(b); empties.push(b); }
    api.beerLeft = (n) => { crateBottles.forEach((b, i) => { b.visible = i < n; }); };
    api.empties = (n) => { empties.forEach((b, i) => { b.visible = i < n; }); };
    const handBottle = new THREE.Mesh(bottleG, bottleMat); handBottle.visible = false; scene.add(handBottle);

    // ---------- пепельница за дверью, сигарета ----------
    // ================================================================
    // Стакан
    // ================================================================
    const SZ = { S: { h: .095, rt: .04, rb: .03 }, M: { h: .12, rt: .045, rb: .032 }, L: { h: .145, rt: .048, rb: .034 } };
    let cup = null;
    function cupSideTex() {
      return K.canvasTex(512, 160, () => {});
    }
    function drawCupSide(c) {
      const t = c.sideTex, x = t.userData.ctx, w = 512, h = 160;
      x.fillStyle = '#f7f3ec'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#c9543a'; x.fillRect(0, h - 40, w, 40);
      x.fillStyle = '#f7f3ec'; x.font = 'bold 22px Rubik, sans-serif'; x.textAlign = 'center';
      x.fillText('БОДРЯЧОК', 128, h - 13); x.fillText('БОДРЯЧОК', 384, h - 13);
      if (c.text) {
        x.fillStyle = '#1e3a8a'; x.font = '64px Caveat, cursive';
        x.save(); x.translate(256, 70); x.rotate(-.05 + (c.textWobble || 0)); x.fillText(c.text.slice(0, 18), 0, 0); x.restore();
      }
      if (c.crack) {
        x.strokeStyle = '#6a625a'; x.lineWidth = 3; x.beginPath();
        let px = 300, py = 0; x.moveTo(px, py);
        for (let i = 0; i < 7; i++) { px += (rnd() - .5) * 40; py += 16 + rnd() * 10; x.lineTo(px, py); }
        x.stroke();
      }
      t.needsUpdate = true;
    }
    api.newCup = function (size) {
      api.dropCup();
      const d = SZ[size] || SZ.M;
      const g = new THREE.Group();
      const sideTex = cupSideTex();
      const body = new THREE.Mesh(cyl(d.rt, d.rb, d.h, 18, 1, true), new THREE.MeshLambertMaterial({ map: sideTex, side: THREE.DoubleSide }));
      body.position.y = d.h / 2; body.rotation.y = 0; g.add(body);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(d.rb, 16), mat(0xe8e0d0)); bottom.rotation.x = -Math.PI / 2; bottom.position.y = .002; g.add(bottom);
      const liquid = new THREE.Mesh(cyl(1, 1, 1, 16), mat(0x3b2314)); liquid.visible = false; g.add(liquid);
      const topMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const top = new THREE.Mesh(new THREE.CircleGeometry(1, 20), topMat); top.rotation.x = -Math.PI / 2; top.visible = false; g.add(top);
      const lid = new THREE.Group();
      { const a = new THREE.Mesh(cyl(d.rt * 1.06, d.rt * 1.03, .012, 18), mat(0xf4f0e8)); lid.add(a);
        const b2 = new THREE.Mesh(cyl(d.rt * .9, d.rt * 1.0, .014, 18), mat(0xefe9de)); b2.position.y = .012; lid.add(b2);
        const hole = new THREE.Mesh(new THREE.BoxGeometry(.018, .003, .006), mat(0x2a2020)); hole.position.set(0, .02, d.rt * .6); lid.add(hole); }
      lid.position.y = d.h + .006; lid.visible = false; g.add(lid);
      g.position.set(MX, TOP + .012, .6);
      scene.add(g);
      cup = { g, body, liquid, top, topMat, lid, d, sideTex, text: '', crack: false, level: 0, color: 0x3b2314, anim: null, size };
      drawCupSide(cup);
      return cup;
    };
    api.hasCup = () => !!cup;
    api.dropCup = function () { if (cup) { scene.remove(cup.g); cup = null; } };
    api.cupLevel = function (level, color) {
      if (!cup) return;
      cup.level = clamp(level, 0, 1.08); if (color != null) cup.color = color;
      const d = cup.d, hh = Math.max(.001, cup.level * d.h * .96);
      const rTopAt = lerp(d.rb, d.rt, clamp(cup.level, 0, 1)) * .95;
      cup.liquid.visible = cup.level > .01;
      cup.liquid.geometry.dispose();
      cup.liquid.geometry = cyl(rTopAt, d.rb * .95, hh, 16);
      cup.liquid.position.y = hh / 2 + .003;
      cup.liquid.material.color.setHex(cup.color);
      cup.top.visible = cup.level > .01;
      cup.top.scale.set(rTopAt, rTopAt, 1);
      cup.top.position.y = hh + .004;
      if (!cup.top.userData.hasArt) cup.topMat.color.setHex(cup.color);
    };
    api.cupArt = function (canvas) {
      if (!cup) return;
      if (!canvas) { cup.topMat.map = null; cup.top.userData.hasArt = false; cup.topMat.color.setHex(cup.color); cup.topMat.needsUpdate = true; return; }
      const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace;
      cup.topMat.map = t; cup.topMat.color.setHex(0xffffff); cup.topMat.needsUpdate = true; cup.top.userData.hasArt = true;
      cup.top.rotation.z = Math.PI;
    };
    api.cupText = function (text, wobble) { if (!cup) return; cup.text = text || ''; cup.textWobble = wobble || 0; drawCupSide(cup); };
    api.cupCrack = function (on) { if (!cup) return; cup.crack = on; drawCupSide(cup); };
    api.cupLid = function (on, crooked) { if (!cup) return; cup.lid.visible = on; cup.lid.rotation.z = crooked ? .18 : 0; cup.lid.position.x = crooked ? .008 : 0; };
    api.cupObj = () => cup && cup.g;
    // стакан к окошку, в руку клиенту, на пол
    const tweens = [];
    function tween(obj, to, dur, onDone, arc = 0) {
      const from = obj.position.clone();
      tweens.push({ obj, from, to: to.clone(), t: 0, dur, onDone, arc });
    }
    api.cupToHatch = function (cb) { if (!cup) { if (cb) cb(); return; } tween(cup.g, new THREE.Vector3(0, TOP + .045, 1.3), .7, cb, .08); };
    api.cupToTray = function () { if (cup) cup.g.position.set(MX, TOP + .012, .6); };
    api.cupFloor = function (cb) {
      if (!cup) { if (cb) cb(); return; }
      const c = cup;
      tween(c.g, new THREE.Vector3(MX + .3, .3, .45), .45, () => { c.g.rotation.z = 1.4; setTimeout(() => { c.g.rotation.z = 0; tween(c.g, new THREE.Vector3(MX, TOP + .012, .6), .5, cb, .1); }, 700); });
    };
    api.handCup = function () { const c = cup; cup = null; return c; };

    // ================================================================
    // Анимации шагов
    // ================================================================
    const st = { grind: false, pull: false, steam: false, pour: false, water: false, beerPour: false, drink: null, tamp: 0, syrup: null };
    const tmp = new THREE.Vector3();
    api.grind = (on, grams) => { st.grind = on; if (grams != null) { heap.visible = grams > .5; const k = clamp(grams / 18, .1, 1.6); heap.scale.set(Math.min(1.25, .6 + k * .4), k, Math.min(1.25, .6 + k * .4)); heap.position.y = TOP + .08 + .025 * k; } };
    api.resetGrounds = () => { heap.visible = false; heap.scale.set(1, 1, 1); };
    api.tamp = (tilt = 0) => { st.tamp = 1; st.tampTilt = tilt; };
    api.pull = (on) => { st.pull = on; };
    api.water = (on) => { st.water = on; };
    api.steam = (on, kind) => {
      st.steam = on;
      if (on) { pitcher.position.set(MX + .42, TOP + .06, .64); pitcher.userData.milk.visible = true; if (kind) pitcher.userData.milk.material.color.setHex(window.DATA.MILKS[kind].color); }
    };
    api.pitcherMilk = (kind) => { pitcher.userData.milk.visible = !!kind; if (kind) pitcher.userData.milk.material.color.setHex(window.DATA.MILKS[kind].color); };
    api.pour = (on) => {
      st.pour = on;
      if (on) { pitcher.position.set(MX + .09, TOP + .2, .6); pitcher.rotation.z = 1.1; }
      else { pitcher.position.copy(PITCH_HOME); pitcher.rotation.z = 0; }
    };
    api.pitcherHome = () => { pitcher.position.copy(PITCH_HOME); pitcher.rotation.z = 0; };
    api.syrup = (kind) => { const b = syrupBottles[kind] || syrupBottles.caramel; st.syrup = { b, t: 0 }; };
    api.beerPour = (on) => {
      st.beerPour = on; handBottle.visible = on;
      if (on) { handBottle.position.set(MX + .1, TOP + .22, .6); handBottle.rotation.set(0, 0, 2.0); }
    };
    // выпить пива: бутылка поднимается к камере
    api.beerDrink = function (dur, cb) { st.drink = { t: 0, dur, cb }; handBottle.visible = true; handBottle.rotation.set(0, 0, 0); };

    api.update = function (dt, time) {
      // твины
      for (let i = tweens.length - 1; i >= 0; i--) {
        const w = tweens[i]; w.t += dt / w.dur; const k = Math.min(1, w.t), e = K.ease(k);
        w.obj.position.lerpVectors(w.from, w.to, e); w.obj.position.y += Math.sin(k * Math.PI) * w.arc;
        if (k >= 1) { tweens.splice(i, 1); if (w.onDone) w.onDone(); }
      }
      // помол: кофемолка дрожит, сыплется
      grinderBody.position.x = st.grind ? (rnd() - .5) * .004 : 0;
      grindStream.visible = st.grind;
      if (st.grind) { grindStream.position.set(GX, TOP + .11, .72 + .0); grindStream.scale.set(1, .06, 1); }
      // темпер
      if (st.tamp > 0) {
        st.tamp = Math.max(0, st.tamp - dt * 1.6);
        const k = Math.sin(st.tamp * Math.PI);
        tamper.position.set(GX, TOP + .11 - k * .03, .72); tamper.rotation.z = (st.tampTilt || 0) * .3 * k;
        if (st.tamp === 0) { tamper.position.set(-1.0, TOP + .01, .66); tamper.rotation.z = 0; heap.scale.y = Math.min(heap.scale.y, .5); }
      }
      // пролив: две струйки из холдера в стакан
      for (const s of streams) {
        s.visible = st.pull && !!cup;
        if (s.visible) {
          const topY = TOP + .215, botY = cup.g.position.y + cup.level * cup.d.h * .96 + .004;
          const len = Math.max(.01, topY - botY);
          s.scale.set(1 + Math.sin(time * 30) * .15, len, 1); s.position.set(MX + s.userData.dx, botY + len / 2, .6);
        }
      }
      streamMat.color.setHex(st.water ? 0xcfe2ee : 0x5a3018); streamMat.opacity = st.water ? .55 : .95;
      if (st.water && cup) { for (const s of streams) { s.visible = true; const topY = TOP + .17, botY = cup.g.position.y + cup.level * cup.d.h * .96; const len = Math.max(.01, topY - botY); s.scale.set(1.6, len, 1.6); s.position.set(MX + s.userData.dx * .3, botY + len / 2, .6); } }
      if ((st.pull || st.water) && rnd() < dt * 8) { tmp.set(MX, TOP + .15, .6); K.puff(tmp, { vy: .12, op: .12, size: .03, life: 1 }); }
      // пар
      if (st.steam) {
        pitcher.position.x = MX + .42 + (rnd() - .5) * .006;
        if (rnd() < dt * 18) { tmp.set(MX + .42, TOP + .2, .64); K.puff(tmp, { vy: .35, vx: (rnd() - .5) * .2, op: .35, size: .05, life: 1.1, grow: 2 }); }
      }
      // заливка
      pourStream.visible = (st.pour || st.beerPour) && !!cup;
      if (pourStream.visible) {
        const topY = TOP + .2, botY = cup.g.position.y + cup.level * cup.d.h * .96;
        const len = Math.max(.01, topY - botY);
        pourStream.scale.set(1, len, 1); pourStream.position.set(MX + .01, botY + len / 2, .6);
        pourStream.material.color.setHex(st.beerPour ? 0xe0a23a : 0xf4efe6);
        if (st.beerPour) { handBottle.position.set(MX + .09, TOP + .26, .6); handBottle.rotation.set(0, 0, 2.1); }
      }
      // сироп: бутылка подпрыгивает
      if (st.syrup) { st.syrup.t += dt * 3; const k = Math.sin(Math.min(1, st.syrup.t) * Math.PI); st.syrup.b.position.y = 1.615 + k * .05; if (st.syrup.t >= 1) { st.syrup.b.position.y = 1.615; st.syrup = null; } }
      // пиво: бутылка к лицу
      if (st.drink) {
        const d = st.drink; d.t += dt; const k = Math.min(1, d.t / d.dur);
        const cam = View.camPos || tmp.set(0, 1.9, -.6);
        const up = k < .3 ? k / .3 : k > .85 ? (1 - k) / .15 : 1;
        handBottle.position.set(lerp(-.42, .06, up), lerp(.4, cam.y - .12, up), lerp(.86, cam.z + .25, up));
        handBottle.rotation.set(lerp(0, -2.0, clamp((k - .3) / .2, 0, 1) * (k < .85 ? 1 : 0)), 0, 0);
        if (k >= 1) { handBottle.visible = false; const cb = d.cb; st.drink = null; if (cb) cb(); }
      }
      // телефон вибрирует
      if (phoneRing) { phone.position.x = .24 + Math.sin(time * 70) * .002 * (Math.sin(time * 5) > 0 ? 1 : 0); phone.rotation.y = .3 + Math.sin(time * 60) * .02 * (Math.sin(time * 5) > 0 ? 1 : 0); }
    };
    return api;
  };
})();
