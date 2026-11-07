// Hand-written PDF 1.4 and store-only ZIP. Output is pure ASCII PDF, one page per file.
(function (root) {
  const L = typeof module !== 'undefined' ? require('./layout.js') : root.Layout;
  const MM = 72 / 25.4;

  const num = v => {
    const s = v.toFixed(4).replace(/\.?0+$/, '');
    return s === '-0' || s === '' ? '0' : s;
  };

  function gridFromSvg(svg) {
    const [, w, h] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
    const grid = Array.from({ length: h }, () => Array(w).fill(null));
    for (const m of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9a-f]{6})"\/>/g)) {
      const [x, y, rw, rh] = m.slice(1, 5).map(Number);
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) grid[j][i] = m[5];
    }
    return grid;
  }

  const rgb = c => [1, 3, 5].map(i => num(parseInt(c.slice(i, i + 2), 16) / 255)).join(' ');

  // Raster order, so a half-pixel overlap into an opaque neighbour is always repainted by that
  // neighbour. That removes viewer hairlines, and edges next to transparency stay exact.
  function artOps(grid, pc) {
    const ops = [];
    const at = (x, y) => (x < 0 || y < 0 || x >= pc.sw || y >= pc.sh) ? null : grid[pc.sy + y][pc.sx + x];
    let last = null;
    for (let y = 0; y < pc.sh; y++) {
      for (let x = 0; x < pc.sw;) {
        const c = at(x, y);
        if (!c) { x++; continue; }
        const below = !!at(x, y + 1);
        let e = x + 1;
        while (e < pc.sw && at(e, y) === c && !!at(e, y + 1) === below) e++;
        if (c !== last) { ops.push(rgb(c) + ' rg'); last = c; }
        const w = e - x;
        ops.push(`${x} ${y} ${w} 1 re`);
        if (at(e, y)) ops.push(`${x} ${y} ${w + 0.5} 1 re`);
        if (below) ops.push(`${x} ${y} ${w} 1.5 re`);
        ops.push('f');
        x = e;
      }
    }
    return ops;
  }

  function textOps(cmds) {
    return cmds.map(c => c[0] === 'Z' ? 'h'
      : c[0] === 'M' ? `${num(c[1])} ${num(c[2])} m`
      : c[0] === 'L' ? `${num(c[1])} ${num(c[2])} l`
      : `${c.slice(1).map(num).join(' ')} c`);
  }

  function sheetContent(sheet, { pixel, pageH, grids, font }) {
    const s = num(MM);
    const ops = [`${s} 0 0 -${s} 0 ${num(pageH * MM)} cm`];
    for (const pc of sheet.pieces) {
      ops.push('q', L.pieceMatrix(pc, pixel).map(num).join(' ') + ' cm', ...artOps(grids[pc.id], pc), 'Q');
      const cap = L.fitCaption(pc, pixel, font);
      if (cap) {
        ops.push('q', L.captionMatrix(pc, pixel).map(num).join(' ') + ' cm', '0.35 g',
          ...textOps(L.textCommands(cap.text, cap.size, 0, -1, font)), 'f', 'Q');
      }
    }
    return ops.join('\n');
  }

  function buildPdf(content, pageW, pageH, title) {
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageW * MM)} ${num(pageH * MM)}] /Contents 4 0 R /Resources << >> >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      `<< /Title (${title}) /Producer (sniffer-cake) >>`,
    ];
    let out = '%PDF-1.4\n';
    const offsets = objs.map((o, i) => {
      const at = out.length;
      out += `${i + 1} 0 obj\n${o}\nendobj\n`;
      return at;
    });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += String(o).padStart(10, '0') + ' 00000 n \n';
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
    return bytes;
  }

  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = b => {
    let c = ~0;
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8);
    return ~c >>> 0;
  };

  // files: [{name (ASCII), bytes}]
  function makeZip(files) {
    const parts = [], central = [];
    let offset = 0;
    const le = (n, size) => Array.from({ length: size }, (_, i) => (n >>> (8 * i)) & 255);
    const ascii = s => Array.from(s, c => c.charCodeAt(0));
    for (const f of files) {
      const crc = crc32(f.bytes), n = f.bytes.length, name = ascii(f.name);
      const common = [...le(20, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(crc, 4), ...le(n, 4), ...le(n, 4), ...le(name.length, 2), ...le(0, 2)];
      const local = Uint8Array.from([...le(0x04034b50, 4), ...common, ...name]);
      parts.push(local, f.bytes);
      central.push(Uint8Array.from([...le(0x02014b50, 4), ...le(20, 2), ...common, ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(offset, 4), ...name]));
      offset += local.length + n;
    }
    const size = central.reduce((s, c) => s + c.length, 0);
    const end = Uint8Array.from([...le(0x06054b50, 4), ...le(0, 2), ...le(0, 2), ...le(files.length, 2), ...le(files.length, 2), ...le(size, 4), ...le(offset, 4), ...le(0, 2)]);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
    let at = 0;
    for (const a of all) { out.set(a, at); at += a.length; }
    return out;
  }

  const api = { gridFromSvg, artOps, sheetContent, buildPdf, makeZip, crc32, num };
  if (typeof module !== 'undefined') module.exports = api; else root.Pdf = api;
})(this);
