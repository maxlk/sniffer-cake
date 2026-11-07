const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const L = require('../src/layout.js'), P = require('../src/pdf.js');
const { read } = require('../tools/png.js');
const root = path.join(__dirname, '..');
const svg = id => fs.readFileSync(path.join(root, `assets/patterns/${id}.svg`), 'utf8');
const patterns = [['back', 'Спина', 25, 40], ['side', 'Бок', 40, 20], ['hair', 'Красная шерсть', 40, 12], ['head', 'Голова', 31, 32]]
  .map(([id, name, w, h]) => ({ id, name, w, h }));
const FORMATS = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
const run = (pixel, f, margin = 5) => L.computeLayout({ patterns, pixel, pageW: FORMATS[f][0], pageH: FORMATS[f][1], margin });

function check(r, pixel, W, H, margin) {
  const covered = Object.fromEntries(patterns.map(t => [t.id, Array.from({ length: t.h }, () => Array(t.w).fill(0))]));
  for (const sheet of r.sheets) {
    const boxes = sheet.pieces.map(pc => {
      const a = pc.sw * pixel, b = pc.sh * pixel + L.CAPTION;
      const [w, h] = pc.rotated ? [b, a] : [a, b];
      for (let y = 0; y < pc.sh; y++) for (let x = 0; x < pc.sw; x++) covered[pc.id][pc.sy + y][pc.sx + x]++;
      assert.ok(pc.x >= margin - 1e-6 && pc.y >= margin - 1e-6 && pc.x + w <= W - margin + 1e-6 && pc.y + h <= H - margin + 1e-6, 'inside printable area');
      return { x: pc.x, y: pc.y, w, h };
    });
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach(b => {
      const apart = a.x + a.w + L.GAP <= b.x + 1e-6 || b.x + b.w + L.GAP <= a.x + 1e-6 || a.y + a.h + L.GAP <= b.y + 1e-6 || b.y + b.h + L.GAP <= a.y + 1e-6;
      assert.ok(apart, 'pieces keep the gap');
    }));
  }
  for (const g of Object.values(covered)) assert.ok(g.flat().every(v => v === 1), 'every pixel exactly once');
}

test('SVG patterns are lossless crops of the PNG', () => {
  const t = read(path.join(root, 'assets/sniffer.png'));
  for (const [id, x0, y0] of [['back', 102, 0], ['side', 62, 40], ['hair', 62, 125]]) {
    const g = P.gridFromSvg(svg(id));
    g.forEach((row, y) => row.forEach((c, x) => {
      const i = ((y0 + y) * t.W + x0 + x) * 4;
      const want = t.px[i + 3] ? '#' + [0, 1, 2].map(k => t.px[i + k].toString(16).padStart(2, '0')).join('') : null;
      assert.strictEqual(c, want);
    }));
  }
});

test('full SVG equals the full texture', () => {
  const t = read(path.join(root, 'assets/sniffer.png'));
  const g = P.gridFromSvg(fs.readFileSync(path.join(root, 'assets/sniffer.svg'), 'utf8'));
  for (let y = 0; y < t.H; y++) for (let x = 0; x < t.W; x++) assert.strictEqual(!!g[y][x], !!t.px[(y * t.W + x) * 4 + 3]);
});

test('head is a five-face net of original texture pixels', () => {
  const t = read(path.join(root, 'assets/sniffer.png'));
  const px = (x, y) => '#' + [0, 1, 2].map(k => t.px[(y * t.W + x) * 4 + k].toString(16).padStart(2, '0')).join('');
  const g = P.gridFromSvg(svg('head'));
  assert.deepStrictEqual([g[0].length, g.length], [31, 32]);
  assert.ok(g.flat().every(Boolean), 'no empty areas');
  for (let y = 0; y < 9; y++) for (let x = 0; x < 13; x++) {
    assert.strictEqual(g[y][9 + x], px(19 + x, 45 + y), 'top face');
    assert.strictEqual(g[23 + y][9 + x], px(32 + x, 65 - y), 'bottom face, flipped to fold');
  }
  for (let x = 0; x < 31; x++) {
    for (let y = 0; y < 2; y++) assert.strictEqual(g[9 + y][x], px(10 + x, 54 + y), 'nose row');
    for (let y = 0; y < 12; y++) assert.strictEqual(g[11 + y][x], px(10 + x, 66 + y), 'beak row');
  }
  const nostril = new Set(['#714102', '#442b11', '#5b3609']);
  for (const [x0, y0] of [[0, 0], [22, 0], [0, 23], [22, 23]]) for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    assert.ok(!nostril.has(g[y0 + y][x0 + x]), 'corners add no false nostrils');
  }
  const colours = new Set(); // every fill colour comes from the real texture
  for (let i = 0; i < t.W * t.H; i++) if (t.px[i * 4 + 3]) colours.add(px(i % t.W, Math.floor(i / t.W)));
  assert.ok(g.flat().every(c => colours.has(c)));
});

test('whole rectangles: A1 one file, A2 two files at 10 mm', () => {
  const a1 = run(10, 'A1'), a2 = run(10, 'A2');
  assert.deepStrictEqual([a1.sheets.length, a1.split, a1.minimal], [1, [], true]);
  assert.deepStrictEqual([a2.sheets.length, a2.split, a2.minimal], [2, [], true]);
  check(a1, 10, ...FORMATS.A1, 5); check(a2, 10, ...FORMATS.A2, 5);
});

test('small pixel fits one A4', () => {
  const r = run(3, 'A4');
  assert.strictEqual(r.sheets.length, 1);
  check(r, 3, ...FORMATS.A4, 5);
});

test('default A4 cuts only what does not fit and reports it', () => {
  const r = run(10, 'A4');
  check(r, 10, ...FORMATS.A4, 5);
  assert.deepStrictEqual([...r.split].sort(), patterns.map(t => t.name).sort());
  console.log('A4 10mm sheets', r.sheets.length, 'lower bound', r.lowerBound, 'minimal', r.minimal);
  assert.ok(r.sheets.length <= r.lowerBound + 1);
});

test('a rectangle that fits stays whole', () => {
  const r = run(6, 'A4'); // head is 186x192 mm here and fits
  check(r, 6, ...FORMATS.A4, 5);
  assert.strictEqual(r.sheets.flatMap(s => s.pieces).filter(pc => pc.id === 'head').length, 1);
});

test('sweep: valid layouts across sizes', () => {
  for (const f of Object.keys(FORMATS)) for (const p of [1, 2.5, 5, 7.5, 10, 12, 15, 20, 30]) for (const m of [0, 5, 10]) {
    const t0 = Date.now(), r = run(p, f, m);
    assert.ok(Date.now() - t0 < 3000, `slow ${f} ${p} ${m}`);
    if (r.error) continue;
    check(r, p, ...FORMATS[f], m);
    assert.ok(r.sheets.length >= r.lowerBound);
  }
});

test('packSheet agrees with brute force on random small cases', () => {
  let seed = 12345;
  const rnd = n => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n;
  const brute = (items, W, H) => { // every integer position, every orientation
    const g = L.GAP, placed = [];
    const rec = i => {
      if (i === items.length) return true;
      for (const [w, h] of [[items[i].fw, items[i].fh], [items[i].fh, items[i].fw]])
        for (let y = 0; y + h <= H; y++) for (let x = 0; x + w <= W; x++) {
          if (placed.some(q => x < q.x + q.w + g && q.x < x + w + g && y < q.y + q.h + g && q.y < y + h + g)) continue;
          placed.push({ x, y, w, h });
          if (rec(i + 1)) return true;
          placed.pop();
        }
      return false;
    };
    return rec(0);
  };
  let yes = 0, no = 0;
  for (let t = 0; t < 1500; t++) {
    const W = 10 + rnd(22), H = 10 + rnd(22), n = 2 + rnd(3);
    const items = Array.from({ length: n }, () => ({ fw: 2 + rnd(9), fh: 2 + rnd(9) }));
    const got = !!L.packSheet(items, W, H, { left: Infinity }), want = brute(items, W, H);
    assert.strictEqual(got, want, JSON.stringify({ W, H, items }));
    want ? yes++ : no++;
  }
  assert.ok(yes > 100 && no > 100, `both outcomes exercised: ${yes}/${no}`);
});

test('errors', () => {
  assert.strictEqual(L.computeLayout({ patterns, pixel: 10, pageW: 12, pageH: 12, margin: 5 }).error, 'tooSmall');
  assert.strictEqual(run(100, 'A4').error, 'tooMany');
});

test('caption never exceeds the piece width', () => {
  const font = JSON.parse(fs.readFileSync(path.join(root, 'src/glyphs.json'), 'utf8'));
  for (const p of [1, 3, 10]) for (const t of patterns) {
    const pc = L.wholePiece(t), c = L.fitCaption(pc, p, font);
    if (c) assert.ok(L.textWidth(c.text, c.size, font) <= t.w * p + 1e-6);
  }
});

test('seam overlap never crosses into transparency or tile edges', () => {
  const g = [['#000000', '#000000', null], [null, '#000000', '#111111']];
  const ops = P.artOps(g, { sx: 0, sy: 0, sw: 3, sh: 2 });
  for (const o of ops.filter(o => o.endsWith(' re'))) {
    const [x, y, w, h] = o.split(' ').map(Number);
    if (y === 0) assert.ok(x + w <= 2, 'no right bleed into transparent cell');
    if (y === 0 && x === 0 && h > 1) assert.fail('no down bleed above transparent cell');
  }
  const tile = P.artOps([['#000000', '#111111']], { sx: 0, sy: 0, sw: 1, sh: 1 });
  assert.ok(!tile.some(o => o.includes('1.5') ), 'tile edge exact');
});

test('PDF structure: xref offsets and exact MediaBox', () => {
  const b = P.buildPdf('0 0 1 1 re f', 210, 297, 'T');
  const s = Buffer.from(b).toString('latin1');
  assert.ok(/MediaBox \[0 0 595\.2756 841\.8898\]/.test(s));
  const at = +s.match(/startxref\n(\d+)/)[1];
  assert.strictEqual(s.slice(at, at + 4), 'xref');
  const offs = [...s.slice(at).matchAll(/(\d{10}) 00000 n/g)].map(m => +m[1]);
  offs.forEach((o, i) => assert.strictEqual(s.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  assert.ok(/^[\x00-\x7f]*$/.test(s));
});
