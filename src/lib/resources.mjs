export const STATIC_ARTIFACTS=Object.freeze([
  {source:'src/data/semantic/knowledge-graph.jsonld',path:'graph.jsonld',mediaType:'application/ld+json',headRel:'describedby',headTitle:'Canonical full knowledge graph — JSON-LD',footerLabel:'JSON-LD'},
  {source:'src/data/semantic/knowledge-graph.ttl',path:'graph.ttl',mediaType:'text/turtle',headRel:'describedby',headTitle:'Canonical full knowledge graph — Turtle',footerLabel:'RDF/Turtle'},
  {source:'src/data/semantic/shapes.ttl',path:'shapes.ttl',mediaType:'text/turtle',headRel:'describedby',headTitle:'SHACL entity constitution',footerLabel:'SHACL'},
  {source:'src/data/projections/entity-facts.csv',path:'entity-facts.csv',mediaType:'text/csv',headRel:'describedby',footerLabel:'CSV facts'},
  {source:'src/data/projections/answers.txt',path:'answers.txt',mediaType:'text/plain',headRel:'alternate',footerLabel:'Answer corpus'},
  {source:'src/data/projections/knowledge.xml',path:'knowledge.xml',mediaType:'application/xml',headRel:'alternate',footerLabel:'XML'},
  {source:'src/data/projections/llms.txt',path:'llms.txt',mediaType:'text/plain',headRel:'describedby',headTitle:'Machine-readable entity guide',footerLabel:'LLM guide'},
  {source:'src/data/projections/index.md',path:'index.md',mediaType:'text/markdown',headRel:'alternate',headTitle:'Markdown projection'},
  {source:'src/data/projections/llms-full.txt',path:'llms-full.txt',mediaType:'text/plain',headRel:'alternate',headTitle:'Full text projection'},
  {source:'src/data/projections/provenance.jsonld',path:'provenance.jsonld',mediaType:'application/ld+json',headRel:'describedby',headTitle:'Claim and passage provenance graph',footerLabel:'Provenance'},
  {source:'src/data/projections/evidence-snapshot.json',path:'evidence-snapshot.json',mediaType:'application/json',headRel:'describedby',headTitle:'Release evidence health snapshot'},
  {source:'src/data/projections/sitemap.xml',path:'sitemap.xml',mediaType:'application/xml'},
  {source:'src/data/projections/linkset.json',path:'linkset.json',mediaType:'application/linkset+json',headRel:'linkset',footerLabel:'Linkset'},
  {source:'src/data/projections/datapackage.json',path:'datapackage.json',mediaType:'application/json',headRel:'describedby',footerLabel:'Data Package'},
  {source:'src/data/projections/void.ttl',path:'void.ttl',mediaType:'text/turtle',headRel:'describedby',footerLabel:'VoID'},
  {source:'src/data/projections/dcat.ttl',path:'dcat.ttl',mediaType:'text/turtle',headRel:'describedby',footerLabel:'DCAT 3'},
  {source:'src/data/projections/croissant.json',path:'croissant.json',mediaType:'application/ld+json',headRel:'describedby',footerLabel:'Croissant 1.1'},
].map(Object.freeze));

const byRoute=new Map(STATIC_ARTIFACTS.map(resource=>[`/${resource.path}`,resource]));
if(byRoute.size!==STATIC_ARTIFACTS.length)throw new Error('Duplicate static resource route');
export const staticArtifactForRoute=route=>byRoute.get(String(route))??null;
export const HEAD_RESOURCES=Object.freeze(STATIC_ARTIFACTS.filter(resource=>resource.headRel));
export const FOOTER_RESOURCES=Object.freeze(STATIC_ARTIFACTS.filter(resource=>resource.footerLabel));
