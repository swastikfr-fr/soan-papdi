import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';import {fileURLToPath} from 'node:url';
import * as T from './lib/trust.js';import {analyzePR} from './lib/pr.js';import {initStore,importCSV,reset,syncGitHub,trackedRepos,addPerson,addLink,delLink,listLinks,listPeople,LINK_KINDS,listFlags,setFlag,clearFlag,FLAG_STATUSES} from './lib/store.js';import {fetchGitHub,expandTargets,parseTarget,parseRepo} from './lib/github.js';
const root=path.dirname(fileURLToPath(import.meta.url)),pub=path.join(root,'public');
try{for(const l of fs.readFileSync(path.join(root,'.env'),'utf8').split('\n')){const m=l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].replace(/^["']|["']$/g,'')}}catch{}
const E=process.env,PROD=E.NODE_ENV==='production';let W;
const db=new DatabaseSync(E.DB_PATH||path.join(root,'gittrust.db'));
initStore(db);W=T.world();
db.exec(`CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,pw TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,ts INTEGER,actor TEXT,action TEXT,detail TEXT,ip TEXT);
CREATE TABLE IF NOT EXISTS disputes(id INTEGER PRIMARY KEY,uid INTEGER,target TEXT,message TEXT,status TEXT DEFAULT 'open',note TEXT,created INTEGER)`);
const q=(sql,...a)=>db.prepare(sql).all(...a),q1=(sql,...a)=>db.prepare(sql).get(...a),run=(sql,...a)=>db.prepare(sql).run(...a);
const hash=pw=>{const s=crypto.randomBytes(16);return 's1$'+s.toString('hex')+'$'+crypto.scryptSync(pw,s,64).toString('hex')};
const verify=(pw,st)=>{const[,s,k]=st.split('$'),d=crypto.scryptSync(pw,Buffer.from(s,'hex'),64);return crypto.timingSafeEqual(d,Buffer.from(k,'hex'))};
const DUMMY=hash(crypto.randomBytes(8).toString('hex'));
const audit=(actor,action,detail,ip)=>run('INSERT INTO audit(ts,actor,action,detail,ip) VALUES(?,?,?,?,?)',Date.now(),actor,action,String(detail||'').slice(0,300),ip);
async function syncRepos(targets,clear){const repos=await expandTargets(targets,{token:E.GITHUB_TOKEN});if(!repos.length)throw new Error('No public, non-fork repositories were found for that input.');const data=await fetchGitHub(repos,{token:E.GITHUB_TOKEN});const r=syncGitHub(db,data,{clear,track:repos.map(x=>x.owner+'/'+x.name)});W=T.world();return{...r,skipped:data.skipped}}
if(E.GITHUB_TOKEN&&E.AUTO_SYNC_HOURS!=='0')setInterval(async()=>{const t=trackedRepos(db).map(parseRepo).filter(Boolean);if(t.length)try{await syncRepos(t,false);console.log('[sync] refreshed',t.length,'repos')}catch(e){console.error('[sync]',e.message)}},Math.min(168,+E.AUTO_SYNC_HOURS||6)*36e5).unref();
// admin bootstrap (password from env, or random and printed once)
if(!q1("SELECT 1 x FROM users WHERE role='admin'")){const pw=E.ADMIN_PASSWORD||crypto.randomBytes(12).toString('base64url');run('INSERT INTO users(username,pw,role,created) VALUES(?,?,?,?)',(E.ADMIN_USER||'admin').toLowerCase(),hash(pw),'admin',Date.now());
 if(!E.ADMIN_PASSWORD)console.log('[setup] Admin created. User:',E.ADMIN_USER||'admin','Password (shown once):',pw);}
const sessions=new Map(),hits=new Map(),sha=t=>crypto.createHash('sha256').update(t).digest('hex');
const limited=(k,max,ms)=>{const n=Date.now();let r=hits.get(k);if(!r||r.t<n){r={t:n+ms,c:0};hits.set(k,r)}return ++r.c>max};
const peek=k=>{const r=hits.get(k);return r&&r.t>Date.now()?r.c:0};
setInterval(()=>{const n=Date.now();hits.forEach((r,k)=>r.t<n&&hits.delete(k));sessions.forEach((s,k)=>s.exp<n&&sessions.delete(k))},6e4).unref();
const SEC={'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
 'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(),microphone=(),geolocation=()','Cross-Origin-Opener-Policy':'same-origin',...(PROD?{'Strict-Transport-Security':'max-age=63072000; includeSubDomains'}:{})};
const send=(res,code,body,h={})=>{res.writeHead(code,{...SEC,...h});res.end(body)};
const json=(res,code,o,h={})=>send(res,code,JSON.stringify(o),{'Content-Type':'application/json','Cache-Control':'no-store',...h});
const readBody=req=>new Promise((ok,no)=>{let b='';req.on('data',c=>{b+=c;if(b.length>2e4+(/\/(pr|admin)\//.test(req.url)?2e5:0)){no({code:413});req.destroy()}});req.on('end',()=>{try{ok(b?JSON.parse(b):{})}catch{no({code:400})}})});
const str=(v,min,max)=>typeof v==='string'&&v.length>=min&&v.length<=max;
const GH=/^[a-z\d](?:[a-z\d-]{0,38})$/i;
const ghName=v=>{if(typeof v!=='string')return null;let s=v.trim();const m=s.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([^\/?#\s]+)/i);if(m)s=m[1];s=s.replace(/^@/,'');return GH.test(s)?s.toLowerCase():null};
const cookie=(t,age)=>`gt_sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${PROD?'; Secure':''}`;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const login=(res,u,ip)=>{const t=crypto.randomBytes(32).toString('base64url');sessions.set(sha(t),{uid:u.id,username:u.username,role:u.role,exp:Date.now()+864e5});return{'Set-Cookie':cookie(t,86400)}};

async function api(req,res,url,ip){
  const m=req.method,p=url.pathname.slice(4);
  if(limited('g:'+ip,300,6e4))return json(res,429,{error:'Too many requests. Please slow down.'});
  if(m!=='GET'&&req.headers['x-requested-with']!=='gittrust')return json(res,403,{error:'Request blocked.'});
  const tok=(req.headers.cookie||'').match(/(?:^|;\s*)gt_sid=([\w-]+)/)?.[1],S=tok&&sessions.get(sha(tok)),user=S&&S.exp>Date.now()?S:null;
  const body=m==='POST'?await readBody(req):{};
  if(p==='/auth/register'||p==='/auth/login'){
    if(limited('a:'+ip,15,6e5))return json(res,429,{error:'Too many attempts. Try again in a few minutes.'});
    const un=typeof body.username==='string'?body.username.trim().toLowerCase():'';
    if(!/^[a-z0-9_-]{3,32}$/.test(un)||!str(body.password,p==='/auth/register'?10:1,128))return json(res,400,{error:p==='/auth/register'?'Username: 3-32 letters/digits/-/_. Password: at least 10 characters.':'Invalid credentials.'});
    if(p==='/auth/register'){
      if(q1('SELECT 1 x FROM users WHERE username=?',un))return json(res,409,{error:'That username is taken.'});
      const r=run('INSERT INTO users(username,pw,role,created) VALUES(?,?,?,?)',un,hash(body.password),'user',Date.now());audit(un,'register','',ip);
      return json(res,201,{username:un,role:'user'},login(res,{id:Number(r.lastInsertRowid),username:un,role:'user'},ip))}
    if(peek('f:'+un)>=5)return json(res,429,{error:'Account temporarily locked. Try again in 15 minutes.'});
    const u=q1('SELECT * FROM users WHERE username=?',un),ok=verify(body.password,u?u.pw:DUMMY)&&u;
    if(!ok){limited('f:'+un,1e9,9e5);audit(un,'login_failed','',ip);return json(res,401,{error:'Invalid username or password.'})}
    audit(un,'login','',ip);return json(res,200,{username:un,role:u.role},login(res,u,ip))}
  if(p==='/auth/logout'){if(tok)sessions.delete(sha(tok));return json(res,200,{ok:true},{'Set-Cookie':cookie('',0)})}
  if(p==='/auth/me')return json(res,200,user?{username:user.username,role:user.role}:{username:null});
  if(p.startsWith('/admin')){ // invisible to non-admins
    if(!user||user.role!=='admin')return json(res,404,{error:'Not found.'});
    if(m==='GET'&&p==='/admin/overview'){audit(user.username,'admin_view','overview',ip);return json(res,200,{campaigns:W.camps,denouncements:T.allDenouncements(),
      disputes:q('SELECT d.id,u.username,d.target,d.message,d.status,d.note,d.created FROM disputes d JOIN users u ON u.id=d.uid ORDER BY d.id DESC LIMIT 100'),audit:q('SELECT ts,actor,action,detail,ip FROM audit ORDER BY id DESC LIMIT 100')})}
    if(m==='POST'&&p==='/admin/import'){if(!str(body.csv,1,2e5)||!['add','replace'].includes(body.mode))return json(res,400,{error:'Provide CSV text and a mode (add or replace).'});
      const r=importCSV(db,body.csv,body.mode);if(r.errors)return json(res,400,{error:'Import failed. Nothing was saved.',details:r.errors});
      W=T.world();audit(user.username,'import_'+body.mode,JSON.stringify(r.counts),ip);return json(res,200,r)}
    if(m==='POST'&&p==='/admin/github'){const rs=(Array.isArray(body.repos)?body.repos:[]).slice(0,10).map(parseTarget).filter(Boolean);
      if(!rs.length)return json(res,400,{error:'Provide 1-10 entries: owner/repo, a repo URL, or a GitHub username.'});
      if(limited('gh:'+user.username,30,36e5))return json(res,429,{error:'GitHub sync limit reached. Try again later.'});
      try{const r=await syncRepos(rs,!!body.clear);audit(user.username,'github_sync',rs.map(x=>x.user||x.owner+'/'+x.name).join(','),ip);return json(res,200,r)}
      catch(e){return json(res,502,{error:e.message})}}
    if(m==='GET'&&p==='/admin/links')return json(res,200,{links:listLinks(db),people:listPeople(db)});
    if(m==='POST'&&p==='/admin/person'){const n=ghName(body.login),age=Number(body.ageDays);if(!n||!(age>=0&&age<=20000))return json(res,400,{error:'Enter a valid username and an account age in days (0-20000).'});
      addPerson(db,n,Math.round(age));W=T.world();audit(user.username,'add_person',n,ip);return json(res,200,{ok:true})}
    if(m==='POST'&&p==='/admin/link'){const a=ghName(body.from),b=ghName(body.to),ppl=listPeople(db);
      if(!a||!b||a===b||!LINK_KINDS.includes(body.kind)||!str(body.note||'',0,200))return json(res,400,{error:'Pick two different people and a link type.'});
      if(!ppl.includes(a)||!ppl.includes(b))return json(res,400,{error:'Both people must already exist. Add them first.'});
      addLink(db,a,b,body.kind,body.note||'');W=T.world();audit(user.username,'add_link',a+' '+body.kind+' '+b,ip);return json(res,200,{ok:true})}
    if(m==='POST'&&p==='/admin/link/delete'){if(!Number.isInteger(body.id))return json(res,400,{error:'Invalid id.'});delLink(db,body.id);W=T.world();audit(user.username,'del_link','#'+body.id,ip);return json(res,200,{ok:true})}
    if(m==='GET'&&p==='/admin/flags')return json(res,200,{flags:listFlags(db),people:listPeople(db)});
    if(m==='POST'&&p==='/admin/flag'){const n=ghName(body.login);if(!n||!listPeople(db).includes(n))return json(res,400,{error:'That person is not in the network yet. Import them first.'});
      if(body.clear){clearFlag(db,n);W=T.world();audit(user.username,'unflag',n,ip);return json(res,200,{ok:true})}
      const st=body.status===undefined?'FLAGGED':body.status;if(!FLAG_STATUSES.includes(st))return json(res,400,{error:'Status must be FLAGGED, SUSPICIOUS or SAFE.'});
      if(!str(body.reason,5,300))return json(res,400,{error:'A reason of 5-300 characters is required.'});
      setFlag(db,n,body.reason.trim(),user.username,st);W=T.world();audit(user.username,st==='FLAGGED'?'flag':'mark_'+st.toLowerCase(),n+': '+body.reason,ip);return json(res,200,{ok:true})}
    if(m==='POST'&&p==='/admin/reset'){reset(db);W=T.world();audit(user.username,'reset_demo','',ip);return json(res,200,{ok:true})}
    const dm=p.match(/^\/admin\/disputes\/(\d+)$/);
    if(m==='POST'&&dm){if(!['upheld','dismissed'].includes(body.status)||!str(body.note||'',0,500))return json(res,400,{error:'Invalid resolution.'});
      run('UPDATE disputes SET status=?,note=? WHERE id=?',body.status,body.note||'',+dm[1]);audit(user.username,'dispute_'+body.status,'#'+dm[1],ip);return json(res,200,{ok:true})}
    return json(res,404,{error:'Not found.'})}
  if(!user)return json(res,401,{error:'Please sign in.'});
  if(m==='GET'){
    if(p==='/stats')return json(res,200,T.stats(W));
    if(p==='/network')return json(res,200,T.network(W));
    if(p==='/campaigns')return json(res,200,W.camps);
    if(p==='/projects')return json(res,200,T.projectInfo(W));
    if(p==='/contributors'){const s=(url.searchParams.get('status')||'').toUpperCase();return json(res,200,[...W.ev].filter(([,e])=>!s||e.status===s).map(([l,e])=>({login:l,status:e.status,label:e.label,isNew:e.isNew})))}
    const cm=p.match(/^\/contributor\/(.+)$/);
    if(cm){const n=ghName(decodeURIComponent(cm[1]));if(!n)return json(res,400,{error:'Enter a valid GitHub username or profile URL.'});audit(user.username,'check',n,ip);return json(res,200,T.profile(n,W))}
    if(p==='/disputes/mine')return json(res,200,q('SELECT id,target,message,status,note,created FROM disputes WHERE uid=? ORDER BY id DESC',user.uid||q1('SELECT id FROM users WHERE username=?',user.username).id))}
  if(m==='POST'){
    if(p==='/pr/analyze'){if(limited('pr:'+user.username,20,6e5))return json(res,429,{error:'PR analysis limit reached. Try again later.'});
      const{title,description='',diff=''}=body;if(!str(title,3,300)||!str(description,0,5000)||!str(diff,0,150000))return json(res,400,{error:'Title (3-300 chars) is required; description/diff too long or invalid.'});
      audit(user.username,'pr_analyze','',ip);return json(res,200,await analyzePR({title,body:description,diff},E))}
    if(p==='/disputes'){const n=ghName(body.target);if(!n||!str(body.message,10,1000))return json(res,400,{error:'Provide a valid GitHub username and a message of 10-1000 characters.'});
      if(limited('d:'+user.username,5,36e5))return json(res,429,{error:'Dispute limit reached for now.'});
      const id=q1('SELECT id FROM users WHERE username=?',user.username).id;run('INSERT INTO disputes(uid,target,message,created) VALUES(?,?,?,?)',id,n,body.message,Date.now());audit(user.username,'dispute_filed',n,ip);return json(res,201,{ok:true})}}
  return json(res,404,{error:'Not found.'})}

http.createServer(async(req,res)=>{
  const ip=req.socket.remoteAddress||'?';
  try{const url=new URL(req.url,'http://x');
    if(url.pathname.startsWith('/api/'))return await api(req,res,url,ip);
    if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,'Method not allowed');
    let f=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/,'');const full=path.resolve(pub,f);
    if(!full.startsWith(pub+path.sep)||!MIME[path.extname(full)]||!fs.existsSync(full))return send(res,404,'Not found',{'Content-Type':'text/plain'});
    send(res,200,fs.readFileSync(full),{'Content-Type':MIME[path.extname(full)],'Cache-Control':'no-cache'})
  }catch(e){if(e?.code===413||e?.code===400)return json(res,e.code,{error:e.code===413?'Request too large.':'Malformed request.'});console.error('[err]',e?.message);json(res,500,{error:'Something went wrong. Please try again.'})}
}).listen(+E.PORT||3000,()=>console.log('GitTrust on http://localhost:'+(E.PORT||3000)));