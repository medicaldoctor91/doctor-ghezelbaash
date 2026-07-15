import { site } from '~/domain/entities';
import { homepageEntityIds, homepageMainSectionIds } from '~/domain/homepage-sections';
import { homepageArticleSubsections } from '~/domain/homepage-subsections';
import { homepageServiceTargetByFragment } from '~/domain/homepage-service-targets.mjs';
import { personIdentityContract } from '~/domain/person-identity.mjs';

type Node = Record<string, any>;
type Graph = { '@context'?: unknown; '@graph'?: Node[] };

const id = (fragment: string) => `${site.url}#${fragment}`;
const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const uniqueStrings = (values: unknown[]) => [...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0))];
const hasType = (node: Node, type: string) => asArray(node?.['@type']).includes(type);

export function applyHomepageAuditFixes(input: Graph): Graph {
  const nodes = [...(input['@graph'] ?? [])];
  const byId = new Map(nodes.filter((node) => node?.['@id']).map((node) => [node['@id'], node]));
  const personId = id(homepageEntityIds.person);
  const clinicId = id(homepageEntityIds.clinic);
  const person = byId.get(personId);
  const clinic = byId.get(clinicId);
  const personSocials = [personIdentityContract.instagram, personIdentityContract.linkedin, personIdentityContract.facebook];
  const mapResources = new Set([site.maps, site.mapsSearch, site.openStreetMap]);

  if (person) person.sameAs = uniqueStrings([...asArray(person.sameAs), ...personSocials]);
  if (clinic) {
    clinic.sameAs = uniqueStrings(asArray<string>(clinic.sameAs).filter((url) => !personSocials.includes(url) && !mapResources.has(url)));
    clinic.hasMap = site.maps;
  }

  for (const socialUrl of personSocials) {
    const profile = byId.get(socialUrl);
    if (!profile) continue;
    profile.about = { '@id': personId };
    profile.mainEntity = { '@id': personId };
  }

  for (const node of nodes) {
    const nodeId = node?.['@id'];
    if (typeof nodeId === 'string' && nodeId.startsWith(`${site.url}#`)) {
      const fragment = nodeId.slice(`${site.url}#`.length);
      const target = homepageServiceTargetByFragment.get(fragment);
      if (target) {
        node.url = id(target);
        if (hasType(node, 'Service')) node.provider = { '@id': clinicId };
      }
    }
    if (hasType(node, 'OfferCatalog')) node.url = id('aesthetic-services-kermanshah');
    if (hasType(node, 'FAQPage')) node.url = id('aesthetic-faq-kermanshah-iran');
  }

  const validVisibleFragments = new Set([
    ...homepageMainSectionIds,
    ...homepageArticleSubsections.map((subsection: any) => subsection.id),
    homepageEntityIds.person,
    homepageEntityIds.clinic,
    homepageEntityIds.website,
    homepageEntityIds.webpage,
    'article',
    'content-table',
  ]);
  const legacyVisibleTargets = new Map([
    ['services', 'aesthetic-services-kermanshah'],
    ['search-intent-hub', 'best-aesthetic-doctor-kermanshah'],
    ['clinical-guide', 'aesthetic-treatment-selection'],
    ['videos', 'medical-research-and-education'],
    ['contact', 'sources-contact-and-appointment'],
  ]);

  const rewriteUrls = (value: any): any => {
    if (Array.isArray(value)) return value.map(rewriteUrls);
    if (!value || typeof value !== 'object') return value;
    const result: Node = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'url' && typeof item === 'string' && item.startsWith(`${site.url}#`)) {
        const fragment = item.slice(`${site.url}#`.length);
        const replacement = legacyVisibleTargets.get(fragment);
        result[key] = replacement ? id(replacement) : item;
      } else {
        result[key] = rewriteUrls(item);
      }
    }
    return result;
  };

  const rewritten = nodes.map(rewriteUrls);
  for (const node of rewritten) {
    if (typeof node?.url !== 'string' || !node.url.startsWith(`${site.url}#`)) continue;
    const fragment = node.url.slice(`${site.url}#`.length);
    if (!validVisibleFragments.has(fragment) && !fragment.startsWith('video-')) delete node.url;
  }

  return { '@context': input['@context'] ?? 'https://schema.org', '@graph': rewritten };
}
