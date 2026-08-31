import { defineConfig } from "astro/config";
import release from "./src/data/release.json" with { type: "json" };

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
