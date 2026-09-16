import { spawn } from "node:child_process";
import { transientReason } from "./lib/transient-retry.mjs";

const separator = process.argv.indexOf("--");
const command = separator >= 0 ? process.argv[separator + 1] : undefined;
const args = separator >= 0 ? process.argv.slice(separator + 2) : [];
if (!command)
  throw new Error(
    "Usage: node scripts/run-transient-command.mjs -- <command> [args...]",
  );

const attempts = 4;
const baseDelayMs = 500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runOnce = () =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
      shell: false,
    });
    let combined = "";
    const capture = (chunk, stream) => {
      stream.write(chunk);
      if (combined.length < 4 * 1024 * 1024)
        combined += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk) => capture(chunk, process.stdout));
    child.stderr.on("data", (chunk) => capture(chunk, process.stderr));
    child.on("error", reject);
    child.on("close", (code, signal) =>
      resolve({ code: code ?? 1, signal, combined }),
    );
  });

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  let result;
  try {
    result = await runOnce();
  } catch (error) {
    const reason = transientReason(error);
    if (!reason) throw error;
    result = { code: 1, signal: null, combined: String(error?.stack || error) };
  }
  if (result.code === 0) process.exit(0);
  const reason = transientReason(result.combined);
  if (!reason) {
    console.error(
      `CONTENT_DRIFT command=${command} exit=${result.code} signal=${result.signal || "none"}`,
    );
    process.exit(result.code || 1);
  }
  if (attempt === attempts) {
    console.error(
      `TRANSPORT_UNSTABLE command=${command} exhausted=${attempts} reason=${reason}`,
    );
    process.exit(result.code || 1);
  }
  const delayMs = baseDelayMs * 2 ** (attempt - 1);
  console.error(
    `TRANSIENT_COMMAND_RETRY attempt=${attempt}/${attempts} delayMs=${delayMs} reason=${reason} command=${command}`,
  );
  await sleep(delayMs);
}
