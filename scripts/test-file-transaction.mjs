import os from 'node:os';
import path from 'node:path';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {commitTextFiles} from './lib/file-transaction.mjs';

const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const dir=await mkdtemp(path.join(os.tmpdir(),'doctor-ghezelbaash-txn-'));
const a=path.join(dir,'a.txt'),b=path.join(dir,'b.txt');

try{
  await writeFile(a,'old-a\n');
  await writeFile(b,'old-b\n');
  let injected=false;
  try{
    await commitTextFiles([{file:a,content:'new-a\n'},{file:b,content:'new-b\n'}],{
      transactionId:'rollback-proof',
      beforeCommit:({index})=>{if(index===1)throw new Error('intentional transaction fault')},
    });
  }catch(error){
    injected=error.message==='intentional transaction fault';
  }
  assert(injected,'Rollback test did not observe injected failure');
  assert(await readFile(a,'utf8')==='old-a\n','Rollback failed to restore first committed file');
  assert(await readFile(b,'utf8')==='old-b\n','Rollback changed uncommitted second file');
  assert(!(await readdir(dir)).some(name=>name.includes('.txn-')),'Rollback left transaction residue');

  const success=await commitTextFiles([{file:a,content:'new-a\n'},{file:b,content:'new-b\n'}],{transactionId:'commit-proof'});
  assert(success.committed.length===2,'Successful transaction committed wrong file count');
  assert(await readFile(a,'utf8')==='new-a\n'&&await readFile(b,'utf8')==='new-b\n','Successful transaction content mismatch');
  assert(!(await readdir(dir)).some(name=>name.includes('.txn-')),'Successful transaction left residue');

  let duplicateRejected=false;
  try{await commitTextFiles([{file:a,content:'x'},{file:a,content:'y'}],{transactionId:'duplicate-proof'});}catch(error){duplicateRejected=/Duplicate transaction target/.test(error.message)}
  assert(duplicateRejected,'Duplicate transaction target was not rejected');

  console.log(JSON.stringify({stage:'FILE_TRANSACTION',rollback:'PASS',commit:'PASS',residue:'NONE',duplicateTargetRejection:'PASS',integrity:'PASS'},null,2));
}finally{
  await rm(dir,{recursive:true,force:true});
}
