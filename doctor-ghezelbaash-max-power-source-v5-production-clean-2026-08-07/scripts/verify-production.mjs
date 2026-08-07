const base=new URL(process.argv[2]||'https://www.ghezelbaash.ir/');
const fail=m=>{throw new Error(m)};
const cacheBypass={'cache-control':'no-cache, no-store, max-age=0','pragma':'no-cache'};
const userAgents=[
 ['Googlebot','Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
 ['Google-Extended','Google-Extended'],['Google-CloudVertexBot','Google-CloudVertexBot'],
 ['OAI-SearchBot','OAI-SearchBot/1.0'],['GPTBot','GPTBot/1.0'],['ChatGPT-User','ChatGPT-User/1.0'],
 ['ClaudeBot','ClaudeBot/1.0'],['Claude-SearchBot','Claude-SearchBot/1.0'],['PerplexityBot','PerplexityBot/1.0'],['Perplexity-User','Perplexity-User/1.0'],
 ['Applebot','Applebot/0.1'],['DuckAssistBot','DuckAssistBot/1.0'],['Cloudflare-AI-Search','Cloudflare-AI-Search']
];
const request=async(path,ua,{redirect='follow'}={})=>{const r=await fetch(new URL(path,base),{redirect,cache:'no-store',headers:{...cacheBypass,'user-agent':ua}});return {r,text:await r.text()}};
const robots=await request('/robots.txt','Ghezelbash-Release-Integrity/5.0');
if(robots.r.status!==200)fail(`robots status ${robots.r.status}`);
if(!robots.text.includes('Content-Signal: search=yes, ai-input=yes, ai-train=yes, use=full'))fail('Production robots Content-Signal drift');
for(const [name] of userAgents){const block=new RegExp(`User-agent:\\s*${name}[\\s\\S]{0,160}?Disallow:\\s*/(?:\\s|$)`,'i');if(block.test(robots.text))fail(`Production robots blocks ${name}`)}
const matrix=[];
for(const [name,ua] of userAgents){
 const root=await request('/',ua),graph=await request('/graph.jsonld',ua);
 if(root.r.status!==200||!/دکتر سعید قزلباش/.test(root.text))fail(`${name} cannot retrieve canonical physician page (${root.r.status})`);
 if(!/ChIJBT0YDOTt-j8RD-7mAPy6Zas/.test(root.text))fail(`${name} canonical Place ID missing`);
 const rootX=root.r.headers.get('x-robots-tag')||'',graphX=graph.r.headers.get('x-robots-tag')||'',signal=root.r.headers.get('content-signal')||'';
 if(!/index/i.test(rootX)||/noindex/i.test(rootX))fail(`${name} root X-Robots drift: ${rootX}`);
 if(graph.r.status!==200||!/index/i.test(graphX)||/noindex/i.test(graphX))fail(`${name} graph indexability drift: ${graph.r.status} ${graphX}`);
 if(graph.r.headers.get('access-control-allow-origin')!=='*')fail(`${name} graph CORS drift`);
 if(!/search=yes/.test(signal)||!/ai-input=yes/.test(signal)||!/ai-train=yes/.test(signal)||!/use=full/.test(signal))fail(`${name} Content-Signal drift: ${signal}`);
 matrix.push({name,root:root.r.status,graph:graph.r.status,rootXRobots:rootX,graphXRobots:graphX,cfCacheStatus:root.r.headers.get('cf-cache-status')||null,age:root.r.headers.get('age')||null});
}
for(const f of ['/llms.txt','/llms-full.txt','/index.md','/answers.txt','/provenance.jsonld','/evidence-snapshot.json']){const x=await request(f,'OAI-SearchBot/1.0');if(x.r.status!==200)fail(`Machine endpoint unavailable ${f}: ${x.r.status}`);const xr=x.r.headers.get('x-robots-tag')||'';if(!/index/i.test(xr)||/noindex/i.test(xr))fail(`Machine endpoint indexing drift ${f}: ${xr}`)}
const missing=await request('/__release-integrity-missing-v5__','Googlebot',{redirect:'manual'});if(missing.r.status!==404)fail(`Real 404 invariant failed: ${missing.r.status}`);
console.log(JSON.stringify({valid:true,base:base.href,cacheBypass:true,robotsStatus:robots.r.status,matrix,missingStatus:missing.r.status,managedRobotsConflictDetected:false},null,2));
