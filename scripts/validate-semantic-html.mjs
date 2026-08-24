import {readFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';

const fail=message=>{throw new Error(message)};
const attr=(source,name)=>source.match(new RegExp(`\\b${name}=["']([^"']+)["']`,'i'))?.[1];
const {content}=await assembleCanonicalContent();
const body=content.startsWith('---')?content.slice(content.indexOf('\n---',3)+4):content;
const [baseLayout,guideNavigator,knowledgeGraphSource]=await Promise.all([
  readFile('src/layouts/BaseLayout.astro','utf8'),
  readFile('src/components/GuideNavigator.astro','utf8'),
  readFile('src/data/semantic/knowledge-graph.jsonld','utf8')
]);
const knowledgeGraphDocument=JSON.parse(knowledgeGraphSource);
const knowledgeGraph=knowledgeGraphDocument['@graph']||knowledgeGraphDocument;
const graphNode=id=>knowledgeGraph.find(node=>node['@id']===id);
const graphRef=value=>typeof value==='string'?value:value?.['@id'];
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const graphTypes=node=>Array.isArray(node?.['@type'])?node['@type']:[node?.['@type']].filter(Boolean);

const headings=[...body.matchAll(/<h([1-6])\b[^>]*>/gi)].map(match=>({level:Number(match[1]),tag:match[0],id:attr(match[0],'id')}));
if(headings.filter(item=>item.level===1).length!==1)fail('Canonical page must contain exactly one H1');
for(let index=1;index<headings.length;index++)if(headings[index].level>headings[index-1].level+1)fail(`Heading hierarchy jumps from H${headings[index-1].level} to H${headings[index].level}`);

const idMatches=[...body.matchAll(/\bid=["']([^"']+)["']/gi)].map(match=>match[1]);
const duplicateIds=[...new Set(idMatches.filter((id,index)=>idMatches.indexOf(id)!==index))];
if(duplicateIds.length)fail(`Duplicate authored HTML IDs: ${duplicateIds.join(', ')}`);
const idSet=new Set(idMatches);
const fragments=[...body.matchAll(/<a\b[^>]*\bhref=["']#([^"']+)["'][^>]*>/gi)].map(match=>decodeURIComponent(match[1]));
const missingFragments=[...new Set(fragments.filter(fragment=>!idSet.has(fragment)))];
if(missingFragments.length)fail(`Missing authored fragment targets: ${missingFragments.join(', ')}`);

const mediaBridges=[
  {fragment:'image-saeed-ghezelbash-portrait-master',property:'image',type:'ImageObject',caption:'caption-saeed-ghezelbash-portrait-master'},
  {fragment:'image-saeed-ghezelbash-clinical-office-master',property:'image',type:'ImageObject'},
  {fragment:'image-saeed-ghezelbash-clinical-team-master',property:'image',type:'ImageObject',caption:'caption-saeed-ghezelbash-clinical-team-master'},
  {fragment:'image-ghezelbaash-clinic-interior',property:'image',type:'ImageObject',caption:'caption-ghezelbaash-clinic-interior'},
  {fragment:'image-ghezelbaash-clinic-reception',property:'image',type:'ImageObject',caption:'caption-ghezelbaash-clinic-reception'},
  {fragment:'video-subcision-technique',property:'video',type:'VideoObject',caption:'caption-saeed-ghezelbash-subcision-technique'},
  {fragment:'video-jalupro-vs-profhilo',property:'video',type:'VideoObject',caption:'caption-saeed-ghezelbash-jalupro-vs-profhilo'},
  {fragment:'video-thread-lift-workshop',property:'video',type:'VideoObject',caption:'caption-saeed-ghezelbash-thread-lift-workshop'},
  {fragment:'video-kurdish-patient-experience',property:'video',type:'VideoObject',caption:'caption-saeed-ghezelbash-kurdish-patient-review'}
];
for(const bridge of mediaBridges){
  const iri=`https://www.ghezelbaash.ir/#${bridge.fragment}`;
  if(!idSet.has(bridge.fragment))fail(`Visible media anchor missing: ${bridge.fragment}`);
  if(!graphTypes(graphNode(iri)).includes(bridge.type))fail(`Visible media anchor has no matching ${bridge.type} graph node: ${iri}`);
  const linkPattern=new RegExp(`<link\\b(?=[^>]*\\bhref=["']${escapeRegExp(iri)}["'])(?=[^>]*\\bitemprop=["']${bridge.property}["'])[^>]*>`,'i');
  if(!linkPattern.test(body))fail(`Visible media graph bridge missing: ${bridge.property} -> ${iri}`);
  if(bridge.caption){
    const figurePattern=new RegExp(`<figure\\b(?=[^>]*\\bid=["']${escapeRegExp(bridge.fragment)}["'])(?=[^>]*\\baria-labelledby=["']${escapeRegExp(bridge.caption)}["'])[^>]*>`,'i');
    if(!figurePattern.test(body)||!idSet.has(bridge.caption))fail(`Visible media accessible caption binding missing: ${bridge.fragment} -> ${bridge.caption}`);
  }
}

const sections=[...body.matchAll(/<section\b[^>]*>/gi)].map(match=>match[0]);
if(sections.length<16)fail(`Semantic section inventory unexpectedly sparse: ${sections.length}`);
for(const section of sections){
  const sectionId=attr(section,'id'),labelId=attr(section,'aria-labelledby');
  if(!sectionId||!labelId)fail(`Section lacks id/aria-labelledby: ${section}`);
  if(!new RegExp(`<h[2-6]\\b(?=[^>]*\\bid=["']${labelId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["'])[^>]*>`,'i').test(body))fail(`Section label heading missing: ${sectionId} -> ${labelId}`);
}

const details=[...body.matchAll(/<details\b[^>]*>/gi)].map(match=>match[0]);
if(!details.length||details.some(tag=>!new RegExp(`${tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}<summary\\b`,'i').test(body)))fail('Every details element must expose summary as its first child');
if(/<details\b(?=[^>]*\bclass=["'][^"']*clinical-identity-disclosure)[^>]*\bopen(?:\s|=|>)/i.test(body))fail('Clinical identity disclosure must remain closed by default');
if(!/<details\b(?=[^>]*clinical-identity-disclosure)[^>]*>[\s\S]*?<summary\b[\s\S]*?<picture\b/i.test(body)||!body.includes('class="clinical-identity-list"'))fail('Collapsible clinical identity dossier semantics drift');

for(const image of [...body.matchAll(/<img\b[^>]*>/gi)].map(match=>match[0]))if(!/\balt=["'][^"']*["']/i.test(image))fail(`Image lacks explicit alt: ${image}`);
if(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<a\b/i.test(body)||/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button\b/i.test(body))fail('Nested interactive controls detected');
const pageMicrodata=baseLayout.includes('itemscope={isMain?true:undefined}')&&baseLayout.includes("itemtype={isMain?'https://schema.org/MedicalWebPage https://schema.org/ProfilePage':undefined}")&&baseLayout.includes('itemprop="author reviewedBy"')&&baseLayout.includes('itemprop="dateModified"')&&baseLayout.includes('<article class:list=');
const personMicrodata=/<header\b(?=[^>]*\bitemprop=["']mainEntity["'])(?=[^>]*\bitemid=["']https:\/\/www\.ghezelbaash\.ir\/#saeed-ghezelbash["'])(?=[^>]*\bitemtype=["']https:\/\/schema\.org\/Person["'])[^>]*>/i.test(body)&&/\bitemprop=["']name["']/.test(body)&&/\bitemprop=["']jobTitle["']/.test(body)&&/\bitemprop=["']workLocation["']/.test(body)&&/<img\b(?=[^>]*\bitemprop=["']image["'])[^>]*>/i.test(body);
const runtime=guideNavigator.match(/<script\b(?=[^>]*\bid=["']site-runtime["'])[^>]*>([\s\S]*?)<\/script>/i)?.[1]||'';
try{new Function(runtime)}catch(error){fail(`Site runtime syntax failed: ${error.message}`)}
const searchSemantics=/<nav\b(?=[^>]*\bclass=["']chapter-rail["'])(?=[^>]*\bdata-chapter-rail\b)[^>]*>/i.test(guideNavigator)&&/<search\b[^>]*\bclass=["']guide-search__body["']/i.test(guideNavigator)&&/<form\b[^>]*\bmethod=["']dialog["']/i.test(guideNavigator)&&runtime.includes("setAttribute('aria-current','location')")&&runtime.includes("matchMedia('(min-width:80rem)')");
const webpage=graphNode('https://www.ghezelbaash.ir/#webpage');
const expectedMainContentIds=new Set((webpage?.mainContentOfPage||[]).map(graphRef).filter(Boolean));
const projectedMainContentTags=[...body.matchAll(/<(?:section|details)\b(?=[^>]*\bitemprop=["']mainContentOfPage["'])[^>]*>/gi)].map(match=>match[0]);
const projectedMainContentIds=new Set(projectedMainContentTags.map(tag=>attr(tag,'itemid')).filter(Boolean));
const missingMainContent=[...expectedMainContentIds].filter(id=>!projectedMainContentIds.has(id));
const extraMainContent=[...projectedMainContentIds].filter(id=>!expectedMainContentIds.has(id));
if(!expectedMainContentIds.size||missingMainContent.length||extraMainContent.length||projectedMainContentTags.some(tag=>attr(tag,'itemtype')!=='https://schema.org/WebPageElement'))fail(`Visible mainContentOfPage projection drift: missing=${missingMainContent.join(',')} extra=${extraMainContent.join(',')}`);

const howToId='https://www.ghezelbaash.ir/#howto-clinical-aesthetic-decision-pathway';
const howTo=graphNode(howToId);
const expectedStepIds=(howTo?.step||[]).map(graphRef).filter(Boolean);
const projectedHowTo=/<section\b(?=[^>]*\bitemprop=["']hasPart["'])(?=[^>]*\bitemid=["']https:\/\/www\.ghezelbaash\.ir\/#howto-clinical-aesthetic-decision-pathway["'])(?=[^>]*\bitemtype=["']https:\/\/schema\.org\/HowTo["'])[^>]*>/i.test(body);
const projectedStepTags=[...body.matchAll(/<li\b(?=[^>]*\bitemprop=["']step["'])(?=[^>]*\bitemtype=["']https:\/\/schema\.org\/HowToStep["'])[^>]*>/gi)].map(match=>match[0]);
const projectedStepIds=projectedStepTags.map(tag=>attr(tag,'itemid')).filter(Boolean);
if(!projectedHowTo||expectedStepIds.length!==4||expectedStepIds.some(id=>!projectedStepIds.includes(id))||projectedStepIds.some(id=>!expectedStepIds.includes(id))||projectedStepTags.length!==4)fail('Visible HowTo/HowToStep projection drift');
if(!pageMicrodata||!personMicrodata||!searchSemantics||!/<header\b[^>]*\baria-labelledby=["']saeed-ghezelbash["']/i.test(body)||!/<nav\b[^>]*\bid=["']aesthetic-medicine-table-of-contents["']/i.test(body))fail('Entity Home/Article/Header/Nav/Search semantic contract drift');

console.log(JSON.stringify({stage:'SEMANTIC_HTML',h1:1,h2:headings.filter(item=>item.level===2).length,headings:headings.length,sections:sections.length,details:details.length,figures:(body.match(/<figure\b/gi)||[]).length,images:(body.match(/<img\b/gi)||[]).length,duplicateIds:0,brokenFragments:0,headingJumps:0,collapsibleIdentity:'PASS',entityHomeMicrodata:'PASS',articleLandmark:'PASS',mainContentProjections:projectedMainContentIds.size,howToSteps:projectedStepIds.length,howToMicrodata:'PASS',mediaGraphBridges:mediaBridges.length,mediaCaptionBindings:mediaBridges.filter(item=>item.caption).length,searchLandmark:'PASS',landmarks:'PASS',integrity:'PASS'},null,2));
