import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deriveGooglePageMicrodata } from "../src/lib/google-page-microdata.mjs";
import { projectNode } from "../src/lib/semantic-projection.mjs";

const PHYSICIAN = "https://www.ghezelbaash.ir/#saeed-ghezelbash";
const CLINIC =
  "https://www.ghezelbaash.ir/#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah";
const SPECIALTY =
  "https://www.ghezelbaash.ir/#medical-specialty-aesthetic-medicine";
const IRAN = "https://www.ghezelbaash.ir/#country-iran";
const IRAQ = "https://www.ghezelbaash.ir/#country-iraq";
const WEBPAGE = "https://www.ghezelbaash.ir/#webpage";
const UNIVERSITY =
  "https://www.ghezelbaash.ir/#kermanshah-university-of-medical-sciences";
const WPA_EVENT =
  "https://www.ghezelbaash.ir/#event-wpa-xvii-world-congress-psychiatry-2017";
const WIKIJOURNAL_PREPRINTS =
  "https://www.ghezelbaash.ir/#periodical-wikijournal-preprints";
const RESEARCH_SECTION =
  "https://www.ghezelbaash.ir/#saeed-ghezelbash-research-education-and-clinical-decisions";
const CORE_HEAD_SERVICES = [
  "https://www.ghezelbaash.ir/#procedure-botulinum-toxin-aesthetic-treatment",
  "https://www.ghezelbaash.ir/#procedure-facial-and-lip-dermal-filler",
  "https://www.ghezelbaash.ir/#procedure-body-dermal-filler",
  "https://www.ghezelbaash.ir/#procedure-hyaluronidase-and-filler-revision",
  "https://www.ghezelbaash.ir/#procedure-thread-lift",
  "https://www.ghezelbaash.ir/#procedure-subcision",
  "https://www.ghezelbaash.ir/#procedure-microneedling",
  "https://www.ghezelbaash.ir/#procedure-chemical-peel",
  "https://www.ghezelbaash.ir/#procedure-energy-based-skin-treatment",
  "https://www.ghezelbaash.ir/#procedure-platelet-rich-plasma-skin-treatment",
  "https://www.ghezelbaash.ir/#procedure-platelet-rich-plasma-hair-treatment",
  "https://www.ghezelbaash.ir/#procedure-skin-mesotherapy",
  "https://www.ghezelbaash.ir/#procedure-hair-mesotherapy",
  "https://www.ghezelbaash.ir/#procedure-jalupro-injectable-skin-treatment",
  "https://www.ghezelbaash.ir/#procedure-profhilo-injectable-skin-treatment",
  "https://www.ghezelbaash.ir/#procedure-injectable-skin-booster",
  "https://www.ghezelbaash.ir/#procedure-injectable-biostimulator",
  "https://www.ghezelbaash.ir/#procedure-hair-loss-evaluation-and-treatment",
  "https://www.ghezelbaash.ir/#aesthetic-revision-and-second-opinion",
  "https://www.ghezelbaash.ir/#procedure-botulinum-toxin-result-correction",
  "https://www.ghezelbaash.ir/#procedure-thread-lift-result-correction",
  "https://www.ghezelbaash.ir/#procedure-blepharoplasty",
  "https://www.ghezelbaash.ir/#procedure-central-lip-lift",
  "https://www.ghezelbaash.ir/#procedure-buccal-fat-removal",
  "https://www.ghezelbaash.ir/#procedure-submental-liposuction",
  "https://www.ghezelbaash.ir/#procedure-autologous-fat-grafting",
  "https://www.ghezelbaash.ir/#procedure-rhinoplasty",
  "https://www.ghezelbaash.ir/#procedure-facelift",
  "https://www.ghezelbaash.ir/#procedure-neck-lift",
  "https://www.ghezelbaash.ir/#procedure-body-aesthetic-surgery",
];
const CORE_PERFORMER_EVENTS = [
  "https://www.ghezelbaash.ir/#advanced-thread-lift-workshop-tehran-1403-11",
  "https://www.ghezelbaash.ir/#event-wpa-xvii-world-congress-psychiatry-2017",
];
const CORE_RESEARCH_IDENTIFIERS = [
  "https://www.ghezelbaash.ir/#identifier-person-openalex",
  "https://www.ghezelbaash.ir/#identifier-person-semantic-scholar",
  "https://www.ghezelbaash.ir/#identifier-person-google-scholar",
];
const CORE_HEAD_OFFERS = [
  "https://www.ghezelbaash.ir/#free-online-aesthetic-initial-consultation-offer",
  "https://www.ghezelbaash.ir/#aesthetic-revision-and-second-opinion-offer",
];
const CORE_PERSON_AUTHORITY_SUBJECTS = [
  "https://www.ghezelbaash.ir/#evidence-irimc",
  "https://www.ghezelbaash.ir/#evidence-wikidata-doctor",
  "https://www.ghezelbaash.ir/#evidence-orcid",
  "https://www.ghezelbaash.ir/#evidence-ncbi-bibliography",
  "https://www.ghezelbaash.ir/#evidence-openalex-author",
  "https://www.ghezelbaash.ir/#evidence-semantic-scholar-author",
  "https://www.ghezelbaash.ir/#evidence-magiran-author",
  "https://www.ghezelbaash.ir/#evidence-iranmedlabs-interview",
];
const PROFILE_EVIDENCE_WEBPAGES = [
  "https://www.ghezelbaash.ir/#evidence-irimc",
  "https://www.ghezelbaash.ir/#evidence-orcid",
  "https://www.ghezelbaash.ir/#evidence-openalex-author",
  "https://www.ghezelbaash.ir/#evidence-semantic-scholar-author",
  "https://www.ghezelbaash.ir/#evidence-magiran-author",
];
const CORE_CLINIC_AUTHORITY_SUBJECTS = [
  "https://www.ghezelbaash.ir/#evidence-google-maps-clinic",
  "https://www.ghezelbaash.ir/#evidence-wikidata-clinic",
  "https://www.ghezelbaash.ir/#evidence-mojavez-clinic-ownership",
];
const EXPECTED_AREAS = [IRAN, IRAQ];
const WIKIDATA_FIELDS = [
  "Q3332453",
  "Q3745388",
  "Q4095199",
  "Q17081562",
  "Q7049059",
  "Q537918",
  "Q613879",
  "Q3675172",
  "Q4936963",
  "Q2276095",
  "Q2697787",
  "Q685286",
  "Q2559992",
  "Q3267987",
  "Q16949888",
  "Q305190",
  "Q1641068",
  "Q26967",
  "Q840929",
  "Q825490",
  "Q1423937",
  "Q851186",
  "Q935781",
  "Q133823",
  "Q7439446",
  "Q79928",
  "Q5133849",
  "Q2752427",
].map((qid) => `https://www.wikidata.org/entity/${qid}`);
const WIKIDATA_IDENTITY_URLS = [
  "https://www.wikidata.org/entity/Q140287622",
  "https://commons.wikimedia.org/wiki/Category:Saeed_Ghezelbash",
  "https://commons.wikimedia.org/wiki/Creator:Saeed_Ghezelbash",
  "https://en.wikisource.org/wiki/Author:Mohammad_Saeed_Ghezelbash",
  "https://www.pinterest.com/qezelbaash/",
  "https://www.tiktok.com/@ghezelbaash",
  "https://www.youtube.com/channel/UCAiLkR6O3k9aDU9CYSeXPWQ",
];
const WIKIDATA_PERSON_SUBJECTS = [
  "https://www.ghezelbaash.ir/#evidence-magiran-author",
  "https://www.ghezelbaash.ir/#evidence-wikimedia-commons-creator",
  "https://www.ghezelbaash.ir/#evidence-wikisource-author",
  "https://www.ghezelbaash.ir/#video-jalupro-vs-profhilo",
];

const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const types = (node) => asArray(node?.["@type"]);
const refId = (value) => (typeof value === "string" ? value : value?.["@id"]);
const refs = (value) => asArray(value).map(refId).filter(Boolean);
const sortedUnique = (values) => [...new Set(values)].sort();
const assertExact = (actual, expected, label) =>
  assert.deepEqual(sortedUnique(actual), sortedUnique(expected), label);
const requireNode = (byId, id, label) => {
  const node = byId.get(id);
  assert.ok(node, `${label} missing: ${id}`);
  return node;
};

const [graphDocument, headProfile, supportProfile, llmsTemplate, pageSource] = await Promise.all([
  readFile("src/data/semantic/knowledge-graph.jsonld", "utf8").then(JSON.parse),
  readFile("src/data/semantic/head-profile.json", "utf8").then(JSON.parse),
  readFile("src/data/semantic/support-profile.json", "utf8").then(JSON.parse),
  readFile("src/data/templates/llms.template.txt", "utf8"),
  readFile("src/content-source/page.md", "utf8"),
]);
const headIds = headProfile.ids;
const graph = graphDocument["@graph"];
assert.ok(Array.isArray(graph), "Canonical graph lacks @graph");
const byId = new Map(
  graph.filter((node) => node?.["@id"]).map((node) => [node["@id"], node]),
);
assert.equal(
  byId.size,
  graph.filter((node) => node?.["@id"]).length,
  "Canonical graph contains duplicate @id values",
);
assert.equal(
  new Set(headIds).size,
  headIds.length,
  "Head selection contains duplicate IDs",
);

const physician = requireNode(byId, PHYSICIAN, "Canonical physician");
const clinic = requireNode(byId, CLINIC, "Canonical clinic");
const specialty = requireNode(byId, SPECIALTY, "Canonical medical specialty");
const iran = requireNode(byId, IRAN, "Canonical Iran area");
const iraq = requireNode(byId, IRAQ, "Canonical Iraq area");
const webpage = requireNode(byId, WEBPAGE, "Canonical ProfilePage");

assertExact(
  types(physician),
  ["Person", "IndividualPhysician"],
  "Canonical physician must remain one Person + IndividualPhysician node",
);
assertExact(
  graph
    .filter((node) => types(node).includes("IndividualPhysician"))
    .map((node) => node["@id"]),
  [PHYSICIAN],
  "A second IndividualPhysician identity would fragment the physician entity",
);
assertExact(
  refs(physician.practicesAt),
  [CLINIC],
  "practicesAt must resolve to the canonical clinic",
);
assertExact(
  refs(physician.medicalSpecialty),
  [SPECIALTY],
  "medicalSpecialty must resolve to the canonical specialty",
);
assertExact(
  refs(physician.areaServed),
  EXPECTED_AREAS,
  "Physician in-person catchment must remain Iran + Iraq",
);
assert.ok(
  refs(physician.worksFor).includes(CLINIC),
  "Physician worksFor relation lost canonical clinic",
);
assert.ok(
  refs(physician.affiliation).includes(CLINIC),
  "Physician affiliation relation lost canonical clinic",
);
assert.ok(
  refs(physician.workLocation).includes(CLINIC),
  "Physician workLocation relation lost canonical clinic",
);
assert.ok(
  refs(physician.owns).includes(CLINIC),
  "Physician ownership relation lost canonical clinic",
);
assertExact(
  refs(physician.additionalType),
  ["https://www.wikidata.org/entity/Q5"],
  "Wikidata human classification drift",
);
assert.equal(physician.birthDate, "1991-05-29", "Wikidata birth date drift");
assertExact(
  refs(physician.gender),
  ["https://schema.org/Male"],
  "Wikidata gender drift",
);
assertExact(
  refs(physician.nationality),
  [IRAN],
  "Wikidata citizenship/nationality drift",
);
assertExact(
  asArray(physician.email),
  ["mailto:medicaldoctor91@gmail.com", "mailto:doctor@ghezelbaash.ir"],
  "Wikidata email set drift",
);
for (const field of WIKIDATA_FIELDS)
  assert.ok(
    refs(physician.knowsAbout).includes(field),
    `Wikidata field-of-work missing from Person: ${field}`,
  );
assert.ok(
  refs(physician.hasOccupation).includes(
    "https://www.wikidata.org/entity/Q256688",
  ),
  "Wikidata medical-director position missing from Person",
);
assert.ok(
  refs(physician.affiliation).includes(UNIVERSITY),
  "Wikidata university affiliation missing from Person",
);
assert.ok(
  refs(physician.performerIn).includes(WPA_EVENT),
  "Wikidata WPA congress participation missing from Person",
);
for (const url of WIKIDATA_IDENTITY_URLS)
  assert.ok(
    refs(physician.sameAs).includes(url),
    `Wikidata identity/sitelink missing from Person: ${url}`,
  );
for (const subject of WIKIDATA_PERSON_SUBJECTS)
  assert.ok(
    refs(physician.subjectOf).includes(subject),
    `Wikidata evidence/work missing from Person: ${subject}`,
  );

for (const subjectId of refs(physician.subjectOf)) {
  const subject = requireNode(byId, subjectId, "Person subjectOf target");
  const subjectAbout = [...refs(subject.about), ...refs(subject.mainEntity)];
  assert.ok(
    subjectAbout.includes(PHYSICIAN),
    `Person subjectOf must resolve to a work/profile actually about the physician: ${subjectId}`,
  );
}

const aestheticWorks = [
  [
    "https://www.ghezelbaash.ir/#wikiversity-botulinum-toxin-aesthetic-medicine",
    "https://www.wikidata.org/entity/Q141099455",
    "2026-08-14",
    "LearningResource",
    "datePublished",
  ],
  [
    "https://www.ghezelbaash.ir/#wikiversity-individualized-botulinum-toxin-focused-review",
    "https://www.wikidata.org/entity/Q141129555",
    "2026-08-18",
    "ScholarlyArticle",
    "dateCreated",
  ],
  [
    "https://www.ghezelbaash.ir/#wikiversity-facial-assessment-before-aesthetic-botulinum-toxin",
    "https://www.wikidata.org/entity/Q141131757",
    "2026-08-19",
    "LearningResource",
    "datePublished",
  ],
]
for (const [id, wikidata, dateValue, preciseType, dateProperty] of aestheticWorks) {
  const work = requireNode(byId, id, "Aesthetic-medicine authored work");
  assert.ok(types(work).includes("Article"), `Aesthetic work lost Article type: ${id}`);
  assert.ok(
    types(work).includes(preciseType),
    `Aesthetic work lost precise semantic type ${preciseType}: ${id}`,
  );
  assertExact(refs(work.author), [PHYSICIAN], `Aesthetic work author drift: ${id}`);
  assert.equal(work.sameAs, wikidata, `Aesthetic work Wikidata reconciliation drift: ${id}`);
  assert.equal(work[dateProperty], dateValue, `Aesthetic work ${dateProperty} drift: ${id}`);
  const otherDateProperty = dateProperty === "datePublished" ? "dateCreated" : "datePublished";
  assert.equal(
    work[otherDateProperty],
    undefined,
    `Aesthetic work carries conflicting ${otherDateProperty}: ${id}`,
  );
  if (preciseType === "LearningResource") {
    assert.equal(
      work.learningResourceType,
      "Open educational resource",
      `Aesthetic OER learningResourceType drift: ${id}`,
    );
    assert.equal(
      work.license,
      "https://creativecommons.org/licenses/by-sa/4.0/",
      `Aesthetic OER license drift: ${id}`,
    );
  } else {
    assert.equal(
      work.creativeWorkStatus,
      "Preprint under public peer review",
      `Aesthetic preprint status drift: ${id}`,
    );
    assert.equal(
      work.license,
      "https://creativecommons.org/licenses/by/4.0/",
      `Aesthetic preprint license drift: ${id}`,
    );
    assertExact(refs(work.isPartOf), [WIKIJOURNAL_PREPRINTS], `Aesthetic preprint container drift: ${id}`);
  }
  assert.ok(refs(work.about).includes(SPECIALTY), `Aesthetic work lost aesthetic-medicine topic: ${id}`);
  assert.ok(
    refs(work.about).includes("https://www.ghezelbaash.ir/#biomedical-concept-botulinum-toxin-a"),
    `Aesthetic work lost botulinum-toxin topic: ${id}`,
  );
  assert.ok(
    supportProfile.ids.includes(id),
    `Aesthetic authored work is not projected into inline support JSON-LD: ${id}`,
  );
}
for (const [id] of aestheticWorks) {
  assert.ok(
    refs(webpage.mentions).includes(id),
    `Canonical WebPage lost visible aesthetic-authorship mention: ${id}`,
  );
}

const researchSection = requireNode(byId, RESEARCH_SECTION, "Research/education WebPageElement");
const citedScholarlyWorks = [
  ["https://www.ghezelbaash.ir/#article-omega-3-bipolar-i-2016", "10.4103/2008-7802.182734"],
  ["https://www.ghezelbaash.ir/#article-mdd-attachment-dissociation-trauma-2021", "10.3390/healthcare9091169"],
];
assertExact(
  supportProfile.citedScholarlyWorkIds,
  citedScholarlyWorks.map(([id]) => id),
  "Inline scholarly citation allowlist drift",
);
const projectedResearchSection = projectNode(researchSection, supportProfile.idProfiles?.[RESEARCH_SECTION]);
for (const [id, doi] of citedScholarlyWorks) {
  const work = requireNode(byId, id, "Physician-coauthored scholarly work");
  const projectedWork = projectNode(work, supportProfile.idProfiles?.[id]);
  assertExact(types(work), ["ScholarlyArticle"], `Scholarly citation type drift: ${id}`);
  assert.ok(supportProfile.ids.includes(id), `Cited scholarly work is not selected: ${id}`);
  assert.ok(refs(projectedResearchSection.citation).includes(id), `Projected section lost its scholarly citation: ${id}`);
  assert.ok(refs(projectedWork.author).includes(PHYSICIAN), `Projected scholarly work lost physician coauthorship: ${id}`);
  assert.equal(projectedWork.url, `https://doi.org/${doi}`, `Scholarly citation DOI destination drift: ${id}`);
  assert.ok(projectedWork.identifier.includes(`DOI:${doi}`), `Scholarly citation DOI identifier drift: ${id}`);
  assert.equal(projectedWork.image, undefined, `A physician portrait must not represent the cited scholarly article: ${id}`);
  assert.equal(projectedWork.mainEntityOfPage, undefined, `The homepage must not become an external article's canonical page: ${id}`);
  assert.ok(!refs(physician.subjectOf).includes(id), `An authored work must not become a work about the physician: ${id}`);
}
for (const id of [PHYSICIAN, SPECIALTY, "https://www.ghezelbaash.ir/#biomedical-concept-botulinum-toxin-a"]) {
  assert.ok(refs(researchSection.about).includes(id), `Research section lost about edge: ${id}`);
}
for (const [id] of aestheticWorks) {
  assert.ok(refs(researchSection.mentions).includes(id), `Research section lost authored-work mention: ${id}`);
}
assert.ok(
  supportProfile.ids.includes(RESEARCH_SECTION),
  "Research/education WebPageElement is not projected into inline support JSON-LD",
);

const wikiJournal = requireNode(byId, WIKIJOURNAL_PREPRINTS, "WikiJournal Preprints container");
assert.ok(types(wikiJournal).includes("Periodical"), "WikiJournal Preprints lost Periodical type");
assert.equal(wikiJournal.url, "https://en.wikiversity.org/wiki/WikiJournal_Preprints");
assert.ok(
  supportProfile.ids.includes(WIKIJOURNAL_PREPRINTS),
  "WikiJournal Preprints container is not projected into inline support JSON-LD",
);

assert.ok(
  supportProfile.ids.includes("https://www.ghezelbaash.ir/#evidence-iranmedlabs-interview"),
  "External aesthetic-medicine interview is not projected into inline support JSON-LD",
);
for (const [, wikidata] of aestheticWorks) {
  const qid = wikidata.split("/").pop();
  assert.ok(
    llmsTemplate.includes(qid),
    `LLM retrieval guide lost aesthetic authorship identifier ${qid}`,
  );
}
assert.ok(
  llmsTemplate.includes("not treated as independent evidence of treatment efficacy"),
  "LLM retrieval guide lost the authored-work evidence-role boundary",
);

assert.ok(
  types(clinic).includes("MedicalClinic"),
  "Clinic lost MedicalClinic type",
);
assertExact(
  refs(clinic.medicalSpecialty),
  [SPECIALTY],
  "Clinic medicalSpecialty must resolve to the canonical specialty",
);
assertExact(
  refs(clinic.areaServed),
  EXPECTED_AREAS,
  "Clinic catchment must remain Iran + Iraq",
);
assertExact(
  refs(clinic.owner),
  [PHYSICIAN],
  "Clinic owner must be the canonical physician",
);
assertExact(
  refs(clinic.founder),
  [PHYSICIAN],
  "Clinic founder must be the canonical physician",
);
assertExact(
  refs(clinic.employee),
  [PHYSICIAN],
  "Clinic employee must be the canonical physician",
);
assertExact(
  types(specialty),
  ["MedicalSpecialty"],
  "Specialty target must be a MedicalSpecialty",
);
assert.ok(
  types(iran).includes("Country") && types(iran).includes("Place"),
  "Iran area must remain Country + Place",
);
assert.ok(
  types(iraq).includes("Country") && types(iraq).includes("Place"),
  "Iraq area must remain Country + Place",
);
assert.ok(
  types(webpage).includes("ProfilePage"),
  "Canonical page lost ProfilePage type",
);
assertExact(
  refs(webpage.mainEntity),
  [PHYSICIAN],
  "ProfilePage mainEntity must remain the canonical physician",
);
assertExact(
  refs(physician.mainEntityOfPage),
  [WEBPAGE],
  "Physician mainEntityOfPage must remain the canonical ProfilePage",
);
for (const id of PROFILE_EVIDENCE_WEBPAGES) {
  assertExact(
    types(requireNode(byId, id, "Authority evidence page")),
    ["WebPage"],
    `Authority evidence must not compete with the canonical ProfilePage: ${id}`,
  );
}

assert.ok(
  refs(physician.knowsAbout).includes(
    "https://www.ghezelbaash.ir/#biomedical-concept-botulinum-toxin-a",
  ),
  "Physician lost direct botulinum-toxin topical knowledge edge",
);

const physicianSpec = headProfile.nodes?.[PHYSICIAN];
const clinicSpec = headProfile.nodes?.[CLINIC];
const physicianImages = refs(physician.image);
assert.equal(physicianImages.length, 4, "Physician must retain four canonical portrait images");
assertExact(
  refs(projectNode(physician, physicianSpec).image),
  physicianImages,
  "Physician head projection must preserve every canonical portrait reference",
);
for (const id of physicianImages) {
  const image = requireNode(byId, id, "Physician portrait image");
  assert.ok(types(image).includes("ImageObject"), `Physician image has the wrong type: ${id}`);
  assert.ok(refs(image.about).includes(PHYSICIAN), `Physician image must depict the physician: ${id}`);
  assert.ok(supportProfile.ids.includes(id), `Physician image is missing from inline support: ${id}`);
  assert.ok(typeof image.contentUrl === "string" && !new URL(image.contentUrl).hash,
    `Physician portrait contentUrl must resolve directly to an image: ${id}`);
}
for (const [suffix, width, height] of [["square-1200", 1200, 1200], ["4x3-1200", 1200, 900], ["16x9-1200", 1200, 675]]) {
  const image = requireNode(byId, `https://www.ghezelbaash.ir/#image-saeed-ghezelbash-portrait-${suffix}`, "Physician portrait crop");
  assert.equal(image.width?.value, width, `Physician crop width drift: ${suffix}`);
  assert.equal(image.height?.value, height, `Physician crop height drift: ${suffix}`);
}
assert.ok(
  physicianSpec && clinicSpec,
  "Head projection profiles for physician/clinic are missing",
);
assert.ok(
  physicianSpec.include?.includes("performerIn"),
  "Physician head projection lost performerIn",
);
assert.deepEqual(
  physicianSpec.refAllow?.performerIn,
  CORE_PERFORMER_EVENTS,
  "Physician head projection performerIn drift",
);
for (const id of CORE_PERFORMER_EVENTS) {
  assert.ok(
    supportProfile.ids.includes(id),
    `Physician performer event is not projected into inline support JSON-LD: ${id}`,
  );
}
for (const visibleResearchUrl of [
  "https://www.ncbi.nlm.nih.gov/myncbi/saeed.ghezelbash.1/bibliography/public/",
  "https://openalex.org/A5064828898",
  "https://scholar.google.com/citations?user=BcWBirUAAAAJ",
]) {
  assert.ok(
    pageSource.includes(visibleResearchUrl),
    `Visible physician authority core lost research identity link: ${visibleResearchUrl}`,
  );
}
for (const id of CORE_RESEARCH_IDENTIFIERS) {
  assert.ok(headIds.includes(id), `Research identifier is not a head node: ${id}`);
  assert.ok(
    physicianSpec.refAllow?.identifier?.includes(id),
    `Physician head projection lost research identifier: ${id}`,
  );
}
assert.ok(
  !physicianSpec.include?.includes("mainEntityOfPage"),
  "Google Head must keep ProfilePage top-level by omitting Person.mainEntityOfPage",
);
assert.equal(
  physicianSpec.refAllow?.mainEntityOfPage,
  undefined,
  "Google Head must not carry a reverse mainEntityOfPage allowlist",
);
for (const id of CORE_HEAD_SERVICES) {
  assert.ok(
    supportProfile.ids.includes(id),
    `Core head service is not projected into inline support JSON-LD: ${id}`,
  );
}
for (const [label, spec] of [
  ["physician", physicianSpec],
  ["clinic", clinicSpec],
]) {
  assert.ok(
    spec.include?.includes("availableService"),
    `${label} head projection lost availableService`,
  );
  assert.deepEqual(
    spec.refAllow?.availableService,
    CORE_HEAD_SERVICES,
    `${label} head projection core service set drift`,
  );
}
assert.ok(
  physicianSpec.include?.includes("makesOffer"),
  "Physician head projection lost makesOffer",
);
assert.deepEqual(
  physicianSpec.refAllow?.makesOffer,
  CORE_HEAD_OFFERS,
  "Physician head projection core offer set drift",
);
assert.ok(
  physicianSpec.include?.includes("subjectOf"),
  "Physician head projection lost selected external subjectOf evidence",
);
assert.deepEqual(
  physicianSpec.refAllow?.subjectOf,
  CORE_PERSON_AUTHORITY_SUBJECTS,
  "Physician head projection external subjectOf evidence drift",
);
assert.ok(
  clinicSpec.include?.includes("subjectOf"),
  "Clinic head projection lost selected external subjectOf evidence",
);
assert.deepEqual(
  clinicSpec.refAllow?.subjectOf,
  CORE_CLINIC_AUTHORITY_SUBJECTS,
  "Clinic head projection external subjectOf evidence drift",
);
for (const id of [...CORE_PERSON_AUTHORITY_SUBJECTS, ...CORE_CLINIC_AUTHORITY_SUBJECTS]) {
  assert.ok(
    supportProfile.ids.includes(id),
    `Selected authority subject is not projected into inline support JSON-LD: ${id}`,
  );
}
for (const property of ["practicesAt", "medicalSpecialty", "areaServed"]) {
  assert.ok(
    physicianSpec.include?.includes(property),
    `Physician Head projection dropped ${property}`,
  );
}
assertExact(
  physicianSpec.valueAllow?.["@type"],
  ["Person", "IndividualPhysician"],
  "Head physician types must preserve Person + IndividualPhysician",
);
assertExact(
  physicianSpec.refAllow?.practicesAt,
  [CLINIC],
  "Head practicesAt allowlist drift",
);
assertExact(
  physicianSpec.refAllow?.medicalSpecialty,
  [SPECIALTY],
  "Head physician specialty allowlist drift",
);
assertExact(
  physicianSpec.refAllow?.areaServed,
  EXPECTED_AREAS,
  "Head physician area allowlist drift",
);
assertExact(
  clinicSpec.refAllow?.medicalSpecialty,
  [SPECIALTY],
  "Head clinic specialty allowlist drift",
);
assertExact(
  clinicSpec.refAllow?.areaServed,
  EXPECTED_AREAS,
  "Head clinic area allowlist drift",
);
assertExact(
  clinicSpec.refAllow?.owner,
  [PHYSICIAN],
  "Head clinic owner allowlist drift",
);
assertExact(
  clinicSpec.refAllow?.founder,
  [PHYSICIAN],
  "Head clinic founder allowlist drift",
);
assertExact(
  clinicSpec.refAllow?.employee,
  [PHYSICIAN],
  "Head clinic employee allowlist drift",
);
for (const id of [PHYSICIAN, CLINIC, SPECIALTY, IRAN, IRAQ, WEBPAGE]) {
  assert.ok(
    headIds.includes(id),
    `Head reference closure target is not selected: ${id}`,
  );
  assert.ok(
    headProfile.nodes?.[id],
    `Head reference closure target lacks projection policy: ${id}`,
  );
}

const projectedNodes = headIds.map((id) =>
  projectNode(
    requireNode(byId, id, "Head-selected canonical node"),
    headProfile.nodes?.[id],
  ),
);
const projectedById = new Map(
  projectedNodes.map((node) => [node["@id"], node]),
);
const projectedPhysician = requireNode(
  projectedById,
  PHYSICIAN,
  "Projected physician",
);
const projectedClinic = requireNode(projectedById, CLINIC, "Projected clinic");
assertExact(
  types(projectedPhysician),
  ["Person", "IndividualPhysician"],
  "Projected physician types drift",
);
assertExact(
  refs(projectedPhysician.practicesAt),
  [CLINIC],
  "Projected practicesAt drift",
);
assertExact(
  refs(projectedPhysician.medicalSpecialty),
  [SPECIALTY],
  "Projected physician specialty drift",
);
assertExact(
  refs(projectedPhysician.areaServed),
  EXPECTED_AREAS,
  "Projected physician areas drift",
);
assert.equal(
  projectedPhysician.mainEntityOfPage,
  undefined,
  "Projected physician must not compete with the top-level ProfilePage",
);
assertExact(
  refs(projectedClinic.medicalSpecialty),
  [SPECIALTY],
  "Projected clinic specialty drift",
);
assertExact(
  refs(projectedClinic.areaServed),
  EXPECTED_AREAS,
  "Projected clinic areas drift",
);
for (const node of [projectedPhysician, projectedClinic]) {
  for (const property of ["medicalSpecialty", "areaServed"]) {
    for (const id of refs(node[property]))
      assert.ok(
        projectedById.has(id),
        `Projected ${property} target is dangling: ${id}`,
      );
  }
}
for (const id of refs(projectedPhysician.practicesAt))
  assert.ok(
    projectedById.has(id),
    `Projected practicesAt target is dangling: ${id}`,
  );

const projectedPage = requireNode(
  projectedById,
  WEBPAGE,
  "Projected ProfilePage",
);
const microdata = deriveGooglePageMicrodata(
  { "@graph": [projectedPage, projectedPhysician] },
  WEBPAGE,
);
assert.equal(
  microdata.itemType,
  "https://schema.org/ProfilePage",
  "DOM page Microdata type drift",
);
assert.equal(
  microdata.mainEntityItemType,
  "https://schema.org/Person",
  "DOM physician Microdata must remain the minimal Person view",
);
assert.equal(
  microdata.mainEntityId,
  PHYSICIAN,
  "DOM physician Microdata identity drift",
);

const headDocument = {
  "@context": graphDocument["@context"],
  "@graph": projectedNodes,
};
const headBytes = Buffer.byteLength(`${JSON.stringify(headDocument)}\n`);
assert.ok(
  headBytes <= headProfile.maxBytes,
  `Head graph ${headBytes} exceeds ${headProfile.maxBytes}`,
);

console.log(
  JSON.stringify(
    {
      stage: "PHYSICIAN_SEMANTIC_PROJECTION",
      identityModel: "ONE_CANONICAL_ID",
      jsonLdTypes: ["Person", "IndividualPhysician"],
      domMicrodataType: "Person",
      practicesAt: "INDIVIDUAL_PHYSICIAN_TO_MEDICAL_CLINIC",
      medicalSpecialty: "PHYSICIAN_AND_CLINIC_TO_DEFINED_MEDICAL_SPECIALTY",
      areaServed: "PHYSICIAN_AND_CLINIC_TO_DEFINED_COUNTRIES",
      keyReferenceClosure: "PASS",
      headNodes: projectedNodes.length,
      headBytes,
      headBudget: headProfile.maxBytes,
      dataLoss: false,
      entityFragmentation: false,
      integrity: "PASS",
    },
    null,
    2,
  ),
);
