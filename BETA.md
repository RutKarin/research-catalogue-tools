# Ritlager beta (not published)

The beta lives on the `beta` branch. It does not touch the normal Ritlager bookmark.

## What the beta adds

- **Connect (beta):** send your drawing (PNG, JPG, TIFF, SVG or an animated GIF), with a Set name and editable file names straight to Research Catalogue (Simple Media) and place it on the page at the drawn position and size.
- **Fill (G):** a paint bucket that fills a closed area on the active layer, closes small gaps, and adds the fill as a new object below your lines.
- **More styles:** Brush (Dry, Soft, Flat, Wash, Fan) and Airbrush (Spray, Speckle, Grain, Stipple, Cloud). Pen styles are four tabs (Basic, Natural, Pattern, Effects).
- **Shape tool (O)** with a corner radius for Rounded; **pen eraser end** erases; brush size up to 5000 px.
- **Tool menus:** the Draw shortcut shows only the options of the chosen tool. Styles is one menu named after the tool; Pen behaviour is a small fold-out inside it.
- **Research Catalogue editor:** the drawing is tied to the page area, so it follows when you zoom or resize the window.

- **Import, save and export:** one group with Import images (also *Place as background, locked*), Save and open, and Export. Resolution is in percent (100 % = original); DPI is under *For print*. Layers can be locked.
- **Select:** Rectangle and Lasso take out the exact area (strokes are cut at the edge). Edit (Cut, Copy, Paste, Duplicate, Delete) and Transform (Flip, Scale %, Rotate °). Ctrl/⌘+A selects your drawing.
- **Eraser:** Freehand, Rectangle and Lasso cut out, inside or outside, with soft edge.
- **Retouch:** one tool with Clone, Light/dark, Contrast, Blur/sharpen and Smudge; one shortcut with an 8-tool window.
- **Text:** direction (across/down/up), arc and circle shapes, skew, gradient, shadow.
- **Animate:** five clearer parts, resolution in percent.
- **Pen side buttons (Wacom):** right button = thicker, middle button = thinner.
- **Mac:** keys show as ⌘ and ⌥.

## Try it

1. Create a new bookmark in your browser (name it e.g. "Ritlager beta") and paste the line below as its address (URL).
2. Open a Research Catalogue editor page (`researchcatalogue.net/editor/...`) and click the bookmark.
   If another Ritlager is already open on the page it is replaced by the beta.
3. Open **Connect (beta)** at the bottom of the Ritlager panel.

```
javascript:(function(){try{window.__ritlager&&window.__ritlager.destroy();}catch(e){}fetch('https://raw.githubusercontent.com/RutKarin/research-catalogue-tools/beta/ritlager/overlay.min.js?t='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('status '+r.status);return r.text();}).then(function(c){var s=document.createElement('script');s.textContent=c;document.documentElement.appendChild(s);s.remove();window.__ritlagerBeta=true;}).catch(function(e){alert('Ritlager beta could not be loaded: '+e.message);});})();
```

Every click on the bookmark closes Ritlager and loads the latest beta again (your drawing is autosaved and comes back), so it always runs the latest beta
(GitHub can cache a version for a few minutes). Pages that block loading scripts from other sites will refuse it.
