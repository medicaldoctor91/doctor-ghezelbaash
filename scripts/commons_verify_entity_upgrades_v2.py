#!/usr/bin/env python3
from __future__ import annotations

import json
import commons_verify_entity_upgrades as v


def main():
    result = {}

    # Canonical binding truth first: Wikidata sitelinks/claims, independent of Commons parser-cache pageprops.
    person = v.wd_entity(v.PERSON)
    clinic = v.wd_entity(v.CLINIC)
    v.require(person.get('sitelinks', {}).get('commonswiki', {}).get('title') == v.PERSON_CAT,
              'Person Commons sitelink drift')
    v.require(clinic.get('sitelinks', {}).get('commonswiki', {}).get('title') == v.CLINIC_CAT,
              'Clinic Commons sitelink missing')
    v.require('Saeed Ghezelbash' in v.wd_values(person, 'P1472'), 'Person P1472 Creator page missing')
    v.require('Saeed Ghezelbash' in v.wd_values(person, 'P373'), 'Person P373 drift')
    v.require('Dr. Saeed Ghezelbash Aesthetic Clinic' in v.wd_values(clinic, 'P373'), 'Clinic P373 missing')
    v.require('/g/11nqdfk76c' in v.wd_values(person, 'P2671'), 'Person Google KG ID drift')
    v.require('/g/11r3rzdtb3' in v.wd_values(clinic, 'P2671'), 'Clinic Google Local KG ID drift')
    v.require(v.CLINIC in v.wd_values(person, 'P1830'), 'Person owner-of clinic edge missing')
    v.require(v.CLINIC in v.wd_values(person, 'P937'), 'Person work-location clinic edge missing')

    person_page = v.page(v.PERSON_CAT)
    pcats = v.cats_of(person_page)
    ptext = v.text_of(person_page)
    v.require('missing' not in person_page, 'Person category missing')
    v.require(person_page.get('pageprops', {}).get('wikibase_item') == v.PERSON,
              'Person category Wikibase binding drift')
    v.require('Category:Men of Kermanshah' in pcats, 'Men of Kermanshah missing from person category')
    v.require('Category:Pages with DEFAULTSORT conflicts' not in pcats, 'Person DEFAULTSORT conflict')
    v.require('Category:Dr. Saeed Ghezelbash Aesthetic Clinic' in ptext,
              'Direct Commons clinic link missing from person category')
    pmembers = v.members(v.PERSON_CAT)
    for f in v.FILES.values():
        v.require(f in pmembers, f'Original person media missing: {f}')

    person_redirects = [
        'Category:سعید قزلباش', 'Category:دکتر سعید قزلباش',
        'Category:محمدسعید قزلباش', 'Category:دکتر محمدسعید قزلباش'
    ]
    for title in person_redirects:
        p = v.page(title)
        v.require('missing' not in p and '{{Category redirect|Saeed Ghezelbash' in v.text_of(p),
                  f'Invalid person category redirect: {title}')

    creator = v.page('Creator:Saeed Ghezelbash')
    v.require('missing' not in creator, 'Creator page missing')
    v.require('Q140287622' in v.text_of(creator) and '{{Creator' in v.text_of(creator),
              'Creator page is not QID-backed')
    creator_redirects = ['Creator:سعید قزلباش', 'Creator:محمدسعید قزلباش', 'Creator:دکتر سعید قزلباش']
    for title in creator_redirects:
        p = v.page(title)
        t = v.text_of(p)
        v.require('missing' not in p and '#REDIRECT' in t.upper() and '[[Creator:Saeed Ghezelbash]]' in t,
                  f'Invalid Creator redirect: {title}')

    clinic_page = v.page(v.CLINIC_CAT)
    v.require('missing' not in clinic_page, 'Clinic category missing')
    ccats = v.cats_of(clinic_page)
    ctext = v.text_of(clinic_page)
    v.require('Category:Clinics in Iran' in ccats, 'Clinic taxonomy missing Clinics in Iran')
    v.require('Category:Kermanshah' in ccats, 'Clinic taxonomy missing Kermanshah')
    v.require('Category:Pages with DEFAULTSORT conflicts' not in ccats, 'Clinic DEFAULTSORT conflict')
    for needle in [v.PERSON, v.CLINIC, '/g/11nqdfk76c', '/g/11r3rzdtb3']:
        v.require(needle in ctext, f'Clinic identity context missing {needle}')
    cmembers = v.members(v.CLINIC_CAT)
    v.require(v.FILES['office'] in cmembers, 'Office image missing from clinic category')
    v.require(v.FILES['team'] in cmembers, 'Team image missing from clinic category')
    clinic_fa = v.page('Category:کلینیک زیبایی دکتر سعید قزلباش')
    v.require('{{Category redirect|Dr. Saeed Ghezelbash Aesthetic Clinic' in v.text_of(clinic_fa),
              'Persian clinic category redirect missing')

    expected = {
        'portrait': {'Category:Saeed Ghezelbash', 'Category:Physicians with stethoscopes'},
        'office': {'Category:Saeed Ghezelbash', 'Category:Physicians with stethoscopes',
                   "Category:Doctors' offices in Iran", v.CLINIC_CAT},
        'team': {'Category:Saeed Ghezelbash', 'Category:Physicians with stethoscopes',
                 'Category:Scrubs', v.CLINIC_CAT},
        'video': {'Category:Saeed Ghezelbash', 'Category:Aesthetic medicine', 'Category:Videos in Persian'},
    }
    sdc = {}
    for key, title in v.FILES.items():
        p = v.page(title)
        v.require('{{Creator:Saeed Ghezelbash}}' in v.text_of(p), f'Creator template missing on {title}')
        actual = v.cats_of(p)
        for cat in expected[key]:
            v.require(cat in actual, f'Missing {cat} on {title}')
        mid, mi = v.mediainfo(title)
        creator_qids = v.sdc_qids(mi, 'P170')
        depicts_qids = v.sdc_qids(mi, 'P180')
        v.require(v.PERSON in creator_qids, f'SDC creator lost person QID on {title}')
        v.require(v.PERSON in depicts_qids, f'SDC depicts lost person QID on {title}')
        if key in {'office', 'team'}:
            clinic_context = depicts_qids | v.sdc_qids(mi, 'P1071')
            v.require(v.CLINIC in clinic_context, f'SDC clinic context lost on {title}')
        if key == 'video':
            v.require(v.PERSON in v.sdc_qids(mi, 'P10894'), 'Video spoken-by person QID missing')
        sdc[key] = {
            'mediainfo': mid,
            'creator': sorted(creator_qids),
            'depicts': sorted(depicts_qids),
        }

    result['person_category'] = {
        'wikibase_item': person_page.get('pageprops', {}).get('wikibase_item'),
        'men_of_kermanshah': True,
        'original_media_preserved': sorted(v.FILES.values()),
        'persian_redirects': person_redirects,
    }
    result['creator'] = {
        'canonical': 'Creator:Saeed Ghezelbash',
        'wikidata_P1472': 'Saeed Ghezelbash',
        'persian_redirects': creator_redirects,
    }
    result['clinic_category'] = {
        'commons_pageprops_wikibase_item': clinic_page.get('pageprops', {}).get('wikibase_item'),
        'canonical_wikidata_commons_sitelink': clinic.get('sitelinks', {}).get('commonswiki', {}).get('title'),
        'wikidata_P373': 'Dr. Saeed Ghezelbash Aesthetic Clinic',
        'members': sorted(x for x in cmembers if x in {v.FILES['office'], v.FILES['team']}),
        'persian_redirect': 'Category:کلینیک زیبایی دکتر سعید قزلباش',
    }
    result['media'] = {'creator_template_all_four': True, 'sdc_preserved': sdc}
    result['entity_graph'] = {
        'person': v.PERSON,
        'person_google_kg': '/g/11nqdfk76c',
        'clinic': v.CLINIC,
        'clinic_google_local_kg': '/g/11r3rzdtb3',
        'person_to_clinic': ['P1830 owner of', 'P937 work location'],
        'entities_remain_distinct': True,
    }
    print(json.dumps({'ok': True, 'mode': 'live-read-only-verification-v2', **result}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
