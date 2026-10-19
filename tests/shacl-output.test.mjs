import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {SOURCE} from '../src/canonical/source.mjs';
import {buildShaclTurtle} from '../src/lib/shacl-output.mjs';

const checkRdf=(script,input)=>{
  const result=spawnSync(process.env.PYTHON??'python',['-c',script],{
    input:JSON.stringify(input),encoding:'utf8',maxBuffer:16*1024*1024,timeout:60000,
  });
  assert.equal(result.status,0,result.stderr||result.stdout);
  return result.stdout.trim();
};

test('standalone SHACL publishes every canonical graph shape and enforces its credential contract',()=>{
  const before=JSON.stringify(SOURCE);
  const output=buildShaclTurtle(SOURCE);
  assert.equal(checkRdf(`
import json,sys,rdflib
from rdflib.namespace import RDF,SH
from pyshacl import validate
value=json.load(sys.stdin)
data=rdflib.Graph().parse(data=json.dumps(value['graph']),format='json-ld')
shapes=rdflib.Graph().parse(data=value['shapes'],format='turtle')
authored=set(data.subjects(RDF.type,SH.NodeShape))
published=set(shapes.subjects(RDF.type,SH.NodeShape))
assert len(authored)==38,len(authored)
assert authored<=published,sorted(str(x) for x in authored-published)
assert len(published)==67,len(published)
ok,_,report=validate(data,shacl_graph=shapes,advanced=True,meta_shacl=True)
assert ok,report
person=rdflib.URIRef('https://www.ghezelbaash.ir/#saeed-ghezelbash')
credential=rdflib.URIRef('https://schema.org/hasCredential')
data.remove((person,credential,None))
ok,results,_=validate(data,shacl_graph=shapes,advanced=True)
assert not ok,'The exported canonical credential contract did not run'
assert any(results.objects(None,SH.resultPath)),len(results)
print('67 shapes; canonical graph conforms; missing credential rejected')
`,{graph:SOURCE.graph,shapes:output}),'67 shapes; canonical graph conforms; missing credential rejected');
  assert.equal(JSON.stringify(SOURCE),before);
  assert.equal(buildShaclTurtle(SOURCE),output);
});

test('shape export retains nested property and RDF list closure without copying data entities',()=>{
  const context={
    '@vocab':'https://schema.org/',schema:'https://schema.org/',
    sh:'http://www.w3.org/ns/shacl#',rdf:'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    xsd:'http://www.w3.org/2001/XMLSchema#',
  };
  const source={graph:{'@context':context,'@graph':[
    {'@id':'https://example.test/PersonShape','@type':'sh:NodeShape',
      'sh:targetClass':{'@id':'https://schema.org/Person'},
      'sh:property':{'sh:path':{'@id':'https://schema.org/name'},'sh:minCount':1,'sh:or':{'@id':'_:options'}}},
    {'@id':'_:options','rdf:first':{'@id':'_:stringOption'},'rdf:rest':{'@id':'_:lastOption'}},
    {'@id':'_:lastOption','rdf:first':{'@id':'_:integerOption'},'rdf:rest':{'@id':'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil'}},
    {'@id':'_:stringOption','sh:datatype':{'@id':'http://www.w3.org/2001/XMLSchema#string'}},
    {'@id':'_:integerOption','sh:datatype':{'@id':'http://www.w3.org/2001/XMLSchema#integer'}},
    {'@id':'https://example.test/person','@type':'Person',name:'Ada'},
  ]},validation:{shaclSupplement:'@prefix sh: <http://www.w3.org/ns/shacl#> .\n'}};
  assert.equal(checkRdf(`
import json,sys,rdflib
from rdflib.namespace import RDF,SH
from pyshacl import validate
value=json.load(sys.stdin)
shapes=rdflib.Graph().parse(data=value['shapes'],format='turtle')
assert not list(shapes.predicate_objects(rdflib.URIRef('https://example.test/person')))
assert len(list(shapes.triples((None,RDF.first,None))))==2
person=rdflib.URIRef('https://example.test/person')
name=rdflib.URIRef('https://schema.org/name')
data=rdflib.Graph().parse(data=json.dumps(value['graph']),format='json-ld')
ok,_,report=validate(data,shacl_graph=shapes,meta_shacl=True)
assert ok,report
data.set((person,name,rdflib.Literal(True)))
ok,_,_=validate(data,shacl_graph=shapes)
assert not ok,'Nested list datatype alternatives were not exported'
data.remove((person,name,None))
ok,_,_=validate(data,shacl_graph=shapes)
assert not ok,'Nested property minCount was not exported'
print('property and RDF list closure enforced')
`,{graph:source.graph,shapes:buildShaclTurtle(source)}),'property and RDF list closure enforced');
});
