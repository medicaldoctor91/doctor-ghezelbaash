import { site } from './entities';

export const publications = site.researchProfiles;
export const researchIdentity = {
  orcid: site.orcidUrl,
  bibliography: site.ncbiBibliography,
  zenodo: site.zenodoRecord,
  wikidata: site.doctorWikidata,
} as const;

