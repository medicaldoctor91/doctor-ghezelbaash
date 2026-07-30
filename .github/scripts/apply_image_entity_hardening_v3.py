#!/usr/bin/env python3
# Apply the approved v3 identity hardening to website image assets and semantic surfaces.

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from PIL import Image
from rdflib import Graph

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://www.ghezelbaash.ir/"
PERSON = BASE + "#saeed-ghezelbash"
CLINIC = BASE + "#dr-saeed-ghezelbash-aesthetic-clinic-kermanshah"
LICENSE = "https://creativecommons.org/licenses/by/4.0/"
XMP_HEADER = b"http://ns.adobe.com/xap/1.0/\x00"
ALIASES = [
    "Mohammad Saeed Ghezelbash",
    "Dr. Mohammad Saeed Ghezelbash",
    "محمدسعید قزلباش",
    "دکتر محمدسعید قزلباش",
    "Saeed Ghezelbash",
    "Dr. Saeed Ghezelbash",
    "Saeed Ghezelbaash",
    "Dr. Saeed Ghezelbaash",
    "سعید قزلباش",
    "دکتر سعید قزلباش",
]
KEYWORDS = ALIASES + [
    "physician",
    "medical researcher",
    "aesthetic medicine",
    "Iranian physician",
    "Kermanshah",
    "Iran",
    "Q140287622",
    "Q140288589",
    "Dr. Saeed Ghezelbash Aesthetic Clinic",
    "کلینیک زیبایی دکتر سعید قزلباش",
]
ASSETS: dict[str, dict[str, int | str]] = {}

SUBJECTS = {
    "portrait": {
        "commons_filename": "Saeed-Ghezelbaash-physician-portrait.jpg",
        "expected_jpeg_sha256": "7bee37db6dba336a2cc1a344a6ca0ebd05338a0277b23581816982bc9901bc30",
        "master_id": BASE + "#image-saeed-ghezelbash-portrait-master",
        "master_webp_id": BASE + "#image-saeed-ghezelbash-portrait-master-webp",
        "master_jpg": "public/media/images/physician/master/saeed-ghezelbaash-physician-portrait.jpg",
        "master_webp": "public/media/images/physician/master/saeed-ghezelbaash-physician-portrait.webp",
        "commons_page": "https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-physician-portrait.jpg",
        "media_id": "M196320105",
        "representative": True,
        "about": [PERSON],
        "name_fa": "پرتره رسمی دکتر سعید قزلباش",
        "name_en": "Saeed Ghezelbash, Iranian physician and medical researcher",
        "caption_fa": "دکتر سعید قزلباش (محمدسعید قزلباش)، پزشک ایرانی",
        "caption_en": "Saeed Ghezelbash, also known as Mohammad Saeed Ghezelbash, Iranian physician",
        "description_fa": "پرتره رسمی دکتر سعید قزلباش، با نام کامل محمدسعید قزلباش، پزشک و پژوهشگر پزشکی فعال در پزشکی زیبایی در کرمانشاه، ایران، با روپوش سفید و گوشی پزشکی در محیط بالینی کلینیک زیبایی دکتر سعید قزلباش.",
        "description_en": "Canonical portrait of Saeed Ghezelbash, also known as Mohammad Saeed Ghezelbash, an Iranian physician and medical researcher working in aesthetic medicine in Kermanshah, Iran, wearing a white coat and stethoscope at Dr. Saeed Ghezelbash Aesthetic Clinic.",
        "main_id": BASE + "#image-saeed-ghezelbash-portrait",
        "thumb_id": BASE + "#image-saeed-ghezelbash-portrait-thumbnail",
        "main_path": "public/media/images/physician/saeed-ghezelbash-portrait-1600.webp",
        "thumb_path": "public/media/images/physician/saeed-ghezelbash-portrait-960.webp",
        "variants": {
            "public/media/images/physician/saeed-ghezelbash-portrait-delivery-640.webp": (640, 427, 84),
            "public/media/images/physician/saeed-ghezelbash-portrait-delivery-960.webp": (960, 640, 84),
            "public/media/images/physician/saeed-ghezelbash-portrait-960.webp": (960, 640, 84),
            "public/media/images/physician/saeed-ghezelbash-portrait-1600.webp": (1600, 1067, 84),
        },
    },
    "office": {
        "commons_filename": "Saeed-Ghezelbaash-in-clinical-office.jpg",
        "expected_jpeg_sha256": "cff5c8d9cb2873d428fb79c98958eac941289cee5bb75b88a6f1293aa4ac455a",
        "master_id": BASE + "#image-saeed-ghezelbash-clinical-office-master",
        "master_webp_id": BASE + "#image-saeed-ghezelbash-clinical-office-master-webp",
        "master_jpg": "public/media/images/physician/master/saeed-ghezelbaash-in-clinical-office.jpg",
        "master_webp": "public/media/images/physician/master/saeed-ghezelbaash-in-clinical-office.webp",
        "commons_page": "https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-in-clinical-office.jpg",
        "media_id": "M196320110",
        "representative": False,
        "about": [PERSON, CLINIC],
        "name_fa": "دکتر سعید قزلباش در کلینیک زیبایی دکتر سعید قزلباش",
        "name_en": "Saeed Ghezelbash at Dr. Saeed Ghezelbash Aesthetic Clinic",
        "caption_fa": "دکتر سعید قزلباش (محمدسعید قزلباش) در محیط بالینی کلینیک زیبایی دکتر سعید قزلباش",
        "caption_en": "Saeed Ghezelbash, also known as Mohammad Saeed Ghezelbash, in his clinical office",
        "description_fa": "دکتر سعید قزلباش، با نام کامل محمدسعید قزلباش، پزشک و پژوهشگر پزشکی فعال در پزشکی زیبایی، با روپوش سفید و گوشی پزشکی پشت میز در محیط بالینی کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه، ایران.",
        "description_en": "Saeed Ghezelbash, also known as Mohammad Saeed Ghezelbash, an Iranian physician and medical researcher working in aesthetic medicine, seated in his clinical office at Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah, Iran.",
        "main_id": BASE + "#image-saeed-ghezelbash-clinical-examination",
        "thumb_id": BASE + "#image-saeed-ghezelbash-clinical-examination-thumbnail",
        "main_path": "public/media/images/physician/saeed-ghezelbash-clinical-examination-1600.webp",
        "thumb_path": "public/media/images/physician/saeed-ghezelbash-clinical-examination-960.webp",
        "variants": {
            "public/media/images/physician/saeed-ghezelbash-in-clinical-office-delivery-640.webp": (640, 427, 84),
            "public/media/images/physician/saeed-ghezelbash-in-clinical-office-delivery-960.webp": (960, 640, 84),
            "public/media/images/physician/saeed-ghezelbash-clinical-examination-960.webp": (960, 640, 84),
            "public/media/images/physician/saeed-ghezelbash-clinical-examination-1600.webp": (1600, 1067, 84),
        },
    },
    "team": {
        "commons_filename": "Saeed-Ghezelbaash-with-clinical-team.jpg",
        "expected_jpeg_sha256": "21dfd32cfe25febe5b5ac92887dc9116853aa56ca1649f4a9497104e60eb6109",
        "master_id": BASE + "#image-saeed-ghezelbash-clinical-team-master",
        "master_webp_id": BASE + "#image-saeed-ghezelbash-clinical-team-master-webp",
        "master_jpg": "public/media/images/physician/master/saeed-ghezelbaash-with-clinical-team.jpg",
        "master_webp": "public/media/images/physician/master/saeed-ghezelbaash-with-clinical-team.webp",
        "commons_page": "https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-with-clinical-team.jpg",
        "media_id": "M196320111",
        "representative": False,
        "about": [PERSON, CLINIC],
        "name_fa": "دکتر سعید قزلباش همراه تیم بالینی کلینیک زیبایی دکتر سعید قزلباش",
        "name_en": "Saeed Ghezelbash with the clinical team of Dr. Saeed Ghezelbash Aesthetic Clinic",
        "caption_fa": "دکتر سعید قزلباش (محمدسعید قزلباش) همراه اعضای تیم بالینی",
        "caption_en": "Saeed Ghezelbash, also known as Mohammad Saeed Ghezelbash, with members of his clinical team",
        "description_fa": "دکتر سعید قزلباش، با نام کامل محمدسعید قزلباش، پزشک و پژوهشگر پزشکی فعال در پزشکی زیبایی، با لباس پزشکی و گوشی پزشکی همراه اعضای تیم بالینی کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه، ایران.",
        "description_en": "Saeed Ghezelbash, also known as Mohammad Saeed Ghezelbash, an Iranian physician and medical researcher working in aesthetic medicine, with members of the clinical team of Dr. Saeed Ghezelbash Aesthetic Clinic in Kermanshah, Iran.",
        "main_id": BASE + "#image-saeed-ghezelbash-clinic-team",
        "thumb_id": BASE + "#image-saeed-ghezelbash-clinic-team-thumbnail",
        "main_path": "public/media/images/physician/saeed-ghezelbash-with-clinic-team-1600.webp",
        "thumb_path": "public/media/images/physician/saeed-ghezelbash-with-clinic-team-960.webp",
        "variants": {
            "public/media/images/physician/saeed-ghezelbash-with-clinic-team-delivery-640.webp": (640, 427, 84),
            "public/media/images/physician/saeed-ghezelbash-with-clinic-team-delivery-960.webp": (960, 640, 84),
            "public/media/images/physician/saeed-ghezelbash-with-clinic-team-960.webp": (960, 640, 84),
            "public/media/images/physician/saeed-ghezelbash-with-clinic-team-1600.webp": (1600, 1067, 84),
        },
    },
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def compact_json(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def localized(fa: str, en: str) -> list[dict[str, str]]:
    return [{"@value": fa, "@language": "fa"}, {"@value": en, "@language": "en"}]


def refs(values: list[str]) -> list[dict[str, str]]:
    return [{"@id": item} for item in values]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def parse_jpeg(data: bytes) -> tuple[list[tuple[int, bytes, bytes]], bytes, bytes]:
    if not data.startswith(b"\xff\xd8"):
        raise ValueError("not JPEG")
    pos = 2
    segments: list[tuple[int, bytes, bytes]] = []
    while pos < len(data):
        marker_start = pos
        if data[pos] != 0xFF:
            raise ValueError(f"invalid marker at {pos}")
        while data[pos] == 0xFF:
            pos += 1
        marker = data[pos]
        pos += 1
        if marker == 0xDA:
            length = int.from_bytes(data[pos:pos + 2], "big")
            return segments, data[marker_start:pos + length], data[pos + length:]
        length = int.from_bytes(data[pos:pos + 2], "big")
        end = pos + length
        segments.append((marker, data[marker_start:end], data[pos + 2:end]))
        pos = end
    raise ValueError("no JPEG scan")


def extract_jpeg_xmp(data: bytes) -> bytes:
    for marker, _raw, payload in parse_jpeg(data)[0]:
        if marker == 0xE1 and payload.startswith(XMP_HEADER):
            return payload[len(XMP_HEADER):]
    raise ValueError("JPEG XMP absent")


def parse_webp(data: bytes) -> list[tuple[bytes, bytes, bytes]]:
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("not WebP")
    chunks = []
    pos = 12
    while pos + 8 <= len(data):
        fourcc = data[pos:pos + 4]
        size = int.from_bytes(data[pos + 4:pos + 8], "little")
        data_start = pos + 8
        data_end = data_start + size
        raw_end = data_end + (size % 2)
        chunks.append((fourcc, data[data_start:data_end], data[pos:raw_end]))
        pos = raw_end
    return chunks


def webp_chunk(fourcc: bytes, payload: bytes) -> bytes:
    return fourcc + len(payload).to_bytes(4, "little") + payload + (b"\0" if len(payload) % 2 else b"")


def vp8x_chunk(width: int, height: int, *, alpha: bool, icc: bool, exif: bool, animation: bool) -> bytes:
    flags = (0x10 if alpha else 0) | (0x20 if icc else 0) | (0x08 if exif else 0) | 0x04 | (0x02 if animation else 0)
    payload = bytes([flags, 0, 0, 0]) + (width - 1).to_bytes(3, "little") + (height - 1).to_bytes(3, "little")
    return webp_chunk(b"VP8X", payload)


def embed_webp_xmp(data: bytes, xmp: bytes, width: int, height: int) -> bytes:
    chunks = parse_webp(data)
    output: list[bytes] = []
    has_vp8x = False
    for fourcc, payload, raw in chunks:
        if fourcc == b"XMP ":
            continue
        if fourcc == b"VP8X":
            output.append(webp_chunk(fourcc, bytes([payload[0] | 0x04]) + payload[1:]))
            has_vp8x = True
        else:
            output.append(raw)
    if not has_vp8x:
        output.insert(
            0,
            vp8x_chunk(
                width,
                height,
                alpha=any(item[0] == b"ALPH" for item in chunks),
                icc=any(item[0] == b"ICCP" for item in chunks),
                exif=any(item[0] == b"EXIF" for item in chunks),
                animation=any(item[0] == b"ANIM" for item in chunks),
            ),
        )
    output.append(webp_chunk(b"XMP ", xmp))
    body = b"".join(output)
    return b"RIFF" + (len(body) + 4).to_bytes(4, "little") + b"WEBP" + body


def customize_xmp(xmp: bytes, repo_path: str, width: int, height: int, spec: dict) -> bytes:
    text = xmp.decode("utf-8")
    url = BASE + repo_path.removeprefix("public/")
    filename = Path(repo_path).name
    text = text.replace("<dc:format>image/jpeg</dc:format>", "<dc:format>image/webp</dc:format>")
    text = re.sub(r"<Iptc4xmpExt:MaxAvailWidth>\d+</Iptc4xmpExt:MaxAvailWidth>", f"<Iptc4xmpExt:MaxAvailWidth>{width}</Iptc4xmpExt:MaxAvailWidth>", text)
    text = re.sub(r"<Iptc4xmpExt:MaxAvailHeight>\d+</Iptc4xmpExt:MaxAvailHeight>", f"<Iptc4xmpExt:MaxAvailHeight>{height}</Iptc4xmpExt:MaxAvailHeight>", text)
    text = re.sub(r"<entity:PixelDimensions>[^<]+</entity:PixelDimensions>", f"<entity:PixelDimensions>{width}x{height}</entity:PixelDimensions>", text)
    text = re.sub(r"<xmp:Nickname>[^<]*</xmp:Nickname>", f"<xmp:Nickname>{filename}</xmp:Nickname>", text)
    text = re.sub(r"<xmpMM:PreservedFileName>[^<]*</xmpMM:PreservedFileName>", f"<xmpMM:PreservedFileName>{filename}</xmpMM:PreservedFileName>", text)
    text = re.sub(r"<entity:FirstPartyContentURL>[^<]*</entity:FirstPartyContentURL>", f"<entity:FirstPartyContentURL>{url}</entity:FirstPartyContentURL>", text)
    text = re.sub(r"<entity:FirstPartyWebPURL>[^<]*</entity:FirstPartyWebPURL>", f"<entity:FirstPartyWebPURL>{url}</entity:FirstPartyWebPURL>", text)
    text = re.sub(r"<dc:source>[^<]*</dc:source>", f"<dc:source>{url}</dc:source>", text)
    instance_id = f"urn:uuid:{uuid.uuid5(uuid.NAMESPACE_URL, url + '|image-entity-hardening-v3')}"
    text = re.sub(r"<xmpMM:InstanceID>[^<]*</xmpMM:InstanceID>", f"<xmpMM:InstanceID>{instance_id}</xmpMM:InstanceID>", text)
    marker = (
        f"<entity:DeliveryAssetURL>{url}</entity:DeliveryAssetURL>"
        f"<entity:DeliveryAssetPath>{repo_path}</entity:DeliveryAssetPath>"
        f"<entity:DeliveryAssetEncoding>image/webp</entity:DeliveryAssetEncoding>"
        f"<entity:DeliveryAssetWidth>{width}</entity:DeliveryAssetWidth>"
        f"<entity:DeliveryAssetHeight>{height}</entity:DeliveryAssetHeight>"
        f"<entity:SourceMasterImageObject>{spec['master_id']}</entity:SourceMasterImageObject>"
    )
    text = text.replace("</rdf:Description>", marker + "</rdf:Description>")
    for token in ("Mohammad Saeed Ghezelbash", "Saeed Ghezelbash", "Dr. Saeed Ghezelbash Aesthetic Clinic", "Q140287622", "Q140288589"):
        if token not in text:
            raise ValueError(f"XMP token absent: {token}")
    return text.encode("utf-8")


def commons_original_url(filename: str) -> str:
    query = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "iiprop": "url",
        "titles": "File:" + filename,
    })
    request = urllib.request.Request(
        "https://commons.wikimedia.org/w/api.php?" + query,
        headers={"User-Agent": "GhezelbaashImageHardening/3.0 (doctor@ghezelbaash.ir)"},
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        payload = json.load(response)
    pages = payload.get("query", {}).get("pages", {})
    page = next(iter(pages.values()))
    return page["imageinfo"][0]["url"]


def fetch_commons_master(spec: dict) -> bytes:
    url = commons_original_url(spec["commons_filename"])
    separator = "&" if "?" in url else "?"
    request = urllib.request.Request(
        url + separator + "entity-hardening-v3=20260730",
        headers={"User-Agent": "GhezelbaashImageHardening/3.0 (doctor@ghezelbaash.ir)", "Cache-Control": "no-cache"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        data = response.read()
    digest = sha256(data)
    if digest != spec["expected_jpeg_sha256"]:
        raise SystemExit(
            f"Commons current original does not match approved v3 for {spec['commons_filename']}: {digest}"
        )
    return data


def record_asset(repo_path: str) -> None:
    data = (ROOT / repo_path).read_bytes()
    ASSETS[repo_path] = {"bytes": len(data), "sha256": sha256(data)}


def prepare_assets() -> None:
    for spec in SUBJECTS.values():
        jpeg_data = fetch_commons_master(spec)
        jpeg_path = ROOT / spec["master_jpg"]
        jpeg_path.parent.mkdir(parents=True, exist_ok=True)
        jpeg_path.write_bytes(jpeg_data)
        record_asset(spec["master_jpg"])

        xmp = extract_jpeg_xmp(jpeg_data)
        image = Image.open(io.BytesIO(jpeg_data)).convert("RGB")
        if image.size != (4897, 3266):
            raise SystemExit(f"unexpected master dimensions: {spec['commons_filename']}: {image.size}")

        webp_targets = {spec["master_webp"]: (4897, 3266, 96), **spec["variants"]}
        for repo_path, (width, height, quality) in webp_targets.items():
            resized = image if (width, height) == image.size else image.resize((width, height), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            resized.save(buffer, format="WEBP", quality=quality, method=6)
            output = embed_webp_xmp(
                buffer.getvalue(),
                customize_xmp(xmp, repo_path, width, height, spec),
                width,
                height,
            )
            Image.open(io.BytesIO(output)).verify()
            if not any(chunk[0] == b"XMP " for chunk in parse_webp(output)):
                raise SystemExit(f"XMP absent after WebP generation: {repo_path}")
            target = ROOT / repo_path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(output)
            record_asset(repo_path)


def bytes_info(repo_path: str) -> tuple[int, str]:
    data = (ROOT / repo_path).read_bytes()
    return len(data), sha256(data)


def subject_payload(spec: dict, repo_path: str, encoding: str) -> dict:
    size, digest = bytes_info(repo_path)
    return {
        "name": localized(spec["name_fa"], spec["name_en"]),
        "alternateName": ALIASES,
        "caption": localized(spec["caption_fa"], spec["caption_en"]),
        "description": localized(spec["description_fa"], spec["description_en"]),
        "contentUrl": BASE + repo_path.removeprefix("public/"),
        "encodingFormat": encoding,
        "about": refs(spec["about"]),
        "creator": {"@id": PERSON},
        "publisher": {"@id": PERSON},
        "copyrightHolder": {"@id": PERSON},
        "creditText": "Saeed Ghezelbash / Dr. Saeed Ghezelbash Aesthetic Clinic",
        "copyrightNotice": "© 2023 Saeed Ghezelbash",
        "license": LICENSE,
        "acquireLicensePage": spec["commons_page"],
        "sameAs": spec["commons_page"],
        "dateCreated": "2023-05-29",
        "keywords": KEYWORDS,
        "identifier": [
            spec["media_id"],
            "https://commons.wikimedia.org/entity/" + spec["media_id"],
            "sha256:" + digest,
        ],
        "contentSize": f"{size} bytes",
        "sha256": digest,
        "representativeOfPage": spec["representative"],
    }


def patch_graph(path: Path, add_master_webps: bool) -> str:
    graph = load_json(path)
    nodes = graph.get("@graph")
    if not isinstance(nodes, list):
        raise SystemExit(f"{path}: @graph missing")
    by_id = {n.get("@id"): n for n in nodes if isinstance(n, dict) and n.get("@id")}

    for spec in SUBJECTS.values():
        master = by_id.get(spec["master_id"])
        if not isinstance(master, dict):
            raise SystemExit(f"{path}: missing {spec['master_id']}")
        master.update(subject_payload(spec, spec["master_jpg"], "image/jpeg"))
        master["@type"] = "ImageObject"
        master["width"] = 4897
        master["height"] = 3266
        master["isPartOf"] = {"@id": BASE + "#webpage"}
        master["encoding"] = [{"@id": spec["master_webp_id"]}]

        for node_id, repo_path in ((spec["main_id"], spec["main_path"]), (spec["thumb_id"], spec["thumb_path"])):
            node = by_id.get(node_id)
            if isinstance(node, dict):
                keep = {
                    key: node[key]
                    for key in ("@id", "@type", "width", "height", "thumbnail", "isBasedOn", "isPartOf")
                    if key in node
                }
                node.update(subject_payload(spec, repo_path, "image/webp"))
                node.update(keep)
                node.setdefault("isBasedOn", {"@id": spec["master_id"]})
                node.setdefault("isPartOf", {"@id": BASE + "#webpage"})

        if add_master_webps:
            webp_node = {
                "@id": spec["master_webp_id"],
                "@type": "ImageObject",
                **subject_payload(spec, spec["master_webp"], "image/webp"),
                "width": 4897,
                "height": 3266,
                "isBasedOn": {"@id": spec["master_id"]},
                "isPartOf": {"@id": BASE + "#webpage"},
            }
            if spec["master_webp_id"] in by_id:
                by_id[spec["master_webp_id"]].clear()
                by_id[spec["master_webp_id"]].update(webp_node)
            else:
                nodes.append(webp_node)
                by_id[spec["master_webp_id"]] = webp_node

    output = compact_json(graph)
    path.write_text(output, encoding="utf-8")
    return output


def patch_page() -> None:
    path = ROOT / "src/pages/index.md"
    text = path.read_text(encoding="utf-8")
    replacements = {
        'alt="دکتر سعید قزلباش، پزشک ایرانی با روپوش سفید و گوشی پزشکی در محیط بالینی کرمانشاه"':
        'alt="دکتر سعید قزلباش (محمدسعید قزلباش)، پزشک ایرانی با روپوش سفید و گوشی پزشکی در محیط بالینی کرمانشاه"',
        '<figcaption>دکتر سعید قزلباش، پزشک ایرانی</figcaption>':
        '<figcaption>دکتر سعید قزلباش (محمدسعید قزلباش)، پزشک ایرانی · <a href="https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-physician-portrait.jpg" rel="external">تصویر در ویکی‌مدیا کامنز</a></figcaption>',
        'alt="دکتر سعید قزلباش با روپوش سفید و گوشی پزشکی، نشسته پشت میز در محیط بالینی خود در کرمانشاه"':
        'alt="دکتر سعید قزلباش (محمدسعید قزلباش) با روپوش سفید و گوشی پزشکی، نشسته پشت میز در کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه"',
        '<figcaption>سعید قزلباش در محیط بالینی</figcaption>':
        '<figcaption>دکتر سعید قزلباش (محمدسعید قزلباش) در کلینیک زیبایی دکتر سعید قزلباش · <a href="https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-in-clinical-office.jpg" rel="external">تصویر در ویکی‌مدیا کامنز</a></figcaption>',
        'alt="دکتر سعید قزلباش با لباس پزشکی و گوشی پزشکی، همراه اعضای تیم بالینی در کرمانشاه"':
        'alt="دکتر سعید قزلباش (محمدسعید قزلباش) با لباس پزشکی و گوشی پزشکی، همراه اعضای تیم بالینی کلینیک زیبایی دکتر سعید قزلباش در کرمانشاه"',
        '<figcaption>سعید قزلباش همراه اعضای تیم بالینی</figcaption>':
        '<figcaption>دکتر سعید قزلباش (محمدسعید قزلباش) همراه تیم بالینی کلینیک زیبایی دکتر سعید قزلباش · <a href="https://commons.wikimedia.org/wiki/File:Saeed-Ghezelbaash-with-clinical-team.jpg" rel="external">تصویر در ویکی‌مدیا کامنز</a></figcaption>',
    }
    for old, new in replacements.items():
        if old not in text:
            raise SystemExit(f"src/pages/index.md expected fragment absent: {old[:100]}")
        text = text.replace(old, new, 1)
    path.write_text(text, encoding="utf-8")


def patch_document_head() -> None:
    path = ROOT / "src/components/DocumentHead.astro"
    text = path.read_text(encoding="utf-8")
    old = "const portraitAlt = 'دکتر سعید قزلباش، پزشک ایرانی در محیط بالینی کرمانشاه';"
    new = "const portraitAlt = 'دکتر سعید قزلباش (محمدسعید قزلباش)، پزشک ایرانی در محیط بالینی کرمانشاه';"
    if old not in text:
        raise SystemExit("DocumentHead portraitAlt expected fragment absent")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def patch_headers(head_graph_text: str) -> None:
    path = ROOT / "public/_headers"
    text = path.read_text(encoding="utf-8")
    blocks = []
    for spec in SUBJECTS.values():
        webp_url = "/" + spec["master_webp"].removeprefix("public/")
        jpg_url = "/" + spec["master_jpg"].removeprefix("public/")
        links = [
            f"<{PERSON}>; rel=\"about\"",
            *([] if spec["about"] == [PERSON] else [f"<{CLINIC}>; rel=\"about\""]),
            "</graph.jsonld>; rel=\"describedby\"; type=\"application/ld+json\"",
            f"<{spec['commons_page']}>; rel=\"describedby\"",
            f"<{LICENSE}>; rel=\"license\"",
            f"<{jpg_url}>; rel=\"alternate\"; type=\"image/jpeg\"",
        ]
        blocks.append(
            f"{webp_url}\n"
            f"  Content-Type: image/webp\n"
            f"  Link: {', '.join(links)}\n"
            f"  Access-Control-Allow-Origin: *\n"
            f"  Cross-Origin-Resource-Policy: cross-origin\n"
        )
    marker = "/media/images/physician/derived/*"
    if marker not in text:
        raise SystemExit("_headers insertion marker absent")
    for spec in SUBJECTS.values():
        webp_url = "/" + spec["master_webp"].removeprefix("public/")
        text = re.sub(rf"\n{re.escape(webp_url)}\n(?:  .*\n)+", "\n", text)
    text = text.replace("\n" + marker, "\n" + "\n".join(blocks) + "\n" + marker, 1)
    digest = base64.b64encode(hashlib.sha256(head_graph_text.encode("utf-8")).digest()).decode("ascii")
    text = re.sub(
        r"(Content-Security-Policy: [^\n]*script-src 'self' )'sha256-[A-Za-z0-9+/=]+'",
        rf"\1'sha256-{digest}'",
        text,
        count=1,
    )
    path.write_text(text, encoding="utf-8")


def patch_sitemap() -> None:
    path = ROOT / "public/sitemap.xml"
    text = path.read_text(encoding="utf-8")
    anchor = "    <image:image><image:loc>https://www.ghezelbaash.ir/media/images/physician/master/saeed-ghezelbaash-in-clinical-office.jpg</image:loc></image:image>"
    if anchor not in text:
        raise SystemExit("sitemap image insertion anchor absent")
    for spec in SUBJECTS.values():
        url = BASE + spec["master_webp"].removeprefix("public/")
        line = f"    <image:image><image:loc>{url}</image:loc></image:image>"
        if line not in text:
            text = text.replace(anchor, anchor + "\n" + line, 1)
    path.write_text(text, encoding="utf-8")


def patch_validator() -> None:
    path = ROOT / ".github/scripts/validate_source.py"
    text = path.read_text(encoding="utf-8")
    required_asset_lines = "\n".join(f'    "{item}",' for item in ASSETS)
    start = '    "public/media/images/physician/master/saeed-ghezelbaash-physician-portrait.jpg",'
    end = '    "public/media/brand/doctor-ghezelbaash-symbol-512.png",'
    if start not in text or end not in text:
        raise SystemExit("validator required_files anchors absent")
    text = re.sub(
        re.escape(start) + r"\n.*?" + re.escape(end),
        required_asset_lines + "\n" + end,
        text,
        count=1,
        flags=re.S,
    )
    logo_match = re.search(
        r'"public/media/brand/doctor-ghezelbaash-symbol-512\.png":\s*"([0-9a-f]{64})"',
        text,
    )
    if not logo_match:
        raise SystemExit("validator logo hash absent")
    hashes = [f'    "{item}": "{data["sha256"]}",' for item, data in ASSETS.items()]
    hashes.append(f'    "public/media/brand/doctor-ghezelbaash-symbol-512.png": "{logo_match.group(1)}",')
    text = re.sub(
        r"identity_hashes = \{\n.*?\n\}\nfor filename, expected in identity_hashes\.items\(\):",
        "identity_hashes = {\n" + "\n".join(hashes) + "\n}\nfor filename, expected in identity_hashes.items():",
        text,
        count=1,
        flags=re.S,
    )
    contract = '''
entity_image_assets = [
__ASSET_PATHS__
]
for filename in entity_image_assets:
    payload = Path(filename).read_bytes()
    for token in (
        b"Saeed Ghezelbash",
        b"Mohammad Saeed Ghezelbash",
        b"Dr. Saeed Ghezelbash Aesthetic Clinic",
        b"Q140287622",
        b"Q140288589",
        b"/g/11nqdfk76c",
    ):
        require(token in payload, f"identity metadata token missing from {filename}: {token!r}")
    require(b"Dr. Saeed Ghezelbaash Clinic" not in payload, f"obsolete clinic name remains in {filename}")
'''.replace("__ASSET_PATHS__", "\n".join(f'    "{item}",' for item in ASSETS))
    marker = 'html = read_text(DIST / "index.html")'
    if "entity_image_assets = [" not in text:
        if marker not in text:
            raise SystemExit("validator metadata insertion marker absent")
        text = text.replace(marker, contract + "\n" + marker, 1)
    path.write_text(text, encoding="utf-8")


def serialize_turtle_from_jsonld() -> None:
    graph = Graph().parse(ROOT / "public/graph.jsonld", format="json-ld")
    nt = graph.serialize(format="nt")
    lines = sorted(line for line in nt.splitlines() if line.strip())
    (ROOT / "public/graph.ttl").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    prepare_assets()
    patch_page()
    patch_document_head()
    full_text = patch_graph(ROOT / "public/graph.jsonld", add_master_webps=True)
    head_text = patch_graph(ROOT / "src/data/semantic/head-graph.min.jsonld", add_master_webps=False)
    patch_headers(head_text)
    patch_sitemap()
    patch_validator()
    serialize_turtle_from_jsonld()
    print(f"Applied v3 image entity hardening to {len(ASSETS)} assets.")
    print(f"Full Graph bytes: {len(full_text.encode('utf-8'))}")
    print(f"Head Graph bytes: {len(head_text.encode('utf-8'))}")


if __name__ == "__main__":
    main()
