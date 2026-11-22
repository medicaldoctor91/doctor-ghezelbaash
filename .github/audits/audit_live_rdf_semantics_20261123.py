import collections, datetime, json, re, requests, statistics, time
from pathlib import Path
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from rdflib import Graph, URIRef, Literal, BNode
from rdflib.namespace import RDF, RDFS
from pyshacl import validate
site="https://www.ghezelbaash.ir"
out=Path("extended-audit");out.mkdir(exist_ok=True)
ua={"User-Agent":"IndependentRdfReadOnlyAudit/20261123","Accept-Encoding":"identity"}
def get(path):
 r=requests.get(site+path,timeout=(15,110),headers=ua);r.raise_for_status();return r.content
js=get("/graph.jsonld")
ttl=get("/graph.ttl")
shapes=get("/shapes.ttl")
home=get("/")
bio=get("/saeed-ghezelbash-research-education-and-clinical-decisions")
doc=json.loads(js)
nodes=doc.get("@graph",[])
def types(n):
 x=n.get("@type",[])
 return x if isinstance(x,list) else [x]
nodeids={x.get("@id") for x in nodes}
defined={}
refs=collections.Counter()
ref_properties=collections.defaultdict(collections.Counter)
def walk(x,prop=None):
 if isinstance(x,dict):
  identity=x.get("@id")
  if isinstance(identity,str) and len(x)>1:
   defined[identity]=dict(keys=list(x.keys()),type=types(x))
  if isinstance(identity,str) and len(x)==1:
   refs[identity]+=1
   ref_properties[identity][prop]+=1
  for k,v in x.items():
   if k not in ("@id","@context"):walk(v,k)
 if isinstance(x,list):
  for item in x:walk(item,prop)
walk(doc)
unresolved={u:n for u,n in refs.items() if u.startswith(site+"/") and u not in defined and u not in nodeids}
cats=collections.Counter()
props=collections.Counter()
for u,n in unresolved.items():
 if "/.well-known/genid/" in u:k="skolem_genid"
 elif u==site+"/":k="homepage_url"
 elif re.search(r'\.(?:webp|jpg|jpeg|png|svg|mp4|pdf|woff2?)$',u,re.I):k="static_media"
 else:k="other_internal"
 cats[k]+=1
 props.update(ref_properties[u])
maintext=BeautifulSoup(home[:2_000_000].decode("utf8","ignore"),"lxml")
main=maintext.select_one("main")
firstmain=main.get_text(" ",strip=True) if main else ""
earlylinks=[(a.get("href"),a.get_text(" ",strip=True)[:70]) for a in main.select("a[href]")] if main else []
firstheads=[x.get_text(" ",strip=True) for x in main.select("h1,h2,h3")] if main else []
allhead=BeautifulSoup(home,"lxml")
allmain=allhead.select_one("main")
alltext=allmain.get_text(" ",strip=True) if allmain else ""
from collections import Counter
pcount=Counter(t for n in nodes for t in types(n))
result={
 "timestamp":datetime.datetime.now(datetime.timezone.utc).isoformat(),
 "nodeCount":len(nodes),"uniqueNodes":len(nodeids),"topTypes":pcount.most_common(25),
 "nestedInlineDefinitions":len(defined),"idOnlyReferences":len(refs),
 "unresolvedInternalReferences":len(unresolved),"unresolvedCategories":cats,
 "unresolvedPropertyCounts":props.most_common(18),
 "unresolvedExamples":list(unresolved.items())[:15],
 "first2MBMainChars":len(firstmain),"allMainChars":len(alltext),
 "first2MBFirstText":firstmain[:2400],
 "first2MBHeadings":firstheads[:30],
 "first2MBLinks":earlylinks[:35],
 "first2MBHasPhysicianName":"قزلباش" in firstmain,
 "first2MBHasIRIMC":"۱۶۷۴۳۰" in firstmain or "167430" in firstmain,
 "first2MBHasKermanshah":"کرمانشاه" in firstmain,
 "first2MBHasBotox":"بوتاکس" in firstmain,
 "first2MBHasFiller":"فیلر" in firstmain
}
print("RDF_SOURCE_GRAPH="+json.dumps(result,ensure_ascii=False,default=list),flush=True)
graphs={}
for fmt,raw in [("turtle",ttl),("json-ld",js)]:
 start=time.monotonic()
 try:
  g=Graph()
  g.parse(data=raw.decode("utf8"),format=fmt,publicID=site+"/")
  graphs[fmt]=g
  print("RDF_PARSE="+json.dumps({"format":fmt,"triples":len(g),"seconds":round(time.monotonic()-start,3),
        "subjects":len(set(g.subjects())),"predicates":len(set(g.predicates())),"blankNodes":sum(isinstance(x,BNode) for x in set(g.subjects()))}),flush=True)
 except Exception as e:
  print("RDF_PARSE="+json.dumps({"format":fmt,"error":str(e)[:600]}),flush=True)
if len(graphs)==2:
 a=set(graphs["turtle"]);b=set(graphs["json-ld"])
 print("RDF_COMPARISON="+json.dumps({"ttlTriples":len(a),"jsonldTriples":len(b),"identicalTriples":len(a&b),"onlyTurtle":len(a-b),"onlyJsonld":len(b-a),
        "turtleOnlySamples":[str(x)[:300] for x in list(a-b)[:4]],"jsonldOnlySamples":[str(x)[:300] for x in list(b-a)[:4]]},flush=True))
if "turtle" in graphs:
 try:
  sg=Graph();sg.parse(data=shapes.decode("utf8"),format="turtle")
  started=time.monotonic()
  conform,rg,report=validate(graphs["turtle"],shacl_graph=sg,inference="none",advanced=True,allow_infos=True,allow_warnings=True,do_owl_imports=False)
  print("RDF_SHACL="+json.dumps({"conforms":bool(conform),"shapesTriples":len(sg),"seconds":round(time.monotonic()-started,2),"report":str(report)[:6000]},ensure_ascii=False),flush=True)
 except Exception as e:
  print("RDF_SHACL="+json.dumps({"error":str(e)[:850]}),flush=True)
out.joinpath("rdf-and-first2mb.json").write_text(json.dumps(result,ensure_ascii=False,indent=2,default=list))
