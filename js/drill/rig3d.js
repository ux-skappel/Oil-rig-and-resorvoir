// 3D-modell av en halvt nedsenkbar borerigg med stigerør, BOP, ankerliner, ROV og forsyningsskip.
// Enheter: meter. Origo i riggens senter ved havflaten. Boredekket (RKB) ligger på y = 27.
import * as THREE from 'three';
import { RKB, WATER_DEPTH, STAND_LENGTH } from './config.js';

const SEABED_Y = -WATER_DEPTH;

// ---------- Hjelpere ----------
// Slår sammen geometrier (posisjon, normal, uv) til én, slik at fagverk tegnes med ett kall
function mergeGeometries(geoms) {
  let vCount = 0, iCount = 0;
  for (const g of geoms) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const g of geoms) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
      io += a.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = vo + i;
      io += n;
    }
    vo += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.25, ...o });

function roundedBoxGeom(w, h, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -h / 2, 0);
  return g;
}

function strutGeom(a, b, r, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.applyQuaternion(q);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

function boxGeom(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function cylGeom(rt, rb, h, x, y, z, seg = 16) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

function mesh(geom, material, part) {
  const m = new THREE.Mesh(geom, material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (part) m.userData.part = part;
  return m;
}

function partGroup(key) {
  const g = new THREE.Group();
  g.userData.part = key;
  g.name = key;
  return g;
}

// ---------- Tekstur-generatorer (canvas) ----------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function windowsTexture() {
  return canvasTex(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e9ebe8'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#c9ccc8';
    for (let r = 0; r < 5; r++) ctx.fillRect(0, r * 51 + 45, w, 4);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 22; c++) {
        ctx.fillStyle = (r * 7 + c * 3) % 11 === 0 ? '#f6d98a' : '#3d4f5c';
        ctx.fillRect(8 + c * 23, 14 + r * 51, 14, 20);
      }
    }
  });
}

function helideckTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#3f4a45'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 22;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, 150, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#f4f4f0'; ctx.lineWidth = 10;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + i * Math.PI / 4;
      const x = w / 2 + 236 * Math.cos(a), y = h / 2 + 236 * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.stroke();
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(w / 2 - 70, h / 2 - 90, 34, 180);
    ctx.fillRect(w / 2 + 36, h / 2 - 90, 34, 180);
    ctx.fillRect(w / 2 - 40, h / 2 - 16, 80, 32);
  });
}

function pipeStripeTexture() {
  return canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#9aa3a8'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5b6368'; ctx.fillRect(0, 0, w / 4, h);
    ctx.fillStyle = '#c8cfd2'; ctx.fillRect(w / 2, 0, w / 8, h);
  }, [1, 20]);
}

function buoyancyTexture() {
  return canvasTex(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#e8e5dc'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3b3f42'; ctx.fillRect(0, 0, w, 10);
    ctx.fillStyle = '#d0cdc3'; ctx.fillRect(0, h / 2, w, 3);
  }, [3, 14]);
}

// ---------- Hovedbygger ----------
export function buildRig() {
  const rig = new THREE.Group();        // alt som hiver med riggen
  const subsea = new THREE.Group();     // stigerør, BOP, ankre (står stille)
  const parts = {};
  const anim = {};
  const labels = [];
  const add = (key, obj, parent = rig) => { parent.add(obj); parts[key] = parts[key] || []; parts[key].push(obj); return obj; };

  const hullMat = M('#a8402b', { roughness: 0.6, metalness: 0.2 });
  const hullDark = M('#5a2a20', { roughness: 0.8 });
  const deckMat = M('#c6c9c7', { roughness: 0.65 });
  const deckTop = M('#666d70', { roughness: 0.85 });
  const whiteMat = M('#e9e7e1', { roughness: 0.55, metalness: 0.3 });
  const steelMat = M('#8d969b', { roughness: 0.45, metalness: 0.75 });
  const darkSteel = M('#3d4448', { roughness: 0.5, metalness: 0.7 });
  const yellowMat = M('#e1b021', { roughness: 0.5, metalness: 0.3 });
  const orangeMat = M('#f06a1d', { roughness: 0.45 });
  const blueGrey = M('#6f8595', { roughness: 0.6 });

  // Pongtonger
  {
    const g = partGroup('pontoon');
    for (const x of [-32, 32]) {
      g.add(mesh(roundedBoxGeom(17, 10, 104, 5), hullMat, 'pontoon')).position.set(x, -18, 0);
    }
    add('pontoon', g);
    labels.push({ part: 'pontoon', pos: [32, -14, 48] });
  }
  // Søyler
  {
    const g = partGroup('column');
    for (const x of [-32, 32]) for (const z of [-36, 36]) {
      const m = mesh(roundedBoxGeom(15, 25, 15, 3.5), hullMat, 'column');
      m.position.set(x, -0.5, z);
      g.add(m);
      const band = mesh(roundedBoxGeom(15.2, 2.2, 15.2, 3.6), whiteMat, 'column');
      band.position.set(x, 9.5, z);
      g.add(band);
    }
    add('column', g);
    labels.push({ part: 'column', pos: [39.5, 4, 43] });
  }
  // Stag
  {
    const geoms = [];
    for (const z of [-14, 14]) geoms.push(strutGeom(new THREE.Vector3(-24, -9, z), new THREE.Vector3(24, -9, z), 1.5, 14));
    geoms.push(strutGeom(new THREE.Vector3(-24, -9, -14), new THREE.Vector3(24, -9, 14), 1.1, 12));
    add('brace', mesh(mergeGeometries(geoms), hullDark, 'brace'));
  }
  // Dekkskasse
  {
    const g = partGroup('deckbox');
    g.add(mesh(roundedBoxGeom(76, 9, 82, 2), deckMat, 'deckbox')).position.set(0, 16.5, 0);
    g.add(mesh(boxGeom(74, 0.3, 80, 0, 21.15, 0), deckTop, 'deckbox'));
    // Rekkverk
    const rails = [];
    for (const [a, b] of [[[-38, -41], [38, -41]], [[38, -41], [38, 41]], [[38, 41], [-38, 41]], [[-38, 41], [-38, -41]]]) {
      rails.push(strutGeom(new THREE.Vector3(a[0], 22.3, a[1]), new THREE.Vector3(b[0], 22.3, b[1]), 0.05, 4));
    }
    g.add(mesh(mergeGeometries(rails), yellowMat, 'deckbox'));
    add('deckbox', g);
    labels.push({ part: 'deckbox', pos: [-38, 17, -30] });
  }
  // Boredekk og understell
  {
    const g = partGroup('drillfloor');
    g.add(mesh(boxGeom(22, 5.4, 22, 0, 24, 0), M('#7c8388'), 'drillfloor'));
    g.add(mesh(boxGeom(25, 0.8, 25, 0, 26.6, 0), M('#4f5559', { roughness: 0.9 }), 'drillfloor'));
    add('drillfloor', g);
    labels.push({ part: 'drillfloor', pos: [11, 28, 11], minor: true });
    const r = partGroup('rotary');
    r.add(mesh(cylGeom(1.4, 1.4, 0.35, 0, 27.15, 0, 24), darkSteel, 'rotary'));
    const slips = mesh(cylGeom(0.35, 0.3, 0.6, 0, 27.5, 0, 12), M('#b8bec2', { metalness: 0.8 }), 'rotary');
    slips.visible = false;
    r.add(slips);
    anim.slips = slips;
    add('rotary', r);
  }
  // Boretårn (fagverk)
  {
    const geoms = [];
    const H0 = RKB + 0.6, H1 = RKB + 55, b0 = 6, b1 = 2.6;
    const corner = (sx, sz, y) => {
      const f = (y - H0) / (H1 - H0);
      const b = b0 + (b1 - b0) * f;
      return new THREE.Vector3(sx * b, y, sz * b);
    };
    const C = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    for (const [sx, sz] of C) geoms.push(strutGeom(corner(sx, sz, H0), corner(sx, sz, H1), 0.32, 8));
    const nLev = 11;
    for (let i = 0; i <= nLev; i++) {
      const y = H0 + (H1 - H0) * i / nLev;
      for (let k = 0; k < 4; k++) {
        const [ax, az] = C[k], [bx, bz] = C[(k + 1) % 4];
        const front = ax === 1 && bx === 1;
        if (front && i < 4) continue;                 // V-døren er åpen nederst
        geoms.push(strutGeom(corner(ax, az, y), corner(bx, bz, y), 0.14, 5));
      }
      if (i < nLev) {
        const y2 = H0 + (H1 - H0) * (i + 1) / nLev;
        for (let k = 0; k < 4; k++) {
          const [ax, az] = C[k], [bx, bz] = C[(k + 1) % 4];
          const front = ax === 1 && bx === 1;
          if (front && i < 4) continue;
          geoms.push(strutGeom(corner(ax, az, y), corner(bx, bz, y2), 0.09, 4));
          geoms.push(strutGeom(corner(bx, bz, y), corner(ax, az, y2), 0.09, 4));
        }
      }
    }
    add('derrick', mesh(mergeGeometries(geoms), whiteMat, 'derrick'));
    labels.push({ part: 'derrick', pos: [0, RKB + 42, 5] });
    // Føringsskinner for toppdrevet
    const rails = [strutGeom(new THREE.Vector3(-0.9, RKB, -1.9), new THREE.Vector3(-0.9, H1 - 2, -1.9), 0.12, 6),
      strutGeom(new THREE.Vector3(0.9, RKB, -1.9), new THREE.Vector3(0.9, H1 - 2, -1.9), 0.12, 6)];
    add('derrick', mesh(mergeGeometries(rails), darkSteel, 'derrick'));
    // Kronblokk og CMC
    const cg = partGroup('crown');
    cg.add(mesh(boxGeom(6, 3.2, 6, 0, H1 + 1.6, 0), whiteMat, 'crown'));
    cg.add(mesh(cylGeom(0.55, 0.55, 5, -1.6, H1 + 5.6, 0, 14), steelMat, 'crown'));
    cg.add(mesh(cylGeom(0.55, 0.55, 5, 1.6, H1 + 5.6, 0, 14), steelMat, 'crown'));
    cg.add(mesh(boxGeom(4.4, 1.2, 2.8, 0, H1 + 3.8, 0), yellowMat, 'crown'));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff3b2f' }));
    lamp.position.set(0, H1 + 8.5, 0);
    cg.add(lamp);
    add('crown', cg);
    labels.push({ part: 'crown', pos: [0, H1 + 7, 0] });
    anim.crownY = H1;
    // Fingerbrett
    const fb = partGroup('setback');
    fb.add(mesh(boxGeom(9.8, 0.35, 2.8, 0, RKB + STAND_LENGTH - 1.5, -4.3), M('#d0cfc8'), 'setback'));
    add('setback', fb);
  }
  // Stativ i rørstativet (instansert)
  {
    const geo = new THREE.CylinderGeometry(0.07, 0.07, STAND_LENGTH, 6);
    geo.translate(0, STAND_LENGTH / 2, 0);
    const n = 48;
    const inst = new THREE.InstancedMesh(geo, M('#8f989d', { metalness: 0.7, roughness: 0.4 }), n);
    inst.userData.part = 'setback';
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (let iz = 0; iz < 4; iz++) for (let ix = 0; ix < 12; ix++) {
      m4.makeTranslation(-4.2 + ix * 0.76, RKB + 0.1, -5.3 + iz * 0.6);
      inst.setMatrixAt(i++, m4);
    }
    inst.castShadow = true;
    add('setback', inst);
    anim.stands = inst;
    anim.standsTotal = n;
    labels.push({ part: 'setback', pos: [-2, RKB + 20, -4.5], minor: true });
  }
  // Løpeblokk, toppdrev og borestreng (animert)
  {
    const td = partGroup('topdrive');
    td.add(mesh(boxGeom(1.6, 4.2, 1.5, 0, 2.6, 0), orangeMat, 'topdrive'));
    td.add(mesh(cylGeom(0.75, 0.75, 1.6, 0, 5.4, 0, 16), M('#2f3437', { metalness: 0.6 }), 'topdrive'));
    td.add(mesh(boxGeom(2.2, 0.7, 0.6, 0, 3.2, -1.25), darkSteel, 'topdrive'));
    td.add(mesh(cylGeom(0.12, 0.12, 0.9, 0, 0.35, 0, 10), steelMat, 'topdrive'));
    add('topdrive', td);
    anim.topDrive = td;
    const bl = partGroup('block');
    bl.add(mesh(boxGeom(2.2, 2.8, 1.2, 0, 1.4, 0), yellowMat, 'block'));
    bl.add(mesh(cylGeom(0.1, 0.1, 1.8, -0.5, -0.6, 0, 6), steelMat, 'block'));
    bl.add(mesh(cylGeom(0.1, 0.1, 1.8, 0.5, -0.6, 0, 6), steelMat, 'block'));
    add('block', bl);
    anim.block = bl;
    // Borewire (linjer fra kronblokk til løpeblokk)
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const x = -0.9 + i * 0.2;
      pts.push(new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 1, 0));
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#2b2f31' }));
    rig.add(lines);
    anim.drillLine = lines;
    // Borerør over boredekket
    const tex = pipeStripeTexture();
    const pipe = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 12, 1, true), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.7, roughness: 0.35 }), 'drillpipe');
    add('drillpipe', pipe);
    anim.pipe = pipe;
    anim.pipeTex = tex;
    labels.push({ part: 'topdrive', pos: [0, RKB + 20, 0], dynamic: 'topdrive', minor: true });
    // Stativ som flyttes under kobling
    const moving = mesh(new THREE.CylinderGeometry(0.07, 0.07, STAND_LENGTH, 8), M('#8f989d', { metalness: 0.7 }), 'racker');
    moving.visible = false;
    rig.add(moving);
    anim.movingStand = moving;
  }
  // Heiseverk
  {
    const g = partGroup('drawworks');
    g.add(mesh(boxGeom(5.5, 3, 3.2, -9.5, RKB + 1.5, -3), M('#2f5d7c'), 'drawworks'));
    const drum = mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 20), darkSteel, 'drawworks');
    drum.rotation.x = Math.PI / 2;
    drum.position.set(-9.5, RKB + 3.3, -3);
    g.add(drum);
    add('drawworks', g);
    labels.push({ part: 'drawworks', pos: [-9.5, RKB + 4.5, -3], minor: true });
    const dl = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-9.5, RKB + 4, -3), new THREE.Vector3(-2, RKB + 55, -0.5)]);
    rig.add(new THREE.Line(dl, new THREE.LineBasicMaterial({ color: '#2b2f31' })));
  }
  // Borebu
  {
    const g = partGroup('cabin');
    g.add(mesh(boxGeom(4.5, 3.2, 4, -9, RKB + 1.6, 7), whiteMat, 'cabin'));
    const glass = mesh(boxGeom(4.6, 1.8, 4.1, -9, RKB + 2, 7), new THREE.MeshStandardMaterial({ color: '#27465a', metalness: 0.9, roughness: 0.08, emissive: '#10222c' }), 'cabin');
    g.add(glass);
    add('cabin', g);
    labels.push({ part: 'cabin', pos: [-9, RKB + 4, 7], minor: true });
  }
  // Jernsjauer
  {
    const g = partGroup('roughneck');
    g.add(mesh(boxGeom(1.4, 1.2, 1.4, -3.4, RKB + 0.6, 2.6), M('#c9352a'), 'roughneck'));
    const arm = new THREE.Group();
    arm.position.set(-3.4, RKB + 1.2, 2.6);
    arm.add(mesh(boxGeom(0.5, 0.5, 1, 0, 0, 0), M('#c9352a'), 'roughneck'));
    const head = mesh(boxGeom(1.1, 1.3, 1.1, 0, 0.2, 0), M('#8b2019'), 'roughneck');
    arm.add(head);
    g.add(arm);
    add('roughneck', g);
    anim.roughneckArm = arm;
    anim.roughneckHead = head;
    labels.push({ part: 'roughneck', pos: [-3.4, RKB + 2.5, 2.6], minor: true });
  }
  // Rørhåndteringsmaskin
  {
    const g = partGroup('racker');
    g.add(mesh(cylGeom(0.35, 0.35, STAND_LENGTH, 4.7, RKB + STAND_LENGTH / 2, -2.3, 10), M('#d99d1c'), 'racker'));
    const armLow = mesh(boxGeom(2.4, 0.4, 0.4, 3.5, RKB + 3, -2.3), M('#d99d1c'), 'racker');
    const armHigh = mesh(boxGeom(2.4, 0.4, 0.4, 3.5, RKB + 24, -2.3), M('#d99d1c'), 'racker');
    g.add(armLow, armHigh);
    add('racker', g);
    labels.push({ part: 'racker', pos: [4.7, RKB + 15, -2.3], minor: true });
  }
  // V-dør og rørrampe
  {
    const g = partGroup('catwalk');
    const ramp = mesh(new THREE.BoxGeometry(18, 0.4, 2.4), M('#b8bcbd'), 'catwalk');
    ramp.position.set(19.5, RKB - 2.8, 0);
    ramp.rotation.z = -0.33;
    g.add(ramp);
    g.add(mesh(boxGeom(10, 1.2, 2.6, 31, 21.9, 0), M('#9ea4a6'), 'catwalk'));
    add('catwalk', g);
  }
  // Rørdekk med borerør og foringsrør
  {
    const g = partGroup('pipedeck');
    const pipeGeo = new THREE.CylinderGeometry(0.07, 0.07, 12, 6);
    pipeGeo.rotateX(Math.PI / 2);
    const inst = new THREE.InstancedMesh(pipeGeo, M('#7f888c', { metalness: 0.6 }), 120);
    const m4 = new THREE.Matrix4();
    let i = 0;
    for (let stack = 0; stack < 2; stack++) for (let r = 0; r < 5; r++) for (let c = 0; c < 12; c++) {
      m4.makeTranslation(16 + c * 0.18 + stack * 6, 21.45 + r * 0.15, -22 + stack * 0);
      inst.setMatrixAt(i++, m4);
    }
    inst.userData.part = 'pipedeck';
    g.add(inst);
    const csgGeo = new THREE.CylinderGeometry(0.17, 0.17, 12, 10);
    csgGeo.rotateX(Math.PI / 2);
    const csg = new THREE.InstancedMesh(csgGeo, M('#3f6b52', { metalness: 0.5 }), 30);
    i = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 10; c++) {
      m4.makeTranslation(17 + c * 0.36, 21.5 + r * 0.33, -8);
      csg.setMatrixAt(i++, m4);
    }
    csg.userData.part = 'pipedeck';
    g.add(csg);
    add('pipedeck', g);
    labels.push({ part: 'pipedeck', pos: [20, 23, -22] });
  }
  // Kraner
  {
    const g = partGroup('crane');
    const mk = (x, z, yaw) => {
      const c = new THREE.Group();
      c.position.set(x, 21, z);
      c.rotation.y = yaw;
      c.add(mesh(cylGeom(1.5, 1.8, 9, 0, 4.5, 0, 16), yellowMat, 'crane'));
      c.add(mesh(boxGeom(3.4, 3, 4.2, 0, 10.5, 0), yellowMat, 'crane'));
      c.add(mesh(boxGeom(1.6, 1.6, 1.6, 1.4, 11, 1.8), new THREE.MeshStandardMaterial({ color: '#23394a', metalness: 0.9, roughness: 0.1 }), 'crane'));
      const bg = [];
      const L = 44, ang = 0.62;
      const tip = new THREE.Vector3(0, 11 + L * Math.sin(ang), -L * Math.cos(ang));
      const base = [new THREE.Vector3(-1, 10.5, -1), new THREE.Vector3(1, 10.5, -1), new THREE.Vector3(0, 12.2, -1)];
      for (const b of base) bg.push(strutGeom(b, tip, 0.2, 5));
      for (let k = 1; k < 10; k++) {
        const f = k / 10;
        const p = base.map((b) => b.clone().lerp(tip, f));
        bg.push(strutGeom(p[0], p[1], 0.07, 4), strutGeom(p[1], p[2], 0.07, 4), strutGeom(p[2], p[0], 0.07, 4));
      }
      c.add(mesh(mergeGeometries(bg), yellowMat, 'crane'));
      const hook = new THREE.BufferGeometry().setFromPoints([tip, new THREE.Vector3(tip.x, 14, tip.z)]);
      c.add(new THREE.Line(hook, new THREE.LineBasicMaterial({ color: '#222' })));
      return c;
    };
    g.add(mk(31, 33, Math.PI * 0.75));
    g.add(mk(-31, -35, -Math.PI * 0.25));
    add('crane', g);
    labels.push({ part: 'crane', pos: [31, 34, 33] });
  }
  // Boligkvarter og helikopterdekk
  {
    const g = partGroup('lq');
    const wt = windowsTexture();
    const lqMat = [M('#e9ebe8'), M('#e9ebe8'), M('#dfe1de'), M('#e9ebe8'), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.6 }), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.6 })];
    const lq = new THREE.Mesh(new THREE.BoxGeometry(26, 16, 16), lqMat);
    lq.position.set(-24, 29, 30);
    lq.castShadow = true; lq.receiveShadow = true;
    lq.userData.part = 'lq';
    g.add(lq);
    add('lq', g);
    labels.push({ part: 'lq', pos: [-24, 37.5, 38] });
    const h = partGroup('helideck');
    const hd = mesh(new THREE.CylinderGeometry(11.5, 11.5, 0.7, 8), [M('#59625e'), new THREE.MeshStandardMaterial({ map: helideckTexture(), roughness: 0.8 }), M('#59625e')], 'helideck');
    hd.rotation.y = Math.PI / 8;
    hd.position.set(-37, 39.2, 31);
    h.add(hd);
    const sup = [];
    for (const [a, b] of [[[-29, 37, 24], [-44, 38.8, 31]], [[-29, 37, 38], [-44, 38.8, 31]], [[-37, 29, 30], [-45, 38.6, 31]]]) sup.push(strutGeom(new THREE.Vector3(...a), new THREE.Vector3(...b), 0.3, 6));
    h.add(mesh(mergeGeometries(sup), whiteMat, 'helideck'));
    add('helideck', h);
    labels.push({ part: 'helideck', pos: [-37, 41, 31] });
  }
  // Livbåter
  {
    const g = partGroup('lifeboat');
    for (let i = 0; i < 4; i++) {
      const b = mesh(new THREE.CapsuleGeometry(1.5, 6, 6, 12), orangeMat, 'lifeboat');
      b.rotation.x = Math.PI / 2;
      b.position.set(-39.8, 24.5, 18 + i * 5.4 - 12);
      g.add(b);
      g.add(mesh(boxGeom(0.3, 3, 0.3, -38.6, 25.5, 18 + i * 5.4 - 15), whiteMat, 'lifeboat'));
    }
    add('lifeboat', g);
    labels.push({ part: 'lifeboat', pos: [-40, 27, 12] });
  }
  // Slamanlegg og pumperom
  {
    const g = partGroup('mud');
    g.add(mesh(boxGeom(16, 7, 13, -12, 24.5, -29), blueGrey, 'mud'));
    g.add(mesh(boxGeom(6, 2, 8, -2.5, 22, -16), M('#7d8b93'), 'mud'));
    add('mud', g);
    labels.push({ part: 'mud', pos: [-12, 29, -29] });
    const p = partGroup('pumps');
    p.add(mesh(boxGeom(18, 5.5, 9, 12, 23.8, -33), M('#8a9aa5'), 'pumps'));
    add('pumps', p);
    labels.push({ part: 'pumps', pos: [12, 27.5, -33] });
  }
  // Brennerbom
  {
    const g = partGroup('burner');
    const bg = [];
    const base = [new THREE.Vector3(37, 19, 14), new THREE.Vector3(37, 19, 18), new THREE.Vector3(37, 22, 16)];
    const tip = new THREE.Vector3(74, 27, 16);
    for (const b of base) bg.push(strutGeom(b, tip, 0.22, 5));
    for (let k = 1; k < 9; k++) {
      const f = k / 9;
      const q = base.map((b) => b.clone().lerp(tip, f));
      bg.push(strutGeom(q[0], q[1], 0.08, 4), strutGeom(q[1], q[2], 0.08, 4), strutGeom(q[2], q[0], 0.08, 4));
    }
    g.add(mesh(mergeGeometries(bg), M('#b7b1a3'), 'burner'));
    g.add(mesh(cylGeom(0.8, 0.5, 1.6, 74.5, 27.3, 16, 10), darkSteel, 'burner'));
    add('burner', g);
    labels.push({ part: 'burner', pos: [60, 26, 16] });
  }
  // Stigerørstrekkere under dekket
  {
    const g = partGroup('tensioner');
    const tg = [];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      tg.push(cylGeom(0.3, 0.3, 6, Math.cos(a) * 3.2, 9, Math.sin(a) * 3.2, 10));
    }
    g.add(mesh(mergeGeometries(tg), steelMat, 'tensioner'));
    g.add(mesh(cylGeom(3.8, 3.8, 0.6, 0, 11.7, 0, 24), darkSteel, 'tensioner'));
    const inner = mesh(new THREE.CylinderGeometry(0.3, 0.3, 18, 14), steelMat, 'tensioner');
    inner.position.set(0, 3, 0);
    g.add(inner);
    add('tensioner', g);
    labels.push({ part: 'tensioner', pos: [4, 7, 0] });
  }
  // Ankerfester (fairleads) på søylene
  const fairleads = [];
  for (const [x, z] of [[-39.5, 43.5], [39.5, 43.5], [39.5, -43.5], [-39.5, -43.5]]) {
    const base = Math.atan2(z, x);
    for (const d of [-0.28, 0.28]) {
      fairleads.push({ p: new THREE.Vector3(x, -12, z), dir: base + d });
    }
  }

  // ---------- Havbunn og stigerør (står stille) ----------
  // Ytre teleskopledd og stigerør
  {
    const g = partGroup('riser');
    const bt = buoyancyTexture();
    const outer = mesh(new THREE.CylinderGeometry(0.45, 0.45, 20, 16), steelMat, 'tensioner');
    outer.position.set(0, -12, 0);
    g.add(outer);
    const bare1 = mesh(new THREE.CylinderGeometry(0.27, 0.27, 20, 12), steelMat, 'riser');
    bare1.position.set(0, -32, 0);
    g.add(bare1);
    const bLen = 260;
    const buoy = mesh(new THREE.CylinderGeometry(0.66, 0.66, bLen, 20, 1, true), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.8 }), 'riser');
    buoy.position.set(0, -42 - bLen / 2, 0);
    g.add(buoy);
    const bottomTop = -42 - bLen;
    const lmrpTop = SEABED_Y + 15.5;
    const bare2 = mesh(new THREE.CylinderGeometry(0.27, 0.27, bottomTop - lmrpTop, 12), steelMat, 'riser');
    bare2.position.set(0, (bottomTop + lmrpTop) / 2, 0);
    g.add(bare2);
    subsea.add(g);
    parts.riser = [g];
    anim.riserGroup = g;
    labels.push({ part: 'riser', pos: [1.5, -150, 0], subsea: true });
    // Choke- og drepeline
    const cl = partGroup('chokeline');
    const clg = [strutGeom(new THREE.Vector3(0.95, lmrpTop - 4, 0.2), new THREE.Vector3(0.95, -4, 0.2), 0.07, 6),
      strutGeom(new THREE.Vector3(-0.95, lmrpTop - 4, 0.2), new THREE.Vector3(-0.95, -4, 0.2), 0.07, 6)];
    cl.add(mesh(mergeGeometries(clg), M('#50585c', { metalness: 0.6 }), 'chokeline'));
    subsea.add(cl);
    parts.chokeline = [cl];
    anim.chokeLines = cl;
  }
  // BOP-stakk og LMRP
  {
    const bop = partGroup('bop');
    const frameY0 = SEABED_Y + 3.2, frameY1 = SEABED_Y + 11;
    const fr = [];
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) fr.push(strutGeom(new THREE.Vector3(2.3 * sx, frameY0, 2.3 * sz), new THREE.Vector3(2.3 * sx, frameY1, 2.3 * sz), 0.18, 6));
    for (const y of [frameY0, frameY0 + 4, frameY1]) {
      for (const [a, b] of [[[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]], [[-1, 1], [1, 1]]]) {
        fr.push(strutGeom(new THREE.Vector3(2.3 * a[0], y, 2.3 * a[1]), new THREE.Vector3(2.3 * b[0], y, 2.3 * b[1]), 0.15, 5));
      }
    }
    bop.add(mesh(mergeGeometries(fr), yellowMat, 'bop'));
    const body = M('#2d3236', { metalness: 0.5, roughness: 0.55 });
    bop.add(mesh(cylGeom(0.8, 0.8, 7.8, 0, SEABED_Y + 7.1, 0, 16), body, 'bop'));
    // Rørsikringer (rams): horisontale sylindre
    const ramG = [];
    for (let i = 0; i < 4; i++) {
      const y = SEABED_Y + 4.2 + i * 1.6;
      const g1 = new THREE.CylinderGeometry(0.45, 0.45, 4.2, 14);
      g1.rotateZ(Math.PI / 2);
      g1.translate(0, y, 0);
      ramG.push(g1);
    }
    bop.add(mesh(mergeGeometries(ramG), M('#c43a2c', { roughness: 0.5 }), 'bop'));
    subsea.add(bop);
    parts.bop = [bop];
    labels.push({ part: 'bop', pos: [2.8, SEABED_Y + 8, 2.8], subsea: true });
    anim.bop = bop;
    const lm = partGroup('lmrp');
    lm.add(mesh(cylGeom(1.25, 1.25, 2.4, 0, SEABED_Y + 12.4, 0, 20), body, 'lmrp'));
    lm.add(mesh(cylGeom(0.9, 0.9, 1.6, 0, SEABED_Y + 14.4, 0, 16), steelMat, 'lmrp'));
    lm.add(mesh(boxGeom(1.1, 2.2, 1.1, 2.1, SEABED_Y + 12.6, 0), yellowMat, 'lmrp'));
    lm.add(mesh(boxGeom(1.1, 2.2, 1.1, -2.1, SEABED_Y + 12.6, 0), M('#2468a8'), 'lmrp'));
    const annular = lm.children[0];
    anim.annular = annular;
    subsea.add(lm);
    parts.lmrp = [lm];
    anim.lmrp = lm;
    labels.push({ part: 'lmrp', pos: [2.6, SEABED_Y + 14, 0], subsea: true });
  }
  // Brønnhode, lederør og bunnramme
  {
    const g = partGroup('wellhead');
    g.add(mesh(cylGeom(0.62, 0.7, 3.2, 0, SEABED_Y + 1.6, 0, 20), steelMat, 'wellhead'));
    g.add(mesh(boxGeom(7, 0.6, 7, 0, SEABED_Y + 0.3, 0), M('#6f6a58'), 'wellhead'));
    subsea.add(g);
    parts.wellhead = [g];
    anim.wellhead = g;
    labels.push({ part: 'wellhead', pos: [3.5, SEABED_Y + 2, 3.5], subsea: true });
  }
  // Borestreng i vann (kun uten stigerør)
  {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 8), M('#8f989d', { metalness: 0.7 }));
    s.userData.part = 'drillpipe';
    s.visible = false;
    subsea.add(s);
    anim.openWaterString = s;
  }
  // Borekaksky ved havbunnen (uten stigerør)
  {
    const pts = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 14;
      pts[i * 3] = Math.cos(a) * r; pts[i * 3 + 1] = SEABED_Y + Math.random() * 5; pts[i * 3 + 2] = Math.sin(a) * r;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const cloud = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#8c7a5c', size: 0.7, transparent: true, opacity: 0.55, depthWrite: false }));
    cloud.visible = false;
    subsea.add(cloud);
    anim.cuttings = cloud;
  }
  // ROV
  {
    const g = partGroup('rov');
    g.add(mesh(boxGeom(2.6, 0.9, 1.7, 0, 0.45, 0), yellowMat, 'rov'));
    g.add(mesh(boxGeom(2.6, 0.7, 1.7, 0, -0.35, 0), M('#222')));
    g.add(mesh(cylGeom(0.25, 0.25, 0.4, 0.9, 0.9, 0.5, 10), M('#222')));
    const lampL = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff6d6' }));
    lampL.position.set(1.35, 0.1, 0.4);
    g.add(lampL);
    g.position.set(7, SEABED_Y + 7, 6);
    subsea.add(g);
    parts.rov = [g];
    anim.rov = g;
    labels.push({ part: 'rov', pos: [7, SEABED_Y + 9, 6], subsea: true, dynamic: 'rov' });
  }
  // Ankerliner (kjedelinjeform)
  {
    const g = partGroup('anchor');
    const mat = M('#3a3f42', { metalness: 0.6 });
    for (const f of fairleads) {
      const dir = new THREE.Vector3(Math.cos(f.dir), 0, Math.sin(f.dir));
      const touch = f.p.clone().add(dir.clone().multiplyScalar(900)).setY(SEABED_Y + 0.5);
      const anchorP = f.p.clone().add(dir.clone().multiplyScalar(1500)).setY(SEABED_Y + 0.5);
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const p = f.p.clone().lerp(touch, t);
        const sagT = Math.pow(1 - t, 1.8);
        p.y = SEABED_Y + 0.5 + (f.p.y - SEABED_Y - 0.5) * sagT;
        pts.push(p);
      }
      pts.push(anchorP);
      const curve = new THREE.CatmullRomCurve3(pts);
      g.add(mesh(new THREE.TubeGeometry(curve, 60, 0.28, 5, false), mat, 'anchor'));
    }
    subsea.add(g);
    parts.anchor = [g];
    labels.push({ part: 'anchor', pos: [120, -70, 140], subsea: true });
  }
  // Forsyningsskip
  {
    const g = partGroup('psv');
    const s = new THREE.Shape();
    s.moveTo(-42, -9); s.lineTo(30, -9); s.quadraticCurveTo(46, -7, 50, 0); s.quadraticCurveTo(46, 7, 30, 9); s.lineTo(-42, 9); s.lineTo(-42, -9);
    const hull = new THREE.ExtrudeGeometry(s, { depth: 8, bevelEnabled: false });
    hull.rotateX(-Math.PI / 2);
    hull.translate(0, -4, 0);
    g.add(mesh(hull, M('#b8322a'), 'psv'));
    g.add(mesh(boxGeom(92, 0.4, 18, 2, 4.2, 0), M('#5c6266'), 'psv'));
    g.add(mesh(boxGeom(18, 10, 15, 32, 9.2, 0), M('#ecece6'), 'psv'));
    g.add(mesh(boxGeom(10, 3, 16, 34, 15.5, 0), new THREE.MeshStandardMaterial({ color: '#23394a', metalness: 0.9, roughness: 0.15 }), 'psv'));
    const cargo = [];
    for (let i = 0; i < 6; i++) cargo.push(boxGeom(6, 2.6, 2.6, -30 + i * 8, 5.6, (i % 2) * 5 - 2.5));
    g.add(mesh(mergeGeometries(cargo), M('#3f7fb0'), 'psv'));
    g.position.set(-235, 0, -150);
    g.rotation.y = 0.45;
    parts.psv = [g];
    anim.psv = g;
    labels.push({ part: 'psv', pos: [-235, 18, -150], world: true, dynamic: 'psv' });
  }
  // Gassventilering fra slamgasseparatoren (toppen av tårnet)
  {
    const n = 180;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color: '#dfe6ea', size: 5.5, transparent: true, opacity: 0.0, depthWrite: false, sizeAttenuation: true });
    const plume = new THREE.Points(geo, pm);
    plume.frustumCulled = false;
    rig.add(plume);
    anim.plume = { points: plume, seeds: Array.from({ length: n }, () => Math.random()) };
  }

  return { rig, subsea, parts, anim, labels, fairleads };
}

export { SEABED_Y };
