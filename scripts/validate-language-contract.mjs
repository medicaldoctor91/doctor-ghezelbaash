import {readFile} from 'node:fs/promises';
import {CONTENT_LANGUAGES,MULTILINGUAL_HEADING_BOUNDARIES,MULTILINGUAL_RETURN_TO_PRIMARY,PRIMARY_DOCUMENT_LANGUAGE} from '../src/lib/language-contract.mjs';
import {bindLanguageRegions} from '../src/lib/language-regions.mjs';

const fail=message=>{throw new Error(message)};
const [source,astroConfig,baseLayout,documentHead,graphCompiler,assembler]=await Promise.all([
  readFile('src/content-source/page.md','utf8'),
  readFile('astro.config.mjs','utf8'),
  readFile('src/layouts/BaseLayout.astro','utf8'),
  readFile('src/components/DocumentHead.astro','utf8'),
  readFile('scripts/lib/projections/graph-projections.mjs','utf8'),
  readFile('scripts/lib/assemble-content.mjs','utf8'),
]);

if(PRIMARY_DOCUMENT_LANGUAGE!=='fa-IR')fail('Primary document language must remain fa-IR');
if(JSON.stringify(CONTENT_LANGUAGES)!==JSON.stringify(['fa-IR','ar-IQ','en','ckb']))fail('Single-page language inventory drift');
if(new Set(CONTENT_LANGUAGES).size!==CONTENT_LANGUAGES.length)fail('Duplicate content language declaration');

const markerPositions=MULTILINGUAL_HEADING_BOUNDARIES.map(boundary=>source.indexOf(boundary.startsWith));
const returnPosition=source.indexOf(MULTILINGUAL_RETURN_TO_PRIMARY.startsWith);
if(markerPositions.some(position=>position<0)||returnPosition<0)fail('Multilingual content boundary missing from canonical page source');
for(let index=1;index<markerPositions.length;index++)if(markerPositions[index]<=markerPositions[index-1])fail('Multilingual content boundary order drift');
if(returnPosition<=markerPositions.at(-1))fail('Persian return boundary must follow the Sorani corpus');

const annotated=bindLanguageRegions(source);
const openingH2For=marker=>{
  const markerIndex=annotated.indexOf(marker);
  const start=annotated.lastIndexOf('<h2',markerIndex);
  return annotated.slice(start,annotated.indexOf('>',start)+1);
};
for(const boundary of MULTILINGUAL_HEADING_BOUNDARIES){
  const tag=openingH2For(boundary.startsWith);
  if(!new RegExp(`\\blang=["']${boundary.lang}["']`,'i').test(tag)||!new RegExp(`\\bdir=["']${boundary.dir}["']`,'i').test(tag))fail(`Annotated H2 contract missing for ${boundary.key}`);
}
const returnTag=openingH2For(MULTILINGUAL_RETURN_TO_PRIMARY.startsWith);
if(/\blang=["'](?:ar-IQ|en|ckb)["']/i.test(returnTag))fail('Persian return H2 inherited a non-Persian explicit language');

for(let index=0;index<MULTILINGUAL_HEADING_BOUNDARIES.length;index++){
  const boundary=MULTILINGUAL_HEADING_BOUNDARIES[index];
  const start=annotated.lastIndexOf('<h2',annotated.indexOf(boundary.startsWith));
  const nextMarker=index+1<MULTILINGUAL_HEADING_BOUNDARIES.length?MULTILINGUAL_HEADING_BOUNDARIES[index+1].startsWith:MULTILINGUAL_RETURN_TO_PRIMARY.startsWith;
  const end=annotated.lastIndexOf('<h2',annotated.indexOf(nextMarker));
  const segment=annotated.slice(start,end);
  const count=(segment.match(new RegExp(`\\blang=["']${boundary.lang}["']`,'gi'))||[]).length;
  if(count<5)fail(`Language region unexpectedly sparse after annotation: ${boundary.key}=${count}`);
}

if(astroConfig.includes('rehype-language-regions')||astroConfig.includes('rehypePlugins'))fail('Legacy Markdown language-plugin wiring must remain absent on Astro 7');
if(!assembler.includes("import {bindLanguageRegions} from '../../src/lib/language-regions.mjs'")||!assembler.includes('content=bindLanguageRegions(content);'))fail('Canonical assembly language binding missing');
if(!baseLayout.includes("import { CONTENT_LANGUAGES } from '../lib/language-contract.mjs'")||!baseLayout.includes('documentLanguages.map(language=><meta itemprop="inLanguage" content={language} />)'))fail('Multilingual WebPage microdata wiring missing');
if(/\bhreflang\s*=/.test(documentHead))fail('Single-URL document must not emit localized-alternate hreflang');
if(!graphCompiler.includes("import {CONTENT_LANGUAGES} from '../../../src/lib/language-contract.mjs'")||!graphCompiler.includes('projected.inLanguage=[...CONTENT_LANGUAGES]'))fail('Head JSON-LD multilingual projection wiring missing');

console.log(JSON.stringify({stage:'LANGUAGE_CONTRACT',primary:PRIMARY_DOCUMENT_LANGUAGE,languages:CONTENT_LANGUAGES,regions:MULTILINGUAL_HEADING_BOUNDARIES.map(({key,lang,dir})=>({key,lang,dir})),returnTo:PRIMARY_DOCUMENT_LANGUAGE,binding:'CANONICAL_ASSEMBLY',hreflang:'ABSENT_SINGLE_URL',status:'PASS'},null,2));
