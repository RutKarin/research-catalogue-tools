(function(){
  if(window.__ritlager){ window.__ritlager.toggle(); return; }

  var Z = 2147483000, FONT = '"Geosans Light","Avenir","Avenir Next","Nunito Sans",system-ui,sans-serif';
  var de = document.documentElement, bd = document.body;
  var W, H;
  function measure(){
    W = Math.max(de.scrollWidth, bd ? bd.scrollWidth : 0, de.clientWidth);
    H = Math.max(de.scrollHeight, bd ? bd.scrollHeight : 0, de.clientHeight);
    W = Math.min(W, 6000);
    var maxH = Math.floor(30e6 / W); H = Math.min(H, maxH, 20000);
  }
  measure();

  var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
  var base = document.createElement('canvas'), bctx = base.getContext('2d');
  cv.id = 'ritlager-canvas';
  cv.style.cssText = 'position:absolute;left:0;top:0;z-index:'+Z+';touch-action:none;cursor:crosshair;margin:0;padding:0;border:0;';
  function setSize(){
    var keep = null;
    cv.width = base.width = W; cv.height = base.height = H;
    cv.style.width = W+'px'; cv.style.height = H+'px';
    rebuild();
  }

  var ref=null, rscale=1, under=null, moveUnder=false, contrast=0, tool='pen', color='#111111', size=6, drawing=true, visible=true;
  var strokes=[], redo=[], cur=null, lastBlob=null;
  // ---- autospara: ritningen minns sidan i den här webbläsaren (localStorage) ----
  var KEY='ritlager:'+location.origin+location.pathname+location.search, ready=false, saveT=null, warned=false;
  function persist(){
    if(!ready) return; clearTimeout(saveT);
    saveT=setTimeout(function(){
      try{
        if(strokes.length||under) localStorage.setItem(KEY,JSON.stringify(pack())); else localStorage.removeItem(KEY);
      }catch(e){ if(!warned){ warned=true; msg('Kunde inte spara automatiskt (för stort eller blockerat) – spara PNG ofta'); } }
    },300);
  }
  var SKEY='ritlager-versioner:'+location.origin+location.pathname+location.search;
  function pack(withRef){
    return {v:1,t:Date.now(),c:contrast,ref:(withRef&&ref)?{src:ref.c.toDataURL('image/png'),sx:ref.sx,sy:ref.sy,w:ref.w,h:ref.h,k:ref.k}:undefined,under:under?{src:under.src,x:under.x,y:under.y}:null,strokes:strokes.map(function(s){ var o={}; for(var k in s) if(k!=='pts'&&k!=='sm') o[k]=s[k];
      o.pts=s.pts.map(function(p){ return [Math.round(p.x*10)/10,Math.round(p.y*10)/10,Math.round(p.p*100)/100]; }); return o; })};
  }
  function unpack(d){
    if(!d||!d.strokes) return -1;
    strokes=d.strokes.map(function(o){ o.pts=o.pts.map(function(p){ return {x:p[0],y:p[1],p:p[2]}; }); return o; });
    contrast=+d.c||0; ctr.value=contrast; redo=[]; under=null;
    if(d.under&&d.under.src){ var im=new Image(); im.onload=function(){ under={img:im,x:d.under.x||0,y:d.under.y||0,src:d.under.src}; rebuild(); }; im.src=d.under.src; }
    if(d.ref&&d.ref.src){ var ri=new Image(); ri.onload=function(){ var rc=document.createElement('canvas'); rc.width=ri.width; rc.height=ri.height; rc.getContext('2d').drawImage(ri,0,0); ref={c:rc,sx:d.ref.sx,sy:d.ref.sy,w:d.ref.w,h:d.ref.h,k:d.ref.k}; updateRefInfo(); }; ri.src=d.ref.src; }
    rebuild(); return strokes.length;
  }
  function getVers(){ try{ return JSON.parse(localStorage.getItem(SKEY))||{}; }catch(e){ return {}; } }
  function putVers(o){ try{ localStorage.setItem(SKEY,JSON.stringify(o)); return true; }catch(e){ msg('Kunde inte spara versionen (för stort eller blockerat) – använd Spara fil'); return false; } }
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
  function render(c,s){
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
  function rebuild(){ bctx.clearRect(0,0,W,H); if(under) bctx.drawImage(under.img,under.x,under.y); strokes.forEach(function(s){render(bctx,s);}); refresh(); persist(); }
  function refresh(){ ctx.clearRect(0,0,W,H); ctx.drawImage(base,0,0); if(cur) render(ctx,cur); }

  // ---- inmatning (dokumentkoordinater) ----
  function pos(e){
    return { x:e.pageX, y:e.pageY,
      p: e.pointerType==='pen' ? (e.pressure||0.5) : 0.8 };
  }
  var ug=null, ugRaf=0;
  cv.addEventListener('pointerdown', function(e){
    if(moveUnder && under){ ug={px:e.pageX,py:e.pageY,x:under.x,y:under.y}; cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
    if(!drawing || e.pointerType==='touch') return;
    if(e.pointerType==='mouse' && e.button!==0) return;
    cv.setPointerCapture(e.pointerId);
    var q=pos(e);
    cur={tool:(tool==='brush'?'pen':tool),color:color,size:size,soft:+soft.value,sens:+sens.value/100,ink:+ink.value/100,pressure:pr.checked, brush:tool==='brush', nib:nibSel.value, dry:+dry.value/100, hair:hair.checked, pmin:1, pmax:0, lt:e.timeStamp, lx:q.x, ly:q.y,
         arrow:ar.checked,pts:[q],sm:{x:q.x,y:q.y,p:q.p}};
    e.preventDefault(); refresh();
  });
  cv.addEventListener('pointermove', function(e){
    if(ug){ under.x=Math.round(ug.x+e.pageX-ug.px); under.y=Math.round(ug.y+e.pageY-ug.py); cancelAnimationFrame(ugRaf); ugRaf=requestAnimationFrame(rebuild); return; }
    dbg.textContent='Enhet: '+e.pointerType+' · tryck '+(e.pressure||0).toFixed(2)+(cur?(cur.usedSpeed?' · styr tjocklek med: fart':' · styr tjocklek med: pennans tryck'):'');
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
    delete cur.sm; strokes.push(cur); redo=[]; render(bctx,cur); cur=null; refresh(); persist();
  }
  function endAny(e){ if(ug){ ug=null; persist(); return; } end(e); }
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
  var hide = btn('Dölj', function(){ api.toggle(); }, 'Dölj/visa (D växlar rita/klicka)');
  var hg=row(); var quick=btn('Exportera PNG',function(){ exportPng('save'); },'Exportera ritningen som PNG (bakgrund och storlek väljer du under Exportera)'); quick.style.background='#111'; quick.style.color='#fff'; quick.style.borderColor='#111';
  hg.appendChild(quick); hg.appendChild(hide); head.appendChild(hg);
  bar.appendChild(head);

  function sec(t){ var d=el('div','font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#999;margin-top:3px;border-top:1px solid #e4e4e4;padding-top:6px;',t); bar.appendChild(d); return d; }
  function lab(r,t){ r.appendChild(el('span','font-size:12px;color:#666;',t)); }
  function slider(r,min,max,val,w){ var i=el('input','width:'+w+'px;accent-color:#111;'); i.type='range'; i.min=min; i.max=max; i.value=val; r.appendChild(i); return i; }
  function chk(r,txt,on,tip){ var l=el('label','font-size:12px;display:flex;align-items:center;gap:3px;cursor:pointer;'); var i=el('input'); i.type='checkbox'; i.checked=on; l.appendChild(i); l.appendChild(document.createTextNode(txt)); if(tip) l.title=tip; r.appendChild(l); return i; }

  var r1=row(); var bDraw=btn('Rita',function(){setDrawing(true);},'Rita på sidan (D)'), bPass=btn('Klicka',function(){setDrawing(false);},'Klicka igenom till RC (D)');
  r1.appendChild(bDraw); r1.appendChild(bPass); bar.appendChild(r1);

  sec('Verktyg');
  var r2=row();
  var bPen=btn('Penna',function(){setTool('pen');},'Penna (B)'), bBrush=btn('Pensel',function(){setTool('brush');},'Pensel (P)'),
      bLine=btn('Linje',function(){setTool('line');},'Rak linje (L)'), bEr=btn('Sudd',function(){setTool('eraser');},'Sudd (E)');
  r2.appendChild(bPen); r2.appendChild(bBrush); r2.appendChild(bLine); r2.appendChild(bEr); bar.appendChild(r2);

  sec('Färg');
  var r3=row(), sw=[];
  ['#111111','#ffffff','#d6282b','#1f5fd1','#2a9d4a','#f2c200','#e66ab3'].forEach(function(c){
    var b=el('button','width:20px;height:20px;border-radius:50%;border:1px solid #888;padding:0;cursor:pointer;margin:0;background:'+c);
    b.type='button'; b.addEventListener('click',function(){setColor(c);}); r3.appendChild(b); sw.push([b,c]);
  });
  var cp=el('input','width:26px;height:24px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;'); cp.type='color'; cp.value='#111111';
  cp.addEventListener('input',function(){setColor(cp.value);}); r3.appendChild(cp);
  bar.appendChild(r3);
  var r3b=row(); lab(r3b,'Svärta'); var ink=slider(r3b,5,100,100,100); ink.title='Hur mörk/tät färgen är. 100 = full svärta';
  bar.appendChild(r3b);
  var rC=row(); lab(rC,'Kontrast'); var ctr=slider(rC,0,100,0,110);
  ctr.title='Ritar om strecken flera gånger så ljusa och tunna streck blir mörkare. Högt = tunna streck blir helt svarta. Gäller alla dina streck, även redan ritade (inte penseln).';
  var ctrRaf=0; ctr.addEventListener('input',function(){ contrast=+ctr.value; cancelAnimationFrame(ctrRaf); ctrRaf=requestAnimationFrame(rebuild); });
  bar.appendChild(rC);

  sec('Tjocklek');
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
  var rThin=row(); lab(rThin,'Tunna streck');
  var thinSel=el('select',BTN+'padding:3px 6px;');
  [['smooth','Jämna (aldrig brutna)'],['black','Svarta hårfina']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; thinSel.appendChild(op); });
  thinSel.title='Jämna: linjen blir aldrig tunnare än 1 px, så den håller ihop. Svarta hårfina: riktigt tunna svarta streck under 1 px, men tryckvariationen syns mindre.';
  rThin.appendChild(thinSel); bar.appendChild(rThin);
  var hair={ get checked(){ return thinSel.value==='black'; } };

  var secLook=sec('Utseende');
  var rNib=row(); lab(rNib,'Pennstil');
  var nibSel=el('select',BTN+'padding:3px 6px;');
  [['round','Rund'],['square','Fyrkantig'],['flat','Platt (kalligrafi)'],['pencil','Blyerts'],['marker','Marker'],['ink','Bläck'],['water','Akvarell']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; nibSel.appendChild(op); });
  nibSel.title='Rund: mjuk rund spets. Fyrkantig: spets med hörn. Platt: kalligrafispets, tunn åt ena hållet. Blyerts: kornig, som penna på papper. Marker: genomskinlig överstrykningspenna. Bläck: mjuk bläckpenna med droppar och avsmalnande ändar. Akvarell: genomskinlig färgtvätt med mörkare kanter och pigmentkorn.';
  rNib.appendChild(nibSel); bar.appendChild(rNib);
  var rSoft=row(); lab(rSoft,'Skarp'); var soft=slider(rSoft,0,100,0,100); lab(rSoft,'Suddig'); bar.appendChild(rSoft);
  var rDry=row(); lab(rDry,'Penselns torrhet'); var dry=slider(rDry,0,100,30,90); bar.appendChild(rDry);
  var rArrow=row(); var ar=chk(rArrow,'Pilspets på linjer',false,'Lägger en pilspets i slutet av raka linjer du drar med Linje-verktyget.'); bar.appendChild(rArrow);

  var secPress=sec('Tryck och stabilitet');
  var rPr=row(); var pr=chk(rPr,'Tryckkänslig',true); bar.appendChild(rPr);
  var rSens=row(); lab(rSens,'Känslighet'); var sens=slider(rSens,0,150,100,110); sens.title='100 = normalläge (mycket tryckkänslig). Högre = ännu mer, lägre = mindre'; bar.appendChild(rSens);
  var rPm=row(); lab(rPm,'Tryck från');
  var pm=el('select',BTN+'padding:3px 6px;');
  [['auto','Auto'],['pen','Pennans tryck'],['speed','Fart (snabbt = tunt)']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; pm.appendChild(op); });
  rPm.appendChild(pm); bar.appendChild(rPm);
  var rSm=row(); lab(rSm,'Stabilisera'); var sm=slider(rSm,0,90,35,100); sm.title='Jämnar ut darriga streck'; bar.appendChild(rSm);

  sec('Ångra och yta');
  var r7=row();
  r7.appendChild(btn('↶',function(){ if(strokes.length){redo.push(strokes.pop()); rebuild();} },'Ångra (Ctrl+Z)'));
  r7.appendChild(btn('↷',function(){ if(redo.length){strokes.push(redo.pop()); rebuild();} },'Gör om'));
  r7.appendChild(btn('Rensa',function(){ if(strokes.length){redo=strokes.slice().reverse(); strokes=[]; rebuild(); msg('Rensat – ↶ ångrar');} }));
  r7.appendChild(btn('Mät om',function(){ measure(); setSize(); msg('Ytan är nu '+W+' × '+H+' px'); },'Anpassa ritytan om sidan blivit längre'));
  bar.appendChild(r7);

  sec('Exportera (bild till RC)');
  var rSz=row(); lab(rSz,'Bildstorlek');
  var csel=el('select',BTN+'padding:3px 6px;');
  [['full','Hela sidan'],['crop','Bara strecken']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; csel.appendChild(op); });
  rSz.appendChild(csel); bar.appendChild(rSz);
  var cr={ get checked(){ return csel.value==='crop'; } };
  var szHint=el('div','font-size:11px;color:#777;line-height:1.35;');
  function hint(){ szHint.textContent = csel.value==='crop' ? 'Bara strecken: bilden klipps till området runt dina streck. Mindre fil, men du måste placera den själv i RC.' : 'Hela sidan: bilden är lika stor som sidan. Lägg den i sidans övre vänstra hörn i RC så passar strecken exakt.'; }
  csel.addEventListener('change',hint); hint(); bar.appendChild(szHint);
  var rBg=row(); lab(rBg,'Bakgrund');
  var bgSel=el('select',BTN+'padding:3px 6px;');
  [['none','Genomskinlig'],['white','Vit'],['color','Egen färg'],['shot','Skärmbild (referens)']].forEach(function(o){ var op=el('option',null,o[1]); op.value=o[0]; bgSel.appendChild(op); });
  var bgCol=el('input','width:26px;height:24px;padding:0;border:1px solid #c9c9c9;border-radius:6px;background:none;cursor:pointer;display:none;'); bgCol.type='color'; bgCol.value='#f4efe6';
  bgSel.addEventListener('change',function(){ bgCol.style.display = bgSel.value==='color' ? 'inline-block' : 'none'; });
  rBg.appendChild(bgSel); rBg.appendChild(bgCol); bar.appendChild(rBg);
  var rRef=row();
  rRef.appendChild(btn('Fånga skärmbild',function(){ captureRef(); },'Tar en skärmbild av sidan som den ser ut just nu (utan verktygsrutan och ritlagret). Webbläsaren frågar om du vill dela fliken.'));
  rRef.appendChild(btn('Spara referensbild',function(){ if(!ref){ msg('Fånga en skärmbild först'); return; } ref.c.toBlob(function(bl){ if(!bl){ msg('Kunde inte skapa bilden'); return; } saveBlob(bl,fname('referensbild-'+ref.c.width+'x'+ref.c.height,'.png','-referens'),'Referensbilden är sparad.'); },'image/png'); },'Sparar skärmbilden för sig, utan dina streck'));
  bar.appendChild(rRef);
  var refInfoEl=el('div','font-size:11px;color:#777;line-height:1.35;'); bar.appendChild(refInfoEl);
  function updateRefInfo(){ refInfoEl.textContent = ref ? 'Referensbild: '+ref.c.width+' × '+ref.c.height+' px (sidan vid scroll '+Math.round(ref.sx)+', '+Math.round(ref.sy)+'). Välj Bakgrund: Skärmbild för att exportera ritningen ovanpå den. Då gäller bildens område, inte Bildstorlek.' : 'Ingen referensbild. Fånga en skärmbild för att kunna exportera ritningen ovanpå sidan. Fungerar bäst i Chrome/Edge. Scrolla till rätt ställe först.'; }
  updateRefInfo();
  function captureRef(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.getDisplayMedia){ msg('Din webbläsare kan inte fånga skärmen här'); return; }
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
          if(!fw||Math.abs(kx/ky-1)>0.03){ msg('Skärmbilden verkar innehålla webbläsarens ram. Välj fliken, inte hela fönstret.'); return; }
          ref={c:c,sx:window.scrollX,sy:window.scrollY,w:iw,h:ih,k:kx}; updateRefInfo(); bgSel.value='shot'; bgCol.style.display='none';
          msg('Referensbild fångad ('+fw+' × '+fh+' px). Bakgrund är nu satt till Skärmbild.');
        },350);
      }); };
    }).catch(function(){ msg('Skärmfångst avbröts eller nekades'); });
  }
  function bgValue(){ return bgSel.value==='white' ? '#ffffff' : bgSel.value==='color' ? bgCol.value : null; }
  var rFn=row(); lab(rFn,'Filnamn'); var fileNameEl=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:4px 8px;flex:1;min-width:0;box-sizing:border-box;'); fileNameEl.type='text'; fileNameEl.placeholder='valfritt, t.ex. figur-1'; fileNameEl.title='Gäller exporterad PNG, referensbild och projektfil'; rFn.appendChild(fileNameEl); bar.appendChild(rFn);
  var rDir=row(); var dirInfo=el('div','font-size:11.5px;color:#444;line-height:1.35;flex:1;min-width:120px;');
  function updateDirInfo(){ dirInfo.textContent = window.showDirectoryPicker ? (dirH ? 'Sparar i mappen: '+dirH.name : 'Ingen mapp vald: filerna sparas i Hämtade filer (Downloads).') : 'Din webbläsare låter inte sidor välja mapp. Använd Chrome eller Edge, annars hamnar filerna i Hämtade filer.'; }
  rDir.appendChild(dirInfo);
  if(window.showDirectoryPicker){
    rDir.appendChild(btn('Välj mapp…',function(){
      window.showDirectoryPicker({mode:'readwrite'}).then(function(h){ dirH=h; idbSet('dir',h); updateDirInfo(); msg('Sparar nu i mappen "'+h.name+'". Samma namn skrivs aldrig över, de får -2, -3 osv.',5000); })
        .catch(function(e){ if(e&&e.name!=='AbortError') msg('Mappen kunde inte väljas här ('+(e.message||e)+'). Skapa en egen undermapp och välj den. Chrome tillåter inte t.ex. Hämtade filer eller hemmappen.',7000); });
    },'Välj en mapp på din dator. Chrome tillåter inte vissa mappar (Hämtade filer, hemmappen); skapa en egen undermapp, t.ex. Ritlager.'));
    rDir.appendChild(btn('Glöm',function(){ dirH=null; idbSet('dir',null); updateDirInfo(); msg('Mappen glömd'); }));
  }
  bar.appendChild(rDir);
  var rAsk=row(); var askEl=chk(rAsk,'Fråga var varje fil ska sparas',false,'Visar en spara-ruta varje gång (Chrome/Edge) i stället för att spara direkt i vald mapp eller Hämtade filer.'); bar.appendChild(rAsk);
  updateDirInfo();
  idbGet('dir',function(h){ if(h&&h.kind==='directory'){ dirH=h; updateDirInfo(); } });
  var r8=row();
  var bSave=btn('Exportera PNG',function(){ exportPng('save'); },'Bilden till RC: PNG med den bakgrund och storlek du valt'); bSave.style.background='#111'; bSave.style.color='#fff'; bSave.style.borderColor='#111';
  r8.appendChild(bSave);
  r8.appendChild(btn('Kopiera bild',function(){ exportPng('copy'); }));
  r8.appendChild(btn('Visa bild',function(){ showDialog(lastBlob,lastName); },'Visar senaste exporten med en egen nedladdningslänk, om nedladdningen inte fungerar'));
  bar.appendChild(r8);

  sec('Underlag (gammal PNG)');
  var rU=row();
  var uf=el('input'); uf.type='file'; uf.accept='image/*'; uf.style.display='none';
  uf.addEventListener('change',function(){ var f=uf.files[0]; if(!f) return; var r=new FileReader();
    r.onload=function(){ var im=new Image(); im.onload=function(){ backupCurrent(); under={img:im,x:0,y:0,src:r.result}; rebuild(); msg('Underlag inlagt ('+im.width+' × '+im.height+' px) i sidans övre vänstra hörn. Flytta det vid behov.'); }; im.onerror=function(){ msg('Kunde inte läsa bilden'); }; im.src=r.result; };
    r.readAsDataURL(f); uf.value=''; });
  rU.appendChild(uf);
  rU.appendChild(btn('Öppna PNG…',function(){ uf.click(); },'Läs in en gammal bild och rita vidare ovanpå den. Bilden blir fast bakgrund, och ingår när du sparar PNG.'));
  var bMove=btn('Flytta',function(){ if(!under){ msg('Öppna en PNG först'); return; } moveUnder=!moveUnder; mark(bMove,moveUnder); cv.style.cursor=moveUnder?'move':'crosshair'; msg(moveUnder?'Dra på sidan för att flytta underlaget':'Flytta av'); },'Dra underlaget med pennan för att placera det');
  rU.appendChild(bMove);
  rU.appendChild(btn('Ta bort',function(){ if(!under) return; backupCurrent(); under=null; moveUnder=false; mark(bMove,false); cv.style.cursor='crosshair'; rebuild(); msg('Underlaget borttaget'); }));
  bar.appendChild(rU);

  sec('Spara och öppna (redigerbart)');
  var rV1=row(); var verSel=el('select',BTN+'padding:3px 6px;max-width:150px;'); rV1.appendChild(verSel);
  function fillVers(sel){
    var v=getVers(), names=Object.keys(v); verSel.innerHTML='';
    var o0=el('option',null,names.length?'– välj version –':'(inga sparade versioner)'); o0.value=''; verSel.appendChild(o0);
    names.forEach(function(n){ var o=el('option',null,n+' ('+v[n].strokes.length+' streck)'); o.value=n; verSel.appendChild(o); });
    if(sel&&v[sel]) verSel.value=sel;
  }
  function backupCurrent(){ if(!strokes.length&&!under) return; var v=getVers(); v['Förra (auto)']=pack(); putVers(v); }
  rV1.appendChild(btn('Öppna',function(){
    var n=verSel.value; if(!n){ msg('Välj en version först'); return; }
    var v=getVers(); if(!v[n]) return; backupCurrent(); unpack(JSON.parse(JSON.stringify(v[n]))); fillVers(n); msg('Öppnade "'+n+'" (din förra ritning finns som "Förra (auto)")');
  },'Ersätter det du ritat nu. Det du hade sparas först som "Förra (auto)".'));
  bar.appendChild(rV1);
  var rVn=row(); var verName=el('input','font:inherit;font-size:12.5px;border:1px solid #c9c9c9;border-radius:6px;padding:4px 8px;width:100%;box-sizing:border-box;'); verName.type='text'; verName.placeholder='Namn på ny version, t.ex. Variant A'; rVn.appendChild(verName); bar.appendChild(rVn);
  rVn.appendChild(el('div','font-size:11px;color:#777;line-height:1.35;width:100%;','Skriv ett namn och tryck Spara som ny. Versionerna sparas i den här webbläsaren, för den här sidan, och syns i listan nedan. Vill du ha en fil på en plats du väljer själv: Spara projektfil.'));
  var rV2=row();
  rV2.appendChild(btn('Spara som ny',function(){
    var v=getVers(), n=(verName.value||'').trim().slice(0,40) || 'Version '+(Object.keys(v).length+1);
    var over=!!v[n]; v[n]=pack(); if(putVers(v)){ fillVers(n); verName.value=''; msg((over?'Skrev över "':'Sparade "')+n+'"'); }
  },'Sparar det du ritat nu som en egen version med namnet du skrivit ovan'));
  rV2.appendChild(btn('Uppdatera',function(){ var n=verSel.value; if(!n){ msg('Välj vilken version som ska uppdateras'); return; } var v=getVers(); v[n]=pack(); if(putVers(v)){ fillVers(n); msg('Uppdaterade "'+n+'"'); } },'Skriver över den valda versionen med det du ritat nu'));
  rV2.appendChild(btn('Ny tom',function(){ backupCurrent(); strokes=[]; redo=[]; rebuild(); fillVers(); msg('Tom duk (din förra ritning finns som "Förra (auto)")'); }));
  rV2.appendChild(btn('Ta bort',function(){ var n=verSel.value; if(!n) return; var v=getVers(); v['Borttagen (auto)']=v[n]; delete v[n]; putVers(v); fillVers(); msg('Tog bort "'+n+'"'); }));
  bar.appendChild(rV2);
  var rV3=row();
  rV3.appendChild(btn('Spara projektfil',function(){
    var bl=new Blob([JSON.stringify(pack(true))],{type:'application/json'});
    saveBlob(bl,fname('ritlager-projekt','.json'),'Projektfilen är redigerbar och kan öppnas igen, även på en annan dator.');
  },'Hela ritningen som en redigerbar fil (.json)'));
  var pf=el('input'); pf.type='file'; pf.accept='.json,application/json'; pf.style.display='none';
  pf.addEventListener('change',function(){ var f=pf.files[0]; if(!f) return; var r=new FileReader(); r.onload=function(){ try{ backupCurrent(); var n=unpack(JSON.parse(r.result)); msg(n<0?'Filen ser inte ut som en Ritlager-fil':'Öppnade projektfilen ('+n+' streck)'); }catch(e){ msg('Kunde inte läsa filen'); } }; r.readAsText(f); pf.value=''; });
  rV3.appendChild(pf); rV3.appendChild(btn('Öppna projektfil',function(){ pf.click(); },'Öppna en projektfil du sparat tidigare'));
  bar.appendChild(rV3);
  fillVers();

  var dbg=el('div','font-size:11px;color:#888;','Enhet: –'); bar.appendChild(dbg);
  var info=el('div','font-size:11px;color:#777;line-height:1.35;','Ritningen autosparas för den här sidan i webbläsaren. Exportera PNG ger bilden till RC. Spara projektfil eller version om du vill kunna redigera strecken senare.');
  bar.appendChild(info);

  var note=el('div','position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:'+(Z+2)+';background:#111;color:#fff;padding:7px 13px;border-radius:8px;font:300 13px '+FONT+';opacity:0;transition:opacity .25s;pointer-events:none;');
  function msg(t,ms){ note.textContent=t; note.style.opacity=1; clearTimeout(msg.t); msg.t=setTimeout(function(){note.style.opacity=0;},ms||2400); }

  var lastDraw='pen';
  function show(e,on){ e.style.display = on?'flex':'none'; }
  function setTool(t){
    tool=t; if(t!=='eraser') lastDraw=t;
    mark(bPen,t==='pen'); mark(bBrush,t==='brush'); mark(bLine,t==='line'); mark(bEr,t==='eraser');
    show(rNib, t==='pen'); show(rSoft, t==='pen'||t==='eraser'); show(rDry, t==='brush'); show(rArrow, t==='line');
    var pressOK = t!=='line'; secPress.style.display=pressOK?'block':'none'; show(rPr,pressOK); show(rSens,pressOK); show(rPm,pressOK);
  }
  function setColor(c){ color=c; if(c.length===7) cp.value=c; sw.forEach(function(s){ s[0].style.outline = s[1]===c ? '2px solid #111' : 'none'; s[0].style.outlineOffset='2px'; }); if(tool==='eraser') setTool(lastDraw); }
  function setDrawing(d){ drawing=d; cv.style.pointerEvents = d?'auto':'none'; mark(bDraw,d); mark(bPass,!d); msg(d?'Ritläge':'Klickläge – du kan klicka i RC'); }
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
    if(!bl){ msg('Ingen bild att visa än – tryck Exportera PNG först'); return; }
    var url=URL.createObjectURL(bl), ov=el('div','position:fixed;inset:0;z-index:'+(Z+5)+';background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:24px;');
    var box=el('div','background:#fff;color:#111;border-radius:12px;padding:14px;max-width:92vw;max-height:92vh;display:flex;flex-direction:column;gap:10px;font:300 14px/1.4 '+FONT+';overflow:auto;');
    box.appendChild(el('div','font-weight:400;',name));
    if(/^image\//.test(bl.type)){ var im=el('img','max-width:80vw;max-height:55vh;object-fit:contain;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px;'); im.src=url; box.appendChild(im); }
    var a=el('a','color:#000;font-weight:400;','Ladda ner '+name); a.href=url; a.download=name; box.appendChild(a);
    box.appendChild(el('div','font-size:12px;color:#666;','Fungerar inte nedladdningen? Högerklicka på bilden (eller håll in) och välj Spara bild.'));
    var cl=btn('Stäng',function(){ ov.remove(); }); box.appendChild(cl); ov.appendChild(box); ov.addEventListener('click',function(e){ if(e.target===ov) ov.remove(); });
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
        msg('Sparad som "'+name+'" i webbläsarens nedladdningsmapp (Hämtade filer / Downloads). '+okMsg+' Hittar du den inte: tryck Visa bild.',7000);
        if(!saveBlob.shown){ saveBlob.shown=true; showDialog(bl,name); }
      }catch(e){ msg('Nedladdningen blockerades – visar filen så du kan spara den för hand',6000); showDialog(bl,name); }
    }
    function viaPicker(){
      if(!window.showSaveFilePicker){ viaDownload(); return; }
      var ext=(name.match(/\.[a-z0-9]+$/i)||['.bin'])[0], acc={}; acc[bl.type||'application/octet-stream']=[ext];
      var opt={suggestedName:name,types:[{description:ext.slice(1).toUpperCase()+'-fil',accept:acc}]}; if(dirH) opt.startIn=dirH;
      window.showSaveFilePicker(opt)
        .then(function(h){ return h.createWritable().then(function(w){ return w.write(bl).then(function(){ return w.close(); }); }).then(function(){ msg('Sparad som "'+h.name+'" på den plats du valde. '+okMsg,6000); }); })
        .catch(function(e){ if(e&&e.name==='AbortError') msg('Sparandet avbröts'); else viaDownload(); });
    }
    if(dirH){
      var perm = dirH.queryPermission ? dirH.queryPermission({mode:'readwrite'}) : Promise.resolve('granted');
      perm.then(function(p){ return p==='granted' ? p : dirH.requestPermission({mode:'readwrite'}); })
        .then(function(p){ if(p!=='granted') throw new Error('behörighet nekades'); return uniqueName(dirH,name); })
        .then(function(nm){ return dirH.getFileHandle(nm,{create:true}).then(function(fh){ return fh.createWritable(); }).then(function(w){ return w.write(bl).then(function(){ return w.close(); }); }).then(function(){ msg('Sparad i mappen "'+dirH.name+'" som "'+nm+'". '+okMsg,6000); }); })
        .catch(function(e){ msg('Kunde inte spara i den valda mappen ('+(e&&e.message?e.message:e)+'). Sparar i Hämtade filer i stället.',5000); viaDownload(); });
      return;
    }
    if(window.showSaveFilePicker && askEl.checked) viaPicker(); else viaDownload();
  }
  function exportPng(mode){
    try{ exportPng2(mode); }catch(e){ msg('Export misslyckades: '+(e&&e.message?e.message:e)+'. Prova Bildstorlek: Bara strecken.'); }
  }
  function exportPng2(mode){
    var b, out, oc;
    if(bgSel.value==='shot'){
      if(!ref){ msg('Fånga en skärmbild först (Fånga skärmbild)'); return; }
      out=document.createElement('canvas'); out.width=ref.c.width; out.height=ref.c.height; oc=out.getContext('2d');
      oc.drawImage(ref.c,0,0);
      oc.save(); oc.scale(ref.k,ref.k); oc.translate(-ref.sx,-ref.sy); rscale=ref.k;
      if(under) oc.drawImage(under.img,under.x,under.y);
      strokes.forEach(function(st){ render(oc,st); }); rscale=1; oc.restore();
      b={x:ref.sx,y:ref.sy,w:out.width,h:out.height};
    } else {
      if(!strokes.length&&!under){ msg('Rita något först'); return; }
      b={x:0,y:0,w:W,h:H};
      if(cr.checked){ var t=bounds(); if(t){ var pad=8,x=Math.max(0,t.x-pad),y=Math.max(0,t.y-pad); b={x:x,y:y,w:Math.min(W,t.x+t.w+pad)-x,h:Math.min(H,t.y+t.h+pad)-y}; } }
      out=document.createElement('canvas'); out.width=b.w; out.height=b.h;
      oc=out.getContext('2d'); var bgv=bgValue(); if(bgv){ oc.fillStyle=bgv; oc.fillRect(0,0,b.w,b.h); }
      oc.drawImage(base,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
    }
    out.toBlob(function(bl){
      if(!bl){ msg('Bilden blev för stor för webbläsaren. Välj Bildstorlek: Bara strecken.'); return; }
      lastBlob=bl; lastName=fname('ritlager-'+b.w+'x'+b.h,'.png');
      if(mode==='copy'){
        try{ navigator.clipboard.write([new ClipboardItem({'image/png':bl})]).then(function(){msg('Bilden kopierad');},function(){msg('Kopiering nekades – använd Exportera PNG');}); }
        catch(e){ msg('Kopiering stöds inte här – använd Exportera PNG'); }
      } else {
        saveBlob(bl,lastName,'('+b.w+' × '+b.h+' px'+(bgSel.value==='shot'?', med skärmbild':bgValue()?'':', genomskinlig')+')');
      }
    },'image/png');
  }

  // ---- tangenter ----
  function typing(t){ return t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT'||t.isContentEditable); }
  function onKey(e){
    if(!visible || typing(e.target)) return;
    var k=e.key.toLowerCase();
    if((e.ctrlKey||e.metaKey)&&k==='z' && drawing){ e.preventDefault(); if(e.shiftKey){ if(redo.length){strokes.push(redo.pop()); rebuild();} } else if(strokes.length){ redo.push(strokes.pop()); rebuild(); } return; }
    if(e.ctrlKey||e.metaKey||e.altKey) return;
    if(k==='d') setDrawing(!drawing);
    else if(drawing){
      if(k==='b') setTool('pen'); else if(k==='p') setTool('brush'); else if(k==='l') setTool('line'); else if(k==='e') setTool('eraser');
      else if(k==='['){ setSize2(size*0.8); }
      else if(k===']'){ setSize2(size*1.25); }
    }
  }
  document.addEventListener('keydown', onKey, true);

  var api={
    toggle:function(){ visible=!visible; cv.style.display=bar.style.display=visible?(bar.style.display==='none'?'flex':''):'none'; cv.style.display=visible?'block':'none'; bar.style.display=visible?'flex':'none'; if(visible) msg('Ritlager på'); },
    destroy:function(){ document.removeEventListener('keydown',onKey,true); cv.remove(); bar.remove(); note.remove(); delete window.__ritlager; }
  };
  window.__ritlager=api;

  de.appendChild(cv); de.appendChild(bar); de.appendChild(note);
  setSize(); setDrawing(true);
  var nRest=restore();
  if(nRest){ rebuild(); }
  ready=true;
  msg(nRest ? 'Ritlager på – återställde din tidigare ritning ('+nRest+' streck)' : 'Ritlager på – rita direkt på sidan. D växlar rita/klicka.');
})();
