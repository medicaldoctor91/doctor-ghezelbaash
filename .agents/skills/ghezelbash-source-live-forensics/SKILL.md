---
name: ghezelbash-source-live-forensics
description: Forensic source-to-live diagnosis and implementation for medicaldoctor91/doctor-ghezelbaash and ghezelbaash.ir. Use for consequential repository changes, deployment drift, generated-output defects, HTTP/header/cache/redirect problems, GitHub Actions failures, or any task requiring reconciliation of source, build, deploy, and live evidence. Do not use for isolated prose-only edits.
---

# Ghezelbash Source-to-Live Forensics

Operate as the repository's causal-debugging and implementation workflow. Optimize for durable authority, factual integrity, production correctness, and reversible changes.

## Invariants

- Preserve one canonical user-facing HTML mega-landing page plus a genuine `404` route. Do not split the visible site into multiple pages by convention.
- Treat the repository, generated workspace, `dist`, workflows, Cloudflare Pages deployment, live HTTP responses, rendered DOM, and machine-readable resources as one system.
- Never bypass an existing validator merely to make a check green. Fix the underlying source or contract.
- Keep secrets out of source, logs, URLs, commits, and generated artifacts.
- Report primarily in Persian while preserving exact identifiers, paths, commands, and protocol terms.

## Required evidence order

1. Read the exact repository state before prescribing a change: current commit, `package.json`, `astro.config.mjs`, relevant source, validators, and workflows.
2. Inspect generated and build ownership: `.generated` producers, `dist` materialization, headers/redirects generation, and release contracts.
3. Inspect CI/deployment evidence: workflow run, job, failing step, commit SHA, artifact, and deployment target.
4. Inspect live behavior with both `HEAD` and `GET` where meaningful: status, redirect chain, canonical host, cache headers, CSP/security headers, content type, body, rendered DOM, and referenced assets.
5. Trace in both directions:
   - source/config/workflow → generation → build → deploy → live symptom;
   - live symptom → response/cache/asset/runtime → deployment → exact source owner.

## Finding contract

For every material finding, label it as `VERIFIED FACT`, `OBSERVATION`, `INFERENCE`, `HYPOTHESIS`, or `UNKNOWN`, then provide:

- location and exact evidence;
- root cause rather than symptom;
- authority, indexing, user, security, or operational impact;
- minimal clean fix;
- local test and expected result;
- live verification method;
- rollback path.

Do not turn an inference into a fact. Stop a consequential decision path when decisive evidence remains unavailable.

## Change workflow

1. Prefer the repository's existing architecture and package scripts over one-off patches.
2. Keep changes atomic and narrowly scoped. Avoid temporary files, duplicate authorities, generated artifacts in Git, and maintenance residue.
3. Before changing a file, inspect every validator that governs its topology or content.
4. Use the package manager and engine constraints declared by the repository.
5. Run the narrowest relevant checks first, then the canonical gates. Typical escalation:
   - targeted script or validator;
   - `npm run check`;
   - `npm run build`;
   - relevant production verification such as `npm run verify:production`, `npm run verify:subdomains`, or `npm run verify:public-discovery` when network and authorization are available.
6. For release-grade changes, also run the repository's release preparation/attestation path when applicable.
7. Verify the deployed commit and live output before claiming completion.

## Deployment drift checks

Explicitly test for:

- source commit differing from deployed commit;
- wrong Cloudflare Pages project, branch, custom domain, or environment;
- stale edge/browser cache masking a correct build;
- `_headers` or `_redirects` generated differently from source intent;
- canonical, alternate host, and subdomain disagreements;
- HTML and machine-readable projections generated from different authorities;
- a successful workflow that published the wrong artifact;
- live assets referencing deleted or fingerprint-mismatched files.

## Completion standard

A task is complete only when the intended source is committed, canonical checks pass, the expected deployment artifact is identified, live behavior matches the intended commit, and rollback remains explicit. If live verification is not possible, state that boundary precisely and do not claim live success.
