import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {SOURCE} from '../src/canonical/source.mjs';

const cases = [
  ['portrait', 'physician-portrait', 'M196320105'],
  ['clinical-office', 'in-clinical-office', 'M196320110'],
  ['clinical-team', 'with-clinical-team', 'M196320111'],
];

test('each master image identifies its Commons copy and stable MediaInfo entity', () => {
  for (const [slug, file, mid] of cases) {
    const node = SOURCE.graph['@graph'].find(n => n['@id'] === `https://www.ghezelbaash.ir/image-saeed-ghezelbash-${slug}-master`);
    const commons = `https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-${file}.jpg`;
    assert.equal(node.contentUrl, `https://www.ghezelbaash.ir/media/images/physician/master/saeed-ghezelbaash-${file}.jpg`);
    assert.deepEqual(node.sameAs, [commons, `https://commons.wikimedia.org/entity/${mid}`]);
    assert.equal(node.license, 'https://creativecommons.org/licenses/by/4.0/');
  }
});

test('embedded master-image relations resolve to the same public image and Commons identities', () => {
  execFileSync('python3', ['-c', String.raw`
from pathlib import Path
import xml.etree.ElementTree as E
cases=[('portrait','physician-portrait','M196320105'),('clinical-office','in-clinical-office','M196320110'),('clinical-team','with-clinical-team','M196320111')]
ns={'dc':'http://purl.org/dc/elements/1.1/','rdf':'http://www.w3.org/1999/02/22-rdf-syntax-ns#'}
for slug,file,mid in cases:
    b=Path('public/media/images/physician/master/saeed-ghezelbaash-'+file+'.jpg').read_bytes()
    assert b'Q140288589' not in b
    assert b'Q140287622' in b
    i=b.index(b'http://ns.adobe.com/xap/1.0/\0')
    length=int.from_bytes(b[i-2:i],'big')
    root=E.fromstring(b[i+29:i-2+length])
    relations={li.get('{'+ns['rdf']+'}resource') or li.text for li in root.findall('.//dc:relation/rdf:Bag/rdf:li',ns)}
    expected={
      'https://www.ghezelbaash.ir/image-saeed-ghezelbash-'+slug+'-master',
      'https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-'+file+'.jpg',
      'https://commons.wikimedia.org/entity/'+mid,
    }
    assert expected <= relations, (file, expected-relations)
`], {cwd: new URL('..', import.meta.url), stdio: 'pipe'});
});
