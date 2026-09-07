import { readFile, writeFile } from "node:fs/promises";

const path = "scripts/measure-render-calibration.mjs";
let source = await readFile(path, "utf8");
const before = `} finally {\n  try {\n    await cdp.send("Target.closeTarget", { targetId });\n  } catch {}\n  cdp.close();\n  chrome.kill("SIGTERM");\n  server.close();\n  await rm(profileDir, { recursive: true, force: true });\n}`;
const after = `} finally {\n  try {\n    await cdp.send("Target.closeTarget", { targetId });\n  } catch {}\n  cdp.close();\n  const browserExited = new Promise((resolve) => {\n    if (chrome.exitCode !== null || chrome.signalCode !== null) resolve();\n    else chrome.once("exit", resolve);\n  });\n  chrome.kill("SIGTERM");\n  await Promise.race([browserExited, sleep(3000)]);\n  if (chrome.exitCode === null && chrome.signalCode === null) {\n    chrome.kill("SIGKILL");\n    await Promise.race([browserExited, sleep(2000)]);\n  }\n  await new Promise((resolve) => server.close(resolve));\n  await rm(profileDir, {\n    recursive: true,\n    force: true,\n    maxRetries: 10,\n    retryDelay: 100,\n  });\n}`;
if (source.split(before).length - 1 !== 1)
  throw new Error("render calibration cleanup anchor drift");
source = source.replace(before, after);
await writeFile(path, source);
console.log(JSON.stringify({ patched: path, cleanup: "await-browser-exit-and-retry-rm" }, null, 2));
