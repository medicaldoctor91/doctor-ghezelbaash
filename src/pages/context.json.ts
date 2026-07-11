import { getHeadings } from '~/content/landing.md';
import { buildAgentContext } from '~/compilers/agent-context';
import { jsonResponse } from '~/compilers/utils';

export const prerender = true;
export function GET() {
  return jsonResponse(buildAgentContext(getHeadings()));
}

