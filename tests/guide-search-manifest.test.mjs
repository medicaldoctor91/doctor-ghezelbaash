import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {parse,parseFragment,serialize} from 'parse5';
import {buildGuideSearchManifest,guideSearchCopy} from '../src/lib/guide-search-manifest.mjs';
import {SOURCE} from '../src/canonical/source.mjs';

const attr=(node,key)=>node.attrs?.find(value=>value.name===key)?.value;
const descendants=node=>[node,...(node.childNodes??[]).flatMap(descendants)];
const signature='a'.repeat(64);

test('search preserves the authored outline and aliases, with media/empty-route labels and external-document anchors',()=>{
  const root=parseFragment('<main id="main-content"><article lang="en"><h1 id="person">Doctor</h1><h2 id="treatment" data-canonical-href="/treatment" data-retrieval-alias="dermal filler">Treatment</h2><h3 id="risk">Risk</h3><figure><video id="video"></video><figcaption>Actual authored video label</figcaption></figure><span id="historic"></span></article></main>');
  const article=descendants(root).find(node=>node.tagName==='article'),before=serialize(root);
  const resources=[{path:'/',htmlId:'main-content'},{path:'/treatment',htmlId:'treatment'},{path:'/video',htmlId:'video'},{path:'/historic',htmlId:'historic',title:'Historical overview'}];
  const anchors={'main-content':'/','person':'/','treatment':'/treatment','risk':'/treatment#risk','video':'/video','historic':'/historic'};
  const manifest=buildGuideSearchManifest({article,root,sourceSignature:signature,resources,htmlIdTargets:anchors});
  assert.equal(serialize(root),before);
  assert.deepEqual(manifest.anchors,anchors);
  assert.deepEqual(manifest.records.find(record=>record.id==='risk'),{id:'risk',href:'/treatment#risk',text:'Risk',level:3,parents:['Doctor','Treatment'],lang:'en',retrievalAlias:'',summary:'Doctor Treatment Risk Actual authored video label'});
  assert.equal(manifest.records.find(record=>record.id==='treatment').retrievalAlias,'dermal filler');
  assert.equal(manifest.records.find(record=>record.id==='video').text,'Actual authored video label');
  assert.equal(manifest.records.find(record=>record.id==='historic').text,'Historical overview');
  assert.throws(()=>buildGuideSearchManifest({article,root,sourceSignature:signature,resources,htmlIdTargets:{...anchors,missing:'/treatment#missing'}}),/anchor ownership/);
});

test('each localized search interface retains the canonical ranking vocabulary',()=>{
  for(const language of ['fa-IR','en','ar-IQ','ckb-IQ']) {
    const copy=guideSearchCopy(language,SOURCE.search.copy);
    assert.deepEqual(copy.synonyms,SOURCE.search.copy.synonyms);
    assert.deepEqual(copy.stopWords,SOURCE.search.copy.stopWords);
    assert.ok(copy.placeholder&&copy.minimumQuery&&copy.resultCount.includes('{count}'));
    if(language!=='fa-IR')assert.notEqual(copy.placeholder,SOURCE.search.copy.placeholder);
  }
});

test('built manifest covers every canonical owner and source anchor without a signature self-reference',()=>{
  const home=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
  const elements=descendants(parse(home)),article=elements.find(node=>node.tagName==='article'&&attr(node,'class')?.split(' ').includes('medical-guide'));
  const pointer=elements.find(node=>node.tagName==='meta'&&attr(node,'name')==='guide-search-resource');
  const path=attr(pointer,'content');
  assert.match(path,/^\/assets\/guide-search\.[a-f0-9]{12}\.json$/);
  const body=readFileSync(new URL('../dist'+path,import.meta.url),'utf8'),manifest=JSON.parse(body);
  assert.equal(createHash('sha256').update(body).digest('hex').slice(0,12),path.split('.')[1]);
  assert.equal(manifest.sourceSignature,createHash('sha256').update(serialize(article)).digest('hex'));
  assert.equal(attr(elements.find(node=>node.tagName==='meta'&&attr(node,'name')==='guide-source-signature'),'content'),manifest.sourceSignature);
  assert.equal(descendants(article).includes(pointer),false);
  assert.deepEqual(manifest.anchors,SOURCE.routes.htmlIdTargets);
  for(const record of manifest.records)assert.equal(record.href,manifest.anchors[record.id],record.id);
  assert.equal(elements.some(node=>/^h[1-6]$/.test(node.tagName??'')&&attr(node,'data-canonical-href')),false,'emitted headings do not duplicate the build ownership map');
  const canonicalStart=home.indexOf('<script id="canonical-entity-graph"');
  assert.ok(canonicalStart>0);
  assert.ok(Buffer.byteLength(home.slice(0,canonicalStart),'utf8')+8192<2_000_000,'all visible content and Search precede the inert graph within the crawl prefix');
  for(const resource of SOURCE.routes.resources)assert.ok(manifest.records.some(record=>new URL(record.href,SOURCE.canonicalOrigin).pathname===resource.path),resource.path);
  assert.ok(manifest.records.every(record=>record.summary.length<=220),'all summaries are bounded');
  const guidePath=attr(elements.find(node=>node.tagName==='meta'&&attr(node,'name')==='guide-reader-resource'),'content');
  const guide=readFileSync(new URL('../dist'+guidePath,import.meta.url));
  const lazyHome=descendants(parse(JSON.parse(guide).html));
  assert.equal(attr(lazyHome.find(node=>node.tagName==='meta'&&attr(node,'name')==='guide-search-resource'),'content'),path);
  const lazySearch=lazyHome.find(node=>attr(node,'id')==='guide-search');
  assert.ok(lazySearch,'lazy Home retains its native Search UI for language transitions');
  assert.equal(attr(lazySearch,'lang'),'fa-IR');
  assert.deepEqual(JSON.parse(attr(lazySearch,'data-copy')),guideSearchCopy('fa-IR',SOURCE.search.copy));
  assert.ok(gzipSync(body).length<gzipSync(guide).length/3,'transport index is under one third of the full source');
  const headers=readFileSync(new URL('../dist/_headers',import.meta.url),'utf8');
  assert.match(headers,/\/assets\/\*[\s\S]*?Cache-Control: public, max-age=31536000, immutable/);
  assert.match(headers,/\/assets\/guide\*\n  X-Robots-Tag: noindex/);
});
