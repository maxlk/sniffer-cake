// Inlines everything into sniffer-cake-v<VERSION>.html. Never overwrites an existing release.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const version = read('VERSION').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('bad VERSION: ' + version);
// --out <file> writes a throwaway preview elsewhere; releases always go to the versioned name.
const flag = process.argv.indexOf('--out');
const preview = flag > 0 ? path.resolve(process.argv[flag + 1]) : null;
const out = preview || path.join(root, `sniffer-cake-v${version}.html`);
if (!preview && fs.existsSync(out)) {
  console.error(`${path.basename(out)} already exists. Bump VERSION to build a new release.`);
  process.exit(1);
}
// copies: default count, the Sniffer has four sides, each needing side and hair.
// group: parts kept apart in the "separate" layout mode.
const patterns = [['back', 'Спина', 1, 'main'], ['side', 'Бок', 4, 'sides'], ['hair', 'Красная шерсть', 4, 'sides'], ['head', 'Голова', 1, 'main']].map(([id, name, copies, group]) => {
  const svg = read(`assets/patterns/${id}.svg`).trim();
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  return { id, name, copies, group, w: +w, h: +h, svg };
});
const data = JSON.stringify({ version, patterns, font: JSON.parse(read('src/glyphs.json')) }).replace(/</g, '\\u003c');
const slots = {
  '/*__CSS__*/': read('src/style.css'), '/*__DATA__*/': data, '/*__LAYOUT__*/': read('src/layout.js'),
  '/*__PDF__*/': read('src/pdf.js'), '/*__APP__*/': read('src/app.js'), '__VERSION__': version,
};
let html = read('src/template.html');
for (const [k, v] of Object.entries(slots)) html = html.split(k).join(v);
fs.writeFileSync(out, html, { flag: preview ? 'w' : 'wx' });
console.log('built', path.basename(out), fs.statSync(out).size, 'bytes');
