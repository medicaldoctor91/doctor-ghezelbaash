import path from 'node:path';
import {access,readFile} from 'node:fs/promises';
import {deriveMainHeadStages} from '../src/lib/head-delivery.mjs';
import {bindHeroPreloadSizes} from '../src/lib/hero-image-contract.mjs';
import {bindReleaseTokens} from '../src/lib/release-tokens.mjs';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};
const count=(source,pattern)=>(String(source).match(pattern)||[]).length;
const heroPreloadPattern=/<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']image["'])(?=[^>]*\bfetchpriority=["']high["'])(?=[^>]*saeed-ghezelbash-portrait-delivery-640)[^>]*>/gi;

const [mainHeadRaw,release,documentHead,baseLayout]=await Promise.all([
  readFile(path.join(root,'src/data/templates/main-head.html'),'utf8'),
  readFile(path.join(root,'src/data/release.json'),'utf8').then(JSON.parse),
  readFile(path.join(root,'src/components/DocumentHead.astro'),'utf8'),
  readFile(path.join(root,'src/layouts/BaseLayout.astro'),'utf8'),
]);
const boundHead=bindReleaseTokens(bindHeroPreloadSizes(mainHeadRaw),release);
const {criticalHead,discoveryHead,splitAt}=deriveMainHeadStages(boundHead);
assert(splitAt>0&&splitAt<boundHead.length,'Canonical Head split position is invalid');
assert(criticalHead+discoveryHead===boundHead,'Head staging must be byte-preserving');
assert(count(criticalHead,/\brel=["']preload["']/gi)>=1,'Critical Head lost preload discovery');
assert(count(criticalHead,heroPreloadPattern)===1,'Critical Head must contain exactly one canonical Hero preload');
assert(!/\brel=["']describedby["']/i.test(criticalHead),'Machine discovery links must remain outside the render-critical prefix');
assert(/\brel=["']describedby["']/i.test(discoveryHead),'Discovery Head must retain machine-readable relations');
assert(/stage="critical"/.test(baseLayout)&&/stage="discovery"/.test(baseLayout),'BaseLayout must emit both canonical Head stages');
assert(documentHead.includes('deriveMainHeadStages')&&documentHead.includes("stage='critical'"),'DocumentHead staging contract missing');
const sourceOrder=['stage="critical"','<style is:inline','fetchpriority="low"','id="deferred-stylesheet-loader"','id="entity-core"','stage="discovery"'].map(token=>baseLayout.indexOf(token));
assert(sourceOrder.every(index=>index>=0)&&sourceOrder.every((value,index)=>index===0||sourceOrder[index-1]<value),'BaseLayout critical-path source order drift');
assert(!/static\.cloudflareinsights\.com/i.test(mainHeadRaw+documentHead+baseLayout),'Cloudflare Insights must not be authored into canonical source');

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
  assert(!/static\.cloudflareinsights\.com/i.test(html),'Cloudflare Insights unexpectedly entered static DIST');
}

console.log(JSON.stringify({stage:'CRITICAL_PATH',headSplitByte:Buffer.byteLength(criticalHead),headDiscoveryBytes:Buffer.byteLength(discoveryHead),distValidated:Boolean(distArg),integrity:'PASS'},null,2));
