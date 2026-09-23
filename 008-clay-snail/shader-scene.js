/* Улитка идёт на концерт — сцена: raymarching по полям расстояний (SDF).
   Всё «пластилиновое»: мягкие объединения форм, отпечатки пальцев, лёгкое «дыхание» от кадра к кадру.
   Единица мира — сантиметр. Ось Y вверх, путь улитки идёт вдоль +X. */
const SCENE_SDF = `#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uFrame;
uniform int   uZero;
uniform vec3  uCamPos;
uniform mat3  uCamRot;
uniform vec4  uLens;      // x tan(fov/2), y фокус, z диафрагма (доля высоты кадра), w макс. кружок нерезкости
uniform int   uSet;       // 1 — сад, 2 — титр
uniform int   uEnc;       // 1 — цель RGBA8 (упаковка), 0 — half float
uniform vec3  uKeyDir, uKeyCol, uSkyAmb, uGndAmb, uRimDir, uRimCol, uSkyTop, uSkyHor, uSkyLow;
uniform vec4  uSun, uSunCol, uAtmo;
uniform vec4  uSn[26];
uniform vec4  uCk[120];
uniform int   uNCk;
uniform vec4  uFly[8];
uniform int   uNFly;
uniform vec4  uBug[6];
uniform int   uNBug;
uniform vec4  uMisc[8];
uniform vec4  uTxt[12];
uniform vec2  uTextSize;
uniform sampler2D uText;
uniform int   uDebug;     // 1 — тепловая карта числа шагов (только для замеров)

#define PI 3.14159265
#define TAU 6.2831853

const float M_GROUND=1., M_GRASS=2., M_LEAF=3., M_BODY=4., M_SHELL=5., M_EYE=6., M_CKBODY=7., M_CKDARK=8.,
  M_CKEYE=9., M_WOOD=10., M_TIE=11., M_BERRY=12., M_STEM=13., M_PEBBLE=14., M_MUSHCAP=15., M_MUSHSTEM=16.,
  M_CAN=17., M_CAP=18., M_PAPER=19., M_TWIG=20., M_FLY=21., M_BUG=22., M_BUGHEAD=23., M_SLAB=24.,
  M_LETTER=25., M_PETAL=26., M_DAISY=27., M_BOW=28., M_RIB=29.;

float gLimit;     // безопасный шаг из-за повторения доменов (трава, галька)
float gDist;      // текущая дальность луча: вдали трава и галька не считаются
vec3  gDir;       // направление луча на первичном проходе (для шага по ячейкам), иначе ноль
float gLod;       // 1 — упрощённая сцена для теневых лучей
float gCk;        // индекс сверчка у последнего попадания
float gEye;       // какой глаз (0 — левый, 1 — правый)

// ---------------------------------------------------------------- утилиты
float h11(float p){ p = fract(p*0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
vec2  h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz)*p3.zy); }
float h31(vec3 p3){ p3 = fract(p3*0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y)*p3.z); }
vec3  h33(vec3 p3){ p3 = fract(p3*vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx)*p3.zyx); }
float vn2(vec2 x){ vec2 i = floor(x), f = fract(x); vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float vn3(vec3 x){ vec3 i = floor(x), f = fract(x); vec3 u = f*f*(3.0 - 2.0*f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), u.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), u.x), u.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), u.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), u.x), u.y), u.z); }
float fbm2(vec2 p){ return 0.5*vn2(p) + 0.25*vn2(p*2.03 + 1.7) + 0.125*vn2(p*4.01 + 3.1); }

// «дыхание» пластилина: форма чуть плывёт от кадра к кадру (дёшево — две синусоиды)
float boil(vec3 p, float amp){
  float f = floor(uFrame);
  float a = h11(f*0.731)*6.283, b = h11(f*0.377 + 3.1)*6.283;
  return amp*sin(dot(p, vec3(3.1, 2.3, 2.9)) + a)*sin(dot(p, vec3(-2.2, 3.4, 1.7)) + b);
}
float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.0)/k; return min(a, b) - h*h*k*0.25; }
float smax(float a, float b, float k){ float h = max(k - abs(a - b), 0.0)/k; return max(a, b) + h*h*k*0.25; }
float dot2(vec3 v){ return dot(v, v); }
float sdEll(vec3 p, vec3 r){ float k0 = length(p/r); float k1 = length(p/(r*r)); return k0*(k0 - 1.0)/max(k1, 1e-6); }
float sdCap(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba*h) - r; }
// круглый конус между двумя сферами (Иниго Килес)
float sdRC(vec3 p, vec3 a, vec3 b, float r1, float r2){
  vec3 ba = b - a; float l2 = dot(ba, ba); float rr = r1 - r2; float a2 = l2 - rr*rr;
  if (a2 < 1e-5) return min(length(p - a) - r1, length(p - b) - r2);
  float il2 = 1.0/l2;
  vec3 pa = p - a; float y = dot(pa, ba); float z = y - l2;
  float x2 = dot2(pa*l2 - ba*y); float y2 = y*y*l2; float z2 = z*z*l2;
  float k = sign(rr)*rr*rr*x2;
  if (sign(z)*a2*z2 > k) return sqrt(x2 + z2)*il2 - r2;
  if (sign(y)*a2*y2 < k) return sqrt(x2 + y2)*il2 - r1;
  return (sqrt(x2*a2*il2) + y*rr)*il2 - r1;
}
float sdRBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
mat3 frameFromUN(vec3 U, vec3 N){ U = normalize(U); N = normalize(N - U*dot(N, U)); return mat3(U, N, cross(U, N)); }
vec3 toLocal(mat3 F, vec3 d){ return vec3(dot(d, F[0]), dot(d, F[1]), dot(d, F[2])); }

// ---------------------------------------------------------------- земля
// Та же формула есть в film.js: персонажи стоят ровно на поверхности.
float groundH(vec2 p){
  float x = p.x, z = p.y;
  float h = -16.0*smoothstep(50.0, 104.0, x);
  h += 0.45*sin(0.13*x + 1.3)*sin(0.17*z + 0.4)
     + 0.30*sin(0.29*x + 0.8*sin(0.11*z) - 0.9)*cos(0.23*z + 2.1)
     + 0.16*sin(0.61*x + 0.37*z + 1.7)*sin(0.53*z - 0.41*x);
  h -= 0.3*smoothstep(18.0, 21.0, x)*(1.0 - smoothstep(37.0, 40.0, x));
  return h;
}
float pathMask(float x){ return smoothstep(18.0, 21.0, x)*(1.0 - smoothstep(37.0, 40.0, x)); }

float grassDens(vec2 c){
  float d = 0.78;
  d *= smoothstep(2.6, 5.5, abs(c.y));
  d *= 1.0 - pathMask(c.x);
  d *= smoothstep(9.0, 13.0, length(c - vec2(128.0, -3.0)));
  d *= smoothstep(14.0, 18.0, length(c - vec2(143.0, -15.0)));
  d *= smoothstep(4.5, 7.5, length(c));
  // коридоры обзора крупных планов (у малины и у раковины на концерте): травинки не заслоняют героиню
  vec2 pa = c - vec2(125.0, 12.0), ba = vec2(-6.0, -10.5);
  d *= smoothstep(1.8, 3.6, length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0)));
  pa = c - vec2(44.5, 12.5); ba = vec2(-1.5, -9.5);
  d *= smoothstep(1.8, 3.6, length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0)));
  pa = c - vec2(45.8, -6.8); ba = vec2(-1.4, 5.8);
  d *= smoothstep(1.8, 3.6, length(pa - ba*clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0)));
  return d;
}

float blade(vec3 q, float ang, float H, float W, float tip){
  float c = cos(ang), s = sin(ang);
  q.xz = vec2(c*q.x + s*q.z, -s*q.x + c*q.z);
  float y = clamp(q.y/H, 0.0, 1.0);
  float xc = tip*y*y;
  float w = W*(1.0 - 0.8*y);
  float th = w*0.45;
  float e = (length(vec2((q.x - xc)/th, q.z/w)) - 1.0)*th;
  return max(e, q.y - H)*0.8;
}

// сколько луч пройдёт до выхода из квадратной ячейки (DDA); без направления — расстояние до границы
float cellExit(vec2 p, vec2 lc, float hs){
  vec2 f = p - lc;
  if (dot(gDir, gDir) > 0.5){
    vec2 d = gDir.xz;
    float tx = abs(d.x) > 1e-4 ? ((d.x > 0.0 ? hs : -hs) - f.x)/d.x : 1e5;
    float tz = abs(d.y) > 1e-4 ? ((d.y > 0.0 ? hs : -hs) - f.y)/d.y : 1e5;
    return max(min(tx, tz), 0.0) + 0.04;
  }
  return max(hs - max(abs(f.x), abs(f.y)), 0.0) + 0.25;
}
vec2 mapGrass(vec3 p, float gy){
  const float GS = 3.2;
  vec2 c = floor(p.xz/GS);
  vec2 lc = (c + 0.5)*GS;
  gLimit = min(gLimit, cellExit(p.xz, lc, GS*0.5));
  vec2 r = h22(c);
  if (r.x > grassDens(lc)) return vec2(1e5, M_GRASS);
  vec2 base = lc + (h22(c + 7.7) - 0.5)*0.55;
  vec3 q = vec3(p.x - base.x, p.y - gy + 0.25, p.z - base.y);
  float H = 3.0 + 4.2*r.y;
  float bb = max(length(q.xz) - 1.35, q.y - H - 0.3);
  if (bb > 0.3) return vec2(bb, M_GRASS);
  float d = 1e5;
  for (int i = 0; i < 3; i++){
    float fi = float(i);
    float a = r.y*TAU + fi*2.3;
    float hh = H*(0.62 + 0.38*h21(c + fi*3.7));
    d = min(d, blade(q, a, hh, 0.34, 0.25 + 0.45*h21(c + fi*1.9)));
  }
  return vec2(d, M_GRASS);
}

vec2 mapPebbles(vec3 p, float gh){
  float pm = pathMask(p.x);
  if (pm < 0.02 || p.y - gh > 1.2) return vec2(1e5, M_PEBBLE);
  const float PS = 1.5;
  vec2 c = floor(p.xz/PS); vec2 lc = (c + 0.5)*PS;
  gLimit = min(gLimit, cellExit(p.xz, lc, PS*0.5));
  vec2 r = h22(c + 3.1);
  if (r.x > 0.62*pm) return vec2(1e5, M_PEBBLE);
  float sz = 0.16 + 0.26*r.y;
  vec2 cen = lc + (h22(c + 5.3) - 0.5)*(PS - 2.8*sz)*0.8;
  vec3 q = vec3(p.x - cen.x, p.y - gh + sz*0.2, p.z - cen.y);
  float a = r.y*TAU; float ca = cos(a), sa = sin(a);
  q.xz = vec2(ca*q.x + sa*q.z, -sa*q.x + ca*q.z);
  return vec2(sdEll(q, vec3(sz*1.35, sz*0.62, sz)), M_PEBBLE);
}

// ---------------------------------------------------------------- листья, стебли, цветы
// Лист: основание B, направление к кончику U, примерная нормаль N, длина L, полуширина W.
float leafSDF(vec3 p, vec3 B, vec3 U, vec3 N, float L, float W, float droop, float cup, out float rib){
  mat3 F = frameFromUN(U, N);
  vec3 q = toLocal(F, p - B);
  float xl = clamp(q.x/L, 0.0, 1.0);
  q.y += droop*q.x*q.x/L - cup*q.z*q.z/W;
  float wx = W*pow(max(sin(PI*min(xl*1.08, 1.0)), 0.0), 0.7)*(1.0 - 0.2*xl) + 0.05;
  float serr = 0.06*W*abs(sin(q.x*3.1));
  float edge = abs(q.z) - wx + serr*0.3;
  float ends = max(-q.x, q.x - L);
  float outline = max(edge, ends);
  float th = 0.1 + 0.08*(1.0 - xl);
  float dd = max(outline*0.8, abs(q.y) - th);
  rib = max(length(vec2(q.y + 0.06, q.z)) - (0.3*(1.0 - xl) + 0.07), ends);
  return min(dd, rib)*0.7;
}

vec2 daisy(vec3 p, vec3 base, float H, vec3 face){
  vec3 top = base + vec3(0.0, H, 0.0) + face*0.6;
  float stem = sdCap(p, base, top - face*0.2, 0.13);
  vec2 res = vec2(stem, M_STEM);
  vec3 d = p - top;
  if (dot(d, d) > 6.0) return vec2(min(stem, length(d) - 2.0), M_STEM);
  mat3 F = frameFromUN(normalize(cross(face, vec3(0.0, 0.0, 1.0)) + vec3(0.001)), face);
  vec3 q = toLocal(F, d);                       // q.y — вдоль «лица» цветка
  float ctr = sdEll(q - vec3(0.0, 0.12, 0.0), vec3(0.5, 0.3, 0.5));
  float a = atan(q.z, q.x); float sec = TAU/13.0; float ai = floor(a/sec + 0.5); float aa = a - ai*sec;
  float rr = length(q.xz);
  vec3 pq = vec3(rr*cos(aa) - 1.1, q.y + 0.08*rr*rr - 0.02, rr*sin(aa));
  float pet = sdEll(pq, vec3(0.72, 0.07, 0.2 + 0.03*h11(ai)));
  if (pet < res.x) res = vec2(pet, M_PETAL);
  if (ctr < res.x) res = vec2(ctr, M_DAISY);
  return res;
}

// ---------------------------------------------------------------- экземпляры: ромашки и листья (один цикл — одна копия кода)
const vec4 DZ[5] = vec4[5](vec4(-7.5, -0.02, 6.5, 5.2), vec4(12.0, -0.21, -6.5, 6.6), vec4(-12.5, -0.28, -2.0, 5.8),
                           vec4(135.0, -16.39, -9.0, 6.2), vec4(119.0, -15.73, -8.0, 5.0));
const vec3 DF[5] = vec3[5](vec3(0.254, 0.847, 0.508), vec3(-0.331, 0.828, 0.414), vec3(0.4, 0.8, 0.32),
                           vec3(-0.254, 0.847, 0.424), vec3(0.348, 0.87, 0.348));
const vec4 LB[3] = vec4[3](vec4(-6.5, 8.2, -4.5, 16.5), vec4(47.8, 6.8, -3.2, 4.6), vec4(49.4, 5.4, -4.2, 4.2));
const vec4 LU[3] = vec4[3](vec4(0.92, 0.12, 0.38, 6.8), vec4(-0.35, -0.45, 0.8, 1.8), vec4(0.75, -0.2, 0.55, 1.7));
const vec4 LN[3] = vec4[3](vec4(-0.1, 1.0, 0.12, 0.17), vec4(0.2, 1.0, 0.3, 0.2), vec4(-0.1, 1.0, 0.1, 0.25));
const float LC[3] = float[3](0.11, 0.15, 0.12);

// ---------------------------------------------------------------- дом: лопух, афиша, ромашки
const vec3 LF1_B = vec3(-6.5, 8.2, -4.5);
const vec3 LF1_U = vec3(0.92, 0.12, 0.38);
const vec3 LF1_N = vec3(-0.1, 1.0, 0.12);
const vec3 PST_C = vec3(7.6, 5.4, 4.6);
const vec3 PST_N = vec3(-0.878, 0.0, 0.479);

float posterSDF(vec3 p, out vec2 puv){
  mat3 F = frameFromUN(vec3(0.0, 1.0, 0.0), PST_N);   // F[0] — вверх, F[1] — нормаль, F[2] — вбок
  vec3 q = toLocal(F, p - PST_C);
  q.y -= 0.035*q.z*q.z - 0.02*q.x;
  puv = vec2(q.z, q.x);
  return sdRBox(q, vec3(3.0, 0.03, 2.3), 0.02);
}

vec2 mapHome(vec3 p){
  vec2 res = vec2(1e5, M_RIB);
  // черешок лопуха
  float pet = min(sdCap(p, vec3(-7.6, -0.5, -6.2), vec3(-7.4, 4.6, -5.6), 0.42), sdCap(p, vec3(-7.4, 4.6, -5.6), LF1_B, 0.36));
  res.x = pet;
  // афиша на прутике
  float bp = length(p - vec3(7.8, 4.5, 4.7)) - 5.0;
  if (bp < 0.5){
    vec2 puv;
    float ps = posterSDF(p, puv);
    if (ps < res.x) res = vec2(ps, M_PAPER);
    float tw = sdCap(p, vec3(8.0, -0.5, 4.95), vec3(8.25, 8.6, 5.15), 0.17);
    tw = min(tw, sdCap(p, vec3(8.2, 7.2, 5.1), vec3(9.2, 8.6, 5.0), 0.1));
    if (tw < res.x) res = vec2(tw, M_TWIG);
    float pin = length(p - (PST_C + vec3(0.0, 2.6, 0.0) + PST_N*0.08)) - 0.22;
    if (pin < res.x) res = vec2(pin, M_TIE);
  } else res.x = min(res.x, bp);
  // камешек
  float pb = sdEll(p - vec3(4.6, 0.19, -3.2), vec3(1.1, 0.7, 0.9));
  if (pb < res.x) res = vec2(pb, M_PEBBLE);
  return res;
}

// ---------------------------------------------------------------- малина
// uMisc[0] — центр ягоды и сколько съедено, uMisc[1].xyz — ось ягоды
float berrySDF(vec3 p, out float cell){
  vec3 c = uMisc[0].xyz; float eaten = uMisc[0].w;
  vec3 ax = normalize(uMisc[1].xyz);
  mat3 F = frameFromUN(ax, vec3(0.0, 0.0, 1.0) + ax.yzx*0.3);
  float s = 1.0 - 0.25*eaten;
  vec3 q = toLocal(F, p - c)/s;                  // q.x — вдоль оси (к чашелистику)
  vec3 qs = vec3(q.x/1.22, q.y, q.z);
  float r = length(qs);
  cell = 0.0;
  if (r > 2.2) return (r - 1.9)*s;
  float th = acos(clamp(qs.x/max(r, 1e-4), -1.0, 1.0));   // 0 у чашелистика
  float ph = atan(qs.z, qs.y);
  const float TH0 = 0.42, DTH = 0.4;
  float d = 1e5;
  vec3 bite = normalize(uMisc[4].xyz);
  float fi = (th - TH0)/DTH;
  float i0 = clamp(floor(fi), 0.0, 6.0);
  for (int k = 0; k < 2; k++){
    float ri = clamp(i0 + float(k), 0.0, 6.0);
    float thc = TH0 + ri*DTH;
    float nph = max(3.0, floor(TAU*sin(thc)/DTH));
    float off = ri*0.37;
    float ji = floor((ph/TAU)*nph + 0.5 - off);
    float phc = (ji + off)/nph*TAU;
    vec3 cc = 0.93*vec3(cos(thc), sin(thc)*cos(phc), sin(thc)*sin(phc));
    vec3 wc = F*vec3(cc.x*1.22, cc.y, cc.z);
    if (dot(normalize(wc), bite) > 1.0 - 2.3*eaten) continue;
    float dd = length(q - vec3(cc.x*1.22, cc.y, cc.z)) - 0.34;
    if (dd < d){ d = dd; cell = ri*37.0 + ji; }
  }
  float core = sdEll(q - vec3(-0.1, 0.0, 0.0), vec3(1.05, 0.82, 0.82)*(1.0 - 0.85*eaten));
  core = smax(core, -(length(qs - bite*1.9) - 2.5*eaten), 0.1);
  d = smin(d, core, 0.12);
  return d*s*0.85;
}

vec2 mapBerry(vec3 p){
  vec2 res = vec2(1e5, M_BERRY);
  if (uMisc[1].w > 0.5){
    float bb = length(p - uMisc[0].xyz) - 2.6;
    if (bb < 0.5){
      float cell;
      float b = berrySDF(p, cell);
      if (uMisc[0].w > 0.985) b = 1e5;
      res = vec2(b, M_BERRY);
      vec3 ax = normalize(uMisc[1].xyz);
      vec3 top = uMisc[0].xyz + ax*1.25*(1.0 - 0.25*uMisc[0].w);
      mat3 CF = frameFromUN(ax, vec3(0.0, 0.0, 1.0) + ax.yzx*0.3);
      vec3 cq = toLocal(CF, p - top);
      float star = length(cq.yz) - (0.62 + 0.28*cos(5.0*atan(cq.z, cq.y)));
      float cal = max(star*0.7, abs(cq.x + 0.03*dot(cq.yz, cq.yz)) - 0.08);
      cal = min(cal, sdCap(p, top, top + ax*0.8 + vec3(0.0, 0.25, 0.0), 0.11));
      if (cal < res.x) res = vec2(cal, M_STEM);
    } else res.x = bb;
  }
  // куст малины: стебель и два листа
  float bc = length(p - vec3(47.5, 4.0, -3.0)) - 8.0;
  if (bc < 0.5){
    float st = sdCap(p, vec3(50.0, -0.6, -6.5), vec3(49.3, 5.5, -4.2), 0.3);
    st = min(st, sdCap(p, vec3(49.3, 5.5, -4.2), vec3(46.5, 7.6, -2.0), 0.24));
    st = min(st, sdCap(p, vec3(46.5, 7.6, -2.0), vec3(44.8, 7.0, -0.9), 0.18));
    if (st < res.x) res = vec2(st, M_TWIG);
    float hb = sdEll(p - vec3(44.9, 6.2, -0.9), vec3(0.62, 0.8, 0.62));
    if (hb < res.x) res = vec2(hb, M_BERRY);
  } else res.x = min(res.x, bc);
  return res;
}

// ---------------------------------------------------------------- склон: мухомор и камни
vec2 mapSlope(vec3 p){
  vec2 res = vec2(1e5, M_MUSHCAP);
  vec3 mb = vec3(84.0, -10.955, -0.5);
  float bm = length(p - mb - vec3(0.0, 2.5, 0.0)) - 4.5;
  if (bm < 0.5){
    float sq = uMisc[3].x;                                  // сжатие шляпки от удара
    vec3 q = p - mb;
    float stem = sdRC(q, vec3(0.0, -0.3, 0.0), vec3(0.0, 3.0 - 0.6*sq, 0.0), 0.75, 0.55);
    vec3 cq = q - vec3(0.0, 3.3 - 0.8*sq, 0.0);
    float cap = sdEll(cq, vec3(2.7 + 0.5*sq, 1.35 - 0.5*sq, 2.7 + 0.5*sq));
    cap = smax(cap, -cq.y - 0.15, 0.3);
    res = vec2(cap, M_MUSHCAP);
    if (stem < res.x) res = vec2(stem, M_MUSHSTEM);
  } else res.x = bm;
  vec3 pb = vec3(71.0, -5.306, 0.4);
  float peb = sdEll(p - pb, vec3(1.3, 0.85, 1.1));
  if (peb < res.x) res = vec2(peb, M_PEBBLE);
  vec3 pb2 = vec3(93.0, -14.166, -3.4);
  peb = sdEll(p - pb2, vec3(1.6, 1.0, 1.3));
  if (peb < res.x) res = vec2(peb, M_PEBBLE);
  return res;
}

// ---------------------------------------------------------------- площадка концерта: лейка и крышка-сцена
const vec3 CAN_P = vec3(143.0, -16.3, -15.0);
const vec3 CAP_P = vec3(128.0, -16.0, -3.0);
vec2 mapVenue(vec3 p){
  vec2 res = vec2(1e5, M_CAN);
  vec3 q = p - CAN_P;
  float bcan = length(q - vec3(-6.0, 16.0, 0.0)) - 26.0;
  if (bcan < 0.5){
    vec2 w = vec2(length(q.xz) - 11.0 + 1.2, abs(q.y - 13.0) - 13.0 + 1.2);
    float body = min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 1.2;
    float rim = length(vec2(length(q.xz) - 10.8, q.y - 25.6)) - 0.8;
    body = smin(body, rim, 0.6);
    body += 0.15*sin(q.y*0.9)*smoothstep(0.0, 4.0, q.y)*0.3;
    float sp = sdRC(q, vec3(-8.5, 5.0, 3.0), vec3(-24.0, 22.0, 9.0), 2.6, 1.1);
    body = smin(body, sp, 1.2);
    vec3 rq = q - vec3(-25.0, 23.2, 9.5);
    vec3 ra = normalize(vec3(-15.5, 17.0, 6.0));
    float rose = max(length(rq - ra*dot(rq, ra)) - 2.3, abs(dot(rq, ra)) - 0.7);
    body = smin(body, rose - 0.3, 0.5);
    vec3 hq = q - vec3(6.0, 26.0, 0.0);
    float handle = length(vec2(length(hq.xy) - 7.0, hq.z)) - 0.9;
    handle = max(handle, -hq.y + 0.5);
    body = smin(body, handle, 0.8);
    res = vec2(body, M_CAN);
  } else res.x = bcan;
  vec3 c = p - CAP_P;
  float bcap = length(c) - 6.5;
  if (bcap < 0.5){
    float a = atan(c.z, c.x);
    float R = 4.6 + 0.16*(smoothstep(-0.3, 0.3, sin(a*21.0)) - 0.5);
    vec2 w = vec2(length(c.xz) - R, abs(c.y - 0.65) - 0.65);
    float cap = min(max(w.x, w.y), 0.0) + length(max(w + 0.15, 0.0)) - 0.15;
    if (cap*0.8 < res.x) res = vec2(cap*0.8, M_CAP);
  } else res.x = min(res.x, bcap);
  return res;
}

// ---------------------------------------------------------------- улитка
// Раковина — жгут пластилина, свёрнутый спиралью (как у детской лепки), из двух скрученных цветов.
const float SH_A = 0.10, SH_B = 0.50, SH_SM = 2.75, SH_R0 = 0.15, SH_R1 = 0.093, SH_ZS = 1.55, SH_CONE = 0.55;
float shellSDF(vec3 q, out vec3 info){
  float r = length(q.xy);
  float ang = atan(q.y, q.x)/TAU;
  float n = (r - SH_A)/SH_B - ang;
  float k0 = floor(n);
  float best = 1e5, second = 1e5;
  info = vec3(0.0);
  for (int i = 0; i < 2; i++){
    float s = ang + k0 + float(i);
    float sc = clamp(s, 0.0, SH_SM);
    float rc = SH_A + SH_B*sc;
    float rho = SH_R0 + SH_R1*sc;
    float zc = SH_CONE*(1.0 - sc/SH_SM);
    float dd;
    vec2 cs;
    if (abs(s - sc) < 1e-4){
      cs = vec2(r - rc, (q.z - zc)/SH_ZS);
      dd = length(cs) - rho;
    } else {
      float ae = sc*TAU;
      vec3 de = q - vec3(rc*cos(ae), rc*sin(ae), zc); de.z /= SH_ZS;
      cs = vec2(length(de.xy), de.z);
      dd = length(de) - rho;
    }
    if (dd < best){ second = best; best = dd; info = vec3(sc, atan(cs.y, cs.x), 0.0); }
    else second = min(second, dd);
  }
  info.z = second - best;
  return smin(best, second, 0.1);
}

vec2 mapSnail(vec3 p, float best){
  vec4 B = uSn[23];
  if (B.w <= 0.0) return vec2(1e5, M_BODY);
  float db = length(p - B.xyz) - B.w;
  if (db > best) return vec2(db, M_BODY);
  vec2 res = vec2(1e5, M_BODY);
  // раковина — своя граница
  float dsb = length(p - uSn[21].xyz) - 2.15/max(uSn[18].w, 0.3);
  if (dsb < best){
    mat3 M = mat3(uSn[18].xyz, uSn[19].xyz, uSn[20].xyz);
    vec3 sq = transpose(M)*(p - uSn[21].xyz);
    vec3 info;
    float ds = shellSDF(sq, info)*uSn[18].w;
    res = vec2(ds, M_SHELL);
    best = min(best, ds);
  } else res.x = dsb;
  // тело и глаза: граница по голове, туловищу и глазам
  vec3 bc = (uSn[0].xyz + uSn[4].xyz + uSn[5].xyz + uSn[6].xyz)*0.25;
  float br = max(max(length(uSn[0].xyz - bc) + uSn[0].w, length(uSn[4].xyz - bc) + uSn[4].w),
                 max(length(uSn[5].xyz - bc), length(uSn[6].xyz - bc)) + uSn[5].w*1.2) + 0.9;
  float dbb = length(p - bc) - br;
  if (dbb > best) return vec2(min(res.x, dbb), res.x < dbb ? res.y : M_BODY);
  // тело: хвост → середина → перед → шея → голова
  float d = sdRC(p, uSn[0].xyz, uSn[1].xyz, uSn[0].w, uSn[1].w);
  d = smin(d, sdRC(p, uSn[1].xyz, uSn[2].xyz, uSn[1].w, uSn[2].w), 0.35);
  d = smin(d, sdRC(p, uSn[2].xyz, uSn[3].xyz, uSn[2].w, uSn[3].w), 0.35);
  d = smin(d, length(p - uSn[4].xyz) - uSn[4].w, 0.4);
  if (gLod > 0.5){
    d = smin(d, min(sdCap(p, uSn[9].xyz, uSn[5].xyz, 0.14), sdCap(p, uSn[10].xyz, uSn[6].xyz, 0.14)), 0.15);
    d = min(d, min(length(p - uSn[5].xyz), length(p - uSn[6].xyz)) - uSn[5].w);
    return vec2(min(d, res.x), M_BODY);
  }
  // нижние рожки
  d = smin(d, sdCap(p, uSn[4].xyz + uSn[16].xyz*uSn[4].w*0.55 - uSn[17].xyz*0.1, uSn[24].xyz, 0.1), 0.12);
  d = smin(d, sdCap(p, uSn[4].xyz + uSn[16].xyz*uSn[4].w*0.55 - uSn[17].xyz*0.1, uSn[25].xyz, 0.1), 0.12);
  // стебельки глаз
  float rs = uSn[7].w;
  float st = min(sdCap(p, uSn[9].xyz, uSn[7].xyz, rs), sdCap(p, uSn[10].xyz, uSn[8].xyz, rs));
  st = min(st, min(sdCap(p, uSn[7].xyz, uSn[5].xyz, rs*0.82), sdCap(p, uSn[8].xyz, uSn[6].xyz, rs*0.82)));
  d = smin(d, st, 0.16);
  // подошва
  d = smax(d, uSn[22].w - dot(p, uSn[22].xyz), 0.18);
  // рот
  vec3 F = uSn[16].xyz, U = uSn[17].xyz, S = cross(F, U);
  vec3 mq = p - uSn[15].xyz;
  vec3 lq = vec3(dot(mq, S), dot(mq, U), dot(mq, F));
  lq.y -= uSn[16].w*lq.x*lq.x;
  float mouth = sdEll(lq, vec3(uSn[17].w, 0.035 + uSn[15].w*0.22, 0.3));
  d = smax(d, -mouth, 0.05);
  d += boil(p, 0.012);
  if (d < res.x) res = vec2(d, M_BODY);
  // веки — шапочки над глазами
  float rE = uSn[5].w;
  float lidL = max(length(p - uSn[5].xyz) - rE*1.12, uSn[13].w*rE - dot(p - uSn[5].xyz, uSn[13].xyz));
  float lidR = max(length(p - uSn[6].xyz) - rE*1.12, uSn[14].w*rE - dot(p - uSn[6].xyz, uSn[14].xyz));
  float lids = min(lidL, lidR);
  if (lids < res.x) res = vec2(lids, M_BODY);
  // глаза
  float eL = length(p - uSn[5].xyz) - rE, eR = length(p - uSn[6].xyz) - rE;
  if (min(eL, eR) < res.x){ res = vec2(min(eL, eR), M_EYE); gEye = eL < eR ? 0.0 : 1.0; }
  return res;
}

// ---------------------------------------------------------------- сверчки
// 30 векторов на сверчка, см. rigCricket в film.js
vec2 mapCricket(vec3 p, int b, float best){
  vec4 bb = uCk[b + 27];
  float db = length(p - bb.xyz) - bb.w;
  if (db > best) return vec2(db, M_CKBODY);
  vec3 Fw = uCk[b + 28].xyz, Up = uCk[b + 29].xyz, Rt = cross(Fw, Up);
  float sc = uCk[b + 28].w;
  vec2 res = vec2(1e5, M_CKBODY);
  vec3 hd = uCk[b + 2].xyz; float hr = uCk[b + 2].w;
  // корпус: брюшко, грудь, голова, фрак, бабочка, глаза
  float dt = length(p - uCk[b + 1].xyz) - 1.9*sc;
  if (dt < best){
    float d = sdRC(p, uCk[b].xyz, uCk[b + 1].xyz, uCk[b].w, uCk[b + 1].w);
    d = smin(d, length(p - hd) - hr, 0.22);
    if (gLod > 0.5){
      res = vec2(d, M_CKBODY);
      float lr = uCk[b + 16].w;
      float lg = min(sdCap(p, uCk[b + 16].xyz, uCk[b + 17].xyz, lr*1.3), sdCap(p, uCk[b + 17].xyz, uCk[b + 18].xyz, lr*0.7));
      lg = min(lg, min(sdCap(p, uCk[b + 19].xyz, uCk[b + 20].xyz, lr*1.3), sdCap(p, uCk[b + 20].xyz, uCk[b + 21].xyz, lr*0.7)));
      lg = min(lg, min(sdCap(p, uCk[b + 10].xyz, uCk[b + 12].xyz, 0.1*sc), sdCap(p, uCk[b + 13].xyz, uCk[b + 15].xyz, 0.1*sc)));
      if (uCk[b + 22].w > 0.0) lg = min(lg, length(p - uCk[b + 22].xyz) - 0.45*uCk[b + 22].w);
      return vec2(min(d, lg), M_CKBODY);
    }
    d += boil(p, 0.01);
    res = vec2(d, M_CKBODY);
    vec3 wc = mix(uCk[b].xyz, uCk[b + 1].xyz, 0.45) - Fw*(uCk[b].w*0.85);
    vec3 wq = p - wc;
    vec3 wl = vec3(dot(wq, Rt), dot(wq, Up), dot(wq, Fw));
    wl.z += 0.18*wl.x*wl.x;
    float wing = sdEll(wl - vec3(0.0, -0.35, 0.0), vec3(0.62, 1.25, 0.14)*sc);
    wing = smax(wing, -(abs(wl.x) - 0.04), 0.03);
    if (wing < res.x) res = vec2(wing, M_CKDARK);
    float er = uCk[b + 3].w;
    float e = min(length(p - uCk[b + 3].xyz), length(p - uCk[b + 4].xyz)) - er;
    if (e < res.x){ res = vec2(e, M_CKEYE); gEye = length(p - uCk[b + 3].xyz) < length(p - uCk[b + 4].xyz) ? 0.0 : 1.0; }
    if (uCk[b + 29].w > 0.0){
      vec3 nk = mix(uCk[b + 1].xyz, hd, 0.52) + Fw*uCk[b + 1].w*0.72;
      vec3 tq = p - nk; vec3 tl = vec3(dot(tq, Rt), dot(tq, Up), dot(tq, Fw));
      tl.x = abs(tl.x);
      float tie = min(sdEll(tl - vec3(0.2, 0.0, 0.0), vec3(0.2, 0.14 + 0.1*tl.x, 0.08)*sc), length(tl) - 0.08*sc);
      if (tie < res.x) res = vec2(tie, M_TIE);
    }
    best = min(best, res.x);
  } else res.x = dt;
  // усики
  vec3 ta = uCk[b + 7].xyz, tb = uCk[b + 9].xyz;
  vec3 ac = (hd + ta + tb)*0.3333;
  float ab = length(p - ac) - (max(length(ta - ac), length(tb - ac)) + 0.35*sc);
  if (ab < best){
    float an = uCk[b + 6].w;
    vec3 abL = hd + Up*hr*0.8 - Rt*hr*0.25 + Fw*hr*0.35;
    vec3 abR = hd + Up*hr*0.8 + Rt*hr*0.25 + Fw*hr*0.35;
    float ant = min(sdCap(p, abL, uCk[b + 6].xyz, an), sdCap(p, uCk[b + 6].xyz, ta, an*0.8));
    ant = min(ant, min(sdCap(p, abR, uCk[b + 8].xyz, an), sdCap(p, uCk[b + 8].xyz, tb, an*0.8)));
    if (ant < res.x) res = vec2(ant, M_CKDARK);
    best = min(best, res.x);
  } else res.x = min(res.x, ab);
  // руки
  vec3 amc = (uCk[b + 10].xyz + uCk[b + 12].xyz + uCk[b + 13].xyz + uCk[b + 15].xyz)*0.25;
  float amr = max(max(length(uCk[b + 12].xyz - amc), length(uCk[b + 15].xyz - amc)), max(length(uCk[b + 11].xyz - amc), length(uCk[b + 14].xyz - amc))) + 0.3*sc;
  amr = max(amr, max(length(uCk[b + 10].xyz - amc), length(uCk[b + 13].xyz - amc)) + 0.3*sc);
  float abd = length(p - amc) - amr;
  if (abd < best){
    float ar = uCk[b + 10].w;
    float limbs = min(sdCap(p, uCk[b + 10].xyz, uCk[b + 11].xyz, ar), sdCap(p, uCk[b + 11].xyz, uCk[b + 12].xyz, ar*0.85));
    limbs = min(limbs, min(sdCap(p, uCk[b + 13].xyz, uCk[b + 14].xyz, ar), sdCap(p, uCk[b + 14].xyz, uCk[b + 15].xyz, ar*0.85)));
    limbs = min(limbs, min(length(p - uCk[b + 12].xyz), length(p - uCk[b + 15].xyz)) - ar*1.6);
    if (limbs < res.x) res = vec2(limbs, M_CKBODY);
    best = min(best, res.x);
  } else res.x = min(res.x, abd);
  // ноги: высокое колено кузнечика
  vec3 lc = (uCk[b + 16].xyz + uCk[b + 18].xyz + uCk[b + 19].xyz + uCk[b + 21].xyz)*0.25;
  float lrr = max(max(length(uCk[b + 17].xyz - lc), length(uCk[b + 20].xyz - lc)), max(length(uCk[b + 18].xyz - lc), length(uCk[b + 21].xyz - lc)));
  lrr = max(lrr, max(length(uCk[b + 16].xyz - lc), length(uCk[b + 19].xyz - lc))) + 0.45*sc;
  float lbd = length(p - lc) - lrr;
  if (lbd < best){
    float lr = uCk[b + 16].w;
    float legs = sdRC(p, uCk[b + 16].xyz, uCk[b + 17].xyz, lr*1.7, lr*0.9);
    legs = min(legs, sdCap(p, uCk[b + 17].xyz, uCk[b + 18].xyz, lr*0.65));
    legs = min(legs, sdRC(p, uCk[b + 19].xyz, uCk[b + 20].xyz, lr*1.7, lr*0.9));
    legs = min(legs, sdCap(p, uCk[b + 20].xyz, uCk[b + 21].xyz, lr*0.65));
    legs = min(legs, sdEll(p - uCk[b + 18].xyz - Fw*0.15*sc, vec3(0.28, 0.12, 0.28)*lr*4.0));
    legs = min(legs, sdEll(p - uCk[b + 21].xyz - Fw*0.15*sc, vec3(0.28, 0.12, 0.28)*lr*4.0));
    if (legs < res.x) res = vec2(legs, M_CKBODY);
    best = min(best, res.x);
  } else res.x = min(res.x, lbd);
  // скрипка
  vec4 vc = uCk[b + 22];
  if (vc.w > 0.0){
    float vbd = length(p - vc.xyz) - 1.25*vc.w;
    if (vbd < best){
      vec3 na = uCk[b + 23].xyz, fn = uCk[b + 24].xyz, sd = cross(na, fn);
      vec3 vq = p - vc.xyz; vec3 vl = vec3(dot(vq, sd), dot(vq, na), dot(vq, fn))/vc.w;
      float vb = min(sdEll(vl - vec3(0.0, -0.28, 0.0), vec3(0.42, 0.36, 0.13)), sdEll(vl - vec3(0.0, 0.18, 0.0), vec3(0.33, 0.3, 0.12)));
      vb = smax(vb, -sdEll(vec3(abs(vl.x) - 0.42, vl.y + 0.02, vl.z), vec3(0.1, 0.1, 0.3)), 0.05);
      float neck = sdCap(vl, vec3(0.0, 0.3, 0.06), vec3(0.0, 1.05, 0.06), 0.06);
      neck = min(neck, sdEll(vl - vec3(0.0, 1.1, 0.04), vec3(0.07, 0.1, 0.07)));
      float vv = min(vb, neck)*vc.w;
      if (vv < res.x) res = vec2(vv, M_WOOD);
    } else res.x = min(res.x, vbd);
  }
  // смычок или дирижёрская палочка
  vec4 ba = uCk[b + 25];
  if (ba.w > 0.0){
    float bw = sdCap(p, ba.xyz, uCk[b + 26].xyz, ba.w > 1.5 ? 0.045 : 0.035);
    if (bw < res.x) res = vec2(bw, M_BOW);
  }
  return res;
}

// ---------------------------------------------------------------- божьи коровки и светлячки
vec2 mapBugs(vec3 p){
  vec2 res = vec2(1e5, M_BUG);
  for (int i = uZero; i < 3; i++){
    if (i >= uNBug) break;
    vec4 A = uBug[i*2], P = uBug[i*2 + 1];
    vec3 q = p - A.xyz;
    if (dot(q, q) > 9.0*P.x*P.x){ res.x = min(res.x, length(q) - 2.4*P.x); continue; }
    float c = cos(A.w), s = sin(A.w);
    q.xz = vec2(c*q.x + s*q.z, -s*q.x + c*q.z);
    q /= P.x;
    q.y -= 0.06*abs(sin(P.y*TAU));
    float dome = sdEll(q - vec3(0.0, 0.3, 0.0), vec3(0.95, 0.72, 0.8));
    dome = smax(dome, 0.12 - q.y, 0.1);
    vec3 hq = q - vec3(0.92, 0.3, 0.0);
    float hc = cos(P.z), hs = sin(P.z);
    hq.xz = vec2(hc*hq.x + hs*hq.z, -hs*hq.x + hc*hq.z);
    float head = sdEll(hq, vec3(0.38, 0.33, 0.42));
    float legs = 1e5;
    for (int k = 0; k < 3; k++){
      float fx = -0.45 + float(k)*0.45;
      float ph = P.y*TAU + float(k)*2.1;
      legs = min(legs, sdCap(vec3(q.x, q.y, abs(q.z)), vec3(fx, 0.2, 0.55), vec3(fx + 0.12*sin(ph), 0.02, 0.85), 0.07));
    }
    float dd = min(dome, legs)*P.x;
    if (dd < res.x) res = vec2(dd, legs < dome ? M_BUGHEAD : M_BUG);
    if (head*P.x < res.x) res = vec2(head*P.x, M_BUGHEAD);
  }
  return res;
}

vec2 mapFlies(vec3 p){
  vec2 res = vec2(1e5, M_FLY);
  for (int i = uZero; i < 8; i++){
    if (i >= uNFly) break;
    vec3 c = uFly[i].xyz;
    float d = length(p - c) - 0.22;
    if (d - 0.4 > res.x){ continue; }
    float bd = sdCap(p, c + vec3(0.0, 0.08, 0.0), c + vec3(0.0, 0.3, 0.25), 0.13);
    if (d < res.x) res = vec2(d, M_FLY);
    if (bd < res.x) res = vec2(bd, M_BUGHEAD);
  }
  return res;
}

// ---------------------------------------------------------------- титр из пластилина
float textLine(vec2 xy, int li, vec2 origin, float hWorld){
  vec4 R = uTxt[li];
  if (R.z <= 0.0) return 1e5;
  float sc = hWorld/R.w;                                   // мир на пиксель атласа
  vec2 px = (xy - origin)/sc + vec2(R.z*0.5, R.w*0.5);
  px.y = R.w - px.y;
  vec2 cl = clamp(px, vec2(0.0), R.zw);
  float outside = length(px - cl)*sc;
  float v = texture(uText, (R.xy + cl)/uTextSize).r;
  return (v - 0.5)*2.0*12.0*sc + outside;                  // 12 px — размах поля в атласе
}

float lettersSDF(vec3 p, out float pop){
  vec4 T = uMisc[2];
  int la = int(T.x), lb = int(T.y);
  float hw = uMisc[5].x;
  float d2 = 1e5;
  float wA = la >= 0 ? uTxt[la].z*hw/max(uTxt[la].w, 1.0) : 0.0;
  float wB = lb >= 0 ? uTxt[lb].z*hw/max(uTxt[lb].w, 1.0) : 0.0;
  float gap = hw*0.62;
  float yA = lb >= 0 ? gap : 0.0;
  if (la >= 0) d2 = min(d2, textLine(p.xy, la, vec2(0.0, yA), hw));
  if (lb >= 0) d2 = min(d2, textLine(p.xy, lb, vec2(0.0, -gap), hw));
  // волна «выдавливания»: буквы поднимаются слева направо
  float span = max(wA, wB);
  float u = (p.x + span*0.5)/max(span, 1.0) + (p.y < 0.0 ? 0.25 : 0.0);
  float pr = clamp((T.z*1.6 - u*0.9)*2.2, 0.0, 1.0);
  pop = pr;
  float bounce = pr < 1.0 ? pr*(1.0 + 0.5*sin(pr*PI)) : 1.0;
  float hTop = 0.13*hw*bounce + 0.001;
  float rr = min(hTop*0.5, 0.065*hw);
  vec2 w = vec2(d2 + rr, abs(p.z - hTop*0.5) - (hTop*0.5 - rr));
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - rr;
}

vec2 mapTitle(vec3 p){
  float slab = sdRBox(p - vec3(0.0, 0.0, -1.0), vec3(40.0, 26.0, 1.0), 0.8);
  slab += 0.05*(vn2(p.xy*0.9) - 0.5) + 0.02*(vn2(p.xy*3.1 + floor(uFrame)*0.37) - 0.5);
  vec2 res = vec2(slab, M_SLAB);
  float pop;
  float le = lettersSDF(p, pop);
  le += boil(p, 0.006);
  float d = smin(slab, le, 0.08);
  res = vec2(d, le < slab + 0.03 ? M_LETTER : M_SLAB);
  return res;
}

// ---------------------------------------------------------------- вся сцена
vec2 map(vec3 p){
  if (uSet == 2) return mapTitle(p);
  float gh = groundH(p.xz);
  vec2 res = vec2((p.y - gh)*0.85, M_GROUND);
  bool full = gLod < 0.5;
  if (full && p.y - gh < 8.0 && gDist*uLens.x < 14.7){
    vec2 g = mapGrass(p, gh);
    if (g.x < res.x) res = g;
    if (gDist*uLens.x < 11.0){
      vec2 pb = mapPebbles(p, gh);
      if (pb.x < res.x) res = pb;
    }
  }
  if (p.x < 22.0 && p.x > -24.0){ vec2 h = mapHome(p); if (h.x < res.x) res = h; }
  if (p.x > 36.0 && p.x < 60.0){ vec2 h = mapBerry(p); if (h.x < res.x) res = h; }
  if (p.x > 62.0 && p.x < 102.0){ vec2 h = mapSlope(p); if (h.x < res.x) res = h; }
  if (p.x > 108.0){ vec2 h = mapVenue(p); if (h.x < res.x) res = h; }
  for (int i = uZero; i < 3; i++){
    vec4 b = LB[i]; vec4 u = LU[i];
    float bd = length(p - b.xyz - u.xyz*(b.w*0.5)) - (b.w*0.56 + u.w + 1.0);
    if (bd > res.x) continue;
    float rib;
    float lf = leafSDF(p, b.xyz, u.xyz, LN[i].xyz, b.w, u.w, LN[i].w, LC[i], rib);
    if (lf < res.x) res = vec2(lf, rib < lf + 0.01 ? M_RIB : M_LEAF);
  }
  for (int i = uZero; i < 5; i++){
    if (!full) break;
    vec4 d = DZ[i];
    float bd = length(p - d.xyz - vec3(0.0, d.w*0.5, 0.0)) - (d.w*0.5 + 2.4);
    if (bd > res.x) continue;
    vec2 dz = daisy(p, d.xyz, d.w, DF[i]);
    if (dz.x < res.x) res = dz;
  }
  vec2 s = mapSnail(p, res.x);
  if (s.x < res.x) res = s;
  for (int i = uZero; i < 4; i++){
    if (i >= uNCk) break;
    vec2 c = mapCricket(p, i*30, res.x);
    if (c.x < res.x){ res = c; gCk = float(i); }
  }
  if (uNBug > 0){ vec2 b = mapBugs(p); if (b.x < res.x) res = b; }
  if (full && uNFly > 0){ vec2 f = mapFlies(p); if (f.x < res.x) res = f; }
  return res;
}

float mapD(vec3 p){ return map(p).x; }
`;
