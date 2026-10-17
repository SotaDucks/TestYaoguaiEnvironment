import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { MIP_ALPHA_GLSL } from './materials.js';

// Pixel-art rendering, in the spirit of KodyJKing/hello-threejs, adapted for this scene:
//  - the whole post chain runs at low resolution and is upscaled with exact integer blocks;
//  - the normal pass swaps materials per object (alpha-cut foliage stays leaf-shaped) instead
//    of a single override material;
//  - edges are computed on opaque geometry only, then transparent things (clouds, mist, water,
//    particles) are drawn on top, so outlines never show through fog or water;
//  - depth thresholds are in world units relative to the texel size, not raw depth values;
//  - the orthographic frustum is snapped to the texel grid so panning doesn't crawl.

export const LAYER_OPAQUE = 0;
export const LAYER_OVERLAY = 1;

// Put transparent / unlit-overlay objects on the overlay layer and let lights see both layers.
export function assignLayers(scene) {
  scene.traverse((o) => {
    if (o.isLight) {
      o.layers.enableAll();
      return;
    }
    const overlay =
      o.userData.overlay ||
      o.isPoints ||
      o.isSprite ||
      (o.isMesh && (Array.isArray(o.material) ? o.material.some((m) => m.transparent) : o.material.transparent));
    if (overlay) o.layers.set(LAYER_OVERLAY);
  });
}

// ------------------------------------------------------------------ normal pass materials
const NORMAL_VERT = /* glsl */ `
  #include <common>
  varying vec3 vN;
  varying vec2 vUv2;
  void main() {
    vUv2 = uv;
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <project_vertex>
    vN = normalize(transformedNormal);
  }
`;
const NORMAL_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float alphaTest;
  uniform float uWeight;
  varying vec3 vN;
  varying vec2 vUv2;
  void main() {
    #ifdef USE_CUT
      float a = texture2D(map, vUv2).a;
      ${MIP_ALPHA_GLSL('map', 'vUv2', 'a')}
      if (a < alphaTest) discard;
    #endif
    vec3 n = normalize(vN);
    #ifdef FLIP_BACK
      n *= gl_FrontFacing ? 1.0 : -1.0;
    #endif
    gl_FragColor = vec4(n * 0.5 + 0.5, uWeight);
  }
`;

const normalCache = new Map();
function normalMaterialFor(src) {
  const cut = src.alphaTest > 0 && !!src.map;
  const volume = !!src.userData.volumeNormals;
  const weight = src.userData.edgeWeight ?? 1;
  const key = `${cut ? src.map.uuid : '-'}|${src.alphaTest}|${src.side}|${volume}|${weight}`;
  let m = normalCache.get(key);
  if (!m) {
    const defines = {};
    if (cut) defines.USE_CUT = '';
    if (!volume) defines.FLIP_BACK = '';
    m = new THREE.ShaderMaterial({
      uniforms: { map: { value: cut ? src.map : null }, alphaTest: { value: src.alphaTest }, uWeight: { value: weight } },
      defines,
      side: src.side,
      vertexShader: NORMAL_VERT,
      fragmentShader: NORMAL_FRAG,
    });
    normalCache.set(key, m);
  }
  return m;
}

// ------------------------------------------------------------------ edge composite
const EDGE_FRAG = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform vec2 uTexel;
  uniform float uNear;
  uniform float uFar;
  uniform float uPx;
  uniform float uDepthEdge;
  uniform float uNormalEdge;
  uniform vec4 uFrustum;   // left, right, bottom, top (after zoom)
  uniform mat4 uCamWorld;
  varying vec2 vUv;

  float rawDepth(int x, int y) { return texture2D(tDepth, vUv + vec2(x, y) * uTexel).r; }
  float getDepth(int x, int y) { return uNear + rawDepth(x, y) * (uFar - uNear); }
  vec3 getNormal(int x, int y) { return texture2D(tNormal, vUv + vec2(x, y) * uTexel).rgb * 2.0 - 1.0; }

  float depthEdgeIndicator(float depth) {
    float thr = uPx * 3.0;
    float diff = 0.0;
    diff += clamp(getDepth(1, 0) - depth, 0.0, thr * 4.0);
    diff += clamp(getDepth(-1, 0) - depth, 0.0, thr * 4.0);
    diff += clamp(getDepth(0, 1) - depth, 0.0, thr * 4.0);
    diff += clamp(getDepth(0, -1) - depth, 0.0, thr * 4.0);
    return floor(smoothstep(thr, thr * 2.0, diff) * 2.0) / 2.0;
  }

  float neighborNormalEdge(int x, int y, float depth, vec3 normal) {
    float depthDiff = getDepth(x, y) - depth;
    vec3 nn = getNormal(x, y);
    // the edge goes to the face closer to the bias direction, and only the shallower pixel draws it
    float normalIndicator = clamp(smoothstep(-0.01, 0.01, dot(normal - nn, vec3(1.0))), 0.0, 1.0);
    float depthIndicator = clamp(sign(depthDiff + uPx), 0.0, 1.0);
    return distance(normal, nn) * depthIndicator * normalIndicator;
  }

  float normalEdgeIndicator(float depth, vec3 normal) {
    float s = 0.0;
    s += neighborNormalEdge(0, -1, depth, normal);
    s += neighborNormalEdge(0, 1, depth, normal);
    s += neighborNormalEdge(-1, 0, depth, normal);
    s += neighborNormalEdge(1, 0, depth, normal);
    return step(0.1, s);
  }

  void main() {
    vec4 texel = texture2D(tColor, vUv);
    float raw = rawDepth(0, 0);
    gl_FragDepth = raw;
    if (raw >= 0.99999) { gl_FragColor = texel; return; }
    float depth = uNear + raw * (uFar - uNear);
    vec4 nw = texture2D(tNormal, vUv);
    vec3 normal = nw.rgb * 2.0 - 1.0;
    float weight = nw.a;

    float dei = depthEdgeIndicator(depth);
    float nei = normalEdgeIndicator(depth, normal);
    float coef = dei > 0.0 ? 1.0 - uDepthEdge * dei : 1.0 + uNormalEdge * nei;

    // fade edges out where geometry sinks into the cloud sea
    vec3 viewPos = vec3(mix(uFrustum.x, uFrustum.y, vUv.x), mix(uFrustum.z, uFrustum.w, vUv.y), -depth);
    vec3 world = (uCamWorld * vec4(viewPos, 1.0)).xyz;
    float fade = smoothstep(-7.0, -1.0, world.y) * weight;
    gl_FragColor = vec4(texel.rgb * mix(1.0, coef, fade), texel.a);
  }
`;

function lowResTarget(opts = {}) {
  return new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    ...opts,
  });
}

export class PixelScenePass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.depthEdge = 0.42;
    this.normalEdge = 0.32;
    this.texelWorld = 0.1;
    this.rtColor = lowResTarget({ depthTexture: new THREE.DepthTexture(1, 1) });
    this.rtNormal = lowResTarget({ type: THREE.UnsignedByteType });
    this.opaque = [];
    this.fsQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          tColor: { value: null },
          tDepth: { value: null },
          tNormal: { value: null },
          uTexel: { value: new THREE.Vector2(1, 1) },
          uNear: { value: 1 },
          uFar: { value: 100 },
          uPx: { value: 0.1 },
          uDepthEdge: { value: 0.4 },
          uNormalEdge: { value: 0.3 },
          uFrustum: { value: new THREE.Vector4() },
          uCamWorld: { value: new THREE.Matrix4() },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: EDGE_FRAG,
        depthTest: true,
        depthWrite: true,
        depthFunc: THREE.AlwaysDepth,
      })
    );
    this._clear = new THREE.Color();
  }

  // Collect the opaque meshes once the scene is built.
  collect() {
    this.opaque = [];
    this.scene.traverse((o) => {
      if ((o.isMesh || o.isInstancedMesh) && o.layers.isEnabled(LAYER_OPAQUE) && !Array.isArray(o.material)) this.opaque.push(o);
    });
  }

  setSize(w, h) {
    this.rtColor.setSize(w, h);
    this.rtNormal.setSize(w, h);
    this.fsQuad.material.uniforms.uTexel.value.set(1 / w, 1 / h);
  }

  render(renderer, writeBuffer) {
    const { scene, camera } = this;
    const bg = scene.background;
    const mask = camera.layers.mask;
    const autoClear = renderer.autoClear;
    renderer.getClearColor(this._clear);
    const clearAlpha = renderer.getClearAlpha();

    // 1. opaque geometry (colour + depth)
    camera.layers.set(LAYER_OPAQUE);
    renderer.setRenderTarget(this.rtColor);
    renderer.render(scene, camera);

    // 2. view-space normals with per-object materials
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    for (const o of this.opaque) {
      o.userData._mat = o.material;
      o.material = normalMaterialFor(o.material);
    }
    renderer.setRenderTarget(this.rtNormal);
    renderer.clear();
    renderer.render(scene, camera);
    for (const o of this.opaque) o.material = o.userData._mat;

    // 3. edge composite into the write buffer, restoring depth for the overlay pass
    const u = this.fsQuad.material.uniforms;
    u.tColor.value = this.rtColor.texture;
    u.tDepth.value = this.rtColor.depthTexture;
    u.tNormal.value = this.rtNormal.texture;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uPx.value = this.texelWorld;
    u.uDepthEdge.value = this.depthEdge;
    u.uNormalEdge.value = this.normalEdge;
    const dx = (camera.right - camera.left) / (2 * camera.zoom);
    const dy = (camera.top - camera.bottom) / (2 * camera.zoom);
    const cx = (camera.right + camera.left) / 2;
    const cy = (camera.top + camera.bottom) / 2;
    u.uFrustum.value.set(cx - dx, cx + dx, cy - dy, cy + dy);
    u.uCamWorld.value.copy(camera.matrixWorld);
    renderer.setRenderTarget(writeBuffer);
    renderer.clear();
    this.fsQuad.render(renderer);

    // 4. clouds, mist, water and particles on top, depth-tested against the opaque scene
    camera.layers.set(LAYER_OVERLAY);
    renderer.autoClear = false;
    renderer.render(scene, camera);

    renderer.autoClear = autoClear;
    camera.layers.mask = mask;
    scene.background = bg;
    renderer.setClearColor(this._clear, clearAlpha);
  }

  dispose() {
    this.rtColor.dispose();
    this.rtNormal.dispose();
    this.fsQuad.dispose();
  }
}

// Final blit: every low-res texel becomes an exact N×N block of device pixels.
export const UpscaleShader = {
  uniforms: {
    tDiffuse: { value: null },
    uPixel: { value: 4 },
    uOffset: { value: new THREE.Vector2() },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uPixel;
    uniform vec2 uOffset;
    void main() {
      ivec2 size = textureSize(tDiffuse, 0);
      ivec2 t = ivec2(floor((gl_FragCoord.xy + uOffset) / uPixel));
      t = clamp(t, ivec2(0), size - 1);
      gl_FragColor = texelFetch(tDiffuse, t, 0);
    }
  `,
};

const _pos = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

// Size the orthographic frustum so one texel covers `texelWorld` units, and offset it so that
// world space stays locked to the texel grid as the camera pans.
export function alignFrustum(camera, texelsW, texelsH, texelWorld, snap) {
  camera.updateMatrixWorld();
  let fx = 0, fy = 0;
  if (snap) {
    camera.getWorldPosition(_pos);
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    const pr = _pos.dot(_right) / texelWorld;
    const pu = _pos.dot(_up) / texelWorld;
    fx = pr - Math.round(pr);
    fy = pu - Math.round(pu);
  }
  const halfW = (texelsW * texelWorld * camera.zoom) / 2;
  const halfH = (texelsH * texelWorld * camera.zoom) / 2;
  const cx = -fx * texelWorld;
  const cy = -fy * texelWorld;
  camera.left = cx - halfW;
  camera.right = cx + halfW;
  camera.top = cy + halfH;
  camera.bottom = cy - halfH;
  camera.updateProjectionMatrix();
}
