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
    key: 'ncbi-bibliography',
    type: 'scholarlyProfile',
    entity: 'person',
    publisher: 'NCBI',
    url: 'https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/',
    useAs: ['researchProfile', 'subjectOf']
  },
  {
    key: 'zenodo-dataset',
    type: 'archivedDataset',
    entity: 'knowledgeGraph',
    publisher: 'Zenodo',
    url: 'https://zenodo.org/records/18765169',
    useAs: ['datasetArchive', 'citation']
  },
  {
    key: 'huggingface-dataset',
    type: 'publicDataset',
    entity: 'knowledgeGraph',
    publisher: 'Hugging Face',
    url: 'https://huggingface.co/datasets/doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data',
    useAs: ['datasetDistribution', 'subjectOf']
  },
  {
    key: 'aboutme-profile',
    type: 'publicProfile',
    entity: 'personAndClinic',
    publisher: 'About.me',
    url: 'https://about.me/ghezelbaash',
    useAs: ['externalProfile', 'authoritySignal']
  },
  {
    key: 'linktree-profile',
    type: 'publicProfile',
    entity: 'personAndClinic',
    publisher: 'Linktree',
    url: 'https://linktr.ee/Doctor.ghezelbaash',
    useAs: ['externalProfile', 'authoritySignal']
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
    key: 'ninisite-coverage',
    type: 'mediaMention',
    entity: 'clinicAndServices',
    publisher: 'NiniSite',
    url: 'https://www.ninisite.com/article/18112/',
    useAs: ['subjectOf', 'authoritySignal', 'serviceEvidence']
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
    key: 'iranmedlabs-interview',
    type: 'mediaInterview',
    entity: 'personAndClinic',
    publisher: 'IranMedLabs',
    url: 'https://iranmedlabs.com/skin-and-hair-and-beauty/120049/',
    useAs: ['subjectOf', 'authoritySignal', 'interviewEvidence']
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
