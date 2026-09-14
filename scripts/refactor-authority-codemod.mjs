import { readFile, writeFile } from "node:fs/promises";

const update = async (file, mutate) => {
  const before = await readFile(file, "utf8");
  const after = mutate(before);
  if (after === before) return false;
  await writeFile(file, after, "utf8");
  return true;
};

const exactReplace = (source, before, after, label) => {
  if (source.includes(after)) {
    if (source.includes(before))
      throw new Error(`${label}: stale and migrated contracts coexist`);
    return source;
  }
  const count = source.split(before).length - 1;
  if (count !== 1)
    throw new Error(`${label}: expected exactly one stale match, found ${count}`);
  return source.replace(before, after);
};

const changed = [];
if (
  await update("scripts/validate-google-structured-data.mjs", (source) =>
    exactReplace(
      source,
      `  if (typeof website.name !== "string" || !website.name.trim() ||\n      website.name !== website.name.trim() ||\n      website.name !== documentHead.openGraph.siteName ||\n      website.name !== documentHead.applicationName)\n    fail(\`${"${label}"} WebSite name must be one explicit text matching homepage metadata\`);`,
      `  if (typeof website.name !== "string" || !website.name.trim() ||\n      website.name !== website.name.trim() ||\n      website.name !== canonicalWebsite.name)\n    fail(\`${"${label}"} WebSite name must preserve the canonical graph preference\`);`,
      "Google WebSite name authority",
    ),
  )
)
  changed.push("scripts/validate-google-structured-data.mjs");

if (
  await update("scripts/validate-architecture.mjs", (source) =>
    exactReplace(
      source,
      `assert(\n  /import\\s+documentHead\\s+from\\s+['"]\\.\\.\\/data\\/document-head\\.json['"]/.test(\n    documentHead,\n  ) &&\n    /import\\s+release\\s+from\\s+['"]\\.\\.\\/data\\/release\\.json['"]/.test(\n      documentHead,\n    ) &&\n    /import\\s*\\{\\s*headGraph\\s*\\}\\s*from\\s*['"]\\.\\.\\/lib\\/knowledge-graph['"]/.test(\n      documentHead,\n    ) &&\n    /HEAD_RESOURCES\\s*\\.map\\s*\\(/.test(documentHead),\n  "Document Head must use its direct metadata and resource sources",\n);`,
      `assert(\n  /import\\s+documentHead\\s+from\\s+['"]\\.\\.\\/data\\/document-head\\.json['"]/.test(\n    documentHead,\n  ) &&\n    /import\\s+release\\s+from\\s+['"]\\.\\.\\/data\\/release\\.json['"]/.test(\n      documentHead,\n    ) &&\n    /import\\s+authorityProfile\\s+from\\s+['"]\\.\\.\\/data\\/semantic\\/authority-profile\\.json['"]/.test(\n      documentHead,\n    ) &&\n    /deriveCanonicalAuthority/.test(documentHead) &&\n    !/hydrateReleaseAuthority/.test(documentHead) &&\n    /import\\s*\\{\\s*headGraph\\s*\\}\\s*from\\s*['"]\\.\\.\\/lib\\/knowledge-graph['"]/.test(\n      documentHead,\n    ) &&\n    /HEAD_RESOURCES\\s*\\.map\\s*\\(/.test(documentHead) &&\n    /exactLanguageLiteral\\(\\s*person\\.name/.test(documentHead) &&\n    /exactText\\(website\\.name/.test(documentHead) &&\n    /authority\\.primaryEntity\\.verifiedWebIdentityMesh/.test(documentHead) &&\n    /authority\\.clinicAuthority\\.cid/.test(documentHead) &&\n    !/documentHead\\.(?:author|applicationName)/.test(documentHead) &&\n    !/documentHead\\.openGraph\\.siteName/.test(documentHead),\n  "Document Head must derive semantic identity directly from graph-owned authority while consuming presentation and release lifecycle policy explicitly",\n);`,
      "Document Head architecture authority",
    ),
  )
)
  changed.push("scripts/validate-architecture.mjs");

console.log(JSON.stringify({ changed }));
