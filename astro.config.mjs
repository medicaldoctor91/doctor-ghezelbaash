import { defineConfig } from 'astro/config';
// Canonical extensionless files avoid directory-to-slash redirects on Pages.
export default defineConfig({output:'static',trailingSlash:'never',build:{format:'file'}});
