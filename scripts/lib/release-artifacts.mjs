const semver=/^\d+\.\d+\.\d+$/;
const isoDate=/^\d{4}-\d{2}-\d{2}$/;

export function releaseArtifactNames(release){
  const version=String(release?.release||''),date=String(release?.dateModified||'');
  if(!semver.test(version))throw new Error(`Invalid release version for artifact naming: ${version}`);
  if(!isoDate.test(date))throw new Error(`Invalid release date for artifact naming: ${date}`);
  const root='doctor-ghezelbaash-max-power';
  const sourceFolder=`${root}-source-v${version}`;
  return Object.freeze({
    sourceFolder,
    source:`${sourceFolder}-production-clean-${date}.zip`,
    dist:`${root}-dist-v${version}-${date}.zip`,
    complete:`${root}-complete-v${version}-${date}.zip`
  });
}
