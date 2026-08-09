import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {deflateRawSync} from 'node:zlib';

const crcTable=Array.from({length:256},(_,n)=>{
  let value=n;
  for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;
  return value>>>0;
});
const crc32=buffer=>{
  let crc=0xffffffff;
  for(const byte of buffer)crc=crcTable[(crc^byte)&0xff]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
};
const u16=value=>{const buffer=Buffer.alloc(2);buffer.writeUInt16LE(value);return buffer};
const u32=value=>{const buffer=Buffer.alloc(4);buffer.writeUInt32LE(value>>>0);return buffer};

export async function walkFiles(directory,{prefix='',filter=()=>true}={}){
  const files=[];
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const relative=prefix?`${prefix}/${entry.name}`:entry.name,absolute=path.join(directory,entry.name);
    if(!filter(relative,entry))continue;
    if(entry.isDirectory())files.push(...await walkFiles(absolute,{prefix:relative,filter}));
    else if(entry.isFile())files.push({name:relative.replaceAll('\\','/'),data:await readFile(absolute)});
  }
  return files;
}

export function createDeterministicZip(entries){
  if(entries.length>0xffff)throw new Error(`ZIP entry ceiling exceeded: ${entries.length}`);
  const names=new Set(),locals=[],centrals=[];
  let offset=0;
  for(const entry of [...entries].sort((a,b)=>a.name.localeCompare(b.name))){
    if(names.has(entry.name))throw new Error(`Duplicate ZIP entry: ${entry.name}`);
    names.add(entry.name);
    const name=Buffer.from(entry.name),raw=Buffer.from(entry.data),compressed=deflateRawSync(raw,{level:9}),crc=crc32(raw);
    const local=Buffer.concat([u32(0x04034b50),u16(20),u16(0x0800),u16(8),u16(0),u16(0),u32(crc),u32(compressed.length),u32(raw.length),u16(name.length),u16(0),name,compressed]);
    locals.push(local);
    centrals.push(Buffer.concat([u32(0x02014b50),u16(0x0314),u16(20),u16(0x0800),u16(8),u16(0),u16(0),u32(crc),u32(compressed.length),u32(raw.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]));
    offset+=local.length;
  }
  const centralDirectory=Buffer.concat(centrals),end=Buffer.concat([u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centralDirectory.length),u32(offset),u16(0)]);
  return Buffer.concat([...locals,centralDirectory,end]);
}
