"""Require the complete canonical graph in the delivered homepage JSON-LD."""
import json


def validate_home_projection(graph_path, blocks, html):
    graph = json.loads(graph_path.read_text())
    assert len(blocks) == 1, 'Homepage must contain one complete JSON-LD document'
    document = blocks[0]
    assert document == graph, 'Homepage inline graph differs from the complete canonical graph'
    ids = {node['@id'] for node in document['@graph']}
    assert len(ids) == len(document['@graph']), 'Duplicate homepage entity identifiers'
    return {
        'status': 'PASS',
        'nodes': len(ids),
        'htmlBytes': len(html),
        'completeCanonicalGraph': True,
    }
