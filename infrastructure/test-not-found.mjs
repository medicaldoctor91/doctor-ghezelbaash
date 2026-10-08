import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {transform} from '@astrojs/compiler-rs';
import {experimental_AstroContainer} from 'astro/container';
import {parse} from 'parse5';
import {SOURCE} from '../src/canonical/source.mjs';

const root=new URL('../',import.meta.url);
const pageUrl=new URL('src/pages/404.astro',root);
assert(await fs.access(pageUrl).then(()=>true,()=>false),'A top-level static 404 support page must prevent Home fallback for unknown URLs');

let rendered;
if(!process.argv[2]){
// Render the actual Astro page. The canonical renderer import uses the same
// extracted build API as the existing semantic test; no recovery data is mocked.
const renderer=await fs.readFile(new URL('src/pages/index.astro',root),'utf8');
let canonicalCode=renderer.slice(4,renderer.lastIndexOf('\n---\n'));
canonicalCode=canonicalCode.slice(0,canonicalCode.lastIndexOf('\nconst requestedPath ='));
canonicalCode=canonicalCode.replace(/from "\.\.\/lib\/([^"]+)"/g,(_,name)=>`from "${new URL('src/lib/'+name,root).href}"`);
canonicalCode=canonicalCode.replaceAll('../canonical/source.mjs',new URL('src/canonical/source.mjs',root).href);
const generated=new URL('.generated/',root);await fs.mkdir(generated,{recursive:true});
const canonicalModule=new URL('not-found-canonical.mjs',generated);
await fs.writeFile(canonicalModule,canonicalCode);
const pageSource=await fs.readFile(pageUrl,'utf8');
const compiled=transform(pageSource,{filename:pageUrl.pathname,internalURL:'astro/compiler-runtime',resolvePath:specifier=>specifier});
assert.equal(compiled.diagnostics.filter(message=>message.severity==='error').length,0,'The recovery page compiles without errors');
const pageModule=new URL('not-found-page.mjs',generated);
await fs.writeFile(pageModule,compiled.code.replace(/(['"])\.\/index\.astro\1/g,JSON.stringify(canonicalModule.href)).replace(/(['"])\.\.\/canonical\/source\.mjs\1/g,JSON.stringify(new URL('src/canonical/source.mjs',root).href)));
const {default:Page}=await import(pageModule.href);
const container=await experimental_AstroContainer.create();
rendered=await container.renderToString(Page,{partial:false});

}

const nodes=[];function walk(node){nodes.push(node);for(const child of node.childNodes??[])walk(child);}const attr=(node,key)=>node.attrs?.find(a=>a.name===key)?.value;
const text=node=>node?.nodeName==='#text'?node.value:(node?.childNodes??[]).map(text).join('');
function assertRecovery(html,label){
 nodes.length=0;walk(parse(html));
 assert.equal(text(nodes.find(n=>n.tagName==='title')),'صفحه پیدا نشد | دکتر سعید قزلباش','Existing truthful 404 title '+label);
 const h1=nodes.filter(n=>n.tagName==='h1');assert.equal(h1.length,1,'One recovery heading '+label);
 assert.equal(text(h1[0]),'این صفحه پیدا نشد؛ مسیر اصلی همچنان در دسترس است','Existing recovery H1 '+label);
 assert(text(nodes.find(n=>n.tagName==='main')).includes('این نشانی در وب‌سایت رسمی دکتر سعید قزلباش وجود ندارد. از مسیرهای اصلی زیر ادامه دهید.'),'Existing recovery explanation '+label);
 assert.equal(attr(nodes.find(n=>n.tagName==='meta'&&attr(n,'name')==='robots'),'content'),'noindex, follow','Recovery is not canonical Search content '+label);
 assert.equal(nodes.filter(n=>n.tagName==='link'&&attr(n,'rel')==='canonical').length,0,'No canonical pointing the missing page at Home '+label);
 assert.equal(nodes.filter(n=>n.tagName==='script').length,0,'No reader or medical structured data on recovery '+label);
 const links=nodes.filter(n=>n.tagName==='a').map(n=>attr(n,'href'));
 assert(links.includes('#main-content'),'Keyboard skip link reaches recovery content '+label);
 assert.equal(attr(nodes.find(n=>n.tagName==='main'),'id'),'main-content');
 assert.equal(attr(nodes.find(n=>n.tagName==='main'),'tabindex'),'-1');
 for(const route of ['/','/botox','/filler','/thread-lift','/acne-pigmentation-and-scars','/hair-loss','/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'])assert(links.includes(route),'Existing canonical recovery path '+route+' '+label);
 assert(links.includes('tel:'+SOURCE.graph['@graph'].find(n=>n['@id']===SOURCE.canonicalOrigin+'/#saeed-ghezelbash').telephone),'Telephone derives from canonical truth '+label);
 assert(links.includes(SOURCE.graph['@graph'].find(n=>n['@id']===SOURCE.canonicalOrigin+'/online-consultation-channel').serviceUrl),'Online contact derives from canonical truth '+label);
 assert.equal(attr(nodes.find(n=>n.tagName==='html'),'lang'),'fa-IR');assert.equal(attr(nodes.find(n=>n.tagName==='html'),'dir'),'rtl');
 const css=nodes.filter(n=>n.tagName==='link'&&attr(n,'rel')==='stylesheet');assert.equal(css.length,1,'A single existing fingerprinted stylesheet '+label);assert.match(attr(css[0],'href'),/^\/assets\/site\.[a-f0-9]{12}\.css$/);
}
if(rendered)assertRecovery(rendered,'Astro render');
if(process.argv[2]){
 const dist=path.resolve(process.argv[2]);const html=await fs.readFile(path.join(dist,'404.html'),'utf8');assertRecovery(html,'final dist');
 const css=attr(nodes.find(n=>n.tagName==='link'&&attr(n,'rel')==='stylesheet'),'href');await fs.access(path.join(dist,css.slice(1)));
 const sitemap=await fs.readFile(path.join(dist,'sitemap.xml'),'utf8');assert(!sitemap.includes('/404'),'Recovery page stays outside canonical sitemap');
}
assert.equal(SOURCE.routes.resources.length,72);assert(!SOURCE.routes.resources.some(r=>r.path==='/404'||r.path==='/404.html'));
console.log(JSON.stringify({notFoundRecovery:'PASS',canonicalRoutes:72,finalDist:!!process.argv[2]},null,2));
