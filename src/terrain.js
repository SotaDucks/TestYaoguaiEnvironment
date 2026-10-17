import * as THREE from 'three';
import { MeshBuilder, hex } from './core/builder.js';

// World layout (1 unit ≈ 1 m). The camera looks from +x/+z, so the path runs from the
// high plateau A (upper-left on screen) down two flights of stairs to courtyard C (lower-right).
const BOTTOM = -15;

export const REGIONS = [
  { id: 'A', kind: 'walk', top: 5.0, pave: 'small', poly: [[-15.5, -3.8], [-12, -4.3], [-10, -4.2], [-10, 3.2], [-12.5, 3.8], [-14.6, 3.3], [-15.6, 1]] },
  { id: 'A2', kind: 'rock', top: 5.75, vary: 0.35, poly: [[-10.2, -4.3], [-6, -4.3], [-5.6, -2.4], [-6.4, -1.0], [-10.2, -1.0]] },
  { id: 'S1', kind: 'stair', rect: [-10, -6, -1, 2], from: 5.0, to: 2.4 },
  { id: 'S1r', kind: 'stairRim', rect: [-10, -6, 2, 3], stair: 'S1' },
  { id: 'B', kind: 'walk', top: 2.4, pave: 'small', poly: [[-6, -2.2], [-3, -2.1], [-3, 3.3], [-4.4, 3.9], [-6.2, 3.4]] },
  { id: 'C', kind: 'walk', top: 0, pave: 'large', poly: [[0, -4.6], [1.2, -6.7], [5, -6.9], [9, -6.7], [11.6, -5.6], [11.9, -2], [11.6, 1.6], [11.2, 4.6], [8, 5.4], [4, 5.3], [0.6, 4.9], [-0.2, 2.3], [-0.1, -1]] },
  { id: 'R', kind: 'rock', top: 3.7, vary: 0.4, poly: [[-6.2, -5.3], [1.4, -5.3], [1.8, -3.9], [1.1, -2.1], [-3, -2.05], [-6.2, -2.25]] },
  { id: 'P', kind: 'rock', top: 10.2, vary: 0.55, poly: [[-3.3, -7.9], [0.7, -7.8], [0.9, -4.4], [-0.6, -4.05], [-3.2, -4.5]] },
  { id: 'S2', kind: 'stair', rect: [-3, 0, -2, 1], from: 2.4, to: 0 },
  { id: 'S2r', kind: 'stairRim', rect: [-3, 0, 1, 2], stair: 'S2' },
  { id: 'L', kind: 'walk', top: -2.4, pave: null, poly: [[-0.8, 5], [6.5, 5.2], [7.2, 7], [4.2, 8.6], [0.6, 8.3], [-1.1, 6.6]] },
  { id: 'W', kind: 'rock', top: 7.6, vary: 0.25, poly: [[3.4, -13.6], [9.2, -13.8], [9.9, -12.2], [9.4, -10.9], [3.1, -10.9], [2.9, -12.4]] },
  { id: 'W2', kind: 'rock', top: 5.9, vary: 0.2, poly: [[3.1, -11.05], [9.5, -11.05], [9.7, -10.2], [8.6, -9.2], [6.2, -9.0], [4.1, -9.3], [3.0, -10.1]] },
];

// Cells of the little stream on top of the back cliff W, ending at the waterfall lip.
export const STREAM_CELLS = [[7, -14, 7.05], [7, -13, 7.05], [7, -12, 7.05], [7, -11, 5.35], [7, -10, 5.35]];
// Cells whose outer face must stay flat because water runs down it.
const FLAT_FACE_CELLS = [[6, -10], [7, -10], [8, -10], [6, -12], [7, -12], [8, -12], [10, 1], [10, 2], [10, 3]];

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function regionContains(r, x, z) {
  if (r.rect) {
    const [x0, x1, z0, z1] = r.rect;
    return x >= x0 && x < x1 && z >= z0 && z < z1;
  }
  return pointInPoly(x, z, r.poly);
}

const STONE = ['#9a968c', '#908d84', '#a39e93', '#959086', '#8a8882', '#9e988c', '#94938b'].map(hex);
const PAVE = ['#aaa497', '#a29d91', '#b2ac9f', '#9d988c', '#a8a59b'].map(hex);
const DEEP = hex('#6a757c');

const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const N4 = N8.slice(0, 4);

export function buildTerrain({ rng, noise, stoneMat, paveMat }) {
  const regionById = Object.fromEntries(REGIONS.map((r) => [r.id, r]));
  for (const r of REGIONS) {
    if (r.kind === 'stair') {
      const [x0, x1] = r.rect;
      r.nRise = Math.round((r.from - r.to) / 0.29);
      r.rise = (r.from - r.to) / r.nRise;
      r.nTreads = r.nRise - 1;
      r.run = (x1 - x0) / r.nTreads;
    }
  }
  for (const r of REGIONS) if (r.kind === 'stairRim') r.stairRef = regionById[r.stair];

  const stairLinear = (r, x) => {
    const [x0, x1] = r.rect;
    const t = THREE.MathUtils.clamp((x - x0) / (x1 - x0), 0, 1);
    return r.from + (r.to - r.from) * t;
  };
  const stairStep = (r, x) => {
    const k = THREE.MathUtils.clamp(Math.ceil((x - r.rect[0]) / r.run), 1, r.nTreads);
    return r.from - k * r.rise;
  };

  // ------------------------------------------------------------ classify cells
  const cells = new Map();
  const K = (i, j) => (i + 500) * 2000 + (j + 500);
  const get = (i, j) => cells.get(K(i, j));
  for (let i = -18; i <= 14; i++) {
    for (let j = -16; j <= 10; j++) {
      const x = i + 0.5, z = j + 0.5;
      let reg = null;
      for (const r of REGIONS) if (regionContains(r, x, z)) reg = r;
      if (reg) cells.set(K(i, j), { i, j, x, z, reg, kind: reg.kind, blocks: [] });
    }
  }
  for (const [i, j, h] of STREAM_CELLS) {
    const c = get(i, j);
    if (c) c.stream = h;
  }
  for (const [i, j] of FLAT_FACE_CELLS) {
    const c = get(i, j);
    if (c) c.noJitter = true;
  }

  for (const c of cells.values()) {
    const r = c.reg;
    c.walkTop = r.kind === 'stair' ? r.from : r.kind === 'stairRim' ? stairLinear(r.stairRef, c.x) : r.top;
  }

  // ------------------------------------------------------------ pass 1: tops
  for (const c of cells.values()) {
    const r = c.reg;
    c.out = [];
    for (const [di, dj] of N4) {
      const n = get(c.i + di, c.j + dj);
      if (!n || n.walkTop < c.walkTop - 0.6) c.out.push([di, dj]);
    }
    let edge8 = false;
    for (const [di, dj] of N8) {
      const n = get(c.i + di, c.j + dj);
      if (!n || n.walkTop < c.walkTop - 0.6) edge8 = true;
    }
    c.edge = edge8;
    if (r.kind === 'walk') {
      if (edge8) {
        c.rim = true;
        const roll = rng.next();
        c.top = r.top + (roll < 0.32 ? rng.range(0.1, 0.36) : roll < 0.82 ? rng.range(-0.03, 0.05) : rng.range(-0.4, -0.16));
        c.surface = c.top;
      } else {
        const pn = noise.noise2(c.x * 0.31 + 3.1, c.z * 0.31 - 1.7);
        c.paved = !!r.pave && pn > -0.3;
        c.top = c.paved ? r.top - 0.15 : r.top + rng.range(-0.06, 0.03);
        c.surface = c.paved ? r.top : c.top;
      }
    } else if (r.kind === 'rock') {
      if (c.stream) {
        c.top = c.stream;
      } else {
        c.top = r.top + r.vary * noise.noise2(c.x * 0.27 + 11, c.z * 0.27 + 7) * 2.2 + rng.range(-0.08, 0.08) - (edge8 ? rng.range(0, 0.3) : 0);
      }
      c.surface = c.top;
    } else if (r.kind === 'stair') {
      c.top = r.to - 0.35;
      c.surface = stairStep(r, c.x);
    } else if (r.kind === 'stairRim') {
      c.top = stairLinear(r.stairRef, c.x) + rng.range(0.15, 0.55);
      c.surface = c.top;
      c.rim = true;
    }
  }

  // ------------------------------------------------------------ pass 2: bottoms
  for (const c of cells.values()) {
    let deep = false, minN = Infinity;
    for (const [di, dj] of N8) {
      const n = get(c.i + di, c.j + dj);
      if (!n) deep = true;
      else minN = Math.min(minN, n.top);
    }
    c.deep = deep;
    c.bottom = deep ? BOTTOM : Math.min(c.top - 1.0, minN - 0.4);
  }

  // ------------------------------------------------------------ geometry
  const rock = new MeshBuilder();
  const pave = new MeshBuilder();
  const spots = { rim: [], ledge: [], ground: [], rock: [], gap: [] };

  const stoneColor = (y) => {
    const col = rng.pick(STONE).clone().multiplyScalar(rng.range(0.9, 1.08));
    const d = THREE.MathUtils.clamp(-y / 12, 0, 1);
    return col.lerp(DEEP, d * 0.4);
  };
  
  function buildColumn(c) {
    let ox = 0, oz = 0;
    for (const [di, dj] of c.out) {
      ox += di;
      oz += dj;
    }
    ox = Math.sign(ox);
    oz = Math.sign(oz);
    c.ox = ox;
    c.oz = oz;
    const face = ox !== 0 || oz !== 0;
    c.face = face;
    const outExt = (b) => (ox > 0 ? b.maxX : ox < 0 ? -b.minX : oz > 0 ? b.maxZ : -b.minZ);
    let y = c.top;
    let first = true;
    let prevExt = null;
    const canJitter = face && !c.noJitter;
    // per-column character: a column keeps its protrusion, width and tone all the way down,
    // which reads as tall basalt-like pillars rather than random cubes
    const colJo = canJitter ? (rng.chance(0.28) ? rng.range(0.14, 0.32) : rng.range(-0.2, 0.06)) : 0;
    const colLw = canJitter ? rng.range(0.95, 1.42) : 1.06 + rng.range(0, 0.08);
    const colLo = canJitter ? rng.range(-0.16, 0.16) : rng.range(-0.03, 0.03);
    const colTone = rng.range(0.82, 1.14);
    const colWarm = rng.range(-1, 1);
    while (y > c.bottom + 0.02) {
      let h;
      if (first) h = c.kind === 'walk' && !c.rim ? 1.0 : face ? rng.range(0.7, 1.6) : rng.range(0.8, 1.6);
      else if (y > -3) h = face ? rng.range(1.4, 3.1) : rng.range(0.9, 1.8);
      else if (y > -8) h = rng.range(2.2, 3.6);
      else h = rng.range(3.0, 4.5);
      let y0 = y - h;
      if (y0 - c.bottom < 0.45) y0 = c.bottom;
      const hh = y - y0;
      const col = stoneColor((y + y0) / 2).multiplyScalar(colTone);
      col.r *= 1 + 0.035 * colWarm;
      col.b *= 1 - 0.035 * colWarm;
      const ao = face ? 0.55 : 0.68;
      const pieces = [];
      if (canJitter && hh < 3.2 && rng.chance(0.15)) {
        const lateralX = ox === 0;
        for (const s of [-0.5, 0.5]) {
          const jo = colJo + rng.range(-0.12, 0.12);
          const lw = 0.55 + rng.range(0, 0.04);
          const along = 1.06 + rng.range(0, 0.06);
          pieces.push(
            lateralX
              ? { cx: c.x + s * 0.5 + ox * jo, cz: c.z + oz * jo, w: lw, d: along }
              : { cx: c.x + ox * jo, cz: c.z + s * 0.5 + oz * jo, w: along, d: lw }
          );
        }
      } else {
        const jo = canJitter ? colJo + (rng.chance(0.12) ? rng.range(-0.18, 0.18) : rng.range(-0.05, 0.05)) : 0;
        const lw = colLw + rng.range(-0.04, 0.04);
        const lo = colLo + rng.range(-0.03, 0.03);
        const along = 1.06 + rng.range(0, 0.08);
        pieces.push({
          cx: c.x + ox * jo + (ox === 0 ? lo : 0),
          cz: c.z + oz * jo + (ox !== 0 ? lo : 0),
          w: ox === 0 ? lw : along,
          d: ox === 0 ? along : lw,
        });
      }
      let ext = -Infinity;
      for (const p of pieces) {
        rock.addChamferBox({
          x: p.cx, y: (y + y0) / 2, z: p.cz, w: p.w, h: hh, d: p.d,
          c: 0.075, ry: rng.range(-0.045, 0.045), color: col, aoBottom: ao,
        });
        const blk = { y0, y1: y, minX: p.cx - p.w / 2, maxX: p.cx + p.w / 2, minZ: p.cz - p.d / 2, maxZ: p.cz + p.d / 2 };
        c.blocks.push(blk);
        if (face) ext = Math.max(ext, outExt(blk));
      }
      if (face && prevExt !== null && y > -4.5 && ext - prevExt > 0.12) {
        const mid = (ext + prevExt) / 2;
        const lat = rng.range(-0.35, 0.35);
        spots.ledge.push({
          x: ox !== 0 ? mid * ox : c.x + lat,
          y,
          z: oz !== 0 && ox === 0 ? mid * oz : c.z + (ox !== 0 ? lat : 0),
          ox, oz,
          depth: ext - prevExt,
        });
      }
      prevExt = ext;
      y = y0;
      first = false;
    }
  }

  for (const c of cells.values()) buildColumn(c);

  // plant spots on tops
  for (const c of cells.values()) {
    if (c.stream) continue;
    const n = c.rim ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const s = { x: c.x + rng.range(-0.38, 0.38), y: c.top, z: c.z + rng.range(-0.38, 0.38), ox: c.ox, oz: c.oz, cell: c };
      if (c.rim) spots.rim.push(s);
      else if (c.kind === 'rock') spots.rock.push(s);
      else if (c.kind === 'walk' && !c.paved) spots.ground.push(s);
      else if (c.paved && rng.chance(0.3)) spots.gap.push({ ...s, y: c.reg.top - 0.02 });
    }
  }

  // ------------------------------------------------------------ paving
  function addTile(cx, cz, w, d, top) {
    const color = rng.pick(PAVE).clone().multiplyScalar(rng.range(0.9, 1.07));
    const t = 0.17;
    const ty = top + rng.range(-0.012, 0.028);
    const tilt = () => rng.range(-0.012, 0.012);
    if (rng.chance(0.07)) {
      const alongX = w > d;
      const f = rng.range(0.4, 0.6);
      const g = 0.03;
      const a = (alongX ? w : d) * f - g / 2, b = (alongX ? w : d) * (1 - f) - g / 2;
      const off0 = -(alongX ? w : d) / 2 + a / 2, off1 = (alongX ? w : d) / 2 - b / 2;
      for (const [len, off] of [[a, off0], [b, off1]]) {
        pave.addChamferBox({
          x: cx + (alongX ? off : 0), y: ty - t / 2 - rng.range(0, 0.03), z: cz + (alongX ? 0 : off),
          w: alongX ? len : w, h: t, d: alongX ? d : len, c: 0.045,
          ry: rng.range(-0.04, 0.04), rx: tilt() * 2, rz: tilt() * 2, color, aoBottom: 0.55,
        });
      }
    } else {
      pave.addChamferBox({
        x: cx, y: ty - t / 2, z: cz, w, h: t, d, c: 0.045,
        ry: rng.range(-0.025, 0.025), rx: tilt(), rz: tilt(), color, aoBottom: 0.55,
      });
    }
  }

  function buildPaving(region) {
    const large = region.pave === 'large';
    let xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
    for (const c of cells.values()) {
      if (c.reg !== region || !c.paved) continue;
      xmin = Math.min(xmin, c.i);
      xmax = Math.max(xmax, c.i + 1);
      zmin = Math.min(zmin, c.j);
      zmax = Math.max(zmax, c.j + 1);
    }
    const pavedAt = (x, z) => {
      const c = get(Math.floor(x), Math.floor(z));
      return !!c && c.reg === region && c.paved;
    };
    const fits = (x, z, len, rd) =>
      pavedAt(x + 0.06, z + 0.06) && pavedAt(x + len - 0.06, z + 0.06) &&
      pavedAt(x + 0.06, z + rd - 0.06) && pavedAt(x + len - 0.06, z + rd - 0.06) &&
      pavedAt(x + len / 2, z + rd / 2);
    for (let z = zmin; z < zmax - 0.2; ) {
      const rd = large ? rng.range(0.8, 1.05) : rng.range(0.55, 0.78);
      let x = xmin - rng.range(0, 0.6);
      while (x < xmax) {
        let len = large ? rng.range(0.8, 1.4) : rng.range(0.5, 1.0);
        if (!fits(x, z, len, rd) && fits(x, z, len * 0.5, rd)) len *= 0.5;
        if (fits(x, z, len, rd) && !rng.chance(0.03)) addTile(x + len / 2, z + rd / 2, len - 0.055, rd - 0.055, region.top);
        x += len;
      }
      z += rd;
    }
  }
  for (const r of REGIONS) if (r.kind === 'walk' && r.pave) buildPaving(r);

  // ------------------------------------------------------------ stairs
  for (const r of REGIONS) {
    if (r.kind !== 'stair') continue;
    const [x0, , z0, z1] = r.rect;
    for (let k = 1; k <= r.nTreads; k++) {
      const top = r.from - k * r.rise;
      const xa = x0 + (k - 1) * r.run, xb = x0 + k * r.run;
      let z = z0 + 0.02;
      while (z < z1 - 0.05) {
        let w = rng.range(0.75, 1.5);
        if (z1 - (z + w) < 0.45) w = z1 - z - 0.02;
        const color = rng.pick(PAVE).clone().multiplyScalar(rng.range(0.88, 1.05));
        const th = 0.55;
        const ty = top + rng.range(-0.015, 0.015);
        pave.addChamferBox({
          x: (xa + xb) / 2 + rng.range(-0.02, 0.02), y: ty - th / 2, z: z + w / 2,
          w: xb - xa + 0.03, h: th, d: w - 0.035, c: 0.05,
          ry: rng.range(-0.02, 0.02), color, aoBottom: 0.5,
        });
        z += w;
      }
    }
  }

  // ------------------------------------------------------------ rubble
  const rubbleSpots = [...spots.rim, ...spots.ground, ...spots.rock];
  for (let k = 0; k < 70; k++) {
    const s = rng.pick(rubbleSpots);
    const sz = rng.range(0.14, 0.42);
    rock.addChamferBox({
      x: s.x + rng.range(-0.3, 0.3), y: s.y + sz * 0.3, z: s.z + rng.range(-0.3, 0.3),
      w: sz * rng.range(0.9, 1.5), h: sz * rng.range(0.6, 1.0), d: sz * rng.range(0.9, 1.4),
      c: 0.05, rx: rng.range(-0.25, 0.25), ry: rng.range(0, Math.PI), rz: rng.range(-0.25, 0.25),
      color: stoneColor(1), aoBottom: 0.6,
    });
  }
  // a few big fallen blocks in the courtyard corner and on the plateau
  const fallen = [
    [1.6, -1.6, 0.9, 0.55, 0.7, 0.4], [2.6, 3.9, 0.7, 0.45, 0.6, -0.3], [-14.2, 0.2, 0.8, 0.5, 0.65, 0.7],
    [-11.0, -3.4, 0.7, 0.5, 0.6, 0.2], [10.6, 3.6, 0.6, 0.4, 0.55, 0.9],
  ];
  for (const [x, z, w, h, d, ry] of fallen) {
    const gy = groundAt(x, z) ?? 0;
    rock.addChamferBox({ x, y: gy + h / 2 - 0.05, z, w, h, d, c: 0.07, ry, rx: rng.range(-0.08, 0.08), rz: rng.range(-0.1, 0.1), color: stoneColor(1), aoBottom: 0.5 });
  }

  function groundAt(x, z) {
    const c = get(Math.floor(x), Math.floor(z));
    if (!c) return null;
    if (c.kind === 'stair') return stairStep(c.reg, x);
    return c.surface;
  }

  // Outer face coordinate of a column at height y (along its outward axis), or null.
  function faceAt(c, y) {
    let best = -Infinity;
    for (const b of c.blocks) {
      if (y < b.y0 - 1e-3 || y > b.y1 + 1e-3) continue;
      const e = c.ox > 0 ? b.maxX : c.ox < 0 ? -b.minX : c.oz > 0 ? b.maxZ : -b.minZ;
      best = Math.max(best, e);
    }
    if (best === -Infinity) return null;
    const sign = c.ox !== 0 ? c.ox : c.oz;
    return best * sign;
  }

  const rockMesh = new THREE.Mesh(rock.build(), stoneMat);
  rockMesh.castShadow = true;
  rockMesh.receiveShadow = true;
  const paveMesh = new THREE.Mesh(pave.build(), paveMat);
  paveMesh.castShadow = true;
  paveMesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(rockMesh, paveMesh);

  return { group, cells, get, groundAt, faceAt, spots, regionById };
}
