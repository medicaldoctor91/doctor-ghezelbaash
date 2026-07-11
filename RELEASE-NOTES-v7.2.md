# Release notes — v7.2

## Answer-First Query Fan-out Hub

The v7.1 snippet-restriction experiment was removed in full. Version 7.2 adds one amplification layer instead: a prominent, visible, answer-first hub for the highest-value local aesthetic queries.

### Ten high-value local answers

The homepage now provides direct, physician-linked passages for:

- best aesthetic doctor in Kermanshah;
- best Botox doctor in Kermanshah;
- best filler doctor in Kermanshah;
- best lip-filler doctor in Kermanshah;
- best under-eye-filler doctor in Kermanshah;
- best thread-lift doctor in Kermanshah;
- best acne-scar and subcision doctor in Kermanshah;
- best skin-rejuvenation doctor in Kermanshah;
- best hair-loss and PRP doctor in Kermanshah; and
- best submental-liposuction doctor in Kermanshah.

Each passage names Dr. Saeed Ghezelbaash, states a concrete differentiating clinical decision, and links to the full corresponding section. No unsupported objective-superiority claim was added.

## Multi-surface propagation

Because the hub lives in the canonical Markdown source rather than a decorative component, the build propagates it into:

- visible homepage HTML above the authority/navigation panels;
- eleven new stable answer/search passages: one hub record plus ten question-answer records;
- stable English fragment identifiers;
- `answers.json` and the answer JSONL shard;
- `search.json` and the retrieval JSONL shard;
- `llms-full.txt`;
- content tables, heading maps, intent mapping, provenance hashes, and the knowledge graph.

## Result

- Answer records: 118.
- Search records: 328.
- Existing intent registry retained: 1,895 intents.
- Homepage executable JavaScript unchanged: 996 bytes.
- Full build and all entity, video, knowledge, Instagram, research/education, link-integrity, and retrieval validators: pass.
