import { jsonResponse } from '~/compilers/utils';
import {
  entityIdentity,
  physicianClinicRelationship,
  socialIdentityAssignment,
} from '~/domain/entity-identity';
import { site } from '~/domain/entities';

export const prerender = true;

export function GET() {
  return jsonResponse({
    schemaVersion: '1.0',
    canonical: site.url,
    updated: site.dateModified,
    purpose: 'Deterministic crosswalk for the separate physician and clinic entities, their Google identifiers, and their explicit relationship.',
    entities: entityIdentity,
    relationship: physicianClinicRelationship,
    socialIdentityAssignment,
    interpretationRules: {
      distinctEntities: true,
      googleMidPlacement: 'A Google /g/ MID is attached only to the entity it resolves.',
      cloudMidPlacement: 'The C-prefixed Cloud Enterprise Knowledge Graph MID is a separate namespace and is not used as a public sameAs URL.',
      socialProfilePlacement: 'Instagram is a strict sameAs of the clinic/local entity and remains an action/channel related to the physician.',
    },
  });
}
