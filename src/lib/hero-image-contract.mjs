export const HERO_IMAGE_SIZES =
  "(max-width: 720px) and (max-width: 79rem) calc(100vw - 2.56rem), (max-width: 720px) 76.44rem, (max-width: calc(45.19828rem + 2.1978px)) 18rem, (max-width: 80rem) calc(41.86vw - .92rem - .92px), (max-width: 100rem) calc(35.88rem - 4.14vw - .92px), calc(31.74rem - .92px)";
export const HERO_FIGURE_TOTAL_BORDER_PX = 2;
const HERO_IMAGE_SIZES_TOKEN = "{{HERO_IMAGE_SIZES}}";
export const HERO_PRELOAD_HREF =
  "/media/images/physician/saeed-ghezelbash-portrait-delivery-640.a2b0a5e1ab4d.avif";
export const HERO_EARLY_HINT_HREF =
  "/media/images/physician/saeed-ghezelbash-portrait-960.b752a836dd26.avif";
export const HERO_PRELOAD_SRCSET = `${HERO_PRELOAD_HREF} 640w, ${HERO_EARLY_HINT_HREF} 960w, /media/images/physician/saeed-ghezelbash-portrait-1600.586a1aef120c.avif 1600w`;

const tokenCount = (value) =>
  String(value).split(HERO_IMAGE_SIZES_TOKEN).length - 1;

function bindExactHeroTokens(value, expectedCount, context) {
  const source = String(value);
  const count = tokenCount(source);
  if (count !== expectedCount)
    throw new Error(
      `${context}: expected ${expectedCount} Hero image sizes token(s); found ${count}`,
    );
  const bound = source.replaceAll(HERO_IMAGE_SIZES_TOKEN, HERO_IMAGE_SIZES);
  if (bound.includes(HERO_IMAGE_SIZES_TOKEN))
    throw new Error(`${context}: unresolved Hero image sizes token`);
  return bound;
}

export function bindHeroPictureSizes(value) {
  const source = String(value);
  const fallback = source.match(
    /<img\b(?=[^>]*\bsrc=["']\/media\/images\/physician\/saeed-ghezelbash-portrait-delivery-640\.[0-9a-f]{12}\.webp["'])[^>]*>/i,
  )?.[0];
  if (!fallback)
    throw new Error("Canonical Hero picture: fallback img missing");
  if (/\bsizes\s*=/.test(fallback) && !/\bsrcset\s*=/.test(fallback))
    throw new Error(
      "Canonical Hero picture: fallback img must not carry sizes without srcset",
    );
  return bindExactHeroTokens(source, 2, "Canonical Hero picture sources");
}
