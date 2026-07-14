import { site } from '../domain/entities';
import { priorityIntentAnswers } from '../domain/priority-intent-answers.mjs';
// @ts-expect-error Shared ESM physician identity contract.
import { personIdentityContract } from '../domain/person-identity.mjs';

export const prerender = true;

export function GET() {
  const priorityAnswers = priorityIntentAnswers.map((item: { question: string; answer: string; id: string }) =>
    `### ${item.question}\n\n${item.answer}\n\nSource passage: ${site.url}#${item.id}`,
  ).join('\n\n');

  const body = `# ${site.name}

> Physician-first Persian website for ${site.legalName}, medical registration ${site.irimc}, practicing in ${site.city}, Iran. The canonical homepage is the single indexable entity landing page and covers local-to-national aesthetic search intents.

## Canonical resources

- [Canonical profile and medical page](${site.url}): The homepage is both a MedicalWebPage and ProfilePage with the physician as its sole main entity.
- [Canonical knowledge graph](${site.url}knowledge-graph.jsonld): Self-contained JSON-LD graph discovered from HTML and HTTP with rel="describedby".
- [Physician entity](${site.url}#person): Sole main entity of the canonical homepage.
- [Clinic entity](${site.url}#clinic): Separate MedicalClinic and LocalBusiness entity; employer, work location, provider, publisher and reputation/location source.
- [Clinic reputation passage](${site.url}#clinic-reputation): Visible dated Google Maps reputation evidence connected to the clinic and supporting the physician relationship.
- [Priority answer hub](${site.url}#search-intent-hub): Independent answer-first passages for local and national doctor-selection and treatment intents.
- [Clinical article](${site.url}#clinical-guide): Full Persian medical-aesthetic article with contextual photographs and videos.
- [Published Hugging Face dataset](${site.huggingFaceDataset}): Separate Dataset about the physician and clinic; created by the physician and published by the clinic. It is not an alternate identity URL for the Person.

## Physician identity

- Legal name: ${site.legalName}
- Professional name: ${site.name}
- Medical registration (IRIMC): ${site.irimc}
- Canadian MINC: ${personIdentityContract.minc}
- City: ${site.city}
- National geography scope: Iran
- Postal code: ${site.postalCode}
- ORCID: ${site.orcidUrl}
- Wikidata: ${site.doctorWikidata}
- Hugging Face profile: ${site.huggingFaceProfile}
- Google Knowledge Graph MID: ${site.doctorGoogleKnowledgeGraphId}
- MyNCBI bibliography: ${personIdentityContract.ncbiBibliography}
- Pinterest: ${personIdentityContract.pinterest}
- IRIMC verification: ${site.irimcVerification}

## Clinic reputation and location

- Clinic: ${site.clinicName}
- Relationship: separate clinic entity; employer and work location of the physician, provider of offered services.
- Google Maps rating snapshot: ${site.googleBusinessProfile.ratingValue}/${site.googleBusinessProfile.bestRating}
- Google Maps rating count snapshot: ${site.googleBusinessProfile.ratingCount}
- Snapshot observed at: ${site.googleBusinessProfile.observedAt}
- Source: ${site.googleBusinessProfile.sourceUrl}
- Address: ${site.address}
- The rating belongs to the clinic. It supports location, public experience and prominence; it is not a physician credential and does not guarantee treatment outcomes.

## Clinic social profiles

- Instagram: ${personIdentityContract.instagram}
- LinkedIn: ${personIdentityContract.linkedin}
- Facebook: ${personIdentityContract.facebook}

## Service relationship semantics

- \`offered\` means available through the clinic after assessment.
- \`evaluated\` means suitability and pathway are assessed before choosing an intervention.
- \`referral-context\` means the surgical or specialist topic is covered for comparison, boundary recognition and referral; it is not claimed as an offered clinic service.
- Surgical and non-surgical topics coexist on the homepage without converting referral-context topics into false service claims.

## Priority answer passages

${priorityAnswers}

## Media and answer coverage

- Photographs and all twelve videos are embedded contextually in the canonical homepage article.
- The videos are supporting visual evidence and educational media; they do not create separate canonical watch pages.
- A closed-by-default disclosure contains visible HTML answers for انتخاب بهترین پزشک زیبایی در کرمانشاه and service-specific doctor queries.
- Six expanded answer-first passages remain fully visible and address local reputation, national selection, cost, surgical boundaries and correction after previous treatment.

## Interpretation

- The canonical visible HTML is authoritative.
- The homepage is both MedicalWebPage and ProfilePage; the physician remains the sole mainEntity.
- The clinic remains a separate provider, publisher, employer, work location and reputation entity.
- The clinic rating is attached to Clinic.aggregateRating and a dated reputation Dataset; the Dataset mentions the physician through the real doctor-clinic relationship.
- The Hugging Face profile is an external profile of the physician; the Hugging Face dataset is a separate Dataset about the physician and clinic.
`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
