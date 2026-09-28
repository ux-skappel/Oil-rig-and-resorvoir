// Brønnplan, geologi og utstyr for en fiktiv letebrønn i nordlige Nordsjøen (brønn 35/13-1).
// Alle dybder er målt dybde (MD) fra boredekket (RKB). Brønnen er vertikal, så MD = TVD.

export const RKB = 27;                 // boredekkets høyde over havflaten (m)
export const WATER_DEPTH = 350;        // havdyp (m)
export const SEABED = RKB + WATER_DEPTH; // havbunn = 377 m RKB
export const SEAWATER_SG = 1.03;
export const STEEL_SG = 7.85;
export const BAR_PER_M_SG = 0.0980665; // ρgh: 1 sg over 1 m = 0.0981 bar
export const STAND_LENGTH = 28.5;      // ett stativ = 3 borerør à ca. 9,5 m (Range 2)
export const TRAVEL_EQUIP_T = 50;      // løpeblokk + toppdrev (tonn)
export const TD_PLAN = 3200;           // planlagt totaldybde
export const WELL_NAME = '35/13-1';
export const RIG_NAME = 'Halvt nedsenkbar borerigg';

// Slampumper: 3 × triplex 2200 hk, 6½" foring, 12" slaglengde, 97 % volumetrisk virkningsgrad
export const PUMP = {
  count: 3,
  linerIn: 6.5,
  strokeIn: 12,
  eff: 0.97,
  litersPerStroke: 3 * Math.PI / 4 * (6.5 * 0.0254) ** 2 * (12 * 0.0254) * 0.97 * 1000,
  maxSpm: 125,
  maxPressure: 345,     // bar (5000 psi foringsgrense)
  popOff: 360,          // bar – sikkerhetsventil
  hydPowerKW: 1500,     // hydraulisk effekt per pumpe
};

export const TOP_DRIVE = { maxRpm: 220, maxTorque: 75, stallTorque: 68 }; // kN·m
export const BOP_RATING = 1034;        // bar (15 000 psi)
export const CHOKE_LINE = { idIn: 3.0, length: 380 };
export const RISER = { idIn: 19.5, odIn: 21 };
export const DAY_RATE_MNOK = 5.5;      // riggrate + tjenester per døgn

// Borerør og tunge rør (felles for alle seksjoner)
export const PIPE = {
  dp: { name: '5½" borerør (DP)', od: 5.5, id: 4.778, kgm: 37.0 },
  hwdp: { name: '5½" tunge borerør (HWDP)', od: 5.5, id: 3.25, kgm: 84.8, length: 110 },
};

// Formasjoner (nordlige Nordsjøen, Tampen-området). a1 = boreevne i Bourgoyne–Young-modellen,
// abras = slitasjefaktor for krona, gas = gassinnhold for gasslogging, perm = permeabel sone.
export const FORMATIONS = [
  { id: 'nordland', name: 'Nordland Gp', age: 'Kvartær–pliocen', lith: 'Leire og sand', top: SEABED, base: 1010, color: '#b9a77c', a1: 4.9, abras: 0.5, gas: 0.05 },
  { id: 'hordaland', name: 'Hordaland Gp', age: 'Eocen–miocen', lith: 'Leirstein', top: 1010, base: 1960, color: '#8e917b', a1: 4.6, abras: 0.6, gas: 0.08 },
  { id: 'rogaland', name: 'Rogaland Gp (Balder/Lista)', age: 'Paleocen', lith: 'Tuffholdig leirstein og sandstein', top: 1960, base: 2160, color: '#6f7e6b', a1: 4.1, abras: 0.9, gas: 0.12 },
  { id: 'shetland', name: 'Shetland Gp', age: 'Øvre kritt', lith: 'Kalkstein og mergel', top: 2160, base: 2520, color: '#d3cdb3', a1: 3.6, abras: 1.6, gas: 0.1 },
  { id: 'cromer', name: 'Cromer Knoll Gp', age: 'Nedre kritt', lith: 'Mergel og kalkholdig leirstein', top: 2520, base: 2790, color: '#a9a38a', a1: 3.9, abras: 1.0, gas: 0.2 },
  { id: 'draupne', name: 'Viking Gp – Draupne Fm', age: 'Øvre jura', lith: 'Organisk rik skifer (kildebergart)', top: 2790, base: 2885, color: '#3d3b37', a1: 4.1, abras: 0.8, gas: 0.9 },
  { id: 'tarbert', name: 'Brent Gp – Tarbert Fm', age: 'Midtre jura', lith: 'Sandstein, gassførende', top: 2885, base: 2925, color: '#e0b95e', a1: 4.5, abras: 1.3, gas: 9, perm: { fluid: 'gas', J: 2.8e-5 } },
  { id: 'ness', name: 'Brent Gp – Ness Fm', age: 'Midtre jura', lith: 'Skifer og kull (tetning)', top: 2925, base: 2965, color: '#6c5b44', a1: 4.2, abras: 0.9, gas: 1.2 },
  { id: 'etive', name: 'Brent Gp – Etive/Rannoch Fm', age: 'Midtre jura', lith: 'Sandstein, oljeførende', top: 2965, base: 3040, color: '#c8923c', a1: 4.4, abras: 1.3, gas: 3.5, perm: { fluid: 'oil', J: 1.6e-5, owc: 3015 } },
  { id: 'dunlin', name: 'Dunlin Gp', age: 'Nedre jura', lith: 'Skifer og siltstein', top: 3040, base: 3350, color: '#5f6a63', a1: 3.9, abras: 0.8, gas: 0.3 },
];

export function formationAt(z) {
  if (z < SEABED) return null;
  for (const f of FORMATIONS) if (z >= f.top && z < f.base) return f;
  return FORMATIONS[FORMATIONS.length - 1];
}

// Poretrykk (bar) – normalt hydrostatisk fra havflaten, overtrykk fra ca. 1500 m,
// separate trykk-kompartment i Tarbert (gass) og Etive (olje).
const OVER = [[1500, 0], [2000, 10], [2500, 35], [2790, 70], [2885, 116.3]];
function interp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}
export function porePressure(z) {
  const hydro = BAR_PER_M_SG * SEAWATER_SG * Math.max(z - RKB, 0);
  if (z < 2885) return hydro + (z > 1500 ? interp(OVER, z) : 0);
  if (z < 2925) return 405 + 0.025 * (z - 2885);           // gassgradient
  if (z < 2965) return 406 + (410 - 406) * (z - 2925) / 40; // Ness-skifer
  if (z < 3015) return 410 + 0.07 * (z - 2965);            // oljegradient
  if (z < 3040) return 413.5 + 0.101 * (z - 3015);         // vannsone
  return 416 + 0.10 * (z - 3040);
}
export const poreEMW = (z) => porePressure(z) / (BAR_PER_M_SG * Math.max(z, 1));

// Oppsprekkingsgradient (EMW, sg)
const FRAC = [[SEABED, 1.04], [460, 1.12], [1000, 1.45], [1900, 1.62], [2500, 1.72], [2800, 1.78], [3350, 1.86]];
export const fracEMW = (z) => interp(FRAC, z);
export const fracPressure = (z) => fracEMW(z) * BAR_PER_M_SG * z;

// Brønnprognosen i boreprogrammet undervurderer trykket i Tarbert (1.35 mot faktisk ≈ 1.43 sg)
export function prognosisPoreEMW(z) {
  if (z < 2790) return poreEMW(z);
  if (z < 2885) return 1.27 + (1.35 - 1.27) * (z - 2790) / 95;
  return 1.35;
}

// Temperatur (°C): 6 °C ved havbunnen, 3,8 °C/100 m under
export function temperatureAt(z) {
  if (z <= SEABED) return 6 + (15 - 6) * Math.max(0, (SEABED - z) / SEABED);
  return 6 + 0.038 * (z - SEABED);
}

// Seksjoner i foringsrørprogrammet
export const SECTIONS = [
  {
    id: 's36', hole: 36, riserless: true,
    title: '36" seksjon – lederør',
    casing: { name: '30" lederør (conductor)', od: 30, id: 28.0, shoe: 460 },
    bit: { name: '36" rullekrone (tricone)', type: 'tricone', size: 36, tfa: 1.767, wobMax: 15, rpmMax: 120, factor: 1.5 },
    bha: [{ name: '9½" vektrør (DC)', od: 9.5, id: 3.0, kgm: 323, length: 60 }],
    mud: { name: 'Sjøvann + bentonittpiller', sg: 1.03, pv: 1, yp: 0, type: 'SW' },
    flow: 4500, rpm: 80, wob: 8,
  },
  {
    id: 's26', hole: 26, riserless: true,
    title: '26" seksjon – overflateforingsrør',
    casing: { name: '20" overflateforingsrør', od: 20, id: 18.73, shoe: 1000 },
    bit: { name: '26" rullekrone (tricone)', type: 'tricone', size: 26, tfa: 1.485, wobMax: 20, rpmMax: 150, factor: 1.0 },
    bha: [{ name: '9½" vektrør (DC)', od: 9.5, id: 3.0, kgm: 323, length: 90 }],
    mud: { name: 'Sjøvann + bentonittpiller', sg: 1.03, pv: 1, yp: 0, type: 'SW' },
    flow: 4800, rpm: 120, wob: 12,
  },
  {
    id: 's17', hole: 17.5, riserless: false,
    title: '17½" seksjon – mellomforingsrør',
    casing: { name: '13⅜" mellomforingsrør', od: 13.375, id: 12.415, shoe: 1895 },
    bit: { name: '17½" PDC-krone', type: 'PDC', size: 17.5, tfa: 1.208, wobMax: 25, rpmMax: 180, factor: 0.25 },
    bha: [
      { name: 'RSS + MWD/LWD', od: 9.5, id: 3.0, kgm: 300, length: 25, tool: true },
      { name: '9½" vektrør (DC)', od: 9.5, id: 3.0, kgm: 323, length: 55 },
    ],
    mud: { name: 'Vannbasert slam (KCl/glykol)', sg: 1.20, pv: 16, yp: 22, type: 'WBM' },
    flow: 4200, rpm: 150, wob: 16,
  },
  {
    id: 's12', hole: 12.25, riserless: false,
    title: '12¼" seksjon – foringsrør',
    casing: { name: '9⅝" foringsrør', od: 9.625, id: 8.681, shoe: 2780 },
    bit: { name: '12¼" PDC-krone', type: 'PDC', size: 12.25, tfa: 0.902, wobMax: 22, rpmMax: 200, factor: 0 },
    bha: [
      { name: 'RSS + MWD/LWD', od: 8.25, id: 2.8, kgm: 230, length: 25, tool: true },
      { name: '8" vektrør (DC)', od: 8.0, id: 2.8125, kgm: 223, length: 80 },
    ],
    mud: { name: 'Oljebasert slam (OBM)', sg: 1.30, pv: 24, yp: 18, type: 'OBM' },
    flow: 3600, rpm: 140, wob: 15,
  },
  {
    id: 's8', hole: 8.5, riserless: false,
    title: '8½" seksjon – reservoar',
    casing: { name: '7" forlengningsrør (liner)', od: 7.0, id: 6.184, shoe: TD_PLAN },
    bit: { name: '8½" PDC-krone', type: 'PDC', size: 8.5, tfa: 0.552, wobMax: 14, rpmMax: 200, factor: -0.05 },
    bha: [
      { name: 'RSS + MWD/LWD', od: 6.75, id: 2.5, kgm: 150, length: 25, tool: true },
      { name: '6½" vektrør (DC)', od: 6.5, id: 2.8125, kgm: 135, length: 80 },
    ],
    mud: { name: 'Oljebasert slam (OBM)', sg: 1.40, pv: 28, yp: 17, type: 'OBM' },
    flow: 2100, rpm: 130, wob: 10,
  },
];

// Scenarier man kan starte fra
export const SCENARIOS = [
  { id: 'mid', section: 3, title: '12¼" seksjon', text: 'Start under 13⅜" skoen på 1895 m. Bor mot reservoaret, ta koblinger og sett 9⅝" foringsrør.', recommended: true },
  { id: 'res', section: 4, title: '8½" reservoarseksjon', text: 'Start rett under 9⅝" skoen på 2780 m med slamvekten fra boreprogrammet. Her møter du overtrykket i Brent.' },
  { id: 'spud', section: 0, title: 'Hele brønnen fra havbunnen', text: 'Spud brønnen på 377 m, bor uten stigerør, sett lederør og overflateforingsrør, kjør BOP og bor videre.' },
];

export const inch = (x) => x * 0.0254;
export const areaIn = (dIn) => Math.PI / 4 * inch(dIn) ** 2;
