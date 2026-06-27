import { site, absoluteUrl } from '../data/site.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.sameas.astro.v1',
    dateModified: '2026-06-27',
    canonicalWebsite: site.canonicalBase + '/',
    entities: {
      person: {
        id: absoluteUrl('/#dr-saeed-ghezelbash'),
        name: [site.personFa, site.personEn, 'Mohammad Saeed Ghezelbash'],
        canonicalPage: absoluteUrl(site.pages.person),
        sameAs: site.sameAs.person
      },
      clinic: {
        id: absoluteUrl('/#clinic'),
        name: [site.nameFa, site.nameEn],
        canonicalPage: absoluteUrl(site.pages.clinic),
        sameAs: site.sameAs.clinic
      },
      knowledgeGraph: {
        id: absoluteUrl('/kg/#dataset'),
        name: ['Doctor Ghezelbash public knowledge graph', 'گراف دانش عمومی دکتر سعید قزلباش'],
        canonicalPage: absoluteUrl(site.pages.kg),
        sameAs: site.sameAs.kg
      }
    },
    redirectPolicy: {
      nonWwwToWww: 'https://ghezelbaash.ir/* -> https://www.ghezelbaash.ir/*'
    },
    stage: 'production-astro-main'
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  });
}
