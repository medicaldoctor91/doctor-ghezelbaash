#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
from typing import Any
import requests

COMMONS = 'https://commons.wikimedia.org/w/api.php'
WIKIDATA = 'https://www.wikidata.org/w/api.php'
USERNAME = os.environ['COMMONS_USERNAME']
PASSWORD = os.environ['COMMONS_BOT_PASSWORD']
UA = 'Medicaldoctor91EntityUpgrade/1.0 (https://www.ghezelbaash.ir/)'

PERSON_QID = 'Q140287622'
CLINIC_QID = 'Q140288589'
PERSON_CAT = 'Category:Saeed Ghezelbash'
CLINIC_CAT = 'Category:Dr. Saeed Ghezelbash Aesthetic Clinic'
CREATOR = 'Creator:Saeed Ghezelbash'

s = requests.Session()
s.headers['User-Agent'] = UA


def req(method: str, url: str, **kwargs):
    r = s.request(method, url, timeout=60, **kwargs)
    r.raise_for_status()
    data = r.json()
    if 'error' in data:
        raise RuntimeError(json.dumps(data['error'], ensure_ascii=False))
    return data


def get(url: str, **params):
    params.update(format='json', formatversion=2)
    return req('GET', url, params=params)


def post(url: str, **data):
    data.update(format='json', formatversion=2)
    return req('POST', url, data=data)


def login(url: str):
    tok = get(url, action='query', meta='tokens', type='login')['query']['tokens']['logintoken']
    result = post(url, action='login', lgname=USERNAME, lgpassword=PASSWORD, lgtoken=tok)
    if result.get('login', {}).get('result') != 'Success':
        raise RuntimeError(f'Login failed on {url}: {result}')
    info = get(url, action='query', meta='userinfo', uiprop='rights')['query']['userinfo']
    if info.get('anon') is not None:
        raise RuntimeError(f'Anonymous after login on {url}')
    return info


def csrf(url: str) -> str:
    return get(url, action='query', meta='tokens', type='csrf')['query']['tokens']['csrftoken']


def page(title: str) -> dict[str, Any]:
    return get(COMMONS, action='query', titles=title, prop='info|revisions|categories|pageprops', rvprop='content|timestamp', rvslots='main', cllimit='max')['query']['pages'][0]


def text_of(p: dict[str, Any]) -> str:
    if 'missing' in p:
        return ''
    return p.get('revisions', [{}])[0].get('slots', {}).get('main', {}).get('content', '')


def edit(title: str, text: str, summary: str, token: str):
    return post(COMMONS, action='edit', title=title, text=text, summary=summary, token=token,
                bot=1, maxlag=5, **{'assert': 'user'})


def ensure_page(title: str, desired: str, summary: str, token: str, validator=None):
    p = page(title)
    current = text_of(p)
    if 'missing' in p:
        edit(title, desired, summary, token)
        return 'created'
    if validator and validator(current):
        return 'already-ok'
    if current.strip() == desired.strip():
        return 'already-ok'
    raise RuntimeError(f'Existing page {title} has unexpected content; refusing overwrite')


def append_category(text: str, cat: str) -> str:
    line = f'[[Category:{cat}]]'
    if line in text:
        return text
    return text.rstrip() + '\n' + line + '\n'


def replace_author_with_creator(text: str) -> str:
    creator = '{{Creator:Saeed Ghezelbash}}'
    patterns = [
        r'(\|\s*author\s*=\s*)\[\[User:Medicaldoctor91\|Medicaldoctor91\]\]',
        r'(\|\s*author\s*=\s*)\[\[:d:Q140287622\|Saeed Ghezelbash / دکتر سعید قزلباش\]\]',
    ]
    out = text
    for pat in patterns:
        out = re.sub(pat, lambda m: m.group(1) + creator, out)
    return out


def entity(qid: str) -> dict[str, Any]:
    return get(WIKIDATA, action='wbgetentities', ids=qid, props='claims|sitelinks')['entities'][qid]


def claim_strings(ent: dict[str, Any], prop: str) -> list[str]:
    out = []
    for c in ent.get('claims', {}).get(prop, []):
        v = c.get('mainsnak', {}).get('datavalue', {}).get('value')
        if isinstance(v, str):
            out.append(v)
    return out


def ensure_string_claim(qid: str, prop: str, value: str, token: str, summary: str):
    ent = entity(qid)
    vals = claim_strings(ent, prop)
    if value in vals:
        return 'already-ok'
    if vals:
        raise RuntimeError(f'{qid} {prop} already has different value(s): {vals}')
    return post(WIKIDATA, action='wbcreateclaim', entity=qid, property=prop, snaktype='value',
                value=json.dumps(value, ensure_ascii=False), token=token, bot=1, summary=summary,
                **{'assert': 'user'}).get('claim', {}).get('id', 'created')


def ensure_sitelink(qid: str, site: str, title: str, token: str, summary: str):
    ent = entity(qid)
    current = ent.get('sitelinks', {}).get(site)
    if current and current.get('title') == title:
        return 'already-ok'
    if current:
        raise RuntimeError(f'{qid} already has {site} sitelink to {current.get("title")}')
    post(WIKIDATA, action='wbsetsitelink', id=qid, linksite=site, linktitle=title,
         token=token, bot=1, summary=summary, **{'assert': 'user'})
    return 'created'


def assert_category_exists(name: str):
    p = page(f'Category:{name}')
    if 'missing' in p:
        raise RuntimeError(f'Required category missing: Category:{name}')


def main():
    commons_user = login(COMMONS)
    wikidata_user = login(WIKIDATA)
    ctoken = csrf(COMMONS)
    wtoken = csrf(WIKIDATA)

    for required in ['Men of Kermanshah', 'Physicians with stethoscopes', "Doctors' offices in Iran", 'Clinics in Iran', 'Kermanshah']:
        assert_category_exists(required)

    results: dict[str, Any] = {'authenticated_commons_as': commons_user.get('name'), 'authenticated_wikidata_as': wikidata_user.get('name')}

    cat_redirects = [
        'Category:سعید قزلباش',
        'Category:دکتر سعید قزلباش',
        'Category:محمدسعید قزلباش',
        'Category:دکتر محمدسعید قزلباش',
    ]
    results['person_category_redirects'] = {}
    for title in cat_redirects:
        desired = '{{Category redirect|Saeed Ghezelbash}}\n'
        results['person_category_redirects'][title] = ensure_page(
            title, desired, 'Create Persian name redirect to canonical Saeed Ghezelbash category', ctoken,
            validator=lambda t: '{{Category redirect|Saeed Ghezelbash' in t)

    creator_text = '{{Creator\n | Wikidata = Q140287622\n | Option = {{{1|}}}\n}}\n'
    results['creator_page'] = ensure_page(
        CREATOR, creator_text, 'Create Wikidata-backed Creator page for Saeed Ghezelbash', ctoken,
        validator=lambda t: 'Wikidata = Q140287622' in t and '{{Creator' in t)
    results['creator_redirects'] = {}
    for title in ['Creator:سعید قزلباش', 'Creator:محمدسعید قزلباش', 'Creator:دکتر سعید قزلباش']:
        desired = '#REDIRECT [[Creator:Saeed Ghezelbash]]\n'
        results['creator_redirects'][title] = ensure_page(
            title, desired, 'Redirect Persian creator name to Creator:Saeed Ghezelbash', ctoken,
            validator=lambda t: '[[Creator:Saeed Ghezelbash]]' in t and '#REDIRECT' in t.upper())

    clinic_text = """{{Wikidata Infobox|qid=Q140288589|defaultsort=no}}
{{fa|'''کلینیک زیبایی دکتر سعید قزلباش''' در کرمانشاه، انتیتی محلی و بالینی مرتبط با '''[[:Category:Saeed Ghezelbash|دکتر سعید قزلباش / سعید قزلباش]]''' است. Wikidata: [[d:Q140288589|Q140288589]]؛ Google Local Knowledge Graph ID: <code>/g/11r3rzdtb3</code>. پزشک مرتبط: [[d:Q140287622|Q140287622]]؛ Google Knowledge Graph ID: <code>/g/11nqdfk76c</code>.}}
{{en|'''Dr. Saeed Ghezelbash Aesthetic Clinic''' in Kermanshah is the clinical/local entity associated with '''[[:Category:Saeed Ghezelbash|Saeed Ghezelbash]]'''. Wikidata: [[d:Q140288589|Q140288589]]; Google Local Knowledge Graph ID: <code>/g/11r3rzdtb3</code>. Related physician: [[d:Q140287622|Q140287622]]; Google Knowledge Graph ID: <code>/g/11nqdfk76c</code>.}}
{{fa|در ویکی‌داده، [[d:Q140287622|شخص]] از طریق [[d:Property:P1830|owner of (P1830)]] و [[d:Property:P937|work location (P937)]] به این کلینیک متصل است؛ شخص و کلینیک دو انتیتی متمایز اما مرتبط‌اند.}}
{{en|On Wikidata, the [[d:Q140287622|person]] is linked to this clinic through [[d:Property:P1830|owner of (P1830)]] and [[d:Property:P937|work location (P937)]]; the person and clinic remain distinct but related entities.}}

{{DEFAULTSORT:Ghezelbash Aesthetic Clinic, Saeed}}
[[Category:Clinics in Iran]]
[[Category:Kermanshah]]
"""
    results['clinic_category'] = ensure_page(
        CLINIC_CAT, clinic_text, 'Create Commons category for Dr. Saeed Ghezelbash Aesthetic Clinic', ctoken,
        validator=lambda t: 'Q140288589' in t and '{{Wikidata Infobox' in t)
    results['clinic_category_fa_redirect'] = ensure_page(
        'Category:کلینیک زیبایی دکتر سعید قزلباش', '{{Category redirect|Dr. Saeed Ghezelbash Aesthetic Clinic}}\n',
        'Create Persian redirect to clinic category', ctoken,
        validator=lambda t: '{{Category redirect|Dr. Saeed Ghezelbash Aesthetic Clinic' in t)

    p = page(PERSON_CAT)
    person_text = text_of(p)
    person_text = append_category(person_text, 'Men of Kermanshah')
    person_text = person_text.replace(
        'کلینیک مرتبط: [[d:Q140288589|Q140288589]] با Google local Knowledge Graph ID',
        'کلینیک مرتبط: [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|کلینیک زیبایی دکتر سعید قزلباش]] ([[d:Q140288589|Q140288589]]) با Google local Knowledge Graph ID')
    person_text = person_text.replace(
        'Related clinic: [[d:Q140288589|Q140288589]], Google local Knowledge Graph ID',
        'Related clinic: [[:Category:Dr. Saeed Ghezelbash Aesthetic Clinic|Dr. Saeed Ghezelbash Aesthetic Clinic]] ([[d:Q140288589|Q140288589]]), Google local Knowledge Graph ID')
    edit(PERSON_CAT, person_text, 'Strengthen local taxonomy and person-clinic Commons linkage', ctoken)
    results['person_category_updated'] = True

    file_rules = {
        'File:Saeed-Ghezelbaash-physician-portrait.jpg': ['Physicians with stethoscopes'],
        'File:Saeed-Ghezelbaash-in-clinical-office.jpg': ['Physicians with stethoscopes', "Doctors' offices in Iran", 'Dr. Saeed Ghezelbash Aesthetic Clinic'],
        'File:Saeed-Ghezelbaash-with-clinical-team.jpg': ['Dr. Saeed Ghezelbash Aesthetic Clinic'],
        'File:دکتر سعید قزلباش درباره جالپرو و پروفایلو.webm': [],
    }
    results['files'] = {}
    for title, cats in file_rules.items():
        fp = page(title)
        ft = replace_author_with_creator(text_of(fp))
        for cat in cats:
            ft = append_category(ft, cat)
        edit(title, ft, 'Use Wikidata-backed creator identity and improve precise categorization', ctoken)
        results['files'][title] = {'categories_added': cats, 'creator_template': True}

    results['wikidata_person_P1472'] = ensure_string_claim(
        PERSON_QID, 'P1472', 'Saeed Ghezelbash', wtoken, 'Add Commons Creator page')
    results['wikidata_clinic_P373'] = ensure_string_claim(
        CLINIC_QID, 'P373', 'Dr. Saeed Ghezelbash Aesthetic Clinic', wtoken, 'Add Commons category for clinic')
    results['wikidata_clinic_commons_sitelink'] = ensure_sitelink(
        CLINIC_QID, 'commonswiki', CLINIC_CAT, wtoken, 'Link clinic item to Commons category')

    print(json.dumps({'ok': True, **results}, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
