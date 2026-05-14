# Octal Glyph Studio

A React + TypeScript web tool for designing and rendering octal glyph SVGs.

## Features

- Edit 8 reusable digit arms for octal digits `0` through `7`.
- Edit the diamond core polygon, optional hollow core hole, and canonical socket endpoints.
- Snap editable points to a configurable square, diagonal, or triangular grid.
- Preview a generated SVG for any octal value.
- Configure how many octal digits belong to one glyph before values stack.
- Display a 16x16 multiplication table rendered with the current glyph font.
- Export/import the font JSON used by the renderer.
- Copy or download the rendered SVG.

## Glyph Model

The exported JSON stores:

- `core.polygon`: the filled diamond/core polygon.
- `core.holes`: optional inner polygons subtracted from the core, allowing ring-like hollow cores.
- `core.socketStart` and `core.socketEnd`: the canonical socket edge for the least-significant digit.
- `core.digitsPerGlyph`: how many octal digits are assembled into one glyph before stacking.
- `core.rotationStepDeg`: clockwise rotation applied for the next digit socket.
- `arms`: open polygon point lists for digits `0` through `7`.

The renderer aligns each arm's first and last point to the socket endpoints, closes that open polygon at the socket edge, rotates it into position, then unions all source polygons with `polygon-clipping`. The resulting SVG path is emitted as filled polygon geometry rather than strokes.

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

## Standalone Hex Glyph Library

The project includes a standalone browser/Node bundle at `octal-glyph-hex.js`. It embeds the hexagon 6-digit font from `fonts/octal-glyph-hex.json` and bundles the polygon union renderer, so it can be copied as one file.

Rebuild it after source changes:

```bash
npm run build:hex-lib
```

Browser usage:

```html
<script src="./octal-glyph-hex.js"></script>
<div id="glyph"></div>
<script>
  document.getElementById('glyph').innerHTML =
    OctalGlyphHex.renderSvg('112345')

  // Optional custom font from a file input, URL, JSON string, or object.
  const font = await OctalGlyphHex.loadFont(fileInput.files[0])
  document.getElementById('glyph').innerHTML =
    OctalGlyphHex.renderSvg('777777', { font })
</script>
```

Node/CommonJS usage:

```js
const OctalGlyphHex = require('./octal-glyph-hex.js')

const svg = OctalGlyphHex.renderSvg(262143)

async function renderCustom() {
  const font = await OctalGlyphHex.loadFont('./my-font.json')
  return OctalGlyphHex.renderSvg('112345', { font })
}
```

String values are read as octal. Number and bigint values are converted to octal first.
