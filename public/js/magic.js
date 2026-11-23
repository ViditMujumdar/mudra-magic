/* Mudra Magic: the visual engine (three.js). World units = CSS pixels, origin at screen centre, +y up. */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BONES } from './mudras.js';

const TAU = Math.PI * 2;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const col = (hex) => new THREE.Color(hex);

/* =================================================================== */
const pointVert = /* glsl */`
  attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
  uniform float uDpr; uniform float uCamZ; varying vec3 vColor; varying float vAlpha;
  void main() {
    vColor = aColor; vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uDpr * uCamZ / -mv.z;
  }`;
const pointFrag = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5 || vAlpha <= 0.001) discard;
    float core = smoothstep(0.5, 0.0, d);
    float hot = smoothstep(0.18, 0.0, d);
    gl_FragColor = vec4((vColor * core + vec3(hot) * 0.55) * vAlpha, 1.0);
  }`;

/** A fixed-capacity point layer with CPU-side attributes. */
class Layer {
  constructor(n, dprU) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.color = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mesh = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uDpr: dprU, uCamZ: CAMZ }, vertexShader: pointVert, fragmentShader: pointFrag,
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    }));
    this.mesh.frustumCulled = false;
  }
  flush(count = this.n) {
    const a = this.geo.attributes;
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) { a[k].needsUpdate = true; a[k].clearUpdateRanges?.(); }
    this.geo.setDrawRange(0, count);
  }
}

const CAMZ = { value: 900 };

/* =================================================================== */
export function createMagic(container, { video }) {
  const DBG = new URLSearchParams(location.search).get('dbg') || '';
  const isPhone = Math.min(innerWidth, innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const DPR = Math.min(devicePixelRatio || 1, isPhone ? 1.5 : 2);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05030c);
  const camera = new THREE.PerspectiveCamera(50, 1, 10, 10000);
  const dprU = { value: DPR };
  let W = 1, H = 1;

  /* ---------- background: camera duotone, or a living mandala ---------- */
  const bgU = {
    uTime: { value: 0 }, uVideo: { value: null }, uHasVideo: { value: 0 }, uMode: { value: 0 },
    uCover: { value: new THREE.Vector4(1, 1, 0, 0) }, uFlash: { value: new THREE.Vector3() }, uAspect: { value: 1 },
    uHands: { value: [new THREE.Vector3(-9e3, 0, 0), new THREE.Vector3(-9e3, 0, 0)] },
  };
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: bgU, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime, uHasVideo, uMode, uAspect; uniform sampler2D uVideo; uniform vec4 uCover; uniform vec3 uFlash; uniform vec3 uHands[2];
      varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      vec3 mandala(vec2 uv) {
        vec2 p = (uv - 0.5) * vec2(uAspect, 1.0) * 2.0;
        float r = length(p), a = atan(p.y, p.x);
        float rot = uTime * 0.05;
        float petals = abs(cos((a + rot) * 8.0)) * 0.5 + 0.5;
        float ringsA = 1.0 - smoothstep(0.0, 0.025, abs(fract(r * 3.0 - uTime * 0.05) - 0.5));
        float petalLine = smoothstep(0.015, 0.0, abs(r - (0.55 + 0.12 * petals)));
        float petalLine2 = smoothstep(0.012, 0.0, abs(r - (0.95 + 0.1 * abs(cos((a - rot) * 12.0)))));
        float spokes = (1.0 - smoothstep(0.0, 0.01, abs(sin((a + rot * 0.5) * 16.0)) * r)) * smoothstep(1.4, 0.3, r);
        vec3 gold = vec3(1.0, 0.62, 0.18), indigo = vec3(0.010, 0.005, 0.030);
        vec3 c = indigo * (1.2 - r * 0.4);
        c += gold * (ringsA * 0.012 + petalLine * 0.09 + petalLine2 * 0.06 + spokes * 0.03) * smoothstep(1.6, 0.2, r);
        c += vec3(0.35, 0.06, 0.45) * 0.05 * smoothstep(1.2, 0.0, r);
        float st = step(0.9975, hash(floor(uv * vec2(uAspect, 1.0) * 260.0)));
        c += st * (0.25 + 0.25 * sin(uTime * 2.0 + hash(uv) * 40.0));
        return c;
      }
      void main() {
        vec3 c;
        if (uHasVideo > 0.5) {
          vec2 uv = vec2(1.0 - vUv.x, vUv.y) * uCover.xy + uCover.zw;
          vec3 v = texture2D(uVideo, uv).rgb;
          float l = dot(v, vec3(0.299, 0.587, 0.114));
          vec3 duo = mix(vec3(0.008, 0.003, 0.03), vec3(0.16, 0.04, 0.24), smoothstep(0.03, 0.45, l));
          duo = mix(duo, vec3(0.75, 0.42, 0.12), smoothstep(0.4, 0.95, l));
          c = mix(duo * 0.75, v * 0.35, uMode);
          // faint mandala overlay
          c += mandala(vUv) * 0.35;
        } else {
          c = mandala(vUv);
        }
        // glow around hands
        for (int i = 0; i < 2; i++) {
          vec2 hp = uHands[i].xy; float s = uHands[i].z;
          if (s <= 0.0) continue;
          float d = length((vUv - hp) * vec2(uAspect, 1.0));
          c += vec3(1.0, 0.5, 0.15) * 0.06 * (1.0 - smoothstep(0.0, s * 1.6, d));
        }
        c += uFlash;
        vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.9;
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  bg.frustumCulled = false; bg.renderOrder = -10;
  if (!DBG.includes('nobg')) scene.add(bg);
  if (video) {
    const vt = new THREE.VideoTexture(video); vt.colorSpace = THREE.SRGBColorSpace;
    vt.minFilter = THREE.LinearFilter; vt.magFilter = THREE.LinearFilter;
    bgU.uVideo.value = vt;
  }

  /* ---------- layers ---------- */
  const POOL = isPhone ? 11000 : 18000;
  const fx = new Layer(POOL, dprU); scene.add(fx.mesh);
  const P = { vel: new Float32Array(POOL * 3), life: new Float32Array(POOL), max: new Float32Array(POOL), drag: new Float32Array(POOL), grav: new Float32Array(POOL), turb: new Float32Array(POOL), kind: new Uint8Array(POOL), size0: new Float32Array(POOL), shrink: new Float32Array(POOL), base: new Float32Array(POOL * 3), count: 0 };
  const FIRE = 1, NORMAL = 0, SPARK = 2;
  function emit(x, y, z, vx, vy, vz, c, size, life, o = {}) {
    let i = P.count;
    if (i >= POOL) { i = Math.floor(Math.random() * POOL); } else P.count++;
    fx.pos[i * 3] = x; fx.pos[i * 3 + 1] = y; fx.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    P.base[i * 3] = c.r; P.base[i * 3 + 1] = c.g; P.base[i * 3 + 2] = c.b;
    fx.color[i * 3] = c.r; fx.color[i * 3 + 1] = c.g; fx.color[i * 3 + 2] = c.b;
    P.size0[i] = size; fx.size[i] = size; P.life[i] = life; P.max[i] = life;
    P.drag[i] = o.drag ?? 0.9; P.grav[i] = o.grav ?? 0; P.turb[i] = o.turb ?? 0; P.kind[i] = o.kind ?? NORMAL; P.shrink[i] = o.shrink ?? 1;
    fx.alpha[i] = 1;
  }
  const FIRECOL = [col('#fff3b0').multiplyScalar(0.55), col('#ffc23a').multiplyScalar(0.5), col('#ff7a14').multiplyScalar(0.45), col('#e0300a').multiplyScalar(0.38), col('#5a0d05').multiplyScalar(0.3), col('#120403').multiplyScalar(0.2)];
  function updatePool(dt, t) {
    let n = P.count;
    for (let i = 0; i < n; i++) {
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        // swap-remove with last
        const j = --n;
        if (i !== j) {
          for (let k = 0; k < 3; k++) { fx.pos[i * 3 + k] = fx.pos[j * 3 + k]; P.vel[i * 3 + k] = P.vel[j * 3 + k]; P.base[i * 3 + k] = P.base[j * 3 + k]; fx.color[i * 3 + k] = fx.color[j * 3 + k]; }
          P.life[i] = P.life[j]; P.max[i] = P.max[j]; P.drag[i] = P.drag[j]; P.grav[i] = P.grav[j]; P.turb[i] = P.turb[j]; P.kind[i] = P.kind[j]; P.size0[i] = P.size0[j]; P.shrink[i] = P.shrink[j]; fx.size[i] = fx.size[j]; fx.alpha[i] = fx.alpha[j];
          i--;
        }
        continue;
      }
      const i3 = i * 3;
      const age = 1 - P.life[i] / P.max[i];
      const dr = Math.pow(P.drag[i], dt * 60);
      if (P.turb[i]) {
        const px = fx.pos[i3], py = fx.pos[i3 + 1];
        P.vel[i3] += Math.sin(py * 0.021 + t * 3.1 + i) * P.turb[i] * dt;
        P.vel[i3 + 1] += Math.cos(px * 0.019 - t * 2.7) * P.turb[i] * 0.4 * dt;
      }
      P.vel[i3] *= dr; P.vel[i3 + 1] = P.vel[i3 + 1] * dr + P.grav[i] * dt; P.vel[i3 + 2] *= dr;
      fx.pos[i3] += P.vel[i3] * dt; fx.pos[i3 + 1] += P.vel[i3 + 1] * dt; fx.pos[i3 + 2] += P.vel[i3 + 2] * dt;
      if (P.kind[i] === FIRE) {
        const f = Math.min(4.999, age * 5), k = Math.floor(f), u = f - k, a = FIRECOL[k], b = FIRECOL[k + 1];
        fx.color[i3] = lerp(a.r, b.r, u); fx.color[i3 + 1] = lerp(a.g, b.g, u); fx.color[i3 + 2] = lerp(a.b, b.b, u);
        fx.size[i] = P.size0[i] * (1 + age * 1.4);
        fx.alpha[i] = (age < 0.1 ? age * 10 : 1) * (1 - age);
      } else {
        fx.size[i] = P.size0[i] * lerp(1, P.shrink[i], age);
        fx.alpha[i] = (age < 0.06 ? age / 0.06 : 1) * Math.pow(1 - age, 1.4);
        if (P.kind[i] === SPARK) fx.alpha[i] *= 0.6 + 0.4 * Math.sin(t * 30 + i);
      }
    }
    P.count = n;
    fx.flush(n);
  }

  /* ---------- ambient dust that swirls around your hands ---------- */
  const DN = isPhone ? 700 : 1200;
  const dust = new Layer(DN, dprU); if (!DBG.includes('nodust')) scene.add(dust.mesh);
  const dv = new Float32Array(DN * 3), dc = [col('#ffd27a'), col('#ff9bd2'), col('#9be7ff'), col('#ffffff')];
  function resetDust(i, anywhere) {
    dust.pos[i * 3] = rand(-W / 2, W / 2); dust.pos[i * 3 + 1] = anywhere ? rand(-H / 2, H / 2) : -H / 2 - 10; dust.pos[i * 3 + 2] = rand(-80, 80);
    dv[i * 3] = rand(-8, 8); dv[i * 3 + 1] = rand(6, 26); dv[i * 3 + 2] = 0;
    const c = dc[i % 4]; dust.color[i * 3] = c.r * 0.7; dust.color[i * 3 + 1] = c.g * 0.7; dust.color[i * 3 + 2] = c.b * 0.7;
    dust.size[i] = rand(2, 5.5); dust.alpha[i] = rand(0.25, 0.8);
  }

  /* ---------- hand skeleton ---------- */
  const SEG = 4;
  const SK = 2 * (21 + BONES.length * SEG);
  const skel = new Layer(SK, dprU); scene.add(skel.mesh);
  const skelCol = col('#ffd98a');

  /* ---------- shapes (lotus, peacock): points attached to a hand ---------- */
  const SHAPE_CAP = isPhone ? 5200 : 7000;
  const shapes = new Layer(SHAPE_CAP, dprU); scene.add(shapes.mesh);
  const active = []; // { kind, hand, open, t, data: { closed, open, color, size, delay }, n, offset }
  function buildLotus() {
    const pts = [], add = (cx, cy, cz, ox, oy, oz, c, s, d) => pts.push([cx, cy, cz, ox, oy, oz, c, s, d]);
    const rings = [{ n: 6, len: 1.0, w: 0.42, c1: '#fff4cf', c2: '#ffd36b', z: 30 }, { n: 8, len: 1.55, w: 0.55, c1: '#ffd0ea', c2: '#ff6fbf', z: 15 }, { n: 10, len: 2.1, w: 0.62, c1: '#ff9bd6', c2: '#d4198f', z: 0 }];
    rings.forEach((r, k) => {
      for (let j = 0; j < r.n; j++) {
        const th = (j / r.n) * TAU + k * 0.4;
        const cos = Math.cos(th), sin = Math.sin(th);
        for (let u = 0.04; u <= 1.0; u += 0.045) {
          const width = r.w * Math.sin(Math.PI * Math.pow(u, 0.85)) * 0.5;
          for (const v of [-1, -0.5, 0, 0.5, 1]) {
            const L = u * r.len, X = width * v;
            const ox = cos * L - sin * X, oy = sin * L + cos * X, oz = r.z + Math.sin(u * Math.PI) * 25 - u * 10;
            const cx = cos * L * 0.18 - sin * X * 0.3, cy = sin * L * 0.18 + cos * X * 0.3, cz = 60 + u * 80;
            const edge = Math.abs(v) === 1 || u > 0.95;
            const c = col(edge ? r.c1 : r.c2).lerp(col(r.c1), u * 0.35).multiplyScalar((edge ? 0.9 : 0.42) * (0.35 + 0.65 * u));
            add(cx, cy, cz, ox, oy, oz, c, edge ? 5 : 3, k * 0.12 + u * 0.15);
          }
        }
      }
    });
    for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU, rr = 0.18 + (i % 2) * 0.06; add(0, 0, 40, Math.cos(a) * rr, Math.sin(a) * rr, 40, col('#ffe9a0'), 5, 0); }
    return pts;
  }
  function buildPeacock() {
    const pts = [], add = (cx, cy, cz, ox, oy, oz, c, s, d) => pts.push([cx, cy, cz, ox, oy, oz, c, s, d]);
    const N = 11, spread = 1.35;
    const eyeCols = ['#13208f', '#2a49ff', '#1fd6c4', '#ffd25e', '#36d46a'];
    for (let f = 0; f < N; f++) {
      const a = ((f / (N - 1)) - 0.5) * 2 * spread; // around +y
      const len = 3.4 * (1 - 0.18 * Math.abs(a) / spread);
      const dir = [Math.sin(a), Math.cos(a)], nrm = [Math.cos(a), -Math.sin(a)];
      const at = (u, side, w) => [dir[0] * (0.35 + u * len) + nrm[0] * side * w, dir[1] * (0.35 + u * len) + nrm[1] * side * w];
      const closed = (u) => [Math.sin(a * 0.08) * (0.35 + u * len * 0.3), 0.35 + u * len * 0.3];
      for (let u = 0; u <= 1; u += 0.04) { const [x, y] = at(u, 0, 0), [cx, cy] = closed(u); add(cx, cy, 0, x, y, -Math.abs(a) * 25, col('#c9f7ff'), 3, f * 0.04); }
      for (let u = 0.15; u < 0.78; u += 0.05) {
        const w = 0.38 * Math.sin(Math.PI * (u - 0.1) / 0.75);
        for (const s of [-1, 1]) for (let b = 0.25; b <= 1; b += 0.25) {
          const [x, y] = at(u - b * 0.05, s, w * b), [cx, cy] = closed(u);
          add(cx, cy, 0, x, y, -Math.abs(a) * 25, col('#1fd6c4').lerp(col('#36d46a'), b), 2.6, f * 0.04 + u * 0.1);
        }
      }
      const [ex, ey] = at(0.86, 0, 0);
      for (let r = 0; r < 5; r++) {
        const rad = 0.06 + r * 0.055, cnt = 8 + r * 5;
        for (let k = 0; k < cnt; k++) {
          const t = (k / cnt) * TAU, [cx, cy] = closed(0.86);
          add(cx, cy, 0, ex + Math.cos(t) * rad, ey + Math.sin(t) * rad * 1.25, -Math.abs(a) * 25 + 4, col(eyeCols[r]), r === 0 ? 5 : 3.8, f * 0.04 + 0.2);
        }
      }
    }
    return pts;
  }
  const TEMPL = { alapadma: buildLotus(), mayura: buildPeacock() };
  let shapeUsed = 0;
  function addShape(kind, hand) {
    const tpl = TEMPL[kind];
    if (shapeUsed + tpl.length > SHAPE_CAP) return null;
    const s = { kind, hand, t: 0, open: 0, closing: false, offset: shapeUsed, n: tpl.length, tpl };
    shapeUsed += tpl.length; active.push(s);
    return s;
  }
  function compactShapes() {
    let off = 0;
    for (const s of active) { s.offset = off; off += s.n; }
    shapeUsed = off;
  }

  /* ---------- lightning ---------- */
  const boltGeo = new THREE.BufferGeometry();
  const BOLT_MAX = 600;
  const boltPos = new Float32Array(BOLT_MAX * 3);
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3).setUsage(THREE.DynamicDrawUsage));
  const boltMat = new THREE.LineBasicMaterial({ color: 0xcff6ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthTest: false });
  const bolts = new THREE.LineSegments(boltGeo, boltMat); bolts.frustumCulled = false; scene.add(bolts);
  let boltList = [];
  function bolt(x0, y0, x1, y1, life = 0.35) { boltList.push({ x0, y0, x1, y1, life, max: life }); }
  function drawBolts(dt) {
    let v = 0;
    boltList = boltList.filter((b) => (b.life -= dt) > 0);
    for (const b of boltList) {
      let px = b.x0, py = b.y0;
      const segs = 14, dx = (b.x1 - b.x0) / segs, dy = (b.y1 - b.y0) / segs, len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
      for (let s = 1; s <= segs && v < BOLT_MAX - 2; s++) {
        const j = s === segs ? 0 : len * 0.06;
        const nx = b.x0 + dx * s + rand(-j, j), ny = b.y0 + dy * s + rand(-j, j);
        boltPos.set([px, py, 50, nx, ny, 50], v * 3); v += 2;
        if (Math.random() < 0.18 && v < BOLT_MAX - 2) { const bx = nx + rand(-len, len) * 0.15, by = ny + rand(-len, len) * 0.15; boltPos.set([nx, ny, 50, bx, by, 50], v * 3); v += 2; }
        if (Math.random() < 0.3) emit(nx, ny, 50, rand(-30, 30), rand(-30, 30), 0, col('#bdf3ff'), rand(4, 8), rand(0.15, 0.35), { kind: SPARK });
        px = nx; py = ny;
      }
    }
    boltGeo.attributes.position.needsUpdate = true;
    boltGeo.setDrawRange(0, v);
    boltMat.opacity = boltList.length ? 0.6 + Math.random() * 0.4 : 0;
  }

  /* ---------- shockwave rings ---------- */
  const rings = [];
  function ring(x, y, color, maxR, life = 0.9, width = 0.04) {
    const m = new THREE.Mesh(new THREE.RingGeometry(1 - width, 1, 96), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, side: THREE.DoubleSide }));
    m.position.set(x, y, 20); scene.add(m);
    rings.push({ m, maxR, life, max: life });
  }

  /* ---------- post-processing ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), isPhone ? 0.9 : 1.0, 0.55, 0.3);
  if (!DBG.includes('nobloom')) composer.addPass(bloom);
  const finalU = {
    tDiffuse: { value: null }, uTime: { value: 0 }, uChroma: { value: 0 }, uAspect: { value: 1 },
    uShock: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  };
  const finalPass = new ShaderPass({
    uniforms: finalU,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime, uChroma, uAspect; uniform vec4 uShock[4]; varying vec2 vUv;
      void main() {
        vec2 uv = vUv;
        for (int i = 0; i < 4; i++) {
          vec4 s = uShock[i]; if (s.w <= 0.0) continue;
          vec2 d = (uv - s.xy) * vec2(uAspect, 1.0); float r = length(d);
          float band = smoothstep(0.08, 0.0, abs(r - s.z)) * s.w;
          uv -= normalize(d + 1e-5) / vec2(uAspect, 1.0) * band * 0.035;
        }
        vec2 off = (uv - 0.5) * uChroma * 0.018;
        vec3 c = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
        float g = fract(sin(dot(uv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
        c += (g - 0.5) * 0.012;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  if (!DBG.includes('nofinal')) composer.addPass(finalPass);
  composer.addPass(new OutputPass());
  const shocks = [];
  function shock(x, y, strength = 1, speed = 1.1) { shocks.push({ x, y, r: 0, s: strength, speed }); if (shocks.length > 4) shocks.shift(); }

  /* ---------- camera shake + flash ---------- */
  let shakeAmt = 0, flash = new THREE.Vector3(), chroma = 0;
  function kick(shake, flashColor, flashAmt, chromaAmt = 0.6) {
    shakeAmt = Math.max(shakeAmt, shake);
    if (flashColor) { const c = col(flashColor), k = flashAmt * 0.22; flash.set(c.r * k, c.g * k, c.b * k); }
    chroma = Math.max(chroma, chromaAmt);
  }

  /* ---------- resize ---------- */
  function resize() {
    W = container.clientWidth; H = container.clientHeight;
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    bloom.resolution.set(W * 0.5, H * 0.5);
    camera.aspect = W / H;
    camera.position.set(0, 0, (H / 2) / Math.tan((camera.fov * Math.PI) / 360));
    CAMZ.value = camera.position.z;
    camera.near = 10; camera.far = camera.position.z * 4;
    camera.updateProjectionMatrix();
    bgU.uAspect.value = W / H; finalU.uAspect.value = W / H;
    updateCover();
    for (let i = 0; i < DN; i++) resetDust(i, true);
  }
  function updateCover() {
    if (!video || !video.videoWidth) return;
    const va = video.videoWidth / video.videoHeight, sa = W / H;
    if (va > sa) { const s = sa / va; bgU.uCover.value.set(s, 1, (1 - s) / 2, 0); }
    else { const s = va / sa; bgU.uCover.value.set(1, s, 0, (1 - s) / 2); }
  }
  /** Convert a normalised video landmark (x,y in 0..1, unmirrored) to world px. */
  function videoToWorld(x, y) {
    const c = bgU.uCover.value; // uv = screenUV * c.xy + c.zw, with screen x mirrored
    const su = (x - c.z) / c.x, sv = ((1 - y) - c.w) / c.y;
    const mx = 1 - su;
    return [(mx - 0.5) * W, (sv - 0.5) * H];
  }
  resize();
  addEventListener('resize', resize);
  if (video) video.addEventListener('loadedmetadata', updateCover);

  /* =================================================================== */
  /*                              SPELLS                                  */
  /* =================================================================== */
  const sustain = [null, null]; // per hand { id, t, charge, shape }
  const C = {
    pataka: [col('#e9fbff'), col('#6fd6ff'), col('#2b7bff')],
    alapadma: [col('#ffe3a3'), col('#ff7ac8'), col('#ffffff')],
    shikhara: [col('#ffe066'), col('#ff8a1f')],
    mayura: [col('#22e0c8'), col('#3b6bff'), col('#ffd25e'), col('#36d46a')],
    mushti: [col('#ffd56b'), col('#ff9a2e'), col('#ff4d2e')],
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  function burst(x, y, n, speed, colors, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), s = speed * Math.pow(Math.random(), 0.5);
      emit(x, y, rand(-40, 40), Math.cos(a) * s, Math.sin(a) * s + (o.up || 0), rand(-50, 50), pick(colors), rand(o.smin || 3, o.smax || 8), rand(o.lmin || 0.6, o.lmax || 1.4), { drag: o.drag ?? 0.93, grav: o.grav ?? 0, kind: o.kind ?? NORMAL, turb: o.turb ?? 0, shrink: o.shrink ?? 0.3 });
    }
  }

  function cast(hi, id, h) {
    release(hi, true);
    const [x, y] = h.palm, s = h.size;
    const st = { id, t: 0, charge: 0, shape: null, x, y };
    sustain[hi] = st;
    if (id === 'pataka') {
      kick(14, '#9fe8ff', 0.5, 1);
      for (let k = 0; k < 4; k++) { const a = rand(0, TAU); bolt(x, y, x + Math.cos(a) * rand(W * 0.4, W * 0.8), y + Math.sin(a) * rand(H * 0.3, H * 0.6), 0.45); }
      burst(x, y, 260, 900, C.pataka, { smin: 3, smax: 7, lmin: 0.4, lmax: 1.1 });
      ring(x, y, 0x9fe8ff, Math.max(W, H) * 0.7, 0.7, 0.02);
      shock(x, y, 1);
    } else if (id === 'alapadma') {
      kick(4, '#ff8fd0', 0.25, 0.5);
      burst(x, y, 220, 520, C.alapadma, { smin: 3, smax: 9, lmin: 0.8, lmax: 1.8, drag: 0.95, up: 40 });
      ring(x, y, 0xff9bd6, s * 5, 1.1, 0.03); ring(x, y, 0xffe3a3, s * 3.2, 0.9, 0.05);
      st.shape = addShape('alapadma', hi);
      shock(x, y, 0.5);
    } else if (id === 'shikhara') {
      kick(8, '#ff8a1f', 0.35, 0.7);
      for (let i = 0; i < 200; i++) emit(x + rand(-s * 0.3, s * 0.3), y, rand(-30, 30), rand(-60, 60), rand(500, 1300), 0, FIRECOL[0], rand(8, 16), rand(0.6, 1.3), { kind: FIRE, drag: 0.94, turb: 380 });
      ring(x, y, 0xffa23a, s * 6, 0.8, 0.04);
      shock(x, y, 0.7);
    } else if (id === 'mayura') {
      kick(5, '#22e0c8', 0.3, 0.6);
      burst(x, y, 240, 600, C.mayura, { smin: 3, smax: 8, lmin: 0.7, lmax: 1.6, drag: 0.94 });
      ring(x, y, 0x22e0c8, s * 6, 1, 0.03);
      st.shape = addShape('mayura', hi);
      shock(x, y, 0.5);
    } else if (id === 'mushti') {
      kick(3, null, 0, 0.3);
      ring(x, y, 0xffc23d, s * 2.5, 0.5, 0.06);
    }
  }

  function release(hi, silent) {
    const st = sustain[hi];
    if (!st) return;
    sustain[hi] = null;
    if (st.shape) { st.shape.closing = true; st.shape.scatter = true; }
    if (st.id === 'mushti' && !silent) {
      const p = Math.min(1, st.charge / 2.2), x = st.x, y = st.y;
      kick(18 + 30 * p, '#ffb347', 0.4 + 0.6 * p, 1.4);
      for (let k = 0; k < 3; k++) ring(x, y, k === 1 ? 0xff4d2e : 0xffc23d, Math.max(W, H) * (0.5 + 0.5 * p) * (1 - k * 0.2), 0.9 + k * 0.15, 0.03);
      burst(x, y, Math.floor(260 + 700 * p), 900 + 1200 * p, C.mushti, { smin: 3, smax: 10, lmin: 0.6, lmax: 1.6, grav: -900, drag: 0.95 });
      for (let i = 0; i < 40 + 80 * p; i++) { const a = rand(0, TAU); emit(x, y, 30, Math.cos(a) * rand(300, 900), Math.sin(a) * rand(200, 900) + 300, 0, col('#ffe6a8'), rand(8, 16), rand(1, 2), { grav: -1600, drag: 0.98, shrink: 0.6 }); }
      shock(x, y, 1.6, 1.4); shock(x, y, 1.0, 0.9);
      return 'shatter';
    }
    return null;
  }

  /** Per-frame sustained behaviour for a held mudra. */
  function sustainUpdate(hi, h, dt, t) {
    const st = sustain[hi]; if (!st) return;
    st.t += dt; st.x = h.palm[0]; st.y = h.palm[1];
    const s = h.size, [x, y] = h.palm;
    const dirx = h.dir[0], diry = h.dir[1];
    if (st.id === 'pataka') {
      for (let i = 0; i < 180 * dt * 60 / 60 * 3; i++) {
        const sp = rand(500, 1100), jitter = rand(-0.35, 0.35);
        const vx = (dirx * Math.cos(jitter) - diry * Math.sin(jitter)) * sp, vy = (dirx * Math.sin(jitter) + diry * Math.cos(jitter)) * sp;
        emit(x + rand(-s * 0.5, s * 0.5), y + rand(-s * 0.5, s * 0.5), rand(-40, 40), vx, vy, 0, pick(C.pataka), rand(2, 5), rand(0.3, 0.7), { drag: 0.97, shrink: 0.2 });
      }
      st.bt = (st.bt || 0) - dt;
      if (st.bt <= 0) {
        st.bt = rand(0.12, 0.35);
        const tip = h.pts[[8, 12, 16, 20][Math.floor(rand(0, 4))]];
        const a = Math.atan2(diry, dirx) + rand(-0.8, 0.8), L = rand(s * 3, s * 7);
        bolt(tip[0], tip[1], tip[0] + Math.cos(a) * L, tip[1] + Math.sin(a) * L, 0.18);
      }
    } else if (st.id === 'shikhara') {
      const tip = h.pts[4];
      const rate = Math.floor(200 * dt) + 2;
      for (let i = 0; i < rate; i++) emit(tip[0] + rand(-s * 0.18, s * 0.18), tip[1] + rand(-s * 0.1, s * 0.1), rand(-20, 20), rand(-40, 40) + dirx * 120, rand(380, 820) + diry * 120, 0, FIRECOL[0], rand(s * 0.08, s * 0.17) + 4, rand(0.5, 1.0), { kind: FIRE, drag: 0.95, turb: 520 });
      if (Math.random() < 0.6) emit(tip[0], tip[1], 20, rand(-120, 120), rand(200, 600), 0, col('#ffcf6b'), rand(2, 4), rand(0.8, 1.8), { kind: SPARK, drag: 0.97, grav: -150, turb: 300 });
    } else if (st.id === 'alapadma' || st.id === 'mayura') {
      if (Math.random() < 0.9) { const a = rand(0, TAU), r = s * rand(0.5, st.id === 'mayura' ? 3.5 : 2.2); emit(x + Math.cos(a) * r, y + Math.sin(a) * r + (st.id === 'mayura' ? s * 1.5 : 0), 40, rand(-20, 20), rand(30, 120), 0, pick(C[st.id]), rand(3, 6), rand(0.8, 1.6), { kind: SPARK, drag: 0.97 }); }
    } else if (st.id === 'mushti') {
      st.charge = Math.min(2.6, st.charge + dt);
      const p = Math.min(1, st.charge / 2.2);
      const n = Math.floor(4 + 10 * p);
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU), r = s * rand(2.5, 4.5);
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        emit(px, py, 30, (x - px) * 3.2 - Math.sin(a) * 200, (y - py) * 3.2 + Math.cos(a) * 200, 0, pick(C.mushti), rand(3, 7) * (1 + p), 0.32, { drag: 0.96, shrink: 0.2 });
      }
      if (Math.random() < p * 0.6) emit(x, y, 40, rand(-20, 20), rand(-20, 20), 0, col('#fff2c2'), s * (0.6 + p * 1.2), 0.15, { shrink: 1 });
      shakeAmt = Math.max(shakeAmt, p * 3);
    }
  }

  function nataraja(cx = 0, cy = 0) {
    kick(26, '#ff7a1f', 0.8, 1.6);
    const R = Math.min(W, H) * 0.42;
    nat = { t: 0, cx, cy, R };
    shock(cx, cy, 1.8, 1.2);
    for (let k = 0; k < 4; k++) ring(cx, cy, [0xffd75e, 0xff5a1f, 0xff7ac8, 0x22e0c8][k], Math.max(W, H) * (0.6 + k * 0.15), 1.2 + k * 0.2, 0.02);
    burst(cx, cy, 900, 1500, [...C.alapadma, ...C.mayura, ...C.shikhara, ...C.pataka], { smin: 3, smax: 10, lmin: 1, lmax: 2.4, drag: 0.95 });
  }
  let nat = null;
  function natUpdate(dt) {
    if (!nat) return;
    nat.t += dt;
    const { cx, cy, R } = nat, k = ease(nat.t / 0.8), fade = nat.t > 6 ? Math.max(0, 1 - (nat.t - 6) / 1.5) : 1;
    if (fade <= 0) { nat = null; return; }
    const n = Math.floor(70 * fade);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU) + nat.t * 0.6, r = R * k;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      emit(px, py, 0, Math.cos(a) * rand(60, 220), Math.sin(a) * rand(60, 220) + 120, 0, FIRECOL[0], rand(12, 26), rand(0.4, 0.9), { kind: FIRE, drag: 0.94, turb: 400 });
    }
    for (let i = 0; i < 6 * fade; i++) { const a = (i / 6) * TAU + nat.t * 1.4; const r = R * 0.55 * k; emit(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 30, 0, 0, 0, pick([...C.alapadma, ...C.mayura]), 7, 0.5, { shrink: 0.2 }); }
  }

  /* =================================================================== */
  /*                              FRAME                                   */
  /* =================================================================== */
  let hands = [];
  let last = performance.now(), t0 = last, running = true, snapReq = null;
  const tipTrail = [4, 8, 12, 16, 20];
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    bgU.uTime.value = t; finalU.uTime.value = t;

    // hands → background glow uniforms
    for (let i = 0; i < 2; i++) {
      const h = hands[i];
      if (h) bgU.uHands.value[i].set(h.palm[0] / W + 0.5, h.palm[1] / H + 0.5, (h.size / H) * 1.2); else bgU.uHands.value[i].set(-9, 0, 0);
    }

    // skeleton
    let k = 0;
    hands.forEach((h) => {
      if (!h) return;
      const c = h.color ? col(h.color) : skelCol;
      for (let j = 0; j < 21; j++) {
        const p = h.pts[j];
        skel.pos.set([p[0], p[1], 60], k * 3); skel.color.set([1, 0.95, 0.85], k * 3); skel.size[k] = j % 4 === 0 && j ? 9 : 7; skel.alpha[k] = h.ghost ? 0.5 : 0.95; k++;
      }
      for (const [a, b] of BONES) for (let s = 1; s <= SEG; s++) {
        const u = s / (SEG + 1), p = h.pts[a], q = h.pts[b];
        skel.pos.set([lerp(p[0], q[0], u), lerp(p[1], q[1], u), 60], k * 3); skel.color.set([c.r, c.g, c.b], k * 3); skel.size[k] = 5; skel.alpha[k] = h.ghost ? 0.4 : 0.8; k++;
      }
      // fingertip trails
      for (const ti of tipTrail) { const p = h.pts[ti]; if (Math.random() < 0.7) emit(p[0], p[1], 50, rand(-15, 15), rand(-10, 25), 0, c, rand(3, 6), rand(0.25, 0.5), { kind: SPARK, drag: 0.92 }); }
    });
    skel.flush(k);

    // sustained spells
    hands.forEach((h, i) => h && sustainUpdate(i, h, dt, t));
    natUpdate(dt);

    // shapes
    let o = 0;
    for (let si = active.length - 1; si >= 0; si--) {
      const s = active[si];
      s.t += dt;
      if (s.closing) {
        if (s.scatter) {
          // burst every point outward as a free particle, then remove the shape
          const h = s.anchor;
          for (let j = 0; j < s.n; j += 2) {
            const i3 = (s.offset + j) * 3, px = shapes.pos[i3], py = shapes.pos[i3 + 1];
            const dx = px - h[0], dy = py - h[1], d = Math.hypot(dx, dy) || 1;
            emit(px, py, shapes.pos[i3 + 2], (dx / d) * rand(100, 500), (dy / d) * rand(100, 500) + rand(50, 250), rand(-80, 80), new THREE.Color(shapes.color[i3], shapes.color[i3 + 1], shapes.color[i3 + 2]), shapes.size[s.offset + j], rand(0.6, 1.4), { drag: 0.95, shrink: 0.2, turb: 120 });
          }
        }
        active.splice(si, 1); continue;
      }
    }
    compactShapes();
    for (const s of active) {
      const h = hands[s.hand];
      if (h) s.anchor = [h.palm[0], h.palm[1], h.size, Math.atan2(h.dir[1], h.dir[0]) - Math.PI / 2];
      if (!s.anchor) continue;
      const [ax, ay, size, rot] = s.anchor;
      const scale = size * (s.kind === 'mayura' ? 1.0 : 1.0);
      const spin = s.kind === 'alapadma' ? s.t * 0.35 : 0;
      const cr = Math.cos(rot + spin), sr = Math.sin(rot + spin);
      const breathe = 1 + Math.sin(s.t * 2.2) * 0.03;
      for (let j = 0; j < s.n; j++) {
        const [cx, cy, cz, ox, oy, oz, c, sz, delay] = s.tpl[j];
        const op = ease((s.t - delay) / 0.9);
        const lx = lerp(cx, ox, op) * scale * breathe, ly = lerp(cy, oy, op) * scale * breathe, lz = lerp(cz, oz, op);
        const shimmer = s.kind === 'mayura' ? 0.75 + 0.25 * Math.sin(s.t * 4 + j * 0.05) : 0.85 + 0.15 * Math.sin(s.t * 3 + j * 0.3);
        const i = s.offset + j, i3 = i * 3;
        shapes.pos[i3] = ax + lx * cr - ly * sr; shapes.pos[i3 + 1] = ay + lx * sr + ly * cr; shapes.pos[i3 + 2] = lz;
        shapes.color[i3] = c.r * shimmer; shapes.color[i3 + 1] = c.g * shimmer; shapes.color[i3 + 2] = c.b * shimmer;
        shapes.size[i] = sz * (size / 90) * (0.6 + 0.4 * op) + 1.5; shapes.alpha[i] = Math.min(1, (s.t - delay * 0.5) * 3);
      }
      o = s.offset + s.n;
    }
    shapes.flush(shapeUsed);

    // dust swirling around hands
    for (let i = 0; i < DN; i++) {
      const i3 = i * 3;
      for (const h of hands) {
        if (!h) continue;
        const dx = h.palm[0] - dust.pos[i3], dy = h.palm[1] - dust.pos[i3 + 1], d2 = dx * dx + dy * dy + 2000;
        const f = 9e5 / d2;
        dv[i3] += (dx * f * 0.002 - dy * f * 0.004) * dt; dv[i3 + 1] += (dy * f * 0.002 + dx * f * 0.004) * dt;
      }
      dv[i3] *= 0.985; dv[i3 + 1] = dv[i3 + 1] * 0.985 + 4 * dt;
      dust.pos[i3] += dv[i3] * dt; dust.pos[i3 + 1] += dv[i3 + 1] * dt;
      if (dust.pos[i3 + 1] > H / 2 + 20 || Math.abs(dust.pos[i3]) > W / 2 + 60 || dust.pos[i3 + 1] < -H / 2 - 40) resetDust(i, false);
    }
    dust.flush(DN);

    updatePool(dt, t);
    drawBolts(dt);

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.life -= dt;
      const p = 1 - r.life / r.max, s = Math.max(1, ease(p) * r.maxR);
      r.m.scale.set(s, s, 1); r.m.material.opacity = Math.max(0, 1 - p);
      if (r.life <= 0) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); }
    }
    for (let i = 0; i < 4; i++) {
      const s = shocks[i], u = finalU.uShock.value[i];
      if (!s) { u.set(0, 0, 0, 0); continue; }
      s.r += dt * s.speed; s.s *= Math.pow(0.18, dt);
      u.set(s.x / W + 0.5, s.y / H + 0.5, s.r, s.s);
    }
    for (let i = shocks.length - 1; i >= 0; i--) if (shocks[i].s < 0.02 || shocks[i].r > 2) shocks.splice(i, 1);

    shakeAmt *= Math.pow(0.02, dt);
    camera.position.x = rand(-1, 1) * shakeAmt; camera.position.y = rand(-1, 1) * shakeAmt;
    flash.multiplyScalar(Math.pow(0.03, dt)); bgU.uFlash.value.copy(flash);
    chroma *= Math.pow(0.05, dt); finalU.uChroma.value = chroma;

    composer.render();
    if (snapReq) { const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height; c.getContext('2d').drawImage(canvas, 0, 0); const r = snapReq; snapReq = null; r(c); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    setHands(h) { hands = h; },
    cast, release, nataraja, videoToWorld,
    setVideo(on) { bgU.uHasVideo.value = on ? 1 : 0; updateCover(); },
    setMode(m) { bgU.uMode.value = m; },
    snapshot() { return new Promise((r) => (snapReq = r)); },
    get size() { return { W, H }; },
    pause() { running = false; }, resume() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } },
    debugStats() { return { particles: P.count, shapes: shapeUsed }; },
  };
}
