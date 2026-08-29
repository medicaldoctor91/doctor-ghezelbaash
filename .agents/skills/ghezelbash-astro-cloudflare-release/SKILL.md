---
name: ghezelbash-astro-cloudflare-release
description: Astro and Cloudflare Pages release workflow for medicaldoctor91/doctor-ghezelbaash. Use for builds, GitHub Actions, Cloudflare Pages deployment, custom domains, redirects, headers, CSP, caching, 404 behavior, release artifacts, rollback, and production verification. Do not use for unrelated Cloudflare Workers application design.
---

# Ghezelbash Astro and Cloudflare Release

Ship the repository's static Astro site through its existing GitHub Actions and Cloudflare Pages architecture without introducing deployment drift or secret exposure.

## Repository-first rule

Before changing or deploying anything, inspect:

- `package.json` scripts and engine constraints;
- `.nvmrc`, `.npmrc`, lockfile, and `astro.config.mjs`;
- `.github/workflows/ci.yml` and `.github/workflows/cloudflare-pages-deploy.yml`;
- release and Cloudflare scripts under `scripts/`;
- generated `_headers`, `_redirects`, manifests, descriptors, and `dist` ownership;
- the exact main-branch commit and the deployed commit.

Treat these files as the current contract. Do not substitute generic Astro or Cloudflare conventions for repository evidence.

## Safety and authorization

- Never request, print, commit, or place tokens in URLs. Use authorized connectors or secret stores with least privilege.
- Do not alter DNS, custom domains, production secrets, or account-level Cloudflare settings without explicit authorization for that exact action.
- Do not weaken CI permissions, dependency auditing, CSP, cache controls, or release attestations merely to unblock a deployment.
- Use an atomic commit and an explicit rollback commit or known-good deployment.

## Build sequence

1. Reproduce the repository's declared Node/npm environment.
2. Install from the lockfile using the repository's chosen package manager.
3. Run targeted validators for the edited layer.
4. Run `npm run check`.
5. Run `npm run build` and inspect `dist`, not only exit status.
6. For release work, run the repository's release preparation and attestation path when applicable.
7. Confirm that generated artifacts are deterministic and that source-only hygiene remains intact.

Do not commit `.generated`, `dist`, release runtime material, package-manager caches, or local credentials unless the repository explicitly declares otherwise.

## Cloudflare verification matrix

Verify the following on the intended custom domain and deployment URL:

- HTTP status and redirect chain for canonical host, `www`, HTTP, HTTPS, known subdomains, and representative unknown paths;
- genuine 404 status and content, not a soft 404 or blanket SPA fallback;
- canonical URL and host consistency;
- `Content-Type`, charset, CSP, HSTS where appropriate, referrer policy, permissions policy, frame protections, and MIME sniffing protection;
- cache-control semantics for HTML, immutable fingerprinted assets, machine-readable resources, and redirects;
- no stale asset references or integrity/fingerprint mismatch;
- robots, sitemap, manifests, feeds, descriptors, JSON-LD/RDF resources, and discovery links;
- deployed commit/revision and build artifact provenance.

Use repository commands such as `npm run validate:cloudflare`, `npm run preflight:cloudflare`, `npm run verify:subdomains`, `npm run verify:production`, and `npm run verify:public-discovery` when configured and authorized.

## Failure diagnosis

Distinguish among:

- source or generation defect;
- build defect;
- workflow configuration or permissions defect;
- secret/environment defect;
- artifact selection defect;
- Cloudflare project/domain configuration defect;
- cache propagation issue;
- transient provider incident.

Provide the failing commit, workflow/run/job/step, exact error evidence, clean fix, validation result, live verification, and rollback. Never call a workflow success equivalent to a correct production deployment without checking the served output.

## Completion standard

Completion requires passing canonical checks, a traceable deployment artifact, correct production HTTP/rendered behavior, and a documented rollback target. If account-level state cannot be inspected, mark it `UNKNOWN` and avoid claims about it.
