/**
 * Concise search/social snippets, derived only from the already authored
 * description of a focused route. No clinical information is created here.
 * Scope: four verified overlong excerpts; do not globally truncate the corpus.
 * A changed source or missing complete sentence fails closed at build time.
 */
const expectedLead = new Map([
  ['/buccal-fat-removal-facial-fullness-assessment', 'بوکال فت یا چربی بوکال'],
  ['/video-saeed-ghezelbash-subcision-technique', 'در این ویدئوی ۳۶ ثانیه‌ای'],
  ['/video-saeed-ghezelbash-kurdish-patient-review', 'لە ئەم ڤیدیۆیەی ٢٠ چرکەییدا'],
  ['/video-saeed-ghezelbash-thread-lift-workshop', 'گزیده‌ای ۳۹ ثانیه‌ای'],
]);

export const conciseMetaRoutes = Object.freeze([...expectedLead.keys()]);

export function conciseFocusedMetaDescription(path, value) {
  if (!expectedLead.has(path)) return value;
  if (typeof value !== 'string') throw new TypeError('Focused metadata source must be authored text');
  const source = value.replace(/\s+/gu, ' ').trim();
  if (!source.startsWith(expectedLead.get(path)))
    throw new Error('Focused metadata source changed; review excerpt instead of silently rewriting: ' + path);
  // Prefer a complete source sentence; never clip in the middle of a clinical claim.
  const boundaries = [...source.matchAll(/[.!?؟](?=\s|$)/gu)]
    .map(match => match.index + 1).filter(index => index >= 70 && index <= 160);
  if (!boundaries.length)
    throw new Error('No faithful 70–160-character authored excerpt for ' + path);
  const result = source.slice(0, boundaries.at(-1));
  if (!source.startsWith(result) || result.length > 160 || result.length < 70)
    throw new Error('Invalid focused metadata excerpt for ' + path);
  return result;
}
