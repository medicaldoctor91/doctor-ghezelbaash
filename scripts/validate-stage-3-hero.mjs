import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const source = readFileSync(join(root, 'src/components/home/PhysicianHero.astro'), 'utf8');
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const count = (text, re) => (text.match(re) ?? []).length;
const textOf = (value) => value.replace(/<[^>]+>/gu, ' ').replace(/&nbsp;|&#160;/giu, ' ').replace(/&zwnj;|&#8204;/giu, '\u200c').replace(/&#(\d+);/gu, (_, n) => String.fromCodePoint(Number(n))).replace(/&[a-z]+;/giu, ' ').replace(/\s+/gu, ' ').trim();
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'iu'))?.[1];

const personId = 'mohammad-saeed-ghezelbash';
const personAt = html.indexOf(`id="${personId}"`);
const start = html.lastIndexOf('<header', personAt);
const endAt = html.indexOf('</header>', personAt);
const end = endAt < 0 ? -1 : endAt + 9;
const hero = start >= 0 && end > start ? html.slice(start, end) : '';

check(start >= 0 && end > start, 'canonical Person header is missing');
check(count(html, /<h1\b/gu) === 1, 'Homepage must contain exactly one H1');
check(/<header\b[^>]*id="mohammad-saeed-ghezelbash"[^>]*aria-labelledby="page-title"[^>]*data-main-entity="Person"/iu.test(hero), 'Person header identity contract is invalid');
check(/<div\b[^>]*class="physician-hero__copy"[^>]*>\s*<h1\b/iu.test(hero), 'H1 must be the first visible Person content');
check(hero.includes('دکتر سعید قزلباش؛ پزشک زیبایی، پوست و مو در کرمانشاه'), 'approved H1 is missing');
check(!hero.includes('صفحه رسمی پزشک') && !hero.includes('physician-hero__identity'), 'extra content interrupts H1 → introduction → portrait order');

const introMatch = hero.match(/<div\b([^>]*)data-physician-introduction(?:="")?([^>]*)>([\s\S]*?)<\/div>/iu);
const introAttrs = introMatch ? `${introMatch[1]} ${introMatch[2]}` : '';
const introHtml = introMatch?.[3] ?? '';
const introText = textOf(introHtml);
const introWords = introText.split(/\s+/u).filter(Boolean).length;
check(count(hero, /data-physician-introduction/gu) === 1, 'Person header must contain one introduction');
check(!/\bid=/iu.test(introAttrs) && !/<a\b/iu.test(introHtml), 'introduction must not have an ID or anchor');
check(count(introHtml, /<p\b/gu) === 3, 'introduction must contain three paragraphs');
check(introWords >= 180 && introWords <= 280, `introduction must contain 180–280 words; found ${introWords}`);
for (const phrase of ['دکتر محمدسعید قزلباش','نام حرفه‌ای','دکترای حرفه‌ای پزشکی','۱۶۷۴۳۰','کرمانشاه','ارزیابی پیش از درمان','مرز روش‌های غیرجراحی','ارجاع','فعالیت پژوهشی','آموزش پزشکی']) check(introText.includes(phrase), `introduction is missing: ${phrase}`);
check(count(html, /data-physician-introduction/gu) === 1, 'physician introduction is repeated later');

const h1At = hero.indexOf('<h1');
const introAt = hero.indexOf('data-physician-introduction');
const portraitAt = hero.indexOf('data-lcp-portrait');
const figureEnd = hero.indexOf('</figure>', portraitAt);
const barAt = hero.indexOf('data-hero-trust-bar');
check(h1At >= 0 && introAt > h1At && portraitAt > introAt && figureEnd > portraitAt && barAt > figureEnd, 'hero order must be H1 → introduction → portrait → bar');
check(/<\/figure>\s*<div\b[^>]*class="physician-hero__bar"[^>]*data-hero-trust-bar/iu.test(hero), 'bar must immediately follow the portrait');
check(!/\.physician-hero\{[^}]*grid-template-columns/iu.test(source), 'root hero must not use side-by-side columns');

const portrait = portraitAt >= 0 && figureEnd > portraitAt ? hero.slice(portraitAt, figureEnd + 9) : '';
const img = portrait.match(/<img\b[^>]*>/iu)?.[0] ?? '';
check(count(portrait, /<picture\b/gu) === 1 && count(portrait, /<source\b/gu) === 2, 'portrait requires picture with AVIF and WebP sources');
check(portrait.includes('type="image/avif"') && portrait.includes('type="image/webp"'), 'modern portrait formats are missing');
for (const width of [480,768,1200,1600]) {
  check(portrait.includes(`doctor-portrait-${width}.avif ${width}w`), `AVIF ${width}w candidate is missing`);
  check(portrait.includes(`doctor-portrait-${width}.webp ${width}w`), `WebP ${width}w candidate is missing`);
}
check(attr(img,'src') === '/images/responsive/doctor-portrait-1200.jpg', 'portrait fallback src is incorrect');
check(attr(img,'alt') === 'دکتر سعید قزلباش، پزشک زیبایی، پوست و مو در کرمانشاه', 'portrait alt is incorrect');
check(attr(img,'width') === '1600' && attr(img,'height') === '1067', 'portrait intrinsic dimensions are missing');
check(attr(img,'loading') === 'eager' && attr(img,'fetchpriority') === 'high' && attr(img,'decoding') === 'async', 'portrait LCP attributes are incorrect');
check(Boolean(attr(img,'srcset')) && Boolean(attr(img,'sizes')), 'portrait responsive fallback is incomplete');
check(/<figcaption\b[^>]*>\s*[^<]+/iu.test(portrait), 'portrait figcaption is missing');
const assets = [...[480,768,1200,1600].flatMap((w) => [`doctor-portrait-${w}.avif`,`doctor-portrait-${w}.webp`]),'doctor-portrait-1200.jpg','doctor-portrait-1600.jpg'];
for (const asset of assets) check(existsSync(join(root,'public/images/responsive',asset)), `portrait asset is missing: ${asset}`);

const bar = barAt >= 0 ? hero.slice(hero.lastIndexOf('<div', barAt)) : '';
check(count(bar, /<a\b/gu) === 3, 'bar must contain one Maps link and two CTA links');
check(count(bar, /data-primary-cta=/gu) === 2 && count(bar, /class="[^"]*\bbutton\b[^"]*"/gu) === 2, 'bar must contain exactly two primary CTA buttons');
check(bar.includes('href="tel:+989308209494"') && bar.includes('رزرو وقت مشاوره رایگان'), 'appointment CTA is incorrect');
check(bar.includes('href="https://ig.me/m/doctor.ghezelbaash"') && bar.includes('گفت‌وگوی آنلاین با دکتر قزلباش'), 'Instagram Direct CTA is incorrect');
const mapTag = bar.match(/<a\b[^>]*data-location-link="google-maps"[^>]*>/iu)?.[0] ?? '';
check(attr(mapTag,'href') === 'https://www.google.com/maps?cid=12350483144643112463' && !mapTag.includes('data-primary-cta'), 'Maps must be a separate non-CTA CID link');
check(bar.includes('۵ از ۵') && bar.includes('۱۶۳ ارزیابی Google Maps'), 'visible rating must be ۵ از ۵ based on ۱۶۳ reviews');
check(bar.includes('کلینیک زیبایی دکتر سعید قزلباش، کرمانشاه'), 'clinic name and city are missing beside Maps');
for (const term of ['ORCID','NCBI','Hugging Face','LinkedIn','Facebook','Pinterest','Wikidata','Dataset','knowledge-graph','مشاهده رزومه']) check(!bar.includes(term), `forbidden resource appears in hero bar: ${term}`);

const tocIdAt = html.indexOf('id="content-table"');
const tocOpen = html.lastIndexOf('<nav', tocIdAt);
check(tocOpen > end, 'Content Table must follow the Person header');
check(html.slice(end, tocOpen).replace(/<!--[\s\S]*?-->/gu,'').trim() === '', 'Content Table must immediately follow the Person header');

if (failures.length) {
  console.error(JSON.stringify({ stage: 3, status: 'fail', failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ stage: 3, status: 'pass', h1Count: 1, introductionWords: introWords, introductionParagraphs: 3, primaryCtas: 2, mapsLinks: 1, rating: '5/5', ratingCount: 163, portraitAssets: assets.length, layout: 'sequential', duplicateIntroduction: false }, null, 2));
