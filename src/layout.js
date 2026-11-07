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
  const wholePiece = pt => ({ id: pt.id, name: pt.name, instance: pt.instance, sw: pt.w, sh: pt.h });

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

  // mode decides how copies reach the paper:
  //   repeat:   one of each pattern; patterns needing the same count share sheets, printed that many times
  //   separate: every copy placed on sheets, groups apart (side and hair never with back or head)
  //   mixed:    every copy placed, anything may share a sheet: fewest sheets
  //   manual:   every copy placed on the sheet given by assign[instance]
  function computeLayout({ patterns, pixel: p, pageW, pageH, margin, mode = 'repeat', assign = {} }) {
    const W = pageW - 2 * margin, H = pageH - 2 * margin;
    if (W <= 0 || H <= 0) return { error: 'noArea' };
    const pts = patterns.filter(t => t.copies > 0);
    const copiesOf = t => Array.from({ length: t.copies }, (_, k) => ({ ...t, instance: `${t.id}-${k + 1}` }));
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
        else omitted.push({ name: it.pc.name, page });
      }
      if (kept.length) {
        sheets.push({ ...placed(packSheet(kept, W, H, { left: 20000 }), 1), page });
        over.forEach(t => omitted.push({ name: t.name, page }));
      } else if (over.length) {
        sheets.push({ ...cropped(over[0], 1), page });
        over.slice(1).forEach(t => omitted.push({ name: t.name, page }));
      }
    };

    if (mode === 'repeat') {
      for (const c of [...new Set(pts.map(t => t.copies))].sort((a, b) => a - b)) {
        pack(pts.filter(t => t.copies === c).map(t => ({ ...t, instance: `${t.id}-1` })), c);
      }
    } else if (mode === 'separate') {
      for (const g of new Set(pts.map(t => t.group))) pack(pts.filter(t => t.group === g).flatMap(copiesOf), 1);
    } else if (mode === 'mixed') {
      pack(pts.flatMap(copiesOf), 1);
    } else {
      const pages = new Map();
      for (const t of pts.flatMap(copiesOf)) {
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
      const key = JSON.stringify(s.pieces.map(pc => [pc.id, pc.x, pc.y, pc.rotated]).sort());
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

  // Maps pattern pixels to page mm. A rotated piece turns clockwise.
  function pieceMatrix(pc, p) {
    return pc.rotated ? [0, p, -p, 0, pc.x + pc.sh * p, pc.y] : [p, 0, 0, p, pc.x, pc.y];
  }

  const api = { GAP, computeLayout, maxPixel, packSheet, pieceMatrix, fitsWhole, wholePiece };
  if (typeof module !== 'undefined') module.exports = api; else root.Layout = api;
})(this);
