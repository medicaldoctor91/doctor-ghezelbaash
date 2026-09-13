import { assertNoForbiddenDistributionIdentifiers } from "./lib/distribution-identifier-contract.mjs";

const roots = process.argv.slice(2);
const checked = await assertNoForbiddenDistributionIdentifiers(
  roots.length ? roots : ["dist", ".generated/projections"],
);
console.log(
  JSON.stringify(
    {
      valid: true,
      forbiddenIdentifiers: "ABSENT",
      roots: roots.length ? roots : ["dist", ".generated/projections"],
      filesChecked: checked.length,
    },
    null,
    2,
  ),
);
