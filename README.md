# Research Catalogue tools

Small, free tools for working with webpages and [Research Catalogue](https://www.researchcatalogue.net/) (RC), designed by artist-researcher Rut Karin Zettergren. Everything runs locally in your browser; nothing is sent anywhere.

## Ritlager (“drawing layer”)

Ritlager is a browser tool (a bookmarklet) for drawing over web pages. It is designed for creating freehand drawings and visuals that can be exported for use on webpages and Research Catalogue. It puts a transparent drawing layer over any page, so you can draw by hand with a pen tablet and place the result back into the page or exposition, over or under other objects.

**Exports:** images as **PNG** (transparent background), **JPG** and **TIFF** (with DPI), at 1×–6× resolution, one image or one file per layer; animations as **GIF** or **WebM video**. RC accepts png, jpg, tiff, svg and gif in its media repository.

**Install:** open the install page (`index.html`, served via GitHub Pages) and drag the button to your bookmarks bar. Then click the bookmark on any RC page.

Features:

- Pen, brush, line (with arrowhead) and eraser; pen styles: round, square, flat, pencil, marker, ink, watercolour
- Pressure sensitivity with a pen tablet, stabilising, sharp–soft, contrast, thin-line modes
- Export PNG with transparent, white or custom background, or on top of a screenshot of the page
- Effects menu: Dodge and Burn brushes; layer effects Blur, Glow and Drop shadow
- Export as PNG, JPG or TIFF at 1×–6× resolution, with DPI
- Retouch brushes: Blur, Sharpen, Smudge, Clone
- Animate menu: replay or hand-made frames, preview, remove frames, save GIF or WebM video
- Airbrush (soft spray with hardness, build-up and opacity)
- Select tool (pick, rectangle, lasso): move, resize, flip, duplicate, cut, copy, paste (Ctrl+X/C/V), undo/redo
- Layers with opacity and blend modes (multiply, screen, overlay …), export as one image or one PNG per layer
- Images: import, drop or paste pictures; Cut out (rectangle or lasso, erase inside or outside, soft edge)
- Text menu: fonts incl. your own font files, colour, outline, shadow, align, wrap, spacing; transform (resize, rotate, numeric scale) for selections and whole layers
- Nested foldable menus (Draw, Edit, Layers, Export and save); remembers your settings; one-click presets and saved colours
- Pipette with hex and rgb (screen picker in Chrome/Edge)
- Autosave, named versions, editable project files, open an old PNG as underlay
- Save into a chosen folder (Chrome/Edge)

Source: `ritlager/overlay.js` (readable) and `ritlager/overlay.min.js` (what the bookmark contains).

## License

MIT, see `LICENSE`. Use, modify and share freely.
