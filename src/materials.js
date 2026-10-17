import * as THREE from 'three';
import { NOISE_GLSL, PERTURB_GLSL } from './core/glsl.js';

export const shared = {
  uTime: { value: 0 },
  // 1 = full surface detail; lowered when pixelated so sub-texel noise doesn't turn into speckle
  uDetail: { value: 1 },
};

const WORLD_VARYINGS_VERT = /* glsl */ `
{
  vec4 ygWp = vec4(transformed, 1.0);
  vec3 ygWn = objectNormal;
  #ifdef USE_INSTANCING
    ygWp = instanceMatrix * ygWp;
    ygWn = mat3(instanceMatrix) * ygWn;
  #endif
  ygWp = modelMatrix * ygWp;
  vWPos = ygWp.xyz;
  vWNrm = normalize(mat3(modelMatrix) * ygWn);
  vBUv = uv;
}
`;

function injectWorldVaryings(shader) {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec2 vBUv;`
    )
    .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WORLD_VARYINGS_VERT}`);
}

const SURFACE_PARS = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNrm;
varying vec2 vBUv;
uniform vec3 uMossA;
uniform vec3 uMossB;
uniform float uMoss;
uniform float uMossBias;
uniform float uBump;
uniform float uStreak;
uniform float uScale;
uniform float uDetail;
${NOISE_GLSL}
${PERTURB_GLSL}
`;

// ---------------------------------------------------------------- stone
const STONE_COLOR = /* glsl */ `
vec3 ygP = vWPos * uScale;
vec3 ygN = normalize(vWNrm);
float ygA = ygFbm(ygP * 0.32);
float ygB = ygNoise(ygP * 1.45);
float ygC = ygNoise(vec3(ygP.x * 2.4, ygP.y * 0.28, ygP.z * 2.4));
float ygD = ygNoise(ygP * 4.3 + 3.0);
vec3 ygCol = diffuseColor.rgb;
ygCol *= 0.9 + 0.16 * ygA + (0.06 * ygB + 0.05 * ygD) * uDetail;
float ygVert = 1.0 - abs(ygN.y);
ygCol *= 1.0 - uStreak * ygVert * smoothstep(-0.15, 0.85, ygC) * mix(0.5, 1.0, uDetail);
float ygLich = smoothstep(0.48, 0.8, ygNoise(ygP * 2.6 + 13.0));
ygCol = mix(ygCol, ygCol * vec3(1.1, 1.09, 1.0) + vec3(0.03), ygLich * 0.5 * uDetail);
float ygMossMask = smoothstep(0.32, 0.72, ygN.y * 0.85 + ygA * 0.6 + ygB * 0.28 + uMossBias);
ygMossMask = max(ygMossMask, smoothstep(0.7, 0.95, ygA * 0.75 + ygB * 0.45 + ygD * 0.15 + uMossBias * 0.5) * 0.55 * ygVert);
ygMossMask *= uMoss;
vec3 ygMoss = mix(uMossA, uMossB, smoothstep(-0.7, 0.8, ygB + ygD * 0.5));
ygCol = mix(ygCol, ygMoss, clamp(ygMossMask, 0.0, 1.0));
diffuseColor.rgb = ygCol;
`;

const STONE_BUMP = /* glsl */ `
{
  float ygH = ygB * 0.22 + ygD * 0.07 + ygMossMask * 0.1 + ygNoise(ygP * 9.0) * 0.012 + ygC * ygVert * 0.05;
  normal = ygPerturb(-vViewPosition, normal, ygSlope(ygH, vViewPosition) * uBump * uDetail, faceDirection);
}
`;

export function makeStoneMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.roughness ?? 0.93,
    metalness: 0,
  });
  const uniforms = {
    uMossA: { value: new THREE.Color(opts.mossA ?? '#3c4a22') },
    uMossB: { value: new THREE.Color(opts.mossB ?? '#6f7d36') },
    uMoss: { value: opts.moss ?? 1 },
    uMossBias: { value: opts.mossBias ?? 0 },
    uBump: { value: opts.bump ?? 0.5 },
    uStreak: { value: opts.streak ?? 0.35 },
    uScale: { value: opts.scale ?? 1 },
    uDetail: shared.uDetail,
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    injectWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${STONE_COLOR}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${STONE_BUMP}`)
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, ygMossMask * 0.7);`
      );
  };
  mat.customProgramCacheKey = () => 'yg-stone';
  return mat;
}

// ---------------------------------------------------------------- bark / roots
const BARK_COLOR = /* glsl */ `
vec3 ygP = vWPos * uScale;
vec3 ygN = normalize(vWNrm);
float ygAng = vBUv.y * 6.2831853;
vec3 ygQ = vec3(cos(ygAng) * 0.85, sin(ygAng) * 0.85, vBUv.x * 0.95 * uScale);
float ygR1 = ygNoise(ygQ);
float ygR2 = ygNoise(ygQ * vec3(2.4, 2.4, 2.7) + 7.0);
float ygA = ygFbm(ygP * 0.45);
float ygRidge = ygR1 * 0.62 + ygR2 * 0.38;
vec3 ygCol = diffuseColor.rgb * (0.8 + 0.34 * smoothstep(-0.55, 0.65, ygRidge) + 0.14 * ygA);
ygCol *= mix(0.5, 1.0, smoothstep(-0.6, -0.12, ygRidge));
float ygB = ygNoise(ygP * 1.7);
float ygMossMask = smoothstep(0.5, 0.88, ygN.y * 0.8 + ygA * 0.55 + ygB * 0.25 + uMossBias) * uMoss;
vec3 ygMoss = mix(uMossA, uMossB, smoothstep(-0.6, 0.7, ygB + ygR2 * 0.3));
ygCol = mix(ygCol, ygMoss, ygMossMask);
diffuseColor.rgb = ygCol;
`;

const BARK_BUMP = /* glsl */ `
{
  float ygH = ygRidge * 0.06 + ygMossMask * 0.03;
  normal = ygPerturb(-vViewPosition, normal, ygSlope(ygH, vViewPosition) * uBump * mix(0.35, 1.0, uDetail), faceDirection);
}
`;

export function makeBarkMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.roughness ?? 0.88,
    metalness: 0,
  });
  const uniforms = {
    uMossA: { value: new THREE.Color(opts.mossA ?? '#3a4a22') },
    uMossB: { value: new THREE.Color(opts.mossB ?? '#68783a') },
    uMoss: { value: opts.moss ?? 0.8 },
    uMossBias: { value: opts.mossBias ?? 0 },
    uBump: { value: opts.bump ?? 1.0 },
    uStreak: { value: 0 },
    uScale: { value: opts.scale ?? 1 },
    uDetail: shared.uDetail,
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    injectWorldVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SURFACE_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${BARK_COLOR}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BARK_BUMP}`);
  };
  mat.customProgramCacheKey = () => 'yg-bark';
  mat.userData.edgeWeight = 0.75;
  return mat;
}

// Keeps alpha-tested cards from thinning out in lower mips (small on screen / pixelated):
// boosts alpha by the sampled mip level (after Ben Golus' alpha-to-coverage sharpening).
export const MIP_ALPHA_GLSL = (tex, uv, alpha) => /* glsl */ `
{
  vec2 ygTs = vec2(textureSize(${tex}, 0));
  vec2 ygDx = dFdx(${uv} * ygTs);
  vec2 ygDy = dFdy(${uv} * ygTs);
  float ygLod = max(0.0, 0.5 * log2(max(dot(ygDx, ygDx), dot(ygDy, ygDy))));
  ${alpha} *= 1.0 + ygLod * 0.3;
}
`;

// ---------------------------------------------------------------- foliage cards
// Alpha-tested double-sided cards with smooth "volume" normals and a gentle wind sway.
export function makeFoliageMaterial({ map, alphaTest = 0.42, wind = 1, roughness = 0.82, emissive = null } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map,
    alphaTest,
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness,
    metalness: 0,
  });
  if (emissive) {
    mat.emissive = new THREE.Color(emissive.color);
    mat.emissiveIntensity = emissive.intensity;
  }
  const uniforms = { uTime: shared.uTime, uWind: { value: wind } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nuniform float uWind;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
{
  vec4 ygP = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    ygP = instanceMatrix * ygP;
  #endif
  ygP = modelMatrix * ygP;
  float ygW = sin(uTime * 1.25 + ygP.x * 0.45 + ygP.z * 0.3) * 0.6 + sin(uTime * 2.6 + ygP.y * 1.1 + ygP.x * 0.8) * 0.3;
  transformed += vec3(ygW * 0.03, ygW * 0.008, ygW * 0.022) * uWind;
}`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>\nnormal = normalize(vNormal);`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${MIP_ALPHA_GLSL('map', 'vMapUv', 'diffuseColor.a')}`);
  };
  mat.customProgramCacheKey = () => 'yg-foliage';
  // pixel pass: outline foliage using its smooth volume normals, and only gently
  mat.userData.volumeNormals = true;
  mat.userData.edgeWeight = 0.55;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest });
  return { mat, depth };
}
