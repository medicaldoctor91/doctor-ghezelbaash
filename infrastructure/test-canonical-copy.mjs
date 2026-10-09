import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {AUTHORED_BODY} from '../src/canonical/source.mjs';

const source = await fs.readFile(new URL('../src/canonical/source.mjs', import.meta.url), 'utf8');

const expected = 'من، <a href="https://www.wikidata.org/entity/Q140287622" rel="me external noopener">دکتر سعید قزلباش</a> هستم؛';
const retired = 'من، <a href="https://www.wikidata.org/entity/Q140287622" rel="me external noopener">دکتر محمدسعید (سعید) قزلباش</a> هستم؛';

assert.ok(source.includes(expected), 'Canonical visible physician introduction must use «دکتر سعید قزلباش»');
assert.ok(!source.includes(retired), 'Retired visible physician introduction must not remain in canonical source');
assert.ok(source.includes('محمدسعید قزلباش'), 'Canonical identity aliases/evidence must remain available outside the visible introduction');

assert.ok(AUTHORED_BODY.includes('اگر دومی است، باید دید عضله اجازه می‌دهد یا نه.'), 'The clinical distinction between structural eye change and mild brow change remains readable');
assert.ok(AUTHORED_BODY.includes('زمینهٔ نارضایتی را می‌سازد و می‌تواند ریسک را بالا ببرد.'), 'The original warning retains its complete sentence');

console.log(JSON.stringify({ canonicalVisibleIdentityCopy: 'PASS' }, null, 2));
