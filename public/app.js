import {createGraph} from './graph.js';
const root=document.getElementById('app'),nav=document.getElementById('nav');
const h=(t,a,...c)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a||{})){if(k==='class')e.className=v;else if(k==='style')e.style.cssText=v;else if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(v!==false&&v!=null)e.setAttribute(k,v)}for(const x of c.flat(9))e.append(x&&x.nodeType?x:document.createTextNode(x===false||x==null?'':x));return e};
const api=async(p,body)=>{const r=await fetch('/api'+p,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Requested-With':'gittrust'},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});const d=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(d.error||'Request failed');e.status=r.status;e.details=d.details;throw e}return d};
const CLS={SAFE:'safe',SUSPICIOUS:'warn',FLAGGED:'bad',NEUTRAL:'new'},ICON={SAFE:'🟢',SUSPICIOUS:'🟡',FLAGGED:'🔴',NEUTRAL:'🔵'};
let me=null,cleanup=()=>{};
const badge=(s,l)=>h('span',{class:'badge '+CLS[s]},ICON[s]+' '+(l||s));
const ulink=l=>h('a',{href:'#/u/'+l},l);
const err=e=>h('p',{class:'err'},e.message);
const LINKS=[['dashboard','Dashboard'],['check','Check'],['network','Network'],['campaigns','Campaigns'],['fair','Fair Evaluation'],['pr','PR Analysis'],['projects','Projects']];
function drawNav(){const cur=location.hash.split('/')[1]||'';nav.replaceChildren(h('a',{class:'brand',href:'#/'},'Git',h('b',{},'Trust')),
  ...(me?[...LINKS.map(([k,l])=>h('a',{href:'#/'+k,class:cur===k?'on':''},l)),me.role==='admin'?h('a',{href:'#/admin',class:cur==='admin'?'on':''},'Admin'):'',h('span',{class:'sp'}),h('a',{href:'#/disputes'},'My disputes'),
   h('a',{href:'#/',onclick:async e=>{e.preventDefault();await api('/auth/logout',{});me=null;location.hash='#/';route()}},'Sign out ('+me.username+')')]:[h('span',{class:'sp'}),h('a',{href:'#/login'},'Sign in')])) }
const stat=(n,l,c='')=>h('div',{class:'glass stat '+c},h('b',{},n),h('span',{},l));
function graphBox(data,o={}){const cv=h('canvas'),box=h('div',{class:'gwrap'+(o.sm?' sm':'')},cv);const g=createGraph(cv,data,o);const prev=cleanup;cleanup=()=>{prev();g.destroy()};return{box,g}}

function landing(){
  const rnd=(()=>{let s=3;return()=>(s=s*16807%2147483647)/2147483647})(),nodes=Array.from({length:34},(_,i)=>({id:'n'+i,label:'',kind:i<6?'project':'user',status:['SAFE','SAFE','NEUTRAL','SUSPICIOUS','FLAGGED'][i%5]})),edges=nodes.slice(6).flatMap((n,i)=>[{s:n.id,t:'n'+(i%6),k:'contrib'},rnd()>.6?{s:n.id,t:nodes[6+Math.floor(rnd()*28)].id,k:['vouch','denounce','suspicious'][i%3]}:null]).filter(Boolean);
  const{box}=graphBox({nodes,edges},{static:false});box.className='';box.style.cssText='position:absolute;inset:0';
  const steps=[['Problem','Bad actors hop between projects. Every maintainer reviews alone, so the same campaign lands on everyone.'],['Projects','Independent projects each hold their own honest review history of a contributor.'],['Shared reputation','Vouches and denouncements travel across projects as signals — never as verdicts.'],['Suspicious network','Near-identical PRs, tight timing and fresh accounts converge into a visible cluster.'],['Newcomer fairness','No history is not negative history. New contributors start neutral and get a normal review.'],['Final trust decision','An explainable status with positive, negative and neutral evidence — plus a way to appeal.']];
  const el=h('div',{},h('section',{class:'hero'},box,h('div',{class:'in'},h('h1',{},h('em',{},'Trust the Contributor,'),' Not Just the Contribution.'),h('p',{},'GitTrust connects GitHub projects through decentralized reputation signals to detect coordinated behavior and fairly evaluate contributors.'),h('p',{},h('a',{class:'btn',href:me?'#/check':'#/login'},'Check a GitHub Contributor')))),
    ...steps.map(([t,d],i)=>h('div',{class:'step'},h('div',{class:'n'},'0'+(i+1)),h('div',{},h('h2',{},t),h('p',{class:'mut'},d)))),
    h('div',{class:'glass flow',style:'justify-content:center;margin-bottom:2rem'},'PROBLEM',h('span',{class:'a'},'→'),'PROJECTS',h('span',{class:'a'},'→'),'SHARED REPUTATION',h('span',{class:'a'},'→'),'SUSPICIOUS NETWORK',h('span',{class:'a'},'→'),'NEWCOMER FAIRNESS',h('span',{class:'a'},'→'),'TRUST DECISION'));
  root.replaceChildren(el);const io=new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&e.target.classList.add('in')),{threshold:.3});el.querySelectorAll('.step').forEach(s=>io.observe(s));const prev=cleanup;cleanup=()=>{prev();io.disconnect()}}

function authView(){
  let mode='login';const msg=h('div'),u=h('input',{autocomplete:'username',maxlength:32}),p=h('input',{type:'password',autocomplete:'current-password',maxlength:128}),btn=h('button',{class:'btn',type:'submit'},'Sign in');
  const tabs=['login','register'].map(m=>h('button',{class:'chip'+(m===mode?' on':''),type:'button',onclick:()=>{mode=m;tabs.forEach((t,i)=>t.classList.toggle('on',i===(m==='login'?0:1)));btn.textContent=m==='login'?'Sign in':'Create account';p.autocomplete=m==='login'?'current-password':'new-password'}},m==='login'?'Sign in':'Register'));
  const f=h('form',{class:'glass narrow',onsubmit:async e=>{e.preventDefault();msg.replaceChildren();try{me=await api('/auth/'+mode,{username:u.value,password:p.value});location.hash='#/dashboard'}catch(x){msg.replaceChildren(err(x))}}},h('h2',{},'Access GitTrust'),h('div',{class:'tabs'},tabs),h('label',{},'Username'),u,h('label',{},'Password (min 10 characters to register)'),p,msg,h('p',{},btn));
  root.replaceChildren(f)}

async function dashboard(){
  const s=await api('/stats'),net=await api('/network'),{box}=graphBox(net,{sm:true});
  root.replaceChildren(h('h2',{},'Dashboard'),h('div',{class:'grid g6'},stat(s.projects,'Projects'),stat(s.contributors,'Contributors'),stat(s.SAFE,'Safe','safe'),stat(s.SUSPICIOUS,'Suspicious','warn'),stat(s.FLAGGED,'Flagged','bad'),stat(s.newContributors,'New contributors','new'),stat(s.campaigns,'Campaigns detected','bad')),
    h('div',{class:'grid g2',style:'margin-top:1rem;grid-template-columns:2fr 1fr'},h('div',{},h('h4',{},'Trust network · drag to rotate, scroll to zoom'),box,h('p',{},h('a',{href:'#/network'},'Open full network →'))),h('div',{class:'glass'},h('h4',{},'Recent alerts'),s.alerts.map(a=>h('div',{class:'alert '+a.level},a.text)))))}

const evBox=(t,items,c,sign)=>h('div',{class:'glass ev '+c},h('h4',{},t+' ('+items.length+')'),items.length?h('ul',{},items.map(i=>h('li',{},i.text,i.w?h('small',{},' '+sign+Math.abs(i.w)):''))):h('p',{class:'mut'},'None'));
function result(d,full){
  const c=CLS[d.status],pr=d.projects;
  const dispute=h('div'),ask=()=>{const t=h('textarea',{maxlength:1000,placeholder:'Explain what is wrong or add context (10–1000 chars)'}),m=h('div');dispute.replaceChildren(h('div',{class:'glass'},h('h4',{},'File a reputation dispute'),t,m,h('p',{},h('button',{class:'btn sm',onclick:async()=>{try{await api('/disputes',{target:d.login,message:t.value});dispute.replaceChildren(h('p',{class:'ok'},'Dispute submitted. An admin will review it.'))}catch(x){m.replaceChildren(err(x))}}},'Submit'))))};
  return h('div',{class:'grid'},
    h('div',{class:'glass verdict '+c},h('div',{},h('h2',{class:'mono'},d.login),badge(d.status,d.label)),h('div',{},h('div',{class:'mut'},'Confidence in verdict'),h('div',{class:'bar'},h('i',{style:'width:'+d.confidence+'%'})),h('b',{class:'mono'},d.confidence+'%')),h('div',{style:'flex:1;min-width:240px'},h('h4',{},'Why this result'),h('p',{style:'margin:0'},d.why))),
    h('div',{class:'grid g6'},stat(d.vouches.length,'Vouches','safe'),stat(d.denouncements.length,'Denouncements','bad'),stat(pr.length,'Projects'),stat(d.prs.length,'PRs shown'),stat(d.isNew?'Yes':'No','New user','new'),stat(d.newUserVouches,'New-user vouches','new')),
    h('div',{class:'grid g3'},evBox('Positive evidence',d.positive,'pos','+'),evBox('Negative evidence',d.negative,'neg','−'),evBox('Neutral evidence',d.neutral,'neu','')),
    d.suspicious.length?h('div',{class:'glass'},h('h4',{},'Suspicious activity'),d.suspicious.map(s=>h('div',{class:'alert'},s))):null,
    d.vouches.length||d.denouncements.length?h('div',{class:'grid g2'},h('div',{class:'glass'},h('h4',{},'Vouches'),d.vouches.map(v=>h('p',{},h('b',{},v.project),' — ',v.note))),h('div',{class:'glass'},h('h4',{},'Denouncements'),d.denouncements.length?d.denouncements.map(v=>h('p',{},h('b',{},v.project),' — ',v.reason,h('small',{},' (credibility '+Math.round(v.credibility*100)+'%)'))):h('p',{class:'mut'},'None'))):null,
    pr.length?h('div',{class:'glass'},h('h4',{},'Projects'),h('table',{},h('tr',{},h('th',{},'Project'),h('th',{},'Merged'),h('th',{},'Total PRs')),pr.map(p=>h('tr',{},h('td',{},h('a',{href:'#/projects/'+p.id},p.id)),h('td',{},p.merged),h('td',{},p.total))))):null,
    d.prs.length?h('div',{class:'glass'},h('h4',{},'Contribution history'),h('table',{},h('tr',{},h('th',{},'Project'),h('th',{},'PR'),h('th',{},'Status'),h('th',{},'Days ago')),d.prs.map(p=>h('tr',{},h('td',{},p.project),h('td',{},p.title),h('td',{},p.status),h('td',{},p.daysAgo))))):null,
    full&&d.timeline.length?h('div',{class:'glass'},h('h4',{},'Reputation timeline'),h('div',{class:'tl'},d.timeline.map(t=>h('div',{class:t.kind},h('small',{},t.daysAgo+'d ago · '),t.text)))):null,
    full&&d.connections.length?h('div',{class:'glass'},h('h4',{},'Network connections'),d.connections.map(c=>h('p',{},ulink(c.login),' ',badge(c.status),' ',h('small',{},c.via)))):null,
    h('div',{},h('button',{class:'btn ghost sm',onclick:ask},'Dispute this result'),dispute))}
function check(){
  const out=h('div',{style:'margin-top:1rem'}),i=h('input',{placeholder:'octocat or https://github.com/octocat',maxlength:200});
  const go=async e=>{e&&e.preventDefault();out.replaceChildren(h('p',{class:'mut'},'Analyzing…'));try{out.replaceChildren(result(await api('/contributor/'+encodeURIComponent(i.value)),false))}catch(x){out.replaceChildren(err(x))}};
  root.replaceChildren(h('h2',{},'Check Contributor'),h('p',{class:'mut'},'Try: mira-chen · arjun-new · jules-okafor · null-byte-77 · pr-farmer-02'),h('form',{class:'row',onsubmit:go},i,h('button',{class:'btn',type:'submit'},'Check')),out)}
async function profile(l){root.replaceChildren(result(await api('/contributor/'+encodeURIComponent(l)),true))}

async function network(){
  const data=await api('/network'),side=h('div',{class:'glass'},h('h4',{},'Node details'),h('p',{class:'mut'},'Click a node.')),hide=new Set();
  const{box,g}=graphBox(data,{onSelect:n=>side.replaceChildren(h('h4',{},'Node details'),n?h('div',{},h('h3',{class:'mono'},n.label),n.kind==='project'?h('span',{class:'badge new'},'PROJECT'):badge(n.status),h('p',{},n.kind==='user'?ulink(n.label):h('a',{href:'#/projects/'+n.label},'Open project')),g.edgesOf(n).map(e=>h('p',{},h('small',{},e.k+' → '),e.other))):h('p',{class:'mut'},'Click a node.'))});
  const chip=(k,l)=>h('span',{class:'chip on',onclick:e=>{hide.has(k)?hide.delete(k):hide.add(k);e.target.classList.toggle('on');g.setHide(hide)}},l);
  const s=h('input',{placeholder:'Search node…',maxlength:40,oninput:e=>g.setQuery(e.target.value)});
  root.replaceChildren(h('h2',{},'Trust Network'),h('div',{class:'row'},s,h('button',{class:'btn ghost sm',onclick:()=>g.zoomBy(1.2)},'＋'),h('button',{class:'btn ghost sm',onclick:()=>g.zoomBy(.83)},'－')),
    h('div',{class:'chips',style:'margin:.7rem 0'},chip('project','Projects'),chip('SAFE','Safe'),chip('NEUTRAL','New/Neutral'),chip('SUSPICIOUS','Suspicious'),chip('FLAGGED','Flagged'),chip('vouch','Vouches'),chip('denounce','Denouncements'),chip('suspicious','Suspicious links'),chip('contrib','Contributions')),
    h('div',{class:'grid',style:'grid-template-columns:3fr 1fr'},box,side))}
const campCard=c=>h('div',{class:'glass'},h('div',{class:'row'},h('h3',{},c.id+' · '+c.title),h('span',{class:'badge '+(c.risk==='HIGH'?'bad':'warn')},c.risk+' RISK')),
  h('div',{class:'grid g2'},h('div',{},h('h4',{},'Affected contributors'),c.accounts.map(a=>h('p',{style:'margin:.2rem 0'},ulink(a))),h('h4',{style:'margin-top:.8rem'},'Affected projects'),h('p',{},c.projects.map(p=>h('a',{href:'#/projects/'+p,style:'margin-right:.6rem'},p)))),h('div',{},h('h4',{},'Evidence'),c.evidence.map(e=>h('div',{class:'alert'},e)))),
  h('h4',{style:'margin-top:.8rem'},'Similar PRs & time pattern'),h('table',{},h('tr',{},h('th',{},'Account'),h('th',{},'Project'),h('th',{},'Title'),h('th',{},'Hours ago')),c.prs.map(p=>h('tr',{},h('td',{},p.login),h('td',{},p.project),h('td',{},p.title),h('td',{},p.hoursAgo)))));
async function campaigns(){const cs=await api('/campaigns'),net=await api('/network'),ids=new Set(cs.flatMap(c=>c.accounts.map(a=>'u:'+a)));
  const sub={nodes:net.nodes.filter(n=>ids.has(n.id)||(n.kind==='project'&&cs.some(c=>c.projects.includes(n.label)))),edges:net.edges.filter(e=>(ids.has(e.s)||e.k==='suspicious')&&ids.has(e.s))};sub.edges=net.edges.filter(e=>ids.has(e.s)&&(ids.has(e.t)||sub.nodes.some(n=>n.id===e.t)));
  const{box}=graphBox(sub,{sm:true});root.replaceChildren(h('h2',{},'Campaign Detection'),h('p',{class:'mut'},'Detected automatically: ≥3 accounts, ≥2 projects, near-identical PR titles within a 72h window.'),cs.length?h('div',{class:'grid'},cs.map(campCard),h('h4',{},'Network cluster'),box):h('p',{},'No campaigns detected.'))}

async function fair(){const ns=await api('/contributors?status=NEUTRAL');
  root.replaceChildren(h('h2',{},'Fair Evaluation'),h('div',{class:'glass'},h('div',{class:'flow'},h('span',{class:'badge new'},'NEW CONTRIBUTOR'),h('span',{class:'a'},'→'),h('span',{class:'badge new'},'NEUTRAL'),h('span',{class:'a'},'→'),'No negative evidence',h('span',{class:'a'},'→'),h('span',{class:'badge safe'},'Normal review')),h('h3',{style:'margin-top:1rem'},'No history is not negative history.'),
    h('p',{class:'mut'},'Everyone starts somewhere. GitTrust never penalises a newcomer for lacking vouches, merged PRs or account age.')),
    h('div',{class:'grid g3',style:'margin-top:1rem'},evBox('What we never count against you',[{text:'A new account'},{text:'No vouches yet'},{text:'A first or empty PR description'},{text:'Few or no merged PRs'}],'neu',''),evBox('What can build trust',[{text:'Project vouches (even one)'},{text:'Merged contributions'},{text:'Positive review history'}],'pos',''),evBox('What it takes to be flagged',[{text:'Several independent negative signals'},{text:'Credible denouncements across projects'},{text:'Coordinated campaign membership'}],'neg','')),
    h('div',{class:'glass',style:'margin-top:1rem'},h('h4',{},'Newcomers and neutral contributors in the demo network'),ns.map(n=>h('p',{},ulink(n.login),' ',badge(n.status,n.label)))))}

async function pr(){
  const t=h('input',{maxlength:300,placeholder:'PR title'}),b=h('textarea',{maxlength:5000,placeholder:'PR description'}),d=h('textarea',{maxlength:150000,placeholder:'Diff (optional)'}),out=h('div');
  root.replaceChildren(h('h2',{},'PR Analysis'),h('p',{class:'mut'},'Heuristics decide. Local Ollama + Gemma adds an advisory semantic signal only (max 20% of the score), and falls back gracefully if unavailable.'),h('form',{class:'glass',onsubmit:async e=>{e.preventDefault();out.replaceChildren(h('p',{class:'mut'},'Analyzing…'));try{const r=await api('/pr/analyze',{title:t.value,description:b.value,diff:d.value});
    out.replaceChildren(h('div',{class:'glass verdict '+(r.level==='HIGH'?'bad':r.level==='MEDIUM'?'warn':'safe')},h('div',{class:'big'},r.level+' CONCERN'),h('div',{},'Score '+r.score+' · AI '+(r.aiAvailable?'consulted':'unavailable (heuristics only)'))),h('div',{class:'grid g3',style:'margin-top:1rem'},evBox('Positive',r.signals.filter(s=>s.type==='positive').map(s=>({...s,w:0})),'pos',''),evBox('Negative',r.signals.filter(s=>s.type==='negative'),'neg','+'),evBox('Neutral',r.signals.filter(s=>s.type==='neutral'),'neu','')),h('p',{class:'mut'},r.note))}catch(x){out.replaceChildren(err(x))}}},h('label',{},'Title'),t,h('label',{},'Description'),b,h('label',{},'Diff'),d,h('p',{},h('button',{class:'btn',type:'submit'},'Analyze'))),out)}

async function projects(id){const ps=await api('/projects');
  if(id){const p=ps.find(x=>x.id===id);if(!p)return root.replaceChildren(h('p',{},'Project not found.'));
    return root.replaceChildren(h('p',{},h('a',{href:'#/projects'},'← Projects')),h('h2',{class:'mono'},p.id),h('p',{class:'mut'},p.topic+' · ★ '+p.stars.toLocaleString()+' · reputation '+p.reputation+'/100'),
      h('div',{class:'grid g2'},h('div',{class:'glass'},h('h4',{},'Contributors'),p.contributors.map(c=>h('p',{style:'margin:.3rem 0'},ulink(c.login),' ',badge(c.status)))),h('div',{class:'glass'},h('h4',{},'Vouches'),p.vouches.map(v=>h('p',{},ulink(v.login),' — ',v.note)),h('h4',{style:'margin-top:1rem'},'Denouncements'),p.denouncements.length?p.denouncements.map(v=>h('p',{},ulink(v.login),' — ',v.reason)):h('p',{class:'mut'},'None'),h('h4',{style:'margin-top:1rem'},'Connected projects'),h('p',{},p.connected.map(c=>h('a',{href:'#/projects/'+c,style:'margin-right:.6rem'},c))))))}
  root.replaceChildren(h('h2',{},'Projects'),h('div',{class:'grid g3'},ps.map(p=>h('a',{href:'#/projects/'+p.id,class:'glass',style:'color:inherit;display:block'},h('h3',{class:'mono'},p.id),h('p',{class:'mut'},p.topic+' · ★ '+p.stars.toLocaleString()),h('div',{class:'bar'},h('i',{style:'width:'+p.reputation+'%'})),h('small',{},'Reputation '+p.reputation+' · '+p.contributors.length+' contributors · '+p.denouncements.length+' denouncements')))))}

async function disputes(){const ds=await api('/disputes/mine');root.replaceChildren(h('h2',{},'My disputes'),ds.length?h('div',{class:'glass'},h('table',{},h('tr',{},h('th',{},'Target'),h('th',{},'Message'),h('th',{},'Status'),h('th',{},'Admin note')),ds.map(d=>h('tr',{},h('td',{},d.target),h('td',{},d.message),h('td',{},d.status),h('td',{},d.note||''))))):h('p',{class:'mut'},'No disputes filed yet. Open any profile and choose “Dispute this result”.'))}
function githubCard(){
  const ta=h('textarea',{placeholder:'One per line: a GitHub username (imports all their public repos)\nor owner/repo\ne.g.\nswastikfr-fr\njanishpurohit',style:'min-height:90px'}),clr=h('input',{type:'checkbox',style:'width:auto'}),msg=h('div');
  return h('div',{class:'glass',style:'margin-bottom:1rem'},h('h4',{},'Load live data from GitHub'),h('p',{class:'mut'},'Fetches recent PRs and commits plus account ages. Enter a username to load all public repos of that person, or owner/repo. They are re-synced automatically so timing signals stay fresh. Vouches and denouncements still come from CSV.'),ta,
    h('label',{},clr,' Remove existing data first (e.g. the demo data)'),msg,
    h('p',{},h('button',{class:'btn sm',onclick:async e=>{const b=e.target;b.disabled=true;msg.replaceChildren(h('p',{class:'mut'},'Fetching from GitHub…'));
      try{const r=await api('/admin/github',{repos:ta.value.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean),clear:clr.checked});msg.replaceChildren(h('p',{class:'ok'},'Imported: '+Object.entries(r.counts).map(([k,v])=>v+' '+k).join(', ')+(r.skipped?' ('+r.skipped+' accounts skipped)':'')+'. Open the Dashboard to see it.'))}
      catch(x){msg.replaceChildren(err(x))}b.disabled=false}},'Fetch & import')))}
function flagCard(){
  const box=h('div'),msg=h('div'),dl=h('datalist',{id:'flagpeople'}),ok=t=>msg.replaceChildren(h('p',{class:'ok'},t)),bad=x=>msg.replaceChildren(err(x)),
    who=h('input',{list:'flagpeople',placeholder:'Username',maxlength:60}),why=h('input',{maxlength:300,placeholder:'Reason (required, 5-300 characters)'});
  const load=async()=>{const r=await api('/admin/flags');dl.replaceChildren(...r.people.map(p=>h('option',{value:p})));
    box.replaceChildren(r.flags.length?h('table',{},h('tr',{},h('th',{},'Person'),h('th',{},'Status'),h('th',{},'Reason'),h('th',{},'By'),h('th',{})),r.flags.map(f=>h('tr',{},h('td',{},ulink(f.login)),h('td',{},h('span',{class:'badge '+CLS[f.status]},ICON[f.status]+' '+f.status)),h('td',{},f.reason),h('td',{},f.by),
      h('td',{},h('button',{class:'btn sm ghost',onclick:async()=>{try{await api('/admin/flag',{login:f.login,clear:true});load()}catch(x){bad(x)}}},'Remove override'))))):h('p',{class:'mut'},'No manual overrides.'))};
  load().catch(bad);
  const set=(status,text,done,cls)=>h('button',{class:cls,onclick:async()=>{try{await api('/admin/flag',{login:who.value,reason:why.value,status});ok(done);why.value='';load()}catch(x){bad(x)}}},text);
  return h('div',{class:'glass',style:'margin-bottom:1rem'},h('h4',{},'Set a person\'s status'),h('p',{class:'mut'},'Overrides the automatic score. Mark safe clears all suspicion (green, no negative evidence or suspicious links shown). Mark suspicious (yellow) and Flag person (red) raise concern. The reason is shown on their profile and in the audit log. Use Remove override to go back to the automatic result.'),dl,
    h('div',{class:'row'},who,why),
    h('div',{class:'row',style:'margin-top:.6rem'},set('SAFE','Mark safe','Marked SAFE. Open the Network page to see the green dot.','btn sm'),set('SUSPICIOUS','Mark suspicious','Marked SUSPICIOUS. Open the Network page to see the yellow dot.','btn sm ghost'),set('FLAGGED','Flag person','Flagged. Open the Network page to see the red dot.','btn sm ghost')),msg,box)}
function importCard(){
  const ta=h('textarea',{maxlength:200000,placeholder:'Paste CSV text here, or choose a .csv file',style:'min-height:150px'}),mode=h('select',{},h('option',{value:'replace'},'Replace everything (start fresh, removes demo data)'),h('option',{value:'add'},'Add to existing data')),msg=h('div'),
    file=h('input',{type:'file',accept:'.csv,text/csv',onchange:async e=>{const f=e.target.files[0];if(f&&f.size<2e5)ta.value=await f.text()}});
  const say=t=>msg.replaceChildren(h('p',{class:'ok'},t));
  return h('div',{class:'glass',style:'margin-bottom:1rem'},h('h4',{},'Import data (CSV)'),h('p',{class:'mut'},'First line: type,login,project,text,number,status. Types: project, contributor, pr, vouch, denounce, link (person to person: login = from, project = to, status = vouch/denounce/suspicious). Start from classroom-template.csv.'),file,ta,mode,msg,
    h('p',{},h('button',{class:'btn sm',onclick:async()=>{msg.replaceChildren();try{const r=await api('/admin/import',{csv:ta.value,mode:mode.value});say('Imported: '+Object.entries(r.counts).map(([k,v])=>v+' '+k).join(', ')+'. Open the Dashboard to see it.')}catch(x){msg.replaceChildren(err(x),...(x.details||[]).map(d=>h('div',{class:'alert bad'},d)))}}},'Import'),' ',
      h('button',{class:'btn sm ghost',onclick:async()=>{if(confirm('Replace all data with the original demo data?'))try{await api('/admin/reset',{});say('Demo data restored.')}catch(x){msg.replaceChildren(err(x))}}},'Reset to demo data')))}
async function admin(){const o=await api('/admin/overview'),box=h('div');
  const render=()=>box.replaceChildren(h('div',{class:'glass'},h('h4',{},'Suspicious campaigns'),o.campaigns.map(campCard)),
    h('div',{class:'glass',style:'margin-top:1rem'},h('h4',{},'Denouncements'),h('table',{},h('tr',{},h('th',{},'Account'),h('th',{},'From'),h('th',{},'Reason'),h('th',{},'Credibility')),o.denouncements.map(d=>h('tr',{},h('td',{},ulink(d.login)),h('td',{},d.project),h('td',{},d.reason),h('td',{},Math.round(d.credibility*100)+'%'))))),
    h('div',{class:'glass',style:'margin-top:1rem'},h('h4',{},'Disputes'),o.disputes.length?o.disputes.map(d=>h('div',{class:'alert'},h('b',{},'#'+d.id+' '+d.username+' → '+d.target),' ['+d.status+'] ',d.message,d.status==='open'?h('span',{},' ',['upheld','dismissed'].map(s=>h('button',{class:'btn sm ghost',onclick:async()=>{const n=prompt('Resolution note (optional)')||'';try{await api('/admin/disputes/'+d.id,{status:s,note:n});d.status=s;d.note=n;render()}catch(x){alert(x.message)}}},s))):'')):h('p',{class:'mut'},'No disputes.')),
    h('div',{class:'glass',style:'margin-top:1rem'},h('h4',{},'Audit log'),h('table',{},h('tr',{},h('th',{},'Time'),h('th',{},'Actor'),h('th',{},'Action'),h('th',{},'Detail'),h('th',{},'IP')),o.audit.map(a=>h('tr',{},h('td',{},new Date(a.ts).toLocaleString()),h('td',{},a.actor),h('td',{},a.action),h('td',{},a.detail),h('td',{},a.ip))))));
  render();root.replaceChildren(h('h2',{},'Admin'),githubCard(),flagCard(),importCard(),box)}

const R={'':landing,login:authView,dashboard,check,network,campaigns,fair,pr,projects,disputes,admin,u:profile};
async function route(){cleanup();cleanup=()=>{};const[,k='',arg]=location.hash.split('/');
  if(me===null){try{const m=await api('/auth/me');me=m.username?m:false}catch{me=false}}
  drawNav();scrollTo(0,0);const f=R[k];
  if(!f)return location.hash='#/';
  if(!me&&k&&k!=='login')return location.hash='#/login';
  try{await f(arg?decodeURIComponent(arg):undefined)}catch(e){if(e.status===401){me=false;location.hash='#/login'}else if(e.status===404&&k==='admin')location.hash='#/dashboard';else root.replaceChildren(err(e))}}
addEventListener('hashchange',route);route();