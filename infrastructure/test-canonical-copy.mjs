import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/pages/index.astro', import.meta.url), 'utf8');

const expected = 'من، <a href="https://www.wikidata.org/entity/Q140287622" rel="me external noopener">دکتر سعید قزلباش</a> هستم؛';
const retired = 'من، <a href="https://www.wikidata.org/entity/Q140287622" rel="me external noopener">دکتر محمدسعید (سعید) قزلباش</a> هستم؛';

assert.ok(source.includes(expected), 'Canonical visible physician introduction must use «دکتر سعید قزلباش»');
assert.ok(!source.includes(retired), 'Retired visible physician introduction must not remain in canonical source');
assert.ok(source.includes('محمدسعید قزلباش'), 'Canonical identity aliases/evidence must remain available outside the visible introduction');

console.log(JSON.stringify({ canonicalVisibleIdentityCopy: 'PASS' }, null, 2));
