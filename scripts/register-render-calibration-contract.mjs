import { readFile, writeFile } from "node:fs/promises";

const path = "package.json";
const pkg = JSON.parse(await readFile(path, "utf8"));
if (!pkg?.scripts || typeof pkg.scripts !== "object")
  throw new Error("package scripts are missing");
for (const name of ["validate:render-calibration", "render:calibration:measure"])
  if (Object.hasOwn(pkg.scripts, name))
    throw new Error(`${name} already exists`);

pkg.scripts["validate:render-calibration"] =
  "node scripts/validate-render-calibration.mjs";
pkg.scripts["render:calibration:measure"] =
  "npm run prepare:site && ASTRO_TELEMETRY_DISABLED=1 astro build && npm run materialize:static && node scripts/measure-render-calibration.mjs --write && npm run validate:render-calibration";

const anchor =
  "npm run validate:hygiene && npm run test:security-gate && npm run validate:architecture && npm run validate:media-manifest";
if (
  typeof pkg.scripts["validate:source"] !== "string" ||
  pkg.scripts["validate:source"].split(anchor).length - 1 !== 1
)
  throw new Error("validate:source calibration registration anchor drift");
pkg.scripts["validate:source"] = pkg.scripts["validate:source"].replace(
  anchor,
  "npm run validate:hygiene && npm run test:security-gate && npm run validate:architecture && npm run validate:render-calibration && npm run validate:media-manifest",
);

await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      registered: true,
      validation: pkg.scripts["validate:render-calibration"],
      measurement: pkg.scripts["render:calibration:measure"],
    },
    null,
    2,
  ),
);
