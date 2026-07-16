export type VideoDefinition = {
  id: string; sourceFile: string; thumbnailFile: string; captionFile: string; transcriptFile: string;
  width: number; height: number; duration: string; title: string; description: string; available: boolean;
};

const video = (id: string, sourceFile: string, width: number, height: number, duration: string, title: string, description: string, available = true): VideoDefinition => ({
  id, sourceFile,
  thumbnailFile: `thumbnails/${sourceFile.replace(/\.mp4$/u, '.jpg')}`,
  captionFile: `captions/${sourceFile.replace(/\.mp4$/u, '-fa.vtt')}`,
  transcriptFile: `transcripts/${sourceFile.replace(/\.mp4$/u, '-fa.md')}`,
  width, height, duration, title, description, available,
});

export const videos = [
  video('educational-video-botox-subcision','botox-vs-subcision-scars-explaining-dr-ghezelbash.mp4',540,960,'PT56.077S','بوتاکس یا سابسیژن؛ اسکار متحرک را از چسبندگی جدا کنید','توضیح تفاوت نقش حرکت عضله و چسبندگی بافت در انتخاب میان بوتولینوم توکسین، سابسیژن یا درمان ترکیبی.'),
  video('educational-video-skin-boosters','jalupro-vs-profhilo-skin-boosters-compared-dr-ghezelbash.mp4',540,960,'PT1M2.458S','جالپرو یا پروفایلو؛ نام محصول را با هدف پوست اشتباه نگیرید','مقایسه بالینی اسکین‌بوسترها بر اساس فرمول، هدف، کیفیت پوست و انتظار واقع‌بینانه.'),
  video('educational-video-limitations-risks','why-mesoneedling-makes-dark-spots-worse-dr-ghezelbash.mp4',360,640,'PT48.208S','چرا تحریک نامناسب می‌تواند لک را بدتر کند','توضیح ریسک التهاب و تیرگی پس از مزونیدلینگ در پوست مستعد لک. فایل فعلی به دلیل نقص فنی منتشر نمی‌شود.',false),
  video('educational-video-subcision-technique','proper-subcision-technique-guide-dr-ghezelbash.mp4',540,960,'PT35.792S','سابسیژن درست؛ آزادکردن چسبندگی، نه سوراخ‌کردن تصادفی پوست','مرور منطق انتخاب اسکار، صفحه بافت و حرکت کنترل‌شده در سابسیژن.'),
  video('professional-education-thread-lift','thread-lift-workshop-trin-dr-ghezelbash.mp4',480,854,'PT38.917S','کارگاه لیفت نخ؛ بردار و انتخاب بافت پیش از تکنیک','آموزش مسیر نخ، بردار جابه‌جایی و محدودیت لیفت در بافت سنگین.'),
  video('professional-training-thread-lift','thread-lift-training-workshop-dr-ghezelbash.mp4',480,854,'PT30.604S','آموزش لیفت نخ برای پزشکان؛ تشخیص قبل از نقطه‌گذاری','نمونه آموزش با تمرکز بر آناتومی، انتخاب بیمار و مرز تکنیک.'),
  video('patient-experience-video','patient-satisfaction-review-dr-saeed-ghezelbash.mp4',540,960,'PT20.133S','تجربه مراجعه‌کننده از فرایند درمان','روایت یک مراجعه‌کننده از تجربه شخصی؛ این نتیجه فردی نتیجه دیگران را تضمین نمی‌کند.'),
  video('visual-example-under-eye-filler','under-eye-filler-before-after-dr-ghezelbash.mp4',720,1280,'PT8.467S','نمونه بصری فیلر زیر چشم در کاندید منتخب','نمونه منتخب با تأکید بر تفکیک گودی، پف، تیرگی و مالار ادم.'),
  video('visual-example-under-eye-filler-transformation','under-eye-filler-transformation-dr-saeed-ghezelbash.mp4',720,1280,'PT8.496S','تغییر سایه زیر چشم پس از حمایت حجمی انتخابی','نمونه تغییر محدود کانتور؛ نور، زاویه، تورم و زمان ثبت عکس مهم‌اند.'),
  video('visual-example-nose-filler','nose-filler-before-after-results-dr-ghezelbash.mp4',720,1280,'PT7.706S','نمونه فیلر بینی؛ تغییر خط پروفایل بدون کوچک‌کردن ساختار','نمایش اثر اپتیکی و محدود فیلر بینی در یک مورد منتخب.'),
  video('visual-example-nonsurgical-rhinoplasty','nonsurgical-rhinoplasty-before-after-result-dr-ghezelbash.mp4',720,1280,'PT7.381S','رینوپلاستی غیرجراحی؛ نتیجه محدود و انتخاب‌شده','اصلاح غیرجراحی خط بینی؛ بدون درمان مشکل تنفسی یا جایگزینی جراحی.'),
  video('visual-example-cat-eye-thread-lift','cat-eye-thread-lift-before-after-dr-ghezelbash.mp4',720,1280,'PT5.988S','نمونه لیفت چشم گربه‌ای با نخ در بافت منتخب','جابه‌جایی محدود بافت در یک مورد منتخب با نتیجه وابسته به آناتومی و بردار نخ.'),
] as const;

export const publishableVideos = videos.filter((item) => item.available);
