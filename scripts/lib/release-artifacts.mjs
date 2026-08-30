const semver = /^\d+\.\d+\.\d+$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function releaseArtifactName(release) {
  const version = String(release?.release || ""),
    date = String(release?.dateModified || "");
  if (!semver.test(version))
    throw new Error(`Invalid release version for artifact naming: ${version}`);
  if (!isoDate.test(date))
    throw new Error(`Invalid release date for artifact naming: ${date}`);
  return `doctor-ghezelbaash-dist-v${version}-${date}.zip`;
}
