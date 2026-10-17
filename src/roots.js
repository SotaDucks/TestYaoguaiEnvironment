import * as THREE from 'three';
import { MeshBuilder, randUnit, hex } from './core/builder.js';

// 妖根 — braided demon roots. Points are world coordinates; a y given as 'g0.1'
// means "ground height here + 0.1".
const ROOT_BROWN = hex('#5e4c3e');
const ROOT_DARK = hex('#4c3e34');
const PLUM_BARK = hex('#46392f');

const ROOTS = [
  // left root: out of the chasm, over the back rim, up the back-left corner, across the roof, down the front-left
  {
    r0: 0.34, r1: 0.15, strands: 3, twist: 0.2, color: ROOT_BROWN, hang: true,
    pts: [[4.3, -13, -8.2], [4.4, -7, -7.6], [4.35, -2.5, -7.35], [4.3, -0.3, -7.12], [4.3, 0.85, -6.7], [4.35, 0.32, -6.0],
      [4.35, 1.1, -5.5], [4.35, 2.6, -5.5], [4.15, 3.85, -5.8], [4.25, 4.32, -5.0], [4.1, 4.3, -3.8], [3.8, 3.85, -2.8],
      [3.75, 2.6, -2.45], [3.65, 1.4, -2.4], [3.45, 0.55, -2.3], [3.1, 0.25, -1.7], [2.5, 0.18, -1.0], [1.7, 0.12, -0.4], [1.0, -0.3, 0.0]],
  },
  // right root: mirrored path, then across the courtyard and down the east cliff
  {
    r0: 0.36, r1: 0.17, strands: 3, twist: 0.18, color: ROOT_DARK, hang: true,
    pts: [[8.1, -13, -8.4], [8.0, -6, -7.6], [7.95, -1.5, -7.35], [7.95, 0.85, -6.75], [8.05, 0.3, -6.0], [8.05, 1.1, -5.52],
      [8.1, 2.6, -5.52], [8.25, 3.85, -5.8], [8.15, 4.32, -5.15], [7.5, 4.62, -4.75], [7.7, 4.6, -3.6], [8.2, 4.3, -2.95],
      [8.6, 3.8, -2.5], [8.65, 2.5, -2.4], [8.8, 1.3, -2.35], [9.05, 0.5, -2.25], [9.5, 0.22, -1.6], [10.2, 0.18, -0.7],
      [10.9, 0.3, 0.0], [11.55, 0.72, 0.3], [12.15, 0.35, 0.4], [12.35, -2.5, 0.5], [12.4, -7, 0.6], [12.3, -13, 0.7]],
  },
  // central root: straight up the back wall, over the ridge, ending behind the demon head
  {
    r0: 0.3, r1: 0.05, strands: 2, twist: 0.24, color: ROOT_BROWN, hang: true,
    pts: [[6.2, -13, -8.6], [6.3, -5, -7.8], [6.15, -0.5, -7.4], [6.1, 0.85, -6.8], [6.25, 0.3, -6.0], [6.2, 1.0, -5.57],
      [6.3, 2.4, -5.57], [6.2, 3.6, -5.65], [6.1, 4.3, -5.35], [5.95, 4.62, -4.8], [5.85, 4.84, -4.1], [5.55, 4.62, -3.35], [5.2, 4.5, -3.0]],
  },
  // thin roots spiralling down the front of both pillars
  {
    r0: 0.11, r1: 0.06, strands: 1, twist: 0, color: ROOT_BROWN,
    pts: [[4.1, 4.25, -3.5], [4.3, 3.75, -2.85], [4.48, 3.2, -2.9], [4.78, 2.75, -2.68], [5.08, 2.3, -2.85], [4.78, 1.85, -2.67],
      [4.48, 1.4, -2.9], [4.65, 1.0, -2.65], [4.4, 0.45, -2.35], [4.6, 0.38, -1.9]],
  },
  {
    r0: 0.12, r1: 0.06, strands: 1, twist: 0, color: ROOT_DARK,
    pts: [[8.25, 4.25, -3.4], [8.1, 3.7, -2.8], [7.92, 3.15, -2.95], [7.62, 2.7, -2.68], [7.32, 2.25, -2.9], [7.62, 1.8, -2.67],
      [7.92, 1.35, -2.95], [7.7, 0.95, -2.65], [7.95, 0.45, -2.3], [7.8, 0.38, -1.85]],
  },
  // climber: across the courtyard, up the rock outcrop and spiralling up the stone pillar
  {
    r0: 0.22, r1: 0.05, strands: 2, twist: 0.22, color: ROOT_BROWN,
    pts: [[3.1, 0.25, -1.7], [2.4, 0.13, -2.4], [2.05, 0.14, -3.2], [2.3, 0.7, -3.5], [2.25, 2.0, -3.7], [1.95, 3.6, -3.85],
      [1.3, 4.05, -3.85], [0.9, 4.4, -3.6], [1.5, 5.5, -4.35], [1.55, 6.6, -5.6], [0.5, 7.7, -3.5], [-0.8, 8.5, -3.45],
      [-1.9, 9.4, -3.6], [-2.3, 'g0.15', -4.6], [-1.6, 'g0.12', -5.5]],
  },
  // smaller courtyard roots
  {
    r0: 0.2, r1: 0.05, strands: 2, twist: 0.24, color: ROOT_DARK,
    pts: [[9.5, 0.22, -1.6], [9.3, 0.12, 0.0], [8.5, 0.1, 1.4], [7.3, 0.08, 2.1], [6.3, -0.25, 2.4]],
  },
  {
    r0: 0.18, r1: 0.05, strands: 2, twist: 0.22, color: ROOT_BROWN,
    pts: [[2.5, 0.18, -1.0], [2.0, 0.12, 0.6], [1.7, 0.1, 2.3], [1.3, 0.28, 3.8], [1.1, 0.5, 4.7], [1.0, 0.0, 5.4],
      [0.9, -1.6, 5.65], [0.8, -2.42, 6.2], [0.7, -2.7, 6.8]],
  },
  {
    r0: 0.16, r1: 0.04, strands: 1, twist: 0, color: ROOT_DARK,
    pts: [[4.35, 0.3, -6.0], [3.2, 0.1, -6.0], [2.4, 0.15, -5.3], [2.2, -0.2, -4.8]],
  },
  // the old plum's root running along the stair rim and down the cliff
  {
    r0: 0.18, r1: 0.07, strands: 2, twist: 0.22, color: PLUM_BARK,
    pts: [[-12.4, 4.9, 2.1], [-11.6, 5.06, 2.55], [-10.6, 'g0.1', 2.7], [-9.5, 'g0.12', 2.55], [-8.3, 'g0.12', 2.45],
      [-7.1, 'g0.12', 2.6], [-6.4, 'g0.12', 2.9], [-5.6, 'g0.12', 3.2], [-5.3, 1.8, 3.98], [-5.2, 0.0, 4.15], [-5.1, -2.5, 4.2], [-5.0, -6, 4.25]],
  },
  {
    r0: 0.14, r1: 0.05, strands: 1, twist: 0, color: PLUM_BARK,
    pts: [[-12.9, 4.9, 2.4], [-13.1, 4.9, 3.3], [-13.25, 4.3, 4.05], [-13.3, 2.5, 4.25], [-13.2, -0.5, 4.3], [-13.1, -4, 4.35]],
  },
];

// thin tendrils hanging off the roof slab edges
const TENDRILS = [
  [3.92, 3.7, -4.4, 1.6], [3.92, 3.7, -5.1, 2.2], [8.48, 3.7, -4.3, 1.8], [8.48, 3.7, -5.0, 2.4],
  [4.25, 3.68, -2.45, 0.9], [8.1, 3.68, -2.45, 1.1], [3.95, 3.72, -3.2, 1.2],
];

export function buildRoots({ rng, noise, barkMat, groundAt }) {
  const b = new MeshBuilder();
  const resolveY = (x, y, z) => (typeof y === 'string' ? (groundAt(x, z) ?? 0) + parseFloat(y.slice(1)) : y);

  function strandTube(curve, radiusFn, color, radial, uOff) {
    const L = curve.getLength();
    b.addTube(curve, {
      segments: Math.max(8, Math.ceil(L * 9)), radial, radiusFn, color,
      noise, noiseAmp: 0.12, noiseFreq: 2.1, uvOffset: uOff,
    });
  }

  function addRoot(def, seed) {
    const pts = def.pts.map(([x, y, z]) => new THREE.Vector3(x, resolveY(x, y, z), z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const L = curve.getLength();
    const M = Math.max(16, Math.ceil(L * 5));
    const frames = curve.computeFrenetFrames(M, false);
    const endTaper = (u) => Math.min(1, (1 - u) * 14 + 0.12);
    const R = (u) => THREE.MathUtils.lerp(def.r0, def.r1, u) * (1 + 0.1 * Math.sin(u * L * 1.3 + seed)) * endTaper(u);
    const S = def.strands;
    for (let s = 0; s < S; s++) {
      const th0 = (s / S) * Math.PI * 2 + seed;
      const sp = [];
      for (let i = 0; i <= M; i++) {
        const u = i / M;
        const P = curve.getPointAt(u);
        const th = th0 + Math.PI * 2 * def.twist * u * L;
        const off = S > 1 ? R(u) * 0.55 : 0;
        sp.push(P.clone().addScaledVector(frames.normals[i], Math.cos(th) * off).addScaledVector(frames.binormals[i], Math.sin(th) * off));
      }
      const sc = new THREE.CatmullRomCurve3(sp, false, 'catmullrom', 0.5);
      const col = def.color.clone().multiplyScalar(0.88 + 0.24 * rng.next());
      const k = S > 1 ? 0.56 : 1;
      strandTube(sc, (u) => R(u) * k * (1 + 0.09 * Math.sin(u * L * 2.7 + s * 2.1)), col, def.r0 > 0.3 ? 10 : 7, rng.next() * 10);
    }
    // dangling rootlets where the root hangs on a cliff face
    if (def.hang) {
      for (let k = 0; k < 14; k++) {
        const u = rng.range(0.03, 0.5);
        const P = curve.getPointAt(u);
        if (P.y > 0.6 || P.y < -6) continue;
        const start = P.clone().add(randUnit(rng).multiplyScalar(R(u) * 0.7));
        const len = rng.range(0.8, 2.6);
        const pts2 = [start];
        const d = new THREE.Vector3(rng.range(-0.5, 0.5), -1, rng.range(-0.2, 0.6)).normalize();
        const p = start.clone();
        for (let s = 0; s < 5; s++) {
          d.x += rng.range(-0.25, 0.25);
          d.z += rng.range(-0.15, 0.25);
          d.y -= 0.25;
          d.normalize();
          p.addScaledVector(d, len / 5);
          pts2.push(p.clone());
        }
        const r0 = rng.range(0.04, 0.08);
        strandTube(new THREE.CatmullRomCurve3(pts2), (uu) => r0 * (1 - uu * 0.8), def.color.clone().multiplyScalar(0.95), 5, rng.next() * 10);
      }
    }
    return curve;
  }

  ROOTS.forEach((def, i) => addRoot(def, i * 1.7));

  for (const [x, y, z, len] of TENDRILS) {
    const pts = [];
    let px = x, pz = z;
    for (let s = 0; s <= 5; s++) {
      pts.push(new THREE.Vector3(px, y - (len * s) / 5, pz));
      px += rng.range(-0.08, 0.08);
      pz += rng.range(-0.04, 0.1);
    }
    const r0 = rng.range(0.035, 0.06);
    strandTube(new THREE.CatmullRomCurve3(pts), (u) => r0 * (1 - u * 0.75), ROOT_DARK.clone().multiplyScalar(1.1), 5, rng.next() * 10);
  }

  const mesh = new THREE.Mesh(b.build(), barkMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh };
}
