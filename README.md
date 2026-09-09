# Commons dispatch control branch

This branch is intentionally separate from the website source. A push to `commons-dispatch` can request one hard-coded Commons maintenance action from the Toolforge service, authenticated with GitHub Actions OIDC.

`dispatch.json` is **disabled by default**. Enabling an execution is an account/public-action event and should only be committed after explicit operator approval and after the corresponding Commons bot task is approved.

The Toolforge service independently validates the GitHub repository, branch, actor, OIDC audience/issuer and action allowlist; editing this branch cannot make it execute arbitrary MediaWiki code.
