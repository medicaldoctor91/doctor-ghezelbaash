import { readFile, writeFile } from "node:fs/promises";

const measurePath = "scripts/measure-render-calibration.mjs";
const registerPath = "scripts/register-render-calibration-contract.mjs";
const workflowPath = ".github/workflows/finalize-render-calibration-contract.yml";

let measure = await readFile(measurePath, "utf8");
const oldFs = `import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";`;
const newFs = `import { copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";`;
if (measure.split(oldFs).length - 1 !== 1) throw new Error("measure fs import anchor drift");
measure = measure.replace(oldFs, newFs);
const oldCssImport = `import { RENDER_CALIBRATION_WIDTHS, renderCalibrationCss } from "../src/lib/css-delivery.mjs";`;
const newCssImport = `import {\n  assembleCssSource,\n  deriveCssDelivery,\n  RENDER_CALIBRATION_WIDTHS,\n  renderCalibrationCss,\n} from "../src/lib/css-delivery.mjs";`;
if (measure.split(oldCssImport).length - 1 !== 1) throw new Error("measure css import anchor drift");
measure = measure.replace(oldCssImport, newCssImport);
const oldBaseline = `const baselineRaw = await readFile(canonicalPath, "utf8");\nconst baselineValidation = renderCalibrationCss(baselineRaw);`;
const newBaseline = `const baselineRaw = await readFile(canonicalPath, "utf8");\nconst authoredCss = await readFile(path.join(root, "src/styles/global.css"), "utf8");\nconst { cssSource } = assembleCssSource(authoredCss, baselineRaw);\nconst delivery = deriveCssDelivery(cssSource);\nconst generatedCss = path.join(root, ".generated/public/assets", delivery.assetName);\nconst distCss = path.join(distDir, "assets", delivery.assetName);\nawait mkdir(path.dirname(distCss), { recursive: true });\nawait copyFile(generatedCss, distCss);\nconst baselineValidation = renderCalibrationCss(baselineRaw);`;
if (measure.split(oldBaseline).length - 1 !== 1) throw new Error("measure baseline anchor drift");
measure = measure.replace(oldBaseline, newBaseline);
await writeFile(measurePath, measure);

let register = await readFile(registerPath, "utf8");
const oldCommand = `  "npm run prepare:site && ASTRO_TELEMETRY_DISABLED=1 astro build && npm run materialize:static && node scripts/measure-render-calibration.mjs --write && npm run validate:render-calibration";`;
const newCommand = `  "npm run prepare:site && ASTRO_TELEMETRY_DISABLED=1 astro build && node scripts/measure-render-calibration.mjs --write && npm run validate:render-calibration";`;
if (register.split(oldCommand).length - 1 !== 1) throw new Error("register measurement command anchor drift");
register = register.replace(oldCommand, newCommand);
await writeFile(registerPath, register);

let workflow = await readFile(workflowPath, "utf8");
const oldBuild = `          npm run prepare:site\n          ASTRO_TELEMETRY_DISABLED=1 ./node_modules/.bin/astro build\n          npm run materialize:static`;
const newBuild = `          npm run prepare:site\n          ASTRO_TELEMETRY_DISABLED=1 ./node_modules/.bin/astro build`;
if (workflow.split(oldBuild).length - 1 !== 1) throw new Error("finalization build anchor drift");
workflow = workflow.replace(oldBuild, newBuild);
await writeFile(workflowPath, workflow);

console.log(JSON.stringify({ patched: [measurePath, registerPath, workflowPath], cssMaterialization: "exact-generated-site-asset" }, null, 2));
