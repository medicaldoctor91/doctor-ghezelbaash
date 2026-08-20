const semverPattern=/^\d+\.\d+\.\d+$/;
const isoDatePattern=/^\d{4}-\d{2}-\d{2}$/;
const doiPattern=/^10\.5281\/zenodo\.\d+$/;

const englishDate=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));

export function releaseTokenValues(release){
  const versionDoi=release?.dataset?.zenodo?.versionDoi;
  if(!semverPattern.test(String(release?.release||'')))throw new Error('Invalid release token source: release');
  if(!isoDatePattern.test(String(release?.dateModified||''))||!isoDatePattern.test(String(release?.medicalReviewedAt||'')))throw new Error('Invalid release token source: date');
  if(!doiPattern.test(String(versionDoi||'')))throw new Error('Invalid release token source: Version DOI');
  return {
    '{{CURRENT_RELEASE}}':release.release,
    '{{CURRENT_VERSION_DOI}}':versionDoi,
    '{{CURRENT_VERSION_DOI_URLENCODED}}':encodeURIComponent(versionDoi),
    '{{CURRENT_RELEASE_DATE_EN}}':englishDate(release.dateModified),
    '{{MEDICAL_REVIEW_DATE_EN}}':englishDate(release.medicalReviewedAt)
  };
}

export function bindReleaseTokens(content,release){
  let bound=String(content);
  for(const [token,value] of Object.entries(releaseTokenValues(release)))bound=bound.replaceAll(token,String(value));
  const unresolved=bound.match(/{{(?:CURRENT_[A-Z0-9_]+|MEDICAL_REVIEW_DATE_EN)}}/g)||[];
  if(unresolved.length)throw new Error(`Unresolved release token: ${[...new Set(unresolved)].join(', ')}`);
  return bound;
}
