// Sanntidspaneler tegnet på canvas: brønnskjema, trykkvindu, borelogg, trender og drepeskjema.
import { FORMATIONS, SEABED, RKB, TD_PLAN, SECTIONS, poreEMW, fracEMW, prognosisPoreEMW } from './config.js';
import { nf } from '../util/format.js';

let C = null;
function colors() {
  if (C) return C;
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  C = {
    bg: v('--chart-surface'), grid: v('--grid'), axis: v('--axis'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'),
    s1: v('--s1'), s2: v('--s2'), s3: v('--s3'), s4: v('--s4'), s5: v('--s5'), s7: v('--s7'), s8: v('--s8'),
    good: v('--good'), warn: v('--warning'), serious: v('--serious'), crit: v('--critical'), accent: v('--accent'),
  };
  return C;
}

export function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

const FONT = '11px "JetBrains Mono", ui-monospace, monospace';
const FONT_S = '10px "JetBrains Mono", ui-monospace, monospace';
const LBL = '600 11px "Barlow Semi Condensed", "Arial Narrow", sans-serif';

function mudRgb(sg) {
  const t = Math.min(Math.max((sg - 1.0) / 1.0, 0), 1);
  const r = Math.round(184 - 90 * t), g = Math.round(148 - 84 * t), b = Math.round(102 - 60 * t);
  return `rgb(${r},${g},${b})`;
}

// ---------- Brønnskjema ----------
export function drawWellSchematic(canvas, sim, zoom = false) {
  const { ctx, w, h } = setupCanvas(canvas);
  const c = colors();
  const zMax = zoom ? Math.min(Math.max(sim.holeDepth + 120, 400), 3450) : Math.max(TD_PLAN + 100, sim.holeDepth + 60);
  const zMin = zoom ? Math.max(0, zMax - 520) : 0;
  const top = 14, bot = h - 16;
  const ys = (z) => top + (z - zMin) / (zMax - zMin) * (bot - top);
  const cx = Math.round(w * 0.36);
  const scale = (w * 0.34) / 36;              // piksler per tomme (diameter)
  const rx = (dIn) => dIn / 2 * scale;
  const clipTop = (z) => Math.max(z, zMin);
  // Formasjonskolonne
  const colX = Math.round(w * 0.72), colW = w - colX - 6;
  ctx.font = LBL;
  for (const f of FORMATIONS) {
    const y0 = ys(clipTop(f.top)), y1 = ys(Math.min(f.base, zMax));
    if (y1 <= top || y0 >= bot || f.base < zMin) continue;
    ctx.fillStyle = f.color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(colX, y0, colW, y1 - y0);
    ctx.globalAlpha = 1;
    if (y1 - y0 > 13) {
      ctx.fillStyle = f.id === 'draupne' || f.id === 'ness' || f.id === 'dunlin' ? '#f1f4f5' : '#141a1d';
      ctx.fillText(f.name.replace('Brent Gp – ', '').replace(' Gp', ''), colX + 4, Math.min(y0 + 12, y1 - 3), colW - 6);
    }
  }
  // Vann og havbunn
  const ySea = ys(Math.max(RKB, zMin)), ySb = ys(SEABED);
  if (SEABED > zMin) {
    ctx.fillStyle = 'rgba(40,110,150,0.25)';
    ctx.fillRect(4, ySea, colX - 10, ySb - ySea);
    ctx.fillStyle = 'rgba(40,110,150,0.55)';
    ctx.fillRect(colX, ySea, colW, ySb - ySea);
    ctx.strokeStyle = '#7d6a4a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(4, ySb); ctx.lineTo(colX + colW, ySb); ctx.stroke();
  }
  // Sement og foringsrør
  for (const cs of sim.casings) {
    const hole = SECTIONS[cs.section].hole;
    const toc = cs.section <= 1 ? cs.top : Math.max(cs.top, cs.shoe - 350);
    ctx.fillStyle = 'rgba(190,186,176,0.75)';
    for (const s of [-1, 1]) {
      const x0 = cx + s * rx(cs.od), x1 = cx + s * rx(hole);
      ctx.fillRect(Math.min(x0, x1), ys(clipTop(toc)), Math.abs(x1 - x0), ys(cs.shoe) - ys(clipTop(toc)));
    }
  }
  // Væske i ringrommet
  const innerAt = (z) => {
    let best = null;
    for (const cs of sim.casings) if (z >= cs.top && z <= cs.shoe && (best === null || cs.id < best)) best = cs.id;
    if (z < SEABED) return sim.bopInstalled ? 19.5 : null;
    return best ?? sim.section.hole;
  };
  const zTopWell = sim.bopInstalled ? 0 : SEABED;
  for (const g of sim.an) {
    if (g.zTop === undefined) continue;
    const z0 = Math.max(Math.min(g.zTop, g.zBot), zTopWell, zMin), z1 = Math.min(Math.max(g.zTop, g.zBot), zMax);
    if (z1 <= z0) continue;
    ctx.fillStyle = g.gas ? c.crit : g.oil ? '#3f8f3a' : sim.section.riserless ? 'rgba(60,140,180,0.8)' : mudRgb(g.sg);
    const steps = Math.max(1, Math.ceil((z1 - z0) / 25));
    for (let i = 0; i < steps; i++) {
      const a = z0 + (z1 - z0) * i / steps, b = z0 + (z1 - z0) * (i + 1) / steps;
      const D = innerAt((a + b) / 2);
      if (D === null) continue;
      ctx.fillRect(cx - rx(D), ys(a), 2 * rx(D), Math.max(ys(b) - ys(a), 1));
    }
  }
  if (sim.holeDepth > sim.bitDepth) {
    ctx.fillStyle = mudRgb(sim.pitSg);
    ctx.fillRect(cx - rx(sim.section.hole), ys(Math.max(sim.bitDepth, zMin)), 2 * rx(sim.section.hole), ys(sim.holeDepth) - ys(Math.max(sim.bitDepth, zMin)));
  }
  // Foringsrørvegger og sko
  ctx.fillStyle = '#9aa6ad';
  for (const cs of sim.casings) {
    const y0 = ys(clipTop(cs.top)), y1 = ys(cs.shoe);
    if (cs.shoe < zMin) continue;
    for (const s of [-1, 1]) ctx.fillRect(cx + s * rx(cs.od) - (s > 0 ? 2 : 0), y0, 2, y1 - y0);
    ctx.beginPath();
    for (const s of [-1, 1]) {
      const x = cx + s * rx(cs.od);
      ctx.moveTo(x, y1); ctx.lineTo(x + s * 6, y1); ctx.lineTo(x, y1 - 6); ctx.closePath();
    }
    ctx.fill();
    ctx.font = FONT_S;
    ctx.fillStyle = c.ink2;
    ctx.fillText(`${cs.name.split(' ')[0]} ${nf(cs.shoe, 0)} m`, 6, y1 - 3);
    ctx.fillStyle = '#9aa6ad';
  }
  // Stigerør og BOP
  if (sim.bopInstalled && zMin < SEABED) {
    ctx.fillStyle = '#7f8b91';
    for (const s of [-1, 1]) ctx.fillRect(cx + s * rx(21) - 1, ys(Math.max(RKB, zMin)), 2, ySb - ys(Math.max(RKB, zMin)) - 10);
    ctx.fillStyle = sim.bopClosed ? c.crit : '#d7a51f';
    ctx.fillRect(cx - rx(21) - 7, ySb - 12, 2 * rx(21) + 14, 11);
  }
  // Åpent hull
  if (sim.holeDepth > sim.lastShoe) {
    ctx.strokeStyle = '#8a6d4a'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const s of [-1, 1]) { ctx.moveTo(cx + s * rx(sim.section.hole), ys(Math.max(sim.lastShoe, zMin))); ctx.lineTo(cx + s * rx(sim.section.hole), ys(sim.holeDepth)); }
    ctx.moveTo(cx - rx(sim.section.hole), ys(sim.holeDepth)); ctx.lineTo(cx + rx(sim.section.hole), ys(sim.holeDepth));
    ctx.stroke();
  }
  // Borestreng
  for (const s of sim.geom.secs) {
    if (s.bot < zMin) continue;
    ctx.fillStyle = s.tool ? '#c96f2a' : '#c3cbd0';
    ctx.fillRect(cx - rx(s.od), ys(Math.max(s.top, zMin)), 2 * rx(s.od), ys(s.bot) - ys(Math.max(s.top, zMin)));
  }
  // Krone
  const yb = ys(sim.bitDepth), br = rx(sim.section.hole) * 0.95;
  ctx.fillStyle = c.accent;
  ctx.beginPath(); ctx.moveTo(cx - br, yb - 5); ctx.lineTo(cx + br, yb - 5); ctx.lineTo(cx, yb + 2); ctx.closePath(); ctx.fill();
  // Dybdeskala
  ctx.font = FONT_S;
  ctx.fillStyle = c.ink3;
  const step = zoom ? 100 : 500;
  for (let z = Math.ceil(zMin / step) * step; z <= zMax; z += step) {
    const y = ys(z);
    ctx.fillRect(colX - 4, y, 4, 1);
    ctx.fillText(nf(z, 0), colX - 34, y + 3);
  }
  ctx.fillStyle = c.ink;
  ctx.font = FONT;
  ctx.fillText(`${nf(sim.holeDepth, 1)} m`, cx + br + 8, ys(sim.holeDepth) + 4);
}

// ---------- Trykkvindu (EMW mot dybde) ----------
export function drawPressureWindow(canvas, sim, showTruth) {
  const { ctx, w, h } = setupCanvas(canvas);
  const c = colors();
  const m = { l: 44, r: 12, t: 22, b: 30 };
  const x0 = 0.9, x1 = 2.0;
  const zMax = Math.max(TD_PLAN + 100, sim.holeDepth + 50);
  const zMin = SEABED - 20;
  const sx = (v) => m.l + (v - x0) / (x1 - x0) * (w - m.l - m.r);
  const sy = (z) => m.t + (z - zMin) / (zMax - zMin) * (h - m.t - m.b);
  ctx.strokeStyle = c.grid; ctx.lineWidth = 1;
  ctx.font = FONT_S; ctx.fillStyle = c.ink3;
  for (let v = 1.0; v <= 2.0001; v += 0.2) {
    ctx.beginPath(); ctx.moveTo(sx(v), m.t); ctx.lineTo(sx(v), h - m.b); ctx.stroke();
    ctx.fillText(nf(v, 1), sx(v) - 9, h - m.b + 14);
  }
  for (let z = 500; z <= zMax; z += 500) {
    ctx.beginPath(); ctx.moveTo(m.l, sy(z)); ctx.lineTo(w - m.r, sy(z)); ctx.stroke();
    ctx.fillText(nf(z, 0), 4, sy(z) + 3);
  }
  ctx.fillStyle = c.ink2; ctx.font = LBL;
  ctx.fillText('EKVIVALENT SLAMVEKT (sg)', m.l, h - 4);
  const curve = (fn, color, dash, width = 2) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath();
    let first = true;
    for (let z = SEABED + 5; z <= zMax; z += 10) {
      const x = sx(fn(z)), y = sy(z);
      if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);
  };
  // Slamvindu mellom poretrykk (prognose) og oppsprekking
  curve(fracEMW, c.s8);
  curve(prognosisPoreEMW, c.s1, [6, 4]);
  if (showTruth) curve(poreEMW, c.s5, [], 1.5);
  // Slamvekt og ECD
  const zNow = sim.bitDepth;
  ctx.strokeStyle = c.s4; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx(sim.pitSg), sy(SEABED)); ctx.lineTo(sx(sim.pitSg), sy(sim.holeDepth)); ctx.stroke();
  ctx.fillStyle = c.s3;
  ctx.beginPath(); ctx.arc(sx(sim.ecdBit), sy(zNow), 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = c.bg; ctx.lineWidth = 2; ctx.stroke();
  // Skoer med FIT
  for (const cs of sim.casings) {
    const y = sy(cs.shoe);
    ctx.fillStyle = c.ink2;
    ctx.beginPath(); ctx.moveTo(m.l, y); ctx.lineTo(m.l + 8, y); ctx.lineTo(m.l, y - 7); ctx.closePath(); ctx.fill();
  }
  const lot = sim.lotEMW;
  ctx.fillStyle = c.s8;
  ctx.beginPath(); ctx.arc(sx(lot), sy(sim.lastShoe), 4, 0, Math.PI * 2); ctx.fill();
  // Forklaring
  const items = [[c.s1, 'Poretrykk (prognose)', true], [c.s8, 'Oppsprekking', false], [c.s4, 'Slamvekt', false], [c.s3, 'ECD ved krona', false]];
  if (showTruth) items.push([c.s5, 'Faktisk poretrykk', false]);
  ctx.font = FONT_S;
  let lx = m.l, ly = 12;
  for (const [col, label, dashed] of items) {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(dashed ? [4, 3] : []);
    ctx.beginPath(); ctx.moveTo(lx, ly - 3); ctx.lineTo(lx + 14, ly - 3); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = c.ink2;
    ctx.fillText(label, lx + 18, ly);
    lx += ctx.measureText(label).width + 30;
    if (lx > w - 90) { lx = m.l; ly += 13; }
  }
}

// ---------- Borelogg ----------
export function drawDepthLog(canvas, sim) {
  const { ctx, w, h } = setupCanvas(canvas);
  const c = colors();
  const log = sim.depthLog;
  const zBot = Math.max(sim.holeDepth, 50);
  const zTop = zBot - 260;
  const head = 26, depthW = 38;
  const tracks = [
    { key: 'gr', name: 'GR (API)', min: 0, max: 200, color: c.s3, lith: true },
    { key: 'rop', name: 'ROP (m/h)', min: 0, max: 60, color: c.s1 },
    { key: 'dc', name: 'dc-eksp.', min: 0.6, max: 2.2, color: c.s4, dots: true },
    { key: 'gas', name: 'Gass (%)', min: 0, max: 10, color: c.s8 },
    { key: 'rt', name: 'Res. (Ω·m)', min: 0.2, max: 200, color: c.s7, log: true },
  ];
  const tw = (w - depthW) / tracks.length;
  const sy = (z) => head + (z - zTop) / (zBot - zTop) * (h - head - 4);
  ctx.font = FONT_S;
  for (let z = Math.ceil(zTop / 20) * 20; z <= zBot; z += 20) {
    ctx.fillStyle = c.ink3;
    if (z % 100 === 0) ctx.fillText(nf(z, 0), 2, sy(z) + 3);
    ctx.fillStyle = c.grid;
    ctx.fillRect(depthW, sy(z), w - depthW, 1);
  }
  tracks.forEach((t, i) => {
    const x0 = depthW + i * tw;
    ctx.fillStyle = c.grid; ctx.fillRect(x0, head, 1, h - head);
    ctx.fillStyle = c.ink2; ctx.font = LBL;
    ctx.fillText(t.name, x0 + 4, 11);
    ctx.font = FONT_S; ctx.fillStyle = c.ink3;
    ctx.fillText(`${t.min}–${t.max}`, x0 + 4, 22);
    const sx = (v) => {
      const f = t.log ? (Math.log10(Math.max(v, t.min)) - Math.log10(t.min)) / (Math.log10(t.max) - Math.log10(t.min)) : (v - t.min) / (t.max - t.min);
      return x0 + 2 + Math.min(Math.max(f, 0), 1) * (tw - 4);
    };
    const pts = log.filter((p) => p.z >= zTop && p.z <= zBot && p[t.key] !== null && p[t.key] !== undefined);
    if (t.lith) {
      for (const p of pts) {
        const f = FORMATIONS.find((q) => q.id === p.fid);
        ctx.fillStyle = f ? f.color : '#777';
        ctx.globalAlpha = 0.35;
        ctx.fillRect(x0 + 1, sy(p.z) - 1, sx(p[t.key]) - x0, 2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.strokeStyle = t.color; ctx.lineWidth = 1.5;
    if (t.dots) {
      ctx.fillStyle = t.color;
      for (const p of pts) ctx.fillRect(sx(p[t.key]) - 1.5, sy(p.z) - 1.5, 3, 3);
    } else {
      ctx.beginPath();
      pts.forEach((p, k) => { const x = sx(p[t.key]), y = sy(p.z); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
  });
  ctx.strokeStyle = c.accent; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(depthW, sy(sim.holeDepth)); ctx.lineTo(w, sy(sim.holeDepth)); ctx.stroke();
}

// ---------- Trender (siste 60 minutter) ----------
export function drawTrends(canvas, sim) {
  const { ctx, w, h } = setupCanvas(canvas);
  const c = colors();
  const tEnd = sim.t, tStart = tEnd - 3600;
  const data = sim.series.filter((p) => p.t >= tStart);
  const rows = [
    { name: 'Tankøkning (m³)', keys: [['pitGain', c.s1]], min: -2, max: 4, zero: true },
    { name: 'Rate inn / ut (L/min)', keys: [['flowIn', c.s3], ['flowOut', c.s2]], min: 0, max: null },
    { name: 'Pumpetrykk (bar)', keys: [['spp', c.s4]], min: 0, max: null },
    { name: 'Krokvekt (t)', keys: [['hookload', c.s7]], min: null, max: null },
    { name: 'Gass (%)', keys: [['gas', c.s8]], min: 0, max: null },
  ];
  const rh = h / rows.length;
  rows.forEach((r, i) => {
    const y0 = i * rh + 14, y1 = (i + 1) * rh - 6;
    ctx.fillStyle = c.ink2; ctx.font = LBL;
    ctx.fillText(r.name, 4, i * rh + 11);
    let mn = r.min, mx = r.max;
    const vals = [];
    for (const p of data) for (const [k] of r.keys) if (p[k] !== null && p[k] !== undefined) vals.push(p[k]);
    if (mn === null) mn = vals.length ? Math.min(...vals) : 0;
    if (mx === null) mx = vals.length ? Math.max(...vals) : 1;
    if (r.zero) { mn = Math.min(mn, ...vals, -0.5); mx = Math.max(mx, ...vals, 1); }
    if (mx - mn < 1e-6) { mx = mn + 1; }
    const pad = (mx - mn) * 0.1; mn -= pad; mx += pad;
    const sx = (t) => 4 + (t - tStart) / 3600 * (w - 60);
    const sy = (v) => y1 - (v - mn) / (mx - mn) * (y1 - y0);
    ctx.fillStyle = c.grid;
    ctx.fillRect(4, y1, w - 60, 1);
    if (r.zero && mn < 0 && mx > 0) ctx.fillRect(4, sy(0), w - 60, 1);
    for (const [k, col] of r.keys) {
      ctx.strokeStyle = col; ctx.lineWidth = 1.6;
      ctx.beginPath();
      let first = true;
      for (const p of data) {
        if (p[k] === null || p[k] === undefined) continue;
        const x = sx(p.t), y = sy(p[k]);
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const last = data[data.length - 1];
    if (last) {
      ctx.font = FONT_S; ctx.fillStyle = c.ink;
      const v = last[r.keys[0][0]];
      ctx.fillText(v === null || v === undefined ? '–' : nf(v, Math.abs(v) < 20 ? 1 : 0), w - 52, sy(v ?? 0) + 3);
    }
  });
}

// ---------- Drepeskjema: borerørstrykk mot slag ----------
export function drawKillChart(canvas, sim) {
  const { ctx, w, h } = setupCanvas(canvas);
  const c = colors();
  const k = sim.kill;
  const sched = sim.killSchedule();
  const trace = k ? k.trace : [];
  const sMax = Math.max(sched[sched.length - 1].s, ...trace.map((p) => p.s), 100);
  const pMax = Math.max(...sched.map((p) => p.p), ...trace.map((p) => Math.max(p.dpp, p.cp)), 10) * 1.15;
  const m = { l: 40, r: 10, t: 30, b: 36 };
  const sx = (s) => m.l + s / sMax * (w - m.l - m.r);
  const sy = (p) => h - m.b - p / pMax * (h - m.t - m.b);
  ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.font = FONT_S; ctx.fillStyle = c.ink3;
  const pStep = pMax > 150 ? 50 : pMax > 60 ? 20 : 10;
  for (let p = 0; p <= pMax; p += pStep) { ctx.beginPath(); ctx.moveTo(m.l, sy(p)); ctx.lineTo(w - m.r, sy(p)); ctx.stroke(); ctx.fillText(nf(p, 0), 6, sy(p) + 3); }
  const sStep = sMax > 4000 ? 1000 : 500;
  for (let s = 0; s <= sMax; s += sStep) ctx.fillText(nf(s, 0), sx(s) - 10, h - 20);
  ctx.fillStyle = c.ink2; ctx.font = LBL;
  ctx.textAlign = 'center'; ctx.fillText('SLAG PUMPET', m.l + (w - m.l - m.r) / 2, h - 4); ctx.textAlign = 'left';
  ctx.strokeStyle = c.s1; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
  ctx.beginPath(); sched.forEach((p, i) => (i ? ctx.lineTo(sx(p.s), sy(p.p)) : ctx.moveTo(sx(p.s), sy(p.p)))); ctx.stroke(); ctx.setLineDash([]);
  if (trace.length) {
    ctx.strokeStyle = c.s4; ctx.lineWidth = 2;
    ctx.beginPath(); trace.forEach((p, i) => (i ? ctx.lineTo(sx(p.s), sy(p.dpp)) : ctx.moveTo(sx(p.s), sy(p.dpp)))); ctx.stroke();
    ctx.strokeStyle = c.s8;
    ctx.beginPath(); trace.forEach((p, i) => (i ? ctx.lineTo(sx(p.s), sy(p.cp)) : ctx.moveTo(sx(p.s), sy(p.cp)))); ctx.stroke();
  }
  const items = [[c.s1, 'Planlagt borerørstrykk', true], [c.s4, 'Borerørstrykk', false], [c.s8, 'Chokettrykk', false]];
  let lx = m.l, ly = 10;
  ctx.font = FONT_S;
  for (const [col, lab, d] of items) {
    const wLab = ctx.measureText(lab).width + 30;
    if (lx + wLab > w - 4 && lx > m.l) { lx = m.l; ly += 13; }
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash(d ? [4, 3] : []);
    ctx.beginPath(); ctx.moveTo(lx, ly - 3); ctx.lineTo(lx + 14, ly - 3); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = c.ink2; ctx.fillText(lab, lx + 18, ly);
    lx += wLab;
  }
}

// Sparkline for instrumentfelt
export function drawSpark(canvas, values, color) {
  const { ctx, w, h } = setupCanvas(canvas);
  const v = values.filter((x) => x !== null && Number.isFinite(x));
  if (v.length < 2) return;
  let mn = Math.min(...v), mx = Math.max(...v);
  const minSpan = Math.max(Math.abs(mx), Math.abs(mn), 1) * 0.08;
  if (mx - mn < minSpan) { const c = (mx + mn) / 2; mx = c + minSpan / 2; mn = c - minSpan / 2; }
  ctx.strokeStyle = color; ctx.lineWidth = 1.4;
  ctx.beginPath();
  v.forEach((x, i) => {
    const px = i / (v.length - 1) * (w - 2) + 1, py = h - 2 - (x - mn) / (mx - mn) * (h - 4);
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  });
  ctx.stroke();
}
