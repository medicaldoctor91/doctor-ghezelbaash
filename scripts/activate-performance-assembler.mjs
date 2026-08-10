import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
const root=process.cwd();
const target=path.join(root,'scripts/lib/assemble-content.mjs');
const wrapper="export * from './assemble-content-performance.mjs';\n";
const current=await readFile(target,'utf8').catch(()=>null);
if(current!==wrapper) await writeFile(target,wrapper);
console.log(JSON.stringify({performanceAssemblerActivated:true,target:path.relative(root,target)}));
