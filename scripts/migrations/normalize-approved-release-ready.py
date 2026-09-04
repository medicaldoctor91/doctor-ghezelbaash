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

path.write_text(value, encoding="utf-8")
print(
    {
        "migrationNormalizer": "PASS",
        "backToTopGuard": "top.dataset.visible",
        "footerMachineGuard": "source-structural",
        "deletedTrackedFilesSkipped": True,
        "siteTokenProperty": "{{CLINIC_MAPS_URL}}",
        "staticReputationToken": "{{CLINIC_REPUTATION_HTML}}",
        "importBoundary": "multiline-compatible",
    }
)
