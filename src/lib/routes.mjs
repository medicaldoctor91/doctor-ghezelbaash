import { site, absoluteUrl } from '../data/site.mjs';
import { services } from '../data/services.mjs';

export function normalizePath(path = '/') {
  if (!path || path === '') return '/';
  const value = path.startsWith('/') ? path : `/${path}`;
  if (value === '/') return '/';
  return value.endsWith('/') ? value : `${value}/`;
}

export const coreRoutes = [
  { path: '/', label: 'خانه', kind: 'home', priority: '1.0' },
  { path: '/about/', label: 'درباره دکتر و کلینیک', kind: 'profile', priority: '0.95' },
  { path: '/services/', label: 'خدمات زیبایی', kind: 'services-hub', priority: '0.90' },
  { path: '/contact/', label: 'تماس و مسیر مراجعه', kind: 'contact', priority: '0.85' }
];

export const serviceRoutes = services.map((service) => ({
  path: `/${service.slug}/`,
  label: service.title,
  kind: 'service',
  priority: '0.90',
  service
}));

export const routeRegistry = [...coreRoutes, ...serviceRoutes].map((route) => {
  const path = normalizePath(route.path);
  return { ...route, path, url: absoluteUrl(path) };
});

export const navRoutes = ['/', '/about/', '/services/', '/contact/']
  .map((path) => routeRegistry.find((route) => route.path === normalizePath(path)))
  .filter(Boolean);

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
      { name: routeLabelForPath('/services/'), path: '/services/' },
      { name: route.label, path: route.path }
    ];
  }
  return [
    { name: routeLabelForPath('/'), path: '/' },
    { name: route.label, path: route.path }
  ];
}
