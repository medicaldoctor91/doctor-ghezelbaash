export type VideoDefinition = {
  id: string;
  sourceFile: string;
  thumbnailFile: string;
  captionFile: string;
  transcriptFile: string;
  width: number;
  height: number;
  duration: string;
  title: string;
  description: string;
};

const video = (
  id: string,
  sourceFile: string,
  width: number,
  height: number,
  duration: string,
): VideoDefinition => ({
  id,
  sourceFile,
  thumbnailFile: `thumbnails/${sourceFile.replace(/\.mp4$/u, '.jpg')}`,
  captionFile: `captions/${sourceFile.replace(/\.mp4$/u, '-fa.vtt')}`,
  transcriptFile: `transcripts/${sourceFile.replace(/\.mp4$/u, '-fa.md')}`,
  width,
  height,
  duration,
  title: 'TODO_VISIBLE_CONTENT',
  description: 'TODO_VISIBLE_CONTENT',
});

export const videos = [
  video(
    'educational-video-botox-subcision',
    'botox-vs-subcision-scars-explaining-dr-ghezelbash.mp4',
    540,
    960,
    'PT56.077S',
  ),
  video(
    'educational-video-skin-boosters',
    'jalupro-vs-profhilo-skin-boosters-compared-dr-ghezelbash.mp4',
    540,
    960,
    'PT1M2.458S',
  ),
  video(
    'educational-video-limitations-risks',
    'why-mesoneedling-makes-dark-spots-worse-dr-ghezelbash.mp4',
    360,
    640,
    'PT48.208S',
  ),
  video(
    'educational-video-subcision-technique',
    'proper-subcision-technique-guide-dr-ghezelbash.mp4',
    540,
    960,
    'PT35.792S',
  ),
  video(
    'professional-education-thread-lift',
    'thread-lift-workshop-trin-dr-ghezelbash.mp4',
    480,
    854,
    'PT38.917S',
  ),
  video(
    'professional-training-thread-lift',
    'thread-lift-training-workshop-dr-ghezelbash.mp4',
    480,
    854,
    'PT30.604S',
  ),
  video(
    'patient-experience-video',
    'patient-satisfaction-review-dr-saeed-ghezelbash.mp4',
    540,
    960,
    'PT20.133S',
  ),
  video(
    'visual-example-under-eye-filler',
    'under-eye-filler-before-after-dr-ghezelbash.mp4',
    720,
    1280,
    'PT8.467S',
  ),
  video(
    'visual-example-under-eye-filler-transformation',
    'under-eye-filler-transformation-dr-saeed-ghezelbash.mp4',
    720,
    1280,
    'PT8.496S',
  ),
  video(
    'visual-example-nose-filler',
    'nose-filler-before-after-results-dr-ghezelbash.mp4',
    720,
    1280,
    'PT7.706S',
  ),
  video(
    'visual-example-nonsurgical-rhinoplasty',
    'nonsurgical-rhinoplasty-before-after-result-dr-ghezelbash.mp4',
    720,
    1280,
    'PT7.381S',
  ),
  video(
    'visual-example-cat-eye-thread-lift',
    'cat-eye-thread-lift-before-after-dr-ghezelbash.mp4',
    720,
    1280,
    'PT5.988S',
  ),
] as const;
