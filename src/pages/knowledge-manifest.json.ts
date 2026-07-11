import { getHeadings, rawContent } from '~/content/landing.md';
import { buildKnowledgeManifest } from '~/compilers/manifests';
import { jsonResponse } from '~/compilers/utils';

export const prerender = true;
export function GET() {
  return jsonResponse(buildKnowledgeManifest(rawContent(), getHeadings()));
}

