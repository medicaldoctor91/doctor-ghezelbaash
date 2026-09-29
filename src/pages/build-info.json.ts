import release from '../data/release.json';
import { resolveBuildIdentity } from '../lib/build-identity.mjs';

export const prerender = true;

export function GET() {
  const build = resolveBuildIdentity();
  return new Response(
    `${JSON.stringify(
      {
        schemaVersion: '1.0',
        release: release.release,
        commit: build.commit,
        branch: build.branch,
        provider: build.provider,
      },
      null,
      2,
    )}\n`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    },
  );
}
