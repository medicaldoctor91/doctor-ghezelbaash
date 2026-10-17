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
