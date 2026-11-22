/**
 * Maximal *already entailed* physician subjectOf closure from canonical
 * WebPage/VideoObject about and mainEntity facts, without fabricating
 * evidence or weakening Person/clinic ownership semantics.
 *
 * The total HTML HEAD has a strict 2,000,000-byte prefix. JSON-LD 1.1
 * context terms are compacted via already defined schema:/kg: prefixes.
 * This is a lossless IRI spelling change, NOT a removal of assertions.
 */
const ORIGIN='https://www.ghezelbaash.ir';
const PID=ORIGIN+'/#saeed-ghezelbash';
const arr=x=>x==null?[]:Array.isArray(x)?x:[x];
const id=x=>typeof x==='string'?x:x?.['@id'];
const ids=x=>arr(x).map(id).filter(Boolean);
const types=n=>arr(n?.['@type']);
const type=(n,t)=>types(n).includes(t);
const ref=x=>({'@id':x});
const validWork=n=>['WebPage','MedicalWebPage','ProfilePage','VideoObject'].some(t=>type(n,t));

export function closePhysicianWebAndVideoSubjectOf(source,physician) {
  const graph=source?.graph?.['@graph'];
  const ctx=source?.graph?.['@context'];
  if(!Array.isArray(graph)||physician?.['@id']!==PID ||
     !ctx||ctx.schema!=='https://schema.org/'||
     ctx.kg!==ORIGIN+'/ontology/')
    throw new Error('Canonical Person, graph or JSON-LD prefixes changed');
  if(graph.length!==1916||new Set(graph.map(n=>n['@id'])).size!==1916)
    throw new Error('Cannot add inferred subjectOf to an unreviewed node inventory');

  // about is the explicit inverse of subjectOf, and mainEntity is its
  // subproperty in Schema.org. Only CreativeWork types with actual URL
  // and a documented reference to this Person qualify.
  const works=graph.filter(n=>validWork(n)&&typeof n.url==='string'&&
    /^https?:\/\//.test(n.url)&&
    (ids(n.about).includes(PID)||ids(n.mainEntity).includes(PID)));
  const existing=new Set(ids(physician.subjectOf));
  const add=works.filter(n=>!existing.has(n['@id']));
  if(works.length<13 || add.length>13 || ids(physician.subjectOf).length+add.length!==172)
    throw new Error('Unexpected physician subjectOf scope, refuse unreviewed work associations');
  physician.subjectOf=[...arr(physician.subjectOf),...add.map(n=>ref(n['@id']))];

  // Compact forty-four already-defined term mappings; leave term names,
  // the subjects, every @id, typed literals and semantic @type rules intact.
  // RDF meaning is identical to each full IRI because schema:/kg: are
  // explicitly declared prefixes in this same JSON-LD context.
  let shortened=0;
  const prefixes=[
    {prefix:'schema:',iri:'https://schema.org/'},
    {prefix:'kg:',iri:ORIGIN+'/ontology/'},
  ];
  for(const value of Object.values(ctx)){
    if(!value||typeof value!=='object'||Array.isArray(value) ||
       typeof value['@id']!=='string')continue;
    for(const {prefix,iri} of prefixes) {
      if(value['@id'].startsWith(iri)){
        value['@id']=prefix+value['@id'].slice(iri.length);
        shortened++;
        break;
      }
    }
  }
  const all=Object.values(ctx).filter(v=>v&&typeof v==='object'&&
    !Array.isArray(v)&&typeof v['@id']==='string'&&
    prefixes.some(({prefix})=>v['@id'].startsWith(prefix))).length;
  // At this stage of the normal pipeline all 44 aliases are explicit.
  // After the historical hospital close, 18 schema.org mappings use the
  // equivalent inherited @vocab definition with their @type:'@id' retained.
  const implicitSchemaTerms=Object.entries(ctx).filter(([k,v])=>v&&
    typeof v==='object'&&!Array.isArray(v) && v['@id']===undefined &&
    v['@type']==='@id' && !k.startsWith('@')).length;
  if(!((all===44 && implicitSchemaTerms===0) ||
       (all===26 && implicitSchemaTerms===18)))
    throw new Error('JSON-LD context definitions were not losslessly preserved');
  if(new Set(ids(physician.subjectOf)).size!==172)
    throw new Error('Duplicate or unresolved authored/about media subjectOf');
  const graphIds=new Set(graph.map(n=>n['@id']));
  if(ids(physician.subjectOf).some(x=>!graphIds.has(x)))
    throw new Error('Dangling physician subjectOf reference');
  return {qualifiedWorks:works.length,addedSubjects:add.length,
    physicianSubjectOf:ids(physician.subjectOf).length,
    contextMappings:all,shortenedMappings:shortened};
}
