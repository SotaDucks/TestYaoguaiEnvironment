import * as THREE from 'three';

// Replaces three.js fog chunks globally: distance fog + a noisy height fog so that
// everything below the plateau sinks softly into the sea of clouds.
// Materials can opt out of the height part with `defines: { YG_NO_HEIGHT_FOG: '' }`.
// `distOffset` subtracts a constant from the view depth so distance fog also works with a
// far-away orthographic camera.
export function installHeightFog({ top = -1.0, bottom = -11.0, strength = 0.98, wobble = 2.6, distOffset = 0 } = {}) {
  const f = (v) => v.toFixed(4);

  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorldPos;
#endif
`;

  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorldPos = cameraPosition + transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif
`;

  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorldPos;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	float ygFogHash( vec2 p ) { p = fract( p * vec2( 233.34, 851.73 ) ); p += dot( p, p + 23.45 ); return fract( p.x * p.y ); }
	float ygFogNoise( vec2 p ) {
		vec2 i = floor( p ), fr = fract( p );
		vec2 u = fr * fr * ( 3.0 - 2.0 * fr );
		return mix( mix( ygFogHash( i ), ygFogHash( i + vec2( 1.0, 0.0 ) ), u.x ),
		            mix( ygFogHash( i + vec2( 0.0, 1.0 ) ), ygFogHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
	}
#endif
`;

  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float ygDepth = max( vFogDepth - ${f(distOffset)}, 0.0 );
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * ygDepth * ygDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth - ${f(distOffset)} );
	#endif
	#ifndef YG_NO_HEIGHT_FOG
		float ygFn = ygFogNoise( vFogWorldPos.xz * 0.09 ) * 0.65 + ygFogNoise( vFogWorldPos.xz * 0.31 + 7.0 ) * 0.35;
		float ygTop = ${f(top)} + ( ygFn - 0.5 ) * ${f(wobble)};
		float ygH = 1.0 - smoothstep( ${f(bottom)}, ygTop, vFogWorldPos.y );
		ygH = pow( ygH, 1.35 ) * ${f(strength)};
		fogFactor = 1.0 - ( 1.0 - fogFactor ) * ( 1.0 - ygH );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
}
