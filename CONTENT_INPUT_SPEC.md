# Final content-package contract

The final editorial handoff is an extracted directory named `ghezelbaash-content-final`. It is validated before any file is copied into source or rendered by Astro.

## Required separation

- `visible/`: publishable Persian Markdown bodies and explicitly allowlisted JSON fields.
- `facts/`: entity facts, claim permissions, source registry, claim/source mapping, and media truth. Never rendered.
- `retrieval/`: passage boundaries, aliases, and intent mappings. Never rendered as page copy.
- `validation/`: coverage and editorial validation evidence. Never rendered.
- `package-manifest.json`: exactly `package_name`, `schema_version`, and `files`; each file entry has `path`, `role`, `language`, `format`, `render_fields`, `strip_frontmatter`, and SHA-256. The manifest does not hash itself.

The exact required tree is enforced by `scripts/validate-content-package.mjs`. A package is rejected for a missing or unlisted file, symlink, digest mismatch, manifest role/format/allowlist drift, invalid JSON/JSONL, physician/clinic identifier overlap, authoring text in a renderable field, unresolved visible placeholder, malformed heading ownership, incomplete coverage or retrieval records, broken source references, empty claim-permission control, missing claim/source mapping, or FAQ count other than 80.

## Commands

```sh
npm run content:validate -- /absolute/path/to/extracted-parent-or-root
npm run content:stage -- /absolute/path/to/extracted-parent-or-root
```

`content:stage` writes only to `content-package/current` after all gates pass. It never makes the package visible by itself. The Astro adapter must render only the fields declared by the manifest; files in `facts/`, `retrieval/`, `validation/`, and `NON_VISIBLE_README.md` are never page inputs.

The release remains `technical-foundation` with `contentFrozen: false` while the fallback corpus is active. The final adapter changes those values to `production-final` and `true` only after source/render/graph parity and the strict production build pass.

If `content-package/current` already exists, staging stops. `--replace` is accepted only for an intentional, already validated replacement.
