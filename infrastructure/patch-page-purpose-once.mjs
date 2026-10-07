import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'src/pages/index.astro');
const source=await fs.readFile(file,'utf8');
const already=/return \{\.\.\.record,pageType:resource\.pageType,pagePurpose:resource\.pagePurpose,schemaClassification:/g;
if(already.test(source)){
  console.log('pagePurpose propagation already present; no patch needed');
  process.exit(0);
}
const needle=/return \{\.\.\.record,pageType:resource\.pageType,schemaClassification:/g;
const matches=[...source.matchAll(needle)];
if(matches.length!==1)throw new Error(`Expected exactly one reviewed route record return shape, found ${matches.length}`);
const output=source.replace(needle,'return {...record,pageType:resource.pageType,pagePurpose:resource.pagePurpose,schemaClassification:');
if(output===source)throw new Error('Patch produced no source change');
await fs.writeFile(file,output);
console.log('Patched applyRouteSchemaPolicy: record.pagePurpose now preserves reviewed route purpose');
