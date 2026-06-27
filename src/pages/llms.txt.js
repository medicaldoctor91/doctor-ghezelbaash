import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';

export function GET() {
  const lines = [
    '# Doctor Ghezelbash — canonical public site and graph files',
    '',
    `Canonical site: ${site.canonicalBase}/`,
    `Person page: ${absoluteUrl(site.pages.person)}`,
    `Clinic page: ${absoluteUrl(site.pages.clinic)}`,
    `Services hub: ${absoluteUrl(site.pages.services)}`,
    `Knowledge graph hub: ${absoluteUrl(site.pages.kg)}`,
    `Evidence hub: ${absoluteUrl(site.pages.evidence)}`,
    `Contact: ${absoluteUrl(site.pages.contact)}`,
    `Route registry: ${absoluteUrl('/routes.json')}`,
    `SEO/AEO index: ${absoluteUrl('/seo-aeo-index.json')}`,
    `Page context: ${absoluteUrl('/page-context.json')}`,
    `Internal link graph: ${absoluteUrl('/link-graph.json')}`,
    '',
    'Canonical English spelling:',
    '- Dr. Saeed Ghezelbash',
    '- Given name: Saeed',
    '- Family name: Ghezelbash',
    '- Legacy external aliases may include Ghezelbaash or Saeid.',
    '',
    'Primary conversion:',
    `- Instagram: ${site.instagram}`,
    `- Phone: ${site.phoneE164}`,
    `- Google Maps CID: ${site.mapsCid}`,
    '',
    'Indexable service pages:',
    ...services.flatMap((service) => [
      `- ${service.title}: ${absoluteUrl(`/${service.slug}/`)}`,
      `  Best-intent anchor: ${absoluteUrl(`/${service.slug}/#${service.bestIntentAnchor}`)}`
    ]),
    '',
    'Best-intent routing policy:',
    '- Preserve Persian commercial intents of the form بهترین + خدمت + کرمانشاه.',
    '- Preserve Persian commercial intents of the form بهترین دکتر + خدمت + کرمانشاه.',
    '- Preserve Persian commercial intents of the form بهترین کلینیک + خدمت + کرمانشاه.',
    '- Implement these intents through criteria-based anchors, FAQ targets, schema alignment and internal links.',
    '',
    'Machine-readable root assets:',
    '- /routes.json',
    '- /seo-aeo-index.json',
    '- /page-context.json',
    '- /link-graph.json',
    '- /graph-ghezelbaash-final.jsonld',
    '- /brand-kb.ghezelbaash.ai-public.json',
    '- /ai-discovery-index.json',
    '- /entity-hardening-index.json',
    '- /dataset-manifest.jsonld',
    '- /dataset.json',
    '- /publishing-crosswalk.jsonld',
    '- /services.json',
    '- /service-taxonomy.json',
    '- /sameas.json',
    '- /location.json',
    '- /regulatory.json',
    '- /research.json',
    '- /authority-signals.json',
    '- /profile-links.json',
    '- /nap.csv',
    '- /sitemap.xml',
    '',
    'Dataset policy:',
    '- The Zenodo DOI identifies an archived release of the public knowledge graph.',
    '- The GitHub repository and canonical website may contain newer live revisions.'
  ];

  return new Response(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8'
    }
  });
}
