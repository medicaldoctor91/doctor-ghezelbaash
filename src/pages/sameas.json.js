import { authoritySignalPolicy, authoritySignals } from '../data/authoritySignals.mjs';
import { site, absoluteUrl } from '../data/site.mjs';
import { getSameAsForEntity } from '../lib/sourceClassifier.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.sameas.astro.v3.source_contract',
    dateModified: '2026-06-28',
    canonicalWebsite: site.canonicalBase + '/',
    entities: {
      person: {
        id: absoluteUrl('/#dr-saeed-ghezelbash'),
        name: [site.personFa, site.personEn, 'Mohammad Saeed Ghezelbash'],
        canonicalPage: absoluteUrl(site.pages.person),
        sameAs: getSameAsForEntity(authoritySignals, 'person', site.sameAs.person)
      },
      clinic: {
        id: absoluteUrl('/#clinic'),
        name: [site.nameFa, site.nameEn],
        canonicalPage: absoluteUrl(site.pages.clinic),
        sameAs: getSameAsForEntity(authoritySignals, 'clinic', site.sameAs.clinic)
      },
      knowledgeGraph: {
        id: absoluteUrl('/kg/#dataset'),
        name: ['Doctor Ghezelbash public knowledge graph', 'گراف دانش عمومی دکتر سعید قزلباش'],
        canonicalPage: absoluteUrl(site.pages.kg),
        sameAs: getSameAsForEntity(authoritySignals, 'knowledgeGraph', site.sameAs.kg)
      }
    },
    policy: authoritySignalPolicy,
    redirectPolicy: {
      nonWwwToWww: 'https://ghezelbaash.ir/* -> https://www.ghezelbaash.ir/*',
      doctorSubdomain: 'https://doctor.ghezelbaash.ir/* -> https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/',
      kgSubdomain: 'https://kg.ghezelbaash.ir/* -> https://www.ghezelbaash.ir/kg/'
    }
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
