// Attention heatmap. Hits from the sample rays add (time x weight) to 0.2 m cells.
// The strongest cells are sent to a shader that paints a soft glow on every tagged surface.
import * as THREE from 'three';

const MAXP = 96;
const cells = new Map();
let dirty = false;

const U = {
  uPts: { value: Array.from({ length: MAXP }, () => new THREE.Vector4(0, -99, 0, 0)) },
  uCount: { value: 0 }, uMax: { value: 1 }, uSigma: { value: 0.36 }
};

export const heatMat = new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: `#define MAXP ${MAXP}
    uniform vec4 uPts[MAXP]; uniform int uCount; uniform float uMax; uniform float uSigma; varying vec3 vW;
    vec3 ramp(float t){ vec3 a=vec3(0.21,0.32,0.79), b=vec3(0.15,0.75,0.85), c=vec3(0.98,0.85,0.25), d=vec3(0.92,0.25,0.15);
      if (t < 0.33) return mix(a,b,t/0.33); if (t < 0.66) return mix(b,c,(t-0.33)/0.33); return mix(c,d,(t-0.66)/0.34); }
    void main(){ float h = 0.0; float k = 1.0 / (2.0 * uSigma * uSigma);
      for (int i = 0; i < MAXP; i++) { if (i >= uCount) break; vec3 d = vW - uPts[i].xyz; h += uPts[i].w * exp(-dot(d,d) * k); }
      float t = clamp(h / uMax, 0.0, 1.0); if (t < 0.04) discard;
      gl_FragColor = vec4(ramp(t), smoothstep(0.04, 0.35, t) * 0.8); }`
});

// Rays: the centre counts fully; rings at about 3, 7 and 12 degrees count 0.7, 0.35 and 0.12.
// NDC radius = tan(angle) / tan(half vertical FOV of 36 degrees).
export const SAMPLES = [[0, 0, 1]];
[[0.072, 8, 0.7], [0.169, 12, 0.35], [0.292, 16, 0.12]].forEach(([r, n, w], k) => {
  for (let i = 0; i < n; i++) { const a = (i + k * 0.5) * Math.PI * 2 / n; SAMPLES.push([r * Math.cos(a), r * Math.sin(a), w]); }
});
export const WSUM = SAMPLES.reduce((a, s) => a + s[2], 0);

export function attachOverlays(targets) {
  targets.forEach(m => { const o = new THREE.Mesh(m.geometry, heatMat); o.renderOrder = 3; m.add(o); });
}

export function deposit(p, w, tag) {
  const key = Math.round(p.x / 0.2) + ',' + Math.round(p.y / 0.2) + ',' + Math.round(p.z / 0.2);
  let c = cells.get(key);
  if (!c) { c = { x: p.x, y: p.y, z: p.z, w: 0, tag }; cells.set(key, c); }
  const nw = c.w + w;
  c.x = (c.x * c.w + p.x * w) / nw; c.y = (c.y * c.w + p.y * w) / nw; c.z = (c.z * c.w + p.z * w) / nw; c.w = nw;
  dirty = true;
}
export function topCells(n) { return [...cells.values()].sort((a, b) => b.w - a.w).slice(0, n); }
export function clearHeat() { cells.clear(); dirty = true; }
export function pushHeat() {
  if (!dirty) return; dirty = false;
  const top = topCells(MAXP);
  top.forEach((c, i) => U.uPts.value[i].set(c.x, c.y, c.z, c.w));
  U.uCount.value = top.length;
  U.uMax.value = Math.max(2.5, (top[0] ? top[0].w : 0) * 2.2);
}
export function setHeatVisible(v) { heatMat.visible = v; }

// Every recorded cell, for the report's 2D visualisations.
export function allCells() { return [...cells.values()]; }
