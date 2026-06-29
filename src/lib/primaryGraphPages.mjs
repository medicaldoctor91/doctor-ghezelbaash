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

function contactActions() {
  return [
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

export function buildPrimaryGraphPageNodes() {
  return [
    {
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
    },
    {
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
      potentialAction: contactActions()
    },
    buildBreadcrumb('/', 'خانه', null),
    buildBreadcrumb(site.pages.person, site.personFa),
    buildBreadcrumb(site.pages.clinic, site.nameFa),
    buildBreadcrumb(site.pages.services, 'خدمات زیبایی'),
    buildBreadcrumb(site.pages.kg, 'Knowledge graph'),
    buildBreadcrumb(site.pages.contact, 'تماس'),
    ...services.map(buildServiceBreadcrumb)
  ];
}

export function applyPrimaryGraphPages(nodes) {
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
  const actions = contactActions();

  if (website) {
    website.hasPart = appendRefs(website.hasPart, [contactPageRef, ...services.map((service) => ref(servicePageId(service)))]);
    website.potentialAction = appendRefs(website.potentialAction, actions);
  }

  if (person) {
    person.mainEntityOfPage = ref(`${absoluteUrl(site.pages.person)}#webpage`);
    person.potentialAction = appendRefs(person.potentialAction, actions);
  }

  if (physician) {
    physician.mainEntityOfPage = ref(`${absoluteUrl(site.pages.person)}#webpage`);
    physician.potentialAction = appendRefs(physician.potentialAction, actions);
  }

  if (clinic) {
    clinic.mainEntityOfPage = ref(`${absoluteUrl(site.pages.clinic)}#webpage`);
    clinic.potentialAction = appendRefs(clinic.potentialAction, actions);
    clinic.subjectOf = appendRefs(clinic.subjectOf, [contactPageRef]);
  }

  if (dataset) {
    dataset.mainEntityOfPage = ref(`${absoluteUrl(site.pages.kg)}#webpage`);
    dataset.hasPart = appendRefs(dataset.hasPart, [
      ref(serviceListId()),
      contactPageRef,
      ...services.map((service) => ref(servicePageId(service))),
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
    const concepts = conceptRefs(service);

    if (pageNode) {
      pageNode['@type'] = ['WebPage', 'MedicalWebPage'];
      pageNode.mainEntity = ref(serviceNodeId(service));
      pageNode.mainEntityOfPage = ref(servicePageId(service));
      pageNode.breadcrumb = ref(breadcrumbId(`/${service.slug}/`));
      pageNode.about = appendRefs(pageNode.about, [ref(serviceNodeId(service)), ...concepts.slice(0, 16)]);
      pageNode.mentions = appendRefs(pageNode.mentions, [
        ref(offerId(service)),
        ref(officialOfferCatalogId()),
        ref(graphContactPointId()),
        ref(kermanshahPlaceId()),
        ...concepts.slice(0, 16)
      ]);
      pageNode.primaryImageOfPage = ref(graphDoctorImageId());
      pageNode.potentialAction = appendRefs(pageNode.potentialAction, actions);
    }

    if (serviceNode) {
      serviceNode.mainEntityOfPage = ref(servicePageId(service));
      serviceNode.about = appendRefs(serviceNode.about, concepts.slice(0, 16));
      serviceNode.subjectOf = appendRefs(serviceNode.subjectOf, [ref(servicePageId(service))]);
      serviceNode.potentialAction = appendRefs(serviceNode.potentialAction, actions);
    }

    for (const concept of aestheticConceptsForService(service.key)) {
      const conceptNode = byId.get(absoluteUrl(`/kg/aesthetic-scope#${concept.key}`));
      if (conceptNode) conceptNode.mainEntityOfPage = ref(servicePageId(service));
    }
  }

  return nodes;
}
