import { defineConfig } from 'astro/config';
import rehypeLanguageRegions from './scripts/lib/rehype-language-regions.mjs';

export default defineConfig({
  site:'https://www.ghezelbaash.ir',
  output:'static',
  trailingSlash:'always',
  compressHTML:true,
  markdown:{rehypePlugins:[rehypeLanguageRegions]},
  build:{format:'directory',inlineStylesheets:'always'},
  vite:{build:{sourcemap:false}}
});
