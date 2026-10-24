"""Bounded publication-prose corrections for the existing Dataset DOI.

Call this only for platform cards, README prose and notebook Markdown. It is
deliberately independent of the clinical corpus and all executable notebook
cells. Record-specific data descriptors are handled by the archive builder.
"""

import copy
import json
import re
from pathlib import Path


ORIGINAL_SOURCE = "ed767f6e6726e1453196e2ec2b312fcad00677e2"
DELIVERY_SOURCE = "0f72c5e6ef832adef66d003069e3e3c189cf5079"
DOI = "10.5281/zenodo.23474664"


def _validate(original_source, delivery_source, doi):
    if not all(re.fullmatch(r"[a-f0-9]{40}", value or "")
               for value in (original_source, delivery_source)):
        raise ValueError("Invalid scientific or delivery source commit")
    if not re.fullmatch(r"10\.5281/zenodo\.\d+", doi or ""):
        raise ValueError("Invalid target Zenodo DOI")


def correction_notice(original_source=ORIGINAL_SOURCE,
                      delivery_source=DELIVERY_SOURCE, doi=DOI):
    """Describe original science and corrected delivery without conflating pins."""
    _validate(original_source, delivery_source, doi)
    return (
        "Zenodo DOI " + doi + " retains the original scientific source "
        + original_source + ". Minor schema and delivery packaging corrections "
        "keep the same DOI. The archive README and provenance identify the "
        "corrected files and website delivery source " + delivery_source + ". "
        "Cite the pinned platform revisions for exact Hugging Face, Kaggle and "
        "notebook bytes. Other historical DOI records retain their stated "
        "versions and provenance."
    )


def guard_prose(text, *, doi=DOI):
    """Fail closed on unknown obsolete claims instead of guessing a rewrite."""
    if not isinstance(text, str):
        raise TypeError("Publication prose must be text")
    # These unqualified statements concern the current archive. In contrast,
    # clinical/training statements such as '47 original arrays unchanged' and
    # explicitly historical archives are valid and are not matched.
    obsolete = (
        r"\b(?:the\s+)?archive files\s+(?:are|remain|stay)\s+unchanged\b",
        r"\ball\s+43\s+(?:deposited\s+)?files\s+(?:are|remain)\s+unchanged\b",
        r"\bthis maintenance changes only mutable distributions\b",
        r"currentArchiveIncludedInRelease\s*[\"']?\s*[:=]\s*(?:false|False)\b",
        r"\bthe archived Zenodo DOI stays attached to its own historical files\b",
        r"\bthe exact DOI identifies this release cohort\b",
        r"\bthe exact release DOI identifies this coordinated snapshot\b",
    )
    for pattern in obsolete:
        if re.search(pattern, text, re.I):
            raise ValueError("Unrecognized stale target-archive claim: " + pattern)
    # Only inspect clauses naming this DOI. This preserves statements about
    # other historical DOI records in the same publication.
    for line in text.splitlines():
        if doi not in line:
            continue
        for clause in re.split(r"(?<=[.!?])\s+", line):
            if doi not in clause:
                continue
            if re.search(
                r"\bimmutable archive\b|\bonly (?:its )?historical files\b|"
                r"\bonly old files\b|\bpredates (?:the |this )?(?:current |new )?"
                r"(?:website|distribution|release)\b|\bwas not updated\b",
                clause, re.I,
            ):
                raise ValueError("Unrecognized stale claim about " + doi)


def correct_prose(text, original_source=ORIGINAL_SOURCE,
                  delivery_source=DELIVERY_SOURCE, doi=DOI):
    """Rewrite only reviewed publication phrases; reject unknown stale claims.

    The canonical dual-source notice occurs once per supplied text block.
    Other prose, old DOI citations, YAML front matter and clinical claims are
    preserved verbatim. This does not invent platform revision values.
    """
    _validate(original_source, delivery_source, doi)
    if not isinstance(text, str):
        raise TypeError("Publication prose must be text")
    notice = correction_notice(original_source, delivery_source, doi)
    boundary = (
        "The published immutable archive " + doi + " preserves source "
        + original_source + ". Cite these updated distribution bytes by their "
        "own platform revision and website source; the archive files are unchanged."
    )
    text = text.replace(boundary, "")
    reviewed = {
        "The exact DOI identifies this release cohort; its live availability is verified separately in publication receipts.": "",
        "The exact Dataset archive belongs to this coordinated release; the website source archive remains historical.": "",
        "The exact Dataset archive belongs to this coordinated release; the software source archive remains historical.": "",
        "Use the assigned exact DOI to cite this coordinated archive.": "",
        "the exact release DOI identifies this coordinated snapshot; historical records retain their own provenance.": "",
        "while the necessary corrected Zenodo packaging has the exact DOI and version stated above.": "while minor schema and delivery corrections retain the same Dataset DOI.",
        "This coordinated release uses the exact Dataset DOI stated above; subsequent maintenance must respect the archived snapshot and platform revision boundaries.": "",
        "The corrected exact archive is identified below;": "The Dataset archive and its correction provenance are identified below;",
        "The preserved immutable archive is identified below;": "The Dataset archive and its correction provenance are identified below;",
        "The exact Zenodo Dataset snapshot for this release is": "The Zenodo Dataset archive with recorded delivery corrections is",
        "The published immutable Zenodo Dataset archive is": "The Zenodo Dataset archive with recorded delivery corrections is",
        "Zenodo DOIs preserve their own historical snapshots.": "Other historical Zenodo DOI records preserve their own snapshots.",
        "The archived Zenodo DOI stays attached to its own historical files.": "The Dataset DOI retains original scientific provenance and records minor schema and delivery corrections under that same DOI.",
        "Those archives were not updated by this Hugging Face/Kaggle maintenance publication.": "Other historical DOI records remain preserved; the current Dataset record documents minor schema and delivery corrections.",
        "The publication scope includes the existing Zenodo distributions. Consult per-platform receipts for the final files and provenance.": "This maintenance includes minor schema and delivery corrections to the current Zenodo Dataset record. Other historical DOI records are preserved; consult per-platform receipts for the final files and provenance.",
        "نسخهٔ جاری کاگل و هاگینگ‌فیس از فایل‌های یکسان استفاده می‌کنند؛ شناسهٔ دقیق این انتشار در بخش DOI آمده است؛ آرشیوهای تاریخی با فایل‌ها و سوابق اصلی خود محفوظ می‌مانند.": "نسخهٔ جاری کاگل و هاگینگ‌فیس داده‌های مشترک را با شناسهٔ نسخه و بازبینی مشخص می‌کنند؛ DOI دیتاست، منبع علمی اولیه و اصلاحات جزئی اسکیما و بسته‌بندی همان رکورد را با سوابق تفکیک‌شده معرفی می‌کند؛ سایر DOIهای تاریخی محفوظ‌اند.",
        "DOI مجموعه، پیوند پایدار مجموعه است و DOI دقیق، شناسهٔ همین انتشار است.": "DOI مجموعه، پیوند پایدار مجموعه است؛ DOI دقیق دیتاست، منبع علمی اولیه و اصلاحات جزئی اسکیما و بسته‌بندی همان رکورد را معرفی می‌کند.",
        "DOI بخش آرشیو، تصویر ثابتِ منتشرشده و سوابق اصلی آن را معرفی می‌کند.": "DOI بخش آرشیو، منبع علمی اولیه و اصلاحات جزئی اسکیما و بسته‌بندی همان رکورد را با سوابق تفکیک‌شده معرفی می‌کند.",
        "DOI مجموعه، پیوند پایدار مجموعه است و DOI دقیق، شناسهٔ آرشیو ثابت با کامیت منبع ثبت‌شدهٔ خودش است.": "DOI مجموعه، پیوند پایدار مجموعه است؛ DOI دقیق دیتاست، منبع علمی اولیه و اصلاحات جزئی اسکیما و بسته‌بندی همان رکورد را معرفی می‌کند.",
    }
    for old, new in reviewed.items():
        text = text.replace(old, new)
    # The standard Kaggle builder can mention both the current Dataset and
    # historical software record in one stock scope sentence. Preserve the
    # historical DOI while limiting the correction to the current record.
    text = re.sub(
        r"The publication scope includes the existing Zenodo distributions at "
        + re.escape("https://doi.org/" + doi)
        + r" and (https://doi\.org/10\.5281/zenodo\.\d+)\. "
        r"Their DOI identifiers are retained; consult per-platform receipts for final files and provenance\.",
        lambda m: (
            "Minor schema and delivery corrections retain Dataset DOI " + doi
            + ". Historical software source: " + m[1]
            + ". That historical record is preserved; consult per-platform "
            "receipts for final files and provenance."
        ),
        text,
    )
    text = re.sub(
        r"Archived Zenodo snapshots: " + re.escape("https://doi.org/" + doi)
        + r" and (https://doi\.org/10\.5281/zenodo\.\d+)\. "
        r"They were not updated in this publication\.",
        lambda m: (
            "Minor schema and delivery corrections retain Dataset DOI " + doi
            + ". Historical software source: " + m[1]
            + ". That historical record is preserved."
        ),
        text,
    )
    # Replace labels only when they introduce this target record, not older
    # immutable archives elsewhere in the same card or notebook.
    label = re.compile(
        r"(?:Published immutable archive|Exact release binding)"
        r"(?=[^\n]*?" + re.escape(doi) + r")"
    )
    text = label.sub("Dataset archive with recorded delivery corrections", text)
    text = text.replace(
        "Immutable archive DOI " + doi + " preserves source " + original_source,
        "Dataset DOI " + doi + " retains original scientific source " + original_source,
    )
    if doi in text and notice not in text:
        text = text.rstrip() + "\n\n" + notice + "\n"
    guard_prose(text, doi=doi)
    return text


def scope_notebook(path, *, original_source=ORIGINAL_SOURCE,
                   delivery_source=DELIVERY_SOURCE, doi=DOI):
    """Correct Markdown only, preserving every other cell deeply and exactly."""
    path = Path(path)
    document = json.loads(path.read_text())
    before = copy.deepcopy(document)
    for cell in document["cells"]:
        if cell.get("cell_type") != "markdown":
            continue
        source = cell.get("source", [])
        text = source if isinstance(source, str) else "".join(source)
        corrected = correct_prose(text, original_source, delivery_source, doi)
        if corrected != text:
            cell["source"] = corrected if isinstance(source, str) else corrected.splitlines(keepends=True)
    assert [c for c in document["cells"] if c.get("cell_type") != "markdown"] == [
        c for c in before["cells"] if c.get("cell_type") != "markdown"
    ], "Notebook executable/raw cells changed during prose correction"
    if document == before:
        return False
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    return True
