// Svartoljekorrelasjoner (black oil). Alle kjernefunksjoner i feltenheter:
// P [psia], T [°F], Rs [scf/STB], γg = gassens spesifikke vekt (luft = 1), γo = oljens spesifikke vekt (vann = 1).

import {
  barToPsi, psiToBar, cToF, sgFromApi, sm3ToScf, scfToSm3, lbft3ToKgm3, PSI_PER_BAR, cToR,
} from './units.js';
import { zFactor, bgRbScf, gasProps } from './gas.js';

const P_ATM = 14.696;
const clampP = (p) => Math.max(p, P_ATM);

// ---------- Standing (1947), California-oljer ----------
export function pbStanding(Rs, gg, api, T) {
  const a = 0.00091 * T - 0.0125 * api;
  return clampP(18.2 * (Math.pow(Rs / gg, 0.83) * Math.pow(10, a) - 1.4));
}
export function rsStanding(P, gg, api, T) {
  const x = 0.0125 * api - 0.00091 * T;
  return gg * Math.pow((P / 18.2 + 1.4) * Math.pow(10, x), 1.2048);
}
export function boStanding(Rs, gg, go, T) {
  return 0.9759 + 0.000120 * Math.pow(Rs * Math.sqrt(gg / go) + 1.25 * T, 1.2);
}

// ---------- Vasquez & Beggs (1980), 600 feltprøver ----------
function vbC(api) {
  return api <= 30 ? { C1: 0.0362, C2: 1.0937, C3: 25.7240 } : { C1: 0.0178, C2: 1.1870, C3: 23.931 };
}
// Gassvekt korrigert til referanseseparator 100 psig
export function ggsVasquez(gg, api, TsepF, PsepPsia) {
  if (!(PsepPsia > 0) || !(TsepF > -400)) return gg;
  return gg * (1 + 5.912e-5 * api * TsepF * Math.log10(PsepPsia / 114.7));
}
export function rsVasquez(P, ggs, api, T) {
  const c = vbC(api);
  return c.C1 * ggs * Math.pow(P, c.C2) * Math.exp(c.C3 * api / (T + 460));
}
export function pbVasquez(Rs, ggs, api, T) {
  const c = vbC(api);
  return clampP(Math.pow((Rs / (c.C1 * ggs)) * Math.exp(-c.C3 * api / (T + 460)), 1 / c.C2));
}
export function boVasquez(Rs, ggs, api, T) {
  const c = api <= 30 ? [4.677e-4, 1.751e-5, -1.811e-8] : [4.670e-4, 1.100e-5, 1.337e-9];
  return 1 + c[0] * Rs + (T - 60) * (api / ggs) * (c[1] + c[2] * Rs);
}
// Undermettet oljekompressibilitet: co = A / P, A = (−1433 + 5Rsb + 17.2T − 1180γgs + 12.61API)·10⁻⁵
export function coVasquezA(Rsb, ggs, api, T) {
  return (-1433 + 5 * Rsb + 17.2 * T - 1180 * ggs + 12.61 * api) * 1e-5;
}

// ---------- Glasø (1980), Nordsjø-oljer ----------
export function pbGlaso(Rs, gg, api, T) {
  const pbs = Math.pow(Rs / gg, 0.816) * Math.pow(T, 0.172) / Math.pow(api, 0.989);
  const l = Math.log10(pbs);
  return clampP(Math.pow(10, 1.7669 + 1.7447 * l - 0.30218 * l * l));
}
export function rsGlaso(P, gg, api, T) {
  const x = 2.8869 - Math.sqrt(Math.max(14.1811 - 3.3093 * Math.log10(P), 0));
  const pbs = Math.pow(10, x);
  return gg * Math.pow(Math.pow(api, 0.989) / Math.pow(T, 0.172) * pbs, 1.2255);
}
export function boGlaso(Rs, gg, go, T) {
  const bs = Rs * Math.pow(gg / go, 0.526) + 0.968 * T;
  const l = Math.log10(bs);
  return 1 + Math.pow(10, -6.58511 + 2.91329 * l - 0.27683 * l * l);
}

// ---------- Al-Marhoun (1988), Midtøsten ----------
const MARHOUN = { a: 5.38088e-3, b: 0.715082, c: -1.87784, d: 3.1437, e: 1.32657 };
export function pbMarhoun(Rs, gg, go, T) {
  const TR = T + 459.67, m = MARHOUN;
  return clampP(m.a * Math.pow(Rs, m.b) * Math.pow(gg, m.c) * Math.pow(go, m.d) * Math.pow(TR, m.e));
}
export function rsMarhoun(P, gg, go, T) {
  const TR = T + 459.67, m = MARHOUN;
  return Math.pow(P / (m.a * Math.pow(gg, m.c) * Math.pow(go, m.d) * Math.pow(TR, m.e)), 1 / m.b);
}
export function boMarhoun(Rs, gg, go, T) {
  const TR = T + 459.67;
  const F = Math.pow(Rs, 0.742390) * Math.pow(gg, 0.323294) * Math.pow(go, -1.202040);
  return 0.497069 + 0.862963e-3 * TR + 0.182594e-2 * F + 0.318099e-5 * F * F;
}

// ---------- Petrosky & Farshad (1993), Mexicogolfen ----------
function pfX(api, T) {
  return 7.916e-4 * Math.pow(api, 1.5410) - 4.561e-5 * Math.pow(T, 1.3911);
}
export function pbPetrosky(Rs, gg, api, T) {
  return clampP(112.727 * (Math.pow(Rs, 0.5774) / (Math.pow(gg, 0.8439) * Math.pow(10, pfX(api, T))) - 12.340));
}
export function rsPetrosky(P, gg, api, T) {
  return Math.pow((P / 112.727 + 12.340) * Math.pow(gg, 0.8439) * Math.pow(10, pfX(api, T)), 1.73184);
}
export function boPetrosky(Rs, gg, go, T) {
  const inner = Math.pow(Rs, 0.3738) * Math.pow(gg, 0.2914) / Math.pow(go, 0.6265) + 0.24626 * Math.pow(T, 0.5371);
  return 1.0113 + 7.2046e-5 * Math.pow(inner, 3.0936);
}
// co = 1.705e-7 Rsb^0.69357 γg^0.1885 API^0.3272 T^0.6729 P^-0.5906
export function coPetroskyK(Rsb, gg, api, T) {
  return 1.705e-7 * Math.pow(Rsb, 0.69357) * Math.pow(gg, 0.1885) * Math.pow(api, 0.3272) * Math.pow(T, 0.6729);
}

// ---------- Viskositet ----------
// Død olje (gassfri) ved reservoartemperatur
export function muodBeggs(api, T) {
  const x = Math.pow(10, 3.0324 - 0.02023 * api) * Math.pow(T, -1.163);
  return Math.pow(10, x) - 1;
}
export function muodGlaso(api, T) {
  const a = 10.313 * Math.log10(T) - 36.447;
  return 3.141e10 * Math.pow(T, -3.444) * Math.pow(Math.log10(api), a);
}
export function muodEgbogah(api, T) {
  const ll = 1.8653 - 0.025086 * api - 0.5644 * Math.log10(T);
  return Math.pow(10, Math.pow(10, ll)) - 1;
}
// Mettet (levende) olje
export function muoBeggs(muod, Rs) {
  const a = 10.715 * Math.pow(Rs + 100, -0.515);
  const b = 5.44 * Math.pow(Rs + 150, -0.338);
  return a * Math.pow(muod, b);
}
export function muoChew(muod, Rs) {
  const A = Math.pow(10, Rs * (2.2e-7 * Rs - 7.4e-4));
  const B = 0.68 / Math.pow(10, 8.62e-5 * Rs) + 0.25 / Math.pow(10, 1.1e-3 * Rs) + 0.062 / Math.pow(10, 3.74e-3 * Rs);
  return A * Math.pow(muod, B);
}
// Undermettet olje (P > Pb)
export function muoUnderVasquez(muob, P, Pb) {
  const m = 2.6 * Math.pow(P, 1.187) * Math.exp(-11.513 - 8.98e-5 * P);
  return muob * Math.pow(P / Pb, m);
}
export function muoUnderBeal(muob, P, Pb) {
  return muob + 0.001 * (P - Pb) * (0.024 * Math.pow(muob, 1.6) + 0.038 * Math.pow(muob, 0.56));
}

export const CORR = {
  pb: {
    standing: 'Standing (1947)',
    vasquez: 'Vasquez–Beggs (1980)',
    glaso: 'Glasø (1980) – Nordsjøen',
    marhoun: 'Al-Marhoun (1988)',
    petrosky: 'Petrosky–Farshad (1993)',
  },
  bo: {
    standing: 'Standing (1947)',
    vasquez: 'Vasquez–Beggs (1980)',
    glaso: 'Glasø (1980)',
    marhoun: 'Al-Marhoun (1988)',
    petrosky: 'Petrosky–Farshad (1993)',
  },
  muDead: {
    beggs: 'Beggs–Robinson (1975)',
    glaso: 'Glasø (1980)',
    egbogah: 'Egbogah–Ng (1990)',
  },
  muLive: {
    beggs: 'Beggs–Robinson (1975)',
    chew: 'Chew–Connally (1959)',
  },
  muUnder: {
    vasquez: 'Vasquez–Beggs (1980)',
    beal: 'Beal (1946)',
  },
  co: {
    vasquez: 'Vasquez–Beggs (1980)',
    petrosky: 'Petrosky–Farshad (1993)',
  },
};

// Bygger et sett med funksjoner for valgte korrelasjoner
function makeModel(inp) {
  const api = inp.api;
  const go = sgFromApi(api);
  const gg = inp.gg;
  const T = cToF(inp.T_C);
  const ggs = ggsVasquez(gg, api, cToF(inp.sepT_C ?? 15), barToPsi(inp.sepP_bar ?? 7.9));
  const c = Object.assign({ pb: 'standing', bo: 'standing', muDead: 'beggs', muLive: 'beggs', muUnder: 'vasquez', co: 'vasquez' }, inp.corr || {});

  const pbFn = {
    standing: (Rs) => pbStanding(Rs, gg, api, T),
    vasquez: (Rs) => pbVasquez(Rs, ggs, api, T),
    glaso: (Rs) => pbGlaso(Rs, gg, api, T),
    marhoun: (Rs) => pbMarhoun(Rs, gg, go, T),
    petrosky: (Rs) => pbPetrosky(Rs, gg, api, T),
  }[c.pb];
  const rsFn = {
    standing: (P) => rsStanding(P, gg, api, T),
    vasquez: (P) => rsVasquez(P, ggs, api, T),
    glaso: (P) => rsGlaso(P, gg, api, T),
    marhoun: (P) => rsMarhoun(P, gg, go, T),
    petrosky: (P) => rsPetrosky(P, gg, api, T),
  }[c.pb];
  const boFn = {
    standing: (Rs) => boStanding(Rs, gg, go, T),
    vasquez: (Rs) => boVasquez(Rs, ggs, api, T),
    glaso: (Rs) => boGlaso(Rs, gg, go, T),
    marhoun: (Rs) => boMarhoun(Rs, gg, go, T),
    petrosky: (Rs) => boPetrosky(Rs, gg, go, T),
  }[c.bo];
  const muod = { beggs: muodBeggs, glaso: muodGlaso, egbogah: muodEgbogah }[c.muDead](api, T);
  const muLiveFn = { beggs: muoBeggs, chew: muoChew }[c.muLive];
  const muUnderFn = { vasquez: muoUnderVasquez, beal: muoUnderBeal }[c.muUnder];

  let Rsb, Pb;
  if (inp.known === 'pb') {
    Pb = barToPsi(inp.Pb_bar);
    Rsb = rsFn(Pb);
  } else {
    Rsb = sm3ToScf(inp.Rsb_sm3);
    Pb = pbFn(Rsb);
  }
  const Bob = boFn(Rsb);
  const muob = muLiveFn(muod, Rsb);
  const rhoob = (62.4 * go + 0.0136 * Rsb * gg) / Bob;

  // Undermettet: ln(Bo/Bob) = −∫co dP fra Pb til P (analytisk integrert)
  let coUnder, boUnder;
  if (c.co === 'petrosky') {
    const K = coPetroskyK(Rsb, gg, api, T);
    coUnder = (P) => K * Math.pow(P, -0.5906);
    boUnder = (P) => Bob * Math.exp(-(K / 0.4094) * (Math.pow(P, 0.4094) - Math.pow(Pb, 0.4094)));
  } else {
    const A = coVasquezA(Rsb, ggs, api, T);
    coUnder = (P) => A / P;
    boUnder = (P) => Bob * Math.pow(Pb / P, A);
  }

  const gasOpts = { zMethod: inp.zMethod, method: inp.ppcMethod, yN2: inp.yN2, yCO2: inp.yCO2, yH2S: inp.yH2S };

  function point(Ppsia) {
    const P = Math.max(Ppsia, P_ATM);
    let Rs, Bo, mu, co, rho;
    if (P <= Pb) {
      Rs = Math.max(0, Math.min(rsFn(P), Rsb));
      Bo = boFn(Rs);
      mu = muLiveFn(muod, Rs);
      rho = (62.4 * go + 0.0136 * Rs * gg) / Bo;
      // McCain: co = −(1/Bo)(∂Bo/∂P) + (Bg/Bo)(∂Rs/∂P), Bg i rb/scf
      const h = Math.max(1, P * 1e-4);
      const p1 = Math.max(P - h, P_ATM + 0.01), p2 = Math.min(P + h, Pb);
      const rs1 = Math.min(rsFn(p1), Rsb), rs2 = Math.min(rsFn(p2), Rsb);
      const dRs = (rs2 - rs1) / (p2 - p1);
      const dBo = (boFn(rs2) - boFn(rs1)) / (p2 - p1);
      const Z = zFactor(psiToBar(P), inp.T_C, gg, gasOpts);
      const Bg = bgRbScf(P, T + 459.67, Z);
      co = -dBo / Bo + (Bg / Bo) * dRs;
    } else {
      Rs = Rsb;
      Bo = boUnder(P);
      mu = muUnderFn(muob, P, Pb);
      co = coUnder(P);
      rho = rhoob * Bob / Bo;
    }
    return { Ppsia: P, Rs, Bo, mu, co, rho };
  }

  return { api, go, gg, ggs, T, Rsb, Pb, Bob, muod, muob, rhoob, point, gasOpts, corr: c };
}

// SI-grensesnitt: tabell over trykk (bar)
export function blackOilTable(inp, pressuresBar) {
  const m = makeModel(inp);
  const rows = pressuresBar.map((pb) => {
    const r = m.point(barToPsi(pb));
    const gp = gasProps(pb, inp.T_C, inp.gg, m.gasOpts);
    const Bt = r.Bo + (gp.Bg) * (scfToSm3(m.Rsb) - scfToSm3(r.Rs)); // rm³/Sm³ olje
    return {
      P: pb,
      Rs: scfToSm3(r.Rs),
      Bo: r.Bo,
      mu: r.mu,
      co: r.co * PSI_PER_BAR,         // 1/psi → 1/bar
      rho: lbft3ToKgm3(r.rho),
      Bt,
      Bg: gp.Bg,
      Z: gp.Z,
    };
  });
  return {
    rows,
    Pb: psiToBar(m.Pb),
    Rsb: scfToSm3(m.Rsb),
    Bob: m.Bob,
    muod: m.muod,
    muob: m.muob,
    rhoob: lbft3ToKgm3(m.rhoob),
    ggs: m.ggs,
    go: m.go,
    model: m,
  };
}

export function blackOilAt(inp, P_bar) {
  return blackOilTable(inp, [P_bar]).rows[0];
}

// Korrelasjonssammenligning: boblepunkt fra alle metoder for samme Rsb
export function comparePb(inp) {
  const out = {};
  for (const key of Object.keys(CORR.pb)) {
    const m = makeModel({ ...inp, known: 'rs', corr: { ...(inp.corr || {}), pb: key, bo: key } });
    out[key] = { Pb: psiToBar(m.Pb), Bob: m.Bob };
  }
  return out;
}

export { cToR };
