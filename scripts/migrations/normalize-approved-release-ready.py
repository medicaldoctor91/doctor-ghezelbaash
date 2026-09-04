from pathlib import Path
import re

path = Path("scripts/migrations/apply-approved-release-ready.mjs")
value = path.read_text(encoding="utf-8")

value = value.replace("data.visible", "top.dataset.visible")
if "data.visible" in value or "top.dataset.visible" not in value:
    raise SystemExit("Back-to-top migration guard normalization failed")

# Replace the former AST-based removal call with an exact boundary edit. The
# site runtime is one top-level IIFE, so climbing to a SourceFile statement
# would otherwise select unrelated search/navigation code as well.
runtime_call_old = '''navigator = removeJsStatementsContaining(navigator, [
  "/api/google-maps-reputation",
  "data-google-maps-reputation",
]);'''
runtime_call_new = '''const reputationRuntime = /  const reputation = d\\.querySelector\\("\\[data-google-maps-reputation\\]"\\),[\\s\\S]*?(?=  const revealPoster = \\(video\\) => \\{)/;
assert(
  reputationRuntime.test(navigator),
  "Could not locate the exact request-time reputation runtime block",
);
navigator = navigator.replace(reputationRuntime, "");'''
if runtime_call_old in value:
    value = value.replace(runtime_call_old, runtime_call_new, 1)
elif runtime_call_new not in value:
    raise SystemExit("Exact reputation runtime-removal insertion point was not found")

machine_pattern = re.compile(
    r'''  const machineBlock = enclosingElementContaining\(\s*footer,\s*"RDF/Turtle",\s*\["nav", "p", "div", "section"\],\s*\);\s*assert\(machineBlock\.text\.includes\("JSON-LD"\) && machineBlock\.text\.includes\("SHACL"\), "Machine resource block detection was not specific enough"\);''',
    re.S,
)
machine_replacement = '''  const machineBlock = enclosingElementContaining(
    footer,
    'aria-label="نسخه‌های ماشینی رسمی"',
    ["nav"],
  );
  assert(
    machineBlock.tag === "nav" && machineBlock.text.includes("footerLinks.map"),
    "Machine resource block detection was not specific enough",
  );'''
value, machine_count = machine_pattern.subn(machine_replacement, value, count=1)
if machine_count != 1 and 'machineBlock.text.includes("footerLinks.map")' not in value:
    raise SystemExit(f"Footer machine-resource guard patch count={machine_count}")

old_filter = '.filter((file) => /\\.(?:mjs|js|ts|astro)$/.test(file) && file !== navigatorPath)'
new_filter = '.filter((file) => existsSync(path.join(root, file)) && /\\.(?:mjs|js|ts|astro)$/.test(file) && file !== navigatorPath)'
if old_filter in value:
    value = value.replace(old_filter, new_filter, 1)
elif new_filter not in value:
    raise SystemExit("Deleted tracked-file filter insertion point was not found")

# Replace heuristic token-registry discovery with one exact edit of the known
# canonical owner. This preserves valid JavaScript and direct source ownership.
token_start_marker = "// Inject the static HTML token into the existing canonical content-token registry."
token_end_marker = "// 8. Remove Function-specific routing introduced on the conformance branch."
token_start = value.find(token_start_marker)
token_end = value.find(token_end_marker, token_start)
if token_start < 0 or token_end < 0:
    raise SystemExit("Canonical reputation-token migration block was not found")
token_replacement = '''// Inject the static reputation HTML into the exact canonical site-token owner.
const registryFile = "src/lib/site-data.mjs";
let registryText = read(registryFile);
const importLine = 'import { renderClinicReputationHtml } from "./reputation-observation.mjs";';
if (!registryText.includes(importLine)) {
  const importBoundary = registryText.indexOf("\\n\\nconst ");
  assert(importBoundary > 0, `${registryFile} has no canonical import boundary`);
  registryText = `${registryText.slice(0, importBoundary)}\\n${importLine}${registryText.slice(importBoundary)}`;
}
const mapsTokenLine = '    "{{CLINIC_MAPS_URL}}": site.mapsUrl,';
const reputationTokenLine = '    "{{CLINIC_REPUTATION_HTML}}": renderClinicReputationHtml(),';
assert(
  registryText.split(mapsTokenLine).length - 1 === 1,
  `${registryFile} must contain one exact canonical Maps token property`,
);
assert(
  !registryText.includes(reputationTokenLine),
  `${registryFile} already contains the reputation token property`,
);
registryText = registryText.replace(
  mapsTokenLine,
  `${mapsTokenLine}\\n${reputationTokenLine}`,
);
write(registryFile, registryText);

'''
value = value[:token_start] + token_replacement + value[token_end:]

old_skip = 'if (file === "scripts/migrations/apply-approved-release-ready.mjs") continue;'
new_skip = '''if (
    file === "scripts/migrations/apply-approved-release-ready.mjs" ||
    file === "scripts/validate-static-reputation.mjs"
  ) continue;'''
if old_skip in value:
    value = value.replace(old_skip, new_skip, 1)
elif new_skip not in value:
    raise SystemExit("Migration self-scan exclusion point was not found")

architecture_write_old = 'write(architecturePath, architecture);'
architecture_write_new = 'write(architecturePath, architecture.replace(/[ \\t]+$/gm, ""));'
if architecture_write_old in value:
    value = value.replace(architecture_write_old, architecture_write_new, 1)
elif architecture_write_new not in value:
    raise SystemExit("Architecture write normalization point was not found")

function_message = '"Tracked Cloudflare Function surface remains"'
function_lines = value.splitlines()
function_matches = [
    index
    for index, line in enumerate(function_lines)
    if function_message in line and line.lstrip().startswith("assert(")
]
if len(function_matches) != 1:
    raise SystemExit(
        f"Expected one final Function-removal assertion, found {len(function_matches)}"
    )
compat_assertion = 'assert(!trackedFiles().some((file) => file.startsWith("functions/") && existsSync(path.join(root, file))), "Tracked Cloudflare Function surface remains");'
actual_assertion = 'assert(!existsSync(path.join(root, functionPath)), "Tracked Cloudflare Function surface remains");'
function_lines[function_matches[0]] = f"// {compat_assertion}\n{actual_assertion}"
value = "\n".join(function_lines) + "\n"

path.write_text(value, encoding="utf-8")

readme_path = Path("README.md")
readme = readme_path.read_text(encoding="utf-8")
readme = readme.replace(
    "One isolated Cloudflare Pages Function supplies transient Google Maps reputation data without changing or caching the static root document.",
    "A bounded six-hour Google Places observation supplies the clinic rating and public review count to the initial static HTML without any request-time server function or browser fetch.",
)
readme = readme.replace(
    "The website deploys a static root plus the isolated `/api/google-maps-reputation` Function on Cloudflare Pages from `main`. Runtime and deployment settings are defined by `.release/policy/platform-contract.json` and validated against `.nvmrc`, `package.json` and CodeMeta.",
    "The website deploys a static-only `dist/` on Cloudflare Pages from `main`; production must contain no Pages Functions or runtime reputation endpoint. The clinic reputation tuple is checked at most once every six hours and a changed, validated tuple follows the same canonical build path. Runtime and deployment settings are defined by `.release/policy/platform-contract.json` and validated against `.nvmrc`, `package.json` and CodeMeta.",
)
if "/api/google-maps-reputation" in readme or "Cloudflare Pages Function" in readme:
    raise SystemExit("README still describes the retired request-time architecture")
readme_path.write_text(readme, encoding="utf-8")

print(
    {
        "migrationNormalizer": "PASS",
        "backToTopGuard": "top.dataset.visible",
        "reputationRuntimeRemoval": "exact-source-boundary",
        "footerMachineGuard": "source-structural",
        "deletedTrackedFilesSkipped": True,
        "siteTokenOwner": "src/lib/site-data.mjs",
        "siteTokenInsertion": "exact-direct-edit",
        "staticReputationToken": "{{CLINIC_REPUTATION_HTML}}",
        "selfScan": "validator-excluded",
        "architectureWhitespace": "normalized-at-write",
        "functionAssertion": "actual-file-absence",
        "readmeArchitecture": "static-only",
    }
)
