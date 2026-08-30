import { appendFile, readFile, writeFile } from "node:fs/promises";
import {
  composeChangedReputation,
  evaluateGoogleReputation,
} from "./lib/reputation-observation.mjs";

async function refreshGoogle(
  placeFile = "/tmp/place.json",
  volatileFile = "src/data/volatile-facts.json",
  releaseFile = "src/data/release.json",
) {
  const [place, current, release] = await Promise.all([
    readFile(placeFile, "utf8").then(JSON.parse),
    readFile(volatileFile, "utf8").then(JSON.parse),
    readFile(releaseFile, "utf8").then(JSON.parse),
  ]);
  const evaluation = evaluateGoogleReputation({
    place,
    current,
    expectedPlaceId: release.clinic.placeId,
  });
  const checkedAt = process.env.GOOGLE_CHECKED_AT || new Date().toISOString();
  if (Number.isNaN(Date.parse(checkedAt)))
    throw new Error("Invalid Google poll checked timestamp");

  if (evaluation.changed) {
    const next = composeChangedReputation({
      current,
      evaluation,
      observedAt: checkedAt,
      release,
    });
    await writeFile(volatileFile, JSON.stringify(next, null, 2) + "\n");
    console.log(
      "GOOGLE_REPUTATION_CHANGED",
      evaluation.rating,
      evaluation.reviewCount,
      checkedAt,
    );
  } else {
    console.log(
      "GOOGLE_REPUTATION_UNCHANGED",
      evaluation.rating,
      evaluation.reviewCount,
    );
  }

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      [
        `changed=${evaluation.changed}`,
        `rating=${evaluation.rating}`,
        `review_count=${evaluation.reviewCount}`,
        `checked_at=${checkedAt}`,
        `place_id=${evaluation.placeId}`,
        "",
      ].join("\n"),
    );
  }
  console.log(
    JSON.stringify(
      {
        googleReputationPoll: "PASS",
        ...evaluation,
        lastSuccessfullyCheckedAt: checkedAt,
        publicMutation: evaluation.changed,
      },
      null,
      2,
    ),
  );
}

const [command, ...args] = process.argv.slice(2);
if (command !== "google")
  throw new Error(
    "Usage: node scripts/reputation.mjs google [place-file] [volatile-file] [release-file]",
  );
await refreshGoogle(...args);
