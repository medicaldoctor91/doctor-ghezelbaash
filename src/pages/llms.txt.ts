import { site } from '../domain/entities';
import { videos } from '../domain/media.mjs';
import { videoWatchUrl } from '../domain/url-architecture.mjs';
// @ts-expect-error Shared ESM physician identity contract.
import { personIdentityContract } from '../domain/person-identity.mjs';

export const prerender = true;

export function GET() {
  const videoPages = videos
    .map((video: any) => `- [${video.title}](${videoWatchUrl(site.url, video.id)}): ${video.description}`)
    .join('\n');

  const body = `# ${site.name}

> Physician-first Persian website for ${site.legalName}, medical registration ${site.irimc}, practicing in ${site.city}, Iran.

## Canonical resources

- [Canonical profile and medical page](${site.url}): The homepage is both a MedicalWebPage and ProfilePage with the physician as its sole main entity.
- [Canonical knowledge graph](${site.url}knowledge-graph.jsonld): Self-contained JSON-LD graph discovered from HTML and HTTP with rel="describedby".
- [Physician entity](${site.url}#person): Sole main entity of the canonical homepage.
- [Clinic entity](${site.url}#clinic): Separate MedicalClinic and LocalBusiness entity; employer, work location, provider and publisher.
- [Clinical article](${site.url}#clinical-guide): Full Persian medical-aesthetic article with contextual videos.

## Physician identity

- Legal name: ${site.legalName}
- Professional name: ${site.name}
- Medical registration (IRIMC): ${site.irimc}
- Canadian MINC: ${personIdentityContract.minc}
- City: ${site.city}
- Postal code: ${site.postalCode}
- ORCID: ${site.orcidUrl}
- Wikidata: ${site.doctorWikidata}
- Google Knowledge Graph MID: ${site.doctorGoogleKnowledgeGraphId}
- MyNCBI bibliography: ${personIdentityContract.ncbiBibliography}
- Pinterest: ${personIdentityContract.pinterest}
- IRIMC verification: ${site.irimcVerification}

## Clinic social profiles

- Instagram: ${personIdentityContract.instagram}
- LinkedIn: ${personIdentityContract.linkedin}
- Facebook: ${personIdentityContract.facebook}

## Video watch pages

Each URL below is a dedicated single-video watch page with inline VideoObject structured data, a direct MP4 content URL, thumbnail, duration and publication timestamp.

${videoPages}

## Interpretation

- The canonical visible HTML is authoritative.
- The homepage is both MedicalWebPage and ProfilePage; the physician remains the sole mainEntity.
- The clinic remains a separate provider, publisher, employer and work location.
- Photos and videos remain contextually embedded in the homepage article; watch pages do not create a standalone homepage video library.
- \`offered\` means available through the clinic.
- \`evaluated\` means suitability is assessed before choosing a path.
- \`referral-context\` is educational or comparative and is not an offered clinic service.
`;

  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
