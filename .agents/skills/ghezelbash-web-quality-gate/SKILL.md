---
name: ghezelbash-web-quality-gate
description: Browser, visual, accessibility, semantic HTML, performance, and technical SEO quality gate for the Ghezelbash single-page Astro website. Use for design changes, responsive regressions, RTL/Persian rendering, Core Web Vitals, media/font loading, crawler-visible HTML, interaction defects, screenshots, or release QA. Do not use as a license for broad redesign when a targeted fix is sufficient.
---

# Ghezelbash Web Quality Gate

Validate the actual user and crawler experience while preserving the project's single-page architecture, authority model, and restrained visual direction.

## Product constraints

- Preserve one canonical visible mega-landing and a genuine 404.
- Keep Persian/RTL behavior intentional; verify mixed Persian, English, numerals, URLs, and technical identifiers.
- Avoid gratuitous card/box fragmentation, generic dashboard styling, decorative clutter, and motion without communicative value.
- Favor semantic HTML, progressive enhancement, minimal JavaScript, strong typography, and content hierarchy.
- Do not trade factual clarity, crawlability, accessibility, or performance for a synthetic score or visual effect.

## Source and build checks

Before browser testing, inspect the relevant components, global stylesheet, content source, head/resource registries, media manifest, and validators. Run the repository-owned subset appropriate to the change, including:

- `npm run validate:semantic-html`
- `npm run validate:language-contract`
- `npm run validate:media-presentation`
- `npm run validate:source`
- `npm run check`
- `npm run build`

Inspect rendered `dist` output after build. Do not assume Astro source structure equals crawler-visible HTML.

## Browser matrix

Use the available browser/Playwright capability without adding dependencies unless necessary and authorized. Test at representative narrow mobile, large mobile, tablet, laptop, and wide desktop viewports. At minimum inspect:

- first viewport and primary identity clarity;
- navigation, anchors, CTAs, telephone/chat/map links, and keyboard operation;
- RTL layout, line breaking, bidi isolation, font fallback, and zoom up to 200%;
- focus order, visible focus, skip/navigation semantics, landmarks, heading hierarchy, labels, and accessible names;
- reduced-motion behavior and motion-triggered layout shift;
- image dimensions, responsive candidates, decoding/loading priority, alt text, and broken media;
- console errors, failed requests, mixed content, CSP violations, and hydration/runtime errors;
- 404 route status, appearance, navigation recovery, and canonical behavior.

Capture screenshots only when they add evidence. Compare the same viewport and state before and after a change.

## Performance review

Diagnose causes rather than optimizing a headline score. Measure or inspect:

- LCP candidate and request priority;
- CLS sources from media, fonts, dynamic content, or late CSS;
- INP risks from event handlers, long tasks, and unnecessary hydration;
- render-blocking CSS/fonts/scripts;
- font subset/format/preload behavior and fallback metric compatibility;
- image format, dimensions, responsive sizing, compression, caching, and offscreen loading;
- unused JavaScript/CSS and third-party scripts;
- HTML payload and machine-resource discoverability.

Preserve high-value visible content and structured evidence. Do not hide essential material behind client-only interactions merely to reduce initial HTML.

## Technical SEO and retrieval checks

Verify in built and live HTML:

- title, description, canonical, robots, language, direction, viewport, and social metadata;
- exactly one intended primary heading and a coherent heading outline;
- crawlable links and meaningful anchor text;
- physician/clinic entity distinctions and structured-data parity;
- no soft 404, redirect loop, duplicate canonical host, or hidden contradictory text;
- discovery links to sitemaps, feeds, descriptors, and machine-readable resources;
- content visible without requiring client JavaScript.

## Reporting

Report issues by severity and causal impact. Each issue must include viewport/state, reproduction, evidence, source owner, impact, fix, test, and rollback. Separate visual preference from accessibility failure, performance regression, semantic defect, and indexing risk.

A release passes only when canonical source checks, built-output inspection, browser behavior, and live HTTP/rendered verification agree. If one layer is unavailable, identify the unverified layer explicitly.
