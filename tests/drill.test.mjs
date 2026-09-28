// Kontroll av borefysikken: hydraulikk, krokvekt, brønnspark, stengte trykk og dreping.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DrillSim } from '../js/drill/sim.js';
import { porePressure, BAR_PER_M_SG, PUMP } from '../js/drill/config.js';
import { bitLossPsi, pipeLossPsi } from '../js/drill/hydraulics.js';
import { dcExponent, bitTorque } from '../js/drill/rop.js';

const run = (sim, s, dt = 1) => { for (let t = 0; t < s; t += dt) sim.step(dt); };

test('Triplex slampumpe 6½" × 12": ≈ 19 L per slag ved 97 %', () => {
  assert.ok(Math.abs(PUMP.litersPerStroke - 19.0) < 0.2, PUMP.litersPerStroke);
});

test('Trykktap over kronedyser (Bingham/feltformel)', () => {
  // 500 gpm, 12 ppg, TFA 0.5 in² → 8.311e-5·12·500²/(0.95²·0.25) ≈ 1105 psi
  assert.ok(Math.abs(bitLossPsi(500, 12, 0.5) - 1105) < 5);
  assert.equal(pipeLossPsi(0, 4.276, 1000, 12, 20, 15), 0);
});

test('12¼" seksjon: realistisk SPP, ECD, ROP, krokvekt og dreiemoment', () => {
  const sim = new DrillSim('mid');
  const hlOff = sim.hookload;
  sim.setPumps(true); sim.setRotation(true); sim.setAutoDrill(true);
  run(sim, 300);
  assert.ok(sim.spp > 150 && sim.spp < 320, `SPP ${sim.spp}`);
  assert.ok(sim.ecdBit > sim.pitSg && sim.ecdBit < sim.pitSg + 0.1, `ECD ${sim.ecdBit}`);
  assert.ok(sim.rop > 10 && sim.rop < 60, `ROP ${sim.rop}`);
  assert.ok(Math.abs(hlOff - sim.hookload - sim.wob) < 0.5, 'krokvekt faller like mye som vekten på krona');
  assert.ok(sim.torque > 5 && sim.torque < 40, `T ${sim.torque}`);
  assert.ok(Math.abs(sim.pitGain) < 0.3, `tankavvik ${sim.pitGain}`);
});

test('Oppdrift: krokvekt avtar med tyngre slam', () => {
  const a = new DrillSim('mid');
  const hlA = a.hookload;
  const f = 1 - 1.30 / 7.85;
  assert.ok(Math.abs(a.buoyancyFactor - f) < 1e-3);
  assert.ok(hlA > 100 && hlA < 160);
});

test('dc-eksponent og kronemoment gir fornuftige verdier', () => {
  const dc = dcExponent(20, 120, 15, 12.25, 1.3);
  assert.ok(dc > 0.8 && dc < 2.5, `dc ${dc}`);
  const T = bitTorque(15, 12.25, 'PDC');
  assert.ok(T > 3 && T < 8, `T ${T}`);
});

test('Brønnspark i Tarbert: stengte trykk, drepeark og vent-og-vekt-dreping', () => {
  const sim = new DrillSim('res');
  sim.placeBitAt(2893);
  const pore = porePressure(2890);
  // Statisk underbalanse med 1.40 sg: brønnen skal flyte når pumpene står
  sim.startFlowCheck();
  run(sim, 600, 0.5);
  assert.ok(sim.pitGain > 0.5, `tankøkning ${sim.pitGain}`);
  sim.closeBOP();
  run(sim, 600, 0.5);
  assert.ok(Math.abs(sim.bottomPressure - pore) < 3, `BHP ${sim.bottomPressure} vs pore ${pore}`);
  const expSidpp = pore - 1.40 * BAR_PER_M_SG * 2891;
  assert.ok(Math.abs(sim.sidpp - expSidpp) < 3, `SIDPP ${sim.sidpp} vs ${expSidpp}`);
  assert.ok(sim.chokeP > sim.sidpp, 'SICP > SIDPP med gass i ringrommet');
  const ks = sim.killSheet();
  assert.ok(ks.kmwRound >= 1.43 && ks.kmwRound <= 1.45, `KMW ${ks.kmwRound}`);
  assert.ok(ks.icp > ks.fcp && ks.fcp > 0);
  sim.weightUp(ks.kmwRound);
  let g = 0;
  while (sim.pitSg < ks.kmwRound - 0.001 && g++ < 200) run(sim, 60, 0.5);
  assert.ok(sim.startKill('ww'));
  g = 0;
  while (!sim.kill.done && g++ < 400) run(sim, 60, 0.5);
  assert.ok(sim.kill.done, 'brønnen ble drept');
  assert.ok(sim.chokeP < 1 && sim.sidpp < 1, `trykk etter dreping ${sim.chokeP} / ${sim.sidpp}`);
  assert.ok(sim.openBOP());
  assert.equal(sim.gameOver, null);
});
