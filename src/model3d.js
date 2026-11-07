// 3D simulation of the finished model, built from CSS 3D planes. Units are texture pixels.
(function (root) {
  const S = 6; // screen px per texture pixel
  const BARE = '#d9d6ca'; // uncovered model surface
  // Body from SnifferModel: 25 wide, 40 long. Side art is 20 tall; hair spans rows 17-29 just
  // behind it, so the teeth overlap the fur. The head net folds into a 13x14x9 box on the front.
  const W = 25, L = 40, SIDE_H = 20, HAIR_TOP = 17, HAIR_H = 12, INSET = 0.5;
  const HEAD = { x: 6, y: 14, z: L, w: 13, h: 14, d: 9 };
  const SHADE = { top: 1.08, front: 1, back: 0.8, left: 0.9, right: 0.9, bottom: 0.65 };

  function art(grid, x0, y0, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const col = grid[y0 + y][x0 + x];
      if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }
    return c;
  }
  function bare() {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const g = c.getContext('2d');
    g.fillStyle = BARE; g.fillRect(0, 0, 1, 1);
    return c;
  }

  // Each face: local top-left corner and rotation. Right and down in the art stay right and down
  // when seen from outside; top and bottom faces touch the front with their adjoining art row.
  function placeBox(model, { x, y, z, w, h, d }, faces) {
    const spec = {
      front: [x, y, z + d, '', w, h],
      back: [x + w, y, z, 'rotateY(180deg)', w, h],
      right: [x + w, y, z + d, 'rotateY(90deg)', d, h],
      left: [x, y, z, 'rotateY(-90deg)', d, h],
      top: [x, y, z, 'rotateX(90deg)', w, d],
      bottom: [x, y + h, z + d, 'rotateX(-90deg)', w, d],
    };
    for (const [name, c] of Object.entries(faces)) {
      const [px, py, pz, rot, fw, fh] = spec[name];
      c.style.width = fw * S + 'px';
      c.style.height = fh * S + 'px';
      c.style.transform = `translate3d(${px * S}px, ${py * S}px, ${pz * S}px) ${rot}`;
      c.style.filter = `brightness(${SHADE[name]})`;
      model.append(c);
    }
  }

  // grids: art per part; copies: how many of each part were printed.
  function build(model, grids, copies) {
    const around = ['right', 'left', 'front', 'back']; // flanks first, then the ends
    const wrap = (id, y0, h) => Object.fromEntries(around.map((face, i) => {
      const long = face === 'left' || face === 'right';
      return [face, i < copies[id] ? art(grids[id], 0, y0, long ? L : W, h) : bare()];
    }));
    model.replaceChildren();
    placeBox(model, { x: INSET, y: HAIR_TOP, z: INSET, w: W - 2 * INSET, h: HAIR_H, d: L - 2 * INSET }, {
      ...wrap('hair', 0, HAIR_H), bottom: bare(),
    });
    placeBox(model, { x: 0, y: 0, z: 0, w: W, h: SIDE_H, d: L }, {
      ...wrap('side', 0, SIDE_H), top: copies.back ? art(grids.back, 0, 0, W, L) : bare(),
    });
    if (copies.head) {
      const n = grids.head, { w, h, d } = HEAD;
      placeBox(model, HEAD, {
        top: art(n, d, 0, w, d), front: art(n, d, d, w, h), left: art(n, 0, d, d, h),
        right: art(n, d + w, d, d, h), bottom: art(n, d, d + h, w, d),
      });
    }
  }

  function attach(viewer, model) {
    let yaw = -35, pitch = -22, drag = null;
    const cx = W / 2 * S, cy = (HAIR_TOP + HAIR_H) / 2 * S, cz = (L + HEAD.d) / 2 * S;
    const apply = () => {
      model.style.transform = `rotateX(${pitch}deg) rotateY(${yaw}deg) translate3d(${-cx}px, ${-cy}px, ${-cz}px)`;
    };
    const turn = (dy, dp) => { yaw += dy; pitch = Math.max(-85, Math.min(85, pitch + dp)); apply(); };
    viewer.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; viewer.setPointerCapture(e.pointerId); });
    viewer.addEventListener('pointermove', e => {
      if (!drag) return;
      turn((e.clientX - drag[0]) * 0.5, -(e.clientY - drag[1]) * 0.5);
      drag = [e.clientX, e.clientY];
    });
    for (const t of ['pointerup', 'pointercancel']) viewer.addEventListener(t, () => { drag = null; });
    viewer.addEventListener('keydown', e => {
      const step = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] }[e.key];
      if (step) { e.preventDefault(); turn(...step); }
    });
    apply();
  }

  root.Model3D = { build, attach, size: p => ({ w: W * p, l: (L + HEAD.d) * p, h: (HAIR_TOP + HAIR_H) * p }) };
})(this);
