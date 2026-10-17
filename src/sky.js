import * as THREE from 'three';
import { VNOISE2_GLSL } from './core/glsl.js';

// Sea of clouds: stacked translucent noise layers (parallax) plus soft billboard puffs
// hugging the cliff bases. No mountains — only clouds, as requested.
const LAYER_VERT = /* glsl */ `
  varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const LAYER_FRAG = /* glsl */ `
  uniform float uTime; uniform float uScale; uniform float uDensity; uniform float uSoft;
  uniform float uOpacity; uniform float uOpaque; uniform vec2 uDrift;
  uniform vec3 uLit; uniform vec3 uShade;
  uniform vec2 uCenter; uniform float uBank;
  varying vec3 vW;
  ${VNOISE2_GLSL}
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vW.xz * uScale + uDrift * uTime;
    vec2 warp = vec2(ygVFbm(p * 0.7 + 3.0), ygVFbm(p * 0.7 + 9.0)) - 0.5;
    vec2 q = p + warp * 1.6;
    float dens = ygVFbm(q) + (ygVFbm(q * 2.7 + 11.0) - 0.5) * 0.35;
    // a thick cloud bank hugging the island so the cliff bases sink out of sight
    vec2 rel = (vW.xz - uCenter) * vec2(0.85, 1.0);
    dens += uBank * (1.0 - smoothstep(13.0, 24.0, length(rel) + (ygVFbm(q * 0.5 + 4.0) - 0.5) * 8.0));
    float cov = smoothstep(uDensity - uSoft, uDensity + uSoft, dens);
    vec2 ql = q + vec2(-0.07, 0.05);
    float dl = ygVFbm(ql) + (ygVFbm(ql * 2.7 + 11.0) - 0.5) * 0.35;
    float lit = clamp(0.5 + (dens - dl) * 7.0 + (cov - 0.5) * 0.35, 0.0, 1.0);
    vec3 col = mix(uShade, uLit, lit);
    float a = mix(cov, 1.0, uOpaque) * uOpacity;
    gl_FragColor = vec4(col, a);
    #include <fog_fragment>
  }
`;

export function buildSky({ rng, cloudTex, center }) {
  const group = new THREE.Group();
  const layers = [];
  const defs = [
    { y: -17, scale: 0.03, density: 0.3, soft: 0.5, opacity: 1.0, opaque: 1, drift: [0.006, 0.002], lit: '#eef1f3', shade: '#8494a3' },
    { y: -12.5, scale: 0.05, density: 0.46, soft: 0.16, opacity: 0.96, opaque: 0, drift: [0.008, 0.003], lit: '#f6f7f7', shade: '#91a2b1', bank: 0.5 },
    { y: -9.5, scale: 0.07, density: 0.52, soft: 0.13, opacity: 0.92, opaque: 0, drift: [0.011, 0.004], lit: '#fbfbfa', shade: '#9daebc', bank: 0.45 },
    { y: -7.0, scale: 0.095, density: 0.6, soft: 0.11, opacity: 0.85, opaque: 0, drift: [0.015, 0.006], lit: '#ffffff', shade: '#a9b7c3', bank: 0.35 },
  ];
  for (const d of defs) {
    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 }, uScale: { value: d.scale }, uDensity: { value: d.density }, uSoft: { value: d.soft },
          uOpacity: { value: d.opacity }, uOpaque: { value: d.opaque }, uDrift: { value: new THREE.Vector2(...d.drift) },
          uLit: { value: new THREE.Color(d.lit) }, uShade: { value: new THREE.Color(d.shade) },
          uCenter: { value: new THREE.Vector2(center.x + 0.5, center.z - 2.5) }, uBank: { value: d.bank ?? 0 },
        },
      ]),
      vertexShader: LAYER_VERT,
      fragmentShader: LAYER_FRAG,
      defines: { YG_NO_HEIGHT_FOG: '' },
      transparent: !d.opaque,
      depthWrite: !!d.opaque,
      fog: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), mat);
    mesh.position.set(center.x, d.y, center.z);
    mesh.renderOrder = d.opaque ? -1 : 1;
    mesh.userData.overlay = true; // drawn after the pixel edge pass, never outlined
    group.add(mesh);
    layers.push(mat);
  }

  // billboard puffs around the cliff bases and drifting further out
  const puffs = [];
  const base = new THREE.SpriteMaterial({ map: cloudTex, color: '#ffffff', transparent: true, depthWrite: false, fog: true });
  const near = [
    [-15, -3.2, 5, 11], [-8, -3.8, 6.5, 10], [-1, -3.4, 10.5, 12], [7.5, -3.6, 10, 11], [14.5, -3.0, 3.5, 10],
    [14, -3.4, -6, 11], [12, -2.8, -11, 9], [3, -3.2, -15.5, 12], [-5, -3.0, -9.5, 10], [-13, -2.8, -7, 10],
    [-18, -4.5, -1, 12], [5.6, -2.4, -8.0, 6], [-4.5, -2.6, 5.8, 6], [10.5, -2.6, 6.5, 7],
  ];
  for (const [x, y, z, s] of near) {
    const sp = new THREE.Sprite(base.clone());
    sp.material.opacity = rng.range(0.7, 0.92);
    sp.position.set(x, y, z);
    sp.scale.set(s, s * 0.5, 1);
    sp.userData = { x0: x, speed: rng.range(0.05, 0.12), ph: rng.next() * 6.28, range: 2.5 };
    puffs.push(sp);
    group.add(sp);
  }
  for (let k = 0; k < 110; k++) {
    const a = rng.next() * Math.PI * 2;
    const r = rng.range(18, 75);
    const sp = new THREE.Sprite(base.clone());
    sp.material.opacity = rng.range(0.75, 1.0);
    const s = rng.range(12, 28) * (0.7 + r / 120);
    sp.position.set(center.x + Math.cos(a) * r, rng.range(-9.5, -5.0) - r * 0.03, center.z + Math.sin(a) * r);
    sp.scale.set(s, s * 0.45, 1);
    sp.userData = { x0: sp.position.x, speed: rng.range(0.08, 0.2), ph: rng.next() * 6.28, range: 6 };
    puffs.push(sp);
    group.add(sp);
  }

  // thin mist veils drifting through the gaps at mid height
  const mist = [
    [6.5, -1.6, -8.3, 9, 0.5], [2.0, 1.2, -9.8, 8, 0.32], [-17.5, 0.8, 0.5, 10, 0.38], [-6.8, -1.2, 6.6, 9, 0.42],
    [14.2, -1.6, -1.5, 9, 0.42], [6, 2.5, -18, 14, 0.35], [-3.5, 2.2, -10.5, 9, 0.3], [-11, -0.5, -6.5, 9, 0.35],
  ];
  for (const [x, y, z, s, o] of mist) {
    const sp = new THREE.Sprite(base.clone());
    sp.material.opacity = o;
    sp.position.set(x, y, z);
    sp.scale.set(s, s * 0.42, 1);
    sp.userData = { x0: x, speed: rng.range(0.1, 0.18), ph: rng.next() * 6.28, range: 1.5 };
    puffs.push(sp);
    group.add(sp);
  }

  return {
    group,
    update(t) {
      for (const m of layers) m.uniforms.uTime.value = t;
      for (const sp of puffs) {
        const u = sp.userData;
        sp.position.x = u.x0 + Math.sin(t * u.speed * 0.25 + u.ph) * u.range;
        sp.material.rotation = Math.sin(t * 0.03 + u.ph) * 0.03;
      }
    },
  };
}
