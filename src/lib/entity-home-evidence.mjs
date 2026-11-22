/**
 * Human-readable, first-party evidence surface for the canonical physician.
 *
 * This is supplementary visible corroboration, NOT another Person, another
 * JSON-LD graph, or a substitute for the entire active canonical RDF in HEAD.
 * URLs and authorship relationships must already exist in the immutable graph.
 */
const values = value => value == null ? [] : Array.isArray(value) ? value : [value];
const references = value => values(value).map(v => typeof v === 'string' ? v : v?.['@id']).filter(Boolean);
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('"','&quot;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;');

export function renderEntityHomeEvidence(graph,{origin='https://www.ghezelbaash.ir'}={}) {
  const nodes = new Map(graph['@graph'].map(node => [node['@id'],node]));
  const physicianId = origin+'/#saeed-ghezelbash';
  const physician = nodes.get(physicianId);
  const homepage = nodes.get(origin+'/webpage');
  const credential = nodes.get(origin+'/irimc-credential-167430');
  const identifier = nodes.get(origin+'/identifier-person-orcid');
  const studies = ['article-omega-3-bipolar-i-2016','article-mdd-attachment-dissociation-trauma-2021']
    .map(slug => nodes.get(origin+'/'+slug));
  const clinical = nodes.get(origin+'/saeed-ghezelbash-diagnostic-philosophy#article');

  if (!physician || homepage?.mainEntity?.['@id']!==physicianId ||
      physician.mainEntityOfPage?.['@id']!==homepage?.['@id'] ||
      !values(physician['@type']).includes('Person') ||
      !values(physician['@type']).includes('IndividualPhysician'))
    throw new Error('Entity Home physician identity and primary page are not reciprocal');

  const medicalRegistry = credential?.url;
  const orcid = identifier?.url;
  const wikidata = 'https://www.wikidata.org/entity/Q140287622';
  const externalProfiles = new Set(values(physician.sameAs));
  for (const u of [medicalRegistry,orcid,wikidata])
    if (!u || !externalProfiles.has(u)) throw new Error('Entity Home authority profile absent from canonical Person: '+u);
  if (!references(physician.hasCredential).includes(credential['@id']))
    throw new Error('Medical registration must attach to the canonical physician');

  const studyUrls = studies.map(paper => {
    const indexed = values(paper?.sameAs).find(x=>typeof x==='string'&&/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/\d+\/$/.test(x));
    if (!indexed || !references(physician.researchOutput).includes(paper['@id']) ||
        !values(paper.author).some(author=>author?.['@id']===physicianId ||
          /^(Mohammad )?Saeed Ghezelbash$/i.test(author?.name??'')))
      throw new Error('Evidence panel cannot assert unverified PubMed authorship');
    return indexed;
  });
  if (clinical?.author?.['@id']!==physicianId ||
      clinical.url!==origin+'/saeed-ghezelbash-diagnostic-philosophy')
    throw new Error('Clinical expertise link must be authored by the same physician');

  // Publication topics are not represented as credentials in aesthetic medicine.
  // Clinical skill evidence and peer-reviewed research authorship remain distinct.
  return `<section id="entity-home-evidence" class="entity-home-evidence" aria-labelledby="entity-home-evidence-heading" data-canonical-person="${escape(physicianId)}">
    <h2 id="entity-home-evidence-heading">هویت حرفه‌ای، فعالیت بالینی و آثار پژوهشی دکتر سعید قزلباش</h2>
    <p>دکتر سعید قزلباش، پزشک دارای شماره نظام پزشکی ۱۶۷۴۳۰ و فعال در پزشکی زیبایی در کرمانشاه است. این صفحه مرجع اصلی معرفی حرفه‌ای اوست؛ مدارک هویتی و آثار پژوهشی از توضیح روش تصمیم‌گیری بالینی جداگانه قابل بررسی‌اند.</p>
    <ul>
      <li><strong>هویت و ثبت حرفه‌ای:</strong> <a href="${escape(medicalRegistry)}" rel="me external noopener">استعلام شماره نظام پزشکی ۱۶۷۴۳۰</a>، <a href="${escape(orcid)}" rel="me external noopener">شناسه ORCID</a> و <a href="${escape(wikidata)}" rel="me external noopener">شناسه Wikidata</a></li>
      <li><strong>فعالیت و دانش بالینی زیبایی:</strong> <a href="${escape(clinical.url)}">فلسفه تشخیص و ارزیابی صورت پیش از درمان</a> و <a href="/saeed-ghezelbash-research-education-and-clinical-decisions">زندگی‌نامه، آموزش و تصمیم‌گیری بالینی</a></li>
      <li><strong>آثار پژوهشی نمایه‌شده:</strong> <a href="${escape(studyUrls[0])}" rel="external noopener">مقاله PubMed سال ۲۰۱۶</a> و <a href="${escape(studyUrls[1])}" rel="external noopener">مقاله PubMed سال ۲۰۲۱</a></li>
    </ul>
  </section>`;
}
