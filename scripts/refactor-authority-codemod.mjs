import { readFile, writeFile } from "node:fs/promises";

const update = async (file, mutate) => {
  const before = await readFile(file, "utf8");
  const after = mutate(before);
  if (after === before) return false;
  await writeFile(file, after, "utf8");
  return true;
};

const exactReplace = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1)
    throw new Error(`${label}: expected exactly one match, found ${count}`);
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

console.log(JSON.stringify({ changed }));
