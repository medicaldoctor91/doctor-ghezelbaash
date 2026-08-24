import {readFile} from 'node:fs/promises';
import {assembleCssSource,CSS_SPLIT_MARKER} from '../src/lib/css-source.mjs';
import {deriveCssDelivery} from '../src/lib/css-delivery.mjs';
import {MEDIA_PRESENTATION_CONTRACT,MEDIA_PRESENTATION_DEFERRED_CSS} from '../src/lib/media-presentation.mjs';

const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};
const attr=(tag,name)=>tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`,'i'))?.[1];
const figureById=(source,id)=>source.match(new RegExp(`<figure\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>[\\s\\S]*?<\\/figure>`,'i'))?.[0]||'';
const firstTag=(source,name)=>source.match(new RegExp(`<${name}\\b[^>]*>`,'i'))?.[0]||'';

const [authoredCss,calibrationRaw,pageSource,invariants]=await Promise.all([
  readFile('src/styles/global.css','utf8'),
  readFile('src/data/render-calibration.json','utf8'),
  readFile('src/content-source/page.md','utf8'),
  readFile('src/data/release-invariants.json','utf8').then(JSON.parse),
]);
const {cssSource,calibration}=assembleCssSource(authoredCss,calibrationRaw);
const delivery=deriveCssDelivery(cssSource);
const authoredSplitEnd=authoredCss.indexOf(CSS_SPLIT_MARKER)+CSS_SPLIT_MARKER.length;
const authoredCritical=authoredCss.slice(0,authoredSplitEnd).replace(/\r?\n/g,'');

assert(MEDIA_PRESENTATION_CONTRACT.geometryChanged===false,'V3 must remain geometry-neutral without a fresh render calibration');
assert(MEDIA_PRESENTATION_CONTRACT.ordinaryFigureBorderPaint===false&&MEDIA_PRESENTATION_CONTRACT.ordinaryFigureSurfacePaint===false,'Ordinary figure card paint contract drift');
assert(MEDIA_PRESENTATION_CONTRACT.heroBorderPreserved&&MEDIA_PRESENTATION_CONTRACT.heroRadiusPreserved,'Hero presentation preservation contract drift');
assert(MEDIA_PRESENTATION_CONTRACT.captionSeparatorLayoutNeutral,'Caption separator must remain layout-neutral');
assert(!/(?:margin|padding|width|max-width|min-width|line-height|display|grid-template|aspect-ratio):/.test(MEDIA_PRESENTATION_DEFERRED_CSS),'Deferred V3 paint CSS introduced normal-flow geometry');

const editorialFigure='figure{content-visibility:visible;contain:none;margin:2.2rem 0;padding:clamp(0.65rem,1.5vw,1rem);border:1px solid var(--line);border-color:transparent;background:none;}';
const preservedHero='.entity-hero .hero-figure{grid-area:portrait;align-self:start;margin:0;padding:0;overflow:hidden;border-color:var(--line);border-radius:1rem;background:#eef5f2}';
assert(delivery.criticalCss.includes(editorialFigure),'Editorial figure critical presentation missing');
assert(delivery.criticalCss.includes(preservedHero),'Hero card geometry/paint preservation missing');
assert(!delivery.criticalCss.includes('figure{content-visibility:visible;contain:none;margin:2.2rem 0;padding:clamp(0.65rem,1.5vw,1rem);border:1px solid var(--line);border-radius:1rem;background:var(--surface-soft);}'),'Legacy ordinary figure card survived CSS assembly');
assert(!delivery.criticalCss.includes('img,video{display:block;max-width:100%;height:auto;border-radius:0.85rem;}'),'Paint-only media radius must not remain critical');
assert(!delivery.criticalCss.includes('video{width:100%;background:#0e1412;}'),'Paint-only video background must not remain critical');
assert(delivery.criticalCss.includes('img,video{display:block;max-width:100%;height:auto;}')&&delivery.criticalCss.includes('video{width:100%;}'),'Media layout safety rules left the critical path');
assert(delivery.externalCss.startsWith(MEDIA_PRESENTATION_DEFERRED_CSS),'V3 paint rules are not first in deferred CSS');
assert(Buffer.byteLength(delivery.criticalCss)<=Buffer.byteLength(authoredCritical),'V3 increased critical CSS bytes');
assert(Buffer.byteLength(delivery.criticalCss)<=invariants.maxCriticalCssBytes,'V3 critical CSS exceeds release budget');
assert(calibration.sha256&&calibration.chunkCount>0,'Render calibration failed during V3 assembly');

const hero=figureById(pageSource,'image-saeed-ghezelbash-portrait-master');
assert(hero,'Hero figure missing');
const heroImg=firstTag(hero,'img');
assert(attr(heroImg,'loading')==='eager'&&attr(heroImg,'fetchpriority')==='high'&&attr(heroImg,'width')&&attr(heroImg,'height'),'Hero loading/geometry contract changed');

for(const id of ['image-saeed-ghezelbash-clinical-office-master','image-saeed-ghezelbash-clinical-team-master','image-ghezelbaash-clinic-interior','image-ghezelbaash-clinic-reception']){
  const figure=figureById(pageSource,id),img=firstTag(figure,'img');
  assert(figure&&img,`Image figure missing: ${id}`);
  assert(attr(img,'loading')==='lazy'&&attr(img,'decoding')==='async',`Lazy/async image contract drift: ${id}`);
  assert(attr(img,'width')&&attr(img,'height'),`Intrinsic image dimensions missing: ${id}`);
}
for(const id of ['video-subcision-technique','video-jalupro-vs-profhilo','video-thread-lift-workshop','video-kurdish-patient-experience']){
  const figure=figureById(pageSource,id),video=firstTag(figure,'video');
  assert(figure&&video,`Video figure missing: ${id}`);
  assert(attr(video,'preload')==='none'&&attr(video,'data-poster'),`Deferred video fetch contract drift: ${id}`);
  assert(attr(video,'width')&&attr(video,'height')&&/\bcontrols\b/i.test(video)&&/\bplaysinline\b/i.test(video),`Video geometry/control contract drift: ${id}`);
}

console.log(JSON.stringify({stage:'MEDIA_PRESENTATION_V3',mode:'DUAL_VISUAL_RENDER',geometryChanged:false,ordinaryFigureCardPaint:false,criticalBytes:Buffer.byteLength(delivery.criticalCss),authoredCriticalBytes:Buffer.byteLength(authoredCritical),criticalByteDelta:Buffer.byteLength(delivery.criticalCss)-Buffer.byteLength(authoredCritical),renderCalibrationSha256:calibration.sha256,heroGeometry:'PRESERVED',lazyImages:'PRESERVED',deferredVideoFetch:'PRESERVED',status:'PASS'},null,2));
