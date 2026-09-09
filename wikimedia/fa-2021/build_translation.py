"""Assemble the reviewed Persian text and the original 50 bibliographic references."""
import hashlib
import html
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
ARTICLE_TITLE = 'ترجمه:سبک‌های دلبستگی، گسستگی و رویدادهای آسیب‌زا در افسردگی اساسی'
AUTHOR_TITLE = 'پدیدآورنده:محمدسعید قزلباش'
root = ET.parse(ROOT / 'source.xml').getroot()
refs = root.findall('.//ref-list/ref')
assert len(refs) == 50
reftext = {}
for ref in refs:
    number = int(ref.findtext('label').strip('.'))
    citation = ref.find('.//named-content[@content-type="citation-string"]')
    assert citation is not None
    text = ''.join(citation.itertext()).strip()
    reftext[number] = '<ref name="B{}"><span dir="ltr">{}</span></ref>'.format(number, html.escape(text, quote=False))
assert set(reftext) == set(range(1, 51))
parts = sorted(ROOT.glob('[0-9][0-9]-*.wiki'))
assert len(parts) == 6
raw = '\n\n'.join(p.read_text().strip() for p in parts)
used = []
def reference(match):
    numbers = [int(n) for n in match.group(1).split(',')]
    used.extend(numbers)
    return ''.join('<ref name="B{}" />'.format(n) for n in numbers)
article = re.sub(r'(?<!\[)\[(\d+(?:,\d+)*)\](?!\])', reference, raw)
assert set(used) == set(range(1, 51))
original_sequence = [int(''.join(x.itertext())) for x in root.findall('./body//xref[@ref-type="bibr"]')]
assert used == original_sequence, 'Reference order/count differs from original article'
article += '\n\n== منابع مقالهٔ اصلی ==\n<references>\n' + '\n'.join(reftext[n] for n in range(1, 51)) + '\n</references>\n'
article += '\n== مجوز و منشأ ترجمه ==\nمتن اصلی اثر نویسندگان نام‌برده و دارای مجوز [https://creativecommons.org/licenses/by/4.0/ CC BY 4.0] است. تغییر انجام‌شده، ترجمهٔ متن از انگلیسی به فارسی است. ترجمهٔ مشارکت‌کنندگان ویکی‌نبشته مطابق شرایط استفادهٔ پروژه، تحت مجوز [https://creativecommons.org/licenses/by-sa/4.0/ CC BY-SA 4.0] ارائه می‌شود. عبارت‌های مربوط به تأیید نویسندگان و بیانیه‌های اخلاقی در متن، ترجمهٔ بیانیه‌های مقالهٔ اصلی هستند.\n\n[[رده:ترجمه‌های ویکی‌نبشته]]\n'
article += '[[رده:ترجمه‌های ویکی‌نبشته از آثاری به زبان انگلیسی]]\n'
(ROOT / 'article.wiki').write_text(article)
assert len(ARTICLE_TITLE.encode()) <= 255
assert len(AUTHOR_TITLE.encode()) <= 255
assert article.count('{| class="wikitable"') == 3
assert article.count('|}') == 3
assert article.count('<ref name="B') == len(used) + 50
assert '{{Translation header' in article
assert not any(x in article for x in ['TODO', 'PLACEHOLDER'])
metadata = {
    'personal_item': 'Q140287622',
    'article_title': ARTICLE_TITLE,
    'author_title': AUTHOR_TITLE,
    'stylesheet_title': 'الگو:سرصفحه ترجمه/styles.css',
    'source_doi': '10.3390/healthcare9091169',
    'source_pmcid': 'PMC8469763',
    'source_license': 'CC-BY-4.0',
    'translation_license': 'CC-BY-SA-4.0',
    'source_xml_url': 'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC8469763/fullTextXML',
    'source_pdf_url': 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Healthcare_2021_9_1169_-_Golshani_et_al.pdf',
    'source_pdf_sha256': '96d2dfa1cd4abd3b838bffc944d7202b35784d67a85d0c5694f873139d3d0a60',
    'source_xml_sha256': hashlib.sha256((ROOT / 'source.xml').read_bytes()).hexdigest(),
    'reference_count': len(refs),
    'reference_occurrences': len(used),
    'table_count': 3,
    'ai_assistance_disclosed': True,
    'source_inconsistencies_preserved': True,
    'files': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in ['article.wiki', 'author.wiki', 'translation-header.css']},
}
(ROOT / 'manifest.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'article_bytes': len(article.encode()), 'references': len(refs), 'reference_occurrences': len(used), 'tables': 3, 'article_title_bytes': len(ARTICLE_TITLE.encode())}))
