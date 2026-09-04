import { appendFile, readFile, rename, writeFile } from "node:fs/promises";
import {
  composeReputationObservation,
  evaluateGoogleReputation,
  validateReputationObservation,
} from "../src/lib/reputation-observation.mjs";

const sourceFile = "src/data/reputation-observation.json";
const readJson = (file) => readFile(file, "utf8").then(JSON.parse);

const writeAtomic = async (file, value) => {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporary, file);
};

const writeOutput = async (values) => {
  const file = process.env.GITHUB_OUTPUT?.trim();
  if (!file) return;
  await appendFile(
    file,
    Object.entries(values)
      .map(([key, value]) => `${key}=${String(value)}\n`)
      .join(""),
  );
};

async function validate() {
  const [release, observation] = await Promise.all([
    readJson("src/data/release.json"),
    readJson(sourceFile),
  ]);
  const canonical = validateReputationObservation(observation, release);
  console.log(
    JSON.stringify(
      {
        staticClinicReputation: "PASS",
        entity: canonical.entity,
        placeId: canonical.placeId,
        rating: canonical.rating,
        reviewCount: canonical.reviewCount,
        valueObservedAt: canonical.valueObservedAt,
      },
      null,
      2,
    ),
  );
}

async function google(placeFile = "/tmp/google-place.json") {
  const [release, current, place] = await Promise.all([
    readJson("src/data/release.json"),
    readJson(sourceFile),
    readJson(placeFile),
  ]);
  const evaluation = evaluateGoogleReputation({ place, current, release });
  const observedAt =
    process.env.GOOGLE_CHECKED_AT ||
    new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  if (evaluation.changed) {
    const next = composeReputationObservation({
      evaluation,
      release,
      observedAt,
    });
    await writeAtomic(sourceFile, next);
  }
  await writeOutput({
    changed: evaluation.changed,
    rating: evaluation.rating,
    review_count: evaluation.reviewCount,
  });
  console.log(
    JSON.stringify(
      {
        googleReputationPoll: "PASS",
        requestCount: 1,
        changed: evaluation.changed,
        rating: evaluation.rating,
        reviewCount: evaluation.reviewCount,
      },
      null,
      2,
    ),
  );
}

const [command, argument] = process.argv.slice(2);
if (command === "validate") await validate();
else if (command === "google") await google(argument);
else
  throw new Error(
    "Usage: node scripts/reputation.mjs <validate|google> [place.json]",
  );
