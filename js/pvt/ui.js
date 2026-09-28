// PVT-lab: inndata, beregninger og visning av korrelasjoner, EOS og volumberegning.
import { blackOilTable, CORR, comparePb } from './blackoil.js';
import { gasProps, Z_METHODS, PPC_METHODS, pseudoCritical } from './gas.js';
import { waterTable } from './water.js';
import { buildFluid, saturationAt, envelopeSummary, classifyFluid } from './eos.js';
import { FLUID_PRESETS, COMPONENT_ORDER, COMPONENTS } from './components.js';
import { simulateCCE, simulateDL, simulateSeparator } from './lab.js';
import { EQUATIONS } from './equations.js';
import { renderLineChart, renderTable } from '../ui/chart.js';
import { nf, sig } from '../util/format.js';

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const S = () => ({ s1: css('--s1'), s2: css('--s2'), s3: css('--s3'), s4: css('--s4'), s5: css('--s5'), s7: css('--s7'), s8: css('--s8'), accent: css('--accent'), ink: css('--ink') });

const DEFAULTS = {
  api: 36, gg: 0.75, T_C: 104, P_res: 411, known: 'rs', Rsb_sm3: 150, Pb_bar: 238,
  sepP_bar: 7.9, sepT_C: 30, salinity: 35000, yN2: 0.5, yCO2: 1.5, yH2S: 0,
  pb: 'glaso', bo: 'glaso', muDead: 'beggs', muLive: 'beggs', muUnder: 'vasquez', co: 'vasquez',
  zMethod: 'dak', ppcMethod: 'sutton',
  // Volumberegning
  area: 14, h: 55, ntg: 0.82, phi: 0.24, sw: 0.22, rf: 0.45,
};

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function numField(label, id, value, unit, step = 'any') {
  const w = el('label', 'field');
  const t = el('span');
  t.append(document.createTextNode(label));
  if (unit) t.appendChild(el('span', 'unit', unit));
  const i = document.createElement('input');
  i.type = 'number'; i.id = id; i.value = value; i.step = step; i.inputMode = 'decimal';
  w.append(t, i);
  return w;
}

function selField(label, id, options, value) {
  const w = el('label', 'field sel-field');
  w.append(el('span', null, label));
  const s = document.createElement('select');
  s.id = id;
  for (const [k, v] of Object.entries(options)) {
    const o = document.createElement('option');
    o.value = k; o.textContent = v;
    if (k === value) o.selected = true;
    s.appendChild(o);
  }
  w.appendChild(s);
  return w;
}

function stat(label, value, unit, desc) {
  const d = el('div', 'stat');
  d.appendChild(el('div', 'eyebrow', label));
  const v = el('div', 'v', value);
  if (unit) v.appendChild(el('small', null, unit));
  d.appendChild(v);
  if (desc) d.appendChild(el('div', 'd', desc));
  return d;
}

function card(title, sub) {
  const c = el('div', 'card');
  c.appendChild(el('h3', null, title));
  if (sub) c.appendChild(el('div', 'sub', sub));
  const body = el('div');
  c.appendChild(body);
  return { c, body };
}

function tableDetails(parent, columns, rows, label = 'Vis tabell') {
  const d = document.createElement('details');
  d.className = 'tbl';
  const s = document.createElement('summary');
  s.textContent = label;
  d.appendChild(s);
  const holder = el('div');
  d.appendChild(holder);
  d.addEventListener('toggle', () => { if (d.open && !holder.firstChild) renderTable(holder, columns, rows); });
  parent.appendChild(d);
}

let mjPromise = null;
function loadMathJax() {
  if (window.MathJax && window.MathJax.typesetPromise) return Promise.resolve();
  if (mjPromise) return mjPromise;
  window.MathJax = { tex: { inlineMath: [['\\(', '\\)']] }, svg: { fontCache: 'global' }, startup: { typeset: false } };
  mjPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js';
    s.async = true;
    s.onload = () => (window.MathJax.startup && window.MathJax.startup.promise ? window.MathJax.startup.promise.then(res) : res());
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return mjPromise;
}

export function createPvtUI(root) {
  const st = { ...DEFAULTS };
  root.innerHTML = '';
  // ---------- Inndata ----------
  const inputs = el('aside', 'pvt-inputs');
  inputs.setAttribute('aria-label', 'PVT-inndata');
  inputs.appendChild(el('h2', null, 'Prøvedata'));
  inputs.appendChild(el('div', 'sample', 'Brønn 35/13-1 · Etive Fm · 2990 m RKB · separatorprøve'));
  const g1 = el('div', 'group');
  g1.appendChild(el('div', 'eyebrow', 'Reservoar og olje'));
  g1.append(
    numField('Reservoartrykk', 'pv-pres', st.P_res, 'bar', '1'),
    numField('Reservoartemperatur', 'pv-tres', st.T_C, '°C', '1'),
    numField('Oljetetthet', 'pv-api', st.api, '°API', '0.5'),
    numField('Gassens spesifikke vekt', 'pv-gg', st.gg, 'luft = 1', '0.01'),
    selField('Kjent verdi', 'pv-known', { rs: 'Løst gass ved Pb (Rsb)', pb: 'Boblepunktstrykk (Pb)' }, st.known),
    numField('Rsb', 'pv-rsb', st.Rsb_sm3, 'Sm³/Sm³', '1'),
    numField('Pb', 'pv-pb', st.Pb_bar, 'bar', '1'),
    numField('Separatortrykk', 'pv-psep', st.sepP_bar, 'bar', '0.1'),
    numField('Separatortemperatur', 'pv-tsep', st.sepT_C, '°C', '1'),
  );
  inputs.appendChild(g1);
  const g2 = el('div', 'group');
  g2.appendChild(el('div', 'eyebrow', 'Korrelasjoner'));
  g2.append(
    selField('Pb og Rs', 'pv-c-pb', CORR.pb, st.pb),
    selField('Bo', 'pv-c-bo', CORR.bo, st.bo),
    selField('Død olje μod', 'pv-c-mud', CORR.muDead, st.muDead),
    selField('Levende olje μo', 'pv-c-mul', CORR.muLive, st.muLive),
    selField('Undermettet μo', 'pv-c-muu', CORR.muUnder, st.muUnder),
    selField('Undermettet co', 'pv-c-co', CORR.co, st.co),
  );
  inputs.appendChild(g2);
  const g3 = el('div', 'group');
  g3.appendChild(el('div', 'eyebrow', 'Gass og vann'));
  g3.append(
    selField('Z-faktor', 'pv-z', Object.fromEntries(Object.entries(Z_METHODS).map(([k, v]) => [k, v.name])), st.zMethod),
    selField('Pseudokritiske egenskaper', 'pv-ppc', PPC_METHODS, st.ppcMethod),
    numField('N₂', 'pv-n2', st.yN2, 'mol-%', '0.1'),
    numField('CO₂', 'pv-co2', st.yCO2, 'mol-%', '0.1'),
    numField('H₂S', 'pv-h2s', st.yH2S, 'mol-%', '0.1'),
    numField('Saltinnhold', 'pv-sal', st.salinity, 'ppm NaCl', '1000'),
  );
  inputs.appendChild(g3);
  inputs.appendChild(el('p', 'hint', 'Standardbetingelser er 15 °C og 1,01325 bar. Korrelasjonene er publisert i feltenheter, og omregningen til SI skjer automatisk.'));
  root.appendChild(inputs);

  // ---------- Hovedområde ----------
  const main = el('div', 'pvt-main');
  const head = el('div', 'pvt-head');
  const ht = el('div');
  ht.appendChild(el('div', 'eyebrow', 'PVT-laboratorium'));
  ht.appendChild(el('h2', null, 'Reservoarvæsken fra Brent'));
  head.appendChild(ht);
  const badge = el('span', 'fluidtype', '');
  head.appendChild(badge);
  main.appendChild(head);
  const stats = el('div', 'stats');
  main.appendChild(stats);
  const tabs = el('div', 'subtabs');
  tabs.setAttribute('role', 'tablist');
  const TABS = [['oil', 'Olje'], ['gas', 'Gass'], ['water', 'Vann'], ['eos', 'EOS: Peng–Robinson'], ['vol', 'Volumberegning'], ['eq', 'Likninger']];
  const panes = {};
  for (const [k, label] of TABS) {
    const b = el('button', null, label);
    b.setAttribute('role', 'tab');
    b.dataset.k = k;
    b.setAttribute('aria-selected', k === 'oil' ? 'true' : 'false');
    tabs.appendChild(b);
    const p = el('div', 'pane-pvt');
    p.hidden = k !== 'oil';
    panes[k] = p;
  }
  main.appendChild(tabs);
  for (const [k] of TABS) main.appendChild(panes[k]);
  root.appendChild(main);

  let active = 'oil';
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    active = b.dataset.k;
    for (const x of tabs.children) x.setAttribute('aria-selected', x === b ? 'true' : 'false');
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== active;
    renderActive();
  });

  // ---------- Lesing av inndata ----------
  const num = (id, def) => { const v = parseFloat(String(document.getElementById(id).value).replace(',', '.')); return Number.isFinite(v) ? v : def; };
  function readInputs() {
    st.P_res = Math.max(num('pv-pres', st.P_res), 2);
    st.T_C = num('pv-tres', st.T_C);
    st.api = Math.min(Math.max(num('pv-api', st.api), 10), 60);
    st.gg = Math.min(Math.max(num('pv-gg', st.gg), 0.55), 1.6);
    st.known = document.getElementById('pv-known').value;
    st.Rsb_sm3 = Math.max(num('pv-rsb', st.Rsb_sm3), 1);
    st.Pb_bar = Math.max(num('pv-pb', st.Pb_bar), 2);
    st.sepP_bar = num('pv-psep', st.sepP_bar);
    st.sepT_C = num('pv-tsep', st.sepT_C);
    st.pb = document.getElementById('pv-c-pb').value;
    st.bo = document.getElementById('pv-c-bo').value;
    st.muDead = document.getElementById('pv-c-mud').value;
    st.muLive = document.getElementById('pv-c-mul').value;
    st.muUnder = document.getElementById('pv-c-muu').value;
    st.co = document.getElementById('pv-c-co').value;
    st.zMethod = document.getElementById('pv-z').value;
    st.ppcMethod = document.getElementById('pv-ppc').value;
    st.yN2 = Math.max(num('pv-n2', 0), 0); st.yCO2 = Math.max(num('pv-co2', 0), 0); st.yH2S = Math.max(num('pv-h2s', 0), 0);
    st.salinity = Math.max(num('pv-sal', 0), 0);
    document.getElementById('pv-rsb').closest('.field').hidden = st.known !== 'rs';
    document.getElementById('pv-pb').closest('.field').hidden = st.known !== 'pb';
  }
  const boInput = () => ({
    api: st.api, gg: st.gg, T_C: st.T_C, known: st.known, Rsb_sm3: st.Rsb_sm3, Pb_bar: st.Pb_bar,
    sepP_bar: st.sepP_bar, sepT_C: st.sepT_C,
    corr: { pb: st.pb, bo: st.bo, muDead: st.muDead, muLive: st.muLive, muUnder: st.muUnder, co: st.co },
    zMethod: st.zMethod, ppcMethod: st.ppcMethod, yN2: st.yN2 / 100, yCO2: st.yCO2 / 100, yH2S: st.yH2S / 100,
  });

  let bo = null;
  function pressureGrid(Pb) {
    const Pmax = Math.max(st.P_res * 1.12, Pb * 1.3, 50);
    const pts = [];
    const n = 64;
    for (let i = 0; i <= n; i++) pts.push(1.01325 + (Pmax - 1.01325) * i / n);
    pts.push(Pb, st.P_res);
    return [...new Set(pts.map((p) => +p.toFixed(4)))].sort((a, b) => a - b);
  }

  function compute() {
    readInputs();
    const inp = boInput();
    const first = blackOilTable(inp, [st.P_res]);
    bo = blackOilTable(inp, pressureGrid(first.Pb));
    bo.atRes = blackOilTable(inp, [st.P_res]).rows[0];
    bo.gasRes = gasProps(st.P_res, st.T_C, st.gg, { zMethod: st.zMethod, method: st.ppcMethod, yN2: inp.yN2, yCO2: inp.yCO2, yH2S: inp.yH2S });
    bo.water = waterTable(st.T_C, st.salinity, [st.P_res])[0];
  }

  function renderStats() {
    stats.innerHTML = '';
    const r = bo.atRes;
    const under = st.P_res > bo.Pb;
    badge.textContent = under ? 'Undermettet olje' : 'Mettet olje (gasskappe mulig)';
    stats.append(
      stat('Boblepunkt', nf(bo.Pb, 1), 'bar', CORR.pb[st.pb]),
      stat('Løst gass Rsb', nf(bo.Rsb, 1), 'Sm³/Sm³', `${nf(bo.Rsb * 5.6146, 0)} scf/STB`),
      stat('Bo ved Pb', nf(bo.Bob, 3), 'rm³/Sm³', CORR.bo[st.bo]),
      stat('Bo ved reservoartrykk', nf(r.Bo, 3), 'rm³/Sm³', under ? 'Undermettet: p > Pb' : 'Mettet'),
      stat('Oljeviskositet', nf(r.mu, 3), 'cP', `ved ${nf(st.P_res, 0)} bar`),
      stat('Oljetetthet', nf(r.rho, 0), 'kg/m³', `ved ${nf(st.P_res, 0)} bar og ${nf(st.T_C, 0)} °C`),
      stat('Kompressibilitet co', sig(r.co, 3), '1/bar'),
      stat('Gass Z-faktor', nf(bo.gasRes.Z, 3), '', `Bg = ${nf(bo.gasRes.Bg * 1000, 2)} rm³ per 1000 Sm³`),
      stat('Vann Bw', nf(bo.water.Bw, 4), 'rm³/Sm³', `μw ${nf(bo.water.mu, 3)} cP`),
    );
  }

  // ---------- Oljefane ----------
  function renderOil() {
    const p = panes.oil;
    p.innerHTML = '';
    const c = S();
    const rows = bo.rows;
    const grid = el('div', 'cards');
    p.appendChild(grid);
    const pb = bo.Pb;
    const vl = [{ x: pb, label: `Pb ${nf(pb, 0)} bar` }, { x: st.P_res, label: 'Reservoar' }];
    const mk = (title, sub, series, yLabel, extra = {}) => {
      const k = card(title, sub);
      grid.appendChild(k.c);
      requestAnimationFrame(() => renderLineChart(k.body, { series, xLabel: 'Trykk (bar)', yLabel, vlines: vl, height: 230, ...extra }));
      return k;
    };
    mk('Løst gass-olje-forhold', 'Rs er konstant over boblepunktet og avtar når gass frigjøres.', [{ name: 'Rs', color: c.s1, points: rows.map((r) => [r.P, r.Rs]) }], 'Rs (Sm³/Sm³)');
    const boMax = Math.max(...rows.map((r) => r.Bo)) * 1.35;
    mk('Volumfaktor', 'Bo har maksimum ved boblepunktet. Bt tar med den frigjorte gassen.', [
      { name: 'Bo', color: c.s1, points: rows.map((r) => [r.P, r.Bo]) },
      { name: 'Bt', color: c.s4, points: rows.filter((r) => r.Bt < boMax).map((r) => [r.P, r.Bt]), dashed: true },
    ], 'rm³/Sm³', { yMin: 1, yMax: boMax });
    mk('Oljeviskositet', 'Laveste viskositet ved boblepunktet.', [{ name: 'μo', color: c.s3, points: rows.map((r) => [r.P, r.mu]) }], 'μo (cP)', { yMin: 0 });
    mk('Oljetetthet', 'Ved reservoartemperatur.', [{ name: 'ρo', color: c.s7, points: rows.map((r) => [r.P, r.rho]) }], 'ρo (kg/m³)');
    const coRows = rows.filter((r) => r.P > pb * 0.25);
    mk('Isoterm kompressibilitet', 'Hopper kraftig under boblepunktet fordi gass frigjøres.', [{ name: 'co', color: c.s8, points: coRows.map((r) => [r.P, r.co * 1e4]) }], 'co (10⁻⁴ /bar)', { yMin: 0 });
    // Sammenligning av korrelasjoner
    const cmp = card('Sammenligning av korrelasjoner', `Samme olje (Rsb = ${nf(bo.Rsb, 1)} Sm³/Sm³, ${nf(st.api, 1)} °API, ${nf(st.T_C, 0)} °C).`);
    grid.appendChild(cmp.c);
    const res = comparePb({ ...boInput(), known: 'rs', Rsb_sm3: bo.Rsb });
    renderTable(cmp.body, [
      { key: 'name', label: 'Korrelasjon' },
      { key: 'Pb', label: 'Pb (bar)', fmt: (v) => nf(v, 1) },
      { key: 'Bob', label: 'Bob', fmt: (v) => nf(v, 3) },
    ], Object.entries(res).map(([k, v]) => ({ name: CORR.pb[k], Pb: v.Pb, Bob: v.Bob })));
    cmp.body.appendChild(el('p', 'hint', 'Glasø er laget for Nordsjø-oljer og er standardvalget her. Forskjellene viser hvorfor man alltid bør sjekke korrelasjonene mot laboratoriedata.'));
    tableDetails(p, [
      { key: 'P', label: 'Trykk (bar)', fmt: (v) => nf(v, 1) },
      { key: 'Rs', label: 'Rs', fmt: (v) => nf(v, 1) },
      { key: 'Bo', label: 'Bo', fmt: (v) => nf(v, 4) },
      { key: 'Bt', label: 'Bt', fmt: (v) => nf(v, 3) },
      { key: 'mu', label: 'μo (cP)', fmt: (v) => nf(v, 3) },
      { key: 'rho', label: 'ρo (kg/m³)', fmt: (v) => nf(v, 1) },
      { key: 'co', label: 'co (1/bar)', fmt: (v) => sig(v, 3) },
    ], rows, 'Vis tabell for oljen');
  }

  // ---------- Gassfane ----------
  function renderGas() {
    const p = panes.gas;
    p.innerHTML = '';
    const c = S();
    const opts = { method: st.ppcMethod, yN2: st.yN2 / 100, yCO2: st.yCO2 / 100, yH2S: st.yH2S / 100 };
    const pc = pseudoCritical(st.gg, opts);
    const Pmax = Math.max(st.P_res * 1.3, 100);
    const Ps = [];
    for (let i = 0; i <= 60; i++) Ps.push(1.01325 + (Pmax - 1.01325) * i / 60);
    const byMethod = {};
    for (const k of Object.keys(Z_METHODS)) byMethod[k] = Ps.map((P) => gasProps(P, st.T_C, st.gg, { ...opts, pc, zMethod: k }));
    const main = byMethod[st.zMethod];
    const grid = el('div', 'cards');
    p.appendChild(grid);
    const k0 = card('Pseudokritiske egenskaper', `${PPC_METHODS[st.ppcMethod]} med Wichert–Aziz-korreksjon for CO₂ og H₂S.`);
    grid.appendChild(k0.c);
    renderTable(k0.body, [{ key: 'k', label: 'Størrelse' }, { key: 'v', label: 'Verdi' }], [
      { k: 'Tpc', v: `${nf(pc.Tpc / 1.8 - 273.15, 1)} °C (${nf(pc.Tpc, 1)} °R)` },
      { k: 'Ppc', v: `${nf(pc.Ppc / 14.5038, 1)} bar (${nf(pc.Ppc, 0)} psia)` },
      { k: 'Tpr ved reservoaret', v: nf(main[0].Tpr, 3) },
      { k: 'Ppr ved reservoaret', v: nf(bo.gasRes.Ppr, 3) },
      { k: 'Wichert–Aziz ε', v: `${nf(pc.eps, 2)} °R` },
      { k: 'Molvekt gass', v: `${nf(main[0].M, 2)} kg/kmol` },
    ]);
    const mk = (title, sub, series, yLabel, extra = {}) => {
      const k = card(title, sub);
      grid.appendChild(k.c);
      requestAnimationFrame(() => renderLineChart(k.body, { series, xLabel: 'Trykk (bar)', yLabel, vlines: [{ x: st.P_res, label: 'Reservoar' }], height: 230, ...extra }));
    };
    const zc = [c.s1, c.s2, c.s3, c.s7];
    mk('Z-faktor – fire metoder', `Ved ${nf(st.T_C, 0)} °C. Alle er tilpasninger til Standing–Katz-diagrammet.`,
      Object.keys(Z_METHODS).map((k, i) => ({ name: Z_METHODS[k].name, color: zc[i], points: Ps.map((P, j) => [P, byMethod[k][j].Z]) })), 'Z (–)');
    mk('Gassens volumfaktor', 'Hvor mye reservoarvolum én standard kubikkmeter gass fyller.', [{ name: 'Bg', color: c.s1, points: Ps.slice(3).map((P, j) => [P, main[j + 3].Bg * 1000]) }], 'Bg (rm³ / 1000 Sm³)', { yMin: 0 });
    mk('Gassviskositet (Lee–Gonzalez–Eakin)', '', [{ name: 'μg', color: c.s3, points: Ps.map((P, j) => [P, main[j].mu]) }], 'μg (cP)');
    mk('Gasstetthet', '', [{ name: 'ρg', color: c.s7, points: Ps.map((P, j) => [P, main[j].rho]) }], 'ρg (kg/m³)', { yMin: 0 });
    mk('Gassens kompressibilitet', 'Nær 1/p ved lavt trykk.', [{ name: 'cg', color: c.s8, points: Ps.slice(4).map((P, j) => [P, main[j + 4].cg * 1000]) }], 'cg (10⁻³ /bar)', { yMin: 0 });
    tableDetails(p, [
      { key: 'P', label: 'Trykk (bar)', fmt: (v) => nf(v, 1) },
      { key: 'Z', label: 'Z', fmt: (v) => nf(v, 4) },
      { key: 'Bg', label: 'Bg (rm³/Sm³)', fmt: (v) => sig(v, 4) },
      { key: 'rho', label: 'ρg (kg/m³)', fmt: (v) => nf(v, 1) },
      { key: 'mu', label: 'μg (cP)', fmt: (v) => nf(v, 4) },
      { key: 'cg', label: 'cg (1/bar)', fmt: (v) => sig(v, 3) },
    ], main, 'Vis tabell for gassen');
  }

  // ---------- Vannfane ----------
  function renderWater() {
    const p = panes.water;
    p.innerHTML = '';
    const c = S();
    const Pmax = Math.max(st.P_res * 1.2, 50);
    const Ps = [];
    for (let i = 0; i <= 50; i++) Ps.push(1.01325 + (Pmax - 1.01325) * i / 50);
    const rows = waterTable(st.T_C, st.salinity, Ps);
    const grid = el('div', 'cards');
    p.appendChild(grid);
    const mk = (title, sub, key, color, yLabel, f = 1) => {
      const k = card(title, sub);
      grid.appendChild(k.c);
      requestAnimationFrame(() => renderLineChart(k.body, { series: [{ name: title, color, points: rows.map((r) => [r.P, r[key] * f]) }], xLabel: 'Trykk (bar)', yLabel, vlines: [{ x: st.P_res, label: 'Reservoar' }], height: 220 }));
    };
    mk('Volumfaktor Bw (McCain)', `Saltinnhold ${nf(st.salinity, 0)} ppm.`, 'Bw', c.s1, 'Bw (rm³/Sm³)');
    mk('Viskositet μw (McCain)', '', 'mu', c.s3, 'μw (cP)');
    mk('Tetthet ρw', '', 'rho', c.s7, 'ρw (kg/m³)');
    mk('Kompressibilitet cw (Osif)', '', 'cw', c.s8, 'cw (10⁻⁵ /bar)', 1e5);
    mk('Løst gass i vann Rsw', '', 'Rsw', c.s4, 'Rsw (Sm³/Sm³)');
  }

  // ---------- EOS-fane ----------
  const eosState = { preset: 'blackoil', z: { ...FLUID_PRESETS.blackoil.z }, M7: FLUID_PRESETS.blackoil.M7, SG7: FLUID_PRESETS.blackoil.SG7, T: 104, P: 411, sepP: 30, sepT: 50, split: false, peneloux: true };
  let eosResult = null;
  function computeEOS() {
    const f = buildFluid(eosState.z, eosState.M7, eosState.SG7, { nPseudo: eosState.split ? 3 : 1, peneloux: eosState.peneloux });
    const env = f.eos.phaseEnvelope(f.z);
    const T = eosState.T + 273.15;
    const sat = saturationAt(f.eos, f.z, T, env);
    const summ = envelopeSummary(env);
    const sep = simulateSeparator(f.eos, f.z, T, sat ? sat.P : null, eosState.P, eosState.sepP, eosState.sepT + 273.15);
    const cls = classifyFluid(T, env, sep);
    const flRes = f.eos.flash(f.z, T, eosState.P);
    let cce = null, dl = null;
    if (sat) cce = simulateCCE(f.eos, f.z, T, sat.P, eosState.P);
    if (sat && sat.kind === 'bubble') dl = simulateDL(f.eos, f.z, T, sat.P);
    eosResult = { f, env, sat, summ, sep, cls, flRes, cce, dl, T };
  }

  function renderEOS() {
    const p = panes.eos;
    p.innerHTML = '';
    const c = S();
    const layout = el('div', 'cards');
    p.appendChild(layout);
    // Sammensetning
    const kc = card('Sammensetning (mol-%)', 'Velg en typisk væske eller skriv inn egen sammensetning.');
    layout.appendChild(kc.c);
    const presetSel = document.createElement('select');
    presetSel.className = 'sel';
    presetSel.id = 'eos-preset';
    for (const [k, v] of Object.entries(FLUID_PRESETS)) {
      const o = document.createElement('option');
      o.value = k; o.textContent = v.name;
      if (k === eosState.preset) o.selected = true;
      presetSel.appendChild(o);
    }
    presetSel.addEventListener('change', () => {
      const pr = FLUID_PRESETS[presetSel.value];
      Object.assign(eosState, { preset: presetSel.value, z: { ...pr.z }, M7: pr.M7, SG7: pr.SG7, T: pr.T, P: pr.P });
      runEOS();
    });
    kc.body.appendChild(presetSel);
    const tbl = el('div', 'table-wrap comp-table');
    tbl.style.marginTop = '8px';
    const t = document.createElement('table');
    t.className = 'data';
    t.innerHTML = '<thead><tr><th>Komponent</th><th>mol-%</th><th>M</th><th>Tc (°C)</th><th>Pc (bar)</th><th>ω</th></tr></thead>';
    const tb = document.createElement('tbody');
    const plusComp = eosResult.f.comps.find((x) => x.key === 'C7+' || x.key.startsWith('PS'));
    for (const key of COMPONENT_ORDER) {
      const tr = document.createElement('tr');
      const comp = key === 'C7+' ? plusComp : COMPONENTS[key];
      const nm = el('td', 'name', key === 'C7+' ? 'C₇₊' : COMPONENTS[key].name);
      const tdIn = el('td');
      const inp = document.createElement('input');
      inp.type = 'number'; inp.step = '0.1'; inp.min = '0'; inp.value = eosState.z[key] ?? 0;
      inp.setAttribute('aria-label', `mol-% ${key}`);
      inp.addEventListener('change', () => { eosState.z[key] = Math.max(0, parseFloat(inp.value) || 0); eosState.preset = 'egen'; runEOS(); });
      tdIn.appendChild(inp);
      tr.append(nm, tdIn,
        el('td', null, comp ? nf(comp.M, 1) : '–'),
        el('td', null, comp ? nf(comp.Tc - 273.15, 1) : '–'),
        el('td', null, comp ? nf(comp.Pc, 1) : '–'),
        el('td', null, comp ? nf(comp.w, 3) : '–'));
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    tbl.appendChild(t);
    kc.body.appendChild(tbl);
    const sum = Object.values(eosState.z).reduce((a, b) => a + (+b || 0), 0);
    const sumP = el('p', 'hint', `Sum: ${nf(sum, 2)} mol-% ${Math.abs(sum - 100) > 0.01 ? '(normaliseres automatisk)' : ''}`);
    kc.body.appendChild(sumP);
    const f2 = el('div', 'group');
    const mkNum = (label, key, unit, step) => {
      const w = numField(label, `eos-${key}`, eosState[key], unit, step);
      w.querySelector('input').addEventListener('change', (e) => { eosState[key] = parseFloat(e.target.value) || eosState[key]; runEOS(); });
      return w;
    };
    f2.append(mkNum('Molvekt C₇₊', 'M7', 'kg/kmol', '1'), mkNum('Spesifikk vekt C₇₊', 'SG7', 'vann = 1', '0.005'),
      mkNum('Reservoartemperatur', 'T', '°C', '1'), mkNum('Reservoartrykk', 'P', 'bar', '1'),
      mkNum('Separatortrykk', 'sepP', 'bar', '1'), mkNum('Separatortemperatur', 'sepT', '°C', '1'));
    const chk = (label, key) => {
      const l = el('label', 'check');
      const i = document.createElement('input');
      i.type = 'checkbox'; i.checked = eosState[key];
      i.addEventListener('change', () => { eosState[key] = i.checked; runEOS(); });
      l.append(i, document.createTextNode(label));
      return l;
    };
    f2.append(chk('Del C₇₊ i 3 pseudokomponenter (Pedersen)', 'split'), chk('Peneloux volumforskyvning', 'peneloux'));
    kc.body.appendChild(f2);

    const R = eosResult;
    // Faseomhylning
    const ke = card('Faseomhylning', `${R.cls.type}. ${R.cls.why}`);
    layout.appendChild(ke.c);
    const bubble = R.env.points.filter((q) => q.branch === 'bubble' || q.branch === 'crit').map((q) => [q.T - 273.15, q.P]);
    const dew = R.env.points.filter((q) => q.branch === 'dew' || q.branch === 'crit').map((q) => [q.T - 273.15, q.P]);
    const markers = [{ x: R.T - 273.15, y: eosState.P, label: 'Reservoar', color: c.accent }, { x: eosState.sepT, y: eosState.sepP, label: 'Separator', color: c.ink }];
    if (R.summ.crit) markers.push({ x: R.summ.crit.T - 273.15, y: R.summ.crit.P, label: 'Kritisk punkt', color: c.s4 });
    const tMinPlot = Math.max(-100, Math.min(...R.env.points.map((q) => q.T - 273.15), 0));
    requestAnimationFrame(() => renderLineChart(ke.body, {
      series: [
        { name: 'Boblepunktskurve', color: c.s1, points: bubble },
        { name: 'Duggpunktskurve', color: c.s8, points: dew },
      ],
      markers, xLabel: 'Temperatur (°C)', yLabel: 'Trykk (bar)', hover: 'nearest', height: 300, xMin: tMinPlot, yMin: 0,
    }));
    // Nøkkeltall
    const kr = card('Resultater', `Peng–Robinson med ${R.f.comps.length} komponenter.`);
    layout.appendChild(kr.c);
    const rs = R.flRes;
    const resPhase = rs.nPhases === 1 ? rs.single : null;
    const rowsKV = [
      ['Væsketype', R.cls.type],
      ['Metningstrykk', R.sat ? `${nf(R.sat.P, 1)} bar (${R.sat.kind === 'bubble' ? 'boblepunkt' : 'duggpunkt'})` : 'ingen ved reservoartemperatur'],
      ['Kritisk punkt', R.summ.crit ? `${nf(R.summ.crit.T - 273.15, 1)} °C · ${nf(R.summ.crit.P, 1)} bar` : 'ikke funnet'],
      ['Kricondenbar', R.summ.cricondenbar ? `${nf(R.summ.cricondenbar.P, 1)} bar` : '–'],
      ['Kricondenterm', R.summ.cricondentherm ? `${nf(R.summ.cricondentherm.T - 273.15, 1)} °C` : '–'],
      ['Fase ved reservoaret', rs.nPhases === 1 ? rs.label : `to faser, ${nf(rs.beta * 100, 1)} mol-% gass`],
      ['Tetthet ved reservoaret', resPhase ? `${nf(resPhase.rho, 1)} kg/m³` : `L ${nf(rs.L.rho, 0)} / V ${nf(rs.V.rho, 0)} kg/m³`],
      ['Viskositet (LBC)', resPhase ? `${nf(resPhase.mu, 4)} cP` : `L ${nf(rs.L.mu, 3)} / V ${nf(rs.V.mu, 4)} cP`],
      ['Z-faktor ved reservoaret', resPhase ? nf(resPhase.Z, 3) : '–'],
      ['GOR (separatortest)', Number.isFinite(R.sep.GOR) ? `${nf(R.sep.GOR, 1)} Sm³/Sm³` : 'ingen væske'],
      ['Bo ved metningstrykk', R.sep.Bo ? `${nf(R.sep.Bo, 3)} rm³/Sm³` : '–'],
      ['Lagertankolje', R.sep.stoAPI !== null ? `${nf(R.sep.stoAPI, 1)} °API (${nf(R.sep.stoDensity, 1)} kg/m³)` : '–'],
      ['Separatorgass', `γg = ${nf(R.sep.gasSG, 3)}`],
    ];
    if (!R.sat || R.sat.kind !== 'bubble') rowsKV.push(['Kondensat-gass-forhold', R.sep.liquid ? `${nf(R.sep.CGR, 0)} Sm³/MSm³` : '0']);
    const dl = document.createElement('dl');
    dl.className = 'kv';
    for (const [k, v] of rowsKV) { dl.append(el('dt', null, k), el('dd', null, v)); }
    kr.body.appendChild(dl);
    // CCE
    if (R.cce) {
      const kcce = card('Konstant sammensetning-ekspansjon (CCE)', 'Relativt volum V/Vsat og væskeandel ved reservoartemperatur.');
      layout.appendChild(kcce.c);
      const oil = R.sat.kind === 'bubble';
      requestAnimationFrame(() => renderLineChart(kcce.body, {
        series: oil
          ? [{ name: 'V/Vsat', color: c.s1, points: R.cce.rows.map((r) => [r.P, r.Vrel]) }]
          : [{ name: 'Væskeutfelling (% av Vsat)', color: c.s3, points: R.cce.rows.map((r) => [r.P, r.liquidPct]), area: true }],
        xLabel: 'Trykk (bar)', yLabel: oil ? 'V/Vsat' : 'Væske (%)', vlines: [{ x: R.sat.P, label: oil ? 'Pb' : 'Pdugg' }], height: 230,
      }));
      tableDetails(kcce.body, [
        { key: 'P', label: 'Trykk (bar)', fmt: (v) => nf(v, 1) },
        { key: 'Vrel', label: 'V/Vsat', fmt: (v) => nf(v, 4) },
        { key: 'liquidPct', label: 'Væske (%)', fmt: (v) => nf(v, 2) },
        { key: 'rho', label: 'ρ (kg/m³)', fmt: (v) => (v ? nf(v, 1) : '–') },
        { key: 'Y', label: 'Y-funksjon', fmt: (v) => (v ? nf(v, 3) : '–') },
      ], R.cce.rows);
    }
    // DL
    if (R.dl) {
      const kd = card('Differensiell frigjøring (DL)', 'Gassen fjernes trinnvis ved reservoartemperatur. Bod og Rsd er relativt til restoljen.');
      layout.appendChild(kd.c);
      requestAnimationFrame(() => renderLineChart(kd.body, {
        series: [{ name: 'Rsd (Sm³/Sm³)', color: c.s1, points: R.dl.rows.map((r) => [r.P, r.Rsd]) }],
        xLabel: 'Trykk (bar)', yLabel: 'Rsd (Sm³/Sm³)', height: 210, yMin: 0,
      }));
      tableDetails(kd.body, [
        { key: 'P', label: 'Trykk (bar)', fmt: (v) => nf(v, 1) },
        { key: 'Bod', label: 'Bod', fmt: (v) => nf(v, 4) },
        { key: 'Rsd', label: 'Rsd', fmt: (v) => nf(v, 1) },
        { key: 'rhoOil', label: 'ρo (kg/m³)', fmt: (v) => nf(v, 1) },
        { key: 'gasZ', label: 'Z gass', fmt: (v) => (v ? nf(v, 3) : '–') },
        { key: 'gasSG', label: 'γg', fmt: (v) => (v ? nf(v, 3) : '–') },
      ], R.dl.rows, 'Vis DL-tabell');
    }
    // Likevektsflash ved reservoaret eller i tofaseområdet
    const kf = card('Faselikevekt', rs.nPhases === 2 ? 'Reservoaret er i tofaseområdet.' : 'Flash ved separatorbetingelser viser hvordan brønnstrømmen deles.');
    layout.appendChild(kf.c);
    const flSep = rs.nPhases === 2 ? rs : R.f.eos.flash(R.f.z, eosState.sepT + 273.15, eosState.sepP);
    const names = R.f.comps.map((x) => x.name);
    const rowsF = names.map((n, i) => ({
      n, z: R.f.z[i] * 100,
      x: flSep.nPhases === 2 ? flSep.L.x[i] * 100 : null,
      y: flSep.nPhases === 2 ? flSep.V.x[i] * 100 : null,
      K: flSep.nPhases === 2 ? flSep.K[i] : null,
    }));
    renderTable(kf.body, [
      { key: 'n', label: 'Komponent' },
      { key: 'z', label: 'z (mol-%)', fmt: (v) => nf(v, 2) },
      { key: 'x', label: 'Væske x', fmt: (v) => (v === null ? '–' : nf(v, 2)) },
      { key: 'y', label: 'Gass y', fmt: (v) => (v === null ? '–' : nf(v, 2)) },
      { key: 'K', label: 'K = y/x', fmt: (v) => (v === null ? '–' : sig(v, 3)) },
    ], rowsF);
    kf.body.appendChild(el('p', 'hint', flSep.nPhases === 2 ? `Gassandel β = ${nf(flSep.beta * 100, 1)} mol-% ved ${nf(flSep.P, 0)} bar og ${nf(flSep.T - 273.15, 0)} °C.` : 'Én fase ved disse betingelsene.'));
  }

  function runEOS() {
    try { computeEOS(); } catch (e) { console.error(e); }
    if (active === 'eos') renderEOS();
  }

  // ---------- Volumberegning ----------
  function renderVol() {
    const p = panes.vol;
    p.innerHTML = '';
    const grid = el('div', 'cards');
    p.appendChild(grid);
    const k = card('Tilstedeværende olje (STOOIP)', 'Volumetrisk estimat for Etive/Rannoch-reservoaret i antiklinalen.');
    grid.appendChild(k.c);
    const g = el('div', 'group');
    const f = (label, key, unit, step) => {
      const w = numField(label, `vol-${key}`, st[key], unit, step);
      w.querySelector('input').addEventListener('input', (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) { st[key] = v; out(); } });
      return w;
    };
    g.append(f('Areal', 'area', 'km²', '0.5'), f('Brutto tykkelse', 'h', 'm', '1'), f('Netto/brutto', 'ntg', '–', '0.01'),
      f('Porøsitet φ', 'phi', '–', '0.01'), f('Vannmetning Sw', 'sw', '–', '0.01'), f('Utvinningsgrad', 'rf', '–', '0.01'));
    k.body.appendChild(g);
    const res = el('dl', 'kv');
    k.body.appendChild(res);
    function out() {
      const Boi = bo.atRes.Bo;
      const Rsi = bo.atRes.Rs;
      const grv = st.area * 1e6 * st.h;
      const hcpv = grv * st.ntg * st.phi * (1 - st.sw);
      const N = hcpv / Boi;
      res.innerHTML = '';
      const rows = [
        ['Bergartsvolum (GRV)', `${nf(grv / 1e6, 0)} mill. m³`],
        ['Hydrokarbonfylt porevolum', `${nf(hcpv / 1e6, 1)} mill. rm³`],
        ['Boi fra korrelasjonen', `${nf(Boi, 3)} rm³/Sm³`],
        ['STOOIP', `${nf(N / 1e6, 1)} MSm³ (${nf(N * 6.2898 / 1e6, 0)} mill. fat)`],
        ['Løst gass (N·Rsi)', `${nf(N * Rsi / 1e9, 2)} GSm³`],
        ['Utvinnbar olje', `${nf(N * st.rf / 1e6, 1)} MSm³`],
      ];
      for (const [a, b] of rows) res.append(el('dt', null, a), el('dd', null, b));
    }
    out();
    const k2 = card('Slik regnes det', 'Oljen krymper når den produseres til overflaten fordi gassen koker av. Derfor deles reservoarvolumet på Bo.');
    grid.appendChild(k2.c);
    k2.body.appendChild(el('p', 'muted', 'N = A · h · N/G · φ · (1 − Sw) / Boi. Løst gass følger med oljen: Gs = N · Rsi. 1 Sm³ olje = 6,29 fat.'));
  }

  // ---------- Likninger ----------
  let eqRendered = false;
  function renderEq() {
    const p = panes.eq;
    if (eqRendered) return;
    eqRendered = true;
    p.innerHTML = '';
    p.appendChild(el('p', 'hint', 'Alle likningene som brukes i PVT-laben og boresimulatoren. Korrelasjonene er i feltenheter: p i psia, T i °F (TR i °R), Rs i scf/STB og μ i cP.'));
    const holders = [];
    for (const grp of EQUATIONS) {
      const g = el('div', 'eq-group');
      g.appendChild(el('h3', null, grp.group));
      for (const it of grp.items) {
        const e = el('div', 'eq');
        e.appendChild(el('h4', null, it.name));
        if (it.ref) e.appendChild(el('div', 'ref', it.ref));
        if (it.note) e.appendChild(el('p', null, it.note));
        const tx = el('div', 'tex');
        tx.textContent = `\\[${it.tex}\\]`;
        e.appendChild(tx);
        holders.push(tx);
        g.appendChild(e);
      }
      p.appendChild(g);
    }
    loadMathJax().then(() => window.MathJax.typesetPromise([p])).catch(() => {
      p.insertBefore(el('p', 'callout warn', 'Formelsetting kunne ikke lastes. Likningene vises som TeX-kode.'), p.firstChild);
    });
  }

  function renderActive() {
    if (active === 'oil') renderOil();
    if (active === 'gas') renderGas();
    if (active === 'water') renderWater();
    if (active === 'eos') { if (!eosResult) computeEOS(); renderEOS(); }
    if (active === 'vol') renderVol();
    if (active === 'eq') renderEq();
  }

  let timer = null;
  inputs.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { compute(); renderStats(); if (active !== 'eos' && active !== 'eq') renderActive(); }, 180);
  });
  inputs.addEventListener('change', () => {
    clearTimeout(timer);
    compute(); renderStats(); if (active !== 'eos' && active !== 'eq') renderActive();
  });

  compute();
  renderStats();
  let shown = false;
  let resizeT = null;
  let lastW = 0;
  new ResizeObserver(() => {
    if (!shown || main.clientWidth === lastW) return;
    lastW = main.clientWidth;
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { if (active !== 'eq') renderActive(); }, 200);
  }).observe(main);

  return {
    show() {
      if (!shown) { shown = true; lastW = main.clientWidth; renderActive(); }
    },
  };
}
