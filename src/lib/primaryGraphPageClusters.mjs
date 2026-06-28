import { location } from '../data/location.mjs';
import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';
import { aestheticConceptsForService } from './aestheticScopeGraph.mjs';
import { officialOfferCatalogId } from './officialOfferGraph.mjs';
import { kermanshahPlaceId } from './primaryGraphCompletion.mjs';
import { graphContactPointId, graphDoctorImageId } from './schemaPropertyExpansion.mjs';

export function serviceListId() {
  return `${absoluteUrl(site.pages.services)}#service-list`;
}

export function contactPageId() {
  return `${absoluteUrl(site.pages.contact)}#webpage`;
}

export function pageClusterId(service, key) {
  return `${absoluteUrl(`/${service.slug}/`)}#cluster-${key}`;
}

export function breadcrumbId(path) {
  const normalized = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\/$/, '').replaceAll('/', '-');
  return `${absoluteUrl(path)}#breadcrumb-${normalized}`;
}

function ref(id) {
  return { '@id': id };
}

function refs(value) {
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function refKey(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') return value['@id'] || value.url || JSON.stringify(value);
  return String(value);
}

function appendRefs(currentValue, additions = []) {
  const current = refs(currentValue);
  const seen = new Set(current.map(refKey));
  const merged = [...current];
  for (const addition of additions) {
    const key = refKey(addition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(addition);
  }
  return merged;
}

function serviceUrl(service) {
  return absoluteUrl(`/${service.slug}/`);
}

function serviceNodeId(service) {
  return absoluteUrl(`/${service.slug}/#service`);
}

function servicePageId(service) {
  return `${serviceUrl(service)}#webpage`;
}

function offerId(service) {
  return absoluteUrl(`/${service.slug}/#offer`);
}

function conceptRefs(service) {
  return aestheticConceptsForService(service.key).map((concept) => ref(absoluteUrl(`/kg/aesthetic-scope#${concept.key}`)));
}

function clusterDefinitions(service) {
  return [
    {
      key: 'overview',
      name: `${service.shortTitle || service.title} overview`,
      description: service.description || service.promise || service.title,
      about: [ref(serviceNodeId(service)), ref(absoluteUrl('/#physician')), ref(absoluteUrl('/#clinic'))]
    },
    {
      key: 'use-cases',
      name: `${service.shortTitle || service.title} use cases`,
      description: (service.useCases || []).join(' | '),
      about: [ref(serviceNodeId(service)), ...conceptRefs(service).slice(0, 8)]
    },
    {
      key: 'process',
      name: `${service.shortTitle || service.title} consultation and process`,
      description: (service.process || []).join(' | '),
      about: [ref(serviceNodeId(service)), ref(graphContactPointId()), ref(absoluteUrl('/#clinic'))]
    },
    {
      key: 'decision-criteria',
      name: `${service.shortTitle || service.title} decision criteria`,
      description: (service.decisionCriteria || []).join(' | '),
      about: [ref(serviceNodeId(service)), ref(absoluteUrl('/#physician')), ref(absoluteUrl('/kg/credential#irimc-167430'))]
    },
    {
      key: 'risk-signals',
      name: `${service.shortTitle || service.title} safety and risk signals`,
      description: (service.riskSignals || []).join(' | '),
      about: [ref(serviceNodeId(service)), ref(absoluteUrl('/#physician')), ref(absoluteUrl('/kg/medical-specialty#aesthetic-medicine'))]
    },
    {
      key: 'faq',
      name: `${service.shortTitle || service.title} FAQ`,
      description: (service.faq || []).map(([question]) => question).join(' | '),
      about: [ref(serviceNodeId(service)), ref(servicePageId(service))]
    },
    {
      key: 'related-concepts',
      name: `${service.shortTitle || service.title} related aesthetic concepts`,
      description: 'Knowledge-scope child concepts connected to the official service pillar.',
      about: [ref(serviceNodeId(service)), ...conceptRefs(service)]
    }
  ];
}

function buildBreadcrumb(path, name, parentPath = '/') {
  const items = parentPath && parentPath !== path
    ? [
        { position: 1, name: 'خانه', item: absoluteUrl('/') },
        { position: 2, name, item: absoluteUrl(path) }
      ]
    : [{ position: 1, name, item: absoluteUrl(path) }];

  return {
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId(path),
    itemListElement: items.map((item) => ({
      '@type': 'ListItem',
      position: item.position,
      name: item.name,
      item: item.item
    }))
  };
}

function buildServiceBreadcrumb(service) {
  return {
    '@type': 'BreadcrumbList',
    '@id': breadcrumbId(`/${service.slug}/`),
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'خانه', item: absoluteUrl('/') },
      { '@type': 'ListItem', position: 2, name: 'خدمات زیبایی', item: absoluteUrl(site.pages.services) },
      { '@type': 'ListItem', position: 3, name: service.title, item: serviceUrl(service) }
    ]
  };
}

function buildServicePageClusters(service) {
  return clusterDefinitions(service).map((cluster, index) => ({
    '@type': 'WebPageElement',
    '@id': pageClusterId(service, cluster.key),
    name: cluster.name,
    description: cluster.description || cluster.name,
    position: index + 1,
    isPartOf: ref(servicePageId(service)),
    about: cluster.about,
    mentions: [
      ref(serviceNodeId(service)),
      ref(offerId(service)),
      ref(officialOfferCatalogId()),
      ref(absoluteUrl('/#clinic')),
      ref(absoluteUrl('/#physician')),
      ref(kermanshahPlaceId())
    ]
  }));
}

export function buildPrimaryGraphPageClusterNodes() {
  const serviceList = {
    '@type': 'ItemList',
    '@id': serviceListId(),
    name: 'Official aesthetic service pillar list for Dr. Saeed Ghezelbash',
    numberOfItems: services.length,
    itemListElement: services.map((service, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: service.title,
      url: serviceUrl(service),
      item: ref(serviceNodeId(service))
    }))
  };

  const contactPage = {
    '@type': ['ContactPage', 'WebPage'],
    '@id': contactPageId(),
    url: absoluteUrl(site.pages.contact),
    name: 'تماس با کلینیک زیبایی دکتر سعید قزلباش',
    inLanguage: site.locale,
    isPartOf: ref(absoluteUrl('/#website')),
    mainEntity: ref(absoluteUrl('/#clinic')),
    about: [ref(absoluteUrl('/#clinic')), ref(absoluteUrl('/#physician')), ref(graphContactPointId())],
    mentions: [ref(absoluteUrl('/#dr-saeed-ghezelbash')), ref(kermanshahPlaceId()), ref(officialOfferCatalogId())],
    publisher: ref(absoluteUrl('/#clinic')),
    breadcrumb: ref(breadcrumbId(site.pages.contact)),
    potentialAction: [
      {
        '@type': 'ContactAction',
        name: 'Call Dr. Saeed Ghezelbash Aesthetic Clinic',
        target: `tel:${location.telephone}`,
        recipient: ref(absoluteUrl('/#clinic'))
      },
      {
        '@type': 'CommunicateAction',
        name: 'Message on Instagram',
        target: site.instagram,
        recipient: ref(absoluteUrl('/#clinic'))
      }
    ]
  };

  return [
    serviceList,
    contactPage,
    buildBreadcrumb('/', 'خانه', null),
    buildBreadcrumb(site.pages.person, site.personFa),
    buildBreadcrumb(site.pages.clinic, site.nameFa),
    buildBreadcrumb(site.pages.services, 'خدمات زیبایی'),
    buildBreadcrumb(site.pages.kg, 'Knowledge graph'),
    buildBreadcrumb(site.pages.contact, 'تماس'),
    ...services.map(buildServiceBreadcrumb),
    ...services.flatMap(buildServicePageClusters)
  ];
}

export function applyPrimaryGraphPageClusters(nodes) {
  const byId = new Map(nodes.map((node) => [node['@id'], node]).filter(([id]) => Boolean(id)));
  const website = byId.get(absoluteUrl('/#website'));
  const person = byId.get(absoluteUrl('/#dr-saeed-ghezelbash'));
  const physician = byId.get(absoluteUrl('/#physician'));
  const clinic = byId.get(absoluteUrl('/#clinic'));
  const dataset = byId.get(absoluteUrl('/kg/#dataset'));
  const servicesPage = byId.get(`${absoluteUrl(site.pages.services)}#webpage`);
  const kgPage = byId.get(`${absoluteUrl(site.pages.kg)}#webpage`);
  const personPage = byId.get(`${absoluteUrl(site.pages.person)}#webpage`);
  const clinicPage = byId.get(`${absoluteUrl(site.pages.clinic)}#webpage`);
  const contactPageRef = ref(contactPageId());
  const contactActions = [
    {
      '@type': 'ContactAction',
      name: 'Call official clinic phone number',
      target: `tel:${location.telephone}`,
      recipient: ref(absoluteUrl('/#clinic'))
    },
    {
      '@type': 'CommunicateAction',
      name: 'Contact through official Instagram',
      target: site.instagram,
      recipient: ref(absoluteUrl('/#clinic'))
    }
  ];

  if (website) {
    website.hasPart = appendRefs(website.hasPart, [contactPageRef, ...services.map((service) => ref(servicePageId(service)))]);
    website.potentialAction = appendRefs(website.potentialAction, contactActions);
  }

  if (person) {
    person.mainEntityOfPage = ref(`${absoluteUrl(site.pages.person)}#webpage`);
    person.potentialAction = appendRefs(person.potentialAction, contactActions);
  }

  if (physician) {
    physician.mainEntityOfPage = ref(`${absoluteUrl(site.pages.person)}#webpage`);
    physician.potentialAction = appendRefs(physician.potentialAction, contactActions);
  }

  if (clinic) {
    clinic.mainEntityOfPage = ref(`${absoluteUrl(site.pages.clinic)}#webpage`);
    clinic.potentialAction = appendRefs(clinic.potentialAction, contactActions);
    clinic.subjectOf = appendRefs(clinic.subjectOf, [contactPageRef]);
  }

  if (dataset) {
    dataset.mainEntityOfPage = ref(`${absoluteUrl(site.pages.kg)}#webpage`);
    dataset.hasPart = appendRefs(dataset.hasPart, [
      ref(serviceListId()),
      contactPageRef,
      ...services.map((service) => ref(servicePageId(service))),
      ...services.flatMap((service) => clusterDefinitions(service).map((cluster) => ref(pageClusterId(service, cluster.key)))),
      ...services.map((service) => ref(breadcrumbId(`/${service.slug}/`)))
    ]);
  }

  if (servicesPage) {
    servicesPage.hasPart = appendRefs(servicesPage.hasPart, [ref(serviceListId()), ...services.map((service) => ref(servicePageId(service)))]);
    servicesPage.breadcrumb = ref(breadcrumbId(site.pages.services));
  }

  if (kgPage) kgPage.breadcrumb = ref(breadcrumbId(site.pages.kg));
  if (personPage) personPage.breadcrumb = ref(breadcrumbId(site.pages.person));
  if (clinicPage) {
    clinicPage['@type'] = ['ProfilePage', 'AboutPage'];
    clinicPage.breadcrumb = ref(breadcrumbId(site.pages.clinic));
  }

  for (const service of services) {
    const serviceNode = byId.get(serviceNodeId(service));
    const pageNode = byId.get(servicePageId(service));
    const clusters = clusterDefinitions(service).map((cluster) => ref(pageClusterId(service, cluster.key)));
    const concepts = conceptRefs(service);

    if (pageNode) {
      pageNode['@type'] = ['WebPage', 'MedicalWebPage'];
      pageNode.mainEntity = ref(serviceNodeId(service));
      pageNode.mainEntityOfPage = ref(servicePageId(service));
      pageNode.breadcrumb = ref(breadcrumbId(`/${service.slug}/`));
      pageNode.hasPart = appendRefs(pageNode.hasPart, clusters);
      pageNode.about = appendRefs(pageNode.about, [ref(serviceNodeId(service)), ...concepts.slice(0, 16)]);
      pageNode.mentions = appendRefs(pageNode.mentions, [
        ref(offerId(service)),
        ref(officialOfferCatalogId()),
        ref(graphContactPointId()),
        ref(kermanshahPlaceId()),
        ...concepts.slice(0, 16)
      ]);
      pageNode.primaryImageOfPage = ref(graphDoctorImageId());
      pageNode.potentialAction = appendRefs(pageNode.potentialAction, contactActions);
    }

    if (serviceNode) {
      serviceNode.mainEntityOfPage = ref(servicePageId(service));
      serviceNode.isRelatedTo = appendRefs(serviceNode.isRelatedTo, concepts);
      serviceNode.about = appendRefs(serviceNode.about, concepts.slice(0, 16));
      serviceNode.subjectOf = appendRefs(serviceNode.subjectOf, [ref(servicePageId(service))]);
      serviceNode.hasPart = appendRefs(serviceNode.hasPart, clusters);
      serviceNode.potentialAction = appendRefs(serviceNode.potentialAction, contactActions);
    }

    for (const concept of aestheticConceptsForService(service.key)) {
      const conceptNode = byId.get(absoluteUrl(`/kg/aesthetic-scope#${concept.key}`));
      if (!conceptNode) continue;
      conceptNode.isRelatedTo = appendRefs(conceptNode.isRelatedTo, [ref(serviceNodeId(service))]);
      conceptNode.mainEntityOfPage = ref(servicePageId(service));
    }
  }

  return nodes;
}
