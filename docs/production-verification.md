# Production verification

The custom domain must expose the same homepage contract as the current `main` build.

Automated verification checks:

- the compact best-doctor wrapper exists and is closed by default;
- the article uses the continuous `article-flow` layout;
- clinic postal code `6714657412` is present;
- the current RFC3339 `dateModified` value is present;
- the old accordion article layout is absent;
- standalone photo and video sections are absent.

The GitHub workflow `.github/workflows/verify-production.yml` performs these checks against the custom domain with cache-busting query parameters after each push to `main`.
