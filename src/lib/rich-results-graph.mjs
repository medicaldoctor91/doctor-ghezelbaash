// Google-specific compatibility projection; canonical entity names and visible copy remain unchanged.
const BASE = 'https://www.ghezelbaash.ir/';
const DATASET = `${BASE}#historical-patient-origin-summary`;
const LOGO = `${BASE}#image-doctor-ghezelbaash-clinic-logo`;

const ARTICLE_FIXES = {
  [`${BASE}#article-omega-3-bipolar-i-2016`]: {
    date: '2016-05-19T00:00:00Z',
    url: 'https://doi.org/10.4103/2008-7802.182734',
  },
  [`${BASE}#article-mdd-attachment-dissociation-trauma-2021`]: {
    date: '2021-09-06T00:00:00Z',
    url: 'https://doi.org/10.3390/healthcare9091169',
  },
};

const ARTICLE_IMAGES = [
  { '@id': `${BASE}#image-saeed-ghezelbash-portrait-square-1200` },
  { '@id': `${BASE}#image-saeed-ghezelbash-portrait-4x3-1200` },
  { '@id': `${BASE}#image-saeed-ghezelbash-portrait-16x9-1200` },
];

function types(node) {
  const value = node['@type'];
  if (Array.isArray(value)) return value.filter((item) => typeof item === 'string');
  return typeof value === 'string' ? [value] : [];
}

export function hardenRichResultsGraph(rawGraph) {
  const document = JSON.parse(rawGraph);
  const graph = document['@graph'];
  if (!Array.isArray(graph)) throw new Error('Head Graph must contain an @graph array.');

  const nodes = graph.filter((node) => Boolean(node) && typeof node === 'object');
  const byId = new Map();
  for (const node of nodes) {
    const id = node['@id'];
    if (typeof id === 'string') byId.set(id, node);

    const contentUrl = node.contentUrl;
    if (types(node).includes('ImageObject') && typeof contentUrl === 'string') {
      node.url = contentUrl;
    }
  }

  const dataset = byId.get(DATASET);
  if (!dataset) throw new Error(`Required Dataset is missing: ${DATASET}`);
  dataset.spatialCoverage = [
    {
      '@type': 'Place',
      name: 'Iran',
      alternateName: 'ایران',
      sameAs: 'https://www.wikidata.org/entity/Q794',
    },
    {
      '@type': 'Place',
      name: 'Iraq',
      alternateName: 'عراق',
      sameAs: 'https://www.wikidata.org/entity/Q796',
    },
  ];

  const logo = byId.get(LOGO);
  if (!logo || typeof logo.contentUrl !== 'string') {
    throw new Error(`Required clinic logo ImageObject is missing: ${LOGO}`);
  }
  logo.url = logo.contentUrl;
  logo.creditText = 'Saeed Ghezelbash / Dr. Saeed Ghezelbash Aesthetic Clinic';
  logo.license = 'https://creativecommons.org/licenses/by/4.0/';
  logo.acquireLicensePage = BASE;
  logo.copyrightNotice = '© 2026 Saeed Ghezelbash';

  for (const [id, fix] of Object.entries(ARTICLE_FIXES)) {
    const article = byId.get(id);
    if (!article) throw new Error(`Required ScholarlyArticle is missing: ${id}`);
    article.datePublished = fix.date;
    article.dateModified = fix.date;
    article.url = fix.url;
    article.image = ARTICLE_IMAGES;
  }

  return `${JSON.stringify(document)}\n`;
}
