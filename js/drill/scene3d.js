// 3D-visning: kobler riggmodell, hav, himmel, havbunn og geologisk snitt til simulatoren.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildRig, SEABED_Y } from './rig3d.js';
import { createOcean } from './ocean3d.js';
import { buildSection } from './section3d.js';
import { RKB } from './config.js';
import { PARTS } from '../glossary.js';

export const CAMERAS = {
  oversikt: { label: 'Oversikt', pos: [168, 62, 196], target: [0, 24, 0] },
  boredekk: { label: 'Boredekk', pos: [24, 31.5, 5], target: [0, 30.5, 0] },
  taarn: { label: 'Boretårn', pos: [34, 40, 30], target: [0, 58, 0] },
  undervann: { label: 'Under vann', pos: [58, -24, 96], target: [0, -34, 0] },
  havbunn: { label: 'Havbunn og BOP', pos: [21, -337, 25], target: [0, -342, 0] },
  snitt: { label: 'Brønnsnitt', pos: [0, -1580, 4300], target: [0, -1580, 0] },
  krona: { label: 'Følg krona', follow: true },
};

export function createScene(container, sim, { onPart, onHover } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', '3D-visning av riggen');

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 26000);
  camera.position.set(...CAMERAS.oversikt.pos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 9000;
  controls.minDistance = 3;
  controls.target.set(...CAMERAS.oversikt.target);
  controls.update();

  // Himmel og sol
  const sunDir = new THREE.Vector3();
  const elevation = 21, azimuth = 205;
  const phi = THREE.MathUtils.degToRad(90 - elevation), theta = THREE.MathUtils.degToRad(azimuth);
  sunDir.setFromSphericalCoords(1, phi, theta);
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const su = sky.material.uniforms;
  su.turbidity.value = 7;
  su.rayleigh.value = 1.3;
  su.mieCoefficient.value = 0.005;
  su.mieDirectionalG.value = 0.82;
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const sky2 = new Sky();
  sky2.scale.setScalar(1000);
  Object.assign(sky2.material.uniforms.sunPosition.value, sunDir);
  sky2.material.uniforms.turbidity.value = 7;
  sky2.material.uniforms.rayleigh.value = 1.3;
  skyScene.add(sky2);
  const envRT = pmrem.fromScene(skyScene);
  scene.environment = envRT.texture;

  const hemi = new THREE.HemisphereLight('#cfe3f2', '#27404a', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1dc', 2.6);
  sun.position.copy(sunDir).multiplyScalar(300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 50; sc.far = 700;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  const subLight = new THREE.PointLight('#bfe6ff', 60, 60, 1.6);
  subLight.position.set(6, SEABED_Y + 12, 8);
  scene.add(subLight);

  scene.fog = new THREE.FogExp2('#b7cad7', 0.00022);

  // Hav
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const ocean = createOcean({ sunDir, fine: small ? 200 : 320 });
  scene.add(ocean.group);

  // Havbunn
  {
    const g = new THREE.PlaneGeometry(9000, 9000, 120, 120);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const r = Math.hypot(x, z);
      p.setY(i, (r < 40 ? 0 : 1) * (Math.sin(x * 0.013) * 1.6 + Math.cos(z * 0.011) * 1.4 + Math.sin((x + z) * 0.041) * 0.5));
    }
    g.computeVertexNormals();
    const seabed = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#6c6552', roughness: 1 }));
    seabed.position.y = SEABED_Y;
    seabed.receiveShadow = true;
    scene.add(seabed);
  }

  // Rigg og havbunnsutstyr
  const built = buildRig();
  scene.add(built.rig);
  scene.add(built.subsea);
  scene.add(built.anim.psv);
  const anim = built.anim;
  // Egne materialer per del slik at markering ikke smitter over
  const partMeshes = {};
  for (const [key, objs] of Object.entries(built.parts)) {
    partMeshes[key] = [];
    for (const o of objs) {
      o.traverse((m) => {
        if (!m.isMesh) return;
        if (Array.isArray(m.material)) m.material = m.material.map((x) => x.clone());
        else m.material = m.material.clone();
        partMeshes[key].push(m);
      });
    }
  }

  // Geologisk snitt
  const section = buildSection();
  scene.add(section.group);

  // Etiketter
  const partLabels = [];
  const makeLabel = (text, sub, cls) => {
    const el = document.createElement('div');
    el.className = `lbl ${cls}`;
    const t = document.createElement('span');
    t.className = 'lbl-t';
    t.textContent = text;
    el.appendChild(t);
    if (sub) {
      const s = document.createElement('span');
      s.className = 'lbl-s';
      s.textContent = sub;
      el.appendChild(s);
    }
    return el;
  };
  for (const L of built.labels) {
    const info = PARTS[L.part];
    if (!info) continue;
    const obj = new CSS2DObject(makeLabel(info.no, info.en, 'lbl-part'));
    obj.center.set(0, 0.5);
    obj.position.set(...L.pos);
    obj.userData = L;
    if (L.world) scene.add(obj);
    else if (L.subsea) built.subsea.add(obj);
    else built.rig.add(obj);
    obj.element.addEventListener('click', () => onPart && onPart(L.part));
    partLabels.push(obj);
  }
  const sectionLabels = [];
  for (const L of section.labels) {
    const el = makeLabel(L.text, L.sub, `lbl-${L.kind}`);
    const obj = new CSS2DObject(el);
    obj.center.set(L.kind === 'formation' ? 0 : L.kind === 'depth' ? 1 : 0.5, 0.5);
    obj.position.set(...L.pos);
    section.group.add(obj);
    sectionLabels.push(obj);
  }
  let showPartLabels = false;
  const setPartLabels = (on) => { showPartLabels = on; };

  // Kamera-overganger
  let tween = null;
  let mode = 'oversikt';
  function flyTo(pos, target, dur = 1.4) {
    tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...target), t: 0, dur };
  }
  function setCamera(key) {
    mode = key;
    const c = CAMERAS[key];
    if (c.follow) {
      const y = RKB - sim.bitDepth;
      flyTo([160, y + 40, 380], [0, y, 0]);
    } else flyTo(c.pos, c.target);
  }
  function focusPart(key) {
    const objs = built.parts[key];
    if (!objs) return;
    const box = new THREE.Box3();
    for (const o of objs) box.expandByObject(o);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const d = Math.min(Math.max(size * 1.3, 14), 700);
    const dir = new THREE.Vector3(0.75, 0.38, 0.95).normalize();
    mode = 'fri';
    flyTo(c.clone().add(dir.multiplyScalar(d)).toArray(), c.toArray());
  }

  // Markering ved peker
  const ray = new THREE.Raycaster();
  const ptr = new THREE.Vector2();
  let hovered = null;
  let lastRay = 0;
  const pickables = [built.rig, built.subsea, anim.psv, section.group];
  function partOf(o) {
    while (o) {
      if (o.userData && o.userData.part) return o.userData.part;
      o = o.parent;
    }
    return null;
  }
  function setHighlight(key, on) {
    for (const m of partMeshes[key] || []) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) {
        if (!mt.emissive) continue;
        if (on) { mt.userData.e0 = mt.userData.e0 || mt.emissive.clone(); mt.emissive.set('#3a5f73'); }
        else if (mt.userData.e0) mt.emissive.copy(mt.userData.e0);
      }
    }
  }
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(pickables, true);
    for (const h of hits) {
      if (h.object.isPoints || h.object.isLine) continue;
      const k = partOf(h.object);
      if (k) return k;
      if (h.object.isMesh) return null;
    }
    return null;
  }
  renderer.domElement.addEventListener('pointermove', (ev) => {
    const now = performance.now();
    if (now - lastRay < 40) return;
    lastRay = now;
    const k = pick(ev);
    if (k !== hovered) {
      if (hovered) setHighlight(hovered, false);
      hovered = k;
      if (hovered) setHighlight(hovered, true);
      renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    }
    onHover && onHover(hovered, ev);
  });
  renderer.domElement.addEventListener('pointerleave', () => {
    if (hovered) setHighlight(hovered, false);
    hovered = null;
    onHover && onHover(null);
  });
  let downAt = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => { downAt = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!downAt) return;
    const moved = Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]);
    downAt = null;
    if (moved > 5) return;
    const k = pick(ev);
    if (k && onPart) onPart(k);
  });
  controls.addEventListener('start', () => { tween = null; if (mode !== 'krona') mode = 'fri'; });

  // Størrelse
  function resize() {
    const w = Math.max(container.clientWidth, 1), h = Math.max(container.clientHeight, 1);
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    labelRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  // Animasjon
  const clock = new THREE.Clock();
  let visible = true;
  let pipeAngle = 0;
  let sectionTimer = 0;
  const fogAir = new THREE.Color('#b7cad7'), fogSea = new THREE.Color('#0b3b4a'), deep = new THREE.Color('#0d151a');
  const tmpV = new THREE.Vector3();

  function updateRig(dtReal, tReal) {
    const s = sim;
    const heave = s.heave;
    built.rig.position.y = heave;
    built.rig.rotation.z = 0.004 * Math.sin(tReal * 0.63) * s.heaveHs / 2.5;
    built.rig.rotation.x = 0.003 * Math.sin(tReal * 0.51 + 1.2) * s.heaveHs / 2.5;
    const comp = s.heaveComp ? heave : 0;
    const tdY = RKB + s.blockPos - comp;
    anim.topDrive.position.set(0, tdY, 0);
    anim.block.position.set(0, tdY + 6.3, 0);
    // Borewire
    const lp = anim.drillLine.geometry.attributes.position;
    for (let i = 0; i < lp.count; i += 2) {
      lp.setY(i, anim.crownY);
      lp.setY(i + 1, tdY + 9.1);
    }
    lp.needsUpdate = true;
    anim.drillLine.geometry.computeBoundingSphere();
    // Kobling: animasjon av stativ, kiler og jernsjauer
    const op = s.op;
    const conn = op && op.name.startsWith('Kobling');
    const step = conn ? op.i : -1;
    const f = conn ? Math.min(1, op.stepT / op.steps[op.i].dur) : 0;
    const stick = 1.0;
    let pipeTop = tdY;
    if (s.inSlips && step <= 4) pipeTop = RKB + stick;
    const len = Math.max(pipeTop - RKB, 0.2);
    anim.pipe.scale.set(1, len, 1);
    anim.pipe.position.set(0, RKB + len / 2, 0);
    pipeAngle += (s.rpm / 60) * Math.PI * 2 * dtReal;
    anim.pipe.rotation.y = pipeAngle;
    anim.pipeTex.repeat.set(1, Math.max(1, len / 1.5));
    anim.slips.visible = !!s.inSlips;
    const ms = anim.movingStand;
    if (conn && step === 4) {
      ms.visible = true;
      const x = 0.4 * (1 - f), z = -4.1 * (1 - f);
      ms.position.set(x, RKB + 1.2 + 14.25 + (1 - f) * 0.5, z);
    } else if (conn && step === 5) {
      ms.visible = true;
      ms.position.set(0, RKB + 1.0 + 14.25, 0);
    } else ms.visible = false;
    const arm = anim.roughneckArm;
    const ext = conn && step === 5 ? Math.min(1, f * 3) : conn && step === 2 ? Math.min(1, f * 2) : 0;
    arm.position.set(-3.4 + 2.6 * ext, RKB + 1.2, 2.6 - 2.1 * ext);
    anim.roughneckHead.rotation.y = conn && step === 5 ? tReal * 6 : 0;
    // Rørstativ: vis gjenværende stativ
    const left = Math.max(0, anim.standsTotal - (s.standsAdded || 0) - (conn && step >= 4 ? 1 : 0));
    anim.stands.count = left;
    // Stigerør, BOP og brønnhode
    anim.riserGroup.visible = s.bopInstalled;
    anim.chokeLines.visible = s.bopInstalled;
    anim.bop.visible = s.bopInstalled;
    anim.lmrp.visible = s.bopInstalled;
    anim.wellhead.visible = s.casings.length > 0 || s.bopInstalled;
    const an = anim.annular.material;
    an.emissive.set(s.bopClosed ? '#8a1b10' : '#000000');
    // Streng i åpent vann uten stigerør
    const ow = anim.openWaterString;
    ow.visible = !s.bopInstalled && s.bitDepth > 30;
    if (ow.visible) {
      const yTop = 12 + heave, yBot = Math.max(SEABED_Y, RKB - s.bitDepth);
      const L = Math.max(yTop - yBot, 0.1);
      ow.scale.set(1, L, 1);
      ow.position.set(0, yBot + L / 2, 0);
    }
    anim.cuttings.visible = !s.bopInstalled && s.Q > 0 && s.bitDepth > SEABED_Y * -1 + RKB;
    if (anim.cuttings.visible) anim.cuttings.rotation.y += dtReal * 0.05;
    // Gassventilering
    const pl = anim.plume;
    const rate = s.gasVentRate || 0;
    pl.points.material.opacity = Math.min(0.85, rate * 40);
    if (rate > 0) {
      const pos = pl.points.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const sd = pl.seeds[i];
        const life = (tReal * 0.35 + sd) % 1;
        pos.setXYZ(i, Math.sin(sd * 40) * life * 12 + life * 22, anim.crownY + 6 + life * 45, Math.cos(sd * 23) * life * 12);
      }
      pos.needsUpdate = true;
    }
    // Forsyningsskip og ROV
    anim.psv.position.y = 0.5 * Math.sin(tReal * 0.8);
    anim.psv.rotation.z = 0.02 * Math.sin(tReal * 0.6);
    anim.rov.position.y = SEABED_Y + 7 + 0.3 * Math.sin(tReal * 0.9);
    anim.rov.rotation.y = 0.2 * Math.sin(tReal * 0.2);
  }

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.25);
    const t = clock.elapsedTime;
    sim.update(dt);
    if (!visible) return;
    if (tween) {
      tween.t += dt / tween.dur;
      const e = tween.t >= 1 ? 1 : 1 - Math.pow(1 - tween.t, 3);
      camera.position.lerpVectors(tween.p0, tween.p1, e);
      controls.target.lerpVectors(tween.t0, tween.t1, e);
      if (tween.t >= 1) tween = null;
    } else if (mode === 'krona') {
      const y = RKB - sim.bitDepth;
      const dy = y - controls.target.y;
      controls.target.y += dy * Math.min(1, dt * 3);
      camera.position.y += dy * Math.min(1, dt * 3);
    }
    controls.update();
    ocean.update(t, sim.heaveHs);
    updateRig(dt, t);
    sectionTimer += dt;
    if (sectionTimer > 0.25) { sectionTimer = 0; section.update(sim); }
    // Tåke og bakgrunn etter kameraposisjon
    const cy = camera.position.y;
    const inSection = cy < SEABED_Y - 10 || camera.position.z > 1500;
    if (inSection) {
      scene.fog.density = 0.0;
      scene.background = deep;
      sky.visible = cy > -20;
    } else if (cy < 0) {
      scene.fog.color.copy(fogSea);
      scene.fog.density = 0.003;
      scene.background = fogSea;
      sky.visible = false;
    } else {
      scene.fog.color.copy(fogAir);
      scene.fog.density = 0.00022;
      scene.background = null;
      sky.visible = true;
    }
    section.water.visible = inSection;
    ocean.group.visible = !inSection || cy > -20;
    section.wellMesh.visible = inSection;
    section.bitGlow.visible = inSection;
    for (const l of sectionLabels) l.visible = inSection;
    for (const l of partLabels) {
      let vis = showPartLabels && !inSection;
      if (vis) {
        l.getWorldPosition(tmpV);
        const d = tmpV.distanceTo(camera.position);
        vis = d < (l.userData.minor ? 70 : 900) && (l.userData.subsea ? cy < 0 : cy > -5);
      }
      l.visible = vis;
    }
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    cullLabels();
  }

  // Skjul etiketter som overlapper (viktigste først)
  let lastCull = 0;
  function cullLabels() {
    const now = performance.now();
    if (now - lastCull < 200) return;
    lastCull = now;
    const placed = [];
    const list = partLabels.filter((l) => l.visible).sort((a, b) => (a.userData.minor ? 1 : 0) - (b.userData.minor ? 1 : 0));
    for (const l of list) {
      const el = l.element;
      el.style.visibility = '';
      const r = el.getBoundingClientRect();
      if (!r.width) continue;
      const hit = placed.some((p) => r.left < p.right + 4 && r.right > p.left - 4 && r.top < p.bottom + 2 && r.bottom > p.top - 2);
      if (hit) el.style.visibility = 'hidden';
      else placed.push(r);
    }
  }
  requestAnimationFrame(frame);

  return {
    setCamera,
    focusPart,
    setPartLabels,
    setVisible(v) { visible = v; if (v) clock.getDelta(); },
    get mode() { return mode; },
    renderer,
  };
}
