"""Hardened external convergence orchestrator."""
import argparse
import json
import os
import re
from pathlib import Path
from types import SimpleNamespace

import sync_platform_machine_resources as sync

EXPECTED_WEBSITE_COMMIT = 'EXPECTED_' + 'WEBSITE_COMMIT'
EXPECTED_HF_REVISION = 'EXPECTED_' + 'HF_REVISION'
EXPECTED_KAGGLE_VERSION = 'EXPECTED_' + 'KAGGLE_VERSION'


def exact_revision(value, label):
    assert re.fullmatch(r'[0-9a-f]{40}', value or ''), label + ' must be an exact 40-character revision'
    return value


def reviewed_args(root, prepare_only):
    website_commit = exact_revision(os.environ.get(EXPECTED_WEBSITE_COMMIT), 'website commit')
    hf_revision = exact_revision(os.environ.get(EXPECTED_HF_REVISION), 'HF revision')
    kaggle_version = int(os.environ[EXPECTED_KAGGLE_VERSION])
    assert kaggle_version > 0
    return SimpleNamespace(root=Path(root), compiled_root=sync.REPOSITORY / 'dist',
                           hf_revision=hf_revision, kaggle_version=kaggle_version,
                           website_commit=website_commit, website_run_url='',
                           prepare_only=prepare_only)
