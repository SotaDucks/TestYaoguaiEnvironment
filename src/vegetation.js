import * as THREE from 'three';
import { MeshBuilder, randUnit, hex } from './core/builder.js';
import { shared } from './materials.js';

const UP = new THREE.Vector3(0, 1, 0);
const XA = new THREE.Vector3(1, 0, 0);
const _rv = new THREE.Vector3();
const _ax = new THREE.Vector3();

// ------------------------------------------------------------------ tree growth
function growTree(rng, noise, bark, spec) {
  const tips = [];
  const twigs = [];
  function branch(p0, dir, len, r0, depth) {
    const segs = Math.max(3, Math.ceil(len / spec.segLen));
    const pts = [p0.clone()];
    const d = dir.clone().normalize();
    const p = p0.clone();
    for (let s = 1; s <= segs; s++) {
      randUnit(rng, _rv);
      d.addScaledVector(_rv, spec.gnarl);
      d.y += spec.upBias - spec.droop * (depth / spec.maxDepth);
      if (spec.lean && depth === 0) d.addScaledVector(spec.lean, 0.08);
      d.normalize();
      p.addScaledVector(d, len / segs);
      pts.push(p.clone());
    }
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const r1 = Math.max(r0 * spec.taper, spec.minR);
    const flare = depth === 0 ? spec.flare : 0;
    bark.addTube(curve, {
      segments: segs * 3,
      radial: depth === 0 ? 10 : depth === 1 ? 7 : 5,
      radiusFn: (u) => THREE.MathUtils.lerp(r0, r1, u) * (1 + flare * Math.pow(Math.max(0, 1 - u * 5), 2)),
      color: spec.barkColor.clone().multiplyScalar(rng.range(0.9, 1.1)),
      noise, noiseAmp: depth === 0 ? 0.16 : 0.08, noiseFreq: 3.2,
    });
    if (depth < spec.maxDepth) {
      const n = depth === 0 ? spec.trunkChildren : rng.int(spec.minChildren, spec.maxChildren);
      for (let k = 0; k < n; k++) {
        const t = depth === 0 ? rng.range(spec.trunkSplit, 0.97) : rng.range(0.35, 0.95);
        const pos = curve.getPointAt(t);
        const tan = curve.getTangentAt(t);
        randUnit(rng, _rv);
        _ax.crossVectors(tan, _rv).normalize();
        const cd = tan.clone().applyAxisAngle(_ax, rng.range(spec.angleMin, spec.angleMax));
        if (spec.flatten) cd.y *= spec.flatten;
        cd.normalize();
        const rAt = THREE.MathUtils.lerp(r0, r1, t);
        branch(pos, cd, len * rng.range(spec.lenMin, spec.lenMax), rAt * rng.range(0.55, 0.78), depth + 1);
      }
    }
    if (depth >= spec.maxDepth - 1) twigs.push({ curve, depth });
    if (depth >= spec.maxDepth - (spec.padUpper ? 1 : 0)) tips.push({ p: p.clone(), depth });
  }
  branch(spec.base.clone(), spec.dir.clone(), spec.height, spec.radius, 0);
  return { tips, twigs };
}

// ------------------------------------------------------------------ foliage helpers
function randomBasis(rng, n) {
  const f = n.clone().addScaledVector(randUnit(rng, _rv), 0.85).normalize();
  const t1 = new THREE.Vector3().crossVectors(f, Math.abs(f.y) < 0.95 ? UP : XA).normalize();
  const t2 = new THREE.Vector3().crossVectors(f, t1).normalize();
  const a = rng.next() * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  const r1 = t1.clone().multiplyScalar(c).addScaledVector(t2, s);
  const r2 = t1.clone().multiplyScalar(-s).addScaledVector(t2, c);
  return [r1, r2];
}

function addPad(blob, cards, rng, noise, c, r, flat, pal, density, cardSize) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise.noise3(v.x * 1.6 + c.x, v.y * 1.6 + c.y, v.z * 1.6 + c.z);
    const s = 0.8 * (1 + 0.22 * n);
    pos.setXYZ(i, v.x * r * s, v.y * r * flat * s, v.z * r * s);
  }
  g.computeVertexNormals();
  const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z);
  blob.addGeometry(g, m, (wp, local, n) => pal.dark.clone().lerp(pal.mid, THREE.MathUtils.clamp(n.y * 0.5 + 0.45, 0, 1)));
  const count = Math.round(density * r * r);
  for (let k = 0; k < count; k++) {
    const d = randUnit(rng, new THREE.Vector3());
    if (d.y < -0.2 && rng.chance(0.55)) d.y = -d.y * 0.4;
    d.normalize();
    const rr = rng.range(0.72, 1.04);
    const p = new THREE.Vector3(c.x + d.x * r * rr, c.y + d.y * r * flat * rr, c.z + d.z * r * rr);
    const n = new THREE.Vector3(d.x / r, d.y / (r * flat), d.z / r).normalize();
    const shade = THREE.MathUtils.clamp(n.y * 0.55 + 0.45 + rng.range(-0.12, 0.12), 0, 1);
    const col = pal.dark.clone().lerp(pal.light, shade).multiplyScalar(rng.range(0.9, 1.1));
    const [t1, t2] = randomBasis(rng, n);
    cards.addCard(p, t1, t2, n.lerp(UP, 0.22).normalize(), col, cardSize * rng.range(0.8, 1.2));
  }
}

const PINE_PAL = { dark: hex('#1b2a1b'), mid: hex('#2c4127'), light: hex('#6d8a4a') };
const PINE_PAL2 = { dark: hex('#1d2c1e'), mid: hex('#30472c'), light: hex('#7a9150') };
const SHRUB_PALS = [
  { dark: hex('#223319'), mid: hex('#35502a'), light: hex('#7f9a4b') },
  { dark: hex('#2a3518'), mid: hex('#46572a'), light: hex('#9aa556') },
  { dark: hex('#1c2b1f'), mid: hex('#2b4430'), light: hex('#5f8556') },
];
const BLOSSOM = ['#f2b4c4', '#eb9cb2', '#f7d0db', '#e3859e', '#f9e2e8', '#efa6ba'].map(hex);

// ------------------------------------------------------------------ public
export function buildVegetation({ rng, noise, terrain, barkMat, tex, foliageMats, extraSpots = [] }) {
  const group = new THREE.Group();
  const bark = new MeshBuilder();
  const pineBlob = new MeshBuilder();
  const pineCards = new MeshBuilder();
  const shrubBlob = new MeshBuilder();
  const shrubCards = new MeshBuilder();
  const blossomCards = new MeshBuilder();
  const blossomOrigins = [];
  const g = (x, z, d = 0) => (terrain.groundAt(x, z) ?? 0) + d;

  // ---------------- pines (cloud-pruned, horizontal pads)
  const pines = [
    { x: -13.7, z: -2.9, h: 3.4, r: 0.26, lean: [0.3, 0, 0.5] },
    { x: 1.3, z: 4.15, h: 2.6, r: 0.2, lean: [-0.2, 0, 0.9] },
    { x: 4.2, z: 7.3, h: 3.0, r: 0.22, lean: [0.4, 0, 0.6] },
    { x: 4.0, z: -12.3, h: 2.8, r: 0.22, lean: [-0.3, 0, 0.4] },
    { x: 8.6, z: -12.9, h: 3.4, r: 0.25, lean: [0.2, 0, 0.3] },
    { x: -4.6, z: -4.5, h: 2.2, r: 0.18, lean: [0.2, 0, 0.6] },
    { x: 10.7, z: -4.7, h: 2.5, r: 0.2, lean: [0.7, 0, 0.2] },
    { x: -8.3, z: -3.6, h: 1.8, r: 0.15, lean: [0.2, 0, 0.6] },
    { x: 9.3, z: -10.1, h: 1.9, r: 0.16, lean: [0.5, 0, 0.6] },
  ];
  for (const p of pines) {
    const lean = new THREE.Vector3(...p.lean).normalize();
    const spec = {
      base: new THREE.Vector3(p.x, g(p.x, p.z, -0.15), p.z),
      dir: new THREE.Vector3(lean.x * 0.35, 1, lean.z * 0.35),
      lean,
      height: p.h, radius: p.r,
      segLen: 0.32, gnarl: 0.3, upBias: 0.05, droop: 0.12, taper: 0.5, minR: 0.022, flare: 0.8,
      maxDepth: 2, trunkChildren: 5, trunkSplit: 0.3, minChildren: 2, maxChildren: 3,
      angleMin: 0.7, angleMax: 1.2, flatten: 0.4, lenMin: 0.45, lenMax: 0.7, padUpper: true,
      barkColor: hex('#5b4a3c'),
    };
    const { tips } = growTree(rng, noise, bark, spec);
    const pal = rng.chance(0.5) ? PINE_PAL : PINE_PAL2;
    const top = Math.max(...tips.map((t) => t.p.y));
    for (const t of tips) {
      const s = p.h / 3.2;
      const r = rng.range(0.5, 0.85) * s * (t.depth < 2 ? 1.15 : 1);
      addPad(pineBlob, pineCards, rng, noise, t.p.clone().add(new THREE.Vector3(0, 0.1, 0)), r, 0.48, pal, 58, 0.5 * Math.sqrt(s));
    }
    // crown pad
    const crown = tips.reduce((a, t) => (t.p.y > a.p.y ? t : a), tips[0]);
    addPad(pineBlob, pineCards, rng, noise, crown.p.clone().add(new THREE.Vector3(0, 0.15, 0)), 0.75 * (p.h / 3.2), 0.55, pal, 58, 0.5);
    void top;
  }

  // ---------------- plum trees (gnarled, blossoming)
  const plums = [
    { x: -12.6, z: 2.0, h: 3.1, r: 0.36, lean: [-0.35, 0, 0.8], depth: 4, kids: 4, scale: 1.25 },
    { x: -4.7, z: 2.75, h: 2.1, r: 0.24, lean: [-0.2, 0, 1], depth: 4, kids: 3, scale: 0.9 },
    { x: -1.6, z: -6.6, h: 1.4, r: 0.17, lean: [0.4, 0, 0.7], depth: 3, kids: 3, scale: 0.6 },
    { x: 0.4, z: 6.7, h: 1.3, r: 0.15, lean: [-0.5, 0, 0.6], depth: 3, kids: 3, scale: 0.55 },
    { x: 2.8, z: 4.4, h: 1.0, r: 0.12, lean: [0.2, 0, 1], depth: 3, kids: 2, scale: 0.45 },
  ];
  for (const p of plums) {
    const lean = new THREE.Vector3(...p.lean).normalize();
    const spec = {
      base: new THREE.Vector3(p.x, g(p.x, p.z, -0.12), p.z),
      dir: new THREE.Vector3(lean.x * 0.7, 1, lean.z * 0.7),
      lean,
      height: p.h, radius: p.r,
      segLen: 0.22, gnarl: 0.42, upBias: 0.07, droop: 0.04, taper: 0.48, minR: 0.012, flare: 0.9,
      maxDepth: p.depth, trunkChildren: p.kids, trunkSplit: 0.5, minChildren: 2, maxChildren: 3,
      angleMin: 0.4, angleMax: 0.95, flatten: 0.85, lenMin: 0.6, lenMax: 0.82,
      barkColor: hex('#57443a'),
    };
    const { twigs } = growTree(rng, noise, bark, spec);
    const center = new THREE.Vector3();
    let cnt = 0;
    for (const tw of twigs) {
      center.add(tw.curve.getPointAt(0.7));
      cnt++;
    }
    center.multiplyScalar(1 / Math.max(1, cnt));
    const spacing = p.scale >= 1 ? 0.042 : 0.055;
    for (const tw of twigs) {
      const L = tw.curve.getLength();
      const n = Math.ceil(L / spacing);
      for (let k = 0; k < n; k++) {
        const u = (k + rng.next()) / n;
        if (u < 0.12 || rng.chance(0.15)) continue;
        const pt = tw.curve.getPointAt(u).add(randUnit(rng, _rv).multiplyScalar(rng.range(0.03, 0.16) * p.scale + 0.03));
        const nrm = pt.clone().sub(center).normalize().lerp(UP, 0.35).normalize();
        const col = rng.pick(BLOSSOM).clone().multiplyScalar(rng.range(0.92, 1.05));
        const [t1, t2] = randomBasis(rng, nrm);
        blossomCards.addCard(pt, t1, t2, nrm, col, rng.range(0.22, 0.38) * (0.6 + 0.4 * p.scale));
        if (rng.chance(0.08)) blossomOrigins.push(pt.clone());
      }
      const tip = tw.curve.getPointAt(1);
      for (let k = 0; k < 10; k++) {
        const pt = tip.clone().add(randUnit(rng, _rv).multiplyScalar(rng.range(0.05, 0.3) * (0.6 + 0.4 * p.scale)));
        const nrm = pt.clone().sub(center).normalize().lerp(UP, 0.35).normalize();
        const [t1, t2] = randomBasis(rng, nrm);
        blossomCards.addCard(pt, t1, t2, nrm, rng.pick(BLOSSOM).clone(), rng.range(0.22, 0.36) * (0.6 + 0.4 * p.scale));
      }
    }
  }

  // ---------------- shrubs on rims, rock tops and ledges
  const { spots } = terrain;
  const shrubSpots = [
    ...spots.rim.filter(() => rng.chance(0.34)),
    ...spots.rock.filter(() => rng.chance(0.3)),
    ...spots.ground.filter(() => rng.chance(0.16)),
    ...spots.ledge.filter(() => rng.chance(0.22)),
  ];
  for (const s of shrubSpots) {
    if (nearShrine(s.x, s.z) || onPath(s.x, s.z)) continue;
    const r = rng.range(0.3, 0.62) * (s.cell && s.cell.rim ? 1.1 : 1);
    const pal = rng.pick(SHRUB_PALS);
    // irregular clump: a main pad plus a few smaller satellites
    const n = rng.int(1, 3);
    for (let k = 0; k <= n; k++) {
      const rr = k === 0 ? r : r * rng.range(0.45, 0.75);
      const a = rng.next() * Math.PI * 2;
      const off = k === 0 ? 0 : r * rng.range(0.55, 0.9);
      const c = new THREE.Vector3(s.x + Math.cos(a) * off, s.y + rr * 0.3 + (k === 0 ? 0 : rng.range(-0.05, r * 0.4)), s.z + Math.sin(a) * off);
      addPad(shrubBlob, shrubCards, rng, noise, c, rr, rng.range(0.55, 0.8), pal, 80, 0.3);
    }
  }

  // ---------------- hanging vines on visible cliff faces
  const vineCards = shrubCards;
  const faceCells = [...terrain.cells.values()].filter((c) => c.face && c.deep && (c.ox > 0 || c.oz > 0) && !c.noJitter && !c.stream);
  for (const c of faceCells) {
    if (!rng.chance(0.28)) continue;
    const len = rng.range(1.0, 4.6);
    let lat = rng.range(-0.35, 0.35);
    const pal = rng.pick(SHRUB_PALS);
    for (let s = 0; s * 0.2 < len; s++) {
      const y = c.top - 0.04 - s * 0.2;
      const f = terrain.faceAt(c, y);
      if (f === null) break;
      lat += rng.range(-0.05, 0.05);
      const pos = c.ox !== 0 ? new THREE.Vector3(f + c.ox * 0.05, y, c.z + lat) : new THREE.Vector3(c.x + lat, y, f + c.oz * 0.05);
      const nrm = new THREE.Vector3(c.ox, 0.35, c.oz).normalize();
      const thin = 1 - (s * 0.2) / len;
      const leaves = thin > 0.5 ? 2 : 1;
      for (let k = 0; k < leaves; k++) {
        const p2 = pos.clone().add(new THREE.Vector3(rng.range(-0.1, 0.1), rng.range(-0.08, 0.08), rng.range(-0.1, 0.1)));
        if (c.ox !== 0) p2.x = pos.x + c.ox * rng.range(0.02, 0.1);
        else p2.z = pos.z + c.oz * rng.range(0.02, 0.1);
        const col = pal.mid.clone().lerp(pal.light, rng.range(0.1, 0.6));
        const [t1, t2] = randomBasis(rng, nrm);
        vineCards.addCard(p2, t1, t2, nrm, col, rng.range(0.2, 0.32) * (0.6 + 0.4 * thin));
      }
    }
  }

  // ---------------- meshes
  const barkMesh = new THREE.Mesh(bark.build(), barkMat);
  barkMesh.castShadow = true;
  barkMesh.receiveShadow = true;
  group.add(barkMesh);

  const blobMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  for (const bb of [pineBlob, shrubBlob]) {
    const m = new THREE.Mesh(bb.build(), blobMat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  const addCards = (builder, fm) => {
    const m = new THREE.Mesh(builder.build(), fm.mat);
    m.customDepthMaterial = fm.depth;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  addCards(pineCards, foliageMats.needle);
  addCards(shrubCards, foliageMats.leaf);
  addCards(blossomCards, foliageMats.blossom);

  // ---------------- ground cover (instanced)
  const fernGeo = fernGeometry(rng);
  const grassGeo = grassGeometry(rng);
  const fernSpots = [...spots.rim, ...spots.ledge, ...spots.rock, ...spots.ground].filter((s) => !nearShrine(s.x, s.z) && !onPath(s.x, s.z));
  const grassSpots = [...spots.rim, ...spots.ledge, ...spots.ground, ...spots.gap, ...spots.rock].filter((s) => !onPath(s.x, s.z) || rng.chance(0.3));
  for (const e of extraSpots) (e.kind === 'fern' ? fernSpots : grassSpots).push(e);
  const ferns = instanced(fernGeo, foliageMats.fern, fernSpots.filter(() => rng.chance(0.42)), rng, [0.55, 1.05], [hex('#3f5a2e'), hex('#5d7a3a'), hex('#34502f')]);
  const grass = instanced(grassGeo, foliageMats.grass, grassSpots.filter(() => rng.chance(0.75)), rng, [0.5, 1.0], [hex('#6c7d3e'), hex('#87914a'), hex('#5a6e38')]);
  group.add(ferns, grass);

  return { group, blossomOrigins };
}

// keep the shrine front and the walking line clear
function nearShrine(x, z) {
  return x > 3.2 && x < 9.2 && z > -5.6 && z < -0.6;
}
function onPath(x, z) {
  if (x > -10 && x < 0.5 && z > -1.2 && z < 2.1) return true;
  if (x > 0 && x < 6 && z > -1.5 && z < 2.6) return true;
  return false;
}

function instanced(geo, fm, spots, rng, scaleRange, colors) {
  const mesh = new THREE.InstancedMesh(geo, fm.mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  spots.forEach((sp, i) => {
    const sc = rng.range(scaleRange[0], scaleRange[1]);
    s.set(sc, sc * rng.range(0.85, 1.2), sc);
    q.setFromEuler(new THREE.Euler(rng.range(-0.12, 0.12), rng.range(0, Math.PI * 2), rng.range(-0.12, 0.12)));
    p.set(sp.x + rng.range(-0.15, 0.15), sp.y - 0.02, sp.z + rng.range(-0.15, 0.15));
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, rng.pick(colors).clone().multiplyScalar(rng.range(0.85, 1.15)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

function fernGeometry(rng) {
  const b = new MeshBuilder();
  const white = new THREE.Color(1, 1, 1);
  const fronds = 7;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const L = rng.range(0.45, 0.7);
    const elev = rng.range(0.55, 0.95);
    const w = 0.2;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const base = b.vertexCount;
    const rows = 6;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const spine = dir.clone().multiplyScalar(L * t * Math.cos(elev)).add(new THREE.Vector3(0, L * t * Math.sin(elev) - 0.55 * L * t * t, 0));
      const nrm = UP.clone().multiplyScalar(0.85).addScaledVector(dir, 0.35).normalize();
      for (const sgn of [-1, 1]) {
        const v = spine.clone().addScaledVector(side, (sgn * w) / 2);
        b.vert(v, nrm, white, sgn < 0 ? 0 : 1, t);
      }
    }
    for (let i = 0; i < rows; i++) {
      const a0 = base + i * 2;
      b.idx.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2);
    }
  }
  return b.build();
}

function grassGeometry(rng) {
  const b = new MeshBuilder();
  const white = new THREE.Color(1, 1, 1);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI + rng.range(-0.2, 0.2);
    const side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const bend = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(rng.range(-0.08, 0.08));
    const w = 0.5, h = 0.42;
    const base = b.vertexCount;
    for (let i = 0; i <= 2; i++) {
      const t = i / 2;
      const c = new THREE.Vector3(0, h * t, 0).addScaledVector(bend, t * t);
      for (const sgn of [-1, 1]) {
        b.vert(c.clone().addScaledVector(side, (sgn * w) / 2), UP, white, sgn < 0 ? 0 : 1, t);
      }
    }
    for (let i = 0; i < 2; i++) {
      const a0 = base + i * 2;
      b.idx.push(a0, a0 + 1, a0 + 3, a0, a0 + 3, a0 + 2);
    }
  }
  return b.build();
}

// ------------------------------------------------------------------ falling petals
export function buildPetals({ rng, origins, petalTex, count = 240 }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const o = origins.length ? rng.pick(origins) : new THREE.Vector3();
    pos[i * 3] = o.x + rng.range(-0.4, 0.4);
    pos[i * 3 + 1] = o.y + rng.range(-0.2, 0.3);
    pos[i * 3 + 2] = o.z + rng.range(-0.4, 0.4);
    seed[i * 4] = rng.next();
    seed[i * 4 + 1] = rng.range(0.6, 1.3);
    seed[i * 4 + 2] = rng.range(1.0, 2.6);
    seed[i * 4 + 3] = rng.range(0.16, 0.26);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uMap: { value: null }, uScale: { value: 8 } },
    ]),
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uScale;
      attribute vec4 aSeed;
      varying float vA; varying float vRot;
      #include <fog_pars_vertex>
      void main() {
        float life = 9.0;
        float t = fract(uTime / life * aSeed.y + aSeed.x);
        float tt = t * life;
        vec3 p = position;
        p.y -= tt * 0.42 * aSeed.y;
        p.xz += vec2(0.55, 0.32) * tt * 0.5 + vec2(sin(tt * aSeed.z + aSeed.x * 6.28), cos(tt * aSeed.z * 0.8 + aSeed.x * 3.0)) * 0.3;
        vA = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.7, 1.0, t));
        vRot = tt * aSeed.z + aSeed.x * 10.0;
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_PointSize = max(1.0, aSeed.w * uScale);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying float vA; varying float vRot;
      #include <fog_pars_fragment>
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float cs = cos(vRot), sn = sin(vRot);
        c = mat2(cs, -sn, sn, cs) * c;
        c.x *= 1.0 + 0.6 * abs(sin(vRot * 0.7));
        vec4 tx = texture2D(uMap, c + 0.5);
        if (tx.a * vA < 0.35) discard;
        gl_FragColor = vec4(tx.rgb * vec3(0.95, 0.72, 0.8), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    transparent: false,
  });
  mat.uniforms.uTime = shared.uTime;
  mat.uniforms.uMap.value = petalTex;
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return {
    points: pts,
    setPointScale(s) {
      mat.uniforms.uScale.value = s;
    },
  };
}
