// Sheet layout: pure logic, no DOM. All lengths in mm, pattern sizes in texture pixels.
(function (root) {
  const CAPTION = 4;   // strip above each piece for its caption
  const GAP = 3;       // distance between pieces
  const MAX_FILES = 40;
  const MAX_COMBOS = 150; // cut combinations tried before settling for the best found
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
  const wholePiece = pt => ({ id: pt.id, name: pt.name, sx: 0, sy: 0, sw: pt.w, sh: pt.h, row: 1, rows: 1, col: 1, cols: 1 });

  const greedyCuts = (len, max) => { const r = []; for (let l = len; l > 0; l -= max) r.push(Math.min(l, max)); return r; };
  const balancedCuts = (len, n) => Array.from({ length: n }, (_, i) => Math.floor(len / n) + (i < len % n ? 1 : 0));

  function tiles(pt, widths, heights) {
    const out = [];
    let sy = 0;
    heights.forEach((sh, r) => {
      let sx = 0;
      widths.forEach((sw, c) => {
        out.push({ id: pt.id, name: pt.name, sx, sy, sw, sh, row: r + 1, rows: heights.length, col: c + 1, cols: widths.length });
        sx += sw;
      });
      sy += sh;
    });
    return out;
  }

  // Ways of cutting one pattern, on pixel boundaries, into pieces that fit a sheet.
  function cutOptions(pt, W, H, p) {
    const limits = [
      [Math.floor((W + EPS) / p), Math.floor((H - CAPTION + EPS) / p)],
      [Math.floor((H + EPS) / p), Math.floor((W - CAPTION + EPS) / p)],
    ];
    const found = new Map();
    const add = (ws, hs) => {
      if (ws.some(v => v <= 0) || hs.some(v => v <= 0)) return;
      const t = tiles(pt, ws, hs);
      if (!t.every(pc => fitsWhole(pc, W, H, p))) return;
      const key = t.map(pc => pc.sw + 'x' + pc.sh).sort().join(',');
      if (!found.has(key)) found.set(key, t);
    };
    for (const [tw, th] of limits) {
      if (tw <= 0 || th <= 0) continue;
      const c = Math.ceil(pt.w / tw), r = Math.ceil(pt.h / th);
      add(greedyCuts(pt.w, tw), greedyCuts(pt.h, th));
      add(greedyCuts(pt.w, tw), balancedCuts(pt.h, r));
      add(balancedCuts(pt.w, c), greedyCuts(pt.h, th));
      add(balancedCuts(pt.w, c), balancedCuts(pt.h, r));
      add(balancedCuts(pt.w, c + 1), balancedCuts(pt.h, r));
      add(balancedCuts(pt.w, c), balancedCuts(pt.h, r + 1));
    }
    return [...found.values()].sort((a, b) => a.length - b.length);
  }

  function computeLayout({ patterns, pixel: p, pageW, pageH, margin }) {
    const W = pageW - 2 * margin, H = pageH - 2 * margin;
    const oneFits = (W >= p - EPS && H >= p + CAPTION - EPS) || (H >= p - EPS && W >= p + CAPTION - EPS);
    if (!oneFits) return { error: 'tooSmall' };
    const totalPx = patterns.reduce((s, t) => s + t.w * t.h, 0);
    const capacity = Math.floor((W + EPS) / p) * Math.floor((H + EPS) / p);
    const lower = Math.ceil(totalPx / capacity);
    const pieceItems = pieces => pieces.map(pc => ({ ...dims(pc, p), pc }));
    const finish = (sheets, extra) => ({
      sheets: sheets.map(s => ({
        pieces: s.map(q => ({ ...q.item.pc, x: q.x + margin, y: q.y + margin, rotated: q.rotated })),
      })),
      lowerBound: lower,
      ...extra,
    });

    const whole = patterns.map(wholePiece);
    if (whole.every(pc => fitsWhole(pc, W, H, p))) {
      // At most 4 items: unlimited budget, so the result is the true minimum for whole rectangles.
      const { sheets } = solve(pieceItems(whole), W, H, 1, Infinity);
      return finish(sheets, { split: [], minimal: true });
    }

    if (lower > MAX_FILES) return { error: 'tooMany', lowerBound: lower };
    const search = options => {
      let combos = [[]]; // combinations of cuts, fewest pieces first
      for (const opts of options) {
        const next = [];
        for (const c of combos) for (const o of opts) next.push([...c, o]);
        combos = next.sort((x, y) => x.flat().length - y.flat().length).slice(0, MAX_COMBOS);
      }
      let found = null;
      for (const combo of combos) {
        const r = solve(pieceItems(combo.flat()), W, H, lower, 4000);
        if (!found || r.sheets.length < found.sheets.length) found = r;
        if (found.sheets.length <= lower) break;
      }
      return found;
    };
    // Only oversize rectangles get cut. Cutting one that fits is accepted only if it saves a file.
    const cuts = patterns.map(t => cutOptions(t, W, H, p));
    let best = search(patterns.map((t, i) => fitsWhole(wholePiece(t), W, H, p) ? [[wholePiece(t)]] : cuts[i]));
    if (best.sheets.length > lower) {
      const freer = search(cuts);
      if (freer.sheets.length < best.sheets.length) best = freer;
    }
    if (best.sheets.length > MAX_FILES) return { error: 'tooMany', lowerBound: best.sheets.length };
    const cutIds = new Set(best.sheets.flat().filter(q => q.item.pc.rows * q.item.pc.cols > 1).map(q => q.item.pc.id));
    const split = patterns.filter(t => cutIds.has(t.id)).map(t => t.name);
    return finish(best.sheets, { split, minimal: best.sheets.length <= lower });
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
  // Longest caption that fits the width of the piece, or null.
  function fitCaption(pc, p, font) {
    const maxW = pc.sw * p, size = 2.8, minSize = 1.2;
    const tiled = pc.rows * pc.cols > 1;
    const full = pc.name + (tiled ? `, ряд ${pc.row}/${pc.rows}, колонка ${pc.col}/${pc.cols}` : '');
    const short = pc.name + (tiled ? ` ${pc.row}/${pc.rows}, ${pc.col}/${pc.cols}` : '');
    const tiny = tiled ? `${pc.row}/${pc.rows}, ${pc.col}/${pc.cols}` : pc.name;
    for (const text of [`${full} · ${pc.sw}×${pc.sh} пикс. · пиксель ${p} мм`, full, short, tiny]) {
      if (textWidth(text, size, font) <= maxW) return { text, size };
    }
    const scaled = size * maxW / textWidth(tiny, size, font);
    return scaled >= minSize ? { text: tiny, size: scaled } : null;
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

  const api = { CAPTION, GAP, MAX_FILES, computeLayout, packSheet, pieceMatrix, captionMatrix, fitCaption, textCommands, textWidth, fitsWhole, wholePiece };
  if (typeof module !== 'undefined') module.exports = api; else root.Layout = api;
})(this);
