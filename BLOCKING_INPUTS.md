# Blocking inputs for the production-final build

`npm run build` is intentionally blocked until every item below is resolved. `npm run build:scaffold` remains available for structural verification.

## 1. Final visible copy

Replace `TODO_VISIBLE_CONTENT` in all 19 files under `src/content/visible/` with the approved final copy. The file-by-file contract is in `CONTENT_INPUT_SPEC.md`.

## 2. Original media archive

Provide `Media(3).zip`, or explicitly confirm that the current repository binaries are the authoritative production sources. The repository already contains all 12 MP4 files and all 12 thumbnails, but the prescribed source archive is absent. All nine original photographs, the three WebP logo sources, the three PNG logo sources, and `favicon.png` listed in `src/data/images.ts` are required at the `Media/` root; `dr-saeed-ghezelbash.jpeg` is not present even among the existing derivatives.

The current `why-mesoneedling-makes-dark-spots-worse-dr-ghezelbash.mp4` fails a full `ffmpeg -xerror` decode with an invalid NAL unit and partial-file error. Its derived WebM is also truncated at about 24.2 seconds versus the MP4 metadata duration of about 48.2 seconds. Replace the master with the intact source from the archive and regenerate its WebM alternative.

## 3. Captions and transcripts for all 12 videos

Provide one verified Persian caption file and one verbatim Persian transcript per video:

- Caption: `Media/captions/<video-basename>-fa.vtt`
- Transcript: `Media/transcripts/<video-basename>-fa.md`

The current `public/videos/chapters/*.vtt` files are chapter markers, not captions, and are therefore rejected by the production validator.

## 4. Cloudflare account-side controls

Before merging to `main`, apply and verify the host redirects, HTTPS enforcement, preview protection/noindex behavior, and custom-domain canonicalization listed in `docs/cloudflare-required-settings.md`. These controls cannot be represented completely by repository files without introducing a Worker or Function, both of which are prohibited.
