import { site, absoluteUrl } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { breadcrumbsForPath } from './routes.mjs';

export function buildBreadcrumbList({ canonicalPath = '/', breadcrumbs } = {}) {
  const canonical = absoluteUrl(canonicalPath);
  const items = breadcrumbs || breadcrumbsForPath(canonicalPath);

  return {
    '@type': 'BreadcrumbList',
    '@id': `${canonical}#breadcrumb`,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path)
    }))
  };
}

export function buildWebPageSchema({
  title,
  description,
  canonicalPath = '/',
  pageType = 'WebPage'
} = {}) {
  const canonical = absoluteUrl(canonicalPath);
  return {
    '@type': pageType,
    '@id': `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: site.locale,
    isPartOf: { '@id': absoluteUrl('/#website') },
    breadcrumb: { '@id': `${canonical}#breadcrumb` }
  };
}

export function buildFaqSchema({ canonicalPath = '/', faqItems = [] } = {}) {
  const canonical = absoluteUrl(canonicalPath);
  return {
    '@type': 'FAQPage',
    '@id': `${canonical}#faq`,
    mainEntity: faqItems.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer
      }
    }))
  };
}

export function buildServiceSchema({ service, canonicalPath = `/${service.slug}/` } = {}) {
  const canonical = absoluteUrl(canonicalPath);

  return {
    '@type': 'Service',
    '@id': `${canonical}#service`,
    name: service.title,
    alternateName: [service.shortTitle, ...(service.intentExamples || [])].filter(Boolean),
    description: service.description,
    serviceType: service.shortTitle || service.title,
    url: canonical,
    provider: { '@id': absoluteUrl('/#clinic') },
    areaServed: {
      '@type': 'City',
      name: location.addressLocality || 'Kermanshah',
      addressCountry: site.country
    },
    audience: {
      '@type': 'Audience',
      audienceType: 'کاربران جست‌وجوی خدمات زیبایی در کرمانشاه'
    },
    subjectOf: {
      '@id': `${canonical}#webpage`
    }
  };
}

export function buildPageGraph({
  title,
  description,
  canonicalPath = '/',
  pageType = 'WebPage',
  breadcrumbs,
  extraGraph = []
} = {}) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildWebPageSchema({ title, description, canonicalPath, pageType }),
      buildBreadcrumbList({ canonicalPath, breadcrumbs }),
      ...extraGraph
    ]
  };
}
