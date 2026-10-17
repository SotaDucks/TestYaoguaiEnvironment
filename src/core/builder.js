import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _col = new THREE.Color();

const QUAD_ORDER = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

// Accumulates indexed geometry (position / normal / color / uv) from many small pieces
// so a whole cliff, a tree or the shrine ends up as a single draw call.
export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.uv = [];
    this.idx = [];
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  vert(p, n, c, u = 0, v = 0) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
    return this.vertexCount - 1;
  }

  // Box with chamfered edges. Colors get a vertical ambient-occlusion gradient.
  addChamferBox(o) {
    const hw = o.w / 2, hh = o.h / 2, hd = o.d / 2;
    const c = Math.min(o.c ?? 0.06, hw * 0.45, hh * 0.45, hd * 0.45);
    const skipBottom = o.skipBottom !== false;
    const aoB = o.aoBottom ?? 0.6, aoT = o.aoTop ?? 1.0;
    _m.makeRotationFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0));
    _m.setPosition(o.x, o.y, o.z);
    _nm.getNormalMatrix(_m);
    const color = o.color;

    const P = (axis, sx, sy, sz) =>
      axis === 0
        ? [sx * hw, sy * (hh - c), sz * (hd - c)]
        : axis === 1
          ? [sx * (hw - c), sy * hh, sz * (hd - c)]
          : [sx * (hw - c), sy * (hh - c), sz * hd];

    const emit = (pts, out) => {
      _n.set(out[0], out[1], out[2]).normalize().applyMatrix3(_nm).normalize();
      const tp = pts.map((p) => {
        const ao = aoB + (aoT - aoB) * ((p[1] + hh) / (2 * hh));
        return { v: new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(_m), ao };
      });
      _a.subVectors(tp[1].v, tp[0].v);
      _b.subVectors(tp[2].v, tp[0].v);
      _c.crossVectors(_a, _b);
      if (_c.dot(_n) < 0) tp.reverse();
      const base = this.vertexCount;
      for (const t of tp) {
        _col.setRGB(color.r * t.ao, color.g * t.ao, color.b * t.ao);
        this.vert(t.v, _n, _col);
      }
      for (let k = 1; k < tp.length - 1; k++) this.idx.push(base, base + k, base + k + 1);
    };

    // faces
    for (let axis = 0; axis < 3; axis++) {
      for (const s of [-1, 1]) {
        if (axis === 1 && s === -1 && skipBottom) continue;
        const others = [0, 1, 2].filter((k) => k !== axis);
        const pts = QUAD_ORDER.map(([a, b]) => {
          const sg = [0, 0, 0];
          sg[axis] = s;
          sg[others[0]] = a;
          sg[others[1]] = b;
          return P(axis, sg[0], sg[1], sg[2]);
        });
        const out = [0, 0, 0];
        out[axis] = s;
        emit(pts, out);
      }
    }
    // edges
    for (const [a1, a2] of [[0, 1], [0, 2], [1, 2]]) {
      const a3 = 3 - a1 - a2;
      for (const s1 of [-1, 1]) {
        for (const s2 of [-1, 1]) {
          if (skipBottom && ((a1 === 1 && s1 === -1) || (a2 === 1 && s2 === -1))) continue;
          const pts = [[a1, -1], [a1, 1], [a2, 1], [a2, -1]].map(([ax, s3]) => {
            const sg = [0, 0, 0];
            sg[a1] = s1;
            sg[a2] = s2;
            sg[a3] = s3;
            return P(ax, sg[0], sg[1], sg[2]);
          });
          const out = [0, 0, 0];
          out[a1] = s1;
          out[a2] = s2;
          emit(pts, out);
        }
      }
    }
    // corners
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      if (skipBottom && sy === -1) continue;
      emit([P(0, sx, sy, sz), P(1, sx, sy, sz), P(2, sx, sy, sz)], [sx, sy, sz]);
    }
  }

  // Tube with variable radius along a curve. uv.x = arc length (world units), uv.y = angle (0..1).
  addTube(curve, o) {
    const segments = o.segments ?? 32;
    const radial = o.radial ?? 8;
    const frames = curve.computeFrenetFrames(segments, false);
    const len = curve.getLength();
    const base = this.vertexCount;
    const noise = o.noise;
    const amp = o.noiseAmp ?? 0.08;
    const freq = o.noiseFreq ?? 2.2;
    const uOff = o.uvOffset ?? 0;
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const P = curve.getPointAt(u);
      const N = frames.normals[i], B = frames.binormals[i];
      const r = o.radiusFn(u);
      for (let j = 0; j <= radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        _n.set(N.x * ca + B.x * sa, N.y * ca + B.y * sa, N.z * ca + B.z * sa);
        let rr = r;
        if (noise) rr *= 1 + amp * noise.noise3(P.x * freq + _n.x * 0.7, P.y * freq + _n.y * 0.7, P.z * freq + _n.z * 0.7);
        _v.copy(P).addScaledVector(_n, rr);
        const c = typeof o.color === 'function' ? o.color(u, j / radial) : o.color;
        this.vert(_v, _n, c, uOff + u * len, j / radial);
      }
    }
    const row = radial + 1;
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < radial; j++) {
        const a = base + i * row + j;
        const b = a + row;
        this.idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    return len;
  }

  // Append an existing BufferGeometry with a transform and a color (or color function).
  addGeometry(geo, matrix, color, aoFn) {
    const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = this.vertexCount;
    const local = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      local.fromBufferAttribute(pos, i);
      _v.copy(local).applyMatrix4(matrix);
      _n.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
      let c = typeof color === 'function' ? color(_v, local, _n) : color;
      if (aoFn) {
        const ao = aoFn(local, _n);
        _col.setRGB(c.r * ao, c.g * ao, c.b * ao);
        c = _col;
      }
      this.vert(_v, _n, c, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    if (geo.index) {
      const arr = geo.index.array;
      for (let k = 0; k < arr.length; k++) this.idx.push(base + arr[k]);
    } else {
      for (let k = 0; k < pos.count; k++) this.idx.push(base + k);
    }
  }

  // A flat quad card (used for leaves, blossoms, vines). Normal is supplied (smooth volume shading).
  addCard(center, t1, t2, normal, color, size, uvRect) {
    const hs = size / 2;
    const base = this.vertexCount;
    const [u0, v0, u1, v1] = uvRect || [0, 0, 1, 1];
    const corners = [[-1, -1, u0, v0], [1, -1, u1, v0], [1, 1, u1, v1], [-1, 1, u0, v1]];
    for (const [a, b, u, v] of corners) {
      _v.copy(center).addScaledVector(t1, a * hs).addScaledVector(t2, b * hs);
      this.vert(_v, normal, color, u, v);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function randUnit(rng, target = new THREE.Vector3()) {
  let x, y, z, l;
  do {
    x = rng.next() * 2 - 1;
    y = rng.next() * 2 - 1;
    z = rng.next() * 2 - 1;
    l = x * x + y * y + z * z;
  } while (l > 1 || l < 1e-4);
  return target.set(x, y, z).multiplyScalar(1 / Math.sqrt(l));
}

export function hex(h) {
  return new THREE.Color(h);
}
