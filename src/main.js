import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { RNG, createNoise } from './core/rng.js';
import { installHeightFog } from './core/fog.js';
import { shared, makeStoneMaterial, makeBarkMaterial, makeFoliageMaterial } from './materials.js';
import * as T from './textures.js';
import { buildTerrain } from './terrain.js';
import { buildShrine } from './shrine.js';
import { buildRoots } from './roots.js';
import { buildVegetation, buildPetals } from './vegetation.js';
import { buildWater } from './water.js';
import { buildSky } from './sky.js';
import { buildCranes } from './cranes.js';
import { GradeShader } from './grade.js';
import { PixelScenePass, UpscaleShader, assignLayers, alignFrustum } from './pixel.js';
import { createDebugPanel } from './debug.js';

// Orthographic camera parked far away along the 45°/45° view direction.
const CAM_DIST = 120;
const VIEW_H = 27; // world units visible vertically at zoom 1 ...
const VIEW_W = 36; // ... and at least this much horizontally (portrait windows)

installHeightFog({ top: -1.0, bottom: -11.5, strength: 0.985, wobble: 2.6, distOffset: CAM_DIST - 30 });

// ------------------------------------------------------------------ settings (debug panel)
const dpr = Math.min(window.devicePixelRatio, 2);
const DEFAULTS = {
  pixelSize: Math.max(2, Math.round(3 * dpr)), // device pixels per low-res texel
  depthEdge: 0.42,
  normalEdge: 0.32,
  snap: true,
};
const settings = { ...DEFAULTS };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('yg-pixel-settings') || '{}'));
} catch {
  /* ignore corrupt settings */
}

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// everything that casts shadows is static: render the shadow map once
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
document.body.appendChild(renderer.domElement);

const FOG_COLOR = new THREE.Color('#dde4e8');
const scene = new THREE.Scene();
scene.background = FOG_COLOR.clone();
scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), 0.0052);

// ------------------------------------------------------------------ camera (45° top-down, 45° azimuth, no perspective)
const target = new THREE.Vector3(1.6, 1.4, -2.0);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 420);
const placeCamera = (tgt, polarDeg, azimuthDeg, zoom) => {
  const p = THREE.MathUtils.degToRad(polarDeg), a = THREE.MathUtils.degToRad(azimuthDeg);
  camera.position.set(
    tgt.x + CAM_DIST * Math.sin(p) * Math.sin(a),
    tgt.y + CAM_DIST * Math.cos(p),
    tgt.z + CAM_DIST * Math.sin(p) * Math.cos(a)
  );
  camera.zoom = zoom;
  camera.lookAt(tgt);
  camera.updateProjectionMatrix();
};
placeCamera(target, 45, 45, 1);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minPolarAngle = THREE.MathUtils.degToRad(22);
controls.maxPolarAngle = THREE.MathUtils.degToRad(72);
controls.minZoom = 0.55;
controls.maxZoom = 4.5;
controls.update();

// ------------------------------------------------------------------ lights
const hemi = new THREE.HemisphereLight('#d6e2ee', '#57534a', 1.0);
scene.add(hemi);

const sun = new THREE.DirectionalLight('#ffecd2', 3.9);
const sunDir = new THREE.Vector3(-0.42, 0.78, 0.46).normalize();
sun.position.copy(target).addScaledVector(sunDir, 45);
sun.target.position.copy(target);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -26;
sun.shadow.camera.right = 26;
sun.shadow.camera.top = 26;
sun.shadow.camera.bottom = -26;
sun.shadow.camera.near = 5;
sun.shadow.camera.far = 100;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 2.5;
scene.add(sun, sun.target);

// cool, shadowless fill from the right so the east-facing cliff columns keep their shape
const fill = new THREE.DirectionalLight('#c8d6ea', 0.7);
fill.position.copy(target).add(new THREE.Vector3(30, 14, -12));
fill.target.position.copy(target);
scene.add(fill, fill.target);

// ------------------------------------------------------------------ world
const rng = new RNG(20261017);
const noise = createNoise(7);

const stoneMat = makeStoneMaterial({ moss: 0.95, mossBias: -0.3, bump: 0.55, streak: 0.38 });
const paveMat = makeStoneMaterial({ moss: 0.8, mossBias: -0.55, bump: 0.35, streak: 0.1, mossA: '#46522a', mossB: '#7c8a44' });

const texRng = new RNG(99);
const tex = {
  blossom: T.blossomTexture(texRng),
  needle: T.needleTexture(texRng),
  leaf: T.leafTexture(texRng),
  fern: T.fernTexture(texRng),
  grass: T.grassTexture(texRng),
  cloud: T.cloudTexture(texRng),
  banner: T.bannerTexture(texRng),
  petal: T.petalTexture(),
  soft: T.softDotTexture(),
};

const barkMat = makeBarkMaterial({ moss: 0.55, mossBias: -0.1 });
const rootMat = makeBarkMaterial({ moss: 0.4, mossBias: -0.2, bump: 1.1 });
const foliageMats = {
  needle: makeFoliageMaterial({ map: tex.needle, alphaTest: 0.4, wind: 0.6 }),
  leaf: makeFoliageMaterial({ map: tex.leaf, alphaTest: 0.45, wind: 0.8 }),
  blossom: makeFoliageMaterial({ map: tex.blossom, alphaTest: 0.45, wind: 0.7, emissive: { color: '#40202a', intensity: 0.35 } }),
  fern: makeFoliageMaterial({ map: tex.fern, alphaTest: 0.4, wind: 1.0 }),
  grass: makeFoliageMaterial({ map: tex.grass, alphaTest: 0.4, wind: 1.2 }),
};

const terrain = buildTerrain({ rng: rng.fork(1), noise, stoneMat, paveMat });
scene.add(terrain.group);

const shrine = buildShrine({ rng: rng.fork(2), stoneMat, bannerTex: tex.banner, softTex: tex.soft });
scene.add(shrine.group, shrine.motes);

const roots = buildRoots({ rng: rng.fork(3), noise, barkMat: rootMat, groundAt: terrain.groundAt });
scene.add(roots.mesh);

const veg = buildVegetation({ rng: rng.fork(4), noise, terrain, barkMat, tex, foliageMats, extraSpots: shrine.plantSpots });
scene.add(veg.group);
const petals = buildPetals({ rng: rng.fork(5), origins: veg.blossomOrigins, petalTex: tex.petal });
scene.add(petals.points);

const water = buildWater({ terrain, rng: rng.fork(6), softTex: tex.soft });
scene.add(water.group);

const sky = buildSky({ rng: rng.fork(7), cloudTex: tex.cloud, center: target });
scene.add(sky.group);

const cranes = buildCranes({ rng: rng.fork(8) });
scene.add(cranes.group);

const updaters = [shrine, water, sky, cranes];

assignLayers(scene);

// ------------------------------------------------------------------ pixel pipeline (all at low resolution)
const rt = new THREE.WebGLRenderTarget(1, 1, {
  type: THREE.HalfFloatType,
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  generateMipmaps: false,
});
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(1);
const pixelPass = new PixelScenePass(scene, camera);
pixelPass.collect();
composer.addPass(pixelPass);
// threshold above 1: only HDR emissives (spirit flame, demon eyes) glow, never the white clouds
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.4, 1.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass(GradeShader);
composer.addPass(grade);
const upscale = new ShaderPass(UpscaleShader);
composer.addPass(upscale);

const low = { w: 1, h: 1, deviceH: 1 };
const _buf = new THREE.Vector2();
function layout() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.getDrawingBufferSize(_buf);
  const N = settings.pixelSize;
  low.w = Math.ceil(_buf.x / N);
  low.h = Math.ceil(_buf.y / N);
  low.deviceH = _buf.y;
  low.viewH = Math.max(VIEW_H, (VIEW_W * _buf.y) / _buf.x);
  shared.uDetail.value = N <= 1 ? 1 : N <= 3 ? 0.6 : 0.35;
  composer.setSize(low.w, low.h);
  upscale.uniforms.uPixel.value = N;
  upscale.uniforms.uOffset.value.set(Math.floor((low.w * N - _buf.x) / 2), Math.floor((low.h * N - _buf.y) / 2));
  grade.uniforms.uRes.value.set(low.w, low.h);
}
window.addEventListener('resize', layout);
layout();

function updatePixelCamera() {
  // texel size in world units: VIEW_H spans the visible screen height at zoom 1
  const texelWorld = low.viewH / (low.deviceH / settings.pixelSize) / camera.zoom;
  alignFrustum(camera, low.w, low.h, texelWorld, settings.snap);
  pixelPass.texelWorld = texelWorld;
  pixelPass.depthEdge = settings.depthEdge;
  pixelPass.normalEdge = settings.normalEdge;
  shrine.setPointScale(1 / texelWorld);
  petals.setPointScale(1 / texelWorld);
}

createDebugPanel(settings, DEFAULTS, (key) => {
  if (key === 'reset') localStorage.removeItem('yg-pixel-settings');
  else localStorage.setItem('yg-pixel-settings', JSON.stringify(settings));
  if (key === 'pixelSize' || key === 'reset') layout();
});

// ------------------------------------------------------------------ loop
const timer = new THREE.Timer();
timer.connect(document);
renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.05);
  const t = timer.getElapsed();
  shared.uTime.value = t;
  grade.uniforms.uTime.value = t;
  for (const u of updaters) u.update?.(t, dt);
  controls.update();
  updatePixelCamera();
  composer.render(dt);
});

// camera presets for inspection from the console: __view('shrine') etc.
const VIEWS = {
  home: [target.toArray(), 45, 45, 1],
  shrine: [[6.0, 1.6, -3.0], 45, 45, 2.3],
  front: [[6.2, 2.2, -3.4], 72, 17, 2.8],
  plateau: [[-9, 3, 0], 45, 45, 2.2],
};
window.__view = (k) => {
  const [t, polar, az, zoom] = VIEWS[k];
  controls.target.set(...t);
  placeCamera(controls.target, polar, az, zoom);
  controls.update();
};

window.__yg = { scene, camera, renderer, controls, terrain, sun, hemi, bloom, settings, pixelPass, composer };
