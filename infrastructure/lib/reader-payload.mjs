import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {brotliCompressSync} from 'node:zlib';
import {parse,serialize} from 'parse5';

const attr=(node,name)=>node?.attrs?.find(item=>item.name===name)?.value;
const elements=root=>{const out=[];const visit=node=>{out.push(node);for(const child of node.childNodes??[])visit(child);};visit(root);return out;};
const article=doc=>elements(doc).find(node=>node.tagName==='article'&&attr(node,'class')?.split(/\s+/).includes('medical-guide'));
const marker=(doc,name)=>attr(elements(doc).find(node=>node.tagName==='meta'&&attr(node,'name')===name),'content');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

// Compare the actual delivered payload with Home, including whitespace and
// child-node boundaries used by native DOM Range. Text-only equality is weaker.
export async function verifyReaderPayload({distDir,htmlByRoute}){
  const home=htmlByRoute.get('/'),homeDoc=parse(home);
  const resourcePath=marker(homeDoc,'guide-reader-resource');
  assert.match(resourcePath??'',/^\/assets\/guide\.[a-f0-9]{12}\.json$/,'Content-addressed reader asset');
  const bytes=await fs.readFile(path.join(distDir,resourcePath.slice(1)));
  assert.equal(resourcePath.split('.')[1],hash(bytes).slice(0,12),'Reader URL names the delivered bytes');
  const resource=JSON.parse(bytes);
  assert.equal(resource.schemaVersion,1);
  assert.equal(resource.sourceSignature,marker(homeDoc,'guide-source-signature'));
  const readerDoc=parse(resource.html),readerArticle=article(readerDoc);
  assert.equal(serialize(readerArticle),serialize(article(homeDoc)),'Complete reader DOM equals authored Home exactly');
  assert.equal(hash(serialize(readerArticle)),resource.sourceSignature,'Scope boundaries bind the exact delivered article');
  assert.equal(marker(readerDoc,'guide-source-signature'),resource.sourceSignature);
  assert.equal(elements(readerDoc).filter(node=>node.tagName==='script').length,0,'Reader payload carries no executable code or duplicate graph');
  for(const [route,html] of htmlByRoute){
    assert.equal(marker(parse(html),'guide-reader-resource'),resourcePath,'Every entry shares one reader payload: '+route);
  }
  assert.match(resource.metadataPath,/^\/assets\/guide-meta\.[a-f0-9]{12}\.json$/);
  const metadataBytes=await fs.readFile(path.join(distDir,resource.metadataPath.slice(1)));
  assert.equal(resource.metadataPath.split('.')[1],hash(metadataBytes).slice(0,12),'Metadata URL names the delivered bytes');
  const metadata=JSON.parse(metadataBytes);
  assert.equal(metadata.schemaVersion,1);
  assert.equal(metadata.sourceSignature,resource.sourceSignature);
  assert.deepEqual(metadata.scripts,elements(homeDoc).filter(node=>node.tagName==='script'&&attr(node,'type')==='application/ld+json')
    .map(node=>({id:attr(node,'id'),text:node.childNodes.map(child=>child.value??'').join('')})),'Lazy Home metadata preserves its complete source graph');
  const compressed=brotliCompressSync(bytes).length,oldCompressed=brotliCompressSync(Buffer.from(home)).length;
  assert(bytes.length<Buffer.byteLength(home)*.65,'Focused entries avoid redundant full-Home transfer');
  assert(compressed<oldCompressed*.85,'Compressed reader delivery materially reduces network transfer');
  return {resourcePath,bytes:bytes.length,homeBytes:Buffer.byteLength(home),brotliBytes:compressed,homeBrotliBytes:oldCompressed};
}
