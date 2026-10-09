import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
const dist=path.resolve(process.argv[2]??'dist');
const html=await fs.readFile(path.join(dist,'index.html'),'utf8');
for(const url of [...html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)].map(m=>m[1])){
 assert(await fs.access(path.join(dist,url.slice(1))).then(()=>true,()=>false),'Generated reader asset exists: '+url);
}
console.log('Generated CSS and reader JS delivered PASS');
