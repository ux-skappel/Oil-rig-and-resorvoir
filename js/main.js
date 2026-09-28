// Oppstart: faner, scenariovalg, 3D-scene, borekonsoll, PVT-lab og ordliste.
import { DrillSim } from './drill/sim.js';
import { createDrillUI, scenarioCards } from './drill/ui.js';
import { createGlossary } from './glossaryView.js';
import { createPvtUI } from './pvt/ui.js';

const $ = (id) => document.getElementById(id);
const sim = new DrillSim('mid');
sim.paused = true;
window.__sim = sim;

let scene3d = null;
let ui = null;

// ---------- Faner ----------
const VIEWS = { drill: $('view-drill'), pvt: $('view-pvt'), glossary: $('view-glossary') };
let pvt = null;
function showView(key) {
  for (const [k, v] of Object.entries(VIEWS)) v.hidden = k !== key;
  for (const k of Object.keys(VIEWS)) $(`tab-${k}`).setAttribute('aria-selected', k === key ? 'true' : 'false');
  if (scene3d) scene3d.setVisible(key === 'drill');
  if (key === 'drill' && !started && typeof openStart === 'function' && document.readyState !== 'loading') openStart();
  if (key === 'pvt') {
    if (!pvt) pvt = createPvtUI(VIEWS.pvt);
    pvt.show();
  }
  try { localStorage.setItem('nsb-view', key); } catch (e) { /* lagring er valgfritt */ }
  if (location.hash !== `#${key}`) history.replaceState(null, '', `#${key}`);
}
for (const k of Object.keys(VIEWS)) $(`tab-${k}`).addEventListener('click', () => showView(k));

createGlossary(VIEWS.glossary, {
  onShowPart(key) {
    showView('drill');
    if (scene3d) scene3d.focusPart(key);
    ui && ui.showPart(key);
  },
});

// ---------- Scenariovalg ----------
function openStart() {
  $('start').hidden = false;
  sim.paused = true;
  const first = $('scen').querySelector('button');
  first && first.focus();
}
scenarioCards($('scen'), (id) => {
  started = true;
  sim.reset(id);
  sim.paused = false;
  $('start').hidden = true;
  if (ui) ui.resync();
  if (scene3d) scene3d.setCamera('oversikt');
  try { localStorage.setItem('nsb-started', '1'); } catch (e) { /* valgfritt */ }
});
let started = false;
$('start').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('start').hidden = true; sim.paused = false; started = true; }
});

// ---------- Konsoll og 3D-scene ----------
ui = createDrillUI(sim, null, { onRestart: openStart });
let lastT = performance.now();
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.25);
  lastT = now;
  if (!scene3d) sim.update(dt);        // 3D-løkken driver simuleringen når den er lastet
  ui.tick(dt);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

(async function init3D() {
  try {
    const mod = await import('./drill/scene3d.js');
    const sc = mod.createScene($('viewport'), sim, {
      onPart: (k) => ui.showPart(k),
      onHover: (k, ev) => ui.hoverPart(k, ev),
    });
    sc.cameras = mod.CAMERAS;
    sc.setVisible(!VIEWS.drill.hidden);
    scene3d = sc;
    ui.attachScene(sc);
  } catch (err) {
    console.error(err);
    $('webgl-fail').hidden = false;
    $('reload-3d').addEventListener('click', () => location.reload());
  }
})();

// Startvisning
let startView = 'drill';
const hash = location.hash.replace('#', '');
if (VIEWS[hash]) startView = hash;
else {
  try { const v = localStorage.getItem('nsb-view'); if (VIEWS[v]) startView = v; } catch (e) { /* valgfritt */ }
}
showView(startView);
if (startView === 'drill') openStart();
