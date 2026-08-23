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
const pathExists=async relative=>{try{await access(path.join(root,relative));return true;}catch(error){if(error?.code==='ENOENT')return false;throw error;}};

const [profile,release,discoveryRaw,documentHead,baseLayout,indexSource]=await Promise.all([
  readJson('src/data/head-profile.json'),
  readJson('src/data/release.json'),
  read('src/data/templates/discovery-head.html'),
  read('src/components/DocumentHead.astro'),
  read('src/layouts/BaseLayout.astro'),
  read('src/pages/index.astro'),
]);

const profileKeys=['appleMobileWebAppTitle','applicationName','author','openGraph','themeColor','twitter'];
assert(JSON.stringify(Object.keys(profile).sort())===JSON.stringify(profileKeys),'Static Head profile schema drift');
for(const forbidden of ['title','description','robots','lang','dir','canonicalUrl'])assert(!Object.hasOwn(profile,forbidden),`Head profile must not duplicate canonical content/release metadata: ${forbidden}`);
assert(/^https:\/\/www\.ghezelbaash\.ir\/$/.test(release.canonicalUrl),'Release canonical URL identity drift');
assert(profile.author&&profile.openGraph?.image&&profile.twitter?.card,'Required static Head profile missing');

assert(count(discoveryRaw,/{{CURRENT_VERSION_DOI}}/g)===1,'Discovery Head must bind CURRENT_VERSION_DOI exactly once');
assert(count(discoveryRaw,/{{CURRENT_RELEASE}}/g)===1,'Discovery Head must bind CURRENT_RELEASE exactly once');
for(const forbidden of [/<title\b/i,/name=["']description["']/i,/name=["']robots["']/i,/rel=["']canonical["']/i,/property=["']og:/i,/name=["']twitter:/i])assert(!forbidden.test(discoveryRaw),'Discovery Head contains content-authority metadata');
const discovery=bindReleaseTokens(discoveryRaw,release);
const versionDoi=release.dataset?.zenodo?.versionDoi;
assert(versionDoi&&discovery.includes(`href="https://doi.org/${versionDoi}"`),'Runtime discovery Head lost current Version DOI');
assert(discovery.includes(`title="Zenodo preservation Version DOI ${release.release}"`),'Runtime discovery Head lost current release label');
assert(/\brel=["']describedby["']/i.test(discovery)&&/\brel=["']me["']/i.test(discovery),'Runtime discovery relations incomplete');

assert(documentHead.includes("head-profile.json")&&documentHead.includes("release.json")&&documentHead.includes("discovery-head.html?raw"),'DocumentHead is not bound to canonical Head inputs');
assert(!documentHead.includes('page-metadata.json'),'DocumentHead reintroduced duplicate page metadata authority');
assert(documentHead.includes('release.canonicalUrl'),'DocumentHead canonical URL authority drift');
assert(documentHead.includes('HERO_PRELOAD_HREF')&&documentHead.includes('HERO_PRELOAD_SRCSET')&&documentHead.includes('HERO_IMAGE_SIZES'),'DocumentHead is not bound to canonical Hero preload inputs');
assert(!documentHead.includes('main-head.html')&&!documentHead.includes('head-delivery'),'Runtime DocumentHead still depends on legacy Head transport');
assert(!baseLayout.includes('page-metadata.json')&&baseLayout.includes("release.json")&&!baseLayout.includes('effectiveFrontmatter'),'BaseLayout content metadata authority drift');
assert(baseLayout.includes('new URL(release.canonicalUrl)'),'BaseLayout canonical URL authority drift');
const generatedFrontmatterImport=/import\s*\{[^}]*\bfrontmatter\b[^}]*\}\s*from\s*['"]\.\.\/content\/home\.md['"]/m;
assert(generatedFrontmatterImport.test(indexSource)&&!indexSource.includes('page-metadata.json'),'Index must consume canonical Markdown frontmatter');

assert(HERO_PRELOAD_HREF.includes('saeed-ghezelbash-portrait-delivery-640'),'Hero preload href drift');
assert(HERO_PRELOAD_SRCSET.includes(HERO_PRELOAD_HREF)&&HERO_PRELOAD_SRCSET.includes(' 960w')&&HERO_PRELOAD_SRCSET.includes(' 1600w'),'Hero preload srcset drift');
assert(HERO_IMAGE_SIZES.length>0,'Hero responsive sizes contract missing');

const [legacyMetadataExists,legacyTemplateExists,legacyRuntimeExists]=await Promise.all([
  pathExists('src/data/page-metadata.json'),
  pathExists('src/data/templates/main-head.html'),
  pathExists('src/lib/head-delivery.mjs'),
]);
assert(!legacyMetadataExists,'Duplicate page-metadata.json still exists');
assert(!legacyTemplateExists,'Legacy main-head template still exists');
assert(!legacyRuntimeExists,'Legacy Head split runtime still exists');

console.log(JSON.stringify({stage:'HEAD_AUTHORITY',contentMetadataAuthority:'markdown-frontmatter',canonicalUrlAuthority:'release.json',presentationAuthority:'head-profile.json',runtimeDiscoveryReleaseBinding:'PASS',structuredHeroPreload:'PASS',legacyAuthoritiesRemoved:true,integrity:'PASS'},null,2));
