// Formasjonsvann (saltvann). McCain (1990/1991) og Osif (1988). Feltenheter internt.

import { barToPsi, cToF, scfToSm3, lbft3ToKgm3, PSI_PER_BAR } from './units.js';

// Volumfaktor Bw (rb/STB) – McCain. P [psia], T [°F]
export function bwMcCain(P, T) {
  const dVwt = -1.0001e-2 + 1.33391e-4 * T + 5.50654e-7 * T * T;
  const dVwp = -1.95301e-9 * P * T - 1.72834e-13 * P * P * T - 3.58922e-7 * P - 2.25341e-10 * P * P;
  return (1 + dVwp) * (1 + dVwt);
}

// Viskositet (cP) – McCain. S = saltinnhold i vekt-% NaCl
export function muwMcCain(P, T, S) {
  const A = 109.574 - 8.40564 * S + 0.313314 * S * S + 8.72213e-3 * S ** 3;
  const B = 1.12166 - 2.63951e-2 * S + 6.79461e-4 * S * S + 5.47119e-5 * S ** 3 - 1.55586e-6 * S ** 4;
  const mu1 = A * Math.pow(T, -B);
  return mu1 * (0.9994 + 4.0295e-5 * P + 3.1062e-9 * P * P);
}

// Tetthet ved standardbetingelser (lb/ft³) – McCain
export function rhowStdMcCain(S) {
  return 62.368 + 0.438603 * S + 1.60074e-3 * S * S;
}

// Isoterm kompressibilitet (1/psi) – Osif (1988). C = NaCl i g/L
export function cwOsif(P, T, C_gL) {
  return 1 / (7.033 * P + 541.5 * C_gL - 537.0 * T + 403300);
}

// Løst gass i vann (scf/STB) – McCain (Culberson–McKetta-tilpasning) med saltkorreksjon
export function rswMcCain(P, T, S) {
  const A = 8.15839 - 6.12265e-2 * T + 1.91663e-4 * T * T - 2.1654e-7 * T ** 3;
  const B = 1.01021e-2 - 7.44241e-5 * T + 3.05553e-7 * T * T - 2.94883e-10 * T ** 3;
  const C = (-9.02505 + 0.130237 * T - 8.53425e-4 * T * T + 2.34122e-6 * T ** 3 - 2.37049e-9 * T ** 4) * 1e-7;
  const rswp = A + B * P + C * P * P;
  return Math.max(0, rswp * Math.pow(10, -0.0840655 * S * Math.pow(T, -0.285854)));
}

// SI-grensesnitt. salinity_ppm = mg NaCl per kg løsning
export function waterTable(T_C, salinity_ppm, pressuresBar) {
  const T = cToF(T_C);
  const S = salinity_ppm / 1e4;                       // vekt-%
  const rhoStd = rhowStdMcCain(S);                    // lb/ft³
  const C_gL = S * 10 * (rhoStd / 62.428);            // g NaCl per liter løsning
  return pressuresBar.map((pb) => {
    const P = Math.max(barToPsi(pb), 14.7);
    const Bw = bwMcCain(P, T);
    return {
      P: pb,
      Bw,
      mu: muwMcCain(P, T, S),
      rho: lbft3ToKgm3(rhoStd / Bw),
      cw: cwOsif(P, T, C_gL) * PSI_PER_BAR,           // 1/bar
      Rsw: scfToSm3(rswMcCain(P, T, S)),              // Sm³/Sm³
    };
  });
}

export function waterStdDensity(salinity_ppm) {
  return lbft3ToKgm3(rhowStdMcCain(salinity_ppm / 1e4));
}
