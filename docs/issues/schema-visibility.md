# Issue 1 — Production schema visibility

Status: confirmed and being fixed.

The canonical JSON-LD graph existed in source, but the inline script was emitted after the full long-form Homepage content at the end of `body`. Retrieval systems that truncate or summarize long HTML could miss it. The fix moves the inline graph into `head`, gives it a stable identifier, and adds production verification for both inline parsing and the external `knowledge-graph.jsonld` endpoint.
