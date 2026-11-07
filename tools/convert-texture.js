// Converts assets/sniffer.png to lossless SVG: full texture plus the four patterns.
const fs = require('fs'), path = require('path');
const { read } = require('./png.js');
const root = path.join(__dirname, '..');
const tex = read(path.join(root, 'assets/sniffer.png'));

const hex = (px, i) => '#' + [0, 1, 2].map(c => px[i + c].toString(16).padStart(2, '0')).join('');
const crop = (x0, y0, w, h) => {
  const g = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * tex.W + x0 + x) * 4;
      row.push(tex.px[i + 3] ? hex(tex.px, i) : null);
    }
    g.push(row);
  }
  return g;
};
const toSvg = grid => {
  const h = grid.length, w = grid[0].length, rects = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w;) {
    const c = grid[y][x];
    let e = x + 1;
    while (e < w && grid[y][e] === c) e++;
    if (c) rects.push(`<rect x="${x}" y="${y}" width="${e - x}" height="1" fill="${c}"/>`);
    x = e;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges">${rects.join('')}</svg>\n`;
};
const head = () => {
  const YELLOW = '#fac937', RED = '#812118', W = 13, H = 16;
  const g = Array.from({ length: H }, () => Array(W).fill(YELLOW));
  g[11].fill(RED); // rows 12..15 are the lower fourth
  for (const y of [7, 8]) for (const x of [3, 4, 8, 9]) g[y][x] = RED;
  return g;
};

const patterns = {
  back: crop(102, 0, 25, 40),
  side: crop(62, 40, 40, 20),
  hair: crop(62, 125, 40, 12),
  head: head(),
};
// The side crop drops rows 20-23: guard that nothing visible is lost.
if (crop(62, 60, 40, 4).flat().some(Boolean)) throw new Error('side rows 20-23 are not empty');

fs.writeFileSync(path.join(root, 'assets/sniffer.svg'), toSvg(crop(0, 0, tex.W, tex.H)));
for (const [id, g] of Object.entries(patterns)) fs.writeFileSync(path.join(root, `assets/patterns/${id}.svg`), toSvg(g));
console.log('ok', Object.entries(patterns).map(([k, g]) => `${k} ${g[0].length}x${g.length}`).join(', '));
