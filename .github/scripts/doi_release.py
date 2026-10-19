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
    if pending:
        assert len(pending) == 1, 'Multiple family drafts require inspection'
        draft = pending[0]
        print(json.dumps({'existingDraft': draft['id'], 'created': draft.get('created'), 'version': draft.get('metadata', {}).get('version'),
                          'title': draft.get('metadata', {}).get('title'), 'doi': draft.get('doi'),
                          'prereserve_doi': draft.get('metadata', {}).get('prereserve_doi'), 'responseKeys': list(draft)}, ensure_ascii=False), flush=True)
        assert draft['metadata'].get('title') == public['metadata']['title'], 'Existing draft title differs from the reviewed parent'
        assert draft['metadata'].get('description') == public['metadata']['description'], 'Existing draft description has independent changes'
    else:
        response = session.post(base + 'records/' + str(previous) + '/versions', json={}, timeout=90)
        response.raise_for_status()
        draft = response.json()
    record = draft['id']
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'reservedRecord': record, 'phase': 'draft created or recovered'}) + '\n')
    print(json.dumps({'reservedRecord': record, 'phase': 'draft created or recovered', 'responseKeys': list(draft), 'metadataKeys': list(draft.get('metadata', {}))}), flush=True)
    def extract(value):
        return value.get('doi') or value.get('metadata', {}).get('prereserve_doi', {}).get('doi') or (value.get('pids', {}).get('doi') or {}).get('identifier')
    doi = extract(draft)
    if not doi:
        response = session.post(base + 'records/' + str(record) + '/draft/pids/doi', json={}, timeout=60)
        response.raise_for_status()
        draft_response = session.get(base + 'records/' + str(record) + '/draft', timeout=60)
        draft_response.raise_for_status()
        draft = draft_response.json()
        doi = extract(draft)
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
