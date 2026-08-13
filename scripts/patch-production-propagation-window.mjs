import {readFile,writeFile} from 'node:fs/promises';
const p='scripts/verify-production.mjs';
let s=await readFile(p,'utf8');
const old1='for(let attempt=1;attempt<=16;attempt++){';
const new1='const productionPropagationAttempts=46;\nfor(let attempt=1;attempt<=productionPropagationAttempts;attempt++){';
const old2='if(attempt===16)fail(`Production root did not converge to finalized CSP/digest after ${attempt} attempts`);';
const new2='if(attempt===productionPropagationAttempts)fail(`Production root did not converge to finalized CSP/digest after ${attempt} attempts`);';
for(const [a,b] of [[old1,new1],[old2,new2]]){const n=s.split(a).length-1;if(n!==1)throw new Error(`Expected exactly one occurrence of ${a}; found ${n}`);s=s.replace(a,b);}
await writeFile(p,s);
console.log(JSON.stringify({patched:true,attempts:46,intervalMs:4000,exactEqualityUnchanged:true}));
