import { site } from '../data/site.mjs';
import { breadcrumbsForPath, normalizePath, routeRegistry, serviceRoutes } from './routes.mjs';

export function schemaTargetsForKind(kind) {
  if (kind === 'person') return ['ProfilePage', 'BreadcrumbList', 'Person', 'Physician'];
  if (kind === 'clinic') return ['WebPage', 'BreadcrumbList', 'MedicalClinic', 'MedicalBusiness', 'LocalBusiness', 'Physician'];
  if (kind === 'services-hub') return ['WebPage', 'BreadcrumbList', 'ItemList'];
  if (kind === 'service') return ['WebPage', 'BreadcrumbList', 'Service', 'FAQPage'];
  return ['WebPage', 'BreadcrumbList'];
}

export function conversionTargetForKind(kind) {
  if (kind === 'service') return site.instagram;
  if (kind === 'contact') return site.phoneE164;
  return site.pages.contact;
}

export function localIntentForKind(kind) {
  return ['clinic', 'services-hub', 'service', 'contact'].includes(kind);
}

function uniquePaths(paths) {
  return [...new Set(paths.map(normalizePath))];
}

export function outgoingLinksForRoute(route) {
  if (route.kind === 'service') {
    return uniquePaths([
      site.pages.person,
      site.pages.clinic,
      site.pages.services,
      site.pages.evidence,
      site.pages.contact
    ]);
  }

  if (route.kind === 'services-hub') {
    return uniquePaths([
      ...serviceRoutes.map((serviceRoute) => serviceRoute.path),
      site.pages.person,
      site.pages.clinic,
      site.pages.evidence,
      site.pages.contact
    ]);
  }

  if (route.kind === 'person') {
    return uniquePaths([
      site.pages.clinic,
      site.pages.services,
      site.pages.evidence,
      site.pages.kg,
      site.pages.contact,
      ...serviceRoutes.map((serviceRoute) => serviceRoute.path)
    ]);
  }

  if (route.kind === 'clinic') {
    return uniquePaths([
      site.pages.person,
      site.pages.services,
      site.pages.evidence,
      site.pages.kg,
      site.pages.contact,
      ...serviceRoutes.map((serviceRoute) => serviceRoute.path)
    ]);
  }

  if (route.kind === 'evidence' || route.kind === 'knowledge-graph') {
    return uniquePaths([
      '/',
      site.pages.person,
      site.pages.clinic,
      site.pages.services,
      site.pages.contact
    ]);
  }

  return uniquePaths([
    site.pages.person,
    site.pages.clinic,
    site.pages.services,
    site.pages.contact
  ]);
}

export function pageContextForRoute(route) {
  return {
    path: route.path,
    url: route.url,
    label: route.label,
    kind: route.kind,
    priority: route.priority,
    localIntent: localIntentForKind(route.kind),
    schemaTargets: schemaTargetsForKind(route.kind),
    breadcrumbs: breadcrumbsForPath(route.path),
    outgoingLinks: outgoingLinksForRoute(route),
    conversionTarget: conversionTargetForKind(route.kind),
    serviceKey: route.service?.key || null,
    serviceSlug: route.service?.slug || null
  };
}

export const pageContexts = routeRegistry.map(pageContextForRoute);
