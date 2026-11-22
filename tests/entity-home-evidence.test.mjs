import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'parse5';
import {SOURCE} from '../src/canonical/source.mjs';
import {renderEntityHomeEvidence} from '../src/lib/entity-home-evidence.mjs';

const id=node=>node.attrs?.find(a=>a.name==='id')?.value;
const attr=(node,name)=>node.attrs?.find(a=>a.name===name)?.value;
const all=(node,fn,out=[])=>{
 if(fn(node))out.push(node);
 for(const child of node.childNodes||[])all(child,fn,out);
 return out;
};
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const document=parse(html);
const physicianId='https://www.ghezelbaash.ir/#saeed-ghezelbash';
const evidence=all(document,n=>n.tagName==='section'&&attr(n,'data-canonical-person')===physicianId);

test('Entity Home has one visible, source-backed physician expertise evidence section',()=>{
 assert.equal(evidence.length,1,'do not duplicate Entity Home evidence');
 assert.equal(evidence[0].tagName,'section');
 assert.equal(attr(evidence[0],'data-canonical-person'),physicianId);
 const allLinks=all(evidence[0],n=>n.tagName==='a').map(n=>attr(n,'href'));
 const person=SOURCE.graph['@graph'].find(n=>n['@id']===physicianId);
 for(const u of [
   'https://membersearch.irimc.org/member/profile?id=9efaaf28-52ff-49ad-8d45-be6e48c4fa3e',
   'https://orcid.org/0009-0001-9346-8475',
   'https://www.wikidata.org/entity/Q140287622'
 ]) {
   assert.ok(person.sameAs.includes(u),'offsite verification must already be bound to the same canonical Person');
   assert.ok(allLinks.includes(u),'missing visible verifiable entity reference: '+u);
 }
 for(const u of ['https://pubmed.ncbi.nlm.nih.gov/27280013/','https://pubmed.ncbi.nlm.nih.gov/34574943/'])
   assert.ok(allLinks.includes(u),'published scholarly authorship must remain directly checkable');
 assert.ok(allLinks.includes('https://www.ghezelbaash.ir/saeed-ghezelbash-diagnostic-philosophy'));
 assert.ok(allLinks.includes('/saeed-ghezelbash-research-education-and-clinical-decisions'));
 const hero=all(document,n=>attr(n,'class')?.split(/\s+/).includes('entity-hero'))[0];
 assert.ok(hero);
 assert.equal(evidence[0].parentNode,hero.parentNode,'evidence must appear in same human-reading context as physician identity');
 assert.equal(hero.parentNode.childNodes.indexOf(evidence[0]),hero.parentNode.childNodes.indexOf(hero)+1,
   'place authority evidence immediately after the physician entity hero');
});

test('stronger visible physician identity does not demote or duplicate all canonical RDF',()=>{
 const scripts=all(document,n=>n.tagName==='script'&&attr(n,'type')==='application/ld+json');
 assert.equal(scripts.length,1);
 assert.equal(id(scripts[0]),'canonical-entity-graph');
 assert.equal(scripts[0].parentNode?.tagName,'head');
 const graph=JSON.parse((scripts[0].childNodes||[]).map(n=>n.value||'').join(''));
 assert.equal(graph['@graph'].length,1916);
 const sourceIds=new Set(SOURCE.graph['@graph'].map(n=>n['@id']));
 assert.deepEqual(new Set(graph['@graph'].map(n=>n['@id'])),sourceIds);
 const home=graph['@graph'].find(n=>n['@id']==='https://www.ghezelbaash.ir/webpage');
 const p=graph['@graph'].find(n=>n['@id']===physicianId);
 assert.equal(graph['@graph'][0],home);
 assert.equal(graph['@graph'][1],p);
 assert.equal(home.mainEntity?.['@type'],'Person');
 assert.equal(home.mainEntity.name,p.name.find(value=>value['@language']==='fa')['@value']);
 assert.equal(home.mainEntity?.['@id'],physicianId);
 assert.equal(p.mainEntityOfPage?.['@id'],home['@id']);
 const headEnd=html.indexOf('</head>');
 const sectionStart=html.indexOf('class="entity-home-evidence"');
 assert.ok(headEnd>0 && sectionStart>headEnd,'the entire RDF comes before human authority content');
 const sectionEnd=html.indexOf('</section>',sectionStart)+'</section>'.length;
 const sectionEndByte=Buffer.byteLength(html.slice(0,sectionEnd),'utf8');
 assert.ok(sectionEnd>sectionStart,'complete visible physician evidence section is missing');
 assert.ok(sectionEndByte<1_998_000,
   'Googlebot must receive the full physician evidence section after the priority canonical RDF: '+sectionEndByte);
 console.log(JSON.stringify({entityEvidenceEndByte:sectionEndByte,googlebotReserveBytes:2_000_000-sectionEndByte}));

});
