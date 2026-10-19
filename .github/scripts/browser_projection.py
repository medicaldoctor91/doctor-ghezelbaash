"""Semantic subset, identity closure and uncompressed HTML budget checks."""
import json

def validate_home_projection(graph_path, blocks, html):
    graph=json.loads(graph_path.read_text());truth={n['@id']:n for n in graph['@graph']}
    origin='https://www.ghezelbaash.ir'
    assert len(html)<1_990_000, ('Homepage exceeds conservative 2MB budget',len(html))
    assert len(blocks)==1
    document=blocks[0];assert document['@context']==graph['@context']
    ids={n['@id'] for n in document['@graph']}
    required={origin+'/webpage',origin+'/website',origin+'/#saeed-ghezelbash',origin+'/dr-saeed-ghezelbash-aesthetic-clinic-kermanshah'}
    assert required<=ids
    def subset(actual,source):
        if isinstance(actual,dict):
            assert isinstance(source,dict)
            for key,value in actual.items():
                assert key in source, ('Non-authored browser predicate',key)
                subset(value,source[key])
            if set(actual)=={'@id'} and actual['@id'].startswith(origin+'/'):
                assert actual['@id'] in ids, ('Unresolved browser reference',actual['@id'])
        elif isinstance(actual,list):
            assert isinstance(source,list)
            for value in actual:
                assert any(matches(value,candidate) for candidate in source), ('Non-authored browser value',value)
        else:assert actual==source, ('Browser literal drift',actual,source)
    def matches(actual,source):
        try:subset(actual,source);return True
        except AssertionError:return False
    for node in document['@graph']:
        assert node['@id'] in truth
        subset(node,truth[node['@id']])
    page=next(n for n in document['@graph'] if n['@id']==origin+'/webpage')
    assert page['mainEntity']=={'@id':origin+'/#saeed-ghezelbash'}
    return {'status':'PASS','nodes':len(ids),'htmlBytes':len(html),'authoredSubset':True}
