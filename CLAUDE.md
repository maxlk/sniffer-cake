# Sniffer cake

Single-file web app that generates printable PDFs of Minecraft Sniffer patterns, to cut and glue onto a 3D model.
Output is `sniffer-cake-v<VERSION>.html`: no backend, no runtime dependencies, works offline from `file://`.

## Commands

```sh
npm test                          # node --test test/*.test.js
npm run build                     # writes sniffer-cake-v<VERSION>.html
node tools/build.js --out <path>  # throwaway preview, ignores the release guard
npm run convert                   # assets/sniffer.png -> assets/sniffer.svg, assets/patterns/*.svg
```

The project has no npm dependencies. Tests need only Node.

## Rules

- **Every change to the app is a new version.** Bump `VERSION`, then build. The build refuses to overwrite an existing release, and released HTML files are never edited or deleted. Use `--out` while iterating, so the versioned file is built once, at the end.
- **UI text is Russian.** This includes status messages and errors.
- **The output stays one self-contained file.** No CDN, no external fonts, no libraries. New source files must be inlined through a slot in `src/template.html` and `tools/build.js`.
- **Printed sheets hold art only.** No text, captions or marks.
- **A pattern is never split between sheets.** If it does not fit, it is centred alone on its sheet, clipped at the printable area, with a red warning, and download stays available.
- **Only say "minimal" when it is proven.** The search has a node budget, so `minimal` is false if it ran out.

## Layout

- `src/layout.js`: pure logic, no DOM. Packing, copy units, layout modes, regions, matrices.
- `src/pdf.js`: hand-written PDF 1.4 and store-only ZIP, plus SVG parsing and pattern continuation.
- `src/app.js`: UI. `src/model3d.js`: CSS 3D preview. `src/template.html`, `src/style.css`.
- `tools/convert-texture.js`: the patterns are defined here. `tools/build.js`: pattern metadata (`copies`, `group`, `mirror`, `turn`).
- `PLAN.md`: design history. Later sections supersede earlier ones.

`src/layout.js` and `src/pdf.js` load both in Node and in the browser, so keep them free of DOM calls.

## Domain facts

- `assets/sniffer.png` comes from the official Minecraft 26.3 client jar. UV regions and geometry come from `SnifferModel` and `ModelPart$Cube` in that jar.
- Patterns in texture pixels: back 25×40, side 40×20, hair 40×12, head 31×32.
- The head is a net of the yellow snout (nose + lower beak), not the dark head box. The bottom face is stored flipped in the texture, so the net reverses it to fold correctly.
- Default copies: back 1, head 1, side 4, hair 4, because the Sniffer has four sides.
- A pair is two copies of side or hair, mirrored across their top edges with no gap.
- With fill on, each sheet holds one part, centred, continued by reflection to the margins. Side, hair and head turn 90° first, unless only upright fits.

## PDF pitfalls

- Pixels are painted in raster order with a half-pixel overlap into opaque neighbours. Removing this brings back hairline seams in viewers.
- A filled sheet can reach a million ops, so never spread op lists into call arguments.
- The PDF must stay pure ASCII: xref offsets are computed from string length.

## Verifying

Unit tests do not cover the UI or rendering. For visual changes, run the built file in a real browser from `file://` and render the downloaded PDFs. The app's preview uses a different code path from the PDF, so check both.
