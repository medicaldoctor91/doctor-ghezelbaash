import path from 'node:path';
import {access,readFile} from 'node:fs/promises';
import {HERO_IMAGE_SIZES,HERO_PRELOAD_HREF,HERO_PRELOAD_SRCSET} from '../src/lib/hero-image-contract.mjs';
import {bindReleaseTokens} from '../src/lib/release-tokens.mjs';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};
const count=(source,pattern)=>(String(source).match(pattern)||[]).length;
const heroPreloadPattern=/<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']image["'])(?=[^>]*\bfetchpriority=["']high["'])(?=[^>]*saeed-ghezelbash-portrait-delivery-640)[^>]*>/gi;

const [discoveryHeadRaw,release,pageMetadata,documentHead,baseLayout]=await Promise.all([
  readFile(path.join(root,'src/data/templates/discovery-head.html'),'utf8'),
  readFile(path.join(root,'src/data/release.json'),'utf8').then(JSON.parse),
  readFile(path.join(root,'src/data/page-metadata.json'),'utf8').then(JSON.parse),
  readFile(path.join(root,'src/components/DocumentHead.astro'),'utf8'),
  readFile(path.join(root,'src/layouts/BaseLayout.astro'),'utf8'),
]);
const discoveryHead=bindReleaseTokens(discoveryHeadRaw,release);
assert(HERO_PRELOAD_HREF.includes('saeed-ghezelbash-portrait-delivery-640'),'Canonical Hero preload href drift');
assert(HERO_PRELOAD_SRCSET.includes(HERO_PRELOAD_HREF)&&HERO_PRELOAD_SRCSET.includes(' 960w')&&HERO_PRELOAD_SRCSET.includes(' 1600w'),'Canonical Hero preload srcset drift');
assert(HERO_IMAGE_SIZES.length>0,'Canonical Hero sizes contract missing');
assert(/\brel=["']describedby["']/i.test(discoveryHead),'Discovery Head must retain machine-readable relations');
for(const forbidden of [/<title\b/i,/name=["']description["']/i,/name=["']robots["']/i,/rel=["']canonical["']/i,/property=["']og:/i,/name=["']twitter:/i])assert(!forbidden.test(discoveryHeadRaw),'Discovery template contains content-authority metadata');
assert(documentHead.includes("page-metadata.json")&&documentHead.includes('HERO_PRELOAD_HREF')&&documentHead.includes("stage==='critical'")&&documentHead.includes("stage==='discovery'"),'Structured DocumentHead contract missing');
assert(!documentHead.includes('main-head.html')&&!documentHead.includes('deriveMainHeadStages'),'Legacy raw Head delivery remains in runtime');
assert(baseLayout.includes("page-metadata.json")&&baseLayout.includes('effectiveFrontmatter=isMain?pageMetadata:frontmatter'),'BaseLayout main metadata authority missing');
assert(/stage="critical"/.test(baseLayout)&&/stage="discovery"/.test(baseLayout),'BaseLayout must emit both Head stages');
assert(pageMetadata.canonicalUrl===release.canonicalUrl,'Canonical page URL must converge with release identity');
assert(pageMetadata.lang==='fa-IR'&&pageMetadata.dir==='rtl','Canonical page language contract drift');
const sourceOrder=['stage="critical"','<style is:inline','fetchpriority="low"','id="deferred-stylesheet-loader"','id="entity-core"','stage="discovery"'].map(token=>baseLayout.indexOf(token));
assert(sourceOrder.every(index=>index>=0)&&sourceOrder.every((value,index)=>index===0||sourceOrder[index-1]<value),'BaseLayout critical-path source order drift');
assert(!/static\.cloudflareinsights\.com/i.test(discoveryHeadRaw+documentHead+baseLayout),'Cloudflare Insights must not be authored into canonical source');

const distArg=process.argv[2];
if(distArg){
  const dist=path.resolve(root,distArg);
  await access(path.join(dist,'index.html'));
  const html=await readFile(path.join(dist,'index.html'),'utf8');
  const heroPreloads=html.match(heroPreloadPattern)||[];
  const heroPreload=heroPreloads[0];
  const criticalStyle=html.match(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/i)?.[0];
  const deferredPreload=html.match(/<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']style["'])(?=[^>]*\bfetchpriority=["']low["'])(?=[^>]*\bdata-deferred-stylesheet\b)[^>]*>/i)?.[0];
  const loader=html.match(/<script\b(?=[^>]*\bid=["']deferred-stylesheet-loader["'])[^>]*>[\s\S]*?<\/script>/i)?.[0];
  const core=html.match(/<script\b(?=[^>]*\bid=["']entity-core["'])(?=[^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/i)?.[0];
  const discovery=html.match(/<link\b(?=[^>]*\brel=["']describedby["'])[^>]*>/i)?.[0];
  for(const [value,label] of [[heroPreload,'Hero preload'],[criticalStyle,'critical CSS'],[deferredPreload,'low-priority deferred CSS preload'],[loader,'deferred stylesheet loader'],[core,'entity-core JSON-LD'],[discovery,'discovery Head relation']])assert(value,`DIST ${label} missing`);
  assert(heroPreloads.length===1,'DIST duplicate Hero preload detected');
  const order=[heroPreload,criticalStyle,deferredPreload,loader,core,discovery].map(value=>html.indexOf(value));
  assert(order.every((value,index)=>index===0||order[index-1]<value),'DIST critical-path ordering drift');
  assert(count(html,/<title>/gi)===1&&count(html,/\brel=["']canonical["']/gi)===1,'DIST title/canonical duplication detected');
  assert(count(html,/\bproperty=["']og:title["']/gi)===1&&count(html,/\bname=["']twitter:title["']/gi)===1,'DIST social metadata duplication detected');
  assert(html.includes(`<title>${pageMetadata.title}</title>`),'DIST title diverges from canonical metadata');
  assert(html.includes(`content="${pageMetadata.description}" name="description"`)||html.includes(`name="description" content="${pageMetadata.description}"`),'DIST description diverges from canonical metadata');
  assert(!/static\.cloudflareinsights\.com/i.test(html),'Cloudflare Insights unexpectedly entered static DIST');
}

console.log(JSON.stringify({stage:'CRITICAL_PATH',headAuthority:'structured',discoveryBytes:Buffer.byteLength(discoveryHead),distValidated:Boolean(distArg),integrity:'PASS'},null,2));
