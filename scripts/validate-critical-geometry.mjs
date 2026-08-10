import path from 'node:path';
import {readFile} from 'node:fs/promises';

const root=process.cwd();
const fail=message=>{throw new Error(`Critical geometry validation failed: ${message}`)};
const globalCss=await readFile(path.join(root,'src/styles/global.css'),'utf8');
const criticalMobileCss=await readFile(path.join(root,'src/styles/critical-mobile.css'),'utf8');
const marker='/*DIST_CRITICAL_CSS_END*/';
const splitAt=globalCss.indexOf(marker);
if(splitAt<0||globalCss.indexOf(marker,splitAt+1)>=0)fail('critical CSS split marker drift');
const deferredCss=globalCss.slice(splitAt+marker.length);

const requiredCriticalTokens=[
  'padding:1rem .85rem calc(7.2rem + env(safe-area-inset-bottom))',
  '.quick-actions__top{width:2.15rem;height:2.15rem}',
  '.quick-actions__top::before{inset:-.35rem}',
  '@media(max-width:720px){main{padding-inline:.78rem}}',
  '.quick-actions__item{padding:.3rem .26rem;font-size:clamp(.7rem,2.9vw,.76rem)}',
  '.quick-actions__item--consultation{gap:.34rem}',
  '.quick-actions__consultation-copy small{font-size:.8em}'
];
for(const token of requiredCriticalTokens)if(!criticalMobileCss.includes(token))fail(`missing critical convergence token: ${token}`);

const legacyMainAt=criticalMobileCss.indexOf('padding:1rem .85rem calc(7.2rem + env(safe-area-inset-bottom))');
const finalMainAt=criticalMobileCss.lastIndexOf('padding-inline:.78rem');
if(legacyMainAt<0||finalMainAt<=legacyMainAt)fail('final .78rem mobile main geometry must override the legacy validator-compatible declaration');

const deferredChecks=[
  [/\.quick-actions__top\{[^}]*width:2\.15rem;[^}]*height:2\.15rem/s,'deferred quick-actions top size'],
  [/\.quick-actions__top::before\{[^}]*inset:-0?\.35rem/s,'deferred quick-actions hit-area inset'],
  [/@media\(max-width:720px\)\{main\{[^}]*padding-inline:\.78rem/s,'deferred mobile main inline padding'],
  [/@media\s*\(max-width:480px\)\{[\s\S]*?\.quick-actions__item\{[^}]*padding:0?\.3rem 0?\.26rem;[^}]*font-size:clamp\(0?\.7rem,2\.9vw,0?\.76rem\)/s,'deferred mobile dock item geometry'],
  [/\.quick-actions__item--consultation\{[^}]*gap:0?\.34rem/s,'deferred consultation gap'],
  [/\.quick-actions__consultation-copy small\{[^}]*font-size:0?\.8em/s,'deferred consultation small text size']
];
for(const [pattern,label] of deferredChecks)if(!pattern.test(deferredCss))fail(`${label} drift`);

const forbiddenLateCritical=[
  [/\.quick-actions__top\{[^}]*width:2\.75rem/s,'2.75rem quick-actions top after convergence override'],
  [/@media\(max-width:720px\)\{main\{[^}]*padding-inline:\.85rem/s,'.85rem main padding-inline after convergence override']
];
const convergenceStart=criticalMobileCss.indexOf('.quick-actions__top{width:2.15rem;height:2.15rem}');
const tail=criticalMobileCss.slice(convergenceStart);
for(const [pattern,label] of forbiddenLateCritical)if(pattern.test(tail))fail(`late conflicting critical geometry: ${label}`);

console.log('Critical geometry convergence validated: mobile main and floating dock initial geometry match deferred final values.');
