import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {generatedWorkspace} from './generated-workspace.mjs';
import {canonicalizeRdfDocument,RDF_MEASUREMENT_CONTRACT} from './lib/rdf-measurement.mjs';

const source='src/data/semantic/knowledge-graph.jsonld';
const generated=generatedWorkspace();
const target=path.join(generated.semantic,'knowledge-graph.ttl');
const lockPath=path.join(generated.semantic,'rdf-lock.json');
fs.mkdirSync(generated.semantic,{recursive:true});
const release=JSON.parse(fs.readFileSync('src/data/release.json','utf8'));
const doc=JSON.parse(fs.readFileSync(source,'utf8'));
const measurement=await canonicalizeRdfDocument(doc);
fs.writeFileSync(target,measurement.text);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const distribution='.generated/semantic/knowledge-graph.ttl';
const lock={
  release:release.release,
  source,
  distribution,
  triples:measurement.triples,
  jsonldSha256:sha(fs.readFileSync(source)),
  ttlSha256:sha(fs.readFileSync(target)),
  canonicalizedBlankNodes:true,
  ...RDF_MEASUREMENT_CONTRACT,
  generated:release.dateModified,
};
fs.writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n');
console.log(JSON.stringify(lock,null,2));
