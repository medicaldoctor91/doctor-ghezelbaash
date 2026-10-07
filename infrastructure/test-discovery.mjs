import {SOURCE} from '../src/canonical/source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../src/pages/index.astro',import.meta.url),'utf8');

const nodes = new Map(SOURCE.graph['@graph'].map((node)=>[node['@id'],node]));
const paths = new Map(SOURCE.routes.resources.map((route)=>[route.path,route]));
const policy = SOURCE.discovery?.sitemapPolicy;
assert(policy, 'discovery sitemapPolicy missing');
assert.equal(policy.videoWatchPages?.length, 4, 'exactly four video watch-page mappings required');
const videoIds = new Set();
for (const entry of policy.videoWatchPages) {
  assert(paths.has(entry.path), `watch route missing: ${entry.path}`);
  assert.equal(paths.get(entry.path).pagePurpose, 'authored-media', `watch route is not authored-media: ${entry.path}`);
  const node = nodes.get(entry.videoId); assert(node, `video missing: ${entry.videoId}`);
  assert([node['@type']].flat().includes('VideoObject'), `not a VideoObject: ${entry.videoId}`);
  const watchUrl = SOURCE.canonicalOrigin + entry.path;
  assert.equal(node.url, watchUrl, `VideoObject.url must equal dedicated watch page: ${entry.videoId}`);
  assert.equal(node.mainEntityOfPage?.['@id'], watchUrl + '#webpage', `VideoObject.mainEntityOfPage must equal dedicated watch page: ${entry.videoId}`);
  assert(!videoIds.has(entry.videoId), `duplicate video mapping: ${entry.videoId}`); videoIds.add(entry.videoId);
}
assert.equal(videoIds.size, SOURCE.graph['@graph'].filter((node)=>[node['@type']].flat().includes('VideoObject')).length, 'every VideoObject must map exactly once');
assert.equal(policy.imageCanonicalPages?.length, 5, 'five canonical image subjects required');
const imageIds = new Set(), imageUrls = new Set();
for (const entry of policy.imageCanonicalPages) {
  assert(paths.has(entry.path), `image target page missing: ${entry.path}`);
  const node=nodes.get(entry.imageId); assert(node, `image missing: ${entry.imageId}`);
  assert([node['@type']].flat().includes('ImageObject'), `not ImageObject: ${entry.imageId}`);
  assert(!/(thumbnail|delivery|derived|social|logo)/i.test(entry.imageId), `derivative image identity in sitemap policy: ${entry.imageId}`);
  assert(typeof node.contentUrl==='string' && node.contentUrl.startsWith(SOURCE.canonicalOrigin+'/media/'), `invalid canonical image URL: ${entry.imageId}`);
  assert(!imageIds.has(entry.imageId), `duplicate image id: ${entry.imageId}`); imageIds.add(entry.imageId);
  assert(!imageUrls.has(node.contentUrl), `duplicate image URL: ${node.contentUrl}`); imageUrls.add(node.contentUrl);
}
assert(source.includes('SOURCE.discovery.sitemapPolicy.videoWatchPages'), 'sitemap compiler must consume videoWatchPages policy');
assert(source.includes('SOURCE.discovery.sitemapPolicy.imageCanonicalPages'), 'sitemap compiler must consume imageCanonicalPages policy');
console.log(JSON.stringify({discoveryPolicy:'PASS',videos:videoIds.size,images:imageIds.size},null,2));
