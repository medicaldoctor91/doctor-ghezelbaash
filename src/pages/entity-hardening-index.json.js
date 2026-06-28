import { site, absoluteUrl } from '../data/site.mjs';
import { location } from '../data/location.mjs';
import { publicDataset } from '../data/dataset.mjs';
import { authoritySignals } from '../data/authoritySignals.mjs';
import {
  entityCrosswalkDatasetId,
  entityRelationTermSetId,
  wikidataLikeRelationMappings
} from '../lib/entityCrosswalk.mjs';
import { machineAssetUrlMap } from '../lib/machineAssets.mjs';
import { scholarlyArticleReferences } from '../lib/researchGraph.mjs';
import {
  getMapUrlsForClinic,
  getSameAsForEntity,
  getSubjectOfForEntity
} from '../lib/sourceClassifier.mjs';

export function GET() {
  const body = {
    schema: 'ghezelbaash.entity_hardening.astro.v2.crosswalk_projection',
    canonicalWebsite: site.canonicalBase + '/',
    primaryGraph: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
    entities: {
      person: absoluteUrl('/#dr-saeed-ghezelbash'),
      physician: absoluteUrl('/#physician'),
      clinic: absoluteUrl('/#clinic'),
      dataset: absoluteUrl('/kg/#dataset'),
      crosswalk: entityCrosswalkDatasetId(),
      relationSet: entityRelationTermSetId()
    },
    relationshipCrosswalk: wikidataLikeRelationMappings.map((mapping) => ({
      key: mapping.key,
      schemaProperty: mapping.schemaProperty
    })),
    sourceContract: {
      personSameAs: getSameAsForEntity(authoritySignals, 'person', site.sameAs.person),
      clinicSameAs: getSameAsForEntity(authoritySignals, 'clinic', site.sameAs.clinic),
      knowledgeGraphSameAs: getSameAsForEntity(authoritySignals, 'knowledgeGraph', site.sameAs.kg),
      personSubjectOf: getSubjectOfForEntity(authoritySignals, 'person'),
      clinicSubjectOf: getSubjectOfForEntity(authoritySignals, 'clinic'),
      clinicMaps: getMapUrlsForClinic(authoritySignals, location)
    },
    researchNodes: scholarlyArticleReferences(),
    dataset: {
      doi: publicDataset.doi,
      graph: absoluteUrl('/graph-ghezelbaash-final.jsonld'),
      manifest: absoluteUrl('/dataset-manifest.jsonld')
    },
    machineAssets: machineAssetUrlMap()
  };

  return new Response(JSON.stringify(body, null, 2) + '\n', {
    headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}
