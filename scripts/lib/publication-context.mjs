import { readCanonicalInputs } from "../../src/lib/canonical-inputs.mjs";
import { composePublicationData, deriveCanonicalAuthority } from "../../src/lib/canonical-authority.mjs";

export async function loadPublicationData(root = process.cwd()) {
  return (await loadPublicationContext(root)).publicationData;
}
export async function loadPublicationContext(root = process.cwd()) {
  const { lifecycle, graph } = readCanonicalInputs(root);
  const authority = deriveCanonicalAuthority(lifecycle, graph);
  return Object.freeze({ lifecycle, graph, authority, publicationData: composePublicationData(lifecycle, authority) });
}
