from pathlib import Path

p=Path('.github/workflows/ceiling-release.yml')
s=p.read_text(encoding='utf-8')

marker='      - name: Final irreversible publication gate\n'
if s.count(marker)!=1:
    raise SystemExit(f'irreversible marker count={s.count(marker)}')
if 'Prepare non-public GitHub Release draft against exact Candidate C' in s:
    raise SystemExit('draft preflight already present')

draft_step=r'''      - name: Prepare non-public GitHub Release draft against exact Candidate C
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          set -euo pipefail
          test -z "$(git ls-remote --tags origin refs/tags/v1.2.2)"
          gh api "repos/$GITHUB_REPOSITORY/releases?per_page=100" > /tmp/releases-before.json
          RID=$(jq -r '[.[] | select(.tag_name=="v1.2.2")][0].id // empty' /tmp/releases-before.json)
          if [ -z "$RID" ]; then
            jq -n --arg target "$SOURCE_COMMIT" '{tag_name:"v1.2.2",target_commitish:$target,name:"Dr. Saeed Ghezelbash Public Knowledge Graph v1.2.2",body:"Pre-publication draft for the exact verified Candidate C. Assets and final notes are attached immediately before publication.",draft:true,prerelease:false,generate_release_notes:false}' > /tmp/release-draft-create.json
            gh api --method POST "repos/$GITHUB_REPOSITORY/releases" --input /tmp/release-draft-create.json > /tmp/release-draft.json
          else
            gh api "repos/$GITHUB_REPOSITORY/releases/$RID" > /tmp/release-draft.json
          fi
          RID=$(jq -r '.id' /tmp/release-draft.json)
          test "$(jq -r '.draft' /tmp/release-draft.json)" = true
          test "$(jq -r '.tag_name' /tmp/release-draft.json)" = v1.2.2
          test "$(jq -r '.target_commitish' /tmp/release-draft.json)" = "$SOURCE_COMMIT"
          test -z "$(git ls-remote --tags origin refs/tags/v1.2.2)"
          echo "GITHUB_RELEASE_DRAFT_ID=$RID" >> "$GITHUB_ENV"
          node scripts/update-release-control.mjs "$LEDGER" GITHUB_RELEASE_DRAFT_READY sourceCommit=$SOURCE_COMMIT githubReleaseDraftId=$RID
          git -C /tmp/v122-control add .release/control/v1.2.2.json && git -C /tmp/v122-control commit -m 'Prepare non-public GitHub v1.2.2 Release draft' && git -C /tmp/v122-control push origin HEAD:$CONTROL_BRANCH
          echo "GITHUB_RELEASE_DRAFT_READY_PASS id=$RID target=$SOURCE_COMMIT tag_created=false"
'''
s=s.replace(marker,draft_step+marker,1)

start='      - name: Publish GitHub Release targeting exact C with attestation and SHA inventory\n'
end='      - name: Fast-forward default source branch to exact Candidate C after GitHub Release publication\n'
a=s.find(start);b=s.find(end)
if a<0 or b<0 or b<=a:
    raise SystemExit('GitHub Release publication region not found')
new_publish=r'''      - name: Publish the pre-created GitHub Release against exact C with attestation and SHA inventory
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          set -euo pipefail
          REC=$(node -p "require('./src/data/release.json').dataset.zenodo.recordId")
          DOI=$(node -p "require('./src/data/release.json').dataset.zenodo.versionDoi")
          gh api "repos/$GITHUB_REPOSITORY/releases?per_page=100" > /tmp/releases-publish.json
          RID=$(jq -r '[.[] | select(.tag_name=="v1.2.2")][0].id // empty' /tmp/releases-publish.json)
          test -n "$RID"
          gh api "repos/$GITHUB_REPOSITORY/releases/$RID" > /tmp/release-before.json
          test "$(jq -r '.draft' /tmp/release-before.json)" = true
          test "$(jq -r '.target_commitish' /tmp/release-before.json)" = "$SOURCE_COMMIT"
          test "$(git rev-list -n1 v1.2.2)" = "$SOURCE_COMMIT"
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
          cp .release/runtime/release-attestation.json /tmp/release-attestation-v1.2.2.json
          cp .release/runtime/dist-sha256.json /tmp/dist-sha256-v1.2.2.json
          gh release upload v1.2.2 /tmp/release-attestation-v1.2.2.json /tmp/dist-sha256-v1.2.2.json --clobber
          jq -n --rawfile body /tmp/release-notes.md '{name:"Dr. Saeed Ghezelbash Public Knowledge Graph v1.2.2",body:$body,draft:false,prerelease:false,make_latest:"true"}' > /tmp/release-publish.json
          gh api --method PATCH "repos/$GITHUB_REPOSITORY/releases/$RID" --input /tmp/release-publish.json > /tmp/release-after.json
          test "$(jq -r '.draft' /tmp/release-after.json)" = false
          test "$(jq -r '.tag_name' /tmp/release-after.json)" = v1.2.2
          test "$(git rev-list -n1 v1.2.2)" = "$SOURCE_COMMIT"
          echo "GITHUB_RELEASE_PUBLIC_PASS $(jq -r '.html_url' /tmp/release-after.json)"
          node scripts/update-release-control.mjs "$LEDGER" GITHUB_RELEASE_PUBLISHED sourceCommit=$SOURCE_COMMIT hfCommit=$HF_RELEASE_SHA githubReleaseId=$RID
          git -C /tmp/v122-control add .release/control/v1.2.2.json && git -C /tmp/v122-control commit -m 'Publish GitHub v1.2.2 Release against exact C' && git -C /tmp/v122-control push origin HEAD:$CONTROL_BRANCH
'''
s=s[:a]+new_publish+s[b:]
p.write_text(s,encoding='utf-8')
print('V122_GITHUB_DRAFT_LIFECYCLE_PATCH_PASS')
