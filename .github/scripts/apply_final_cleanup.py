#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

from rdflib import Graph

ROOT = Path(__file__).resolve().parents[2]
HOME = "https://www.ghezelbaash.ir/"

OBSOLETE_IMAGE_IDS = {
    HOME + "#image-saeed-ghezelbash-portrait-responsive-640",
    HOME + "#image-saeed-ghezelbash-clinic-team-responsive-640",
    HOME + "#image-saeed-ghezelbash-clinical-office-responsive-640",
}
OBSOLETE_IMAGE_FILES = [
    ROOT / "public/media/images/physician/saeed-ghezelbash-portrait-640.webp",
    ROOT / "public/media/images/physician/saeed-ghezelbash-with-clinic-team-640.webp",
    ROOT / "public/media/images/physician/saeed-ghezelbash-in-clinical-office-640.webp",
]


def write_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding="utf-8", newline="\n")


def minified_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"


def clean_graph(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    graph = data.get("@graph")
    if not isinstance(graph, list):
        raise RuntimeError(f"{path}: @graph is missing")
    before = len(graph)
    data["@graph"] = [node for node in graph if node.get("@id") not in OBSOLETE_IMAGE_IDS]
    removed = before - len(data["@graph"])
    if path.name == "graph.jsonld" and removed != len(OBSOLETE_IMAGE_IDS):
        raise RuntimeError(f"{path}: expected to remove 3 obsolete image nodes, removed {removed}")
    payload = minified_json(data)
    for item in OBSOLETE_IMAGE_IDS:
        if item in payload:
            raise RuntimeError(f"{path}: obsolete image node still referenced: {item}")
    write_text(path, payload)
    return data


def regenerate_turtle(graph_data: dict) -> None:
    rdf = Graph()
    rdf.parse(data=json.dumps(graph_data, ensure_ascii=False), format="json-ld")
    serialized = rdf.serialize(format="nt")
    lines = sorted(line.strip() for line in serialized.splitlines() if line.strip())
    write_text(ROOT / "public/graph.ttl", "\n".join(lines) + "\n")


def merge_styles() -> None:
    global_css = ROOT / "src/styles/global.css"
    semantic_css = ROOT / "src/styles/semantic-direction.css"
    base_layout = ROOT / "src/layouts/BaseLayout.astro"
    semantic = semantic_css.read_text(encoding="utf-8").strip()
    current = global_css.read_text(encoding="utf-8").rstrip()
    if ".final-collapsible-section[dir=\"rtl\"]" not in current:
        current += "\n\n" + semantic + "\n"
    write_text(global_css, current)
    layout = base_layout.read_text(encoding="utf-8")
    layout = layout.replace("import '../styles/semantic-direction.css';\n", "")
    if "semantic-direction.css" in layout:
        raise RuntimeError("BaseLayout still imports semantic-direction.css")
    write_text(base_layout, layout)
    semantic_css.unlink()


def clean_package() -> None:
    path = ROOT / "package.json"
    package = json.loads(path.read_text(encoding="utf-8"))
    package["scripts"] = {"build": "astro build"}
    write_text(path, json.dumps(package, ensure_ascii=False, indent=2) + "\n")


def clean_robots() -> None:
    write_text(
        ROOT / "public/robots.txt",
        "User-agent: *\nAllow: /\n\nSitemap: https://www.ghezelbaash.ir/sitemap.xml\n",
    )


def create_projection_routes() -> None:
    helper = r'''const HOME = 'https://www.ghezelbaash.ir/';
const PERSON = `${HOME}#saeed-ghezelbash`;

function parse(markdown: string): { title: string; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) throw new Error('src/pages/index.md frontmatter is missing');
  const title = match[1].match(/^title:\s*["']?(.*?)["']?\s*$/m)?.[1];
  if (!title) throw new Error('src/pages/index.md title is missing');
  const body = markdown
    .slice(match[0].length)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*\/\s*>/gi, '')
    .replace(/\s+type=["']application\/ld\+json["']/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!/<h1\s+id=/i.test(body)) throw new Error('Markdown projection is missing the canonical H1');
  return { title, body };
}

export function markdownProjection(markdown: string): string {
  const { title, body } = parse(markdown);
  return `---\ntitle: ${JSON.stringify(title)}\ncanonical: "${HOME}"\nlang: "fa-IR"\nabout: "${PERSON}"\nsource: "${HOME}"\nrobots: "noindex, follow"\n---\n\n${body}\n`;
}

export function llmsFullProjection(markdown: string): string {
  const { body } = parse(markdown);
  return `# Dr. Saeed Ghezelbash — Full canonical page export\n\nCanonical: ${HOME}\nAbout: ${PERSON}\nSource: ${HOME}\nLanguage: fa-IR\nIndexing: noindex, follow\nPurpose: deterministic machine-readable projection of the complete canonical page content\n\n---\n\n${body}\n`;
}
'''
    index_route = r'''import source from './index.md?raw';
import { markdownProjection } from '../lib/page-projections';

export const prerender = true;

export function GET(): Response {
  return new Response(markdownProjection(source), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
'''
    llms_route = r'''import source from './index.md?raw';
import { llmsFullProjection } from '../lib/page-projections';

export const prerender = true;

export function GET(): Response {
  return new Response(llmsFullProjection(source), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Robots-Tag': 'noindex, follow',
    },
  });
}
'''
    write_text(ROOT / "src/lib/page-projections.ts", helper)
    write_text(ROOT / "src/pages/index.md.ts", index_route)
    write_text(ROOT / "src/pages/llms-full.txt.ts", llms_route)
    (ROOT / "public/llms-full.txt").unlink()


def update_validator() -> None:
    path = ROOT / ".github/scripts/validate_source.py"
    text = path.read_text(encoding="utf-8")
    old_required = '"public/robots.txt", "public/sitemap.xml", "public/llms.txt", "public/llms-full.txt",'
    new_required = '"public/robots.txt", "public/sitemap.xml", "public/llms.txt",\n    "src/pages/llms-full.txt.ts", "src/lib/page-projections.ts", "dist/llms-full.txt",'
    if old_required not in text:
        raise RuntimeError("validator required-files pattern changed")
    text = text.replace(old_required, new_required, 1)
    text = text.replace('"llms.txt", "llms-full.txt", "datasets/historical-patient-origin-summary.json",', '"llms.txt", "datasets/historical-patient-origin-summary.json",', 1)
    text = text.replace('read_text("public/llms-full.txt")', 'read_text(DIST / "llms-full.txt")')
    text = text.replace("read_text('public/llms-full.txt')", "read_text(DIST / 'llms-full.txt')")
    if "public/llms-full.txt" in text:
        raise RuntimeError("validator still references the removed static llms-full.txt")
    write_text(path, text)


def main() -> None:
    for file in OBSOLETE_IMAGE_FILES:
        if not file.is_file():
            raise RuntimeError(f"obsolete image file is missing before cleanup: {file}")
        file.unlink()

    graph = clean_graph(ROOT / "public/graph.jsonld")
    clean_graph(ROOT / "src/data/semantic/head-graph.min.jsonld")
    regenerate_turtle(graph)
    merge_styles()
    clean_package()
    clean_robots()
    create_projection_routes()
    update_validator()

    # Guard against reintroducing known release debris.
    forbidden = [
        ROOT / "src/styles/semantic-direction.css",
        ROOT / "public/llms-full.txt",
        *OBSOLETE_IMAGE_FILES,
    ]
    if any(path.exists() for path in forbidden):
        raise RuntimeError("release cleanup left a forbidden file behind")

    subprocess.run(["git", "diff", "--check"], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
