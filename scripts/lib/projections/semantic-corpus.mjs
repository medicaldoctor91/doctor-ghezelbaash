import path from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
import {expandKnowledgeXml} from '../knowledge-xml.mjs';
import {csvCell,nodeTypes,refIds,sha256,valueText} from '../projection-context.mjs';

const xml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

export async function compileSemanticCorpus(context){
  const {data,projections,release,graph,byId,graphByUrl,evidenceRefsForNode}=context;

  const rows=[['subject','type','name','predicate','value','object','object_name','language','datatype','provenance','dataset','version','modified']];
  const add=(node,predicate,value)=>{
    for(const item of (Array.isArray(value)?value:[value])){
      let literal='',object='',language='',datatype='';
      if(item&&typeof item==='object'){
        if(item['@id'])object=item['@id'];
        else if(item['@value']!=null){literal=String(item['@value']);language=item['@language']||'';datatype=item['@type']||'';}
        else literal=JSON.stringify(item);
      }else literal=String(item??'');
      rows.push([
        node['@id']||'',nodeTypes(node).join('|'),context.nodeName(node),predicate,literal,object,context.nodeName(byId.get(object)),language,datatype,
        node['@id']||'',`${release.canonicalUrl}graph.jsonld#dataset`,release.release,release.dateModified,
      ]);
    }
  };
  for(const node of graph['@graph'])for(const [predicate,value] of Object.entries(node))if(predicate!=='@id')add(node,predicate,value);
  await writeFile(path.join(projections,'entity-facts.csv'),rows.map(row=>row.map(csvCell).join(',')).join('\n')+'\n');

  const answerRecords=[];
  for(const question of graph['@graph'].filter(node=>nodeTypes(node).includes('Question'))){
    const answerId=question.acceptedAnswer?.['@id'];
    const answer=answerId&&byId.get(answerId);
    if(!answer)continue;
    const sourceUrl=question.url||question['@id'];
    const section=graphByUrl.get(sourceUrl);
    const claimEvidenceIds=[...new Set([
      ...evidenceRefsForNode(question),
      ...evidenceRefsForNode(answer),
      ...evidenceRefsForNode(section),
    ])];
    const aboutEntityIds=refIds(question.about).filter(id=>id===release.primaryEntity.id||id===release.clinic.id);
    const entityEvidenceIds=[...new Set(aboutEntityIds.flatMap(id=>evidenceRefsForNode(byId.get(id))))];
    const evidenceIds=[...new Set([...claimEvidenceIds,...entityEvidenceIds])];
    const sourceHash=sha256(Buffer.from(valueText(answer.text)));
    const executiveSummary=valueText(answer.description);
    const executiveSummaryHash=executiveSummary?sha256(Buffer.from(executiveSummary)):'';
    answerRecords.push({q:question,a:answer,sourceUrl,evidenceIds,claimEvidenceIds,entityEvidenceIds,sourceHash,executiveSummary,executiveSummaryHash});
  }
  const answers=answerRecords.map(({q,a,sourceUrl,evidenceIds,claimEvidenceIds,entityEvidenceIds,sourceHash,executiveSummary,executiveSummaryHash})=>`QUESTION_ID: ${q['@id']}
QUESTION: ${valueText(q.name)}
ANSWER_ID: ${a['@id']}
EXECUTIVE_SUMMARY: ${executiveSummary}
EXECUTIVE_SUMMARY_HASH_SHA256: ${executiveSummaryHash}
ANSWER: ${valueText(a.text)}
LANGUAGE: ${a.inLanguage||q.inLanguage||'fa-IR'}
SOURCE: ${sourceUrl}
SOURCE_HASH_SHA256: ${sourceHash}
ABOUT_IDS: ${valueText(q.about)}
EVIDENCE_IDS: ${evidenceIds.join(' | ')}
CLAIM_EVIDENCE_IDS: ${claimEvidenceIds.join(' | ')}
ENTITY_EVIDENCE_IDS: ${entityEvidenceIds.join(' | ')}
PROVENANCE_CLASS: first-party physician-reviewed canonical guidance
REVIEWED_BY: ${release.reviewedBy}
REVIEWED_AT: ${release.medicalReviewedAt}
VERSION: ${release.release}
`);
  await writeFile(path.join(projections,'answers.txt'),`# Direct-answer corpus — Dr. Saeed Ghezelbash
# Release ${release.release}; medically reviewed ${release.medicalReviewedAt}; provenance-rich canonical answer records

${answers.join('\n---\n\n')}`);

  const person=byId.get(release.primaryEntity.id);
  const clinic=byId.get(release.clinic.id);
  const dataset=byId.get(`${release.canonicalUrl}graph.jsonld#dataset`);
  const distributions=graph['@graph'].filter(node=>nodeTypes(node).includes('DataDownload'));
  const questions=graph['@graph'].filter(node=>nodeTypes(node).includes('Question'));
  const aliases=[...release.primaryEntity.officialAliases,...(release.primaryEntity.reconciliationAliases||[])];
  const knowledge=`<?xml version="1.0" encoding="UTF-8"?>\n<knowledge release="${release.release}" modified="${release.dateModified}" canonical="${release.canonicalUrl}">\n  <primaryEntity id="${xml(person?.['@id'])}" googleKg="${xml(release.primaryEntity.googleKnowledgeGraphId)}" wikidata="${xml(release.primaryEntity.wikidata)}"><name>Saeed Ghezelbash</name>${aliases.map(alias=>`<alias>${xml(alias)}</alias>`).join('')}</primaryEntity>\n  <ownedClinic id="${xml(clinic?.['@id'])}" googleLocalKg="${xml(release.clinic.googleLocalKgmid)}" placeId="${xml(release.clinic.placeId)}" cid="${xml(release.clinic.cid)}" postalCode="${xml(release.clinic.postalCode)}"><hours>${xml(release.clinic.hours)}</hours><owner ref="${xml(release.primaryEntity.id)}"/></ownedClinic>\n  <dataset id="${xml(dataset?.['@id'])}" version="${release.release}" creator="${xml(release.primaryEntity.id)}" publisher="${xml(release.primaryEntity.id)}">${distributions.map(node=>`<distribution id="${xml(node['@id'])}" url="${xml(node.contentUrl||node.url)}" format="${xml(node.encodingFormat)}"/>`).join('')}</dataset>\n  <answers count="${questions.length}">${questions.map(question=>`<question id="${xml(question['@id'])}" url="${xml(question.url||question['@id'])}">${xml(valueText(question.name))}</question>`).join('')}</answers>\n</knowledge>\n`;
  const intentSource=await readFile(path.join(data,'templates/llms.template.txt'),'utf8');
  const completeKnowledge=expandKnowledgeXml({body:knowledge,graph,evidenceRegistry:context.evidenceRegistry,intentSource});
  await writeFile(path.join(projections,'knowledge.xml'),completeKnowledge);

  return {rowsCount:rows.length-1,answersCount:answers.length,answerRecords};
}
