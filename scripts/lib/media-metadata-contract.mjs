import { readFile } from "node:fs/promises";

const contractPath = new URL(
  "../../src/data/media-metadata.json",
  import.meta.url,
);

const mediaMetadata = JSON.parse(await readFile(contractPath, "utf8"));
export const videoAuthoredTags = [...mediaMetadata.videoAuthoredTags];

const duplicate = (values) =>
  values.find((value, index) => values.indexOf(value) !== index);

if (duplicate(videoAuthoredTags)) {
  throw new Error(
    `Duplicate video metadata tag: ${duplicate(videoAuthoredTags)}`,
  );
}

export function matchImageProfile(filename) {
  const matches = mediaMetadata.imageProfiles.filter((profile) =>
    profile.includes.some((fragment) => filename.includes(fragment)),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one image metadata profile for ${filename}; found ${matches.length}`,
    );
  }
  return matches[0];
}

function universalImageSubjects(release) {
  const personWikidataIri = `https://www.wikidata.org/entity/${release.primaryEntity.wikidata}`;
  const clinicWikidataIri = `https://www.wikidata.org/entity/${release.dataset.supportingClinicWikidata}`;
  return [
    "Saeed Ghezelbash",
    "Dr. Saeed Ghezelbash",
    "دکتر سعید قزلباش",
    "Mohammad Saeed Ghezelbash",
    "Iranian physician",
    "aesthetic medicine",
    "Kermanshah",
    "Iran",
    release.primaryEntity.id,
    personWikidataIri,
    release.clinic.id,
    clinicWikidataIri,
    `IRIMC ${release.primaryEntity.irimc}`,
    `Google KG ${release.primaryEntity.googleKnowledgeGraphId}`,
    `Google Place ${release.clinic.placeId}`,
  ];
}

export function imageMetadataFor(release, profile) {
  const { rights } = mediaMetadata;
  const license = release.dataset.license;
  const alt = profile.alt;
  const primaryAltLanguage = profile.primaryAltLanguage;
  if (
    typeof primaryAltLanguage !== "string" ||
    !primaryAltLanguage ||
    !alt ||
    typeof alt !== "object" ||
    Array.isArray(alt) ||
    typeof alt[primaryAltLanguage] !== "string" ||
    !alt[primaryAltLanguage]
  )
    throw new Error(
      `Image metadata profile ${profile.title} lacks its explicit primary alt text`,
    );
  const personWikidataIri = `https://www.wikidata.org/entity/${release.primaryEntity.wikidata}`;
  const clinicWikidataIri = `https://www.wikidata.org/entity/${release.dataset.supportingClinicWikidata}`;
  const subjects = [
    ...new Set([...profile.subjects, ...universalImageSubjects(release)]),
  ];
  const metadata = {
    "XMP-dc:Creator": "Saeed Ghezelbash",
    "XMP-dc:Title": profile.title,
    "XMP-dc:Description": profile.description,
    "XMP-dc:Rights": rights.copyright,
    "XMP-dc:Subject": subjects,
    "XMP-xmpRights:Marked": true,
    "XMP-xmpRights:WebStatement": profile.licensePage,
    "XMP-xmpRights:UsageTerms": rights.usageTerms,
    "XMP-photoshop:Headline": profile.title,
    "XMP-photoshop:Credit": rights.credit,
    "XMP-iptcCore:CreatorWorkURL": release.primaryEntity.id,
    "XMP-iptcCore:AltTextAccessibility": alt[primaryAltLanguage],
    "XMP-plus:ImageCreatorName": "Saeed Ghezelbash",
    "XMP-plus:CopyrightOwnerName": "Saeed Ghezelbash",
    "XMP-plus:LicensorName": "Saeed Ghezelbash",
    "XMP-plus:LicensorURL": profile.licensePage,
    "XMP-plus:LicenseID": license,
    "XMP-plus:TermsAndConditionsURL": profile.licensePage,
    "XMP-plus:TermsAndConditionsText": rights.usageTerms,
    "XMP-iptcExt:LinkedEncodedRightsExpr": license,
    "XMP-iptcExt:LinkedEncodedRightsExprType": "text/html",
    "XMP-iptcExt:LinkedEncodedRightsExprLangID":
      "https://creativecommons.org/ns#",
    "XMP-iptcExt:AboutCvTermCvId": [
      release.canonicalUrl,
      "https://www.wikidata.org/",
      release.canonicalUrl,
      "https://www.wikidata.org/",
    ],
    "XMP-iptcExt:AboutCvTermId": [
      release.primaryEntity.id,
      personWikidataIri,
      release.clinic.id,
      clinicWikidataIri,
    ],
    "XMP-iptcExt:AboutCvTermName": [
      "Saeed Ghezelbash",
      "Saeed Ghezelbash",
      "Dr. Saeed Ghezelbash Aesthetic Clinic",
      "Dr. Saeed Ghezelbash Aesthetic Clinic",
    ],
  };

  for (const [language, text] of Object.entries(alt)) {
    metadata[`XMP-iptcCore:AltTextAccessibility-${language}`] = text;
  }
  if (profile.depictsPerson) {
    metadata["XMP-iptcExt:PersonInImage"] = "Saeed Ghezelbash";
    metadata["XMP-iptcExt:PersonInImageName"] = "Saeed Ghezelbash";
    metadata["XMP-iptcExt:PersonInImageId"] = [
      release.primaryEntity.id,
      personWikidataIri,
    ];
  }
  if (profile.depictsClinic) {
    metadata["XMP-iptcExt:OrganisationInImageName"] =
      "Dr. Saeed Ghezelbash Aesthetic Clinic";
    metadata["XMP-iptcExt:OrganisationInImageCode"] = [
      release.clinic.id,
      clinicWikidataIri,
    ];
  }
  if (profile.clinicLocation) {
    metadata["XMP-photoshop:City"] = "کرمانشاه";
    metadata["XMP-photoshop:State"] = "کرمانشاه";
    metadata["XMP-photoshop:Country"] = "ایران";
    metadata["XMP-iptcCore:Location"] = "Dr. Saeed Ghezelbash Aesthetic Clinic";
    metadata["XMP-iptcCore:CountryCode"] = "IR";
  }

  return metadata;
}
