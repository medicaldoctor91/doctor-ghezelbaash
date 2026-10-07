import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=path.join(root,'src/pages/index.astro');
const source=await fs.readFile(file,'utf8');
const functionStart=source.indexOf('function applyRouteSchemaPolicy');
const recordsStart=source.indexOf('const records=',functionStart);
if(functionStart<0||recordsStart<0)throw new Error('applyRouteSchemaPolicy compiler boundary missing');
const before=source.slice(0,functionStart);
const fn=source.slice(functionStart,recordsStart);
const after=source.slice(recordsStart);
if(/\bpagePurpose\s*:\s*reviewed\.pagePurpose\b/.test(fn)){
  console.log('pagePurpose propagation already present; no patch needed');
  process.exit(0);
}
const needle=/return Object\.freeze\(\{\s*\.\.\.record,\s*schemaClassification:Object\.freeze\(\{/;
const matches=[...fn.matchAll(new RegExp(needle.source,'g'))];
if(matches.length!==1)throw new Error(`Expected exactly one record/schemaClassification return shape, found ${matches.length}`);
const patchedFn=fn.replace(needle,(match)=>match.replace('schemaClassification:Object.freeze({','pagePurpose:reviewed.pagePurpose,\n    schemaClassification:Object.freeze({'));
const output=before+patchedFn+after;
if(output===source)throw new Error('Patch produced no source change');
await fs.writeFile(file,output);
console.log('Patched applyRouteSchemaPolicy: record.pagePurpose now preserves reviewed route purpose');
