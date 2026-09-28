// Havoverflate med Gerstner-bølger i vertex-shaderen, fresnel-refleksjon av himmelen og solglitter.
import * as THREE from 'three';

const WAVES = [
  // retning x, retning z, relativ amplitude, bølgelengde (m)
  [1.0, 0.25, 1.0, 118],
  [0.75, 0.6, 0.55, 64],
  [0.2, 1.0, 0.32, 33],
  [-0.4, 0.9, 0.18, 21],
  [0.9, -0.3, 0.1, 13],
];

const vertex = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform vec4 uWaves[5];
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vCrest;
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  const float PI = 3.14159265;
  vec3 gerstner(vec4 w, vec3 p, inout vec3 tang, inout vec3 bin) {
    float k = 2.0 * PI / w.w;
    float c = sqrt(9.81 / k);
    vec2 d = normalize(w.xy);
    float a = w.z * uAmp;
    float steep = clamp(a * k, 0.0, 0.6);
    float f = k * (dot(d, p.xz) - c * uTime);
    float s = sin(f), co = cos(f);
    tang += vec3(-d.x * d.x * steep * s, d.x * steep * co, -d.x * d.y * steep * s);
    bin += vec3(-d.x * d.y * steep * s, d.y * steep * co, -d.y * d.y * steep * s);
    return vec3(d.x * (steep / k) * co, a * s, d.y * (steep / k) * co);
  }
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec3 p = wp.xyz;
    float fade = 1.0 - smoothstep(520.0, 780.0, max(abs(p.x), abs(p.z)));
    vec3 tang = vec3(1.0, 0.0, 0.0), bin = vec3(0.0, 0.0, 1.0);
    vec3 disp = vec3(0.0);
    for (int i = 0; i < 5; i++) disp += gerstner(uWaves[i], p, tang, bin);
    disp *= fade;
    p += disp;
    vCrest = disp.y / max(uAmp * 2.2, 0.2);
    vNormalW = normalize(cross(bin, tang));
    vWorld = p;
    vec4 mvPosition = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyTop;
  uniform vec3 uSkyHorizon;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying float vCrest;
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    #include <logdepthbuf_fragment>
    vec3 V = normalize(cameraPosition - vWorld);
    // småkrusninger som normalforstyrrelse
    vec2 q = vWorld.xz * 0.35 + vec2(uTime * 0.6, uTime * 0.4);
    float n1 = noise(q) - 0.5, n2 = noise(q * 2.3 + 11.0) - 0.5;
    float dist = length(cameraPosition - vWorld);
    float rip = mix(0.18, 0.04, smoothstep(50.0, 1500.0, dist));
    vec3 N = normalize(vNormalW + vec3(n1, 0.0, n2) * rip);
    bool below = cameraPosition.y < 0.0;
    if (below) N = -N;
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y * 1.6, 0.0, 1.0));
    float sun = pow(max(dot(R, uSunDir), 0.0), 700.0) * 6.0 + pow(max(dot(R, uSunDir), 0.0), 60.0) * 0.25;
    vec3 body = mix(uDeep, uShallow, clamp(vCrest * 0.6 + 0.35, 0.0, 1.0));
    float sss = pow(max(dot(V, -uSunDir), 0.0), 3.0) * clamp(vCrest, 0.0, 1.0) * 0.35;
    vec3 col = mix(body + uShallow * sss, sky, fres) + uSunColor * sun;
    float foam = smoothstep(0.62, 0.95, vCrest + n1 * 0.5) * 0.55;
    col = mix(col, vec3(0.9, 0.95, 0.97), foam);
    if (below) {
      col = mix(vec3(0.05, 0.28, 0.33), vec3(0.55, 0.78, 0.8), pow(max(dot(N, V), 0.0), 2.0));
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createOcean({ sunDir, fine = 320 }) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uAmp: { value: 1.0 },
      uWaves: { value: WAVES.map((w) => new THREE.Vector4(...w)) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.93, 0.8) },
      uSkyTop: { value: new THREE.Color('#5d88b0') },
      uSkyHorizon: { value: new THREE.Color('#b9cfdd') },
      uDeep: { value: new THREE.Color('#06212c') },
      uShallow: { value: new THREE.Color('#15586a') },
    },
  ]);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, fog: true, side: THREE.DoubleSide });
  const group = new THREE.Group();
  // Fin rute rundt riggen og en grov ring for horisonten
  const near = new THREE.PlaneGeometry(1600, 1600, fine, fine);
  near.rotateX(-Math.PI / 2);
  const nearMesh = new THREE.Mesh(near, mat);
  nearMesh.frustumCulled = false;
  group.add(nearMesh);
  const ringShape = new THREE.Shape();
  ringShape.moveTo(-12000, -12000); ringShape.lineTo(12000, -12000); ringShape.lineTo(12000, 12000); ringShape.lineTo(-12000, 12000); ringShape.lineTo(-12000, -12000);
  const hole = new THREE.Path();
  hole.moveTo(-799, -799); hole.lineTo(-799, 799); hole.lineTo(799, 799); hole.lineTo(799, -799); hole.lineTo(-799, -799);
  ringShape.holes.push(hole);
  const far = new THREE.ShapeGeometry(ringShape, 1);
  far.rotateX(-Math.PI / 2);
  const farMesh = new THREE.Mesh(far, mat);
  farMesh.frustumCulled = false;
  group.add(farMesh);
  return {
    group,
    material: mat,
    update(t, hs) {
      uniforms.uTime.value = t;
      uniforms.uAmp.value = Math.max(0.15, hs * 0.5);
    },
  };
}
