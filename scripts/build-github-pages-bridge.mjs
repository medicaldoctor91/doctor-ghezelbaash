import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';

const root=process.cwd();
export const canonical='https://www.ghezelbaash.ir/';
const {content:sourceHtml}=await assembleCanonicalContent({root});
assert.ok(sourceHtml.length>0,'Canonical assembled page is empty');

export const humanRoutes=[
  ['index.html',canonical,'وب‌سایت رسمی دکتر سعید قزلباش'],
  ['contact/index.html',`${canonical}#saeed-ghezelbash-clinic-contact-and-location`,'تماس و نشانی کلینیک دکتر سعید قزلباش'],
  ['dr-saeed-ghezelbash-aesthetic-clinic/index.html',`${canonical}#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah`,'کلینیک زیبایی دکتر سعید قزلباش'],
  ['dr-saeed-ghezelbash/index.html',`${canonical}#verified-physician-identity-core`,'هویت رسمی دکتر سعید قزلباش'],
  ['evidence/index.html',`${canonical}#medical-content-governance`,'شواهد و حاکمیت محتوای پزشکی'],
  ['kg/index.html',`${canonical}#verified-physician-identity-core`,'گراف هویت دکتر سعید قزلباش'],
  ['regulatory/index.html',`${canonical}#medical-content-governance`,'حاکمیت محتوای پزشکی'],
  ['research/index.html',`${canonical}#saeed-ghezelbash-research-education-and-clinical-decisions`,'پژوهش و آموزش دکتر سعید قزلباش'],
  ['services/index.html',`${canonical}#aesthetic-clinical-decision-pathway`,'خدمات و مسیر تصمیم‌گیری بالینی'],
  ['botox-kermanshah/index.html',`${canonical}#botox`,'بوتاکس در کرمانشاه'],
  ['filler-kermanshah/index.html',`${canonical}#filler`,'فیلر در کرمانشاه'],
  ['thread-lift-kermanshah/index.html',`${canonical}#thread-lift`,'لیفت نخ در کرمانشاه'],
  ['skin-hair-rejuvenation-kermanshah/index.html',`${canonical}#skin-rejuvenation`,'جوان‌سازی پوست و مو در کرمانشاه'],
  ['double-chin-liposuction-kermanshah/index.html',`${canonical}#submental-fat-and-neck-contour`,'فرم‌دهی غبغب و زیرچانه در کرمانشاه'],
  ['aesthetic-medicine-dataset.html',`${canonical}#medical-content-governance`,'داده‌های پزشکی زیبایی دکتر سعید قزلباش'],
  ['google-maps-review-evidence.html',`${canonical}#google-maps-clinic-reputation-current`,'شواهد حضور کلینیک در Google Maps'],
];

export const machineRoutes=[
  ['ai-discovery-index.json',`${canonical}artifact-manifest.json`],
  ['authority-signals.json',`${canonical}evidence-snapshot.json`],
  ['brand-kb.ghezelbaash.ai-public.json',`${canonical}graph.jsonld`],
  ['dataset.json',`${canonical}datapackage.json`],
  ['entity-hardening-index.json',`${canonical}artifact-manifest.json`],
  ['location.json',`${canonical}graph.jsonld`],
  ['profile-links.json',`${canonical}linkset.json`],
  ['sameas.json',`${canonical}linkset.json`],
  ['service-taxonomy.json',`${canonical}graph.jsonld`],
  ['services.json',`${canonical}answers.txt`],
  ['aesthetic_medicine_knowledge_kermanshah_fa.json',`${canonical}graph.jsonld`],
  ['dr-ghezelbaash-kermanshah-aesthetic-benchmark-2026-real-competitor-dominance.json',`${canonical}evidence-snapshot.json`],
  ['dataset-manifest.jsonld',`${canonical}datapackage.json`],
  ['graph-ghezelbaash-final.jsonld',`${canonical}graph.jsonld`],
  ['publishing-crosswalk.jsonld',`${canonical}linkset.json`],
];

export const escapeHtml=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export const redirectHtml=(target,title)=>`<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
<link rel="canonical" href="${canonical}">
<title>${escapeHtml(title)} — انتقال به نشانی رسمی</title>
<meta name="description" content="این نشانی قدیمی به وب‌سایت رسمی و کانونیکال دکتر سعید قزلباش منتقل شده است.">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7fb;color:#18223a;font:1rem/1.9 system-ui,sans-serif}main{max-width:42rem;margin:1rem;padding:2rem;border:1px solid #dce3ef;border-radius:1rem;background:#fff;box-shadow:0 1rem 3rem #18223a18}a{color:#0758b7;font-weight:700}</style>
</head>
<body><main><h1>${escapeHtml(title)}</h1><p>این صفحه به نشانی رسمی و به‌روز منتقل شده است.</p><p><a href="${escapeHtml(target)}">ورود به وب‌سایت رسمی دکتر سعید قزلباش</a></p></main><script>location.replace(${JSON.stringify(target)})</script></body>
</html>
`;

async function write(rootDir,relative,content){
  const destination=path.join(rootDir,relative);
  await mkdir(path.dirname(destination),{recursive:true});
  await writeFile(destination,content,'utf8');
}

export async function build(outDir){
  await mkdir(outDir,{recursive:false});
  for(const [relative,target,title] of humanRoutes){
    const fragment=new URL(target).hash.slice(1);
    if(fragment)assert.match(sourceHtml,new RegExp(`id=["']${fragment}["']`),`Missing canonical fragment ${fragment}`);
    await write(outDir,relative,redirectHtml(target,title));
  }
  await write(outDir,'404.html',redirectHtml(canonical,'نشانی قدیمی وب‌سایت دکتر سعید قزلباش'));
  for(const [relative,target] of machineRoutes){
    await write(outDir,relative,`${JSON.stringify({schemaVersion:1,status:'moved-permanently',deprecated:true,canonicalEntity:`${canonical}#dr-saeed-ghezelbash`,canonicalSite:canonical,movedTo:target},null,2)}\n`);
  }
  await write(outDir,'llms.txt',`STATUS: MOVED_PERMANENTLY\nCANONICAL_SITE: ${canonical}\nMOVED_TO: ${canonical}llms.txt\n`);
  await write(outDir,'nap.csv',`status,canonical_site,moved_to\nmoved-permanently,${canonical},${canonical}entity-facts.csv\n`);
  await write(outDir,'.nojekyll','');

  for(const [relative,target] of humanRoutes){
    const html=await readFile(path.join(outDir,relative),'utf8');
    assert.match(html,/http-equiv="refresh" content="0; url=/);
    assert.match(html,new RegExp(`<link rel="canonical" href="${canonical.replaceAll('.','\\.')}">`));
    assert.ok(!/noindex/i.test(html),'Redirect bridges must remain crawlable for consolidation');
    assert.ok(html.includes(escapeHtml(target)));
  }
  for(const [relative,target] of machineRoutes){
    const payload=JSON.parse(await readFile(path.join(outDir,relative),'utf8'));
    assert.equal(payload.deprecated,true);
    assert.equal(payload.movedTo,target);
    assert.equal(payload.canonicalSite,canonical);
  }
  console.log(JSON.stringify({valid:true,canonical,humanRedirectBridges:humanRoutes.length,machineDeprecationBridges:machineRoutes.length,custom404:true},null,2));
}

const invokedDirectly=process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url;
if(invokedDirectly){
  if(process.argv.includes('--self-test')){
    const temp=await mkdtemp(path.join(os.tmpdir(),'ghezelbaash-pages-bridge-'));
    const out=path.join(temp,'artifact');
    try{await build(out)}finally{await rm(temp,{recursive:true,force:true})}
  }else{
    const out=path.resolve(root,process.argv[2]||'github-pages-bridge-dist');
    assert.ok(out.startsWith(`${root}${path.sep}`),'Bridge output must remain inside the repository workspace');
    await build(out);
  }
}
