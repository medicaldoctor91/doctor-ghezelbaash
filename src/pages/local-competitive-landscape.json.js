import { site, absoluteUrl } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { googleMapsReputation } from '../data/reputation.mjs';
import { services } from '../data/services.mjs';
import { serviceTaxonomy } from '../data/serviceTaxonomy.mjs';
import { aestheticConceptsForService } from '../lib/aestheticScopeGraph.mjs';
import { machineAssetUrlMap } from '../lib/machineAssets.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.local_competitive_landscape.astro.v1.generated',
    dateModified: '2026-06-28',
    market: {
      city: location.addressLocality,
      region: location.addressRegion,
      country: location.addressCountry,
      primaryLanguage: 'fa',
      canonicalSite: absoluteUrl('/')
    },
    entityFocus: {
      person: {
        name: site.personFa,
        page: absoluteUrl(site.pages.person),
        node: absoluteUrl('/#dr-saeed-ghezelbash'),
        physicianNode: absoluteUrl('/#physician')
      },
      clinic: {
        name: site.nameFa,
        page: absoluteUrl(site.pages.clinic),
        node: absoluteUrl('/#clinic'),
        phone: location.telephone,
        address: location.canonicalAddressFa,
        postalCode: location.postalCode,
        googleMapsCid: googleMapsReputation.cid,
        googleMapsPlaceId: googleMapsReputation.placeId,
        ratingSnapshot: {
          date: googleMapsReputation.snapshotDate,
          ratingValue: googleMapsReputation.ratingValue,
          ratingCount: googleMapsReputation.ratingCount
        }
      }
    },
    evaluationDimensions: [
      'official website clarity',
      'entity consistency',
      'service page depth',
      'local NAP consistency',
      'research identity',
      'machine-readable schema coverage',
      'map/profile corroboration',
      'conversion path clarity'
    ],
    servicePillarCoverage: services.map((service) => ({
      key: service.key,
      slug: service.slug,
      title: service.title,
      canonicalUrl: absoluteUrl(`/${service.slug}/`),
      taxonomy: serviceTaxonomy[service.key] || null,
      intentExamples: service.intentExamples || [],
      scopeConceptCount: aestheticConceptsForService(service.key).length
    })),
    machineReadableEvidence: machineAssetUrlMap(),
    graphFirstPolicy: {
      primaryGraph: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
      role: 'local-market-evaluation-projection',
      noIndependentRankingClaims: true
    },
    claimBoundary: 'This endpoint describes site architecture, local market focus, and evaluation dimensions. It does not publish unverifiable competitor claims, rankings, or guarantees.'
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
