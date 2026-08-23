import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';

const norm=value=>String(value??'').replace(/\s+/g,' ').trim();
const compute=async htmlPath=>{
  const html=await readFile(htmlPath,'utf8'),doc=parse(html),skip=new Set(['script','style','template','noscript','meta','link','head']),attrsKeep=new Set(['id','href','src','alt','title','aria-label','role']);
  const find=(node,name)=>node?.tagName===name?node:(node?.childNodes||[]).map(child=>find(child,name)).find(Boolean);
  const body=find(doc,'body');
  if(!body)throw new Error('HTML body missing');
  const out=[];
  const walk=node=>{
    if(node.nodeName==='#text'){
      const text=norm(node.value);
      if(text)out.push(`T:${text}`);
      return;
    }
    if(!node.tagName)return (node.childNodes||[]).forEach(walk);
    const tag=node.tagName;
    if(skip.has(tag))return;
    const attrs=Object.fromEntries((node.attrs||[]).map(attribute=>[attribute.name,attribute.value]));
    if(attrs.id==='google-maps-clinic-reputation-current'){
      out.push('E:div#google-maps-clinic-reputation-current:[LIVE_REPUTATION]');
      return;
    }
    const kept=(node.attrs||[]).filter(attribute=>attrsKeep.has(attribute.name)).sort((a,b)=>a.name.localeCompare(b.name)).map(attribute=>`${attribute.name}=${norm(attribute.value)}`).join('|');
    out.push(`O:${tag}${kept?'|'+kept:''}`);
    for(const child of node.childNodes||[])walk(child);
    out.push(`C:${tag}`);
  };
  walk(body);
  const canonical=out.join('\n')+'\n';
  return {canonical,sha256:createHash('sha256').update(canonical).digest('hex'),records:out.length,bytes:Buffer.byteLength(canonical)};
};

const explicitMode=['compute','validate'].includes(process.argv[2]);
const mode=explicitMode?process.argv[2]:'validate';
const htmlPath=explicitMode?(process.argv[3]||'dist/index.html'):(process.argv[2]||'dist/index.html');
if(mode==='compute'){
  const result=await compute(htmlPath);
  if(process.argv.includes('--summary'))delete result.canonical;
  console.log(JSON.stringify(result,null,2));
}else if(mode==='validate'){
  const contract=JSON.parse(await readFile('src/data/visible-contract.json','utf8'));
  if(!/^[0-9a-f]{64}$/.test(contract.visibleDomSha256||''))throw new Error('Visible DOM contract hash is missing');
  const result=await compute(htmlPath);
  if(result.sha256!==contract.visibleDomSha256)throw new Error(`Visible DOM contract violation: current=${result.sha256} expected=${contract.visibleDomSha256}`);
  if(contract.visibleDomRecords&&result.records!==contract.visibleDomRecords)throw new Error(`Visible DOM record-count drift: current=${result.records} expected=${contract.visibleDomRecords}`);
  console.log(JSON.stringify({visibleContract:true,sha256:result.sha256,records:result.records,bytes:result.bytes,mutableSelector:contract.mutableSelector},null,2));
}else{
  throw new Error('Usage: node scripts/validate-visible-freeze.mjs [validate <html>|compute <html> [--summary]]');
}
