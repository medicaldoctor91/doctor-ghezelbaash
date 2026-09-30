import { defineConfig } from "astro/config";
import { canonicalLifecycle as release } from "./src/lib/canonical-inputs.mjs";

export default defineConfig({
  site: release.canonicalUrl,
  output: "static",
  trailingSlash: "always",
  compressHTML: true,
  build: {
    format: "directory",
    inlineStylesheets: "always",
  },
  vite: {
    build: {
      emptyOutDir: true,
      sourcemap: false,
    },
  },
});
