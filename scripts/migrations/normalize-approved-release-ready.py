from pathlib import Path
import re

path = Path("scripts/migrations/apply-approved-release-ready.mjs")
value = path.read_text(encoding="utf-8")

value = value.replace("data.visible", "top.dataset.visible")
if "data.visible" in value or "top.dataset.visible" not in value:
    raise SystemExit("Back-to-top migration guard normalization failed")

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

lines = value.splitlines()
property_lines = [
    index
    for index, line in enumerate(lines)
    if line.strip().startswith("const propertyPattern =") and "CLINIC_MAPS_URL" in line
]
if len(property_lines) != 1:
    raise SystemExit(f"Expected one CLINIC_MAPS_URL property-pattern line, found {len(property_lines)}")
property_index = property_lines[0]
property_line = lines[property_index]
property_line = property_line.replace('(["\']?)', '(["\'])')
property_line = property_line.replace(
    "CLINIC_MAPS_URL\\2",
    "\\{\\{CLINIC_MAPS_URL\\}\\}\\2",
)
if "\\{\\{CLINIC_MAPS_URL\\}\\}" not in property_line:
    raise SystemExit("Canonical CLINIC_MAPS_URL token property guard normalization failed")
lines[property_index] = property_line
value = "\n".join(lines) + ("\n" if value.endswith("\n") else "")

old_key = 'const key = quote ? `${quote}CLINIC_REPUTATION_HTML${quote}` : "CLINIC_REPUTATION_HTML";'
new_key = 'const key = `${quote}{{CLINIC_REPUTATION_HTML}}${quote}`;'
if old_key in value:
    value = value.replace(old_key, new_key, 1)
elif new_key not in value:
    raise SystemExit("Static reputation token key guard was not found")

import_start_marker = "if (!registryText.includes(importLine)) {"
import_end_marker = "const indent = propertyMatch[1];"
import_start = value.find(import_start_marker)
import_end = value.find(import_end_marker, import_start)
if import_start < 0 or import_end < 0:
    raise SystemExit("Canonical registry import block was not found")
import_replacement = '''if (!registryText.includes(importLine)) {
  const importBoundary = registryText.indexOf("\\n\\nconst ");
  assert(importBoundary > 0, `${registry.file} has no canonical import boundary`);
  registryText = `${registryText.slice(0, importBoundary)}\\n${importLine}${registryText.slice(importBoundary)}`;
}
'''
value = value[:import_start] + import_replacement + value[import_end:]

old_skip = 'if (file === "scripts/migrations/apply-approved-release-ready.mjs") continue;'
new_skip = '''if (
    file === "scripts/migrations/apply-approved-release-ready.mjs" ||
    file === "scripts/validate-static-reputation.mjs"
  ) continue;'''
if old_skip in value:
    value = value.replace(old_skip, new_skip, 1)
elif new_skip not in value:
    raise SystemExit("Migration self-scan exclusion point was not found")

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
        "footerMachineGuard": "source-structural",
        "deletedTrackedFilesSkipped": True,
        "siteTokenProperty": "{{CLINIC_MAPS_URL}}",
        "staticReputationToken": "{{CLINIC_REPUTATION_HTML}}",
        "importBoundary": "multiline-compatible",
        "selfScan": "validator-excluded",
        "readmeArchitecture": "static-only",
    }
)
