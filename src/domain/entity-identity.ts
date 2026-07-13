import { site } from './entities';

export const entityIds = {
  physician: `${site.url}#person`,
  clinic: `${site.url}#clinic`,
} as const;

export const entityIdentity = {
  physician: {
    id: entityIds.physician,
    types: ['Person', 'IndividualPhysician'],
    identifiers: {
      wikidata: {
        namespace: 'Wikidata',
        value: site.doctorWikidataId,
        url: site.doctorWikidata,
      },
      googleKnowledgeGraph: {
        namespace: 'Google Knowledge Graph MID',
        value: site.doctorGoogleKnowledgeGraphId,
        url: site.doctorGoogleKnowledgeGraphUrl,
      },
      googleCloudKnowledgeGraph: {
        namespace: 'Google Cloud Enterprise Knowledge Graph MID',
        value: site.doctorCloudKnowledgeGraphMid,
      },
    },
  },
  clinic: {
    id: entityIds.clinic,
    types: ['MedicalClinic', 'LocalBusiness'],
    identifiers: {
      wikidata: {
        namespace: 'Wikidata',
        value: site.placeWikidataId,
        url: site.placeWikidata,
      },
      googleLocalKnowledgeGraph: {
        namespace: 'Google Local Knowledge Graph MID',
        value: site.clinicGoogleLocalKnowledgeGraphId,
        url: site.clinicGoogleLocalKnowledgeGraphUrl,
      },
      googlePlaceId: {
        namespace: 'Google Place ID',
        value: site.googlePlaceId,
        url: site.mapsSearch,
      },
      googleCid: {
        namespace: 'Google Maps CID',
        value: site.googleCid,
        url: site.maps,
      },
      openStreetMapNode: {
        namespace: 'OpenStreetMap node',
        value: site.openStreetMapNode,
        url: site.openStreetMap,
      },
    },
  },
} as const;

/**
 * Schema.org-valid, bidirectional physician-clinic linkage.
 * `worksFor`/`employee` is the primary inverse pair; `workLocation` states the
 * physical practice location without conflating the Person and LocalBusiness.
 */
export const physicianClinicRelationship = {
  subject: entityIds.physician,
  predicate: 'worksFor',
  predicateUrl: 'https://schema.org/worksFor',
  object: entityIds.clinic,
  inverse: {
    subject: entityIds.clinic,
    predicate: 'employee',
    predicateUrl: 'https://schema.org/employee',
    object: entityIds.physician,
  },
  supporting: [
    {
      subject: entityIds.physician,
      predicate: 'workLocation',
      predicateUrl: 'https://schema.org/workLocation',
      object: entityIds.clinic,
    },
    {
      subject: entityIds.physician,
      predicate: 'affiliation',
      predicateUrl: 'https://schema.org/affiliation',
      object: entityIds.clinic,
    },
  ],
} as const;

export const socialIdentityAssignment = {
  url: site.instagram,
  sameAsEntity: entityIds.clinic,
  relatedPhysician: entityIds.physician,
  relationship: 'official-communication-and-portfolio-channel',
  rationale: 'Google social-profile attribution was observed on the Local Knowledge Graph entity.',
} as const;
