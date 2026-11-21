import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {parse} from 'parse5';
import {SOURCE} from '../src/canonical/source.mjs';
const read=name=>readFileSync(new URL('../dist/'+name,import.meta.url),'utf8');
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
function nodes(node,result=[]){result.push(node);for(const child of node.childNodes??[])nodes(child,result);return result;}
function headTags(filename){const all=nodes(parse(read(filename)));return {all,
  metas:all.filter(n=>n.tagName==='meta'),
  links:all.filter(n=>n.tagName==='link'),
  scripts:all.filter(n=>n.tagName==='script'),
  title:all.filter(n=>n.tagName==='title')
};}
const seoMeta=(metas,selector,value)=>metas.find(n=>attr(n,selector)===value);
function headerBlock(path){
 const text=read('_headers');
 return text.split(/\n\s*\n/).find(b=>b.startsWith(path+'\n'));
}

test('every actual public HTML route preserves basic indexable metadata',()=>{
 const htmls=readdirSync(new URL('../dist/',import.meta.url)).filter(p=>p.endsWith('.html')&&p!=='404.html');
 assert.equal(htmls.length,73,'72 canonical sitemap pages and one media-license page');
 for(const path of htmls){
  const {all,metas,links,title}=headTags(path);
  assert.equal(title.length,1,path+' title count');
  assert.ok(seoMeta(metas,'name','description')?.attrs.some(x=>x.name==='content'&&x.value),path+' missing description');
  assert.ok(seoMeta(metas,'name','viewport'),path+' missing mobile viewport');
  const canonical=links.filter(n=>attr(n,'rel')==='canonical');
  assert.equal(canonical.length,1,path+' canonical count');
  assert.ok(attr(canonical[0],'href')?.startsWith('https://www.ghezelbaash.ir/'),path+' incorrect canonical');
  assert.ok(all.some(n=>n.tagName==='h1'),path+' missing h1');
 }
});

test('media license page has actual licensed OG image and canonical identity',()=>{
 const {metas}=headTags('media-license.html');
 const url='https://www.ghezelbaash.ir/media-license';
 assert.equal(attr(seoMeta(metas,'property','og:url'),'content'),url);
 assert.equal(attr(seoMeta(metas,'property','og:type'),'content'),'website');
 const image=attr(seoMeta(metas,'property','og:image'),'content');
 assert.ok(image?.startsWith('https://www.ghezelbaash.ir/media/images/clinic/'));
 assert.ok(existsSync(new URL('../dist/'+new URL(image).pathname.slice(1),import.meta.url)));
 assert.ok(attr(seoMeta(metas,'property','og:image:alt'),'content'));
 assert.equal(attr(seoMeta(metas,'name','twitter:card'),'content'),'summary_large_image');
});

test('immutable media cache policy is retained, while mutable graph and CSV must revalidate',()=>{
 for(const path of ['/graph.jsonld','/graph.ttl','/entity-facts.csv','/release-provenance.json']){
  const block=headerBlock(path);
  assert.ok(block,path+' lacks explicit cache policy');
  assert.match(block,/Cache-Control: public, max-age=0, must-revalidate/);
  assert.doesNotMatch(block,/Cache-Control: public, max-age=3600,/);
 }
 assert.match(headerBlock('/media/*'),/Cache-Control: public, max-age=3600, must-revalidate/);
 assert.match(headerBlock('/assets/*'),/max-age=31536000, immutable/);
 // A machine-readable canonical IRI is intentionally served by an internal
 // representation rewrite, not a missing HTML page; preserve its contract.
 assert.match(read('_redirects'),/^\/data-catalog \/graph\.jsonld 200$/m);
});
