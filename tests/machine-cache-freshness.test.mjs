import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const headers=readFileSync(new URL('../dist/_headers',import.meta.url),'utf8');
const groups=new Map(headers.trim().split(/\n\s*\n/).map(block=>{
  const [name,...lines]=block.split('\n');
  return [name,lines.join('\n')];
}));

test('stable public machine representations cannot retain prior graph after the next release',()=>{
  const paths=['/graph.jsonld','/graph.ttl','/entity-facts.csv','/shapes.ttl',
    '/provenance.jsonld','/dcat.ttl','/void.ttl','/croissant.json',
    '/answers.txt','/llms.txt','/sitemap.xml','/knowledge.xml'];
  for(const path of paths){
    const block=groups.get(path);
    assert.ok(block,'Missing cache policy for '+path);
    assert.match(block,/^  Cache-Control: public, max-age=0, must-revalidate$/m,
      path+' must not have a browser TTL');
    assert.match(block,/^  Cloudflare-CDN-Cache-Control: no-store$/m,
      path+' must explicitly bypass stale Cloudflare CDN cache');
  }
});

test('all content-hashed JS/CSS URLs remain immutable for performance',()=>{
  const block=groups.get('/assets/*');
  assert.ok(block,'Missing hashed asset cache rule');
  assert.match(block,/^  Cache-Control: public, max-age=31536000, immutable$/m);
  assert.doesNotMatch(block,/Cloudflare-CDN-Cache-Control:\s*no-store/);
});

test('the intentional full homepage HEAD script cache remains revalidated',()=>{
  const home=groups.get('/')??groups.get('/index.html');
  assert.ok(home,'Missing homepage rules');
  assert.match(home,/Cache-Control: public, max-age=0, must-revalidate/);
});

test('graph identity rewrite URLs must not offer hour-long stale copies',()=>{
  const patterns=[...groups.entries()].filter(([path])=>path.startsWith('/procedure-')||path.startsWith('/service-'));
  assert.ok(patterns.length>0,'Missing subject rewrite header policy');
  for(const [path,body] of patterns){
    assert.match(body,/Cloudflare-CDN-Cache-Control: no-store/,path);
    assert.match(body,/Cache-Control: public, max-age=0, must-revalidate/,path);
  }
});
