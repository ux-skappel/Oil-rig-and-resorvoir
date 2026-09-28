// Brønngeometri og væskesøyler (plugg-strøm-modell).
// Borestrengen (ds) og ringrommet (an) er lister av segmenter {v [m³], sg} eller gass {v, gas:true, n [kmol]}.
// ds[0] ligger ved overflaten; an[0] ligger ved krona.

import { SEABED, PIPE, RISER, CHOKE_LINE, STEEL_SG, inch } from './config.js';

export const areaFromIn = (dIn) => Math.PI / 4 * inch(dIn) ** 2;

// Strengseksjoner fra krona og opp: BHA → HWDP → DP
export function stringSections(section, bitDepth) {
  const secs = [];
  let z = bitDepth;
  const push = (c, len) => {
    const top = Math.max(0, z - len);
    if (z - top > 1e-6) secs.push({ name: c.name, top, bot: z, od: c.od, id: c.id, kgm: c.kgm, tool: !!c.tool });
    z = top;
  };
  for (const c of section.bha) push(c, c.length);
  push(PIPE.hwdp, PIPE.hwdp.length);
  if (z > 0) push(PIPE.dp, z);
  return secs;
}

export function stringOdAt(secs, z) {
  for (const s of secs) if (z >= s.top && z <= s.bot) return s.od;
  return 0;
}

// Innvendig diameter (tommer) for hull, foringsrør, stigerør eller chokelinje ved dybde z
export function holeIdAt(z, casings, bitSizeIn, opts) {
  if (z < SEABED) {
    if (!opts.bopInstalled) return null;
    return opts.bopClosed ? CHOKE_LINE.idIn : RISER.idIn;
  }
  let best = null;
  for (const c of casings) {
    if (z >= c.top && z <= c.shoe && (best === null || c.id < best)) best = c.id;
  }
  return best ?? bitSizeIn;
}

// Ringromsstykker fra krona og opp til toppen (overflate eller havbunn uten stigerør)
export function annulusPieces(secs, bitDepth, casings, bitSizeIn, opts) {
  const zTop = opts.bopInstalled ? 0 : SEABED;
  const pts = new Set([zTop, bitDepth]);
  for (const s of secs) { if (s.top > zTop && s.top < bitDepth) pts.add(s.top); }
  for (const c of casings) {
    for (const v of [c.top, c.shoe]) if (v > zTop && v < bitDepth) pts.add(v);
  }
  if (SEABED > zTop && SEABED < bitDepth) pts.add(SEABED);
  const arr = [...pts].sort((a, b) => b - a);   // fra bunn og opp
  const pieces = [];
  for (let i = 0; i < arr.length - 1; i++) {
    const bot = arr[i], top = arr[i + 1];
    const mid = 0.5 * (top + bot);
    const D = holeIdAt(mid, casings, bitSizeIn, opts);
    if (D === null) continue;
    const chokeLine = mid < SEABED && opts.bopClosed;
    const od = chokeLine ? 0 : stringOdAt(secs, mid);
    const area = Math.max(Math.PI / 4 * (inch(D) ** 2 - inch(od) ** 2), 1e-4);
    pieces.push({ top, bot, D, od, area, chokeLine, len: bot - top, vol: area * (bot - top) });
  }
  return pieces;
}

export function stringVolumes(secs) {
  let inner = 0, steel = 0;
  for (const s of secs) {
    const L = s.bot - s.top;
    inner += areaFromIn(s.id) * L;
    steel += s.kgm / (STEEL_SG * 1000) * L;
  }
  return { inner, steel };
}

// Dybde der et gitt volum (målt fra krona og opp) er nådd i ringrommet
export function annDepthAtVolume(pieces, v) {
  let acc = 0;
  for (const p of pieces) {
    if (acc + p.vol >= v) return p.bot - (v - acc) / p.area;
    acc += p.vol;
  }
  const last = pieces[pieces.length - 1];
  return last ? last.top : 0;
}

// Dybde der et gitt volum (målt fra overflaten og ned) er nådd i strengen
export function stringDepthAtVolume(secs, v) {
  let acc = 0;
  for (let i = secs.length - 1; i >= 0; i--) {
    const s = secs[i];
    const a = areaFromIn(s.id);
    const vol = a * (s.bot - s.top);
    if (acc + vol >= v) return s.top + (v - acc) / a;
    acc += vol;
  }
  return secs.length ? secs[0].bot : 0;
}

export function areaAtDepth(pieces, z) {
  for (const p of pieces) if (z <= p.bot && z >= p.top) return p.area;
  return pieces.length ? pieces[pieces.length - 1].area : 0.05;
}

// ---- Segmentlister ----
export function totalVol(segs) {
  let s = 0;
  for (const g of segs) s += g.v;
  return s;
}

export function mergeSegs(segs, maxN = 48) {
  const out = [];
  for (const g of segs) {
    if (g.v <= 1e-9) continue;
    const last = out[out.length - 1];
    if (last && !last.gas && !g.gas && Math.abs(last.sg - g.sg) < 1e-4 && (last.oil === g.oil)) {
      last.v += g.v;
    } else if (last && last.gas && g.gas) {
      last.v += g.v; last.n += g.n;
    } else {
      out.push({ ...g });
    }
  }
  // Komprimer: slå sammen de minste nabo-væskesegmentene til listen er kort nok
  while (out.length > maxN) {
    let best = -1, bestV = Infinity;
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      if (a.gas || b.gas) continue;
      const v = a.v + b.v;
      if (v < bestV) { bestV = v; best = i; }
    }
    if (best < 0) break;
    const a = out[best], b = out[best + 1];
    const v = a.v + b.v;
    out.splice(best, 2, { v, sg: (a.sg * a.v + b.sg * b.v) / v, oil: a.oil && b.oil });
  }
  return out;
}

// Fjern volum V fra enden av en liste (returnerer det som ble fjernet)
export function removeFromEnd(segs, V) {
  const removed = { liq: 0, liqMass: 0, gasV: 0, gasN: 0, oil: 0 };
  let left = V;
  while (left > 1e-12 && segs.length) {
    const g = segs[segs.length - 1];
    const take = Math.min(g.v, left);
    if (g.gas) {
      const frac = take / g.v;
      removed.gasV += take;
      removed.gasN += g.n * frac;
      g.n -= g.n * frac;
    } else {
      removed.liq += take;
      removed.liqMass += take * g.sg;
      if (g.oil) removed.oil += take;
    }
    g.v -= take;
    left -= take;
    if (g.v <= 1e-12) segs.pop();
  }
  return removed;
}

export function removeFromStart(segs, V) {
  const removed = [];
  let left = V;
  while (left > 1e-12 && segs.length) {
    const g = segs[0];
    const take = Math.min(g.v, left);
    if (g.gas) {
      const frac = take / g.v;
      removed.push({ v: take, gas: true, n: g.n * frac });
      g.n -= g.n * frac;
    } else {
      removed.push({ v: take, sg: g.sg, oil: g.oil });
    }
    g.v -= take;
    left -= take;
    if (g.v <= 1e-12) segs.shift();
  }
  return removed;
}

export function sgAtStringBottom(ds) {
  const g = ds[ds.length - 1];
  return g ? g.sg : 1;
}
