# Deployment status

Date: 2026-06-27

## Current deployment path

The canonical deployment path is GitHub Pages via Astro:

```text
.github/workflows/astro-pages.yml
```

The workflow builds on pushes to `main` and on manual dispatch.

## Current hardening state

The workflow is hardened for the current repository state:

- It uses Node.js 20.
- It configures GitHub Pages before build.
- It prints Node/npm versions during the run.
- It detects whether `package-lock.json` exists.
- If `package-lock.json` exists, it runs `npm ci --no-audit --no-fund`.
- If `package-lock.json` is missing, it falls back to `npm install --no-audit --no-fund`.
- It runs `npm run build`, which includes public asset preparation, Astro build and dist validation.
- It uploads `dist` as the GitHub Pages artifact.
- It deploys with `actions/deploy-pages@v4`.

## Known remaining deployment task

`package-lock.json` is not yet committed. Until it exists, the workflow intentionally uses the npm install fallback.

Recommended local or StackBlitz sequence:

```bash
npm install
npm run build
git add package-lock.json
git commit -m "Add package lock for reproducible Astro build"
git push
```

After that, the existing workflow will automatically use `npm ci`.

## Domain note

Custom domain, DNS and live-domain verification are intentionally deferred until the site is structurally and content-wise complete.
