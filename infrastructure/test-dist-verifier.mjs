import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyDist } from './verify-dist.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'v2-dist-'));
await fs.mkdir(path.join(root,'assets'),{recursive:true});
await fs.mkdir(path.join(root,'.well-known'),{recursive:true});
const css=Buffer.from('body{color:#111}'), js=Buffer.from('console.log("ok")');
await fs.writeFile(path.join(root,'assets/site.0123456789ab.css'),css);
await fs.writeFile(path.join(root,'assets/site.abcdef123456.js'),js);
const sri=b=>'sha384-'+createHash('sha384').update(b).digest('base64');
const origin='https://www.ghezelbaash.ir', physician=origin+'/#saeed-ghezelbash', clinic=origin+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah';
const search=(pageId,url)=>({ '@context':'https://schema.org','@graph':[
  {'@id':pageId,'@type':'MedicalWebPage',url,dateModified:'2026-10-05',author:{'@id':physician},publisher:{'@id':physician},medicalAudience:{'@type':'Patient'},specialty:{'@id':origin+'/medical-specialty-aesthetic-medicine'},reviewedBy:{'@id':physician},lastReviewed:'2026-10-04'},
  {'@id':physician,'@type':'Person',url:origin+'/'}, {'@id':clinic,'@type':'MedicalClinic'}
]});
const full=search(origin+'/webpage',origin+'/');full['@graph'][0]['@type']=['ProfilePage','MedicalWebPage'];
const html=(route,home=false)=>`<!doctype html><html lang="fa-IR" dir="rtl"><head><link rel="canonical" href="${origin}${route}"><link rel="stylesheet" href="/assets/site.0123456789ab.css" integrity="${sri(css)}"><script id="schema-core-mainentity" type="application/ld+json">${JSON.stringify(home?full:search(origin+route+'#webpage',origin+route))}</script></head><body lang="fa-IR" dir="rtl"><article lang="fa-IR" dir="rtl">ok</article><script src="/assets/site.abcdef123456.js" integrity="${sri(js)}"></script></body></html>`;
await fs.writeFile(path.join(root,'index.html'),html('/',true));
await fs.writeFile(path.join(root,'botox.html'),html('/botox'));
await fs.writeFile(path.join(root,'sitemap.xml'),`<?xml version="1.0"?><urlset xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"><url><loc>${origin}/</loc><lastmod>2026-10-05</lastmod>${'<video:video></video:video>'.repeat(4)}</url><url><loc>${origin}/botox</loc><lastmod>2026-10-05</lastmod></url></urlset>`);
await fs.writeFile(path.join(root,'graph.jsonld'),JSON.stringify(full));
await fs.writeFile(path.join(root,'_headers'),`/*\n  Link: </graph.jsonld>; rel=describedby; type="application/ld+json", </graph.ttl>; rel=describedby; type="text/turtle", <${physician}>; rel=about\n\nhttps://:project.pages.dev/*\n  X-Robots-Tag: noindex\n`);
await fs.writeFile(path.join(root,'.well-known/security.txt'),`Contact: mailto:doctor@ghezelbaash.ir\nExpires: 2027-04-05T00:00:00Z\nPreferred-Languages: fa, en\nCanonical: ${origin}/.well-known/security.txt\n`);
await fs.writeFile(path.join(root,'release-provenance.json'),JSON.stringify({releaseDate:'2026-10-05'}));
const manifestFiles={};
for(const rel of ['index.html','botox.html','assets/site.0123456789ab.css','assets/site.abcdef123456.js','sitemap.xml','graph.jsonld','_headers','.well-known/security.txt','release-provenance.json']){
  const bytes=await fs.readFile(path.join(root,rel));manifestFiles['/'+rel]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
}
await fs.writeFile(path.join(root,'integrity-manifest.json'),JSON.stringify({algorithm:'sha256',releaseDate:'2026-10-05',files:manifestFiles}));
const report=await verifyDist({distDir:root,routes:['/','/botox'],origin,physicianId:physician,clinicId:clinic,expectedVideos:4,sourceEdition:'2026-10-05',requireMedicalSemantics:true});
assert.equal(report.canonicalPages,2);assert.equal(report.graphNodes,3);assert.equal(report.videoEntries,4);assert.equal(report.integrityVerified,true);
const verifyOptions={distDir:root,routes:['/','/botox'],origin,physicianId:physician,clinicId:clinic,expectedVideos:4,sourceEdition:'2026-10-05',requireMedicalSemantics:true};
const validHeaders=await fs.readFile(path.join(root,'_headers'),'utf8');
const invalidHeaders=validHeaders+'\n/fixture\n  Link: </graph.ttl>; type="text/turtle; charset=utf-8"\n';
await fs.writeFile(path.join(root,'_headers'),invalidHeaders);
const bytes=Buffer.from(invalidHeaders);manifestFiles['/_headers']={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
await fs.writeFile(path.join(root,'integrity-manifest.json'),JSON.stringify({algorithm:'sha256',releaseDate:'2026-10-05',files:manifestFiles}));
await assert.rejects(verifyDist(verifyOptions),/Link type/,'Final verification rejects invalid delivered Link types even with matching seal hashes');
console.log(JSON.stringify({distVerifier:'PASS',...report},null,2));
