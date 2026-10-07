import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'src/pages/index.astro');
const source=await fs.readFile(file,'utf8');
if(/\.\.\.record,\s*pagePurpose\s*:\s*reviewed\.pagePurpose,\s*schemaClassification:Object\.freeze\(\{/.test(source)){
  console.log('pagePurpose propagation already present; no patch needed');
  process.exit(0);
}
const needle=/return Object\.freeze\(\{\s*\.\.\.record,\s*schemaClassification:Object\.freeze\(\{/g;
const matches=[...source.matchAll(needle)];
if(matches.length!==1)throw new Error(`Expected exactly one applyRouteSchemaPolicy record/schemaClassification return shape, found ${matches.length}`);
const output=source.replace(needle,(match)=>match.replace('schemaClassification:Object.freeze({','pagePurpose:reviewed.pagePurpose,\n    schemaClassification:Object.freeze({'));
if(output===source)throw new Error('Patch produced no source change');
await fs.writeFile(file,output);
console.log('Patched applyRouteSchemaPolicy: record.pagePurpose now preserves reviewed route purpose');
