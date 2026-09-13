import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { FORBIDDEN_QIDS } from "./active-identifier-contract.mjs";

const normalizedText = (bytes) =>
  bytes
    .toString("utf8")
    .replace(/\\u0051/gi, "Q")
    .replace(/%51/gi, "Q")
    .replace(/&#(?:81|x0*51);/gi, "Q");

const walkFiles = async (directory, prefix = "") => {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  )) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walkFiles(target, relative)));
    else if (entry.isFile()) files.push({ relative, target });
  }
  return files;
};

export async function assertNoForbiddenDistributionIdentifiers(
  roots,
  { cwd = process.cwd(), requireRoots = true } = {},
) {
  if (!Array.isArray(roots) || !roots.length)
    throw new Error("Distribution identifier gate requires at least one root");
  const checked = [];
  for (const relativeRoot of roots) {
    const root = path.resolve(cwd, relativeRoot);
    try {
      await access(root);
    } catch (error) {
      if (!requireRoots && error?.code === "ENOENT") continue;
      throw new Error(`Distribution identifier root missing: ${relativeRoot}`);
    }
    for (const file of await walkFiles(root)) {
      const bytes = await readFile(file.target);
      const text = normalizedText(bytes);
      for (const qid of FORBIDDEN_QIDS) {
        const raw = Buffer.from(qid, "utf8");
        if (bytes.includes(raw) || text.includes(qid))
          throw new Error(
            `Forbidden retired identifier ${qid} leaked into distribution ${relativeRoot}/${file.relative}`,
          );
      }
      checked.push(`${relativeRoot}/${file.relative}`);
    }
  }
  if (!checked.length) throw new Error("Distribution identifier gate checked no files");
  return checked.sort();
}
