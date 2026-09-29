const firstNonEmpty = (...values) =>
  values.find((value) => typeof value === "string" && value.trim())?.trim() || "";

export function resolveBuildIdentity(env = process.env) {
  const commit = firstNonEmpty(
    env.CF_PAGES_COMMIT_SHA,
    env.GITHUB_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
  );
  if (commit && !/^[0-9a-f]{40}$/i.test(commit))
    throw new Error(`Invalid deployment commit SHA: ${commit}`);

  const branch = firstNonEmpty(
    env.CF_PAGES_BRANCH,
    env.GITHUB_REF_NAME,
    env.VERCEL_GIT_COMMIT_REF,
  );

  const provider = env.CF_PAGES
    ? "cloudflare-pages"
    : env.GITHUB_ACTIONS
      ? "github-actions"
      : env.VERCEL
        ? "vercel"
        : "local";

  return Object.freeze({
    commit: commit || "unknown",
    branch: branch || "unknown",
    provider,
  });
}
