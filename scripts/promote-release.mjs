import {readFile, writeFile} from 'node:fs/promises';

const args=Object.fromEntries(process.argv.slice(2).map(x=>{const [k,...v]=x.replace(/^--/,'').split('=');return [k,v.join('=')]}));
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const writeJson=(file,value)=>writeFile(file,`${JSON.stringify(value,null,2)}\n`);
const release=await readJson('src/data/release.json');
const old={release:release.release,date:release.dateModified,recordId:String(release.dataset.zenodo.recordId),versionDoi:release.dataset.zenodo.versionDoi};
const next={
  release:args.version||old.release,
  date:args.date||old.date,
  recordId:args['zenodo-record']||old.recordId,
  versionDoi:args['zenodo-doi']||old.versionDoi,
  state:args.state||release.dataset.zenodo.state
};
if(!/^\d+\.\d+\.\d+$/.test(next.release)||!/^\d{4}-\d{2}-\d{2}$/.test(next.date)||!/^\d+$/.test(next.recordId)||!/^10\.5281\/zenodo\.\d+$/.test(next.versionDoi))throw new Error('Invalid release promotion arguments');

if(next.release!==old.release){
  release.dataset.zenodo.previousVersion={release:old.release,recordId:old.recordId,versionDoi:old.versionDoi};
}
release.release=next.release;
release.dateModified=next.date;
Object.assign(release.dataset.zenodo,{versionDoi:next.versionDoi,recordId:next.recordId,state:next.state});
delete release.dataset.zenodo.draftApi;
delete release.dataset.zenodo.publishedApi;
if(next.state==='published')release.dataset.zenodo.publishedApi=`https://zenodo.org/api/records/${next.recordId}`;
else if(next.state==='doi-locked-draft')release.dataset.zenodo.draftApi=`https://zenodo.org/api/deposit/depositions/${next.recordId}`;
else throw new Error(`Unsupported release state ${next.state}`);
await writeJson('src/data/release.json',release);

for(const file of ['package.json','package-lock.json']){
  const value=await readJson(file);
  value.version=next.release;
  if(value.packages?.[''])value.packages[''].version=next.release;
  await writeJson(file,value);
}
const inv=await readJson('src/data/release-invariants.json');
inv.release=next.release;inv.date=next.date;
await writeJson('src/data/release-invariants.json',inv);

const stableEvidence='https://www.ghezelbaash.ir/#evidence-zenodo-current-release';
for(const file of ['src/data/volatile-facts.json','src/data/evidence-snapshot.json','src/data/evidence-registry.json']){
  const value=await readJson(file);
  if(Object.hasOwn(value,'release'))value.release=next.release;
  const walk=x=>{
    if(Array.isArray(x))return x.map(walk);
    if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,walk(v)]));
    if(typeof x!=='string')return x;
    if(x===`https://www.ghezelbaash.ir/#evidence-doi-org-10-5281-zenodo-18765169`)return stableEvidence;
    if(x===`https://doi.org/${old.versionDoi}`)return `https://doi.org/${next.versionDoi}`;
    return x;
  };
  await writeJson(file,walk(value));
}

const graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
const replaceDeep=x=>{
  if(Array.isArray(x))return x.map(replaceDeep);
  if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,replaceDeep(v)]));
  if(typeof x!=='string')return x;
  if(x==='https://www.ghezelbaash.ir/#evidence-doi-org-10-5281-zenodo-18765169')return stableEvidence;
  if(x===old.versionDoi)return next.versionDoi;
  if(x===`https://doi.org/${old.versionDoi}`)return `https://doi.org/${next.versionDoi}`;
  if(x===`DOI:${old.versionDoi}`)return `DOI:${next.versionDoi}`;
  if(x===`https://zenodo.org/records/${old.recordId}`)return `https://zenodo.org/records/${next.recordId}`;
  if(x.includes('explore.openaire.eu/search/result?pid=10.5281%2Fzenodo.'))return `https://explore.openaire.eu/search/result?pid=${encodeURIComponent(next.versionDoi)}`;
  return x;
};
const synchronized=replaceDeep(graph);
const nodes=synchronized['@graph'];
const byId=new Map(nodes.filter(x=>x?.['@id']).map(x=>[x['@id'],x]));
for(const node of nodes){
  if(node.version===old.release)node.version=next.release;
  if(node.dateModified===old.date||node.dateModified==='2026-08-08')node.dateModified=next.date;
}
const project=byId.get('https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-project');
project.description=`First-party Version ${next.release} structured-data project for Dr. Saeed Ghezelbash and his aesthetic clinic. The canonical website Dataset is generated from this source; GitHub is the version-controlled source, Zenodo is the immutable preservation distribution, and Hugging Face is the secondary AI/ML distribution.`;
project.dateModified=next.date;
const github=byId.get('https://www.ghezelbaash.ir/#project-github-source');
github.version=next.release;github.dateModified=next.date;
github.description=`Version-controlled source for Version ${next.release} of the canonical website Dataset; it is a source repository and access point, not an identity-equivalent Dataset.`;
const hf=byId.get('https://www.ghezelbaash.ir/#project-huggingface-dataset');
hf.version=next.release;hf.dateModified=next.date;
hf.encodingFormat=['application/ld+json','text/turtle','text/csv','text/plain','application/json','application/xml'];
hf.description=`Secondary AI/ML distribution of Version ${next.release}. Its Core files are byte-faithful mirrors of the canonical website Dataset; its clearly labeled enrichment layer is derived, synthetic retrieval material and is not canonical factual evidence.`;
hf.additionalType='https://schema.org/DataDownload';
const zenodo=byId.get('https://www.ghezelbaash.ir/#project-zenodo-release');
zenodo['@type']='DataDownload';
zenodo.name=`Dr. Saeed Ghezelbash Public Knowledge Graph — Zenodo preservation distribution ${next.release}`;
zenodo.url=`https://doi.org/${next.versionDoi}`;
zenodo.identifier=`DOI:${next.versionDoi}`;
zenodo.version=next.release;zenodo.datePublished=next.date;zenodo.dateModified=next.date;
zenodo.sameAs=`https://zenodo.org/records/${next.recordId}`;
zenodo.contentUrl=`https://doi.org/${next.versionDoi}`;
delete zenodo.codeRepository;
zenodo.description=`Immutable DOI-preserved secondary distribution of Version ${next.release} of the canonical Dr. Saeed Ghezelbash Public Knowledge Graph Dataset.`;
const dataset=byId.get('https://www.ghezelbaash.ir/graph.jsonld#dataset');
dataset.version=next.release;dataset.dateModified=next.date;
dataset.sameAs=['https://www.wikidata.org/entity/Q140304972'];
dataset.url='https://www.ghezelbaash.ir/';
dataset.description=`Canonical first-party Dataset for Dr. Saeed Ghezelbash and Dr. Saeed Ghezelbash Aesthetic Clinic. The website JSON-LD is the canonical graph representation. GitHub is its source repository, Zenodo is an immutable preservation distribution, and Hugging Face is a secondary AI/ML distribution; those access points are related distributions, not identity-equivalent entities.`;
for(const id of dataset.identifier||[])if(id?.propertyID==='DOI'&&id?.value===next.versionDoi)id.name=`Zenodo Version DOI ${next.release}`;
const catalog=byId.get('https://www.ghezelbaash.ir/#data-catalog');
catalog.dateModified=next.date;catalog.version=next.release;
catalog.description='First-party structured-data catalog for Dr. Saeed Ghezelbash. It contains the canonical website Dataset and explicitly related source, preservation and AI/ML distribution layers without collapsing their identities.';
await writeJson('src/data/semantic/knowledge-graph.jsonld',synchronized);

const englishDate=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${next.date}T00:00:00Z`));
const replacements=[
  ['src/data/templates/main-head.html',text=>text.replace(/<link href="https:\/\/doi\.org\/10\.5281\/zenodo\.\d+" rel="related" title="(?:Zenodo DOI|Zenodo preservation Version DOI [^"]+)"\/>/,`<link href="https://doi.org/${next.versionDoi}" rel="related" title="Zenodo preservation Version DOI ${next.release}"/>`)],
  ['src/content-source/100-rc099.html',text=>text
    .replaceAll(`https://doi.org/${old.versionDoi}`,`https://doi.org/${next.versionDoi}`)
    .replaceAll(old.versionDoi,next.versionDoi)
    .replaceAll(`Version ${old.release}`,`Version ${next.release}`)
    .replace(/version \d+\.\d+\.\d+ release(?=<\/a>,\s*published on)/,`version ${next.release} release`)
    .replace(/reviewed on \d{1,2} [A-Za-z]+ \d{4}/,`reviewed on ${englishDate}`)
    .replace(/published on \d{1,2} [A-Za-z]+ \d{4}/,`published on ${englishDate}`)
    .replace(/published \d{1,2} [A-Za-z]+ \d{4}/,`published ${englishDate}`)
    .replace(/Version [\d.]+, \d{1,2} [A-Za-z]+ \d{4}\. Zenodo\./,`Version ${next.release}, ${englishDate}. Zenodo.`)
    .replace('Resource types</strong></dt><dd>Software, dataset, knowledge base and knowledge graph','Resource types</strong></dt><dd>Dataset, knowledge base and knowledge graph')
    .replace(/pid=10\.5281%2Fzenodo\.\d+/,`pid=${encodeURIComponent(next.versionDoi)}`)],
  ['README.md',text=>text
    .replace(/Current source release: `[^`]+`/,`Current source release: \`${next.release}\``)
    .replace(/Current Zenodo Version DOI: `[^`]+`/,`Current Zenodo Version DOI: \`${next.versionDoi}\``)],
  ['CITATION.cff',text=>text
    .replace(/^version: .+$/m,`version: ${next.release}`)
    .replace(/^date-released: .+$/m,`date-released: ${next.date}`)
    .replace(/^doi: .+$/m,`doi: ${next.versionDoi}`)]
];
for(const [file,fn] of replacements)await writeFile(file,fn(await readFile(file,'utf8')));
const codemeta=await readJson('codemeta.json');
codemeta.softwareVersion=next.release;codemeta.dateModified=next.date;
codemeta.subjectOf.version=next.release;codemeta.subjectOf.identifier=`https://doi.org/${next.versionDoi}`;
await writeJson('codemeta.json',codemeta);
for(const file of ['public/favicon.svg','public/safari-pinned-tab.svg','public/media/brand/doctor-ghezelbaash-symbol.3a9e7509912d.svg']){
  let text=await readFile(file,'utf8');
  text=text.replaceAll(`X-ENTITY-VERSION:${old.release}`,`X-ENTITY-VERSION:${next.release}`)
    .replaceAll(`Entity Contact Projection ${old.release}`,`Entity Contact Projection ${next.release}`)
    .replaceAll(`<entity:Version>${old.release}</entity:Version>`,`<entity:Version>${next.release}</entity:Version>`)
    .replaceAll(`REV:${old.date.replaceAll('-','')}T000000Z`,`REV:${next.date.replaceAll('-','')}T000000Z`);
  await writeFile(file,text);
}
console.log(JSON.stringify({promoted:true,from:old,to:next},null,2));
