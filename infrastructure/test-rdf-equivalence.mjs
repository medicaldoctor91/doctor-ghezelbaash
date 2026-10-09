import {SOURCE as canonicalSource} from '../src/canonical/source.mjs';
import assert from 'node:assert/strict';

import {Parser} from 'n3';
import {serializeGraphAsNTriples,buildVoidTurtle,buildDcatTurtle} from '../src/lib/machine-output.mjs';
import {semanticFingerprint,rdfFingerprint} from './lib/rdf.mjs';
const source=canonicalSource;
assert.equal(await rdfFingerprint(serializeGraphAsNTriples(source.graph)),await semanticFingerprint(source.graph),'Turtle must represent the canonical RDF dataset exactly');
for(const [name,turtle] of [['shapes.ttl',source.validation.shaclSupplement],['void.ttl',buildVoidTurtle(source,0)],['dcat.ttl',buildDcatTurtle(source)]])assert(new Parser({format:'text/turtle'}).parse(turtle).length,'Standards-compliant Turtle '+name);
console.log('Canonical Turtle semantic equivalence PASS');
