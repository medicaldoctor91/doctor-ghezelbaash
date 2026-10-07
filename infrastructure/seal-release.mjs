import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { sha256Hex, sha384Sri, contentDigestSha256 } from './lib/hash.mjs';
const execFileAsync=promisify(execFile);

async function exists(file){try{await fs.access(file);return true;}catch{return false;}}
async function walk(root){const out=[];async function visit(dir){for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else out.push(file);}}await visit(root);return out;}
function publicPath(root,file){return '/'+path.relative(root,file).split(path.sep).join('/');}
function mediaType(file){const registered=[...canonicalSource.machineResources,...(canonicalSource.delivery.releaseResources??[])].find(resource=>file.endsWith(resource.path));if(registered)return registered.mediaType;if(file.endsWith('/sbom.cdx.json'))return 'application/vnd.cyclonedx+json';if(file.endsWith('/_headers.content-digest.pending'))return 'text/plain';const ext=path.extname(file).toLowerCase();return ({'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.jsonld':'application/ld+json','.ttl':'text/turtle','.xml':'application/xml','.txt':'text/plain','.md':'text/markdown','.csv':'text/csv','.avif':'image/avif','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.mp4':'video/mp4','.webm':'video/webm','.woff2':'font/woff2','.ico':'image/x-icon'}[ext]??'application/octet-stream');}
function setIntegrity(tag,value){if(/\sintegrity=(?:"[^"]*"|'[^']*')/i.test(tag))return tag.replace(/(\sintegrity=)(?:"[^"]*"|'[^']*')/i,`$1"${value}"`);return tag.replace(/>$/,` integrity="${value}">`);}
function attr(tag,name){const m=new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`,'i').exec(tag);return m?.[1]??m?.[2];}
async function sriForReference(root,href){if(!href?.startsWith('/')||href.startsWith('//'))throw new Error(`SRI only supports same-origin absolute paths: ${href}`);const file=path.join(root,href.slice(1));if(!(await exists(file)))throw new Error(`SRI target missing: ${href}`);return sha384Sri(await fs.readFile(file));}
async function injectSri(root){for(const file of (await walk(root)).filter((f)=>f.endsWith('.html'))){let html=await fs.readFile(file,'utf8');const links=[...html.matchAll(/<link\b[^>]*>/gi)].map((m)=>m[0]);for(const tag of links){const rel=attr(tag,'rel'),href=attr(tag,'href');if(!href||!rel?.split(/\s+/).includes('stylesheet'))continue;html=html.replace(tag,setIntegrity(tag,await sriForReference(root,href)));}const scripts=[...html.matchAll(/<script\b[^>]*>/gi)].map((m)=>m[0]);for(const tag of scripts){const src=attr(tag,'src');if(!src)continue;html=html.replace(tag,setIntegrity(tag,await sriForReference(root,src)));}await fs.writeFile(file,html);}}
function digestEligible(file){return new Set(['.avif','.webp','.jpg','.jpeg','.png','.mp4','.webm','.woff2','.ico']).has(path.extname(file).toLowerCase());}
async function generateSbom(projectRoot,distDir){const {stdout}=await execFileAsync('npm',['sbom','--package-lock-only','--sbom-format','cyclonedx','--sbom-type','application'],{cwd:projectRoot,maxBuffer:64*1024*1024});const parsed=JSON.parse(stdout);if(parsed.bomFormat!=='CycloneDX')throw new Error('npm sbom did not produce CycloneDX');delete parsed.serialNumber;delete parsed.metadata.timestamp;const pkg=JSON.parse(await fs.readFile(path.join(projectRoot,'package.json'),'utf8'));parsed.metadata.component.name=pkg.name;await fs.writeFile(path.join(distDir,'sbom.cdx.json'),JSON.stringify(parsed,null,2)+'\n');return parsed;}
export async function sealRelease({distDir,projectRoot,releaseDate}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate))throw new Error('Invalid releaseDate');
  await injectSri(distDir);
  const sbom=await generateSbom(projectRoot,distDir);
  const eligible={};
  for(const file of await walk(distDir)){if(!digestEligible(file))continue;const bytes=await fs.readFile(file);eligible[publicPath(distDir,file)]={bytes:bytes.length,sha256:sha256Hex(bytes),contentDigest:contentDigestSha256(bytes)};}
  await fs.writeFile(path.join(distDir,'content-digest-eligibility.json'),JSON.stringify({status:'pending-live-byte-identity-verification',eligible},null,2)+'\n');
  const pending=Object.entries(eligible).sort(([a],[b])=>a.localeCompare(b)).map(([url,data])=>`${url}\n  Content-Digest: ${data.contentDigest}`).join('\n\n')+'\n';
  await fs.writeFile(path.join(distDir,'_headers.content-digest.pending'),pending);
  const lockBytes=await fs.readFile(path.join(projectRoot,'package-lock.json'));
  const {stdout:commit}=await execFileAsync('git',['rev-parse','HEAD'],{cwd:projectRoot});
  const provenance={sourceCommit:commit.trim(),releaseDate,packageLockSha256:sha256Hex(lockBytes),node:process.versions.node,sbom:{path:'/sbom.cdx.json',format:sbom.bomFormat,specVersion:sbom.specVersion},contentDigest:'pending-live-byte-identity-verification'};
  await fs.writeFile(path.join(distDir,'release-provenance.json'),JSON.stringify(provenance,null,2)+'\n');
  const files={};
  for(const file of await walk(distDir)){if(path.basename(file)==='integrity-manifest.json')continue;const bytes=await fs.readFile(file);files[publicPath(distDir,file)]={bytes:bytes.length,mediaType:mediaType(file),sha256:sha256Hex(bytes)};}
  await fs.writeFile(path.join(distDir,'integrity-manifest.json'),JSON.stringify({algorithm:'sha256',releaseDate,files},null,2)+'\n');
  return {manifestFiles:Object.keys(files).length,sbomComponents:sbom.components?.length??0,contentDigestEligible:Object.keys(eligible).length};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),distDir=path.resolve(process.argv[2]??path.join(root,'dist'));
  const source=canonicalSource;
  console.log(JSON.stringify(await sealRelease({distDir,projectRoot:root,releaseDate:source.edition}),null,2));
}
