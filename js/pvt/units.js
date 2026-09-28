// Enhetskonvertering. PVT-korrelasjonene er publisert i feltenheter (psia, °F, scf/STB),
// mens brukergrensesnittet viser SI-enheter slik det er vanlig på norsk sokkel.

export const PSI_PER_BAR = 14.503774;
export const SCF_STB_PER_SM3_SM3 = 5.614583;   // 1 Sm³/Sm³ = 5.6146 scf/STB
export const P_SC_BAR = 1.01325;               // standardtrykk
export const T_SC_C = 15;                      // standardtemperatur (norsk sokkel)
export const R_GAS = 8314.462618;              // J/(kmol·K)
export const M_AIR = 28.9647;                  // kg/kmol
export const RHO_WATER_SC = 999.1;             // kg/m³ ved 15 °C

export const barToPsi = (b) => b * PSI_PER_BAR;
export const psiToBar = (p) => p / PSI_PER_BAR;
export const cToF = (c) => c * 9 / 5 + 32;
export const fToC = (f) => (f - 32) * 5 / 9;
export const cToK = (c) => c + 273.15;
export const cToR = (c) => (c + 273.15) * 1.8;
export const sm3ToScf = (r) => r * SCF_STB_PER_SM3_SM3;
export const scfToSm3 = (r) => r / SCF_STB_PER_SM3_SM3;
export const apiFromSG = (sg) => 141.5 / sg - 131.5;
export const sgFromApi = (api) => 141.5 / (api + 131.5);
export const lbft3ToKgm3 = (x) => x * 16.018463;
export const kgm3ToLbft3 = (x) => x / 16.018463;
export const perPsiToPerBar = (c) => c * PSI_PER_BAR;
