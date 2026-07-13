import { site } from '../data/site';
import { entityIdentity, physicianClinicRelationship } from '../domain/entity-identity';
// @ts-expect-error Shared ESM authority data.
import { allAuthorityClaims, evidenceSources } from '../data/authority.mjs';
// @ts-expect-error Shared ESM national authority data.
import { authorityNetwork, editorialReview, nationalAuthoritySignals } from '../data/national-authority.mjs';

export const prerender = true;

export function GET() {
  const evidenceByUrl = new Map(evidenceSources.map((source: { url: string }) => [source.url, source]));
  const nodes = authorityNetwork.map((node: { id: string; url: string; entity: string; role: string; evidenceTier: number; layer: string; label: string; name: string }) => {
    const evidence = evidenceByUrl.get(node.url) as { id?: string } | undefined;
    const entityIds = node.entity === 'clinic'
      ? [`${site.url}#clinic`]
      : node.entity === 'physician-clinic'
        ? [`${site.url}#person`, `${site.url}#clinic`]
        : [`${site.url}#person`];
    const supportsClaimIds = evidence?.id
      ? allAuthorityClaims
        .filter((claim: { evidenceIds: string[] }) => claim.evidenceIds.includes(evidence.id as string))
        .map((claim: { id: string }) => claim.id)
      : [];
    return {
      ...node,
      nodeId: `${site.url}#authority-source-${node.id}`,
      entityIds,
      evidenceSourceId: evidence?.id,
      supportsClaimIds,
      canonicalEntityRelationship: physicianClinicRelationship,
      authorityContribution: node.entity === 'clinic'
        ? 'تقویت انتیتی لوکیشن و انتقال سیگنال مکان/بازخورد عمومی به رابطهٔ پزشک–کلینیک'
        : node.entity === 'physician-clinic'
          ? 'حل هم‌زمان انتیتی پزشک و کلینیک در منابع عمومی و ماشین‌خوان'
          : 'حل، تفکیک و تقویت انتیتی پزشک در شبکهٔ عمومی وب',
    };
  });

  return new Response(JSON.stringify({
    schemaVersion: '7.0',
    canonical: site.url,
    updated: site.dateModified,
    name: 'شبکهٔ عمومی اتوریتی دکتر سعید قزلباش و کلینیک',
    primaryEntities: entityIdentity,
    relationship: physicianClinicRelationship,
    editorialResponsibility: editorialReview,
    signals: nationalAuthoritySignals,
    nodeCount: nodes.length,
    layers: [...new Set(nodes.map((node: { layer: string }) => node.layer))],
    policy: 'هر گره فقط با نقش و دامنهٔ اثبات خودش استفاده می‌شود و تمام مسیرها به انتیتی پزشک، کلینیک یا رابطهٔ مستقیم آن‌ها بازمی‌گردند.',
    nodes,
  }, null, 2), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
