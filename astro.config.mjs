import { defineConfig } from 'astro/config';
import { html5Output } from './src/integrations/html5-output.mjs';

export default defineConfig({site:'https://www.ghezelbaash.ir',output:'static',trailingSlash:'always',compressHTML:true,integrations:[html5Output()],build:{format:'directory',inlineStylesheets:'always'},vite:{build:{sourcemap:false}}});
