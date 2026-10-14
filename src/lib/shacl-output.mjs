import {graphFactRows, serializeGraphAsNTriples} from './machine-output.mjs';

const SH='http://www.w3.org/ns/shacl#';
const RDF='http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const shapeLinks=new Set([
  'property','node','not','and','or','xone','in','qualifiedValueShape',
  'sparql','prefixes','declare','path','alternativePath','inversePath',
  'zeroOrMorePath','oneOrMorePath','zeroOrOnePath','ignoredProperties',
  'rule','condition','expression','filterShape','nodes','js','jsLibrary',
].map(term=>SH+term));

/** Publish the graph's complete SHACL closure together with supplemental contracts. */
export function buildShaclTurtle(source) {
  if(!Array.isArray(source?.graph?.['@graph']))throw new TypeError('Canonical graph required');
  if(typeof source?.validation?.shaclSupplement!=='string')throw new TypeError('SHACL supplement required');
  const rows=graphFactRows(source.graph);
  const bySubject=new Map();
  for(const row of rows) {
    if(!bySubject.has(row.subject))bySubject.set(row.subject,[]);
    bySubject.get(row.subject).push(row);
  }
  const selected=new Set(rows.filter(row=>
    row.predicate===RDF+'type'&&row.object_kind==='iri'&&row.object===SH+'NodeShape',
  ).map(row=>row.subject));
  const queue=[...selected];
  const isConstraintOrList=subject=>bySubject.get(subject)?.some(row=>
    row.predicate.startsWith(SH)||row.predicate===RDF+'first'||row.predicate===RDF+'rest',
  );
  for(let index=0;index<queue.length;index++) {
    for(const row of bySubject.get(queue[index])??[]) {
      if(row.object_kind==='literal'||!bySubject.has(row.object)||selected.has(row.object))continue;
      // Named targets and allowed values remain references to the data graph.
      // Constraint links and list cells retain their definitions, including
      // anonymous property shapes, path expressions and logical alternatives.
      const follow=row.object_kind==='blank'||shapeLinks.has(row.predicate)||
        ((row.predicate===RDF+'first'||row.predicate===RDF+'rest')&&isConstraintOrList(row.object));
      if(follow) { selected.add(row.object);queue.push(row.object); }
    }
  }
  // Reuse the canonical serializer's escaping and datatype lexical conversion.
  // Its sorted triples correspond one-to-one with graphFactRows, retaining the
  // original blank-node identities rather than regenerating a filtered graph.
  const lines=serializeGraphAsNTriples(source.graph).trimEnd().split('\n');
  const compiled=rows.flatMap((row,index)=>selected.has(row.subject)?[lines[index]]:[]).join('\n');
  return [source.validation.shaclSupplement.trimEnd(),
    '# Canonical graph-authored SHACL shapes and their constraint closure.',compiled,
  ].filter(Boolean).join('\n\n')+'\n';
}
