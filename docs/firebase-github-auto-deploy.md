# Legacy Firebase redirect policy

Canonical website:

```text
https://www.ghezelbaash.ir/
```

Firebase Hosting is not the canonical public website for this project.

If `kg.ghezelbaash.ir` remains active, it should behave only as a redirect layer:

```text
https://kg.ghezelbaash.ir/* -> https://www.ghezelbaash.ir/kg/
```

The workflow `.github/workflows/firebase-hosting-live.yml` is manual-only and deploys the redirect-only `firebase.json`.

Do not use Firebase as a competing mirror of the canonical website.
