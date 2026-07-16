# Media source workspace

This directory is the only source-side media workspace. Build output is generated under `public/assets/` with content hashes and is not committed.

Current verified repository inputs:

- 12 MP4 files at this directory root
- 12 generated WebM alternatives under `webm/`
- 12 matching JPEG thumbnails under `thumbnails/`
- 12 generated WebP posters under `posters/`
- reusable legacy image derivatives under `existing-derivatives/`
- Vazirmatn full variable font `33.0.3` under `persian.woff2` (OFL-1.1; see `Vazirmatn-LICENSE.txt`)

Still required for production:

- the original image and brand filenames listed in `src/data/images.ts`
- verified Persian caption files under `captions/`
- verbatim Persian transcripts under `transcripts/`

`legacy-chapters/` contains the former three-cue chapter markers. They are retained for provenance only and are never emitted as captions.

`media-integrity.json` binds each MP4/WebM result to its SHA-256 digest, full-decode result, duration, and dimensions. It also compares every WebM against its MP4 master. Re-run `npm run media:verify` after replacing or re-encoding any video. Production validation rejects a missing, stale, or failed record.
