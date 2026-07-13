import { site } from '../domain/entities';
// @ts-expect-error Shared ESM physician identity contract.
import { personIdentityContract } from '../domain/person-identity.mjs';

export const prerender = true;

export function GET() {
  const body = `# ${site.name}

> Physician-first Persian website for ${site.legalName}, medical registration ${site.irimc}, practicing in ${site.city}, Iran.

## Canonical resources

- [Canonical page](${site.url}): Complete visible physician, clinic, service, video and clinical-guide content.
- [Canonical knowledge graph](${site.url}knowledge-graph.jsonld): Self-contained JSON-LD graph discovered from HTML and HTTP with rel="describedby".
- [Physician entity](${site.url}#person): Sole main entity of the canonical MedicalWebPage.
- [Clinic entity](${site.url}#clinic): Separate MedicalClinic and LocalBusiness entity; employer, work location, provider and publisher.
- [Clinical guide](${site.url}#clinical-guide): Full Persian decision guide for aesthetic medicine, skin and hair.
- [Videos](${site.url}#videos): Twelve first-party videos embedded on the canonical page.

## Identity

- Legal name: ${site.legalName}
- Professional name: ${site.name}
- Medical registration (IRIMC): ${site.irimc}
- Canadian MINC: ${personIdentityContract.minc}
- City: ${site.city}
- ORCID: ${site.orcidUrl}
- Wikidata: ${site.doctorWikidata}
- Google Knowledge Graph MID: ${site.doctorGoogleKnowledgeGraphId}
- MyNCBI bibliography: ${personIdentityContract.ncbiBibliography}
- LinkedIn: ${personIdentityContract.linkedin}
- IRIMC verification: ${site.irimcVerification}

## Interpretation

- The canonical visible HTML is authoritative.
- The physician is the sole main entity; the clinic remains a separate provider, publisher, employer and work location.
- \`offered\` means available through the clinic.
- \`evaluated\` means suitability is assessed before choosing a path.
- \`referral-context\` is educational or comparative and is not an offered clinic service.
`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
