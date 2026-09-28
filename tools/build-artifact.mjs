// Lager en artefakt-versjon av index.html uten <!doctype>/<html>/<head>/<body>-omslag.
// Bruk: node tools/build-artifact.mjs <utfil>
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/i)[1]
  .replace(/<meta charset[^>]*>\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = src.match(/<body>([\s\S]*?)<\/body>/i)[1];
const out = process.argv[2] || 'dist/index.html';
writeFileSync(out, head.trim() + '\n\n' + body.trim() + '\n');
console.log('Skrev', out);
