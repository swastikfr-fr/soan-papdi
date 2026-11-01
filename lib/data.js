// Demo data. Tuples: vouches [project,note]; denouncements [project,reason,credibility 0-1]; PR h = hours ago.
let s=7;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;const pick=a=>a[Math.floor(rnd()*a.length)];
const T=['fix: handle null in parser','feat: add retry option','docs: clarify install steps','refactor: simplify config loader','test: add edge-case coverage','perf: cache lookups','fix: race in worker pool','chore: update CI matrix'];
const gen=(n,ps,span)=>Array.from({length:n},()=>({p:pick(ps),t:pick(T),s:'merged',h:Math.floor(240+rnd()*24*span)}));
const u=(login,ageDays,prs,vouches=[],den=[])=>({login,ageDays,prs,vouches,den});
const P=['kernelkit','pixelforge','openmetrics','tinyhttp','docuflow','authlite'];
export const projects=[['kernelkit',18400,'systems'],['pixelforge',9200,'graphics'],['openmetrics',7100,'observability'],['tinyhttp',5300,'web'],['docuflow',3900,'docs'],['authlite',2600,'security']].map(([id,stars,topic])=>({id,stars,topic}));
const camp=(i,p,t,h,s='closed')=>({p,t,s,h:h+i*.15});
const CT=['chore: bump colour-utils to 1.4.2','update dependency colour-utils 1.4.2','deps: colour-utils 1.4.2 update'];
export const users=[
 u('mira-chen',1500,gen(40,['kernelkit','pixelforge','openmetrics','docuflow'],900),[['kernelkit','Careful reviewer, consistently high-quality patches'],['pixelforge','Maintains our shader module'],['openmetrics','Reliable across three releases'],['docuflow','Excellent docs contributions']]),
 u('arjun-new',12,[{p:'kernelkit',t:'docs: fix README typo',s:'open',h:30}],[['docuflow','Clear first docs PR, welcome aboard']]),
 u('jules-okafor',1100,[...gen(30,['kernelkit','openmetrics'],800),...Array.from({length:12},(_,i)=>({p:['kernelkit','pixelforge','openmetrics','tinyhttp'][i%4],t:'chore: bump dependencies',s:'open',h:2+i*2}))],[['kernelkit','Long-time maintainer-level contributor'],['openmetrics','Fixed our exporter bugs']],[['tinyhttp','Bulk PR with unexplained lockfile changes',.5]]),
 u('null-byte-77',160,[0,1,2,3,4].map(i=>camp(i,P[i%4],CT[i%3],50)),[],[['kernelkit','Dependency swap to unknown package',.9],['pixelforge','Same PR submitted to us minutes apart',.8],['tinyhttp','Obfuscated postinstall script',.8]]),
 u('pr-farmer-01',21,[0,1,2].map(i=>camp(i,P[(i+1)%5],CT[i%3],50.7)),[],[['authlite','Matching PR, no engagement with review',.7],['tinyhttp','Matching PR, no engagement with review',.7]]),
 u('pr-farmer-02',23,[0,1,2].map(i=>camp(i,P[(i+2)%5],CT[(i+1)%3],51.3))),
 u('pr-farmer-03',20,[0,1].map(i=>camp(i,P[(i+3)%5],CT[(i+2)%3],51.9))),
 u('lena-voss',900,gen(18,['pixelforge','tinyhttp','authlite'],700),[['pixelforge','Great shader fixes'],['tinyhttp','Solid HTTP/2 work'],['authlite','Security-minded reviewer']]),
 u('ravi-k',700,gen(14,['openmetrics','docuflow','kernelkit'],600),[['openmetrics','Reliable'],['docuflow','Helpful and responsive']]),
 u('tomas-b',500,gen(12,['kernelkit','authlite','tinyhttp'],450),[['kernelkit','Thoughtful PRs'],['authlite','Found a real CVE, responsibly disclosed']]),
 u('yuki-s',1200,gen(25,['pixelforge','docuflow','openmetrics'],1000),[['pixelforge','Maintainer-grade'],['docuflow','Writes superb docs'],['openmetrics','Dependable']]),
 u('first-pr-ines',5,[{p:'docuflow',t:'docs: add Spanish quickstart',s:'open',h:60}]),
 u('coder-pia',9,[{p:'tinyhttp',t:'fix: typo in error message',s:'merged',h:100}],[['tinyhttp','Clean first contribution']]),
 u('newbie-sam',3,[])
];

// Person-to-person links (mock/manual relationships shown in the network): {id,a,b,kind,note}
export const links=[];

// Manual admin flags: login -> {reason,by,ts}. They persist across data imports.
export const flags=new Map();