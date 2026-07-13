import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(process.cwd(), 'dist');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const files = [];
const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); statSync(path).isDirectory() ? walk(path) : files.push(path); } };
walk(root);

const homepagePath = join(root, 'index.html');
const homepage = readFileSync(homepagePath, 'utf8');
const htmlFiles = files.filter((path) => path.endsWith('.html'));
check(htmlFiles.length === 2, `single-page build must contain only index.html and 404.html; found ${htmlFiles.map((path) => relative(root, path)).join(', ')}`);
check(statSync(homepagePath).size < 1_800_000, `homepage exceeds 1.8MB: ${statSync(homepagePath).size}`);
check(homepage.includes('</html>') && homepage.includes('id="knowledge-resources"'), 'homepage is incomplete');
check(homepage.includes('rel="describedby"') && homepage.includes('href="/knowledge-graph.jsonld"'), 'homepage does not discover canonical graph with rel=describedby');

for (const removed of [
  'knowledge/index.html', 'videos/index.html', 'graph.json', 'graph-summary.json',
  'knowledge-manifest.json', 'identity-crosswalk.json', 'research.jsonld', 'graph',
]) {
  check(!existsSync(join(root, removed)), `removed artifact still exists: /${removed}`);
}

for (const path of files) {
  check(statSync(path).size > 0, `zero-byte file: ${relative(root, path)}`);
  if (path.endsWith('.json') || path.endsWith('.jsonld')) {
    try { JSON.parse(readFileSync(path, 'utf8')); }
    catch (error) { failures.push(`${relative(root, path)}: invalid JSON (${error.message})`); }
  }
  if (path.endsWith('.jsonl')) {
    readFileSync(path, 'utf8').trim().split(/\r?\n/).forEach((line, index) => {
      try { JSON.parse(line); }
      catch (error) { failures.push(`${relative(root, path)}:${index + 1}: invalid JSONL (${error.message})`); }
    });
  }
}

const jsonLdMatches = [...homepage.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
check(jsonLdMatches.length === 1, `homepage must contain one inline JSON-LD block; found ${jsonLdMatches.length}`);

const ids = new Set([...homepage.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
for (const href of [...homepage.matchAll(/href="#([^"]+)"/g)].map((match) => match[1])) {
  check(ids.has(href), `homepage contains broken fragment link #${href}`);
}

for (const asset of [
  'knowledge-graph.jsonld', 'context.json', 'ai/summary.json', 'ai/faq.json',
  'search/index.json', 'answers/index.json', 'intents/index.json',
  'evidence/sources.json', 'evidence/internal-provenance.json', 'media/index.json',
  'sitemap.xml', 'video-sitemap.xml', 'image-sitemap.xml', 'llms.txt', 'llms-full.txt',
]) check(existsSync(join(root, asset)), `required artifact missing: /${asset}`);

const forbiddenPublicPaths = [
  'https://www.ghezelbaash.ir/knowledge/',
  '/knowledge-manifest.json', '/graph-summary.json', '/graph/core.jsonld', '/identity-crosswalk.json', '/research.jsonld',
];
for (const path of files.filter((item) => !item.endsWith('.mp4') && !item.endsWith('.png') && !item.endsWith('.jpg') && !item.endsWith('.webp') && !item.endsWith('.avif') && !item.endsWith('.ico'))) {
  const value = readFileSync(path, 'utf8');
  for (const forbidden of forbiddenPublicPaths) check(!value.includes(forbidden), `${relative(root, path)} contains removed public path ${forbidden}`);
}

if (failures.length) {
  console.error(JSON.stringify({ status: 'fail', failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'pass', htmlFiles: htmlFiles.length, homepageBytes: statSync(homepagePath).size, files: files.length, brokenFragments: 0, removedArtifacts: 8 }, null, 2));
