// Peng–Robinson tilstandsligning (1976/1978) med Peneloux volumforskyvning.
// Enheter: T [K], P [bar], molvolum [m³/kmol], tetthet [kg/m³].
// Algoritmer: Michelsens stabilitetstest, suksessiv substitusjon (PT-flash) med
// akselerasjon, metningstrykk og faseomhylning (Michelsen 1980) med numerisk Jacobi-matrise.

import { COMPONENTS, COMPONENT_ORDER, characterizePlus, splitPlus, bip } from './components.js';

export const R = 0.08314462618;       // bar·m³/(kmol·K)
export const P_SC = 1.01325;
export const T_SC = 288.15;
const SQ2 = Math.SQRT2;
const D1 = 1 + SQ2;
const D2 = 1 - SQ2;

// Kritisk volum [m³/kmol] for Lohrenz–Bray–Clark-viskositet
const VC = { N2: 0.0895, CO2: 0.0940, H2S: 0.0985, C1: 0.0986, C2: 0.1455, C3: 0.2000, iC4: 0.2627, nC4: 0.2550, iC5: 0.3058, nC5: 0.3040, C6: 0.3700 };

// Reelle røtter av z³ + a2 z² + a1 z + a0 = 0
export function cubicRoots(a2, a1, a0) {
  const q = (3 * a1 - a2 * a2) / 9;
  const r = (9 * a2 * a1 - 27 * a0 - 2 * a2 * a2 * a2) / 54;
  const disc = q * q * q + r * r;
  let roots;
  if (disc > 0) {
    const sd = Math.sqrt(disc);
    roots = [Math.cbrt(r + sd) + Math.cbrt(r - sd) - a2 / 3];
  } else {
    const th = Math.acos(Math.max(-1, Math.min(1, r / Math.sqrt(-q * q * q))));
    const m = 2 * Math.sqrt(-q);
    roots = [m * Math.cos(th / 3) - a2 / 3, m * Math.cos((th + 2 * Math.PI) / 3) - a2 / 3, m * Math.cos((th + 4 * Math.PI) / 3) - a2 / 3];
  }
  // Newton-polering
  return roots.map((z) => {
    for (let i = 0; i < 3; i++) {
      const f = ((z + a2) * z + a1) * z + a0;
      const df = (3 * z + 2 * a2) * z + a1;
      if (df === 0) break;
      z -= f / df;
    }
    return z;
  });
}

// Løser A·x = b med Gauss-eliminasjon og delvis pivotering. A: array av rader.
export function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.abs(M[c][c]);
    for (let r = c + 1; r < n; r++) {
      const v = Math.abs(M[r][c]);
      if (v > best) { best = v; p = r; }
    }
    if (best < 1e-300) return null;
    if (p !== c) { const t = M[p]; M[p] = M[c]; M[c] = t; }
    const piv = M[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / piv;
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x.every(Number.isFinite) ? x : null;
}

export function rachfordRice(z, K) {
  let kmin = Infinity, kmax = -Infinity;
  for (let i = 0; i < K.length; i++) { if (K[i] < kmin) kmin = K[i]; if (K[i] > kmax) kmax = K[i]; }
  if (kmax <= 1) return 0;
  if (kmin >= 1) return 1;
  const f = (V) => { let s = 0; for (let i = 0; i < z.length; i++) s += z[i] * (K[i] - 1) / (1 + V * (K[i] - 1)); return s; };
  const df = (V) => { let s = 0; for (let i = 0; i < z.length; i++) { const d = 1 + V * (K[i] - 1); s -= z[i] * (K[i] - 1) * (K[i] - 1) / (d * d); } return s; };
  let lo = 1 / (1 - kmax), hi = 1 / (1 - kmin);
  const eps = 1e-12 * (hi - lo);
  lo += eps; hi -= eps;
  let V = Math.min(Math.max(0.5, lo + (hi - lo) * 0.01), hi - (hi - lo) * 0.01);
  for (let it = 0; it < 200; it++) {
    const fv = f(V);
    if (Math.abs(fv) < 1e-15) break;
    if (fv > 0) lo = V; else hi = V;
    let Vn = V - fv / df(V);
    if (!(Vn > lo && Vn < hi)) Vn = 0.5 * (lo + hi);
    if (Math.abs(Vn - V) < 1e-15) { V = Vn; break; }
    V = Vn;
  }
  return V;
}

export class PengRobinson {
  constructor(comps, { plusSG = 0.85, peneloux = true } = {}) {
    this.comps = comps;
    this.n = comps.length;
    this.peneloux = peneloux;
    const n = this.n;
    this.Tc = comps.map((c) => c.Tc);
    this.Pc = comps.map((c) => c.Pc);
    this.w = comps.map((c) => c.w);
    this.M = comps.map((c) => c.M);
    this.b = comps.map((c) => 0.07780 * R * c.Tc / c.Pc);
    this.ac = comps.map((c) => 0.45724 * R * R * c.Tc * c.Tc / c.Pc);
    this.mk = comps.map((c) => (c.w <= 0.49
      ? 0.37464 + 1.54226 * c.w - 0.26992 * c.w * c.w
      : 0.379642 + 1.48503 * c.w - 0.164423 * c.w * c.w + 0.016666 * c.w ** 3));
    this.cs = comps.map((c, i) => (c.s || 0) * this.b[i]);
    this.kij = new Float64Array(n * n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) this.kij[i * n + j] = bip(comps[i], comps[j]);
    this.Vc = comps.map((c) => {
      if (VC[c.key]) return VC[c.key];
      if (c.Vc) return c.Vc;
      const Zc = 0.2918 - 0.0928 * c.w;
      return Zc * R * c.Tc / c.Pc;
    });
    this._T = NaN;
    this.a = new Float64Array(n);
    this.aij = new Float64Array(n * n);
  }

  setT(T) {
    if (T === this._T) return;
    this._T = T;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const s = 1 + this.mk[i] * (1 - Math.sqrt(T / this.Tc[i]));
      this.a[i] = this.ac[i] * s * s;
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      this.aij[i * n + j] = Math.sqrt(this.a[i] * this.a[j]) * (1 - this.kij[i * n + j]);
    }
  }

  // Fugasitetskoeffisienter. root: 'L', 'V' eller 'min' (laveste Gibbs-energi)
  fug(x, T, P, root = 'min') {
    this.setT(T);
    const n = this.n, aij = this.aij, b = this.b;
    const sa = new Float64Array(n);
    let am = 0, bm = 0;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += x[j] * aij[i * n + j];
      sa[i] = s;
      am += x[i] * s;
      bm += x[i] * b[i];
    }
    const A = am * P / (R * R * T * T);
    const B = bm * P / (R * T);
    const roots = cubicRoots(-(1 - B), A - 3 * B * B - 2 * B, -(A * B - B * B - B * B * B)).filter((z) => z > B);
    let Z;
    if (roots.length === 0) Z = B + 1e-9;
    else if (roots.length === 1) Z = roots[0];
    else {
      const zl = Math.min(...roots), zv = Math.max(...roots);
      if (root === 'L') Z = zl;
      else if (root === 'V') Z = zv;
      else {
        const g = (z) => (z - 1) - Math.log(z - B) - A / (2 * SQ2 * B) * Math.log((z + D1 * B) / (z + D2 * B));
        Z = g(zl) < g(zv) ? zl : zv;
      }
    }
    const lnphi = new Float64Array(n);
    const L = Math.log((Z + D1 * B) / (Z + D2 * B));
    const lzb = Math.log(Z - B);
    const f = A / (2 * SQ2 * B);
    for (let i = 0; i < n; i++) {
      const bi = b[i] / bm;
      lnphi[i] = bi * (Z - 1) - lzb - f * (2 * sa[i] / am - bi) * L;
    }
    return { Z, lnphi, A, B, am, bm };
  }

  // Molvolum med volumforskyvning, molmasse og tetthet
  phaseProps(x, T, P, Z) {
    let Mw = 0, c = 0, bm = 0;
    for (let i = 0; i < this.n; i++) { Mw += x[i] * this.M[i]; c += x[i] * this.cs[i]; bm += x[i] * this.b[i]; }
    const vEos = Z * R * T / P;
    const v = this.peneloux ? vEos - c : vEos;
    return { v, vEos, M: Mw, rho: Mw / v, Z: P * v / (R * T), vOverB: vEos / bm };
  }

  // Lohrenz–Bray–Clark (1964) viskositet [cP]
  viscosityLBC(x, T, rhoMolar) {
    let sumM = 0, sumTc = 0, sumPc = 0, num = 0, den = 0, Vc = 0;
    for (let i = 0; i < this.n; i++) {
      const Pa = this.Pc[i] / 1.01325;
      const Tr = T / this.Tc[i];
      const xi = Math.pow(this.Tc[i], 1 / 6) / (Math.sqrt(this.M[i]) * Math.pow(Pa, 2 / 3));
      const mu = Tr <= 1.5 ? 34e-5 * Math.pow(Tr, 0.94) / xi : 17.78e-5 * Math.pow(4.58 * Tr - 1.67, 0.625) / xi;
      const sq = Math.sqrt(this.M[i]);
      num += x[i] * mu * sq; den += x[i] * sq;
      sumM += x[i] * this.M[i]; sumTc += x[i] * this.Tc[i]; sumPc += x[i] * Pa; Vc += x[i] * this.Vc[i];
    }
    const muStar = num / den;
    const xiM = Math.pow(sumTc, 1 / 6) / (Math.sqrt(sumM) * Math.pow(sumPc, 2 / 3));
    const rr = rhoMolar * Vc;
    const poly = 0.1023 + 0.023364 * rr + 0.058533 * rr * rr - 0.040758 * rr ** 3 + 0.0093324 * rr ** 4;
    return muStar + (Math.pow(poly, 4) - 1e-4) / xiM;
  }

  wilsonK(T, P) {
    return this.comps.map((c) => (c.Pc / P) * Math.exp(5.373 * (1 + c.w) * (1 - c.Tc / T)));
  }

  // Michelsens tangentplan-stabilitetstest
  stability(z, T, P) {
    const n = this.n;
    const fz = this.fug(z, T, P, 'min');
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) d[i] = Math.log(z[i]) + fz.lnphi[i];
    const Kw = this.wilsonK(T, P);
    let best = null;
    for (const type of ['V', 'L']) {
      let W = z.map((zi, i) => (type === 'V' ? zi * Kw[i] : zi / Kw[i]));
      let trivial = false;
      for (let it = 0; it < 400; it++) {
        let S = 0;
        for (let i = 0; i < n; i++) S += W[i];
        const w = W.map((v) => v / S);
        const fw = this.fug(w, T, P, 'min');
        let err = 0, tr = 0;
        const Wn = new Array(n);
        for (let i = 0; i < n; i++) {
          Wn[i] = Math.exp(d[i] - fw.lnphi[i]);
          const e = Math.log(Wn[i] / W[i]);
          err += e * e;
          const t = Math.log(w[i] / z[i]);
          tr += t * t;
        }
        W = Wn;
        if (tr < 1e-8) { trivial = true; break; }
        if (err < 1e-14) break;
      }
      let S = 0;
      for (let i = 0; i < n; i++) S += W[i];
      if (!trivial && S > 1 + 1e-9 && (!best || S > best.S)) best = { type, S, W };
    }
    if (!best) return { stable: true, fz };
    const K = best.type === 'V'
      ? best.W.map((wv, i) => (wv / best.S) / z[i])
      : best.W.map((wv, i) => z[i] / (wv / best.S));
    return { stable: false, K, fz };
  }

  singlePhase(z, T, P, fz) {
    const f = fz || this.fug(z, T, P, 'min');
    const pp = this.phaseProps(z, T, P, f.Z);
    const isLiquid = pp.vOverB < 1.75;
    const mu = this.viscosityLBC(z, T, 1 / pp.vEos);
    const phase = { x: Array.from(z), Z: pp.Z, v: pp.v, rho: pp.rho, M: pp.M, mu };
    return {
      nPhases: 1,
      beta: isLiquid ? 0 : 1,
      label: isLiquid ? 'væske' : 'gass',
      L: isLiquid ? phase : null,
      V: isLiquid ? null : phase,
      single: phase,
      T, P,
    };
  }

  flash(z, T, P) {
    const n = this.n;
    const st = this.stability(z, T, P);
    if (st.stable) return this.singlePhase(z, T, P, st.fz);
    let lnK = st.K.map(Math.log);
    let V = 0.5, x, y, fl, fv;
    let dPrev = null;
    for (let it = 0; it < 3000; it++) {
      const K = lnK.map(Math.exp);
      V = rachfordRice(z, K);
      x = new Array(n); y = new Array(n);
      let sx = 0, sy = 0;
      for (let i = 0; i < n; i++) {
        x[i] = z[i] / (1 + V * (K[i] - 1));
        y[i] = K[i] * x[i];
        sx += x[i]; sy += y[i];
      }
      for (let i = 0; i < n; i++) { x[i] /= sx; y[i] /= sy; }
      fl = this.fug(x, T, P, 'min');
      fv = this.fug(y, T, P, 'min');
      const d = new Array(n);
      let err = 0;
      for (let i = 0; i < n; i++) {
        const nk = fl.lnphi[i] - fv.lnphi[i];
        d[i] = nk - lnK[i];
        err += d[i] * d[i];
        lnK[i] = nk;
      }
      if (err < 1e-20) break;
      // Dominant egenverdi-akselerasjon (Crowe & Nishio) hver 6. iterasjon
      if (dPrev && it % 6 === 5) {
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) { num += d[i] * d[i]; den += dPrev[i] * d[i]; }
        const lam = den !== 0 ? num / den : 0;
        if (lam > 0 && lam < 0.98) {
          const f = lam / (1 - lam);
          for (let i = 0; i < n; i++) lnK[i] += f * d[i];
        }
      }
      dPrev = d;
    }
    let trivial = 0;
    for (let i = 0; i < n; i++) trivial += lnK[i] * lnK[i];
    if (V <= 0 || V >= 1 || trivial < 1e-8) return this.singlePhase(z, T, P);
    const pl = this.phaseProps(x, T, P, fl.Z);
    const pv = this.phaseProps(y, T, P, fv.Z);
    return {
      nPhases: 2,
      beta: V,
      label: 'tofase',
      L: { x, Z: pl.Z, v: pl.v, rho: pl.rho, M: pl.M, mu: this.viscosityLBC(x, T, 1 / pl.vEos) },
      V: { x: y, Z: pv.Z, v: pv.v, rho: pv.rho, M: pv.M, mu: this.viscosityLBC(y, T, 1 / pv.vEos) },
      K: lnK.map(Math.exp),
      T, P,
    };
  }

  // Metningstrykk (boble- eller duggpunkt) ved T. Kombinert suksessiv substitusjon.
  saturationPressure(z, T, kind, P0) {
    const n = this.n;
    let P = P0;
    let K = this.wilsonK(T, P);
    for (let outer = 0; outer < 600; outer++) {
      let S = 0;
      if (kind === 'bubble') {
        let sy = 0;
        const y = new Array(n);
        for (let i = 0; i < n; i++) { y[i] = z[i] * K[i]; sy += y[i]; }
        for (let i = 0; i < n; i++) y[i] /= sy;
        const fl = this.fug(z, T, P, 'L');
        const fv = this.fug(y, T, P, 'V');
        for (let i = 0; i < n; i++) { K[i] = Math.exp(fl.lnphi[i] - fv.lnphi[i]); S += z[i] * K[i]; }
        P *= Math.pow(S, 0.85);
      } else {
        let sx = 0;
        const x = new Array(n);
        for (let i = 0; i < n; i++) { x[i] = z[i] / K[i]; sx += x[i]; }
        for (let i = 0; i < n; i++) x[i] /= sx;
        const fv = this.fug(z, T, P, 'V');
        const fl = this.fug(x, T, P, 'L');
        for (let i = 0; i < n; i++) { K[i] = Math.exp(fl.lnphi[i] - fv.lnphi[i]); S += z[i] / K[i]; }
        P /= Math.pow(S, 0.85);
      }
      let tr = 0;
      for (let i = 0; i < n; i++) tr += Math.log(K[i]) ** 2;
      if ((n > 1 && tr < 1e-6) || !(P > 0) || !Number.isFinite(P)) return null;
      if (Math.abs(S - 1) < 1e-10) return { P, K, kind };
    }
    return null;
  }

  // ---- Faseomhylning (Michelsen 1980) ----
  _envResidual(X, z, s, S, roots) {
    const n = this.n;
    const T = Math.exp(X[n]), P = Math.exp(X[n + 1]);
    const y = new Array(n);
    let sy = 0;
    for (let i = 0; i < n; i++) { y[i] = z[i] * Math.exp(X[i]); sy += y[i]; }
    const yn = y.map((v) => v / sy);
    const fz = this.fug(z, T, P, roots[0]);
    const fy = this.fug(yn, T, P, roots[1]);
    const F = new Array(n + 2);
    for (let i = 0; i < n; i++) F[i] = X[i] + fy.lnphi[i] - fz.lnphi[i];
    F[n] = sy - 1;
    F[n + 1] = X[s] - S;
    return F;
  }

  _envJacobian(X, z, s, S, roots, F0) {
    const m = X.length;
    const J = Array.from({ length: m }, () => new Array(m).fill(0));
    for (let j = 0; j < m; j++) {
      const h = 1e-7 * Math.max(1, Math.abs(X[j]));
      const Xp = X.slice();
      Xp[j] += h;
      const Fp = this._envResidual(Xp, z, s, S, roots);
      for (let i = 0; i < m; i++) J[i][j] = (Fp[i] - F0[i]) / h;
    }
    return J;
  }

  _envNewton(X0, z, s, S, roots, maxIt = 30) {
    let X = X0.slice();
    const n = this.n;
    for (let it = 1; it <= maxIt; it++) {
      const F = this._envResidual(X, z, s, S, roots);
      if (!F.every(Number.isFinite)) return null;
      const J = this._envJacobian(X, z, s, S, roots, F);
      const dX = solveLinear(J, F.map((v) => -v));
      if (!dX) return null;
      let maxStep = 0;
      for (let j = 0; j < dX.length; j++) maxStep = Math.max(maxStep, Math.abs(dX[j]));
      const sc = maxStep > 1.5 ? 1.5 / maxStep : 1;
      for (let j = 0; j < dX.length; j++) X[j] += sc * dX[j];
      if (maxStep * sc < 1e-9) {
        let tr = 0;
        for (let i = 0; i < n; i++) tr += X[i] * X[i];
        if (tr < 1e-8) return null;
        const Ff = this._envResidual(X, z, s, S, roots);
        return { X, it, J: this._envJacobian(X, z, s, S, roots, Ff) };
      }
    }
    return null;
  }

  _startPoint(z, Pstart, kind) {
    const n = this.n;
    const g = (T) => {
      const K = this.wilsonK(T, Pstart);
      let s = 0;
      for (let i = 0; i < n; i++) s += kind === 'bubble' ? z[i] * K[i] : z[i] / K[i];
      return s - 1;
    };
    let lo = 30, hi = 2500;
    const glo = g(lo), ghi = g(hi);
    if (glo * ghi > 0) return null;
    for (let i = 0; i < 200; i++) {
      const mid = Math.sqrt(lo * hi);
      if (g(mid) * glo > 0) lo = mid; else hi = mid;
    }
    const T = Math.sqrt(lo * hi);
    const K = this.wilsonK(T, Pstart);
    // for duggpunktssiden er z gass og den nye fasen væske: K = y_ny/z = 1/K_wilson
    const lnK = K.map((k) => (kind === 'bubble' ? Math.log(k) : -Math.log(k)));
    return [...lnK, Math.log(T), Math.log(Pstart)];
  }

  phaseEnvelope(z, opts = {}) {
    const n = this.n;
    const Pstart = opts.Pstart ?? 1.5;
    const Pmin = opts.Pmin ?? 1.0;
    const Tmax = opts.Tmax ?? 1500;
    const maxPts = opts.maxPoints ?? 500;
    const Tmin = opts.Tmin ?? 150;
    // Start på duggpunktssiden ved lavt trykk (robust for tunge komponenter),
    // med boblepunktssiden som reserve.
    let roots = ['V', 'L'];
    let branch = 'dew';
    let X0 = this._startPoint(z, Pstart, 'dew');
    let r = X0 && this._envNewton(X0, z, n + 1, X0[n + 1], roots);
    if (!r) {
      roots = ['L', 'V']; branch = 'bubble';
      X0 = this._startPoint(z, Pstart, 'bubble');
      r = X0 && this._envNewton(X0, z, n + 1, X0[n + 1], roots);
      if (!r) return { points: [], crit: null };
    }
    const points = [{ T: Math.exp(r.X[n]), P: Math.exp(r.X[n + 1]), branch }];
    let X = r.X, J = r.J;
    let tPrev = null;
    let delta = 0.02;
    const dmax = opts.dmax ?? 0.08;
    let crit = null;
    // Tyngste komponent: K krysser 1 bare i kritisk punkt
    const kref = n - 1;
    let guard = 0;
    while (points.length < maxPts && guard++ < maxPts * 6) {
      const rhs = new Array(n + 2).fill(0);
      rhs[n + 1] = 1;
      let t = solveLinear(J, rhs);
      if (!t) break;
      let norm = Math.hypot(...t);
      t = t.map((v) => v / norm);
      if (tPrev) {
        let dot = 0;
        for (let i = 0; i < t.length; i++) dot += t[i] * tPrev[i];
        if (dot < 0) t = t.map((v) => -v);
      } else if (t[n + 1] < 0) {
        t = t.map((v) => -v);
      }
      let s = 0;
      for (let i = 1; i < t.length; i++) if (Math.abs(t[i]) > Math.abs(t[s])) s = i;
      // Steglengde: delta i (lnT, lnP), begrenset slik at ingen lnK endres for mye
      const tp = Math.hypot(t[n], t[n + 1]);
      let step = tp > 1e-12 ? delta / tp : 1e9;
      for (let i = 0; i < n; i++) {
        const cap = Math.max(0.15, 0.35 * Math.abs(X[i]));
        if (Math.abs(t[i]) * step > cap) step = cap / Math.abs(t[i]);
      }
      let Xp = X.map((v, i) => v + t[i] * step);
      // Nær kritisk punkt (alle lnK små): hopp symmetrisk over lnK = 0 med tyngste komponent som spesifikasjon
      let maxLnK = 0;
      for (let i = 0; i < n; i++) maxLnK = Math.max(maxLnK, Math.abs(X[i]));
      if (!crit && maxLnK < 0.5 && Math.abs(t[kref]) > 1e-9
        && (Math.sign(Xp[kref]) !== Math.sign(X[kref]) || Math.abs(Xp[kref]) < 0.3 * Math.abs(X[kref]))) {
        s = kref;
        step = (-X[kref] - X[kref]) / t[kref];
        Xp = X.map((v, i) => v + t[i] * step);
      }
      const r2 = this._envNewton(Xp, z, s, Xp[s], roots);
      // Godta bare punkter nær prediktoren (hindrer hopp til en annen gren)
      const jumpTP = r2 ? Math.max(Math.abs(r2.X[n] - Xp[n]), Math.abs(r2.X[n + 1] - Xp[n + 1])) : Infinity;
      if (!r2 || r2.it > 10 || jumpTP > Math.max(0.03, 1.5 * delta)) {
        delta *= 0.5;
        if (delta < 1e-5) break;
        continue;
      }
      let Xn = r2.X, Jn = r2.J;
      if (Math.sign(Xn[kref]) !== Math.sign(X[kref]) && !crit) {
        const f = X[kref] / (X[kref] - Xn[kref]);
        const Tc = Math.exp(X[n] + f * (Xn[n] - X[n]));
        const Pc = Math.exp(X[n + 1] + f * (Xn[n + 1] - X[n + 1]));
        crit = { T: Tc, P: Pc };
        points.push({ T: Tc, P: Pc, branch: 'crit' });
        roots = [roots[1], roots[0]];
        branch = branch === 'bubble' ? 'dew' : 'bubble';
        const r3 = this._envNewton(Xn, z, s, Xn[s], roots);
        if (r3) { Xn = r3.X; Jn = r3.J; }
      }
      X = Xn; J = Jn; tPrev = t;
      const T = Math.exp(X[n]), P = Math.exp(X[n + 1]);
      points.push({ T, P, branch });
      if (r2.it <= 4) delta = Math.min(delta * 1.4, dmax);
      const tStop = crit ? Math.max(Tmin, Math.min(213, crit.T - 60)) : Tmin;
      if (T > Tmax || (branch === 'bubble' && T < tStop)) break;
      if (P < Pmin && points.length > 5 && t[n + 1] < 0) break;
      if (P > 3000) break;
    }
    return { points, crit };
  }
}

// ---------- Hjelpere for væskemodell ----------
export function buildFluid(zPct, M7, SG7, opts = {}) {
  const comps = [], z = [], keys = [];
  const nPseudo = opts.nPseudo ?? 1;
  for (const k of COMPONENT_ORDER) {
    const v = Number(zPct[k]) || 0;
    if (v <= 0) continue;
    if (k === 'C7+') {
      if (nPseudo > 1 && v >= 0.05) {
        for (const ps of splitPlus(v, M7, SG7, nPseudo)) { comps.push(ps); z.push(ps.zFrac); keys.push(ps.key); }
      } else {
        comps.push(characterizePlus(M7, SG7)); z.push(v); keys.push(k);
      }
      continue;
    }
    comps.push(COMPONENTS[k]);
    z.push(v);
    keys.push(k);
  }
  const sum = z.reduce((a, b) => a + b, 0);
  const eos = new PengRobinson(comps, { plusSG: SG7, peneloux: opts.peneloux !== false });
  return { eos, comps, keys, z: z.map((v) => v / sum), sumPct: sum };
}

// Metningstrykk ved T via faseomhylningen og deretter direkte beregning
export function saturationAt(eos, z, T, env) {
  const pts = env.points;
  const cands = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if ((a.T - T) * (b.T - T) <= 0 && a.T !== b.T) {
      const f = (T - a.T) / (b.T - a.T);
      const P = Math.exp(Math.log(a.P) + f * (Math.log(b.P) - Math.log(a.P)));
      const br = a.branch === 'crit' ? b.branch : a.branch;
      cands.push({ P, branch: br });
    }
  }
  if (!cands.length) return null;
  cands.sort((p, q) => q.P - p.P);
  const top = cands[0];
  const refined = eos.saturationPressure(z, T, top.branch === 'bubble' ? 'bubble' : 'dew', top.P);
  const P = refined && Math.abs(refined.P - top.P) / top.P < 0.15 ? refined.P : top.P;
  return { P, kind: top.branch === 'bubble' ? 'bubble' : 'dew', lower: cands.length > 1 ? cands[cands.length - 1].P : null };
}

export function envelopeSummary(env) {
  let cb = null, ct = null;
  for (const p of env.points) {
    if (!cb || p.P > cb.P) cb = p;
    if (!ct || p.T > ct.T) ct = p;
  }
  return { cricondenbar: cb, cricondentherm: ct, crit: env.crit };
}

// Klassifisering av reservoarvæske (McCain)
export function classifyFluid(T, env, sepTest) {
  const s = envelopeSummary(env);
  if (!s.crit && !s.cricondentherm) return { type: 'Ukjent', why: 'Faseomhylningen kunne ikke beregnes.' };
  const Tc = s.crit ? s.crit.T : null;
  const Tct = s.cricondentherm ? s.cricondentherm.T : null;
  if (Tc && T < Tc) {
    const gor = sepTest ? sepTest.GOR : null;
    if (gor !== null && gor > 310) return { type: 'Flyktig olje', why: `T_res < T_kritisk og GOR ≈ ${gor.toFixed(0)} Sm³/Sm³ (> ~310).` };
    return { type: 'Svartolje', why: 'Reservoartemperaturen er lavere enn kritisk temperatur: væsken er en olje med boblepunkt.' };
  }
  if (Tct && T < Tct) return { type: 'Gasskondensat', why: 'T_kritisk < T_res < kricondentermen: retrograd kondensasjon under duggpunktet.' };
  if (sepTest && sepTest.liquid) return { type: 'Våtgass', why: 'T_res er over kricondentermen, men det dannes væske i separatoren.' };
  return { type: 'Tørrgass', why: 'T_res er over kricondentermen, og det dannes ikke væske ved separatorforhold.' };
}
