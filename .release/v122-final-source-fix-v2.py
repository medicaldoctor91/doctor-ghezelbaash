from pathlib import Path
import json, re

ROOT=Path('.')

def replace_once(path,old,new):
    p=ROOT/path;s=p.read_text();n=s.count(old)
    if n!=1: raise SystemExit(f'{path}: expected exactly one match, got {n}: {old[:120]!r}')
    p.write_text(s.replace(old,new))

rollover=r'''import {readFile,writeFile} from 'node:fs/promises';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const [k,...v]=x.replace(/^--/,'').split('=');return[k,v.join('=')]}));
const target=args.date;if(!/^\d{4}-\d{2}-\d{2}$/.test(target||''))throw new Error('Usage: node scripts/rollover-release-date.mjs --date=YYYY-MM-DD');
const readJson=async f=>JSON.parse(await readFile(f,'utf8')),writeJson=(f,v)=>writeFile(f,JSON.stringify(v,null,2)+'\n');
const release=await readJson('src/data/release.json'),oldDate=release.dateModified,version=release.release,z=release.dataset?.zenodo;
if(!z||!z.versionDoi||!z.recordId)throw new Error('Release Zenodo identity missing');
if(oldDate===target){console.log(JSON.stringify({releaseDateRollover:'NOOP',release:version,date:target,versionDoi:z.versionDoi,recordId:String(z.recordId)}));process.exit(0)}
if(oldDate>target)throw new Error(`Release date rollback forbidden ${oldDate} -> ${target}`);
const identity=JSON.stringify({conceptDoi:z.conceptDoi,versionDoi:z.versionDoi,recordId:String(z.recordId)}),medicalReviewedAt=release.medicalReviewedAt;
const historical=structuredClone(z.releaseHistory||[]).filter(x=>x.release!==version);
release.dateModified=target;const current=(z.releaseHistory||[]).find(x=>x.release===version);if(!current)throw new Error(`Current releaseHistory entry missing ${version}`);current.publicationDate=target;await writeJson('src/data/release.json',release);
const inv=await readJson('src/data/release-invariants.json');if(inv.release!==version||inv.date!==oldDate)throw new Error('Invariant date does not match pre-rollover release truth');inv.date=target;await writeJson('src/data/release-invariants.json',inv);
const cm=await readJson('codemeta.json');if(cm.softwareVersion!==version||cm.dateModified!==oldDate)throw new Error('CodeMeta pre-rollover drift');cm.dateModified=target;await writeJson('codemeta.json',cm);
let citation=await readFile('CITATION.cff','utf8');const oldCitation=`date-released: ${oldDate}`,newCitation=`date-released: ${target}`;if(citation.split(oldCitation).length-1!==1)throw new Error('CITATION release-date target drift');await writeFile('CITATION.cff',citation.replace(oldCitation,newCitation));
const requestPath='.release/release-request-v1.2.2.json';const req=await readJson(requestPath);if(req.targetVersion!==version||req.releaseDate!==oldDate)throw new Error('Release request pre-rollover drift');req.releaseDate=target;req.rerunNonce=`${target}-final-145-locked-rollover`;await writeJson(requestPath,req);
const graphPath='src/data/semantic/knowledge-graph.jsonld',graph=await readJson(graphPath);let graphChanges=0;for(const node of graph['@graph']||[]){if(String(node.version||'')===version){if(node.dateModified===oldDate){node.dateModified=target;graphChanges++}if(node.datePublished===oldDate){node.datePublished=target;graphChanges++}}}if(!graphChanges)throw new Error('No current-version graph release-date fields changed');await writeJson(graphPath,graph);
const contentPath='src/content-source/100-rc099.html';let content=await readFile(contentPath,'utf8');const fmt=d=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));const oldHuman=fmt(oldDate),newHuman=fmt(target),hits=content.split(oldHuman).length-1;if(hits<1)throw new Error(`Visible release-date representation missing ${oldHuman}`);content=content.split(oldHuman).join(newHuman);await writeFile(contentPath,content);
const after=await readJson('src/data/release.json'),afterZ=after.dataset.zenodo;if(JSON.stringify({conceptDoi:afterZ.conceptDoi,versionDoi:afterZ.versionDoi,recordId:String(afterZ.recordId)})!==identity)throw new Error('DOI/record identity changed during rollover');if(after.medicalReviewedAt!==medicalReviewedAt)throw new Error('medicalReviewedAt changed during release rollover');if(JSON.stringify((afterZ.releaseHistory||[]).filter(x=>x.release!==version))!==JSON.stringify(historical))throw new Error('Historical release history changed during rollover');
console.log(JSON.stringify({releaseDateRollover:'PASS',release:version,from:oldDate,to:target,medicalReviewedAt,versionDoi:afterZ.versionDoi,recordId:String(afterZ.recordId),graphChanges,visibleReleaseDateHits:hits},null,2));
'''
(ROOT/'scripts/rollover-release-date.mjs').write_text(rollover)

p=ROOT/'scripts/generate-projections.mjs';s=p.read_text();s2=s.replace('REVIEWED_AT: ${release.dateModified}','REVIEWED_AT: ${release.medicalReviewedAt}').replace('# Release ${release.release}; reviewed ${release.dateModified}; provenance-rich canonical answer records','# Release ${release.release}; reviewed ${release.medicalReviewedAt}; provenance-rich canonical answer records').replace('> Release: ${release.release} | Reviewed: ${release.dateModified}','> Release: ${release.release} | Reviewed: ${release.medicalReviewedAt}')
if s2==s or s2.count('${release.medicalReviewedAt}')<3: raise SystemExit('generate-projections medical review decoupling patch failed')
p.write_text(s2)

replace_once('scripts/finalize-dist.mjs',"import { assertDocumentContract, inspectHtml } from './lib/html-contract.mjs';","import { assertDocumentContract, inspectHtml } from './lib/html-contract.mjs';\nimport { resolveDeterministicBuildInstant } from './lib/deterministic-build-time.mjs';")
replace_once('scripts/finalize-dist.mjs',"const release=JSON.parse(await readFile(path.join(data,'release.json'),'utf8'));","const release=JSON.parse(await readFile(path.join(data,'release.json'),'utf8'));\nconst generatedAt=resolveDeterministicBuildInstant({releaseDate:release.dateModified}).iso;")
replace_once('scripts/finalize-dist.mjs',"const datasetDescription=typeof dataset?.description==='string'?dataset.description:'Physician-owned first-party entity, clinic, medical-topic, answer and provenance dataset for Saeed Ghezelbash.';","const datasetDescription=typeof dataset?.description==='string'?dataset.description:'Physician-owned first-party entity, clinic, medical-topic, answer and provenance dataset for Saeed Ghezelbash.';\nconst createdAt=(release.dataset.zenodo.releaseHistory||[]).map(x=>x.publicationDate).sort()[0]||release.dateModified;")
p=ROOT/'scripts/finalize-dist.mjs';s=p.read_text()
s=s.replace('dct:title "Doctor Ghezelbash Structured Data Catalog"@en','dct:title "${datasetName} — Data Catalog"@en')
s=s.replace("name:'dr-saeed-ghezelbash-entity-data',title:'Dr. Saeed Ghezelbash Entity Knowledge Graph Data Package',description:'Physician-owned first-party entity, clinic, medical-topic, answer and provenance resources for Saeed Ghezelbash. The physician is the primary entity and publisher; the clinic and structured-data project are supporting assets.'","name:'dr-saeed-ghezelbash-public-knowledge-graph',title:`${datasetName} — Data Package`,description:'Physician-owned first-party knowledge graph, direct-answer, evidence, provenance and retrieval resources for Dr. Saeed Ghezelbash and the supporting clinic.'")
s=s.replace('version:release.release,created:release.dateModified,lastUpdated:release.dateModified','version:release.release,created:createdAt,lastUpdated:release.dateModified')
s=s.replace("name:'Dr. Saeed Ghezelbash Entity Knowledge Graph',description:'Physician-owned first-party entity, clinic, medical-topic, answer and provenance dataset for Saeed Ghezelbash. The physician is the primary entity, creator and publisher.'","name:datasetName,description:'Physician-owned first-party knowledge graph Dataset for Dr. Saeed Ghezelbash, the supporting clinic, services, answers, provenance and machine retrieval.'")
s=s.replace("version:release.release,datePublished:'2026-07-25',dateCreated:'2026-07-25',dateModified:release.dateModified","version:release.release,datePublished:release.dateModified,dateCreated:createdAt,dateModified:release.dateModified")
s=s.replace("const htmlContract=assertDocumentContract(html,{expectedContentSections:inv.contentSectionCount})","const htmlContract=assertDocumentContract(html)")
s=s.replace("generatedAt:`${inv.date}T05:58:00+03:30`","generatedAt")
s=s.replace("review:{date:inv.date,reviewedBy:inv.reviewedBy}","review:{date:release.medicalReviewedAt,reviewedBy:inv.reviewedBy}")
for forbidden in ['Doctor Ghezelbash Structured Data Catalog','Dr. Saeed Ghezelbash Entity Knowledge Graph Data Package',"name:'Dr. Saeed Ghezelbash Entity Knowledge Graph'","datePublished:'2026-07-25'","T05:58:00+03:30","expectedContentSections:inv.contentSectionCount"]:
    if forbidden in s: raise SystemExit(f'finalize-dist legacy writer fragment remains: {forbidden}')
p.write_text(s)

inv_path=ROOT/'src/data/release-invariants.json';inv=json.loads(inv_path.read_text())
obsolete=['renderChunkCount','clipCount','chapterTrackCount','targetHtmlBytes','fullGraphNodeCount','inlineEligibleClipCount','captionTrackTarget','inlineSemanticClipCount','exactBestDoctorHeadingCount','instagramHeadingLinkCount','supportNodeTarget','headSameAsCount','headAlternateNameCount','directAnswerCapsuleCount','minVisibleEvidenceCapsules','machineResourceCount','googleSitemapMachineUrlCount','googleSearchLandingCount','directAnswerExecutiveCount','directAnswerFullCount','integratedFullAnswerCount','canonicalAnswerTextVisibleCount','directAnswerHeadingLevel','contentSectionCount','googleInlineSemanticClipCount','googleInlineSupportNodeTarget','googleInlineKurdishClipCount']
text_files=[p for p in ROOT.rglob('*') if p.is_file() and p!=inv_path and '.git' not in p.parts and 'node_modules' not in p.parts]
for key in obsolete:
    pat=re.compile(rf'\b(?:inv|invariants)\s*\.\s*{re.escape(key)}\b');refs=[]
    for fp in text_files:
        try:t=fp.read_text()
        except Exception:continue
        if pat.search(t):refs.append(str(fp))
    if refs:raise SystemExit(f'Cannot remove {key}; runtime references remain: {refs}')
    inv.pop(key,None)
inv['contractClasses']={'architectural':{'singleCanonicalPage':True,'maxHtmlBytesField':'maxHtmlBytes','googlebotFetchBudgetBytesField':'googlebotFetchBudgetBytes','maxOrphanGraphNodesField':'maxOrphanGraphNodes','maxHeadGraphBytesField':'maxHeadGraphBytes','maxSupportGraphBytesField':'maxSupportGraphBytes'},'strategic':{'aggressiveHeadingSet':'src/data/visible-contract.json#protected.aggressiveHeadings','instagramHeadingAssociationSet':'src/data/visible-contract.json#protected.instagramHeadingLinks','serviceSet':'src/data/service-registry.json#services[publishable=true]','physicianFirstIdentity':True},'releaseDerivedMeasurements':{'rdfTripleCountField':'externalRdfTripleCount','renderChunkSet':'src/data/render-calibration.json','graphNodeCount':'measured-at-build','serviceCount':'derived-from-service-registry','answerCount':'derived-from-answer-registry','supportNodeCount':'derived-from-projection','htmlBytes':'measured-at-build'}}
inv_path.write_text(json.dumps(inv,ensure_ascii=False,indent=2)+'\n')

replace_once('scripts/validate-v122-contract.mjs',"const R=release.release,Z=release.dataset?.zenodo;","const R=release.release,Z=release.dataset?.zenodo;\nif(Object.hasOwn(inv,'targetHtmlBytes'))fail('Obsolete targetHtmlBytes ceiling/fill target remains');\nif(!inv.contractClasses?.architectural||!inv.contractClasses?.strategic||!inv.contractClasses?.releaseDerivedMeasurements)fail('Invariant classification contract missing');")

p=ROOT/'scripts/validate-dist.mjs';s=p.read_text()
needle="const html=await readFile(path.join(dist,'index.html'),'utf8'),htmlBytes=Buffer.byteLength(html),headers=await readFile(path.join(dist,'_headers'),'utf8'),robots=await readFile(path.join(dist,'robots.txt'),'utf8'),graphBytes=await readFile(path.join(dist,'graph.jsonld')),graph=JSON.parse(graphBytes),graphText=graphBytes.toString(),manifestBytes=await readFile(path.join(dist,'artifact-manifest.json')),manifest=JSON.parse(manifestBytes),att=JSON.parse(await readFile(path.join(dist,'live-serving-attestation.json'),'utf8')),liveBytes=await readFile(path.join(dist,'live-observations.jsonld')),live=JSON.parse(liveBytes),matrix=await readJson(path.join(dist,'current-release-matrix.json')),sitemap=await readFile(path.join(dist,'sitemap.xml'),'utf8');"
if s.count(needle)!=1:raise SystemExit('validate-dist load anchor drift')
extra=r'''
const dp=await readJson(path.join(dist,'datapackage.json')),cr=await readJson(path.join(dist,'croissant.json')),answersText=await readFile(path.join(dist,'answers.txt'),'utf8'),dcatText=await readFile(path.join(dist,'dcat.ttl'),'utf8'),createdAt=(release.dataset.zenodo.releaseHistory||[]).map(x=>x.publicationDate).sort()[0]||release.dateModified;
if(dp.name!=='dr-saeed-ghezelbash-public-knowledge-graph'||dp.title!==`${release.dataset.name} — Data Package`||dp.version!==release.release||dp.created!==createdAt||dp.lastUpdated!==release.dateModified)fail('Data Package canonical identity/date drift');
if(cr.name!==release.dataset.name||cr.version!==release.release||cr.dateCreated!==createdAt||cr.datePublished!==release.dateModified||cr.dateModified!==release.dateModified)fail('Croissant canonical identity/date drift');
if(!dcatText.includes(`dct:title "${release.dataset.name} — Data Catalog"@en`))fail('DCAT canonical Dataset catalog title drift');
if(!answersText.includes(`REVIEWED_AT: ${release.medicalReviewedAt}`)||!answersText.includes(`# Release ${release.release}; reviewed ${release.medicalReviewedAt};`))fail('Answer corpus medical review truth drift');
if(release.medicalReviewedAt!==release.dateModified&&answersText.includes(`REVIEWED_AT: ${release.dateModified}`))fail('Release date leaked into medical review timestamp');'''
s=s.replace(needle,needle+extra);p.write_text(s)
print(json.dumps({'materialized':True,'scope':'release-date-rollover-medical-review-descriptor-invariant-truth','materializerVersion':2},indent=2))
