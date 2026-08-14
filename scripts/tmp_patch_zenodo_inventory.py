from pathlib import Path
p=Path('scripts/zenodo_release.py')
s=p.read_text()
old="""def exact_sources():
    sources={name:Path('dist')/name for name in CORE}
    att=RUNTIME/'release-attestation.json'
    if att.exists(): sources['release-attestation.json']=att
    hashes=RUNTIME/'dist-sha256.json'
    if hashes.exists(): sources['dist-sha256.json']=hashes
    missing=[name for name,p in sources.items() if not p.exists()]
    if missing: raise RuntimeError(f'Zenodo stage source files missing: {missing}')
    return sources
"""
new="""def exact_sources():
    # Rebuild the immutable Release Snapshot inventory from the exact canonical DIST bytes.
    # Hugging Face has a separate inventory and must never redefine Zenodo snapshot truth.
    dist_root=Path('dist')
    full_inventory={str(p.relative_to(dist_root)):sha256(p) for p in sorted(dist_root.rglob('*')) if p.is_file()}
    if not full_inventory or 'index.html' not in full_inventory or 'artifact-manifest.json' not in full_inventory:
        raise RuntimeError('Canonical DIST inventory is incomplete before Zenodo stage')
    hashes=RUNTIME/'dist-sha256.json'
    hashes.write_text(json.dumps(full_inventory,sort_keys=True,separators=(',',':'))+'\\n')
    sources={name:dist_root/name for name in CORE}
    att=RUNTIME/'release-attestation.json'
    if att.exists(): sources['release-attestation.json']=att
    sources['dist-sha256.json']=hashes
    missing=[name for name,p in sources.items() if not p.exists()]
    if missing: raise RuntimeError(f'Zenodo stage source files missing: {missing}')
    return sources
"""
if old not in s:
    raise SystemExit('exact_sources anchor not found')
p.write_text(s.replace(old,new))
