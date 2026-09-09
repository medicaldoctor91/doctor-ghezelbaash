#!/usr/bin/env python3
"""Publish one reviewed translation and its author's sitelink, with exact read-back.

Credentials stay in the GitHub Actions environment. Existing pages are never
overwritten, and any existing sitelink to a different page stops publication.
"""
import argparse
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / 'wikimedia' / 'fa-2021'
MANIFEST = json.loads((ROOT / 'manifest.json').read_text())
ACCOUNT = 'Medicaldoctor91'
QID = 'Q140287622'
FA_HOST = 'fa.wikisource.org'
WD_HOST = 'www.wikidata.org'
EN_HOST = 'en.wikisource.org'
INDEX = 'Index:Healthcare 2021 9 1169 - Golshani et al.pdf'
ORIGINAL = 'Individuals with Major Depressive Disorder Report High Scores of Insecure-Avoidant and Insecure-Anxious Attachment Styles, Dissociative Identity Symptoms, and Adult Traumatic Events'
UA = 'GhezelbashPersianWikisource/1.0 (https://github.com/medicaldoctor91/doctor-ghezelbaash)'


class Wiki:
    def __init__(self, host):
        if host not in {FA_HOST, WD_HOST, EN_HOST}:
            raise ValueError('Unapproved project')
        self.url = 'https://' + host + '/w/api.php'
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.token = None

    def api(self, post=False, **params):
        params.update(format='json', formatversion='2', maxlag='5', maxage='0', smaxage='0')
        body = urllib.parse.urlencode(params).encode()
        request = urllib.request.Request(self.url if post else self.url + '?' + body.decode(),
                                         data=body if post else None,
                                         headers={'User-Agent': UA, 'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache'})
        for attempt in range(4):
            try:
                with self.opener.open(request, timeout=55) as response:
                    data = json.load(response)
            except urllib.error.HTTPError as exc:
                if exc.code in {429, 502, 503, 504} and attempt < 3:
                    time.sleep(2 ** (attempt + 1))
                    continue
                raise RuntimeError('MediaWiki HTTP status ' + str(exc.code)) from None
            error = data.get('error')
            if error and error.get('code') in {'maxlag', 'ratelimited'} and attempt < 3:
                time.sleep(2 ** (attempt + 1))
                continue
            if error:
                raise RuntimeError('MediaWiki API error: ' + error.get('code', 'unknown'))
            return data
        raise RuntimeError('MediaWiki retry limit reached')

    def login(self):
        username = os.environ.get('WIKIMEDIA_USERNAME', '')
        password = os.environ.get('WIKIMEDIA_BOT_PASSWORD', '')
        if not username or not password:
            raise RuntimeError('Required Wikimedia credentials are unavailable')
        token = self.api(action='query', meta='tokens', type='login')['query']['tokens']['logintoken']
        result = self.api(post=True, action='login', lgname=username, lgpassword=password, lgtoken=token)['login']
        if result.get('result') != 'Success':
            raise RuntimeError('Wikimedia login failed: ' + result.get('result', 'unknown'))
        info = self.api(action='query', meta='userinfo', uiprop='rights|blockinfo', assertuser=ACCOUNT, **{'assert': 'user'})['query']['userinfo']
        if info.get('name') != ACCOUNT or any(key.startswith('block') for key in info):
            raise RuntimeError('Unexpected account or editing restriction')
        if 'edit' not in info.get('rights', []) or 'createpage' not in info.get('rights', []):
            raise RuntimeError('Required editing rights unavailable')
        self.token = self.api(action='query', meta='tokens')['query']['tokens']['csrftoken']

    def page(self, title):
        data = self.api(action='query', titles=title, prop='info|revisions|pageprops', inprop='protection', rvprop='ids|content', rvslots='main')
        page = data['query']['pages'][0]
        if page.get('invalid'):
            raise RuntimeError('Invalid page title')
        return page

    def entity(self):
        entity = self.api(action='wbgetentities', ids=QID, props='info|sitelinks')['entities'][QID]
        if 'missing' in entity:
            raise RuntimeError('Personal Wikidata item is missing')
        return entity

    def parse(self, title, text):
        data = self.api(post=True, action='parse', title=title, text=text, prop='text|categories|parsewarnings', disablelimitreport=1)['parse']
        errors = re.findall(r'<(?:strong|span|div)[^>]*class="[^"]*(?:\berror\b|scribunto-error)[^"]*"[^>]*>.*?</(?:strong|span|div)>', data['text'], flags=re.S)
        return data, errors

    def create_exact(self, title, text, summary, model=None):
        before = self.page(title)
        if 'missing' not in before:
            actual = before['revisions'][0]['slots']['main']['content']
            if actual.rstrip() != text.rstrip():
                raise RuntimeError('Existing page differs; refusing to overwrite: ' + title)
            return {'title': title, 'revid': before['revisions'][0]['revid'], 'status': 'already-present'}
        params = dict(action='edit', title=title, text=text, summary=summary, createonly=1,
                      token=self.token, assertuser=ACCOUNT, **{'assert': 'user'})
        if model:
            params['contentmodel'] = model
        result = self.api(post=True, **params).get('edit', {})
        if result.get('result') != 'Success':
            raise RuntimeError('Edit was not successful: ' + title)
        after = self.page(title)
        actual = after['revisions'][0]['slots']['main']['content']
        if actual.rstrip() != text.rstrip():
            raise RuntimeError('Published text differs from reviewed text: ' + title)
        return {'title': title, 'revid': after['revisions'][0]['revid'], 'status': 'published'}


def check_files():
    assert MANIFEST['personal_item'] == QID
    assert MANIFEST['reference_count'] == 50 and MANIFEST['table_count'] == 3
    for filename, expected in MANIFEST['files'].items():
        if hashlib.sha256((ROOT / filename).read_bytes()).hexdigest() != expected:
            raise RuntimeError('Reviewed file hash mismatch: ' + filename)


def run(publish):
    check_files()
    fa, wd, en = Wiki(FA_HOST), Wiki(WD_HOST), Wiki(EN_HOST)
    article_title, author_title = MANIFEST['article_title'], MANIFEST['author_title']
    css_title = MANIFEST['stylesheet_title']
    article = (ROOT / 'article.wiki').read_text()
    author = (ROOT / 'author.wiki').read_text()
    stylesheet = (ROOT / 'translation-header.css').read_text()
    if publish:
        fa.login()
        wd.login()
    entity = wd.entity()
    existing_link = entity.get('sitelinks', {}).get('fawikisource', {}).get('title')
    if existing_link and existing_link != author_title:
        raise RuntimeError('A different Persian sitelink already exists')
    for title, text in [(article_title, article), (author_title, author)]:
        existing = fa.page(title)
        if 'missing' not in existing and existing['revisions'][0]['slots']['main']['content'].rstrip() != text.rstrip():
            raise RuntimeError('Existing page differs from reviewed text: ' + title)
        linked_item = existing.get('pageprops', {}).get('wikibase_item')
        if title == author_title and linked_item and linked_item != QID:
            raise RuntimeError('Author page belongs to a different Wikidata item')
        if title == author_title and existing.get('ns') != 102:
            raise RuntimeError('Author title is outside the Author namespace')
    titles = [INDEX, ORIGINAL] + ['Page:Healthcare 2021 9 1169 - Golshani et al.pdf/' + str(n) for n in range(1, 14)]
    source = en.api(action='query', titles='|'.join(titles), prop='info')['query']['pages']
    if len(source) != 15 or any('missing' in p or p.get('length', 0) < 30 for p in source):
        raise RuntimeError('The scan-backed English source is incomplete')
    preview, errors = fa.parse(article_title, article)
    css_missing = 'missing' in fa.page(css_title)
    # The existing local Translation header calls an absent stylesheet. Only that
    # known missing resource may be repaired; unrelated template errors stop here.
    if errors and not (css_missing and len(errors) == 1 and 'styles.css' in errors[0]):
        raise RuntimeError('Article has an unexpected template rendering error')
    author_preview, author_errors = fa.parse(author_title, author)
    if author_errors:
        raise RuntimeError('Author page has a template rendering error')
    if not publish:
        print(json.dumps({'mode': 'preview', 'article_bytes': len(article.encode()), 'english_source_pages': len(source),
                          'missing_translation_stylesheet': css_missing, 'known_template_errors': len(errors), 'author_errors': len(author_errors)}, ensure_ascii=False))
        return
    report = {'mode': 'publish', 'pages': [], 'item': QID}
    if css_missing:
        report['pages'].append(fa.create_exact(css_title, stylesheet,
            'Provide the missing scoped stylesheet referenced by the existing Translation header module', 'sanitized-css'))
    preview, errors = fa.parse(article_title, article)
    if errors:
        raise RuntimeError('Article rendering still has an error; content publication stopped')
    report['pages'].append(fa.create_exact(article_title, article,
        'Add complete Persian Wikisource translation of the CC BY 4.0 article, DOI 10.3390/healthcare9091169; AI assistance disclosed; submitted through a coauthor account'))
    report['pages'].append(fa.create_exact(author_title, author,
        'Create author page listing the hosted free-licensed coauthored research article; submitted through the subject account'))
    entity = wd.entity()
    current_link = entity.get('sitelinks', {}).get('fawikisource', {}).get('title')
    if current_link and current_link != author_title:
        raise RuntimeError('Persian sitelink changed during publication')
    if not current_link:
        wd.api(post=True, action='wbsetsitelink', id=QID, linksite='fawikisource', linktitle=author_title,
               baserevid=entity['lastrevid'], token=wd.token, assertuser=ACCOUNT, **{'assert': 'user'},
               summary='Add Persian Wikisource author page with a hosted translation of the coauthored open-access article')
    final = wd.entity()
    final_links = {key: value['title'] for key, value in final.get('sitelinks', {}).items()}
    if final_links.get('fawikisource') != author_title:
        raise RuntimeError('Final Persian author sitelink verification failed')
    for key, value in entity.get('sitelinks', {}).items():
        if key != 'fawikisource' and final_links.get(key) != value['title']:
            raise RuntimeError('An existing sitelink changed unexpectedly')
    for title in [article_title, author_title]:
        page = fa.page(title)
        rendered, errors = fa.parse(title, page['revisions'][0]['slots']['main']['content'])
        if errors:
            raise RuntimeError('Final published page has a rendering error')
    report.update(wikidata_revid=final['lastrevid'], sitelinks=final_links)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    try:
        run(args.publish)
    except Exception as exc:
        message = str(exc)
        for key in ['WIKIMEDIA_USERNAME', 'WIKIMEDIA_BOT_PASSWORD']:
            value = os.environ.get(key)
            if value:
                message = message.replace(value, '[redacted]')
        print(json.dumps({'status': 'stopped', 'reason': message}, ensure_ascii=False))
        raise SystemExit(1)
