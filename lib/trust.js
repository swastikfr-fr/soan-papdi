import {projects,users,links,flags} from './data.js';
const STOP=new Set(['chore','deps','to','update','bump','dependency','fix','the','a']);
const tok=t=>new Set(t.toLowerCase().replace(/[^a-z0-9. ]/g,' ').split(/\s+/).filter(w=>w&&!STOP.has(w)));
const jac=(a,b)=>{let i=0;for(const x of a)if(b.has(x))i++;return i/(a.size+b.size-i||1)};
const r1=n=>Math.round(n*10)/10;

export function detectCampaigns(){
  const recent=users.flatMap(x=>x.prs.filter(p=>p.h<=168).map(p=>({...p,u:x.login,k:tok(p.t)}))).filter(p=>p.k.size);
  const cl=[];
  for(const p of recent){const c=cl.find(c=>jac(c.k,p.k)>=.6&&Math.max(...c.prs.map(q=>Math.abs(q.h-p.h)))<=72);c?c.prs.push(p):cl.push({k:p.k,prs:[p]})}
  return cl.map(c=>({...c,A:[...new Set(c.prs.map(p=>p.u))],P:[...new Set(c.prs.map(p=>p.p))]}))
   .filter(c=>c.A.length>=3&&c.P.length>=2).map((c,i)=>{
    const hs=c.prs.map(p=>p.h),win=Math.round((Math.max(...hs)-Math.min(...hs))*60);
    const ages=c.A.map(a=>users.find(x=>x.login===a).ageDays).sort((a,b)=>a-b);
    const young=ages.filter(a=>a-ages[0]<=3).length;
    return{id:'C-'+(i+1),title:'Coordinated dependency-swap wave ('+[...c.k].slice(0,3).join(' ')+')',accounts:c.A,projects:c.P,
      prs:c.prs.map(p=>({login:p.u,project:p.p,title:p.t,hoursAgo:r1(p.h)})),windowMinutes:win,
      risk:c.A.length>=4&&c.P.length>=3?'HIGH':'MEDIUM',
      evidence:[`${c.prs.length} near-identical PRs (title similarity ≥ 60%) across ${c.P.length} projects`,
       `All opened within ${win} minutes of each other`,`${young} of ${c.A.length} accounts were created within 3 days of each other`,
       `${c.A.length} accounts with no shared prior history pushing the same change`]}});
}

export function evaluate(x,camps){
  const pos=[],neg=[],neu=[],cats=new Set(),susp=[];
  const add=(a,text,w,cat)=>{a.push({text,w:r1(w)});if(cat)cats.add(cat)};
  const merged=x.prs.filter(p=>p.s==='merged'),vp=[...new Set(x.vouches.map(v=>v[0]))],mp=[...new Set(merged.map(p=>p.p))];
  const isNew=x.ageDays<30&&merged.length<3;
  if(vp.length)add(pos,`${vp.length} independent project(s) vouch for this contributor (${vp.join(', ')})`,Math.min(vp.length*1.5,6));
  if(merged.length>=5)add(pos,`${merged.length} merged contributions`,Math.min(merged.length/10,3));
  if(mp.length>=3)add(pos,`Merged work accepted in ${mp.length} different projects`,1.5);
  if(x.ageDays>365)add(pos,`Established account (${Math.round(x.ageDays/365*10)/10} years of history)`,1);
  for(const d of x.den){add(neg,`Denouncement from ${d[0]}: ${d[1]} (credibility ${Math.round(d[2]*100)}%)`,2*d[2],d[2]>=.6?'denouncement':null);if(d[2]<.6)susp.push('Low-credibility denouncement from '+d[0]+' — weighed lightly')}
  const c=camps.find(c=>c.accounts.includes(x.login));
  if(c){add(neg,`Member of campaign ${c.id}: ${c.prs.filter(p=>p.login===x.login).length} near-identical PRs across ${c.projects.length} projects`,4,'campaign');susp.push(`Timing match: PRs opened inside a ${c.windowMinutes}-minute window with ${c.accounts.length-1} other account(s)`)}
  const b=x.prs.filter(p=>p.h<=48);
  if(b.length>=8&&new Set(b.map(p=>p.p)).size>=3){add(neg,`Unusual burst: ${b.length} PRs in 48h across ${new Set(b.map(p=>p.p)).size} projects (differs from past pace)`,2,'burst');susp.push('Sudden activity spike versus historical contribution rate')}
  const cl=x.prs.filter(p=>p.s==='closed').length;
  if(x.prs.length>=4&&cl/x.prs.length>=.6)add(neg,`${cl} of ${x.prs.length} PRs were closed without merge`,1.5,'rejections');
  if(isNew)add(neu,`New account (${x.ageDays} days, ${merged.length} merged PRs): no history is not negative history`,0);
  if(!vp.length)add(neu,'No vouches yet — absence of vouches is not a negative signal',0);
  if(!neg.length)add(neu,'No negative evidence found',0);
  const P=pos.reduce((a,e)=>a+e.w,0),N=neg.reduce((a,e)=>a+e.w,0);
  let status,why;
  if(N>=6&&cats.size>=2){status='FLAGGED';why=`Negative weight ${r1(N)} from ${cats.size} independent evidence types (${[...cats].join(', ')}). One signal alone could never flag.`}
  else if(N>=2.5){status='SUSPICIOUS';why=`Negative weight ${r1(N)} against positive ${r1(P)}. Unusual behaviour needs human review — suspicious is not guilty.`}
  else if(isNew&&!neg.length){status='NEUTRAL';why='New contributor with no negative evidence: neutral, normal review applies.'}
  else if(P>=5&&N<2.5){status='SAFE';why=`Positive weight ${r1(P)} from independent signals, negative weight ${r1(N)}.`}
  else{status='NEUTRAL';why='Not enough evidence either way. Normal review applies.'}
  const confidence=status==='NEUTRAL'&&isNew?40:Math.round(Math.min(.97,.35+.08*(pos.length+neg.length)+.05*(vp.length+x.den.length))*100);
  return{status,label:{SAFE:'SAFE',SUSPICIOUS:'SUSPICIOUS',FLAGGED:'FLAGGED',NEUTRAL:isNew?'NEW / NEUTRAL':'NEUTRAL'}[status],why,confidence,
    positive:pos,negative:neg,neutral:neu,suspicious:susp,isNew,campaign:c?.id||null,score:{pos:r1(P),neg:r1(N)}};
}

export function world(){const camps=detectCampaigns();return{camps,ev:new Map(users.map(x=>{let e=evaluate(x,camps);const f=flags.get(x.login);
  if(f){const st=f.status||'FLAGGED';
    if(st==='SAFE')e={...e,status:'SAFE',label:'SAFE',manual:true,campaign:null,confidence:100,why:`Manually cleared by an admin: ${f.reason}. Automated evidence on its own: ${e.why}`,positive:[{text:'Manual admin clearance: '+f.reason,w:0},...e.positive],negative:[],suspicious:[]};
    else e={...e,status:st,label:st,manual:true,why:`Manually ${st==='FLAGGED'?'flagged':'marked suspicious'} by an admin: ${f.reason}. Automated evidence on its own: ${e.why}`,negative:[{text:(st==='FLAGGED'?'Manual admin flag: ':'Manual admin suspicion mark: ')+f.reason,w:0},...e.negative]}}
  return[x.login,e]}))}}
export function profile(login,w){
  const x=users.find(u=>u.login===login.toLowerCase());
  if(!x)return{login,found:false,status:'NEUTRAL',label:'NO DATA',confidence:0,why:'This account has no activity in the GitTrust network. No history is not negative history — treat as a normal newcomer.',positive:[],negative:[],neutral:[{text:'Unknown to the network: nothing positive or negative recorded',w:0}],suspicious:[],vouches:[],denouncements:[],projects:[],prs:[],timeline:[],connections:[],newUserVouches:0,isNew:true};
  const e=w.ev.get(x.login),pm={};
  for(const p of x.prs){const o=pm[p.p]||(pm[p.p]={id:p.p,merged:0,total:0});o.total++;if(p.s==='merged')o.merged++}
  const conn=users.filter(o=>o!==x).map(o=>{const sh=[...new Set(o.prs.map(p=>p.p))].filter(p=>pm[p]),same=e.campaign&&w.ev.get(o.login).campaign===e.campaign;return{login:o.login,status:w.ev.get(o.login).status,via:same?'campaign co-member':sh.length?'shared projects: '+sh.join(', '):null,rank:same?9:sh.length}}).filter(o=>o.via).sort((a,b)=>b.rank-a.rank).slice(0,8);
  const tl=[...x.prs.map(p=>({h:p.h,kind:p.s==='merged'?'pos':p.s==='closed'?'neg':'neu',text:`PR ${p.s} in ${p.p}: ${p.t}`})),...x.vouches.map((v,i)=>({h:24*(30+i*40),kind:'pos',text:`Vouched by ${v[0]}: ${v[1]}`})),...x.den.map((d,i)=>({h:24*(3+i*5),kind:'neg',text:`Denounced by ${d[0]}: ${d[1]}`}))].sort((a,b)=>a.h-b.h).slice(0,40);
  return{login:x.login,found:true,ageDays:x.ageDays,...e,newUserVouches:e.isNew?x.vouches.length:0,vouches:x.vouches.map(v=>({project:v[0],note:v[1]})),denouncements:x.den.map(d=>({project:d[0],reason:d[1],credibility:d[2]})),
    projects:Object.values(pm),prs:[...x.prs].sort((a,b)=>a.h-b.h).slice(0,25).map(p=>({project:p.p,title:p.t,status:p.s,daysAgo:r1(p.h/24)})),timeline:tl.map(t=>({daysAgo:r1(t.h/24),kind:t.kind,text:t.text})),connections:conn};
}
export function stats(w){
  const c={SAFE:0,SUSPICIOUS:0,FLAGGED:0,NEUTRAL:0};w.ev.forEach(e=>c[e.status]++);
  const alerts=[...w.camps.map(k=>({level:'bad',text:`Campaign ${k.id}: ${k.accounts.length} accounts hit ${k.projects.length} projects`})),
    ...users.filter(x=>['SUSPICIOUS','FLAGGED'].includes(w.ev.get(x.login).status)).map(x=>({level:w.ev.get(x.login).status==='FLAGGED'?'bad':'warn',text:`${x.login} is ${w.ev.get(x.login).status}`}))];
  return{projects:projects.length,contributors:users.length,...c,newContributors:[...w.ev.values()].filter(e=>e.isNew).length,campaigns:w.camps.length,alerts:alerts.slice(0,8)};
}
export function network(w){
  const nodes=[...projects.map(p=>({id:'p:'+p.id,label:p.id,kind:'project'})),...users.map(x=>({id:'u:'+x.login,label:x.login,kind:'user',status:w.ev.get(x.login).status}))],edges=[];
  for(const x of users){for(const p of new Set(x.prs.map(p=>p.p)))edges.push({s:'u:'+x.login,t:'p:'+p,k:'contrib'});
    for(const v of x.vouches)edges.push({s:'u:'+x.login,t:'p:'+v[0],k:'vouch'});for(const d of x.den)edges.push({s:'u:'+x.login,t:'p:'+d[0],k:'denounce'})}
  const cleared=l=>w.ev.get(l)?.manual&&w.ev.get(l).status==='SAFE'; // admin-cleared people get no suspicious links
  for(const c of w.camps)c.accounts.forEach((a,i)=>c.accounts.slice(i+1).forEach(b=>{if(!cleared(a)&&!cleared(b))edges.push({s:'u:'+a,t:'u:'+b,k:'suspicious'})}));
  const have=new Set(users.map(x=>x.login));
  for(const l of links)if(have.has(l.a)&&have.has(l.b))edges.push({s:'u:'+l.a,t:'u:'+l.b,k:l.kind});
  return{nodes,edges};
}
export function projectInfo(w){
  return projects.map(p=>{const cs=users.filter(x=>x.prs.some(q=>q.p===p.id)||x.vouches.some(v=>v[0]===p.id)||x.den.some(d=>d[0]===p.id));
    const st=x=>w.ev.get(x.login).status;
    return{...p,contributors:cs.map(x=>({login:x.login,status:st(x)})),vouches:users.flatMap(x=>x.vouches.filter(v=>v[0]===p.id).map(v=>({login:x.login,note:v[1]}))),
      denouncements:users.flatMap(x=>x.den.filter(d=>d[0]===p.id).map(d=>({login:x.login,reason:d[1],credibility:d[2]}))),
      connected:[...new Set(cs.flatMap(x=>x.prs.map(q=>q.p)))].filter(i=>i!==p.id),
      reputation:Math.max(0,Math.min(100,60+cs.filter(x=>st(x)==='SAFE').length*6-cs.filter(x=>st(x)==='FLAGGED').length*4))}});
}
export const allDenouncements=()=>users.flatMap(x=>x.den.map(d=>({login:x.login,project:d[0],reason:d[1],credibility:d[2]})));