#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from typing import Any
import requests

COMMONS = 'https://commons.wikimedia.org/w/api.php'
WIKIDATA = 'https://www.wikidata.org/w/api.php'
UA = 'Medicaldoctor91EntityUpgradeVerifier/1.0 (https://www.ghezelbaash.ir/)'
PERSON = 'Q140287622'
CLINIC = 'Q140288589'
PERSON_CAT = 'Category:Saeed Ghezelbash'
CLINIC_CAT = 'Category:Dr. Saeed Ghezelbash Aesthetic Clinic'
FILES = {
    'portrait': 'File:Saeed-Ghezelbaash-physician-portrait.jpg',
    'office': 'File:Saeed-Ghezelbaash-in-clinical-office.jpg',
    'team': 'File:Saeed-Ghezelbaash-with-clinical-team.jpg',
    'video': 'File:دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm',
}

s = requests.Session()
s.headers['User-Agent'] = UA


def get(url: str, **params):
    params.update(format='json', formatversion=2)
    r = s.get(url, params=params, timeout=60)
    r.raise_for_status()
    data = r.json()
    if 'error' in data:
        raise RuntimeError(json.dumps(data['error'], ensure_ascii=False))
    return data


def page(title: str) -> dict[str, Any]:
    return get(COMMONS, action='query', titles=title,
               prop='info|revisions|categories|pageprops', rvprop='content', rvslots='main', cllimit='max')['query']['pages'][0]


def text_of(p: dict[str, Any]) -> str:
    if 'missing' in p:
        return ''
    return p.get('revisions', [{}])[0].get('slots', {}).get('main', {}).get('content', '')


def cats_of(p: dict[str, Any]) -> set[str]:
    return {c['title'] for c in p.get('categories', [])}


def members(cat: str) -> set[str]:
    out: set[str] = set()
    cont = None
    while True:
        params = dict(action='query', list='categorymembers', cmtitle=cat, cmlimit='500', cmtype='file|page|subcat')
        if cont:
            params['cmcontinue'] = cont
        data = get(COMMONS, **params)
        out |= {m['title'] for m in data.get('query', {}).get('categorymembers', [])}
        cont = data.get('continue', {}).get('cmcontinue')
        if not cont:
            return out


def wd_entity(qid: str) -> dict[str, Any]:
    return get(WIKIDATA, action='wbgetentities', ids=qid, props='claims|sitelinks|labels|aliases')['entities'][qid]


def raw_value(claim: dict[str, Any]):
    return claim.get('mainsnak', {}).get('datavalue', {}).get('value')


def wd_values(ent: dict[str, Any], prop: str) -> list[Any]:
    out = []
    for c in ent.get('claims', {}).get(prop, []):
        v = raw_value(c)
        if isinstance(v, dict) and 'id' in v:
            v = v['id']
        out.append(v)
    return out


def extract_qids(value: Any) -> set[str]:
    out: set[str] = set()
    if isinstance(value, str):
        if re.fullmatch(r'Q[1-9][0-9]*', value):
            out.add(value)
    elif isinstance(value, list):
        for x in value:
            out |= extract_qids(x)
    elif isinstance(value, dict):
        direct = value.get('id')
        if isinstance(direct, str) and re.fullmatch(r'Q[1-9][0-9]*', direct):
            out.add(direct)
        numeric = value.get('numeric-id')
        if isinstance(numeric, int) and value.get('entity-type', 'item') == 'item':
            out.add(f'Q{numeric}')
        for x in value.values():
            out |= extract_qids(x)
    return out


def mediainfo(title: str) -> tuple[str, dict[str, Any]]:
    p = page(title)
    mid = p.get('pageprops', {}).get('wikibase_item')
    if not isinstance(mid, str) or not mid.startswith('M'):
        raise AssertionError(f'No MediaInfo id for {title}: {mid}')
    ent = get(COMMONS, action='wbgetentities', ids=mid, props='labels|claims')['entities'][mid]
    return mid, ent


def sdc_qids(ent: dict[str, Any], prop: str) -> set[str]:
    statements = ent.get('statements') or ent.get('claims') or {}
    out: set[str] = set()
    for st in statements.get(prop, []):
        out |= extract_qids(st.get('mainsnak', {}).get('datavalue', {}).get('value'))
    return out


def require(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def main():
    result: dict[str, Any] = {}

    person_page = page(PERSON_CAT)
    require('missing' not in person_page, 'Person category missing')
    pcats = cats_of(person_page)
    ptext = text_of(person_page)
    require('Category:Men of Kermanshah' in pcats, 'Men of Kermanshah missing from person category')
    require('Category:Pages with DEFAULTSORT conflicts' not in pcats, 'DEFAULTSORT conflict returned')
    require('Category:Dr. Saeed Ghezelbash Aesthetic Clinic' in ptext, 'Direct Commons clinic link missing from person category text')
    require(person_page.get('pageprops', {}).get('wikibase_item') == PERSON, 'Person category Wikibase binding drift')
    person_members = members(PERSON_CAT)
    for f in FILES.values():
        require(f in person_members, f'Original person media missing from category: {f}')
    result['person_category'] = {
        'wikibase_item': PERSON,
        'original_media_present': sorted(FILES.values()),
        'men_of_kermanshah': True,
        'defaultsort_conflict': False,
    }

    person_redirects = [
        'Category:سعید قزلباش', 'Category:دکتر سعید قزلباش',
        'Category:محمدسعید قزلباش', 'Category:دکتر محمدسعید قزلباش'
    ]
    for r in person_redirects:
        rp = page(r)
        require('missing' not in rp and '{{Category redirect|Saeed Ghezelbash' in text_of(rp), f'Bad person category redirect: {r}')
    result['person_category_redirects'] = person_redirects

    creator = page('Creator:Saeed Ghezelbash')
    require('missing' not in creator, 'Creator page missing')
    require('Q140287622' in text_of(creator) and '{{Creator' in text_of(creator), 'Creator page not QID-backed')
    creator_redirects = ['Creator:سعید قزلباش', 'Creator:محمدسعید قزلباش', 'Creator:دکتر سعید قزلباش']
    for r in creator_redirects:
        rp = page(r)
        rt = text_of(rp)
        require('missing' not in rp and '#REDIRECT' in rt.upper() and '[[Creator:Saeed Ghezelbash]]' in rt, f'Bad Creator redirect: {r}')
    result['creator'] = {'canonical': 'Creator:Saeed Ghezelbash', 'persian_redirects': creator_redirects}

    clinic_page = page(CLINIC_CAT)
    require('missing' not in clinic_page, 'Clinic category missing')
    require(clinic_page.get('pageprops', {}).get('wikibase_item') == CLINIC, 'Clinic category Wikibase binding missing/drifted')
    ccats = cats_of(clinic_page)
    require('Category:Clinics in Iran' in ccats, 'Clinic taxonomy missing Clinics in Iran')
    require('Category:Kermanshah' in ccats, 'Clinic taxonomy missing Kermanshah')
    require('Category:Pages with DEFAULTSORT conflicts' not in ccats, 'Clinic DEFAULTSORT conflict')
    ctext = text_of(clinic_page)
    for needle in [PERSON, CLINIC, '/g/11nqdfk76c', '/g/11r3rzdtb3']:
        require(needle in ctext, f'Clinic identity context missing {needle}')
    clinic_members = members(CLINIC_CAT)
    require(FILES['office'] in clinic_members, 'Office image missing from clinic category')
    require(FILES['team'] in clinic_members, 'Team image missing from clinic category')
    clinic_fa = page('Category:کلینیک زیبایی دکتر سعید قزلباش')
    require('{{Category redirect|Dr. Saeed Ghezelbash Aesthetic Clinic' in text_of(clinic_fa), 'Persian clinic category redirect missing')
    result['clinic_category'] = {
        'wikibase_item': CLINIC,
        'members_verified': [FILES['office'], FILES['team']],
        'persian_redirect': True,
    }

    expected_categories = {
        'portrait': {'Category:Saeed Ghezelbash', 'Category:Physicians with stethoscopes'},
        'office': {'Category:Saeed Ghezelbash', 'Category:Physicians with stethoscopes', "Category:Doctors' offices in Iran", CLINIC_CAT},
        'team': {'Category:Saeed Ghezelbash', 'Category:Physicians with stethoscopes', 'Category:Scrubs', CLINIC_CAT},
        'video': {'Category:Saeed Ghezelbash', 'Category:Aesthetic medicine', 'Category:Videos in Persian'},
    }
    sdc_summary = {}
    for key, title in FILES.items():
        fp = page(title)
        ft = text_of(fp)
        require('{{Creator:Saeed Ghezelbash}}' in ft, f'Creator template missing on {title}')
        actual = cats_of(fp)
        for cat in expected_categories[key]:
            require(cat in actual, f'Missing {cat} on {title}')
        mid, mi = mediainfo(title)
        creator_qids = sdc_qids(mi, 'P170')
        depicts_qids = sdc_qids(mi, 'P180')
        require(PERSON in creator_qids, f'SDC creator lost person QID on {title}')
        require(PERSON in depicts_qids, f'SDC depicts lost person QID on {title}')
        if key in {'office', 'team'}:
            clinic_context = depicts_qids | sdc_qids(mi, 'P1071')
            require(CLINIC in clinic_context, f'SDC clinic context lost on {title}')
        if key == 'video':
            require(PERSON in sdc_qids(mi, 'P10894'), 'Video spoken-by person QID missing')
        sdc_summary[key] = {'mediainfo': mid, 'creator': sorted(creator_qids), 'depicts': sorted(depicts_qids)}
    result['media'] = {'creator_template_all_four': True, 'sdc_preserved': sdc_summary}

    person = wd_entity(PERSON)
    clinic = wd_entity(CLINIC)
    require('Saeed Ghezelbash' in wd_values(person, 'P1472'), 'Person P1472 Creator page missing')
    require('Saeed Ghezelbash' in wd_values(person, 'P373'), 'Person P373 drift')
    require('/g/11nqdfk76c' in wd_values(person, 'P2671'), 'Person Google KG ID drift')
    require(person.get('sitelinks', {}).get('commonswiki', {}).get('title') == PERSON_CAT, 'Person Commons sitelink drift')
    require(CLINIC in wd_values(person, 'P1830'), 'Person owner-of clinic edge missing')
    require(CLINIC in wd_values(person, 'P937'), 'Person work-location clinic edge missing')

    require('Dr. Saeed Ghezelbash Aesthetic Clinic' in wd_values(clinic, 'P373'), 'Clinic P373 missing')
    require('/g/11r3rzdtb3' in wd_values(clinic, 'P2671'), 'Clinic Google Local KG ID drift')
    require(clinic.get('sitelinks', {}).get('commonswiki', {}).get('title') == CLINIC_CAT, 'Clinic Commons sitelink missing')
    result['wikidata'] = {
        'person_P1472': 'Saeed Ghezelbash',
        'person_commons_category': PERSON_CAT,
        'person_google_kg': '/g/11nqdfk76c',
        'clinic_commons_category': CLINIC_CAT,
        'clinic_google_kg': '/g/11r3rzdtb3',
        'person_clinic_edges': ['P1830', 'P937'],
        'entities_remain_distinct': True,
    }

    print(json.dumps({'ok': True, 'mode': 'live-read-only-verification', **result}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
