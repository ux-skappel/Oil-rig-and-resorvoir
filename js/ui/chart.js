// Lett SVG-linjediagram med akser, rutenett, forklaring og trådkors med verktøytips.
// Farger og tekst hentes fra CSS-variabler slik at diagrammene følger temaet.
import { nf } from '../util/format.js';

const NS = 'http://www.w3.org/2000/svg';

export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max - min <= 0) return [min];
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) ticks.push(+v.toPrecision(12));
  return ticks;
}

function decimalsFor(ticks) {
  if (ticks.length < 2) return 0;
  const step = Math.abs(ticks[1] - ticks[0]);
  return Math.max(0, Math.min(6, -Math.floor(Math.log10(step) + 1e-9)));
}

function el(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

// opts: { series: [{name, color, points: [[x,y]], dashed, width}], xLabel, yLabel, xMin, xMax, yMin, yMax,
//         height, hover: 'x' | 'nearest', markers: [{x, y, label, color}], vlines: [{x, label}], hlines: [{y, label}],
//         xFmt, yFmt, legend }
export function renderLineChart(container, opts) {
  container.classList.add('chart');
  container.innerHTML = '';
  const series = opts.series.filter((s) => s.points && s.points.length);
  if (opts.legend !== false && series.length > 1) {
    const lg = document.createElement('div');
    lg.className = 'chart-legend';
    for (const s of series) {
      const item = document.createElement('span');
      item.className = 'chart-key';
      const sw = document.createElement('i');
      sw.style.background = s.color;
      if (s.dashed) sw.classList.add('dashed');
      item.appendChild(sw);
      item.appendChild(document.createTextNode(s.name));
      lg.appendChild(item);
    }
    container.appendChild(lg);
  }
  const wrap = document.createElement('div');
  wrap.className = 'chart-plot';
  container.appendChild(wrap);
  const W = Math.max(container.clientWidth || 320, 220);
  const H = opts.height || 220;
  const m = { l: 54, r: 14, t: 10, b: 40 };
  const pw = W - m.l - m.r, ph = H - m.t - m.b;
  let xs = [], ys = [];
  for (const s of series) for (const [x, y] of s.points) { if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); } }
  for (const mk of opts.markers || []) { xs.push(mk.x); ys.push(mk.y); }
  let xMin = opts.xMin ?? Math.min(...xs), xMax = opts.xMax ?? Math.max(...xs);
  let yMin = opts.yMin ?? Math.min(...ys), yMax = opts.yMax ?? Math.max(...ys);
  if (!Number.isFinite(xMin)) { xMin = 0; xMax = 1; }
  if (!Number.isFinite(yMin)) { yMin = 0; yMax = 1; }
  if (yMax === yMin) { yMax += Math.abs(yMax) * 0.1 || 1; yMin -= Math.abs(yMin) * 0.1 || 1; }
  if (xMax === xMin) { xMax += 1; xMin -= 1; }
  { const pad = (yMax - yMin) * 0.06; if (opts.yMin === undefined) yMin -= pad; if (opts.yMax === undefined) yMax += pad; }
  const xt = niceTicks(xMin, xMax, Math.max(3, Math.floor(pw / 80)));
  const yt = niceTicks(yMin, yMax, Math.max(3, Math.floor(ph / 45)));
  if (opts.xMin === undefined && xt.length) { xMin = Math.min(xMin, xt[0]); xMax = Math.max(xMax, xt[xt.length - 1]); }
  if (opts.yMin === undefined && yt.length) yMin = Math.min(yMin, yt[0]);
  if (opts.yMax === undefined && yt.length) yMax = Math.max(yMax, yt[yt.length - 1]);
  const sx = (x) => m.l + (x - xMin) / (xMax - xMin) * pw;
  const sy = (y) => m.t + ph - (y - yMin) / (yMax - yMin) * ph;
  const xd = decimalsFor(xt), yd = decimalsFor(yt);
  const xFmt = opts.xFmt || ((v) => nf(v, xd));
  const yFmt = opts.yFmt || ((v) => nf(v, yd));

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': opts.aria || opts.yLabel || 'Diagram' }, wrap);
  const grid = el('g', { class: 'grid' }, svg);
  for (const v of yt) {
    el('line', { x1: m.l, x2: m.l + pw, y1: sy(v), y2: sy(v) }, grid);
    const t = el('text', { x: m.l - 7, y: sy(v) + 4, 'text-anchor': 'end', class: 'tick' }, svg);
    t.textContent = yFmt(v);
  }
  for (const v of xt) {
    el('line', { y1: m.t, y2: m.t + ph, x1: sx(v), x2: sx(v) }, grid);
    const t = el('text', { x: sx(v), y: m.t + ph + 16, 'text-anchor': 'middle', class: 'tick' }, svg);
    t.textContent = xFmt(v);
  }
  el('line', { x1: m.l, x2: m.l + pw, y1: m.t + ph, y2: m.t + ph, class: 'axis' }, svg);
  el('line', { x1: m.l, x2: m.l, y1: m.t, y2: m.t + ph, class: 'axis' }, svg);
  if (opts.xLabel) { const t = el('text', { x: m.l + pw / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-label' }, svg); t.textContent = opts.xLabel; }
  if (opts.yLabel) {
    const t = el('text', { x: 12, y: m.t + ph / 2, 'text-anchor': 'middle', class: 'axis-label', transform: `rotate(-90 12 ${m.t + ph / 2})` }, svg);
    t.textContent = opts.yLabel;
  }
  const clipId = `clip${Math.random().toString(36).slice(2, 8)}`;
  const defs = el('defs', {}, svg);
  const cp = el('clipPath', { id: clipId }, defs);
  el('rect', { x: m.l, y: m.t, width: pw, height: ph }, cp);
  const plot = el('g', { 'clip-path': `url(#${clipId})` }, svg);
  for (const v of opts.vlines || []) {
    el('line', { x1: sx(v.x), x2: sx(v.x), y1: m.t, y2: m.t + ph, class: 'ref' }, plot);
    if (v.label) { const t = el('text', { x: sx(v.x) + 4, y: m.t + 12, class: 'ref-label' }, svg); t.textContent = v.label; }
  }
  for (const v of opts.hlines || []) {
    el('line', { x1: m.l, x2: m.l + pw, y1: sy(v.y), y2: sy(v.y), class: 'ref' }, plot);
    if (v.label) { const t = el('text', { x: m.l + pw - 4, y: sy(v.y) - 5, 'text-anchor': 'end', class: 'ref-label' }, svg); t.textContent = v.label; }
  }
  for (const s of series) {
    const pts = s.points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (s.area) {
      const d = `M${sx(pts[0][0])},${sy(Math.max(yMin, 0))} ` + pts.map(([x, y]) => `L${sx(x)},${sy(y)}`).join(' ') + ` L${sx(pts[pts.length - 1][0])},${sy(Math.max(yMin, 0))} Z`;
      el('path', { d, fill: s.color, 'fill-opacity': 0.1, stroke: 'none' }, plot);
    }
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(' ');
    el('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dashed ? '6 4' : 'none' }, plot);
  }
  for (const mk of opts.markers || []) {
    el('circle', { cx: sx(mk.x), cy: sy(mk.y), r: mk.r || 5, fill: mk.color || 'var(--ink)', stroke: 'var(--chart-surface)', 'stroke-width': 2 }, svg);
    if (mk.label) {
      const right = sx(mk.x) < m.l + pw * 0.7;
      const t = el('text', { x: sx(mk.x) + (right ? 9 : -9), y: sy(mk.y) - 8, 'text-anchor': right ? 'start' : 'end', class: 'mk-label' }, svg);
      t.textContent = mk.label;
    }
  }
  // Trådkors og verktøytips
  const cross = el('line', { y1: m.t, y2: m.t + ph, class: 'crosshair', visibility: 'hidden' }, svg);
  const dots = series.map((s) => el('circle', { r: 4, fill: s.color, stroke: 'var(--chart-surface)', 'stroke-width': 2, visibility: 'hidden' }, svg));
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  wrap.appendChild(tip);
  const hit = el('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent', tabindex: 0 }, svg);
  const interp = (pts, x) => {
    let best = null;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if ((x - x0) * (x - x1) <= 0 && x1 !== x0) {
        const y = y0 + (y1 - y0) * (x - x0) / (x1 - x0);
        if (best === null || Math.abs(y) > -Infinity) best = y;
        break;
      }
    }
    return best;
  };
  function show(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left) * (W / r.width);
    const py = (clientY - r.top) * (H / r.height);
    const x = xMin + (px - m.l) / pw * (xMax - xMin);
    tip.innerHTML = '';
    const rows = [];
    if (opts.hover === 'nearest') {
      let best = null;
      series.forEach((s, i) => s.points.forEach(([X, Y]) => {
        const d = Math.hypot(sx(X) - px, sy(Y) - py);
        if (!best || d < best.d) best = { d, s, i, X, Y };
      }));
      dots.forEach((d) => d.setAttribute('visibility', 'hidden'));
      cross.setAttribute('visibility', 'hidden');
      if (!best || best.d > 60) { tip.hidden = true; return; }
      dots[best.i].setAttribute('cx', sx(best.X)); dots[best.i].setAttribute('cy', sy(best.Y)); dots[best.i].setAttribute('visibility', 'visible');
      rows.push({ name: best.s.name, color: best.s.color, v: `${yFmt(best.Y)}`, x: xFmt(best.X) });
    } else {
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      series.forEach((s, i) => {
        const y = interp(s.points, x);
        if (y === null) { dots[i].setAttribute('visibility', 'hidden'); return; }
        dots[i].setAttribute('cx', px); dots[i].setAttribute('cy', sy(y)); dots[i].setAttribute('visibility', 'visible');
        rows.push({ name: s.name, color: s.color, v: (opts.tipFmt || yFmt)(y) });
      });
    }
    if (!rows.length) { tip.hidden = true; return; }
    const head = document.createElement('div');
    head.className = 'tip-head';
    head.textContent = `${opts.xLabel ? opts.xLabel.split(' (')[0] + ': ' : ''}${rows[0].x ?? xFmt(x)}`;
    tip.appendChild(head);
    for (const rw of rows) {
      const row = document.createElement('div');
      row.className = 'tip-row';
      const key = document.createElement('i');
      key.style.background = rw.color;
      const val = document.createElement('b');
      val.textContent = rw.v;
      const name = document.createElement('span');
      name.textContent = rw.name;
      row.append(key, val, name);
      tip.appendChild(row);
    }
    tip.hidden = false;
    const left = (clientX - r.left) + 14;
    tip.style.left = `${Math.min(left, r.width - tip.offsetWidth - 4)}px`;
    tip.style.top = `${Math.max(0, (clientY - r.top) - tip.offsetHeight - 10)}px`;
  }
  const hide = () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); };
  hit.addEventListener('pointermove', (e) => show(e.clientX, e.clientY));
  hit.addEventListener('pointerleave', hide);
  hit.addEventListener('focus', () => { const r = svg.getBoundingClientRect(); show(r.left + r.width / 2, r.top + r.height / 2); });
  hit.addEventListener('blur', hide);
  return { svg };
}

// Tabellvisning av dataserier (samme verdier som diagrammet)
export function renderTable(container, columns, rows) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const t = document.createElement('table');
  t.className = 'data';
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  for (const c of columns) { const th = document.createElement('th'); th.textContent = c.label; hr.appendChild(th); }
  thead.appendChild(hr);
  t.appendChild(thead);
  const tb = document.createElement('tbody');
  for (const r of rows) {
    const tr = document.createElement('tr');
    for (const c of columns) {
      const td = document.createElement('td');
      const v = r[c.key];
      td.textContent = c.fmt ? c.fmt(v, r) : v;
      if (!c.fmt && typeof v === 'string' && !/^[-−\d\s,.]+$/.test(v)) td.className = 'name';
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
  t.appendChild(tb);
  wrap.appendChild(t);
  container.appendChild(wrap);
}
