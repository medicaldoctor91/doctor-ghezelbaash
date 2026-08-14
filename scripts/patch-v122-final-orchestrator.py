from pathlib import Path

p = Path('.github/workflows/ceiling-release.yml')
s = p.read_text(encoding='utf-8')


def once(old: str, new: str, label: str) -> None:
    global s
    n = s.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {n}')
    s = s.replace(old, new, 1)


def region(start_marker: str, end_marker: str, replacement: str, label: str) -> None:
    global s
    a = s.find(start_marker)
    b = s.find(end_marker)
    if a < 0 or b < 0 or b <= a:
        raise SystemExit(f'{label}: region markers not found or inverted')
    s = s[:a] + replacement + s[b:]


once('    timeout-minutes: 120', '    timeout-minutes: 180', 'timeout')

once(
    r'''          persist-credentials: true
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
''',
    r'''          persist-credentials: true
      - name: Synchronize to the candidate tip that contains this trigger main commit
        shell: bash
        run: |
          set -euo pipefail
          if [ "$GITHUB_EVENT_NAME" = push ]; then
            for attempt in $(seq 1 120); do
              git fetch origin main "$CANDIDATE_BRANCH"
              if git merge-base --is-ancestor "$GITHUB_SHA" "origin/$CANDIDATE_BRANCH"; then
                git reset --hard "origin/$CANDIDATE_BRANCH"
                main_req=$(git show "$GITHUB_SHA:.release/release-request-v1.2.2.json")
                candidate_req=$(cat .release/release-request-v1.2.2.json)
                test "$main_req" = "$candidate_req"
                echo "CANDIDATE_TRIGGER_ANCESTRY_PASS trigger=$GITHUB_SHA candidate=$(git rev-parse HEAD) attempt=$attempt"
                exit 0
              fi
              sleep 2
            done
            echo "Candidate never incorporated trigger main commit $GITHUB_SHA" >&2
            exit 1
          fi
          git fetch origin "$CANDIDATE_BRANCH"
          git reset --hard "origin/$CANDIDATE_BRANCH"
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020
''',
    'candidate trigger synchronization',
)

once(
    r'''          npm run prepare:generated
          node scripts/lock-release-rdf-invariants.mjs
          export SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" CF_PAGES_COMMIT_SHA="$(git rev-parse HEAD)"
          npm run build
          node scripts/lock-visible-contract.mjs dist/index.html
          rm -f .github/workflows/v122-bootstrap-registries.yml .github/workflows/v122-support-migration.yml .github/workflows/v122-cloudflare-control-bootstrap.yml .github/workflows/v122-external-preflight.yml .github/workflows/v122-zenodo-github-integration-probe.yml .github/workflows/v122-performance-baseline.yml scripts/bootstrap-v122-registries.mjs scripts/v122-filter-support.mjs
          git add -A
          git commit -m 'Release candidate v1.2.2 — DOI-bound maximum integrated stack'
          C=$(git rev-parse HEAD); echo "SOURCE_COMMIT=$C" >> "$GITHUB_ENV"
          git push origin HEAD:$CANDIDATE_BRANCH
''',
    r'''          npm run prepare:generated
          node scripts/lock-release-rdf-invariants.mjs
          export SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" CF_PAGES_COMMIT_SHA="$(git rev-parse HEAD)"
          npm run build
          node scripts/lock-visible-contract.mjs dist/index.html
          rm -f .github/workflows/v122-bootstrap-registries.yml .github/workflows/v122-support-migration.yml .github/workflows/v122-cloudflare-control-bootstrap.yml .github/workflows/v122-external-preflight.yml .github/workflows/v122-zenodo-github-integration-probe.yml .github/workflows/v122-performance-baseline.yml scripts/bootstrap-v122-registries.mjs scripts/v122-filter-support.mjs
          mapfile -t changed < <(git status --porcelain=v1 --untracked-files=all | sed -E 's/^.. //' | sed -E 's/.* -> //' | sort)
          allowed=(
            CITATION.cff README.md codemeta.json package-lock.json package.json
            public/favicon.svg public/media/brand/doctor-ghezelbaash-symbol.3a9e7509912d.svg public/safari-pinned-tab.svg
            src/content-source/100-rc099.html src/data/evidence-registry.json src/data/evidence-snapshot.json
            src/data/release-invariants.json src/data/release.json src/data/semantic/knowledge-graph.jsonld
            src/data/templates/main-head.html src/data/visible-contract.json src/data/volatile-facts.json
            .github/workflows/v122-bootstrap-registries.yml .github/workflows/v122-support-migration.yml
            .github/workflows/v122-cloudflare-control-bootstrap.yml .github/workflows/v122-external-preflight.yml
            .github/workflows/v122-zenodo-github-integration-probe.yml .github/workflows/v122-performance-baseline.yml
            scripts/bootstrap-v122-registries.mjs scripts/v122-filter-support.mjs
          )
          for path in "${changed[@]}"; do
            ok=false
            for expected in "${allowed[@]}"; do [ "$path" = "$expected" ] && ok=true && break; done
            if [ "$ok" != true ]; then echo "Unexpected candidate-freeze mutation: $path" >&2; exit 1; fi
          done
          if ((${#changed[@]})); then
            git add -A
            git diff --cached --check
            git commit -m 'Release candidate v1.2.2 — DOI-bound maximum integrated stack'
          else
            echo 'CANDIDATE_FREEZE_IDEMPOTENT_NOOP'
          fi
          C=$(git rev-parse HEAD); echo "SOURCE_COMMIT=$C" >> "$GITHUB_ENV"
          git push origin HEAD:$CANDIDATE_BRANCH
''',
    'candidate freeze',
)

once(
    r'''          export SOURCE_DATE_EPOCH="$(git show -s --format=%ct $SOURCE_COMMIT)" CF_PAGES_COMMIT_SHA="$SOURCE_COMMIT" SOURCE_COMMIT="$SOURCE_COMMIT"
          npm run release
          node scripts/validate-visible-freeze.mjs dist/index.html
          python - <<'PY'
          import hashlib,json,pathlib
          root=pathlib.Path('dist'); out={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}
          pathlib.Path('/tmp/dist-a.json').write_text(json.dumps(out,sort_keys=True))
          PY
          rm -rf /tmp/v122-repro
          git worktree add --detach /tmp/v122-repro "$SOURCE_COMMIT"
          (cd /tmp/v122-repro && npm ci --ignore-scripts && export SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" CF_PAGES_COMMIT_SHA="$SOURCE_COMMIT" SOURCE_COMMIT="$SOURCE_COMMIT" && npm run build && python - <<'PY'
          import hashlib,json,pathlib
          root=pathlib.Path('dist'); out={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}
          pathlib.Path('/tmp/dist-b.json').write_text(json.dumps(out,sort_keys=True))
          PY
          )
          cmp /tmp/dist-a.json /tmp/dist-b.json
          git worktree remove --force /tmp/v122-repro
          mkdir -p .release/runtime
          cp /tmp/dist-a.json .release/runtime/dist-sha256.json
          SOURCE_COMMIT="$SOURCE_COMMIT" node scripts/write-release-attestation.mjs
''',
    r'''          export SOURCE_DATE_EPOCH="$(git show -s --format=%ct $SOURCE_COMMIT)" CF_PAGES_COMMIT_SHA="$SOURCE_COMMIT" SOURCE_COMMIT="$SOURCE_COMMIT"
          npm run release
          node scripts/validate-visible-freeze.mjs dist/index.html
          python - <<'PY'
          import hashlib,json,pathlib
          root=pathlib.Path('dist'); out={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}
          pathlib.Path('/tmp/dist-a.json').write_text(json.dumps(out,sort_keys=True))
          rel=pathlib.Path('release'); z={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(rel.glob('*.zip'))}
          pathlib.Path('/tmp/zips-a.json').write_text(json.dumps(z,sort_keys=True))
          PY
          rm -rf /tmp/v122-repro
          git worktree add --detach /tmp/v122-repro "$SOURCE_COMMIT"
          (cd /tmp/v122-repro && npm ci --ignore-scripts && unset SOURCE_DATE_EPOCH SOURCE_COMMIT GITHUB_SHA || true && export CF_PAGES_COMMIT_SHA="$SOURCE_COMMIT" && mkdir -p .release/runtime .release/huggingface && printf 'native-runtime-noise\n' > .release/runtime/repro-noise.txt && printf 'native-hf-noise\n' > .release/huggingface/repro-noise.txt && npm run release && node scripts/validate-visible-freeze.mjs dist/index.html && python - <<'PY'
          import hashlib,json,pathlib
          root=pathlib.Path('dist'); out={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()}
          pathlib.Path('/tmp/dist-b.json').write_text(json.dumps(out,sort_keys=True))
          rel=pathlib.Path('release'); z={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(rel.glob('*.zip'))}
          pathlib.Path('/tmp/zips-b.json').write_text(json.dumps(z,sort_keys=True))
          PY
          )
          cmp /tmp/dist-a.json /tmp/dist-b.json
          cmp /tmp/zips-a.json /tmp/zips-b.json
          git worktree remove --force /tmp/v122-repro
          mkdir -p .release/runtime
          cp /tmp/dist-a.json .release/runtime/dist-sha256.json
          SOURCE_COMMIT="$SOURCE_COMMIT" node scripts/write-release-attestation.mjs
          echo "CANDIDATE_NATIVE_GIT_REPRODUCIBILITY_PASS commit=$SOURCE_COMMIT"
''',
    'native reproducibility',
)

once(
    r'''          VERIFY_BASE_URL="$PREVIEW_URL" node scripts/verify-cloudflare-pages-deployment.mjs
          node scripts/validate-visible-freeze.mjs dist/index.html
''',
    r'''          VERIFY_BASE_URL="$PREVIEW_URL" node scripts/verify-cloudflare-pages-deployment.mjs
          VERIFY_BASE_URL='https://staging-deploy.doctor-ghezelbaash.pages.dev/' node scripts/verify-cloudflare-pages-deployment.mjs
          root_location=$(curl --silent --show-error --max-redirs 0 -D - -o /dev/null https://doctor-ghezelbaash.pages.dev/ | tr -d '\r' | awk 'BEGIN{IGNORECASE=1}/^location:/{sub(/^[^:]+:[[:space:]]*/,"");print;exit}')
          test "$root_location" = 'https://www.ghezelbaash.ir/'
          for base in "$PREVIEW_URL" 'https://staging-deploy.doctor-ghezelbaash.pages.dev/'; do
            xr=$(curl --silent --show-error --max-redirs 0 -D - -o /dev/null "$base" | tr -d '\r' | awk 'BEGIN{IGNORECASE=1}/^x-robots-tag:/{sub(/^[^:]+:[[:space:]]*/,"");print;exit}')
            echo "$xr" | grep -Eiq 'noindex'
          done
          node scripts/validate-visible-freeze.mjs dist/index.html
''',
    'preview proof',
)

region(
    '      - name: Lighthouse performance ceiling gate on live baseline versus Candidate Preview\n',
    '      - name: Final irreversible publication gate\n',
    r'''      - name: Six-viewport Lighthouse performance and layout regression gate
        shell: bash
        run: |
          set -euo pipefail
          mkdir -p /tmp/lh
          for spec in '360:800:mobile:2:85' '390:844:mobile:2:85' '430:932:mobile:2:85' '768:1024:desktop:1:90' '1024:900:desktop:1:95' '1440:900:desktop:1:95'; do
            IFS=: read -r width height form dpr minimum <<<"$spec"
            common=(--quiet --only-categories=performance --output=json --chrome-flags='--headless --no-sandbox --disable-gpu' --screenEmulation.width="$width" --screenEmulation.height="$height" --screenEmulation.deviceScaleFactor="$dpr")
            if [ "$form" = mobile ]; then common+=(--form-factor=mobile --screenEmulation.mobile=true); else common+=(--preset=desktop --screenEmulation.mobile=false); fi
            npx --yes lighthouse@13.4.1 "https://www.ghezelbaash.ir/?__lh_release=${width}_$(date +%s%N)" "${common[@]}" --output-path="/tmp/lh/base-$width.json"
            npx --yes lighthouse@13.4.1 "${PREVIEW_URL}?__lh_candidate=${width}_$(date +%s%N)" "${common[@]}" --output-path="/tmp/lh/candidate-$width.json"
            node - "$width" "$minimum" <<'NODE'
          const fs=require('fs'),[width,min]=process.argv.slice(2);const b=JSON.parse(fs.readFileSync('/tmp/lh/base-'+width+'.json')),c=JSON.parse(fs.readFileSync('/tmp/lh/candidate-'+width+'.json'));const score=x=>Math.round(x.categories.performance.score*100),metric=(x,k)=>x.audits[k].numericValue;const out={width:Number(width),minimum:Number(min),baseline:score(b),candidate:score(c),baselineLcp:metric(b,'largest-contentful-paint'),candidateLcp:metric(c,'largest-contentful-paint'),baselineCls:metric(b,'cumulative-layout-shift'),candidateCls:metric(c,'cumulative-layout-shift'),baselineTbt:metric(b,'total-blocking-time'),candidateTbt:metric(c,'total-blocking-time')};console.log('LIGHTHOUSE_VIEWPORT_GATE',JSON.stringify(out));if(out.candidate<out.baseline-3)throw Error(width+' performance regressed >3 points');if(out.candidate<out.minimum)throw Error(width+' performance below minimum '+min);if(out.candidateCls>0.1||out.candidateCls>out.baselineCls+0.03)throw Error(width+' CLS regression');if(out.candidateLcp>Math.max(4000,out.baselineLcp*1.15))throw Error(width+' LCP regression');
          NODE
          done
''',
    'six viewport performance',
)

once(
    '          npm run validate:reproducibility\n          node scripts/validate-dist.mjs\n',
    '          npm run validate:reproducibility\n          npm run validate:rdf-reproducibility\n          node scripts/validate-dist.mjs\n',
    'irreversible RDF proof',
)

region(
    '      - name: Publish immutable Git tag and fast-forward default source branch to Candidate C\n',
    '      - name: Cooldown verification against ordinary and cache-busted public resources\n',
    r'''      - name: Publish immutable Git tag v1.2.2 pointing exactly to Candidate C
        shell: bash
        run: |
          set -euo pipefail
          if git rev-parse -q --verify refs/tags/v1.2.2 >/dev/null; then
            test "$(git rev-list -n1 v1.2.2)" = "$SOURCE_COMMIT"
          else
            git tag -a v1.2.2 "$SOURCE_COMMIT" -m 'Dr. Saeed Ghezelbash entity stack v1.2.2 — exact DOI-bound release'
            git push origin refs/tags/v1.2.2
          fi
      - name: Publish GitHub Release targeting exact C with attestation and SHA inventory
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          set -euo pipefail
          REC=$(node -p "require('./src/data/release.json').dataset.zenodo.recordId")
          DOI=$(node -p "require('./src/data/release.json').dataset.zenodo.versionDoi")
          cat > /tmp/release-notes.md <<EOF
          # Dr. Saeed Ghezelbash Public Knowledge Graph v1.2.2

          - Exact Candidate C: `$SOURCE_COMMIT`
          - Canonical Dataset IRI: `https://www.ghezelbaash.ir/graph.jsonld#dataset`
          - Canonical site: `https://www.ghezelbaash.ir/`
          - Person: `Q140287622`
          - Clinic: `Q140288589`
          - Dataset: `Q140304972`
          - Zenodo Concept DOI: `10.5281/zenodo.18765168`
          - Zenodo Version DOI: `$DOI`
          - Zenodo record: `$REC`
          - Hugging Face release commit/tag: `$HF_RELEASE_SHA / v1.2.2`
          - Release attestation asset: `release-attestation-v1.2.2.json`
          - SHA-256 inventory asset: `dist-sha256-v1.2.2.json`
          EOF
          if gh release view v1.2.2 >/dev/null 2>&1; then
            gh release view v1.2.2 --json isDraft,tagName > /tmp/gh-before.json
            node -e "const r=require('/tmp/gh-before.json');if(r.tagName!=='v1.2.2'||r.isDraft!==true)throw Error('Unexpected pre-existing GitHub Release state')"
          else
            gh release create v1.2.2 --target "$SOURCE_COMMIT" --title 'Dr. Saeed Ghezelbash Public Knowledge Graph v1.2.2' --notes-file /tmp/release-notes.md --draft
          fi
          cp .release/runtime/release-attestation.json /tmp/release-attestation-v1.2.2.json
          cp .release/runtime/dist-sha256.json /tmp/dist-sha256-v1.2.2.json
          gh release upload v1.2.2 /tmp/release-attestation-v1.2.2.json /tmp/dist-sha256-v1.2.2.json --clobber
          gh release edit v1.2.2 --notes-file /tmp/release-notes.md --draft=false --latest
          gh release view v1.2.2 --json isDraft,tagName,url > /tmp/gh-after.json
          node -e "const r=require('/tmp/gh-after.json');if(r.tagName!=='v1.2.2'||r.isDraft!==false)throw Error('GitHub Release publication drift');console.log('GITHUB_RELEASE_PUBLIC_PASS',r.url)"
          test "$(git rev-list -n1 v1.2.2)" = "$SOURCE_COMMIT"
          node scripts/update-release-control.mjs "$LEDGER" GITHUB_RELEASE_PUBLISHED sourceCommit=$SOURCE_COMMIT hfCommit=$HF_RELEASE_SHA
          git -C /tmp/v122-control add .release/control/v1.2.2.json && git -C /tmp/v122-control commit -m 'Publish GitHub v1.2.2 Release against exact C' && git -C /tmp/v122-control push origin HEAD:$CONTROL_BRANCH
      - name: Fast-forward default source branch to exact Candidate C after GitHub Release publication
        shell: bash
        run: |
          set -euo pipefail
          git fetch origin main
          git merge-base --is-ancestor origin/main "$SOURCE_COMMIT"
          git push origin "$SOURCE_COMMIT":main
          node scripts/update-release-control.mjs "$LEDGER" SOURCE_PUBLISHED sourceCommit=$SOURCE_COMMIT
          git -C /tmp/v122-control add .release/control/v1.2.2.json && git -C /tmp/v122-control commit -m 'Integrate exact v1.2.2 Candidate C into main' && git -C /tmp/v122-control push origin HEAD:$CONTROL_BRANCH
''',
    'Git tag / GitHub Release / main integration order',
)

p.write_text(s, encoding='utf-8')
print('V122_FINAL_ORCHESTRATOR_PATCH_PASS')
