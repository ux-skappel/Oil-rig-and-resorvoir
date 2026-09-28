// Borehydraulikk med Bingham-plastisk modell (Bourgoyne et al., «Applied Drilling Engineering», kap. 4).
// Formlene er i feltenheter: q [gpm], d [in], L [ft], ρ [ppg], μp [cP], τy [lbf/100ft²] → [psi].

export const PSI_PER_BAR = 14.503774;
export const LPM_PER_GPM = 3.785412;
export const FT_PER_M = 3.28084;
export const PPG_PER_SG = 8.3454;

// Glatt oppstart av flytegrensen ved svært små rater (numerisk stabilitet)
const yieldRamp = (q) => 1 - Math.exp(-q / 40);

// Friksjonstap i rør (inne i borestrengen)
export function pipeLossPsi(q, d, L, rho, pv, yp) {
  if (q <= 0 || L <= 0) return 0;
  const v = q / (2.448 * d * d);                                    // ft/s
  const lam = (pv * v) / (1500 * d * d) + yieldRamp(q) * yp / (225 * d);
  const tur = Math.pow(rho, 0.75) * Math.pow(v, 1.75) * Math.pow(Math.max(pv, 0.5), 0.25) / (1800 * Math.pow(d, 1.25));
  return Math.max(lam, tur) * L;
}

// Friksjonstap i ringrom (mellom rør og hull/foringsrør)
export function annLossPsi(q, d2, d1, L, rho, pv, yp) {
  if (q <= 0 || L <= 0) return 0;
  const v = q / (2.448 * (d2 * d2 - d1 * d1));
  const dh = d2 - d1;
  const lam = (pv * v) / (1000 * dh * dh) + yieldRamp(q) * yp / (200 * dh);
  const tur = Math.pow(rho, 0.75) * Math.pow(v, 1.75) * Math.pow(Math.max(pv, 0.5), 0.25) / (1396 * Math.pow(dh, 1.25));
  return Math.max(lam, tur) * L;
}

// Trykktap over kronedysene: ΔP = 8.311e-5 ρ q² / (Cd² A²), Cd = 0.95
export function bitLossPsi(q, rho, tfa) {
  if (q <= 0) return 0;
  return 8.311e-5 * rho * q * q / (0.95 * 0.95 * tfa * tfa);
}

// Jetkraft (lbf) og hydraulisk effekt ved krona (hk)
export function jetImpactLbf(q, rho, dPbitPsi) {
  return 0.01823 * 0.95 * q * Math.sqrt(Math.max(rho * dPbitPsi, 0));
}
export function bitHHP(q, dPbitPsi) {
  return q * dPbitPsi / 1714;
}

// SI-hjelpere
export function lossBar(fn, qLpm, ...args) {
  return fn(qLpm / LPM_PER_GPM, ...args) / PSI_PER_BAR;
}

// Ringromshastighet (m/s)
export function annularVelocity(qM3s, dOuterIn, dInnerIn) {
  const a = Math.PI / 4 * ((dOuterIn * 0.0254) ** 2 - (dInnerIn * 0.0254) ** 2);
  return a > 0 ? qM3s / a : 0;
}

// Choke: gjennomstrømning gjennom en justerbar dyse (åpning 0–1, maks 2" boring)
export const CHOKE_MAX_AREA = Math.PI / 4 * (2 * 0.0254) ** 2;
export function chokeArea(opening) {
  const o = Math.min(Math.max(opening, 0), 1);
  return CHOKE_MAX_AREA * o * o;              // tilnærmet likeprosent-karakteristikk
}
export function chokeFlow(dPbar, rhoKgm3, opening) {
  const A = chokeArea(opening);
  if (A <= 0 || dPbar <= 0) return 0;
  return 0.8 * A * Math.sqrt(2 * dPbar * 1e5 / Math.max(rhoKgm3, 50)); // m³/s
}
export function chokePressure(qM3s, rhoKgm3, opening) {
  const A = chokeArea(opening);
  if (A <= 0) return Infinity;
  const v = qM3s / (0.8 * A);
  return 0.5 * rhoKgm3 * v * v / 1e5;           // bar
}
export function chokeOpeningFor(dPbar, qM3s, rhoKgm3) {
  if (qM3s <= 0) return 0;
  if (dPbar <= 0.05) return 1;
  const A = qM3s / (0.8 * Math.sqrt(2 * dPbar * 1e5 / Math.max(rhoKgm3, 50)));
  return Math.min(1, Math.sqrt(A / CHOKE_MAX_AREA));
}
