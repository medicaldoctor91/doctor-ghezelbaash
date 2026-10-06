import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { routeFileForPath } from './lib/dist-html.mjs';
import { extractSourceObject } from './finalize-dist.mjs';

const TEXT_EXTENSIONS=new Set(['.html','.css','.js','.json','.jsonld','.ttl','.xml','.txt','.md','.csv','.webmanifest']);
const vals=v=>Array.isArray(v)?v:v==null?[]:[v];
async function exists(file){try{await fs.access(file);return true;}catch{return false;}}
async function walk(root){const out=[];async function visit(dir){for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name);if(entry.isDirectory())await visit(file);else out.push(file);}}await visit(root);return out;}
function attr(tag,name){const m=new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`,'i').exec(tag);return m?.[1]??m?.[2];}
function firstTag(html,name){return new RegExp(`<${name}\\b[^>]*>`,'i').exec(html)?.[0];}
function scriptJson(html,id){const re=new RegExp(`<script\\b(?=[^>]*\\bid=["']${id.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}["'])[^>]*>([\\s\\S]*?)<\\/script>`,'i');const match=re.exec(html);if(!match)throw new Error(`Missing script #${id}`);return JSON.parse(match[1]);}
function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
function sri384(bytes){return 'sha384-'+createHash('sha384').update(bytes).digest('base64');}
function ensurePureSchemaGraph(document,label){assert.equal(document['@context'],'https://schema.org',`Pure Schema.org context ${label}`);for(const node of document['@graph']??[]){for(const key of Object.keys(node)){if(key.startsWith('@'))continue;assert.ok(!key.includes(':'),`Prefixed/custom Search property ${key} in ${label}`);}}}
function medicalPageNode(document,pageId){return (document['@graph']??[]).find(node=>node['@id']===pageId);}
function types(node){return vals(node?.['@type']);}
function refId(value){return typeof value==='string'?value:value?.['@id'];}

async function verifySri(html,distDir,label){
  for(const tag of html.match(/<link\b[^>]*>/gi)??[]){
    const rel=attr(tag,'rel'),href=attr(tag,'href');if(!href||!rel?.split(/\s+/).includes('stylesheet'))continue;
    const integrity=attr(tag,'integrity');assert.ok(integrity,`Missing stylesheet SRI ${label}`);assert.ok(href.startsWith('/')&&!href.startsWith('//'),`Non-local stylesheet ${label}`);
    const bytes=await fs.readFile(path.join(distDir,href.slice(1)));assert.equal(integrity,sri384(bytes),`Stylesheet SRI mismatch ${label}`);
  }
  for(const tag of html.match(/<script\b[^>]*>/gi)??[]){
    const src=attr(tag,'src');if(!src)continue;const integrity=attr(tag,'integrity');assert.ok(integrity,`Missing script SRI ${label}`);assert.ok(src.startsWith('/')&&!src.startsWith('//'),`Non-local script ${label}`);
    const bytes=await fs.readFile(path.join(distDir,src.slice(1)));assert.equal(integrity,sri384(bytes),`Script SRI mismatch ${label}`);
  }
}

export async function verifyDist({
  distDir,routes,origin='https://www.ghezelbaash.ir',physicianId=origin+'/#saeed-ghezelbash',clinicId=origin+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',
  expectedGraphNodes=1592,expectedVideos=4,sourceEdition,languageRoutes=[],requireMedicalSemantics=true,requireSbom=false,
}){
  assert.ok(Array.isArray(routes)&&routes.length>0&&new Set(routes).size===routes.length,'Unique canonical routes required');
  assert.match(sourceEdition,/^\d{4}-\d{2}-\d{2}$/,'sourceEdition');
  const htmlByRoute=new Map();
  for(const route of routes){
    const file=path.join(distDir,routeFileForPath(route));assert.ok(await exists(file),`Missing canonical HTML ${route}`);const html=await fs.readFile(file,'utf8');htmlByRoute.set(route,html);
    const canonical=(html.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi)??[]);assert.equal(canonical.length,1,`One canonical ${route}`);assert.equal(attr(canonical[0],'href'),origin+route,`Canonical href ${route}`);
    const root=firstTag(html,'html'),body=firstTag(html,'body');assert.ok(root&&body,`HTML/body ${route}`);for(const name of ['lang','dir'])assert.equal(attr(body,name),attr(root,name),`html/body ${name} ${route}`);
    const primary=firstTag(html,'article')??firstTag(html,'main')??firstTag(html,'section');if(primary){for(const name of ['lang','dir'])if(attr(primary,name))assert.equal(attr(primary,name),attr(root,name),`primary ${name} ${route}`);}
    assert.ok(!html.includes('pinterest.com/medicaldoctor91'),`Invalid Pinterest ${route}`);
    assert.ok(!new RegExp(`${origin.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}/saeed-ghezelbash(?:[?#]|["'<>\\s]|$)`).test(html),`Retired physician pathname ${route}`);
    const search=scriptJson(html,'schema-core-mainentity');ensurePureSchemaGraph(search,route);
    const pageId=route==='/'?origin+'/webpage':origin+route+'#webpage',page=medicalPageNode(search,pageId);assert.ok(page,`Search page node ${route}`);
    assert.ok((search['@graph']??[]).some(n=>n['@id']===physicianId&&types(n).includes('Person')),`Physician spine ${route}`);
    assert.ok((search['@graph']??[]).some(n=>n['@id']===clinicId&&types(n).includes('MedicalClinic')),`Clinic spine ${route}`);
    if(requireMedicalSemantics&&types(page).includes('MedicalWebPage')){
      assert.ok(vals(page.medicalAudience).some(a=>types(a).includes('Patient')),`Patient audience ${route}`);
      assert.equal(refId(page.reviewedBy),physicianId,`Reviewer ${route}`);assert.equal(page.lastReviewed,'2026-10-04',`lastReviewed ${route}`);assert.ok(page.specialty,`Specialty ${route}`);
    }
    await verifySri(html,distDir,route);
  }
  const home=htmlByRoute.get('/');assert.ok(!home.includes('canonical-knowledge-graph'),'Canonical graph must not be duplicated inline');const full=JSON.parse(await fs.readFile(path.join(distDir,'graph.jsonld'),'utf8'));assert.equal(full['@graph']?.length,expectedGraphNodes,'Canonical graph node count');
  assert.equal(full['@graph'].filter(n=>types(n).includes('ProfilePage')).length,1,'One ProfilePage');assert.ok(full['@graph'].some(n=>n['@id']===physicianId&&types(n).includes('Person')),'Canonical physician identity');
  for(const route of languageRoutes){const html=htmlByRoute.get(route);assert.ok(html,`Language route missing ${route}`);assert.match(html,/hreflang=["']x-default["'][^>]*href=["']https:\/\/www\.ghezelbaash\.ir\/aesthetic-guide-en["']|href=["']https:\/\/www\.ghezelbaash\.ir\/aesthetic-guide-en["'][^>]*hreflang=["']x-default["']/i,`x-default ${route}`);}
  const sitemap=await fs.readFile(path.join(distDir,'sitemap.xml'),'utf8');assert.equal((sitemap.match(/<url>/g)??[]).length,routes.length,'Sitemap canonical count');const lastmods=[...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m=>m[1]);assert.equal(lastmods.length,routes.length,'Sitemap lastmod count');assert.ok(lastmods.every(v=>v===sourceEdition),'Sitemap source date');const videoEntries=(sitemap.match(/<video:video>/g)??[]).length;assert.equal(videoEntries,expectedVideos,'Video sitemap count');
  const headers=await fs.readFile(path.join(distDir,'_headers'),'utf8');assert.match(headers,/https:\/\/:project\.pages\.dev\/\*[\s\S]*X-Robots-Tag: noindex/,'pages.dev noindex');assert.match(headers,/rel=describedby; type="application\/ld\+json"/,'JSON-LD HTTP discovery');assert.match(headers,/rel=describedby; type="text\/turtle"/,'Turtle HTTP discovery');assert.ok(headers.includes(`<${physicianId}>; rel=about`),'HTTP rel=about');
  const security=await fs.readFile(path.join(distDir,'.well-known/security.txt'),'utf8');assert.match(security,/^Contact: mailto:doctor@ghezelbaash\.ir$/m);assert.match(security,new RegExp(`^Canonical: ${origin.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}/\\.well-known/security\\.txt$`,'m'));assert.match(security,/^Preferred-Languages: fa, en$/m);const expiry=/^Expires: (.+)$/m.exec(security)?.[1];assert.ok(expiry&&Date.parse(expiry)>Date.parse(sourceEdition+'T00:00:00Z'),'security.txt future Expires');
  if(requireSbom){const sbom=JSON.parse(await fs.readFile(path.join(distDir,'sbom.cdx.json'),'utf8'));assert.equal(sbom.bomFormat,'CycloneDX','CycloneDX SBOM');}
  const provenance=JSON.parse(await fs.readFile(path.join(distDir,'release-provenance.json'),'utf8'));assert.equal(provenance.releaseDate,sourceEdition,'Provenance source date');
  const manifest=JSON.parse(await fs.readFile(path.join(distDir,'integrity-manifest.json'),'utf8'));assert.equal(manifest.algorithm,'sha256');assert.equal(manifest.releaseDate,sourceEdition);for(const [publicPath,meta] of Object.entries(manifest.files)){const file=path.join(distDir,publicPath.slice(1));const bytes=await fs.readFile(file);assert.equal(bytes.length,meta.bytes,`Manifest bytes ${publicPath}`);assert.equal(sha256(bytes),meta.sha256,`Manifest hash ${publicPath}`);}
  for(const file of await walk(distDir)){if(!TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())&&path.basename(file)!=='_headers')continue;const text=await fs.readFile(file,'utf8');assert.ok(!text.includes('pinterest.com/medicaldoctor91'),`Invalid Pinterest in ${path.relative(distDir,file)}`);}
  return {canonicalPages:routes.length,graphNodes:full['@graph'].length,videoEntries,integrityVerified:true,manifestFiles:Object.keys(manifest.files).length};
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const distDir=path.resolve(process.argv[2]??path.join(projectRoot,'dist'));const source=await extractSourceObject(path.join(projectRoot,'src/pages/index.astro'));const sourceEdition=source.edition;const languageRoutes=(source.discovery.translationGroups??[]).flatMap(g=>(g.members??[]).map(m=>m.path));
  const report=await verifyDist({distDir,routes:source.routes.resources.map(r=>r.path),origin:source.canonicalOrigin,physicianId:source.canonicalOrigin+'/#saeed-ghezelbash',clinicId:source.canonicalOrigin+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah',expectedGraphNodes:source.graph['@graph'].length,expectedVideos:source.discovery.sitemapPolicy.videoWatchPages.length,sourceEdition,languageRoutes,requireMedicalSemantics:true,requireSbom:true});console.log(JSON.stringify({distVerification:'PASS',...report},null,2));
}
