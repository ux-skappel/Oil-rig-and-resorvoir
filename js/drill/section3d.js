// Gjennomskåret snitt av berggrunnen under riggen: formasjoner med litologimønstre,
// antiklinal felle med gass/olje/vann-kontakter, vannsøyle og et brønnskjema i overdrevet bredde.
import * as THREE from 'three';
import { FORMATIONS, RKB, SEABED, SECTIONS, PIPE } from './config.js';

export const EX = 40;                  // horisontal overdrivelse av brønnen
const HALF = 620;                      // halv bredde av snittet (m)
const DEPTH_MAX = 3450;
const BACK = -900;
const GWC = 2950;                      // gass/vann-kontakt i Tarbert
const OWC = 3015;                      // olje/vann-kontakt i Etive
const yOf = (z) => RKB - z;
const inch = (x) => x * 0.0254;

// Antiklinal: lagene faller bort fra brønnen, mest for de dype lagene
export function surfaceDepth(z0, x) {
  const dip = Math.max(0, (z0 - 1400) / 1500) * 150;
  return z0 + dip * (x / HALF) ** 2;
}

function patternTexture(kind, base) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(20,20,20,0.35)';
  g.fillStyle = 'rgba(20,20,20,0.35)';
  g.lineWidth = 2;
  if (kind === 'sand') {
    for (let i = 0; i < 70; i++) { g.beginPath(); g.arc((i * 37) % 128, (i * 53) % 128, 1.6, 0, Math.PI * 2); g.fill(); }
  } else if (kind === 'clay') {
    for (let y = 8; y < 128; y += 16) for (let x = (y / 16 % 2) * 12; x < 128; x += 26) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 16, y); g.stroke(); }
  } else if (kind === 'shale') {
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    for (let y = 5; y < 128; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  } else if (kind === 'lime') {
    for (let y = 0; y < 128; y += 21) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
      for (let x = (y / 21 % 2) * 21; x < 128; x += 42) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 21); g.stroke(); }
    }
  } else if (kind === 'marl') {
    for (let y = 0; y < 128; y += 32) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke();
      for (let x = (y / 32 % 2) * 32; x < 128; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 16); g.stroke(); }
      g.beginPath(); g.moveTo(10, y + 24); g.lineTo(30, y + 24); g.moveTo(74, y + 24); g.lineTo(94, y + 24); g.stroke();
    }
  } else if (kind === 'tuff') {
    for (let y = 12; y < 128; y += 24) for (let x = 6 + (y / 24 % 2) * 16; x < 128; x += 32) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y + 4); g.lineTo(x + 10, y - 5); g.stroke(); }
  } else if (kind === 'coal') {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    for (let y = 10; y < 128; y += 30) g.fillRect(0, y, 128, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const LITH_KIND = {
  nordland: 'clay', hordaland: 'clay', rogaland: 'tuff', shetland: 'lime', cromer: 'marl',
  draupne: 'shale', tarbert: 'sand', ness: 'coal', etive: 'sand', dunlin: 'clay',
};

// Bånd mellom to kurver på snittflaten (z = zFace)
function bandGeometry(topFn, botFn, zFace, n = 60, uvScale = 45) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const x = -HALF + 2 * HALF * i / n;
    const yt = yOf(topFn(x)), yb = yOf(botFn(x));
    pos.push(x, yt, zFace, x, yb, zFace);
    uv.push(x / uvScale, yt / uvScale, x / uvScale, yb / uvScale);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function sideGeometry(x, zTopD, zBotD, uvScale = 45) {
  const yt = yOf(zTopD), yb = yOf(zBotD);
  const g = new THREE.BufferGeometry();
  const pos = [x, yt, 0, x, yb, 0, x, yt, BACK, x, yb, BACK];
  const uv = [0, yt / uvScale, 0, yb / uvScale, -BACK / uvScale, yt / uvScale, -BACK / uvScale, yb / uvScale];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(x > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]);
  g.computeVertexNormals();
  return g;
}

function mudColor(sg) {
  const t = Math.min(Math.max((sg - 1.0) / 1.0, 0), 1);
  return new THREE.Color().setRGB(0.72 - 0.35 * t, 0.58 - 0.33 * t, 0.40 - 0.24 * t, THREE.SRGBColorSpace);
}

export function buildSection() {
  const group = new THREE.Group();
  const labels = [];
  // Formasjoner
  for (const f of FORMATIONS) {
    const tex = patternTexture(LITH_KIND[f.id] || 'clay', f.color);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const top = (x) => (f.top <= SEABED + 1 ? SEABED : surfaceDepth(f.top, x));
    const bot = (x) => (f.base >= FORMATIONS[FORMATIONS.length - 1].base ? DEPTH_MAX + 150 : surfaceDepth(f.base, x));
    const face = new THREE.Mesh(bandGeometry(top, bot, 0), mat);
    face.userData.part = f.perm ? 'reservoir' : null;
    face.receiveShadow = false;
    group.add(face);
    for (const sx of [-HALF, HALF]) {
      group.add(new THREE.Mesh(sideGeometry(sx, top(sx), bot(sx)), mat));
    }
    const thick = bot(HALF) - top(HALF);
    labels.push({ text: f.name, sub: thick > 180 ? f.lith : null, pos: [HALF + 12, yOf((top(HALF) + bot(HALF)) / 2), 0], kind: 'formation', color: f.color });
  }
  // Spre etikettene slik at tynne lag ikke overlapper (minst 70 m mellom etikettene)
  const fl = labels.filter((l) => l.kind === 'formation').sort((a, b) => b.pos[1] - a.pos[1]);
  for (let i = 1; i < fl.length; i++) {
    const gap = fl[i].sub ? 90 : 70;
    if (fl[i - 1].pos[1] - fl[i].pos[1] < gap) fl[i].pos[1] = fl[i - 1].pos[1] - gap;
  }
  // Væskekontakter i reservoaret (gass rød, olje grønn, vann blå)
  const overlay = (topFn, botFn, color, opacity) => {
    const g = bandGeometry(topFn, botFn, 0.2, 80);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.renderOrder = 2;
    group.add(m);
  };
  const tar = FORMATIONS.find((f) => f.id === 'tarbert');
  const eti = FORMATIONS.find((f) => f.id === 'etive');
  overlay((x) => Math.min(surfaceDepth(tar.top, x), GWC), (x) => Math.min(surfaceDepth(tar.base, x), GWC), '#e0412f', 0.42);
  overlay((x) => Math.min(surfaceDepth(eti.top, x), OWC), (x) => Math.min(surfaceDepth(eti.base, x), OWC), '#2f9e44', 0.42);
  overlay((x) => Math.max(surfaceDepth(eti.top, x), OWC), (x) => Math.max(surfaceDepth(eti.base, x), OWC), '#2f6fb3', 0.28);
  labels.push({ text: 'Gass', pos: [-160, yOf(2905), 1], kind: 'fluid' });
  labels.push({ text: 'Olje', pos: [-150, yOf(2992), 1], kind: 'fluid' });
  labels.push({ text: 'Vann (OWC 3015 m)', pos: [-400, yOf(3070), 1], kind: 'fluid' });

  // Bunn
  const bottom = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF, -BACK), new THREE.MeshStandardMaterial({ color: '#2a2622' }));
  bottom.rotation.x = Math.PI / 2;
  bottom.position.set(0, yOf(DEPTH_MAX + 150), BACK / 2);
  group.add(bottom);

  // Vannsøyle (kun synlig i snittvisning)
  const wg = new THREE.PlaneGeometry(2 * HALF, SEABED - RKB, 1, 1);
  const cols = [];
  const c1 = new THREE.Color('#2e7fa6'), c2 = new THREE.Color('#0b3346');
  for (let i = 0; i < 4; i++) cols.push(...(i < 2 ? c1 : c2).toArray());
  wg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const water = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  water.position.set(0, -(SEABED - RKB) / 2, -0.5);
  water.renderOrder = 1;
  group.add(water);

  // Dybdemerker
  for (let z = 500; z <= 3000; z += 500) labels.push({ text: `${z} m`, pos: [-HALF - 14, yOf(z), 0], kind: 'depth' });
  labels.push({ text: 'Havbunn 377 m', pos: [-HALF - 14, yOf(SEABED), 0], kind: 'depth' });
  labels.push({ text: 'Havflate', pos: [-HALF - 14, 0, 0], kind: 'depth' });

  // Brønnskjema (dynamisk, bygges på nytt ved endringer)
  const wellMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const wellMesh = new THREE.Mesh(new THREE.BufferGeometry(), wellMat);
  wellMesh.position.z = 1.2;
  wellMesh.renderOrder = 3;
  group.add(wellMesh);
  const bitGlow = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffb347' }));
  bitGlow.userData.part = 'bit';
  group.add(bitGlow);

  let lastKey = '';
  function update(sim, force = false) {
    const key = [Math.round(sim.holeDepth * 2), Math.round(sim.bitDepth * 2), sim.casings.length, sim.bopInstalled, sim.bopClosed,
      sim.an.length, Math.round(sim.pitSg * 100), sim.an.filter((g) => g.gas).map((g) => Math.round(g.zTop)).join(',')].join('|');
    if (!force && key === lastKey) return;
    lastKey = key;
    const P = [], C = [];
    const quad = (x0, x1, z0, z1, color) => {
      const y0 = yOf(z0), y1 = yOf(z1);
      P.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y0, 0, x1, y1, 0, x0, y1, 0);
      for (let i = 0; i < 6; i++) C.push(color.r, color.g, color.b);
    };
    const sym = (r0, r1, z0, z1, color) => { quad(-r1, -r0, z0, z1, color); quad(r0, r1, z0, z1, color); };
    const steel = new THREE.Color('#5b666c');
    const cement = new THREE.Color('#b9b6ad');
    const sea = new THREE.Color('#3b8fb3');
    // Hull og sement bak foringsrørene
    const holeSizes = SECTIONS.map((s) => s.hole);
    sim.casings.forEach((c) => {
      const holeR = inch(holeSizes[c.section]) / 2 * EX;
      const odR = inch(c.od) / 2 * EX;
      const toc = c.section <= 1 ? c.top : Math.max(c.top, c.shoe - 350);
      sym(odR, holeR, toc, c.shoe, cement);
    });
    // Åpent hull under siste sko
    const lastShoe = sim.lastShoe;
    const holeR = inch(sim.section.hole) / 2 * EX;
    // Væske i brønnen (ringrom): segmenter fra simuleringen
    const segs = sim.an;
    const innerDAt = (z) => {
      let best = null;
      for (const c of sim.casings) if (z >= c.top && z <= c.shoe && (best === null || c.id < best)) best = c.id;
      if (z < SEABED) return sim.bopInstalled ? 19.5 : null;
      return best ?? sim.section.hole;
    };
    const fillFluid = (z0, z1, color) => {
      const steps = Math.max(1, Math.ceil((z1 - z0) / 60));
      for (let i = 0; i < steps; i++) {
        const a = z0 + (z1 - z0) * i / steps, b = z0 + (z1 - z0) * (i + 1) / steps;
        const D = innerDAt((a + b) / 2);
        if (D === null) continue;
        const r = inch(D) / 2 * EX;
        quad(-r, r, a, b, color);
      }
    };
    const zTopWell = sim.bopInstalled ? 0 : SEABED;
    for (const g of segs) {
      if (g.zTop === undefined) continue;
      const z0 = Math.max(Math.min(g.zTop, g.zBot), zTopWell), z1 = Math.max(g.zTop, g.zBot);
      if (z1 - z0 < 0.05) continue;
      const col = g.gas ? new THREE.Color('#ff5a2c') : g.oil ? new THREE.Color('#3f8f3a') : (sim.section.riserless ? sea : mudColor(g.sg));
      fillFluid(z0, z1, col);
    }
    // Rottehull og væske under krona
    if (sim.holeDepth > sim.bitDepth + 0.1) fillFluid(sim.bitDepth, sim.holeDepth, segs[0] && !segs[0].gas ? mudColor(segs[0].sg) : sea);
    // Foringsrørvegger
    sim.casings.forEach((c) => {
      const odR = inch(c.od) / 2 * EX, idR = Math.max(inch(c.id) / 2 * EX, odR - 2.2);
      sym(Math.min(idR, odR - 0.9), odR, c.top, c.shoe, steel);
      // Sko
      sym(odR - 0.2, odR + 1.4, c.shoe - 6, c.shoe, new THREE.Color('#39434a'));
    });
    // Åpent hull – mørk kant
    if (sim.holeDepth > lastShoe) sym(holeR, holeR + 1.0, lastShoe, sim.holeDepth, new THREE.Color('#4a3a2a'));
    quad(-holeR - 1, holeR + 1, sim.holeDepth, sim.holeDepth + 1.4, new THREE.Color('#4a3a2a'));
    // Stigerør
    if (sim.bopInstalled) {
      const rr = inch(19.5) / 2 * EX, ro = inch(21) / 2 * EX + 0.8;
      sym(rr, ro, RKB * 0 + 20, SEABED - 16, new THREE.Color('#9aa4a9'));
      quad(-ro - 4, ro + 4, SEABED - 16, SEABED - 3, new THREE.Color(sim.bopClosed ? '#e84b2c' : '#e1b021'));
    }
    // Borestreng
    const secs = sim.geom.secs;
    for (const s of secs) {
      const r = inch(s.od) / 2 * EX;
      quad(-r, r, Math.max(s.top, 0), s.bot, s.tool ? new THREE.Color('#c96f2a') : new THREE.Color('#aab3b8'));
    }
    const P32 = new Float32Array(P), C32 = new Float32Array(C);
    wellMesh.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P32, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(C32, 3));
    wellMesh.geometry = geo;
    const br = inch(sim.section.hole) / 2 * EX;
    bitGlow.scale.set(br, br * 0.6, 2);
    bitGlow.position.set(0, yOf(sim.bitDepth) + br * 0.3, 1.6);
  }

  return { group, water, wellMesh, bitGlow, labels, update, HALF, DEPTH_MAX };
}
