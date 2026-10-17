import * as THREE from 'three';
import { NOISE_GLSL } from './core/glsl.js';
import { shared } from './materials.js';

const FALL_VERT = /* glsl */ `
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

function makeFallMaterial({ speed = 1, opacity = 0.9 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uSpeed: { value: speed }, uOpacity: { value: opacity } }]),
    vertexShader: FALL_VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uSpeed; uniform float uOpacity;
      varying vec2 vUv;
      ${NOISE_GLSL}
      #include <fog_pars_fragment>
      void main() {
        float u = vUv.x;
        float d = vUv.y;
        float t = uTime * uSpeed;
        float n1 = ygNoise(vec3(u * 6.0, d * 0.4 - t * 1.6, 0.3));
        float n2 = ygNoise(vec3(u * 17.0, d * 1.0 - t * 3.2, 1.7));
        float n3 = ygNoise(vec3(u * 38.0, d * 2.2 - t * 5.5, 4.1));
        float streak = clamp(n1 * 0.45 + n2 * 0.35 + n3 * 0.22 + 0.5, 0.0, 1.0);
        float edge = smoothstep(0.0, 0.22, u) * (1.0 - smoothstep(0.78, 1.0, u));
        float ragged = smoothstep(0.05, 0.4, edge + n2 * 0.25 + n3 * 0.1);
        float foamTop = exp(-d * 2.5);
        vec3 deep = vec3(0.42, 0.55, 0.6);
        vec3 white = vec3(0.92, 0.96, 0.98);
        vec3 col = mix(deep, white, clamp(smoothstep(0.38, 0.78, streak) * 0.9 + foamTop * 0.6, 0.0, 1.0));
        float a = ragged * (0.5 + 0.5 * smoothstep(0.25, 0.7, streak)) * uOpacity;
        gl_FragColor = vec4(col, a);
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
}

function makeStreamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: FALL_VERT,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      ${NOISE_GLSL}
      #include <fog_pars_fragment>
      void main() {
        float u = vUv.x;
        float d = vUv.y;
        float n1 = ygNoise(vec3(u * 3.0, d * 1.4 - uTime * 0.9, 0.0));
        float n2 = ygNoise(vec3(u * 9.0, d * 4.0 - uTime * 1.8, 2.0));
        float sparkle = smoothstep(0.55, 0.9, n1 * 0.5 + n2 * 0.6);
        float edge = smoothstep(0.0, 0.25, u) * (1.0 - smoothstep(0.75, 1.0, u));
        vec3 col = mix(vec3(0.2, 0.3, 0.3), vec3(0.85, 0.93, 0.95), sparkle * 0.8 + 0.1);
        gl_FragColor = vec4(col, edge * (0.7 + 0.25 * sparkle));
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
}

// Water sheet leaving a lip, bulging outward and dropping. uv = (across, distance fallen).
function fallGeometry({ lip, out, width, drop, bulge = 0.4, segX = 6, segY = 70 }) {
  const side = new THREE.Vector3(-out.z, 0, out.x);
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= segY; j++) {
    const v = j / segY;
    const dy = drop * Math.pow(v, 1.6);
    const o = bulge * Math.min(1, Math.sqrt(dy / 1.1));
    const w = width * (1 + 0.3 * v);
    for (let i = 0; i <= segX; i++) {
      const u = i / segX;
      const p = lip.clone().addScaledVector(out, o).addScaledVector(side, (u - 0.5) * w);
      p.y -= dy;
      pos.push(p.x, p.y, p.z);
      uv.push(u, dy);
    }
  }
  const row = segX + 1;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Flat ribbon along a polyline. uv = (across, distance along).
function ribbonGeometry(points, width) {
  const curve = new THREE.CatmullRomCurve3(points);
  const n = Math.ceil(curve.getLength() * 6);
  const pos = [], uv = [], idx = [];
  let dist = 0;
  let prev = null;
  for (let j = 0; j <= n; j++) {
    const p = curve.getPointAt(j / n);
    const t = curve.getTangentAt(j / n);
    const side = new THREE.Vector3(-t.z, 0, t.x).normalize();
    if (prev) dist += p.distanceTo(prev);
    prev = p;
    for (const s of [0, 1]) {
      const q = p.clone().addScaledVector(side, (s - 0.5) * width);
      pos.push(q.x, q.y, q.z);
      uv.push(s, dist);
    }
  }
  for (let j = 0; j < n; j++) {
    const a = j * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function buildWater({ terrain, rng, softTex }) {
  const group = new THREE.Group();
  const mats = [];
  const fall = (opts, matOpts) => {
    const m = makeFallMaterial(matOpts);
    mats.push(m);
    const mesh = new THREE.Mesh(fallGeometry(opts), m);
    mesh.renderOrder = 2;
    group.add(mesh);
    return mesh;
  };

  // --- back cliff: stream on the upper tier, small cascade, then the big fall into the clouds
  const upperLip = terrain.get(7, -12);
  const lowerLip = terrain.get(7, -10);
  const zUpper = terrain.faceAt(upperLip, 6.6) ?? -11;
  const zLower = terrain.faceAt(lowerLip, 4.8) ?? -9;
  const streamMat = makeStreamMaterial();
  mats.push(streamMat);
  const s1 = new THREE.Mesh(
    ribbonGeometry([new THREE.Vector3(7.6, 7.1, -13.7), new THREE.Vector3(7.4, 7.1, -12.9), new THREE.Vector3(7.55, 7.1, -12.0), new THREE.Vector3(7.5, 7.1, zUpper - 0.02)], 0.75),
    streamMat
  );
  const s2 = new THREE.Mesh(
    ribbonGeometry([new THREE.Vector3(7.5, 5.4, zUpper + 0.2), new THREE.Vector3(7.45, 5.4, -10.4), new THREE.Vector3(7.5, 5.4, zLower - 0.02)], 0.8),
    streamMat
  );
  group.add(s1, s2);
  fall({ lip: new THREE.Vector3(7.5, 7.12, zUpper - 0.04), out: new THREE.Vector3(0, 0, 1), width: 0.72, drop: 1.75, bulge: 0.25, segY: 20 }, { speed: 1, opacity: 0.85 });
  fall({ lip: new THREE.Vector3(7.5, 5.42, zLower - 0.04), out: new THREE.Vector3(0, 0, 1), width: 0.85, drop: 19, bulge: 0.55, segY: 90 }, { speed: 1, opacity: 0.92 });
  // a thinner veil next to it
  fall({ lip: new THREE.Vector3(6.75, 5.42, zLower - 0.06), out: new THREE.Vector3(0, 0, 1), width: 0.32, drop: 18, bulge: 0.4, segY: 80 }, { speed: 0.85, opacity: 0.55 });

  // --- spring gushing from the east face of the courtyard
  const eastCell = terrain.get(10, 2);
  const xEast = terrain.faceAt(eastCell, -0.6) ?? 11.05;
  fall({ lip: new THREE.Vector3(xEast - 0.05, -0.45, 2.45), out: new THREE.Vector3(1, 0, 0), width: 0.55, drop: 13, bulge: 0.35, segY: 70 }, { speed: 0.9, opacity: 0.9 });

  // --- thin trickle down the stone pillar
  const pillarCell = terrain.get(-2, -5);
  if (pillarCell) {
    const zp = terrain.faceAt(pillarCell, 7.5) ?? -4;
    fall({ lip: new THREE.Vector3(-1.45, 9.4, zp + 0.02), out: new THREE.Vector3(0, 0, 1), width: 0.16, drop: 5.6, bulge: 0.08, segY: 50 }, { speed: 0.7, opacity: 0.7 });
  }

  // --- spray puffs
  const spray = [];
  const sprayMat = new THREE.SpriteMaterial({ map: softTex, color: '#ffffff', transparent: true, opacity: 0.32, depthWrite: false });
  const puffs = [
    [7.5, 5.6, -10.75, 1.2], [7.5, 4.6, zLower + 0.6, 1.8], [7.4, 2.0, zLower + 0.7, 2.6], [xEast + 0.4, -1.0, 2.45, 1.3], [-1.45, 4.0, -3.6, 0.9],
  ];
  for (const [x, y, z, s] of puffs) {
    const sp = new THREE.Sprite(sprayMat.clone());
    sp.position.set(x, y, z);
    sp.scale.setScalar(s);
    sp.userData = { s, ph: rng.next() * 10 };
    sp.renderOrder = 3;
    spray.push(sp);
    group.add(sp);
  }

  return {
    group,
    update(t) {
      for (const m of mats) m.uniforms.uTime.value = t;
      for (const sp of spray) {
        const k = 1 + 0.08 * Math.sin(t * 2.2 + sp.userData.ph);
        sp.scale.setScalar(sp.userData.s * k);
        sp.material.opacity = 0.26 + 0.08 * Math.sin(t * 1.7 + sp.userData.ph);
      }
    },
  };
}

void shared;
