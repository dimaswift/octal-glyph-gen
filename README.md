# Octal Glyph Studio

A React + TypeScript web tool for designing and rendering octal glyph SVGs.

## Features

- Edit 8 reusable digit arms for octal digits `0` through `7`.
- Switch between six species instances: tripod, tetrapod, pentapod, hexapod, heptapod, and octapod.
- Edit each species' core, inner ring, and LSB-to-MSB socket order while keeping arms shared across the font.
- Generate the outer core from digit count, core radius, socket width, and angle offset while keeping the optional hollow core hole editable.
- Switch to a custom core mode to drag individual socket endpoints with grid snapping.
- Create a ring-style hollow core by insetting the generated outer core with a chosen thickness.
- Snap editable points to a configurable square, diagonal, or triangular grid.
- Preview a generated SVG for any octal value.
- Enter preview values as octal or decimal, with the paired field kept in sync.
- Configure how many octal digits belong to one glyph before values stack; this also determines the core polygon type and socket step.
- Open a fullscreen paged atlas rendered with the current glyph font, including ordered and shuffled paging across the full glyph range.
- Tune atlas cell size, hide/show atlas labels, and switch between light and dark themes.
- Export/import the font JSON used by the renderer.
- Copy or download the rendered SVG.

## Glyph Model

The exported JSON stores:

- `species`: six per-family configurations keyed by digit count, each with `name`, `digitOrder`, and `core`.
- `species.*.core.polygon`: the generated outer core polygon for that species.
- `species.*.core.holes`: optional inner polygons subtracted from the species core, allowing ring-like hollow cores.
- `species.*.core.sockets`: socket edge segments used as the placement frames for arms.
- `species.*.core.customCore`: whether sockets are generated from core settings or manually positioned.
- `species.*.core.digitsPerGlyph`: how many octal digits are assembled into one glyph for that species.
- `species.*.core.coreRadius`: distance from the core origin to each generated socket side.
- `species.*.core.socketWidth`: distance between the two canonical socket endpoints.
- `species.*.core.angleOffsetDeg`: rotation applied to the generated core and first socket.
- `species.*.core.rotationStepDeg`: computed as `360 / species.*.core.digitsPerGlyph`.
- `renderer.gridSize` and `renderer.paddingCells`: render padding stored as a constant number of grid cells around a fixed core-centered glyph frame.
- `armsCoordinateMode`: currently `socket`, meaning arm coordinates are stored in the socket's local frame.
- `arms`: open polygon point lists for digits `0` through `7`, relative to the socket center and outward direction.
- `core`: a compatibility mirror of the currently selected default species core.
- `defaultSpeciesDigits`: the species digit count the studio should treat as the default editing instance.

Family names follow this convention: `3` tripod, `4` tetrapod, `5` pentapod, `6` hexapod, `7` heptapod, `8` octapod.

Each species also carries a `digitOrder` sequence. It is indexed by socket order starting from the top and moving clockwise, and each value points into the padded octal string with `0` meaning MSB and the last index meaning LSB. For example, octapod `76543210` matches the current top-LSB clockwise behavior.

The renderer maps each arm from socket-local coordinates into the current socket frame, closes that open polygon at the socket edge, then unions all source polygons with `polygon-clipping`. The resulting SVG path is emitted as filled polygon geometry rather than strokes. Each single glyph uses a fixed viewBox computed from all possible arms in the active species, rounded to grid cells and centered on `core.origin`, so sparse and dense glyphs share the same scale.

## Development

```bash
npm install
npm run dev
```

Build and lint:

```bash
npm run build
npm run lint
```

## Standalone Octal Glyph Library

The project includes a standalone browser/Node bundle at `octal-glyph.js`. It embeds the current default font from `fonts/octal-glyph.json` and bundles the polygon union renderer, so it can be copied as one file.

Rebuild it after source changes:

```bash
npm run build:lib
```

Browser usage:

```html
<script src="./octal-glyph.js"></script>
<div id="glyph"></div>
<script>
  document.getElementById('glyph').innerHTML =
    OctalGlyph.renderSvg('112345', { digitsPerGlyph: 6 })

  document.getElementById('glyph').innerHTML =
    OctalGlyph.renderSvg('262143', { digitsPerGlyph: 6, inputBase: 'decimal' })

  // Optional custom font from a file input, URL, JSON string, or object.
  const font = await OctalGlyph.loadFont(fileInput.files[0])
  document.getElementById('glyph').innerHTML =
    OctalGlyph.renderSvg('777777', { font, digitsPerGlyph: 7 })
</script>
```

Node / ESM usage:

```js
await import('./octal-glyph.js')
const { renderSvg, loadFont, decimalToOctalString } = globalThis.OctalGlyph

const svg = renderSvg(262143, { digitsPerGlyph: 6 })
const octal = decimalToOctalString('262143')

async function renderCustom() {
  const font = await loadFont('./my-font.json')
  return renderSvg('112345', { font, digitsPerGlyph: 6 })
}
```

String values are read as octal unless `inputBase: 'decimal'` is provided. Number and bigint values are treated as decimal and converted to octal first.
Padding defaults to `font.renderer.gridSize * font.renderer.paddingCells`, and can also be overridden per render with `padding`, `gridSize`, or `paddingCells`.
