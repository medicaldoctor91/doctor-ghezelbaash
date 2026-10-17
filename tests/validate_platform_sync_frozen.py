"""Release-bound wrapper for the verified ba0eb04 website distribution."""
import argparse
import json
from pathlib import Path

import validate_platform_sync as base

# Verified by the production build/machine-resource validator for ba0eb04.
FROZEN_ROWS = {
    'clinical_passages': 3248,
    'clinical_answers': 125,
    'entity_facts': 22138,
    'query_matrix': 876,
}
base.EXPECTED_ROWS = dict(FROZEN_ROWS)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', type=Path)
    parser.add_argument('--platform', required=True, choices=['hf', 'kaggle'])
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--canonical-root', type=Path)
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    result = base.validate(args.root, platform=args.platform, source_commit=args.source_commit,
                           canonical_root=args.canonical_root)
    result['frozenRowContract'] = FROZEN_ROWS
    encoded = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + '\n'
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(encoded, encoding='utf-8')
    print(encoded, end='')
