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

function mustNotExist(relPath) {
  const file = path.join(dist, relPath);
  if (fs.existsSync(file)) {
    console.error(`dist/${relPath} must not exist`);
    failed = true;
  }
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
  'dataset.json',
  'authority-signals.json',
  'profile-links.json',
  'service-taxonomy.json',
  'graph-ghezelbaash-final.jsonld',
  'dataset-manifest.jsonld',
  'publishing-crosswalk.jsonld',
  'dr-saeed-ghezelbash/index.html',
  'dr-saeed-ghezelbash-aesthetic-clinic/index.html',
  'robots.txt',
  'CNAME'
];

for (const file of required) read(file);
mustNotExist('google-maps-review-evidence.html');

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
  mustContain(`${slug}/index.html`, 'خدمات زیبایی در کرمانشاه');
}

mustContain('index.html', 'https://www.ghezelbaash.ir/doctor.jpg');
mustContain('index.html', 'twitter:card');
mustContain('index.html', 'BreadcrumbList');
mustContain('llms.txt', '/routes.json');
mustContain('llms.txt', '/seo-aeo-index.json');
mustContain('llms.txt', '/regulatory.json');
mustContain('llms.txt', '/research.json');
mustContain('llms.txt', '/authority-signals.json');
mustContain('routes.json', 'ghezelbaash.routes.astro.v1');
mustContain('routes.json', 'services-hub');
mustContain('routes.json', 'service');
mustContain('routes.json', 'knowledge-graph');
mustContain('seo-aeo-index.json', 'ghezelbaash.seo_aeo_index.astro.v1');
mustContain('seo-aeo-index.json', 'schemaTargets');
mustContain('seo-aeo-index.json', 'MedicalBusiness');
mustContain('seo-aeo-index.json', 'FAQPage');
mustContain('sameas.json', 'ghezelbaash.sameas.astro.v3.source_contract');
mustContain('sameas.json', 'Q140287622');
mustContain('sameas.json', 'Q140288589');
mustContain('sameas.json', 'Q140304972');
mustContain('sameas.json', 'about.me/ghezelbaash');
mustContain('sameas.json', 'huggingface.co/doctor-ghezelbaash');
mustContain('sameas.json', 'nshn.ir');
mustContain('sameas.json', 'balad.ir');
mustContain('sameas.json', 'yandex.com/maps');
mustContain('sameas.json', 'foursquare.com/share/venue');
mustContain('graph-ghezelbaash-final.jsonld', '#dr-saeed-ghezelbash');
mustContain('graph-ghezelbaash-final.jsonld', '#clinic');
mustContain('graph-ghezelbaash-final.jsonld', '/kg/#dataset');
mustContain('graph-ghezelbaash-final.jsonld', 'MedicalClinic');
mustContain('graph-ghezelbaash-final.jsonld', 'Dataset');
mustContain('graph-ghezelbaash-final.jsonld', '6714657412');
mustContain('graph-ghezelbaash-final.jsonld', 'AggregateRating');
mustContain('graph-ghezelbaash-final.jsonld', 'ratingCount');
mustContain('dataset-manifest.jsonld', '2026-06-28-website-first-source-contract');
mustContain('dataset-manifest.jsonld', '/authority-signals.json');
mustContain('dataset-manifest.jsonld', '/profile-links.json');
mustContain('dataset-manifest.jsonld', '/link-graph.json');
mustContain('publishing-crosswalk.jsonld', '2026-06-28-website-first-source-contract');
mustContain('publishing-crosswalk.jsonld', 'canonicalMachineEndpoints');
mustContain('publishing-crosswalk.jsonld', 'generated_website_endpoints');
mustContain('publishing-crosswalk.jsonld', '/brand-kb.ghezelbaash.ai-public.json');
mustContain('services.json', 'ghezelbaash.service_architecture.astro.v2.entity_hardened');
mustContain('services.json', 'contentBlocksRequired');
mustContain('services.json', 'supportingIntents');
mustContain('services.json', 'machineSupportAssets');
mustContain('services.json', 'regulatory.json');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'ghezelbaash.brand_kb.astro.v6.reputation_integrated');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'publicationIdentifiers');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'authoritySignals');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'authorityPolicy');
mustContain('brand-kb.ghezelbaash.ai-public.json', '167430');
mustContain('brand-kb.ghezelbaash.ai-public.json', '6714657412');
mustContain('brand-kb.ghezelbaash.ai-public.json', 'googleMapsReputation');
mustContain('ai-discovery-index.json', 'ghezelbaash.ai_discovery_index.astro.v2.source_contract');
mustContain('ai-discovery-index.json', '/profile-links.json');
mustContain('ai-discovery-index.json', '/authority-signals.json');
mustContain('ai-discovery-index.json', '/graph-ghezelbaash-final.jsonld');
mustContain('regulatory.json', '167430');
mustContain('location.json', 'ساختمان ویستا');
mustContain('location.json', 'mapProfiles');
mustContain('location.json', '6714657412');
mustContain('location.json', 'googleMapsReputation');
mustContain('location.json', 'ratingCount');
mustContain('research.json', '0009-0001-9346-8475');
mustContain('research.json', '34574943');
mustContain('dataset.json', '10.5281/zenodo.18765169');
mustContain('entity-hardening-index.json', 'entity_hardening');
mustContain('authority-signals.json', 'authority_signals');
mustContain('authority-signals.json', 'iranmedlabs-interview');
mustContain('authority-signals.json', 'https://iranmedlabs.com/skin-and-hair-and-beauty/120049/');
mustContain('authority-signals.json', 'ninisite-discussion-16693096');
mustContain('authority-signals.json', 'rokna-1149379');
mustContain('dr-saeed-ghezelbash/index.html', 'دکتر سعید قزلباش | پزشک زیبایی در کرمانشاه');
mustContain('dr-saeed-ghezelbash/index.html', '۱۶۷۴۳۰');
mustContain('dr-saeed-ghezelbash/index.html', 'IranMedLabs');
mustContain('dr-saeed-ghezelbash/index.html', '/botox-kermanshah/');
mustContain('dr-saeed-ghezelbash/index.html', 'پرسش‌های متداول درباره دکتر سعید قزلباش');
mustContain('dr-saeed-ghezelbash/index.html', 'ProfilePage');
mustContain('dr-saeed-ghezelbash/index.html', 'FAQPage');
mustContain('dr-saeed-ghezelbash/index.html', '#webpage');
mustContain('dr-saeed-ghezelbash/index.html', '#faq');
mustContain('dr-saeed-ghezelbash/index.html', 'Physician');
mustContain('dr-saeed-ghezelbash/index.html', 'BreadcrumbList');
mustContain('dr-saeed-ghezelbash/index.html', 'mainEntity');
mustContain('dr-saeed-ghezelbash/index.html', '#dr-saeed-ghezelbash');
mustContain('dr-saeed-ghezelbash/index.html', 'فهرست سریع و نقشه محتوایی صفحه');
mustContain('dr-saeed-ghezelbash/index.html', 'نقشه شواهد و اولویت منابع');
mustContain('dr-saeed-ghezelbash/index.html', 'knowsAbout');
mustContain('dr-saeed-ghezelbash/index.html', 'مصاحبه ایران‌مدلبز با دکتر سعید قزلباش');
mustContain('dr-saeed-ghezelbash/index.html', 'https://iranmedlabs.com/skin-and-hair-and-beauty/120049/');
mustContain('dr-saeed-ghezelbash/index.html', 'پروفایل حرفه‌ای دکتر سعید قزلباش');
mustContain('dr-saeed-ghezelbash/index.html', 'جزئیات هویت رسمی و نشانی فعالیت');
mustContain('dr-saeed-ghezelbash/index.html', 'منابع قابل بررسی برای شناخت دکتر سعید قزلباش');
mustContain('dr-saeed-ghezelbash/index.html', 'معیارهای انتخاب پزشک زیبایی در کرمانشاه');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'Google Maps');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'OpenStreetMap');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'sameAs JSON');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'BreadcrumbList');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'MedicalBusiness');
mustContain('dr-saeed-ghezelbash-aesthetic-clinic/index.html', 'LocalBusiness');
mustContain('services/index.html', 'ItemList');
mustContain('services/index.html', '#service-list');

if (failed) process.exit(1);
console.log('Astro dist validation passed');
