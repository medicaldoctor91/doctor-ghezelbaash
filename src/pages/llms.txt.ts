import { site } from '../domain/entities';
import { homepageGraphSyncContract } from '../domain/homepage-graph-sync.mjs';
import { priorityIntentAnswers } from '../domain/priority-intent-answers.mjs';
// @ts-expect-error Shared ESM physician identity contract.
import { personIdentityContract } from '../domain/person-identity.mjs';

export const prerender = true;

export function GET() {
  const priorityAnswers = priorityIntentAnswers.map((item: { question: string; answer: string; id: string }) =>
    `### ${item.question}\n\n${item.answer}\n\nSource passage: ${site.url}#${item.id}`,
  ).join('\n\n');
  const personUri = `${site.url}#${homepageGraphSyncContract.entities.person}`;
  const clinicUri = `${site.url}#${homepageGraphSyncContract.entities.clinic}`;

  const body = `# ${site.name}

> Physician-first Persian website for ${site.legalName}, medical registration ${site.irimc}, practicing in ${site.city}, Iran. The canonical Homepage is the single indexable entity landing page and its visible HTML is the primary source of truth.

## Canonical resources

- [Canonical profile and medical page](${site.url}): MedicalWebPage and ProfilePage with the physician as its sole Homepage mainEntity.
- [Canonical knowledge graph](${site.url}knowledge-graph.jsonld): JSON-LD graph synchronized field-by-field with the visible Homepage and discovered through HTML and HTTP rel="describedby".
- [Physician entity](${personUri}): Canonical Person URI and sole mainEntity of the Homepage.
- [Clinic entity](${clinicUri}): Separate MedicalClinic and LocalBusiness URI; employer, work location, provider, publisher and location/reputation entity.
- [Content table](${site.url}#${homepageGraphSyncContract.toc.id}): Crawlable ordered index of all sixteen canonical H2 sections.
- [Clinic information](${site.url}#clinic-information-kermanshah): Visible clinic name, address, phone, hours, dated Google Maps rating evidence, location sources and the patient testimonial video.
- [Medical research and education](${site.url}#medical-research-and-education): Research identifiers, publications and two physician-education videos.
- [Knowledge graph and datasets](${site.url}#knowledge-graph-and-datasets): Existing machine-readable resources; no parallel per-service or per-section graph files.
- [Published Hugging Face dataset](${site.huggingFaceDataset}): Separate Dataset about the physician and clinic; it is not an alternate Person identity URL.

## Homepage identity contract

- H1 / WebPage name / WebPage headline: ${homepageGraphSyncContract.headline}
- Person URI: ${personUri}
- Clinic URI: ${clinicUri}
- WebSite URI: ${site.url}#${homepageGraphSyncContract.entities.website}
- WebPage URI: ${site.url}#${homepageGraphSyncContract.entities.webpage}
- Person is the sole Homepage mainEntity.
- Clinic remains a separate provider, publisher, employer, work location and reputation/location entity.
- Google Maps is represented through Clinic.hasMap and is not Clinic.sameAs.

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
- Relationship: separate Clinic entity; employer and work location of the physician and provider of offered services.
- Google Maps rating snapshot: ${site.googleBusinessProfile.ratingValue}/${site.googleBusinessProfile.bestRating}
- Google Maps rating/review count snapshot: ${site.googleBusinessProfile.ratingCount}
- Snapshot observed at: ${site.googleBusinessProfile.observedAt}
- Source: ${site.googleBusinessProfile.sourceUrl}
- Address: ${site.address}
- The rating belongs to the Clinic. It describes public visitor experience and location prominence; it is not a physician credential and does not guarantee treatment outcomes.

## Official physician profiles

- Instagram: ${personIdentityContract.instagram}
- LinkedIn: ${personIdentityContract.linkedin}
- Facebook: ${personIdentityContract.facebook}

## Service relationship semantics

- \`offered\` means available through the Clinic after assessment.
- \`evaluated\` means suitability and pathway are assessed before choosing an intervention.
- \`referral-context\` means the surgical or specialist topic is covered for comparison, boundary recognition and referral; it is not claimed as an offered Clinic service.
- Surgical and non-surgical topics coexist on the Homepage without converting referral-context topics into false service claims.

## Priority answer passages

${priorityAnswers}

## Media and visible coverage

- Twelve VideoObject nodes correspond to twelve visible contextual videos on the canonical Homepage.
- Eleven videos are embedded in their explicitly registered medical H2/H3 destinations.
- The video «رضایت زیباجو از خدمات زیبایی دکتر سعید قزلباش» is embedded directly inside #clinic-information-kermanshah.
- The two medical-education videos are embedded only inside #medical-education under #medical-research-and-education.
- Videos do not create separate canonical watch pages.

## Interpretation

- Visible HTML is authoritative; inline JSON-LD and knowledge-graph.jsonld must mirror it.
- H2 titles and order mirror WebPageElement and ItemList nodes.
- Video titles, descriptions, files, thumbnails and destinations mirror VideoObject nodes.
- The Homepage is both MedicalWebPage and ProfilePage; the physician remains its sole mainEntity.
- The Hugging Face profile is a Person profile; the Hugging Face dataset is a separate Dataset about Person and Clinic.
`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
