import jsonld from 'jsonld';
import rdfCanonize from 'rdf-canonize';

export const RDF_MEASUREMENT_CONTRACT=Object.freeze({
  jsonLdProcessor:'jsonld',
  jsonLdProcessorVersion:'9.0.0',
  canonicalizationAlgorithm:'RDFC-1.0',
  canonicalizationLibrary:'rdf-canonize',
  canonicalizationLibraryVersion:'5.0.0',
  canonicalSyntax:'canonical-n-quads-default-graph-as-ntriples-compatible-turtle',
});

export async function canonicalizeRdfDocument(document){
  const raw=await jsonld.toRDF(document,{format:'application/n-quads',safe:true});
  const canonical=await rdfCanonize.canonize(raw,{
    algorithm:RDF_MEASUREMENT_CONTRACT.canonicalizationAlgorithm,
    inputFormat:'application/n-quads',
    format:'application/n-quads',
    maxWorkFactor:3,
    rejectURDNA2015:true,
  });
  const text=canonical.endsWith('\n')?canonical:canonical+'\n';
  const triples=text.split(/\r?\n/).filter(Boolean).length;
  if(!Number.isSafeInteger(triples)||triples<=0)throw new Error(`Invalid canonical RDF triple measurement: ${triples}`);
  return {text,triples};
}
