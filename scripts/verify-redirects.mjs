import path from 'node:path';
import {readFile} from 'node:fs/promises';

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

    // Cloudflare may legitimately serve an exact static Pages redirect from edge
    // cache even when the client sends no-cache/no-store. Cache state is therefore
    // telemetry, not a correctness oracle. Status + Location are the authoritative
    // redirect contract and catch stale/wrong redirects directly.
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
