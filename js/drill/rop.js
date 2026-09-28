// Borehastighet (Bourgoyne & Young 1974), kroneslitasje, dreiemoment og dc-eksponent.

// Bourgoyne–Young: ROP = exp(a1 + Σ a_j x_j) [ft/h]. Feltenheter:
// D [ft], gp og ecd [ppg], W/d [1000 lbf/in], N [rpm], h = tannslitasje (0–1), Fj = jetkraft [lbf]
export const BY_COEF = { a2: 0.0001, a3: 0.00002, a4: 0.00004, a5: 1.0, a6: 0.6, a7: 0.8, a8: 0.35, wdt: 0.2 };

export function ropBourgoyneYoung({ a1, Dft, gp, ecd, wd, N, h, Fj }, c = BY_COEF) {
  if (N <= 0 || wd <= c.wdt) return { rop: 0, terms: null };
  const x2 = 10000 - Dft;
  const x3 = Math.pow(Dft, 0.69) * (gp - 9.0);
  const x4 = Dft * (gp - ecd);
  const x5 = Math.log((wd - c.wdt) / (4 - c.wdt));
  const x6 = Math.log(N / 60);
  const x7 = -h;
  const x8 = Math.log(Math.max(Fj, 50) / 1000);
  const terms = {
    boreevne: a1,
    kompaksjon: c.a2 * x2,
    undertrykk: c.a3 * x3,
    differensialtrykk: c.a4 * x4,
    vektPaaKrone: c.a5 * x5,
    rotasjon: c.a6 * x6,
    slitasje: c.a7 * x7,
    hydraulikk: c.a8 * x8,
  };
  const lnR = Object.values(terms).reduce((s, v) => s + v, 0);
  return { rop: Math.exp(lnR), terms };
}

// Tannslitasje dh/dt [1/h] (B&Y-form): τH = formasjonens slitasjetid, H1/H2 for kronetype
export function wearRate({ N, wd, h, abras, type }) {
  if (N <= 0) return 0;
  const H1 = type === 'PDC' ? 1.2 : 1.84;
  const H2 = type === 'PDC' ? 4 : 6;
  const tauH = type === 'PDC' ? 70 : 45;
  const wdMax = 10;
  const w = Math.min(wd, wdMax - 0.5);
  return (abras / tauH) * Math.pow(N / 100, H1) * ((wdMax - 4) / (wdMax - w)) * ((1 + H2 / 2) / (1 + H2 * h));
}

// Dreiemoment på krona: T = μ·W·d/3 (Pessier & Fear). W [N], d [m] → kN·m
export function bitTorque(wobT, dBitIn, type) {
  const mu = type === 'PDC' ? 0.32 : 0.2;
  return mu * wobT * 9806.65 * dBitIn * 0.0254 / 3 / 1000;
}

// Friksjonsmoment i strengen i en vertikal brønn (forenklet)
export function stringTorque(lengthM, rpm, mwSg, cuttingsLoad) {
  if (rpm <= 0) return 0;
  return 2.4e-3 * lengthM * (1 + rpm / 260) * (0.85 + 0.15 * mwSg) * (1 + 1.5 * cuttingsLoad);
}

// Normalisert boreeksponent (Jorden & Shirley 1966; Rehm & McClendon 1971)
// d = log(R/60N) / log(12W/10⁶D) ; dc = d · ρn/ECD
export function dcExponent(ropMh, rpm, wobT, dBitIn, ecdSg, normalSg = 1.03) {
  if (ropMh <= 0 || rpm <= 0 || wobT <= 0) return null;
  const R = ropMh * 3.28084;
  const W = wobT * 2204.62;
  const num = Math.log10(R / (60 * rpm));
  const den = Math.log10(12 * W / (1e6 * dBitIn));
  if (den === 0) return null;
  const d = num / den;
  return d * normalSg / ecdSg;
}

// Torsjonsbølgens periode for stick-slip: T = 4L / c, c = sqrt(G/ρ) ≈ 3200 m/s i stål
export function torsionalPeriod(lengthM) {
  return 4 * lengthM / 3200;
}
