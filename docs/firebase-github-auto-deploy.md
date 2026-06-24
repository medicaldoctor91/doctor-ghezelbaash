# Firebase Hosting auto-deploy for kg.ghezelbaash.ir

This repository is configured for Firebase Hosting with:

- Firebase project: `ghezelbaash-kg`
- Hosting public directory: repository root (`.`)
- Production domain: `kg.ghezelbaash.ir`
- GitHub branch for production deploys: `main`

## What the workflow does

After this PR is merged, every push to `main` runs GitHub Actions and deploys the current repository state to the Firebase Hosting live channel.

The workflow file is:

```text
.github/workflows/firebase-hosting-live.yml
```

## Required GitHub secret

Create one repository secret with either of these names:

```text
FIREBASE_SERVICE_ACCOUNT_GHEZELBAASH_KG
```

or:

```text
FIREBASE_SERVICE_ACCOUNT
```

The value must be the complete Firebase service account JSON for the Firebase project `ghezelbaash-kg`.

## Mobile setup path

1. Open GitHub repository: `medicaldoctor91/doctor-ghezelbaash`
2. Go to `Settings`
3. Go to `Secrets and variables`
4. Open `Actions`
5. Tap `New repository secret`
6. Name: `FIREBASE_SERVICE_ACCOUNT_GHEZELBAASH_KG`
7. Value: paste the full service account JSON
8. Save
9. Merge the PR
10. Any later commit to `main` deploys automatically

## Firebase service account source

Use a Firebase service account that has permission to deploy Firebase Hosting for `ghezelbaash-kg`. Keep the JSON private and only store it in GitHub Actions secrets, not in the repository.

## Manual deploy trigger

The workflow also supports manual runs from GitHub Actions through `workflow_dispatch`.
