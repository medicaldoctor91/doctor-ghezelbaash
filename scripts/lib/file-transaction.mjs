import path from 'node:path';
import {access,rename,rm,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const exists=async file=>{try{await access(file);return true;}catch(error){if(error?.code==='ENOENT')return false;throw error;}};

export async function commitTextFiles(entries,{transactionId=randomUUID(),beforeCommit}={}){
  if(!Array.isArray(entries)||entries.length===0)throw new Error('File transaction requires at least one entry');
  if(beforeCommit!=null&&typeof beforeCommit!=='function')throw new Error('beforeCommit must be a function when provided');
  const normalized=entries.map(entry=>({file:path.resolve(entry.file),content:String(entry.content)}));
  const seen=new Set();
  for(const entry of normalized){
    if(seen.has(entry.file))throw new Error(`Duplicate transaction target: ${entry.file}`);
    seen.add(entry.file);
    if(!(await exists(entry.file)))throw new Error(`Transaction target does not exist: ${entry.file}`);
  }

  const records=normalized.map(entry=>({
    ...entry,
    staged:`${entry.file}.txn-${transactionId}.new`,
    backup:`${entry.file}.txn-${transactionId}.bak`,
    originalMoved:false,
    committed:false,
  }));

  try{
    for(const record of records){
      if(await exists(record.staged)||await exists(record.backup))throw new Error(`Transaction residue collision: ${record.file}`);
      await writeFile(record.staged,record.content,'utf8');
    }

    for(const [index,record] of records.entries()){
      if(beforeCommit)await beforeCommit({index,file:record.file,transactionId});
      await rename(record.file,record.backup);
      record.originalMoved=true;
      try{
        await rename(record.staged,record.file);
        record.committed=true;
      }catch(error){
        await rename(record.backup,record.file);
        record.originalMoved=false;
        throw error;
      }
    }
  }catch(error){
    for(const record of [...records].reverse()){
      let restored=!record.originalMoved;
      try{
        if(record.committed)await rm(record.file,{force:true});
        if(record.originalMoved&&await exists(record.backup)){
          await rename(record.backup,record.file);
          record.originalMoved=false;
          record.committed=false;
          restored=true;
        }
      }catch(rollbackError){
        error.rollbackErrors??=[];
        error.rollbackErrors.push({file:record.file,backup:record.backup,message:rollbackError.message});
      }
      await rm(record.staged,{force:true}).catch(()=>{});
      if(restored)await rm(record.backup,{force:true}).catch(()=>{});
    }
    throw error;
  }finally{
    for(const record of records)await rm(record.staged,{force:true}).catch(()=>{});
  }

  // Commit is complete before backup cleanup begins. Cleanup failure must never trigger rollback or delete committed files.
  const cleanupResidue=[];
  for(const record of records){
    try{
      await rm(record.backup,{force:true});
      record.originalMoved=false;
    }catch(error){
      cleanupResidue.push({file:record.file,backup:record.backup,message:error.message});
    }
  }
  return {committed:records.map(record=>record.file),transactionId,cleanupResidue};
}
