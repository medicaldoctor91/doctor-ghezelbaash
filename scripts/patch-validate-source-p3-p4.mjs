import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/validate-source.mjs";
let source = await readFile(path, "utf8");
const before = `  ],
  [
    "stack-monitor.yml",
    stackMonitorWorkflow,
    new Map([
      [
        "node scripts/huggingface.mjs push .release/huggingface-monitor HEAD:main",
        1,
      ],
    ]),
  ],
];
for (const [name, source, commands] of hfMutationWorkflows) {`;
const after = `  ],
];
for (const forbidden of [
  "node scripts/huggingface.mjs push",
  "HF_TOKEN",
  "CLOUDFLARE_API_TOKEN",
  "configure-cloudflare-edge.py",
  "cloudflare-pages.mjs ensure --configure",
])
  if (stackMonitorWorkflow.includes(forbidden))
    fail(\`stack-monitor.yml must remain read-only: \${forbidden}\`);
if (/git\\s+(?:-C\\s+\\S+\\s+)?push\\b/.test(stackMonitorWorkflow))
  fail("stack-monitor.yml must not contain a Git push path");
for (const [name, source, commands] of hfMutationWorkflows) {`;
const count = source.split(before).length - 1;
if (count !== 1)
  throw new Error(`Hugging Face workflow ownership patch cardinality drift: ${count}`);
source = source.replace(before, after);
if (source.includes("huggingface-monitor HEAD:main"))
  throw new Error("Legacy stack-monitor Hugging Face publication ownership remains");
await writeFile(path, source);
console.log(JSON.stringify({ patched: true, stackMonitor: "READ_VERIFY_REPORT", publisher: "hugging-face-authority.yml" }));
