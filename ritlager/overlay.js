(function(){
  if(window.__ritlager){ window.__ritlager.toggle(); return; }

  var Z = 2147483000, FONT = '"Geosans Light","Avenir","Avenir Next","Nunito Sans",system-ui,sans-serif';
  var de = document.documentElement, bd = document.body;
  var W, H, SC=null, area='page', offX=0, offY=0;
  // Some pages (e.g. editors) scroll inside an inner element instead of the document. Find it so the canvas can live inside it and scroll with the content.
  function findScroller(){
    if(de.scrollHeight>de.clientHeight+40) return null; // the document itself scrolls
    var best=null, bh=0, all=document.querySelectorAll('body *');
    for(var i=0;i<all.length&&i<6000;i++){
      var e=all[i]; if(e.scrollHeight<=e.clientHeight+40||e.clientHeight<window.innerHeight*0.6||e.clientWidth<window.innerWidth*0.6) continue;
      var o=getComputedStyle(e).overflowY; if(o!=='auto'&&o!=='scroll'&&o!=='overlay') continue;
      if(e.scrollHeight>bh){ best=e; bh=e.scrollHeight; }
    }
    return best;
  }
  SC=findScroller();
  function measure(){
    if(area==='view'){
      W = SC?SC.clientWidth:de.clientWidth; H = SC?SC.clientHeight:window.innerHeight;
      offX = SC?SC.scrollLeft:window.pageXOffset; offY = SC?SC.scrollTop:window.pageYOffset;
    } else if(SC){ W=SC.scrollWidth; H=SC.scrollHeight; offX=offY=0; }
    else {
    W = Math.max(de.scrollWidth, bd ? bd.scrollWidth : 0, de.clientWidth);
    H = Math.max(de.scrollHeight, bd ? bd.scrollHeight : 0, de.clientHeight);
    offX=offY=0; }
    W = Math.min(W, 6000);
    var maxH = Math.floor(30e6 / W); H = Math.min(H, maxH, 20000);
  }
  measure();

  var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  var base = document.createElement('canvas'), bctx = base.getContext('2d');
  var DOTS="url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cg fill='%23222' stroke='white' stroke-opacity='.7' stroke-width='.6'%3E%3Ccircle cx='10' cy='16' r='.8'/%3E%3Ccircle cx='22' cy='16' r='.8'/%3E%3Ccircle cx='16' cy='10' r='.8'/%3E%3Ccircle cx='16' cy='22' r='.8'/%3E%3C/g%3E%3C/svg%3E\") 16 16, crosshair";
  cv.id = 'ritlager-canvas';
  cv.style.cssText = 'position:absolute;left:0;top:0;z-index:'+Z+';touch-action:none;cursor:'+DOTS+';margin:0;padding:0;border:0;';
  function setSize(){
    var keep = null;
    cv.width = base.width = W; cv.height = base.height = H;
    cv.style.width = W+'px'; cv.style.height = H+'px'; cv.style.left=offX+'px'; cv.style.top=offY+'px';
    rebuild();
  }

  var ref=null, rscale=1, under=null, moveUnder=false, contrast=0, tool='pen', color='#111111', size=6, drawing=true, visible=true;
  var strokes=[], redo=[], ulog=[], cur=null, lastBlob=null;
  var cutMode='rect', selMode='rect', selScope='active', sel=[], selCur=[], selBox=null, selDrag=null, selOrig=null, marq=null, clip=[], pasteN=0;
  function undo(){
    var e=ulog.pop(); if(!e){ if(!strokes.length) return; e={t:'d'}; }
    if(e.t==='d'){ var st=strokes.pop(); if(st) redo.push({t:'d',stroke:st}); }
    else { redo.push({t:'s',strokes:strokes}); strokes=e.prev; }
    clearSel(); rebuild();
  }
  function redoFn(){
    var e=redo.pop(); if(!e) return;
    if(e.t==='d'){ strokes.push(e.stroke); ulog.push({t:'d'}); } else { ulog.push({t:'s',prev:strokes}); strokes=e.strokes; }
    clearSel(); rebuild();
  }
  // an edit that replaces the stroke list: undoable as one step
  function opSnap(fn){ var prev=strokes; strokes=prev.slice(); fn(); ulog.push({t:'s',prev:prev}); redo=[]; rebuild(); }
  function clearSel(){ sel=[]; selCur=[]; selBox=null; marq=null; selDrag=null; }
  function isObj(st){ return st.tool==='text'||st.tool==='image'; }
  function objCorners(st){ if(st.tool==='text') return textBox(st); var im=imgs[st.iid]||{w:100,h:100}, w=im.w*st.size, h=im.h*st.size, co=Math.cos(st.rot||0), si=Math.sin(st.rot||0), p=st.pts[0]; return [[0,0],[w,0],[w,h],[0,h]].map(function(q){ return {x:p.x+q[0]*co-q[1]*si,y:p.y+q[0]*si+q[1]*co}; }); }
  function selPts(st){ if(!isObj(st)) return st.pts; var q=objCorners(st); q.push({x:(q[0].x+q[2].x)/2,y:(q[0].y+q[2].y)/2}); return q; }
  function strokeBox(st){ if(isObj(st)){ var q=objCorners(st), a=1e9,b=1e9,c2=-1e9,d=-1e9; q.forEach(function(p){ a=Math.min(a,p.x); c2=Math.max(c2,p.x); b=Math.min(b,p.y); d=Math.max(d,p.y); }); return {x0:a-3,y0:b-3,x1:c2+3,y1:d+3}; }
    var x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,r=(st.size||2)/2+3; st.pts.forEach(function(p){ if(p.x<x0)x0=p.x; if(p.x>x1)x1=p.x; if(p.y<y0)y0=p.y; if(p.y>y1)y1=p.y; }); return {x0:x0-r,y0:y0-r,x1:x1+r,y1:y1+r}; }
  function boxOf(list){ var b=null; list.forEach(function(st){ var c=strokeBox(st); if(!b) b=c; else { b.x0=Math.min(b.x0,c.x0); b.y0=Math.min(b.y0,c.y0); b.x1=Math.max(b.x1,c.x1); b.y1=Math.max(b.y1,c.y1); } }); return b; }
  function inBox(b,q){ return b&&q.x>=b.x0&&q.x<=b.x1&&q.y>=b.y0&&q.y<=b.y1; }
  function cloneStroke(st,dx,dy){ var n=Object.assign({},st); n.pts=st.pts.map(function(p){ return {x:p.x+(dx||0),y:p.y+(dy||0),p:p.p}; }); delete n.sm; return n; }
  function corners(){ return selBox?[{x:selBox.x0,y:selBox.y0},{x:selBox.x1,y:selBox.y0},{x:selBox.x1,y:selBox.y1},{x:selBox.x0,y:selBox.y1}]:[]; }
  function rotAt(q){ if(!selBox) return false; var cx=(selBox.x0+selBox.x1)/2, cy=selBox.y0-22; return Math.hypot(q.x-cx,q.y-cy)<=9; }
  function handleAt(q){ var c=corners(); for(var i=0;i<c.length;i++) if(Math.abs(q.x-c[i].x)<=9&&Math.abs(q.y-c[i].y)<=9) return i; return -1; }
  function inScope(st){ return selScope==='all' ? getLayer(layerOf(st)).vis : layerOf(st)===act; }
  function baseCur(){ return selMode==='pick'?'default':DOTS; }
  function pip(x,y,poly){ var c=false; for(var i=0,j=poly.length-1;i<poly.length;j=i++){ if(((poly[i].y>y)!==(poly[j].y>y))&&(x<(poly[j].x-poly[i].x)*(y-poly[i].y)/(poly[j].y-poly[i].y)+poly[i].x)) c=!c; } return c; }
  function selCursor(q){ if(!sel.length) return baseCur(); if(rotAt(q)) return 'grab'; var h=handleAt(q); if(h>=0) return (h===0||h===2)?'nwse-resize':'nesw-resize'; return inBox(selBox,q)?'move':baseCur(); }
  function importImageFile(file,atX,atY){
    if(!file||!/^image\//.test(file.type)){ msg('That file is not an image'); return; }
    var fr=new FileReader();
    fr.onload=function(){ var im=new Image(); im.onload=function(){
      var maxD=1800, k=Math.min(1,maxD/Math.max(im.width,im.height)), w=Math.round(im.width*k), h=Math.round(im.height*k), src=fr.result, note2='';
      if(k<1||src.length>2.5e6){ var c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(im,0,0,w,h); src=c.toDataURL('image/png'); if(src.length>2.5e6){ src=c.toDataURL('image/jpeg',0.86); note2=' (compressed to JPEG – transparency lost)'; } }
      var iid='i'+Date.now().toString(36)+Math.floor(Math.random()*1e5).toString(36); imgs[iid]={src:src,w:w,h:h};
      var r=cv.getBoundingClientRect(), x=atX!=null?atX:-r.left+40, y=atY!=null?atY:-r.top+40, disp=Math.min(1,Math.max(60,Math.min(window.innerWidth*0.6,W-80))/w);
      var st={l:act,tool:'image',iid:iid,size:disp,rot:0,ink:1,color:'#000',pts:[{x:x,y:y,p:1}]};
      opSnap(function(){ strokes.push(st); sel=[st]; selCur=[st]; selBox=boxOf([st]); });
      setTool('select'); msg('Image added to the active layer'+note2+' – drag to move, corner squares to resize, Eraser or Cut out to cut it');
    }; im.onerror=function(){ msg('Could not read that image'); }; im.src=fr.result; };
    fr.readAsDataURL(file);
  }
  cv.addEventListener('dragover',function(e){ if(e.dataTransfer&&Array.prototype.indexOf.call(e.dataTransfer.types||[],'Files')>=0) e.preventDefault(); });
  cv.addEventListener('drop',function(e){ var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(!f) return; e.preventDefault(); var q=cpt(e); importImageFile(f,Math.round(q.x),Math.round(q.y)); });
  document.addEventListener('paste',function(e){
    if(!visible||!drawing||typing(e.target)) return;
    var items=(e.clipboardData&&e.clipboardData.items)||[], f=null;
    for(var i=0;i<items.length;i++) if(items[i].kind==='file'&&/^image\//.test(items[i].type)){ f=items[i].getAsFile(); break; }
    if(f){ e.preventDefault(); importImageFile(f); return; }
    if(clip.length||localStorage.getItem('ritlager-clip')){ e.preventDefault(); selPaste(); }
  },true);
  var tEd=null;
  function openText(x,y,orig){
    commitText();
    var fs=orig?orig.size:(+txSize.value||32), ff=orig?orig.ff:txFont.value, it=orig?orig.it:txIt.checked, bd=orig?orig.bd:txBd.checked, col=orig?orig.color:color;
    var ta=document.createElement('textarea');
    ta.style.cssText='position:absolute;left:'+x+'px;top:'+y+'px;z-index:'+(Z+1)+';margin:0;padding:0;border:1px dashed #888;background:rgba(255,255,255,.35);outline:none;resize:none;overflow:hidden;white-space:pre;color:'+col+';font:'+textFont({size:fs,ff:ff,it:it,bd:bd})+';line-height:1.25;min-width:140px;';
    ta.rows=1; ta.value=orig?orig.text:''; ta.spellcheck=false;
    function fit(){ ta.style.height='auto'; ta.style.height=Math.max(fs*1.25,ta.scrollHeight)+'px'; ta.style.width='auto'; ta.style.width=Math.max(140,ta.scrollWidth+8)+'px'; }
    ta.addEventListener('input',fit);
    ta.addEventListener('keydown',function(e){ e.stopPropagation(); if(e.key==='Escape'){ if(tEd) tEd.cancel=true; ta.blur(); } else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); ta.blur(); } },true);
    ta.addEventListener('blur',function(){ commitText(); });
    (cv.parentNode||de).appendChild(ta);
    tEd={ta:ta,x:x,y:y,orig:orig,fs:fs,ff:ff,it:it,bd:bd,color:col,cancel:false,prev:null};
    if(orig){ tEd.prev=strokes; strokes=strokes.filter(function(st){ return st!==orig; }); rebuild(); }
    fit(); setTimeout(function(){ ta.focus(); },0);
  }
  function commitText(){
    if(!tEd) return; var t=tEd; tEd=null; var val=t.ta.value.replace(/\s+$/,''); var ta=t.ta; ta.remove();
    var prev=t.prev||strokes;
    if(t.cancel||(!val&&!t.orig)){ if(t.prev){ strokes=t.prev; rebuild(); } return; }
    strokes=prev.slice(); var ns=null;
    if(val) ns=t.orig?Object.assign({},t.orig,{text:val}):{l:act,tool:'text',text:val,ff:t.ff,it:t.it,bd:t.bd,size:t.fs,color:t.color,ink:+ink.value/100,pts:[{x:t.x,y:t.y,p:1}]};
    if(t.orig){ var i=strokes.indexOf(t.orig); if(i>=0){ if(ns) strokes[i]=ns; else strokes.splice(i,1); } } else if(ns) strokes.push(ns);
    ulog.push({t:'s',prev:prev}); redo=[]; clearSel(); rebuild();
  }
  function textHit(q){ for(var i=strokes.length-1;i>=0;i--){ var st=strokes[i]; if(st.tool==='text'&&getLayer(layerOf(st)).vis&&inBox(strokeBox(st),q)) return st; } return null; }
  function textDown(e){
    e.preventDefault(); var q=cpt(e);
    if(tEd&&tEd.ta&&e.target===tEd.ta) return;
    var hit=textHit(q);
    if(hit&&(layerOf(hit)===act||selScope==='all')){ openText(hit.pts[0].x,hit.pts[0].y,hit); return; }
    if(!getLayer(act).vis){ msg('This layer is hidden – show it to add text'); return; }
    openText(Math.round(q.x),Math.round(q.y),null);
  }
  cv.addEventListener('dblclick',function(e){ if(!drawing||tool==='text') return; var h=textHit(cpt(e)); if(h){ clearSel(); openText(h.pts[0].x,h.pts[0].y,h); } });
  function cutDown(e){
    var q=cpt(e); cv.setPointerCapture(e.pointerId); e.preventDefault();
    if(!getLayer(act).vis){ msg('This layer is hidden – show it to cut it'); return; }
    marq = cutMode==='lasso' ? {lasso:true,pts:[{x:q.x,y:q.y}]} : {x0:q.x,y0:q.y,x1:q.x,y1:q.y};
    selDrag={marq:true,cut:true}; refresh();
  }
  function finishCut(){
    var m=marq, poly=null; marq=null;
    if(m.lasso){ if(m.pts.length>=3) poly=m.pts.map(function(p){ return {x:p.x,y:p.y,p:1}; }); }
    else { var x0=Math.min(m.x0,m.x1),x1=Math.max(m.x0,m.x1),y0=Math.min(m.y0,m.y1),y1=Math.max(m.y0,m.y1); if(x1-x0>=4&&y1-y0>=4) poly=[{x:x0,y:y0,p:1},{x:x1,y:y0,p:1},{x:x1,y:y1,p:1},{x:x0,y:y1,p:1}]; }
    if(!poly){ refresh(); return; }
    var st={l:act,tool:'cut',keep:cutKeep.value,feather:+cutFeather.value,size:2,color:'#000',ink:1,pts:poly};
    opSnap(function(){ strokes.push(st); });
    msg(cutKeep.value==='out'?'Cut out: everything outside the shape was erased on this layer':'Cut out: the inside of the shape was erased on this layer');
  }
  function selDown(e){
    var q=cpt(e); cv.setPointerCapture(e.pointerId); e.preventDefault();
    if(sel.length&&rotAt(q)){ var rc={cx:(selBox.x0+selBox.x1)/2,cy:(selBox.y0+selBox.y1)/2}; rc.a0=Math.atan2(q.y-rc.cy,q.x-rc.cx); selOrig=strokes; selDrag={rot:rc,moved:false}; return; }
    if(sel.length){ var hi=handleAt(q); if(hi>=0){ var cs=corners(), g=cs[hi], a=cs[(hi+2)%4]; if(g.x!==a.x&&g.y!==a.y){ selOrig=strokes; selDrag={sc:{ax:a.x,ay:a.y,gx:g.x,gy:g.y},moved:false}; return; } } }
    if(sel.length&&inBox(selBox,q)){ selOrig=strokes; selCur=sel; selDrag={x:q.x,y:q.y,moved:false}; return; }
    sel=[]; selBox=null;
    if(selMode==='pick'){
      for(var i=strokes.length-1;i>=0;i--){ if(inScope(strokes[i])&&inBox(strokeBox(strokes[i]),q)){ sel=[strokes[i]]; break; } }
      selBox=sel.length?boxOf(sel):null; if(sel.length){ selOrig=strokes; selCur=sel; selDrag={x:q.x,y:q.y,moved:false}; } else msg('Nothing there to pick'); refresh(); return;
    }
    if(selMode==='lasso') marq={lasso:true,pts:[{x:q.x,y:q.y}]}; else marq={x0:q.x,y0:q.y,x1:q.x,y1:q.y};
    selDrag={marq:true}; refresh();
  }
  function selMove(e){
    var q=cpt(e);
    if(selDrag.marq){ if(marq.lasso){ var lp=marq.pts[marq.pts.length-1]; if(Math.abs(q.x-lp.x)+Math.abs(q.y-lp.y)>2) marq.pts.push({x:q.x,y:q.y}); } else { marq.x1=q.x; marq.y1=q.y; } refresh(); return; }
    if(selDrag.rot){
      var rc=selDrag.rot, a=Math.atan2(q.y-rc.cy,q.x-rc.cx)-rc.a0; if(e.shiftKey) a=Math.round(a/(Math.PI/12))*(Math.PI/12);
      var co=Math.cos(a), si=Math.sin(a); selDrag.moved=true; selCur=[];
      strokes=selOrig.map(function(st){ if(sel.indexOf(st)<0) return st; var n=Object.assign({},st); delete n.sm; n.pts=st.pts.map(function(p){ return {x:rc.cx+(p.x-rc.cx)*co-(p.y-rc.cy)*si,y:rc.cy+(p.x-rc.cx)*si+(p.y-rc.cy)*co,p:p.p}; }); if(isObj(st)) n.rot=(st.rot||0)+a; selCur.push(n); return n; });
      selBox=boxOf(selCur); cancelAnimationFrame(ugRaf); ugRaf=requestAnimationFrame(rebuild); return;
    }
    if(selDrag.sc){
      var c=selDrag.sc, sx=(q.x-c.ax)/(c.gx-c.ax), sy=(q.y-c.ay)/(c.gy-c.ay);
      if(!e.shiftKey){ var u=Math.abs(c.gx-c.ax)>=Math.abs(c.gy-c.ay)?Math.abs(sx):Math.abs(sy); sx=(sx<0?-1:1)*u; sy=(sy<0?-1:1)*u; }
      if(Math.abs(sx)<0.05) sx=(sx<0?-1:1)*0.05; if(Math.abs(sy)<0.05) sy=(sy<0?-1:1)*0.05;
      selDrag.moved=true; selCur=[];
      strokes=selOrig.map(function(st){ if(sel.indexOf(st)<0) return st; var n=Object.assign({},st); delete n.sm; n.size=st.size*Math.sqrt(Math.abs(sx*sy)); n.pts=st.pts.map(function(p){ return {x:c.ax+(p.x-c.ax)*sx,y:c.ay+(p.y-c.ay)*sy,p:p.p}; }); selCur.push(n); return n; });
      selBox=boxOf(selCur); cancelAnimationFrame(ugRaf); ugRaf=requestAnimationFrame(rebuild); return;
    }
    var dx=q.x-selDrag.x, dy=q.y-selDrag.y; if(!selDrag.moved&&Math.abs(dx)+Math.abs(dy)<2) return; selDrag.moved=true;
    var map=new Map(); selCur=[];
    strokes=selOrig.map(function(st){ if(sel.indexOf(st)<0) return st; var n=cloneStroke(st,dx,dy); selCur.push(n); return n; });
    selBox=boxOf(selCur); cancelAnimationFrame(ugRaf); ugRaf=requestAnimationFrame(rebuild);
  }
  function selUp(){
    var d=selDrag; selDrag=null;
    if(d.marq&&d.cut){ finishCut(); return; }
    if(d.marq){
      var m=marq; marq=null; sel=[];
      if(m.lasso){
        if(m.pts.length>=3) sel=strokes.filter(function(st){ return inScope(st)&&selPts(st).some(function(p){ return pip(p.x,p.y,m.pts); }); });
      } else {
        var x0=Math.min(m.x0,m.x1),x1=Math.max(m.x0,m.x1),y0=Math.min(m.y0,m.y1),y1=Math.max(m.y0,m.y1);
        if(x1-x0<4&&y1-y0<4){ for(var i=strokes.length-1;i>=0;i--){ if(inScope(strokes[i])&&inBox(strokeBox(strokes[i]),{x:x0,y:y0})){ sel=[strokes[i]]; break; } } }
        else sel=strokes.filter(function(st){ return inScope(st)&&selPts(st).some(function(p){ return p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1; }); });
      }
      selBox=sel.length?boxOf(sel):null; msg(sel.length?sel.length+' stroke'+(sel.length>1?'s':'')+' selected':'Nothing selected (scope: '+(selScope==='all'?'all visible layers':'active layer')+')'); refresh(); return;
    }
    if(d.moved){ ulog.push({t:'s',prev:selOrig}); redo=[]; sel=selCur; selBox=boxOf(sel); persist(); }
    refresh();
  }
  function drawSelOverlay(){
    if(marq&&marq.lasso){ ctx.save(); ctx.beginPath(); marq.pts.forEach(function(p,i){ if(i) ctx.lineTo(p.x,p.y); else ctx.moveTo(p.x,p.y); }); ctx.lineWidth=3; ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.stroke(); ctx.lineWidth=1.2; ctx.strokeStyle='#111'; ctx.setLineDash([6,4]); ctx.stroke(); ctx.restore(); return; }
    var r=null; if(marq) r={x:Math.min(marq.x0,marq.x1),y:Math.min(marq.y0,marq.y1),w:Math.abs(marq.x1-marq.x0),h:Math.abs(marq.y1-marq.y0)}; else if(selBox) r={x:selBox.x0,y:selBox.y0,w:selBox.x1-selBox.x0,h:selBox.y1-selBox.y0};
    if(!r) return;
    ctx.save(); ctx.lineWidth=3; ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.setLineDash([]); ctx.strokeRect(r.x,r.y,r.w,r.h);
    ctx.lineWidth=1.2; ctx.strokeStyle='#111'; ctx.setLineDash([6,4]); ctx.strokeRect(r.x,r.y,r.w,r.h);
    if(!marq&&selBox){ ctx.setLineDash([]); var rx=(selBox.x0+selBox.x1)/2; ctx.beginPath(); ctx.moveTo(rx,selBox.y0); ctx.lineTo(rx,selBox.y0-22); ctx.strokeStyle='#111'; ctx.stroke(); ctx.beginPath(); ctx.arc(rx,selBox.y0-22,5,0,6.2832); ctx.fillStyle='#fff'; ctx.fill(); ctx.stroke(); corners().forEach(function(c){ ctx.fillStyle='#fff'; ctx.lineWidth=1.2; ctx.strokeStyle='#111'; ctx.fillRect(c.x-4,c.y-4,8,8); ctx.strokeRect(c.x-4,c.y-4,8,8); }); }
    ctx.restore();
  }
  function selCopy(){
    if(!sel.length){ msg('Select something first (Select tool, drag a rectangle)'); return false; }
    clip=sel.map(function(st){ return cloneStroke(st); }); pasteN=0;
    try{ localStorage.setItem('ritlager-clip',JSON.stringify(clip.map(function(st){ var o=Object.assign({},st); o.pts=st.pts.map(function(p){ return [Math.round(p.x*10)/10,Math.round(p.y*10)/10,p.p]; }); return o; }))); }catch(e){}
    msg('Copied '+sel.length+' stroke'+(sel.length>1?'s':'')); return true;
  }
  function selDelete(){ if(!sel.length) return; var del=sel; opSnap(function(){ strokes=strokes.filter(function(st){ return del.indexOf(st)<0; }); clearSel(); }); }
  function selFlip(h){
    if(!sel.length){ msg('Select something first'); return; }
    var cx=(selBox.x0+selBox.x1)/2, cy=(selBox.y0+selBox.y1)/2, old=sel, made=[];
    opSnap(function(){ strokes=strokes.map(function(st){ if(old.indexOf(st)<0) return st; var n=cloneStroke(st);
      if(isObj(st)){ var oc=objCorners(st), ow=oc[1].x-oc[0].x, oh=oc[3].y-oc[0].y, p0=st.pts[0], unrot=!(st.rot);
        n.pts=[{x:(h&&unrot)?2*cx-(p0.x+ow):(h?2*cx-p0.x:p0.x),y:(!h&&unrot)?2*cy-(p0.y+oh):(!h?2*cy-p0.y:p0.y),p:p0.p}];
        if(st.tool==='image'){ if(h) n.fx=!st.fx; else n.fy=!st.fy; }
      } else n.pts=n.pts.map(function(p){ return h?{x:2*cx-p.x,y:p.y,p:p.p}:{x:p.x,y:2*cy-p.y,p:p.p}; });
      made.push(n); return n; }); sel=made; selCur=made; selBox=boxOf(made); });
  }
  function selDup(){
    if(!sel.length){ msg('Select something first'); return; }
    var made=[]; opSnap(function(){ made=sel.map(function(st){ return cloneStroke(st,16,16); }); strokes=strokes.concat(made); sel=made; selCur=made; selBox=boxOf(made); });
    msg('Duplicated – drag to move it');
  }
  function selXform(scale,deg){
    if(!sel.length){ msg('Select something first'); return; }
    var cx=(selBox.x0+selBox.x1)/2, cy=(selBox.y0+selBox.y1)/2, a=deg*Math.PI/180, co=Math.cos(a), si=Math.sin(a), old=sel, made=[];
    opSnap(function(){ strokes=strokes.map(function(st){ if(old.indexOf(st)<0) return st; var n=Object.assign({},st); delete n.sm; n.size=st.size*scale;
      n.pts=st.pts.map(function(p){ var dx=(p.x-cx)*scale, dy=(p.y-cy)*scale; return {x:cx+dx*co-dy*si,y:cy+dx*si+dy*co,p:p.p}; }); if(isObj(st)) n.rot=(st.rot||0)+a; made.push(n); return n; }); sel=made; selCur=made; selBox=boxOf(made); });
  }
  function selLayer(){ setTool('select'); sel=strokes.filter(function(st){ return layerOf(st)===act; }); selBox=sel.length?boxOf(sel):null; refresh(); msg(sel.length?'Layer selected – drag a corner square to resize, the round handle to rotate':'This layer is empty'); }
  function selAll(){ sel=strokes.filter(inScope); selBox=sel.length?boxOf(sel):null; refresh(); msg(sel.length+' selected'); }
  function selCut(){ if(selCopy()){ selDelete(); msg('Cut – paste with Ctrl+V'); } }
  function selPaste(){
    if(!clip.length){ try{ var raw=JSON.parse(localStorage.getItem('ritlager-clip')); if(raw&&raw.length) clip=raw.map(function(o){ o.pts=o.pts.map(function(p){ return {x:p[0],y:p[1],p:p[2]}; }); return o; }); }catch(e){} }
    if(!clip.length){ msg('Nothing to paste – copy or cut something first'); return; }
    var off=16*(++pasteN), made=[];
    opSnap(function(){ made=clip.map(function(st){ var n=cloneStroke(st,off,off); n.l=act; return n; }); strokes=strokes.concat(made); sel=made; selCur=made; selBox=boxOf(made); });
    setTool('select'); refresh(); msg('Pasted – drag to move it');
  }
  var layers=[{id:1,name:'Layer 1',vis:true,op:100}], act=1, nextLid=2, tmp=document.createElement('canvas');
  function plainLayers(){ return layers.length===1&&layers[0].op>=100&&(!layers[0].bm||layers[0].bm==='source-over'); }
  function layerOf(s){ return s.l||layers[0].id; }
  function getLayer(id){ for(var i=0;i<layers.length;i++) if(layers[i].id===id) return layers[i]; return layers[layers.length-1]; }
  function topVisibleId(){ for(var i=layers.length-1;i>=0;i--) if(layers[i].vis) return layers[i].id; return -1; }
  // Draw the underlay and all visible layers (each with its own opacity) onto target. setup(ctx) applies a transform. only = draw just that layer id.
  function compose(target,setup,only){
    if(plainLayers()&&only==null){
      target.save(); setup(target); if(under) target.drawImage(under.img,under.x,under.y); strokes.forEach(function(st){ render(target,st); }); target.restore(); return;
    }
    var tw=target.canvas.width, th=target.canvas.height;
    if(tmp.width!==tw||tmp.height!==th){ tmp.width=tw; tmp.height=th; }
    var tc=tmp.getContext('2d');
    if(under&&only==null){ target.save(); setup(target); target.drawImage(under.img,under.x,under.y); target.restore(); }
    layers.forEach(function(L){
      if(!L.vis||(only!=null&&L.id!==only)) return;
      var mine=strokes.filter(function(st){ return layerOf(st)===L.id; }); if(!mine.length) return;
      tc.setTransform(1,0,0,1,0,0); tc.clearRect(0,0,tw,th); tc.save(); setup(tc);
      mine.forEach(function(st){ render(tc,st); }); tc.restore();
      target.save(); target.setTransform(1,0,0,1,0,0); target.globalAlpha=L.op/100; target.globalCompositeOperation=L.bm||'source-over'; target.drawImage(tmp,0,0); target.restore();
    });
  }
  // ---- autospara: ritningen minns sidan i den här webbläsaren (localStorage) ----
  var KEY='ritlager:'+location.origin+location.pathname+location.search, ready=false, saveT=null, warned=false;
  function persist(){
    if(!ready) return; clearTimeout(saveT);
    saveT=setTimeout(function(){
      try{
        if(strokes.length||under) localStorage.setItem(KEY,JSON.stringify(pack())); else localStorage.removeItem(KEY);
      }catch(e){ if(!warned){ warned=true; msg('Could not autosave (too large or blocked) – export PNG often'); } }
    },300);
  }
  var SKEY='ritlager-versioner:'+location.origin+location.pathname+location.search;
  function pack(withRef){
    return {v:1,t:Date.now(),c:contrast,ref:(withRef&&ref)?{src:ref.c.toDataURL('image/png'),sx:ref.sx,sy:ref.sy,w:ref.w,h:ref.h,k:ref.k}:undefined,under:under?{src:under.src,x:under.x,y:under.y}:null,layers:layers.map(function(L){ return {id:L.id,name:L.name,vis:L.vis,op:L.op,bm:L.bm||'source-over'}; }),act:act,images:(function(){ var o={}; strokes.forEach(function(st){ if(st.iid&&imgs[st.iid]&&!o[st.iid]) o[st.iid]={src:imgs[st.iid].src,w:imgs[st.iid].w,h:imgs[st.iid].h}; }); return o; })(),strokes:strokes.map(function(s){ var o={}; for(var k in s) if(k!=='pts'&&k!=='sm') o[k]=s[k];
      o.pts=s.pts.map(function(p){ return [Math.round(p.x*10)/10,Math.round(p.y*10)/10,Math.round(p.p*100)/100]; }); return o; })};
  }
  function unpack(d){
    if(!d||!d.strokes) return -1;
    imgs={}; if(d.images) Object.keys(d.images).forEach(function(k){ imgs[k]={src:d.images[k].src,w:d.images[k].w,h:d.images[k].h}; });
    strokes=d.strokes.map(function(o){ o.pts=o.pts.map(function(p){ return {x:p[0],y:p[1],p:p[2]}; }); return o; });
    layers = (d.layers&&d.layers.length) ? d.layers.map(function(L){ return {id:L.id,name:L.name,vis:L.vis!==false,op:L.op==null?100:L.op,bm:L.bm||'source-over'}; }) : [{id:1,name:'Layer 1',vis:true,op:100}];
    act = d.act&&layers.some(function(L){ return L.id===d.act; }) ? d.act : layers[layers.length-1].id;
    nextLid = layers.reduce(function(m,L){ return Math.max(m,L.id); },0)+1;
    if(typeof drawLayerUI==='function'&&layerBox) drawLayerUI();
    contrast=+d.c||0; ctr.value=contrast; redo=[]; ulog=[]; clearSel(); under=null;
    if(d.under&&d.under.src){ var im=new Image(); im.onload=function(){ under={img:im,x:d.under.x||0,y:d.under.y||0,src:d.under.src}; rebuild(); }; im.src=d.under.src; }
    if(d.ref&&d.ref.src){ var ri=new Image(); ri.onload=function(){ var rc=document.createElement('canvas'); rc.width=ri.width; rc.height=ri.height; rc.getContext('2d').drawImage(ri,0,0); ref={c:rc,sx:d.ref.sx,sy:d.ref.sy,w:d.ref.w,h:d.ref.h,k:d.ref.k}; updateRefInfo(); }; ri.src=d.ref.src; }
    rebuild(); return strokes.length;
  }
  function getVers(){ try{ return JSON.parse(localStorage.getItem(SKEY))||{}; }catch(e){ return {}; } }
  function putVers(o){ try{ localStorage.setItem(SKEY,JSON.stringify(o)); return true; }catch(e){ msg('Could not save the version (too large or blocked) – use Save project file'); return false; } }
  function restore(){
    try{
      var raw=localStorage.getItem(KEY); if(!raw) return 0;
      var n=unpack(JSON.parse(raw)); return n<0?0:n;
    }catch(e){ return 0; }
  }

  function widthAt(s,p){
    var f=1;
    if(s.pressure){
      var g=0.12+0.88*Math.min(1,Math.max(0,p)); // 100% = "normal": kraftigt tryckkänslig
      f = s.sens<=1 ? 1-s.sens+s.sens*g : Math.pow(g,s.sens);
    }
    return Math.max(s.hair?0.1:1, s.size*f); // golv 1 px = sammanhängande linje (utom i läget Svarta hårfina)
  }
  function arcPts(cx,cy,ax,ay,bx,by,r,sign){ // halvcirkel från normal (ax,ay) via tangent (bx,by)
    var out=[],n=8,k,f;
    for(k=1;k<n;k++){ f=Math.PI*k/n; out.push([cx+r*(sign*ax*Math.cos(f)+sign*bx*Math.sin(f)), cy+r*(sign*ay*Math.cos(f)+sign*by*Math.sin(f))]); }
    return out;
  }
  function samplePath(s){
    var pts=s.pts, out=[], i, t, prev=pts[0], pw=widthAt(s,pts[0].p);
    out.push([pts[0].x,pts[0].y,pw]);
    for(i=1;i<pts.length;i++){
      var p=pts[i], last=i===pts.length-1;
      var e = last ? p : {x:(p.x+pts[i+1].x)/2, y:(p.y+pts[i+1].y)/2};
      var w=widthAt(s,p.p), steps=Math.max(2,Math.min(12,Math.ceil(Math.hypot(e.x-prev.x,e.y-prev.y)/2)));
      for(t=1;t<=steps;t++){
        var u=t/steps, v=1-u;
        out.push([v*v*prev.x+2*v*u*p.x+u*u*e.x, v*v*prev.y+2*v*u*p.y+u*u*e.y, pw+(w-pw)*u]);
      }
      prev=e; pw=w;
    }
    // ta bort nästan sammanfallande punkter
    var d=[out[0]]; for(i=1;i<out.length;i++){ var q=d[d.length-1]; if(Math.hypot(out[i][0]-q[0],out[i][1]-q[1])>0.15) d.push(out[i]); }
    return d;
  }
  function ribbon(c,s){
    var P=samplePath(s), n=P.length, i;
    if(n<2){ var q=P[0]; c.beginPath(); c.arc(q[0],q[1],q[2]/2,0,Math.PI*2); c.fill(); return; }
    var L=[],R=[],N=[],T=[];
    for(i=0;i<n;i++){
      var a=P[Math.max(0,i-1)], b=P[Math.min(n-1,i+1)], tx=b[0]-a[0], ty=b[1]-a[1], l=Math.hypot(tx,ty)||1;
      tx/=l; ty/=l; T.push([tx,ty]); N.push([-ty,tx]);
      var r=P[i][2]/2;
      L.push([P[i][0]+N[i][0]*r, P[i][1]+N[i][1]*r]); R.push([P[i][0]-N[i][0]*r, P[i][1]-N[i][1]*r]);
    }
    c.beginPath(); c.moveTo(L[0][0],L[0][1]);
    for(i=1;i<n;i++) c.lineTo(L[i][0],L[i][1]);
    arcPts(P[n-1][0],P[n-1][1],N[n-1][0],N[n-1][1],T[n-1][0],T[n-1][1],P[n-1][2]/2,1).forEach(function(q){c.lineTo(q[0],q[1]);});
    for(i=n-1;i>=0;i--) c.lineTo(R[i][0],R[i][1]);
    arcPts(P[0][0],P[0][1],N[0][0],N[0][1],T[0][0],T[0][1],P[0][2]/2,-1).forEach(function(q){c.lineTo(q[0],q[1]);});
    c.closePath(); c.fill('nonzero');
  }
  function hsh(a,b){ var x=Math.sin(a*127.1+b*311.7)*43758.5453; return x-Math.floor(x); }
  function brushStroke(c,s){
    var P=samplePath(s), n=P.length, i, j;
    if(n<2){ var q=P[0]; c.beginPath(); c.arc(q[0],q[1],q[2]/2,0,Math.PI*2); c.fill(); return; }
    var N=[], Lc=[0], tot=0;
    for(i=0;i<n;i++){
      var a=P[Math.max(0,i-1)], b=P[Math.min(n-1,i+1)], tx=b[0]-a[0], ty=b[1]-a[1], l=Math.hypot(tx,ty)||1;
      N.push([-ty/l,tx/l]);
      if(i>0){ tot+=Math.hypot(P[i][0]-P[i-1][0],P[i][1]-P[i-1][1]); Lc.push(tot); }
    }
    var nb=Math.max(5,Math.min(26,Math.round(s.size/2))), avg=0;
    for(i=0;i<n;i++) avg+=P[i][2]; avg/=n;
    c.lineCap='round'; c.lineJoin='round';
    for(j=0;j<nb;j++){
      var u=(j+0.5)/nb*2-1+(hsh(j,1)-0.5)*0.3;
      c.globalAlpha = Math.min(1,(0.55+0.45*hsh(j,2))*s.ink);
      c.lineWidth = Math.max(0.6, avg/nb*2.3);
      c.beginPath(); var down=false;
      for(i=0;i<n;i++){
        var t=tot>0?Lc[i]/tot:0, taper=Math.min(1,0.3+t/0.08,0.3+(1-t)/0.14);
        var low=Math.max(0,1-P[i][2]/s.size), nz=hsh(j,Math.floor(Lc[i]/(5+hsh(j,3)*14))+10);
        var vis = s.dry===0 || nz >= s.dry*Math.max(0,(low-0.12))*1.5;
        var off=u*P[i][2]/2*taper, x=P[i][0]+N[i][0]*off, y=P[i][1]+N[i][1]*off;
        if(vis){ if(down) c.lineTo(x,y); else { c.moveTo(x,y); down=true; } } else down=false;
      }
      c.stroke();
    }
  }
  // ---- pennstilar: fyrkantig / platt (kalligrafi) spets och blyerts ----
  function hull(pts){
    pts.sort(function(a,b){ return a[0]-b[0] || a[1]-b[1]; });
    function cross(o,a,b){ return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); }
    var lo=[],up=[],i;
    for(i=0;i<pts.length;i++){ while(lo.length>=2 && cross(lo[lo.length-2],lo[lo.length-1],pts[i])<=0) lo.pop(); lo.push(pts[i]); }
    for(i=pts.length-1;i>=0;i--){ while(up.length>=2 && cross(up[up.length-2],up[up.length-1],pts[i])<=0) up.pop(); up.push(pts[i]); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  function stamp(p,hxr,hyr,th){
    var hx=Math.max(p[2]*hxr,0.5), hy=Math.max(p[2]*hyr,0.4), ca=Math.cos(th), sa=Math.sin(th), out=[];
    [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(function(k){ var x=k[0]*hx, y=k[1]*hy; out.push([p[0]+x*ca-y*sa, p[1]+x*sa+y*ca]); });
    return out;
  }
  function nibStroke(c,s,hxr,hyr,th){
    var P=samplePath(s), n=P.length, i, h, k;
    c.beginPath();
    for(i=0;i<Math.max(1,n-1);i++){
      h=hull(stamp(P[i],hxr,hyr,th).concat(P[i+1]?stamp(P[i+1],hxr,hyr,th):[]));
      c.moveTo(h[0][0],h[0][1]); for(k=1;k<h.length;k++) c.lineTo(h[k][0],h[k][1]); c.closePath();
    }
    c.fill('nonzero');
  }
  function inkStroke(c,s){
    var n=s.pts.length, base=c.globalAlpha;
    var pts2=s.pts.map(function(p,i){ var t=n>1?i/(n-1):0, tp=Math.min(1,0.5+t/0.07,0.5+(1-t)/0.12); return {x:p.x,y:p.y,p:(s.pressure?p.p:1)*tp}; });
    var s2=Object.assign({},s,{pts:pts2,pressure:true,sens:s.pressure?Math.max(s.sens,0.5):0.5});
    // bläcket flyter ut lite i papperet: en svag, något bredare kant under
    c.globalAlpha=base*0.16; ribbon(c,Object.assign({},s2,{size:s2.size+Math.max(1.2,s2.size*0.3)}));
    c.globalAlpha=base; ribbon(c,s2);
    // droppar där pennan sätts an och lyfts
    [s.pts[0],s.pts[n-1]].forEach(function(p){ c.beginPath(); c.arc(p.x,p.y,Math.max(0.6,widthAt(s2,Math.max(0.4,p.p))*0.6),0,Math.PI*2); c.fill(); });
  }
  var grainTile=null;
  function grain(){
    if(grainTile) return grainTile;
    var g=document.createElement('canvas'); g.width=g.height=192; var gc=g.getContext('2d'), id=gc.createImageData(192,192), x, y, v;
    for(y=0;y<192;y++) for(x=0;x<192;x++){
      v = 0.55*hsh(x*1.31+7,y*0.97+3) + 0.45*hsh(Math.floor(x/2)*2.17+1,Math.floor(y/2)*1.73+9); // lite klumpigt korn
      var a = Math.max(0, Math.min(1, (v-0.12)*2.6));
      var o=(y*192+x)*4; id.data[o]=id.data[o+1]=id.data[o+2]=0; id.data[o+3]=Math.round(255*a);
    }
    gc.putImageData(id,0,0); grainTile=g; return g;
  }
  var grainSoftTile=null;
  function grainSoft(){
    if(grainSoftTile) return grainSoftTile;
    var g=document.createElement('canvas'); g.width=g.height=160; var gc=g.getContext('2d'), id=gc.createImageData(160,160), x, y;
    for(y=0;y<160;y++) for(x=0;x<160;x++){
      var v=0.5*hsh(x*0.71+2,y*1.13+5)+0.5*hsh(Math.floor(x/3)*1.9+4,Math.floor(y/3)*2.3+1), o=(y*160+x)*4;
      id.data[o]=id.data[o+1]=id.data[o+2]=0; id.data[o+3]=Math.round(255*(0.62+0.38*v));
    }
    gc.putImageData(id,0,0); grainSoftTile=g; return g;
  }
  function waterStroke(c,s){
    var xs=s.pts.map(function(p){return p.x;}), ys=s.pts.map(function(p){return p.y;}), pad=Math.ceil(s.size*1.6+10);
    var bx=Math.floor(Math.min.apply(null,xs)-pad), by=Math.floor(Math.min.apply(null,ys)-pad);
    var bw=Math.ceil(Math.max.apply(null,xs)+pad)-bx, bh=Math.ceil(Math.max.apply(null,ys)+pad)-by;
    if(bw*bh>8e6 || bw<1 || bh<1){ ribbon(c,s); return; }
    var t=document.createElement('canvas'); t.width=bw; t.height=bh; var tc=t.getContext('2d');
    tc.translate(-bx,-by); tc.fillStyle=s.color;
    tc.save(); tc.globalAlpha=0.46; tc.shadowColor=s.color; tc.shadowBlur=Math.max(2,s.size*0.45); tc.shadowOffsetX=20000; tc.translate(-20000,0); ribbon(tc,s); tc.restore(); // mjuk färgtvätt
    tc.save(); tc.globalAlpha=0.5; ribbon(tc,s); tc.globalCompositeOperation='destination-out'; tc.globalAlpha=0.45; ribbon(tc,Object.assign({},s,{size:s.size*0.66})); tc.restore(); // mörkare kant, ljusare mitt
    tc.globalCompositeOperation='destination-in'; tc.fillStyle=tc.createPattern(grainSoft(),'repeat'); tc.fillRect(bx,by,bw,bh); // pigmentkorn
    c.drawImage(t,bx,by);
  }
  function pencilStroke(c,s){
    var xs=s.pts.map(function(p){return p.x;}), ys=s.pts.map(function(p){return p.y;}), pad=s.size+4;
    var bx=Math.floor(Math.min.apply(null,xs)-pad), by=Math.floor(Math.min.apply(null,ys)-pad);
    var bw=Math.ceil(Math.max.apply(null,xs)+pad)-bx, bh=Math.ceil(Math.max.apply(null,ys)+pad)-by;
    if(bw*bh>8e6 || bw<1 || bh<1){ ribbon(c,s); return; }
    var t=document.createElement('canvas'); t.width=bw; t.height=bh; var tc=t.getContext('2d');
    tc.translate(-bx,-by); tc.fillStyle=s.color; ribbon(tc,s);
    tc.globalCompositeOperation='destination-in'; tc.fillStyle=tc.createPattern(grain(),'repeat'); tc.fillRect(bx,by,bw,bh);
    c.drawImage(t,bx,by);
  }
  var imgs={};
  function ensureImg(iid){ var o=imgs[iid]; if(!o) return null; if(!o.img){ var im=new Image(); o.img=im; im.onload=function(){ o.w=im.naturalWidth||o.w; o.h=im.naturalHeight||o.h; rebuild(); }; im.src=o.src; } return (o.img.complete&&o.img.naturalWidth)?o.img:null; }
  function renderImage(c,s){
    var im=ensureImg(s.iid); if(!im) return; var p=s.pts[0];
    c.save(); c.globalAlpha=s.ink==null?1:s.ink; c.translate(p.x,p.y); if(s.rot) c.rotate(s.rot);
    c.scale(s.size*(s.fx?-1:1),s.size*(s.fy?-1:1)); c.drawImage(im,s.fx?-im.naturalWidth:0,s.fy?-im.naturalHeight:0); c.restore();
  }
  function renderCut(c,s){
    c.save(); c.globalCompositeOperation='destination-out'; c.fillStyle='#000'; c.beginPath();
    if(s.keep==='out') c.rect(-1e5,-1e5,2e5,2e5);
    s.pts.forEach(function(p,i){ if(i) c.lineTo(p.x,p.y); else c.moveTo(p.x,p.y); }); c.closePath();
    if(s.feather>0){ var OFF=20000; c.shadowColor='#000'; c.shadowBlur=s.feather*rscale; c.shadowOffsetX=OFF*rscale; c.translate(-OFF,0); }
    c.fill('evenodd'); c.restore();
  }
  var FONTS={sans:'"Geosans Light","Avenir","Avenir Next","Nunito Sans",system-ui,sans-serif',serif:'Georgia,"Times New Roman",serif',mono:'"SF Mono",Menlo,Consolas,monospace',hand:'"Segoe Print","Bradley Hand","Comic Sans MS",cursive',display:'Impact,"Arial Black",sans-serif'};
  function textFont(s){ return (s.it?'italic ':'')+(s.bd?'700 ':'300 ')+s.size+'px '+(FONTS[s.ff]||FONTS.sans); }
  function renderText(c,s){
    var p=s.pts[0]; c.save(); c.globalAlpha=s.ink==null?1:s.ink; c.fillStyle=s.color; c.textBaseline='top'; c.font=textFont(s);
    c.translate(p.x,p.y); if(s.rot) c.rotate(s.rot);
    s.text.split('\n').forEach(function(ln,i){ c.fillText(ln,0,i*s.size*1.25); });
    c.restore();
  }
  var mctx=document.createElement('canvas').getContext('2d');
  function textBox(s){
    mctx.font=textFont(s); var lines=s.text.split('\n'), w=0; lines.forEach(function(l){ w=Math.max(w,mctx.measureText(l).width); });
    var h=lines.length*s.size*1.25, co=Math.cos(s.rot||0), si=Math.sin(s.rot||0), p=s.pts[0];
    return [[0,0],[w,0],[w,h],[0,h]].map(function(q){ return {x:p.x+q[0]*co-q[1]*si,y:p.y+q[0]*si+q[1]*co}; });
  }
  function render(c,s){
    if(s.tool==='text'){ renderText(c,s); return; }
    if(s.tool==='image'){ renderImage(c,s); return; }
    if(s.tool==='cut'){ renderCut(c,s); return; }
    c.save();
    c.globalCompositeOperation = s.tool==='eraser' ? 'destination-out' : 'source-over';
    c.strokeStyle = c.fillStyle = s.color; c.lineCap = c.lineJoin = 'round';
    c.globalAlpha = (s.hair||s.size>=1) ? s.ink : s.ink*Math.max(0.25,s.size);
    // hårfina streck: rita flera gånger så att den tunna linjen blir riktigt svart
    var wRef = Math.min(s.size,0.95), passes = (s.hair && s.size<1 && !(s.soft>0)) ? Math.min(10, Math.ceil(Math.log(0.05)/Math.log(1-Math.max(wRef,0.1)))) : 1, ps;
    if(!(s.soft>0)) passes=Math.min(16,passes*(1+Math.round(contrast/100*11))); // kontrast = ritar om strecket flera gånger så svaga streck blir mörkare
    if(s.soft>0){ // suddig: rita formen utanför duken, bara skuggan (den mjuka kanten) syns
      var OFF=20000; c.shadowColor = s.tool==='eraser' ? '#000' : s.color;
      c.shadowBlur = s.soft/100*Math.max(2,s.size)*1.6*rscale; c.shadowOffsetX = OFF*rscale; c.translate(-OFF,0);
    }
    var pts=s.pts;
    if(s.tool==='line'){
      if(pts.length>1){
        var a=pts[0], b=pts[pts.length-1];
        c.lineWidth=Math.max(0.1,s.size); c.beginPath(); c.moveTo(a.x,a.y); c.lineTo(b.x,b.y);
        if(s.arrow){
          var ang=Math.atan2(b.y-a.y,b.x-a.x), L=Math.max(14,s.size*4);
          [0.45,-0.45].forEach(function(d){ c.moveTo(b.x,b.y); c.lineTo(b.x-L*Math.cos(ang+d), b.y-L*Math.sin(ang+d)); });
        }
        for(ps=0;ps<passes;ps++) c.stroke();
      }
    } else if(pts.length===1){
      c.beginPath(); c.arc(pts[0].x,pts[0].y,widthAt(s,pts[0].p)/2,0,Math.PI*2); for(ps=0;ps<passes;ps++) c.fill();
    } else if(pts.length>1 && s.brush && s.tool==='pen'){
      brushStroke(c,s);
    } else if(pts.length>1 && s.tool==='pen' && s.nib==='marker'){
      // marker: genomskinlig, jämn bredd (ingen tryckvariation), en enda fyllning så överlapp inte blir mörkare inom strecket
      var ms=Object.assign({},s,{pressure:false}); c.globalAlpha=Math.min(1,s.ink*0.5); nibStroke(c,ms,0.5,0.24,-0.55);
    } else if(pts.length>1 && s.tool==='pen' && s.nib==='water'){
      waterStroke(c,s);
    } else if(pts.length>1 && s.tool==='pen' && s.nib==='ink'){
      inkStroke(c,s);
    } else if(pts.length>1 && s.tool==='pen' && s.nib==='pencil'){
      pencilStroke(c,s);
    } else if(pts.length>1 && s.tool==='pen' && s.nib==='square'){
      for(ps=0;ps<passes;ps++) nibStroke(c,s,0.5,0.5,0);
    } else if(pts.length>1 && s.tool==='pen' && s.nib==='flat'){
      for(ps=0;ps<passes;ps++) nibStroke(c,s,0.5,0.13,-0.7);
    } else if(pts.length>1){
      for(ps=0;ps<passes;ps++) ribbon(c,s);
    }
    c.restore();
  }
  var scPos=null;
  function placeCanvas(){
    var host = SC||de;
    if(SC && getComputedStyle(SC).position==='static'){ scPos=SC; SC.style.position='relative'; }
    if(cv.parentNode!==host) host.appendChild(cv);
  }
  function rescan(){ if(scPos){ scPos.style.position=''; scPos=null; } SC=findScroller(); placeCanvas(); measure(); setSize(); }
  function rebuild(){ bctx.clearRect(0,0,W,H); compose(bctx,function(){}); refresh(); persist(); }
  function refresh(){
    ctx.clearRect(0,0,W,H); ctx.drawImage(base,0,0);
    if(!cur){ drawSelOverlay(); return; }
    var L=getLayer(layerOf(cur));
    if(cur.tool!=='eraser'&&L.op<100){
      if(tmp.width!==W||tmp.height!==H){ tmp.width=W; tmp.height=H; }
      var tc=tmp.getContext('2d'); tc.setTransform(1,0,0,1,0,0); tc.clearRect(0,0,W,H); render(tc,cur);
      ctx.save(); ctx.globalAlpha=L.op/100; ctx.drawImage(tmp,0,0); ctx.restore();
    } else render(ctx,cur);
    drawSelOverlay();
  }

  // ---- inmatning (dokumentkoordinater) ----
  function cpt(e){ var r=cv.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
  function pos(e){ var q=cpt(e);
    return { x:q.x, y:q.y,
      p: e.pointerType==='pen' ? (e.pressure||0.5) : 0.8 };
  }
  // If the page scrolls by its own script (not natively), pass wheel movement on to whatever is under the canvas.
  cv.addEventListener('wheel',function(e){
    if(SC||de.scrollHeight>de.clientHeight+40) return;
    var pe=cv.style.pointerEvents; cv.style.pointerEvents='none';
    var t=document.elementFromPoint(e.clientX,e.clientY); cv.style.pointerEvents=pe;
    if(t&&t!==cv){ try{ t.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:e.clientX,clientY:e.clientY,deltaX:e.deltaX,deltaY:e.deltaY,deltaMode:e.deltaMode,ctrlKey:e.ctrlKey})); }catch(x){} }
  },{passive:true});
  var ug=null, ugRaf=0;
  cv.addEventListener('pointerdown', function(e){
    if(moveUnder && under){ var q0=cpt(e); ug={px:q0.x,py:q0.y,x:under.x,y:under.y}; cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if(pickMode){ doPick(e); e.preventDefault(); return; }
    if(!drawing || e.pointerType==='touch') return;
    if(e.pointerType==='mouse' && e.button!==0) return;
    if(tool==='text'){ textDown(e); return; }
    if(tool==='cut'){ cutDown(e); return; }
    if(tool==='select'){ selDown(e); return; }
    cv.setPointerCapture(e.pointerId);
    if(!getLayer(act).vis){ msg('This layer is hidden – show it to draw on it'); return; }
    var q=pos(e);
    cur={l:act,tool:(tool==='brush'?'pen':tool),color:color,size:size,soft:+soft.value,sens:+sens.value/100,ink:+ink.value/100,pressure:pr.checked, brush:tool==='brush', nib:nibSel.value, dry:+dry.value/100, hair:hair.checked, pmin:1, pmax:0, lt:e.timeStamp, lx:q.x, ly:q.y,
         arrow:ar.checked,pts:[q],sm:{x:q.x,y:q.y,p:q.p}};
    e.preventDefault(); refresh();
  });
  cv.addEventListener('pointermove', function(e){
    if(ug){ var q1=cpt(e); under.x=Math.round(ug.x+q1.x-ug.px); under.y=Math.round(ug.y+q1.y-ug.py); cancelAnimationFrame(ugRaf); ugRaf=requestAnimationFrame(rebuild); return; }
    if(selDrag){ selMove(e); return; }
    if(tool==='select'&&!moveUnder){ cv.style.cursor=selCursor(cpt(e)); }
    dbg.textContent='Device: '+e.pointerType+' · pressure '+(e.pressure||0).toFixed(2)+(cur?(cur.usedSpeed?' · thickness from: speed':' · thickness from: pen pressure'):'');
    if(!cur) return;
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if(!evs.length) evs=[e];
    var k = sm.value/100*0.85;
    evs.forEach(function(ev){
      var q=pos(ev);
      var dt=Math.max(1,ev.timeStamp-cur.lt), v=Math.hypot(q.x-cur.lx,q.y-cur.ly)/dt, sp=1/(1+v*0.8);
      cur.lt=ev.timeStamp; cur.lx=q.x; cur.ly=q.y;
      if(ev.pointerType==='pen'){ var pp=ev.pressure||0; cur.pmin=Math.min(cur.pmin,pp); cur.pmax=Math.max(cur.pmax,pp); }
      var penOk = ev.pointerType==='pen' && cur.pmax-cur.pmin>0.03;
      cur.usedSpeed = pm.value==='speed' || (pm.value==='auto' && !penOk);
      if(cur.usedSpeed) q.p=sp;
      if(cur.tool==='line'){ cur.pts[1]=q; return; }
      cur.sm.x += (q.x-cur.sm.x)*(1-k); cur.sm.y += (q.y-cur.sm.y)*(1-k); cur.sm.p += (q.p-cur.sm.p)*0.22;
      var l=cur.pts[cur.pts.length-1];
      if(Math.hypot(cur.sm.x-l.x,cur.sm.y-l.y)>0.6) cur.pts.push({x:cur.sm.x,y:cur.sm.y,p:cur.sm.p});
    });
    refresh();
  });
  function end(){
    if(!cur) return;
    delete cur.sm; strokes.push(cur); ulog.push({t:'d'}); redo=[];
    var L=getLayer(layerOf(cur)), fast = layers.length===1 ? L.op>=100 : (cur.tool!=='eraser'&&L.op>=100&&L.id===topVisibleId());
    if(fast){ render(bctx,cur); cur=null; refresh(); persist(); } else { cur=null; rebuild(); }
  }
  function endAny(e){ if(ug){ ug=null; persist(); return; } if(selDrag){ selUp(); return; } end(e); }
  cv.addEventListener('pointerup', endAny); cv.addEventListener('pointercancel', endAny);

  // ---- verktygsfält ----
  var bar = document.createElement('div'); bar.id='ritlager-bar';
  bar.style.cssText = 'position:fixed;top:10px;right:10px;z-index:'+(Z+1)+';background:#fafafa;color:#111;'+
    'border:1px solid #bbb;border-radius:10px;padding:8px 10px;font:300 13px/1.2 '+FONT+';'+
    'box-shadow:0 3px 14px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:7px;width:260px;box-sizing:border-box;max-height:calc(100vh - 20px);overflow-y:auto;overscroll-behavior:contain;';
  var BTN = 'font:inherit;font-size:12.5px;color:#111;background:#fff;border:1px solid #c9c9c9;border-radius:6px;padding:4px 8px;cursor:pointer;margin:0;';
  function el(t,css,txt){ var x=document.createElement(t); if(css) x.style.cssText=css; if(txt!=null) x.textContent=txt; return x; }
  function row(){ return el('div','display:flex;gap:5px;align-items:center;flex-wrap:wrap;'); }
  function btn(txt,fn,title){ var b=el('button',BTN,txt); b.type='button'; if(title) b.title=title; b.addEventListener('click',fn); return b; }
  function mark(b,on){ b.style.background=on?'#111':'#fff'; b.style.color=on?'#fff':'#111'; b.style.borderColor=on?'#111':'#c9c9c9'; }

  var head = row(); head.style.justifyContent='space-between'; head.style.cursor='move'; head.style.cssText+='position:sticky;top:-8px;z-index:2;background:#fafafa;padding:6px 0;margin-top:-8px;border-bottom:1px solid #e4e4e4;';
  head.appendChild(el('span','font-size:12px;letter-spacing:.06em;text-transform:uppercase;font-weight:400;','Ritlager'));
  var hide = btn('Hide', function(){ api.toggle(); }, 'Hide/show (D toggles draw/click)');
  var hg=row(); var quick=btn('Export PNG',function(){ exportPng('save'); },'Export the drawing as PNG (choose background and size under Export)'); quick.style.background='#111'; quick.style.color='#fff'; quick.style.borderColor='#111';
  hg.appendChild(quick); hg.appendChild(hide); head.appendChild(hg);
  bar.appendChild(head);

  function sec(t){ var d=el('div','font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#888;margin-top:3px;border-top:1px solid #e4e4e4;padding-top:6px;cursor:pointer;user-select:none;',t); d.setAttribute('data-sec',t); d._t=t; d._open=true; d._hidden=false; bar.appendChild(d); return d; }
  function applySec(h){ if(!h._wrap) return; h.textContent=(h._open?'▾ ':'▸ ')+h._t; h.style.display=h._hidden?'none':'block'; h._wrap.style.display=(h._open&&!h._hidden)?'flex':'none'; }
  function lab(r,t){ r.appendChild(el('span','font-size:12px;color:#666;',t)); }
  function slider(r,min,max,val,w){ var i=el('input','width:'+w+'px;accent-color:#111;'); i.type='range'; i.min=min; i.max=max; i.value=val; r.appendChild(i); return i; }
  function chk(r,txt,on,tip){ var l=el('label','font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer;'); var i=el('input'); i.type='checkbox'; i.checked=on; l.appendChild(i); l.appendChild(document.createTextNode(txt)); if(tip) l.title=tip; r.appendChild(l); return i; }

  var r1=row(); var bDraw=btn('Draw',function(){setDrawing(true);},'Draw on the page (D)'), bPass=btn('Click',function(){setDrawing(false);},'Click through to the page (D)');
  r1.appendChild(bDraw); r1.appendChild(bPass); bar.appendChild(r1);

  sec('Drawing tools');
  var r2=row();
  var bPen=btn('Pen',function(){setTool('pen');},'Pen (B)'), bBrush=btn('Brush',function(){setTool('brush');},'Brush (P)'),
      bLine=btn('Line',function(){setTool('line');},'Straight line (L)'), bEr=btn('Eraser',function(){setTool('eraser');},'Eraser (E)'), bTxt=btn('Text',function(){setTool('text');},'Text (T): click where the text should go');
  r2.appendChild(bPen); r2.appendChild(bBrush); r2.appendChild(bLine); r2.appendChild(bEr); r2.appendChild(bTxt); bar.appendChild(r2);
  var rText=row(); lab(rText,'Font');
  var txFont=el('select',BTN+'padding:3px 6px;'); [['sans','Sans'],['serif','Serif'],['mono','Mono'],['hand','Handwriting'],['display','Display']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; txFont.appendChild(op); }); rText.appendChild(txFont);
  var txSize=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:3px 5px;width:50px;box-sizing:border-box;'); txSize.type='number'; txSize.value=32; txSize.min=4; txSize.max=400; txSize.title='Text size in px'; rText.appendChild(txSize); lab(rText,'px');
  var txBd=chk(rText,'Bold',false), txIt=chk(rText,'Italic',false);
  rText.appendChild(el('div','font-size:11px;color:#777;line-height:1.35;width:100%;','Click where the text should go and type. Ctrl+Enter or a click elsewhere finishes, Esc cancels. Double-click a text to edit it. Colour and opacity come from Colour; use the Select tool to move, resize or rotate it.'));
  bar.appendChild(rText);

  sec('Colour');
  var r3=row(), sw=[];
  var cp=el('input','width:26px;height:24px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;'); cp.type='color'; cp.value='#111111';
  var plusBtn=null, CK='ritlager-colours', custom=[]; try{ custom=JSON.parse(localStorage.getItem(CK))||[]; }catch(e){}
  function saveCustom(){ try{ localStorage.setItem(CK,JSON.stringify(custom)); }catch(e){} }
  function addSw(c,isCustom){
    var b=el('button','width:20px;height:20px;border-radius:50%;border:1px solid #888;padding:0;cursor:pointer;margin:0;background:'+c);
    b.type='button'; if(isCustom) b.title='Saved colour (Alt+click removes it)';
    b.addEventListener('click',function(e){
      if(isCustom&&e.altKey){ custom=custom.filter(function(x){ return x!==c; }); saveCustom(); sw=sw.filter(function(z){ return z[0]!==b; }); b.remove(); return; }
      setColor(c);
    });
    if(plusBtn) r3.insertBefore(b,plusBtn); else r3.appendChild(b); sw.push([b,c]);
  }
  ['#111111','#ffffff','#d6282b','#1f5fd1','#2a9d4a','#f2c200','#e66ab3'].forEach(function(c){ addSw(c,false); });
  custom.forEach(function(c){ addSw(c,true); });
  cp.addEventListener('input',function(){setColor(cp.value);});
  plusBtn=btn('+',function(){ var c=color.length===7?color:cp.value; if(custom.indexOf(c)<0&&custom.length<14){ custom.push(c); saveCustom(); addSw(c,true); setColor(c); } },'Save the current colour as a swatch'); r3.appendChild(plusBtn);
  bar.appendChild(r3);
  var rHex=row(); rHex.style.flexWrap='nowrap';
  cp.style.cssText='width:38px;height:26px;padding:1px;border:1px solid #888;border-radius:6px;background:none;cursor:pointer;flex:none;'; cp.title='Current colour. Click this square to choose any colour you like';
  var hexIn=el('input','font:12px monospace;border:1px solid #c9c9c9;border-radius:6px;padding:4px 6px;width:74px;box-sizing:border-box;'); hexIn.type='text'; hexIn.value='#111111'; hexIn.maxLength=7; hexIn.spellcheck=false; hexIn.title='Colour code. Type a code like #d6282b and press Enter';
  hexIn.addEventListener('change',function(){ var v=hexIn.value.trim(); if(/^[0-9a-f]{6}$/i.test(v)) v='#'+v; if(/^#[0-9a-f]{6}$/i.test(v)) setColor(v.toLowerCase()); else hexIn.value=color; });
  var rgbEl=el('span','font-size:11px;color:#777;white-space:nowrap;','');
  rHex.appendChild(cp); rHex.appendChild(hexIn);
  rHex.appendChild(btn('Copy',function(){ var v=hexIn.value; try{ navigator.clipboard.writeText(v).then(function(){ msg('Copied '+v); },function(){ hexIn.select(); msg('Press Ctrl/Cmd+C to copy '+v); }); }catch(e){ hexIn.select(); msg('Press Ctrl/Cmd+C to copy '+v); } },'Copy the colour code'));
  rHex.appendChild(btn('Pipette',function(){ pickColour(); },'Pipette: pick a colour from the page or from your drawing (I)'));
  bar.appendChild(rHex);
  bar.appendChild(rgbEl);
  bar.appendChild(el('div','font-size:11px;color:#777;line-height:1.35;','Click the square to choose any colour, or type a colour code. Use Pipette to pick one from the page or your drawing.'));
  var pickMode=false;
  function hex2(n){ return ('0'+n.toString(16)).slice(-2); }
  function pickColour(){
    if(window.EyeDropper){
      msg('Click anywhere on the screen to pick a colour (Esc cancels)',3500);
      try{ new window.EyeDropper().open().then(function(r){ setColor(r.sRGBHex.toLowerCase()); msg('Picked '+r.sRGBHex.toUpperCase()); },function(){}); }catch(e){ msg('Colour picking was blocked here'); }
      return;
    }
    setDrawing(true); pickMode=true; cv.style.cursor='copy';
    msg('Click on your drawing, or on a captured screenshot, to pick a colour',4000);
  }
  function doPick(e){
    pickMode=false; cv.style.cursor=DOTS;
    var q=cpt(e), x=Math.round(q.x), y=Math.round(q.y), d=null;
    try{ var p=ctx.getImageData(x,y,1,1).data; if(p[3]>0) d=p; }catch(x2){}
    if(!d&&ref){ var rx=Math.round((q.x-ref.sx)*ref.k), ry=Math.round((q.y-ref.sy)*ref.k);
      if(rx>=0&&ry>=0&&rx<ref.c.width&&ry<ref.c.height){ try{ d=ref.c.getContext('2d').getImageData(rx,ry,1,1).data; }catch(x3){} } }
    if(!d||d[3]===0){ msg('Nothing to pick there. In this browser, first press “Capture screenshot” (under Export) to use the pipette on the page.',5500); return; }
    var c='#'+hex2(d[0])+hex2(d[1])+hex2(d[2]); setColor(c); msg('Picked '+c.toUpperCase());
  }
  var r3b=row(); lab(r3b,'Opacity'); var ink=slider(r3b,5,100,100,100); ink.title='How dark/dense the colour is. 100 = full black';
  bar.appendChild(r3b);
  var rC=row(); lab(rC,'Contrast'); var ctr=slider(rC,0,100,0,110);
  ctr.title='Redraws strokes several times so light and thin strokes get darker. High = thin strokes turn fully black. Applies to all strokes, including already drawn ones (not the brush).';
  var ctrRaf=0; ctr.addEventListener('input',function(){ contrast=+ctr.value; cancelAnimationFrame(ctrRaf); ctrRaf=requestAnimationFrame(rebuild); });
  bar.appendChild(rC);

  sec('Thickness');
  var r4=row();
  var sz=el('input','width:150px;accent-color:#111;'); sz.type='range';
  var szv=el('span','font-size:12px;width:46px;','3.0');
  var SMIN=0.2, SMAX=100, LR=Math.log(SMAX/SMIN);
  sz.min=0; sz.max=100; sz.step=0.25;
  function showSize(){ szv.textContent = (size<10 ? size.toFixed(1) : String(Math.round(size)))+' px'; }
  function setSize2(v){ size=Math.max(SMIN,Math.min(SMAX,v)); sz.value=100*Math.log(size/SMIN)/LR; showSize(); }
  sz.addEventListener('input',function(){ size=SMIN*Math.exp(LR*(+sz.value)/100); showSize(); });
  r4.appendChild(sz); r4.appendChild(szv); bar.appendChild(r4);
  var rp=row();
  [0.2,0.4,0.7,1,2,4,8,16,32,64].forEach(function(n){
    var b=el('button','border:1px solid #c9c9c9;background:#fff;border-radius:6px;cursor:pointer;margin:0;padding:0;width:22px;height:22px;display:flex;align-items:center;justify-content:center;');
    b.type='button'; b.title=n+' px';
    var d=el('span','display:block;border-radius:50%;background:#111;width:'+Math.min(16,Math.max(2,n/2.4))+'px;height:'+Math.min(16,Math.max(2,n/2.4))+'px;');
    b.appendChild(d); b.addEventListener('click',function(){setSize2(n);}); rp.appendChild(b);
  });
  bar.appendChild(rp);
  var rThin=row(); lab(rThin,'Thin lines');
  var thinSel=el('select',BTN+'padding:3px 6px;');
  [['smooth','Smooth (never broken)'],['black','Black hairlines']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; thinSel.appendChild(op); });
  thinSel.title='Smooth: the line is never thinner than 1 px, so it stays unbroken. Black hairlines: truly thin black strokes under 1 px, but pressure variation is less visible.';
  rThin.appendChild(thinSel); bar.appendChild(rThin);
  var hair={ get checked(){ return thinSel.value==='black'; } };

  var secLook=sec('Look');
  var rNib=row(); lab(rNib,'Pen style');
  var nibSel=el('select',BTN+'padding:3px 6px;');
  [['round','Round'],['square','Square'],['flat','Flat (calligraphy)'],['pencil','Pencil'],['marker','Marker'],['ink','Ink'],['water','Watercolour']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; nibSel.appendChild(op); });
  nibSel.title='Round: soft round tip. Square: tip with corners. Flat: calligraphy nib, thin in one direction. Pencil: grainy, like pencil on paper. Marker: transparent highlighter. Ink: soft ink pen with drops and tapering ends. Watercolour: transparent wash with darker edges and pigment grain.';
  rNib.appendChild(nibSel); bar.appendChild(rNib);
  var rSoft=row(); lab(rSoft,'Sharp'); var soft=slider(rSoft,0,100,0,100); lab(rSoft,'Soft'); bar.appendChild(rSoft);
  var rDry=row(); lab(rDry,'Brush dryness'); var dry=slider(rDry,0,100,30,90); bar.appendChild(rDry);
  var rArrow=row(); var ar=chk(rArrow,'Arrowhead on lines',false,'Adds an arrowhead at the end of straight lines drawn with the Line tool.'); bar.appendChild(rArrow);

  var secPress=sec('Pressure and stabilising');
  var rPr=row(); var pr=chk(rPr,'Pressure sensitive',true); bar.appendChild(rPr);
  var rSens=row(); lab(rSens,'Sensitivity'); var sens=slider(rSens,0,150,100,110); sens.title='100 = normal (very pressure sensitive). Higher = even more, lower = less'; bar.appendChild(rSens);
  var rPm=row(); lab(rPm,'Pressure from');
  var pm=el('select',BTN+'padding:3px 6px;');
  [['auto','Auto'],['pen','Pen pressure'],['speed','Speed (fast = thin)']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; pm.appendChild(op); });
  rPm.appendChild(pm); bar.appendChild(rPm);
  var rSm=row(); lab(rSm,'Stabilise'); var sm=slider(rSm,0,90,35,100); sm.title='Smooths out shaky strokes'; bar.appendChild(rSm);

  sec('Presets');
  var preBox=el('div','display:flex;flex-wrap:wrap;gap:5px;'); bar.appendChild(preBox);
  var rPn=row(); var preName=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:4px 8px;flex:1;min-width:0;box-sizing:border-box;'); preName.type='text'; preName.placeholder='Name, e.g. Fine ink'; rPn.appendChild(preName);
  rPn.appendChild(btn('+ Save',function(){ var n=(preName.value||'').trim().slice(0,24)||('Preset '+(loadPre().length+1)); var a=loadPre(); a.push({n:n,s:getSettings(false)}); savePre(a); preName.value=''; drawPre(); msg('Saved preset "'+n+'"'); },'Saves the current tool, colour, thickness and pen settings as a one-click preset'));
  bar.appendChild(rPn);

  sec('Undo and canvas');
  var r7=row();
  r7.appendChild(btn('↶',function(){ undo(); },'Undo (Ctrl+Z)'));
  r7.appendChild(btn('↷',function(){ redoFn(); },'Redo (Ctrl+Y)'));
  r7.appendChild(btn('Clear',function(){ if(strokes.length){ opSnap(function(){ strokes=[]; clearSel(); }); msg('Cleared – ↶ undoes'); } }));
  r7.appendChild(btn('Re-measure',function(){ rescan(); msg('Canvas is now '+W+' × '+H+' px'+(SC?' (inside the page’s scroll area)':'')); },'Resize the canvas if the page has grown longer'));
  bar.appendChild(r7);

  sec('Select tool');
  var rSm1=row();
  var bPick=btn('↖ Pick',function(){ selMode='pick'; setTool('select'); },'Click a stroke to select it, then drag to move it'), bRect=btn('▭ Rectangle',function(){ selMode='rect'; setTool('select'); },'Drag a rectangle around the strokes you want (V)'), bLas=btn('Lasso',function(){ selMode='lasso'; setTool('select'); },'Draw around the strokes you want');
  rSm1.appendChild(bPick); rSm1.appendChild(bRect); rSm1.appendChild(bLas); bar.appendChild(rSm1);
  function markSel(){ var on=tool==='select'; mark(bPick,on&&selMode==='pick'); mark(bRect,on&&selMode==='rect'); mark(bLas,on&&selMode==='lasso'); var cn=tool==='cut'; mark(bCutR,cn&&cutMode==='rect'); mark(bCutL,cn&&cutMode==='lasso'); }
  var rSm2=row(); lab(rSm2,'Select from');
  var scSel=el('select',BTN+'padding:3px 6px;');
  [['active','Active layer'],['all','All visible layers']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; scSel.appendChild(op); });
  scSel.addEventListener('change',function(){ selScope=scSel.value; }); rSm2.appendChild(scSel); bar.appendChild(rSm2);
  var rSm3=row();
  rSm3.appendChild(btn('Cut',function(){ selCut(); },'Cut (Ctrl+X)')); rSm3.appendChild(btn('Copy',function(){ selCopy(); },'Copy (Ctrl+C)')); rSm3.appendChild(btn('Paste',function(){ selPaste(); },'Paste (Ctrl+V)')); rSm3.appendChild(btn('Delete',function(){ selDelete(); },'Delete the selected strokes (Delete key)'));
  bar.appendChild(rSm3);
  var rSm4=row();
  rSm4.appendChild(btn('Duplicate',function(){ selDup(); },'Duplicate (Ctrl+D)')); rSm4.appendChild(btn('Flip ↔',function(){ selFlip(true); },'Mirror the selection left–right')); rSm4.appendChild(btn('Flip ↕',function(){ selFlip(false); },'Mirror the selection top–bottom')); rSm4.appendChild(btn('Layer',function(){ selLayer(); },'Select the whole active layer, then resize or rotate it')); rSm4.appendChild(btn('All',function(){ setTool('select'); selAll(); },'Select everything in scope (Ctrl+A)'));
  bar.appendChild(rSm4);
  var rSm5=row(); lab(rSm5,'Scale'); var scIn=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:3px 5px;width:52px;box-sizing:border-box;'); scIn.type='number'; scIn.value=100; scIn.min=5; scIn.max=1000; rSm5.appendChild(scIn); lab(rSm5,'%');
  lab(rSm5,'Rotate'); var roIn=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:3px 5px;width:52px;box-sizing:border-box;'); roIn.type='number'; roIn.value=0; roIn.min=-360; roIn.max=360; rSm5.appendChild(roIn); lab(rSm5,'°');
  rSm5.appendChild(btn('Apply',function(){ var sc=(+scIn.value||100)/100, dg=+roIn.value||0; selXform(sc,dg); scIn.value=100; roIn.value=0; },'Scale and/or rotate the selection around its centre'));
  bar.appendChild(rSm5);
  bar.appendChild(el('div','font-size:11px;color:#777;line-height:1.35;','Pick a selection mode, then drag around strokes. Drag inside the box to move, a corner square to resize (Shift = stretch freely), the round handle on top to rotate (Shift = 15° steps). Layer selects the whole active layer. Esc deselects.'));

  sec('Images');
  var rIm=row();
  var imf=el('input'); imf.type='file'; imf.accept='image/*'; imf.style.display='none';
  imf.addEventListener('change',function(){ var f=imf.files[0]; if(f) importImageFile(f); imf.value=''; });
  rIm.appendChild(imf); rIm.appendChild(btn('Import image…',function(){ imf.click(); },'Add a picture from your computer to the active layer'));
  bar.appendChild(rIm);
  bar.appendChild(el('div','font-size:11px;color:#777;line-height:1.35;','You can also drop an image file onto the page or paste a copied image with Ctrl+V. The picture lands on the active layer and works like any object: move, resize and rotate with the Select tool, rub out with the Eraser, or use Cut out.'));

  sec('Cut out');
  var rCt=row();
  var bCutR=btn('▭ Rectangle',function(){ cutMode='rect'; setTool('cut'); },'Drag a rectangle to cut'), bCutL=btn('Lasso',function(){ cutMode='lasso'; setTool('cut'); },'Draw around the area to cut');
  rCt.appendChild(bCutR); rCt.appendChild(bCutL); bar.appendChild(rCt);
  var rCk=row(); lab(rCk,'Cut');
  var cutKeep=el('select',BTN+'padding:3px 6px;'); [['in','Erase inside'],['out','Erase outside (keep inside)']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; cutKeep.appendChild(op); }); rCk.appendChild(cutKeep); bar.appendChild(rCk);
  var rCf=row(); lab(rCf,'Soft edge'); var cutFeather=slider(rCf,0,40,0,110); cutFeather.title='0 = hard edge; higher = feathered edge'; bar.appendChild(rCf);
  bar.appendChild(el('div','font-size:11px;color:#777;line-height:1.35;','Pick Rectangle or Lasso, then draw the shape on the page. The cut applies to the active layer (pictures, drawing and text) and can be undone. To move a cut-out together with its picture later, use Layer in the Select tool.'));

  sec('Layers');
  var layerBox=el('div','display:flex;flex-direction:column;gap:5px;'); bar.appendChild(layerBox);
  var BLENDS=[['source-over','Normal'],['multiply','Multiply'],['screen','Screen'],['overlay','Overlay'],['soft-light','Soft light'],['hard-light','Hard light'],['darken','Darken'],['lighten','Lighten'],['color-dodge','Colour dodge'],['color-burn','Colour burn'],['difference','Difference'],['exclusion','Exclusion'],['hue','Hue'],['saturation','Saturation'],['color','Colour'],['luminosity','Luminosity']];
  var lRaf=0; function lRebuild(){ cancelAnimationFrame(lRaf); lRaf=requestAnimationFrame(rebuild); }
  function markLayers(){ Array.prototype.forEach.call(layerBox.children,function(d){ d.style.background = (+d.getAttribute('data-id')===act) ? '#e9e9e9' : '#fff'; d.style.borderColor = (+d.getAttribute('data-id')===act) ? '#111' : '#d4d4d4'; }); }
  function drawLayerUI(){
    layerBox.innerHTML='';
    for(var i=layers.length-1;i>=0;i--) (function(L,idx){
      var d=el('div','border:1px solid #d4d4d4;border-radius:7px;padding:4px 5px;display:flex;flex-direction:column;gap:4px;background:#fff;'); d.setAttribute('data-id',L.id);
      var r1=row(); r1.style.flexWrap='nowrap';
      var more=el('div','display:'+(L.open?'flex':'none')+';flex-direction:column;gap:4px;');
      var tg=btn(L.open?'▾':'▸',function(){ L.open=!L.open; more.style.display=L.open?'flex':'none'; tg.textContent=L.open?'▾':'▸'; },'Show or hide this layer’s opacity, blend mode and order'); tg.style.padding='3px 6px';
      var sumEl=el('span','font-size:10.5px;color:#888;white-space:nowrap;'); function sumUp(){ var bn=''; BLENDS.forEach(function(o){ if(o[0]===(L.bm||'source-over')) bn=o[1]; }); sumEl.textContent=L.op+'% · '+bn; }
      var nm=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:5px;padding:3px 6px;flex:1;min-width:0;box-sizing:border-box;'); nm.type='text'; nm.value=L.name; nm.maxLength=30;
      nm.addEventListener('focus',function(){ act=L.id; markLayers(); }); nm.addEventListener('input',function(){ L.name=nm.value; persist(); });
      var eye=chk(r1,'Show',L.vis); r1.insertBefore(nm,r1.firstChild); r1.insertBefore(tg,r1.firstChild);
      eye.addEventListener('change',function(){ L.vis=eye.checked; rebuild(); });
      r1.appendChild(btn('✕',function(){
        if(layers.length<2){ msg('At least one layer is needed'); return; }
        backupCurrent(); strokes=strokes.filter(function(st){ return layerOf(st)!==L.id; }); redo=[]; ulog=[]; clearSel();
        layers.splice(layers.indexOf(L),1); if(act===L.id) act=layers[layers.length-1].id; drawLayerUI(); rebuild(); msg('Layer deleted (your previous drawing is saved as "Previous (auto)")');
      },'Delete this layer and its strokes'));
      var r2=row(); r2.style.flexWrap='nowrap'; lab(r2,'Opacity'); var op=slider(r2,0,100,L.op,70); op.title='Opacity of the whole layer';
      var opv=el('span','font-size:11px;color:#666;width:30px;',L.op+'%'); r2.appendChild(opv);
      op.addEventListener('input',function(){ L.op=+op.value; opv.textContent=L.op+'%'; sumUp(); lRebuild(); });
      r2.appendChild(btn('↑',function(){ var k=layers.indexOf(L); if(k<layers.length-1){ layers.splice(k,1); layers.splice(k+1,0,L); drawLayerUI(); rebuild(); } },'Move layer up (in front)'));
      r2.appendChild(btn('↓',function(){ var k=layers.indexOf(L); if(k>0){ layers.splice(k,1); layers.splice(k-1,0,L); drawLayerUI(); rebuild(); } },'Move layer down (behind)'));
      var r3=row(); r3.style.flexWrap='nowrap'; lab(r3,'Blend');
      var bmS=el('select',BTN+'padding:3px 6px;flex:1;min-width:0;'); bmS.title='How this layer mixes with the layers below it (and with a screenshot background when exporting)';
      BLENDS.forEach(function(o){ var op2=el('option',null,o[1]); op2.value=o[0]; bmS.appendChild(op2); }); bmS.value=L.bm||'source-over';
      bmS.addEventListener('change',function(){ L.bm=bmS.value; sumUp(); rebuild(); }); r3.appendChild(bmS);
      more.appendChild(r2); more.appendChild(r3); sumUp(); d.appendChild(r1); d.appendChild(sumEl); d.appendChild(more);
      d.addEventListener('pointerdown',function(e){ if(e.target.tagName==='BUTTON') return; act=L.id; markLayers(); });
      layerBox.appendChild(d);
    })(layers[i],i);
    markLayers();
  }
  var rLa=row();
  rLa.appendChild(btn('+ Add layer',function(){ var L={id:nextLid++,name:'Layer '+(layers.length+1),vis:true,op:100}; layers.push(L); act=L.id; drawLayerUI(); persist(); }));
  bar.appendChild(rLa);
  bar.appendChild(el('div','font-size:11px;color:#777;line-height:1.35;','Drawing and the eraser work on the highlighted layer. Blend modes mix a layer with the layers below it; they show in the combined export and over a screenshot background, but a PNG placed in RC cannot blend with the page itself.'));
  drawLayerUI();

  sec('Export (image for RC)');
  var rSz=row(); lab(rSz,'Image size');
  var csel=el('select',BTN+'padding:3px 6px;');
  [['full','Whole page'],['crop','Strokes only']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; csel.appendChild(op); });
  rSz.appendChild(csel); bar.appendChild(rSz);
  var cr={ get checked(){ return csel.value==='crop'; } };
  var rLy=row(); lab(rLy,'Layers');
  var lySel=el('select',BTN+'padding:3px 6px;');
  [['all','All in one image'],['each','Each layer as its own PNG'],['active','Active layer only']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; lySel.appendChild(op); });
  lySel.title='Use “Each layer” to get one PNG per layer, e.g. one to place over objects in RC and one under.';
  rLy.appendChild(lySel); bar.appendChild(rLy);
  var szHint=el('div','font-size:11px;color:#777;line-height:1.35;');
  function hint(){ szHint.textContent = csel.value==='crop' ? 'Strokes only: the image is cropped to the area around your strokes. Smaller file, but you have to place it yourself in RC.' : 'Whole page: the image is as large as the page. Place it at the page top-left in RC and the strokes line up exactly.'; }
  csel.addEventListener('change',hint); hint(); bar.appendChild(szHint);
  var rBg=row(); lab(rBg,'Background');
  var bgSel=el('select',BTN+'padding:3px 6px;');
  [['none','Transparent'],['white','White'],['color','Custom colour'],['shot','Screenshot (reference)']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; bgSel.appendChild(op); });
  var bgCol=el('input','width:26px;height:24px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;display:none;'); bgCol.type='color'; bgCol.value='#f4efe6';
  bgSel.addEventListener('change',function(){ bgCol.style.display = bgSel.value==='color' ? 'inline-block' : 'none'; });
  rBg.appendChild(bgSel); rBg.appendChild(bgCol); bar.appendChild(rBg);
  var rRef=row();
  rRef.appendChild(btn('Capture screenshot',function(){ captureRef(); },'Takes a screenshot of the page as it looks now (without the toolbar and the drawing layer). The browser asks whether to share the tab.'));
  rRef.appendChild(btn('Save reference image',function(){ if(!ref){ msg('Capture a screenshot first'); return; } ref.c.toBlob(function(bl){ if(!bl){ msg('Could not create the image'); return; } saveBlob(bl,fname('reference-'+ref.c.width+'x'+ref.c.height,'.png','-reference'),'The reference image is saved.'); },'image/png'); },'Saves the screenshot on its own, without your strokes'));
  bar.appendChild(rRef);
  var refInfoEl=el('div','font-size:11px;color:#777;line-height:1.35;'); bar.appendChild(refInfoEl);
  function updateRefInfo(){ refInfoEl.textContent = ref ? 'Reference image: '+ref.c.width+' × '+ref.c.height+' px (page at scroll '+Math.round(ref.sx)+', '+Math.round(ref.sy)+'). Choose Background: Screenshot to export the drawing on top of it. The image area then applies, not Image size.' : 'No reference image. Capture a screenshot to export the drawing on top of the page. Works best in Chrome/Edge. Scroll to the right place first.'; }
  updateRefInfo();
  function captureRef(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia){ msg('Your browser cannot capture the screen here'); return; }
    navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:false,preferCurrentTab:true,selfBrowserSurface:'include'}).then(function(stream){
      var v=document.createElement('video'); v.muted=true; v.srcObject=stream;
      var stop=function(){ stream.getTracks().forEach(function(t){t.stop();}); };
      v.onloadedmetadata=function(){ Promise.resolve(v.play()).then(function(){
        var hid=[cv,bar,note]; hid.forEach(function(x){ x.style.visibility='hidden'; });
        setTimeout(function(){
          var fw=v.videoWidth, fh=v.videoHeight, iw=window.innerWidth, ih=window.innerHeight;
          var c=document.createElement('canvas'); c.width=fw; c.height=fh; c.getContext('2d').drawImage(v,0,0);
          stop(); hid.forEach(function(x){ x.style.visibility=''; });
          var kx=fw/iw, ky=fh/ih;
          if(!fw||Math.abs(kx/ky-1)>0.03){ msg('The screenshot seems to include the browser frame. Choose the tab, not the whole window.'); return; }
          var rr=cv.getBoundingClientRect(); ref={c:c,sx:-rr.left,sy:-rr.top,w:iw,h:ih,k:kx}; updateRefInfo(); bgSel.value='shot'; bgCol.style.display='none';
          msg('Reference image captured ('+fw+' × '+fh+' px). Background is now set to Screenshot.');
        },350);
      }); };
    }).catch(function(){ msg('Screen capture was cancelled or denied'); });
  }
  function bgValue(){ return bgSel.value==='white' ? '#ffffff' : bgSel.value==='color' ? bgCol.value : null; }
  var rFn=row(); lab(rFn,'File name'); var fileNameEl=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:4px 8px;flex:1;min-width:0;box-sizing:border-box;'); fileNameEl.type='text'; fileNameEl.placeholder='optional, e.g. figure-1'; fileNameEl.title='Applies to exported PNG, reference image and project file'; rFn.appendChild(fileNameEl); bar.appendChild(rFn);
  var rDir=row(); var dirInfo=el('div','font-size:11.5px;color:#444;line-height:1.35;flex:1;min-width:120px;');
  function updateDirInfo(){ dirInfo.textContent = window.showDirectoryPicker ? (dirH ? 'Saving to folder: '+dirH.name : 'No folder chosen: files are saved to Downloads.') : 'Your browser does not let pages choose a folder. Use Chrome or Edge; otherwise files go to Downloads.'; }
  rDir.appendChild(dirInfo);
  if(window.showDirectoryPicker){
    rDir.appendChild(btn('Choose folder…',function(){
      window.showDirectoryPicker({mode:'readwrite'}).then(function(h){ dirH=h; idbSet('dir',h); updateDirInfo(); msg('Now saving to the folder "'+h.name+'". Same names are never overwritten; they get -2, -3 etc.',5000); })
        .catch(function(e){ if(e&&e.name!=='AbortError') msg('The folder could not be chosen here ('+(e.message||e)+'). Create your own subfolder and choose that. Chrome does not allow e.g. Downloads or the home folder.',7000); });
    },'Choose a folder on your computer. Chrome does not allow some folders (Downloads, home); create your own subfolder, e.g. Ritlager.'));
    rDir.appendChild(btn('Forget',function(){ dirH=null; idbSet('dir',null); updateDirInfo(); msg('Folder forgotten'); }));
  }
  bar.appendChild(rDir);
  var rAsk=row(); var askEl=chk(rAsk,'Ask where to save each file',false,'Shows a save dialog every time (Chrome/Edge) instead of saving directly to the chosen folder or Downloads.'); bar.appendChild(rAsk);
  updateDirInfo();
  idbGet('dir',function(h){ if(h&&h.kind==='directory'){ dirH=h; updateDirInfo(); } });
  var r8=row();
  var bSave=btn('Export PNG',function(){ exportPng('save'); },'The image for RC: PNG with the background and size you chose'); bSave.style.background='#111'; bSave.style.color='#fff'; bSave.style.borderColor='#111';
  r8.appendChild(bSave);
  r8.appendChild(btn('Copy image',function(){ exportPng('copy'); }));
  r8.appendChild(btn('Show image',function(){ showDialog(lastBlob,lastName); },'Shows the latest export with its own download link, in case the download does not work'));
  bar.appendChild(r8);

  sec('Underlay (old PNG)');
  var rU=row();
  var uf=el('input'); uf.type='file'; uf.accept='image/*'; uf.style.display='none';
  uf.addEventListener('change',function(){ var f=uf.files[0]; if(!f) return; var r=new FileReader();
    r.onload=function(){ var im=new Image(); im.onload=function(){ backupCurrent(); under={img:im,x:0,y:0,src:r.result}; rebuild(); msg('Underlay placed ('+im.width+' × '+im.height+' px) at the page top-left. Move it if needed.'); }; im.onerror=function(){ msg('Could not read the image'); }; im.src=r.result; };
    r.readAsDataURL(f); uf.value=''; });
  rU.appendChild(uf);
  rU.appendChild(btn('Open PNG…',function(){ uf.click(); },'Load an old image and keep drawing on top of it. The image becomes a fixed background and is included when you export PNG.'));
  var bMove=btn('Move',function(){ if(!under){ msg('Open a PNG first'); return; } moveUnder=!moveUnder; mark(bMove,moveUnder); cv.style.cursor=moveUnder?'move':DOTS; msg(moveUnder?'Drag on the page to move the underlay':'Move off'); },'Drag the underlay with the pen to place it');
  rU.appendChild(bMove);
  rU.appendChild(btn('Delete',function(){ if(!under) return; backupCurrent(); under=null; moveUnder=false; mark(bMove,false); cv.style.cursor=DOTS; rebuild(); msg('Underlay removed'); }));
  bar.appendChild(rU);

  sec('Save and open (editable)');
  var rV1=row(); var verSel=el('select',BTN+'padding:3px 6px;max-width:150px;'); rV1.appendChild(verSel);
  function fillVers(sel){
    var v=getVers(), names=Object.keys(v); verSel.innerHTML='';
    var o0=el('option',null,names.length?'– choose version –':'(no saved versions)'); o0.value=''; verSel.appendChild(o0);
    names.forEach(function(n){ var o=el('option',null,n+' ('+v[n].strokes.length+' strokes)'); o.value=n; verSel.appendChild(o); });
    if(sel&&v[sel]) verSel.value=sel;
  }
  function backupCurrent(){ if(!strokes.length&&!under) return; var v=getVers(); v['Previous (auto)']=pack(); putVers(v); }
  rV1.appendChild(btn('Open',function(){
    var n=verSel.value; if(!n){ msg('Choose a version first'); return; }
    var v=getVers(); if(!v[n]) return; backupCurrent(); unpack(JSON.parse(JSON.stringify(v[n]))); fillVers(n); msg('Opened "'+n+'" (your previous drawing is saved as "Previous (auto)")');
  },'Replaces what you have drawn now. It is first saved as "Previous (auto)".'));
  bar.appendChild(rV1);
  var rVn=row(); var verName=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:4px 8px;width:100%;box-sizing:border-box;'); verName.type='text'; verName.placeholder='Name of new version, e.g. Variant A'; rVn.appendChild(verName); bar.appendChild(rVn);
  rVn.appendChild(el('div','font-size:11px;color:#777;line-height:1.35;width:100%;','Type a name and press Save as new. Versions are stored in this browser, for this page, and appear in the list above. For a file in a place of your choosing: Save project file.'));
  var rV2=row();
  rV2.appendChild(btn('Save as new',function(){
    var v=getVers(), n=(verName.value||'').trim().slice(0,40) || 'Version '+(Object.keys(v).length+1);
    var over=!!v[n]; v[n]=pack(); if(putVers(v)){ fillVers(n); verName.value=''; msg((over?'Overwrote "':'Saved "')+n+'"'); }
  },'Saves what you have drawn as its own version with the name typed above'));
  rV2.appendChild(btn('Update',function(){ var n=verSel.value; if(!n){ msg('Choose which version to update'); return; } var v=getVers(); v[n]=pack(); if(putVers(v)){ fillVers(n); msg('Updated "'+n+'"'); } },'Overwrites the chosen version with what you have drawn now'));
  rV2.appendChild(btn('New blank',function(){ backupCurrent(); strokes=[]; redo=[]; ulog=[]; clearSel(); rebuild(); fillVers(); msg('Blank canvas (your previous drawing is saved as "Previous (auto)")'); }));
  rV2.appendChild(btn('Delete',function(){ var n=verSel.value; if(!n) return; var v=getVers(); v['Deleted (auto)']=v[n]; delete v[n]; putVers(v); fillVers(); msg('Deleted "'+n+'"'); }));
  bar.appendChild(rV2);
  var rV3=row();
  rV3.appendChild(btn('Save project file',function(){
    var bl=new Blob([JSON.stringify(pack(true))],{type:'application/json'});
    saveBlob(bl,fname('ritlager-project','.json'),'The project file is editable and can be reopened, even on another computer.');
  },'The whole drawing as an editable file (.json)'));
  var pf=el('input'); pf.type='file'; pf.accept='.json,application/json'; pf.style.display='none';
  pf.addEventListener('change',function(){ var f=pf.files[0]; if(!f) return; var r=new FileReader(); r.onload=function(){ try{ backupCurrent(); var n=unpack(JSON.parse(r.result)); msg(n<0?'The file does not look like a Ritlager file':'Opened the project file ('+n+' strokes)'); }catch(e){ msg('Could not read the file'); } }; r.readAsText(f); pf.value=''; });
  rV3.appendChild(pf); rV3.appendChild(btn('Open project file',function(){ pf.click(); },'Open a project file you saved earlier'));
  bar.appendChild(rV3);
  fillVers();

  var dbg=el('div','font-size:11px;color:#888;','Device: –'); bar.appendChild(dbg);
  var info=el('div','font-size:11px;color:#777;line-height:1.35;','The drawing is autosaved for this page in the browser. Export PNG gives you the image for RC. Save a project file or a version if you want to edit the strokes later.');
  bar.appendChild(info);

  var note=el('div','position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:'+(Z+2)+';background:#111;color:#fff;padding:7px 13px;border-radius:8px;font:300 13px '+FONT+';opacity:0;transition:opacity .25s;pointer-events:none;');
  function msg(t,ms){ note.textContent=t; note.style.opacity=1; clearTimeout(msg.t); msg.t=setTimeout(function(){note.style.opacity=0;},ms||2400); }

  var lastDraw='pen';
  function show(e,on){ e.style.display = on?'flex':'none'; }
  function setTool(t){
    if(t!=='select'&&tool==='select'){ clearSel(); refresh(); cv.style.cursor=DOTS; }
    if(t==='select') cv.style.cursor=baseCur();
    if(t==='cut'&&tool!=='cut') clearSel();
    tool=t; if(t!=='eraser'&&t!=='select'&&t!=='text'&&t!=='cut') lastDraw=t;
    mark(bPen,t==='pen'); mark(bBrush,t==='brush'); mark(bLine,t==='line'); mark(bEr,t==='eraser'); mark(bTxt,t==='text'); show(rText,t==='text'); markSel();
    show(rNib, t==='pen'); show(rSoft, t==='pen'||t==='eraser');  show(rDry, t==='brush'); show(rArrow, t==='line');
    var pressOK = t!=='line'&&t!=='select'&&t!=='text'&&t!=='cut'; secPress._hidden=!pressOK; applySec(secPress); show(rPr,pressOK); show(rSens,pressOK); show(rPm,pressOK);
  }
  function setColor(c){ color=c; if(c.length===7){ cp.value=c; hexIn.value=c; var n=parseInt(c.slice(1),16); rgbEl.textContent='rgb('+(n>>16)+', '+((n>>8)&255)+', '+(n&255)+')'; } sw.forEach(function(s){ s[0].style.outline = s[1]===c ? '2px solid #111' : 'none'; s[0].style.outlineOffset='2px'; }); if(tool==='eraser') setTool(lastDraw); }
  function setDrawing(d){ drawing=d; cv.style.pointerEvents = d?'auto':'none'; mark(bDraw,d); mark(bPass,!d); msg(d?'Draw mode':'Click mode – you can click in RC'); }
  setTool('pen'); setColor('#111111'); setSize2(3);

  // dra verktygsfältet
  var drag=null;
  head.addEventListener('pointerdown',function(e){ if(e.target.tagName==='BUTTON') return; var r=bar.getBoundingClientRect(); drag={dx:e.clientX-r.left,dy:e.clientY-r.top}; head.setPointerCapture(e.pointerId); });
  head.addEventListener('pointermove',function(e){ if(!drag) return; bar.style.left=(e.clientX-drag.dx)+'px'; bar.style.top=(e.clientY-drag.dy)+'px'; bar.style.right='auto'; });
  head.addEventListener('pointerup',function(){ drag=null; });

  // ---- export ----
  function bounds(){
    var d=bctx.getImageData(0,0,W,H).data, x0=W,y0=H,x1=-1,y1=-1,x,y;
    for(y=0;y<H;y++) for(x=0;x<W;x++){ if(d[(y*W+x)*4+3]>0){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } }
    return x1<0?null:{x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
  }
  var lastName='ritlager.png';
  function showDialog(bl,name){
    if(!bl){ msg('No image to show yet – press Export PNG first'); return; }
    var url=URL.createObjectURL(bl), ov=el('div','position:fixed;inset:0;z-index:'+(Z+5)+';background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:24px;');
    var box=el('div','background:#fff;color:#111;border-radius:12px;padding:14px;max-width:92vw;max-height:92vh;display:flex;flex-direction:column;gap:10px;font:300 14px/1.4 '+FONT+';overflow:auto;');
    box.appendChild(el('div','font-weight:400;',name));
    if(/^image\//.test(bl.type)){ var im=el('img','max-width:80vw;max-height:55vh;object-fit:contain;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px;'); im.src=url; box.appendChild(im); }
    var a=el('a','color:#000;font-weight:400;','Download '+name); a.href=url; a.download=name; box.appendChild(a);
    box.appendChild(el('div','font-size:12px;color:#666;','Download not working? Right-click the image (or long-press) and choose Save image.'));
    var cl=btn('Close',function(){ ov.remove(); }); box.appendChild(cl); ov.appendChild(box); ov.addEventListener('click',function(e){ if(e.target===ov) ov.remove(); });
    de.appendChild(ov);
  }
  // ---- vald mapp (Chrome/Edge): minns mappen mellan besök ----
  var dirH=null;
  function idb(cb){ if(!window.indexedDB){ cb('no'); return; } var r=indexedDB.open('ritlager',1); r.onupgradeneeded=function(){ r.result.createObjectStore('kv'); }; r.onsuccess=function(){ cb(null,r.result); }; r.onerror=function(){ cb(r.error); }; }
  function idbGet(k,cb){ idb(function(e,db){ if(e) return cb(null); try{ var q=db.transaction('kv').objectStore('kv').get(k); q.onsuccess=function(){ cb(q.result); }; q.onerror=function(){ cb(null); }; }catch(x){ cb(null); } }); }
  function idbSet(k,v){ idb(function(e,db){ if(e) return; try{ var tx=db.transaction('kv','readwrite'); if(v==null) tx.objectStore('kv').delete(k); else tx.objectStore('kv').put(v,k); }catch(x){} }); }
  function uniqueName(dir,name,n){
    var m=name.match(/^(.*?)(\.[a-z0-9]+)$/i), base=m?m[1]:name, ext=m?m[2]:'', cand=n?base+'-'+n+ext:name;
    return dir.getFileHandle(cand).then(function(){ return uniqueName(dir,name,(n||1)+1); },function(){ return cand; }); // finns inte = ledigt namn
  }
  function fname(def,ext,suffix){
    var n=(fileNameEl.value||'').trim().replace(/[\\/:*?"<>|]+/g,'-').replace(/\.(png|json)$/i,'');
    return n ? n+(suffix||'')+ext : def+ext;
  }
  function saveBlob(bl,name,okMsg){
    lastBlob=bl; lastName=name;
    function viaDownload(){
      try{
        var a=document.createElement('a'); a.href=URL.createObjectURL(bl); a.download=name; a.style.display='none';
        (document.body||de).appendChild(a); a.click(); setTimeout(function(){ a.remove(); },500);
        msg('Saved as "'+name+'" in the browser download folder (Downloads). '+okMsg+' Cannot find it? Press Show image.',7000);
        if(!saveBlob.shown){ saveBlob.shown=true; showDialog(bl,name); }
      }catch(e){ msg('The download was blocked – showing the file so you can save it by hand',6000); showDialog(bl,name); }
    }
    function viaPicker(){
      if(!window.showSaveFilePicker){ viaDownload(); return; }
      var ext=(name.match(/\.[a-z0-9]+$/i)||['.bin'])[0], acc={}; acc[bl.type||'application/octet-stream']=[ext];
      var opt={suggestedName:name,types:[{description:ext.slice(1).toUpperCase()+' file',accept:acc}]}; if(dirH) opt.startIn=dirH;
      window.showSaveFilePicker(opt)
        .then(function(h){ return h.createWritable().then(function(w){ return w.write(bl).then(function(){ return w.close(); }); }).then(function(){ msg('Saved as "'+h.name+'" where you chose. '+okMsg,6000); }); })
        .catch(function(e){ if(e&&e.name==='AbortError') msg('Saving was cancelled'); else viaDownload(); });
    }
    if(dirH){
      var perm = dirH.queryPermission ? dirH.queryPermission({mode:'readwrite'}) : Promise.resolve('granted');
      perm.then(function(p){ return p==='granted' ? p : dirH.requestPermission({mode:'readwrite'}); })
        .then(function(p){ if(p!=='granted') throw new Error('permission denied'); return uniqueName(dirH,name); })
        .then(function(nm){ return dirH.getFileHandle(nm,{create:true}).then(function(fh){ return fh.createWritable(); }).then(function(w){ return w.write(bl).then(function(){ return w.close(); }); }).then(function(){ msg('Saved in the folder "'+dirH.name+'" as "'+nm+'". '+okMsg,6000); }); })
        .catch(function(e){ msg('Could not save in the chosen folder ('+(e&&e.message?e.message:e)+'). Saving to Downloads instead.',5000); viaDownload(); });
      return;
    }
    if(window.showSaveFilePicker && askEl.checked) viaPicker(); else viaDownload();
  }
  function exportPng(mode){
    try{
      if(mode==='save'&&lySel.value==='each'&&bgSel.value!=='shot'){
        var L2=layers.filter(function(L){ return L.vis&&strokes.some(function(st){ return layerOf(st)===L.id; }); });
        if(!L2.length){ msg('Draw something first'); return; }
        L2.forEach(function(L,i){ setTimeout(function(){ try{ exportPng2('save',L.id,L.name); }catch(e){ msg('Export failed: '+(e&&e.message?e.message:e)); } },i*400); });
        return;
      }
      exportPng2(mode, lySel.value==='active' ? act : null);
    }catch(e){ msg('Export failed: '+(e&&e.message?e.message:e)+'. Try Image size: Strokes only.'); }
  }
  function exportPng2(mode,only,label){
    var b, out, oc;
    if(bgSel.value==='shot'){
      if(!ref){ msg('Capture a screenshot first (Capture screenshot)'); return; }
      out=document.createElement('canvas'); out.width=ref.c.width; out.height=ref.c.height; oc=out.getContext('2d');
      oc.drawImage(ref.c,0,0);
      rscale=ref.k; compose(oc,function(c){ c.scale(ref.k,ref.k); c.translate(-ref.sx,-ref.sy); },only==null?null:only); rscale=1;
      b={x:ref.sx,y:ref.sy,w:out.width,h:out.height};
    } else {
      if(!strokes.length&&!under){ msg('Draw something first'); return; }
      b={x:0,y:0,w:W,h:H};
      if(cr.checked){ var t=bounds(); if(t){ var pad=8,x=Math.max(0,t.x-pad),y=Math.max(0,t.y-pad); b={x:x,y:y,w:Math.min(W,t.x+t.w+pad)-x,h:Math.min(H,t.y+t.h+pad)-y}; } }
      out=document.createElement('canvas'); out.width=b.w; out.height=b.h;
      oc=out.getContext('2d'); var bgv=bgValue(); if(bgv){ oc.fillStyle=bgv; oc.fillRect(0,0,b.w,b.h); }
      if(only==null&&plainLayers()) oc.drawImage(base,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
      else compose(oc,function(c){ c.translate(-b.x,-b.y); },only==null?null:only);
    }
    out.toBlob(function(bl){
      if(!bl){ msg('The image became too large for the browser. Choose Image size: Strokes only.'); return; }
      lastBlob=bl; var tag=label?'-'+String(label).replace(/[^\w-]+/g,'_'):''; lastName=fname('ritlager'+tag+'-'+b.w+'x'+b.h,'.png',tag);
      if(mode==='copy'){
        try{ navigator.clipboard.write([new ClipboardItem({'image/png':bl})]).then(function(){msg('Image copied');},function(){msg('Copying was denied – use Export PNG');}); }
        catch(e){ msg('Copying is not supported here – use Export PNG'); }
      } else {
        saveBlob(bl,lastName,'('+b.w+' × '+b.h+' px'+(bgSel.value==='shot'?', with screenshot':bgValue()?'':', transparent')+')');
      }
    },'image/png');
  }

  // ---- tangenter ----
  function typing(t){ if(!t) return false; if(t.tagName==='TEXTAREA'||t.isContentEditable) return true; if(t.tagName==='INPUT'){ var ty=(t.type||'text').toLowerCase(); return ty==='text'||ty==='search'||ty==='number'||ty==='email'||ty==='url'||ty==='password'; } return false; }
  function onKey(e){
    if(!visible || typing(e.target)) return;
    var k=e.key.toLowerCase();
    var mod=e.ctrlKey||e.metaKey;
    if(mod&&k==='z'&&drawing){ e.preventDefault(); if(e.shiftKey) redoFn(); else undo(); return; }
    if(mod&&k==='y'&&drawing){ e.preventDefault(); redoFn(); return; }
    if(mod&&drawing&&tool==='select'){
      if(k==='c'){ e.preventDefault(); selCopy(); return; }
      if(k==='x'){ e.preventDefault(); selCut(); return; }
      if(k==='a'){ e.preventDefault(); selAll(); return; }
      if(k==='d'){ e.preventDefault(); selDup(); return; }
    }
    if(drawing&&tool==='select'&&(k==='delete'||k==='backspace')&&sel.length){ e.preventDefault(); selDelete(); return; }
    if(drawing&&tool==='select'&&k==='escape'){ clearSel(); refresh(); return; }
    if(e.ctrlKey||e.metaKey||e.altKey) return;
    if(k==='d') setDrawing(!drawing);
    else if(drawing){
      if(k==='b') setTool('pen'); else if(k==='p') setTool('brush'); else if(k==='l') setTool('line'); else if(k==='e') setTool('eraser'); else if(k==='i') pickColour(); else if(k==='s'||k==='v') setTool('select'); else if(k==='t') setTool('text');
      else if(k==='['){ setSize2(size*0.8); }
      else if(k===']'){ setSize2(size*1.25); }
    }
  }
  document.addEventListener('keydown', onKey, true);

  var api={
    toggle:function(){ visible=!visible; cv.style.display=bar.style.display=visible?(bar.style.display==='none'?'flex':''):'none'; cv.style.display=visible?'block':'none'; bar.style.display=visible?'flex':'none'; if(visible) msg('Ritlager on'); },
    destroy:function(){ document.removeEventListener('keydown',onKey,true); cv.remove(); if(scPos) scPos.style.position=''; bar.remove(); note.remove(); delete window.__ritlager; }
  };
  window.__ritlager=api;

  // ---- presets and remembered settings ----
  var thinSelRef=thinSel;
  function getSettings(all){
    var o={tool:(tool==='eraser'?lastDraw:tool),color:color,size:+size.toFixed(2),nib:nibSel.value,soft:+soft.value,dry:+dry.value,ink:+ink.value,sens:+sens.value,pr:pr.checked,pm:pm.value,sm:+sm.value,thin:thinSel.value,arrow:ar.checked};
    if(all){ o.csel=csel.value; o.bg=bgSel.value; o.bgc=bgCol.value; o.ly=lySel.value; o.ask=askEl.checked; o.tool=tool; if(bar.style.left){ o.x=parseFloat(bar.style.left); o.y=parseFloat(bar.style.top); } }
    return o;
  }
  function applySettings(o){
    if(!o) return;
    if(o.nib) nibSel.value=o.nib; if(o.soft!=null) soft.value=o.soft; if(o.dry!=null) dry.value=o.dry; if(o.ink!=null) ink.value=o.ink;
    if(o.sens!=null) sens.value=o.sens; if(o.pr!=null) pr.checked=o.pr; if(o.pm) pm.value=o.pm; if(o.sm!=null) sm.value=o.sm;
    if(o.thin) thinSel.value=o.thin; if(o.arrow!=null) ar.checked=o.arrow;
    if(o.csel){ csel.value=o.csel; hint(); } if(o.bg){ bgSel.value=o.bg; bgCol.style.display=bgSel.value==='color'?'inline-block':'none'; } if(o.bgc) bgCol.value=o.bgc;
    if(o.ly) lySel.value=o.ly; if(o.ask!=null) askEl.checked=o.ask;
    if(o.tool) setTool(o.tool); if(o.color) setColor(o.color); if(o.size!=null) setSize2(o.size);
    if(o.x!=null&&o.y!=null){ bar.style.left=Math.max(0,Math.min(o.x,window.innerWidth-80))+'px'; bar.style.top=Math.max(0,Math.min(o.y,window.innerHeight-60))+'px'; bar.style.right='auto'; }
  }
  var STK='ritlager-settings', stT=0;
  function saveSettings(){ clearTimeout(stT); stT=setTimeout(function(){ try{ localStorage.setItem(STK,JSON.stringify(getSettings(true))); }catch(e){} },400); }
  bar.addEventListener('input',saveSettings); bar.addEventListener('change',saveSettings); bar.addEventListener('click',saveSettings); head.addEventListener('pointerup',saveSettings);
  try{ applySettings(JSON.parse(localStorage.getItem(STK))); }catch(e){}
  var PK='ritlager-presets';
  var DEFPRE=[{n:'Thin black',s:{tool:'pen',color:'#111111',size:0.4,nib:'round',soft:0,ink:100,thin:'black'}},{n:'Pencil',s:{tool:'pen',color:'#222222',size:3,nib:'pencil',soft:0,ink:100}},{n:'Marker',s:{tool:'pen',color:'#f2c200',size:24,nib:'marker',soft:0,ink:100}},{n:'Watercolour',s:{tool:'pen',color:'#1f5fd1',size:30,nib:'water',soft:0,ink:100}}];
  function loadPre(){ try{ var a=JSON.parse(localStorage.getItem(PK)); if(a&&a.length!=null) return a; }catch(e){} return DEFPRE.slice(); }
  function savePre(a){ try{ localStorage.setItem(PK,JSON.stringify(a)); }catch(e){} }
  function drawPre(){
    preBox.innerHTML='';
    loadPre().forEach(function(p,i){
      var g=el('span','display:inline-flex;');
      var b=btn(p.n,function(){ applySettings(p.s); msg('Preset: '+p.n); },'Use this preset'); b.style.borderTopRightRadius=b.style.borderBottomRightRadius='0';
      var x=btn('✕',function(){ var a=loadPre(); a.splice(i,1); savePre(a); drawPre(); },'Delete this preset'); x.style.cssText+='border-top-left-radius:0;border-bottom-left-radius:0;border-left:0;padding:4px 5px;color:#888;';
      g.appendChild(b); g.appendChild(x); preBox.appendChild(g);
    });
  }
  drawPre();
  // ---- collapsible menus: groups containing sections (remembered between visits) ----
  (function(){
    var OK='ritlager-sections', st={}; try{ st=JSON.parse(localStorage.getItem(OK))||{}; }catch(e){}
    var closedDefault={'Pressure and stabilising':1,'Underlay (old PNG)':1};
    var GROUP={'Drawing tools':'Draw','Presets':'Draw','Colour':'Draw','Thickness':'Draw','Look':'Draw','Pressure and stabilising':'Draw','Undo and canvas':'Edit','Select tool':'Edit','Effect tools':'Edit','Images':'Edit','Cut out':'Edit','Layers':'Layers','Export (image for RC)':'Export and save','Underlay (old PNG)':'Export and save','Save and open (editable)':'Export and save'};
    var hs=[], gs=[], curH=null, wrap=null, curG=null, gw=null;
    function saveSt(){ try{ localStorage.setItem(OK,JSON.stringify(st)); }catch(e){} }
    function applyGrp(g){ g.textContent=(g._open?'▾ ':'▸ ')+g._t; g._wrap.style.display=g._open?'flex':'none'; }
    Array.prototype.slice.call(bar.children).forEach(function(k){
      if(k.hasAttribute&&k.hasAttribute('data-sec')){
        var gn=GROUP[k._t]||'More';
        if(!curG||curG._t!==gn){
          curG=el('div','font-size:12px;letter-spacing:.07em;text-transform:uppercase;font-weight:400;color:#111;margin-top:6px;padding:6px 8px;background:#efefef;border-radius:7px;cursor:pointer;user-select:none;',gn); curG._t=gn;
          curG._open = st['grp:'+gn]!=null ? !!st['grp:'+gn] : true;
          gw=el('div','display:flex;flex-direction:column;gap:7px;padding-left:8px;border-left:2px solid #e4e4e4;'); curG._wrap=gw; gs.push(curG);
          bar.appendChild(curG); bar.appendChild(gw);
          (function(g){ g.addEventListener('click',function(){ g._open=!g._open; st['grp:'+g._t]=g._open?1:0; saveSt(); applyGrp(g); }); })(curG);
        }
        curH=k; hs.push(k); wrap=el('div','display:flex;flex-direction:column;gap:7px;'); k._wrap=wrap;
        k._open = st[k._t]!=null ? !!st[k._t] : !closedDefault[k._t];
        gw.appendChild(k); gw.appendChild(wrap);
        k.addEventListener('click',function(){ k._open=!k._open; st[k._t]=k._open?1:0; saveSt(); applySec(k); });
      } else if(curH){ wrap.appendChild(k); }
    });
    hs.forEach(applySec); gs.forEach(applyGrp);
    var allBtn=btn('⇕',function(){ var anyOpen=gs.some(function(g){ return g._open; })||hs.some(function(h){ return h._open&&!h._hidden; }); gs.forEach(function(g){ g._open=!anyOpen; st['grp:'+g._t]=g._open?1:0; applyGrp(g); }); hs.forEach(function(h){ h._open=!anyOpen; st[h._t]=h._open?1:0; applySec(h); }); saveSt(); },'Collapse / expand all menus');
    hg.insertBefore(allBtn,hg.firstChild);
  })();
  placeCanvas(); de.appendChild(bar); de.appendChild(note);
  setSize(); setDrawing(true);
  var nRest=restore();
  if(nRest){ rebuild(); }
  ready=true;
  msg(nRest ? 'Ritlager on – restored your earlier drawing ('+nRest+' strokes)' : 'Ritlager on – draw right on the page. D toggles draw/click.');
})();
