# Ritlager beta (not published)

The beta lives on the `beta` branch. It adds **Connect (beta)**: send your drawing straight to
Research Catalogue (Simple Media) and place it on the page at the drawn position and size.
It does not touch the normal Ritlager bookmark.

## Try it

1. Create a new bookmark in your browser (name it e.g. "Ritlager beta") and paste the line below as its address (URL).
2. Open a Research Catalogue editor page (`researchcatalogue.net/editor/...`) and click the bookmark.
   If another Ritlager is already open on the page it is replaced by the beta.
3. Open **Connect (beta)** at the bottom of the Ritlager panel.

```
javascript:(function(){if(window.__ritlager&&window.__ritlagerBeta){window.__ritlager.toggle();return;}try{window.__ritlager&&window.__ritlager.destroy();}catch(e){}fetch('https://raw.githubusercontent.com/RutKarin/research-catalogue-tools/beta/ritlager/overlay.min.js',{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('status '+r.status);return r.text();}).then(function(c){var s=document.createElement('script');s.textContent=c;document.documentElement.appendChild(s);s.remove();window.__ritlagerBeta=true;}).catch(function(e){alert('Ritlager beta could not be loaded: '+e.message);});})();
```

The beta is fetched from GitHub every time you click the bookmark, so it always runs the latest beta
(GitHub can cache a version for a few minutes). Pages that block loading scripts from other sites will refuse it.
