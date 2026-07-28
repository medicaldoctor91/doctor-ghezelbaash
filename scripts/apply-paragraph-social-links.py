import re
from pathlib import Path

path = Path('src/pages/index.md')
text = path.read_text(encoding='utf-8')
lines = text.splitlines()

mappings = [
('facial-aging-differential-diagnosis','identify-primary-aesthetic-cause','پیشانی برای بالا نگه‌داشتن ابرو','forehead-botox-goal-preserve-brow-function'),
('complications-aftercare-and-follow-up','general-aesthetic-treatment-risks-and-setting-boundaries','سابسیژن جای جوش','subcision-for-tethered-acne-scars'),
('skin-rejuvenation','jalupro-and-profhilo','پیلینگ، میکرونیدلینگ','acne-scar-resurfacing-microneedling-fractional-laser-and-peeling'),
('hair-loss','prp-vs-mesotherapy-selection-framework','مزوتراپی پوست','mesotherapy-for-skin-pigmentation-and-acne'),
('filler','filler-volume-shadow-and-proportion-assessment','فیلر خط فک','jawline-filler-candidacy'),
('aesthetic-treatment-selection','aesthetic-terminology-and-treatment-errors','هیالورونیداز یا هیالاز','hyaluronidase-definition'),
('aesthetic-treatment-selection','aesthetic-treatment-selection-faq','لیپوساکشن غبغب','submental-liposuction-candidacy'),
('aesthetic-treatment-selection','additional-aesthetic-treatment-decisions','فیلر باسن و هیپ‌دیپ','body-filler-hip-dip-buttock-doctor-selection'),
('aesthetic-treatment-candidacy','botox-contraindications-and-precautions','بوتاکس برای میگرن مزمن','botox-for-migraine-search-intent'),
('aesthetic-treatment-selection','aesthetic-terminology-and-treatment-errors','انتقال چربی از بدن خود بیمار','fat-grafting-is-living-tissue-transfer'),
('aesthetic-treatment-selection','choosing-an-aesthetic-doctor-in-kermanshah-and-iran','سابقه پژوهش، آموزش پزشکان','saeed-ghezelbash-research-education-and-clinical-decisions'),
('botox','upper-face-botox','نتیجه طبیعی','saeed-ghezelbash-natural-result-principle'),
('dr-saeed-ghezelbash-aesthetic-clinic-kermanshah','out-of-town-aesthetic-patients-iran','Revision، نظر دوم','revision-second-opinion-out-of-town-iran'),
('aesthetic-treatment-selection','choosing-an-aesthetic-doctor-in-kermanshah-and-iran','معاینه، طراحی درمان، پیگیری','clinic-consultation-treatment-and-follow-up-path'),
('aesthetic-treatment-failure-from-diagnostic-error','revision-second-opinion-out-of-town-iran','تصمیم پزشکی','choosing-an-aesthetic-doctor-in-kermanshah-and-iran'),
('facial-aging-differential-diagnosis','identify-primary-aesthetic-cause','نخ در کاندید مناسب','ideal-thread-lift-candidate'),
('facial-aging-differential-diagnosis','identify-primary-aesthetic-cause','بوتاکس عضله را آرام می‌کند','botox-mechanism-indications-and-limitations'),
('facial-aging-differential-diagnosis','facial-aging-muscle-volume-skin-laxity','بوتاکس بهتر است یا فیلر؟','botox-vs-filler-differences'),
('aesthetic-treatment-failure-from-diagnostic-error','botox-and-thread-lift-result-correction','افتادگی پلک','botox-induced-eyelid-ptosis-causes'),
('aesthetic-treatment-failure-from-diagnostic-error','overfilled-face-filler-migration-and-previous-treatment','فیلر مهاجرت‌کرده','lip-filler-migration-causes'),
('complications-aftercare-and-follow-up','filler-complications-correction-and-aftercare','حل‌کردن فیلر','filler-safety-correction-and-pre-treatment-questions'),
('facial-aging-differential-diagnosis','facial-aging-muscle-volume-skin-laxity','زیر چشم سایه‌دار','tear-trough-filler-for-dark-circles-limitations'),
('aesthetic-treatment-selection','additional-aesthetic-treatment-decisions','کوچک کردن بینی','nonsurgical-rhinoplasty-size-reduction-limitations'),
('facial-aging-differential-diagnosis','identify-primary-aesthetic-cause','سابسیژن می‌تواند برای بعضی اسکارهای چسبیده مطرح شود','subcision-acne-scar-candidacy'),
('aesthetic-treatment-selection','aesthetic-treatment-selection-faq','کانتورینگ یعنی اصلاح نسبت‌ها','jawline-contouring-candidacy'),
('skin-rejuvenation','jalupro-and-profhilo','جالپرو یا پروفایلو','jalupro-vs-profhilo'),
('skin-rejuvenation','jalupro-and-profhilo','کدری از ملاسما','melasma-recurrence-and-multimodal-treatment'),
('complications-aftercare-and-follow-up','filler-complications-correction-and-aftercare','فیلر بدن','body-contouring-and-body-filler'),
('complications-aftercare-and-follow-up','general-aesthetic-treatment-risks-and-setting-boundaries','لیپوساکشن غبغب وقتی معنا دارد که مشکل واقعاً چربی‌محور باشد','submental-liposuction-candidacy-by-cause'),
]

heading_re = re.compile(r'<h([2-6])\b[^>]*\bid="([^"]+)"[^>]*>(.*?)</h\1>', re.I)
current_h2 = current_h3 = ''
contexts = []
targets = set()
for line in lines:
    m = heading_re.search(line)
    if m:
        level, hid = int(m.group(1)), m.group(2)
        targets.add(hid)
        if level == 2:
            current_h2, current_h3 = hid, ''
        elif level == 3:
            current_h3 = hid
    contexts.append((current_h2, current_h3))

html_anchor_re = re.compile(r'(<a\b[^>]*>.*?</a>)', re.I)
md_link_re = re.compile(r'(\[[^\]]+\]\([^\)]+\))')

def replace_unlinked(line, phrase, replacement):
    parts = html_anchor_re.split(line)
    for i in range(0, len(parts), 2):
        subs = md_link_re.split(parts[i])
        for j in range(0, len(subs), 2):
            if phrase in subs[j]:
                subs[j] = subs[j].replace(phrase, replacement, 1)
                parts[i] = ''.join(subs)
                return ''.join(parts), True
    return line, False

applied, skipped = [], []
for src_h2, src_h3, phrase, target in mappings:
    if target not in targets:
        skipped.append((target, 'missing-target', phrase))
        continue
    found = []
    for i, line in enumerate(lines):
        h2, h3 = contexts[i]
        if h2 == src_h2 and h3 == src_h3 and '<p' in line.lower() and phrase in line:
            new, ok = replace_unlinked(line, phrase, f'<a href="#{target}">{phrase}</a>')
            if ok:
                found.append((i, new))
    if len(found) != 1:
        skipped.append((target, f'occurrences-{len(found)}', phrase))
        continue
    i, new = found[0]
    lines[i] = new
    applied.append((target, phrase, i + 1))

assert len(applied) >= 18, (len(applied), skipped)
result = '\n'.join(lines) + ('\n' if text.endswith('\n') else '')
for target, phrase, _ in applied:
    assert result.count(f'<a href="#{target}">{phrase}</a>') == 1
path.write_text(result, encoding='utf-8')

report = [f'APPLIED={len(applied)}', f'SKIPPED={len(skipped)}', '', 'APPLIED']
report += ['\t'.join(map(str, row)) for row in applied]
report += ['', 'SKIPPED']
report += ['\t'.join(map(str, row)) for row in skipped]
Path('paragraph-social-links-report.txt').write_text('\n'.join(report) + '\n', encoding='utf-8')
print('\n'.join(report))

# Triggered after workflow activation.
