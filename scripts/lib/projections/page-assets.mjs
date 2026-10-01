import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { deriveCssDelivery } from "../../../src/lib/css-delivery.mjs";

export async function compilePageAssets(context) {
  const { root, generatedAssets } = context;
  const css = await readFile(path.join(root, "src/styles/global.css"), "utf8");
  const { externalCss, assetName } = deriveCssDelivery(css);
  await mkdir(generatedAssets, { recursive: true });
  await writeFile(path.join(generatedAssets, assetName), externalCss);
  return { externalCssAssetName: assetName };
}
