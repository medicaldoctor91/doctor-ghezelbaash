export const homepageExternalDirectoryContract = [
  {
    id: 'medical-registration',
    title: 'ثبت و اعتبار پزشکی',
    links: [
      {
        id: 'irimc-registration',
        label: 'بررسی رسمی شماره نظام پزشکی دکتر محمدسعید قزلباش',
        sitePath: ['irimcVerification'],
        relation: 'official-registration',
        entity: 'person',
      },
      {
        id: 'doctor-wikidata',
        label: 'انتیتی Mohammad Saeed Ghezelbash در Wikidata',
        sitePath: ['doctorWikidata'],
        relation: 'authority-identifier',
        entity: 'person',
      },
    ],
  },
  {
    id: 'research-identifiers',
    title: 'پژوهش و شناسه‌های علمی',
    links: [
      {
        id: 'orcid-researcher',
        label: 'شناسه پژوهشگر ORCID دکتر سعید قزلباش',
        sitePath: ['orcidUrl'],
        relation: 'research-identifier',
        entity: 'person',
        relMe: true,
      },
      {
        id: 'ncbi-bibliography',
        label: 'کتاب‌شناسی عمومی NCBI دکتر سعید قزلباش',
        sitePath: ['ncbiBibliography'],
        relation: 'research-profile',
        entity: 'person',
      },
      {
        id: 'pubmed-omega3-bipolar',
        label: 'مقاله Omega-3 و اختلال دوقطبی در PubMed',
        sitePath: ['researchProfiles', 0, 'url'],
        relation: 'research-publication',
        entity: 'publication',
      },
      {
        id: 'pmc-omega3-bipolar',
        label: 'متن کامل مقاله Omega-3 و اختلال دوقطبی در PubMed Central',
        sitePath: ['researchProfiles', 0, 'fullTextUrl'],
        relation: 'research-publication',
        entity: 'publication',
      },
      {
        id: 'pubmed-attachment-depression',
        label: 'مقاله سبک دلبستگی و افسردگی در PubMed',
        sitePath: ['researchProfiles', 1, 'url'],
        relation: 'research-publication',
        entity: 'publication',
      },
    ],
  },
  {
    id: 'official-networks',
    title: 'شبکه‌های رسمی',
    links: [
      {
        id: 'instagram-official',
        label: 'اینستاگرام رسمی دکتر سعید قزلباش',
        sitePath: ['instagram'],
        relation: 'owned-profile',
        entity: 'person',
        relMe: true,
      },
      {
        id: 'linkedin-official',
        label: 'پروفایل حرفه‌ای دکتر سعید قزلباش در LinkedIn',
        sitePath: ['linkedinProfile'],
        relation: 'owned-profile',
        entity: 'person',
        relMe: true,
      },
      {
        id: 'facebook-official',
        label: 'پروفایل رسمی Facebook دکتر سعید قزلباش',
        sitePath: ['facebookProfile'],
        relation: 'owned-profile',
        entity: 'person',
        relMe: true,
      },
      {
        id: 'pinterest-official',
        label: 'پروفایل رسمی Pinterest دکتر سعید قزلباش',
        sitePath: ['pinterestProfile'],
        relation: 'owned-profile',
        entity: 'person',
        relMe: true,
      },
      {
        id: 'x-official',
        label: 'پروفایل رسمی دکتر سعید قزلباش در X',
        sitePath: ['xProfile'],
        relation: 'owned-profile',
        entity: 'person',
        relMe: true,
      },
      {
        id: 'aboutme-official',
        label: 'پروفایل معرفی دکتر سعید قزلباش در About.me',
        sitePath: ['aboutMeProfile'],
        relation: 'owned-profile',
        entity: 'person',
        relMe: true,
      },
      {
        id: 'linktree-official',
        label: 'هاب پیوندهای رسمی دکتر سعید قزلباش در Linktree',
        sitePath: ['linktreeProfile'],
        relation: 'owned-profile',
        entity: 'person',
        relMe: true,
      },
      {
        id: 'github-profile-official',
        label: 'پروفایل GitHub دکتر سعید قزلباش',
        sitePath: ['githubProfile'],
        relation: 'owned-profile',
        entity: 'person',
        relMe: true,
      },
      {
        id: 'huggingface-profile-official',
        label: 'پروفایل Hugging Face دکتر سعید قزلباش',
        sitePath: ['huggingFaceProfile'],
        relation: 'owned-profile',
        entity: 'person',
        relMe: true,
      },
    ],
  },
  {
    id: 'clinic-location',
    title: 'موقعیت و کلینیک',
    links: [
      {
        id: 'clinic-google-maps',
        label: 'موقعیت کلینیک زیبایی دکتر سعید قزلباش در Google Maps',
        sitePath: ['maps'],
        relation: 'clinic-map',
        entity: 'clinic',
      },
      {
        id: 'clinic-openstreetmap',
        label: 'موقعیت کلینیک زیبایی دکتر سعید قزلباش در OpenStreetMap',
        sitePath: ['openStreetMap'],
        relation: 'clinic-map',
        entity: 'clinic',
      },
      {
        id: 'clinic-wikidata',
        label: 'انتیتی کلینیک زیبایی دکتر سعید قزلباش در Wikidata',
        sitePath: ['placeWikidata'],
        relation: 'authority-identifier',
        entity: 'clinic',
      },
      {
        id: 'clinic-google-knowledge-panel',
        label: 'شناسه محلی کلینیک در Google Knowledge Graph',
        sitePath: ['clinicGoogleLocalKnowledgeGraphUrl'],
        relation: 'authority-identifier',
        entity: 'clinic',
      },
      {
        id: 'clinic-phone',
        label: 'تماس تلفنی با کلینیک زیبایی دکتر سعید قزلباش',
        sitePath: ['phone'],
        scheme: 'tel',
        relation: 'clinic-contact',
        entity: 'clinic',
      },
    ],
  },
  {
    id: 'machine-data',
    title: 'Dataset و ماشین‌خوان',
    links: [
      {
        id: 'knowledge-graph-jsonld',
        label: 'گراف دانش کامل JSON-LD سایت',
        href: '/knowledge-graph.jsonld',
        relation: 'machine-resource',
        entity: 'dataset',
      },
      {
        id: 'huggingface-dataset',
        label: 'دیتاست عمومی انتیتی دکتر سعید قزلباش در Hugging Face',
        sitePath: ['huggingFaceDataset'],
        relation: 'dataset',
        entity: 'dataset',
      },
      {
        id: 'dataset-wikidata',
        label: 'انتیتی دیتاست ساختاریافته در Wikidata',
        sitePath: ['datasetWikidata'],
        relation: 'authority-identifier',
        entity: 'dataset',
      },
      {
        id: 'zenodo-archive',
        label: 'نسخه آرشیوشده دیتاست و DOI در Zenodo',
        sitePath: ['zenodoRecord'],
        relation: 'dataset-archive',
        entity: 'dataset',
      },
      {
        id: 'llms-text',
        label: 'فایل راهنمای llms.txt سایت',
        href: '/llms.txt',
        relation: 'machine-resource',
        entity: 'dataset',
      },
      {
        id: 'ai-text',
        label: 'بیانیه ماشین‌خوان ai.txt سایت',
        href: '/.well-known/ai.txt',
        relation: 'machine-resource',
        entity: 'dataset',
      },
      {
        id: 'github-source-repository',
        label: 'مخزن کد، compilerها و validatorهای سایت در GitHub',
        sitePath: ['githubRepository'],
        relation: 'source-code',
        entity: 'dataset',
      },
    ],
  },
];

const readPath = (source, path) => path.reduce((value, key) => value?.[key], source);

export const resolveHomepageExternalDirectory = (site) => homepageExternalDirectoryContract.map((group) => ({
  ...group,
  links: group.links.map((link) => {
    const rawHref = link.href ?? readPath(site, link.sitePath ?? []);
    if (typeof rawHref !== 'string' || rawHref.length === 0) {
      throw new Error(`Stage 7 directory link cannot be resolved: ${group.id}/${link.id}`);
    }
    return {
      ...link,
      href: link.scheme === 'tel' ? `tel:${rawHref}` : rawHref,
      external: !rawHref.startsWith('/') && link.scheme !== 'tel',
    };
  }),
}));
