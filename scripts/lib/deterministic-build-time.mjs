import {execFileSync} from 'node:child_process';

const SHA40=/^[0-9a-f]{40}$/i;
const EPOCH=/^[0-9]{9,12}$/;
const parseEpoch=(raw,label)=>{
  const s=String(raw??'').trim();
  if(!EPOCH.test(s))throw new Error(`${label} is not a valid Unix epoch: ${JSON.stringify(s)}`);
  const n=Number(s);if(!Number.isSafeInteger(n)||n<=0)throw new Error(`${label} epoch is invalid: ${s}`);return n;
};
const gitEpoch=(ref,cwd)=>{
  const out=execFileSync('git',['show','-s','--format=%ct',ref],{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  return parseEpoch(out,`git commit ${ref}`);
};
export function resolveDeterministicBuildInstant({releaseDate,cwd=process.cwd(),env=process.env}={}){
  const explicit=String(env.SOURCE_DATE_EPOCH??'').trim();
  if(explicit){const epochSeconds=parseEpoch(explicit,'SOURCE_DATE_EPOCH');return{epochSeconds,iso:new Date(epochSeconds*1000).toISOString()}}
  for(const key of ['CF_PAGES_COMMIT_SHA','SOURCE_COMMIT','GITHUB_SHA']){
    const ref=String(env[key]??'').trim();if(!ref)continue;
    if(!SHA40.test(ref))throw new Error(`${key} must be an exact 40-hex commit when SOURCE_DATE_EPOCH is absent`);
    try{const epochSeconds=gitEpoch(ref,cwd);return{epochSeconds,iso:new Date(epochSeconds*1000).toISOString()}}
    catch(error){throw new Error(`Cannot resolve deterministic build time from ${key}=${ref}: ${error.message}`)}
  }
  try{const epochSeconds=gitEpoch('HEAD',cwd);return{epochSeconds,iso:new Date(epochSeconds*1000).toISOString()}}
  catch(error){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(releaseDate||'')))throw new Error(`No deterministic commit time and invalid releaseDate fallback: ${error.message}`);
    const epochSeconds=Math.floor(Date.parse(`${releaseDate}T00:00:00.000Z`)/1000);
    return{epochSeconds,iso:new Date(epochSeconds*1000).toISOString()};
  }
}
