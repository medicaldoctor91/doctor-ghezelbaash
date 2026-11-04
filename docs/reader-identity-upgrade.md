# Reader, search and physician identity upgrade

Focused clinical and media URLs now load and navigate independently of the complete Guide. Search uses a content-addressed, build-derived heading and anchor manifest; only explicit continuous-reading controls request the full source. A destination is validated before its document, metadata and history entry are committed. Canceled requests cannot replace a later destination or override a reader-mode choice.

The upgrade retains all 72 authored routes, their canonical URLs, languages and physician author. The homepage has a visible physician biography. Selected clinical hubs and four watch pages have source-authored context and native links. The canonical Person and sole-provider practice identities remain distinct and fixed; practice selection validates ownership instead of selecting an arbitrary business. Existing professional claims, transcripts, media, scientific and medical-review dates remain intact. A Kurdish speech transcript is unavailable and has not been invented.

Per-document content modification dates now survive the Article/Profile projection and sitemap generation. Shared markup-correction dates remain separate from actual content edits. The dependency patch preserves the Node minimum and resolves the reviewed npm advisories.

## Local verification

The historical published archive context is explicit for development checks:

```sh
export ARCHIVE_SOURCE_COMMIT=ed767f6e6726e1453196e2ec2b312fcad00677e2
npm ci
npm run build
node --test tests/*.test.mjs
python tests/reader-browser-regression.py --dist dist
python tests/validate_canonical_invariants.py dist
python tests/validate_machine_resources.py dist
python tests/source-freeze.test.py
```

RDF/SHACL checks require the existing Python validator dependencies. Browser checks require Playwright plus Chromium; `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select a system installation. Browser fixtures serve real compiled output at the canonical HTTPS origin without production requests. They cover slow and failed manifest requests, query/IME races, stale navigation, explicit modes, language and head consistency, native fallbacks, scroll/focus history, JavaScript-off content and native timed video. The full-document Back case verifies a new document load; it does not claim BFCache coverage.

The example archive pin applies to the current development baseline. After a new coordinated release, maintenance must use that edition's recorded archive source; the historical pin must never be inherited by a newly reserved candidate.

The output contracts inspect all 72 pages and every manifest-owned anchor. The homepage active Search graph stays within its existing 38,000-byte repository budget while retaining its 22 profile links and 24 identifiers. The full graph retains all 1,600 entity identities.

## Publication boundary

These are development changes, not a new published archive or deployment. The old source-freeze checkpoint and management guard are preserved; the historical guard is expected to reject a changed development tree until the new checkpoint is bound. The final coordinated release must reserve a real DOI, bind the canonical policy and selected Dataset/package versions, create application checkpoint C and management child M, and build the exact reviewed M. Historical archive sources and the protected positioning subcorpus retain their own provenance and versions.

The reviewed release-plan adapter and coordinated workflow validate the selected policy, source, tool inventory, frozen candidate, public platform versions and runtime gates before publication. Website, Hugging Face, Kaggle and Notebook verification precedes final Zenodo publication. No new DOI, public version, deployment or Google indexing outcome is implied by local test results.
