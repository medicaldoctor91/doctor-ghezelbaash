import fs from 'node:fs';
import rdfCanonize from 'rdf-canonize';
const input=fs.readFileSync(0,'utf8');
const output=await rdfCanonize.canonize(input,{algorithm:'RDFC-1.0',inputFormat:'application/n-quads',format:'application/n-quads',maxWorkFactor:3,rejectURDNA2015:true});
process.stdout.write(output);
