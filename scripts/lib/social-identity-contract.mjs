import assert from "node:assert/strict";

const values = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const ids = (value) => values(value).map((item) => item?.["@id"]);
const sameSubjects = (value, expected, label) => {
  const actual = ids(value);
  assert.ok(actual.every((id) => typeof id === "string" && id), `${label}: expected entity references`);
  assert.equal(new Set(actual).size, actual.length, `${label}: duplicate entity reference`);
  assert.deepEqual([...actual].sort(), [...expected].sort(), `${label}: subject scope drift`);
};

/**
 * A professional page describes the physician and the clinic he owns; the
 * personal Facebook profile describes only the physician. Stable evidence and
 * profile IDs may describe the same external page, but must agree on its scope.
 * This is an authored identity contract, not a claim of independent evidence.
 */
export function assertSocialIdentity({ graph, release }) {
  const nodes = graph?.["@graph"] || [];
  const byId = new Map(nodes.map((node) => [node["@id"], node]));
  const personId = release.primaryEntity.id;
  const clinicId = release.clinic.id;
  const person = byId.get(personId);
  assert.ok(person && byId.has(clinicId) && personId !== clinicId, "Social identity requires distinct physician and clinic");
  const base = release.canonicalUrl;
  const professional = [personId, clinicId];
  const policies = [
    ["#profile-facebook-ghezelbaash", "https://www.facebook.com/ghezelbaash", [personId], true],
    ["#profile-facebook-doctor-ghezelbaash", "https://www.facebook.com/doctor.ghezelbaash", professional, true],
    ["#profile-instagram-doctor-ghezelbaash", "https://www.instagram.com/doctor.ghezelbaash/", professional, true],
    ["#evidence-instagram", "https://www.instagram.com/doctor.ghezelbaash/", professional, false],
  ];
  const urlPolicies = new Map();
  for (const [suffix, url, subjects, owned] of policies) {
    const node = byId.get(`${base}${suffix}`);
    assert.ok(node, `Missing social identity node: ${suffix}`);
    assert.equal(node.url, url, `Social URL drift: ${suffix}`);
    sameSubjects(node.mainEntity, subjects, `${suffix}.mainEntity`);
    sameSubjects(node.about, subjects, `${suffix}.about`);
    if (owned) {
      sameSubjects(node.owner, [personId], `${suffix}.owner`);
      assert.ok(ids(person.owns).includes(node["@id"]), `Person.owns missing: ${suffix}`);
    }
    urlPolicies.set(url.replace(/\/$/, ""), subjects);
  }
  for (const node of nodes) {
    if (typeof node.url !== "string" || !Object.hasOwn(node, "mainEntity")) continue;
    const expected = urlPolicies.get(node.url.replace(/\/$/, ""));
    if (expected) sameSubjects(node.mainEntity, expected, `${node["@id"]}.mainEntity`);
  }
  return { socialPagesChecked: policies.length, professionalSubjects: professional };
}
