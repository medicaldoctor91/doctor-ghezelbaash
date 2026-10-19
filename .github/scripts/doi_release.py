"""DOI-policy release operations; never rewrite a published Zenodo payload."""
import argparse
import json
import os
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[2]


def policy():
    return json.loads((ROOT / 'src/canonical/doi-policy.json').read_text())


def reserve(previous, output):
    p = policy()
    session = requests.Session()
    session.headers.update(Authorization='Bearer ' + os.environ['ZENODO_TOKEN'])
    base = 'https://zenodo.org/api/'
    public = session.get(base + 'records/' + str(previous), timeout=60)
    public.raise_for_status()
    public = public.json()
    assert public['conceptdoi'] == p['concept']['doi']
    assert public['id'] == p['currentArchive']['recordId']
    # Read existing family drafts first. An ambiguous version POST is never retried.
    deposits = session.get(base + 'deposit/depositions', params={'q': 'conceptrecid:18765168', 'size': 100}, timeout=60)
    deposits.raise_for_status()
    entries = deposits.json()
    assert isinstance(entries, list)
    pending = [d for d in entries if str(d.get('conceptrecid')) == '18765168' and not d.get('submitted')]
    assert not pending, 'An existing family draft must be inspected before creating another version: ' + str([d['id'] for d in pending])
    response = session.post(base + 'records/' + str(previous) + '/versions', json={}, timeout=90)
    response.raise_for_status()
    draft = response.json()
    record = draft['id']
    doi = (draft.get('pids', {}).get('doi') or {}).get('identifier')
    if not doi:
        response = session.post(base + 'records/' + str(record) + '/draft/pids/doi', json={}, timeout=60)
        response.raise_for_status()
        draft_response = session.get(base + 'records/' + str(record) + '/draft', timeout=60)
        draft_response.raise_for_status()
        draft = draft_response.json()
        doi = (draft.get('pids', {}).get('doi') or {}).get('identifier')
    assert doi and doi.startswith('10.5281/zenodo.')
    result = {'previousRecord': previous, 'reservedRecord': record, 'reservedDoi': doi,
              'conceptDoi': p['concept']['doi'], 'published': False,
              'metadata': draft.get('metadata', {}), 'links': draft.get('links', {})}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k not in {'metadata', 'links'}}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('operation', choices=['reserve'])
    parser.add_argument('--previous-record', type=int, required=True)
    parser.add_argument('--output', type=Path, default=Path('/tmp/doi-release/reservation.json'))
    args = parser.parse_args()
    reserve(args.previous_record, args.output)


if __name__ == '__main__':
    main()
