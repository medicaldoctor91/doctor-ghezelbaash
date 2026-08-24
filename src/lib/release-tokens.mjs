const semverPattern=/^\d+\.\d+\.\d+$/;
const isoDatePattern=/^\d{4}-\d{2}-\d{2}$/;
const doiPattern=/^10\.5281\/zenodo\.\d+$/;
const canonicalUrlPattern=/^https:\/\/www\.ghezelbaash\.ir\/$/;
const releaseTokenPattern=/{{(?:CURRENT_[A-Z0-9_]+|MEDICAL_REVIEW_DATE_(?:EN|ISO|FA))}}/g;

const englishDate=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
const persianGregorianDate=value=>new Intl.DateTimeFormat('fa-IR-u-ca-gregory',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));

export function releaseTokenValues(release){
  const versionDoi=release?.dataset?.zenodo?.versionDoi;
  if(!semverPattern.test(String(release?.release||'')))throw new Error('Invalid release token source: release');
  if(!isoDatePattern.test(String(release?.dateModified||''))||!isoDatePattern.test(String(release?.medicalReviewedAt||'')))throw new Error('Invalid release token source: date');
  if(!doiPattern.test(String(versionDoi||'')))throw new Error('Invalid release token source: Version DOI');
  if(!canonicalUrlPattern.test(String(release?.canonicalUrl||'')))throw new Error('Invalid release token source: canonical URL');
  return Object.freeze({
    '{{CURRENT_RELEASE}}':release.release,
    '{{CURRENT_VERSION_DOI}}':versionDoi,
    '{{CURRENT_VERSION_DOI_URLENCODED}}':encodeURIComponent(versionDoi),
    '{{CURRENT_RELEASE_DATE_EN}}':englishDate(release.dateModified),
    '{{CURRENT_CANONICAL_URL}}':release.canonicalUrl,
    '{{MEDICAL_REVIEW_DATE_EN}}':englishDate(release.medicalReviewedAt),
    '{{MEDICAL_REVIEW_DATE_ISO}}':release.medicalReviewedAt,
    '{{MEDICAL_REVIEW_DATE_FA}}':persianGregorianDate(release.medicalReviewedAt)
  });
}

export function bindReleaseTokens(content,release){
  const source=String(content);
  const values=releaseTokenValues(release);
  const seen=new Set(source.match(releaseTokenPattern)||[]);
  for(const token of seen)if(!Object.hasOwn(values,token))throw new Error(`Unknown release token: ${token}`);
  const bound=source.replace(releaseTokenPattern,token=>String(values[token]));
  const unresolved=bound.match(releaseTokenPattern)||[];
  if(unresolved.length)throw new Error(`Unresolved release token: ${[...new Set(unresolved)].join(', ')}`);
  return bound;
}
