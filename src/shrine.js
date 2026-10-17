import * as THREE from 'three';
import { MeshBuilder, hex } from './core/builder.js';
import { NOISE_GLSL } from './core/glsl.js';
import { shared } from './materials.js';

// Shrine faces +z. Local origin = courtyard floor level at the shrine centre.
export const SHRINE_POS = new THREE.Vector3(6.2, 0, -3.4);

const T = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz)
  );

function buildDemonHead(b, m, color, dark) {
  const add = (geo, local, col = color) => b.addGeometry(geo, new THREE.Matrix4().multiplyMatrices(m, local), col);
  // octagonal medallion + rim
  add(new THREE.CylinderGeometry(0.66, 0.7, 0.24, 8), T(0, 0, -0.06, Math.PI / 2, 0, Math.PI / 8));
  add(new THREE.TorusGeometry(0.6, 0.055, 6, 8), T(0, 0, 0.07, 0, 0, Math.PI / 8));
  // face mass
  add(new THREE.SphereGeometry(0.42, 20, 14), T(0, -0.03, 0.1, 0, 0, 0, 1.0, 0.86, 0.56));
  // angry brows
  add(new THREE.BoxGeometry(0.4, 0.11, 0.2), T(-0.19, 0.19, 0.3, 0.15, 0, -0.4));
  add(new THREE.BoxGeometry(0.4, 0.11, 0.2), T(0.19, 0.19, 0.3, 0.15, 0, 0.4));
  // eye sockets (dark)
  add(new THREE.SphereGeometry(0.1, 10, 8), T(-0.165, 0.055, 0.29, 0, 0, 0, 1.15, 0.8, 0.6), dark);
  add(new THREE.SphereGeometry(0.1, 10, 8), T(0.165, 0.055, 0.29, 0, 0, 0, 1.15, 0.8, 0.6), dark);
  // cheeks + nose
  add(new THREE.SphereGeometry(0.12, 12, 10), T(-0.26, -0.11, 0.24, 0, 0, 0, 1, 0.8, 0.8));
  add(new THREE.SphereGeometry(0.12, 12, 10), T(0.26, -0.11, 0.24, 0, 0, 0, 1, 0.8, 0.8));
  add(new THREE.SphereGeometry(0.11, 12, 10), T(0, -0.05, 0.37, 0, 0, 0, 1.4, 0.85, 0.9));
  // snarling mouth
  add(new THREE.BoxGeometry(0.46, 0.12, 0.1), T(0, -0.235, 0.27), dark);
  add(new THREE.BoxGeometry(0.52, 0.09, 0.17), T(0, -0.33, 0.26, 0.1));
  for (const s of [-1, 1]) {
    add(new THREE.ConeGeometry(0.036, 0.14, 6), T(s * 0.15, -0.215, 0.33, Math.PI, 0, 0));
    add(new THREE.ConeGeometry(0.03, 0.11, 6), T(s * 0.065, -0.265, 0.33));
    // mane curls
    add(new THREE.TorusGeometry(0.13, 0.042, 6, 14, Math.PI * 1.6), T(s * 0.53, -0.2, 0.06, 0, s * 0.35, s * 0.7));
    add(new THREE.TorusGeometry(0.09, 0.035, 6, 12, Math.PI * 1.5), T(s * 0.5, 0.32, 0.04, 0, s * 0.3, -s * 0.4));
    // horns
    const pts = [
      [s * 0.27, 0.27, 0.06], [s * 0.45, 0.45, 0.02], [s * 0.54, 0.72, -0.08], [s * 0.44, 0.94, -0.12], [s * 0.27, 1.02, -0.05],
    ].map((p) => new THREE.Vector3(...p).applyMatrix4(m));
    b.addTube(new THREE.CatmullRomCurve3(pts), {
      segments: 18, radial: 7, radiusFn: (u) => 0.09 * (1 - u) + 0.012, color,
    });
  }
  return [new THREE.Vector3(-0.165, 0.06, 0.33).applyMatrix4(m), new THREE.Vector3(0.165, 0.06, 0.33).applyMatrix4(m)];
}

function makeBannerMaterial(map) {
  const mat = new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
  mat.userData.edgeWeight = 0.9;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  float ph = modelMatrix[3].x * 2.3 + modelMatrix[3].z;
  float k = clamp(-position.y / 1.62, 0.0, 1.0);
  float k2 = k * k;
  transformed.z += (sin(uTime * 1.5 + ph + k * 2.4) * 0.07 + sin(uTime * 3.3 + ph * 1.7 + k * 5.0) * 0.02) * k2 + 0.06 * k;
  transformed.x += sin(uTime * 1.05 + ph + k * 3.0) * 0.03 * k2;
}`
      );
  };
  mat.customProgramCacheKey = () => 'yg-banner';
  return mat;
}

function makeFlame() {
  const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uSize: { value: new THREE.Vector2(0.42, 0.72) } },
    vertexShader: /* glsl */ `
      uniform vec2 uSize;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        vec3 wp = center + right * position.x * uSize.x + vec3(0.0, 1.0, 0.0) * position.y * uSize.y;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float y = vUv.y;
        float x = vUv.x - 0.5;
        float n = ygNoise(vec3(x * 3.0, y * 2.2 - uTime * 2.3, uTime * 0.4));
        float n2 = ygNoise(vec3(x * 7.0, y * 5.0 - uTime * 4.1, uTime * 0.7 + 3.0));
        x += n * 0.1 * y + n2 * 0.035 * y;
        float w = mix(0.3, 0.02, pow(y, 0.85));
        float body = 1.0 - smoothstep(w * 0.4, w, abs(x));
        body *= smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.5 + n * 0.2, 0.98, y));
        float core = (1.0 - smoothstep(w * 0.08, w * 0.5, abs(x))) * smoothstep(0.0, 0.1, y) * (1.0 - smoothstep(0.18, 0.55, y));
        vec3 col = vec3(0.12, 1.0, 0.5) * body * 2.4 + vec3(0.75, 1.0, 0.86) * core * 2.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  return mesh;
}

function makeMotes(rng, count, center, radius, height, softTex) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * radius;
    pos[i * 3] = center.x + Math.cos(a) * r;
    pos[i * 3 + 1] = center.y;
    pos[i * 3 + 2] = center.z + Math.sin(a) * r;
    seed[i * 4] = rng.next();
    seed[i * 4 + 1] = rng.range(0.05, 0.12);
    seed[i * 4 + 2] = rng.range(0.6, 1.6);
    seed[i * 4 + 3] = rng.range(0.1, 0.18);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uMap: { value: softTex }, uScale: { value: 8 }, uHeight: { value: height } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uScale; uniform float uHeight;
      attribute vec4 aSeed;
      varying float vA;
      void main() {
        float t = fract(uTime * aSeed.y + aSeed.x);
        vec3 p = position;
        p.y += t * uHeight;
        p.x += sin(uTime * aSeed.z + aSeed.x * 20.0) * 0.25;
        p.z += cos(uTime * aSeed.z * 0.8 + aSeed.x * 13.0) * 0.25;
        vA = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.6, 1.0, t)) * (0.6 + 0.4 * sin(uTime * 3.0 + aSeed.x * 40.0));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = max(1.0, aSeed.w * uScale);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vA;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vA;
        gl_FragColor = vec4(vec3(0.35, 1.0, 0.62) * a * 1.6, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

export function buildShrine({ rng, stoneMat, bannerTex, softTex }) {
  const group = new THREE.Group();
  group.position.copy(SHRINE_POS);
  const b = new MeshBuilder();
  const S = ['#a29e94', '#99968d', '#a9a498', '#938f87', '#9e9a8e'].map(hex);
  const sc = () => rng.pick(S).clone().multiplyScalar(rng.range(0.92, 1.06));
  const DARK = hex('#26251f');
  const box = (x0, x1, y0, y1, z0, z1, o = {}) =>
    b.addChamferBox({
      x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2,
      w: x1 - x0, h: y1 - y0, d: z1 - z0,
      c: o.c ?? 0.05, rx: o.rx, ry: o.ry, rz: o.rz,
      color: o.color ?? sc(), aoBottom: o.ao ?? 0.62, skipBottom: o.skipBottom,
    });
  const split = (a0, a1, n) => {
    const cuts = [a0];
    for (let i = 1; i < n; i++) cuts.push(a0 + ((a1 - a0) * i) / n + rng.range(-0.12, 0.12) * ((a1 - a0) / n));
    cuts.push(a1);
    return cuts;
  };

  // --- lower platform (4 x 3 slabs)
  const xs = split(-2.7, 2.7, 4), zs = split(-2.0, 2.0, 3);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
    box(xs[i] + 0.02, xs[i + 1] - 0.02, -0.25, 0.32 + rng.range(-0.02, 0.02), zs[k] + 0.02, zs[k + 1] - 0.02, { ry: rng.range(-0.015, 0.015), ao: 0.5 });
  }
  box(-1.3, -0.01, -0.12, 0.16, 2.0, 2.45);
  box(0.01, 1.3, -0.12, 0.16, 2.0, 2.45);

  // --- upper base
  const bx = split(-1.9, 1.9, 3);
  for (let i = 0; i < 3; i++) for (const [z0, z1] of [[-1.9, -0.5], [-0.5, 0.9]]) {
    box(bx[i] + 0.015, bx[i + 1] - 0.015, 0.3, 0.85, z0 + 0.015, z1 - 0.015, { ao: 0.55 });
  }
  for (const [z0, z1, top] of [[0.9, 1.28, 0.673], [1.28, 1.66, 0.497]]) {
    box(-0.9, -0.005, 0.3, top, z0, z1);
    box(0.005, 0.9, 0.3, top, z0, z1);
  }
  box(-1.18, -0.92, 0.3, 0.85, 0.9, 1.72);
  box(0.92, 1.18, 0.3, 0.85, 0.9, 1.72);

  // --- walls in courses
  const courses = [0.85, 1.66, 2.46, 3.25];
  for (let c = 0; c < 3; c++) {
    const y0 = courses[c], y1 = courses[c + 1];
    const wx = split(-1.6, 1.6, rng.int(2, 3));
    for (let i = 0; i < wx.length - 1; i++) box(wx[i] + 0.01, wx[i + 1] - 0.01, y0, y1 - 0.01, -1.85, -1.45, { ao: 0.7 });
    for (const [x0, x1] of [[-1.6, -1.2], [1.2, 1.6]]) {
      const wz = split(-1.85, 0.12, 2);
      for (let i = 0; i < 2; i++) box(x0, x1, y0, y1 - 0.01, wz[i] + 0.01, wz[i + 1] - 0.01, { ao: 0.7 });
    }
    box(-1.2, -0.75, y0, y1 - 0.01, -0.12, 0.12, { ao: 0.7 });
    box(0.75, 1.2, y0, y1 - 0.01, -0.12, 0.12, { ao: 0.7 });
  }
  box(-0.75, 0.75, 2.64, 3.25, -0.12, 0.14);
  // door frame
  box(-0.88, -0.75, 0.85, 2.74, 0.08, 0.22, { c: 0.03 });
  box(0.75, 0.88, 0.85, 2.74, 0.08, 0.22, { c: 0.03 });
  box(-0.95, 0.95, 2.62, 2.8, 0.08, 0.25, { c: 0.035 });
  // pillars
  for (const px of [-1.42, 1.42]) {
    const pz = 0.4;
    box(px - 0.3, px + 0.3, 0.85, 1.07, pz - 0.3, pz + 0.3);
    box(px - 0.2, px + 0.2, 1.07, 2.08, pz - 0.2, pz + 0.2, { c: 0.04 });
    box(px - 0.2, px + 0.2, 2.08, 3.05, pz - 0.2, pz + 0.2, { c: 0.04, ry: rng.range(-0.04, 0.04) });
    box(px - 0.29, px + 0.29, 3.05, 3.25, pz - 0.29, pz + 0.29);
  }
  // lintel and heavy slab roof
  box(-1.92, 1.92, 3.25, 3.66, -0.15, 0.68, { ao: 0.75 });
  box(-2.25, 2.25, 3.66, 4.0, -2.2, 0.92, { c: 0.08, rz: 0.022, rx: -0.015, ao: 0.7 });
  box(-1.75, 1.75, 4.0, 4.3, -1.85, 0.5, { c: 0.07, rz: 0.01, ao: 0.75 });
  box(-1.25, 1.25, 4.3, 4.52, -1.15, -0.25, { c: 0.06, ao: 0.8 });
  // fallen roof chunk
  box(1.95, 2.55, 0.32, 0.7, -1.75, -1.15, { ry: 0.5, rz: 0.12, c: 0.06 });
  box(-2.55, -2.1, 0.32, 0.58, 0.8, 1.2, { ry: -0.3, rx: 0.1, c: 0.05 });

  // interior lining (unlit-looking)
  box(-1.2, 1.2, 0.85, 0.875, -1.45, -0.12, { color: DARK, ao: 1, skipBottom: true });
  box(-1.2, 1.2, 0.85, 3.2, -1.46, -1.43, { color: DARK, ao: 0.6 });
  box(-1.21, -1.18, 0.85, 3.2, -1.45, -0.12, { color: DARK, ao: 0.6 });
  box(1.18, 1.21, 0.85, 3.2, -1.45, -0.12, { color: DARK, ao: 0.6 });
  // altar + bowl
  box(-0.5, 0.3, 0.85, 1.3, -0.78, -0.3, { color: hex('#6a675f'), ao: 0.5 });
  const bowl = new THREE.LatheGeometry(
    [[0, 0], [0.09, 0], [0.15, 0.04], [0.18, 0.11], [0.2, 0.14], [0.17, 0.13]].map((p) => new THREE.Vector2(p[0], p[1])),
    12
  );
  b.addGeometry(bowl, T(-0.1, 1.3, -0.54), hex('#3d3b33'));

  // demon head medallion
  const eyes = buildDemonHead(b, T(0, 4.02, 0.98, -0.06, 0, 0, 1.05, 1.05, 1.05), hex('#a29e94'), hex('#2c2a25'));

  // stone lanterns
  const glowBoxes = [];
  for (const side of [-1, 1]) {
    const px = side * 2.15, py = 0.32, pz = 1.35;
    box(px - 0.32, px + 0.32, py - 0.05, py + 0.16, pz - 0.32, pz + 0.32, { c: 0.04 });
    box(px - 0.23, px + 0.23, py + 0.16, py + 0.28, pz - 0.23, pz + 0.23, { c: 0.03 });
    b.addGeometry(new THREE.CylinderGeometry(0.12, 0.15, 0.62, 8), T(px, py + 0.59, pz), sc());
    box(px - 0.29, px + 0.29, py + 0.9, py + 1.0, pz - 0.29, pz + 0.29, { c: 0.03 });
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      box(px + dx * 0.19 - 0.045, px + dx * 0.19 + 0.045, py + 1.0, py + 1.37, pz + dz * 0.19 - 0.045, pz + dz * 0.19 + 0.045, { c: 0.015 });
    }
    box(px - 0.28, px + 0.28, py + 1.37, py + 1.44, pz - 0.28, pz + 0.28, { c: 0.02 });
    b.addGeometry(new THREE.ConeGeometry(0.5, 0.32, 4, 1), T(px, py + 1.6, pz, 0, Math.PI / 4, 0), sc());
    b.addGeometry(new THREE.CylinderGeometry(0.05, 0.07, 0.08, 8), T(px, py + 1.79, pz), sc());
    b.addGeometry(new THREE.SphereGeometry(0.075, 10, 8), T(px, py + 1.87, pz), sc());
    glowBoxes.push(new THREE.Vector3(px, py + 1.18, pz));
  }

  const body = new THREE.Mesh(b.build(), stoneMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // --- emissive bits
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 2.4, 1.1) });
  for (const e of eyes) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), eyeMat);
    m.position.copy(e);
    m.scale.set(1.2, 0.7, 0.6);
    group.add(m);
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.36, 0.2) });
  for (const p of glowBoxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), lampMat);
    m.position.copy(p);
    group.add(m);
  }

  // --- banners
  const bannerMat = makeBannerMaterial(bannerTex);
  const bannerGeo = new THREE.PlaneGeometry(0.46, 1.62, 6, 16);
  bannerGeo.translate(0, -0.81, 0);
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(bannerGeo, bannerMat);
    m.position.set(side * 0.975, 3.2, 0.17);
    m.rotation.z = side * 0.012;
    m.receiveShadow = true;
    group.add(m);
  }
  // little cloth strips tied to the lintel
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.7, 2, 8).translate(0, -0.35, 0), bannerMat);
    m.position.set(side * 1.62, 3.4, 0.7);
    m.rotation.y = side * 0.3;
    group.add(m);
  }

  // --- spirit flame
  const flameAnchor = new THREE.Vector3(-0.1, 1.38, -0.54);
  const flame = makeFlame();
  flame.position.copy(flameAnchor);
  group.add(flame);
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: softTex, color: new THREE.Color(0.2, 0.9, 0.5), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })
  );
  halo.position.copy(flameAnchor).add(new THREE.Vector3(0, 0.3, 0));
  halo.scale.setScalar(1.5);
  group.add(halo);

  const light = new THREE.PointLight('#5cffad', 3.2, 5.5, 1.8);
  light.position.copy(flameAnchor).add(new THREE.Vector3(0, 0.45, 0.35));
  group.add(light);

  const motes = makeMotes(rng, 80, new THREE.Vector3(SHRINE_POS.x, 0.4, SHRINE_POS.z + 0.6), 4.2, 4.5, softTex);

  // weeds growing on the abandoned roof and platform (world space)
  const plantSpots = [];
  const roofPts = [[-1.2, 4.3, -1.5], [0.9, 4.3, -1.6], [-1.5, 4.3, 0.2], [1.45, 4.3, 0.25], [0.6, 4.52, -0.9], [-0.7, 4.52, -0.4],
    [-2.0, 4.0, -1.9], [2.0, 4.0, -1.2], [2.05, 4.0, 0.6], [-2.05, 4.0, 0.7], [0.0, 4.3, -1.7]];
  roofPts.forEach(([x, y, z], i) => plantSpots.push({ x: SHRINE_POS.x + x, y: y + 0.01, z: SHRINE_POS.z + z, kind: i % 3 === 0 ? 'fern' : 'grass' }));
  const baseYs = [[-2.5, 0.32, -1.8], [2.5, 0.32, -1.6], [-2.4, 0.32, 1.85], [2.55, 0.32, 1.9], [-1.75, 0.85, -1.7], [1.8, 0.85, 0.75]];
  baseYs.forEach(([x, y, z]) => plantSpots.push({ x: SHRINE_POS.x + x, y, z: SHRINE_POS.z + z, kind: 'grass' }));

  return {
    group,
    motes,
    eyeMat,
    plantSpots,
    update(t) {
      const f = 0.82 + 0.1 * Math.sin(t * 11.3) * Math.sin(t * 6.7) + 0.08 * Math.sin(t * 2.3);
      light.intensity = 3.2 * f;
      halo.material.opacity = 0.45 + 0.15 * f;
      eyeMat.color.setRGB(0.5, 2.2 + 0.5 * Math.sin(t * 1.3), 1.0);
    },
    // points are sized in world units; scale = low-res texels per world unit
    setPointScale(s) {
      motes.material.uniforms.uScale.value = s;
    },
  };
}
