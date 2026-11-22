import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE} from '../src/canonical/source.mjs';
import {closePhysicianWebAndVideoSubjectOf} from '../src/lib/physician-subjectof-context-closure.mjs';

const ORIGIN='https://www.ghezelbaash.ir';
const PERSON=ORIGIN+'/#saeed-ghezelbash';
const many=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const ids=x=>many(x).map(id);
const types=n=>many(n?.['@type']);
const graph=SOURCE.graph['@graph'];
const byId=new Map(graph.map(n=>[n['@id'],n]));
const physician=byId.get(PERSON);

test('Canonical Person.subjectOf closes existing WebPage/VideoObject about and mainEntity inverse without new claims',()=>{
  assert.equal(graph.length,1916);
  const eligible=graph.filter(n=>['WebPage','MedicalWebPage','ProfilePage','VideoObject'].some(t=>types(n).includes(t))&&
    typeof n.url==='string' && (ids(n.about).includes(PERSON)||ids(n.mainEntity).includes(PERSON)));
  const refs=new Set(ids(physician.subjectOf));
  assert.equal(refs.size,172);
  for(const work of eligible)
    assert.ok(refs.has(work['@id']), 'Missing directly entailed Person.subjectOf: '+work['@id']);
  for(const item of refs)assert.ok(byId.has(item),'Cannot create dangling subjectOf link');
  const newTypes=eligible.filter(n=>n['@id'].includes('video-') || types(n).includes('ProfilePage'));
  assert.ok(newTypes.length>=6,'Physician video authorship and biography connections must remain');
});

test('44 IRI-typed properties survive lossless 26 explicit + 18 @vocab schema alias compaction',()=>{
  const ctx=SOURCE.graph['@context'];
  assert.equal(ctx.schema,'https://schema.org/');
  assert.equal(ctx.kg,ORIGIN+'/ontology/');
  const aliases=Object.values(ctx).filter(v=>v&&typeof v==='object'&&!Array.isArray(v)&&
    typeof v['@id']==='string' && /^(schema|kg):/.test(v['@id']));
  assert.equal(aliases.length,26);
  const implicit=Object.entries(ctx).filter(([k,v])=>v && typeof v==='object' && !Array.isArray(v) &&
    v['@id']===undefined && v['@type']==='@id' && !k.startsWith('@'));
  assert.equal(implicit.length,18);
  assert.ok(implicit.every(([key])=>typeof key==='string' && key.length>0));
  for(const v of aliases){
    assert.equal(v['@type'],'@id');
    const [prefix,suffix]=v['@id'].split(':',2);
    assert.ok(suffix);
    assert.ok(prefix==='kg'||prefix==='schema');
  }
  assert.ok(SOURCE.graph['@graph'].some(n=>n['@id']===PERSON));
  assert.deepEqual(ids(physician.contactPoint).length,2);
});

test('SubjectOf and context compaction are fully deterministic and idempotent',()=>{
  const copy=structuredClone(SOURCE);
  const person=copy.graph['@graph'].find(n=>n['@id']===PERSON);
  const before=JSON.stringify(copy);
  const result=closePhysicianWebAndVideoSubjectOf(copy,person);
  assert.deepEqual({added:result.addedSubjects,shortened:result.shortenedMappings,
    subjects:result.physicianSubjectOf,aliases:result.contextMappings},
    {added:0,shortened:0,subjects:172,aliases:26});
  assert.equal(JSON.stringify(copy),before,'Never change graph on repeated materialization');
  const invalid=structuredClone(SOURCE);
  const p=invalid.graph['@graph'].find(n=>n['@id']===PERSON);
  p.subjectOf.push({'@id':ORIGIN+'/not-a-real-entity'});
  assert.throws(()=>closePhysicianWebAndVideoSubjectOf(invalid,p),/Unexpected physician subjectOf scope|Dangling physician subjectOf/);
});
