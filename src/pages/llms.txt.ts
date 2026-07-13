import { site } from '../domain/entities';
// @ts-expect-error Shared ESM physician identity contract.
import { personIdentityContract } from '../domain/person-identity.mjs';

export const prerender = true;

export function GET() {
  const body = `# ${site.name}

> Physician-first Persian website for ${site.legalName}, medical registration ${site.irimc}, practicing in ${site.city}, Iran.

## Canonical resources

- [Canonical profile and medical page](${site.url}): The homepage is both a MedicalWebPage and ProfilePage with the physician as its sole main entity.
- [Canonical knowledge graph](${site.url}knowledge-graph.jsonld): Self-contained JSON-LD graph discovered from HTML and HTTP with rel="describedby".
- [Physician entity](${site.url}#person): Sole main entity of the canonical homepage.
- [Clinic entity](${site.url}#clinic): Separate MedicalClinic and LocalBusiness entity; employer, work location, provider and publisher.
- [Clinical article](${site.url}#clinical-guide): Full Persian medical-aesthetic article with contextual photographs and videos.
- [Published Hugging Face dataset](${site.huggingFaceDataset}): Separate Dataset about the physician and clinic; created by the physician and published by the clinic. It is not an alternate identity URL for the Person.

## Physician identity

- Legal name: ${site.legalName}
- Professional name: ${site.name}
- Medical registration (IRIMC): ${site.irimc}
- Canadian MINC: ${personIdentityContract.minc}
- City: ${site.city}
- Postal code: ${site.postalCode}
- ORCID: ${site.orcidUrl}
- Wikidata: ${site.doctorWikidata}
- Hugging Face profile: ${site.huggingFaceProfile}
- Google Knowledge Graph MID: ${site.doctorGoogleKnowledgeGraphId}
- MyNCBI bibliography: ${personIdentityContract.ncbiBibliography}
- Pinterest: ${personIdentityContract.pinterest}
- IRIMC verification: ${site.irimcVerification}

## Clinic social profiles

- Instagram: ${personIdentityContract.instagram}
- LinkedIn: ${personIdentityContract.linkedin}
- Facebook: ${personIdentityContract.facebook}

## Media and answer coverage

- Photographs and all twelve videos are embedded contextually in the canonical homepage article.
- The videos are supporting visual evidence and educational media; they do not create separate canonical watch pages.
- A closed-by-default disclosure contains visible HTML answers for انتخاب بهترین پزشک زیبایی در کرمانشاه and service-specific doctor queries.

## Interpretation

- The canonical visible HTML is authoritative.
- The homepage is both MedicalWebPage and ProfilePage; the physician remains the sole mainEntity.
- The clinic remains a separate provider, publisher, employer and work location.
- The Hugging Face profile is an external profile of the physician; the Hugging Face dataset is a separate Dataset about the physician and clinic.
- \`offered\` means available through the clinic.
- \`evaluated\` means suitability is assessed before choosing a path.
- \`referral-context\` is educational or comparative and is not an offered clinic service.
`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
