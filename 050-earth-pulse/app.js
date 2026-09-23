/* Пульс Земли — живые землетрясения USGS на 3D-глобусе.
   Обычный скрипт: three.js и topojson-client подгружаются динамическим import() по карте импортов из index.html. */
(async function () {
  'use strict';

  const SHOT = !!window.__SHOT__;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s) => document.querySelector(s);

  let THREE, OrbitControls, topo;
  try {
    THREE = await import('three');
    ({ OrbitControls } = await import('three/addons/controls/OrbitControls.js'));
    topo = await import('topojson-client');
  } catch (e) {
    document.body.classList.add('no-cdn');
    return;
  }
  window.__EP_BOOTED = true;

  // ---------------------------------------------------------------- источники
  const USGS = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/';
  const FEEDS = {
    day: { file: '1.0_day.geojson', label: 'за сутки', min: 'M1+' , span: 86400e3 },
    week: { file: '2.5_week.geojson', label: 'за неделю', min: 'M2,5+', span: 7 * 86400e3 },
    month: { file: '4.5_month.geojson', label: 'за месяц', min: 'M4,5+', span: 30 * 86400e3 },
  };
  const LAND_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
  const PLATES_URL = 'https://cdn.jsdelivr.net/gh/fraxen/tectonicplates@master/GeoJSON/PB2002_boundaries.json';

  // Запасной набор: крупнейшие исторические землетрясения (координаты приблизительные).
  const ARCHIVE = [
    ['1960-05-22', -38.24, -73.05, 25, 9.5, 'Вальдивия, Чили'],
    ['1964-03-28', 60.91, -147.34, 25, 9.2, 'Великое Аляскинское'],
    ['2004-12-26', 3.30, 95.98, 30, 9.1, 'Суматра — Андаманские острова'],
    ['2011-03-11', 38.30, 142.37, 29, 9.1, 'Тохоку, Япония'],
    ['1952-11-04', 52.62, 159.78, 22, 9.0, 'Камчатка'],
    ['2010-02-27', -36.12, -72.90, 23, 8.8, 'Мауле, Чили'],
    ['1965-02-04', 51.21, 178.50, 30, 8.7, 'Крысьи острова, Алеуты'],
    ['2005-03-28', 2.09, 97.11, 30, 8.6, 'Ниас, Индонезия'],
    ['2012-04-11', 2.33, 93.06, 20, 8.6, 'Индийский океан у Суматры'],
    ['1950-08-15', 28.36, 96.45, 15, 8.6, 'Ассам — Тибет'],
    ['1957-03-09', 51.56, -175.39, 33, 8.6, 'Андреяновские острова'],
    ['2001-06-23', -16.26, -73.64, 33, 8.4, 'Арекипа, Перу'],
    ['1933-03-02', 39.22, 144.62, 15, 8.4, 'Санрику, Япония'],
    ['2006-11-15', 46.59, 153.27, 10, 8.3, 'Симушир, Курилы'],
    ['2013-05-24', 54.89, 153.22, 598, 8.3, 'Охотское море (глубокое)'],
    ['2015-09-16', -31.57, -71.67, 22, 8.3, 'Ильяпель, Чили'],
    ['1994-06-09', -13.84, -67.55, 631, 8.2, 'Боливия (глубокое)'],
    ['2014-04-01', -19.61, -70.77, 25, 8.2, 'Икике, Чили'],
    ['2017-09-08', 15.02, -93.90, 47, 8.2, 'Чьяпас, Мексика'],
    ['2018-08-19', -18.11, -178.15, 600, 8.2, 'Фиджи (глубокое)'],
    ['2021-07-29', 55.36, -157.89, 32, 8.2, 'Чигник, Аляска'],
    ['2007-01-13', 46.24, 154.52, 10, 8.1, 'Курилы'],
    ['2009-09-29', -15.49, -172.10, 18, 8.1, 'Самоа'],
    ['2021-03-04', -29.72, -177.28, 28, 8.1, 'Острова Кермадек'],
    ['1985-09-19', 18.19, -102.53, 28, 8.0, 'Мичоакан, Мексика'],
    ['2019-05-26', -5.81, -75.27, 110, 8.0, 'Перу (промежуточное)'],
    ['2008-05-12', 31.00, 103.32, 19, 7.9, 'Вэньчуань, Китай'],
    ['1906-04-18', 37.75, -122.55, 8, 7.9, 'Сан-Франциско'],
    ['1923-09-01', 35.33, 139.14, 23, 7.9, 'Великое Канто, Япония'],
    ['2023-02-06', 37.23, 37.01, 10, 7.8, 'Пазарджык, Турция'],
    ['2015-04-25', 28.23, 84.73, 8, 7.8, 'Горкха, Непал'],
    ['2016-11-13', -42.74, 173.05, 15, 7.8, 'Кайкоура, Новая Зеландия'],
    ['2001-01-26', 23.42, 70.23, 16, 7.7, 'Гуджарат, Индия'],
    ['1976-07-28', 39.60, 117.90, 17, 7.6, 'Таншань, Китай'],
    ['1999-08-17', 40.75, 29.86, 17, 7.6, 'Измит, Турция'],
    ['2005-10-08', 34.54, 73.59, 26, 7.6, 'Кашмир'],
    ['2010-01-12', 18.46, -72.53, 13, 7.0, 'Гаити'],
    ['1995-05-27', 52.63, 142.83, 11, 7.0, 'Нефтегорск, Сахалин'],
    ['1995-01-16', 34.58, 135.02, 22, 6.9, 'Кобе, Япония'],
    ['1988-12-07', 40.99, 44.19, 5, 6.8, 'Спитак, Армения'],
    ['2003-12-26', 29.00, 58.31, 10, 6.6, 'Бам, Иран'],
  ];

  // ---------------------------------------------------------------- русификация мест USGS
  const DIRS = { N: 'С', S: 'Ю', E: 'В', W: 'З' };
  const REGIONS = {
    'Alaska': 'Аляска', 'CA': 'Калифорния', 'California': 'Калифорния', 'Japan': 'Япония', 'Indonesia': 'Индонезия', 'Chile': 'Чили',
    'Peru': 'Перу', 'Mexico': 'Мексика', 'Philippines': 'Филиппины', 'Tonga': 'Тонга', 'Fiji': 'Фиджи', 'Papua New Guinea': 'Папуа — Новая Гвинея',
    'Vanuatu': 'Вануату', 'Russia': 'Россия', 'Kuril Islands': 'Курильские острова', 'Hawaii': 'Гавайи', 'HI': 'Гавайи', 'Puerto Rico': 'Пуэрто-Рико',
    'Greece': 'Греция', 'Turkey': 'Турция', 'Türkiye': 'Турция', 'Iran': 'Иран', 'China': 'Китай', 'Taiwan': 'Тайвань', 'New Zealand': 'Новая Зеландия',
    'Solomon Islands': 'Соломоновы Острова', 'Nevada': 'Невада', 'NV': 'Невада', 'Utah': 'Юта', 'Oklahoma': 'Оклахома', 'Texas': 'Техас', 'Washington': 'Вашингтон',
    'Oregon': 'Орегон', 'Montana': 'Монтана', 'MT': 'Монтана', 'Idaho': 'Айдахо', 'Wyoming': 'Вайоминг', 'Canada': 'Канада', 'Argentina': 'Аргентина',
    'Colombia': 'Колумбия', 'Ecuador': 'Эквадор', 'Guatemala': 'Гватемала', 'Italy': 'Италия', 'Kermadec Islands region': 'район островов Кермадек',
    'Kermadec Islands': 'острова Кермадек', 'Aleutian Islands': 'Алеутские острова', 'Mid-Atlantic Ridge': 'Срединно-Атлантический хребет',
    'Afghanistan': 'Афганистан', 'Pakistan': 'Пакистан', 'India': 'Индия', 'Nepal': 'Непал', 'Myanmar': 'Мьянма', 'Iceland': 'Исландия', 'Nicaragua': 'Никарагуа',
    'El Salvador': 'Сальвадор', 'Costa Rica': 'Коста-Рика', 'Panama': 'Панама', 'Honduras': 'Гондурас', 'Dominican Republic': 'Доминиканская Республика',
    'Bolivia': 'Боливия', 'Venezuela': 'Венесуэла', 'Samoa': 'Самоа', 'Guam': 'Гуам', 'Northern Mariana Islands': 'Северные Марианские острова',
    'New Caledonia': 'Новая Каледония', 'Wallis and Futuna': 'Уоллис и Футуна', 'Tajikistan': 'Таджикистан', 'Kyrgyzstan': 'Киргизия', 'Kazakhstan': 'Казахстан',
    'Mongolia': 'Монголия', 'Algeria': 'Алжир', 'Morocco': 'Марокко', 'Ethiopia': 'Эфиопия', 'Spain': 'Испания', 'Portugal': 'Португалия', 'Albania': 'Албания',
    'Romania': 'Румыния', 'Cyprus': 'Кипр', 'Iraq': 'Ирак', 'Timor Leste': 'Восточный Тимор', 'Kamchatka': 'Камчатка', 'Arizona': 'Аризона', 'New Mexico': 'Нью-Мексико',
    'Colorado': 'Колорадо', 'Kansas': 'Канзас', 'Tennessee': 'Теннесси', 'Missouri': 'Миссури', 'Arkansas': 'Арканзас', 'Virgin Islands': 'Виргинские острова',
    'U.S. Virgin Islands': 'Виргинские острова (США)', 'British Virgin Islands': 'Британские Виргинские острова', 'south of the Fiji Islands': 'к югу от островов Фиджи',
    'Fiji region': 'район Фиджи', 'Tonga region': 'район Тонга', 'Banda Sea': 'море Банда', 'Molucca Sea': 'Молуккское море', 'Sea of Okhotsk': 'Охотское море',
    'South Sandwich Islands region': 'район Южных Сандвичевых островов', 'central Mid-Atlantic Ridge': 'центр Срединно-Атлантического хребта',
    'East Pacific Rise': 'Восточно-Тихоокеанское поднятие', 'Easter Island region': 'район острова Пасхи',
  };
  function ruPlace(s) {
    if (!s) return 'Место не указано';
    let out = s;
    const m = s.match(/^(\d+)\s*km\s+([NSEW]{1,3})\s+of\s+(.+)$/);
    if (m) {
      const FULL = { N: 'северу', S: 'югу', E: 'востоку', W: 'западу' };
      const dir = m[2].length === 1 ? FULL[m[2]] : m[2].split('').map((c) => DIRS[c] || c).join('');
      out = `${m[1]} км к ${dir} от ${m[3]}`;
    }
    // заменяем известные регионы в хвосте
    return out.replace(/(,\s*|^)([^,]+)$/, (all, sep, reg) => sep + (REGIONS[reg.trim()] || reg));
  }

  // ---------------------------------------------------------------- рендерер и сцена
  const canvas = $('#globe');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(SHOT ? 1 : Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x06080b, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  camera.position.set(0.9, 1.35, 3.6);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 1.35;
  controls.maxDistance = 7;
  controls.rotateSpeed = 0.5;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.35;

  // положение на сфере в той же параметризации, что и UV у SphereGeometry
  const D2R = Math.PI / 180;
  function ll2v(lat, lon, r) {
    const la = lat * D2R, lo = lon * D2R;
    return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
  }

  // солнце: подсолнечная точка (приближённо, без уравнения времени)
  function sunDir(date) {
    const start = Date.UTC(date.getUTCFullYear(), 0, 0);
    const day = (date - start) / 86400e3;
    const decl = -23.44 * Math.cos(2 * Math.PI / 365 * (day + 10));
    const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
    const lon = -15 * (hours - 12);
    return ll2v(decl, lon, 1).normalize();
  }

  // --- глобус: текстура суши рисуется из topojson на холсте
  const landCanvas = document.createElement('canvas');
  landCanvas.width = 2048; landCanvas.height = 1024;
  const lc = landCanvas.getContext('2d');
  lc.fillStyle = '#0a1118';
  lc.fillRect(0, 0, 2048, 1024);
  const landTex = new THREE.CanvasTexture(landCanvas);
  landTex.colorSpace = THREE.SRGBColorSpace;
  landTex.anisotropy = 4;

  const globeMat = new THREE.ShaderMaterial({
    uniforms: { uLand: { value: landTex }, uSun: { value: sunDir(new Date()) }, uAlpha: { value: 1 } },
    vertexShader: `
      varying vec2 vUv; varying vec3 vPos;
      void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D uLand; uniform vec3 uSun; uniform float uAlpha;
      varying vec2 vUv; varying vec3 vPos;
      void main(){
        vec3 base = texture2D(uLand, vUv).rgb;
        vec3 n = normalize(vPos);
        float day = smoothstep(-0.18, 0.3, dot(n, uSun));
        vec3 col = base * (0.55 + 0.75 * day);
        vec3 V = normalize(cameraPosition - vPos);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 2.6);
        col += vec3(0.20, 0.42, 0.50) * fres * 0.45;
        gl_FragColor = vec4(col, uAlpha);
      }`,
    transparent: true,
  });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 80), globeMat);
  scene.add(globe);

  // атмосфера: мягкое свечение по краю
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 96, 48), new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = (modelViewMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * vec4(vP, 1.0); }`,
    fragmentShader: `varying vec3 vN; varying vec3 vP; void main(){ float k = pow(max(0.0, 0.72 - dot(vN, normalize(-vP))), 2.4); gl_FragColor = vec4(vec3(0.33, 0.62, 0.70) * k * 1.6, k); }`,
    side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(atmo);

  // сетка широт и долгот
  {
    const pts = [];
    for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 3) { pts.push(ll2v(lat, lon, 1.001), ll2v(lat, lon + 3, 1.001)); }
    for (let lon = -180; lon < 180; lon += 30) for (let lat = -84; lat < 84; lat += 3) { pts.push(ll2v(lat, lon, 1.001), ll2v(lat + 3, lon, 1.001)); }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x7f97aa, transparent: true, opacity: 0.08, depthWrite: false })));
  }

  // --- землетрясения
  let quakes = [];
  let quakePoints = null, depthLines = null;
  const pointMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNow: { value: 1e18 }, uPx: { value: 1 }, uReplay: { value: 0 }, uAll: { value: 0 } },
    vertexShader: `
      attribute float aMag; attribute float aDepth; attribute float aT; attribute float aSeed;
      uniform float uTime; uniform float uNow; uniform float uPx; uniform float uReplay;
      varying vec3 vCol; varying float vPhase; varying float vNew; varying float vVis;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vVis = step(aT, uNow);
        float age = (uNow - aT) / 3600000.0;           // часы с момента толчка (в хронике)
        float m = max(aMag - 0.5, 0.2);
        gl_PointSize = (3.0 + pow(m, 1.5) * 2.2) * 3.2 * uPx * vVis;
        vCol = aDepth < 70.0 ? vec3(1.0, 0.82, 0.40) : (aDepth < 300.0 ? vec3(1.0, 0.48, 0.23) : vec3(0.88, 0.27, 0.48));
        vPhase = fract(uTime * (0.22 + aMag * 0.02) + aSeed);
        vNew = uReplay > 0.5 ? clamp(1.0 - age / 10.0, 0.0, 1.0) : 0.0;
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vPhase; varying float vNew; varying float vVis;
      void main(){
        if (vVis < 0.5) discard;
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r = length(p);
        float core = smoothstep(0.30, 0.22, r);
        float rr = 0.26 + vPhase * 0.72;
        float ring = smoothstep(0.07, 0.0, abs(r - rr)) * (1.0 - vPhase) * 0.9;
        float flash = vNew * smoothstep(1.0, 0.0, r) * 0.8;
        float a = core + ring + flash;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vCol * (core * 1.25 + ring + flash), min(1.0, a));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  function buildQuakes(list) {
    if (quakePoints) { scene.remove(quakePoints); quakePoints.geometry.dispose(); }
    if (depthLines) { scene.remove(depthLines); depthLines.geometry.dispose(); }
    const n = list.length;
    const pos = new Float32Array(n * 3), mag = new Float32Array(n), dep = new Float32Array(n), tt = new Float32Array(n), seed = new Float32Array(n);
    const lp = new Float32Array(n * 6), lcol = new Float32Array(n * 6);
    list.forEach((q, i) => {
      const v = ll2v(q.lat, q.lon, 1.004);
      pos.set([v.x, v.y, v.z], i * 3);
      mag[i] = q.mag; dep[i] = q.depth; tt[i] = q.time - T0; seed[i] = (i * 0.61803) % 1;
      const inner = ll2v(q.lat, q.lon, 1 - Math.max(0, q.depth) / 6371);
      lp.set([v.x, v.y, v.z, inner.x, inner.y, inner.z], i * 6);
      const c = q.depth < 70 ? [1, 0.82, 0.4] : q.depth < 300 ? [1, 0.48, 0.23] : [0.88, 0.27, 0.48];
      lcol.set([c[0] * 0.25, c[1] * 0.25, c[2] * 0.25, c[0], c[1], c[2]], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    g.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    quakePoints = new THREE.Points(g, pointMat);
    quakePoints.renderOrder = 3;
    scene.add(quakePoints);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
    lg.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
    depthLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    depthLines.visible = xray;
    depthLines.renderOrder = 2;
    scene.add(depthLines);
  }

  // --- границы плит
  let plates = null;
  function buildPlates(geo) {
    const pts = [];
    const addLine = (coords) => {
      for (let i = 1; i < coords.length; i++) {
        const [lo0, la0] = coords[i - 1], [lo1, la1] = coords[i];
        if (Math.abs(lo1 - lo0) > 180) continue; // не тянем линию через антимеридиан
        pts.push(ll2v(la0, lo0, 1.0025), ll2v(la1, lo1, 1.0025));
      }
    };
    for (const f of geo.features) {
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'LineString') addLine(g.coordinates);
      else if (g.type === 'MultiLineString') g.coordinates.forEach(addLine);
    }
    const bg = new THREE.BufferGeometry().setFromPoints(pts);
    plates = new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0xffb454, transparent: true, opacity: 0.55, depthWrite: false }));
    plates.renderOrder = 1;
    scene.add(plates);
  }

  // --- суша на текстуре
  function drawLand(landGeo) {
    const W = 2048, H = 1024;
    lc.fillStyle = '#0a1118';
    lc.fillRect(0, 0, W, H);
    // лёгкая «топографическая» сетка океана
    lc.strokeStyle = 'rgba(120,150,175,0.05)';
    lc.lineWidth = 1;
    for (let y = 0; y < H; y += 8) { lc.beginPath(); lc.moveTo(0, y); lc.lineTo(W, y); lc.stroke(); }
    const X = (lon) => (lon + 180) / 360 * W, Y = (lat) => (90 - lat) / 180 * H;
    const drawRings = (polys) => {
      lc.beginPath();
      for (const poly of polys) for (const ring of poly) {
        ring.forEach(([lo, la], i) => (i ? lc.lineTo(X(lo), Y(la)) : lc.moveTo(X(lo), Y(la))));
        lc.closePath();
      }
    };
    // принимаем любую форму GeoJSON: коллекцию, объект или голую геометрию
    const polys = [];
    const take = (g) => {
      if (!g) return;
      if (g.type === 'FeatureCollection') g.features.forEach((f) => take(f.geometry));
      else if (g.type === 'Feature') take(g.geometry);
      else if (g.type === 'GeometryCollection') g.geometries.forEach(take);
      else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
      else if (g.type === 'Polygon') polys.push(g.coordinates);
    };
    take(landGeo);
    drawRings(polys);
    lc.fillStyle = '#1a2734';
    lc.fill('evenodd');
    lc.strokeStyle = '#3a5165';
    lc.lineWidth = 1.6;
    lc.stroke();
    landTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- данные
  let T0 = 0, T1 = 1, feed = 'week', live = true;
  async function fetchJSON(url, ms) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), ms || 9000);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(to); }
  }

  async function loadQuakes(key) {
    feed = key;
    const f = FEEDS[key];
    setLive('загрузка', true);
    let list = null;
    try {
      const data = await fetchJSON(USGS + f.file, 10000);
      list = data.features.filter((x) => x.geometry && x.properties && x.properties.mag != null).map((x) => ({
        lat: x.geometry.coordinates[1], lon: x.geometry.coordinates[0], depth: x.geometry.coordinates[2] || 0,
        mag: x.properties.mag, time: x.properties.time, place: ruPlace(x.properties.place), url: x.properties.url,
      }));
      live = true;
      T1 = Date.now(); T0 = T1 - f.span;
      $('#source').innerHTML = `Лента Геологической службы США (USGS), обновлено <b>${fmtTime(new Date())}</b>. Магнитуды ${f.min}, ${f.label}.`;
    } catch (e) {
      list = ARCHIVE.map(([d, lat, lon, depth, mag, place]) => ({ lat, lon, depth, mag, time: Date.parse(d + 'T12:00:00Z'), place, url: '' }));
      live = false;
      T0 = Date.parse('1900-01-01T00:00:00Z'); T1 = Date.parse('2024-01-01T00:00:00Z');
      $('#source').innerHTML = 'Нет связи с USGS — показан архив: <b>41 крупнейшее землетрясение</b> с 1906 года. Координаты приблизительные.';
    }
    quakes = list.sort((a, b) => a.time - b.time);
    buildQuakes(quakes);
    setLive(live ? 'живые данные' : 'архив', live);
    updateStats();
    drawTimeline();
    stopReplay();
  }

  function setLive(text, on) {
    $('#liveText').textContent = text;
    $('#live').classList.toggle('archive', !on);
  }

  // ---------------------------------------------------------------- статистика
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };
  const nf = (v, d) => v.toFixed(d).replace('.', ',');
  function fmtTime(d) { return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
  function ago(t) {
    if (!live) return new Date(t).getUTCFullYear() + ' г.';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 60) return `${m} мин назад`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h} ч назад`;
    return `${Math.round(h / 24)} дн назад`;
  }
  function magColor(q) { return q.depth < 70 ? '#ffd166' : q.depth < 300 ? '#ff7b3a' : '#e0457b'; }

  function updateStats() {
    const n = quakes.length;
    $('#count').textContent = n.toLocaleString('ru-RU');
    $('#countLabel').textContent = live ? `${plural(n, 'толчок', 'толчка', 'толчков')} ${FEEDS[feed].label}` : `${plural(n, 'землетрясение', 'землетрясения', 'землетрясений')} в архиве`;
    // список сильнейших
    const top = quakes.slice().sort((a, b) => b.mag - a.mag).slice(0, 8);
    const ul = $('#top');
    ul.innerHTML = '';
    top.forEach((q) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `<span class="mag" style="background:${magColor(q)}">${nf(q.mag, 1)}</span><span class="place"></span><span class="when">${ago(q.time)}</span>`;
      b.querySelector('.place').textContent = q.place;
      b.addEventListener('click', () => focusQuake(q));
      li.appendChild(b);
      ul.appendChild(li);
    });
    drawGR();
  }

  // закон Гутенберга — Рихтера: lg N(≥M) = a − bM; b — оценка максимального правдоподобия (Аки)
  const grCanvas = $('#gr');
  function drawGR() {
    const r = grCanvas.getBoundingClientRect();
    const d = SHOT ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * d), h = Math.round(r.height * d);
    grCanvas.width = w; grCanvas.height = h;
    const x = grCanvas.getContext('2d');
    x.clearRect(0, 0, w, h);
    const mags = quakes.map((q) => q.mag).sort((a, b) => a - b);
    if (mags.length < 5) return;
    const mMin = Math.floor(mags[0] * 2) / 2, mMax = Math.ceil(mags[mags.length - 1] * 2) / 2 + 0.5;
    const pts = [];
    for (let m = mMin; m <= mMax; m += 0.1) {
      const c = mags.filter((v) => v >= m - 1e-9).length;
      if (c > 0) pts.push([m, Math.log10(c)]);
    }
    const yMax = Math.ceil(Math.max(...pts.map((p) => p[1])));
    const L = 30 * d, B = 22 * d, T = 8 * d, R = 8 * d;
    const px = (m) => L + (m - mMin) / (mMax - mMin) * (w - L - R);
    const py = (v) => h - B - v / yMax * (h - B - T);
    x.strokeStyle = 'rgba(160,185,205,0.12)';
    x.fillStyle = '#8795a3';
    x.font = `${12 * d}px 'Martian Mono', monospace`;
    x.lineWidth = 1 * d;
    x.textAlign = 'right'; x.textBaseline = 'middle';
    for (let v = 0; v <= yMax; v++) { x.beginPath(); x.moveTo(L, py(v)); x.lineTo(w - R, py(v)); x.stroke(); x.fillText(v === 0 ? '1' : '10' + (v === 1 ? '' : sup(v)), L - 4 * d, py(v)); }
    x.textAlign = 'center'; x.textBaseline = 'top';
    for (let m = Math.ceil(mMin); m <= mMax; m++) x.fillText('M' + m, px(m), h - B + 6 * d);
    // оценка b по Аки
    const mc = mags[0];
    const mean = mags.reduce((a, b) => a + b, 0) / mags.length;
    const b = Math.LOG10E / Math.max(0.05, mean - (mc - 0.05));
    const a = Math.log10(mags.length) + b * mc;
    x.strokeStyle = 'rgba(111,211,201,0.8)';
    x.setLineDash([4 * d, 4 * d]);
    x.beginPath(); x.moveTo(px(mc), py(a - b * mc)); x.lineTo(px(mMax), py(Math.max(0, a - b * mMax))); x.stroke();
    x.setLineDash([]);
    x.fillStyle = '#ffd166';
    pts.forEach(([m, v]) => { x.beginPath(); x.arc(px(m), py(v), 2.2 * d, 0, Math.PI * 2); x.fill(); });
    $('#grNote').innerHTML = `Наклон <b>b ≈ ${nf(b, 2)}</b>. Каждая следующая ступень магнитуды встречается примерно в&nbsp;${nf(Math.pow(10, b), 0)} раз реже${live ? '' : ' (в архиве отобраны только крупные — закон тут не работает)'}.`;
  }
  const sup = (n) => String(n).split('').map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('');

  // ---------------------------------------------------------------- хроника
  const tl = $('#tl');
  let replay = false, replayT = 0;
  const REPLAY_SECONDS = 24;
  function drawTimeline() {
    const r = tl.getBoundingClientRect();
    const d = SHOT ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * d), h = Math.round(r.height * d);
    tl.width = w; tl.height = h;
    const x = tl.getContext('2d');
    x.clearRect(0, 0, w, h);
    if (!quakes.length) return;
    const bins = Math.max(24, Math.min(120, Math.round(w / (7 * d))));
    const cnt = new Array(bins).fill(0), maxM = new Array(bins).fill(0);
    quakes.forEach((q) => {
      const k = Math.min(bins - 1, Math.max(0, Math.floor((q.time - T0) / (T1 - T0) * bins)));
      cnt[k]++; maxM[k] = Math.max(maxM[k], q.mag);
    });
    const top = Math.max(...cnt);
    const bw = w / bins;
    for (let i = 0; i < bins; i++) {
      const bh = cnt[i] / top * (h - 8 * d);
      x.fillStyle = maxM[i] >= 6 ? '#ff7b3a' : maxM[i] >= 5 ? 'rgba(255,209,102,0.85)' : 'rgba(170,182,194,0.45)';
      x.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
    }
    if (replay) {
      const cx = replayT * w;
      x.fillStyle = '#e8edf2';
      x.fillRect(cx - 1 * d, 0, 2 * d, h);
    }
    const fmtD = (t) => live ? new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + (feed === 'day' ? ' ' + fmtTime(new Date(t)) : '') : new Date(t).getUTCFullYear();
    $('#tlStart').textContent = fmtD(T0);
    $('#tlEnd').textContent = live ? 'сейчас' : fmtD(T1);
    $('#tlNow').textContent = replay ? fmtD(T0 + (T1 - T0) * replayT) : (live ? 'хроника за период' : 'архив по годам');
  }
  function startReplay() {
    replay = true; replayT = 0;
    $('#icoPlay').style.display = 'none'; $('#icoStop').style.display = '';
    $('#play').setAttribute('aria-label', 'Остановить хронику');
    pointMat.uniforms.uReplay.value = 1;
  }
  function stopReplay() {
    replay = false;
    $('#icoPlay').style.display = ''; $('#icoStop').style.display = 'none';
    $('#play').setAttribute('aria-label', 'Проиграть хронику');
    pointMat.uniforms.uReplay.value = 0;
    pointMat.uniforms.uNow.value = 1e18;
    drawTimeline();
  }
  $('#play').addEventListener('click', () => (replay ? stopReplay() : startReplay()));
  tl.addEventListener('click', (e) => {
    const r = tl.getBoundingClientRect();
    if (!replay) startReplay();
    replayT = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  });

  // ---------------------------------------------------------------- выбор толчка
  const card = $('#card');
  function focusQuake(q) {
    showCard(q);
    const target = ll2v(q.lat, q.lon, 1).normalize();
    const dist = Math.max(2.1, Math.min(3.2, camera.position.length()));
    flyTo = { from: camera.position.clone(), to: target.multiplyScalar(dist), t: 0 };
    controls.autoRotate = false;
    $('#tgRotate').setAttribute('aria-pressed', 'false');
  }
  let flyTo = null;
  function showCard(q) {
    $('#cM').innerHTML = `M ${nf(q.mag, 1)}`;
    $('#cM').style.color = magColor(q);
    $('#cP').textContent = q.place;
    $('#cT').textContent = live ? `${new Date(q.time).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · ${ago(q.time)}` : new Date(q.time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    $('#cD').textContent = `${nf(q.depth, 1)} км`;
    $('#cC').textContent = `${nf(Math.abs(q.lat), 2)}° ${q.lat >= 0 ? 'с. ш.' : 'ю. ш.'}, ${nf(Math.abs(q.lon), 2)}° ${q.lon >= 0 ? 'в. д.' : 'з. д.'}`;
    const link = $('#cL');
    if (q.url) { link.href = q.url; link.style.display = ''; } else link.style.display = 'none';
    card.classList.add('show');
  }
  $('#cardClose').addEventListener('click', () => card.classList.remove('show'));

  // щелчок по вспышке: ближайший видимый толчок в экранных координатах
  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const camDir = camera.position.clone().normalize();
    let best = null, bestD = 22;
    const v = new THREE.Vector3();
    for (const q of quakes) {
      v.copy(ll2v(q.lat, q.lon, 1));
      if (!xray && v.dot(camDir) < 0.12) continue;
      v.project(camera);
      const sx = (v.x * 0.5 + 0.5) * r.width, sy = (-v.y * 0.5 + 0.5) * r.height;
      const dd = Math.hypot(sx - mx, sy - my) - q.mag;
      if (dd < bestD) { bestD = dd; best = q; }
    }
    if (best) showCard(best); else card.classList.remove('show');
  });

  // ---------------------------------------------------------------- переключатели
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
    card.classList.remove('show');
    loadQuakes(b.dataset.feed);
  }));
  let xray = false;
  $('#tgXray').addEventListener('click', (e) => {
    xray = !xray;
    e.currentTarget.setAttribute('aria-pressed', xray ? 'true' : 'false');
    globeMat.uniforms.uAlpha.value = xray ? 0.28 : 1;
    globeMat.depthWrite = !xray;
    if (depthLines) depthLines.visible = xray;
    pointMat.depthTest = !xray;
  });
  $('#tgRotate').addEventListener('click', (e) => {
    controls.autoRotate = !controls.autoRotate;
    e.currentTarget.setAttribute('aria-pressed', controls.autoRotate ? 'true' : 'false');
  });

  // ---------------------------------------------------------------- размер и цикл
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // глобус смещён влево, чтобы не прятаться под панелью
    const panelW = w > 900 ? 400 : 0;
    camera.setViewOffset(w, h, panelW / 2, w > 900 ? 0 : h * 0.2, w, h);
    camera.updateProjectionMatrix();
    pointMat.uniforms.uPx.value = renderer.getPixelRatio();
    drawTimeline();
    if (quakes.length) drawGR();
  }
  window.addEventListener('resize', resize);

  let last = performance.now(), running = true, clock = 0;
  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;
    pointMat.uniforms.uTime.value = reduceMotion ? clock * 0.3 : clock;
    if (replay) {
      replayT += dt / REPLAY_SECONDS;
      if (replayT >= 1) { stopReplay(); }
      else {
        pointMat.uniforms.uNow.value = (T1 - T0) * replayT;
        drawTimeline();
      }
    }
    if (flyTo) {
      flyTo.t = Math.min(1, flyTo.t + dt * 0.8);
      const k = flyTo.t * flyTo.t * (3 - 2 * flyTo.t);
      const p = flyTo.from.clone().lerp(flyTo.to, k).normalize().multiplyScalar(flyTo.from.length() * (1 - k) + flyTo.to.length() * k);
      camera.position.copy(p);
      if (flyTo.t >= 1) flyTo = null;
    }
    globeMat.uniforms.uSun.value = sunDir(new Date());
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = performance.now(); requestAnimationFrame(tick); }
  });

  // ---------------------------------------------------------------- старт
  resize();
  requestAnimationFrame((t) => { last = t; tick(t); });
  const landP = fetchJSON(LAND_URL, 12000).then((t) => drawLand(topo.feature(t, t.objects.land))).catch(() => {});
  const platesP = fetchJSON(PLATES_URL, 12000).then(buildPlates).catch(() => {});
  await Promise.all([landP, platesP, loadQuakes('week')]);
  // обложка: крупнейший толчок недели в кадре
  if (SHOT && quakes.length) {
    const q = quakes.slice().sort((a, b) => b.mag - a.mag)[0];
    const dir = ll2v(q.lat, q.lon, 1).normalize();
    camera.position.copy(dir.multiplyScalar(3.4).add(new THREE.Vector3(0, 0.6, 0)));
    controls.autoRotate = false;
  }
})();
