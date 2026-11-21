import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'parse5';
import {SOURCE} from '../src/canonical/source.mjs';

/**
 * Permanent pre-release regression: the 72 finished site pages must not
 * silently lose on-page semantics, machine discovery, or genuine internal
 * navigation. Page-body size on homepage is deliberately unrestricted here.
 *
 * This does not confuse Google's choice to index with technical indexability.
 */
const origin=SOURCE.canonicalOrigin;
const routes=SOURCE.routes.resources;
const attr=(n,k)=>n?.attrs?.find(x=>x.name===k)?.value;
function nodes(root) {
  const all=[root];
  for(let i=0;i<all.length;i++)for(const n of all[i].childNodes??[])all.push(n);
  return all;
}
function visibleText(n) {
  return (n.childNodes??[]).map(x=>x.value??visibleText(x)).join('').replace(/\s+/g,' ').trim();
}

test('72 canonical pages preserve SEO structure and sufficient meaningful internal navigation',()=>{
  assert.equal(routes.length,72,'the approved sitemap has 72 finished HTML pages');
  const seenTitles=new Map(),seenDescriptions=new Map(),paths=new Set(routes.map(r=>r.path));
  const sitemap=readFileSync(new URL('../dist/sitemap.xml',import.meta.url),'utf8');
  const sitemapURLs=[...sitemap.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map(x=>x[1]);
  assert.equal(sitemapURLs.length,72);
  assert.deepEqual(new Set(sitemapURLs),new Set([...paths].map(p=>origin+p)));
  let sumInternal=0;
  for(const resource of routes) {
    const path=resource.path;
    const base=origin+path;
    const file=path==='/'?'index.html':path.slice(1)+'.html';
    const html=readFileSync(new URL('../dist/'+file,import.meta.url),'utf8');
    const elements=nodes(parse(html));
    const el=(tag)=>elements.filter(n=>n.tagName===tag);
    const heads=el('head');
    const title=el('title')[0];
    const canonical=el('link').filter(n=>(attr(n,'rel')||'').split(' ').includes('canonical'));
    const descriptions=el('meta').filter(n=>attr(n,'name')==='description');
    const viewport=el('meta').find(n=>attr(n,'name')==='viewport');
    const h1=el('h1');
    const htmlTag=el('html')[0];
    assert.equal(heads.length,1,path+' has one HEAD');
    assert.equal(canonical.length,1,path+' needs exactly one canonical');
    assert.equal(attr(canonical[0],'href'),base,path+' canonical must match sitemap');
    assert.equal(descriptions.length,1,path+' has a unique description element');
    assert.ok(attr(descriptions[0],'content')?.length>30,path+' has substantive description');
    assert.ok(title && visibleText(title).length>6,path+' has a title');
    assert.ok(h1.length===1 && visibleText(h1[0]).length>3,path+' has one useful H1');
    assert.ok(attr(htmlTag,'lang'),path+' has a declared language');
    assert.ok(viewport,path+' is mobile responsive');
    const t=visibleText(title),d=attr(descriptions[0],'content');
    assert.ok(!seenTitles.has(t),'duplicate title: '+path+' and '+seenTitles.get(t));
    assert.ok(!seenDescriptions.has(d),'duplicate meta description: '+path+' and '+seenDescriptions.get(d));
    seenTitles.set(t,path);seenDescriptions.set(d,path);
    const scripts=el('script').filter(n=>attr(n,'type')==='application/ld+json');
    assert.ok(scripts.length>=1,path+' has active JSON-LD');
    for(const script of scripts)assert.doesNotThrow(()=>JSON.parse(visibleText(script)),path+' parses as JSON-LD');
    const graph=el('link').filter(n=>(attr(n,'rel')||'').split(' ').some(rel=>['alternate','describedby'].includes(rel))&&attr(n,'type')==='application/ld+json'&&attr(n,'href')==='/graph.jsonld');
    assert.equal(graph.length,1,path+' advertises one typed canonical graph discovery link');
    const ids=new Set(elements.map(n=>attr(n,'id')).filter(Boolean));
    const internal=new Set();
    for(const link of el('a')){
      const href=attr(link,'href');if(!href)continue;
      if(href.startsWith('#')){
        if(href.length>1)assert.ok(ids.has(decodeURIComponent(href.slice(1))),path+' missing self fragment '+href);
        continue;
      }
      let abs;
      try{abs=new URL(href,base);}catch{continue}
      if(abs.origin!==origin)continue;
      internal.add(abs.pathname);
      if(abs.pathname===path&&abs.hash.length>1)
        assert.ok(ids.has(decodeURIComponent(abs.hash.slice(1))),path+' missing own fragment '+abs.hash);
    }
    assert.ok(internal.size>=18,path+' lost valid internal-navigation breadth: '+internal.size);
    sumInternal+=internal.size;
    const badImages=el('img').filter(n=>attr(n,'alt')===undefined);
    assert.equal(badImages.length,0,path+' images need alt attributes (empty alt allowed for decoration)');
  }
  assert.ok(sumInternal>=1500,'sitewide internal-navigation breadth unexpectedly collapsed: '+sumInternal);
});
