// Database layer for trust data. Tables are created on boot; demo data is seeded only when the DB is empty.
import {users,projects,links,flags} from './data.js';
const demo=structuredClone({projects,users}),TBL=['projects','contributors','prs','vouches','denounces','tracked','links'];
const GH=/^[a-z\d](?:[a-z\d-]{0,38})$/i,PID=/^[a-z0-9._-]{1,50}$/i;
const tx=(db,fn)=>{db.exec('BEGIN');try{fn();db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}};
const wipe=db=>TBL.forEach(t=>db.exec('DELETE FROM '+t));
export function initStore(db){
  db.exec(`CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,stars INTEGER DEFAULT 0,topic TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS contributors(login TEXT PRIMARY KEY,age_days INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS prs(id INTEGER PRIMARY KEY,login TEXT NOT NULL,project TEXT NOT NULL,title TEXT,status TEXT NOT NULL,hours_ago REAL NOT NULL);
CREATE TABLE IF NOT EXISTS vouches(login TEXT,project TEXT,note TEXT,PRIMARY KEY(login,project));
CREATE TABLE IF NOT EXISTS denounces(login TEXT,project TEXT,reason TEXT,cred REAL,PRIMARY KEY(login,project));
CREATE TABLE IF NOT EXISTS tracked(id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS flags(login TEXT PRIMARY KEY,reason TEXT NOT NULL,by TEXT,ts INTEGER,status TEXT NOT NULL DEFAULT 'FLAGGED');
CREATE TABLE IF NOT EXISTS links(id INTEGER PRIMARY KEY,a TEXT NOT NULL,b TEXT NOT NULL,kind TEXT NOT NULL,note TEXT DEFAULT '',UNIQUE(a,b,kind))`);
  try{db.exec("ALTER TABLE flags ADD COLUMN status TEXT NOT NULL DEFAULT 'FLAGGED'")}catch{} // upgrade older databases; fails harmlessly if the column exists
  if(!db.prepare('SELECT 1 x FROM contributors LIMIT 1').get())seed(db);
  load(db);
}
function seed(db){tx(db,()=>{
  const ip=db.prepare('INSERT INTO projects VALUES(?,?,?)'),ic=db.prepare('INSERT INTO contributors VALUES(?,?)'),pr=db.prepare('INSERT INTO prs(login,project,title,status,hours_ago) VALUES(?,?,?,?,?)'),iv=db.prepare('INSERT INTO vouches VALUES(?,?,?)'),id=db.prepare('INSERT INTO denounces VALUES(?,?,?,?)');
  for(const p of demo.projects)ip.run(p.id,p.stars,p.topic);
  for(const u of demo.users){ic.run(u.login,u.ageDays);for(const p of u.prs)pr.run(u.login,p.p,p.t,p.s,p.h);for(const v of u.vouches)iv.run(u.login,v[0],v[1]);for(const x of u.den)id.run(u.login,x[0],x[1],x[2])}})}
export function load(db){ // fills the shared arrays in place so lib/trust.js sees the new data
  const by=rows=>{const m=new Map();for(const r of rows)(m.get(r.login)||m.set(r.login,[]).get(r.login)).push(r);return m};
  const P=by(db.prepare('SELECT * FROM prs').all()),V=by(db.prepare('SELECT * FROM vouches').all()),D=by(db.prepare('SELECT * FROM denounces').all());
  projects.length=0;projects.push(...db.prepare('SELECT * FROM projects').all().map(r=>({id:r.id,stars:r.stars,topic:r.topic})));
  flags.clear();for(const r of db.prepare('SELECT * FROM flags').all())flags.set(r.login,{reason:r.reason,by:r.by,ts:r.ts,status:r.status||'FLAGGED'});
  links.length=0;links.push(...db.prepare('SELECT * FROM links').all().map(r=>({id:r.id,a:r.a,b:r.b,kind:r.kind,note:r.note})));
  users.length=0;
  for(const c of db.prepare('SELECT * FROM contributors').all())users.push({login:c.login,ageDays:c.age_days,prs:(P.get(c.login)||[]).map(r=>({p:r.project,t:r.title,s:r.status,h:r.hours_ago})),vouches:(V.get(c.login)||[]).map(r=>[r.project,r.note]),den:(D.get(c.login)||[]).map(r=>[r.project,r.reason,r.cred])});
}
export function reset(db){tx(db,()=>wipe(db));seed(db);load(db)}
function parseCSV(s){const rows=[];let r=[],f='',q=false;const end=()=>{r.push(f);f='';if(r.some(x=>x.trim()))rows.push(r);r=[]};
  for(let i=0;i<s.length;i++){const c=s[i];if(q){if(c==='"'){if(s[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){r.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;end()}else f+=c}
  end();return rows}
export function importCSV(db,csv,mode){
  const rows=parseCSV(csv),hd=(rows.shift()||[]).map(x=>x.trim().toLowerCase()),need=['type','login','project','text','number','status'];
  if(need.some(k=>!hd.includes(k)))return{errors:['First line must be: '+need.join(',')]};
  if(rows.length>2000)return{errors:['Max 2000 rows per import.']};
  const err=[],L=new Set(),Pj=new Set(),e=(o,m)=>err.length<10&&err.push(`Line ${o.line}: ${m}`);
  if(mode!=='replace'){db.prepare('SELECT login FROM contributors').all().forEach(r=>L.add(r.login));db.prepare('SELECT id FROM projects').all().forEach(r=>Pj.add(r.id))}
  const recs=rows.map((r,i)=>{const o=Object.fromEntries(hd.map((k,j)=>[k,(r[j]||'').trim()]));return{...o,line:i+2,type:o.type.toLowerCase(),login:o.login.toLowerCase(),project:o.project.toLowerCase(),status:(o.status||'merged').toLowerCase(),n:o.number===''?NaN:Number(o.number)}});
  const DEP=['pr','vouch','denounce'],KINDS=['vouch','denounce','suspicious'];
  for(const o of recs){if(o.text.length>300)e(o,'text too long (max 300 characters)');
    if(o.type==='project'){PID.test(o.project)?Pj.add(o.project):e(o,'project needs an id in the "project" column (letters, digits, - _ .)')}
    else if(o.type==='contributor'){GH.test(o.login)&&o.n>=0&&o.n<=20000?L.add(o.login):e(o,'contributor needs a GitHub username and number = account age in days')}
    else if(o.type!=='link'&&!DEP.includes(o.type))e(o,'type must be project, contributor, pr, vouch, denounce or link')}
  for(const o of recs){if(o.type!=='link')continue;
    if(!L.has(o.login))e(o,`link: unknown person "${o.login}" (add a contributor row first)`);
    if(!L.has(o.project))e(o,`link: unknown person "${o.project}" in the project column (it holds the person the link points to)`);
    if(o.login===o.project)e(o,'link: a person cannot link to themselves');
    if(!KINDS.includes(o.status))e(o,'link needs status = vouch, denounce or suspicious')}
  for(const o of recs){if(!DEP.includes(o.type))continue;
    if(!L.has(o.login))e(o,`unknown contributor "${o.login}" (add a contributor row for them first)`);
    if(!Pj.has(o.project))e(o,`unknown project "${o.project}" (add a project row for it first)`);
    if(o.type==='pr'&&(!(o.n>=0)||!['merged','open','closed'].includes(o.status)||!o.text))e(o,'pr needs text = title, number = hours ago, status = merged/open/closed');
    if(o.type==='vouch'&&!o.text)e(o,'vouch needs text = the reason');
    if(o.type==='denounce'&&(!o.text||!(o.n>=0&&o.n<=1)))e(o,'denounce needs text = reason and number between 0 and 1')}
  if(mode==='replace'&&!recs.some(o=>o.type==='contributor'))e({line:'-'},'replace mode needs at least one contributor row');
  if(err.length)return{errors:err};
  const c={project:0,contributor:0,pr:0,vouch:0,denounce:0,link:0};
  tx(db,()=>{if(mode==='replace')wipe(db);
    const S={project:db.prepare('INSERT OR REPLACE INTO projects VALUES(?,?,?)'),contributor:db.prepare('INSERT OR REPLACE INTO contributors VALUES(?,?)'),pr:db.prepare('INSERT INTO prs(login,project,title,status,hours_ago) VALUES(?,?,?,?,?)'),vouch:db.prepare('INSERT OR REPLACE INTO vouches VALUES(?,?,?)'),denounce:db.prepare('INSERT OR REPLACE INTO denounces VALUES(?,?,?,?)'),link:db.prepare('INSERT OR REPLACE INTO links(a,b,kind,note) VALUES(?,?,?,?)')};
    for(const o of recs){const k=o.type;
      if(k==='project')S[k].run(o.project,Number.isFinite(o.n)?Math.round(o.n):0,o.text);
      else if(k==='contributor')S[k].run(o.login,Math.round(o.n));
      else if(k==='pr')S[k].run(o.login,o.project,o.text,o.status,o.n);
      else if(k==='vouch')S[k].run(o.login,o.project,o.text);
      else if(k==='link')S[k].run(o.login,o.project,o.status,o.text);
      else S[k].run(o.login,o.project,o.text,o.n);c[k]++}});
  load(db);return{counts:c};
}

// Live GitHub data. PR rows for the synced projects are replaced (hours_ago is relative to sync time, so re-sync keeps it fresh).
export const trackedRepos=db=>db.prepare('SELECT id FROM tracked').all().map(r=>r.id);
export function syncGitHub(db,{projects:P,contributors:C,prs:R,vouches:V=[]},{clear=false,track=[]}={}){
  tx(db,()=>{if(clear)wipe(db);
    const ip=db.prepare('INSERT OR REPLACE INTO projects VALUES(?,?,?)'),ic=db.prepare('INSERT OR REPLACE INTO contributors VALUES(?,?)'),del=db.prepare('DELETE FROM prs WHERE project=?'),
      ipr=db.prepare('INSERT INTO prs(login,project,title,status,hours_ago) VALUES(?,?,?,?,?)'),it=db.prepare('INSERT OR REPLACE INTO tracked VALUES(?)');
    const dv=db.prepare("DELETE FROM vouches WHERE project=? AND note LIKE 'Auto:%'"),iv=db.prepare('INSERT OR IGNORE INTO vouches VALUES(?,?,?)');
    for(const p of P){ip.run(p.id,p.stars,p.topic);del.run(p.id);dv.run(p.id)}
    for(const c of C)ic.run(c.login,c.ageDays);
    for(const r of R)ipr.run(r.login,r.project,r.title,r.status,r.hours);
    for(const v of V)iv.run(v.login,v.project,v.note);
    for(const t of track)it.run(t)});
  load(db);return{counts:{project:P.length,contributor:C.length,pr:R.length}};
}

// Mock / manual person-to-person relationships (display only: they never change anyone's trust score).
export const LINK_KINDS=['vouch','denounce','suspicious'];
export const listLinks=db=>db.prepare('SELECT id,a,b,kind,note FROM links ORDER BY id DESC').all();
export const listPeople=db=>db.prepare('SELECT login FROM contributors ORDER BY login').all().map(r=>r.login);
export const addPerson=(db,login,age)=>{db.prepare('INSERT INTO contributors VALUES(?,?) ON CONFLICT(login) DO UPDATE SET age_days=excluded.age_days').run(login,age);load(db)};
export const addLink=(db,a,b,kind,note)=>{db.prepare('INSERT OR REPLACE INTO links(a,b,kind,note) VALUES(?,?,?,?)').run(a,b,kind,note||'');load(db)};
export const delLink=(db,id)=>{db.prepare('DELETE FROM links WHERE id=?').run(id);load(db)};

// Manual overrides (FLAGGED / SUSPICIOUS / SAFE) are admin decisions about a person; they survive data imports and are always shown with their reason.
export const listFlags=db=>db.prepare('SELECT login,status,reason,by,ts FROM flags ORDER BY ts DESC').all();
export const FLAG_STATUSES=['FLAGGED','SUSPICIOUS','SAFE'];
export const setFlag=(db,login,reason,by,status='FLAGGED')=>{db.prepare('INSERT INTO flags(login,reason,by,ts,status) VALUES(?,?,?,?,?) ON CONFLICT(login) DO UPDATE SET reason=excluded.reason,by=excluded.by,ts=excluded.ts,status=excluded.status').run(login,reason,by,Date.now(),status);load(db)};
export const clearFlag=(db,login)=>{db.prepare('DELETE FROM flags WHERE login=?').run(login);load(db)};