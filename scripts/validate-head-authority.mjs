import path from 'node:path';
import {access,readFile} from 'node:fs/promises';
import {HERO_IMAGE_SIZES,HERO_PRELOAD_HREF,HERO_PRELOAD_SRCSET} from '../src/lib/hero-image-contract.mjs';

const root=process.cwd();
const fail=message=>{throw new Error(message)};
const assert=(condition,message)=>{if(!condition)fail(message)};
const read=relative=>readFile(path.join(root,relative),'utf8');
const readJson=relative=>read(relative).then(JSON.parse);
const count=(source,pattern)=>(String(source).match(pattern)||[]).length;
const pathExists=async relative=>{try{await access(path.join(root,relative));return true;}catch(error){if(error?.code==='ENOENT')return false;throw error;}};

const [profile,release,canonicalSource,documentHead,baseLayout,indexSource]=await Promise.all([
  readJson('src/data/head-profile.json'),
  readJson('src/data/release.json'),
  read('src/content-source/page.md'),
  read('src/components/DocumentHead.astro'),
  read('src/layouts/BaseLayout.astro'),
  read('src/pages/index.astro'),
]);

const profileKeys=['appleMobileWebAppTitle','applicationName','author','openGraph','themeColor','twitter'];
assert(JSON.stringify(Object.keys(profile).sort())===JSON.stringify(profileKeys),'Static Head profile schema drift');
for(const forbidden of ['title','description','robots','lang','dir','canonicalUrl'])assert(!Object.hasOwn(profile,forbidden),`Head profile must not duplicate canonical content/release metadata: ${forbidden}`);
assert(/^https:\/\/www\.ghezelbaash\.ir\/$/.test(release.canonicalUrl),'Release canonical URL identity drift');
assert(profile.author&&profile.openGraph?.image&&profile.twitter?.card,'Required static Head profile missing');

const normalizedSource=canonicalSource.charCodeAt(0)===0xfeff?canonicalSource.slice(1):canonicalSource;
const frontmatterMatch=normalizedSource.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
assert(frontmatterMatch,'Canonical page source must begin with one Markdown frontmatter block');
const frontmatter=frontmatterMatch[1];
const scalar=key=>{
  const matches=[...frontmatter.matchAll(new RegExp(`^${key}:\\s*(.+?)\\s*$`,'gm'))];
  assert(matches.length===1,`Canonical frontmatter must define ${key} exactly once`);
  const raw=matches[0][1].trim();
  const quoted=raw.match(/^(['"])([\s\S]*)\1$/);
  return (quoted?quoted[2]:raw).trim();
};
const canonicalTitle=scalar('title');
const canonicalDescription=scalar('description');
const canonicalLang=scalar('lang');
const canonicalDir=scalar('dir');
const canonicalRobots=scalar('robots');
assert(canonicalTitle.length>=10&&canonicalDescription.length>=50,'Canonical title/description unexpectedly weak or empty');
assert(canonicalLang==='fa-IR'&&canonicalDir==='rtl','Canonical page language/direction contract drift');
assert(/^index\s*,\s*follow\b/i.test(canonicalRobots),'Canonical robots contract must remain indexable');
for(const forbidden of ['canonicalUrl','canonicalURL','openGraph','twitter','themeColor','author','applicationName','appleMobileWebAppTitle'])assert(!new RegExp(`^${forbidden}:`,'m').test(frontmatter),`Canonical frontmatter reintroduced non-content authority: ${forbidden}`);
assert(count(normalizedSource,/^---\s*$/gm)>=2,'Canonical frontmatter delimiter contract drift');

const versionDoi=release.dataset?.zenodo?.versionDoi;
assert(versionDoi,'Current Version DOI missing');
assert(documentHead.includes("const discoveryLinks:DiscoveryLink[]=")&&documentHead.includes("discoveryLinks.map(link=><link {...link} />)"),'Discovery Head is not rendered as structured Astro links');
assert(documentHead.includes("release.primaryEntity.verifiedWebIdentityMesh.map")&&documentHead.includes("rel:'me'"),'Discovery identity mesh is not sourced from release.json');
assert(documentHead.includes("release.dataset.zenodo.versionDoi")&&documentHead.includes("title:`Zenodo preservation Version DOI ${release.release}`"),'Discovery Head lost release-bound Zenodo metadata');
assert(documentHead.includes("release.clinic.cid")&&documentHead.includes("release.dataset.supportingClinicWikidata")&&documentHead.includes("release.dataset.github.repository"),'Discovery Head lost release-bound entity relations');
assert(documentHead.includes("rel:'describedby'")&&documentHead.includes("rel:'related'")&&documentHead.includes("rel:'about'"),'Discovery Head relation inventory incomplete');
assert(!documentHead.includes('discovery-head.html?raw')&&!documentHead.includes('set:html={discoveryHead}')&&!documentHead.includes('bindReleaseTokens(discoveryHead'),'Raw discovery Head transport reintroduced');

assert(documentHead.includes("head-profile.json")&&documentHead.includes("release.json"),'DocumentHead is not bound to canonical Head inputs');
assert(!documentHead.includes('page-metadata.json'),'DocumentHead reintroduced duplicate page metadata authority');
assert(documentHead.includes('release.canonicalUrl'),'DocumentHead canonical URL authority drift');
assert(documentHead.includes('HERO_PRELOAD_HREF')&&documentHead.includes('HERO_PRELOAD_SRCSET')&&documentHead.includes('HERO_IMAGE_SIZES'),'DocumentHead is not bound to canonical Hero preload inputs');
assert(!documentHead.includes('main-head.html')&&!documentHead.includes('head-delivery'),'Runtime DocumentHead still depends on legacy Head transport');
assert(!baseLayout.includes('page-metadata.json')&&baseLayout.includes("release.json")&&!baseLayout.includes('effectiveFrontmatter'),'BaseLayout content metadata authority drift');
assert(baseLayout.includes('new URL(release.canonicalUrl)'),'BaseLayout canonical URL authority drift');
const generatedFrontmatterImport=/import\s*\{[^}]*\bfrontmatter\b[^}]*\}\s*from\s*['"]\.\.\/\.\.\/\.generated\/content\/home\.md['"]/m;
assert(generatedFrontmatterImport.test(indexSource)&&!indexSource.includes('page-metadata.json'),'Index must consume canonical Markdown frontmatter from generated workspace');
assert(!indexSource.includes('../content/home.md'),'Index reintroduced legacy generated content staging');

assert(HERO_PRELOAD_HREF.includes('saeed-ghezelbash-portrait-delivery-640'),'Hero preload href drift');
assert(HERO_PRELOAD_SRCSET.includes(HERO_PRELOAD_HREF)&&HERO_PRELOAD_SRCSET.includes(' 960w')&&HERO_PRELOAD_SRCSET.includes(' 1600w'),'Hero preload srcset drift');
assert(HERO_IMAGE_SIZES.length>0,'Hero responsive sizes contract missing');

const [legacyMetadataExists,legacyTemplateExists,legacyRuntimeExists,rawDiscoveryTemplateExists]=await Promise.all([
  pathExists('src/data/page-metadata.json'),
  pathExists('src/data/templates/main-head.html'),
  pathExists('src/lib/head-delivery.mjs'),
  pathExists('src/data/templates/discovery-head.html'),
]);
assert(!legacyMetadataExists,'Duplicate page-metadata.json still exists');
assert(!legacyTemplateExists,'Legacy main-head template still exists');
assert(!legacyRuntimeExists,'Legacy Head split runtime still exists');
assert(!rawDiscoveryTemplateExists,'Raw discovery Head template still exists');

console.log(JSON.stringify({stage:'HEAD_AUTHORITY',contentMetadataAuthority:'markdown-frontmatter',generatedContentAuthority:'.generated/content/home.md',canonicalFrontmatter:'PASS',canonicalUrlAuthority:'release.json',presentationAuthority:'head-profile.json',discoveryIdentityAuthority:'release.json',headRendering:'ASTRO_NATIVE',structuredHeroPreload:'PASS',rawHeadTemplates:0,legacyAuthoritiesRemoved:true,integrity:'PASS'},null,2));
