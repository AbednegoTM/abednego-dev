#version 300 es
precision highp float;

// Contour field: lines are level sets of (slope + drifting terrain + pointer hill).
// Stacked across the height they read as a trail map, a waveform, or parallel streams.

uniform vec2 uResolution;   // canvas size in device pixels
uniform float uTime;        // seconds
uniform vec2 uPointer;      // 0..1, origin bottom-left
uniform float uHill;        // 0..1, eased pointer presence
uniform float uDpr;
uniform vec3 uLineColor;
uniform vec3 uRoadColor;

out vec4 outColor;

const float LINES = 22.0;   // contour levels across the hero height
const float ROAD = 6.0;     // the level drawn as the accent "road" (kept clear of the name)

// 2D simplex noise — Ashima Arts / Stefan Gustavson (MIT)
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amp * snoise(p);
    p = p * 2.03 + 17.17;
    amp *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);

  vec2 drift = vec2(uTime * 0.035, uTime * 0.012);
  float terrain = fbm(p * 1.1 + drift) * 3.6
    + fbm(p * 2.6 - drift * 1.7) * 0.8
    + sin(p.x * 2.1 + uTime * 0.05) * 0.6;

  vec2 pointer = vec2(uPointer.x * aspect, uPointer.y);
  vec2 toPointer = p - pointer;
  float hill = uHill * 2.8 * exp(-dot(toPointer, toPointer) / 0.05);

  // Levels count down from the top, matching the static SVG's line order.
  float f = (1.0 - uv.y) * LINES + terrain + hill;

  // Distance to the nearest level, in device pixels, for crisp 1px lines at any scale.
  float dist = abs(fract(f - 0.5) - 0.5) / max(fwidth(f), 1e-4);
  bool isRoad = floor(f + 0.5) == ROAD;

  float halfWidth = (isRoad ? 1.0 : 0.5) * uDpr;
  float alpha = clamp(halfWidth - dist + 0.5, 0.0, 1.0) * (isRoad ? 1.0 : 0.7);
  vec3 color = isRoad ? uRoadColor : uLineColor;

  outColor = vec4(color * alpha, alpha); // premultiplied
}
