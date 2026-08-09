import path from 'node:path';
import {readFile} from 'node:fs/promises';
const root=process.cwd(),inv=JSON.parse(await readFile(path.join(root,'src/data/release-invariants.json'),'utf8'));
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
const budgetProbe=await request('/','Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
const budgetBodyBytes=Buffer.byteLength(budgetProbe.text),budgetHeaderBytes=[...budgetProbe.r.headers].reduce((n,[k,v])=>n+Buffer.byteLength(`${k}: ${v}\r\n`),0);
if(budgetBodyBytes>=inv.maxHtmlBytes||budgetBodyBytes+budgetHeaderBytes+inv.googlebotSafetyMarginBytes>inv.googlebotFetchBudgetBytes)fail(`Production Googlebot response budget unsafe body=${budgetBodyBytes} headers=${budgetHeaderBytes}`);
const linkTags=[...budgetProbe.text.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]);
const hrefOf=tag=>(tag.match(/\bhref=["']([^"']+)["']/i)||[])[1];
const fingerprintLinks=linkTags.filter(tag=>/^\/assets\/site\.[0-9a-f]{12}\.css$/.test(hrefOf(tag)||''));
const preloadTag=fingerprintLinks.find(tag=>/\brel=["']preload["']/i.test(tag)&&/\bas=["']style["']/i.test(tag)&&/\bdata-deferred-stylesheet\b/i.test(tag));
const fallbackHtml=(budgetProbe.text.match(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi)||[]).join('\n');
const fallbackTag=fingerprintLinks.find(tag=>fallbackHtml.includes(tag)&&/\brel=["']stylesheet["']/i.test(tag));
const activeHtml=budgetProbe.text.replace(/<noscript\b[\s\S]*?<\/noscript>/gi,'');
if(!preloadTag||!fallbackTag||/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/i.test(activeHtml))fail('Production asynchronous stylesheet contract drift');
const cssHref=hrefOf(preloadTag),cssProbe=await request(cssHref,'Googlebot');
if(cssProbe.r.status!==200||!/max-age=31536000/i.test(cssProbe.r.headers.get('cache-control')||''))fail(`Production fingerprint stylesheet/cache drift ${cssProbe.r.status} ${cssProbe.r.headers.get('cache-control')||''}`);
const sectionAnswerCount=[...budgetProbe.text.matchAll(/<[a-z0-9:-]+\b[^>]*\bclass=["']([^"']+)["'][^>]*>/gi)].filter(m=>m[1].split(/\s+/).includes('section-answer')).length;
if(sectionAnswerCount<inv.integratedFullAnswerCount||budgetProbe.text.includes('direct-answer-capsules')||budgetProbe.text.includes('data-answer-id=')||budgetProbe.text.includes('id="best-doctor-query-matrix"'))fail(`Production native-answer integration drift ${sectionAnswerCount}/minimum-${inv.integratedFullAnswerCount}`);
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
 const graphGenericIndex=/index,\s*follow/i.test(graphX),graphGoogleNoindex=/googlebot:\s*noindex,\s*follow/i.test(graphX);
 if(!/index/i.test(rootX)||/noindex/i.test(rootX))fail(`${name} root X-Robots drift: ${rootX}`);
 if(graph.r.status!==200||!graphGenericIndex||!graphGoogleNoindex)fail(`${name} graph Search/agent policy drift: ${graph.r.status} ${graphX}`);
 if(graph.r.headers.get('access-control-allow-origin')!=='*')fail(`${name} graph CORS drift`);
 if(!/search=yes/.test(signal)||!/ai-input=yes/.test(signal)||!/ai-train=yes/.test(signal)||!/use=full/.test(signal))fail(`${name} Content-Signal drift: ${signal}`);
 matrix.push({name,root:root.r.status,graph:graph.r.status,rootXRobots:rootX,graphXRobots:graphX,effectiveGoogleSearchIndexing:name==='Googlebot'?'noindex':'not-applicable-scoped-rule',cfCacheStatus:root.r.headers.get('cf-cache-status')||null,age:root.r.headers.get('age')||null});
}
for(const f of ['/llms.txt','/llms-full.txt','/index.md','/answers.txt','/provenance.jsonld','/evidence-snapshot.json']){const x=await request(f,'OAI-SearchBot/1.0');if(x.r.status!==200)fail(`Machine endpoint unavailable ${f}: ${x.r.status}`);const xr=x.r.headers.get('x-robots-tag')||'';if(!/index,\s*follow/i.test(xr)||!/googlebot:\s*noindex,\s*follow/i.test(xr))fail(`Machine endpoint Search/agent policy drift ${f}: ${xr}`)}
const sitemap=await request('/sitemap.xml','Googlebot');if(sitemap.r.status!==200)fail(`sitemap status ${sitemap.r.status}`);const sitemapUrls=(sitemap.text.match(/<url>/g)||[]).length;if(sitemapUrls!==1||!sitemap.text.includes(`<loc>${base.href}</loc>`))fail(`Google-facing sitemap drift ${sitemapUrls}`);for(const rel of ['graph.jsonld','graph.ttl','entity-facts.csv','answers.txt','knowledge.xml','llms.txt','index.md','llms-full.txt','datapackage.json','linkset.json','void.ttl','dcat.ttl','croissant.json','provenance.jsonld','evidence-snapshot.json','shapes.ttl','artifact-manifest.json'])if(sitemap.text.includes(`<loc>${base.href}${rel}</loc>`))fail(`Machine URL leaked into production sitemap ${rel}`);
const missing=await request('/__release-integrity-missing__','Googlebot',{redirect:'manual'});if(missing.r.status!==404)fail(`Real 404 invariant failed: ${missing.r.status}`);
console.log(JSON.stringify({valid:true,base:base.href,cacheBypass:true,robotsStatus:robots.r.status,matrix,missingStatus:missing.r.status,managedRobotsConflictDetected:false,googlebotBudget:{bodyBytes:budgetBodyBytes,observedHeaderBytes:budgetHeaderBytes,safetyMarginBytes:inv.googlebotSafetyMarginBytes,fetchBudgetBytes:inv.googlebotFetchBudgetBytes},stylesheet:{href:cssHref,status:cssProbe.r.status,cacheControl:cssProbe.r.headers.get('cache-control')||null}},null,2));
