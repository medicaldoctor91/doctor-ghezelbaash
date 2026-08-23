import path from 'node:path';
import {access,readFile} from 'node:fs/promises';
import {bindReleaseTokens} from '../src/lib/release-tokens.mjs';
import {HERO_IMAGE_SIZES,HERO_PRELOAD_HREF,HERO_PRELOAD_SRCSET} from '../src/lib/hero-image-contract.mjs';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};
const read=relative=>readFile(path.join(root,relative),'utf8');
const readJson=relative=>read(relative).then(JSON.parse);
const count=(source,pattern)=>(String(source).match(pattern)||[]).length;

const [metadata,release,discoveryRaw,documentHead,baseLayout,indexSource,legacyFixture]=await Promise.all([
  readJson('src/data/page-metadata.json'),
  readJson('src/data/release.json'),
  read('src/data/templates/discovery-head.html'),
  read('src/components/DocumentHead.astro'),
  read('src/layouts/BaseLayout.astro'),
  read('src/pages/index.astro'),
  read('src/data/templates/main-head.html'),
]);

const metadataKeys=['applicationName','appleMobileWebAppTitle','author','canonicalUrl','description','dir','lang','openGraph','robots','themeColor','title','twitter'];
assert(JSON.stringify(Object.keys(metadata).sort())===JSON.stringify(metadataKeys),'Canonical page metadata schema drift');
assert(metadata.canonicalUrl===release.canonicalUrl,'Page metadata canonical URL diverges from release identity');
assert(metadata.lang==='fa-IR'&&metadata.dir==='rtl','Page language/direction contract drift');
assert(/^index, follow,/.test(metadata.robots),'Main robots contract must remain indexable');
assert(metadata.title&&metadata.description&&metadata.openGraph?.image&&metadata.twitter?.card,'Required canonical page metadata missing');

assert(count(discoveryRaw,/{{CURRENT_VERSION_DOI}}/g)===1,'Discovery Head must bind CURRENT_VERSION_DOI exactly once');
assert(count(discoveryRaw,/{{CURRENT_RELEASE}}/g)===1,'Discovery Head must bind CURRENT_RELEASE exactly once');
for(const forbidden of [/<title\b/i,/name=["']description["']/i,/name=["']robots["']/i,/rel=["']canonical["']/i,/property=["']og:/i,/name=["']twitter:/i])assert(!forbidden.test(discoveryRaw),'Discovery Head contains content-authority metadata');
const discovery=bindReleaseTokens(discoveryRaw,release);
const versionDoi=release.dataset?.zenodo?.versionDoi;
assert(versionDoi&&discovery.includes(`href="https://doi.org/${versionDoi}"`),'Runtime discovery Head lost current Version DOI');
assert(discovery.includes(`title="Zenodo preservation Version DOI ${release.release}"`),'Runtime discovery Head lost current release label');
assert(/\brel=["']describedby["']/i.test(discovery)&&/\brel=["']me["']/i.test(discovery),'Runtime discovery relations incomplete');

assert(documentHead.includes("page-metadata.json")&&documentHead.includes("discovery-head.html?raw"),'DocumentHead is not bound to canonical Head inputs');
assert(documentHead.includes('HERO_PRELOAD_HREF')&&documentHead.includes('HERO_PRELOAD_SRCSET')&&documentHead.includes('HERO_IMAGE_SIZES'),'DocumentHead is not bound to canonical Hero preload inputs');
assert(!documentHead.includes('main-head.html')&&!documentHead.includes('head-delivery'),'Runtime DocumentHead still depends on legacy Head transport');
assert(baseLayout.includes("page-metadata.json")&&baseLayout.includes('effectiveFrontmatter=isMain?pageMetadata:frontmatter'),'BaseLayout main metadata authority drift');
assert(indexSource.includes("page-metadata.json")&&!/\bfrontmatter\b/.test(indexSource),'Index page reintroduced generated-frontmatter authority');

assert(HERO_PRELOAD_HREF.includes('saeed-ghezelbash-portrait-delivery-640'),'Hero preload href drift');
assert(HERO_PRELOAD_SRCSET.includes(HERO_PRELOAD_HREF)&&HERO_PRELOAD_SRCSET.includes(' 960w')&&HERO_PRELOAD_SRCSET.includes(' 1600w'),'Hero preload srcset drift');
assert(HERO_IMAGE_SIZES.length>0,'Hero responsive sizes contract missing');

assert(legacyFixture.startsWith('<!-- NON-RUNTIME VALIDATOR FIXTURE:'),'Legacy Head compatibility file must be explicitly non-runtime');
assert(count(legacyFixture,/{{HERO_IMAGE_SIZES}}/g)===1&&count(legacyFixture,/{{CURRENT_VERSION_DOI}}/g)===1&&count(legacyFixture,/{{CURRENT_RELEASE}}/g)===1,'Legacy validator fixture scope drift');
for(const forbidden of [/<title\b/i,/name=["']description["']/i,/name=["']robots["']/i,/rel=["']canonical["']/i,/property=["']og:/i,/name=["']twitter:/i])assert(!forbidden.test(legacyFixture),'Legacy validator fixture regained metadata authority');
let legacyRuntimeExists=true;
try{await access(path.join(root,'src/lib/head-delivery.mjs'));}catch(error){if(error?.code==='ENOENT')legacyRuntimeExists=false;else throw error;}
assert(!legacyRuntimeExists,'Legacy Head split runtime still exists');

console.log(JSON.stringify({stage:'HEAD_AUTHORITY',canonicalMetadata:'PASS',runtimeDiscoveryReleaseBinding:'PASS',structuredHeroPreload:'PASS',legacyRuntimeRemoved:true,integrity:'PASS'},null,2));
