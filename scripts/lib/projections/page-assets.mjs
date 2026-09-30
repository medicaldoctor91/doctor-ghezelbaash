import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { assembleCanonicalContent } from "../assemble-content.mjs";
import { deriveCssDelivery } from "../../../src/lib/css-delivery.mjs";

export async function compilePageAssets(context) {
  const { root, graph, generatedContent, generatedAssets } = context;
  const assembled = await assembleCanonicalContent({ root, graph });
  await mkdir(generatedContent, { recursive: true });
  await writeFile(path.join(generatedContent, "home.md"), assembled.content);
  const css = await readFile(path.join(root, "src/styles/global.css"), "utf8");
  const { externalCss, assetName } = deriveCssDelivery(css);
  await mkdir(generatedAssets, { recursive: true });
  await writeFile(path.join(generatedAssets, assetName), externalCss);
  return { home: assembled.content, externalCssAssetName: assetName };
}
