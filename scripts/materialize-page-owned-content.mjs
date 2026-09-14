import fs from "node:fs";

const file = "src/content-source/page.md";
let source = fs.readFileSync(file, "utf8");
const beforeAll = source;

const governanceStart = "<!--SITE_FOOTER_GOVERNANCE_START\n";
const governanceEnd = "\nSITE_FOOTER_GOVERNANCE_END-->";
const governanceHtml = `  <details class="editorial-governance" id="privacy-and-terms">
    <summary>بازبینی پزشکی، حریم خصوصی و شرایط استفاده</summary>
    <p>
      محتوای پزشکی این صفحه توسط دکتر سعید قزلباش بازبینی می‌شود و جایگزین
      معاینه و تصمیم درمانی حضوری نیست. جزئیات حساس پزشکی را در پیام عمومی
      شبکه‌های اجتماعی ارسال نکنید؛ در صورت نشانه‌های اورژانسی پس از اقدام
      پزشکی، ارزیابی حضوری فوری اولویت دارد.
    </p>
    <p>
      امتیاز و تعداد نظر کلینیک یک مشاهدهٔ زمان‌دار از Google Maps است که هر شش
      ساعت بررسی می‌شود. متن نظرها و اطلاعات شخصی کاربران دریافت یا ذخیره
      نمی‌شود و منبع داده با پیوند مستقیم مشخص است. استفاده از این داده تابع
      <a href="https://www.google.com/help/terms_maps/" rel="external noopener"
        >شرایط Google Maps</a
      > و <a href="https://policies.google.com/privacy" rel="external noopener"
        >خط‌مشی حریم خصوصی Google</a
      > است.
    </p>
  </details>`;

if (!source.includes(governanceStart)) {
  const boundary = "\n---\n";
  const count = source.split(boundary).length - 1;
  if (count !== 1)
    throw new Error(`footer governance frontmatter boundary drift: ${count}`);
  source = source.replace(
    boundary,
    `${boundary}${governanceStart}${governanceHtml}${governanceEnd}\n`,
  );
} else {
  const starts = source.split(governanceStart).length - 1;
  const ends = source.split(governanceEnd).length - 1;
  if (starts !== 1 || ends !== 1)
    throw new Error(`footer governance source block duplication: ${starts}/${ends}`);
  const start = source.indexOf(governanceStart) + governanceStart.length;
  const end = source.indexOf(governanceEnd, start);
  if (source.slice(start, end) !== governanceHtml)
    throw new Error("footer governance source block drift");
}

const replacements = [
  [
    "{{CLINIC_HOURS_COMPACT_FA}}",
    "شنبه تا پنجشنبه {{CLINIC_HOURS_OPEN_COMPACT_FA}}–{{CLINIC_HOURS_CLOSE_COMPACT_FA}}؛ جمعه تعطیل",
    "hero clinic hours wording",
  ],
  [
    "{{CLINIC_HOURS_WEEKDAYS_FA}}؛ <strong>{{CLINIC_FRIDAY_CLOSED_FA}}</strong>",
    "شنبه تا پنجشنبه، {{CLINIC_HOURS_OPEN_FA}} تا {{CLINIC_HOURS_CLOSE_FA}}؛ <strong>جمعه تعطیل.</strong>",
    "clinic facts hours wording",
  ],
];
for (const [before, after, label] of replacements) {
  if (source.includes(after)) {
    if (source.includes(before))
      throw new Error(`${label}: old and new forms coexist`);
    continue;
  }
  const count = source.split(before).length - 1;
  if (count !== 1)
    throw new Error(`${label}: expected one source occurrence, found ${count}`);
  source = source.replace(before, after);
}

if (source !== beforeAll) fs.writeFileSync(file, source);
console.log(JSON.stringify({
  pageOwnershipMaterialized: true,
  changed: source !== beforeAll,
  governanceSource: "page.md",
  visibleHoursWordingSource: "page.md",
}));
