import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
let failed = false;

function read(relPath) {
  const file = path.join(dist, relPath);
  if (!fs.existsSync(file)) {
    console.error(`missing dist/${relPath}`);
    failed = true;
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function mustContain(relPath, needle) {
  const text = read(relPath);
  if (!text.includes(needle)) {
    console.error(`dist/${relPath} missing ${needle}`);
    failed = true;
  }
  return text;
}

function mustNotContain(relPath, needle) {
  const text = read(relPath);
  if (text.includes(needle)) {
    console.error(`dist/${relPath} must not contain ${needle}`);
    failed = true;
  }
  return text;
}

if (!fs.existsSync(path.join(root, 'package-lock.json'))) {
  console.error('missing package-lock.json');
  failed = true;
}

const required = [
  'index.html',
  'sitemap.xml',
  'llms.txt',
  'routes.json',
  'seo-aeo-index.json',
  'services.json',
  'sameas.json',
  'brand-kb.ghezelbaash.ai-public.json',
  'ai-discovery-index.json',
  'entity-hardening-index.json',
  'regulatory.json',
  'location.json',
  'research.json',
  'research-graph.jsonld',
  'dataset.json',
  'authority-signals.json',
  'profile-links.json',
  'service-taxonomy.json',
  'aesthetic_medicine_knowledge_kermanshah_fa.json',
  'aesthetic-medicine-dataset.html',
  'local-competitive-landscape.json',
  'graph-ghezelbaash-final.jsonld',
  'dataset-manifest.jsonld',
  'publishing-crosswalk.jsonld',
  'nap.csv',
  'dr-saeed-ghezelbash/index.html',
  'dr-saeed-ghezelbash-aesthetic-clinic/index.html',
  'robots.txt',
  'CNAME'
];

for (const file of required) read(file);

for (const slug of [
  'botox-kermanshah',
  'filler-kermanshah',
  'thread-lift-kermanshah',
  'skin-hair-rejuvenation-kermanshah',
  'double-chin-liposuction-kermanshah'
]) {
  mustContain('sitemap.xml', `https://www.ghezelbaash.ir/${slug}/`);
  mustContain('routes.json', `/${slug}/`);
  mustContain('seo-aeo-index.json', `/${slug}/`);
  mustContain(`${slug}/index.html`, '<meta name="robots" content="index,follow');
  mustContain(`${slug}/index.html`, 'BreadcrumbList');
  mustContain(`${slug}/index.html`, '#breadcrumb');
  mustContain(`${slug}/index.html`, '#service');
  mustContain(`${slug}/index.html`, 'Service');
  mustContain(`${slug}/index.html`, 'FAQPage');
}

mustContain('index.html', 'https://www.ghezelbaash.ir/doctor.jpg');
mustContain('index.html', 'twitter:card');
mustContain('llms.txt', '/routes.json');
mustContain('llms.txt', '/seo-aeo-index.json');
mustContain('llms.txt', '/authority-signals.json');
mustContain('llms.txt', '/research-graph.jsonld');
mustContain('llms.txt', '/local-competitive-landscape.json');
mustContain('routes.json', 'ghezelbaash.routes.astro.v1');
mustContain('routes.json', 'services-hub');
mustContain('routes.json', 'service');
mustNotContain('routes.json', '/google-maps-review-evidence.html');
mustContain('seo-aeo-index.json', 'ghezelbaash.seo_aeo_index.astro.v1');
mustContain('seo-aeo-index.json', 'schemaTargets');
mustContain('sameas.json', 'ghezelbaash.sameas.astro.v3.source_contract');
mustContain('sameas.json', 'Q140287622');
mustContain('sameas.json', 'Q140288589');
mustContain('sameas.json', 'Q140304972');
mustContain('aesthetic-medicine-dataset.html', 'Dataset reference');
mustContain('aesthetic-medicine-dataset.html', '/aesthetic_medicine_knowledge_kermanshah_fa.json');
mustContain('aesthetic-medicine-dataset.html', '/local-competitive-landscape.json');
mustContain('aesthetic-medicine-dataset.html', '/graph-ghezelbaash-final.jsonld');
mustContain('aesthetic_medicine_knowledge_kermanshah_fa.json', 'ghezelbaash.aesthetic_knowledge.astro.v3.broad_scope');
mustContain('aesthetic_medicine_knowledge_kermanshah_fa.json', 'broadAestheticConcepts');
mustContain('aesthetic_medicine_knowledge_kermanshah_fa.json', 'skin-booster');
mustContain('aesthetic_medicine_knowledge_kermanshah_fa.json', 'canonicalIdentity');
mustContain('aesthetic_medicine_knowledge_kermanshah_fa.json', 'servicePillars');
mustContain('aesthetic_medicine_knowledge_kermanshah_fa.json', 'researchSignals');
mustContain('aesthetic_medicine_knowledge_kermanshah_fa.json', '6714657412');
mustContain('local-competitive-landscape.json', 'ghezelbaash.local_competitive_landscape.astro.v1.generated');
mustContain('local-competitive-landscape.json', 'evaluationDimensions');
mustContain('local-competitive-landscape.json', 'servicePillarCoverage');
mustContain('local-competitive-landscape.json', 'machineReadableEvidence');
mustContain('local-competitive-landscape.json', '6714657412');
mustContain('research.json', 'ghezelbaash.research_identifiers.astro.v3.graph_linked');
mustContain('research.json', '/research-graph.jsonld');
mustContain('research.json', '0009-0001-9346-8475');
mustContain('research.json', '34574943');
mustContain('research-graph.jsonld', 'ScholarlyArticle');
mustContain('research-graph.jsonld', 'CollectionPage');
mustContain('research-graph.jsonld', '10.3390/healthcare9091169');
mustContain('research-graph.jsonld', '10.4103/2008-7802.182734');
mustContain('research-graph.jsonld', '#dr-saeed-ghezelbash');
mustContain('graph-ghezelbaash-final.jsonld', '#dr-saeed-ghezelbash');
mustContain('graph-ghezelbaash-final.jsonld', '#physician');
mustContain('graph-ghezelbaash-final.jsonld', '#clinic');
mustContain('graph-ghezelbaash-final.jsonld', '/kg/#dataset');
mustContain('graph-ghezelbaash-final.jsonld', '/kg/aesthetic-scope#term-set');
mustContain('graph-ghezelbaash-final.jsonld', 'DefinedTermSet');
mustContain('graph-ghezelbaash-final.jsonld', 'DefinedTerm');
mustContain('graph-ghezelbaash-final.jsonld', 'botox-masseter');
mustContain('graph-ghezelbaash-final.jsonld', 'skin-booster');
mustContain('graph-ghezelbaash-final.jsonld', 'full-face-contouring');
mustContain('graph-ghezelbaash-final.jsonld', 'Person');
mustContain('graph-ghezelbaash-final.jsonld', 'Physician');
mustContain('graph-ghezelbaash-final.jsonld', 'MedicalClinic');
mustContain('graph-ghezelbaash-final.jsonld', 'LocalBusiness');
mustContain('graph-ghezelbaash-final.jsonld', 'Dataset');
mustContain('graph-ghezelbaash-final.jsonld', '6714657412');
mustContain('graph-ghezelbaash-final.jsonld', 'medicalSpecialty');
mustContain('dataset-manifest.jsonld', '2026-06-28-website-first-source-contract');
mustContain('publishing-crosswalk.jsonld', 'generated_website_endpoints');
mustContain('services.json', 'ghezelbaash.service_architecture.astro.v3.broad_scope');
mustContain('services.json', 'broadAestheticConcepts');
mustContain('services.json', 'broadScopeConceptsInSchemaGraph');
mustContain('services.json', 'skin-booster');
mustContain('services.json', 'supportingIntents');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'ghezelbaash.brand_kb.astro.v6.reputation_integrated');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'research-graph.jsonld');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'authoritySignals');
mustContain('brand-kb.ghezelbaash.ai-public.json', '167430');
mustContain('brand-kb.ghezelbaash.ai-public.json', '6714657412');
mustContain('ai-discovery-index.json', 'ghezelbaash.ai_discovery_index.astro.v2.source_contract');
mustContain('regulatory.json', '167430');
mustContain('location.json', 'ساختمان ویستا');
mustContain('location.json', 'mapProfiles');
mustContain('location.json', '6714657412');
mustContain('location.json', 'googleMapsReputation');
mustContain('nap.csv', 'postal_code');
mustContain('nap.csv', '6714657412');
mustContain('nap.csv', 'google_maps_place_id');
mustContain('nap.csv', 'ChIJBTOYDOTt-j8RD-7mAPy6Zas');
mustContain('dataset.json', '10.5281/zenodo.18765169');
mustContain('entity-hardening-index.json', 'entity_hardening');
mustContain('authority-signals.json', 'authority_signals');
mustContain('authority-signals.json', 'iranmedlabs-interview');
mustContain('dr-saeed-ghezelbash/index.html', 'دکتر سعید قزلباش | پزشک زیبایی در کرمانشاه');
mustContain('dr-saeed-ghezelbash/index.html', '۱۶۷۴۳۰');
mustContain('dr-saeed-ghezelbash/index.html', 'IranMedLabs');
mustContain('dr-saeed-ghezelbash/index.html', 'ProfilePage');
mustContain('dr-saeed-ghezelbash/index.html', 'Person');
mustContain('dr-saeed-ghezelbash/index.html', 'Physician');
mustContain('dr-saeed-ghezelbash/index.html', '#physician');
mustContain('dr-saeed-ghezelbash/index.html', 'BreadcrumbList');
mustContain('dr-saeed-ghezelbash/index.html', '#dr-saeed-ghezelbash');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'Google Maps');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'OpenStreetMap');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'Physician');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'MedicalBusiness');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'LocalBusiness');
mustContain('services/index.html', 'ItemList');
mustContain('services/index.html', '#service-list');

if (failed) process.exit(1);
console.log('Astro dist validation passed');
