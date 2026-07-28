import re
from pathlib import Path

path = Path('src/pages/index.md')
text = path.read_text(encoding='utf-8')
lines = text.splitlines()

PROFILE = 'https://www.instagram.com/doctor.ghezelbaash/'
REELS = 'https://www.instagram.com/doctor.ghezelbaash/reels/'

# kind, source H2, source H3, exact anchor phrase, target heading ID, optional source-line discriminator
mappings = [
    ('profile','facial-aging-differential-diagnosis','identify-primary-aesthetic-cause','پیشانی برای بالا نگه‌داشتن ابرو','forehead-botox-goal-preserve-brow-function',''),
    ('profile','complications-aftercare-and-follow-up','general-aesthetic-treatment-risks-and-setting-boundaries','سابسیژن جای جوش','subcision-for-tethered-acne-scars',''),
    ('profile','skin-rejuvenation','jalupro-and-profhilo','پیلینگ، میکرونیدلینگ','acne-scar-resurfacing-microneedling-fractional-laser-and-peeling',''),
    ('profile','hair-loss','prp-vs-mesotherapy-selection-framework','مزوتراپی پوست','mesotherapy-for-skin-pigmentation-and-acne',''),
    ('profile','filler','filler-volume-shadow-and-proportion-assessment','فیلر خط فک','jawline-filler-candidacy',''),
    ('profile','aesthetic-treatment-selection','aesthetic-terminology-and-treatment-errors','هیالورونیداز یا هیالاز','hyaluronidase-definition',''),
    ('profile','aesthetic-treatment-selection','aesthetic-treatment-selection-faq','لیپوساکشن غبغب','submental-liposuction-candidacy',''),
    ('profile','aesthetic-treatment-selection','additional-aesthetic-treatment-decisions','فیلر باسن و هیپ‌دیپ','body-filler-hip-dip-buttock-doctor-selection',''),
    ('profile','aesthetic-treatment-candidacy','botox-contraindications-and-precautions','بوتاکس برای میگرن مزمن','botox-for-migraine-search-intent',''),
    ('profile','aesthetic-treatment-selection','aesthetic-terminology-and-treatment-errors','انتقال چربی از بدن خود بیمار','fat-grafting-is-living-tissue-transfer',''),
    ('profile','aesthetic-treatment-selection','choosing-an-aesthetic-doctor-in-kermanshah-and-iran','سابقه پژوهش، آموزش پزشکان','saeed-ghezelbash-research-education-and-clinical-decisions',''),
    ('profile','botox','upper-face-botox','نتیجه طبیعی','saeed-ghezelbash-natural-result-principle',''),
    ('profile','dr-saeed-ghezelbash-aesthetic-clinic-kermanshah','out-of-town-aesthetic-patients-iran','Revision، نظر دوم','revision-second-opinion-out-of-town-iran',''),
    ('profile','aesthetic-treatment-selection','choosing-an-aesthetic-doctor-in-kermanshah-and-iran','معاینه، طراحی درمان، پیگیری','clinic-consultation-treatment-and-follow-up-path',''),
    ('profile','aesthetic-treatment-failure-from-diagnostic-error','revision-second-opinion-out-of-town-iran','تصمیم پزشکی','choosing-an-aesthetic-doctor-in-kermanshah-and-iran',''),
    ('profile','facial-aging-differential-diagnosis','identify-primary-aesthetic-cause','نخ در کاندید مناسب','ideal-thread-lift-candidate',''),

    ('reels','facial-aging-differential-diagnosis','identify-primary-aesthetic-cause','بوتاکس عضله را آرام می‌کند','botox-mechanism-indications-and-limitations',''),
    ('reels','facial-aging-differential-diagnosis','facial-aging-muscle-volume-skin-laxity','بوتاکس بهتر است یا فیلر؟','botox-vs-filler-differences',''),
    ('reels','aesthetic-treatment-failure-from-diagnostic-error','botox-and-thread-lift-result-correction','افتادگی پلک','botox-induced-eyelid-ptosis-causes',''),
    ('reels','aesthetic-treatment-failure-from-diagnostic-error','overfilled-face-filler-migration-and-previous-treatment','فیلر مهاجرت‌کرده','lip-filler-migration-causes',''),
    ('reels','complications-aftercare-and-follow-up','filler-complications-correction-and-aftercare','حل‌کردن فیلر','filler-safety-correction-and-pre-treatment-questions',''),
    ('reels','facial-aging-differential-diagnosis','facial-aging-muscle-volume-skin-laxity','زیر چشم سایه‌دار','tear-trough-filler-for-dark-circles-limitations',''),
    ('reels','aesthetic-treatment-selection','additional-aesthetic-treatment-decisions','فیلر بینی برای کوچک کردن بینی نیست','nonsurgical-rhinoplasty-size-reduction-limitations',''),
    ('reels','facial-aging-differential-diagnosis','identify-primary-aesthetic-cause','سابسیژن می‌تواند برای بعضی اسکارهای چسبیده مطرح شود','subcision-acne-scar-candidacy',''),
    ('reels','aesthetic-treatment-selection','aesthetic-treatment-selection-faq','کانتورینگ یعنی اصلاح نسبت‌ها','jawline-contouring-candidacy',''),
    ('reels','skin-rejuvenation','jalupro-and-profhilo','جالپرو یا پروفایلو؟','jalupro-vs-profhilo','سؤال «جالپرو یا پروفایلو؟»'),
    ('reels','skin-rejuvenation','jalupro-and-profhilo','کدری از ملاسما','melasma-recurrence-and-multimodal-treatment',''),
    ('reels','complications-aftercare-and-follow-up','filler-complications-correction-and-aftercare','فیلر بدن','body-contouring-and-body-filler','بیمار باید نام ماده'),
    ('reels','complications-aftercare-and-follow-up','general-aesthetic-treatment-risks-and-setting-boundaries','لیپوساکشن غبغب وقتی معنا دارد که مشکل واقعاً چربی‌محور باشد','submental-liposuction-candidacy-by-cause',''),
]

heading_re = re.compile(r'<h([2-6])\b[^>]*\bid="([^"]+)"[^>]*>(.*?)</h\1>', re.I)
current_h2 = current_h3 = ''
contexts = []
targets = {}
for line in lines:
    match = heading_re.search(line)
    if match:
        level, heading_id = int(match.group(1)), match.group(2)
        if level == 2:
            current_h2, current_h3 = heading_id, ''
        elif level == 3:
            current_h3 = heading_id
        targets[heading_id] = line
    contexts.append((current_h2, current_h3))

html_anchor_re = re.compile(r'(<a\b[^>]*>.*?</a>)', re.I)
markdown_link_re = re.compile(r'(\[[^\]]+\]\([^\)]+\))')

def is_rendered_paragraph(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if '<p' in line.lower():
        return True
    return not stripped.startswith(('<', '- ', '* ', '+ ', '> ', '```', '#'))

def replace_unlinked(line: str, phrase: str, replacement: str):
    html_parts = html_anchor_re.split(line)
    for html_index in range(0, len(html_parts), 2):
        markdown_parts = markdown_link_re.split(html_parts[html_index])
        for markdown_index in range(0, len(markdown_parts), 2):
            if phrase in markdown_parts[markdown_index]:
                markdown_parts[markdown_index] = markdown_parts[markdown_index].replace(phrase, replacement, 1)
                html_parts[html_index] = ''.join(markdown_parts)
                return ''.join(html_parts), True
    return line, False

applied = []
for kind, source_h2, source_h3, phrase, target, discriminator in mappings:
    expected_destination = PROFILE if kind == 'profile' else REELS
    target_heading = targets.get(target, '')
    assert f'href="{expected_destination}"' in target_heading, f'{target}: unexpected social destination'

    matches = []
    for index, line in enumerate(lines):
        h2, h3 = contexts[index]
        if h2 != source_h2 or h3 != source_h3 or not is_rendered_paragraph(line):
            continue
        if phrase not in line or (discriminator and discriminator not in line):
            continue
        updated, changed = replace_unlinked(line, phrase, f'<a href="#{target}">{phrase}</a>')
        if changed:
            matches.append((index, updated))

    assert len(matches) == 1, f'{target}: expected one paragraph occurrence, found {len(matches)}'
    index, updated = matches[0]
    lines[index] = updated
    applied.append((kind, target, phrase, index + 1, source_h2, source_h3))

result = '\n'.join(lines) + ('\n' if text.endswith('\n') else '')
assert len(applied) == 29
for kind, target, phrase, *_ in applied:
    assert result.count(f'<a href="#{target}">{phrase}</a>') == 1

profile_heading_count = len(re.findall(r'<h[3-5]\b[^>]*>\s*<a href="https://www\.instagram\.com/doctor\.ghezelbaash/"\s+rel="me external">', result, re.I))
reels_heading_count = len(re.findall(r'<h[3-5]\b[^>]*>\s*<a href="https://www\.instagram\.com/doctor\.ghezelbaash/reels/"\s+rel="external">', result, re.I))
assert profile_heading_count == 35
assert reels_heading_count == 25

path.write_text(result, encoding='utf-8')

report = [
    f'APPLIED={len(applied)}',
    f'PROFILE_TARGET_LINKS={sum(item[0] == "profile" for item in applied)}',
    f'REELS_TARGET_LINKS={sum(item[0] == "reels" for item in applied)}',
    f'PROFILE_HEADINGS_PRESERVED={profile_heading_count}',
    f'REELS_HEADINGS_PRESERVED={reels_heading_count}',
    '',
]
report.extend('\t'.join(map(str, item)) for item in applied)
Path('paragraph-social-links-report.txt').write_text('\n'.join(report) + '\n', encoding='utf-8')
print('\n'.join(report))
