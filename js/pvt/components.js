// Komponentdatabase for Peng-Robinson. Tc [K], Pc [bar], ω [-], M [kg/kmol],
// s = Peneloux volumforskyvning c/b for PR (Jhaveri & Youngren 1988).

export const COMPONENTS = {
  N2: { key: 'N2', name: 'N₂', M: 28.014, Tc: 126.20, Pc: 33.98, w: 0.037, s: -0.1927 },
  CO2: { key: 'CO2', name: 'CO₂', M: 44.010, Tc: 304.12, Pc: 73.74, w: 0.225, s: -0.0817 },
  H2S: { key: 'H2S', name: 'H₂S', M: 34.082, Tc: 373.53, Pc: 89.63, w: 0.090, s: -0.1288 },
  C1: { key: 'C1', name: 'C₁', M: 16.043, Tc: 190.56, Pc: 45.99, w: 0.011, s: -0.1595 },
  C2: { key: 'C2', name: 'C₂', M: 30.070, Tc: 305.32, Pc: 48.72, w: 0.099, s: -0.1134 },
  C3: { key: 'C3', name: 'C₃', M: 44.097, Tc: 369.83, Pc: 42.48, w: 0.152, s: -0.0863 },
  iC4: { key: 'iC4', name: 'i-C₄', M: 58.123, Tc: 408.14, Pc: 36.48, w: 0.184, s: -0.0844 },
  nC4: { key: 'nC4', name: 'n-C₄', M: 58.123, Tc: 425.12, Pc: 37.96, w: 0.200, s: -0.0675 },
  iC5: { key: 'iC5', name: 'i-C₅', M: 72.150, Tc: 460.43, Pc: 33.81, w: 0.228, s: -0.0608 },
  nC5: { key: 'nC5', name: 'n-C₅', M: 72.150, Tc: 469.70, Pc: 33.70, w: 0.252, s: -0.0390 },
  C6: { key: 'C6', name: 'C₆', M: 86.177, Tc: 507.60, Pc: 30.25, w: 0.301, s: -0.0080 },
};

export const COMPONENT_ORDER = ['N2', 'CO2', 'H2S', 'C1', 'C2', 'C3', 'iC4', 'nC4', 'iC5', 'nC5', 'C6', 'C7+'];

// C7+-karakterisering: kokepunkt fra Søreide (1989), Tc/Pc/ω fra Kesler–Lee (1976),
// volumforskyvning fra Jhaveri–Youngren (naftener).
export function characterizePlus(M, SG) {
  const TbR = 1928.3 - 1.695e5 * Math.pow(M, -0.03522) * Math.pow(SG, 3.266)
    * Math.exp(-4.922e-3 * M - 4.7685 * SG + 3.462e-3 * M * SG);
  const TcR = 341.7 + 811 * SG + (0.4244 + 0.1174 * SG) * TbR + (0.4669 - 3.2623 * SG) * 1e5 / TbR;
  const lnPc = 8.3634 - 0.0566 / SG
    - (0.24244 + 2.2898 / SG + 0.11857 / (SG * SG)) * 1e-3 * TbR
    + (1.4685 + 3.648 / SG + 0.47227 / (SG * SG)) * 1e-7 * TbR * TbR
    - (0.42019 + 1.6977 / (SG * SG)) * 1e-10 * TbR ** 3;
  const PcPsia = Math.exp(lnPc);
  const Tbr = TbR / TcR;
  let w;
  if (Tbr < 0.8) {
    const t6 = Tbr ** 6;
    w = (-Math.log(PcPsia / 14.7) - 5.92714 + 6.09648 / Tbr + 1.28862 * Math.log(Tbr) - 0.169347 * t6)
      / (15.2518 - 15.6875 / Tbr - 13.4721 * Math.log(Tbr) + 0.43577 * t6);
  } else {
    const Kw = Math.cbrt(TbR) / SG;
    w = -7.904 + 0.1352 * Kw - 0.007465 * Kw * Kw + 8.359 * Tbr + (1.408 - 0.01063 * Kw) / Tbr;
  }
  // Kritisk volum: Riazi & Daubert (1980), ft³/lb → m³/kmol
  const Vc = 0.062428 * M * 7.5214e-3 * Math.pow(TbR, 0.2896) * Math.pow(SG, -0.7666);
  return {
    key: 'C7+', name: 'C₇₊', M, SG,
    Tb: TbR / 1.8, Tc: TcR / 1.8, Pc: PcPsia / 14.503774, w, Vc,
    s: 1 - 3.004 / Math.pow(M, 0.2324),
  };
}

// Pedersen et al. (1983): eksponentiell fordeling ln z_n = A + B·M_n for enkeltkarbontall n = 7…80,
// tetthet ρ_n = C + D·ln n (forankret i ρ_C6 = 0.685 g/cm³), og samling i pseudokomponenter
// med omtrent lik vektandel. Hver pseudokomponent karakteriseres med Søreide/Kesler–Lee.
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const sub = (n) => String(n).split('').map((d) => SUB[+d]).join('');

export function splitPlus(zPlus, M7, SG7, nPseudo = 3, nMax = 80) {
  const ns = [];
  for (let n = 7; n <= nMax; n++) ns.push(n);
  const Mn = ns.map((n) => 14 * n - 4);
  const meanM = (B) => {
    let s = 0, sm = 0;
    for (let i = 0; i < Mn.length; i++) { const w = Math.exp(B * (Mn[i] - 94)); s += w; sm += w * Mn[i]; }
    return sm / s;
  };
  const Mt = Math.min(Math.max(M7, 96), 590);
  let lo = -2, hi = -1e-7;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (meanM(mid) > Mt) hi = mid; else lo = mid;
  }
  const B = 0.5 * (lo + hi);
  const wts = Mn.map((M) => Math.exp(B * (M - 94)));
  const S = wts.reduce((a, b) => a + b, 0);
  const zn = wts.map((w) => w / S);                         // relativt til C7+
  const lnn = ns.map((n) => Math.log(n));
  const rhoMix = (D) => {
    const C = 0.685 - D * Math.log(6);
    let m = 0, v = 0;
    for (let i = 0; i < ns.length; i++) { const mass = zn[i] * Mn[i]; m += mass; v += mass / (C + D * lnn[i]); }
    return m / v;
  };
  let dlo = 0, dhi = 0.6;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (dlo + dhi);
    if (rhoMix(mid) > SG7) dhi = mid; else dlo = mid;
  }
  const D = 0.5 * (dlo + dhi);
  const C = 0.685 - D * Math.log(6);
  const rhon = lnn.map((l) => C + D * l);
  const mass = zn.map((z, i) => z * Mn[i]);
  const totMass = mass.reduce((a, b) => a + b, 0);
  const groups = [];
  let cur = [], acc = 0, target = totMass / nPseudo;
  for (let i = 0; i < ns.length; i++) {
    cur.push(i);
    acc += mass[i];
    const remainingGroups = nPseudo - groups.length - 1;
    if (remainingGroups > 0 && acc >= target * (groups.length + 1) && ns.length - 1 - i >= remainingGroups) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  return groups.map((g, gi) => {
    let z = 0, m = 0, v = 0;
    for (const i of g) { z += zn[i]; m += mass[i]; v += mass[i] / rhon[i]; }
    const M = m / z, SG = m / v;
    const base = characterizePlus(M, SG);
    const n1 = ns[g[0]], n2 = ns[g[g.length - 1]];
    const label = gi === groups.length - 1 ? `C${sub(n1)}₊` : `C${sub(n1)}–C${sub(n2)}`;
    return { ...base, key: `PS${gi + 1}`, name: label, zFrac: z * zPlus, SG };
  });
}

// Binære interaksjonskoeffisienter for PR (typiske verdier, Whitson & Brulé / Pedersen)
const BIP_NONHC = {
  N2: { CO2: 0.0, H2S: 0.13, C1: 0.025, C2: 0.010, C3: 0.090, iC4: 0.095, nC4: 0.095, iC5: 0.100, nC5: 0.110, C6: 0.110, 'C7+': 0.110 },
  CO2: { H2S: 0.12, C1: 0.105, C2: 0.130, C3: 0.125, iC4: 0.120, nC4: 0.115, iC5: 0.115, nC5: 0.115, C6: 0.115, 'C7+': 0.115 },
  H2S: { C1: 0.070, C2: 0.070, C3: 0.070, iC4: 0.060, nC4: 0.060, iC5: 0.060, nC5: 0.060, C6: 0.050, 'C7+': 0.050 },
};

// ca, cb: komponentobjekter. Pseudokomponenter (C7+ eller PS1…) behandles som pluss-fraksjon.
export function bip(ca, cb) {
  if (ca === cb || ca.key === cb.key) return 0;
  const isPlus = (c) => c.key === 'C7+' || c.key.startsWith('PS');
  const a = isPlus(ca) ? 'C7+' : ca.key;
  const b = isPlus(cb) ? 'C7+' : cb.key;
  if (a === 'C7+' && b === 'C7+') return 0;
  const get = (p, q) => (BIP_NONHC[p] && BIP_NONHC[p][q] !== undefined ? BIP_NONHC[p][q] : undefined);
  const v = get(a, b) ?? get(b, a);
  if (v !== undefined) return v;
  // C1–C7+: Katz & Firoozabadi (1978), δ = 0.14·γ − 0.0668
  if (a === 'C1' && b === 'C7+') return Math.max(0, 0.14 * cb.SG - 0.0668);
  if (b === 'C1' && a === 'C7+') return Math.max(0, 0.14 * ca.SG - 0.0668);
  return 0;
}

// Forhåndsdefinerte reservoarvæsker (mol-%)
export const FLUID_PRESETS = {
  blackoil: {
    name: 'Nordsjø svartolje',
    z: { N2: 0.4, CO2: 1.2, H2S: 0, C1: 44.0, C2: 6.5, C3: 5.2, iC4: 0.9, nC4: 2.3, iC5: 0.9, nC5: 1.3, C6: 1.8, 'C7+': 35.5 },
    M7: 210, SG7: 0.845, T: 104, P: 411,
  },
  volatile: {
    name: 'Flyktig olje',
    z: { N2: 0.5, CO2: 1.8, H2S: 0, C1: 62.0, C2: 8.0, C3: 5.0, iC4: 1.1, nC4: 2.4, iC5: 1.0, nC5: 1.2, C6: 1.5, 'C7+': 15.5 },
    M7: 185, SG7: 0.835, T: 120, P: 450,
  },
  condensate: {
    name: 'Gasskondensat',
    z: { N2: 0.5, CO2: 2.5, H2S: 0, C1: 71.0, C2: 8.5, C3: 5.0, iC4: 1.0, nC4: 2.0, iC5: 0.8, nC5: 0.9, C6: 1.2, 'C7+': 6.6 },
    M7: 130, SG7: 0.770, T: 110, P: 330,
  },
  wetgas: {
    name: 'Våtgass',
    z: { N2: 0.8, CO2: 2.0, H2S: 0, C1: 86.5, C2: 5.5, C3: 2.4, iC4: 0.5, nC4: 0.7, iC5: 0.3, nC5: 0.3, C6: 0.3, 'C7+': 0.7 },
    M7: 120, SG7: 0.760, T: 110, P: 320,
  },
  drygas: {
    name: 'Tørrgass',
    z: { N2: 1.0, CO2: 1.5, H2S: 0, C1: 94.0, C2: 2.8, C3: 0.5, iC4: 0.1, nC4: 0.1, iC5: 0, nC5: 0, C6: 0, 'C7+': 0 },
    M7: 110, SG7: 0.740, T: 100, P: 300,
  },
};
