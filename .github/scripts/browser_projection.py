"""Validate preserved canonical data and the bounded homepage search projection.

Published historical archives can explicitly opt into their former complete
JSON-LD format. New candidates must preserve the graph as inert JSON at the end
of the body and publish the deterministic, acyclic search document in the head.
"""
import json
import subprocess
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CRAWL_PREFIX_BYTES = 2_000_000
HEADER_RESERVE_BYTES = 8_192
MAX_SEARCH_BYTES = 128 * 1024
MAX_SEARCH_NODES = 512
MAX_EXPANDED_COPIES = 5_000
MAX_REFERENCE_DEPTH = 12


def _values(value):
    return value if isinstance(value, list) else [] if value is None else [value]


class _InlineDocuments(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=False)
        self.html = html
        self.line_offsets = [0]
        for line in html.splitlines(keepends=True):
            self.line_offsets.append(self.line_offsets[-1] + len(line))
        self.search = []
        self.canonical = []
        self.capture = None
        self.in_head = False
        self.in_body = False
        self.hidden_depth = 0
        self.visible_after_canonical = False
        self.canonical_seen = False

    def _byte_offset(self):
        line, col = self.getpos()
        return len(self.html[:self.line_offsets[line - 1] + col].encode())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'head':
            self.in_head = True
        if tag == 'body':
            self.in_body = True
        if tag in {'script', 'style', 'template'}:
            self.hidden_depth += 1
        if tag != 'script':
            if self.canonical_seen and self.in_body and not self.hidden_depth and tag in {'img', 'video', 'iframe', 'input', 'button'}:
                self.visible_after_canonical = True
            return
        kind = ('search' if attrs.get('type') == 'application/ld+json' else
                'canonical' if attrs.get('type') == 'application/json' and attrs.get('id') == 'canonical-entity-graph' else None)
        if kind:
            self.capture = {'kind': kind, 'id': attrs.get('id'), 'text': '',
                            'start': self._byte_offset(), 'inHead': self.in_head,
                            'inBody': self.in_body}

    def handle_data(self, text):
        if self.capture is not None:
            self.capture['text'] += text
        elif self.canonical_seen and self.in_body and not self.hidden_depth and text.strip():
            self.visible_after_canonical = True

    def handle_entityref(self, name):
        self.handle_data('&' + name + ';')

    def handle_charref(self, name):
        self.handle_data('&#' + name + ';')

    def handle_endtag(self, tag):
        if tag == 'script' and self.capture is not None:
            item = self.capture
            item['end'] = self._byte_offset() + len('</script>')
            item['document'] = json.loads(item['text'])
            getattr(self, item['kind']).append(item)
            self.canonical_seen |= item['kind'] == 'canonical'
            self.capture = None
        if tag in {'script', 'style', 'template'}:
            self.hidden_depth = max(0, self.hidden_depth - 1)
        if tag == 'head':
            self.in_head = False
        if tag == 'body':
            self.in_body = False


def expected_home_search_projection(graph):
    """Run the same public projector against downloaded canonical data only."""
    script = """
import fs from 'node:fs';
import {projectHomeSearchGraph} from './src/lib/search-contract.mjs';
import {SOURCE} from './src/canonical/source.mjs';
const graph=JSON.parse(fs.readFileSync(0,'utf8'));
const homepage=graph['@graph'].find(n=>[n['@type']].flat().includes('ProfilePage')&&[n['@type']].flat().includes('MedicalWebPage'));
if(!homepage||typeof homepage.url!=='string')throw new Error('Canonical homepage identity missing');
process.stdout.write(JSON.stringify(projectHomeSearchGraph(graph,new URL(homepage.url).origin,{profileModifiedAt:SOURCE.profileMarkupModifiedAt})));
"""
    result = subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT,
                            input=json.dumps(graph, ensure_ascii=False), text=True,
                            capture_output=True, check=True, timeout=30)
    return json.loads(result.stdout)


def _structural_bounds(document, origin):
    graph = document.get('@graph')
    assert isinstance(graph, list) and graph, 'Search projection requires a nonempty @graph'
    assert len(graph) <= MAX_SEARCH_NODES, 'Search projection contains too many entities'
    nodes = {}
    for node in graph:
        assert isinstance(node, dict) and node.get('@id') and node.get('@type'), 'Search entity identity/type missing'
        assert node['@id'] not in nodes, 'Duplicate search entity identifiers'
        nodes[node['@id']] = node
    edges = {key: [] for key in nodes}

    def references(value):
        if isinstance(value, list):
            return [ref for item in value for ref in references(item)]
        if not isinstance(value, dict):
            return []
        refs = [value['@id']] if '@id' in value else []
        for key, child in value.items():
            if key not in {'@id', '@context'}:
                refs.extend(references(child))
        return refs

    for key, node in nodes.items():
        for prop, value in node.items():
            if prop in {'@id', '@context'}:
                continue
            for target in references(value):
                if target in nodes:
                    edges[key].append(target)
                else:
                    assert not target.startswith(origin + '/'), ('Unresolved local search identity', target)
    active, memo = set(), {}

    def cost(key):
        assert key not in active, ('Cyclic search reference', key)
        if key in memo:
            return memo[key]
        active.add(key)
        children = [cost(target) for target in edges[key]]
        active.remove(key)
        depth = 1 + max((item[1] for item in children), default=0)
        copies = 1 + sum(item[0] for item in children)
        assert depth <= MAX_REFERENCE_DEPTH, 'Search reference depth exceeds bound'
        assert copies <= MAX_EXPANDED_COPIES, 'Search reference expansion exceeds bound'
        memo[key] = copies, depth
        return memo[key]

    for key in nodes:
        cost(key)
    total = sum(item[0] for item in memo.values())
    assert total <= MAX_EXPANDED_COPIES, 'Combined search reference expansion exceeds bound'
    return nodes, {'nodes': len(nodes), 'structuralEdges': sum(map(len, edges.values())),
                   'expandedCopies': total, 'referenceDepth': max(item[1] for item in memo.values())}


def _localized(value):
    if isinstance(value, list) and any(isinstance(item, dict) and '@value' in item for item in value):
        preferred = next((item for item in value if isinstance(item, dict) and item.get('@language') in {'fa', 'fa-IR'}), value[0])
        return preferred.get('@value', preferred) if isinstance(preferred, dict) else preferred
    if isinstance(value, dict) and '@value' in value:
        return value['@value']
    return value


def _preserved_identity_claims(graph, nodes, origin):
    canonical = {node['@id']: node for node in graph['@graph']}
    home_id, person_id = origin + '/webpage', origin + '/#saeed-ghezelbash'
    clinic_id = origin + '/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'
    home, person, clinic = (nodes.get(key) for key in [home_id, person_id, clinic_id])
    assert home and {'ProfilePage', 'MedicalWebPage'} <= set(_values(home.get('@type'))), 'Homepage profile/medical architecture missing'
    assert home.get('mainEntity', {}).get('@id') == person_id, 'Homepage mainEntity must identify the physician'
    assert person and 'Person' in _values(person.get('@type')) and person.get('name'), 'Homepage physician is not typed and named'
    assert clinic and 'LocalBusiness' in _values(clinic.get('@type')), 'Canonical clinic identity missing'
    for entity in [person_id, clinic_id]:
        original, actual = canonical[entity], nodes[entity]
        for key in ['name', 'description', 'disambiguatingDescription', 'jobTitle', 'telephone', 'email', 'sameAs']:
            if key in original:
                assert _localized(actual.get(key)) == _localized(original[key]), ('Identity claim changed or omitted', entity, key)
        address_id = original.get('address', {}).get('@id')
        if address_id:
            assert actual.get('address', {}).get('@id') == address_id and address_id in nodes, ('Address identity missing', entity)
            for key in ['streetAddress', 'addressLocality', 'addressRegion', 'addressCountry', 'postalCode']:
                if key in canonical[address_id]:
                    assert _localized(nodes[address_id].get(key)) == _localized(canonical[address_id][key]), ('Address claim changed', key)
    original_person = canonical[person_id]
    if original_person.get('hasCredential'):
        assert {item['@id'] for item in _values(person.get('hasCredential'))} == {item['@id'] for item in _values(original_person['hasCredential'])}, 'Physician credential identities changed'
    for entity in [person_id, clinic_id]:
        actual_image_urls = set(item if isinstance(item, str) else canonical.get(item.get('@id'), item).get('contentUrl')
                                for item in _values(nodes[entity].get('image')))
        for ref in _values(canonical[entity].get('image')):
            if isinstance(ref, str):
                assert ref in actual_image_urls, ('Published image URL missing', entity, ref)
                continue
            image_id = ref['@id']
            original = canonical[image_id]
            assert original.get('contentUrl') in actual_image_urls, ('Published image missing', entity, image_id)
            assert image_id in nodes and 'ImageObject' in _values(nodes[image_id].get('@type')), ('Licensed image identity missing', image_id)
            for key in ['contentUrl', 'encodingFormat', 'creator', 'copyrightNotice', 'creditText', 'license', 'acquireLicensePage']:
                if key in original:
                    assert _localized(nodes[image_id].get(key)) == _localized(original[key]), ('Licensed image claim changed', image_id, key)


def validate_home_projection(graph_path, blocks, html, *, allow_legacy_full_graph=False):
    graph = json.loads(Path(graph_path).read_text())
    ids = {node['@id'] for node in graph['@graph']}
    assert len(ids) == len(graph['@graph']), 'Duplicate canonical entity identifiers'
    parser = _InlineDocuments(html.decode() if isinstance(html, bytes) else html)
    parser.feed(parser.html)
    assert len(blocks) == 1 and len(parser.search) == 1, 'Homepage must contain one recognized search JSON-LD document'
    assert [item['document'] for item in parser.search] == blocks, 'Parsed homepage search JSON-LD differs from supplied blocks'
    if allow_legacy_full_graph and not parser.canonical:
        assert blocks[0] == graph, 'Historical homepage inline graph differs from the complete canonical graph'
        return {'status': 'PASS', 'nodes': len(ids), 'htmlBytes': len(parser.html.encode()),
                'completeCanonicalGraph': True, 'canonicalGraphStorage': 'legacy application/ld+json',
                'historicalFormatExplicitlyAllowed': True}
    assert len(parser.canonical) == 1, 'Homepage must preserve one inert canonical-entity-graph'
    canonical = parser.canonical[0]
    assert canonical['document'] == graph, 'Preserved homepage canonical graph differs from graph.jsonld'
    assert canonical['inBody'] and not canonical['inHead'], 'Preserved canonical graph must be in the body'
    assert not parser.visible_after_canonical, 'Preserved canonical graph must follow visible page content'
    search = parser.search[0]
    assert search['id'] == 'schema-core-mainentity' and search['inHead'], 'Recognized search JSON-LD must be in the head'
    assert max(search['end'], canonical['start']) + HEADER_RESERVE_BYTES < CRAWL_PREFIX_BYTES, 'Search schema and visible content must precede the 2 MB crawl boundary including the header reserve'
    assert len(search['text'].encode()) <= MAX_SEARCH_BYTES, 'Recognized search JSON-LD exceeds size bound'
    home = next((node for node in graph['@graph'] if {'ProfilePage', 'MedicalWebPage'} <= set(_values(node.get('@type')))), None)
    assert home and isinstance(home.get('url'), str), 'Canonical homepage identity missing'
    from urllib.parse import urlsplit
    parsed = urlsplit(home['url'])
    origin = parsed.scheme + '://' + parsed.netloc
    nodes, bounds = _structural_bounds(blocks[0], origin)
    _preserved_identity_claims(graph, nodes, origin)
    assert blocks[0] == expected_home_search_projection(graph), 'Homepage search document differs from the canonical search projection'
    return {'status': 'PASS', **bounds, 'htmlBytes': len(parser.html.encode()), 'completeCanonicalGraph': True,
            'canonicalGraphStorage': 'application/json#canonical-entity-graph', 'canonicalNodes': len(ids),
            'recognizedSearchBytes': len(search['text'].encode()), 'recognizedSearchEndByte': search['end'],
            'visibleContentPrefixEndByte': canonical['start'], 'headerReserveBytes': HEADER_RESERVE_BYTES,
            'criticalPrefixIncludingHeaderReserveBytes': max(search['end'], canonical['start']) + HEADER_RESERVE_BYTES,
            'crawlPrefixBytes': CRAWL_PREFIX_BYTES}


def validate_home_html(graph_path, html):
    """Validate a restored candidate directly, without trusting saved reports."""
    parser = _InlineDocuments(html.decode() if isinstance(html, bytes) else html)
    parser.feed(parser.html)
    return validate_home_projection(graph_path, [item['document'] for item in parser.search], html)
