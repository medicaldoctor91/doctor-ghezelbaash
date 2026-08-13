import path from 'node:path';
import {readFile} from 'node:fs/promises';

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
  if(response.status>=300&&response.status<400){
    fail(`${method} ${unknownSource}: unmatched blog path unexpectedly redirects to ${response.headers.get('location')}`);
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
