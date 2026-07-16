import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://www.ghezelbaash.ir',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
});
