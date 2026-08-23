import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

async function verifyRedirects(){
  const root=process.cwd();
  const base=new URL(process.argv[2]||'https://www.ghezelbaash.ir/');
  const redirectsText=await readFile(path.join(root,'dist/_redirects'),'utf8');
  const fail=m=>{throw new Error(m)};

  const rows=[];
  const seen=new Set();
  for(const [index,raw] of redirectsText.split(/\r?\n/).entries()){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const parts=line.split(/\s+/);
    if(parts.length!==3)fail(`_redirects line ${index+1} must have source target status`);
    const [source,target,statusRaw]=parts,status=Number(statusRaw);
    if(!source.startsWith('/'))fail(`_redirects line ${index+1} source must be root-relative: ${source}`);
    if(!Number.isInteger(status)||status<300||status>399)fail(`_redirects line ${index+1} has invalid redirect status: ${statusRaw}`);
    if(seen.has(source))fail(`Duplicate _redirects source: ${source}`);
    if(/[*:]/.test(source))fail(`Production verifier requires an explicit probe fixture for patterned redirect source: ${source}`);
    seen.add(source);
    rows.push({line:index+1,source,target,status});
  }
  if(!rows.length)fail('No production redirects found in dist/_redirects');

  const request=async(source,{noCache=false,method='GET'}={})=>{
    const headers={'user-agent':'ghezelbaash-redirect-integrity/1.1','accept':'*/*'};
    if(noCache){
      headers['cache-control']='no-cache, no-store, max-age=0';
      headers['pragma']='no-cache';
    }
    const response=await fetch(new URL(source,base),{
      method,
      redirect:'manual',
      cache:noCache?'no-store':'default',
      headers,
      signal:AbortSignal.timeout(20_000),
    });
    if(method!=='HEAD')await response.arrayBuffer();
    return response;
  };

  const normalizeLocation=value=>{
    if(!value)return null;
    return new URL(value,base).href;
  };

  const tasks=[];
  for(const row of rows){
    const expected=normalizeLocation(row.target);
    for(const mode of [
      {label:'normal-get',noCache:false,method:'GET'},
      {label:'no-cache-get',noCache:true,method:'GET'},
      {label:'no-cache-head',noCache:true,method:'HEAD'},
    ]){
      tasks.push({row,expected,mode});
    }
  }

  const observations=new Array(tasks.length);
  let cursor=0;
  const worker=async()=>{
    while(cursor<tasks.length){
      const index=cursor++;
      const {row,expected,mode}=tasks[index];
      let response;
      try{
        response=await request(row.source,mode);
      }catch(error){
        fail(`${mode.label} ${row.source}: request failed: ${error instanceof Error?error.message:String(error)}`);
      }
      const location=response.headers.get('location');
      const normalized=normalizeLocation(location);
      const cache=(response.headers.get('cf-cache-status')||'').toUpperCase();
      const age=response.headers.get('age');
      if(response.status!==row.status)fail(`${mode.label} ${row.source}: HTTP ${response.status}, expected ${row.status}`);
      if(normalized!==expected)fail(`${mode.label} ${row.source}: Location=${location}, expected ${row.target}`);

      observations[index]={
        source:row.source,
        target:row.target,
        status:response.status,
        mode:mode.label,
        cfCacheStatus:cache||null,
        age:age||null,
      };
    }
  };
  await Promise.all(Array.from({length:Math.min(12,tasks.length)},worker));

  console.log(JSON.stringify({
    valid:true,
    base:base.href,
    redirectRuleCount:rows.length,
    probes:observations.length,
    observations,
  },null,2));
}
async function verifySubdomains(){
  const root=process.cwd();
  const contract=JSON.parse(await readFile(path.join(root,'src/data/subdomain-redirects.json'),'utf8'));
  const fail=message=>{throw new Error(message)};
  const headers={
    'user-agent':'ghezelbaash-subdomain-integrity/2.0',
    accept:'*/*',
    'cache-control':'no-cache, no-store, max-age=0',
    pragma:'no-cache'
  };

  const tasks=[];
  for(const rule of contract.singleRedirects.rules){
    for(const sourcePath of ['/','/__subdomain_redirect_contract_unknown__?utm_source=integrity']){
      for(const method of ['GET','HEAD']){
        tasks.push({
          kind:'single',
          ref:rule.ref,
          method,
          source:`https://${rule.host}${sourcePath}`,
          statusCode:rule.statusCode,
          target:rule.target
        });
      }
    }
  }

  for(const group of contract.bulkRedirects.groups){
    for(const sourcePath of group.paths){
      for(const method of ['GET','HEAD']){
        tasks.push({
          kind:'bulk',
          ref:group.ref,
          method,
          source:`https://${contract.bulkRedirects.host}${sourcePath}`,
          statusCode:group.statusCode,
          target:group.target
        });
      }
    }
  }

  const firstArticle=contract.bulkRedirects.groups
    .flatMap(group=>group.paths.map(sourcePath=>({group,sourcePath})))
    .find(({sourcePath})=>sourcePath.endsWith('.html'));
  if(!firstArticle)fail('No historical article exists for the query-string probe');
  tasks.push({
    kind:'bulk-query',
    ref:firstArticle.group.ref,
    method:'GET',
    source:`https://${contract.bulkRedirects.host}${firstArticle.sourcePath}?utm_source=integrity`,
    statusCode:firstArticle.group.statusCode,
    target:firstArticle.group.target
  });

  const request=async task=>{
    const response=await fetch(task.source,{
      method:task.method,
      redirect:'manual',
      cache:'no-store',
      signal:AbortSignal.timeout(20_000),
      headers
    });
    if(task.method==='GET')await response.arrayBuffer();
    const location=response.headers.get('location');
    const normalized=location?new URL(location,task.source).href:null;
    const expected=new URL(task.target).href;
    if(response.status!==task.statusCode){
      fail(`${task.method} ${task.source}: HTTP ${response.status}, expected ${task.statusCode}`);
    }
    if(normalized!==expected){
      fail(`${task.method} ${task.source}: Location=${location}, expected ${task.target}`);
    }
    return {kind:task.kind,method:task.method,status:response.status};
  };

  const observations=new Array(tasks.length);
  let cursor=0;
  const worker=async()=>{
    while(cursor<tasks.length){
      const index=cursor++;
      observations[index]=await request(tasks[index]);
    }
  };
  await Promise.all(Array.from({length:Math.min(12,tasks.length)},worker));

  const unknownSource=`https://${contract.bulkRedirects.host}/__unmatched_historical_blog_path__`;
  for(const method of ['GET','HEAD']){
    const response=await fetch(unknownSource,{
      method,
      redirect:'manual',
      cache:'no-store',
      signal:AbortSignal.timeout(20_000),
      headers
    });
    if(method==='GET')await response.arrayBuffer();
    if(response.status!==404){
      fail(`${method} ${unknownSource}: HTTP ${response.status}, expected 404`);
    }
    if(response.headers.get('location')){
      fail(`${method} ${unknownSource}: 404 response unexpectedly carries Location=${response.headers.get('location')}`);
    }
    const robots=(response.headers.get('x-robots-tag')||'').toLowerCase();
    if(!robots.includes('noindex')){
      fail(`${method} ${unknownSource}: missing noindex X-Robots-Tag`);
    }
    const cacheControl=(response.headers.get('cache-control')||'').toLowerCase();
    if(!cacheControl.includes('no-store')){
      fail(`${method} ${unknownSource}: missing no-store fallback cache policy`);
    }
  }

  const counts=observations.reduce((summary,row)=>{
    summary[row.kind]=(summary[row.kind]||0)+1;
    return summary;
  },{});
  console.log(JSON.stringify({
    valid:true,
    cacheBypass:true,
    singleRedirectRules:contract.singleRedirects.rules.length,
    historicalBlogUrls:contract.bulkRedirects.groups.reduce((sum,group)=>sum+group.paths.length,0),
    visiblePassageTargets:new Set(contract.bulkRedirects.groups.map(group=>group.target)).size,
    unmatchedBlogPolicy:contract.bulkRedirects.unmatchedPathPolicy,
    probeCount:observations.length+2,
    probesByKind:counts
  },null,2));
}
async function verifyCore(){
  const root=process.cwd(),inv=JSON.parse(await readFile(path.join(root,'src/data/release-invariants.json'),'utf8'));
  const base=new URL(process.argv[2]||'https://www.ghezelbaash.ir/');
  const fail=m=>{throw new Error(m)};
  const edgeOutcomePath=process.env.EDGE_RECONCILIATION_OUTCOME;
  const edgeOutcome=edgeOutcomePath?JSON.parse(await readFile(path.resolve(root,edgeOutcomePath),'utf8')):null;
  const edgeCapabilities=edgeOutcome?.capabilities||null;
  if(edgeOutcomePath){
   if(edgeOutcome?.schemaVersion!==1)fail('Cloudflare edge outcome schema drift');
   const required=['pagesProject','dns','zoneSettings','cacheRule','hstsTransformRule','notFoundTransformRule','historicalBlogBulkRedirects','subdomainRedirectRules','botManagement','purgeCache'];
   const missing=required.filter(name=>edgeCapabilities?.[name]!==true);
   if(missing.length)fail(`Cloudflare edge outcome is not exact: ${missing.join(', ')}`);
   if((edgeOutcome?.scopeGaps||[]).length)fail(`Cloudflare edge outcome retains scope gaps: ${JSON.stringify(edgeOutcome.scopeGaps)}`);
  }
  const enforceHsts=!edgeCapabilities||Boolean(edgeCapabilities.zoneSettings||edgeCapabilities.hstsTransformRule);
  const enforce404=!edgeCapabilities||Boolean(edgeCapabilities.notFoundTransformRule);
  const headersText=await readFile(path.join(root,'dist/_headers'),'utf8');
  const headerBlock=route=>{const lines=headersText.split(/\r?\n/),i=lines.indexOf(route);if(i<0)fail(`Missing DIST header block ${route}`);const out=[];for(let j=i+1;j<lines.length&&/^\s/.test(lines[j]);j++)out.push(lines[j].trim());return out};
  const expectedHeader=(route,name)=>{const prefix=`${name.toLowerCase()}:`;const line=headerBlock(route).find(x=>x.toLowerCase().startsWith(prefix));if(!line)fail(`Missing DIST ${name} for ${route}`);return line.slice(line.indexOf(':')+1).trim()};
  const expectedRootCsp=expectedHeader('/','Content-Security-Policy'),expected404Csp=expectedHeader('/404.html','Content-Security-Policy');
  const cacheBypass={'cache-control':'no-cache, no-store, max-age=0','pragma':'no-cache'};
  const userAgents=[
   ['Googlebot','Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
   ['Google-Extended','Google-Extended'],['Google-CloudVertexBot','Google-CloudVertexBot'],
   ['OAI-SearchBot','OAI-SearchBot/1.0'],['GPTBot','GPTBot/1.0'],['ChatGPT-User','ChatGPT-User/1.0'],
   ['ClaudeBot','ClaudeBot/1.0'],['Claude-SearchBot','Claude-SearchBot/1.0'],['PerplexityBot','PerplexityBot/1.0'],['Perplexity-User','Perplexity-User/1.0'],
   ['Applebot','Applebot/0.1'],['DuckAssistBot','DuckAssistBot/1.0'],['Cloudflare-AI-Search','Cloudflare-AI-Search']
  ];
  const request=async(path,ua,{redirect='follow'}={})=>{const r=await fetch(new URL(path,base),{redirect,cache:'no-store',headers:{...cacheBypass,'user-agent':ua}});return {r,text:await r.text()}};
  let budgetProbe;
  const productionPropagationAttempts=46;
  for(let attempt=1;attempt<=productionPropagationAttempts;attempt++){
   budgetProbe=await request('/','Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)');
   const liveDigest=`sha-256=:${createHash('sha256').update(Buffer.from(budgetProbe.text)).digest('base64')}:`;
   if(budgetProbe.r.headers.get('content-security-policy')===expectedRootCsp&&budgetProbe.r.headers.get('repr-digest')===liveDigest)break;
   if(attempt===productionPropagationAttempts)fail(`Production root did not converge to finalized CSP/digest after ${attempt} attempts`);
   console.warn(JSON.stringify({stage:'PRODUCTION_PROPAGATION_WAIT',attempt,expectedCspSha256:createHash('sha256').update(expectedRootCsp).digest('hex'),liveCspSha256:createHash('sha256').update(budgetProbe.r.headers.get('content-security-policy')||'').digest('hex'),expectedDigest:liveDigest,liveDigest:budgetProbe.r.headers.get('repr-digest'),etag:budgetProbe.r.headers.get('etag'),cfCacheStatus:budgetProbe.r.headers.get('cf-cache-status'),age:budgetProbe.r.headers.get('age'),cfRay:budgetProbe.r.headers.get('cf-ray')}));
   await new Promise(resolve=>setTimeout(resolve,4000));
  }
  const budgetBodyBytes=Buffer.byteLength(budgetProbe.text),budgetHeaderBytes=[...budgetProbe.r.headers].reduce((n,[k,v])=>n+Buffer.byteLength(`${k}: ${v}\r\n`),0);
  if(budgetBodyBytes>=inv.maxHtmlBytes||budgetBodyBytes+budgetHeaderBytes+inv.googlebotSafetyMarginBytes>inv.googlebotFetchBudgetBytes)fail(`Production Googlebot response budget unsafe body=${budgetBodyBytes} headers=${budgetHeaderBytes}`);
  if(budgetProbe.r.headers.get('content-security-policy')!==expectedRootCsp)fail('Production root CSP differs from finalized DIST');
  const hsts=budgetProbe.r.headers.get('strict-transport-security')||'';if(enforceHsts&&(!/max-age=63072000/i.test(hsts)||!/includeSubDomains/i.test(hsts)||!/preload/i.test(hsts)))fail(`Production HSTS differs from finalized DIST intent: ${hsts}`);if(!enforceHsts)console.warn(`HSTS_SCOPE_GAP live=${hsts}`);
  const expectedRootDigest=`sha-256=:${createHash('sha256').update(Buffer.from(budgetProbe.text)).digest('base64')}:`;if(budgetProbe.r.headers.get('repr-digest')!==expectedRootDigest)fail('Production root Repr-Digest/body drift');
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
  const localDistHtml=await readFile(path.join(root,'dist/index.html'),'utf8'),expectedSectionAnswerCount=[...localDistHtml.matchAll(/<[a-z0-9:-]+\b[^>]*\bclass=["']([^"']+)["'][^>]*>/gi)].filter(m=>m[1].split(/\s+/).includes('section-answer')).length;
  if(sectionAnswerCount!==expectedSectionAnswerCount||budgetProbe.text.includes('direct-answer-capsules')||budgetProbe.text.includes('data-answer-id=')||budgetProbe.text.includes('id="best-doctor-query-matrix"'))fail(`Production native-answer integration drift ${sectionAnswerCount}/expected-${expectedSectionAnswerCount}`);
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
  let missing,missingX='';
  const missingContractExact=probe=>probe.r.status===404&&probe.r.headers.get('cache-control')==='no-store'&&(!enforce404||(/noindex/i.test(probe.r.headers.get('x-robots-tag')||'')&&probe.r.headers.get('content-language')==='fa-IR'&&probe.r.headers.get('content-security-policy')===expected404Csp));
  for(let attempt=1;attempt<=productionPropagationAttempts;attempt++){
   missing=await request('/__release-integrity-missing__','Googlebot',{redirect:'manual'});missingX=missing.r.headers.get('x-robots-tag')||'';
   if(missingContractExact(missing))break;
   if(attempt===productionPropagationAttempts)fail(`Production real-404 edge contract did not converge after ${attempt} attempts: status=${missing.r.status} x-robots=${missingX} language=${missing.r.headers.get('content-language')} cache=${missing.r.headers.get('cache-control')} expected-csp-sha256=${createHash('sha256').update(expected404Csp).digest('hex')} live-csp-sha256=${createHash('sha256').update(missing.r.headers.get('content-security-policy')||'').digest('hex')}`);
   console.warn(JSON.stringify({stage:'PRODUCTION_404_PROPAGATION_WAIT',attempt,status:missing.r.status,xRobots:missingX,language:missing.r.headers.get('content-language'),cacheControl:missing.r.headers.get('cache-control'),expectedCspSha256:createHash('sha256').update(expected404Csp).digest('hex'),liveCspSha256:createHash('sha256').update(missing.r.headers.get('content-security-policy')||'').digest('hex'),cfRay:missing.r.headers.get('cf-ray')}));
   await new Promise(resolve=>setTimeout(resolve,4000));
  }
  if(!enforce404)console.warn(`REAL_404_TRANSFORM_SCOPE_GAP x-robots=${missingX||'(missing)'}`);
  console.log(JSON.stringify({valid:true,base:base.href,cacheBypass:true,robotsStatus:robots.r.status,edgeCapabilities,edgeScopeGaps:edgeOutcome?.scopeGaps||[],matrix,missingStatus:missing.r.status,missingXRobots:missingX,managedRobotsConflictDetected:false,googlebotBudget:{bodyBytes:budgetBodyBytes,observedHeaderBytes:budgetHeaderBytes,safetyMarginBytes:inv.googlebotSafetyMarginBytes,fetchBudgetBytes:inv.googlebotFetchBudgetBytes},stylesheet:{href:cssHref,status:cssProbe.r.status,cacheControl:cssProbe.r.headers.get('cache-control')||null}},null,2));
}
const command=process.argv[2]||'full';
process.argv.splice(2,1);
if(command==='redirects')await verifyRedirects();
else if(command==='subdomains')await verifySubdomains();
else if(command==='core')await verifyCore();
else if(command==='full'){await verifyRedirects();await verifySubdomains();await verifyCore();}
else throw new Error('Usage: node scripts/verify-production.mjs <full|redirects|subdomains|core> [base]');
