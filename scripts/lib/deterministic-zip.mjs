import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {deflateRawSync} from 'node:zlib';

export const deterministicZipContract=Object.freeze({
  versionMadeBy:0x0314,
  versionNeeded:20,
  flags:0x0800,
  method:8,
  dosTime:0,
  dosDate:0x0021,
  unixFileMode:0o100644,
  externalAttributes:(0o100644<<16)>>>0
});

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
const normalizeEntryName=value=>{
  const name=String(value||'').replaceAll('\\','/');
  const segments=name.split('/');
  if(!name||name.startsWith('/')||name.includes('\0')||segments.some(segment=>!segment||segment==='.'||segment==='..'))throw new Error(`Invalid ZIP entry name: ${name||'<empty>'}`);
  const bytes=Buffer.byteLength(name);
  if(bytes>0xffff)throw new Error(`ZIP entry name too long: ${name}`);
  return name;
};

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
  if(!Array.isArray(entries))throw new Error('ZIP entries must be an array');
  if(entries.length>0xffff)throw new Error(`ZIP entry ceiling exceeded: ${entries.length}`);
  const normalized=entries.map(entry=>({name:normalizeEntryName(entry?.name),data:Buffer.from(entry?.data??'')})).sort((a,b)=>a.name.localeCompare(b.name));
  const names=new Set(),locals=[],centrals=[];
  let offset=0;
  for(const entry of normalized){
    if(names.has(entry.name))throw new Error(`Duplicate ZIP entry: ${entry.name}`);
    names.add(entry.name);
    const name=Buffer.from(entry.name),raw=entry.data,compressed=deflateRawSync(raw,{level:9}),crc=crc32(raw);
    if(raw.length>0xffffffff||compressed.length>0xffffffff||offset>0xffffffff)throw new Error(`ZIP32 size ceiling exceeded: ${entry.name}`);
    const c=deterministicZipContract;
    const local=Buffer.concat([u32(0x04034b50),u16(c.versionNeeded),u16(c.flags),u16(c.method),u16(c.dosTime),u16(c.dosDate),u32(crc),u32(compressed.length),u32(raw.length),u16(name.length),u16(0),name,compressed]);
    locals.push(local);
    centrals.push(Buffer.concat([u32(0x02014b50),u16(c.versionMadeBy),u16(c.versionNeeded),u16(c.flags),u16(c.method),u16(c.dosTime),u16(c.dosDate),u32(crc),u32(compressed.length),u32(raw.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(c.externalAttributes),u32(offset),name]));
    offset+=local.length;
  }
  const centralDirectory=Buffer.concat(centrals);
  if(centralDirectory.length>0xffffffff||offset>0xffffffff)throw new Error('ZIP32 central-directory ceiling exceeded');
  const end=Buffer.concat([u32(0x06054b50),u16(0),u16(0),u16(normalized.length),u16(normalized.length),u32(centralDirectory.length),u32(offset),u16(0)]);
  return Buffer.concat([...locals,centralDirectory,end]);
}
