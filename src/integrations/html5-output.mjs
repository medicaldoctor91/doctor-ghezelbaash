import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readdir,readFile,writeFile} from 'node:fs/promises';

const VOID_ELEMENT=/<(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)\b([^<>]*?)\s*\/>/gi;

async function htmlFiles(directory){
  const files=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const absolute=path.join(directory,entry.name);
    if(entry.isDirectory())files.push(...await htmlFiles(absolute));
    else if(entry.isFile()&&entry.name.endsWith('.html'))files.push(absolute);
  }
  return files;
}

export function html5Output(){
  return {
    name:'html5-output',
    hooks:{
      'astro:build:done':async({dir})=>{
        for(const file of await htmlFiles(fileURLToPath(dir))){
          const source=await readFile(file,'utf8');
          const html=source.replace(VOID_ELEMENT,'<$1$2>');
          if(html!==source)await writeFile(file,html);
        }
      },
    },
  };
}
