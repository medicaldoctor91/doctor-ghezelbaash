# Deprecated Firebase deployment note

Canonical production website:

```text
https://www.ghezelbaash.ir/
```

The canonical deployment path for this project is the Astro static build deployed through GitHub Pages Actions.

Firebase Hosting is not canonical and must not be used as a competing public mirror for the main website.

Current policy:

- GitHub Pages Actions is the production deployment path.
- Firebase operational workflows and `firebase.json` are intentionally removed from the repository.
- If any Firebase or `kg.ghezelbaash.ir` surface remains active outside this repository, it should only redirect users and crawlers toward the canonical website or the canonical `/kg/` page.
- Do not restore Firebase deployment files unless there is a deliberate redirect-only migration plan.

Redirect-only target, if needed:

```text
https://kg.ghezelbaash.ir/* -> https://www.ghezelbaash.ir/kg/
```
