import {readFile,writeFile,rm} from 'node:fs/promises';

const args=Object.fromEntries(process.argv.slice(2).map(x=>{const [k,...v]=x.replace(/^--/,'').split('=');return [k,v.join('=')]}));
const readJson=async file=>JSON.parse(await readFile(file,'utf8'));
const writeJson=(file,value)=>writeFile(file,`${JSON.stringify(value,null,2)}\n`);
const must=(cond,msg)=>{if(!cond)throw new Error(msg)};
const release=await readJson('src/data/release.json');
const z=release.dataset?.zenodo;
must(z&&Array.isArray(z.releaseHistory),'release.json must be migrated to releaseHistory[] before promotion');
for(const forbidden of ['state','draftApi','publishedApi','previousVersion','historicalVersion'])must(!Object.hasOwn(z,forbidden),`Operational/legacy Zenodo field present before promotion: ${forbidden}`);
const old={release:release.release,date:release.dateModified,recordId:String(z.recordId),versionDoi:z.versionDoi};
const next={release:args.version,date:args.date,recordId:String(args['zenodo-record']||''),versionDoi:args['zenodo-doi']};
must(/^\d+\.\d+\.\d+$/.test(next.release||''),'Invalid --version');
must(/^\d{4}-\d{2}-\d{2}$/.test(next.date||''),'Invalid --date');
must(/^\d+$/.test(next.recordId),'Invalid --zenodo-record');
must(/^10\.5281\/zenodo\.\d+$/.test(next.versionDoi||''),'Invalid --zenodo-doi');
must(next.versionDoi!==z.conceptDoi,'Concept DOI cannot be the Version DOI');
if(next.release===old.release){
  must(next.versionDoi===old.versionDoi&&next.recordId===old.recordId&&next.date===old.date,'Idempotent promotion request drifted from current release');
  await rm('.release/release-request-v1.2.2.json',{force:true});
  console.log(JSON.stringify({promoted:false,idempotent:true,current:old},null,2));process.exit(0);
}
const existing=z.releaseHistory.find(x=>x.release===next.release);
if(existing)must(existing.versionDoi===next.versionDoi&&String(existing.recordId)===next.recordId&&existing.publicationDate===next.date,'Target release already exists with different identity');
else z.releaseHistory.push({release:next.release,recordId:next.recordId,versionDoi:next.versionDoi,publicationDate:next.date});
z.releaseHistory.sort((a,b)=>a.publicationDate.localeCompare(b.publicationDate)||a.release.localeCompare(b.release,undefined,{numeric:true}));
release.release=next.release;release.dateModified=next.date;z.recordId=next.recordId;z.versionDoi=next.versionDoi;
const updateReleaseScopedDates=obj=>{if(!obj||typeof obj!=='object')return;if(Array.isArray(obj)){obj.forEach(updateReleaseScopedDates);return}for(const [k,v] of Object.entries(obj)){if(k==='dateModified'&&v===old.date)obj[k]=next.date;else if(k==='version'&&v===old.release)obj[k]=next.release;else updateReleaseScopedDates(v)}};
updateReleaseScopedDates(release);
release.medicalReviewedAt=release.medicalReviewedAt||old.date;
release.evidencePolicy=release.evidencePolicy||{};
await writeJson('src/data/release.json',release);

const inv=await readJson('src/data/release-invariants.json');inv.release=next.release;inv.date=next.date;delete inv.personAvailableServiceCount;delete inv.clinicAvailableServiceCount;delete inv.fullGraphNodeCount;delete inv.externalRdfTripleCount;delete inv.renderChunkCount;delete inv.directAnswerExecutiveCount;delete inv.integratedFullAnswerCount;delete inv.supportNodeTarget;await writeJson('src/data/release-invariants.json',inv);

const pkg=await readJson('package.json');pkg.version=next.release;await writeJson('package.json',pkg);
const lock=await readJson('package-lock.json');lock.version=next.release;if(lock.packages?.[''])lock.packages[''].version=next.release;await writeJson('package-lock.json',lock);
const codemeta=await readJson('codemeta.json');codemeta.softwareVersion=next.release;codemeta.dateModified=next.date;if(codemeta.subjectOf){codemeta.subjectOf.version=next.release;codemeta.subjectOf.identifier=`https://doi.org/${next.versionDoi}`;codemeta.subjectOf.url=`https://doi.org/${next.versionDoi}`;}await writeJson('codemeta.json',codemeta);

let citation=await readFile('CITATION.cff','utf8');citation=citation.replace(/^version: .*$/m,`version: ${next.release}`).replace(/^date-released: .*$/m,`date-released: ${next.date}`).replace(/^doi: .*$/m,`doi: ${next.versionDoi}`);await writeFile('CITATION.cff',citation);
let front=await readFile('src/content-source/000-frontmatter.md','utf8');front=front.replace(/^dateModified:.*$/m,`dateModified: "${next.date}"`);await writeFile('src/content-source/000-frontmatter.md',front);

const graph=await readJson('src/data/semantic/knowledge-graph.jsonld');
const currentIds=new Set(['https://www.ghezelbaash.ir/graph.jsonld#dataset','https://www.ghezelbaash.ir/#project-huggingface-dataset','https://www.ghezelbaash.ir/#project-zenodo-release','https://www.ghezelbaash.ir/#doctor-ghezelbaash-structured-data-project']);
const walkGraph=v=>{if(Array.isArray(v)){v.forEach(walkGraph);return}if(!v||typeof v!=='object')return;const isCurrent=currentIds.has(v['@id']);for(const [k,x] of Object.entries(v)){if(isCurrent&&k==='version'&&x===old.release)v[k]=next.release;else if(isCurrent&&k==='dateModified'&&x===old.date)v[k]=next.date;else if(isCurrent&&typeof x==='string'){v[k]=x.replaceAll(`https://doi.org/${old.versionDoi}`,`https://doi.org/${next.versionDoi}`).replaceAll(`https://zenodo.org/records/${old.recordId}`,`https://zenodo.org/records/${next.recordId}`)}else walkGraph(x)}};
walkGraph(graph);await writeJson('src/data/semantic/knowledge-graph.jsonld',graph);

for(const file of ['src/data/evidence-registry.json','src/data/evidence-snapshot.json','src/data/volatile-facts.json']){const x=await readJson(file);if(Object.hasOwn(x,'release'))x.release=next.release;await writeJson(file,x)}

for(const file of ['src/data/templates/main-head.html','src/data/templates/llms.template.txt','README.md']){let t=await readFile(file,'utf8');t=t.replaceAll(old.release,next.release).replaceAll(old.versionDoi,next.versionDoi).replaceAll(old.recordId,next.recordId);await writeFile(file,t)}
let content=await readFile('src/content-source/100-rc099.html','utf8');
content=content.replaceAll(`Version ${old.release}`,`Version ${next.release}`).replaceAll(old.versionDoi,next.versionDoi).replaceAll(old.recordId,next.recordId).replaceAll(`published ${new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(old.date+'T00:00:00Z'))}`,`published ${new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(next.date+'T00:00:00Z'))}`);
await writeFile('src/content-source/100-rc099.html',content);
await rm('.release/release-request-v1.2.2.json',{force:true});
console.log(JSON.stringify({promoted:true,from:old,to:next,conceptDoi:z.conceptDoi,history:z.releaseHistory,operationalRequestRemoved:true},null,2));
