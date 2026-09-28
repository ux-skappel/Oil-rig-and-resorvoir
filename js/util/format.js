// Tallformatering med norsk desimalkomma og mellomrom som tusenskille.
const cache = new Map();

export function nf(x, d = 0) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  let f = cache.get(d);
  if (!f) {
    f = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: d, maximumFractionDigits: d });
    cache.set(d, f);
  }
  return f.format(x).replace(/−/g, '-');
}

// Signifikante sifre (for små tall som kompressibilitet)
export function sig(x, s = 3) {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e < -3 || e > 5) {
    const m = x / 10 ** e;
    return `${nf(m, s - 1)}·10${sup(e)}`;
  }
  return nf(x, Math.max(0, s - 1 - e));
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export function sup(n) {
  return String(n).split('').map((c) => SUP[c] ?? c).join('');
}

export function clockText(t) {
  const day = Math.floor(t / 86400) + 1;
  const s = t % 86400;
  return `Dag ${day} ${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}
