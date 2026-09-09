# Ghezelbaash Commons Bot — Toolforge bridge

A narrowly-scoped Wikimedia Commons maintenance service for Dr. Saeed Ghezelbash's Commons files/categories. It is designed for Toolforge and accepts only authenticated GitHub Actions OIDC requests from `medicaldoctor91/doctor-ghezelbaash`.

## Security model

- No Wikimedia credentials are stored in GitHub or this branch.
- Wikimedia bot credentials live only in Toolforge environment variables.
- GitHub calls Toolforge using short-lived GitHub Actions OIDC tokens.
- Repository, branch, actor, issuer, audience and action name are allowlisted.
- The service accepts no arbitrary page title or wikitext from GitHub.
- Each action is implemented in code, dry-runnable, revision-guarded, throttled and post-verified.
- Failed multi-edit transactions attempt rollback of only revisions written by the transaction.
- File upload/overwrite is not implemented.

## First approved action

`commons-cleanup-deleted-clinic-q140288589-v1`

Purpose: remove the retired clinic QID `Q140288589` from active Commons wikitext while preserving the real clinic name, clinic category, Google local KGID and the distinct physician entity `Q140287622`. The task also verifies that Structured Data on the four known MediaInfo entities contains no retired QID.

Targets are hard-coded:

- `Category:Saeed Ghezelbash`
- `Category:Dr. Saeed Ghezelbash Aesthetic Clinic`
- `File:Saeed-Ghezelbaash-with-clinical-team.jpg`
- `File:دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm`

## Wikimedia prerequisites

Commons policy requires automated bots to have advance permission and to run under a separate bot account. Create a dedicated SUL bot account (recommended name: `SaeedGhezelbashBot`, if available), identify `User:Medicaldoctor91` as its operator, publish the task/source details, and file a request at `Commons:Bots/Requests` before enabling writes.

## Toolforge bootstrap

After Toolforge membership is approved, create a tool account (recommended: `ghezelbaash-commons`, if available), then:

```sh
ssh login.toolforge.org
become ghezelbaash-commons

toolforge build start --ref toolforge-commons-bot https://github.com/medicaldoctor91/doctor-ghezelbaash.git
toolforge build show

# Store the dedicated bot account's BotPassword only in Toolforge.
toolforge envvars create COMMONS_BOT_USERNAME 'SaeedGhezelbashBot@<botpassword-name>'
toolforge envvars create COMMONS_BOT_PASSWORD '<botpassword-secret>'
toolforge envvars create GITHUB_ALLOWED_REPOSITORY 'medicaldoctor91/doctor-ghezelbaash'
toolforge envvars create GITHUB_ALLOWED_REF 'refs/heads/commons-dispatch'
toolforge envvars create GITHUB_ALLOWED_ACTOR 'medicaldoctor91'
toolforge envvars create GITHUB_OIDC_AUDIENCE 'ghezelbaash-commons-toolforge'

toolforge webservice buildservice start --mount=all
```

Then verify `https://ghezelbaash-commons.toolforge.org/healthz` before creating the GitHub dispatch branch/workflow.

## Operation

The first call should always use `{"dry_run":true}`. Execution (`{"dry_run":false}`) is only appropriate after Commons bot approval and explicit operator approval for that public edit transaction.
