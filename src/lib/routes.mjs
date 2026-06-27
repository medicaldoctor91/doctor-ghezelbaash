import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';

export function normalizePath(path = '/') {
  if (!path || path === '') return '/';
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

export const coreRoutes = [
  { path: '/', label: 'خانه', kind: 'home', priority: '1.0' },
  { path: site.pages.person, label: 'دکتر سعید قزلباش', kind: 'person', priority: '0.95' },
  { path: site.pages.clinic, label: 'کلینیک زیبایی دکتر سعید قزلباش', kind: 'clinic', priority: '0.90' },
  { path: site.pages.services, label: 'خدمات زیبایی در کرمانشاه', kind: 'services-hub', priority: '0.90' },
  { path: site.pages.contact, label: 'تماس و مسیر مراجعه', kind: 'contact', priority: '0.80' },
  { path: site.pages.evidence, label: 'شواهد و منابع', kind: 'evidence', priority: '0.72' },
  { path: site.pages.kg, label: 'گراف دانش', kind: 'knowledge-graph', priority: '0.72' },
  { path: '/aesthetic-medicine-dataset.html', label: 'داده‌ست پزشکی زیبایی', kind: 'dataset', priority: '0.60' },
  { path: '/google-maps-review-evidence.html', label: 'شواهد Google Maps', kind: 'evidence-asset', priority: '0.60' }
];

export const serviceRoutes = services.map((service) => ({
  path: `/${service.slug}/`,
  label: service.title,
  kind: 'service',
  priority: '0.86',
  service
}));

export const routeRegistry = [...coreRoutes, ...serviceRoutes].map((route) => ({
  ...route,
  path: normalizePath(route.path),
  url: absoluteUrl(route.path)
}));

export const navRoutes = [
  '/',
  site.pages.person,
  site.pages.clinic,
  site.pages.services,
  site.pages.evidence,
  site.pages.kg,
  site.pages.contact
].map((path) => routeRegistry.find((route) => route.path === normalizePath(path))).filter(Boolean);

export function getRouteByPath(path = '/') {
  const normalized = normalizePath(path);
  return routeRegistry.find((route) => route.path === normalized) || {
    path: normalized,
    url: absoluteUrl(normalized),
    label: normalized.replaceAll('/', '').replaceAll('-', ' ') || site.nameFa,
    kind: 'page',
    priority: '0.60'
  };
}

export function routeLabelForPath(path = '/') {
  return getRouteByPath(path).label;
}

export function priorityForPath(path = '/') {
  return getRouteByPath(path).priority;
}

export function breadcrumbsForPath(path = '/') {
  const route = getRouteByPath(path);
  if (route.path === '/') return [{ name: route.label, path: '/' }];

  if (route.kind === 'service') {
    return [
      { name: routeLabelForPath('/'), path: '/' },
      { name: routeLabelForPath(site.pages.services), path: site.pages.services },
      { name: route.label, path: route.path }
    ];
  }

  return [
    { name: routeLabelForPath('/'), path: '/' },
    { name: route.label, path: route.path }
  ];
}
