import fs from 'node:fs';

const path = '.github/workflows/ceiling-release.yml';
let s = fs.readFileSync(path, 'utf8');

const oldFreeze = `          rm -f .github/workflows/v122-bootstrap-registries.yml .github/workflows/v122-support-migration.yml .github/workflows/v122-cloudflare-control-bootstrap.yml .github/workflows/v122-external-preflight.yml .github/workflows/v122-zenodo-github-integration-probe.yml .github/workflows/v122-performance-baseline.yml scripts/bootstrap-v122-registries.mjs scripts/v122-filter-support.mjs
          git add -A
          git commit -m 'Release candidate v1.2.2 — DOI-bound maximum integrated stack'
          C=$(git rev-parse HEAD); echo "SOURCE_COMMIT=$C" >> "$GITHUB_ENV"
`;
const newFreeze = `          rm -f .github/workflows/v122-bootstrap-registries.yml .github/workflows/v122-support-migration.yml .github/workflows/v122-cloudflare-control-bootstrap.yml .github/workflows/v122-external-preflight.yml .github/workflows/v122-zenodo-github-integration-probe.yml .github/workflows/v122-performance-baseline.yml scripts/bootstrap-v122-registries.mjs scripts/v122-filter-support.mjs
          mapfile -t changed < <(git status --porcelain=v1 | sed -E 's/^.. //' | sed -E 's/.* -> //' | sort)
          allowed=(
            CITATION.cff README.md codemeta.json package-lock.json package.json
            public/favicon.svg public/media/brand/doctor-ghezelbaash-symbol.3a9e7509912d.svg public/safari-pinned-tab.svg
            src/content-source/100-rc099.html src/data/evidence-registry.json src/data/evidence-snapshot.json
            src/data/release-invariants.json src/data/release.json src/data/semantic/knowledge-graph.jsonld
            src/data/templates/main-head.html src/data/visible-contract.json src/data/volatile-facts.json
          )
          for path in "\${changed[@]}"; do
            ok=false
            for expected in "\${allowed[@]}"; do [[ "$path" == "$expected" ]] && ok=true && break; done
            if [[ "$ok" != true ]]; then echo "Unexpected release-freeze mutation: $path" >&2; exit 1; fi
          done
          if ((\${#changed[@]} > 0)); then
            git add -A -- "\${allowed[@]}"
            git diff --cached --check
            git commit -m "Release candidate v$TARGET_VERSION — DOI-bound maximum integrated stack"
          else
            echo 'No promotion diff exists; reusing current candidate commit.'
          fi
          C=$(git rev-parse HEAD); echo "SOURCE_COMMIT=$C" >> "$GITHUB_ENV"
`;
if(!s.includes(oldFreeze)) throw new Error('Step 10 broad-freeze block not found');
s = s.replace(oldFreeze, newFreeze);

if(!s.includes("      - name: Create a non-triggering GitHub Release draft tied exactly to C\n")) {
  throw new Error('GitHub Release draft step not found');
}
s = s.replace(
  "      - name: Create a non-triggering GitHub Release draft tied exactly to C\n",
  "      - name: Create verified-target GitHub Release draft tied exactly to C\n"
);

const tail = `          node scripts/update-release-control.mjs "$LEDGER" VERIFIED sourceCommit=$SOURCE_COMMIT hfCommit=$HF_RELEASE_SHA
          git -C /tmp/v122-control add .release/control/v1.2.2.json && git -C /tmp/v122-control commit -m 'Verify v1.2.2 public serving and frozen snapshot truth' && git -C /tmp/v122-control push origin HEAD:$CONTROL_BRANCH
`;
const replacementTail = tail + `      - name: Publish verified GitHub Release and mark v1.2.2 COMPLETE
        env:
          GH_TOKEN: \${{ github.token }}
        shell: bash
        run: |
          set -euo pipefail
          gh release edit v1.2.2 --draft=false --latest
          gh release view v1.2.2 --json isDraft,tagName,targetCommitish,url >/tmp/github-release.json
          node - <<'NODE'
          const r=require('/tmp/github-release.json');
          if(r.isDraft!==false||r.tagName!=='v1.2.2') throw Error('GitHub Release publication drift');
          console.log('GITHUB_RELEASE_PUBLIC_PASS',r.url);
          NODE
          node scripts/update-release-control.mjs "$LEDGER" GITHUB_RELEASE_PUBLISHED sourceCommit=$SOURCE_COMMIT
          git -C /tmp/v122-control add .release/control/v1.2.2.json && git -C /tmp/v122-control commit -m 'Publish verified GitHub v1.2.2 Release' && git -C /tmp/v122-control push origin HEAD:$CONTROL_BRANCH
          node scripts/update-release-control.mjs "$LEDGER" COMPLETE sourceCommit=$SOURCE_COMMIT hfCommit=$HF_RELEASE_SHA
          git -C /tmp/v122-control add .release/control/v1.2.2.json && git -C /tmp/v122-control commit -m 'Complete v1.2.2 external convergence release' && git -C /tmp/v122-control push origin HEAD:$CONTROL_BRANCH
`;
if(!s.includes(tail)) throw new Error('Cooldown verification tail not found');
s = s.replace(tail, replacementTail);

fs.writeFileSync(path, s);
console.log('v1.2.2 release workflow patched: freeze guard + GitHub Release publication');
