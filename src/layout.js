// Sheet layout: pure logic, no DOM. All lengths in mm, pattern sizes in texture pixels.
(function (root) {
  const GAP = 3;       // distance between pieces
  const EPS = 1e-6;
  const SEARCH_NODES = 60000; // per sheet count; past this the result is the best found, not proven

  const dims = (pc, p) => ({ fw: pc.sw * p, fh: pc.sh * p });

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
  // A pair is two copies mirrored across their top edges, with no gap: twice as tall.
  const wholePiece = pt => ({ id: pt.id, name: pt.name, label: pt.label ?? pt.name, instance: pt.instance, pair: !!pt.pair, sw: pt.w, sh: pt.pair ? pt.h * 2 : pt.h });

  // A pattern larger than the sheet: alone, in the orientation showing most of it, top edge kept.
  // The rest runs past the printable area and is clipped; patterns are never cut across sheets.
  function croppedSheet(t, p, W, H, margin) {
    const aw = t.w * p, ah = t.h * p;
    const visible = (w, h) => Math.min(w, W) * Math.min(h, H);
    const rotated = visible(ah, aw) > visible(aw, ah) + EPS;
    return [{
      ...wholePiece(t), rotated, cropped: true,
      x: margin + (rotated ? Math.min(0, W - ah) : 0), y: margin,
    }];
  }

  // Copies as placeable units: mirrorable patterns go in pairs when a pair fits the sheet.
  function listUnits(patterns, p, W, H) {
    return patterns.filter(t => t.copies > 0).flatMap(t => {
      const pairs = t.mirror && fitsWhole(wholePiece({ ...t, pair: true }), W, H, p) ? Math.floor(t.copies / 2) : 0;
      const out = [];
      for (let k = 0; k < pairs; k++) out.push({ ...t, pair: true, instance: `${t.id}-${2 * k + 1}`, label: `${t.name} ${2 * k + 1}–${2 * k + 2}` });
      for (let k = 2 * pairs; k < t.copies; k++) out.push({ ...t, instance: `${t.id}-${k + 1}`, label: t.copies > 1 ? `${t.name} ${k + 1}` : t.name });
      return out;
    });
  }

  // mode decides how copies reach the paper:
  //   repeat:   one unit of each pattern; those printed the same number of times share sheets
  //   separate: every copy placed on sheets, groups apart (side and hair never with back or head)
  //   mixed:    every copy placed, anything may share a sheet: fewest sheets
  //   manual:   every copy placed on the sheet given by assign[instance]
  function computeLayout({ patterns, pixel: p, pageW, pageH, margin, mode = 'repeat', assign = {} }) {
    const W = pageW - 2 * margin, H = pageH - 2 * margin;
    if (W <= 0 || H <= 0) return { error: 'noArea' };
    const pts = patterns.filter(t => t.copies > 0);
    const units = listUnits(pts, p, W, H);
    const fits = t => fitsWhole(wholePiece(t), W, H, p);
    const item = t => { const pc = wholePiece(t); return { ...dims(pc, p), pc }; };
    const placed = (s, copies) => ({ copies, pieces: s.map(q => ({ ...q.item.pc, x: q.x + margin, y: q.y + margin, rotated: q.rotated })) });
    const cropped = (t, copies) => ({ copies, cropped: true, pieces: croppedSheet(t, p, W, H, margin) });
    const sheets = [], omitted = [];
    let minimal = true;

    const pack = (list, copies) => {
      const items = list.filter(fits).map(item);
      if (items.length) {
        const area = items.reduce((s, i) => s + (i.fw + GAP) * (i.fh + GAP), 0);
        const r = solve(items, W, H, Math.ceil(area / ((W + GAP) * (H + GAP)) - EPS), SEARCH_NODES);
        minimal = minimal && !r.exhausted;
        sheets.push(...r.sheets.map(s => placed(s, copies)));
      }
      sheets.push(...list.filter(t => !fits(t)).map(t => cropped(t, copies)));
    };

    // The user chose this sheet: keep what fits, report the rest.
    const packPage = (list, page) => {
      const items = list.filter(fits).map(item).sort((a, b) => b.fw * b.fh - a.fw * a.fh);
      const over = list.filter(t => !fits(t)), kept = [];
      for (const it of items) {
        if (packSheet([...kept, it], W, H, { left: 20000 })) kept.push(it);
        else omitted.push({ name: it.pc.label, page });
      }
      if (kept.length) {
        sheets.push({ ...placed(packSheet(kept, W, H, { left: 20000 }), 1), page });
        over.forEach(t => omitted.push({ name: t.label, page }));
      } else if (over.length) {
        sheets.push({ ...cropped(over[0], 1), page });
        over.slice(1).forEach(t => omitted.push({ name: t.label, page }));
      }
    };

    if (mode === 'repeat') {
      const sets = pts.map(t => {
        const pair = units.some(u => u.id === t.id && u.pair);
        return { ...t, pair, instance: `${t.id}-1`, prints: pair ? Math.ceil(t.copies / 2) : t.copies };
      });
      for (const c of [...new Set(sets.map(t => t.prints))].sort((a, b) => a - b)) pack(sets.filter(t => t.prints === c), c);
    } else if (mode === 'separate') {
      for (const g of new Set(pts.map(t => t.group))) pack(units.filter(t => t.group === g), 1);
    } else if (mode === 'mixed') {
      pack(units, 1);
    } else {
      const pages = new Map();
      for (const t of units) {
        const page = assign[t.instance] || 1;
        pages.set(page, [...(pages.get(page) || []), t]);
      }
      for (const page of [...pages.keys()].sort((a, b) => a - b)) packPage(pages.get(page), page);
    }

    const placement = {};
    sheets.forEach((s, i) => s.pieces.forEach(pc => { placement[pc.instance] = i + 1; }));
    return {
      sheets: mode === 'manual' ? sheets : mergeIdentical(sheets),
      oversize: pts.filter(t => sheets.some(s => s.cropped && s.pieces[0].id === t.id)).map(t => t.name),
      omitted, minimal: mode !== 'manual' && minimal, placement,
    };
  }

  // Identical sheets become one file printed several times.
  function mergeIdentical(sheets) {
    const seen = new Map();
    for (const s of sheets) {
      const key = JSON.stringify(s.pieces.map(pc => [pc.id, pc.pair, pc.x, pc.y, pc.rotated]).sort());
      if (seen.has(key)) seen.get(key).copies += s.copies;
      else seen.set(key, { ...s });
    }
    return [...seen.values()];
  }

  // Largest pixel size at which every pattern fits this sheet whole.
  function maxPixel({ patterns, pageW, pageH, margin }) {
    const W = pageW - 2 * margin, H = pageH - 2 * margin;
    const best = t => Math.max(Math.min(W / t.w, H / t.h), Math.min(H / t.w, W / t.h));
    return Math.min(...patterns.map(best));
  }

  const pageBox = (pc, p) => {
    const [w, h] = pc.rotated ? [pc.sh * p, pc.sw * p] : [pc.sw * p, pc.sh * p];
    return { x0: pc.x, y0: pc.y, x1: pc.x + w, y1: pc.y + h };
  };

  // Where each piece may paint on the page, as rects in mm: its own box inside the printable area and,
  // with fill, the free cells nearest to it. Gaps between different pieces stay white as cutting guides.
  function regions(sheet, { pixel: p, pageW, pageH, margin, fill }) {
    const area = { x0: margin, y0: margin, x1: pageW - margin, y1: pageH - margin };
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    const boxes = sheet.pieces.map(pc => pageBox(pc, p));
    const own = boxes.map(b => [{ x0: Math.max(b.x0, area.x0), y0: Math.max(b.y0, area.y0), x1: Math.min(b.x1, area.x1), y1: Math.min(b.y1, area.y1) }]);
    if (!fill) return own;

    const cuts = (lo, hi, a, b) => [...new Set([area[lo], area[hi], ...boxes.flatMap(q => [q[lo], q[hi], q[lo] - GAP, q[hi] + GAP]).map(v => clamp(v, a, b))])].sort((m, n) => m - n);
    const xs = cuts('x0', 'x1', area.x0, area.x1), ys = cuts('y0', 'y1', area.y0, area.y1);
    const distance = (c, q) => Math.hypot(Math.max(q.x0 - c.x1, c.x0 - q.x1, 0), Math.max(q.y0 - c.y1, c.y0 - q.y1, 0));
    for (let j = 0; j + 1 < ys.length; j++) {
      let run = null; // merge neighbouring cells of a row
      for (let i = 0; i + 1 < xs.length; i++) {
        const c = { x0: xs[i], x1: xs[i + 1], y0: ys[j], y1: ys[j + 1] };
        const cx = (c.x0 + c.x1) / 2, cy = (c.y0 + c.y1) / 2;
        let owner = -1;
        if (!boxes.some(q => cx > q.x0 && cx < q.x1 && cy > q.y0 && cy < q.y1)) {
          const d = boxes.map(q => distance(c, q));
          const near = d.indexOf(Math.min(...d));
          if (!d.some((v, k) => k !== near && v < GAP - EPS)) owner = near;
        }
        if (run && run.owner === owner) run.rect.x1 = c.x1;
        else {
          run = { owner, rect: c };
          if (owner >= 0) own[owner].push(c);
        }
      }
    }
    return own;
  }

  // Pixel range, in the piece's own coordinates, that covers its regions.
  function localBox(pc, p, rects) {
    const x0 = Math.min(...rects.map(r => r.x0)), x1 = Math.max(...rects.map(r => r.x1));
    const y0 = Math.min(...rects.map(r => r.y0)), y1 = Math.max(...rects.map(r => r.y1));
    const [ua, ub, va, vb] = pc.rotated
      ? [(y0 - pc.y) / p, (y1 - pc.y) / p, (pc.x + pc.sh * p - x1) / p, (pc.x + pc.sh * p - x0) / p]
      : [(x0 - pc.x) / p, (x1 - pc.x) / p, (y0 - pc.y) / p, (y1 - pc.y) / p];
    const u = Math.floor(ua + EPS), v = Math.floor(va + EPS);
    return { u, v, cols: Math.ceil(ub - EPS) - u, rows: Math.ceil(vb - EPS) - v };
  }

  // Maps pattern pixels to page mm. A rotated piece turns clockwise.
  function pieceMatrix(pc, p) {
    return pc.rotated ? [0, p, -p, 0, pc.x + pc.sh * p, pc.y] : [p, 0, 0, p, pc.x, pc.y];
  }

  const api = { GAP, computeLayout, listUnits, maxPixel, packSheet, pieceMatrix, regions, localBox, fitsWhole, wholePiece };
  if (typeof module !== 'undefined') module.exports = api; else root.Layout = api;
})(this);
