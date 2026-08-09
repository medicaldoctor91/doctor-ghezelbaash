#!/usr/bin/env python3
from pathlib import Path
import json
from rdflib import Graph, Namespace, URIRef, Literal
from rdflib.namespace import RDF
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'src/data/semantic/knowledge-graph.jsonld'
SHAPES=ROOT/'src/data/semantic/shapes.ttl'
SH=Namespace('http://www.w3.org/ns/shacl#')
sg=Graph(); sg.parse(SHAPES,format='turtle')
dg=Graph(); dg.parse(DATA,format='json-ld')
fail=[]; checked=0; focus_nodes_checked=0
for shape in sg.subjects(RDF.type,SH.NodeShape):
    targets=set(sg.objects(shape,SH.targetNode))
    for target_class in sg.objects(shape,SH.targetClass):
        targets.update(dg.subjects(RDF.type,target_class))
    for predicate in sg.objects(shape,SH.targetObjectsOf):
        targets.update(dg.objects(None,predicate))
    for predicate in sg.objects(shape,SH.targetSubjectsOf):
        targets.update(dg.subjects(predicate,None))
    if not targets:
        fail.append(f'{shape}: no focus nodes resolved from SHACL targets')
        continue
    focus_nodes_checked+=len(targets)
    for target in targets:
        for prop in sg.objects(shape,SH.property):
            path=list(sg.objects(prop,SH.path))
            if len(path)!=1:
                fail.append(f'{shape}: property shape path cardinality {len(path)}')
                continue
            pred=path[0]; vals=list(dg.objects(target,pred)); checked+=1
            mins=list(sg.objects(prop,SH.minCount)); maxs=list(sg.objects(prop,SH.maxCount)); has=list(sg.objects(prop,SH.hasValue))
            if mins and len(vals)<int(mins[0]): fail.append(f'{shape}: {target} {pred} count {len(vals)} < {int(mins[0])}')
            if maxs and len(vals)>int(maxs[0]): fail.append(f'{shape}: {target} {pred} count {len(vals)} > {int(maxs[0])}')
            for expected in has:
                if expected not in vals: fail.append(f'{shape}: {target} {pred} missing hasValue {expected}')
if fail:
    raise SystemExit('SHACL constitution failed:\n- '+'\n- '.join(fail))
print(json.dumps({'valid':True,'nodeShapes':len(set(sg.subjects(RDF.type,SH.NodeShape))),'focusNodesChecked':focus_nodes_checked,'propertyConstraintsChecked':checked,'dataTriples':len(dg),'shapeTriples':len(sg)},indent=2))
