"""Read-only feature and exact-row checks against the frozen HF83 revision."""
import concurrent.futures, datetime, hashlib, io, json, pathlib, re
from urllib.parse import urlencode
import requests, pyarrow as pa, pyarrow.parquet as pq

ROOT = pathlib.Path('/tmp/current-viewer-features')
ROOT.mkdir(exist_ok=True)
HF = 'doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
REV = '83a17ed6f87d7c51ea5066e2e35c3b8553bdec77'
BASE = 'https://datasets-server.huggingface.co/'
HEADERS = {'Cache-Control': 'no-cache, max-age=0', 'Pragma': 'no-cache',
           'Accept-Encoding': 'identity', 'User-Agent': 'ReadOnlyFeatureAudit/1.0'}
LOG = []

def dump(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def fetch(label, url):
    r = requests.get(url, headers=HEADERS, timeout=(20, 90))
    LOG.append({'label': label, 'url': url, 'UTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'HTTP': r.status_code, 'bytes': len(r.content), 'sha256': hashlib.sha256(r.content).hexdigest(),
                'headers': {k: r.headers.get(k) for k in ['Date', 'Age', 'ETag', 'Cache-Control', 'X-Revision', 'X-Error-Code']}})
    return r

def endpoint(config, name, **extra):
    params = {'dataset': HF}
    if config:
        params.update(config=config, split='train')
    params.update(extra)
    r = fetch((config or 'global') + '/' + name, BASE + name + '?' + urlencode(params))
    try:
        data = r.json()
    except ValueError:
        data = {'body': r.text[:500]}
    dump((config or 'global') + '-' + name + '.json', data)
    assert r.status_code == 200, (name, r.status_code, data.get('error'))
    assert r.headers.get('X-Revision') == REV, (name, 'stale/missing X-Revision', r.headers.get('X-Revision'))
    return data

def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

pack = fetch('Hub packaging', 'https://huggingface.co/datasets/' + HF + '/resolve/' + REV + '/viewer/packaging.json')
pack.raise_for_status()
packaging = pack.json()
exports = endpoint(None, 'parquet')
assert exports.get('partial') is False and not exports.get('failed') and not exports.get('pending')
size = endpoint(None, 'size')
counts = {x['config']: x['num_rows'] for x in size['size']['configs']}

def config_check(item):
    config, spec = item
    result = {'expectedRows': spec['rows'], 'checks': {}}
    raw = fetch(config + '/raw', 'https://huggingface.co/datasets/' + HF + '/resolve/' + REV + '/' + spec['file'])
    raw.raise_for_status()
    assert hashlib.sha256(raw.content).hexdigest() == spec['sha256']
    expected = pq.read_table(io.BytesIO(raw.content))
    records = expected.to_pylist()
    def check(label, fn):
        try:
            result['checks'][label] = {'status': 'PASS', 'result': fn()}
        except Exception as e:
            result['checks'][label] = {'status': 'FAIL', 'error': repr(e)}
    def full_export():
        shards = [x for x in exports['parquet_files'] if x['config'] == config and x['split'] == 'train']
        assert shards
        tables = []
        for n, x in enumerate(shards):
            r = fetch(config + '/converted/' + str(n), x['url']); r.raise_for_status()
            tables.append(pq.read_table(io.BytesIO(r.content)))
        actual = pa.concat_tables(tables)
        assert set(actual.column_names) == set(expected.column_names)
        assert encoded(actual.select(expected.column_names).to_pylist()) == encoded(records)
        assert counts[config] == spec['rows'] == len(records)
        return {'rows': len(records), 'everyFieldAndScalarTypeMatches': True}
    def matching_rows(data):
        assert data.get('rows'), 'Empty result'
        for row in data['rows']:
            source = records[row['row_idx']]
            for k, v in row['row'].items():
                if k not in row.get('truncated_cells', []):
                    assert encoded(v) == encoded(source[k]), (row['row_idx'], k)
        return len(data['rows'])
    check('completeExport', full_export)
    check('firstRows', lambda: matching_rows(endpoint(config, 'first-rows')))
    for offset in [0, len(records) // 2, len(records) - 1]:
        check('rowsAt' + str(offset), lambda offset=offset: matching_rows(endpoint(config, 'rows', offset=offset, length=1)))
    def statistics():
        data = endpoint(config, 'statistics')
        assert isinstance(data.get('statistics'), list) and data['statistics'], 'Missing statistics'
        return {'columns': len(data['statistics'])}
    check('statistics', statistics)
    text_field = {'clinical_passages': 'text', 'clinical_answers': 'question',
                  'entity_facts': 'object', 'query_matrix': 'query', 'market_positioning': 'query'}[config]
    candidates = [r[text_field] for r in records if isinstance(r.get(text_field), str) and re.search(r'[\u0600-\u06ff]', r[text_field])]
    assert candidates, ('No real text for search', config)
    tokens = re.findall(r'[\u0621-\u063a\u0641-\u064a\u067e\u0686\u0698\u06a9\u06af\u06cc]{3,}', candidates[0])
    query = next((t for t in tokens if len(t) >= 4), tokens[0])
    check('textSearch', lambda: {'query': query, 'matchingRows': matching_rows(endpoint(config, 'search', query=query))})
    # Probe an original Latin token as well: provider FTS tokenization can limit
    # Persian retrieval independently of response health. Keep both results.
    latin_tokens = [token for value in records[0].values() if isinstance(value, str)
                    for token in re.findall(r'[a-zA-Z]{4,}', value)
                    if token.lower() not in {'https', 'http', 'json', 'jsonld', 'www'}]
    latin_query = latin_tokens[0]
    check('latinSearch', lambda: {'query': latin_query, 'matchingRows': matching_rows(endpoint(config, 'search', query=latin_query))})
    contains_where = '"' + text_field + '" LIKE \'%' + query.replace("'", "''") + '%\''
    check('persianContainsFilter', lambda: {'query': query, 'matchingRows': matching_rows(endpoint(config, 'filter', where=contains_where))})
    first = records[0]
    id_field = {'clinical_passages': 'passageId', 'clinical_answers': 'answerId',
                'entity_facts': 'row_id', 'query_matrix': 'query', 'market_positioning': 'example_id'}[config]
    value = first[id_field]
    assert isinstance(value, str)
    where = '"' + id_field + '"=\'' + value.replace("'", "''") + '\''
    def filtering():
        data = endpoint(config, 'filter', where=where)
        n = matching_rows(data)
        assert all(x['row'][id_field] == value for x in data['rows'])
        return {'field': id_field, 'matchingRows': n}
    check('exactFilter', filtering)
    result['allPassed'] = all(x['status'] == 'PASS' for x in result['checks'].values())
    return config, result

try:
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        configs = dict(pool.map(config_check, packaging['tables'].items()))
    report = {'revision': REV, 'productionWrites': 0, 'configs': configs,
              'allFiveFeaturesPassed': all(x['allPassed'] for x in configs.values()),
              'completedUTC': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    dump('report.json', report)
    print(json.dumps(report, ensure_ascii=False), flush=True)
finally:
    dump('fetch-log.json', LOG)
