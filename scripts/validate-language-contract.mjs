import {readFile} from 'node:fs/promises';
import {CONTENT_LANGUAGES,MULTILINGUAL_HEADING_BOUNDARIES,MULTILINGUAL_RETURN_TO_PRIMARY,PRIMARY_DOCUMENT_LANGUAGE} from '../src/lib/language-contract.mjs';
import {annotateLanguageRegions} from './lib/rehype-language-regions.mjs';

const fail=message=>{throw new Error(message)};
const [source,astroConfig,baseLayout,documentHead,graphCompiler]=await Promise.all([
  readFile('src/content-source/page.md','utf8'),
  readFile('astro.config.mjs','utf8'),
  readFile('src/layouts/BaseLayout.astro','utf8'),
  readFile('src/components/DocumentHead.astro','utf8'),
  readFile('scripts/lib/projections/graph-projections.mjs','utf8'),
]);

if(PRIMARY_DOCUMENT_LANGUAGE!=='fa-IR')fail('Primary document language must remain fa-IR');
if(JSON.stringify(CONTENT_LANGUAGES)!==JSON.stringify(['fa-IR','ar-IQ','en','ckb']))fail('Single-page language inventory drift');
if(new Set(CONTENT_LANGUAGES).size!==CONTENT_LANGUAGES.length)fail('Duplicate content language declaration');

const markerPositions=MULTILINGUAL_HEADING_BOUNDARIES.map(boundary=>source.indexOf(boundary.startsWith));
const returnPosition=source.indexOf(MULTILINGUAL_RETURN_TO_PRIMARY.startsWith);
if(markerPositions.some(position=>position<0)||returnPosition<0)fail('Multilingual content boundary missing from canonical page source');
for(let index=1;index<markerPositions.length;index++)if(markerPositions[index]<=markerPositions[index-1])fail('Multilingual content boundary order drift');
if(returnPosition<=markerPositions.at(-1))fail('Persian return boundary must follow the Sorani corpus');

const heading=text=>({type:'element',tagName:'h2',properties:{},children:[{type:'text',value:text}]});
const paragraph=text=>({type:'element',tagName:'p',properties:{},children:[{type:'text',value:text}]});
const tree={type:'root',children:[
  paragraph('فارسی'),
  heading(`${MULTILINGUAL_HEADING_BOUNDARIES[0].startsWith} — test`),paragraph('العربية'),
  heading(`${MULTILINGUAL_HEADING_BOUNDARIES[1].startsWith} — test`),paragraph('English'),
  heading(`${MULTILINGUAL_HEADING_BOUNDARIES[2].startsWith} — test`),paragraph('کوردی'),
  heading(MULTILINGUAL_RETURN_TO_PRIMARY.startsWith),paragraph('فارسی'),
]};
if(!annotateLanguageRegions(tree))fail('Language-region transformer did not activate');
const expected=['', 'ar-IQ','ar-IQ','en','en','ckb','ckb','',''];
const actual=tree.children.map(node=>String(node.properties?.lang??''));
if(JSON.stringify(actual)!==JSON.stringify(expected))fail(`Language-region transformer contract drift: ${JSON.stringify(actual)}`);
if(tree.children[3].properties?.dir!=='ltr'||tree.children[1].properties?.dir!=='rtl'||tree.children[5].properties?.dir!=='rtl')fail('Language direction contract drift');

if(!astroConfig.includes("rehypePlugins:[rehypeLanguageRegions]")||!astroConfig.includes("./scripts/lib/rehype-language-regions.mjs"))fail('Astro multilingual rehype wiring missing');
if(!baseLayout.includes("import { CONTENT_LANGUAGES } from '../lib/language-contract.mjs'")||!baseLayout.includes('documentLanguages.map(language=><meta itemprop="inLanguage" content={language} />)'))fail('Multilingual WebPage microdata wiring missing');
if(/\bhreflang\s*=/.test(documentHead))fail('Single-URL document must not emit localized-alternate hreflang');
if(!graphCompiler.includes("import {CONTENT_LANGUAGES} from '../../../src/lib/language-contract.mjs'")||!graphCompiler.includes('projected.inLanguage=[...CONTENT_LANGUAGES]'))fail('Head JSON-LD multilingual projection wiring missing');

console.log(JSON.stringify({stage:'LANGUAGE_CONTRACT',primary:PRIMARY_DOCUMENT_LANGUAGE,languages:CONTENT_LANGUAGES,regions:MULTILINGUAL_HEADING_BOUNDARIES.map(({key,lang,dir})=>({key,lang,dir})),returnTo:PRIMARY_DOCUMENT_LANGUAGE,hreflang:'ABSENT_SINGLE_URL',status:'PASS'},null,2));
