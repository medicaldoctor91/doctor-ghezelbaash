export const authoritySignals = [
  {
    key: 'wikidata-person',
    type: 'knowledgeGraphRecord',
    entity: 'person',
    publisher: 'Wikidata',
    url: 'https://www.wikidata.org/wiki/Q140287622',
    useAs: ['sameAs', 'entityIdentifier']
  },
  {
    key: 'wikidata-clinic',
    type: 'knowledgeGraphRecord',
    entity: 'clinic',
    publisher: 'Wikidata',
    url: 'https://www.wikidata.org/wiki/Q140288589',
    useAs: ['sameAs', 'entityIdentifier']
  },
  {
    key: 'wikidata-kg',
    type: 'knowledgeGraphRecord',
    entity: 'knowledgeGraph',
    publisher: 'Wikidata',
    url: 'https://www.wikidata.org/wiki/Q140304972',
    useAs: ['sameAs', 'entityIdentifier']
  },
  {
    key: 'orcid-person',
    type: 'scholarlyProfile',
    entity: 'person',
    publisher: 'ORCID',
    url: 'https://orcid.org/0009-0001-9346-8475',
    useAs: ['sameAs', 'entityIdentifier', 'researchProfile']
  },
  {
    key: 'ncbi-bibliography',
    type: 'scholarlyProfile',
    entity: 'person',
    publisher: 'NCBI',
    url: 'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
    useAs: ['sameAs', 'researchProfile', 'subjectOf']
  },
  {
    key: 'linkedin-person',
    type: 'publicProfile',
    entity: 'person',
    publisher: 'LinkedIn',
    url: 'https://www.linkedin.com/in/saeed-ghezelbash-93310a96/',
    useAs: ['sameAs', 'externalProfile', 'authoritySignal']
  },
  {
    key: 'instagram-clinic-person',
    type: 'socialProfile',
    entity: 'personAndClinic',
    publisher: 'Instagram',
    url: 'https://www.instagram.com/doctor.ghezelbaash/',
    useAs: ['sameAs', 'externalProfile', 'conversionTarget']
  },
  {
    key: 'aboutme-profile',
    type: 'publicProfile',
    entity: 'personAndClinic',
    publisher: 'About.me',
    url: 'https://about.me/ghezelbaash',
    useAs: ['sameAs', 'externalProfile', 'authoritySignal']
  },
  {
    key: 'linktree-profile',
    type: 'publicProfile',
    entity: 'personAndClinic',
    publisher: 'Linktree',
    url: 'https://linktr.ee/Doctor.ghezelbaash',
    useAs: ['sameAs', 'externalProfile', 'authoritySignal']
  },
  {
    key: 'github-repository',
    type: 'repository',
    entity: 'knowledgeGraph',
    publisher: 'GitHub',
    url: 'https://github.com/medicaldoctor91/doctor-ghezelbaash',
    useAs: ['sameAs', 'codeRepository', 'datasetDistribution']
  },
  {
    key: 'huggingface-profile',
    type: 'publicProfile',
    entity: 'person',
    publisher: 'Hugging Face',
    url: 'https://huggingface.co/doctor-ghezelbaash',
    useAs: ['sameAs', 'externalProfile', 'authoritySignal']
  },
  {
    key: 'huggingface-dataset',
    type: 'publicDataset',
    entity: 'knowledgeGraph',
    publisher: 'Hugging Face',
    url: 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data',
    useAs: ['sameAs', 'datasetDistribution', 'subjectOf']
  },
  {
    key: 'zenodo-doi',
    type: 'archivedDataset',
    entity: 'knowledgeGraph',
    publisher: 'Zenodo',
    url: 'https://doi.org/10.5281/zenodo.18765169',
    useAs: ['sameAs', 'datasetArchive', 'citation', 'entityIdentifier']
  },
  {
    key: 'zenodo-dataset',
    type: 'archivedDataset',
    entity: 'knowledgeGraph',
    publisher: 'Zenodo',
    url: 'https://zenodo.org/records/18765169',
    useAs: ['sameAs', 'datasetArchive', 'citation']
  },
  {
    key: 'google-maps-cid',
    type: 'localMapProfile',
    entity: 'clinic',
    publisher: 'Google Maps',
    url: 'https://www.google.com/maps?cid=12350483144643112463',
    useAs: ['sameAs', 'hasMap', 'napCorroboration', 'entityIdentifier']
  },
  {
    key: 'google-maps-place-id',
    type: 'localMapProfile',
    entity: 'clinic',
    publisher: 'Google Maps',
    url: 'https://www.google.com/maps/search/?api=1&query=کلینیک%20زیبایی%20دکتر%20قزلباش%20کرمانشاه&query_place_id=ChIJBTOYDOTt-j8RD-7mAPy6Zas',
    identifier: 'ChIJBTOYDOTt-j8RD-7mAPy6Zas',
    useAs: ['sameAs', 'hasMap', 'napCorroboration', 'entityIdentifier']
  },
  {
    key: 'openstreetmap-node',
    type: 'localMapProfile',
    entity: 'clinic',
    publisher: 'OpenStreetMap',
    url: 'https://www.openstreetmap.org/node/13530287096',
    identifier: '13530287096',
    useAs: ['sameAs', 'hasMap', 'napCorroboration', 'entityIdentifier']
  },
  {
    key: 'neshan-map',
    type: 'localMapProfile',
    entity: 'clinic',
    publisher: 'Neshan',
    url: 'https://nshn.ir/ad_br33tY5eHiu',
    useAs: ['sameAs', 'hasMap', 'napCorroboration']
  },
  {
    key: 'balad-map',
    type: 'localMapProfile',
    entity: 'clinic',
    publisher: 'Balad',
    url: 'https://balad.ir/p/2dnVakli9ZKaBd',
    useAs: ['sameAs', 'hasMap', 'napCorroboration']
  },
  {
    key: 'yandex-maps',
    type: 'localMapProfile',
    entity: 'clinic',
    publisher: 'Yandex Maps',
    url: 'https://yandex.com/maps/org/63459342435/',
    identifier: '63459342435',
    useAs: ['sameAs', 'hasMap', 'napCorroboration', 'entityIdentifier']
  },
  {
    key: 'foursquare-venue',
    type: 'localBusinessDirectoryProfile',
    entity: 'clinic',
    publisher: 'Foursquare',
    url: 'https://app.foursquare.com/share/venue/6987eef061c23b4962a08398',
    identifier: '6987eef061c23b4962a08398',
    useAs: ['sameAs', 'directoryProfile', 'napCorroboration', 'entityIdentifier']
  },
  {
    key: 'doctor-yab-profile',
    type: 'medicalDirectoryProfile',
    entity: 'personAndClinic',
    publisher: 'DoctorYab',
    url: 'https://doctor-yab.ir/Search/43609',
    useAs: ['directoryProfile', 'authoritySignal', 'napCorroboration']
  },
  {
    key: 'doctoreto-profile',
    type: 'medicalDirectoryProfile',
    entity: 'personAndClinic',
    publisher: 'Doctoreto',
    url: 'https://doctoreto.com/doctor/GPezBJ',
    useAs: ['directoryProfile', 'authoritySignal', 'napCorroboration']
  },
  {
    key: 'meidane-business-profile',
    type: 'localBusinessDirectoryProfile',
    entity: 'clinicAndServices',
    publisher: 'Meidane',
    url: 'https://meidane.com/b/13478',
    useAs: ['directoryProfile', 'authoritySignal', 'napCorroboration']
  },
  {
    key: 'pubmed-27280013',
    type: 'researchPublication',
    entity: 'person',
    publisher: 'PubMed',
    url: 'https://pubmed.ncbi.nlm.nih.gov/27280013/',
    identifier: '27280013',
    useAs: ['citation', 'subjectOf', 'researchProfile']
  },
  {
    key: 'pubmed-34574943',
    type: 'researchPublication',
    entity: 'person',
    publisher: 'PubMed',
    url: 'https://pubmed.ncbi.nlm.nih.gov/34574943/',
    identifier: '34574943',
    useAs: ['citation', 'subjectOf', 'researchProfile']
  },
  {
    key: 'mdpi-healthcare-1169',
    type: 'researchPublication',
    entity: 'person',
    publisher: 'MDPI Healthcare',
    url: 'https://www.mdpi.com/2227-9032/9/9/1169',
    identifier: '10.3390/healthcare9091169',
    useAs: ['citation', 'subjectOf', 'researchProfile']
  },
  {
    key: 'mdpi-review-report',
    type: 'researchPublicationReview',
    entity: 'person',
    publisher: 'MDPI Healthcare',
    url: 'https://www.mdpi.com/2227-9032/9/9/1169/review_report',
    useAs: ['citation', 'subjectOf', 'researchProfile']
  },
  {
    key: 'iranmedlabs-interview',
    type: 'mediaInterview',
    entity: 'personAndClinic',
    publisher: 'IranMedLabs',
    url: 'https://iranmedlabs.com/skin-and-hair-and-beauty/120049/',
    identifier: '120049',
    useAs: ['subjectOf', 'authoritySignal', 'interviewEvidence']
  },
  {
    key: 'ninisite-article-18112',
    type: 'mediaMention',
    entity: 'clinicAndServices',
    publisher: 'NiniSite',
    url: 'https://www.ninisite.com/article/18112/',
    identifier: '18112',
    useAs: ['subjectOf', 'authoritySignal', 'serviceEvidence']
  },
  {
    key: 'ninisite-discussion-16693096',
    type: 'forumDiscussion',
    entity: 'clinicAndServices',
    publisher: 'NiniSite',
    url: 'https://www.ninisite.com/discussion/topic/16693096/',
    identifier: '16693096',
    useAs: ['subjectOf', 'discussionEvidence', 'serviceEvidence']
  },
  {
    key: 'ninisite-tag-9240',
    type: 'topicalTag',
    entity: 'personAndClinic',
    publisher: 'NiniSite',
    url: 'https://www.ninisite.com/articles/tagged/9240/',
    identifier: '9240',
    useAs: ['subjectOf', 'authoritySignal']
  },
  {
    key: 'rokna-1149379',
    type: 'mediaMention',
    entity: 'clinicAndServices',
    publisher: 'Rokna',
    url: 'https://www.rokna.net/بخش-سلامت-16/1149379-',
    identifier: '1149379',
    useAs: ['subjectOf', 'authoritySignal', 'serviceEvidence']
  },
  {
    key: 'namnak-skin-beauty-tag',
    type: 'generalTopicPage',
    entity: 'service',
    publisher: 'Namnak',
    url: 'https://namnak.com/t673-زیبایی-پوست',
    useAs: ['topicalContext']
  },
  {
    key: 'pezeshk-yab-coverage',
    type: 'mediaMention',
    entity: 'clinicAndServices',
    publisher: 'PezeshkYab',
    url: 'https://pezeshk-yab.com/blog/dr-saeed-qezlbash-kermanshah/',
    useAs: ['subjectOf', 'authoritySignal', 'serviceEvidence']
  },
  {
    key: 'khabaronline-coverage',
    type: 'mediaMention',
    entity: 'clinic',
    publisher: 'KhabarOnline',
    url: 'https://www.khabaronline.ir/amp/2068552/',
    useAs: ['subjectOf', 'authoritySignal']
  },
  {
    key: 'gadgetnews-coverage',
    type: 'mediaMention',
    entity: 'clinicAndServices',
    publisher: 'GadgetNews',
    url: 'https://gadgetnews.net/927682/beauty-services-kermanshah-dr-saeed-ghazelbash/',
    useAs: ['subjectOf', 'authoritySignal']
  },
  {
    key: 'niniban-coverage',
    type: 'mediaMention',
    entity: 'clinicAndServices',
    publisher: 'Niniban',
    url: 'https://niniban.com/بخش-سلامت-20/243871-خدمات-زیبایی-در-کرمانشاه-دکتر-سعید-قزلباش',
    useAs: ['subjectOf', 'authoritySignal']
  }
];

export const authoritySignalPolicy = {
  sameAs: 'Only direct identity, map/local, profile, repository and dataset records may be used as sameAs.',
  subjectOf: 'News, editorial, forum, interview and topical pages are subjectOf/citation/mention signals, never sameAs.',
  validation: 'scripts/validate-source-contract.mjs blocks media/editorial/forum/tag URLs from verifiedSameAs and sameAs use.'
};
