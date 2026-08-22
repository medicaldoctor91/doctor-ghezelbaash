import {readFile,writeFile} from 'node:fs/promises';

const fail=message=>{throw new Error(message)};
const replaceExactlyOnce=(source,from,to,label)=>{
  const first=source.indexOf(from);
  if(first<0)fail(`${label}: source pattern missing`);
  if(source.indexOf(from,first+from.length)>=0)fail(`${label}: source pattern is not unique`);
  return source.slice(0,first)+to+source.slice(first+from.length);
};

const mainHeadPath='src/data/templates/main-head.html';
const documentHeadPath='src/components/DocumentHead.astro';
const safariPath='public/safari-pinned-tab.svg';
const headersPath='src/data/templates/headers.template';

let mainHead=await readFile(mainHeadPath,'utf8');
const oldIconCluster='<link href="/favicon.svg" rel="icon" type="image/svg+xml"/><link href="/favicon-48x48.png" rel="icon" sizes="48x48" type="image/png"/><link href="/favicon-32x32.png" rel="icon" sizes="32x32" type="image/png"/><link href="/favicon-16x16.png" rel="icon" sizes="16x16" type="image/png"/><link href="/favicon.ico" rel="shortcut icon"/><link href="/apple-touch-icon.png" rel="apple-touch-icon" sizes="180x180"/><link color="#075244" href="/safari-pinned-tab.svg" rel="mask-icon"/><link href="/site.webmanifest" rel="manifest"/>';
const newIconCluster='<link href="/favicon.ico" rel="icon" sizes="16x16 32x32 48x48" type="image/vnd.microsoft.icon"/><link href="/favicon.svg" rel="icon" sizes="any" type="image/svg+xml"/><link color="#075244" href="/safari-pinned-tab.svg" rel="mask-icon"/><link href="/site.webmanifest" rel="manifest"/>';
mainHead=replaceExactlyOnce(mainHead,oldIconCluster,newIconCluster,'main Head favicon cluster');
await writeFile(mainHeadPath,mainHead);

let documentHead=await readFile(documentHeadPath,'utf8');
const oldFallback='<link rel="canonical" href={canonicalURL} /><link rel="icon" href="/favicon.svg" type="image/svg+xml" />';
const newFallback='<link rel="canonical" href={canonicalURL} /><link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" type="image/vnd.microsoft.icon" /><link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml" />';
documentHead=replaceExactlyOnce(documentHead,oldFallback,newFallback,'non-main favicon fallback');
await writeFile(documentHeadPath,documentHead);

let safari=await readFile(safariPath,'utf8');
safari=replaceExactlyOnce(safari,'viewBox="0 0 512 512"','viewBox="0 0 16 16"','Safari mask viewBox');
safari=replaceExactlyOnce(safari,'<path fill="#000000" d="','<path fill="#000000" transform="scale(0.03125)" d="','Safari mask coordinate transform');
safari=safari.replace('<xmp:MetadataDate>2026-08-23T00:33:00+03:30</xmp:MetadataDate>','<xmp:MetadataDate>2026-08-23T01:53:00+03:30</xmp:MetadataDate>');
safari=safari.replace('<entity:DesignIntent>maximum-safe optical fill without clipping; transparent canvas lets the displaying user agent supply its own background</entity:DesignIntent>','<entity:DesignIntent>Apple pinned-tab monochrome mask normalized to a native 16x16 coordinate system; approved moustache silhouette preserved without clipping; presentation color is supplied by the HTML mask-icon relation</entity:DesignIntent>');
await writeFile(safariPath,safari);

let headers=await readFile(headersPath,'utf8');
const oldCache='/favicon*\n  Cache-Control: public, max-age=604800, must-revalidate\n  Cloudflare-CDN-Cache-Control: public, max-age=2592000, stale-while-revalidate=604800';
const newCache='/favicon*\n  Cache-Control: public, max-age=86400, must-revalidate\n  Cloudflare-CDN-Cache-Control: public, max-age=86400, stale-while-revalidate=604800';
headers=replaceExactlyOnce(headers,oldCache,newCache,'favicon cache policy');
await writeFile(headersPath,headers);

const checkMain=await readFile(mainHeadPath,'utf8');
for(const forbidden of ['/favicon-48x48.png','/favicon-32x32.png','/favicon-16x16.png','rel="shortcut icon"','rel="apple-touch-icon"']){
  if(checkMain.includes(forbidden))fail(`main Head retained deprecated favicon declaration: ${forbidden}`);
}
for(const required of [
  '<link href="/favicon.ico" rel="icon" sizes="16x16 32x32 48x48" type="image/vnd.microsoft.icon"/>',
  '<link href="/favicon.svg" rel="icon" sizes="any" type="image/svg+xml"/>',
  '<link color="#075244" href="/safari-pinned-tab.svg" rel="mask-icon"/>',
  '<link href="/site.webmanifest" rel="manifest"/>'
])if(!checkMain.includes(required))fail(`main Head favicon contract missing: ${required}`);
if(checkMain.indexOf('/favicon.ico')>checkMain.indexOf('/favicon.svg'))fail('ICO fallback must precede scalable SVG favicon authority');

const checkDocument=await readFile(documentHeadPath,'utf8');
if(!checkDocument.includes('href="/favicon.svg" sizes="any" type="image/svg+xml"'))fail('non-main SVG favicon contract missing sizes=any');
if(!checkDocument.includes('href="/favicon.ico" sizes="16x16 32x32 48x48" type="image/vnd.microsoft.icon"'))fail('non-main ICO fallback missing');

const checkSafari=await readFile(safariPath,'utf8');
if(!checkSafari.includes('viewBox="0 0 16 16"')||!checkSafari.includes('transform="scale(0.03125)"')||!checkSafari.includes('<path fill="#000000"'))fail('Safari pinned-tab mask normalization failed');
if(checkSafari.includes('<rect'))fail('Safari pinned-tab mask must remain background-free');

const checkHeaders=await readFile(headersPath,'utf8');
if(!checkHeaders.includes(newCache))fail('favicon cache policy update missing');

console.log(JSON.stringify({stage:'FAVICON_HEAD_CONTRACT_2026',mainHead:'PASS',nonMainFallback:'PASS',safariMask:'PASS',cachePolicy:'PASS'},null,2));
