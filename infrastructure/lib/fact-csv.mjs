import assert from 'node:assert/strict';
import {DataFactory,Writer} from 'n3';

export function parseFactCsv(csv){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(quoted){if(c==='"'){if(csv[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;}
  else if(c==='"'){assert.equal(cell,'','CSV quote starts a field');quoted=true;}
  else if(c===','){row.push(cell);cell='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 assert(!quoted,'CSV quoted field closes');if(cell||row.length){row.push(cell);rows.push(row);}
 assert.deepEqual(rows.shift(),['row_id','subject','predicate','object','object_kind','datatype','language'],'Canonical CSV columns');
 assert(rows.every(row=>row.length===7),'Canonical CSV field count');
 return rows;
}

// Reconstruct independently of the materializer, using RDFJS literal semantics.
export async function factCsvNQuads(csv){
 const {namedNode,blankNode,literal,quad}=DataFactory;
 const resource=value=>value.startsWith('_:')?blankNode(value.slice(2)):namedNode(value);
 const writer=new Writer({format:'N-Quads'});
 for(const [,subject,predicate,object,kind,datatype,language] of parseFactCsv(csv)){
  assert(['iri','blank','literal'].includes(kind),'Known CSV RDF object kind');
  assert(!(datatype&&language),'RDF literal has datatype or language, never both');
  const term=kind==='literal'?literal(object,language||(datatype?namedNode(datatype):undefined)):resource(object);
  writer.addQuad(quad(resource(subject),namedNode(predicate),term));
 }
 return new Promise((resolve,reject)=>writer.end((err,result)=>err?reject(err):resolve(result)));
}
