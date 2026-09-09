# Draft — Commons bot request

**Proposed bot:** `User:SaeedGhezelbashBot` (or another available name ending in `Bot`)

**Operator:** `User:Medicaldoctor91`

**Disclosure:** The operator is Dr. Saeed Ghezelbash, the subject of the physician category/files and owner/physician of the related clinic. The bot is therefore intentionally limited to transparent maintenance of pages/files in this narrow scope and will not create claims of independent notability or fabricate third-party evidence.

**Source:** `https://github.com/medicaldoctor91/doctor-ghezelbaash/tree/toolforge-commons-bot`

**Hosting:** Wikimedia Toolforge.

**Initial task:** bounded cleanup and consistency maintenance for Commons pages/Structured Data concerning `Saeed Ghezelbash (Q140287622)` and `Dr. Saeed Ghezelbash Aesthetic Clinic`. The immediate migration removes references to the deleted clinic Wikidata item `Q140288589` while preserving the real clinic name, category, location/external identifiers and the person/clinic distinction. No file uploads or overwrites are part of this request.

**Mode:** manually triggered from the operator's GitHub repository; not continuous. Each public transaction requires an explicit trigger. The service accepts only allowlisted, coded tasks and cannot accept arbitrary wikitext/page names from GitHub.

**Safety:** dry-run first; current-revision checks; exact-match transformations; no page creation; no uploads; post-write verification; transaction rollback on failure; at least 6 seconds between edits; operator reviews failures promptly.

**Maximum edit rate:** one edit every 6 seconds, and only during an explicitly triggered maintenance transaction.

**Implementation:** Python, MediaWiki API, BotPassword stored only in Toolforge environment variables. GitHub-to-Toolforge authentication uses short-lived GitHub Actions OIDC; no Wikimedia credential is stored in GitHub.

**Planned trial:** only after approval, a small set of four existing Commons pages/categories owned/maintained by the operator will be updated to remove the retired QID and correct the misleading phrase “clinical team” where it implies employment/staff status not supported by the file context.
