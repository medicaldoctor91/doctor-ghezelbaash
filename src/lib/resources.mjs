export const STATIC_ARTIFACTS=Object.freeze([
  {source:'src/data/semantic/knowledge-graph.jsonld',path:'graph.jsonld',mediaType:'application/ld+json',headRel:'describedby',headTitle:'Canonical full knowledge graph — JSON-LD',footerLabel:'JSON-LD'},
  {source:'.generated/semantic/knowledge-graph.ttl',path:'graph.ttl',mediaType:'text/turtle',headRel:'describedby',headTitle:'Canonical full knowledge graph — Turtle',footerLabel:'RDF/Turtle'},
  {source:'src/data/semantic/shapes.ttl',path:'shapes.ttl',mediaType:'text/turtle',headRel:'describedby',headTitle:'SHACL entity constitution',footerLabel:'SHACL'},
  {source:'.generated/projections/entity-facts.csv',path:'entity-facts.csv',mediaType:'text/csv',headRel:'describedby',footerLabel:'CSV facts'},
  {source:'.generated/projections/answers.txt',path:'answers.txt',mediaType:'text/plain',headRel:'alternate',footerLabel:'Answer corpus'},
  {source:'.generated/projections/knowledge.xml',path:'knowledge.xml',mediaType:'application/xml',headRel:'alternate',footerLabel:'XML'},
  {source:'.generated/projections/llms.txt',path:'llms.txt',mediaType:'text/plain',headRel:'describedby',headTitle:'Machine-readable entity guide',footerLabel:'LLM guide'},
  {source:'.generated/projections/index.md',path:'index.md',mediaType:'text/markdown',headRel:'alternate',headTitle:'Markdown projection'},
  {source:'.generated/projections/llms-full.txt',path:'llms-full.txt',mediaType:'text/plain',headRel:'alternate',headTitle:'Full text projection'},
  {source:'.generated/projections/provenance.jsonld',path:'provenance.jsonld',mediaType:'application/ld+json',headRel:'describedby',headTitle:'Claim and passage provenance graph',footerLabel:'Provenance'},
  {source:'.generated/projections/evidence-snapshot.json',path:'evidence-snapshot.json',mediaType:'application/json',headRel:'describedby',headTitle:'Release evidence health snapshot'},
  {source:'.generated/projections/sitemap.xml',path:'sitemap.xml',mediaType:'application/xml'},
  {source:'.generated/projections/linkset.json',path:'linkset.json',mediaType:'application/linkset+json',headRel:'linkset',footerLabel:'Linkset'},
  {source:'.generated/projections/datapackage.json',path:'datapackage.json',mediaType:'application/json',headRel:'describedby',footerLabel:'Data Package'},
  {source:'.generated/projections/void.ttl',path:'void.ttl',mediaType:'text/turtle',headRel:'describedby',footerLabel:'VoID'},
  {source:'.generated/projections/dcat.ttl',path:'dcat.ttl',mediaType:'text/turtle',headRel:'describedby',footerLabel:'DCAT 3'},
  {source:'.generated/projections/croissant.json',path:'croissant.json',mediaType:'application/ld+json',headRel:'describedby',footerLabel:'Croissant 1.1'},
]);

const byRoute=new Map(STATIC_ARTIFACTS.map(resource=>[`/${resource.path}`,resource]));
if(byRoute.size!==STATIC_ARTIFACTS.length)throw new Error('Duplicate static resource route');
export const staticArtifactForRoute=route=>byRoute.get(String(route))??null;
export const HEAD_RESOURCES=Object.freeze(STATIC_ARTIFACTS.filter(resource=>'headRel' in resource));
export const FOOTER_RESOURCES=Object.freeze(STATIC_ARTIFACTS.filter(resource=>'footerLabel' in resource));
