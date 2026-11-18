# Research Catalogue tools

Small, free tools for working with expositions in [Research Catalogue](https://www.researchcatalogue.net/) (RC), made by artist-researcher Rut Karin Zettergren. Everything runs locally in your browser; nothing is sent anywhere.

## Ritlager (“drawing layer”)

A bookmarklet that puts a transparent drawing layer over a Research Catalogue page, so you can draw by hand with a pen tablet and export the drawing as a PNG to place back into the exposition, over or under other objects.

**Install:** open the install page (`index.html`, served via GitHub Pages) and drag the button to your bookmarks bar. Then click the bookmark on any RC page.

Features:

- Pen, brush, line (with arrowhead) and eraser; pen styles: round, square, flat, pencil, marker, ink, watercolour
- Pressure sensitivity with a pen tablet, stabilising, sharp–soft, contrast, thin-line modes
- Export PNG with transparent, white or custom background, or on top of a screenshot of the page
- Select tool: move, cut, copy and paste strokes (Ctrl+X/C/V), undo/redo
- Layers with per-layer opacity, export as one image or one PNG per layer
- Foldable toolbar sections; remembers your settings; one-click presets and saved colours
- Pipette with hex and rgb (screen picker in Chrome/Edge)
- Autosave, named versions, editable project files, open an old PNG as underlay
- Save into a chosen folder (Chrome/Edge)

Source: `ritlager/overlay.js` (readable) and `ritlager/overlay.min.js` (what the bookmark contains).

Tested in a simulated browser only; real-world reports from Chrome, Edge and Firefox with a tablet are very welcome as issues.

## License

MIT, see `LICENSE`. Use, modify and share freely.
