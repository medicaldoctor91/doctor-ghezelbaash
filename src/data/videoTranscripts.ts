export interface VideoTranscriptSegment {
  name: string;
  startOffset: number;
  endOffset: number;
  description: string;
  url: string;
}

export interface VideoTranscriptEntry {
  id: string;
  schemaNodeId: string;
  pagePath: string;
  title: string;
  embedAnchor: string;
  pageUrl: string;
  url: string;
  duration: string;
  transcriptKind: string;
  notice: string;
  summary: string;
  transcript: string;
  segments: VideoTranscriptSegment[];
}

export const videoTranscripts: VideoTranscriptEntry[] = [
  {
    id: 'home-workshop-thread-lift-training',
    schemaNodeId: 'https://www.ghezelbaash.ir/#video-home-workshop-thread-lift-training',
    pagePath: '/',
    title: 'ویدئوی ورکشاپ آموزشی؛ تصمیم قبل از تکنیک',
    embedAnchor: '#video-home-workshop-thread-lift-training',
    pageUrl: 'https://www.ghezelbaash.ir/',
    url: 'https://www.ghezelbaash.ir/#video-home-workshop-thread-lift-training',
    duration: 'PT31S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary: 'بخشی از فضای آموزشی دکتر قزلباش با تمرکز بر خواندن صورت، انتخاب بیمار و تصمیم‌گیری قبل از اجرای تکنیک.',
    transcript:
      'این ویدئو لیفت نخ را از زاویه انتخاب درست کاندید توضیح می‌دهد. پیام اصلی این است که نخ برای هر افتادگی یا هر انتظار درمانی مناسب نیست؛ کیفیت پوست، شدت افتادگی، حجم ازدست‌رفته، مسیر کشش و مراقبت بعد از درمان باید قبل از تصمیم دیده شوند.',
    segments: [
      {
        name: 'انتخاب کاندید',
        startOffset: 0,
        endOffset: 10,
        description: 'شدت افتادگی، کیفیت پوست و انتظار فرد بررسی می‌شود.',
        url: 'https://www.ghezelbaash.ir/?t=0#video-home-workshop-thread-lift-training',
      },
      {
        name: 'مرز توان نخ',
        startOffset: 10,
        endOffset: 20,
        description: 'لیفت نخ با جراحی یا حجم‌دهی اشتباه گرفته نمی‌شود.',
        url: 'https://www.ghezelbaash.ir/?t=10#video-home-workshop-thread-lift-training',
      },
      {
        name: 'مراقبت و ریسک',
        startOffset: 20,
        endOffset: 30,
        description: 'مراقبت پس از نخ و محدودیت‌های نتیجه یادآوری می‌شود.',
        url: 'https://www.ghezelbaash.ir/?t=20#video-home-workshop-thread-lift-training',
      },
    ],
  },
  {
    id: 'home-workshop-thread-lift-advanced',
    schemaNodeId: 'https://www.ghezelbaash.ir/#video-home-workshop-thread-lift-advanced',
    pagePath: '/',
    title: 'ویدئوی ورکشاپ آموزشی؛ آناتومی، مشاهده و انتخاب درست',
    embedAnchor: '#video-home-workshop-thread-lift-advanced',
    pageUrl: 'https://www.ghezelbaash.ir/',
    url: 'https://www.ghezelbaash.ir/#video-home-workshop-thread-lift-advanced',
    duration: 'PT39S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'نمونه‌ای از فضای آموزشی که نشان می‌دهد تصمیم در پزشکی زیبایی از مشاهده، آناتومی و انتخاب درست بیمار شروع می‌شود.',
    transcript:
      'این ویدئو لیفت نخ را از زاویه انتخاب درست کاندید توضیح می‌دهد. پیام اصلی این است که نخ برای هر افتادگی یا هر انتظار درمانی مناسب نیست؛ کیفیت پوست، شدت افتادگی، حجم ازدست‌رفته، مسیر کشش و مراقبت بعد از درمان باید قبل از تصمیم دیده شوند.',
    segments: [
      {
        name: 'انتخاب کاندید',
        startOffset: 0,
        endOffset: 12,
        description: 'شدت افتادگی، کیفیت پوست و انتظار فرد بررسی می‌شود.',
        url: 'https://www.ghezelbaash.ir/?t=0#video-home-workshop-thread-lift-advanced',
      },
      {
        name: 'مرز توان نخ',
        startOffset: 12,
        endOffset: 24,
        description: 'لیفت نخ با جراحی یا حجم‌دهی اشتباه گرفته نمی‌شود.',
        url: 'https://www.ghezelbaash.ir/?t=12#video-home-workshop-thread-lift-advanced',
      },
      {
        name: 'مراقبت و ریسک',
        startOffset: 24,
        endOffset: 38,
        description: 'مراقبت پس از نخ و محدودیت‌های نتیجه یادآوری می‌شود.',
        url: 'https://www.ghezelbaash.ir/?t=24#video-home-workshop-thread-lift-advanced',
      },
    ],
  },
  {
    id: 'clinic-patient-experience-review',
    schemaNodeId:
      'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/#video-clinic-patient-experience-review',
    pagePath: '/dr-saeed-ghezelbash-aesthetic-clinic/',
    title: 'ویدئوی تجربه مراجعه؛ نشانه‌ای از حضور واقعی کلینیک',
    embedAnchor: '#video-clinic-patient-experience-review',
    pageUrl: 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/',
    url: 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/#video-clinic-patient-experience-review',
    duration: 'PT20S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'یک ویدئوی کوتاه از تجربه مراجعه که برای تقویت لایه اعتماد، حضور واقعی و قابل‌پیگیری بودن کلینیک استفاده شده است.',
    transcript:
      'این ویدئو نقش تجربه مراجعه، مسیر تماس و هویت واقعی کلینیک را در تصمیم‌گیری زیبایی نشان می‌دهد. تمرکز متن روی این است که کاربر باید بتواند پزشک مسئول، مکان، مسیر رسمی تماس و محدودیت‌های تصمیم درمانی را قبل از مراجعه تشخیص دهد.',
    segments: [
      {
        name: 'هویت مکان',
        startOffset: 0,
        endOffset: 8,
        description: 'کلینیک و مسیر تماس به پزشک مسئول وصل می‌شود.',
        url: 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/?t=0#video-clinic-patient-experience-review',
      },
      {
        name: 'تجربه مراجعه',
        startOffset: 8,
        endOffset: 16,
        description: 'تصمیم زیبایی به محیط واقعی و فرایند ارزیابی وابسته می‌شود.',
        url: 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/?t=8#video-clinic-patient-experience-review',
      },
      {
        name: 'اعتماد قابل پیگیری',
        startOffset: 16,
        endOffset: 20,
        description: 'هویت بیرونی و مسیرهای رسمی برای کاهش ابهام برجسته می‌شوند.',
        url: 'https://www.ghezelbaash.ir/dr-saeed-ghezelbash-aesthetic-clinic/?t=16#video-clinic-patient-experience-review',
      },
    ],
  },
  {
    id: 'botox-vs-subcision-dynamic-static-scar',
    schemaNodeId: 'https://www.ghezelbaash.ir/botox-kermanshah/#video-botox-vs-subcision-dynamic-static-scar',
    pagePath: '/botox-kermanshah/',
    title: 'بوتاکس یا سابسیژن؟ مرز چین دینامیک با اسکار فیبروتیک',
    embedAnchor: '#video-botox-vs-subcision-dynamic-static-scar',
    pageUrl: 'https://www.ghezelbaash.ir/botox-kermanshah/',
    url: 'https://www.ghezelbaash.ir/botox-kermanshah/#video-botox-vs-subcision-dynamic-static-scar',
    duration: 'PT56S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'توضیح تفاوت تصمیمی بین مشکل وابسته به حرکت عضله و مشکل بافتی مانند اسکار فیبروتیک یا چسبندگی زیرپوستی که ممکن است مسیر درمانی دیگری مانند سابسیژن بخواهد.',
    transcript:
      'در این ویدئو، منطق سابسیژن به‌عنوان آزادسازی چسبندگی فیبروتیک زیر پوست توضیح داده می‌شود. تأکید متن بر این است که سابسیژن پرکننده همه فرورفتگی‌ها نیست و فقط وقتی معنا دارد که tethering یا rolling/tethered scar در معاینه مطرح باشد. تصمیم نهایی باید بین نوع اسکار، عمق چسبندگی، کیفیت پوست و ریسک‌های فردی تفکیک شود.',
    segments: [
      {
        name: 'تعریف مسئله',
        startOffset: 0,
        endOffset: 18,
        description: 'تفاوت فرورفتگی ساده با چسبندگی فیبروتیک زیرپوستی مشخص می‌شود.',
        url: 'https://www.ghezelbaash.ir/botox-kermanshah/?t=0#video-botox-vs-subcision-dynamic-static-scar',
      },
      {
        name: 'منطق آزادسازی',
        startOffset: 18,
        endOffset: 36,
        description: 'سابسیژن به‌عنوان آزادسازی tethering توضیح داده می‌شود، نه درمان عمومی همه اسکارها.',
        url: 'https://www.ghezelbaash.ir/botox-kermanshah/?t=18#video-botox-vs-subcision-dynamic-static-scar',
      },
      {
        name: 'حدود تصمیم',
        startOffset: 36,
        endOffset: 56,
        description: 'نیاز به معاینه و ترکیب احتمالی با مسیرهای دیگر یادآوری می‌شود.',
        url: 'https://www.ghezelbaash.ir/botox-kermanshah/?t=36#video-botox-vs-subcision-dynamic-static-scar',
      },
    ],
  },
  {
    id: 'filler-under-eye-transformation',
    schemaNodeId: 'https://www.ghezelbaash.ir/filler-kermanshah/#video-filler-under-eye-transformation',
    pagePath: '/filler-kermanshah/',
    title: 'فیلر زیر چشم؛ تغییر ظاهری وقتی علت درست خوانده شود',
    embedAnchor: '#video-filler-under-eye-transformation',
    pageUrl: 'https://www.ghezelbaash.ir/filler-kermanshah/',
    url: 'https://www.ghezelbaash.ir/filler-kermanshah/#video-filler-under-eye-transformation',
    duration: 'PT8S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'نمونه ویدئویی کوتاه برای توضیح اینکه زیر چشم فقط با پرکردن ساده تصمیم‌گیری نمی‌شود و علت گودی، سایه، پف یا افت میدفیس باید جدا شود.',
    transcript:
      'این ویدئو فیلر را به‌عنوان تصمیم مبتنی بر ناحیه، تناسب و ریسک توضیح می‌دهد، نه تزریق صرف برای پرکردن. پیام اصلی این است که زیر چشم، بینی، لب یا کانتورینگ هرکدام ریسک، عمق، مرز ایمنی و انتظار متفاوت دارند و تصمیم باید با معاینه، سابقه تزریق قبلی و نسبت اجزای صورت سنجیده شود.',
    segments: [
      {
        name: 'تعریف ناحیه',
        startOffset: 0,
        endOffset: 8,
        description: 'ناحیه هدف و مسئله اصلی قبل از تزریق مشخص می‌شود.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=0#video-filler-under-eye-transformation',
      },
      {
        name: 'ریسک و تناسب',
        startOffset: 8,
        endOffset: 16,
        description: 'ریسک عروقی، سابقه قبلی و تناسب کلی صورت وارد تصمیم می‌شوند.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=8#video-filler-under-eye-transformation',
      },
      {
        name: 'مرز انتظار',
        startOffset: 16,
        endOffset: 8,
        description: 'محدودیت فیلر و مواردی که به روش دیگری نیاز دارند توضیح داده می‌شود.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=16#video-filler-under-eye-transformation',
      },
    ],
  },
  {
    id: 'filler-under-eye-before-after',
    schemaNodeId: 'https://www.ghezelbaash.ir/filler-kermanshah/#video-filler-under-eye-before-after',
    pagePath: '/filler-kermanshah/',
    title: 'قبل و بعد فیلر زیر چشم؛ نتیجه را بدون معاینه تعمیم ندهید',
    embedAnchor: '#video-filler-under-eye-before-after',
    pageUrl: 'https://www.ghezelbaash.ir/filler-kermanshah/',
    url: 'https://www.ghezelbaash.ir/filler-kermanshah/#video-filler-under-eye-before-after',
    duration: 'PT8S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'نمونه کوتاه قبل/بعد برای صفحه فیلر زیر چشم با تأکید بر اینکه عکس یا ویدئو جای معاینه و تشخیص علت را نمی‌گیرد.',
    transcript:
      'این ویدئو فیلر را به‌عنوان تصمیم مبتنی بر ناحیه، تناسب و ریسک توضیح می‌دهد، نه تزریق صرف برای پرکردن. پیام اصلی این است که زیر چشم، بینی، لب یا کانتورینگ هرکدام ریسک، عمق، مرز ایمنی و انتظار متفاوت دارند و تصمیم باید با معاینه، سابقه تزریق قبلی و نسبت اجزای صورت سنجیده شود.',
    segments: [
      {
        name: 'تعریف ناحیه',
        startOffset: 0,
        endOffset: 8,
        description: 'ناحیه هدف و مسئله اصلی قبل از تزریق مشخص می‌شود.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=0#video-filler-under-eye-before-after',
      },
      {
        name: 'ریسک و تناسب',
        startOffset: 8,
        endOffset: 16,
        description: 'ریسک عروقی، سابقه قبلی و تناسب کلی صورت وارد تصمیم می‌شوند.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=8#video-filler-under-eye-before-after',
      },
      {
        name: 'مرز انتظار',
        startOffset: 16,
        endOffset: 8,
        description: 'محدودیت فیلر و مواردی که به روش دیگری نیاز دارند توضیح داده می‌شود.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=16#video-filler-under-eye-before-after',
      },
    ],
  },
  {
    id: 'filler-nose-before-after',
    schemaNodeId: 'https://www.ghezelbaash.ir/filler-kermanshah/#video-filler-nose-before-after',
    pagePath: '/filler-kermanshah/',
    title: 'فیلر بینی؛ صاف‌تر دیده‌شدن با کوچک‌شدن فرق دارد',
    embedAnchor: '#video-filler-nose-before-after',
    pageUrl: 'https://www.ghezelbaash.ir/filler-kermanshah/',
    url: 'https://www.ghezelbaash.ir/filler-kermanshah/#video-filler-nose-before-after',
    duration: 'PT8S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'نمونه کوتاه برای توضیح مرز فیلر بینی: هدف می‌تواند اصلاح دیداری بعضی ناهمواری‌ها باشد، نه کوچک‌کردن واقعی بینی.',
    transcript:
      'این ویدئو فیلر را به‌عنوان تصمیم مبتنی بر ناحیه، تناسب و ریسک توضیح می‌دهد، نه تزریق صرف برای پرکردن. پیام اصلی این است که زیر چشم، بینی، لب یا کانتورینگ هرکدام ریسک، عمق، مرز ایمنی و انتظار متفاوت دارند و تصمیم باید با معاینه، سابقه تزریق قبلی و نسبت اجزای صورت سنجیده شود.',
    segments: [
      {
        name: 'تعریف ناحیه',
        startOffset: 0,
        endOffset: 8,
        description: 'ناحیه هدف و مسئله اصلی قبل از تزریق مشخص می‌شود.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=0#video-filler-nose-before-after',
      },
      {
        name: 'ریسک و تناسب',
        startOffset: 8,
        endOffset: 16,
        description: 'ریسک عروقی، سابقه قبلی و تناسب کلی صورت وارد تصمیم می‌شوند.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=8#video-filler-nose-before-after',
      },
      {
        name: 'مرز انتظار',
        startOffset: 16,
        endOffset: 7,
        description: 'محدودیت فیلر و مواردی که به روش دیگری نیاز دارند توضیح داده می‌شود.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=16#video-filler-nose-before-after',
      },
    ],
  },
  {
    id: 'filler-nonsurgical-rhinoplasty-boundary',
    schemaNodeId: 'https://www.ghezelbaash.ir/filler-kermanshah/#video-filler-nonsurgical-rhinoplasty-boundary',
    pagePath: '/filler-kermanshah/',
    title: 'رینوپلاستی غیرجراحی؛ مرز نتیجه تصویری و محدودیت واقعی',
    embedAnchor: '#video-filler-nonsurgical-rhinoplasty-boundary',
    pageUrl: 'https://www.ghezelbaash.ir/filler-kermanshah/',
    url: 'https://www.ghezelbaash.ir/filler-kermanshah/#video-filler-nonsurgical-rhinoplasty-boundary',
    duration: 'PT7S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'ویدئوی کوتاه قبل/بعد برای نشان‌دادن اینکه نتیجه تصویری فیلر بینی باید در کنار محدودیت‌ها، ریسک و تفاوت آن با جراحی خوانده شود.',
    transcript:
      'این ویدئو فیلر را به‌عنوان تصمیم مبتنی بر ناحیه، تناسب و ریسک توضیح می‌دهد، نه تزریق صرف برای پرکردن. پیام اصلی این است که زیر چشم، بینی، لب یا کانتورینگ هرکدام ریسک، عمق، مرز ایمنی و انتظار متفاوت دارند و تصمیم باید با معاینه، سابقه تزریق قبلی و نسبت اجزای صورت سنجیده شود.',
    segments: [
      {
        name: 'تعریف ناحیه',
        startOffset: 0,
        endOffset: 8,
        description: 'ناحیه هدف و مسئله اصلی قبل از تزریق مشخص می‌شود.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=0#video-filler-nonsurgical-rhinoplasty-boundary',
      },
      {
        name: 'ریسک و تناسب',
        startOffset: 8,
        endOffset: 16,
        description: 'ریسک عروقی، سابقه قبلی و تناسب کلی صورت وارد تصمیم می‌شوند.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=8#video-filler-nonsurgical-rhinoplasty-boundary',
      },
      {
        name: 'مرز انتظار',
        startOffset: 16,
        endOffset: 7,
        description: 'محدودیت فیلر و مواردی که به روش دیگری نیاز دارند توضیح داده می‌شود.',
        url: 'https://www.ghezelbaash.ir/filler-kermanshah/?t=16#video-filler-nonsurgical-rhinoplasty-boundary',
      },
    ],
  },
  {
    id: 'thread-lift-cat-eye-before-after',
    schemaNodeId: 'https://www.ghezelbaash.ir/thread-lift-kermanshah/#video-thread-lift-cat-eye-before-after',
    pagePath: '/thread-lift-kermanshah/',
    title: 'قبل و بعد لیفت نخ چشم گربه‌ای؛ عکس و ویدئو را با احتیاط بخوانید',
    embedAnchor: '#video-thread-lift-cat-eye-before-after',
    pageUrl: 'https://www.ghezelbaash.ir/thread-lift-kermanshah/',
    url: 'https://www.ghezelbaash.ir/thread-lift-kermanshah/#video-thread-lift-cat-eye-before-after',
    duration: 'PT6S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'نمونه کوتاه قبل/بعد در زمینه لیفت نخ چشم گربه‌ای با تأکید بر اینکه نور، زاویه، ورم و انتخاب کاندید روی برداشت از نتیجه اثر می‌گذارند.',
    transcript:
      'این ویدئو لیفت نخ را از زاویه انتخاب درست کاندید توضیح می‌دهد. پیام اصلی این است که نخ برای هر افتادگی یا هر انتظار درمانی مناسب نیست؛ کیفیت پوست، شدت افتادگی، حجم ازدست‌رفته، مسیر کشش و مراقبت بعد از درمان باید قبل از تصمیم دیده شوند.',
    segments: [
      {
        name: 'انتخاب کاندید',
        startOffset: 0,
        endOffset: 8,
        description: 'شدت افتادگی، کیفیت پوست و انتظار فرد بررسی می‌شود.',
        url: 'https://www.ghezelbaash.ir/thread-lift-kermanshah/?t=0#video-thread-lift-cat-eye-before-after',
      },
      {
        name: 'مرز توان نخ',
        startOffset: 8,
        endOffset: 16,
        description: 'لیفت نخ با جراحی یا حجم‌دهی اشتباه گرفته نمی‌شود.',
        url: 'https://www.ghezelbaash.ir/thread-lift-kermanshah/?t=8#video-thread-lift-cat-eye-before-after',
      },
      {
        name: 'مراقبت و ریسک',
        startOffset: 16,
        endOffset: 5,
        description: 'مراقبت پس از نخ و محدودیت‌های نتیجه یادآوری می‌شود.',
        url: 'https://www.ghezelbaash.ir/thread-lift-kermanshah/?t=16#video-thread-lift-cat-eye-before-after',
      },
    ],
  },
  {
    id: 'aesthetic-subcision-technique-guide',
    schemaNodeId: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/#video-aesthetic-subcision-technique-guide',
    pagePath: '/aesthetic-concerns-kermanshah/',
    title: 'سابسیژن جای جوش؛ آزادسازی چسبندگی فیبروتیک زیر پوست',
    embedAnchor: '#video-aesthetic-subcision-technique-guide',
    pageUrl: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/',
    url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/#video-aesthetic-subcision-technique-guide',
    duration: 'PT36S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'ویدئوی آموزشی درباره منطق سابسیژن برای آزادسازی گیر و چسبندگی فیبروتیک زیرپوستی در موارد منتخب جای جوش، نه پرکردن همه چاله‌ها.',
    transcript:
      'در این ویدئو، منطق سابسیژن به‌عنوان آزادسازی چسبندگی فیبروتیک زیر پوست توضیح داده می‌شود. تأکید متن بر این است که سابسیژن پرکننده همه فرورفتگی‌ها نیست و فقط وقتی معنا دارد که tethering یا rolling/tethered scar در معاینه مطرح باشد. تصمیم نهایی باید بین نوع اسکار، عمق چسبندگی، کیفیت پوست و ریسک‌های فردی تفکیک شود.',
    segments: [
      {
        name: 'تعریف مسئله',
        startOffset: 0,
        endOffset: 11,
        description: 'تفاوت فرورفتگی ساده با چسبندگی فیبروتیک زیرپوستی مشخص می‌شود.',
        url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/?t=0#video-aesthetic-subcision-technique-guide',
      },
      {
        name: 'منطق آزادسازی',
        startOffset: 11,
        endOffset: 22,
        description: 'سابسیژن به‌عنوان آزادسازی tethering توضیح داده می‌شود، نه درمان عمومی همه اسکارها.',
        url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/?t=11#video-aesthetic-subcision-technique-guide',
      },
      {
        name: 'حدود تصمیم',
        startOffset: 22,
        endOffset: 35,
        description: 'نیاز به معاینه و ترکیب احتمالی با مسیرهای دیگر یادآوری می‌شود.',
        url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/?t=22#video-aesthetic-subcision-technique-guide',
      },
    ],
  },
  {
    id: 'aesthetic-mesoneedling-dark-spots-warning',
    schemaNodeId:
      'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/#video-aesthetic-mesoneedling-dark-spots-warning',
    pagePath: '/aesthetic-concerns-kermanshah/',
    title: 'چرا مزونیدلینگ می‌تواند لک را بدتر کند؟',
    embedAnchor: '#video-aesthetic-mesoneedling-dark-spots-warning',
    pageUrl: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/',
    url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/#video-aesthetic-mesoneedling-dark-spots-warning',
    duration: 'PT48S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'توضیح هشدارمحور درباره اینکه لک، ملاسما و PIH نباید بدون تشخیص نوع لک و محرک‌ها با درمان‌های تحریک‌کننده جلو برده شوند.',
    transcript:
      'این ویدئو با رویکرد هشدارمحور توضیح می‌دهد که لک، ملاسما و PIH قبل از هر درمان تحریک‌کننده باید از نظر نوع ضایعه، زمینه التهابی، آفتاب، دارو و سابقه بدترشدن بررسی شوند. پیام اصلی این است که مزونیدلینگ یا روش‌های مشابه اگر بدون تشخیص انتخاب شوند، در برخی افراد می‌توانند لک را تشدید کنند.',
    segments: [
      {
        name: 'تفکیک لک',
        startOffset: 0,
        endOffset: 16,
        description: 'نوع لک و زمینه التهابی قبل از انتخاب روش جدا می‌شود.',
        url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/?t=0#video-aesthetic-mesoneedling-dark-spots-warning',
      },
      {
        name: 'ریسک تحریک',
        startOffset: 16,
        endOffset: 32,
        description: 'توضیح داده می‌شود که تحریک بی‌موقع می‌تواند PIH یا لک را بدتر کند.',
        url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/?t=16#video-aesthetic-mesoneedling-dark-spots-warning',
      },
      {
        name: 'مسیر امن‌تر',
        startOffset: 32,
        endOffset: 48,
        description: 'تصمیم باید با تشخیص نوع لک، کنترل محرک‌ها و ارزیابی پوست شروع شود.',
        url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/?t=32#video-aesthetic-mesoneedling-dark-spots-warning',
      },
    ],
  },
  {
    id: 'aesthetic-jalupro-vs-profhilo-skin-boosters',
    schemaNodeId:
      'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/#video-aesthetic-jalupro-vs-profhilo-skin-boosters',
    pagePath: '/aesthetic-concerns-kermanshah/',
    title: 'جالپرو یا پروفایلو؟ تصمیم از نیاز پوست شروع می‌شود',
    embedAnchor: '#video-aesthetic-jalupro-vs-profhilo-skin-boosters',
    pageUrl: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/',
    url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/#video-aesthetic-jalupro-vs-profhilo-skin-boosters',
    duration: 'PT1M2S',
    transcriptKind: 'doctor-reviewed-video-transcript-layer',
    notice:
      'متن و بخش‌بندی این ویدئو پس از بازبینی محتوایی تأیید شده و برای فهم سریع‌تر کاربر، ایندکس‌پذیری بهتر و اتصال ویدئو به مسیر تصمیم‌گیری صفحه ارائه شده است.',
    summary:
      'مقایسه آموزشی جالپرو و پروفایلو با تأکید بر اینکه اسکین‌بوسترها جای فیلر کلاسیک نیستند و هدفشان کیفیت پوست است، نه تغییر فرم صورت.',
    transcript:
      'در این ویدئو، جالپرو و پروفایلو به‌عنوان مسیرهای بهبود کیفیت پوست توضیح داده می‌شوند، نه جایگزین فیلر کلاسیک برای تغییر فرم صورت. متن ویدئو روی این تفاوت تمرکز دارد که اسکین‌بوسترها بیشتر به کیفیت، آبرسانی و بافت پوست مربوط‌اند، در حالی که فیلر کلاسیک برای حجم و فرم استفاده می‌شود.',
    segments: [
      {
        name: 'تعریف اسکین‌بوستر',
        startOffset: 0,
        endOffset: 20,
        description: 'هدف اصلی جالپرو و پروفایلو از فیلر کلاسیک جدا می‌شود.',
        url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/?t=0#video-aesthetic-jalupro-vs-profhilo-skin-boosters',
      },
      {
        name: 'انتخاب براساس نیاز پوست',
        startOffset: 20,
        endOffset: 40,
        description: 'کیفیت پوست، آبرسانی و بافت از حجم‌دهی و کانتورینگ تفکیک می‌شوند.',
        url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/?t=20#video-aesthetic-jalupro-vs-profhilo-skin-boosters',
      },
      {
        name: 'مرز با فیلر',
        startOffset: 40,
        endOffset: 62,
        description: 'انتظار تغییر فرم صورت از اسکین‌بوستر کنترل می‌شود.',
        url: 'https://www.ghezelbaash.ir/aesthetic-concerns-kermanshah/?t=40#video-aesthetic-jalupro-vs-profhilo-skin-boosters',
      },
    ],
  },
];

export function getVideoTranscriptsForPage(pathname: string): VideoTranscriptEntry[] {
  return videoTranscripts.filter((item) => item.pagePath === pathname);
}
