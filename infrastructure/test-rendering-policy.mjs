import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const source=await fs.readFile(new URL('../src/pages/index.astro',import.meta.url),'utf8');
const start=source.indexOf('export const DESIGN = `');
const end=source.indexOf('\nexport const READER_RUNTIME',start);
assert(start>0&&end>start,'DESIGN boundary');
const design=source.slice(start,end);
const renderRule=/\.render-chunk\s*\{([\s\S]*?)\}/.exec(design)?.[1]??'';
assert.match(renderRule,/content-visibility\s*:\s*visible/,'Focused primary content is non-deferred by default');
assert.doesNotMatch(renderRule,/content-visibility\s*:\s*auto/);
assert.match(renderRule,/contain\s*:\s*none/);
const pkg=JSON.parse(await fs.readFile(new URL('../package.json',import.meta.url),'utf8'));
for(const name of ['benchmark:mobile','test:benchmark']) assert.equal(pkg.scripts[name],undefined,`Candidate benchmark script must be removed: ${name}`);
assert.doesNotMatch(pkg.scripts.finalize??'',/candidates/);

for (const relative of ['benchmark_mobile.py','test_benchmark_mobile.py','requirements-benchmark.txt','test-rendering-candidate.mjs','test-baseline.mjs']) {
  const url=new URL(`./${relative}`,import.meta.url);
  await assert.rejects(fs.access(url),undefined,`Obsolete candidate/baseline file must be removed: ${relative}`);
}
console.log(JSON.stringify({renderingPolicy:'PASS',focusedPrimaryDeferred:false},null,2));
