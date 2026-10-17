import * as THREE from 'three';

// Runs after tone mapping on sRGB values, at the low pixel resolution: soft split-toning and a
// vignette. Grain is off by default because per-texel noise flickers in pixel art.
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    uniform float uGrain;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 0.93);
      col += vec3(-0.012, 0.004, 0.018) * (1.0 - l) * (1.0 - l);
      col += vec3(0.018, 0.01, -0.012) * l * l;
      vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      float vig = smoothstep(1.25, 0.35, length(q));
      col *= mix(0.86, 1.0, vig);
      float g = fract(sin(dot(vUv * uRes + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
