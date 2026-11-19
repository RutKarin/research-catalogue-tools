# Ritlager beta (not published)

The beta lives on the `beta` branch. It does not touch the normal Ritlager bookmark.

## What the beta adds

- **Connect (beta):** send your drawing (PNG, JPG, WebP or an animated GIF) straight to Research Catalogue (Simple Media) and place it on the page at the drawn position and size.
- **Fill (G):** a paint bucket that fills a closed area on the active layer, closes small gaps, and adds the fill as a new object below your lines.
- **More styles:** Brush (Dry, Soft, Flat, Wash, Fan) and Airbrush (Spray, Speckle, Grain, Stipple, Cloud). Pen styles are four tabs (Basic, Natural, Pattern, Effects).
- **Shape tool (O)** with a corner radius for Rounded; **pen eraser end** erases; brush size up to 5000 px.
- **Tool menus:** the Draw shortcut shows only the options of the chosen tool. Styles is one menu named after the tool; Pen behaviour is a small fold-out inside it.
- **Research Catalogue editor:** the drawing is tied to the page area, so it follows when you zoom or resize the window.

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
