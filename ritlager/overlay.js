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

  var ref=null, rscale=1, under=null, moveUnder=false, contrast=0, tool='pen', color='#000000', size=4, drawing=true, visible=true;
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
  var restyle=false, tgt=[], quietChg=false; // changes only reach existing strokes when they are selected
  function targets(){ if(tool==='select'&&sel&&sel.length) return sel; if(!restyle) return []; return tgt.filter(function(st){ return strokes.indexOf(st)>=0; }); }
  function clearSel(){ sel=[]; selCur=[]; selBox=null; marq=null; selDrag=null; }
  function scaleTextProps(n,st,k){ if(st.tool!=='text') return; ['bw','ls','ol','sh','bxl','bxp','fat','sb','ob','bxs'].forEach(function(p){ if(st[p]) n[p]=st[p]*k; }); }
  function isObj(st){ return st.tool==='text'||st.tool==='image'; }
  function objCorners(st){ if(st.tool==='text') return textBox(st); var im=imgs[st.iid]||{w:100,h:100}, w=im.w*st.size, h=im.h*st.size, co=Math.cos(st.rot||0), si=Math.sin(st.rot||0), p=st.pts[0]; return [[0,0],[w,0],[w,h],[0,h]].map(function(q){ return {x:p.x+q[0]*co-q[1]*si,y:p.y+q[0]*si+q[1]*co}; }); }
  function selPts(st){ if(!isObj(st)) return st.pts; var q=objCorners(st); q.push({x:(q[0].x+q[2].x)/2,y:(q[0].y+q[2].y)/2}); return q; }
  function strokeBox(st){ if(isObj(st)){ var q=objCorners(st), a=1e9,b=1e9,c2=-1e9,d=-1e9; q.forEach(function(p){ a=Math.min(a,p.x); c2=Math.max(c2,p.x); b=Math.min(b,p.y); d=Math.max(d,p.y); }); return {x0:a-3,y0:b-3,x1:c2+3,y1:d+3}; }
    var x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,r=(st.tool==='air'||st.tool==='px'?(st.size||2)*1.5:(st.size||2)/2)+3; st.pts.forEach(function(p){ if(p.x<x0)x0=p.x; if(p.x>x1)x1=p.x; if(p.y<y0)y0=p.y; if(p.y>y1)y1=p.y; }); return {x0:x0-r,y0:y0-r,x1:x1+r,y1:y1+r}; }
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
      opSnap(function(){ strokes.push(st); sel=[st]; selCur=[st]; selBox=boxOf([st]); }); tgt=[st];
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
  function styleTa(ta,P){
    ta.style.color=P.color; ta.style.font=textFont(P); ta.style.lineHeight=String(P.lh||1.25); ta.style.letterSpacing=(P.ls||0)+'px'; ta.style.textAlign=P.al||'left';
    ta.style.whiteSpace=P.bw>0?'pre-wrap':'pre'; ta.style.width=P.bw>0?P.bw+'px':''; ta.style.webkitTextFillColor=(P.fa!=null&&P.fa<50)?'transparent':''; ta.style.webkitTextStroke=P.ol>0?Math.min(P.ol,3)+'px '+(P.olc||'#e0245e')+'':''; ta.style.background=P.bx?(P.bxc||'#fff'):'rgba(255,255,255,.35)';
  }
  function backFromText(){ if(tool==='text') setTool(lastDraw&&lastDraw!=='text'?lastDraw:'pen'); }
  function openText(x,y,orig){
    commitText();
    var P=Object.assign({},orig?orig:curProps()), P0=P; if(orig) setControls(orig);
    var ta=document.createElement('textarea');
    ta.style.cssText='position:absolute;left:'+x+'px;top:'+y+'px;z-index:'+(Z+1)+';margin:0;padding:0;border:1px dashed #888;background:rgba(255,255,255,.35);outline:none;resize:none;overflow:hidden;white-space:pre;min-width:140px;'; styleTa(ta,P);
    ta.rows=1; ta.value=orig?orig.text:''; ta.spellcheck=false;
    function fit(){ var P=tEd?tEd.P:P0; ta.style.height='auto'; ta.style.height=Math.max(P.size*1.25,ta.scrollHeight)+'px'; if(!(P.bw>0)){ ta.style.width='auto'; ta.style.width=Math.max(140,ta.scrollWidth+8)+'px'; } }
    ta.addEventListener('input',fit);
    ta.addEventListener('keydown',function(e){ e.stopPropagation(); if(e.key==='Escape'){ if(tEd) tEd.cancel=true; ta.blur(); } else if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); ta.blur(); } },true);
    ta.addEventListener('blur',function(){ setTimeout(function(){ if(tEd&&tEd.ta===ta&&bar.contains(document.activeElement)) return; if(tEd&&tEd.ta===ta){ commitText(); backFromText(); } },0); });
    (cv.parentNode||de).appendChild(ta);
    tEd={ta:ta,x:x,y:y,orig:orig,P:P,cancel:false,prev:null}; ta.style.height='';
    if(orig){ tEd.prev=strokes; strokes=strokes.filter(function(st){ return st!==orig; }); rebuild(); }
    fit(); setTimeout(function(){ ta.focus(); },0);
  }
  function commitText(){
    if(!tEd) return; var t=tEd; tEd=null; var val=t.ta.value.replace(/\s+$/,''); var ta=t.ta; ta.remove();
    var prev=t.prev||strokes;
    if(t.cancel||(!val&&!t.orig)){ if(t.prev){ strokes=t.prev; rebuild(); } return; }
    strokes=prev.slice(); var ns=null;
    if(val) ns=t.orig?Object.assign({},t.orig,t.P,{text:val,ink:t.orig.ink}):Object.assign({},t.P,{l:act,tool:'text',text:val,ink:+ink.value/100,pts:[{x:t.x,y:t.y,p:1}]});
    if(t.orig){ var i=strokes.indexOf(t.orig); if(i>=0){ if(ns) strokes[i]=ns; else strokes.splice(i,1); } } else if(ns) strokes.push(ns);
    ulog.push({t:'s',prev:prev}); redo=[]; clearSel(); if(ns) tgt=[ns]; rebuild();
  }
  function textHit(q){ for(var i=strokes.length-1;i>=0;i--){ var st=strokes[i]; if(st.tool==='text'&&getLayer(layerOf(st)).vis&&inBox(strokeBox(st),q)) return st; } return null; }
  function textDown(e){
    e.preventDefault(); var q=cpt(e);
    if(tEd&&tEd.ta&&e.target===tEd.ta) return;
    var hit=textHit(q);
    if(hit&&(layerOf(hit)===act||selScope==='all')){ openText(hit.pts[0].x,hit.pts[0].y,hit); return; }
    if(tEd){ commitText(); backFromText(); return; }
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
  function distSeg(p,a,b){ var dx=b.x-a.x, dy=b.y-a.y, l=dx*dx+dy*dy, t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0; return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy)); }
  function hitStroke(st,q){
    if(st.tool==='cut') return false;
    if(isObj(st)){ var c=objCorners(st); return pip(q.x,q.y,c); }
    var r=(st.tool==='air'||st.tool==='px'?(st.size||2)*1.5:(st.size||2)/2)+5, p=st.pts; if(!p.length) return false;
    if(p.length===1) return Math.hypot(q.x-p[0].x,q.y-p[0].y)<=r;
    for(var i=1;i<p.length;i++) if(distSeg(q,p[i-1],p[i])<=r) return true; return false;
  }
  function pickAt(q){ for(var i=strokes.length-1;i>=0;i--){ if(inScope(strokes[i])&&hitStroke(strokes[i],q)) return strokes[i]; } return null; }
  function selDown(e){
    var q=cpt(e); cv.setPointerCapture(e.pointerId); e.preventDefault();
    if(sel.length&&rotAt(q)){ var rc={cx:(selBox.x0+selBox.x1)/2,cy:(selBox.y0+selBox.y1)/2}; rc.a0=Math.atan2(q.y-rc.cy,q.x-rc.cx); selOrig=strokes; selDrag={rot:rc,moved:false}; return; }
    if(sel.length){ var hi=handleAt(q); if(hi>=0){ var cs=corners(), g=cs[hi], a=cs[(hi+2)%4]; if(g.x!==a.x&&g.y!==a.y){ selOrig=strokes; selDrag={sc:{ax:a.x,ay:a.y,gx:g.x,gy:g.y},moved:false}; return; } } }
    var pk=selMode!=='lasso'?pickAt(q):null;
    if(sel.length&&inBox(selBox,q)&&(selMode!=='pick'&&selMode!=='rect'||!pk||sel.indexOf(pk)>=0||selMode==='rect'&&inBox(selBox,q))){ selOrig=strokes; selCur=sel; selDrag={x:q.x,y:q.y,moved:false}; return; }
    sel=[]; selBox=null;
    if(selMode==='pick'||(selMode==='rect'&&pk)){
      if(pk) sel=[pk];
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
      strokes=selOrig.map(function(st){ if(sel.indexOf(st)<0) return st; var n=Object.assign({},st); delete n.sm; n.size=st.size*Math.sqrt(Math.abs(sx*sy)); scaleTextProps(n,st,Math.sqrt(Math.abs(sx*sy))); n.pts=st.pts.map(function(p){ return {x:c.ax+(p.x-c.ax)*sx,y:c.ay+(p.y-c.ay)*sy,p:p.p}; }); selCur.push(n); return n; });
      selBox=boxOf(selCur); cancelAnimationFrame(ugRaf); ugRaf=requestAnimationFrame(rebuild); return;
    }
    var dx=q.x-selDrag.x, dy=q.y-selDrag.y; if(!selDrag.moved&&Math.abs(dx)+Math.abs(dy)<2) return; selDrag.moved=true;
    var map=new Map(); selCur=[];
    strokes=selOrig.map(function(st){ if(sel.indexOf(st)<0) return st; var n=cloneStroke(st,dx,dy); selCur.push(n); return n; });
    selBox=boxOf(selCur); cancelAnimationFrame(ugRaf); ugRaf=requestAnimationFrame(rebuild);
  }
  // Lasso/rectangle over a picture: whole picture if fully enclosed, otherwise lift out just the enclosed part as a new picture
  function selectImageParts(poly){
    var out=[], todo=[];
    strokes.forEach(function(st){ if(st.tool==='image'&&inScope(st)&&ensureImg(st.iid)) todo.push(st); });
    var bx0=1e9,by0=1e9,bx1=-1e9,by1=-1e9; poly.forEach(function(p){ bx0=Math.min(bx0,p.x); by0=Math.min(by0,p.y); bx1=Math.max(bx1,p.x); by1=Math.max(by1,p.y); });
    var changes=[];
    todo.forEach(function(st){
      var q=objCorners(st);
      if(q.every(function(p){ return pip(p.x,p.y,poly); })){ out.push(st); return; }
      var ib=strokeBox(st), x0=Math.max(bx0,ib.x0), y0=Math.max(by0,ib.y0), x1=Math.min(bx1,ib.x1), y1=Math.min(by1,ib.y1);
      if(x1-x0<2||y1-y0<2) return;
      var im=ensureImg(st.iid), W=im.naturalWidth, H=im.naturalHeight, k=Math.min(3,Math.max(1,1/Math.max(st.size,0.01)));
      while((x1-x0)*k>4000||(y1-y0)*k>4000) k/=2;
      var pw=Math.max(1,Math.round((x1-x0)*k)), ph=Math.max(1,Math.round((y1-y0)*k)), pc=document.createElement('canvas'); pc.width=pw; pc.height=ph; var px=pc.getContext('2d');
      px.scale(k,k); px.translate(-x0,-y0); renderImage(px,Object.assign({},st,{ink:1}));
      px.setTransform(1,0,0,1,0,0); px.globalCompositeOperation='destination-in'; px.scale(k,k); px.translate(-x0,-y0); px.beginPath(); poly.forEach(function(p,i){ if(i) px.lineTo(p.x,p.y); else px.moveTo(p.x,p.y); }); px.closePath(); px.fillStyle='#000'; px.fill();
      var has=false; try{ var dd=px.getImageData(0,0,pw,ph).data; for(var i=3;i<dd.length;i+=4) if(dd[i]>8){ has=true; break; } }catch(e){ has=true; }
      if(!has) return;
      // remainder: original pixels with the enclosed area made transparent (polygon mapped into the picture's own pixel space)
      var rc=document.createElement('canvas'); rc.width=W; rc.height=H; var rx=rc.getContext('2d'); rx.drawImage(im,0,0);
      var co=Math.cos(-(st.rot||0)), si=Math.sin(-(st.rot||0)), o=st.pts[0], sx=st.size*(st.fx?-1:1), sy=st.size*(st.fy?-1:1);
      rx.globalCompositeOperation='destination-out'; rx.fillStyle='#000'; rx.beginPath();
      poly.forEach(function(p,i){ var dx=p.x-o.x, dy=p.y-o.y, u=(dx*co-dy*si)/sx, v=(dx*si+dy*co)/sy, X=st.fx?u+W:u, Y=st.fy?v+H:v; if(i) rx.lineTo(X,Y); else rx.moveTo(X,Y); });
      rx.closePath(); rx.fill();
      var rid='i'+Date.now().toString(36)+Math.floor(Math.random()*1e5).toString(36), pid=rid+'p';
      var rsrc=rc.toDataURL('image/png'), psrc=pc.toDataURL('image/png');
      imgs[rid]={src:rsrc,w:W,h:H}; imgs[pid]={src:psrc,w:pw,h:ph};
      var rem=Object.assign({},st,{iid:rid,pts:[{x:o.x,y:o.y,p:1}]}); delete rem.sm;
      var piece=Object.assign({},st,{iid:pid,size:1/k,rot:0,fx:false,fy:false,pts:[{x:x0,y:y0,p:1}]}); delete piece.sm;
      changes.push({orig:st,rem:rem,piece:piece});
    });
    if(changes.length){
      opSnap(function(){ changes.forEach(function(c){ strokes[strokes.indexOf(c.orig)]=c.rem; strokes.push(c.piece); out.push(c.piece); }); });
    }
    return out;
  }
  function selUp(){
    var d=selDrag; selDrag=null;
    if(d.marq&&d.cut){ finishCut(); return; }
    if(d.marq){
      var m=marq; marq=null; sel=[]; var mpoly=null;
      if(m.lasso){
        if(m.pts.length>=3){ mpoly=m.pts; sel=strokes.filter(function(st){ return st.tool!=='image'&&inScope(st)&&selPts(st).some(function(p){ return pip(p.x,p.y,m.pts); }); }); }
      } else {
        var x0=Math.min(m.x0,m.x1),x1=Math.max(m.x0,m.x1),y0=Math.min(m.y0,m.y1),y1=Math.max(m.y0,m.y1);
        if(x1-x0<4&&y1-y0<4){ var pk2=pickAt({x:x0,y:y0}); if(pk2) sel=[pk2]; }
        else { mpoly=[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}]; sel=strokes.filter(function(st){ return st.tool!=='image'&&inScope(st)&&selPts(st).some(function(p){ return p.x>=x0&&p.x<=x1&&p.y>=y0&&p.y<=y1; }); }); }
      }
      if(mpoly) sel=sel.concat(selectImageParts(mpoly));
      setSelUI();
      selBox=sel.length?boxOf(sel):null; msg(sel.length?sel.length+' stroke'+(sel.length>1?'s':'')+' selected':'Nothing selected (scope: '+(selScope==='all'?'all visible layers':'active layer')+')'); refresh(); return;
    }
    if(d.moved){ ulog.push({t:'s',prev:selOrig}); redo=[]; sel=selCur; selBox=boxOf(sel); persist(); }
    refresh();
  }
  function drawTgtBox(){
    if(!restyle||marq||(sel&&sel.length)||cur) return; var t=tgt.filter(function(st){ return strokes.indexOf(st)>=0; }); if(!t.length) return; var b=boxOf(t); if(!b) return;
    ctx.save(); ctx.setLineDash([5,4]); ctx.lineWidth=1.2; ctx.strokeStyle='rgba(40,120,255,.9)'; ctx.strokeRect(b.x0,b.y0,b.x1-b.x0,b.y1-b.y0); ctx.restore();
  }
  function drawSelOverlay(){
    drawTgtBox();
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
    opSnap(function(){ strokes=strokes.map(function(st){ if(old.indexOf(st)<0) return st; var n=Object.assign({},st); delete n.sm; n.size=st.size*scale; scaleTextProps(n,st,scale);
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
  function layerHasFx(L){ var f=L&&L.fx; return !!(f&&(f.blur>0||f.glow||f.sh)); }
  function fxOf(L){ return L.fx||(L.fx={blur:0,glow:0,gsz:12,gamt:100,gcol:'#ffd24d',sh:0,shb:8,shx:6,shy:6,shamt:60,shcol:'#000000'}); }
  function anyFx(){ return layers.some(layerHasFx)||strokes.some(function(st){ return st.fx; }); }
  function plainLayers(){ return layers.length===1&&layers[0].op>=100&&(!layers[0].bm||layers[0].bm==='source-over')&&!anyFx()&&!anyPx(); }
  function drawLayerFx(target,L){
    var f=L.fx, k=rscale||1, OFF=20000, a0=L.op/100, bm=L.bm||'source-over';
    target.save(); target.setTransform(1,0,0,1,0,0); target.globalCompositeOperation=bm;
    if(f&&f.sh){ target.save(); target.globalAlpha=a0*Math.min(1,f.shamt/100); target.shadowColor=f.shcol; target.shadowBlur=f.shb*k; target.shadowOffsetX=(OFF+f.shx)*k; target.shadowOffsetY=f.shy*k; target.drawImage(tmp,-OFF*k,0); target.restore(); }
    if(f&&f.glow){ var n=Math.max(1,Math.ceil(f.gamt/100)), al=Math.min(1,f.gamt/100/n); for(var i=0;i<n;i++){ target.save(); target.globalAlpha=a0*al; target.shadowColor=f.gcol; target.shadowBlur=f.gsz*k; target.shadowOffsetX=OFF*k; target.shadowOffsetY=0; target.drawImage(tmp,-OFF*k,0); target.restore(); } }
    target.globalAlpha=a0; if(f&&f.blur>0&&('filter' in target)) target.filter='blur('+(f.blur*k)+'px)';
    target.drawImage(tmp,0,0); target.restore();
  }
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
      if(layerHasFx(L)) drawLayerFx(target,L); else { target.save(); target.setTransform(1,0,0,1,0,0); target.globalAlpha=L.op/100; target.globalCompositeOperation=L.bm||'source-over'; target.drawImage(tmp,0,0); target.restore(); }
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
    return {v:1,t:Date.now(),c:contrast,ref:(withRef&&ref)?{src:ref.c.toDataURL('image/png'),sx:ref.sx,sy:ref.sy,w:ref.w,h:ref.h,k:ref.k}:undefined,under:under?{src:under.src,x:under.x,y:under.y}:null,layers:layers.map(function(L){ return {id:L.id,name:L.name,vis:L.vis,op:L.op,bm:L.bm||'source-over',fx:L.fx||undefined}; }),act:act,images:(function(){ var o={}; strokes.forEach(function(st){ if(st.iid&&imgs[st.iid]&&!o[st.iid]) o[st.iid]={src:imgs[st.iid].src,w:imgs[st.iid].w,h:imgs[st.iid].h}; }); return o; })(),strokes:strokes.map(function(s){ var o={}; for(var k in s) if(k!=='pts'&&k!=='sm') o[k]=s[k];
      o.pts=s.pts.map(function(p){ return [Math.round(p.x*10)/10,Math.round(p.y*10)/10,Math.round(p.p*100)/100]; }); return o; })};
  }
  function unpack(d){
    if(!d||!d.strokes) return -1;
    imgs={}; if(d.images) Object.keys(d.images).forEach(function(k){ imgs[k]={src:d.images[k].src,w:d.images[k].w,h:d.images[k].h}; });
    strokes=d.strokes.map(function(o){ o.pts=o.pts.map(function(p){ return {x:p[0],y:p[1],p:p[2]}; }); return o; });
    layers = (d.layers&&d.layers.length) ? d.layers.map(function(L){ return {id:L.id,name:L.name,vis:L.vis!==false,op:L.op==null?100:L.op,bm:L.bm||'source-over',fx:L.fx||undefined}; }) : [{id:1,name:'Layer 1',vis:true,op:100}];
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
  var FONTS={sans:'"Geosans Light","Avenir","Avenir Next","Nunito Sans",system-ui,sans-serif',serif:'Georgia,"Times New Roman",serif',mono:'"SF Mono",Menlo,Consolas,monospace',hand:'"Segoe Print","Bradley Hand","Comic Sans MS",cursive',display:'Impact,"Arial Black",sans-serif',avenir:'"Avenir","Avenir Next","Nunito Sans",sans-serif',helvetica:'"Helvetica Neue",Helvetica,Arial,sans-serif',futura:'Futura,"Century Gothic","Trebuchet MS",sans-serif',gill:'"Gill Sans","Gill Sans MT",Calibri,sans-serif',verdana:'Verdana,Geneva,sans-serif',garamond:'Garamond,"Hoefler Text","Palatino Linotype",serif',palatino:'Palatino,"Book Antiqua","Palatino Linotype",serif',times:'"Times New Roman",Times,serif',didot:'Didot,"Bodoni MT","Playfair Display",serif',courier:'"Courier New",Courier,monospace',typewriter:'"American Typewriter","Courier New",monospace',marker:'"Marker Felt","Chalkduster","Comic Sans MS",cursive',script:'"Brush Script MT","Snell Roundhand","Lucida Handwriting",cursive',impact:'Impact,"Arial Black","Haettenschweiler",sans-serif'};
  function fontStack(ff){ if(ff&&ff.slice(0,2)==='c:'){ var nm=ff.slice(2).replace(/["\\]/g,''); return '"'+nm+'",sans-serif'; } return FONTS[ff]||FONTS.sans; }
  function textFont(s){ return (s.it?'italic ':'')+(s.wt||(s.bd?700:300))+' '+s.size+'px '+fontStack(s.ff); }
  var mctx=document.createElement('canvas').getContext('2d');
  function layoutText(s){
    mctx.font=textFont(s); try{ mctx.letterSpacing=(s.ls||0)+'px'; }catch(e){}
    var lh=s.size*(s.lh||1.25), lines=[];
    s.text.split('\n').forEach(function(par){
      if(!(s.bw>0)){ lines.push(par); return; }
      var cur=''; par.split(' ').forEach(function(w){ var t=cur?cur+' '+w:w; if(cur&&mctx.measureText(t).width>s.bw){ lines.push(cur); cur=w; } else cur=t; }); lines.push(cur);
    });
    var w=s.bw>0?s.bw:0, ws=lines.map(function(l){ return mctx.measureText(l).width; }); if(!w) ws.forEach(function(x){ w=Math.max(w,x); });
    return {lines:lines,ws:ws,w:w,h:lines.length*lh,lh:lh};
  }
  function renderText(c,s){
    var p=s.pts[0], L=layoutText(s), base=s.ink==null?1:s.ink, OFF=20000, fa=s.fa==null?100:s.fa, tO=(s.to==null?100:s.to)/100, oO=(s.oo==null?100:s.oo)/100, sb=s.sb||0, ob=s.ob||0;
    function pass(blur,colour,alpha,draw,isBox){
      c.save(); c.globalAlpha=base*alpha; c.lineJoin='round';
      if(blur>0){ c.translate(-OFF,0); c.shadowColor=colour; c.shadowBlur=blur*rscale; c.shadowOffsetX=OFF*rscale; }
      else if(blur===0&&s.sh>0&&(!s.bx||isBox)){ c.shadowColor='rgba(0,0,0,.5)'; c.shadowBlur=s.sh*rscale; c.shadowOffsetX=s.sh*0.4*rscale; c.shadowOffsetY=s.sh*0.4*rscale; }
      c.translate(p.x,p.y); if(s.rot) c.rotate(s.rot); c.textBaseline='top'; c.font=textFont(s); try{ c.letterSpacing=(s.ls||0)+'px'; }catch(e){}
      draw(); c.restore();
    }
    function lines(fn){ L.lines.forEach(function(ln,i){ fn(ln,s.al==='center'?(L.w-L.ws[i])/2:(s.al==='right'?L.w-L.ws[i]:0),i*L.lh); }); }
    if(s.bx){ var pd=s.bxp==null?8:s.bxp, bo=(s.bxo==null?100:s.bxo)/100;
      pass(s.bxs||0,s.bxc||'#ffffff',bo,function(){ c.fillStyle=s.bxc||'#ffffff'; c.fillRect(-pd,-pd,L.w+2*pd,L.h+2*pd); },true);
      if(s.bxl>0) pass(-1,'#000',bo,function(){ c.strokeStyle=s.bxlc||'#111111'; c.lineWidth=s.bxl; c.strokeRect(-pd,-pd,L.w+2*pd,L.h+2*pd); }); }
    var ocol=s.olc||'#e0245e', hasOl=s.ol>0||fa<100;
    function fillP(a){ pass(sb,s.color,a,function(){ c.fillStyle=s.color; lines(function(ln,x,y){ c.fillText(ln,x,y); }); }); }
    function olP(){ pass(ob,ocol,oO,function(){ c.strokeStyle=ocol; c.lineWidth=(fa<100?(s.ol>0?s.ol*2:2):s.ol*2)+(s.fat||0); lines(function(ln,x,y){ c.strokeText(ln,x,y); }); }); }
    if(fa<100){ if(fa>0) fillP(tO*fa/100); olP(); }
    else { if(hasOl) olP(); if(s.fat>0) pass(sb,s.color,tO,function(){ c.strokeStyle=s.color; c.lineWidth=s.fat; lines(function(ln,x,y){ c.strokeText(ln,x,y); }); }); fillP(tO); }
  }
  function textBox(s){
    var L=layoutText(s), w=L.w, h=L.h, co=Math.cos(s.rot||0), si=Math.sin(s.rot||0), p=s.pts[0];
    var pd=s.bx?(s.bxp==null?8:s.bxp)+(s.bxl||0)/2:0;
    return [[-pd,-pd],[w+pd,-pd],[w+pd,h+pd],[-pd,h+pd]].map(function(q){ return {x:p.x+q[0]*co-q[1]*si,y:p.y+q[0]*si+q[1]*co}; });
  }
  var airC=null, airS=null;
  function renderAir(c,s){
    var cw=c.canvas.width, ch=c.canvas.height, m=c.getTransform?c.getTransform():null;
    if(!airC) airC=document.createElement('canvas'); if(airC.width!==cw||airC.height!==ch){ airC.width=cw; airC.height=ch; }
    var a=airC.getContext('2d'); a.setTransform(1,0,0,1,0,0); a.clearRect(0,0,cw,ch); if(m) a.setTransform(m);
    var r=Math.max(1,s.size*1.5), hard=Math.max(0,Math.min(100,s.hard==null?20:s.hard))/100, flow=(s.flow==null?35:s.flow)/100;
    var R=Math.min(96,Math.max(8,Math.round(r*(m?Math.max(Math.abs(m.a),1):1)))), st=document.createElement('canvas'); st.width=st.height=R*2; var x=st.getContext('2d');
    x.fillStyle=s.color; x.fillRect(0,0,R*2,R*2); x.globalCompositeOperation='destination-in';
    var g=x.createRadialGradient(R,R,0,R,R,R); g.addColorStop(0,'rgba(0,0,0,1)'); g.addColorStop(Math.min(.98,hard),'rgba(0,0,0,'+(1-hard*.0)+')'); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g; x.fillRect(0,0,R*2,R*2);
    var step=Math.max(.6,r*(.12+.5*hard)), pts=s.pts, per=function(p){ return s.pressure===false?1:Math.max(.05,Math.min(1,p==null?1:p)); };
    function dab(px,py,p){ a.globalAlpha=Math.min(1,flow*.35*(.3+.7*per(p))); a.drawImage(st,px-r,py-r,2*r,2*r); }
    if(pts.length===1) dab(pts[0].x,pts[0].y,pts[0].p);
    for(var i=1;i<pts.length;i++){ var p0=pts[i-1],p1=pts[i], d=Math.hypot(p1.x-p0.x,p1.y-p0.y), n=Math.max(1,Math.ceil(d/step)); for(var k=(i===1?0:1);k<=n;k++){ var t=k/n; dab(p0.x+(p1.x-p0.x)*t,p0.y+(p1.y-p0.y)*t,(p0.p==null?1:p0.p)+((p1.p==null?1:p1.p)-(p0.p==null?1:p0.p))*t); } }
    c.save(); c.setTransform(1,0,0,1,0,0); c.globalAlpha=s.ink==null?1:s.ink; if(s.fx) c.globalCompositeOperation='source-atop'; c.drawImage(airC,0,0); c.restore();
  }
  function anyPx(){ return strokes.some(function(st){ return st.tool==='px'; }); }
  function boxPass(src,dst,n,len,r,stride,lineStride){
    var inv=1/(2*r+1), l, ch, i, j, o, sum, a2, b2;
    for(l=0;l<n;l++) for(ch=0;ch<4;ch++){
      o=l*lineStride+ch; sum=0;
      for(i=-r;i<=r;i++){ j=i<0?0:(i>=len?len-1:i); sum+=src[o+j*stride]; }
      for(i=0;i<len;i++){ dst[o+i*stride]=sum*inv; a2=i+r+1; b2=i-r; if(a2>=len) a2=len-1; if(b2<0) b2=0; sum+=src[o+a2*stride]-src[o+b2*stride]; }
    }
  }
  function blurPre(a,w,h,r,passes){ var t=new Float32Array(a.length); for(var p=0;p<passes;p++){ boxPass(a,t,h,w,r,4,w*4); boxPass(t,a,w,h,r,w*4,4); } }
  function preOf(id){ var d=id.data, f=new Float32Array(d.length); for(var i=0;i<d.length;i+=4){ var a=d[i+3]/255; f[i]=d[i]*a; f[i+1]=d[i+1]*a; f[i+2]=d[i+2]*a; f[i+3]=d[i+3]; } return f; }
  function canvasOfPre(f,w,h){
    var cv2=document.createElement('canvas'); cv2.width=w; cv2.height=h; var g=cv2.getContext('2d'), id=g.createImageData(w,h), d=id.data;
    for(var i=0;i<f.length;i+=4){ var a=Math.max(0,Math.min(255,f[i+3])); if(a<0.5){ d[i]=d[i+1]=d[i+2]=d[i+3]=0; continue; } var q=255/a; d[i]=Math.max(0,Math.min(255,f[i]*q)); d[i+1]=Math.max(0,Math.min(255,f[i+1]*q)); d[i+2]=Math.max(0,Math.min(255,f[i+2]*q)); d[i+3]=a; }
    g.putImageData(id,0,0); return cv2;
  }
  function stampOf(R,hard){
    var st=document.createElement('canvas'); st.width=st.height=R*2; var x=st.getContext('2d'), g=x.createRadialGradient(R,R,0,R,R,R);
    g.addColorStop(0,'rgba(0,0,0,1)'); g.addColorStop(Math.min(.98,hard),'rgba(0,0,0,1)'); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g; x.fillRect(0,0,R*2,R*2); return st;
  }
  function renderPx(c,s){
    var m=c.getTransform?c.getTransform():{a:1,b:0,c:0,d:1,e:0,f:0}, k=Math.abs(m.a)||1, cw=c.canvas.width, chh=c.canvas.height, pts=s.pts; if(!pts||!pts.length) return;
    var r=Math.max(2,(s.size||2)*1.5)*k, hard=Math.max(0,Math.min(100,s.hard==null?30:s.hard))/100, str=s.ink==null?1:s.ink, kind=s.kind, i;
    var dp=pts.map(function(p){ return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f}; });
    var x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; dp.forEach(function(p){ if(p.x<x0)x0=p.x; if(p.x>x1)x1=p.x; if(p.y<y0)y0=p.y; if(p.y>y1)y1=p.y; });
    var pad=Math.ceil(r)+2; x0=Math.max(0,Math.floor(x0-pad)); y0=Math.max(0,Math.floor(y0-pad)); x1=Math.min(cw,Math.ceil(x1+pad)); y1=Math.min(chh,Math.ceil(y1+pad));
    var rw=x1-x0, rh=y1-y0; if(rw<2||rh<2) return;
    function walk(fn,step){ fn(dp[0]); for(var q=1;q<dp.length;q++){ var p0=dp[q-1],p1=dp[q], d=Math.hypot(p1.x-p0.x,p1.y-p0.y), n=Math.max(1,Math.ceil(d/step)); for(var t=1;t<=n;t++) fn({x:p0.x+(p1.x-p0.x)*t/n,y:p0.y+(p1.y-p0.y)*t/n}); } }
    function blendIn(srcC,mk){
      var g=srcC.getContext('2d'); g.globalCompositeOperation='destination-in'; g.globalAlpha=1; g.drawImage(mk,0,0);
      c.save(); c.setTransform(1,0,0,1,0,0); c.globalAlpha=str; c.globalCompositeOperation='destination-out'; c.drawImage(mk,x0,y0); c.globalCompositeOperation='lighter'; c.drawImage(srcC,x0,y0); c.restore();
    }
    function maskC(){ var mk=document.createElement('canvas'); mk.width=rw; mk.height=rh; var g=mk.getContext('2d'), R=Math.min(128,Math.max(4,Math.ceil(r))), st=stampOf(R,hard); g.globalAlpha=.35; walk(function(p){ g.drawImage(st,p.x-x0-r,p.y-y0-r,2*r,2*r); },Math.max(1,r*.12)); return mk; }
    if(kind==='blur'||kind==='sharpen'){
      var id=c.getImageData(x0,y0,rw,rh), o=preOf(id), b=Float32Array.from(o), rb=Math.max(1,Math.round((kind==='blur'?(s.amt||6)*.55:1.5)*k));
      blurPre(b,rw,rh,rb,3);
      var out=b;
      if(kind==='sharpen'){ var am=(s.amt||6)/10; out=new Float32Array(o.length); for(i=0;i<o.length;i+=4){ var al=Math.max(0,Math.min(255,o[i+3]+am*(o[i+3]-b[i+3]))); out[i+3]=al; for(var q=0;q<3;q++){ var v=o[i+q]+am*(o[i+q]-b[i+q]); out[i+q]=Math.max(0,Math.min(al,v)); } } }
      blendIn(canvasOfPre(out,rw,rh),maskC());
    } else if(kind==='clone'){
      var sc=document.createElement('canvas'); sc.width=rw; sc.height=rh;
      sc.getContext('2d').drawImage(c.canvas,x0+(s.dx||0)*k,y0+(s.dy||0)*k,rw,rh,0,0,rw,rh);
      blendIn(sc,maskC());
    } else if(kind==='smudge'){
      var sz=Math.min(600,Math.ceil(r*2)+2), R2=sz/2, fe=document.createElement('canvas'); fe.width=fe.height=sz; var fg=fe.getContext('2d'), st2=stampOf(Math.max(4,Math.ceil(R2)),hard); fg.drawImage(st2,0,0,sz,sz);
      var P=document.createElement('canvas'); P.width=P.height=sz; var pg=P.getContext('2d'), G=document.createElement('canvas'); G.width=G.height=sz; var gg=G.getContext('2d'), Q=document.createElement('canvas'); Q.width=Q.height=sz; var qg=Q.getContext('2d'), first=true, carry=Math.min(.95,.5+str*.45);
      walk(function(p){
        var gx=Math.round(p.x-R2), gy=Math.round(p.y-R2);
        gg.globalCompositeOperation='source-over'; gg.clearRect(0,0,sz,sz); gg.drawImage(c.canvas,gx,gy,sz,sz,0,0,sz,sz);
        if(first){ pg.clearRect(0,0,sz,sz); pg.drawImage(G,0,0); first=false; return; }
        qg.globalCompositeOperation='source-over'; qg.clearRect(0,0,sz,sz); qg.drawImage(P,0,0); qg.globalCompositeOperation='destination-in'; qg.drawImage(fe,0,0);
        c.save(); c.setTransform(1,0,0,1,0,0); c.globalAlpha=Math.min(1,str*1.1); c.globalCompositeOperation='destination-out'; c.drawImage(fe,gx,gy); c.globalCompositeOperation='lighter'; c.drawImage(Q,gx,gy); c.restore();
        pg.globalCompositeOperation='destination-out'; pg.globalAlpha=1-carry; pg.fillStyle='#000'; pg.fillRect(0,0,sz,sz); pg.globalCompositeOperation='lighter'; pg.globalAlpha=1-carry; pg.drawImage(G,0,0); pg.globalAlpha=1; pg.globalCompositeOperation='source-over';
      },Math.max(1.5,r*.25));
    }
  }
  function render(c,s){
    if(s.tool==='px'){ renderPx(c,s); return; }
    if(s.tool==='text'){ renderText(c,s); return; }
    if(s.tool==='image'){ renderImage(c,s); return; }
    if(s.tool==='cut'){ renderCut(c,s); return; }
    if(s.tool==='air'){ renderAir(c,s); return; }
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
  var cloneSrc=null, cloneOff=null, cloneSet=false;
  function drawCloneMarkOff(){ if(cloneSet) cloneSet=false; }
  function drawCloneMark(){
    if(tool!=='clone'||!cloneSrc) return; var x=cloneSrc.x, y=cloneSrc.y;
    if(cur&&cur.tool==='px'&&cur.kind==='clone'){ var l=cur.pts[cur.pts.length-1]; x=l.x+cur.dx; y=l.y+cur.dy; }
    ctx.save(); ctx.lineWidth=1.5; ctx.strokeStyle='#e0245e'; ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2); ctx.moveTo(x-14,y); ctx.lineTo(x+14,y); ctx.moveTo(x,y-14); ctx.lineTo(x,y+14); ctx.stroke(); ctx.restore();
  }
  function refresh(){
    ctx.clearRect(0,0,W,H); ctx.drawImage(base,0,0);
    if(!cur){ drawSelOverlay(); drawCloneMark(); return; }
    if(cur.tool==='px'){ render(ctx,cur); drawSelOverlay(); drawCloneMark(); return; }
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
    if(tool==='clone'&&(e.altKey||cloneSet)){ var qs=pos(e); cloneSrc={x:qs.x,y:qs.y}; cloneOff=null; cloneSet=false; msg('Clone source set. Now paint where the copy should appear. Alt+click picks a new source.',4500); e.preventDefault(); refresh(); return; }
    if(tool==='clone'&&!cloneSrc){ msg('First Alt+click (or press “Set source” and click) on the spot you want to copy from',5000); return; }
    cv.setPointerCapture(e.pointerId);
    if(!getLayer(act).vis){ msg('This layer is hidden – show it to draw on it'); return; }
    var q=pos(e);
    var isFx=(tool==='dodge'||tool==='burn'), isPx=(tool==='blur'||tool==='sharpen'||tool==='smudge'||tool==='clone');
    cur={l:act,tool:(tool==='brush'?'pen':(isFx?'air':(isPx?'px':tool))),fx:isFx?tool:undefined,color:isFx?(tool==='dodge'?'#ffffff':'#000000'):color,size:size,soft:+soft.value,sens:+sens.value/100,ink:isFx?(+fxExp.value/100):(+ink.value/100),pressure:pr.checked, brush:tool==='brush', nib:nibSel.value, dry:+dry.value/100, hair:hair.checked, pmin:1, pmax:0, lt:e.timeStamp, lx:q.x, ly:q.y,
         arrow:ar.checked,hard:+airHard.value,flow:+airFlow.value,pts:[q],sm:{x:q.x,y:q.y,p:q.p}};
    if(isPx){ cur.size=Math.max(1,(pxSizes[tool]||40)/3); cur.kind=tool; cur.hard=+pxHard.value; cur.ink=+pxStr.value/100; cur.amt=+pxAmt.value; cur.pressure=false; if(tool==='clone'){ if(!cloneOff) cloneOff={dx:cloneSrc.x-q.x,dy:cloneSrc.y-q.y}; cur.dx=cloneOff.dx; cur.dy=cloneOff.dy; } }
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
    delete cur.sm; strokes.push(cur); if(cur.tool!=='eraser') tgt=[cur]; ulog.push({t:'d'}); redo=[];
    var L=getLayer(layerOf(cur)), fast = layers.length===1 ? L.op>=100 : (cur.tool!=='eraser'&&L.op>=100&&L.id===topVisibleId());
    if(layerHasFx(L)||cur.fx||cur.tool==='px') fast=false;
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
  function iconBtn(txt,paths,fn,title){ var b=btn('',fn,title); b.style.display='inline-flex'; b.style.alignItems='center'; b.style.padding=txt==='Use page'?'5px 5px':'5px 4px'; var NS='http://www.w3.org/2000/svg', sv=document.createElementNS(NS,'svg'); sv.setAttribute('width','17'); sv.setAttribute('height','17'); sv.setAttribute('viewBox','0 0 24 24'); sv.setAttribute('fill','none'); sv.setAttribute('stroke','currentColor'); sv.setAttribute('stroke-width','2'); sv.setAttribute('stroke-linecap','round'); sv.setAttribute('stroke-linejoin','round'); paths.forEach(function(d){ var pa=document.createElementNS(NS,'path'); pa.setAttribute('d',d); sv.appendChild(pa); }); b.appendChild(sv); b.setAttribute('aria-label',txt); if(txt==='Use page'){ b.appendChild(document.createTextNode(txt)); b.style.gap='4px'; b.style.whiteSpace='nowrap'; }
    b.removeAttribute('title'); if(title&&txt==='Erase all'){ var tip=null, tipT=0;
      b.addEventListener('mouseenter',function(){ var r=b.getBoundingClientRect(); tip=document.createElement('div'); tip.textContent=title; tip.style.cssText='position:fixed;z-index:2147483647;pointer-events:none;background:#111;color:#fff;font:300 12px system-ui,sans-serif;padding:4px 8px;border-radius:6px;max-width:220px;line-height:1.3;top:'+(r.bottom+6)+'px;'; document.documentElement.appendChild(tip); clearTimeout(tipT); tipT=setTimeout(function(){ if(tip){ tip.remove(); tip=null; } },1800); var w=tip.offsetWidth; tip.style.left=Math.max(4,Math.min(window.innerWidth-w-4,r.left+r.width/2-w/2))+'px'; });
      b.addEventListener('mouseleave',function(){ if(tip){ tip.remove(); tip=null; } });
      b.addEventListener('pointerdown',function(){ if(tip){ tip.remove(); tip=null; } }); }
    return b; }
  function btn(txt,fn,title){ var b=el('button',BTN,txt); b.type='button'; if(title) b.title=title; b.addEventListener('click',fn); return b; }
  function mark(b,on){ b.style.background=on?'#111':'#fff'; b.style.color=on?'#fff':'#111'; b.style.borderColor=on?'#111':'#c9c9c9'; }

  var head = row(); head.style.justifyContent='space-between'; head.style.cursor='move'; head.style.cssText+='position:sticky;top:-8px;z-index:2;background:#fafafa;padding:6px 0;margin-top:-8px;border-bottom:1px solid #e4e4e4;';
  head.appendChild(el('span','font-size:11px;letter-spacing:.04em;text-transform:uppercase;font-weight:400;','Ritlager'));
  var hide = btn('Hide', function(){ api.toggle(); }, 'Hide/show (D toggles draw/click)'); hide.style.padding='5px 7px';
  var hg=row(); hg.style.flexWrap='nowrap'; hg.style.gap='3px'; head.style.flexWrap='nowrap'; var quick=null;
  head.appendChild(hg);
  bar.appendChild(head);

  function sec(t){ var d=el('div','font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#888;margin-top:3px;border-top:1px solid #e4e4e4;padding-top:6px;cursor:pointer;user-select:none;',t); d.setAttribute('data-sec',t); d._t=t; d._open=true; d._hidden=false; bar.appendChild(d); return d; }
  function applySec(h){ if(!h._wrap) return; h.textContent=(h._open?'▾ ':'▸ ')+h._t; h.style.display=(h._hidden||h._flat)?'none':'block'; h._wrap.style.display=(h._open&&!h._hidden)?'flex':'none'; }
  function lab(r,t){ r.appendChild(el('span','font-size:12px;color:#666;',t)); }
  function slider(r,min,max,val,w){ var i=el('input','width:'+w+'px;accent-color:#111;'); i.type='range'; i.min=min; i.max=max; i.value=val; r.appendChild(i); return i; }
  function liveVal(inp,suf){
    var sp=el('span','font-size:11.5px;color:#444;min-width:34px;text-align:right;'); inp.parentNode&&inp.parentNode.appendChild(sp);
    function upd(){ sp.textContent=inp.value+(suf==null?'%':suf); }
    var d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    Object.defineProperty(inp,'value',{get:function(){ return d.get.call(inp); },set:function(v){ d.set.call(inp,v); upd(); },configurable:true});
    inp.addEventListener('input',upd); upd(); return inp;
  }
  function chk(r,txt,on,tip){ var l=el('label','font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer;'); var i=el('input'); i.type='checkbox'; i.checked=on; l.appendChild(i); l.appendChild(document.createTextNode(txt)); if(tip) l.title=tip; r.appendChild(l); return i; }

  function eraseAll(){ if(strokes.length){ opSnap(function(){ strokes=[]; clearSel(); }); msg('Erased everything – Undo brings it back'); } else msg('Nothing to erase'); }
  function saveProject(){
    var bl=new Blob([JSON.stringify(pack(true))],{type:'application/json'});
    saveBlob(bl,fname('ritlager-project','.json'),'The project file is editable and can be reopened, even on another computer.');
  }
  var r1=row(); r1.style.flexWrap='nowrap'; r1.style.gap='3px'; var bDraw=iconBtn('Draw',['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z','m15 5 4 4'],function(){ setDrawing(true); if(tool==='select'||tool==='cut'||tool==='eraser') setTool(lastDraw||'pen'); },'Draw (D) – pen and other drawing tools'), bPass=iconBtn('Use page',['M22 14a8 8 0 0 1-8 8','M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2','M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1','M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10','M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'],function(){ setDrawing(!drawing); },'Use the page: scroll and click (H). Press again to draw.');
  var bMove=iconBtn('Select',['M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z'],function(){ setDrawing(true); setTool('select'); },'Select and move (V)');
  var bEr=iconBtn('Eraser',['m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21','M22 21H7','m5 11 9 9'],function(){ setDrawing(true); setTool('eraser'); },'Eraser (E)');
  var bSv=iconBtn('Save',['M12 3v12','m7 10 5 5 5-5','M5 21h14'],function(){ saveMenu(); },'');
  var svBox=null;
  function saveMenu(){
    if(svBox){ svBox.remove(); svBox=null; return; }
    var r=bSv.getBoundingClientRect(); svBox=document.createElement('div');
    svBox.style.cssText='position:fixed;z-index:2147483647;background:#fff;border:1px solid #c9c9c9;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.18);padding:6px;display:flex;flex-direction:column;gap:5px;font:300 13px system-ui,sans-serif;top:'+(r.bottom+6)+'px;right:'+Math.max(4,window.innerWidth-r.right)+'px;';
    function item(t,sub,fn){ var d=document.createElement('div'); d.style.cssText='cursor:pointer;padding:6px 10px;border-radius:6px;color:#111;'; d.innerHTML=''; var h=document.createElement('div'); h.textContent=t; h.style.fontWeight='400'; var u=document.createElement('div'); u.textContent=sub; u.style.cssText='font-size:11px;color:#666;'; d.appendChild(h); d.appendChild(u); d.addEventListener('mouseenter',function(){ d.style.background='#f0f0f0'; }); d.addEventListener('mouseleave',function(){ d.style.background=''; }); d.addEventListener('click',function(){ svBox.remove(); svBox=null; fn(); }); svBox.appendChild(d); }
    var L={png:'PNG',jpg:'JPG',tif:'TIFF'}[fmSel.value]||'PNG';
    item('Save as image ('+L+')','To use or share, with the settings under Export',function(){ exportPng('save'); });
    item('Save project','To keep editing later, as a file',function(){ saveProject(); });
    document.documentElement.appendChild(svBox);
    setTimeout(function(){ function away(ev){ if(svBox&&!svBox.contains(ev.target)){ svBox.remove(); svBox=null; } document.removeEventListener('pointerdown',away,true); } document.addEventListener('pointerdown',away,true); },0);
  }
  function markTop(){ var m=drawing&&tool==='select', er=drawing&&tool==='eraser'; mark(bDraw,drawing&&!m&&!er); mark(bMove,m); mark(bEr,er); mark(bPass,!drawing); }
  r1.appendChild(bDraw); r1.appendChild(bMove); r1.appendChild(bEr); hg.appendChild(bPass); hg.appendChild(hide);
  r1.appendChild(iconBtn('Undo',['M9 14 4 9l5-5','M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],function(){ undo(); },'Undo (Ctrl+Z)'));
  r1.appendChild(iconBtn('Redo',['m15 14 5-5-5-5','M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],function(){ redoFn(); },'Redo (Ctrl+Shift+Z)'));
  r1.appendChild(bSv);
  r1.appendChild(iconBtn('Erase all',['M3 6h18','M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6','M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2','M10 11v6','M14 11v6'],function(){ eraseAll(); },'Clear the whole drawing'));
  bar.appendChild(r1);

  sec('Drawing tools');
  var r2=row();
  var bPen=btn('Pen',function(){changeSel('tool','pen'); setTool('pen');},'Pen (B)'), bBrush=btn('Brush',function(){changeSel('tool','brush'); setTool('brush');},'Brush (P)'),
      bLine=btn('Line',function(){setTool('line');},'Straight line (L)'), bEr=btn('Eraser',function(){setTool('eraser');},'Eraser (E)'), bTxt=btn('Text tool (T)',function(){setTool('text');},'Text (T): click where the text should go');
  var bSel0=btn('↖ Select',function(){ setTool('select'); },'Select, move and change strokes (S or V). Opacity, Colour and Thickness then change the selected strokes'); 
  var bAir=btn('Airbrush',function(){changeSel('tool','air'); setTool('air');},'Airbrush (A): soft spray that builds up. Hardness sets how soft the edge is, Opacity how strong it can get'); r2.appendChild(bPen); r2.appendChild(bBrush); r2.appendChild(bAir); r2.appendChild(bLine); r2.appendChild(bEr); r2.appendChild(bSel0); bar.appendChild(r2);


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
    if(!d||d[3]===0){ msg('Nothing to pick there. In this browser, first take a screenshot (Export → Background → Drawing on top of screenshot) to use the pipette on the page.',5500); return; }
    var c='#'+hex2(d[0])+hex2(d[1])+hex2(d[2]); setColor(c); msg('Picked '+c.toUpperCase());
  }
  var r3b=row(); lab(r3b,'Opacity'); var ink=slider(r3b,5,100,100,100); liveVal(ink); ink.addEventListener('change',function(){ changeSel('ink'); }); ink.title='How dark/dense the colour is. 100 = full black';
  bar.appendChild(r3b);
  var rC=row(); lab(rC,'Contrast'); var ctr=slider(rC,0,100,0,110); liveVal(ctr);
  ctr.title='Redraws strokes several times so light and thin strokes get darker. High = thin strokes turn fully black. Applies to all strokes, including already drawn ones. It only changes strokes that are thin or less than fully opaque – solid thick strokes at 100% opacity look the same. It does not affect Brush, Airbrush, text or pictures.';
  var ctrRaf=0; ctr.addEventListener('input',function(){ contrast=+ctr.value; cancelAnimationFrame(ctrRaf); ctrRaf=requestAnimationFrame(rebuild); });
  bar.appendChild(rC);

  sec('Thickness');
  var r4=row();
  var sz=el('input','width:150px;accent-color:#111;'); sz.type='range';
  var szv=el('span','font-size:12px;width:46px;','3.0');
  var SMIN=0.2, SMAX=1000, LR=Math.log(SMAX/SMIN);
  sz.min=0; sz.max=100; sz.step=0.25;
  function showSize(){ szv.textContent = (size<10 ? size.toFixed(1) : String(Math.round(size)))+' px'; if(szn&&document.activeElement!==szn) szn.value=size<10?size.toFixed(1):Math.round(size); }
  function setSize2(v,nochg){ size=Math.max(SMIN,Math.min(SMAX,v)); sz.value=100*Math.log(size/SMIN)/LR; showSize(); if(!nochg) changeSel('size'); }
  sz.addEventListener('input',function(){ size=SMIN*Math.exp(LR*(+sz.value)/100); showSize(); });
  sz.addEventListener('change',function(){ changeSel('size'); });
  var szn=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:3px 5px;width:56px;box-sizing:border-box;'); szn.type='number'; szn.min=0.2; szn.max=1000; szn.step=1; szn.title='Type an exact size in px (up to 1000)';
  szn.addEventListener('input',function(){ var v=+szn.value; if(v>=SMIN) setSize2(v,true); }); szn.addEventListener('change',function(){ changeSel('size'); });
  r4.appendChild(sz); r4.appendChild(szv); r4.appendChild(szn); bar.appendChild(r4); showSize();
  var rp=row();
  [0.2,0.5,1,2,4,8,16,32,64,128,256,512].forEach(function(n){
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
  var rAir=row(); lab(rAir,'Hardness'); var airHard=slider(rAir,0,100,20,100); liveVal(airHard); airHard.title='0 = very soft, 100 = hard edge'; bar.appendChild(rAir);
  var rAir2=row(); lab(rAir2,'Build-up'); var airFlow=slider(rAir2,5,100,35,100); liveVal(airFlow); airFlow.title='How fast the colour builds up when you go over the same place'; bar.appendChild(rAir2);
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

  var rTt=row(); rTt.appendChild(bTxt);
  var rText=row(); lab(rText,'Font');
  var FOPTS=[['sans','Geosans Light / Avenir'],['avenir','Avenir'],['helvetica','Helvetica'],['futura','Futura'],['gill','Gill Sans'],['verdana','Verdana'],['serif','Georgia (serif)'],['garamond','Garamond'],['palatino','Palatino'],['times','Times'],['didot','Didot'],['mono','Mono'],['courier','Courier'],['typewriter','Typewriter'],['hand','Handwriting'],['marker','Marker'],['script','Script'],['display','Display'],['impact','Impact'],['custom','Installed font…']];
  var txFont=el('select',BTN+'padding:3px 6px;'); FOPTS.forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; txFont.appendChild(op); }); rText.appendChild(txFont);
  var txCustom=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:3px 6px;width:100%;box-sizing:border-box;display:none;'); txCustom.type='text'; txCustom.placeholder='Type the font name, e.g. Geosans Light'; rText.appendChild(txCustom);
  function curFF(){ return txFont.value==='custom'&&txCustom.value.trim()?'c:'+txCustom.value.trim():(txFont.value==='custom'?'sans':txFont.value); }
 
  var INP='font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:3px 5px;box-sizing:border-box;';
  var rT2=row();
  var txSize=el('input',INP+'width:56px;'); txSize.type='number'; txSize.value=32; txSize.min=4; txSize.max=600; txSize.title='Text size in px'; rT2.appendChild(txSize); lab(rT2,'px');
  var txBd=chk(rT2,'Bold',false), txIt=chk(rT2,'Italic',false);
  var txCol=el('input','width:30px;height:26px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;'); txCol.type='color'; txCol.value='#111111'; txCol.title='Text colour'; rT2.appendChild(txCol);
 
  var rTw=row(); lab(rTw,'Weight'); var txWt=slider(rTw,100,900,300,100); txWt.step=100; txWt.title='Thinner ← → thicker. Works with fonts that have several weights (e.g. Avenir, Helvetica)';
  var rTf=row(); lab(rTf,'Thicken'); var txFat=slider(rTf,0,12,0,100); txFat.title='Makes any font thicker by adding to its outline';
  var rT3=row(); lab(rT3,'Align'); var txAl=el('select',BTN+'padding:3px 6px;'); [['left','Left'],['center','Centre'],['right','Right']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; txAl.appendChild(op); }); rT3.appendChild(txAl);
  lab(rT3,'Wrap'); var txBw=el('input',INP+'width:60px;'); txBw.type='number'; txBw.min=0; txBw.max=3000; txBw.value=0; txBw.title='Line width in px where the text wraps to a new line. 0 = no wrapping'; rT3.appendChild(txBw); lab(rT3,'px (0 = off)');
 
  var rT4=row(); lab(rT4,'Letter spacing'); var txLs=slider(rT4,-5,40,0,110);
  var rT5=row(); lab(rT5,'Line height'); var txLh=slider(rT5,80,250,125,110); txLh.title='in % of the text size';
  var rO0=row(); var txOlOn=chk(rO0,'Outline',false,'A line around every letter'); var rT6=row(); lab(rT6,'Width'); var txOl=slider(rT6,1,20,4,90); var txOlc=el('input','width:30px;height:26px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;'); txOlc.type='color'; txOlc.value='#e0245e'; txOlc.title='Outline colour'; rO0.appendChild(txOlc);
  var rTa=row(); lab(rTa,'Fill inside'); var txFa=slider(rTa,0,100,100,110); liveVal(txFa); txFa.title='100 = solid letters. Lower = see-through inside; 0 = only the outline is drawn';
  var rTb=row(); lab(rTb,'Letter softness'); var txSb=slider(rTb,0,25,0,100); txSb.title='Blurs the edges of the letters';
  var rTc=row(); lab(rTc,'Text opacity'); var txTo=slider(rTc,0,100,100,110); liveVal(txTo);
  var rTd=row(); lab(rTd,'Softness'); var txOb=slider(rTd,0,25,0,100); txOb.title='Blurs the outline';
  var rTe=row(); lab(rTe,'Opacity'); var txOo=slider(rTe,0,100,100,110); liveVal(txOo);
  var rS0=row(); var txShOn=chk(rS0,'Shadow',false,'Drop shadow behind the text'); var rT7=row(); lab(rT7,'Size'); var txSh=slider(rT7,1,30,8,110);
  var COLS='width:30px;height:26px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;';
  var rT9=row(); var txBx=chk(rT9,'Box behind text',false,'A coloured box with an optional border behind the text'); var txBxc=el('input',COLS); txBxc.type='color'; txBxc.value='#ffffff'; txBxc.title='Fill colour inside the box'; rT9.appendChild(txBxc);
  var rBs=row(); lab(rBs,'Softness'); var txBxs=slider(rBs,0,30,0,110); txBxs.title='Blurs the edge of the box'; var rBo=row(); lab(rBo,'Opacity'); var txBxo=slider(rBo,0,100,100,110); liveVal(txBxo);
  var rT10=row(); lab(rT10,'Border'); var txBxl=slider(rT10,0,16,2,80); var txBxlc=el('input',COLS); txBxlc.type='color'; txBxlc.value='#111111'; txBxlc.title='Border colour'; rT10.appendChild(txBxlc);
  var rT11=row(); lab(rT11,'Padding'); var txBxp=slider(rT11,0,60,8,110);
  function curProps(){ return {ff:curFF(),size:+txSize.value||32,it:txIt.checked,bd:txBd.checked,fa:+txFa.value,sb:+txSb.value,to:+txTo.value,ob:+txOb.value,oo:+txOo.value,wt:+txWt.value,fat:+txFat.value,color:txCol.value,al:txAl.value,bw:+txBw.value||0,ls:+txLs.value,lh:(+txLh.value||125)/100,ol:txOlOn.checked?Math.max(1,+txOl.value):0,olc:txOlc.value,sh:txShOn.checked?Math.max(1,+txSh.value):0,bxs:+txBxs.value,bxo:+txBxo.value,bx:txBx.checked,bxc:txBxc.value,bxl:+txBxl.value,bxlc:txBxlc.value,bxp:+txBxp.value}; }
  // changing a setting also updates the selected text(s)
  function showR(rows,on){ rows.forEach(function(r){ r.style.display=on?'flex':'none'; }); }
  function syncVis(){ showR([rT6,rTd,rTe],txOlOn.checked); showR([rT7],txShOn.checked); showR([rT10,rBs,rBo,rT11],txBx.checked); }
  function setControls(P){
    var known=Array.prototype.some.call(txFont.options,function(o){ return o.value===P.ff; });
    if(known){ txFont.value=P.ff; txCustom.style.display='none'; } else if(P.ff&&P.ff.slice(0,2)==='c:'){ txFont.value='custom'; txCustom.value=P.ff.slice(2); txCustom.style.display=''; }
    txSize.value=Math.round(P.size); txIt.checked=!!P.it; txBd.checked=!!P.bd; txWt.value=P.wt||(P.bd?700:300); txFat.value=P.fat||0; txFa.value=P.fa==null?100:P.fa; txSb.value=P.sb||0; txTo.value=P.to==null?100:P.to; txOb.value=P.ob||0; txOo.value=P.oo==null?100:P.oo; txCol.value=P.color||'#111111'; txAl.value=P.al||'left'; txBw.value=Math.round(P.bw||0);
    txLs.value=P.ls||0; txLh.value=Math.round((P.lh||1.25)*100); txOlOn.checked=P.ol>0; txOl.value=P.ol>0?P.ol:4; txOlc.value=P.olc||'#e0245e'; txShOn.checked=P.sh>0; txSh.value=P.sh>0?P.sh:8; txBxs.value=P.bxs||0; txBxo.value=P.bxo==null?100:P.bxo; syncVis();
    txBx.checked=!!P.bx; txBxc.value=P.bxc||'#ffffff'; txBxl.value=P.bxl==null?2:P.bxl; txBxlc.value=P.bxlc||'#111111'; txBxp.value=P.bxp==null?8:P.bxp;
  }
  function applyTextProps(){
    if(tEd){ tEd.P=Object.assign({},tEd.P,curProps()); styleTa(tEd.ta,tEd.P); var P2=tEd.P; tEd.ta.style.height='auto'; tEd.ta.style.height=Math.max(P2.size*1.25,tEd.ta.scrollHeight)+'px'; if(!(P2.bw>0)){ tEd.ta.style.width='auto'; tEd.ta.style.width=Math.max(140,tEd.ta.scrollWidth+8)+'px'; } return; }
    var texts=sel.filter(function(st){ return st.tool==='text'; }); if(!texts.length) return; var P=curProps();
    var map=new Map(); opSnap(function(){ strokes=strokes.map(function(st){ if(texts.indexOf(st)<0) return st; var n=Object.assign({},st,P); delete n.sm; n.ink=st.ink; map.set(st,n); return n; }); });
    sel=sel.map(function(st){ return map.get(st)||st; }); selCur=sel; selBox=boxOf(sel); refresh();
  }
  [txFont,txAl].forEach(function(x){ x.addEventListener('change',function(){ txCustom.style.display=txFont.value==='custom'?'':'none'; applyTextProps(); }); });
  [txSize,txBw,txCustom,txCol,txOlc,txBxc,txBxlc].forEach(function(x){ x.addEventListener('change',applyTextProps); });
  txBd.addEventListener('change',function(){ txWt.value=txBd.checked?700:300; });
  [txOlOn,txShOn,txBx].forEach(function(x){ x.addEventListener('change',syncVis); });
  [txBd,txIt,txBx,txOlOn,txShOn].forEach(function(x){ x.addEventListener('change',applyTextProps); });
  [txLs,txLh,txOl,txSh,txBxl,txBxp,txWt,txFat,txFa,txSb,txTo,txOb,txOo,txBxs,txBxo].forEach(function(x){ x.addEventListener('change',applyTextProps); });
  [txLs,txLh,txOl,txSh,txBxl,txBxp,txWt,txFat,txFa,txSb,txTo,txOb,txOo,txBxs,txBxo].forEach(function(x){ x.addEventListener('input',function(){ if(tEd) applyTextProps(); }); });
  function rasterizeText(){
    var texts=sel.filter(function(st){ return st.tool==='text'; }); if(!texts.length){ msg('Select a text first (Select tool)'); return; }
    var map=new Map();
    opSnap(function(){ strokes=strokes.map(function(st){
      if(texts.indexOf(st)<0) return st;
      var q=textBox(st), x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; q.forEach(function(p){ x0=Math.min(x0,p.x); y0=Math.min(y0,p.y); x1=Math.max(x1,p.x); y1=Math.max(y1,p.y); });
      var m=(st.sh||0)*2+(st.ol||0)+4; x0-=m; y0-=m; x1+=m; y1+=m;
      var k=Math.min(3,Math.max(1,300/Math.max(st.size,1))); while((x1-x0)*k>4000||(y1-y0)*k>4000) k/=2;
      var c=document.createElement('canvas'); c.width=Math.max(1,Math.round((x1-x0)*k)); c.height=Math.max(1,Math.round((y1-y0)*k)); var x=c.getContext('2d'); x.scale(k,k); x.translate(-x0,-y0);
      var old=rscale; rscale=k; try{ renderText(x,Object.assign({},st,{ink:1})); }finally{ rscale=old; }
      var iid='i'+Date.now().toString(36)+Math.floor(Math.random()*1e5).toString(36); imgs[iid]={src:c.toDataURL('image/png'),w:c.width,h:c.height};
      var n={l:st.l,tool:'image',iid:iid,size:1/k,rot:0,ink:st.ink==null?1:st.ink,color:'#000',pts:[{x:x0,y:y0,p:1}]}; map.set(st,n); return n; }); });
    sel=sel.map(function(st){ return map.get(st)||st; }); selCur=sel; selBox=boxOf(sel); refresh(); msg('Text turned into a picture – you can now erase, cut or move parts of it');
  }
  var rT12=row(); rT12.appendChild(btn('Turn selected text into picture',rasterizeText,'Select a text with the Select tool first. The text becomes a picture you can erase, cut out and lift parts of – but it can no longer be edited as text'));
  // load a font file from the computer (remembered in this browser)
  var rT8=row(); var fif=el('input'); fif.type='file'; fif.accept='.ttf,.otf,.woff,.woff2'; fif.style.display='none'; rT8.appendChild(fif);
  rT8.appendChild(btn('Load font file…',function(){ fif.click(); },'Choose a .ttf, .otf or .woff file from your computer to use as a typeface'));
  function fdb(cb){ try{ var r=indexedDB.open('ritlager-fonts',1); r.onupgradeneeded=function(){ r.result.createObjectStore('f'); }; r.onsuccess=function(){ cb(r.result); }; r.onerror=function(){ cb(null); }; }catch(e){ cb(null); } }
  function addFontOpt(name){ if(Array.prototype.some.call(txFont.options,function(o){ return o.value==='c:'+name; })) return; var op=el('option',null,name+' (loaded)'); op.value='c:'+name; txFont.insertBefore(op,txFont.lastChild); }
  function useFont(name,buf){ try{ var ff=new FontFace(name,buf); return ff.load().then(function(){ document.fonts.add(ff); addFontOpt(name); }); }catch(e){ return Promise.reject(e); } }
  fif.addEventListener('change',function(){ var f=fif.files[0]; if(!f) return; var name=f.name.replace(/\.[^.]+$/,'').replace(/[^\w \-]/g,'').slice(0,40)||'MyFont'; var fr=new FileReader();
    fr.onload=function(){ useFont(name,fr.result).then(function(){ txFont.value='c:'+name; msg('Font "'+name+'" loaded – now selected for new text'); fdb(function(db){ if(db){ try{ db.transaction('f','readwrite').objectStore('f').put(fr.result,name); }catch(e){} } }); },function(){ msg('Could not load that font file'); }); };
    fr.readAsArrayBuffer(f); fif.value=''; });
  fdb(function(db){ if(!db) return; try{ var st=db.transaction('f').objectStore('f'), rq=st.openCursor(); rq.onsuccess=function(){ var c=rq.result; if(c){ useFont(c.key,c.value.slice?c.value.slice(0):c.value); c.continue(); } }; }catch(e){} });
 

  sec('Type'); [rTt,rText,rT2,rTw,rTf,rTc,rTb,rTa].forEach(function(r){ bar.appendChild(r); });
  sec('Layout'); [rT3,rT4,rT5].forEach(function(r){ bar.appendChild(r); });
  sec('Outline'); [rO0,rT6,rTd,rTe].forEach(function(r){ bar.appendChild(r); });
  sec('Shadow'); [rS0,rT7].forEach(function(r){ bar.appendChild(r); });
  sec('Box'); [rT9,rT10,rBs,rBo,rT11].forEach(function(r){ bar.appendChild(r); });
  syncVis();
  sec('Fonts and convert'); [rT8,rT12].forEach(function(r){ bar.appendChild(r); });


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
  function selLast(){
    var vis=function(st){ return getLayer(layerOf(st)).vis&&st.tool!=='cut'; }, i;
    for(i=strokes.length-1;i>=0;i--) if(vis(strokes[i])&&(selScope==='all'||layerOf(strokes[i])===act)) break;
    if(i<0){ msg('Nothing to select'); return; }
    setTool('select'); sel=[strokes[i]]; selCur=sel; selBox=boxOf(sel); refresh(); setSelUI();
    msg('Last stroke selected – change Opacity, Colour or Thickness to change it, or drag it');
  }
  function styleListen(){ [nibSel,thinSel,soft,dry,ar,airHard,airFlow].forEach(function(x){ x.addEventListener('change',function(){ changeSel('style'); }); }); }
  function setSelUI(){ if(sel&&sel.length) tgt=sel.slice(); var t=sel.filter(function(st){ return st.tool==='text'; })[0]; if(t&&typeof setControls==='function') setControls(t); var a=sel.filter(function(st){ return st.tool!=='text'&&st.tool!=='image'&&st.tool!=='cut'; })[0]; if(a&&a.color&&a.color.length===7){ color=a.color; cp.value=a.color; hexIn.value=a.color; var n=parseInt(a.color.slice(1),16); rgbEl.textContent='rgb('+(n>>16)+', '+((n>>8)&255)+', '+(n&255)+')'; sw.forEach(function(q){ q[0].style.outline=q[1]===a.color?'2px solid #111':'none'; }); } var ps=sel.filter(function(st){ return st.tool==='pen'||st.tool==='line'||st.tool==='air'; })[0]; if(ps){ if(ps.tool==='air'){ if(ps.hard!=null) airHard.value=ps.hard; if(ps.flow!=null) airFlow.value=ps.flow; } else { if(ps.nib) nibSel.value=ps.nib; if(ps.soft!=null) soft.value=ps.soft; if(ps.dry!=null) dry.value=Math.round(ps.dry*100); thinSel.value=ps.hair?'black':'smooth'; if(ps.arrow!=null) ar.checked=!!ps.arrow; } }
    if(sel[0]&&sel[0].ink!=null&&sel[0].tool!=='cut') ink.value=Math.round(sel[0].ink*100); if(a&&a.size&&a.tool!=='image'){ size=a.size; showSize(); } }
  function changeSel(kind,arg){
    if(quietChg) return false;
    var base=targets(); if(!base.length) return false;
    var ok=function(st){ if(st.tool==='cut') return false; if(kind==='style') return st.tool==='pen'||st.tool==='line'||st.tool==='air'; if(kind==='tool') return (st.tool==='pen'||st.tool==='air')&&!st.fx; if(kind==='color') return st.tool!=='image'&&st.tool!=='eraser'&&!st.fx&&st.tool!=='px'; if(kind==='size') return st.tool!=='image'&&st.tool!=='text'; return true; };
    var list=base.filter(ok); if(!list.length) return false;
    var map=new Map();
    function penProps(n){ n.nib=nibSel.value; n.soft=+soft.value; n.dry=+dry.value/100; n.hair=hair.checked; }
    opSnap(function(){ strokes=strokes.map(function(st){ if(list.indexOf(st)<0) return st; var n=Object.assign({},st); delete n.sm;
      if(kind==='ink') n.ink=+ink.value/100; else if(kind==='color') n.color=color; else if(kind==='size') n.size=size;
      else if(kind==='tool'){ n.tool=arg==='brush'?'pen':arg; n.brush=arg==='brush'; if(n.tool==='air'){ n.hard=+airHard.value; n.flow=+airFlow.value; } else penProps(n); }
      else { if(n.tool==='air'){ n.hard=+airHard.value; n.flow=+airFlow.value; } else { penProps(n); if(n.tool==='line') n.arrow=ar.checked; } }
      map.set(st,n); return n; }); });
    var upd=function(a){ return a.map(function(x){ return map.get(x)||x; }); };
    tgt=upd(tgt); if(sel&&sel.length){ sel=upd(sel); selCur=sel; selBox=boxOf(sel); }
    refresh(); msg('Changed '+list.length+' stroke'+(list.length>1?'s':'')+' ('+(tool==='select'&&sel.length?'selected':'last drawn')+') – Ctrl+Z undoes');
    return true;
  }
  var rSm4=row();
  rSm4.appendChild(btn('Duplicate',function(){ selDup(); },'Duplicate (Ctrl+J)')); rSm4.appendChild(btn('Flip ↔',function(){ selFlip(true); },'Mirror the selection left–right')); rSm4.appendChild(btn('Flip ↕',function(){ selFlip(false); },'Mirror the selection top–bottom')); rSm4.appendChild(btn('Layer',function(){ selLayer(); },'Select the whole active layer, then resize or rotate it')); rSm4.appendChild(btn('All',function(){ setTool('select'); selAll(); },'Select everything in scope (Ctrl+A)')); rSm4.appendChild(btn('Last stroke',function(){ selLast(); },'Select the stroke you drew last, then change its opacity, colour or thickness'));
  bar.appendChild(rSm4);
  var rSm5=row(); lab(rSm5,'Scale'); var scIn=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:3px 5px;width:52px;box-sizing:border-box;'); scIn.type='number'; scIn.value=100; scIn.min=5; scIn.max=1000; rSm5.appendChild(scIn); lab(rSm5,'%');
  lab(rSm5,'Rotate'); var roIn=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:3px 5px;width:52px;box-sizing:border-box;'); roIn.type='number'; roIn.value=0; roIn.min=-360; roIn.max=360; rSm5.appendChild(roIn); lab(rSm5,'°');
  rSm5.appendChild(btn('Apply',function(){ var sc=(+scIn.value||100)/100, dg=+roIn.value||0; selXform(sc,dg); scIn.value=100; roIn.value=0; },'Scale and/or rotate the selection around its centre'));
  bar.appendChild(rSm5);

  sec('Cut out');
  var rCt=row();
  var bCutR=btn('▭ Rectangle',function(){ cutMode='rect'; setTool('cut'); },'Drag a rectangle to cut'), bCutL=btn('Lasso',function(){ cutMode='lasso'; setTool('cut'); },'Draw around the area to cut');
  rCt.appendChild(bCutR); rCt.appendChild(bCutL); bar.appendChild(rCt);
  var rCk=row(); lab(rCk,'Cut');
  var cutKeep=el('select',BTN+'padding:3px 6px;'); [['in','Erase inside'],['out','Erase outside (keep inside)']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; cutKeep.appendChild(op); }); rCk.appendChild(cutKeep); bar.appendChild(rCk);
  var rCf=row(); lab(rCf,'Soft edge'); var cutFeather=slider(rCf,0,40,0,110); cutFeather.title='0 = hard edge; higher = feathered edge'; bar.appendChild(rCf);

  sec('Import images');
  var rIm=row();
  var imf=el('input'); imf.type='file'; imf.accept='image/*'; imf.style.display='none';
  imf.addEventListener('change',function(){ var f=imf.files[0]; if(f) importImageFile(f); imf.value=''; });
  rIm.appendChild(imf); rIm.appendChild(btn('Import image…',function(){ imf.click(); },'Add a picture from your computer to the active layer'));
  bar.appendChild(rIm);

  sec('Dodge and burn');
  var rDb=row(); var bDodge=btn('Dodge (lighter)',function(){ setTool('dodge'); },'Paint over your drawing to make it lighter'), bBurn=btn('Burn (darker)',function(){ setTool('burn'); },'Paint over your drawing to make it darker'); rDb.appendChild(bDodge); rDb.appendChild(bBurn); bar.appendChild(rDb);
  var rDe=row(); lab(rDe,'Exposure'); var fxExp=slider(rDe,2,100,25,110); liveVal(fxExp); fxExp.title='How strong each stroke is'; bar.appendChild(rDe);

  sec('Retouch');
  var rRt=row(); var bBlurT=btn('Blur',function(){ setTool('blur'); },'Paint to blur what you have drawn on the active layer'), bSharpT=btn('Sharpen',function(){ setTool('sharpen'); },'Paint to make soft edges crisper'), bSmudgeT=btn('Smudge',function(){ setTool('smudge'); },'Drag the paint along, like a finger in wet paint'), bCloneT=btn('Clone',function(){ setTool('clone'); },'Copy one part of the layer to another. Alt+click the source first');
  [bBlurT,bSharpT,bSmudgeT,bCloneT].forEach(function(b){ rRt.appendChild(b); }); bar.appendChild(rRt);
  var pxSizes={blur:40,sharpen:40,smudge:40,clone:40};
  var rP0=row(); lab(rP0,'Brush size'); var pxSz=slider(rP0,4,500,40,110); liveVal(pxSz,' px'); pxSz.title='Each retouch tool remembers its own size'; bar.appendChild(rP0);
  pxSz.addEventListener('input',function(){ if(pxSizes[tool]!=null) pxSizes[tool]=+pxSz.value; });
  var rP1=row(); lab(rP1,'Strength'); var pxStr=slider(rP1,5,100,60,110); liveVal(pxStr); bar.appendChild(rP1);
  var rP2=row(); lab(rP2,'Amount'); var pxAmt=slider(rP2,1,40,6,110); pxAmt.title='Blur: how far it spreads. Sharpen: how much crisper.'; bar.appendChild(rP2);
  var rP3=row(); lab(rP3,'Hardness'); var pxHard=slider(rP3,0,100,30,110); liveVal(pxHard); bar.appendChild(rP3);
  var rP4=row(); rP4.appendChild(btn('Set clone source',function(){ cloneSet=true; setTool('clone'); msg('Now click on the spot you want to copy from'); },'Or hold Alt and click with the Clone tool')); bar.appendChild(rP4);

  sec('Layer effects');
  var fxName=el('div','font-size:12px;color:#444;','');
  bar.appendChild(fxName);
  var rFb=row(); lab(rFb,'Blur'); var fxBlur=slider(rFb,0,40,0,110); liveVal(fxBlur,' px'); bar.appendChild(rFb);
  var rFg0=row(); var fxGlow=chk(rFg0,'Glow',false,'A soft glow around everything on this layer'); var fxGcol=el('input','width:30px;height:26px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;'); fxGcol.type='color'; fxGcol.value='#ffd24d'; rFg0.appendChild(fxGcol); bar.appendChild(rFg0);
  var rFg1=row(); lab(rFg1,'Size'); var fxGsz=slider(rFg1,1,80,12,110); liveVal(fxGsz,' px'); bar.appendChild(rFg1);
  var rFg2=row(); lab(rFg2,'Strength'); var fxGamt=slider(rFg2,10,300,100,110); liveVal(fxGamt); bar.appendChild(rFg2);
  var rFs0=row(); var fxSh=chk(rFs0,'Drop shadow',false,'A shadow behind everything on this layer'); var fxScol=el('input','width:30px;height:26px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;'); fxScol.type='color'; fxScol.value='#000000'; rFs0.appendChild(fxScol); bar.appendChild(rFs0);
  var rFs1=row(); lab(rFs1,'Blur'); var fxShb=slider(rFs1,0,60,8,110); liveVal(fxShb,' px'); bar.appendChild(rFs1);
  var rFs2=row(); lab(rFs2,'Right'); var fxShx=slider(rFs2,-80,80,6,110); liveVal(fxShx,' px'); bar.appendChild(rFs2);
  var rFs3=row(); lab(rFs3,'Down'); var fxShy=slider(rFs3,-80,80,6,110); liveVal(fxShy,' px'); bar.appendChild(rFs3);
  var rFs4=row(); lab(rFs4,'Strength'); var fxSha=slider(rFs4,5,100,60,110); liveVal(fxSha); bar.appendChild(rFs4);
  function fxShow(){ [rFg1,rFg2].forEach(function(r){ r.style.display=fxGlow.checked?'flex':'none'; }); [rFs1,rFs2,rFs3,rFs4].forEach(function(r){ r.style.display=fxSh.checked?'flex':'none'; }); }
  function fxUpdate(){
    var L=getLayer(act), f=fxOf(L); fxName.textContent='Active layer: '+L.name;
    fxBlur.value=f.blur; fxGlow.checked=!!f.glow; fxGcol.value=f.gcol; fxGsz.value=f.gsz; fxGamt.value=f.gamt; fxSh.checked=!!f.sh; fxScol.value=f.shcol; fxShb.value=f.shb; fxShx.value=f.shx; fxShy.value=f.shy; fxSha.value=f.shamt; fxShow();
  }
  function fxApply(){ var L=getLayer(act), f=fxOf(L); f.blur=+fxBlur.value; f.glow=fxGlow.checked?1:0; f.gcol=fxGcol.value; f.gsz=+fxGsz.value; f.gamt=+fxGamt.value; f.sh=fxSh.checked?1:0; f.shcol=fxScol.value; f.shb=+fxShb.value; f.shx=+fxShx.value; f.shy=+fxShy.value; f.shamt=+fxSha.value; fxShow(); cancelAnimationFrame(fxRaf); fxRaf=requestAnimationFrame(rebuild); }
  var fxRaf=0;
  [fxBlur,fxGlow,fxGcol,fxGsz,fxGamt,fxSh,fxScol,fxShb,fxShx,fxShy,fxSha].forEach(function(x){ x.addEventListener('input',fxApply); x.addEventListener('change',fxApply); });
  fxShow();

  sec('Layers');
  var layerBox=el('div','display:flex;flex-direction:column;gap:5px;'); bar.appendChild(layerBox);
  var BLENDS=[['source-over','Normal'],['multiply','Multiply'],['screen','Screen'],['overlay','Overlay'],['soft-light','Soft light'],['hard-light','Hard light'],['darken','Darken'],['lighten','Lighten'],['color-dodge','Colour dodge'],['color-burn','Colour burn'],['difference','Difference'],['exclusion','Exclusion'],['hue','Hue'],['saturation','Saturation'],['color','Colour'],['luminosity','Luminosity']];
  var lRaf=0; function lRebuild(){ cancelAnimationFrame(lRaf); lRaf=requestAnimationFrame(rebuild); }
  function markLayers(){ Array.prototype.forEach.call(layerBox.children,function(d){ d.style.background = (+d.getAttribute('data-id')===act) ? '#e9e9e9' : '#fff'; d.style.borderColor = (+d.getAttribute('data-id')===act) ? '#111' : '#d4d4d4'; }); }
  function drawLayerUI(){
    layerBox.innerHTML='';
    if(typeof fxUpdate==='function'&&typeof fxName!=='undefined'&&fxName) try{ fxUpdate(); }catch(e){}
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
  drawLayerUI();

  // ---- Animate: frames -> preview -> GIF / video ----
  sec('Animate');
  var frames=[], aSel=-1, aPlay=0, aTimer=0;
  var rA1=row(); lab(rA1,'Frames'); var aN=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:3px 5px;box-sizing:border-box;width:52px;'); aN.type='number'; aN.min=2; aN.max=200; aN.value=24; aN.title='How many frames the replay should have'; rA1.appendChild(aN);
  bar.appendChild(rA1);
  var rA1b=row(); rA1b.appendChild(btn('Build-up from my drawing',function(){ aReplay(); },'Makes frames that show the drawing being drawn, stroke by stroke')); bar.appendChild(rA1b);
  var rA2=row(); rA2.appendChild(btn('+ Add this frame',function(){ aAdd(strokes); },'Takes a picture of the drawing as it is now – draw, add, change, add… for hand-made animation'));
  rA2.appendChild(btn('Clear last frame',function(){ if(!frames.length){ msg('No frames to clear'); return; } aPreview(false); frames.pop(); aSel=Math.min(aSel,frames.length-1); aDraw(); },'Removes the last frame'));
  rA2.appendChild(btn('Keep every 2nd',function(){ if(frames.length<3) return; frames=frames.filter(function(f,i){ return i%2===0; }); aSel=Math.min(aSel,frames.length-1); aDraw(); },'Keeps every second frame and removes the rest, for a smaller file'));
  rA2.appendChild(btn('Clear all',function(){ aPreview(false); frames=[]; aSel=-1; aDraw(); },'Remove all frames'));
  bar.appendChild(rA2);
  var rA3=row(); lab(rA3,'Size'); var aW=el('select',BTN+'padding:3px 6px;'); [[320,'320 px wide'],[480,'480 px wide'],[640,'640 px wide'],[800,'800 px wide'],[1000,'1000 px wide']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; aW.appendChild(op); }); aW.value=640; rA3.appendChild(aW);
  var aCrop=chk(rA3,'Drawn area only',true,'Cut away empty space around the drawing'); bar.appendChild(rA3);
  var rA4=row(); lab(rA4,'Background'); var aBg=el('select',BTN+'padding:3px 6px;'); [['transparent','Transparent'],['white','White'],['color','Colour']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; aBg.appendChild(op); }); rA4.appendChild(aBg);
  var aBgc=el('input','width:26px;height:24px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;display:none;'); aBgc.type='color'; aBgc.value='#f4efe6'; rA4.appendChild(aBgc); aBg.addEventListener('change',function(){ aBgc.style.display=aBg.value==='color'?'inline-block':'none'; }); bar.appendChild(rA4);
  var aStrip=el('div','display:flex;flex-wrap:wrap;gap:5px;max-height:240px;overflow-y:auto;'); bar.appendChild(aStrip);
  var aCount=el('div','font-size:11.5px;color:#666;','No frames yet'); bar.appendChild(aCount);
  var rA5=row(); lab(rA5,'Time / frame'); var aMs=slider(rA5,30,1000,120,90); liveVal(aMs,' ms'); bar.appendChild(rA5);
  var rA6=row(); lab(rA6,'Pause at end'); var aEnd=slider(rA6,0,3000,600,90); liveVal(aEnd,' ms'); var aLoop=chk(rA6,'Loop',true); bar.appendChild(rA6);
  var rAf=row(); lab(rAf,'Fade in'); var aFi=slider(rAf,0,3000,0,90); aFi.step=50; liveVal(aFi,' ms'); bar.appendChild(rAf);
  var rAg=row(); lab(rAg,'Fade out'); var aFo=slider(rAg,0,3000,0,90); aFo.step=50; liveVal(aFo,' ms'); bar.appendChild(rAg);
  var rA7=row(); var bPlay=btn('▶ Preview',function(){ if(!aPlay&&!frames.length){ if(!strokes.length){ msg('Nothing to preview yet – draw something first'); return; } aReplay(); } if(!aPlay&&frames.length===1&&strokes.length>1) msg('Only 1 frame, so nothing moves. Press “Build-up from my drawing” to make many frames, or change the drawing and press “+ Add current drawing as frame” again.',7000); aPreview(!aPlay); try{ aPrev.scrollIntoView({block:'nearest'}); }catch(e){} },'Play the animation here. With no frames yet, it makes them from your drawing first.'); rA7.appendChild(bPlay);
  bar.appendChild(rA7);
  var aPrev=document.createElement('canvas'); aPrev.width=240; aPrev.height=160; aPrev.style.cssText='width:100%;border:1px solid #ddd;border-radius:6px;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/14px 14px;display:none;'; bar.appendChild(aPrev);
  var rA8=row(); rA8.appendChild(btn('Save GIF',function(){ aGif(); },'Animated GIF – works almost everywhere, max 256 colours')); rA8.appendChild(btn('Save video (WebM)',function(){ aWebm(); },'Smoother and smaller, Chrome/Edge/Firefox')); bar.appendChild(rA8);
  function aBgVal(){ return aBg.value==='white'?'#ffffff':(aBg.value==='color'?aBgc.value:null); }
  var aBox=null;
  function aBounds(){ if(!aCrop.checked) return {x:0,y:0,w:W,h:H}; var vis=strokes.filter(function(st){ return st.tool!=='eraser'&&st.tool!=='cut'&&getLayer(layerOf(st)).vis; }); var t=vis.length?boxOf(vis):null; if(!t) return {x:0,y:0,w:W,h:H}; var pad=10,x=Math.max(0,Math.floor(t.x0-pad)),y=Math.max(0,Math.floor(t.y0-pad)); return {x:x,y:y,w:Math.max(8,Math.min(W,Math.ceil(t.x1+pad))-x),h:Math.max(8,Math.min(H,Math.ceil(t.y1+pad))-y)}; }
  function aShot(list,b){
    var k=Math.min(1,(+aW.value)/b.w), cw=Math.max(1,Math.round(b.w*k)), ch=Math.max(1,Math.round(b.h*k));
    var c=document.createElement('canvas'); c.width=cw; c.height=ch; var x=c.getContext('2d'), bg=aBgVal(); if(bg){ x.fillStyle=bg; x.fillRect(0,0,cw,ch); }
    var keep=strokes, old=rscale; strokes=list; rscale=k;
    try{ compose(x,function(g){ g.scale(k,k); g.translate(-b.x,-b.y); },null); }finally{ strokes=keep; rscale=old; }
    return c;
  }
  function aAdd(list){
    if(frames.length>=200){ msg('Max 200 frames'); return; }
    if(!list.length&&!under){ msg('Draw something first'); return; }
    if(!aBox||!frames.length) aBox=aBounds();
    var c=aShot(list,aBox); frames.push({c:c}); aSel=frames.length-1; aDraw();
  }
  function aReplay(){
    if(!strokes.length){ msg('Draw something first'); return; }
    var n=Math.max(2,Math.min(200,+aN.value||24)); aPreview(false); frames=[]; aBox=aBounds();
    var wts=strokes.map(function(st){ return (st.tool==='text'||st.tool==='image'||st.tool==='cut')?6:Math.max(1,st.pts.length); }), tot=wts.reduce(function(a,b){ return a+b; },0);
    for(var f=1;f<=n;f++){
      var goal=tot*f/n, acc=0, list=[];
      for(var i=0;i<strokes.length;i++){
        var w=wts[i];
        if(acc+w<=goal+1e-6){ list.push(strokes[i]); acc+=w; continue; }
        var part=goal-acc, st=strokes[i];
        if(part>=1&&st.tool!=='text'&&st.tool!=='image'&&st.tool!=='cut'&&st.tool!=='line'){ var cp=Object.assign({},st); delete cp.sm; cp.pts=st.pts.slice(0,Math.max(1,Math.floor(part))); list.push(cp); }
        break;
      }
      frames.push({c:aShot(list,aBox)});
    }
    aSel=frames.length-1; aDraw(); msg(frames.length+' frames made – press Preview');
  }
  function aDraw(){
    aStrip.textContent='';
    frames.forEach(function(f,i){
      var d=el('div','width:72px;border:2px solid '+(i===aSel?'#111':'#ddd')+';border-radius:6px;padding:2px;box-sizing:border-box;background:#fff;');
      var t=document.createElement('canvas'); t.width=64; t.height=Math.max(1,Math.round(64*f.c.height/f.c.width)); t.style.cssText='width:100%;display:block;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/10px 10px;'; t.getContext('2d').drawImage(f.c,0,0,t.width,t.height);
      t.addEventListener('click',function(){ aSel=i; aPreview(false); aShow(i); aDraw(); });
      d.appendChild(t); d.appendChild(el('div','font-size:10px;color:#666;text-align:center;',String(i+1)));
      var r=el('div','display:flex;justify-content:space-between;');
      [['◀','Move earlier',function(){ if(i>0){ var x=frames[i-1]; frames[i-1]=frames[i]; frames[i]=x; aSel=i-1; aDraw(); } }],['▶','Move later',function(){ if(i<frames.length-1){ var x=frames[i+1]; frames[i+1]=frames[i]; frames[i]=x; aSel=i+1; aDraw(); } }],['⧉','Copy this frame',function(){ frames.splice(i+1,0,{c:f.c}); aSel=i+1; aDraw(); }],['✕','Remove this frame',function(){ frames.splice(i,1); aSel=Math.min(aSel,frames.length-1); aDraw(); }]].forEach(function(o){ var b=el('button','border:0;background:none;cursor:pointer;font-size:11px;padding:1px 2px;',o[0]); b.type='button'; b.title=o[1]; b.addEventListener('click',o[2]); r.appendChild(b); });
      d.appendChild(r); aStrip.appendChild(d);
    });
    var secs=(frames.length*(+aMs.value)+(+aEnd.value)+(+aFi.value)+(+aFo.value))/1000;
    aCount.textContent=frames.length?(frames.length+' frames · about '+secs.toFixed(1)+' s · '+frames[0].c.width+'×'+frames[0].c.height+' px'):'No frames yet';
  }
  [aMs,aEnd,aFi,aFo].forEach(function(x){ x.addEventListener('input',function(){ if(frames.length) aDraw(); }); });
  function aShow(i){ var f=frames[i]; if(!f) return; aShowC(f.c); }
  function aShowC(c){ var f={c:c}; aPrev.style.display='block'; aPrev.width=f.c.width; aPrev.height=f.c.height; var g=aPrev.getContext('2d'); g.clearRect(0,0,aPrev.width,aPrev.height); g.drawImage(f.c,0,0); }
  function aPreview(on){
    clearTimeout(aTimer); aPlay=0; bPlay.textContent='▶ Preview';
    if(!on||!frames.length) return;
    aPlay=1; bPlay.textContent='■ Stop'; var i=0, seq=aSeq();
    (function step(){ if(!aPlay) return; aShowC(seq[i].c); var wait=seq[i].d; i++;
      if(i>=seq.length){ if(!aLoop.checked){ aTimer=setTimeout(function(){ aPreview(false); },wait); return; } i=0; }
      aTimer=setTimeout(step,wait); })();
  }
  function aSeq(){
    var seq=frames.map(function(f,i){ return {c:f.c,d:(+aMs.value)+(i===frames.length-1?(+aEnd.value):0)}; });
    if(!seq.length) return seq;
    var bg=aBgVal()||'#ffffff', w=frames[0].c.width, h=frames[0].c.height;
    function mix(src,a){ var c=document.createElement('canvas'); c.width=w; c.height=h; var x=c.getContext('2d'); x.fillStyle=bg; x.fillRect(0,0,w,h); x.globalAlpha=a; x.drawImage(src,0,0,w,h); return c; }
    var fi=+aFi.value, fo=+aFo.value, pre=[], post=[];
    if(fi>0){ var n=Math.max(2,Math.min(15,Math.round(fi/60))); for(var k=1;k<=n;k++) pre.push({c:mix(frames[0].c,k/(n+1)),d:fi/n}); }
    if(fo>0){ var m=Math.max(2,Math.min(15,Math.round(fo/60))); for(var j=1;j<=m;j++) post.push({c:mix(frames[frames.length-1].c,1-j/(m+1)),d:fo/m}); if(post.length&&seq.length) { /* the pause at the end belongs before the fade */ } }
    return pre.concat(seq,post);
  }
  function aDelays(){ return frames.map(function(f,i){ return (+aMs.value)+(i===frames.length-1?(+aEnd.value):0); }); }
  // --- GIF encoder (own, no libraries) ---
  function gifPalette(imgs,transparent){
    var hist=new Map();
    imgs.forEach(function(d){ for(var i=0;i<d.length;i+=16){ if(d[i+3]<128) continue; var k=((d[i]>>3)<<10)|((d[i+1]>>3)<<5)|(d[i+2]>>3); hist.set(k,(hist.get(k)||0)+1); } });
    var items=[]; hist.forEach(function(n,k){ var q5=function(v){ return (v<<3)|(v>>2); }; items.push({r:q5((k>>10)&31),g:q5((k>>5)&31),b:q5(k&31),n:n}); });
    var want=255; if(!items.length) items=[{r:255,g:255,b:255,n:1}];
    var boxes=[items];
    while(boxes.length<want){
      var bi=-1,bs=0; boxes.forEach(function(b,i){ if(b.length>1){ var sz=b.reduce(function(a,p){ return a+p.n; },0); if(sz>bs){ bs=sz; bi=i; } } }); if(bi<0) break;
      var b=boxes[bi], mn=[255,255,255], mx=[0,0,0]; b.forEach(function(p){ ['r','g','b'].forEach(function(c,j){ if(p[c]<mn[j]) mn[j]=p[c]; if(p[c]>mx[j]) mx[j]=p[c]; }); });
      var ch=['r','g','b'][[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]].indexOf(Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]))];
      b.sort(function(p,q){ return p[ch]-q[ch]; }); var half=bs/2, acc=0, cut=0; for(var i=0;i<b.length-1;i++){ acc+=b[i].n; cut=i+1; if(acc>=half) break; }
      boxes.splice(bi,1,b.slice(0,cut),b.slice(cut));
    }
    var pal=boxes.map(function(b){ var n=0,r=0,g=0,bl=0; b.forEach(function(p){ n+=p.n; r+=p.r*p.n; g+=p.g*p.n; bl+=p.b*p.n; }); return [Math.round(r/n),Math.round(g/n),Math.round(bl/n)]; });
    while(pal.length<256) pal.push([0,0,0]); return pal;
  }
  function gifLZW(idx,minCode){
    var out=[], clear=1<<minCode, eoi=clear+1, size=minCode+1, next=eoi+1, dict=new Map(), cur=0, bits=0;
    function put(code){ cur|=code<<bits; bits+=size; while(bits>=8){ out.push(cur&255); cur>>>=8; bits-=8; } }
    put(clear); var p=idx[0];
    for(var i=1;i<idx.length;i++){
      var k=idx[i], key=(p<<8)|k, v=dict.get(key);
      if(v!==undefined){ p=v; continue; }
      put(p);
      if(next<4096){ dict.set(key,next++); if(next-1>=(1<<size)&&size<12) size++; }
      else { put(clear); dict.clear(); next=eoi+1; size=minCode+1; }
      p=k;
    }
    put(p); put(eoi); if(bits>0) out.push(cur&255);
    return out;
  }
  function encodeGif(){
    var seq=aSeq(), w=seq[0].c.width, h=seq[0].c.height, transparent=aBgVal()===null, imgs=seq.map(function(f){ var c=f.c; if(c.width!==w||c.height!==h){ var t=document.createElement('canvas'); t.width=w; t.height=h; t.getContext('2d').drawImage(c,0,0,w,h); c=t; } return c.getContext('2d').getImageData(0,0,w,h).data; });
    var pal=gifPalette(imgs,transparent), TI=255, cache=new Map(), bytes=[], dl=seq.map(function(f){ return f.d; });
    function nearest(r,g,b){ var key=((r>>3)<<10)|((g>>3)<<5)|(b>>3), v=cache.get(key); if(v!==undefined) return v; var best=0,bd=1e9, lim=255; for(var i=0;i<lim;i++){ var d=(pal[i][0]-r)*(pal[i][0]-r)+(pal[i][1]-g)*(pal[i][1]-g)+(pal[i][2]-b)*(pal[i][2]-b); if(d<bd){ bd=d; best=i; } } cache.set(key,best); return best; }
    function w16(n){ bytes.push(n&255,(n>>8)&255); }
    'GIF89a'.split('').forEach(function(ch){ bytes.push(ch.charCodeAt(0)); }); w16(w); w16(h); bytes.push(0xF7,0,0);
    pal.forEach(function(c){ bytes.push(c[0],c[1],c[2]); });
    if(aLoop.checked) bytes.push(0x21,0xFF,11,78,69,84,83,67,65,80,69,50,46,48,3,1,0,0,0);
    var prev=null;
    imgs.forEach(function(d,fi){
      var idx=new Uint8Array(w*h), x0=0,y0=0,x1=w-1,y1=h-1, cur2=new Uint8Array(w*h);
      for(var i=0,p=0;i<d.length;i+=4,p++) cur2[p]= (transparent&&d[i+3]<128)?TI:nearest(d[i],d[i+1],d[i+2]);
      var useDelta=!transparent&&prev;
      if(useDelta){ var mnx=w,mny=h,mxx=-1,mxy=-1; for(var y=0;y<h;y++) for(var x=0;x<w;x++){ var q=y*w+x; if(cur2[q]!==prev[q]){ if(x<mnx)mnx=x; if(x>mxx)mxx=x; if(y<mny)mny=y; if(y>mxy)mxy=y; } }
        if(mxx<0){ mnx=0;mny=0;mxx=0;mxy=0; } x0=mnx;y0=mny;x1=mxx;y1=mxy; }
      var rw=x1-x0+1, rh=y1-y0+1, sub=new Uint8Array(rw*rh), n=0;
      for(var y2=y0;y2<=y1;y2++) for(var x2=x0;x2<=x1;x2++){ var q2=y2*w+x2; sub[n++]= (useDelta&&cur2[q2]===prev[q2])?255:cur2[q2]; }
      var tIdx=255, hasT=transparent||useDelta;
      bytes.push(0x21,0xF9,4,(transparent?(2<<2):(1<<2))|(hasT?1:0)); w16(Math.max(2,Math.round(dl[fi]/10))); bytes.push(tIdx,0);
      bytes.push(0x2C); w16(x0); w16(y0); w16(rw); w16(rh); bytes.push(0);
      bytes.push(8); var lz=gifLZW(sub,8); for(var j=0;j<lz.length;j+=255){ var chunk=lz.slice(j,j+255); bytes.push(chunk.length); for(var m=0;m<chunk.length;m++) bytes.push(chunk[m]); } bytes.push(0);
      prev=cur2;
    });
    bytes.push(0x3B);
    return new Blob([new Uint8Array(bytes)],{type:'image/gif'});
  }
  function aGif(){
    if(!frames.length){ msg('Make some frames first'); return; }
    msg('Making the GIF…',3000);
    setTimeout(function(){ try{ var bl=encodeGif(); saveBlob(bl,fname('ritlager-animation','.gif',''),'GIF with '+frames.length+' frames ('+Math.round(bl.size/1024)+' KB).'); }catch(e){ msg('Could not make the GIF: '+(e&&e.message?e.message:e)); } },50);
  }
  function aWebm(){
    if(!frames.length){ msg('Make some frames first'); return; }
    if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream){ msg('This browser cannot make video here – use Save GIF'); return; }
    var w=frames[0].c.width, h=frames[0].c.height, c=document.createElement('canvas'); c.width=w; c.height=h; var g=c.getContext('2d'), bg=aBgVal();
    var st=c.captureStream(30), mt=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].filter(function(m){ return MediaRecorder.isTypeSupported(m); })[0]; if(!mt){ msg('This browser cannot make WebM – use Save GIF'); return; }
    var seq=aSeq(), rec=new MediaRecorder(st,{mimeType:mt,videoBitsPerSecond:4e6}), chunks=[], dl=seq.map(function(f){ return f.d; });
    rec.ondataavailable=function(e){ if(e.data&&e.data.size) chunks.push(e.data); };
    rec.onstop=function(){ var bl=new Blob(chunks,{type:'video/webm'}); saveBlob(bl,fname('ritlager-animation','.webm',''),'Video with '+frames.length+' frames ('+Math.round(bl.size/1024)+' KB).'); };
    var i=0; rec.start(); msg('Recording the video… it takes as long as the animation',4000);
    (function step(){ if(bg){ g.fillStyle=bg; g.fillRect(0,0,w,h); } else g.clearRect(0,0,w,h); g.drawImage(seq[i].c,0,0,w,h); var t=dl[i]; i++; if(i>=seq.length){ setTimeout(function(){ rec.stop(); },t+100); return; } setTimeout(step,t); })();
  }
  bar.appendChild(el('div','font-size:11.5px;color:#555;line-height:1.45;background:#f6f6f6;border-radius:7px;padding:7px 9px;','To make an animation from your drawing: 1) Press “Build-up from my drawing”, or build frame by frame with “+ Add this frame”. 2) ▶ Preview. 3) Save GIF or video.'));

  sec('Export (image)');
  function pageNow(){ var w,h; if(SC){ w=SC.scrollWidth; h=SC.scrollHeight; } else { w=Math.max(de.scrollWidth,bd?bd.scrollWidth:0,de.clientWidth); h=Math.max(de.scrollHeight,bd?bd.scrollHeight:0,de.clientHeight); } w=Math.min(w,6000); h=Math.min(h,Math.floor(30e6/w),20000); return {w:w,h:h}; }
  var pgInfo=el('div','font-size:11.5px;color:#555;line-height:1.35;padding-bottom:2px;border-bottom:1px solid #e6e6e6;'); bar.appendChild(pgInfo);
  function updatePageInfo(){ var n=pageNow(), t='Page size: '+n.w+' × '+n.h+' px'; if(pgInfo.textContent!==t) pgInfo.textContent=t; }
  updatePageInfo();
  setInterval(function(){ if(!de.contains(bar)) return; updatePageInfo(); if(area==='view'||cur) return; var n=pageNow(); if(n.w!==W||n.h!==H){ try{ rescan(); if(typeof fmtUpdate==='function') fmtUpdate(); }catch(e){} } },1500);
  var rSz=row(); lab(rSz,'Image size');
  var csel=el('select',BTN+'padding:3px 6px;');
  [['full','Whole page'],['crop','Strokes only']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; csel.appendChild(op); });
  rSz.appendChild(csel); bar.appendChild(rSz);
  var cr={ get checked(){ return csel.value==='crop'; } };
  var rLy=row(); lab(rLy,'Layers');
  var lySel=el('select',BTN+'padding:3px 6px;');
  [['all','All in one image'],['each','Each layer as its own image'],['active','Active layer only']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; lySel.appendChild(op); });
  lySel.title='Use “Each layer” to get one image file per layer, e.g. one to place over objects on the page and one under.';
  rLy.appendChild(lySel); bar.appendChild(rLy);
  var rFm=row(); lab(rFm,'File type');
  var fmSel=el('select',BTN+'padding:3px 6px;');
  [['png','PNG (sharp, can be transparent)'],['jpg','JPG (small file, no transparency)'],['tif','TIFF (for print and archive)']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; fmSel.appendChild(op); });
  rFm.appendChild(fmSel); bar.appendChild(rFm);
  var rQ=row(); lab(rQ,'JPG quality'); var jq=slider(rQ,10,100,92,110); liveVal(jq); rQ.style.display='none'; bar.appendChild(rQ);
  var rDpi=row(); lab(rDpi,'DPI (print size)'); var dpiEl=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:4px 8px;width:70px;box-sizing:border-box;'); dpiEl.type='number'; dpiEl.min=36; dpiEl.max=1200; dpiEl.value=72; var dpiTouched=false; dpiEl.addEventListener('input',function(){ dpiTouched=true; }); dpiEl.title='Stored in the file so Photoshop, InDesign and printers know the print size. It does not change the number of pixels – use Resolution for that.'; rDpi.appendChild(dpiEl); bar.appendChild(rDpi);
  var rRs=row(); lab(rRs,'Resolution');
  var rsSel=el('select',BTN+'padding:3px 6px;');
  [['1','1× (as on screen)'],['1.5','1.5×'],['2','2× (sharp on retina screens)'],['3','3×'],['4','4×'],['6','6×']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; rsSel.appendChild(op); });
  rRs.appendChild(rsSel); bar.appendChild(rRs);
  var rsInfo=el('div','font-size:11px;color:#777;line-height:1.35;'); bar.appendChild(rsInfo);
  function expBox(){ var b={w:W,h:H}; if(csel.value==='crop'){ try{ var t=bounds(); if(t) b={w:Math.min(W,Math.ceil(t.w+16)),h:Math.min(H,Math.ceil(t.h+16))}; }catch(e){} } return b; }
  function fmtUpdate(){ var k=+rsSel.value, b=expBox(); rQ.style.display=fmSel.value==='jpg'?'flex':'none';
    var w=Math.round(b.w*k), h=Math.round(b.h*k); rsInfo.textContent='The image will be about '+w+' × '+h+' px'+(fmSel.value!=='jpg'||true?' (at '+(+dpiEl.value||300)+' DPI = '+(w/(+dpiEl.value||300)*2.54).toFixed(1)+' × '+(h/(+dpiEl.value||300)*2.54).toFixed(1)+' cm)':'')+(fmSel.value==='jpg'&&bgSel.value==='none'?'. JPG cannot be transparent, so the background becomes white unless you choose another.':'.')+(w*h>1e8?' That is very large – the browser may refuse; choose a lower resolution.':'')+(isShot()?' (With Screenshot background the resolution is the screenshot\'s own.)':'');
    var L={png:'PNG',jpg:'JPG',tif:'TIFF'}[fmSel.value]; if(typeof bSave!=='undefined'&&bSave) bSave.textContent='Export '+L; if(typeof quick!=='undefined'&&quick) quick.textContent='Export '+L; }
  var szHint=el('div','font-size:11px;color:#777;line-height:1.35;');
  function hint(){ szHint.textContent = csel.value==='crop' ? 'Strokes only: the image is cropped to the area around your strokes. Smaller file, but you have to place it yourself on the page.' : 'Whole page: the image is as large as the page. Place it at the page top-left and the strokes line up exactly.'; }
  csel.addEventListener('change',hint); hint(); csel.addEventListener('change',function(){ if(csel.value==='full'){ try{ rescan(); }catch(e){} fmtUpdate(); } });
  fmSel.addEventListener('change',function(){ if(!dpiTouched) dpiEl.value=fmSel.value==='tif'?300:72; });
  [fmSel,rsSel,csel].forEach(function(x){ x.addEventListener('change',fmtUpdate); }); dpiEl.addEventListener('input',fmtUpdate);
  var rBg=row(); lab(rBg,'Background');
  var bgSel=el('select',BTN+'padding:3px 6px;');
  function isShot(){ return bgSel.value==='shot'||bgSel.value==='shot2'; }
  [['none','Transparent'],['white','White'],['color','Custom colour'],['shot','Drawing on top of screenshot'],['shot2','Screenshot and drawing as two images']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; bgSel.appendChild(op); });
  var bgCol=el('input','width:26px;height:24px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;display:none;'); bgCol.type='color'; bgCol.value='#f4efe6';
  bgSel.addEventListener('change',function(){ if(typeof fmtUpdate==='function') fmtUpdate(); bgCol.style.display = bgSel.value==='color' ? 'inline-block' : 'none'; if(typeof updateRefInfo==='function') updateRefInfo(); if(isShot()&&!ref&&typeof captureRef==='function') captureRef(); });
  rBg.appendChild(bgSel); rBg.appendChild(bgCol); bar.appendChild(rBg);
  function saveRef(){ if(!ref){ msg('Take a screenshot first: choose it under Background'); return; } ref.c.toBlob(function(bl){ if(!bl){ msg('Could not create the image'); return; } saveBlob(bl,fname('reference-'+ref.c.width+'x'+ref.c.height,'.png','-reference'),'The reference image is saved.'); },'image/png'); }
  var refInfoEl=el('div','font-size:11px;color:#777;line-height:1.35;display:none;'); var refTxt=el('span'); var refNew=el('span','color:#111;text-decoration:underline;cursor:pointer;margin-left:6px;','Take a new one'); refNew.addEventListener('click',function(){ captureRef(); }); refInfoEl.appendChild(refTxt); refInfoEl.appendChild(refNew); bar.appendChild(refInfoEl);
  bar.insertBefore(rBg,rFm); bar.insertBefore(refInfoEl,rFm);
  function updateRefInfo(){ refTxt.textContent = ref ? 'Screenshot taken: '+ref.c.width+' × '+ref.c.height+' px.' : 'Waiting for a screenshot…'; refInfoEl.style.display = isShot() ? 'block' : 'none'; }
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
          var rr=cv.getBoundingClientRect(); ref={c:c,sx:-rr.left,sy:-rr.top,w:iw,h:ih,k:kx}; if(!isShot()) bgSel.value='shot'; bgCol.style.display='none'; updateRefInfo();
          msg('Screenshot taken ('+fw+' × '+fh+' px)');
        },350);
      }); };
    }).catch(function(){ msg('Screen capture was cancelled or denied'); if(!ref&&isShot()){ bgSel.value='none'; updateRefInfo(); if(typeof fmtUpdate==='function') fmtUpdate(); } });
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
  var bSave=btn('Export PNG',function(){ exportPng('save'); },'The image: PNG with the background and size you chose'); bSave.style.background='#111'; bSave.style.color='#fff'; bSave.style.borderColor='#111';
  r8.appendChild(bSave);
  r8.appendChild(btn('Copy image',function(){ exportPng('copy'); },'Copies a PNG to the clipboard'));
  fmtUpdate();
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
  rV3.appendChild(btn('Save project file',function(){ saveProject(); },'The whole drawing as an editable file (.json)'));
  var pf=el('input'); pf.type='file'; pf.accept='.json,application/json'; pf.style.display='none';
  pf.addEventListener('change',function(){ var f=pf.files[0]; if(!f) return; var r=new FileReader(); r.onload=function(){ try{ backupCurrent(); var n=unpack(JSON.parse(r.result)); msg(n<0?'The file does not look like a Ritlager file':'Opened the project file ('+n+' strokes)'); }catch(e){ msg('Could not read the file'); } }; r.readAsText(f); pf.value=''; });
  rV3.appendChild(pf); rV3.appendChild(btn('Open project file',function(){ pf.click(); },'Open a project file you saved earlier'));
  bar.appendChild(rV3);
  fillVers();

  var dbg=el('div','font-size:11px;color:#888;','Device: –'); bar.appendChild(dbg);
  var info=el('div','font-size:11px;color:#777;line-height:1.35;','Autosaved here. Save a project file to edit later.');
  bar.appendChild(info);

  var note=el('div','position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:'+(Z+2)+';background:#111;color:#fff;padding:7px 13px;border-radius:8px;font:300 13px '+FONT+';opacity:0;transition:opacity .25s;pointer-events:none;');
  function msg(t,ms){ note.textContent=t; note.style.opacity=1; clearTimeout(msg.t); msg.t=setTimeout(function(){note.style.opacity=0;},ms||2400); }

  var lastDraw='pen';
  function show(e,on){ e.style.display = on?'flex':'none'; }
  function setTool(t){
    if(t!=='select'&&tool==='select'){ clearSel(); refresh(); cv.style.cursor=DOTS; }
    if(t==='select') cv.style.cursor=baseCur();
    if(t==='cut'&&tool!=='cut') clearSel();
    tool=t; if(t!=='eraser'&&t!=='select'&&t!=='text'&&t!=='cut'&&t!=='dodge'&&t!=='burn'&&t!=='blur'&&t!=='sharpen'&&t!=='smudge'&&t!=='clone') lastDraw=t;
    if(typeof markTop==='function') markTop(); mark(bPen,t==='pen'); mark(bBrush,t==='brush'); mark(bAir,t==='air'); mark(bDodge,t==='dodge'); mark(bBurn,t==='burn'); mark(bBlurT,t==='blur'); mark(bSharpT,t==='sharpen'); mark(bSmudgeT,t==='smudge'); mark(bCloneT,t==='clone'); if(t!=='clone') drawCloneMarkOff(); if(typeof pxSz!=='undefined'&&pxSizes[t]!=null) pxSz.value=pxSizes[t]; mark(bSel0,t==='select'); mark(bLine,t==='line'); mark(bEr,t==='eraser'); mark(bTxt,t==='text'); markSel();
    show(rNib, t==='pen'); show(rSoft, t==='pen'||t==='eraser');  show(rDry, t==='brush'); show(rAir,t==='air'||t==='dodge'||t==='burn'); show(rAir2,t==='air'||t==='dodge'||t==='burn'); show(rArrow, t==='line');
    var pressOK = t!=='line'&&t!=='select'&&t!=='text'&&t!=='cut'; secPress._hidden=!pressOK; applySec(secPress); show(rPr,pressOK); show(rSens,pressOK); show(rPm,pressOK);
  }
  var prevColor='#ffffff';
  function setColor(c){ if(c!==color&&color) prevColor=color; color=c; changeSel('color'); if(c.length===7){ cp.value=c; hexIn.value=c; var n=parseInt(c.slice(1),16); rgbEl.textContent='rgb('+(n>>16)+', '+((n>>8)&255)+', '+(n&255)+')'; } sw.forEach(function(s){ s[0].style.outline = s[1]===c ? '2px solid #111' : 'none'; s[0].style.outlineOffset='2px'; }); if(tool==='eraser') setTool(lastDraw); }
  function setDrawing(d){ drawing=d; cv.style.pointerEvents = d?'auto':'none'; markTop(); msg(d?'Draw mode':'Click mode – you can click on the page'); }
  setTool('pen'); setColor('#111111'); setSize2(3); styleListen();

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
      if(csel.value==='full'){ try{ rescan(); }catch(e){} }
      if(mode==='save'&&lySel.value==='each'&&!isShot()){
        var L2=layers.filter(function(L){ return L.vis&&strokes.some(function(st){ return layerOf(st)===L.id; }); });
        if(!L2.length){ msg('Draw something first'); return; }
        L2.forEach(function(L,i){ setTimeout(function(){ try{ exportPng2('save',L.id,L.name); }catch(e){ msg('Export failed: '+(e&&e.message?e.message:e)); } },i*400); });
        return;
      }
      exportPng2(mode, lySel.value==='active' ? act : null);
      if(mode==='save'&&bgSel.value==='shot2'&&ref) setTimeout(saveRef,400);
    }catch(e){ msg('Export failed: '+(e&&e.message?e.message:e)+'. Try Image size: Strokes only.'); }
  }
  var crcT=null; function crc32(u,a,b){ if(!crcT){ crcT=[]; for(var n=0;n<256;n++){ var c=n; for(var k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; crcT[n]=c>>>0; } } var c2=0xFFFFFFFF; for(var i=a;i<b;i++) c2=crcT[(c2^u[i])&255]^(c2>>>8); return (c2^0xFFFFFFFF)>>>0; }
  function setDpi(bl,fmt,dpi,cb){
    if(fmt==='tif'){ cb(bl); return; }
    var fr=new FileReader(); fr.onload=function(){ try{
      var u=new Uint8Array(fr.result), out=null;
      if(fmt==='jpg'){ if(u[2]===0xFF&&u[3]===0xE0&&u[6]===0x4A&&u[7]===0x46){ u[13]=1; u[14]=dpi>>8; u[15]=dpi&255; u[16]=dpi>>8; u[17]=dpi&255; out=u; } }
      else if(fmt==='png'&&u[1]===0x50){ var ppm=Math.round(dpi/0.0254), ch=new Uint8Array(21), v=new DataView(ch.buffer); v.setUint32(0,9); ch.set([0x70,0x48,0x59,0x73],4); v.setUint32(8,ppm); v.setUint32(12,ppm); ch[16]=1; v.setUint32(17,crc32(ch,4,17)); out=new Uint8Array(u.length+21); out.set(u.subarray(0,33)); out.set(ch,33); out.set(u.subarray(33),54); }
      cb(out?new Blob([out],{type:bl.type}):bl); }catch(e){ cb(bl); } };
    fr.onerror=function(){ cb(bl); }; fr.readAsArrayBuffer(bl);
  }
  function encodeTiff(c,dpi){
    var w=c.width,h=c.height,d=c.getContext('2d').getImageData(0,0,w,h).data, n=w*h*4, off=206, buf=new ArrayBuffer(off+n), v=new DataView(buf), u=new Uint8Array(buf), p=8, i;
    u[0]=0x49; u[1]=0x49; v.setUint16(2,42,true); v.setUint32(4,8,true);
    v.setUint16(p,14,true); p+=2;
    function E(tag,type,cnt,val){ v.setUint16(p,tag,true); v.setUint16(p+2,type,true); v.setUint32(p+4,cnt,true); if(type===3&&cnt===1) v.setUint16(p+8,val,true); else v.setUint32(p+8,val,true); p+=12; }
    E(256,4,1,w); E(257,4,1,h); E(258,3,4,182); E(259,3,1,1); E(262,3,1,2); E(273,4,1,off); E(277,3,1,4); E(278,4,1,h); E(279,4,1,n); E(282,5,1,190); E(283,5,1,198); E(284,3,1,1); E(296,3,1,2); E(338,3,1,2);
    v.setUint32(p,0,true);
    for(i=0;i<4;i++) v.setUint16(182+i*2,8,true);
    v.setUint32(190,dpi,true); v.setUint32(194,1,true); v.setUint32(198,dpi,true); v.setUint32(202,1,true);
    u.set(d,off); return new Blob([buf],{type:'image/tiff'});
  }
  function exportPng2(mode,only,label){
    var b, out, oc, kk=(mode==='copy'||isShot())?1:(+rsSel.value||1);
    if(isShot()){
      if(!ref){ msg('Take a screenshot first: choose it under Background'); return; }
      out=document.createElement('canvas'); out.width=ref.c.width; out.height=ref.c.height; oc=out.getContext('2d');
      if(bgSel.value!=='shot2') oc.drawImage(ref.c,0,0);
      rscale=ref.k; compose(oc,function(c){ c.scale(ref.k,ref.k); c.translate(-ref.sx,-ref.sy); },only==null?null:only); rscale=1;
      b={x:ref.sx,y:ref.sy,w:out.width,h:out.height};
    } else {
      if(!strokes.length&&!under){ msg('Draw something first'); return; }
      b={x:0,y:0,w:W,h:H};
      if(cr.checked){ var t=bounds(); if(t){ var pad=8,x=Math.max(0,t.x-pad),y=Math.max(0,t.y-pad); b={x:x,y:y,w:Math.min(W,t.x+t.w+pad)-x,h:Math.min(H,t.y+t.h+pad)-y}; } }
      out=document.createElement('canvas'); out.width=Math.round(b.w*kk); out.height=Math.round(b.h*kk);
      oc=out.getContext('2d'); var bgv=bgValue(); if(bgv){ oc.fillStyle=bgv; oc.fillRect(0,0,out.width,out.height); }
      if(only==null&&plainLayers()&&kk===1) oc.drawImage(base,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
      else { rscale=kk; try{ compose(oc,function(c){ c.scale(kk,kk); c.translate(-b.x,-b.y); },only==null?null:only); }finally{ rscale=1; } }
    }
    var fmt=(mode==='copy')?'png':fmSel.value, mime=fmt==='jpg'?'image/jpeg':fmt==='tif'?'image/tiff':'image/png';
    if(fmt==='jpg'&&!bgValue()&&!isShot()){ var o2=document.createElement('canvas'); o2.width=out.width; o2.height=out.height; var c2=o2.getContext('2d'); c2.fillStyle='#ffffff'; c2.fillRect(0,0,o2.width,o2.height); c2.drawImage(out,0,0); out=o2; }
    var finish=function(bl){
      if(!bl){ msg('The image became too large for the browser. Choose Image size: Strokes only.'); return; }
      lastBlob=bl; var tag=label?'-'+String(label).replace(/[^\w-]+/g,'_'):''; lastName=fname('ritlager'+tag+'-'+out.width+'x'+out.height,fmt==='jpg'?'.jpg':fmt==='tif'?'.tif':'.png',tag);
      if(mode==='copy'){
        try{ navigator.clipboard.write([new ClipboardItem({'image/png':bl})]).then(function(){msg('Image copied');},function(){msg('Copying was denied – use Export PNG');}); }
        catch(e){ msg('Copying is not supported here – use Export PNG'); }
      } else {
        saveBlob(bl,lastName,'('+out.width+' × '+out.height+' px'+(bgSel.value==='shot2'?', drawing only':isShot()?', with screenshot':(bgValue()||fmt==='jpg')?'':', transparent')+')');
      }
    };
    var dpiV=Math.max(36,Math.min(1200,Math.round(+dpiEl.value)||300)); if(fmt==='tif'){ try{ finish(encodeTiff(out,dpiV)); }catch(e){ msg('TIFF failed: '+(e&&e.message?e.message:e)+'. Try a lower resolution.'); } }
    else out.toBlob(function(bl){ if(!bl||mode==='copy'){ finish(bl); return; } setDpi(bl,fmt,dpiV,finish); },mime,fmt==='jpg'?(+jq.value/100):undefined);
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
      if(k==='d'){ e.preventDefault(); clearSel(); refresh(); return; }
      if(k==='j'){ e.preventDefault(); selDup(); return; }
    }
    if(drawing&&tool==='select'&&(k==='delete'||k==='backspace')&&sel.length){ e.preventDefault(); selDelete(); return; }
    if(drawing&&!mod&&(k==='delete'||k==='backspace')){ e.preventDefault(); eraseAll(); return; }
    if(drawing&&tool==='select'&&k==='escape'){ clearSel(); refresh(); return; }
    if(e.ctrlKey||e.metaKey||e.altKey) return;
    if(k==='d') setDrawing(!drawing);
    else if(drawing){
      if(k==='b') setTool('pen'); else if(k==='p') setTool('brush'); else if(k==='a') setTool('air'); else if(k==='l') setTool('line'); else if(k==='e') setTool('eraser'); else if(k==='i') pickColour(); else if(k==='s'||k==='v') setTool('select'); else if(k==='h') setDrawing(false); else if(k==='x'){ setColor(prevColor); msg('Colour swapped'); } else if(/^[0-9]$/.test(k)){ var pc=k==='0'?100:+k*10; ink.value=pc; ink.dispatchEvent(new Event('input',{bubbles:true})); ink.dispatchEvent(new Event('change',{bubbles:true})); msg('Opacity '+pc+'%'); } else if(k==='t') setTool('text');
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
    var o={tool:(tool==='eraser'?lastDraw:tool),color:color,size:+size.toFixed(2),nib:nibSel.value,soft:+soft.value,dry:+dry.value,ink:+ink.value,sens:+sens.value,pr:pr.checked,pm:pm.value,sm:+sm.value,thin:thinSel.value,arrow:ar.checked,hard:+airHard.value,flow:+airFlow.value};
    if(all){ o.csel=csel.value; o.bg=bgSel.value; o.bgc=bgCol.value; o.ly=lySel.value; o.ask=askEl.checked; o.tool=tool; if(bar.style.left){ o.x=parseFloat(bar.style.left); o.y=parseFloat(bar.style.top); } }
    return o;
  }
  function applySettings(o){
    if(!o) return; quietChg=true; try{ applySettings2(o); }finally{ quietChg=false; }
  }
  function applySettings2(o){
    if(o.nib) nibSel.value=o.nib; if(o.soft!=null) soft.value=o.soft; if(o.dry!=null) dry.value=o.dry; if(o.ink!=null) ink.value=o.ink;
    if(o.sens!=null) sens.value=o.sens; if(o.pr!=null) pr.checked=o.pr; if(o.pm) pm.value=o.pm; if(o.sm!=null) sm.value=o.sm;
    if(o.hard!=null) airHard.value=o.hard; if(o.flow!=null) airFlow.value=o.flow; if(o.thin) thinSel.value=o.thin; if(o.arrow!=null) ar.checked=o.arrow;
    if(o.csel){ csel.value=o.csel; hint(); } if(o.bg){ bgSel.value=o.bg; bgCol.style.display=bgSel.value==='color'?'inline-block':'none'; } if(o.bgc) bgCol.value=o.bgc;
    if(o.ly) lySel.value=o.ly; if(o.ask!=null) askEl.checked=o.ask;
    if(o.tool) setTool(o.tool); if(o.color) setColor(o.color); if(o.size!=null) setSize2(o.size);
    if(o.x!=null&&o.y!=null){ bar.style.left=Math.max(0,Math.min(o.x,window.innerWidth-80))+'px'; bar.style.top=Math.max(0,Math.min(o.y,window.innerHeight-60))+'px'; bar.style.right='auto'; }
  }
  var STK='ritlager-settings', stT=0;
  function saveSettings(){ clearTimeout(stT); stT=setTimeout(function(){ try{ localStorage.setItem(STK,JSON.stringify(getSettings(true))); }catch(e){} },400); }
  bar.addEventListener('input',saveSettings); bar.addEventListener('change',saveSettings); bar.addEventListener('click',saveSettings); head.addEventListener('pointerup',saveSettings);
  quietChg=true; try{ setTool('pen'); setColor('#000000'); setSize2(4); }catch(e){} quietChg=false;
  try{ applySettings(JSON.parse(localStorage.getItem(STK))); }catch(e){}
  try{ fmSel.value='png'; dpiEl.value=72; dpiTouched=false; fmtUpdate(); }catch(e){}
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
    var closedDefault={'Pressure and stabilising':1,'Underlay (old PNG)':1,'Layout':1,'Outline':1,'Shadow':1,'Box':1,'Fonts and convert':1};
    var GROUP={'Drawing tools':'Draw','Presets':'Draw','Colour':'Draw','Thickness':'Draw','Look':'Draw','Pressure and stabilising':'Draw','Select tool':'Edit','Type':'Text','Layout':'Text','Outline':'Text','Shadow':'Text','Box':'Text','Fonts and convert':'Text','Effect tools':'Edit','Import images':'Edit','Cut out':'Edit','Dodge and burn':'Effects','Retouch':'Effects','Layer effects':'Effects','Layers':'Layers','Animate':'Animate','Export (image)':'Export and save','Underlay (old PNG)':'Export and save','Save and open (editable)':'Export and save'};
    var hs=[], gs=[], curH=null, wrap=null, curG=null, gw=null;
    function saveSt(){ try{ localStorage.setItem(OK,JSON.stringify(st)); }catch(e){} }
    function applyGrp(g){ g.textContent=(g._open?'▾ ':'▸ ')+g._t; g._wrap.style.display=g._open?'flex':'none'; }
    Array.prototype.slice.call(bar.children).forEach(function(k){
      if(k.hasAttribute&&k.hasAttribute('data-sec')){
        var gn=GROUP[k._t]||'More';
        if(!curG||curG._t!==gn){
          curG=el('div','font-size:12px;letter-spacing:.07em;text-transform:uppercase;font-weight:400;color:#111;margin-top:6px;padding:6px 8px;background:#efefef;border-radius:7px;cursor:pointer;user-select:none;',gn); curG._t=gn;
          curG._open = false;
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
    var cnt={}; hs.forEach(function(h){ var g=GROUP[h._t]||'More'; cnt[g]=(cnt[g]||0)+1; });
    hs.forEach(function(h){ if(cnt[GROUP[h._t]||'More']===1||GROUP[h._t]==='Text'){ h._flat=true; h._open=true; } });
    hs.forEach(applySec); gs.forEach(applyGrp);
    var allBtn=btn('⇕',function(){ var anyOpen=gs.some(function(g){ return g._open; })||hs.some(function(h){ return h._open&&!h._hidden&&!h._flat; }); gs.forEach(function(g){ g._open=!anyOpen; st['grp:'+g._t]=g._open?1:0; applyGrp(g); }); hs.forEach(function(h){ if(h._flat) return; h._open=!anyOpen; st[h._t]=h._open?1:0; applySec(h); }); saveSt(); },'Collapse / expand all menus');
    hg.insertBefore(allBtn,hg.firstChild);
  })();
  (function(){
    var REPO='https://github.com/RutKarin/research-catalogue-tools';
    var d=el('div','font-size:11px;color:#888;line-height:1.4;margin-top:10px;padding-top:8px;border-top:1px solid #e4e4e4;');
    function lnk(t,h){ var a=el('a','color:#111;text-decoration:underline;cursor:pointer;',t); a.href=h; a.target='_blank'; a.rel='noopener noreferrer'; return a; }
    var top=el('div',''); top.appendChild(lnk('Ritlager',REPO)); top.appendChild(document.createTextNode(' · © 2026 Rut Karin Zettergren ')); var mit=el('span','display:inline-block;border:1px solid #999;border-radius:4px;padding:0 4px;font-size:10px;line-height:14px;color:#555;vertical-align:1px;','MIT'); mit.title='MIT licence: free to use, change and share'; top.appendChild(mit); d.appendChild(top);
    var more=el('div','margin-top:4px;display:none;');
    more.appendChild(document.createTextNode('Designed by Rut Karin Zettergren. A browser tool for drawing over web pages, for creating freehand drawings and visuals that can be exported for use on any webpage or Research Catalogue page. Free to use, change and share. Your drawing is autosaved in this browser, for the page it is activated on only. When you export, the file is saved to your computer. Ritlager itself does not upload anything. Autosave can disappear if you clear your browser data, so save a project file (Save and open) to keep your work.'));
    var MANUAL=[
      ['## Shortcuts','Like Photoshop where possible. On a Mac, use Cmd instead of Ctrl.'],
      ['Tools','V select and move · H use the page (scroll and click) · D switch between draw and click · B pen · P brush · A airbrush · L line · E eraser · T text · I pipette'],
      ['Brush and colour','[ and ] thinner and thicker · 1–9 and 0 set opacity to 10–100% · X swap to the previous colour'],
      ['Zoom','Use your browser\'s zoom: Ctrl and + or −, or Cmd on a Mac. The drawing follows the page.'],
      ['Edit','Ctrl+Z undo · Ctrl+Shift+Z or Ctrl+Y redo · Ctrl+A select all · Ctrl+D deselect · Ctrl+J duplicate · Ctrl+C, X, V copy, cut, paste · Delete removes the selection, or erases everything if nothing is selected (Undo brings it back) · Esc deselects'],
      ['## Draw','Pick a tool under Drawing tools (Pen, Brush, Airbrush, Line, Eraser) and draw on the page. Set colour, thickness and look. With a pen tablet, pressure changes the line. Presets save your favourite pen settings. Press D to switch between drawing and clicking on the page.'],
      ['Colour','Click the square to choose any colour, or type a colour code. Use Pipette to pick one from the page or your drawing.'],
      ['## Text','Choose the Text tool, click where the text should go and type. Ctrl+Enter or a click elsewhere finishes, Esc cancels. Double-click a text to edit it. With text selected (Select tool), changing a setting here updates it. Typefaces come from your own computer, so a font you do not have is replaced by a similar one; exported PNGs keep the look. Use the Select tool to move, resize or rotate.'],
      ['## Edit','The tools for changing what you have already put on the page: Select, Cut out and Import images. Undo, redo and Erase all are at the top.'],
      ['Select tool','Click a stroke to select it, or drag a box around several (Pick only clicks; Lasso draws a free shape). Drag inside the box to move, a corner square to resize (Shift = stretch freely), the round handle on top to rotate (Shift = 15° steps). Layer selects the whole active layer. Esc deselects.'],
      ['Cut out','Pick Rectangle or Lasso, then draw the shape on the page. The cut applies to the active layer (pictures, drawing and text) and can be undone. To move a cut-out together with its picture later, use Layer in the Select tool.'],
      ['Import images','Press Import image…, or drop an image file onto the page or paste a copied image with Ctrl+V. The picture lands on the active layer and works like any object: move, resize and rotate with the Select tool, rub out with the Eraser, or use Cut out. Keep pictures small: under about 1500 px on the long side and under 500 KB (JPG is smaller than PNG). Large files can fill the browser storage and stop autosave, because pictures are saved in your browser together with the drawing. Export a PNG or project file for anything important.'],
      ['## Effects','Change the look of what you have drawn on the active layer.'],
      ['Dodge and burn','Paint over what you have drawn on the active layer: Dodge lightens it, Burn darkens it. It only changes drawn pixels, never the page behind. Size comes from Thickness; softness and build-up from the Airbrush sliders that appear when the tool is chosen.'],
      ['Retouch','These work on the pixels you have drawn on the active layer (not on the page behind). Size comes from Thickness. Clone: Alt+click where to copy from, then paint elsewhere; the red cross shows where it is copying from. Each stroke is kept as an edit, so Undo works and you can still change the layers below.'],
      ['Layer effects','These effects belong to the active layer and change how the whole layer looks (also in exports). Nothing is destroyed – turn them off and the layer is as before. Blur needs Chrome, Edge or Firefox.'],
      ['## Layers','Drawing and the eraser work on the highlighted layer. Blend modes mix a layer with the layers below it; they show in the combined export and over a screenshot background, but a PNG placed on a webpage cannot blend with the page itself.'],
      ['## Animate','To make an animation from your drawing: 1) Press “Build-up from my drawing”, or build frame by frame with “+ Add this frame”. 2) ▶ Preview. 3) Save GIF or video. Build-up from my drawing makes frames that show the strokes appearing one after another. Or press + Add this frame, change the drawing, press + Add this frame again, and so on. Keep every 2nd removes every other frame, which makes the animation file smaller and lighter to load; the animation then plays faster, so raise Time / frame if you want it to last as long. Use ◀ ▶ to move a frame, ⧉ to copy it and ✕ to remove it. Frames use the Background and Drawn area settings above, not the Export ones.'],
      ['## Export and save','Save: your drawing is autosaved in this browser, for this page only. To keep editing the strokes later, save a project file or a named version. Export: makes an image as PNG (can be transparent), JPG or TIFF. Choose size (1×–6×) and DPI, and the whole page or only the area around your strokes. Whole page makes the image as large as the page, so when you import it to a webpage it fits exactly (place it at the top-left). Strokes only makes a smaller file that you place yourself. Layers can be exported together or one image each. Under Background you can export your drawing on top of a screenshot of the page, or the screenshot and the drawing as two separate images. The browser asks to share the tab when you choose it. Works best in Chrome and Edge; scroll to the right place first. The size follows the page: if the page grows longer, Ritlager measures it again by itself. Files go to Downloads, or to a folder you choose in Chrome and Edge.']
    ];
    var man=el('div','margin-top:4px;display:none;');
    MANUAL.forEach(function(m){ var grp=m[0].indexOf('## ')===0; var h=el('div',grp?'font-weight:500;color:#111;font-size:13px;margin-top:14px;padding-top:6px;border-top:1px solid #e3e3e3;':'font-weight:400;color:#111;margin-top:6px;',grp?m[0].slice(3):m[0]); man.appendChild(h); man.appendChild(el('div','',m[1])); });
    var lk='color:#111;text-decoration:underline;cursor:pointer;display:inline-block;margin-top:2px;';
    var tg=el('span',lk,'More info ▸'), tm=el('span',lk+'margin-left:12px;','User manual ▸');
    function showPanel(which){
      var oi=which==='info'&&more.style.display==='none', om=which==='man'&&man.style.display==='none';
      more.style.display=oi?'block':'none'; man.style.display=om?'block':'none';
      tg.textContent=oi?'Less ▾':'More info ▸'; tm.textContent=om?'Hide manual ▾':'User manual ▸';
    }
    tg.addEventListener('click',function(){ showPanel('info'); });
    tm.addEventListener('click',function(){ showPanel('man'); });
    d.appendChild(tg); d.appendChild(tm); d.appendChild(more); d.appendChild(man); bar.appendChild(d);
  })();
  placeCanvas(); de.appendChild(bar); de.appendChild(note);
  setSize(); setDrawing(true);
  var nRest=restore();
  if(nRest){ rebuild(); }
  ready=true;
  msg(nRest ? 'Ritlager on – restored your earlier drawing ('+nRest+' strokes)' : 'Ritlager on – draw right on the page. D toggles draw/click.');
})();
