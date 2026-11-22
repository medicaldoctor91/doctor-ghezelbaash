const origin = 'https://www.ghezelbaash.ir';
const physicianId = origin + '/#saeed-ghezelbash';
const researchName = 'Mohammad Saeed Ghezelbash';
const ref = id => ({'@id': id});
const values = value => value == null ? [] : Array.isArray(value) ? value : [value];

// The journal/PubMed byline order is retained in JSON. The published credit
// text also preserves the physician's position for unordered RDF consumers.
const publications = [
  {
    slug: 'article-omega-3-bipolar-i-2016',
    doi: '10.4103/2008-7802.182734', pmid: '27280013',
    byline: [
      'Jalal Shakeri', 'Maryam Khanegi', 'Sanobar Golshani', 'Vahid Farnia',
      'Faeze Tatari', 'Mostafa Alikhani', 'Roghih Nooripour', researchName,
    ],
  },
  {
    slug: 'article-mdd-attachment-dissociation-trauma-2021',
    doi: '10.3390/healthcare9091169', pmid: '34574943',
    byline: [
      'Sanobar Golshani', 'Ali Najafpour', 'Seyed Sepehr Hashemian',
      'Nasser Goudarzi', 'Ali Firoozabadi', researchName, 'Sara Hookari',
      'Kimia Firoozabadi', 'Kenneth M. Dürsteler', 'Annette Beatrix Brühl',
      'Mostafa Alikhani', 'Dena Sadeghi-Bahmani', 'Serge Brand',
    ],
    // ORCIDs deposited by the publisher for this article, via Crossref.
    orcids: {
      'Seyed Sepehr Hashemian': '0000-0002-8334-6642',
      'Kenneth M. Dürsteler': '0000-0003-1552-5822',
      'Annette Beatrix Brühl': '0000-0003-4704-4986',
      'Mostafa Alikhani': '0000-0001-6848-3027',
      'Dena Sadeghi-Bahmani': '0000-0002-1301-5522',
      'Serge Brand': '0000-0003-2175-2765',
    },
    // The publisher assigns these seven roles specifically to M.S.G.
    roles: ['conceptualization', 'methodology', 'validation', 'investigation',
      'resources', 'data-curation', 'writing-review-editing'],
    publisher: 'https://www.mdpi.com/2227-9032/9/9/1169',
  },
];

function setResearchCredit(paper, record) {
  if (paper?.url !== 'https://doi.org/' + record.doi ||
      !values(paper.sameAs).includes('https://pubmed.ncbi.nlm.nih.gov/' + record.pmid + '/') ||
      !values(paper.author).some(author => author['@id'] === physicianId)) {
    throw new Error('Research identity or recorded physician authorship changed: ' + record.slug);
  }
  const authors = record.byline.map(name => {
    if (name === researchName) return ref(physicianId);
    const author = {'@type': 'Person', name};
    if (record.orcids?.[name]) author['@id'] = 'https://orcid.org/' + record.orcids[name];
    return author;
  });
  // Never replace newly supplied contributors with an older roster.
  if (values(paper.author).length > 1 &&
      JSON.stringify(paper.author) !== JSON.stringify(authors)) {
    throw new Error('Scholarly byline differs from the published record: ' + record.doi);
  }
  paper.author = authors;
  paper.creditText = researchName + ' — author ' +
    (record.byline.indexOf(researchName) + 1) + ' of ' + authors.length + '.';
  paper['prov:wasAttributedTo'] = ref(physicianId);

  if (record.roles) {
    paper['prov:wasGeneratedBy'] = {
      '@type': 'prov:Activity',
      'prov:wasAssociatedWith': ref(physicianId),
      'prov:qualifiedAssociation': {
        '@type': 'prov:Association',
        'prov:agent': ref(physicianId),
        'prov:hadRole': record.roles.map(role => ref('https://credit.niso.org/contributor-roles/' + role + '/')),
        'dcterms:source': ref(record.publisher),
      },
    };
    // The article acknowledges results from his M.D. thesis; its title,
    // defense date and a public thesis URL have not been supplied.
    paper.isBasedOn = {
      '@type': 'Thesis',
      author: ref(physicianId),
      inSupportOf: 'Doctor of Medicine',
      'dcterms:source': ref(record.publisher),
    };
  }
}

export function attributePhysicianWorks(graph, physician) {
  if (physician['@id'] !== physicianId) throw new Error('Unknown physician identity');
  const context = graph['@context'];
  const sitePrefix = origin + '/';
  if ((context.site && context.site !== sitePrefix) || context.prov !== 'http://www.w3.org/ns/prov#') {
    throw new Error('Unexpected canonical IRI prefixes');
  }
  const attributionIri = context.prov + 'wasAttributedTo';
  const previous = context['prov:wasAttributedTo'];
  if (previous && (previous['@id'] !== attributionIri || previous['@type'] !== '@id'))
    throw new Error('Incompatible attribution term definition');
  context.site = sitePrefix;
  context['prov:wasAttributedTo'] = {'@id': attributionIri, '@type': '@id'};
  const nodes = new Map(graph['@graph'].map(node => [node['@id'], node]));
  for (const record of publications) setResearchCredit(nodes.get(origin + '/' + record.slug), record);

  // Close attribution over every existing positive author/creator assertion,
  // regardless of document subtype, hosting domain, or whether it is a
  // downloadable distribution / physician-curated evidence collection.
  // A publisher, subject, reviewer, quoted clinician, or merely mentioned
  // person is NOT automatically the work's author or creator.
  // Do not change the pre-existing author/creator assertions themselves.
  for (const node of nodes.values()) {
    if (node['@id'] === physicianId) continue;
    const credited = ['author', 'creator'].some(property =>
      values(node[property]).some(agent => agent?.['@id'] === physicianId));
    if (!credited) continue;
    const key = 'prov:wasAttributedTo';
    const prior = values(node[key]);
    if (prior.some(agent => agent?.['@id'] === physicianId ||
      agent === physicianId || agent === 'site:#saeed-ghezelbash')) continue;
    // Preserve independent existing attribution, including other agents.
    if (!prior.length) node[key] = 'site:#saeed-ghezelbash';
    else node[key] = [...prior, ref(physicianId)];
  }
}
