// Dependency-free 3D network: force layout in 3D, perspective projection on canvas, drag-rotate, wheel-zoom, click-select.
const NC={project:'#22d3ee',SAFE:'#34d399',NEUTRAL:'#60a5fa',SUSPICIOUS:'#fbbf24',FLAGGED:'#f87171'};
const EC={contrib:'148,163,184',vouch:'52,211,153',denounce:'248,113,113',suspicious:'251,191,36'};
export function createGraph(cv,data,o={}){
  const ctx=cv.getContext('2d'),dpr=Math.min(devicePixelRatio||1,2);let W=0,H=0;
  const N=data.nodes.map((n,i)=>{const a=Math.acos(1-2*(i+.5)/data.nodes.length),b=Math.PI*(1+Math.sqrt(5))*i;return{...n,x:Math.sin(a)*Math.cos(b)*200,y:Math.sin(a)*Math.sin(b)*200,z:Math.cos(a)*200,sx:0,sy:0,sz:0,f:1}});
  const idx=new Map(N.map(n=>[n.id,n])),E=data.edges.map(e=>({...e,a:idx.get(e.s),b:idx.get(e.t)})).filter(e=>e.a&&e.b);
  for(let it=0;it<260;it++){const cool=1-it/300;
    for(let i=0;i<N.length;i++)for(let j=i+1;j<N.length;j++){const a=N[i],b=N[j];let dx=a.x-b.x,dy=a.y-b.y,dz=a.z-b.z,d2=dx*dx+dy*dy+dz*dz+.1,f=7000/d2*cool,d=Math.sqrt(d2);a.x+=dx/d*f;a.y+=dy/d*f;a.z+=dz/d*f;b.x-=dx/d*f;b.y-=dy/d*f;b.z-=dz/d*f}
    for(const e of E){const{a,b}=e,dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,d=Math.sqrt(dx*dx+dy*dy+dz*dz)+.1,f=(d-80)*.015*cool;a.x+=dx/d*f;a.y+=dy/d*f;a.z+=dz/d*f;b.x-=dx/d*f;b.y-=dy/d*f;b.z-=dz/d*f}
    for(const n of N){n.x*=.995;n.y*=.995;n.z*=.995}}
  let yaw=0,pit=.35,zoom=1,auto=!o.static,sel=null,qry='',hide=new Set(),drag=null,raf,t0=0;
  const col=n=>n.kind==='project'?NC.project:NC[n.status],vis=n=>!hide.has(n.kind==='project'?'project':n.status);
  const resize=()=>{const r=cv.parentElement.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px'};
  const ro=new ResizeObserver(resize);ro.observe(cv.parentElement);resize();
  function frame(t){raf=requestAnimationFrame(frame);if(auto)yaw+=.0025;const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pit),sp=Math.sin(pit);
    for(const n of N){const x=n.x*cy-n.z*sy,z0=n.x*sy+n.z*cy,y=n.y*cp-z0*sp,z=n.y*sp+z0*cp;n.f=560/(560+z)*zoom*Math.min(W,H)/520;n.sx=W/2+x*n.f;n.sy=H/2+y*n.f;n.sz=z}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
    const hl=n=>!qry||n.label.includes(qry),dep=n=>Math.max(.25,Math.min(1,1-n.sz/520));
    for(const e of E){if(hide.has(e.k)||!vis(e.a)||!vis(e.b))continue;const m=hl(e.a)||hl(e.b),al=(m?.55:.07)*dep(e.a);
      ctx.beginPath();ctx.moveTo(e.a.sx,e.a.sy);ctx.lineTo(e.b.sx,e.b.sy);ctx.setLineDash(e.k==='suspicious'?[5,4]:[]);ctx.strokeStyle=`rgba(${EC[e.k]},${al})`;ctx.lineWidth=e.k==='contrib'?.8:1.6;
      if(e.k!=='contrib'&&m){ctx.shadowColor=`rgb(${EC[e.k]})`;ctx.shadowBlur=8}ctx.stroke();ctx.shadowBlur=0}
    ctx.setLineDash([]);
    for(const n of [...N].sort((a,b)=>b.sz-a.sz)){if(!vis(n))continue;const r=(n.kind==='project'?9:5.5)*n.f,m=hl(n)||n===sel,p=n.kind==='project'?1+.05*Math.sin(t/600+n.sx):1;
      ctx.globalAlpha=(m?1:.18)*dep(n);ctx.beginPath();ctx.arc(n.sx,n.sy,r*p,0,7);ctx.fillStyle=col(n);ctx.shadowColor=col(n);ctx.shadowBlur=n===sel?26:10;ctx.fill();ctx.shadowBlur=0;
      if(n===sel){ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke()}
      if(!o.static&&(n.kind==='project'||n===sel||(qry&&m))){ctx.fillStyle='#e2e8f0';ctx.font='11px ui-monospace,monospace';ctx.fillText(n.label,n.sx+r+4,n.sy+3)}ctx.globalAlpha=1}}
  const pt=e=>{const r=cv.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
  cv.addEventListener('pointerdown',e=>{cv.setPointerCapture(e.pointerId);drag={p:pt(e),m:0};auto=false});
  cv.addEventListener('pointermove',e=>{if(!drag)return;const p=pt(e);yaw+=(p[0]-drag.p[0])*.007;pit=Math.max(-1.4,Math.min(1.4,pit+(p[1]-drag.p[1])*.007));drag.m+=Math.abs(p[0]-drag.p[0])+Math.abs(p[1]-drag.p[1]);drag.p=p});
  cv.addEventListener('pointerup',e=>{if(drag&&drag.m<5){const[x,y]=pt(e);let best=null,bd=18;for(const n of N){if(!vis(n))continue;const d=Math.hypot(n.sx-x,n.sy-y);if(d<bd){bd=d;best=n}}sel=best;o.onSelect&&o.onSelect(best)}drag=null});
  cv.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.4,Math.min(3,zoom*(e.deltaY<0?1.1:.9)))},{passive:false});
  raf=requestAnimationFrame(frame);
  return{setHide:s=>{hide=s},setQuery:s=>{qry=s.toLowerCase().trim();const m=N.find(n=>qry&&n.label.includes(qry));if(m){auto=false;sel=m;o.onSelect&&o.onSelect(m)}},zoomBy:k=>{zoom=Math.max(.4,Math.min(3,zoom*k))},
    edgesOf:n=>E.filter(e=>e.a===n||e.b===n).map(e=>({k:e.k,other:(e.a===n?e.b:e.a).label})),destroy:()=>{cancelAnimationFrame(raf);ro.disconnect()}};
}
