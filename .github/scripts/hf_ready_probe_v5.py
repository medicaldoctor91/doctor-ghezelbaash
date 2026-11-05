"""Public GET-only index warmup; never replaces the frozen acceptance gates."""
import argparse
import datetime
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DATASET = 'doctor-ghezelbaash/dr-saeid-ghezelbaash-entity-data'
REVISION = '43b55ee2e50678cf3bcdca7b5d3fe0e4ee5c21c8'
CONFIGS = ('clinical_passages', 'clinical_answers', 'entity_facts', 'query_matrix', 'market_positioning')
BASE = 'https://datasets-server.huggingface.co/'
REPORT = Path('/tmp/coordinated-v5-dispatch/hf-warmup.json')
DEADLINE_SECONDS = 3600
REQUEST_TIMEOUT_SECONDS = 90
BACKOFF_SECONDS = 30
MAX_BODY_BYTES = 8 * 1024 * 1024


class PublicReadFailure(RuntimeError):
    def __init__(self, message, observation):
        super().__init__(message)
        self.observation = observation


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save(report):
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    temporary = REPORT.with_suffix('.tmp')
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(REPORT)


def fetch(endpoint, config, extra, deadline):
    assert endpoint in {'search', 'first-rows', 'filter'} and config in CONFIGS
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError('Global warmup deadline reached')
    params = {'dataset': DATASET, 'config': config, 'split': 'train',
              **extra, 'live_audit': str(time.time_ns())}
    request = urllib.request.Request(BASE + endpoint + '?' + urllib.parse.urlencode(params),
        headers={'Cache-Control': 'no-cache', 'User-Agent': 'Frozen-v5-public-readiness-warmup/1.0'}, method='GET')
    try:
        with urllib.request.urlopen(request, timeout=min(REQUEST_TIMEOUT_SECONDS, remaining)) as response:
            body = response.read(MAX_BODY_BYTES + 1)
            if len(body) > MAX_BODY_BYTES:
                raise ValueError('Unexpectedly large public response')
            revision = response.headers.get('x-revision')
            if response.status != 200 or revision != REVISION:
                raise PublicReadFailure('Public response revision does not match the frozen revision',
                                        {'http': response.status, 'revision': revision, 'endpoint': endpoint})
            data = json.loads(body)
            if not isinstance(data, dict):
                raise ValueError('Public response must be a JSON object')
            return data, {'http': response.status, 'revision': revision}
    except urllib.error.HTTPError as error:
        # Diagnostic only; do not expose tokens or copy public row contents.
        try:
            data = json.loads(error.read(4096))
            message = str(data.get('error', 'HTTP failure'))[:400]
        except Exception:
            message = 'HTTP failure'
        raise PublicReadFailure('HTTP ' + str(error.code) + ': ' + message,
            {'http': error.code, 'revision': error.headers.get('x-revision'),
             'errorCode': error.headers.get('x-error-code'), 'endpoint': endpoint}) from None


def positive_rows(data):
    rows = data.get('rows')
    if not isinstance(rows, list) or not rows or not all(isinstance(item, dict) and isinstance(item.get('row'), dict) for item in rows):
        raise ValueError('The public query returned no positive rows')
    return rows


def predicate(field, value):
    return '"' + field.replace('"', '""') + '"=\'' + value.replace("'", "''") + '\''


def probe(config, progress, deadline):
    # Cache successful read stages solely to reduce provider load. The original
    # M5 publisher still repeats its complete byte/row/Search/Filter acceptance.
    if 'search' not in progress:
        data, evidence = fetch('search', config, {'query': 'ghezelbaash', 'length': 1}, deadline)
        progress['search'] = {**evidence, 'positiveRows': len(positive_rows(data))}
    if 'firstRows' not in progress:
        data, evidence = fetch('first-rows', config, {}, deadline)
        first = positive_rows(data)[0]['row']
        field, value = next((key, value) for key, value in first.items()
                            if isinstance(value, str) and value and len(value) < 200)
        progress['firstRows'] = evidence
        progress['filterField'] = field
        progress['filterValue'] = value
    if 'filter' not in progress:
        field, value = progress['filterField'], progress['filterValue']
        data, evidence = fetch('filter', config, {'where': predicate(field, value), 'length': 1}, deadline)
        rows = positive_rows(data)
        if not all(item['row'].get(field) == value for item in rows):
            raise ValueError('Public filter results do not satisfy the requested predicate')
        progress['filter'] = {**evidence, 'positiveRows': len(rows)}
    progress['status'] = 'PASS'


def main(root):
    request = json.loads((root / '.github/release-inputs/coordinated-v5-request.json').read_text())
    report = {'schemaVersion': 1, 'purpose': 'Public GET-only warmup; original frozen gates remain required',
              'dataset': DATASET, 'revision': REVISION, 'operation': request['operation'],
              'startedUTC': utc(), 'globalDeadlineSeconds': DEADLINE_SECONDS, 'configs': {}, 'events': []}
    if request['operation'] not in {'publish-frozen', 'verify-publication'}:
        report.update(status='SKIPPED', completedUTC=utc())
        save(report)
        print('HF warmup skipped for this operation.')
        return 0
    deadline = time.monotonic() + DEADLINE_SECONDS
    pending = list(CONFIGS)
    while pending and time.monotonic() < deadline:
        for config in list(pending):
            if time.monotonic() >= deadline:
                break
            progress = report['configs'].setdefault(config, {})
            try:
                probe(config, progress, deadline)
                pending.remove(config)
                report['events'].append({'utc': utc(), 'config': config, 'status': 'PASS'})
                print('Public HF warmup PASS: ' + config, flush=True)
            except Exception as error:
                report['events'].append({'utc': utc(), 'config': config, 'status': 'PENDING',
                                         'reason': type(error).__name__ + ': ' + str(error)[:500],
                                         'observation': getattr(error, 'observation', None)})
                print('Public HF warmup pending: ' + config + ' (' + type(error).__name__ + ')', flush=True)
                save(report)
                time.sleep(min(BACKOFF_SECONDS, max(0, deadline - time.monotonic())))
            report['events'] = report['events'][-120:]
            save(report)
    report.update(status='PASS' if not pending else 'PENDING_PROVIDER', pendingConfigs=pending, completedUTC=utc())
    save(report)
    if pending:
        print('Provider readiness remains pending; no controller dispatch should follow.')
        return 1
    print('All public warmup probes passed; full original M5 acceptance must still run.')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd())
    args = parser.parse_args()
    raise SystemExit(main(args.root))
