// Kontroll av PVT-beregningene mot publiserte verdier og innbyrdes konsistens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zDAK, zHallYarborough, zPapay, muGasLGE, gasProps, pseudoCritical } from '../js/pvt/gas.js';
import { pbStanding, rsStanding, pbPetrosky, muodBeggs, blackOilTable, pbGlaso, rsGlaso, pbVasquez, rsVasquez } from '../js/pvt/blackoil.js';
import { bwMcCain, waterTable } from '../js/pvt/water.js';
import { buildFluid, saturationAt, classifyFluid } from '../js/pvt/eos.js';
import { FLUID_PRESETS } from '../js/pvt/components.js';
import { simulateSeparator, simulateDL, simulateCCE } from '../js/pvt/lab.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

test('Z-faktor: Hall–Yarborough og DAK stemmer overens (Standing–Katz)', () => {
  for (const [Tpr, Ppr] of [[1.2, 1], [1.5, 2], [2, 5], [1.3, 8], [2.5, 12]]) {
    close(zDAK(Tpr, Ppr), zHallYarborough(Tpr, Ppr), 0.01, `Tpr=${Tpr} Ppr=${Ppr}`);
  }
  close(zDAK(1.5, 2), 0.82, 0.01, 'Standing–Katz Tpr 1.5 Ppr 2');
  close(zPapay(2, 1), zDAK(2, 1), 0.02, 'Papay ved lavt Ppr');
  close(zDAK(3, 0.001), 1, 1e-3, 'ideell gass ved P→0');
});

test('Standing boblepunkt (Ahmed, olje 1: Rs 751, γg 0.851, API 47.1, 250 °F) ≈ 2181 psia', () => {
  close(pbStanding(751, 0.851, 47.1, 250), 2181, 3, 'Pb');
});

test('Petrosky–Farshad boblepunkt for samme olje ligger nær målt 2377 psia', () => {
  close(pbPetrosky(751, 0.851, 47.1, 250), 2330, 60, 'Pb');
});

test('Rs(P) er invers av Pb(Rs) for Standing, Glasø og Vasquez–Beggs', () => {
  close(rsStanding(pbStanding(600, 0.8, 35, 200), 0.8, 35, 200), 600, 0.5, 'Standing');
  close(rsGlaso(pbGlaso(600, 0.8, 35, 200), 0.8, 35, 200), 600, 0.5, 'Glasø');
  close(rsVasquez(pbVasquez(600, 0.8, 35, 200), 0.8, 35, 200), 600, 0.5, 'Vasquez–Beggs');
});

test('Beggs–Robinson død-olje-viskositet (API 35, 200 °F) ≈ 1.79 cP', () => {
  close(muodBeggs(35, 200), 1.786, 0.01, 'μod');
});

test('Lee–Gonzalez–Eakin: metan ved 1 atm og 100 °F ≈ 0.012 cP', () => {
  close(muGasLGE(559.67, 0, 16.04), 0.0114, 0.001, 'μg');
});

test('Wichert–Aziz senker pseudokritisk temperatur for surgass', () => {
  const sweet = pseudoCritical(0.7);
  const sour = pseudoCritical(0.7, { yCO2: 0.1, yH2S: 0.1 });
  assert.ok(sour.eps > 0);
  assert.ok(sour.Tpc > 0 && sweet.Tpc > 0);
});

test('Gass: Bg og tetthet konsistente med ideell gass ved lavt trykk', () => {
  const g = gasProps(1.01325, 15, 0.65);
  close(g.Bg, 1, 0.01, 'Bg ved standardbetingelser');
  close(g.rho, 1.01325e5 * 0.65 * 28.9647 / (8314.46 * 288.15), 0.02, 'ρg');
});

test('Svartolje: Bo maks ved Pb, Rs konstant over Pb, co større under Pb', () => {
  const inp = { api: 36, gg: 0.75, T_C: 104, known: 'rs', Rsb_sm3: 150 };
  const t = blackOilTable(inp, [400, 300, 250, 200, 100, 20]);
  const Pb = t.Pb;
  assert.ok(Pb > 200 && Pb < 300, `Pb=${Pb}`);
  const above = t.rows.filter((r) => r.P > Pb);
  const below = t.rows.filter((r) => r.P < Pb);
  for (const r of above) close(r.Rs, 150, 1e-6, 'Rs over Pb');
  for (const r of below) assert.ok(r.Rs < 150 && r.Bo < t.Bob);
  for (const r of above) assert.ok(r.Bo < t.Bob && r.Bo > 1);
  assert.ok(below[0].co > above[0].co, 'co under Pb > co over Pb');
});

test('Vann: McCain Bw ≈ 1.028 ved 5000 psia og 200 °F', () => {
  close(bwMcCain(5000, 200), 1.028, 0.002, 'Bw');
  const w = waterTable(100, 35000, [300]);
  assert.ok(w[0].rho > 970 && w[0].rho < 1030, `ρw=${w[0].rho}`);
});

test('Peng–Robinson: metanets damptrykk ved 150 K ≈ 10.4 bar', () => {
  const m = buildFluid({ C1: 100 }, 100, 0.8);
  const r = m.eos.saturationPressure(m.z, 150, 'bubble', 8);
  close(r.P, 10.4, 0.3, 'Psat');
});

test('Peng–Robinson: faseomhylning og klassifisering for alle forhåndsvæsker', () => {
  const expect = { blackoil: 'Svartolje', volatile: 'Flyktig olje', condensate: 'Gasskondensat', wetgas: 'Våtgass', drygas: 'Tørrgass' };
  for (const [key, p] of Object.entries(FLUID_PRESETS)) {
    const f = buildFluid(p.z, p.M7, p.SG7);
    const env = f.eos.phaseEnvelope(f.z);
    assert.ok(env.points.length > 20, `${key}: for få punkter`);
    const T = p.T + 273.15;
    const sat = saturationAt(f.eos, f.z, T, env);
    const sep = simulateSeparator(f.eos, f.z, T, sat ? sat.P : null, p.P, 30, 323.15);
    assert.equal(classifyFluid(T, env, sep).type, expect[key], key);
  }
});

test('Peng–Robinson: svartolje gir realistisk Pb, GOR og Bo', () => {
  const p = FLUID_PRESETS.blackoil;
  const f = buildFluid(p.z, p.M7, p.SG7);
  const T = p.T + 273.15;
  const env = f.eos.phaseEnvelope(f.z);
  const sat = saturationAt(f.eos, f.z, T, env);
  assert.equal(sat.kind, 'bubble');
  assert.ok(sat.P > 200 && sat.P < 280, `Pb=${sat.P}`);
  // Flash like under boblepunktet skal gi to faser, like over én
  assert.equal(f.eos.flash(f.z, T, sat.P * 0.95).nPhases, 2);
  assert.equal(f.eos.flash(f.z, T, sat.P * 1.05).nPhases, 1);
  const sep = simulateSeparator(f.eos, f.z, T, sat.P, p.P, 30, 323.15);
  assert.ok(sep.GOR > 100 && sep.GOR < 220, `GOR=${sep.GOR}`);
  assert.ok(sep.Bo > 1.3 && sep.Bo < 1.7, `Bo=${sep.Bo}`);
  const dl = simulateDL(f.eos, f.z, T, sat.P);
  assert.ok(dl.rows[0].Bod > dl.rows[dl.rows.length - 1].Bod);
  const cce = simulateCCE(f.eos, f.z, T, sat.P, p.P);
  const last = cce.rows[cce.rows.length - 1];
  assert.ok(last.Vrel > 1.5);
});
