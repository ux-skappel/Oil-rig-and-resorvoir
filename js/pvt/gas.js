// Gassegenskaper: pseudokritiske egenskaper, Z-faktor, Bg, tetthet, viskositet og kompressibilitet.
// Kjernefunksjonene bruker feltenheter (psia, °R) slik korrelasjonene er publisert.

import { barToPsi, cToR, cToK, P_SC_BAR, T_SC_C, R_GAS, M_AIR, PSI_PER_BAR } from './units.js';

// Kritiske data for ikke-hydrokarboner (°R, psia)
const NONHC = {
  N2: { Tc: 227.16, Pc: 493.1, sg: 0.9672 },
  CO2: { Tc: 547.58, Pc: 1071.0, sg: 1.5195 },
  H2S: { Tc: 672.12, Pc: 1306.0, sg: 1.1765 },
};

// Sutton (1985): pseudokritiske egenskaper fra gassens spesifikke vekt (hydrokarbondelen)
export function pseudoCriticalSutton(gg) {
  return {
    Tpc: 169.2 + 349.5 * gg - 74.0 * gg * gg,
    Ppc: 756.8 - 131.0 * gg - 3.6 * gg * gg,
  };
}

// Standing (1977): naturgass og kondensatgass
export function pseudoCriticalStanding(gg, condensate = false) {
  if (condensate) {
    return { Tpc: 187 + 330 * gg - 71.5 * gg * gg, Ppc: 706 - 51.7 * gg - 11.1 * gg * gg };
  }
  return { Tpc: 168 + 325 * gg - 12.5 * gg * gg, Ppc: 677 + 15.0 * gg - 37.5 * gg * gg };
}

// Fullstendig prosedyre: korriger for N2/CO2/H2S (miksing, Ahmed) og surgass (Wichert-Aziz 1972).
export function pseudoCritical(gg, opts = {}) {
  const yN2 = opts.yN2 || 0, yCO2 = opts.yCO2 || 0, yH2S = opts.yH2S || 0;
  const yHC = 1 - yN2 - yCO2 - yH2S;
  let ggHC = (gg - NONHC.N2.sg * yN2 - NONHC.CO2.sg * yCO2 - NONHC.H2S.sg * yH2S) / Math.max(yHC, 1e-6);
  ggHC = Math.max(ggHC, 0.554);
  const base = opts.method === 'standing'
    ? pseudoCriticalStanding(ggHC, false)
    : opts.method === 'standing-cond'
      ? pseudoCriticalStanding(ggHC, true)
      : pseudoCriticalSutton(ggHC);
  const TpcM = yHC * base.Tpc + yN2 * NONHC.N2.Tc + yCO2 * NONHC.CO2.Tc + yH2S * NONHC.H2S.Tc;
  const PpcM = yHC * base.Ppc + yN2 * NONHC.N2.Pc + yCO2 * NONHC.CO2.Pc + yH2S * NONHC.H2S.Pc;
  const A = yCO2 + yH2S, B = yH2S;
  const eps = 120 * (Math.pow(A, 0.9) - Math.pow(A, 1.6)) + 15 * (Math.sqrt(B) - Math.pow(B, 4));
  const Tpc = TpcM - eps;
  const Ppc = PpcM * Tpc / (TpcM + B * (1 - B) * eps);
  return { Tpc, Ppc, eps, ggHC };
}

// Hall-Yarborough (1973), Newton-iterasjon på redusert tetthet y
export function zHallYarborough(Tpr, Ppr) {
  if (Ppr <= 0) return 1;
  const t = 1 / Tpr;
  const e = Math.exp(-1.2 * (1 - t) * (1 - t));
  const A = 0.06125 * t * e;
  const B = 14.76 * t - 9.76 * t * t + 4.58 * t * t * t;
  const C = 90.7 * t - 242.2 * t * t + 42.4 * t * t * t;
  const D = 2.18 + 2.82 * t;
  let y = 0.0125 * Ppr * t * e;
  for (let i = 0; i < 200; i++) {
    const y2 = y * y, y3 = y2 * y, y4 = y3 * y, om = 1 - y;
    const f = -A * Ppr + (y + y2 + y3 - y4) / (om * om * om) - B * y2 + C * Math.pow(y, D);
    const df = (1 + 4 * y + 4 * y2 - 4 * y3 + y4) / (om * om * om * om) - 2 * B * y + C * D * Math.pow(y, D - 1);
    let yn = y - f / df;
    if (!(yn > 0)) yn = y * 0.5;
    if (yn >= 1) yn = (y + 1) * 0.5;
    if (Math.abs(yn - y) < 1e-13) { y = yn; break; }
    y = yn;
  }
  return A * Ppr / y;
}

// Dranchuk & Abou-Kassem (1975), 11-konstanters tilpasning til Standing-Katz-diagrammet
const DAK = [0, 0.3265, -1.0700, -0.5339, 0.01569, -0.05165, 0.5475, -0.7361, 0.1844, 0.1056, 0.6134, 0.7210];
export function zDAK(Tpr, Ppr) {
  if (Ppr <= 0) return 1;
  const A = DAK;
  const T1 = A[1] + A[2] / Tpr + A[3] / Tpr ** 3 + A[4] / Tpr ** 4 + A[5] / Tpr ** 5;
  const T2 = A[6] + A[7] / Tpr + A[8] / (Tpr * Tpr);
  const T3 = A[9] * (A[7] / Tpr + A[8] / (Tpr * Tpr));
  const T4 = A[10] / Tpr ** 3;
  const zOf = (r) => 1 + T1 * r + T2 * r * r - T3 * r ** 5 + T4 * (1 + A[11] * r * r) * r * r * Math.exp(-A[11] * r * r);
  let r = 0.27 * Ppr / Tpr;
  for (let i = 0; i < 200; i++) {
    const ex = Math.exp(-A[11] * r * r);
    const f = zOf(r) - 0.27 * Ppr / (r * Tpr);
    const dz = T1 + 2 * T2 * r - 5 * T3 * r ** 4 + T4 * ex * (2 * r + 2 * A[11] * r ** 3 - 2 * A[11] * A[11] * r ** 5);
    const df = dz + 0.27 * Ppr / (r * r * Tpr);
    let rn = r - f / df;
    if (!(rn > 0)) rn = r * 0.5;
    if (Math.abs(rn - r) < 1e-13) { r = rn; break; }
    r = rn;
  }
  return 0.27 * Ppr / (r * Tpr);
}

// Papay (1968), eksplisitt
export function zPapay(Tpr, Ppr) {
  return 1 - 3.52 * Ppr / Math.pow(10, 0.9813 * Tpr) + 0.274 * Ppr * Ppr / Math.pow(10, 0.8157 * Tpr);
}

// Beggs & Brill (1973), eksplisitt (gyldig for Tpr > 0.92)
export function zBeggsBrill(Tpr, Ppr) {
  const tp = Math.max(Tpr, 0.921);
  const A = 1.39 * Math.sqrt(tp - 0.92) - 0.36 * tp - 0.101;
  const B = (0.62 - 0.23 * tp) * Ppr + (0.066 / (tp - 0.86) - 0.037) * Ppr * Ppr + 0.32 * Ppr ** 6 / Math.pow(10, 9 * (tp - 1));
  const C = 0.132 - 0.32 * Math.log10(tp);
  const D = Math.pow(10, 0.3106 - 0.49 * tp + 0.1824 * tp * tp);
  return A + (1 - A) * Math.exp(-B) + C * Math.pow(Ppr, D);
}

export const Z_METHODS = {
  dak: { name: 'Dranchuk–Abou-Kassem (1975)', fn: zDAK },
  hy: { name: 'Hall–Yarborough (1973)', fn: zHallYarborough },
  papay: { name: 'Papay (1968)', fn: zPapay },
  bb: { name: 'Beggs–Brill (1973)', fn: zBeggsBrill },
};

// Lee, Gonzalez & Eakin (1966): T i °R, tetthet i g/cm³, M i kg/kmol → cP
export function muGasLGE(T_R, rho_gcc, M) {
  const K = (9.4 + 0.02 * M) * Math.pow(T_R, 1.5) / (209 + 19 * M + T_R);
  const X = 3.5 + 986 / T_R + 0.01 * M;
  const Y = 2.4 - 0.2 * X;
  return 1e-4 * K * Math.exp(X * Math.pow(rho_gcc, Y));
}

// Z-faktor for gitt trykk (bar) og temperatur (°C)
export function zFactor(P_bar, T_C, gg, opts = {}) {
  const pc = opts.pc || pseudoCritical(gg, opts);
  const Tpr = cToR(T_C) / pc.Tpc;
  const Ppr = barToPsi(P_bar) / pc.Ppc;
  const fn = (Z_METHODS[opts.zMethod] || Z_METHODS.dak).fn;
  return fn(Tpr, Ppr);
}

// Alle gassegenskaper i ett punkt (SI inn og ut)
export function gasProps(P_bar, T_C, gg, opts = {}) {
  const pc = opts.pc || pseudoCritical(gg, opts);
  const fn = (Z_METHODS[opts.zMethod] || Z_METHODS.dak).fn;
  const T_R = cToR(T_C), T_K = cToK(T_C);
  const Tpr = T_R / pc.Tpc;
  const zAt = (p) => fn(Tpr, barToPsi(p) / pc.Ppc);
  const Z = zAt(P_bar);
  const M = M_AIR * gg;
  const rho = P_bar * 1e5 * M / (Z * R_GAS * T_K);                       // kg/m³
  const Bg = (P_SC_BAR / P_bar) * (T_K / cToK(T_SC_C)) * Z;               // rm³/Sm³
  const mu = muGasLGE(T_R, rho / 1000, M);                                // cP
  const h = Math.max(P_bar * 1e-4, 1e-3);
  const dZdP = (zAt(P_bar + h) - zAt(Math.max(P_bar - h, 1e-6))) / (2 * h);
  const cg = 1 / P_bar - dZdP / Z;                                        // 1/bar
  return {
    P: P_bar, Z, rho, Bg, Eg: 1 / Bg, mu, cg, M,
    Tpr, Ppr: barToPsi(P_bar) / pc.Ppc, Tpc: pc.Tpc, Ppc: pc.Ppc,
  };
}

// Bg i rb/scf (brukes i McCains definisjon av mettet oljekompressibilitet)
export function bgRbScf(P_psia, T_R, Z) {
  return 0.005035 * Z * T_R / P_psia;
}

export const PPC_METHODS = {
  sutton: 'Sutton (1985)',
  standing: 'Standing (1977) – naturgass',
  'standing-cond': 'Standing (1977) – kondensat',
};

export { PSI_PER_BAR };
