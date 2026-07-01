# Dr. Saeed Ghezelbaash — AstroWind SEO Shell

Astro/AstroWind-style static website shell for Dr. Saeed Ghezelbaash.

## Goals

- static, fast, SEO/AEO-ready site
- Persian RTL layout
- canonical metadata and sitemap
- independent JSON-LD graph injection
- small route set for the final website

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Final routes

- `/`
- `/about/`
- `/services/`
- `/contact/`
- `/botox/`
- `/filler/`
- `/thread-lift/`
- `/skin-rejuvenation/`

## JSON-LD graph

Base graph file:

```txt
src/data/graph.ts
```

Injection component:

```txt
src/components/seo/JsonLdGraph.astro
```

The template keeps JSON-LD graph output separated from metadata/canonical output.
