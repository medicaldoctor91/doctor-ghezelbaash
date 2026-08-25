import {readFile} from 'node:fs/promises';
import {assembleCanonicalContent} from './lib/assemble-content.mjs';
import {deriveGooglePageMicrodata} from '../src/lib/google-page-microdata.mjs';
import {deriveGooglePageNode} from '../src/lib/google-semantic-html.mjs';
import {CONTENT_LANGUAGES} from '../src/lib/language-contract.mjs';
import {projectNode} from '../src/lib/semantic-projection.mjs';

const fail=message=>{throw new Error(message)};
const attr=(source,name)=>source.match(new RegExp(`\\b${name}=["']([^"']+)["']`,'i'))?.[1];
const {content}=await assembleCanonicalContent();
const body=content.startsWith('---')?content.slice(content.indexOf('\n---',3)+4):content;
const [baseLayout,guideNavigator,knowledgeGraphSource,headProfile,supportIds,release]=await Promise.all([
  readFile('src/layouts/BaseLayout.astro','utf8'),
  readFile('src/components/GuideNavigator.astro','utf8'),
  readFile('src/data/semantic/knowledge-graph.jsonld','utf8'),
  readFile('src/data/semantic/head-profile.json','utf8').then(JSON.parse),
  readFile('src/data/semantic/support-ids.json','utf8').then(JSON.parse),
  readFile('src/data/release.json','utf8').then(JSON.parse)
]);
const knowledgeGraphDocument=JSON.parse(knowledgeGraphSource);
const knowledgeGraph=knowledgeGraphDocument['@graph']||knowledgeGraphDocument;
const graphNode=id=>knowledgeGraph.find(node=>node['@id']===id);
const graphRef=value=>typeof value==='string'?value:value?.['@id'];
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const graphTypes=node=>Array.isArray(node?.['@type'])?node['@type']:[node?.['@type']].filter(Boolean);
const graphValues=value=>(Array.isArray(value)?value:[value]).filter(item=>item!=null);
const graphText=value=>typeof value==='string'?value:value?.['@value'];
const localizedValue=(value,language)=>graphValues(value).find(item=>item?.['@language']===language)?.['@value'];
const tagProperties=tag=>(attr(tag,'itemprop')||'').trim().split(/\s+/).filter(Boolean);
const tagValue=tag=>attr(tag,'content')||attr(tag,'href')||attr(tag,'src')||attr(tag,'datetime');
const stripMarkup=value=>value.replace(/<[^>]+>/g,'').replaceAll('&amp;','&').replaceAll('&nbsp;',' ').replace(/\s+/g,' ').trim();

const webpageId='https://www.ghezelbaash.ir/#webpage';
const personId='https://www.ghezelbaash.ir/#saeed-ghezelbash';
const webpage=graphNode(webpageId);
const person=graphNode(personId);
if(!webpage||!person)fail('Canonical page/person node missing');
const supportProfilePages=supportIds.filter(id=>graphTypes(graphNode(id)).includes('ProfilePage'));
if(supportProfilePages.length)fail(`Google support projection contains competing ProfilePage nodes: ${supportProfilePages.join(', ')}`);
const googlePageNode=deriveGooglePageNode(knowledgeGraphDocument,headProfile,webpageId,CONTENT_LANGUAGES);
const googlePageMicrodata=deriveGooglePageMicrodata({'@graph':[googlePageNode]},webpageId);

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
  {fragment:'image-saeed-ghezelbash-clinical-office-master',property:'image',type:'ImageObject',caption:'caption-saeed-ghezelbash-clinical-office-master'},
  {fragment:'image-saeed-ghezelbash-clinical-team-master',property:'image',type:'ImageObject',caption:'caption-saeed-ghezelbash-clinical-team-master'},
  {fragment:'image-ghezelbaash-clinic-interior',property:'image',type:'ImageObject'},
  {fragment:'image-ghezelbaash-clinic-reception',property:'image',type:'ImageObject'},
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
  }else if(!new RegExp(`<figure\\b(?=[^>]*\\bid=["']${escapeRegExp(bridge.fragment)}["'])(?=[^>]*\\baria-label=["'][^"']+["'])[^>]*>`,'i').test(body))fail(`Visible media accessible label missing: ${bridge.fragment}`);
}

const sections=[...body.matchAll(/<section\b[^>]*>/gi)].map(match=>match[0]);
if(sections.length<18)fail(`Semantic section inventory unexpectedly sparse: ${sections.length}`);
for(const section of sections){
  const sectionId=attr(section,'id'),labelId=attr(section,'aria-labelledby');
  if(!sectionId||!labelId)fail(`Section lacks id/aria-labelledby: ${section}`);
  if(!new RegExp(`<h[2-6]\\b(?=[^>]*\\bid=["']${labelId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["'])[^>]*>`,'i').test(body))fail(`Section label heading missing: ${sectionId} -> ${labelId}`);
}

const details=[...body.matchAll(/<details\b[^>]*>/gi)].map(match=>match[0]);
if(!details.length||details.some(tag=>!new RegExp(`${tag.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}<summary\\b`,'i').test(body)))fail('Every details element must expose summary as its first child');
const identitySurface=body.match(/<div\b(?=[^>]*\bid=["']verified-physician-identity-core["'])[^>]*>[\s\S]*?<\/div>/i)?.[0]||'';
for(const token of ['Wikidata Q140287622','نظام پزشکی ۱۶۷۴۳۰','ORCID 0009-0001-9346-8475','Google KG <code>/g/11nqdfk76c</code>'])if(!identitySurface.includes(token))fail(`Verified physician identity binding missing: ${token}`);

for(const image of [...body.matchAll(/<img\b[^>]*>/gi)].map(match=>match[0]))if(!/\balt=["'][^"']*["']/i.test(image))fail(`Image lacks explicit alt: ${image}`);
if(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<a\b/i.test(body)||/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<button\b/i.test(body))fail('Nested interactive controls detected');
const pageLinkProperties=new Map();
for(const link of googlePageMicrodata.links){
  for(const property of link.itemprop.split(/\s+/)){
    if(!pageLinkProperties.has(property))pageLinkProperties.set(property,new Set());
    pageLinkProperties.get(property).add(link.href);
  }
}
const exactSet=(actual,expected)=>actual.size===expected.size&&[...expected].every(value=>actual.has(value));
const pageMicrodata=
  graphTypes(webpage).includes('MedicalWebPage')&&
  graphTypes(webpage).includes('ProfilePage')&&
  graphTypes(googlePageNode).length===1&&
  graphTypes(googlePageNode)[0]==='ProfilePage'&&
  !Object.hasOwn(googlePageNode,'dateModified')&&
  webpage.lastReviewed===release.medicalReviewedAt&&
  googlePageNode.lastReviewed===release.medicalReviewedAt&&
  googlePageMicrodata.itemType==='https://schema.org/ProfilePage'&&
  googlePageMicrodata.mainEntityId===personId&&
  exactSet(new Set(googlePageMicrodata.mainEntityProperties),new Set(['mainEntity','author','publisher','reviewedBy','about']))&&
  !pageLinkProperties.get('author')?.has(personId)&&
  !pageLinkProperties.get('publisher')?.has(personId)&&
  !pageLinkProperties.get('reviewedBy')?.has(personId)&&
  pageLinkProperties.get('isPartOf')?.has(graphRef(googlePageNode.isPartOf))&&
  pageLinkProperties.get('primaryImageOfPage')?.has(graphRef(googlePageNode.primaryImageOfPage))&&
  !Object.hasOwn(googlePageNode,'specialty')&&
  exactSet(new Set(googlePageMicrodata.meta.filter(item=>item.itemprop==='inLanguage').map(item=>item.content)),new Set(CONTENT_LANGUAGES))&&
  googlePageMicrodata.meta.some(item=>item.itemprop==='lastReviewed'&&item.content===googlePageNode.lastReviewed)&&
  baseLayout.includes('deriveGooglePageMicrodata(headGraph')&&
  baseLayout.includes('itemscope={googlePageMicrodata?true:undefined}')&&
  baseLayout.includes('itemtype={googlePageMicrodata?.itemType}')&&
  baseLayout.includes('itemid={googlePageMicrodata?.itemId}')&&
  baseLayout.includes('googlePageMicrodata.links.map')&&
  baseLayout.includes('googlePageMicrodata.meta.map')&&
  !baseLayout.includes('itemprop="dateModified"')&&
  !baseLayout.includes('https://schema.org/MedicalWebPage https://schema.org/ProfilePage')&&
  baseLayout.includes('<article class:list=');

const personHeader=body.match(/<header\b(?=[^>]*\bitemprop=["'][^"']*\bmainEntity\b[^"']*["'])[^>]*>[\s\S]*?<\/header>/i)?.[0]||'';
const personOpen=personHeader.match(/<header\b[^>]*>/i)?.[0]||'';
const personPropertyTags=[...personHeader.matchAll(/<[^>]+\bitemprop=["'][^"']+["'][^>]*>/gi)].map(match=>match[0]);
const personValues=property=>personPropertyTags.filter(tag=>tagProperties(tag).includes(property)).map(tagValue).filter(Boolean);
const personTextValues=property=>[...personHeader.matchAll(new RegExp(`<([a-z][a-z0-9:-]*)\\b(?=[^>]*\\bitemprop=["'][^"']*\\b${escapeRegExp(property)}\\b[^"']*["'])[^>]*>([\\s\\S]*?)<\\/\\1>`,'gi'))]
  .map(match=>stripMarkup(match[2])).filter(Boolean);
const personItemTypes=new Set((attr(personOpen,'itemtype')||'').split(/\s+/).filter(Boolean));
const projectedPerson=projectNode(person,headProfile.nodes?.[personId]);
const expectedSameAs=new Set([
  graphValues(projectedPerson.sameAs).find(value=>value==='https://www.wikidata.org/entity/Q140287622'),
  graphValues(projectedPerson.sameAs).find(value=>/membersearch\.irimc\.org/.test(value)),
  graphValues(projectedPerson.sameAs).find(value=>/instagram\.com\/doctor\.ghezelbaash/.test(value))
].filter(Boolean));
const personMicrodata=
  attr(personOpen,'itemid')===personId&&
  exactSet(new Set(tagProperties(personOpen)),new Set(googlePageMicrodata.mainEntityProperties))&&
  exactSet(personItemTypes,new Set(['https://schema.org/Person','https://schema.org/IndividualPhysician']))&&
  exactSet(new Set(personTextValues('name')),new Set([localizedValue(projectedPerson.name,'fa')]))&&
  exactSet(new Set(personTextValues('jobTitle')),new Set([localizedValue(projectedPerson.jobTitle,'fa')]))&&
  exactSet(new Set(personValues('workLocation')),new Set([graphRef(projectedPerson.workLocation?.[0]??projectedPerson.workLocation)]))&&
  exactSet(new Set(personValues('sameAs')),expectedSameAs)&&
  exactSet(new Set(personValues('image')),new Set([graphRef(projectedPerson.image?.[0]??projectedPerson.image)]))&&
  personValues('description').length===0&&
  !/<img\b(?=[^>]*\bitemprop=["'][^"']*\bimage\b[^"']*["'])[^>]*>/i.test(personHeader);
const runtime=guideNavigator.match(/<script\b(?=[^>]*\bid=["']site-runtime["'])[^>]*>([\s\S]*?)<\/script>/i)?.[1]||'';
try{new Function(runtime)}catch(error){fail(`Site runtime syntax failed: ${error.message}`)}
const searchSemantics=/<dialog\b(?=[^>]*\bid=["']guide-search["'])(?=[^>]*\baria-modal=["']true["'])[^>]*>/i.test(guideNavigator)&&/<div\b(?=[^>]*\bclass=["']guide-search__panel["'])(?=[^>]*\brole=["']search["'])[^>]*>/i.test(guideNavigator)&&/<input\b(?=[^>]*\btype=["']search["'])(?=[^>]*\baria-describedby=["']guide-search-status["'])[^>]*>/i.test(guideNavigator)&&runtime.includes("setAttribute('aria-current','location')");
const canonicalMainContentIds=new Set((webpage?.mainContentOfPage||[]).map(graphRef).filter(Boolean));
const expectedMainContentIds=new Set((googlePageNode?.mainContentOfPage||[]).map(graphRef).filter(Boolean));
const projectedMainContentTags=[...body.matchAll(/<(?:section|details)\b(?=[^>]*\bitemprop=["']mainContentOfPage["'])[^>]*>/gi)].map(match=>match[0]);
const projectedMainContentIds=new Set(projectedMainContentTags.map(tag=>attr(tag,'itemid')).filter(Boolean));
const missingMainContent=[...expectedMainContentIds].filter(id=>!projectedMainContentIds.has(id));
const extraMainContent=[...projectedMainContentIds].filter(id=>!expectedMainContentIds.has(id));
if(!expectedMainContentIds.size||!exactSet(expectedMainContentIds,canonicalMainContentIds)||missingMainContent.length||extraMainContent.length||[...expectedMainContentIds].some(id=>!supportIds.includes(id))||projectedMainContentTags.some(tag=>attr(tag,'itemtype')!=='https://schema.org/WebPageElement'))fail(`Visible/Head/support mainContentOfPage projection drift: missing=${missingMainContent.join(',')} extra=${extraMainContent.join(',')}`);
for(const tag of projectedMainContentTags){
  const itemId=attr(tag,'itemid'),labelId=attr(tag,'aria-labelledby'),node=graphNode(itemId);
  const scopeStart=body.indexOf(tag)+tag.length;
  const scopePrelude=body.slice(scopeStart,scopeStart+2500);
  const heading=labelId
    ?body.match(new RegExp(`<h[2-6]\\b(?=[^>]*\\bid=["']${escapeRegExp(labelId)}["'])[^>]*>[\\s\\S]*?<\\/h[2-6]>`,'i'))?.[0]||''
    :body.slice(body.indexOf(tag)+tag.length).match(/<h[2-6]\b[^>]*>[\s\S]*?<\/h[2-6]>/i)?.[0]||'';
  const visibleName=stripMarkup(heading);
  const canonicalNames=graphValues(node?.name).map(graphText).filter(Boolean);
  const sectionLinks=[...scopePrelude.matchAll(/<link\b[^>]*>/gi)].map(match=>match[0]);
  const sectionMeta=[...scopePrelude.matchAll(/<meta\b[^>]*>/gi)].map(match=>match[0]);
  if(!heading||!tagProperties(heading).includes('name')||!canonicalNames.includes(visibleName)||!sectionLinks.some(link=>tagProperties(link).includes('url')&&attr(link,'href')===node.url)||!sectionMeta.some(meta=>tagProperties(meta).includes('inLanguage')&&attr(meta,'content')===node.inLanguage))fail(`Visible WebPageElement name/url/language drift: ${itemId} -> ${visibleName||'missing'}`);
}

const howToId='https://www.ghezelbaash.ir/#howto-clinical-aesthetic-decision-pathway';
const howTo=graphNode(howToId);
const expectedStepIds=(howTo?.step||[]).map(graphRef).filter(Boolean);
const howToTarget=String(howTo?.url||'').split('#')[1]||'';
const graphHowToValid=graphTypes(howTo).includes('HowTo')&&expectedStepIds.length===4&&howToTarget&&idSet.has(howToTarget)&&expectedStepIds.every((stepId,index)=>{const step=graphNode(stepId);return graphTypes(step).includes('HowToStep')&&step?.position===index+1&&String(step?.name||'').trim()&&String(step?.text||'').trim()});
if(!graphHowToValid)fail('HowTo graph-to-visible-diagnostic-content contract drift');
const headerLandmark=/<header\b[^>]*\baria-labelledby=["']saeed-ghezelbash["']/i.test(body),navigationLandmark=/<nav\b[^>]*\bid=["']aesthetic-medicine-table-of-contents["']/i.test(body);
if(!pageMicrodata||!personMicrodata||!searchSemantics||!headerLandmark||!navigationLandmark)fail(`Entity Home/Article/Header/Nav/Search semantic contract drift: page=${pageMicrodata} person=${personMicrodata} search=${searchSemantics} header=${headerLandmark} nav=${navigationLandmark}`);

console.log(JSON.stringify({stage:'SEMANTIC_HTML',h1:1,h2:headings.filter(item=>item.level===2).length,headings:headings.length,sections:sections.length,details:details.length,figures:(body.match(/<figure\b/gi)||[]).length,images:(body.match(/<img\b/gi)||[]).length,duplicateIds:0,brokenFragments:0,headingJumps:0,verifiedIdentity:'PASS',entityHomeMicrodata:'PASS',inlineProfilePages:1,medicalReviewParity:'PASS',articleLandmark:'PASS',mainContentProjections:projectedMainContentIds.size,howToSteps:expectedStepIds.length,howToGraphProjection:'PASS',mediaGraphBridges:mediaBridges.length,mediaCaptionBindings:mediaBridges.filter(item=>item.caption).length,searchLandmark:'PASS',landmarks:'PASS',integrity:'PASS'},null,2));
