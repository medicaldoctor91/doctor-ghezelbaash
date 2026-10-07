import jsonld from 'jsonld';
import canonize from 'rdf-canonize';
import {createHash} from 'node:crypto';
import {Parser,Writer} from 'n3';
import fs from 'node:fs/promises';
import {factCsvNQuads} from './fact-csv.mjs';

const schemaContext=JSON.parse(await fs.readFile(new URL('../fixtures/schema-context.jsonld',import.meta.url),'utf8'));
const documentLoader=async url=>{
  if(!['https://schema.org','https://schema.org/','http://schema.org','http://schema.org/'].includes(url))throw new Error('Unpinned JSON-LD context: '+url);
  return {contextUrl:null,documentUrl:url,document:schemaContext};
};
export async function canonicalNQuads(document) {
  const dataset=await jsonld.toRDF(document,{documentLoader});
  return canonize.canonize(dataset,{algorithm:'RDFC-1.0',format:'application/n-quads'});
}
const hash=value=>createHash('sha256').update(value).digest('hex');
export async function semanticFingerprint(document){return hash(await canonicalNQuads(document));}
export async function csvFingerprint(csv){
 return hash(await canonize.canonize(await factCsvNQuads(csv),{inputFormat:'application/n-quads',algorithm:'RDFC-1.0',format:'application/n-quads'}));
}
export async function rdfFingerprint(turtle){
  // N-Triples is valid Turtle. Parse the declared representation as Turtle, then
  // canonicalize the RDF dataset, including blank-node identity and datatypes.
  const quads=new Parser({format:'text/turtle'}).parse(turtle);
  const nquads=await new Promise((resolve,reject)=>{const writer=new Writer({format:'N-Quads'});writer.addQuads(quads);writer.end((err,result)=>err?reject(err):resolve(result));});
  return hash(await canonize.canonize(nquads,{inputFormat:'application/n-quads',algorithm:'RDFC-1.0',format:'application/n-quads'}));
}
