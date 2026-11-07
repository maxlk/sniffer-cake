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
const patterns = [['back', 'Спина'], ['side', 'Бок'], ['hair', 'Красная шерсть'], ['head', 'Голова']].map(([id, name]) => {
  const svg = read(`assets/patterns/${id}.svg`).trim();
  const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  return { id, name, w: +w, h: +h, svg };
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
