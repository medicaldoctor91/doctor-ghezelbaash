# Media placement contract

The canonical homepage must not contain a standalone photo gallery section or a standalone video library section.

Required behavior:

- each video is rendered inside the clinical text whose heading or body matches its `relatedHeadingIncludes` value;
- clinical video IDs and chapter IDs remain stable for the canonical knowledge graph and video sitemap;
- physician and team images stay inside physician identity content;
- clinic environment images stay inside visit, address and contact context;
- navigation must not expose separate «photos» or «videos» destinations;
- hidden semantic anchors may remain only when required by the canonical graph;
- release validation must fail if `VideoLibrary`, `ClinicGallery`, `video-rail`, `gallery-grid`, a standalone `<section id="videos">`, or a standalone `<section id="clinic">` returns.

This is a permanent presentation constraint for future homepage work.
