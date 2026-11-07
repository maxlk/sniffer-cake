# Sniffer papercraft PDF generator — plan

## Requirements (from the user, verbatim intent)
- Single-page HTML app, no backend, UI fully in Russian, generates printable PDFs to cut and glue onto a 3D Sniffer model.
- Download the real Minecraft Sniffer PNG texture and convert it to SVG for perfect quality.
- User chooses "pixel" size, default 10 mm.
- PDF holds four rectangles, each its own pattern; user cuts as much as wanted from each:
  back (green), side (green), red hairs, head = yellow rectangle with a red line above the lower fourth
  (mouth) and two small red rectangles in the middle.
- When the four rectangles do not fit into a single PDF, split them across the minimal number of PDF files.
- HTML filename contains the version; every new version is a new file, never an overwrite.

## Collected facts
- Source: official Mojang client jar 26.3 (sha1 e877b6a0…, hash verified), `assets/minecraft/textures/entity/sniffer/sniffer.png`,
  192x192, 40 colours. Stored as `assets/sniffer.png`.
- Geometry from `SnifferModel.createBodyLayer` in the same jar. Box UV layout for texOffs(u,v), size (w,h,d):
  top (u+d, v) w×d; side (u, v+d) d×h; front (u+d, v+d) w×h.
  - Green shell texOffs(62,0) 25×24×40 → top (102,0) 25×40; side (62,40) 40×24 (ragged transparent bottom edge).
  - Red body texOffs(62,68) 25×29×40 → side (62,108) 40×29 (flat dark red, fur from row ~17, ragged bottom edge).
  - Nose front 13×2 + beak front 13×12 → the front of the head is 13×14.
- In the real texture the mouth is at ~57% height and nostrils at the very top, which differs from the user's head description.

## Patterns (texture pixels)
| id | Russian name | size | source |
|---|---|---|---|
| back | Спина | 25×40 | texture crop (102,0) |
| side | Бок | 40×20 | texture crop (62,40); rows 20–23 are fully transparent, trimmed |
| hair | Красная шерсть | 40×12 | texture crop (62,125): fur rows only, the 17 rows above are one flat colour |
| head | Голова | 13×16 | synthesised to the user's description with palette colours |

Head: solid yellow #fac937; mouth = full-width row 11 in #812118, so rows 12–15 are exactly the lower fourth;
nostrils = 2×2 at columns 3–4 and 8–9, rows 7–8 (centred both ways), same red.
Transparent texture pixels stay unprinted (paper shows, ragged edge is cut along).

## Architecture
Zero runtime dependencies; output is one self-contained HTML that works from file://.
- `tools/convert-texture.js` (Node): decodes PNG, writes `assets/sniffer.svg` (full texture) and `assets/patterns/{back,side,hair,head}.svg`.
  SVG = one `<rect>` per horizontal same-colour run, integer coordinates in texture pixels. Lossless: test re-rasterises SVG and compares with PNG.
- `tools/build-font.js`: opentype.js + PT Sans (OFL) → `src/glyphs.json` outline subset (Cyrillic, digits, punctuation). Needed because PDF
  base fonts have no Cyrillic; captions are drawn as vector paths, so no font embedding.
- `src/layout.js`: pure packing logic (Node-testable). `src/pdf.js`: hand-written PDF 1.4 writer. `src/app.js`: UI. `src/template.html`.
- `tools/build.js`: inlines everything into `sniffer-cake-v<VERSION>.html` in the repo root. VERSION comes from `VERSION` file.
  Build FAILS if the target file already exists, so a release can never be overwritten.
- The app reads the inline `<svg>` patterns: same SVG used for preview and PDF.

## UI (Russian)
Inputs: размер пикселя (мм, default 10), формат листа (A4 default, A3, A2, A1, A0, свой размер W×H), поля (default 5 mm), зазор (default 3 mm).
Output: live sheet previews, count of files, a download button per file + "Скачать все". Note about printing at 100% scale.
Input validation with Russian error messages (non-positive, or a sheet too small for even one pixel).

## Layout algorithm
Footprint of a piece = w × (h + 4 mm caption), footprints separated by gap, inside the printable area. Pieces may rotate 90°.
1. If every whole rectangle fits a sheet: exact: enumerate partitions of 4 items; a subset is feasible if exhaustive placement over
   normal positions (sums of widths/heights) with rotations succeeds. Minimal bin count is guaranteed.
2. Oversize rectangle (the default! 10 mm on A4: back 250×400, side 400×240, hair 400×290 mm do not fit): split on pixel boundaries into a
   grid of pieces labelled e.g. "Спина 2/4". This is the only way to honour the default size on A4, and cutting is expected anyway.
   Candidates: Pareto-minimal (cols, rows) per pattern, in balanced and greedy-full-tiles cut modes. Search combinations, bin-pack each
   with DFS under a deterministic node budget, stop early at lower bound ceil(total area / sheet area).
3. One PDF file = one page = one sheet, as the requirement counts files. Names `sniffer-1-iz-7-A4-10mm.pdf`.

## PDF rendering details
- Vector fills only. mm → pt via a `cm` matrix; MediaBox from exact mm, so print scale is exact.
- Seam prevention: adjacent fills in PDF viewers show hairlines. Paint pixels in raster order, each run extended by a small overlap
  to the right and down only where the neighbour is opaque; later paint covers the overlap. Edges against transparent stay exact.
- Caption on each piece: name, piece index, size, pixel size, rotated with the piece.

## Testing
- Node tests: SVG round trip equals PNG; head rows/columns; packer vs. brute force; no overlap; all pieces inside printable area;
  tiles cover each pattern exactly once; default A4 and fits-on-one-sheet cases.
- Browser: headless Chrome runs the built file from file://, downloads PDFs; render with macOS `sips` to check scale and no seams.

## Delivery
`sniffer-cake-v1.0.0.html`, README (Russian usage + build notes), commit, push to origin main.

## Changes after cold review
- Rectangles stay whole whenever the sheet allows; exact partition search gives the minimal file count. Splitting is only a fallback for
  rectangles larger than the sheet, shown as an explicit warning with the smallest format that keeps everything whole.
- One file = one page = one sheet (a multi-page PDF would make "minimal files" trivially 1).
- Crops trimmed (see table). Head is 13×16 so the mouth sits literally above the lower fourth.
- "Minimal" is claimed only when proven: whole layouts by exhaustive search, split layouts only when reaching the bound
  ceil(total px / (floor(W/p) * floor(H/p))). Otherwise the UI says "best found".
- Split search also tries extra-cut candidates, not just fewest tiles. Cap at 40 files with a Russian error; input debounced.
- "Скачать все" = store-only ZIP; per-file buttons stay.
- Captions never widen a footprint: full text, then short text, then scaled down, then omitted. Tiles carry row/column; caption marks the top edge.
- Seams: overlap is half a texture pixel, always repainted by the neighbour; runs break where opacity below changes; overlaps never cross a tile
  boundary; right and down extensions are separate rects so diagonals never bleed. Preview uses crispEdges. Check with two renderers (Quartz, pdf.js).
- PDF: quadratics to cubics, nonzero fill, ASCII-only bytes, plain decimals, custom sheets limited to 5080 mm.
- Gap field cut (fixed 3 mm). Comma decimals accepted. UI note: print "Бок" twice for both flanks.
- Rejected: dropping commit/push (explicitly requested).

## Changes during implementation
- `packSheet` tries every placement order, checked against brute force; a fixed order missed valid packings.
- Rectangles that fit a sheet are never cut unless cutting strictly saves a file; the first version cut the head in two on A4.

## v1.1.0: head as a net
Replaces the synthesised 13×16 head. Head = net of the yellow snout (nose + lower beak boxes) from original pixels, 31×32: top, left, front,
right, bottom; the sixth face sits against the head. Orientation from `ModelPart$Cube`: sides and top join the front as stored; the bottom
face is stored with its front edge last, so it is flipped vertically. Corners mirror the top/bottom faces outward; top corners use only the
outer 3 columns so no false nostrils appear.
