/* Улитка идёт на концерт — постобработка: малая глубина резкости и «плёнка» кадра. */
const POST_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Глубина резкости в половинном разрешении: «рассеяние через сбор» по золотой спирали.
// Каждый отсчёт вносит вклад, только если его кружок нерезкости дотягивается до текущего пикселя.
const DOF_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene;
uniform vec2 uHalfRes;
uniform float uMaxCoc;
uniform int uEnc;
const float GA = 2.39996323;
vec4 fetch(vec2 uv){
  vec4 s = texture(uScene, uv);
  if (uEnc == 1){ s.rgb = s.rgb*s.rgb*4.0; s.a = s.a*2.0 - 1.0; }
  return s;
}
void main(){
  vec4 c = fetch(vUv);
  float maxR = uMaxCoc*uHalfRes.y;
  float cc = c.a*maxR;
  float cs = abs(cc);
  vec3 acc = c.rgb; float wsum = 1.0; float cov = 0.0;
  vec2 px = 1.0/uHalfRes;
  const float RS = 1.0;
  float radius = RS;
  for (int i = 0; i < 360; i++){
    if (radius >= maxR) break;
    float ang = float(i)*GA;
    vec4 s = fetch(vUv + vec2(cos(ang), sin(ang))*px*radius);
    float sc = s.a*maxR;
    float ss = abs(sc);
    if (sc > cc) ss = min(ss, cs*2.0);
    float m = smoothstep(radius - 0.6, radius + 0.6, ss);
    float lum = dot(s.rgb, vec3(0.3, 0.59, 0.11));
    float w = m*(1.0 + 2.5*smoothstep(1.2, 5.0, lum));
    acc += s.rgb*w; wsum += w; cov += m;
    radius += RS/radius;
  }
  o = vec4(acc/wsum, clamp((cov - 0.5)/5.0, 0.0, 1.0));
}`;

// Сборка: резкий кадр + размытый, тоновая кривая, цвет, виньетка, зерно, мерцание света между кадрами.
const COMP_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uScene, uDof;
uniform int uEnc;
uniform float uFrame, uExposure, uFade, uGrain, uVig, uFlicker, uSat;
uniform vec3 uTint;
uniform int uDebug;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
vec3 filmic(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x*(a*x + b))/(x*(c*x + d) + e), 0.0, 1.0);
}
void main(){
  vec4 s = texture(uScene, vUv);
  if (uDebug == 1){ o = vec4(s.rgb, 1.0); return; }
  if (uEnc == 1) s.rgb = s.rgb*s.rgb*4.0;
  vec4 d = texture(uDof, vUv);
  vec3 col = mix(s.rgb, d.rgb, d.a);
  float fl = 1.0 + uFlicker*(h21(vec2(floor(uFrame)*0.713, 3.1)) - 0.5);
  col *= uExposure*fl*uTint;
  col = filmic(col*0.8);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = max(mix(vec3(l), col, uSat), 0.0);
  col = pow(col, vec3(1.0/2.2));
  vec2 q = vUv - 0.5;
  col *= 1.0 - uVig*dot(q*vec2(1.0, 1.25), q*vec2(1.0, 1.25))*1.7;
  float g = h21(gl_FragCoord.xy + vec2(floor(uFrame)*17.13, floor(uFrame)*5.71)) - 0.5;
  col += g*uGrain*(1.0 - 0.5*l);
  col *= uFade;
  o = vec4(col, 1.0);
}`;
