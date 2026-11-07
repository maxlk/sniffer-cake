// Sheet layout: pure logic, no DOM. All lengths in mm, pattern sizes in texture pixels.
(function (root) {
  const CAPTION = 4;   // strip above each piece for its caption
  const GAP = 3;       // distance between pieces
  const EPS = 1e-6;

  const dims = (pc, p) => ({ fw: pc.sw * p, fh: pc.sh * p + CAPTION });

  // Exhaustive placement over normal positions (sums of neighbour edges) with rotation.
  function packSheet(items, W, H, budget) {
    const bw = W + GAP, bh = H + GAP;
    const order = [...items].sort((a, b) => b.fw * b.fh - a.fw * a.fh);
    if (order.reduce((s, i) => s + (i.fw + GAP) * (i.fh + GAP), 0) > bw * bh + EPS) return null;
    const placed = [], used = order.map(() => false);
    // Any unplaced item may go next: a fixed order would miss packings where a small item comes first.
    const rec = n => {
      if (n === order.length) return true;
      if (budget.left-- <= 0) { budget.exhausted = true; return false; }
      const xs = [...new Set([0, ...placed.map(q => q.x + q.w)])].sort((a, b) => a - b);
      const ys = [...new Set([0, ...placed.map(q => q.y + q.h)])].sort((a, b) => a - b);
      const tried = new Set();
      for (let i = 0; i < order.length; i++) {
        if (used[i]) continue;
        const it = order[i], key = it.fw + 'x' + it.fh;
        if (tried.has(key)) continue;
        tried.add(key);
        used[i] = true;
        for (const rotated of it.fw === it.fh ? [false] : [false, true]) {
          const w = (rotated ? it.fh : it.fw) + GAP, h = (rotated ? it.fw : it.fh) + GAP;
          for (const y of ys) {
            if (y + h > bh + EPS) break;
            for (const x of xs) {
              if (x + w > bw + EPS) break;
              if (placed.some(q => x < q.x + q.w - EPS && q.x < x + w - EPS && y < q.y + q.h - EPS && q.y < y + h - EPS)) continue;
              placed.push({ x, y, w, h, it, rotated });
              if (rec(n + 1)) return true;
              placed.pop();
            }
          }
        }
        used[i] = false;
      }
      return false;
    };
    return rec(0) ? placed.map(q => ({ item: q.it, x: q.x, y: q.y, rotated: q.rotated })) : null;
  }

  // Tries to place every item on at most k sheets.
  function packBins(items, W, H, k, budget) {
    const order = [...items].sort((a, b) => b.fw * b.fh - a.fw * a.fh);
    const cache = new Map();
    const feasible = bin => {
      const key = bin.map(i => i.fw + 'x' + i.fh).sort().join('|');
      if (!cache.has(key)) cache.set(key, packSheet(bin, W, H, budget));
      return cache.get(key) !== null;
    };
    const bins = [];
    const rec = i => {
      if (i === order.length) return true;
      if (budget.left-- <= 0) { budget.exhausted = true; return false; }
      const seen = new Set();
      for (const bin of bins) {
        const key = bin.map(x => x.fw + 'x' + x.fh).sort().join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        bin.push(order[i]);
        if (feasible(bin) && rec(i + 1)) return true;
        bin.pop();
      }
      if (bins.length < k) {
        bins.push([order[i]]);
        if (rec(i + 1)) return true;
        bins.pop();
      }
      return false;
    };
    if (!rec(0)) return null;
    return bins.map(b => packSheet(b, W, H, { left: Infinity }) || cache.get(b.map(i => i.fw + 'x' + i.fh).sort().join('|')));
  }

  // First-fit: always succeeds because a lone piece is known to fit.
  function firstFit(items, W, H) {
    const order = [...items].sort((a, b) => b.fw * b.fh - a.fw * a.fh), bins = [];
    for (const it of order) {
      const bin = bins.find(b => packSheet([...b, it], W, H, { left: 3000 }));
      if (bin) bin.push(it); else bins.push([it]);
    }
    return bins.map(b => packSheet(b, W, H, { left: 200000 }));
  }

  function solve(items, W, H, lower, nodes) {
    let best = firstFit(items, W, H), exhausted = false;
    for (let k = lower; k < best.length; k++) {
      const budget = { left: nodes, exhausted: false };
      const r = packBins(items, W, H, k, budget);
      if (r) { best = r; break; }
      if (budget.exhausted) exhausted = true;
    }
    return { sheets: best, exhausted };
  }

  const fitsWhole = (pc, W, H, p) => {
    const { fw, fh } = dims(pc, p);
    return (fw <= W + EPS && fh <= H + EPS) || (fh <= W + EPS && fw <= H + EPS);
  };
  const wholePiece = pt => ({ id: pt.id, name: pt.name, sw: pt.w, sh: pt.h });

  // A pattern larger than the sheet: alone, in the orientation showing most of it, top edge kept.
  // The rest runs past the printable area and is clipped; patterns are never cut across sheets.
  function croppedSheet(t, p, W, H, margin) {
    const aw = t.w * p, ah = t.h * p + CAPTION;
    const visible = (w, h) => Math.min(w, W) * Math.min(h, H);
    const rotated = visible(ah, aw) > visible(aw, ah) + EPS;
    return [{
      ...wholePiece(t), rotated, cropped: true,
      x: margin + (rotated ? Math.min(0, W - ah) : 0), y: margin,
      captionWidth: Math.min(aw, rotated ? H : W),
    }];
  }

  // Patterns printed a different number of times never share a sheet, so nothing is reprinted needlessly.
  function computeLayout({ patterns, pixel: p, pageW, pageH, margin }) {
    const W = pageW - 2 * margin, H = pageH - 2 * margin;
    if (W <= 0 || H <= 0) return { error: 'noArea' };
    const out = { sheets: [], oversize: [] };
    for (const copies of [...new Set(patterns.map(t => t.copies))].sort((a, b) => a - b)) {
      const group = patterns.filter(t => t.copies === copies);
      const fit = group.filter(t => fitsWhole(wholePiece(t), W, H, p));
      if (fit.length) {
        // At most 4 items and an unlimited budget: this is the true minimum.
        const items = fit.map(wholePiece).map(pc => ({ ...dims(pc, p), pc }));
        for (const s of solve(items, W, H, 1, Infinity).sheets) {
          out.sheets.push({ copies, pieces: s.map(q => ({ ...q.item.pc, x: q.x + margin, y: q.y + margin, rotated: q.rotated })) });
        }
      }
      for (const t of group.filter(t => !fit.includes(t))) {
        out.sheets.push({ copies, cropped: true, pieces: croppedSheet(t, p, W, H, margin) });
      }
    }
    out.oversize = patterns.filter(t => out.sheets.some(s => s.cropped && s.pieces[0].id === t.id)).map(t => t.name);
    return out;
  }

  // Largest pixel size at which every pattern fits this sheet whole.
  function maxPixel({ patterns, pageW, pageH, margin }) {
    const W = pageW - 2 * margin, H = pageH - 2 * margin;
    const best = t => Math.max(Math.min(W / t.w, (H - CAPTION) / t.h), Math.min(H / t.w, (W - CAPTION) / t.h));
    return Math.min(...patterns.map(best));
  }

  // Maps pattern pixels (crop-relative) to page mm. A rotated piece turns clockwise, caption on the right.
  function pieceMatrix(pc, p) {
    return pc.rotated ? [0, p, -p, 0, pc.x + pc.sh * p, pc.y] : [p, 0, 0, p, pc.x, pc.y + CAPTION];
  }
  // Same frame in mm, for captions; caption baseline sits just above the top edge of the art.
  function captionMatrix(pc, p) {
    return pc.rotated ? [0, 1, -1, 0, pc.x + pc.sh * p, pc.y] : [1, 0, 0, 1, pc.x, pc.y + CAPTION];
  }

  function textWidth(text, size, font) {
    let w = 0;
    for (const ch of text) w += (font.glyphs[ch] || font.glyphs[' ']).a;
    return w * size / font.unitsPerEm;
  }
  // Longest caption that fits the visible width of the piece, or null.
  function fitCaption(pc, p, font) {
    const maxW = pc.captionWidth ?? pc.sw * p, size = 2.8, minSize = 1.2;
    const name = pc.name + (pc.cropped ? ' (обрезано)' : '');
    for (const text of [`${name} · ${pc.sw}×${pc.sh} пикс. · пиксель ${p} мм`, name]) {
      if (textWidth(text, size, font) <= maxW) return { text, size };
    }
    const scaled = size * maxW / textWidth(name, size, font);
    return scaled >= minSize ? { text: name, size: scaled } : null;
  }
  // Glyph outlines as path commands in mm, baseline at (x, y).
  function textCommands(text, size, x, y, font) {
    const k = size / font.unitsPerEm, out = [];
    let pen = x;
    for (const ch of text) {
      const g = font.glyphs[ch] || font.glyphs[' '];
      for (const c of g.p) {
        const o = [c[0]];
        for (let i = 1; i < c.length; i += 2) o.push(pen + c[i] * k, y + c[i + 1] * k);
        out.push(o);
      }
      pen += g.a * k;
    }
    return out;
  }

  const api = { CAPTION, GAP, computeLayout, maxPixel, packSheet, pieceMatrix, captionMatrix, fitCaption, textCommands, textWidth, fitsWhole, wholePiece };
  if (typeof module !== 'undefined') module.exports = api; else root.Layout = api;
})(this);
