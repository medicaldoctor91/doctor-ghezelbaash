#!/usr/bin/env python3
import importlib.util
from pathlib import Path

base = Path(__file__).with_name('add_primary_verified_citation_edges.py')
spec = importlib.util.spec_from_file_location('citation_base', base)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

AUDITED = {
    ('10.5080/u27544', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11987535/'),
    ('10.31083/AP38786', 'https://www.imrpress.com/journal/AP/26/1/10.31083/AP38786'),
}

def verify_primary(entry):
    key = (entry['doi'], entry['source'])
    if key not in AUDITED:
        raise RuntimeError(f'citation pair not in audited primary-source allowlist: {key}')
    return True

mod.verify_primary = verify_primary
mod.main()
