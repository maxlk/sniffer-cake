// Extracts PT Sans outlines (SIL OFL) so captions can be drawn as vector paths in the PDF.
const fs = require('fs'), path = require('path');
const opentype = require('opentype.js');
const root = path.join(__dirname, '..');
const load = n => {
  const b = fs.readFileSync(path.join(root, 'node_modules/@fontsource/pt-sans/files', `pt-sans-${n}-400-normal.woff`));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
};
const fonts = [load('cyrillic'), load('latin')];
let chars = ' 0123456789.,:;/()×-–—·';
for (let c = 0x410; c <= 0x44f; c++) chars += String.fromCharCode(c);
chars += 'ЁёxABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const out = { unitsPerEm: fonts[0].unitsPerEm, glyphs: {} };
const r = v => Math.round(v);
for (const ch of new Set(chars)) {
  const f = fonts.find(f => f.charToGlyphIndex(ch) > 0);
  if (!f) throw new Error('missing glyph ' + ch);
  const g = f.charToGlyph(ch), cmds = [];
  let cx = 0, cy = 0;
  for (const c of g.getPath(0, 0, f.unitsPerEm).commands) { // y grows down, like the page
    if (c.type === 'M' || c.type === 'L') { cmds.push([c.type, r(c.x), r(c.y)]); cx = c.x; cy = c.y; }
    else if (c.type === 'C') { cmds.push(['C', r(c.x1), r(c.y1), r(c.x2), r(c.y2), r(c.x), r(c.y)]); cx = c.x; cy = c.y; }
    else if (c.type === 'Q') { // PDF has no quadratics: raise to cubic
      cmds.push(['C', r(cx + 2 / 3 * (c.x1 - cx)), r(cy + 2 / 3 * (c.y1 - cy)), r(c.x + 2 / 3 * (c.x1 - c.x)), r(c.y + 2 / 3 * (c.y1 - c.y)), r(c.x), r(c.y)]);
      cx = c.x; cy = c.y;
    } else if (c.type === 'Z') cmds.push(['Z']);
  }
  out.glyphs[ch] = { a: r(g.advanceWidth), p: cmds };
}
fs.writeFileSync(path.join(root, 'src/glyphs.json'), JSON.stringify(out));
console.log('glyphs', Object.keys(out.glyphs).length, 'bytes', fs.statSync(path.join(root, 'src/glyphs.json')).size);
