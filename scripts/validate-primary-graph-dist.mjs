import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'dist', 'graph-ghezelbaash-final.jsonld');
let failed = false;
function fail(message) {
  console.error(message);
  failed = true;
}

if (!fs.existsSync(file)) {
  fail('missing dist/graph-ghezelbaash-final.jsonld');
} else {
  const text = fs.readFileSync(file, 'utf8');
  for (const needle of [
    'DataCatalog',
    '/kg/#catalog',
    'EducationalOccupationalCredential',
    '/kg/credential#irimc-167430',
    '/kg/place#kermanshah',
    '/kg/medical-specialty#aesthetic-medicine',
    'Primary graph governance policy',
    '/kg/policy#primary-graph-governance',
    'graphConsolidationPolicy',
    'offerBoundaryPolicy',
    'sameAsPolicy',
    'accountablePerson',
    'maintainer',
    'schemaVersion',
    'isAccessibleForFree',
    'includedInDataCatalog',
    'availableAtOrFrom',
    'serviceArea',
    'knowsLanguage',
    'ProfilePage',
    'CollectionPage',
    '/services/#webpage',
    '/kg/#webpage',
    'دکتر سعید قزلباش؛ دروغ بزرگ جوانسازی و فریب زیباجویان',
    'کلینیک زیبایی دکتر سعید قزلباش کرمانشاه',
    '2026-06-27',
    '2025-06-30',
    'روانشناسی زیباجو',
    'سابسیژن',
    'PezeshkYab',
    'IranMedLabs'
  ]) {
    if (!text.includes(needle)) fail(`primary graph dist missing ${needle}`);
  }

  for (const retired of ['dataset-manifest.jsonld', 'publishing-crosswalk.jsonld', 'research-graph.jsonld']) {
    if (text.includes(`/${retired}`)) fail(`primary graph should not reference retired endpoint ${retired}`);
  }
}

if (failed) process.exit(1);
console.log('Primary graph dist validation passed');
