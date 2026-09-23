/* Улитка идёт на концерт — сцена, часть 2: задник, освещение студии, материалы пластилина. */
const SCENE_MAIN = `
float gT;

vec3 lin(vec3 c){ return pow(c, vec3(2.2)); }

// ---------------------------------------------------------------- расписной задник (он всегда не в фокусе)
vec3 backdrop(vec3 rd){
  float y = rd.y;
  vec3 col = mix(uSkyHor, uSkyTop, pow(clamp(y, 0.0, 1.0), 0.55));
  col = mix(col, uSkyLow, smoothstep(0.02, -0.3, y));
  float az = atan(rd.x, -rd.z);
  // вата-облака в дневных сценах
  if (uAtmo.w < 0.5){
    float cl = fbm2(vec2(az*2.4, y*7.0) + vec2(3.1, 0.0));
    float cm = smoothstep(0.55, 0.78, cl)*smoothstep(0.06, 0.2, y)*smoothstep(0.65, 0.3, y);
    col = mix(col, uSkyHor*1.1 + vec3(0.1), cm*0.5);
  }
  // солнце или луна
  float sd = max(dot(rd, uSun.xyz), 0.0);
  float disk = smoothstep(uSun.w, uSun.w + 0.0005, sd);
  if (uSunCol.w > 0.5){
    vec3 mq = rd - uSun.xyz;
    disk *= 0.85 + 0.15*vn2(mq.xy*900.0);
  }
  col += uSunCol.rgb*(disk*2.5 + pow(sd, 120.0)*0.7 + pow(sd, 10.0)*0.18);
  // звёзды
  if (uAtmo.y > 0.0){
    vec3 sp = rd*160.0; vec3 ci = floor(sp); vec3 fr = fract(sp) - 0.5;
    float hs = h31(ci);
    float star = smoothstep(0.1, 0.0, length(fr))*step(0.975, hs)*smoothstep(0.03, 0.25, y);
    col += vec3(0.85, 0.92, 1.0)*star*uAtmo.y*(0.4 + 0.6*h31(ci + 3.0))*2.0;
  }
  // дальний сад: кусты у горизонта
  float p1 = 0.07 + 0.08*vn2(vec2(az*3.0, 1.3)) + 0.03*vn2(vec2(az*9.0, 4.1));
  float p2 = 0.025 + 0.05*vn2(vec2(az*5.0, 7.7)) + 0.02*vn2(vec2(az*15.0, 2.2));
  vec3 far1 = mix(uSkyHor, uSkyLow, 0.45)*vec3(0.74, 0.9, 0.74);
  vec3 far2 = mix(uSkyHor, uSkyLow, 0.7)*vec3(0.6, 0.8, 0.58);
  col = mix(col, far1, smoothstep(p1 + 0.015, p1 - 0.015, y)*0.85);
  col = mix(col, far2, smoothstep(p2 + 0.015, p2 - 0.015, y)*0.9);
  // боке: искры в листве дальнего сада
  if (uAtmo.z > 0.0){
    vec2 bp = vec2(az, y)*13.0;
    vec2 bi = floor(bp); vec2 bf = fract(bp) - 0.5;
    vec2 off = (h22(bi + 11.0) - 0.5)*0.45;
    float rad = 0.16 + 0.18*h21(bi + 5.0);
    float dd = length(bf - off);
    float bk = smoothstep(rad, rad - 0.03, dd)*(0.6 + 0.4*smoothstep(rad - 0.09, rad - 0.015, dd));
    float on = step(0.7, h21(bi + 2.0))*smoothstep(0.26, 0.05, y)*smoothstep(-0.06, 0.02, y);
    vec3 bc = mix(uSunCol.rgb*0.3 + vec3(0.25, 0.22, 0.12), vec3(0.8, 1.0, 0.42), uAtmo.w);
    col += bc*bk*on*uAtmo.z*0.7;
  }
  return col;
}

// ---------------------------------------------------------------- вспомогательное для единого цикла
// потолок сцены над рельефом: выше него ничего нет, кроме лейки (у площадки — трава и сверчки ниже −8)
float ceilY(float x){ return -16.0*smoothstep(50.0, 104.0, x) + 14.0 - 5.0*smoothstep(104.0, 110.0, x); }
const vec3 CANBOX0 = vec3(115.0, -17.0, -28.5), CANBOX1 = vec3(158.0, 18.5, -2.5);
bool boxHit(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax){
  vec3 inv = 1.0/(rd + vec3(1e-6));
  vec3 t0 = (bmin - ro)*inv, t1 = (bmax - ro)*inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), b = min(min(tf.x, tf.y), tf.z);
  return b > max(a, 0.0);
}
vec3 tetra(int i){ return 0.5773*(2.0*vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0); }

// ---------------------------------------------------------------- отпечатки пальцев и следы лепки
vec3 printGrad(vec3 p){
  const float S = 1.15;
  vec3 c = floor(p/S);
  vec3 hh = h33(c + 0.37);
  if (hh.x > 0.6) return vec3(0.0);
  vec3 ctr = (c + 0.2 + 0.6*hh)*S;
  vec3 d = p - ctr;
  vec3 da = d*vec3(1.0, 1.0 + 0.5*hh.y, 1.0 + 0.4*hh.z);
  float r = length(da);
  float mask = smoothstep(0.5, 0.12, r);
  float jit = h11(floor(uFrame)*0.37 + hh.y*9.0);
  float ph = r*96.0 + 2.4*sin(atan(da.y, da.x) + hh.z*6.0)*smoothstep(0.0, 0.3, r) + jit*1.2;
  return cos(ph)*mask*da/max(r, 1e-3);
}
vec3 lumpGrad(vec3 p){
  const float e = 0.06;
  float n0 = vn3(p);
  return vec3(vn3(p + vec3(e, 0.0, 0.0)) - n0, vn3(p + vec3(0.0, e, 0.0)) - n0, vn3(p + vec3(0.0, 0.0, e)) - n0)/e;
}

// ---------------------------------------------------------------- материалы
float posterInk(vec2 uv){
  float d = 1e5;
  d = min(d, textLine(uv, 8, vec2(0.0, 1.75), 1.25));
  d = min(d, textLine(uv, 9, vec2(0.0, 0.62), 1.05));
  d = min(d, textLine(uv, 10, vec2(0.0, -0.55), 0.62));
  d = min(d, textLine(uv, 11, vec2(0.0, -1.2), 0.62));
  // нотки
  vec2 q = uv - vec2(-0.55, -2.2);
  float notes = min(length((q - vec2(0.0, 0.0))*vec2(1.0, 1.5)) - 0.17, length((q - vec2(0.75, 0.15))*vec2(1.0, 1.5)) - 0.17);
  notes = min(notes, max(abs(q.x - 0.15) - 0.03, abs(q.y - 0.35) - 0.36));
  notes = min(notes, max(abs(q.x - 0.9) - 0.03, abs(q.y - 0.5) - 0.36));
  notes = min(notes, max(abs(q.y - 0.8 - (q.x - 0.15)*0.2) - 0.06, abs(q.x - 0.52) - 0.4));
  d = min(d, notes);
  return smoothstep(0.018, -0.018, d);
}

int nearestFly(vec3 p){
  int k = 0; float best = 1e9;
  for (int i = 0; i < 8; i++){ if (i >= uNFly) break; float d = dot2(p - uFly[i].xyz); if (d < best){ best = d; k = i; } }
  return k;
}

vec3 matColor(float m, vec3 p, inout vec3 n, out float spec, out float trans, out vec3 emis, out float bump, out vec3 pl, out float eyeLit){
  spec = 0.08; trans = 0.0; emis = vec3(0.0); bump = 1.0; pl = p; eyeLit = 0.0;
  vec3 c = vec3(0.5);
  if (m == M_GROUND){
    float mm = fbm2(p.xz*0.28);
    vec3 soil = lin(vec3(0.43, 0.3, 0.2)), moss = lin(vec3(0.3, 0.53, 0.17)), moss2 = lin(vec3(0.47, 0.66, 0.2));
    c = mix(soil, mix(moss, moss2, vn2(p.xz*1.1)), smoothstep(0.36, 0.6, mm));
    c *= 0.82 + 0.34*vn2(p.xz*7.0);
    float pm = pathMask(p.x);
    vec3 sand = lin(vec3(0.86, 0.73, 0.52))*(0.88 + 0.22*vn2(p.xz*3.3));
    c = mix(c, sand, pm);
    c = mix(c, c*vec3(0.78, 0.84, 0.8), smoothstep(100.0, 116.0, p.x)*0.6);
    bump = 0.35;
  } else if (m == M_GRASS){
    float hy = p.y - groundH(p.xz);
    float v = h21(floor(p.xz/3.2) + 1.3);
    vec3 base = lin(mix(vec3(0.16, 0.4, 0.1), vec3(0.24, 0.47, 0.08), v));
    vec3 tip = lin(mix(vec3(0.5, 0.78, 0.2), vec3(0.68, 0.8, 0.24), v));
    c = mix(base, tip, smoothstep(0.0, 6.0, hy));
    trans = 0.7; spec = 0.1;
  } else if (m == M_LEAF){
    c = lin(vec3(0.22, 0.52, 0.15))*(0.88 + 0.24*vn2(p.xz*1.7 + p.y));
    trans = 1.0; spec = 0.14; bump = 0.6;
  } else if (m == M_RIB || m == M_STEM){
    c = lin(vec3(0.44, 0.68, 0.26)); trans = 0.6; spec = 0.12;
  } else if (m == M_BODY){
    c = lin(vec3(0.94, 0.79, 0.6))*(0.94 + 0.12*vn3(p*2.0));
    pl = p - uSn[1].xyz;
    // рот изнутри
    vec3 F = uSn[16].xyz, U = uSn[17].xyz, S = cross(F, U);
    vec3 mq = p - uSn[15].xyz;
    vec3 lq = vec3(dot(mq, S), dot(mq, U), dot(mq, F));
    lq.y -= uSn[16].w*lq.x*lq.x;
    float mouth = sdEll(lq, vec3(uSn[17].w, 0.035 + uSn[15].w*0.22, 0.3));
    c = mix(lin(vec3(0.42, 0.1, 0.16)), c, smoothstep(-0.02, 0.05, mouth));
    // подошва темнее
    c *= 0.8 + 0.2*smoothstep(uSn[22].w, uSn[22].w + 0.35, dot(p, uSn[22].xyz));
    trans = 0.35; spec = 0.16;
  } else if (m == M_SHELL){
    mat3 M = mat3(uSn[18].xyz, uSn[19].xyz, uSn[20].xyz);
    vec3 sq = transpose(M)*(p - uSn[21].xyz);
    vec3 info;
    shellSDF(sq, info);
    float st = sin(2.0*info.y + info.x*TAU*2.2);
    c = mix(lin(vec3(0.8, 0.1, 0.3)), lin(vec3(1.0, 0.76, 0.2)), smoothstep(-0.25, 0.25, st));
    c *= 0.9 + 0.1*smoothstep(0.0, 0.08, info.z);
    pl = sq*1.3;
    spec = 0.2;
    float glow = uSn[21].w;
    if (glow > 0.0) emis = lin(vec3(1.0, 0.62, 0.25))*glow*(0.35 + 1.6*(1.0 - smoothstep(0.0, 0.1, info.z)))*(0.7 + 0.3*st);
  } else if (m == M_EYE || m == M_CKEYE){
    vec3 ec; vec3 pd; float pc;
    if (m == M_EYE){
      ec = gEye < 0.5 ? uSn[5].xyz : uSn[6].xyz;
      pd = gEye < 0.5 ? uSn[11].xyz : uSn[12].xyz;
      pc = uSn[11].w;
    } else {
      int b = int(gCk + 0.5)*30;
      ec = gEye < 0.5 ? uCk[b + 3].xyz : uCk[b + 4].xyz;
      pd = uCk[b + 5].xyz; pc = uCk[b + 5].w;
    }
    vec3 en = normalize(p - ec);
    float k = dot(en, normalize(pd));
    c = mix(lin(vec3(0.96, 0.95, 0.9)), lin(vec3(0.05, 0.04, 0.05)), smoothstep(pc - 0.02, pc + 0.02, k));
    spec = 1.2; bump = 0.0; eyeLit = 1.0;
  } else if (m == M_CKBODY){
    int b = int(gCk + 0.5)*30;
    vec3 Fw = uCk[b + 28].xyz;
    c = lin(vec3(0.46, 0.31, 0.18));
    c = mix(c, lin(vec3(0.74, 0.57, 0.34)), smoothstep(0.35, 0.8, dot(n, Fw))*0.8);
    pl = p - uCk[b].xyz;
    spec = 0.14; trans = 0.2;
  } else if (m == M_CKDARK){
    c = lin(vec3(0.17, 0.13, 0.11)); spec = 0.25;
    int b = int(gCk + 0.5)*30; pl = p - uCk[b].xyz;
  } else if (m == M_WOOD){
    c = lin(vec3(0.76, 0.42, 0.15))*(0.85 + 0.2*vn3(p*vec3(3.0, 14.0, 3.0))); spec = 0.5; bump = 0.3;
  } else if (m == M_BOW){
    c = lin(vec3(0.32, 0.17, 0.08)); spec = 0.3;
  } else if (m == M_TIE){
    c = lin(vec3(0.86, 0.1, 0.34)); spec = 0.18;
  } else if (m == M_BERRY){
    c = lin(vec3(0.86, 0.12, 0.3))*(0.8 + 0.35*vn3(p*5.0));
    trans = 0.55; spec = 0.45;
  } else if (m == M_PEBBLE){
    c = lin(vec3(0.74, 0.69, 0.6))*(0.75 + 0.35*h31(floor(p*1.2)))*(0.9 + 0.2*vn3(p*4.0));
    spec = 0.1;
  } else if (m == M_MUSHCAP){
    vec3 cp = p*1.25; vec3 cf = fract(cp) - 0.5; float hs = h31(floor(cp));
    c = lin(vec3(0.84, 0.13, 0.1));
    c = mix(c, lin(vec3(0.96, 0.92, 0.8)), smoothstep(0.24, 0.2, length(cf))*step(0.45, hs)*step(0.0, n.y + 0.2));
    spec = 0.3;
  } else if (m == M_MUSHSTEM){
    c = lin(vec3(0.95, 0.9, 0.78)); trans = 0.3;
  } else if (m == M_CAN){
    vec3 q = p - CAN_P;
    c = lin(vec3(0.42, 0.66, 0.56));
    float rust = smoothstep(0.58, 0.72, fbm2(vec2(atan(q.z, q.x)*4.0, q.y*0.3) + 2.0));
    c = mix(c, lin(vec3(0.55, 0.28, 0.12))*(0.8 + 0.4*vn3(p*3.0)), rust);
    c *= 0.75 + 0.25*smoothstep(0.0, 6.0, q.y);
    spec = 0.5*(1.0 - rust); bump = 0.4;
  } else if (m == M_CAP){
    vec3 q = p - CAP_P;
    c = lin(vec3(0.84, 0.12, 0.33));
    if (n.y > 0.7){
      float r = length(q.xz);
      c = mix(lin(vec3(1.0, 0.77, 0.2)), c, smoothstep(3.0, 3.1, r));
      c = mix(c, lin(vec3(0.93, 0.9, 0.84)), smoothstep(3.6, 3.7, r));
    }
    spec = 0.6; bump = 0.25;
  } else if (m == M_PAPER){
    vec2 puv; posterSDF(p, puv);
    c = lin(vec3(0.96, 0.91, 0.8))*(0.94 + 0.06*vn2(puv*6.0));
    float border = max(abs(puv.x) - 2.02, abs(puv.y) - 2.72);
    c = mix(c, lin(vec3(0.82, 0.12, 0.32)), smoothstep(-0.02, 0.02, border)*step(border, 0.14));
    c = mix(c, lin(vec3(0.12, 0.11, 0.16)), posterInk(puv)*0.92);
    trans = 0.5; spec = 0.05; bump = 0.15;
  } else if (m == M_TWIG){
    c = lin(vec3(0.46, 0.31, 0.19))*(0.85 + 0.2*vn3(p*vec3(6.0, 1.0, 6.0))); spec = 0.1;
  } else if (m == M_FLY){
    int k = nearestFly(p);
    c = lin(vec3(0.9, 0.95, 0.5));
    emis = vec3(0.85, 1.0, 0.4)*uFly[k].w*4.0;
    bump = 0.0;
  } else if (m == M_BUG){
    c = lin(vec3(0.86, 0.1, 0.09));
    vec3 cs = floor(p*2.4); vec3 cf = fract(p*2.4) - 0.5;
    c = mix(c, lin(vec3(0.06)), smoothstep(0.26, 0.2, length(cf))*step(0.5, h31(cs)));
    spec = 0.7; bump = 0.2;
  } else if (m == M_BUGHEAD){
    c = lin(vec3(0.07, 0.06, 0.07)); spec = 0.5;
  } else if (m == M_SLAB){
    float ci = uMisc[2].w;
    c = ci < 0.5 ? lin(vec3(0.26, 0.5, 0.2)) : ci < 1.5 ? lin(vec3(0.7, 0.12, 0.3)) : ci < 2.5 ? lin(vec3(0.95, 0.66, 0.16)) : lin(vec3(0.12, 0.2, 0.3));
    c *= 0.94 + 0.1*vn2(p.xy*1.3);
    bump = 1.2;
  } else if (m == M_LETTER){
    c = lin(vec3(0.97, 0.92, 0.8)); bump = 1.0; spec = 0.14;
  } else if (m == M_PETAL){
    c = lin(vec3(0.96, 0.95, 0.9)); trans = 0.7; spec = 0.1;
  } else if (m == M_DAISY){
    c = lin(vec3(0.98, 0.7, 0.12)); spec = 0.1;
  }
  return c;
}

vec3 flyGlow(vec3 ro, vec3 rd, float tHit){
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++){
    if (i >= uNFly) break;
    vec4 f = uFly[i];
    vec3 oc = f.xyz - ro; float tc = dot(oc, rd);
    if (tc < 0.0 || tc > tHit + 0.6) continue;
    float d2 = dot2(oc - rd*tc);
    acc += f.w*vec3(0.85, 1.0, 0.4)*(0.012/(d2 + 0.012) + 0.5*exp(-d2*3.0));
  }
  return acc;
}

vec3 shade(vec3 p, vec3 n, vec3 rd, float m, float t, float occ, float sha){
  float spec, trans, bump, eyeLit; vec3 emis, pl;
  vec3 alb = matColor(m, p, n, spec, trans, emis, bump, pl, eyeLit);
  float fp = t*2.0*uLens.x/uRes.y;
  if (bump > 0.0){
    vec3 g = printGrad(pl)*smoothstep(0.016, 0.006, fp);
    g += lumpGrad(pl*2.2)*0.035;
    g -= n*dot(g, n);
    n = normalize(n - bump*0.11*g);
  }
  vec3 L = uKeyDir;
  float ndl = dot(n, L);
  // трава не отбрасывает настоящих теней (тени считаются по упрощённой сцене) — пятнистая тень на земле
  if (m == M_GROUND) sha *= 1.0 - 0.4*grassDens(p.xz)*smoothstep(0.42, 0.68, vn2(p.xz*0.8 + L.xz*2.0));
  if (m == M_GRASS) sha *= mix(0.5, 1.0, smoothstep(0.5, 5.0, p.y - groundH(p.xz)));
  float wrap = clamp((ndl + 0.35)/1.35, 0.0, 1.0);
  vec3 col = alb*uKeyCol*wrap*wrap*sha;
  float hemi = 0.5 + 0.5*n.y;
  col += alb*mix(uGndAmb, uSkyAmb, hemi)*occ;
  float fill = clamp(dot(n, -rd), 0.0, 1.0);
  col += alb*uSkyAmb*0.3*fill*occ;
  // контровой свет студии обрисовывает фигурки; земля под скользящим углом его почти не ловит,
  // иначе вся поляна покрывается сизым налётом
  float fr = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
  float rimK = (m == M_GROUND || m == M_PEBBLE) ? 0.12 : m == M_GRASS ? 0.5 : 1.0;
  col += uRimCol*rimK*fr*clamp(dot(n, uRimDir)*0.7 + 0.45, 0.0, 1.0)*occ*(0.35 + 0.65*sha);
  float back = pow(clamp(dot(rd, L), 0.0, 1.0), 2.0);
  col += alb*uKeyCol*trans*back*(0.3 + 0.7*sha)*0.9;
  vec3 hv = normalize(L - rd);
  col += uKeyCol*pow(clamp(dot(n, hv), 0.0, 1.0), eyeLit > 0.5 ? 90.0 : 26.0)*spec*sha*0.35;
  if (eyeLit > 0.5){
    vec3 cl = normalize(normalize(L + vec3(0.0, 0.6, 0.0)) - rd);
    col += vec3(1.0)*smoothstep(0.965, 0.985, dot(n, cl))*0.9;
  }
  for (int i = 0; i < 8; i++){
    if (i >= uNFly) break;
    vec3 lv = uFly[i].xyz - p; float d2 = dot(lv, lv);
    col += alb*vec3(1.0, 0.88, 0.42)*uFly[i].w*clamp(dot(n, lv*inversesqrt(d2))*0.75 + 0.25, 0.0, 1.0)*2.5/(1.0 + d2*0.45);
  }
  float glow = uSn[21].w;
  if (glow > 0.0 && m != M_SHELL){
    vec3 lv = uSn[21].xyz - p; float d2 = dot(lv, lv);
    col += alb*vec3(1.0, 0.66, 0.3)*glow*clamp(dot(n, lv*inversesqrt(d2))*0.7 + 0.3, 0.0, 1.0)*5.0/(1.0 + d2*0.35);
  }
  return col + emis;
}

// ---------------------------------------------------------------- кадр
// Один цикл и один вызов map(): фаза 0 — шаги луча, 1 — нормаль, 2 — затенение углов (AO), 3 — мягкая тень.
// Так шейдер компилируется в разы быстрее: тяжёлая функция сцены встраивается один раз.
void main(){
  vec2 uv = (2.0*gl_FragCoord.xy - uRes)/uRes.y;
  vec3 rd = normalize(uCamRot*vec3(uv*uLens.x, 1.0));
  vec3 ro = uCamPos;
  gCk = 0.0; gEye = 0.0; gDist = 0.0; gDir = vec3(0.0); gLod = 0.0;
  float tmax = uSet == 2 ? 200.0 : 270.0;
  int phase = 0;
  if (uSet != 2 && rd.y > 0.0){
    float tt = (19.0 - ro.y)/rd.y;
    if (tt < 0.0) phase = 9; else tmax = min(tmax, tt);
  }
  vec3 L = uKeyDir;
  bool canRay = boxHit(ro, rd, CANBOX0, CANBOX1);
  // луч поднимается быстрее рельефа (склон к дому круче 0.45 нигде не бывает); у титров неба нет
  bool upOk = uSet != 2 && rd.y > 0.0 && (rd.x >= 0.0 || rd.y > 0.45*abs(rd.x));
  bool lUp = uSet != 2 && uKeyDir.y > 0.0 && (uKeyDir.x >= 0.0 || uKeyDir.y > 0.45*abs(uKeyDir.x));
  float t = 0.05, mat = 0.0, lastMat = 0.0, eps = 0.001;
  float hitCk = 0.0, hitEye = 0.0;
  vec3 hp = vec3(0.0), nrm = vec3(0.0);
  float occ = 0.0, sca = 1.0, sh = 1.0, st = 0.05;
  float omega = 1.5, prevH = 0.0, prevStep = 0.0;   // шаг с запасом и откатом (enhanced sphere tracing)
  bool hit = false;
  int k = 0, steps = 0, shSteps = 0;
  for (int i = uZero; i < 175; i++){
    if (phase > 3) break;
    vec3 q;
    if (phase == 0) q = ro + rd*t;
    else if (phase == 1) q = hp + eps*tetra(k);
    else if (phase == 2) q = hp + nrm*(0.05 + 0.3*float(k));
    else q = hp + nrm*0.03 + L*st;
    gLimit = 1e5; gDist = t;
    gDir = phase == 0 ? rd : vec3(0.0);
    gLod = phase == 3 ? 1.0 : 0.0;
    vec2 h = map(q);
    if (phase == 0){
      steps++;
      // луч выше всего, что есть в этой части сада, лейка уже не впереди — дальше только небо
      if (upOk && q.y > ceilY(q.x) && (!canRay || !boxHit(q, rd, CANBOX0, CANBOX1))){ phase = 9; continue; }
      float hs = min(h.x, gLimit);
      if (omega > 1.0 && prevH + hs < prevStep){
        // шаг с запасом перелетел или провалился внутрь тела: сферы не пересекаются —
        // возвращаемся и дальше шагаем осторожно (проверка раньше сходимости, иначе «попадание» внутри формы)
        t -= prevStep - prevStep/omega; omega = 1.0; prevH = 0.0; prevStep = 0.0;
      } else {
        bool conv = h.x < 0.0004*t + 0.0012;
        if (conv || steps >= 130){
          // шаги кончились вдали от любой поверхности — это не попадание, а небо
          if (!conv && h.x > 0.02*t + 0.1){ phase = 9; continue; }
          hit = true; mat = conv ? h.y : lastMat; hp = q; hitCk = gCk; hitEye = gEye;
          eps = 0.0005*t + 0.0012; phase = 1; k = 0;
        } else {
          lastMat = h.y;
          float stp = hs*((h.x > 0.3 && gLimit >= h.x) ? omega : 1.0);
          prevH = hs; prevStep = stp;
          t += stp;
          if (t > tmax) phase = 9;
        }
      }
    } else if (phase == 1){
      nrm += tetra(k)*h.x; k++;
      if (k == 4){ nrm = normalize(nrm); phase = 2; k = 0; }
    } else if (phase == 2){
      occ += (0.05 + 0.3*float(k) - h.x)*sca; sca *= 0.75; k++;
      if (k == 3){ k = 0; if (dot(nrm, L) > -0.35 && t < 140.0) phase = 3; else { sh = t < 140.0 ? 0.0 : 1.0; phase = 9; } }
    } else {
      sh = min(sh, 9.0*h.x/st);
      st += clamp(h.x, 0.06, 3.0); k++; shSteps++;
      if (sh < 0.004 || st > 32.0 || k >= 34 || q.y > 19.0) phase = 9;
      else if (lUp && q.y > ceilY(q.x) && !boxHit(q, L, CANBOX0, CANBOX1)) phase = 9;
    }
  }
  vec3 col; float z;
  if (!hit){
    col = backdrop(rd);
    z = 1e4;
  } else {
    occ = clamp(1.0 - 1.15*occ, 0.0, 1.0);
    sh = clamp(sh, 0.0, 1.0); sh = sh*sh*(3.0 - 2.0*sh);
    gCk = hitCk; gEye = hitEye; gLod = 0.0; gDir = vec3(0.0);
    col = shade(hp, nrm, rd, mat, t, occ, sh);
    float fogK = 1.0 - exp(-uAtmo.x*max(t - 25.0, 0.0));
    col = mix(col, backdrop(rd), fogK);
    z = t*dot(rd, uCamRot[2]);
  }
  if (uNFly > 0) col += flyGlow(ro, rd, hit ? t : 1e4);
  if (uDebug == 1){ fragColor = vec4(float(steps)/130.0, float(shSteps)/34.0, hit ? 0.3 : 0.0, 0.0); return; }
  float coc = uLens.z*(z - uLens.y)/max(z, 1e-3);
  coc = clamp(coc/uLens.w, -1.0, 1.0);
  if (uEnc == 1) fragColor = vec4(sqrt(clamp(col*0.25, 0.0, 1.0)), coc*0.5 + 0.5);
  else fragColor = vec4(min(col, vec3(60.0)), coc);
}
`;
