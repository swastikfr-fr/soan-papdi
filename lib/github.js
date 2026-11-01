// Pulls real data from the GitHub REST API: repo info, recent PRs, commit authors, and each author's account age.
// Denouncements are human judgments and are never created automatically. Vouches can be added via CSV; in addition,
// "Auto:" vouches are derived from real accepted work (3+ merged PRs/commits by someone other than the repo owner).
const API='https://api.github.com',GH=/^[a-z\d](?:[a-z\d-]{0,38})$/i,MAX_AUTHORS=300,AUTO_VOUCH_MIN=3;
// Accepts "owner/repo", a repo URL, a profile URL, or a bare username (= all of that user's public, non-fork repos).
export const parseTarget=v=>{if(typeof v!=='string')return null;
  const s=v.trim().replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i,'').replace(/^@/,'').replace(/\.git$/i,'').replace(/\/+$/,'');
  const m=s.match(/^([\w.-]+)\/([\w.-]+)(?:\/|$)/);if(m)return{owner:m[1],name:m[2].replace(/\.git$/i,'')};
  return GH.test(s)?{user:s}:null};
export const parseRepo=v=>{const t=parseTarget(v);return t&&t.name?t:null};
async function call(path,token){
  const r=await fetch(API+path,{signal:AbortSignal.timeout(15000),headers:{Accept:'application/vnd.github+json','User-Agent':'GitTrust','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:'Bearer '+token}:{})}});
  if(r.status===404||r.status===409)return null; // 409 = empty repository
  if(r.status===401)throw new Error('GITHUB_TOKEN was rejected by GitHub. Check the value in .env.');
  if(r.status===403||r.status===429)throw new Error('GitHub rate limit reached. Set GITHUB_TOKEN in .env (raises the limit from 60 to 5000 requests/hour) or try again later.');
  if(!r.ok)throw new Error('GitHub returned HTTP '+r.status+'.');
  return r.json()}
export async function expandTargets(targets,{token}={}){
  const out=[],seen=new Set(),add=r=>{const k=(r.owner+'/'+r.name).toLowerCase();if(!seen.has(k)&&out.length<15){seen.add(k);out.push({owner:r.owner,name:r.name})}};
  for(const t of targets){if(t.name){add(t);continue}
    const list=await call(`/users/${t.user}/repos?type=owner&sort=pushed&per_page=30`,token);
    if(!list)throw new Error(`GitHub user "${t.user}" was not found.`);
    list.filter(r=>!r.fork&&!r.private).slice(0,10).forEach(r=>add({owner:r.owner.login,name:r.name}))}
  return out}
const pool=async(items,n,fn)=>{const out=[];let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<items.length){const k=i++;out[k]=await fn(items[k])}}));return out};
export async function fetchGitHub(repos,{token,pages=2}={}){
  const now=Date.now(),projects=[],prs=[],authors=new Set(),ownerOf={};
  for(const{owner,name}of repos){
    const info=await call(`/repos/${owner}/${name}`,token);
    if(!info)throw new Error(`Repository ${owner}/${name} was not found (or is private).`);
    const id=`${owner}-${name}`.toLowerCase().slice(0,50);ownerOf[id]=owner.toLowerCase();
    projects.push({id,stars:info.stargazers_count||0,topic:String(info.topics?.[0]||info.language||'').toLowerCase().slice(0,40)});
    for(let pg=1;pg<=pages;pg++){
      const list=await call(`/repos/${owner}/${name}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${pg}`,token);
      if(!list?.length)break;
      for(const p of list){const lg=p.user?.login?.toLowerCase();
        if(!lg||p.user.type==='Bot'||!GH.test(lg))continue; // bots like dependabot are not people
        prs.push({login:lg,project:id,title:String(p.title||'').slice(0,200),status:p.merged_at?'merged':p.state==='open'?'open':'closed',hours:Math.max(0,(now-Date.parse(p.created_at))/36e5)});authors.add(lg)}
      if(list.length<100)break}
    // Direct commits count as accepted contributions, so people who push without PRs still appear.
    // Squash-merge / merge commits are skipped because their PR is already counted above.
    for(let pg=1;pg<=3;pg++){
      const cm=await call(`/repos/${owner}/${name}/commits?per_page=100&page=${pg}`,token);
      if(!cm?.length)break;
      for(const c of cm){const lg=c.author?.login?.toLowerCase(),msg=String(c.commit?.message||'').split('\n')[0];
        if(!lg||c.author.type==='Bot'||!GH.test(lg)||/^Merge (pull request|branch)|\(#\d+\)$/.test(msg))continue;
        prs.push({login:lg,project:id,title:(msg||'commit').slice(0,200),status:'merged',hours:Math.max(0,(now-Date.parse(c.commit.author.date))/36e5)});authors.add(lg)}
      if(cm.length<100)break}}
  const names=[...authors].slice(0,MAX_AUTHORS),ages=new Map();
  await pool(names,5,async lg=>{const u=await call('/users/'+lg,token);if(u?.created_at)ages.set(lg,Math.min(20000,Math.max(0,Math.floor((now-Date.parse(u.created_at))/864e5))))});
  const kept=prs.filter(p=>ages.has(p.login)),cnt=new Map();
  for(const p of kept)if(p.status==='merged'&&p.login!==ownerOf[p.project]){const k=p.login+'|'+p.project;cnt.set(k,(cnt.get(k)||0)+1)}
  const vouches=[...cnt].filter(([,n])=>n>=AUTO_VOUCH_MIN).map(([k,n])=>{const[login,project]=k.split('|');return{login,project,note:`Auto: ${n} accepted contributions (merged PRs/commits)`}});
  return{projects,contributors:[...ages].map(([login,ageDays])=>({login,ageDays})),prs:kept,vouches,skipped:authors.size-ages.size};
}