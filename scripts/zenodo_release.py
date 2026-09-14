#!/usr/bin/env python3
"""Zenodo CLI adapter bound to the canonical publication context."""
from __future__ import annotations
import importlib.util, json, subprocess, sys
from pathlib import Path

_IMPL = Path(__file__).resolve().parent / "lib" / "zenodo_release_impl.py"
_PUBLICATION_DATA = None


def load_publication_data():
    global _PUBLICATION_DATA
    if _PUBLICATION_DATA is not None:
        return _PUBLICATION_DATA
    result = subprocess.run(
        ["node", "scripts/publication-context.mjs", "json"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()[:4000]
        raise RuntimeError(f"Canonical publication context failed: {detail}")
    try:
        publication = json.loads(result.stdout)
    except (TypeError, ValueError, json.JSONDecodeError):
        raise RuntimeError("Canonical publication context returned invalid JSON") from None
    required = (
        publication.get("release"),
        publication.get("dateModified"),
        (publication.get("primaryEntity") or {}).get("wikidata"),
        (publication.get("primaryEntity") or {}).get("orcid"),
        (publication.get("dataset") or {}).get("name"),
        (publication.get("clinic") or {}).get("placeId"),
    )
    if any(value in (None, "") for value in required):
        raise RuntimeError("Canonical publication context is incomplete for Zenodo")
    _PUBLICATION_DATA = publication
    return _PUBLICATION_DATA


def load_impl():
    spec = importlib.util.spec_from_file_location("zenodo_release_impl", _IMPL)
    if spec is None or spec.loader is None:
        raise RuntimeError("Zenodo implementation module cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.load_release = load_publication_data
    return module


def self_test(module):
    release = load_publication_data()
    zenodo = release["dataset"]["zenodo"]
    metadata = module.canonical_metadata(
        release["release"],
        release["dateModified"],
        zenodo["versionDoi"],
        zenodo["conceptDoi"],
    )
    creator = (metadata.get("creators") or [{}])[0]
    if (
        metadata.get("title") != release["dataset"]["name"]
        or creator.get("orcid") != release["primaryEntity"]["orcid"]
        or release["primaryEntity"]["wikidata"]
        not in json.dumps(metadata, ensure_ascii=False)
    ):
        raise RuntimeError("Zenodo publication-context self-test failed")
    print(
        json.dumps(
            {
                "publicationContext": "PASS",
                "release": release["release"],
                "primaryEntity": release["primaryEntity"]["wikidata"],
                "orcid": release["primaryEntity"]["orcid"],
                "dataset": release["dataset"]["id"],
            },
            separators=(",", ":"),
        )
    )


def main():
    module = load_impl()
    if sys.argv[1:] == ["self-test-publication-context"]:
        self_test(module)
        return
    module.main()


if __name__ == "__main__":
    main()
