// Ordliste: riggens deler og fagbegreper, med snarvei til delen i 3D.
import { PARTS, TERMS } from './glossary.js';

export function createGlossary(root, { onShowPart } = {}) {
  root.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'gl-head';
  const txt = document.createElement('div');
  const h = document.createElement('h2');
  h.textContent = 'Riggens deler og fagord';
  const p = document.createElement('p');
  p.textContent = 'Norske og engelske navn slik de brukes på sokkelen. Trykk «Vis i 3D» for å se delen på riggen.';
  txt.append(h, p);
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'search';
  search.placeholder = 'Søk, f.eks. BOP eller toppdrev';
  search.setAttribute('aria-label', 'Søk i ordlisten');
  head.append(txt, search);
  root.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'gl-grid';
  root.appendChild(grid);
  const cards = [];
  for (const [key, part] of Object.entries(PARTS)) {
    const c = document.createElement('article');
    c.className = 'gl-card';
    const t = document.createElement('h3');
    t.textContent = part.no;
    const en = document.createElement('div');
    en.className = 'en';
    en.textContent = part.en;
    const d = document.createElement('p');
    d.textContent = part.text;
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.textContent = 'Vis i 3D';
    b.addEventListener('click', () => onShowPart && onShowPart(key));
    c.append(t, en, d, b);
    grid.appendChild(c);
    cards.push({ c, text: `${part.no} ${part.en} ${part.text}`.toLowerCase() });
  }

  const terms = document.createElement('section');
  terms.className = 'gl-terms';
  const th = document.createElement('h3');
  th.textContent = 'Begreper i boring og brønnkontroll';
  const dl = document.createElement('dl');
  const rows = [];
  for (const [k, v] of TERMS) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    const dd = document.createElement('dd');
    dd.textContent = v;
    dl.append(dt, dd);
    rows.push({ dt, dd, text: `${k} ${v}`.toLowerCase() });
  }
  terms.append(th, dl);
  root.appendChild(terms);

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const x of cards) x.c.hidden = q && !x.text.includes(q);
    for (const r of rows) { const hide = q && !r.text.includes(q); r.dt.hidden = hide; r.dd.hidden = hide; }
  });
}
