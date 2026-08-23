export const STATIC_ARTIFACTS=Object.freeze([
  {source:'src/data/semantic/knowledge-graph.jsonld',path:'graph.jsonld'},
  {source:'src/data/semantic/knowledge-graph.ttl',path:'graph.ttl'},
  {source:'src/data/semantic/shapes.ttl',path:'shapes.ttl'},
  {source:'src/data/projections/entity-facts.csv',path:'entity-facts.csv'},
  {source:'src/data/projections/answers.txt',path:'answers.txt'},
  {source:'src/data/projections/knowledge.xml',path:'knowledge.xml'},
  {source:'src/data/projections/llms.txt',path:'llms.txt'},
  {source:'src/data/projections/index.md',path:'index.md'},
  {source:'src/data/projections/llms-full.txt',path:'llms-full.txt'},
  {source:'src/data/projections/provenance.jsonld',path:'provenance.jsonld'},
  {source:'src/data/projections/evidence-snapshot.json',path:'evidence-snapshot.json'},
  {source:'src/data/projections/sitemap.xml',path:'sitemap.xml'},
  {source:'src/data/projections/linkset.json',path:'linkset.json'},
  {source:'src/data/projections/datapackage.json',path:'datapackage.json'},
  {source:'src/data/projections/void.ttl',path:'void.ttl'},
  {source:'src/data/projections/dcat.ttl',path:'dcat.ttl'},
  {source:'src/data/projections/croissant.json',path:'croissant.json'},
].map(Object.freeze));

const byRoute=new Map(STATIC_ARTIFACTS.map(artifact=>[`/${artifact.path}`,artifact]));
if(byRoute.size!==STATIC_ARTIFACTS.length)throw new Error('Duplicate static artifact route');
export const staticArtifactForRoute=route=>byRoute.get(String(route))??null;
