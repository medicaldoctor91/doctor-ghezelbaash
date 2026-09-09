# Persian Wikisource translation

Complete Persian translation of the 2021 research article with DOI
10.3390/healthcare9091169, prepared with disclosed AI assistance for publication
through the author's account Medicaldoctor91. All 13 original authors are credited.
The 50 references and 95 citation occurrences preserve the original order.

The original article and source XML are licensed CC BY 4.0. The Persian translation
is offered under CC BY-SA 4.0 for Wikisource. Translation notes identify discrepancies
in the original paper; the translation does not correct the published study results.
The PDF's table 1 was visually checked against the original, including the two values
in the educational-status cell and the empty following cell.

`00-front.wiki` through `05-declarations.wiki` contain the reviewed translation.
Run `python3 wikimedia/fa-2021/build_translation.py` from the repository root to
assemble `article.wiki`, incorporate the original bibliography, check the citation
sequence, and record hashes in `manifest.json`.

Run `python3 scripts/publish_persian_wikisource.py` for a read-only preview.
The dedicated branch workflow supplies the existing WIKIVERSITY_USERNAME and
WIKIVERSITY_BOT_PASSWORD secrets to the publisher's environment, never to files.
Publication creates the translation and author page, verifies their exact content,
then adds only the fawikisource sitelink to existing item Q140287622.
Existing pages with different content and conflicting sitelinks stop publication.

Local template observations on 2026-09-09: the official Translation header module
references the missing `الگو:سرصفحه ترجمه/styles.css`; the included small stylesheet
is scoped to that header. The `language=en` argument currently raises a Lua error
in Header/attribution (missing language_prefix). The page therefore uses the
documented `nocat` parameter with explicit English-source categorization and an
English interwiki link, while retaining the official Translation header template.
The local wiki currently recognizes `ترجمه:` as a literal title prefix in mainspace;
the personal sitelink points to the separate, registered Author namespace (102).
