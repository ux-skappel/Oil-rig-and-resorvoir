// Simulerte PVT-laboratorieforsøk med Peng–Robinson:
// CCE (konstant sammensetning-ekspansjon), DL (differensiell frigjøring) og separatortest.

import { R, P_SC, T_SC } from './eos.js';

const molarGasVolSC = R * T_SC / P_SC; // m³ gass ved standardbetingelser per kmol (ideell)

function totalVolume(fl) {
  if (fl.nPhases === 1) return fl.single.v;
  return (1 - fl.beta) * fl.L.v + fl.beta * fl.V.v;
}

// CCE ved reservoartemperatur. Returnerer rader sortert fra høyt til lavt trykk.
export function simulateCCE(eos, z, T, Psat, Pmax, nPts = 36) {
  const Plow = Math.max(5, Psat * 0.12);
  const Ptop = Math.max(Pmax, Psat * 1.1);
  const pressures = [];
  for (let i = 0; i < nPts; i++) pressures.push(Ptop - (Ptop - Plow) * i / (nPts - 1));
  if (Psat && !pressures.some((p) => Math.abs(p - Psat) < 1e-6)) pressures.push(Psat);
  pressures.sort((a, b) => b - a);
  const fsat = eos.flash(z, T, Psat * 1.0005);
  const Vsat = totalVolume(fsat);
  const rows = [];
  for (const P of pressures) {
    const fl = eos.flash(z, T, P);
    const Vt = totalVolume(fl);
    const Vrel = Vt / Vsat;
    const liqVol = fl.nPhases === 2 ? (1 - fl.beta) * fl.L.v : (fl.beta === 0 ? fl.single.v : 0);
    const row = {
      P,
      Vrel,
      liquidPct: 100 * liqVol / Vsat,
      rho: fl.nPhases === 1 ? fl.single.rho : null,
      phases: fl.nPhases,
      beta: fl.beta,
      Y: null,
    };
    if (P < Psat && Vrel > 1) row.Y = (Psat - P) / (P * (Vrel - 1));
    rows.push(row);
  }
  // Kompressibilitet over metningstrykket
  for (let i = 1; i < rows.length - 1; i++) {
    const a = rows[i - 1], b = rows[i + 1];
    if (a.P > Psat && b.P >= Psat * 0.9999) {
      rows[i].c = -(b.Vrel - a.Vrel) / (rows[i].Vrel * (b.P - a.P));
    }
  }
  return { rows, Vsat };
}

// Differensiell frigjøring ved reservoartemperatur fra boblepunktet
export function simulateDL(eos, z, T, Pb, nStages = 9) {
  const stages = [];
  for (let i = 0; i < nStages; i++) stages.push(Pb * (1 - i / nStages));
  stages.push(Math.max(P_SC * 4, Pb * 0.03));
  stages.push(P_SC);
  let x = Array.from(z);
  let nL = 1;
  const rec = [];
  for (const P of stages) {
    const fl = eos.flash(x, T, P);
    let gasMoles = 0, gas = null, liq;
    if (fl.nPhases === 2) {
      gasMoles = nL * fl.beta;
      gas = fl.V;
      nL = nL * (1 - fl.beta);
      liq = fl.L;
    } else if (fl.beta === 1) {
      break;
    } else {
      liq = fl.single;
    }
    x = liq.x;
    rec.push({
      P,
      Voil: nL * liq.v,
      rhoOil: liq.rho,
      muOil: liq.mu,
      gasMoles,
      gasZ: gas ? gas.Z : null,
      gasSG: gas ? gas.M / 28.9647 : null,
      gasBg: gas ? gas.Z * T * P_SC / (P * T_SC) : null,
      gasMu: gas ? gas.mu : null,
    });
  }
  // Restolje avkjølt til 15 °C
  const flr = eos.flash(x, T_SC, P_SC);
  let resLiq = flr.nPhases === 2 ? flr.L : flr.single;
  let extraGas = 0;
  if (flr.nPhases === 2) { extraGas = nL * flr.beta; nL *= (1 - flr.beta); }
  const Vres = nL * resLiq.v;
  const totalGasAfter = new Array(rec.length).fill(0);
  let acc = extraGas;
  for (let i = rec.length - 1; i >= 0; i--) {
    totalGasAfter[i] = acc;
    acc += rec[i].gasMoles;
  }
  const rows = rec.map((r, i) => ({
    P: r.P,
    Bod: r.Voil / Vres,
    Rsd: totalGasAfter[i] * molarGasVolSC / Vres,
    rhoOil: r.rhoOil,
    muOil: r.muOil,
    gasZ: r.gasZ,
    gasSG: r.gasSG,
    gasBg: r.gasBg,
    gasMu: r.gasMu,
  }));
  return { rows, residualDensity: resLiq.rho, residualAPI: 141.5 / (resLiq.rho / 999.1) - 131.5 };
}

// Tostegs separatortest: separator (Psep, Tsep) → lagertank (1.01325 bar, 15 °C)
export function simulateSeparator(eos, z, Tres, Psat, Pres, Psep, Tsep) {
  const f1 = eos.flash(z, Tsep, Psep);
  let x1, nL1, nG1, gasM1 = 0;
  if (f1.nPhases === 2) {
    nG1 = f1.beta; nL1 = 1 - f1.beta; x1 = f1.L.x; gasM1 = f1.V.M;
  } else if (f1.beta === 1) {
    nG1 = 1; nL1 = 0; x1 = null; gasM1 = f1.single.M;
  } else {
    nG1 = 0; nL1 = 1; x1 = f1.single.x;
  }
  let nG2 = 0, nO = 0, sto = null, gasM2 = 0;
  if (nL1 > 0) {
    const f2 = eos.flash(x1, T_SC, P_SC);
    if (f2.nPhases === 2) {
      nG2 = nL1 * f2.beta; nO = nL1 * (1 - f2.beta); sto = f2.L; gasM2 = f2.V.M;
    } else if (f2.beta === 1) {
      nG2 = nL1; gasM2 = f2.single.M;
    } else {
      nO = nL1; sto = f2.single;
    }
  }
  const Vgas = (nG1 + nG2) * molarGasVolSC;          // Sm³ per kmol brønnstrøm
  const Vsto = sto ? nO * sto.v : 0;                  // Sm³ olje/kondensat per kmol
  const gasM = (nG1 * gasM1 + nG2 * gasM2) / Math.max(nG1 + nG2, 1e-12);
  const fs = eos.flash(z, Tres, Psat ? Psat * 1.0005 : Pres);
  const Vsat = fs.nPhases === 1 ? fs.single.v : totalVolume(fs);
  const fr = eos.flash(z, Tres, Pres);
  const Vres = totalVolume(fr);
  const out = {
    liquid: Vsto > 1e-9,
    GOR: Vsto > 1e-9 ? Vgas / Vsto : Infinity,
    CGR: Vgas > 0 ? (Vsto / Vgas) * 1e6 : 0,          // Sm³ væske per MSm³ gass
    Bo: Vsto > 1e-9 ? Vsat / Vsto : null,
    BoRes: Vsto > 1e-9 ? Vres / Vsto : null,
    stoDensity: sto ? sto.rho : null,
    stoAPI: sto ? 141.5 / (sto.rho / 999.1) - 131.5 : null,
    gasSG: gasM / 28.9647,
    sepGOR: Vsto > 1e-9 ? nG1 * molarGasVolSC / Vsto : null,
    stGOR: Vsto > 1e-9 ? nG2 * molarGasVolSC / Vsto : null,
    Bg: fr.nPhases === 1 && fr.beta === 1 ? fr.single.Z * Tres * P_SC / (Pres * T_SC) : null,
  };
  return out;
}
