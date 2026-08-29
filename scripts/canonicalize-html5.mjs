import path from 'node:path';
import {readdir,readFile,writeFile} from 'node:fs/promises';

const root=path.resolve(process.cwd(),process.argv[2]||'dist');
const voidTag=/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b([^<>]*?)\s*\/>/gi;

async function walk(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  const files=[];
  for(const entry of entries){
    const absolute=path.join(dir,entry.name);
    if(entry.isDirectory())files.push(...await walk(absolute));
    else if(entry.isFile()&&entry.name.endsWith('.html'))files.push(absolute);
  }
  return files.sort();
}

let filesChanged=0,replacements=0;
for(const file of await walk(root)){
  const before=await readFile(file,'utf8');
  let local=0;
  const after=before.replace(voidTag,(_match,tag,attrs)=>{local+=1;return `<${tag}${attrs}>`;});
  if(local){
    await writeFile(file,after);
    filesChanged+=1;
    replacements+=local;
  }
  if(voidTag.test(after))throw new Error(`HTML5 void-element canonicalization incomplete: ${path.relative(root,file)}`);
  voidTag.lastIndex=0;
}

console.log(JSON.stringify({stage:'HTML5_VOID_CANONICALIZATION',filesChanged,replacements,status:'PASS'}));
