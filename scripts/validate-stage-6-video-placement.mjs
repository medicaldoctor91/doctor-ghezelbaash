import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { videos } from '../src/domain/media.mjs';
import { videoPageDetails } from '../src/domain/video-pages.mjs';
import {
  homepageSections,
  homepageArticleSubsections,
  homepageArticleSubsectionById,
} from '../src/domain/homepage-content-registry.mjs';

const root = process.cwd();
const html = readFileSync(join(root, 'dist', 'index.html'), 'utf8');
const guideSource = readFileSync(join(root, 'src/components/home/HomepageGuideV2.astro'), 'utf8');
const clinicSource = readFileSync(join(root, 'src/components/home/ClinicInformation.astro'), 'utf8');
const indexSource = readFileSync(join(root, 'src/pages/index.astro'), 'utf8');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const unique = (values) => new Set(values).size === values.length;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const count = (value, pattern) => (value.match(pattern) ?? []).length;
const attr = (tag, name) => tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'iu'))?.[1] ?? null;
const textOf = (value) => value
  .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
  .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
  .replace(/<svg\b[\s\S]*?<\/svg>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')
  .replace(/&zwnj;|&#8204;/giu, '\u200c')
  .replace(/&nbsp;|&#160;/giu, ' ')
  .replace(/&#(\d+);/gu, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&[a-z0-9#]+;/giu, ' ')
  .replace(/\s+/gu, ' ')
  .trim();

const expectedPlacements = Object.freeze({
  'home-workshop-thread-lift-training': ['medical-research-and-education', 'medical-education'],
  'home-workshop-thread-lift-advanced': ['medical-research-and-education', 'medical-education'],
  'clinic-patient-experience-review': ['clinic-information-kermanshah', null],
  'botox-vs-subcision-dynamic-static-scar': ['injectable-aesthetic-treatments', 'botulinum-toxin-guide'],
  'filler-under-eye-transformation': ['injectable-aesthetic-treatments', 'under-eye-filler-guide'],
  'filler-under-eye-before-after': ['injectable-aesthetic-treatments', 'under-eye-filler-guide'],
  'cat-eye-thread-lift-before-after': ['lifting-and-facial-aging', 'thread-lift-guide'],
  'jalupro-vs-profhilo-skin-boosters': ['skin-scar-rejuvenation', 'skin-booster-mesogel'],
  'nonsurgical-rhinoplasty-boundary': ['aesthetic-surgery-and-referral', 'rhinoplasty-evaluation'],
  'nose-filler-before-after': ['injectable-aesthetic-treatments', 'facial-contouring-injections'],
  'proper-subcision-technique-guide': ['skin-scar-rejuvenation', 'subcision-guide'],
  'mesoneedling-dark-spots-warning': ['skin-scar-rejuvenation', 'pigmentation-melasma-guide'],
});

const expectedIds = Object.keys(expectedPlacements);
const actualIds = videos.map((video) => video.id);
check(videos.length === 12, `Stage 6 requires exactly 12 contextual videos; found ${videos.length}`);
check(same(actualIds, expectedIds), `video order or IDs differ from the approved Stage 6 contract: ${JSON.stringify(actualIds)}`);
check(unique(actualIds), 'duplicate video IDs exist');
check(unique(videos.map((video) => video.file)), 'duplicate video files exist');
check(unique(videos.map((video) => video.thumbnail)), 'duplicate video thumbnails exist');
check(unique(videos.map((video) => video.chapterTrack)), 'duplicate video chapter tracks exist');

const sectionIds = new Set(homepageSections.map((section) => section.id));
for (const video of videos) {
  const expected = expectedPlacements[video.id];
  check(Boolean(expected), `unknown video exists outside the approved placement contract: ${video.id}`);
  check(typeof video.sectionId === 'string' && video.sectionId.length > 0, `${video.id}: sectionId is missing`);
  check(sectionIds.has(video.sectionId), `${video.id}: sectionId is absent from the 16-section registry: ${video.sectionId}`);
  check(same([video.sectionId, video.subsectionId ?? null], expected), `${video.id}: placement changed from ${JSON.stringify(expected)} to ${JSON.stringify([video.sectionId, video.subsectionId ?? null])}`);

  if (video.subsectionId !== null && video.subsectionId !== undefined) {
    const subsection = homepageArticleSubsectionById.get(video.subsectionId);
    check(Boolean(subsection), `${video.id}: subsectionId is absent from the canonical H3 registry: ${video.subsectionId}`);
    check(subsection?.parentId === video.sectionId, `${video.id}: subsection belongs to another H2: ${video.sectionId}/${video.subsectionId}`);
  }

  check(typeof video.title === 'string' && video.title.trim().length > 0, `${video.id}: title is missing`);
  check(typeof video.description === 'string' && video.description.trim().length > 0, `${video.id}: description is missing`);
  check(/^PT\d+(?:\.\d+)?S$/u.test(video.duration), `${video.id}: duration is not an ISO 8601 seconds duration`);
  check(Number.isFinite(video.exactDurationSeconds) && video.exactDurationSeconds > 0, `${video.id}: exact duration is missing`);
  check(Number.isInteger(video.width) && video.width > 0 && Number.isInteger(video.height) && video.height > 0, `${video.id}: intrinsic video dimensions are invalid`);

  const videoPath = join(root, 'public', 'videos', video.file);
  const thumbnailPath = join(root, 'public', video.thumbnail.replace(/^\//u, ''));
  const chapterPath = join(root, 'public', video.chapterTrack.replace(/^\//u, ''));
  check(existsSync(videoPath), `${video.id}: MP4 file is missing: ${video.file}`);
  check(existsSync(thumbnailPath), `${video.id}: thumbnail is missing: ${video.thumbnail}`);
  check(existsSync(chapterPath), `${video.id}: chapter track is missing: ${video.chapterTrack}`);
  check(Boolean(videoPageDetails[video.id]), `${video.id}: videoPageDetails metadata is missing`);
}

const detailIds = Object.keys(videoPageDetails);
check(unique(detailIds), 'duplicate videoPageDetails keys exist');
check(detailIds.length === expectedIds.length, `videoPageDetails count differs from videos: ${detailIds.length}/${expectedIds.length}`);
check(detailIds.every((id) => expectedIds.includes(id)), `videoPageDetails contains unknown IDs: ${detailIds.filter((id) => !expectedIds.includes(id)).join(', ')}`);

const educationIds = videos
  .filter((video) => video.sectionId === 'medical-research-and-education' && video.subsectionId === 'medical-education')
  .map((video) => video.id);
check(same(educationIds, ['home-workshop-thread-lift-training', 'home-workshop-thread-lift-advanced']), `medical education must contain only the two approved workshop videos: ${JSON.stringify(educationIds)}`);
check(videos.filter((video) => video.sectionId === 'medical-research-and-education').length === 2, 'no other video may render in the research/education H2');

const clinicVideos = videos.filter((video) => video.sectionId === 'clinic-information-kermanshah');
check(clinicVideos.length === 1, `clinic section must contain exactly one mapped video; found ${clinicVideos.length}`);
check(clinicVideos[0]?.subsectionId == null, 'clinic video must target the H2 directly, without a fabricated subsection');
check(videos.filter((video) => video.sectionId !== 'clinic-information-kermanshah').every((video) => Boolean(video.subsectionId)), 'every non-clinic video must target a canonical medical H3');

check(indexSource.includes("import HomepageGuideV2 from '../components/home/HomepageGuideV2.astro';"), 'Homepage must use the Stage 5/6 article renderer');
check(indexSource.includes('<HomepageGuideV2 sections={articleSections} />'), 'HomepageGuideV2 is not mounted in the Homepage');
check(!indexSource.includes('<HomepageGuide ') && !indexSource.includes('<GuideLibrary'), 'obsolete video renderers must not be mounted');
check(guideSource.includes('video.sectionId === sectionId && video.subsectionId === subsectionId'), 'article video placement must use exact sectionId/subsectionId equality');
check(guideSource.includes('throw new Error(`Video destination is absent from the article registry:'), 'article renderer must fail when a video destination is absent');
check(!/video\.(?:title|description|tags).*?(?:includes|match|test)/isu.test(guideSource), 'article renderer contains title/tag/text-based video matching');
check(!/videos\s*\[\s*0\s*\]|videoItems\s*\[\s*0\s*\]/u.test(guideSource), 'article renderer contains a first-video fallback');
check(clinicSource.includes("const clinicVideos = videos.filter((video: any) => video.sectionId === clinicSection.id);"), 'clinic renderer must collect videos by exact sectionId');
check(clinicSource.includes('if (clinicVideos.length !== 1)'), 'clinic renderer must fail closed when the mapped video count changes');
check(clinicSource.includes('if (clinicVideo.subsectionId != null)'), 'clinic renderer must reject an unexpected subsection destination');
check(!clinicSource.includes('videos.find('), 'clinic renderer must not silently select the first matching video');

const htmlIds = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
const idCounts = new Map(htmlIds.map((id) => [id, htmlIds.filter((candidate) => candidate === id).length]));
const structuralNodes = [
  ...homepageSections.map((section) => ({ id: section.id, level: 2 })),
  ...homepageArticleSubsections.map((subsection) => ({ id: subsection.id, level: 3 })),
]
  .map((node) => ({ ...node, position: html.indexOf(`id="${node.id}"`) }))
  .filter((node) => node.position >= 0)
  .sort((left, right) => left.position - right.position);

const destinationRange = (id) => {
  const index = structuralNodes.findIndex((node) => node.id === id);
  if (index < 0) return null;
  const node = structuralNodes[index];
  const next = structuralNodes.slice(index + 1).find((candidate) => candidate.level <= node.level);
  return [node.position, next?.position ?? html.indexOf('</main>', node.position)];
};

for (const video of videos) {
  const figureId = `video-${video.id}`;
  const figureIdAt = html.indexOf(`id="${figureId}"`);
  const figureStart = html.lastIndexOf('<figure', figureIdAt);
  const figureEndAt = html.indexOf('</figure>', figureIdAt);
  const figureEnd = figureEndAt < 0 ? -1 : figureEndAt + 9;
  const figure = figureStart >= 0 && figureEnd > figureStart ? html.slice(figureStart, figureEnd) : '';
  check(idCounts.get(figureId) === 1, `${video.id}: contextual figure must exist exactly once`);
  check(Boolean(figure), `${video.id}: figure markup is missing`);
  check(count(figure, /<video\b/gu) === 1, `${video.id}: figure must contain exactly one video element`);
  check(count(figure, /<figcaption\b/gu) === 1, `${video.id}: figure must contain exactly one figcaption`);
  check(!/<h3\b/iu.test(figure), `${video.id}: video title must not be an H3`);
  check(new RegExp(`<(?:h4|strong)\\b[^>]*id="${figureId}-title"`, 'iu').test(figure), `${video.id}: video title must be an H4 or contextual figcaption title`);
  check(new RegExp(`<p\\b[^>]*id="${figureId}-description"`, 'iu').test(figure), `${video.id}: video description element is missing`);
  check(textOf(figure).includes(video.title), `${video.id}: visible title differs from media metadata`);
  check(textOf(figure).includes(video.description), `${video.id}: visible description differs from media metadata`);

  const videoTag = figure.match(/<video\b[^>]*>/iu)?.[0] ?? '';
  const sourceTag = figure.match(/<source\b[^>]*type="video\/mp4"[^>]*>/iu)?.[0] ?? '';
  const trackTag = figure.match(/<track\b[^>]*kind="chapters"[^>]*>/iu)?.[0] ?? '';
  check(attr(videoTag, 'poster') === video.thumbnail, `${video.id}: rendered poster differs from metadata`);
  check(attr(videoTag, 'width') === String(video.width) && attr(videoTag, 'height') === String(video.height), `${video.id}: rendered dimensions differ from metadata`);
  check(attr(videoTag, 'preload') === 'none' && /\bcontrols(?:\s|>)/iu.test(videoTag) && /\bplaysinline(?:\s|>)/iu.test(videoTag), `${video.id}: video loading/playback attributes are invalid`);
  check(attr(videoTag, 'aria-labelledby') === `${figureId}-title`, `${video.id}: aria-labelledby mismatch`);
  check(attr(videoTag, 'aria-describedby') === `${figureId}-description`, `${video.id}: aria-describedby mismatch`);
  check(attr(sourceTag, 'src') === `/videos/${video.file}`, `${video.id}: MP4 source differs from metadata`);
  check(attr(trackTag, 'src') === video.chapterTrack, `${video.id}: chapter track differs from metadata`);

  const destination = video.subsectionId ?? video.sectionId;
  const range = destinationRange(destination);
  check(Boolean(range), `${video.id}: mapped DOM destination is missing: #${destination}`);
  if (range) check(figureStart > range[0] && figureEnd <= range[1], `${video.id}: figure is outside its mapped DOM destination #${destination}`);
}

check(count(html, /<video\b/gu) === videos.length, `rendered video count differs from registry: ${count(html, /<video\b/gu)}/${videos.length}`);
check(count(html, /<figure\b[^>]*id="video-/gu) === videos.length, `rendered contextual figure count differs from registry`);
check(!html.includes('video-rail'), 'video rail/carousel markup is forbidden');
check(!/href="\/videos\/[^"/]+\/?"/u.test(html), 'video watch-page links are forbidden');

if (failures.length > 0) {
  console.error(JSON.stringify({
    stage: 6,
    status: 'fail',
    failures,
    videos: videos.length,
    educationVideos: educationIds.length,
    clinicVideos: clinicVideos.length,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  stage: 6,
  status: 'pass',
  videos: videos.length,
  explicitPlacements: videos.length,
  educationVideos: educationIds.length,
  clinicVideos: clinicVideos.length,
  missingDestinations: 0,
  misplacedFigures: 0,
  duplicateVideoIds: 0,
  missingMediaAssets: 0,
  titleOrTagMatching: false,
  firstSectionFallback: false,
}, null, 2));
