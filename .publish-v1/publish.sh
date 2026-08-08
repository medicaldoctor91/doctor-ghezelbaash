#!/usr/bin/env bash
set -euo pipefail

V5_COMMIT='35280ed0dafc7c32815afe22b597a0a4b08fa1f4'
V5_ZIP_PATH='doctor-ghezelbaash-max-power-source-v5-production-clean-2026-08-07 2.zip'
V5_TAR_SHA='c87d4f327a4f0f6230f72e21ded46b8c0fa465cb48235486384e3d14a39fe829'
PATCH_SHA='6da1ed618cff17d5fbe5de98122a73e7540dc71e88ae2d7b897ea319304b7ac7'
V1_TAR_SHA='5af601eef6a44adc2776b3a82255213bd8e283b356c15ceb0b5122b1c6f1a0d2'
V1_ZIP_SHA='aadc1c5ce0cb97298026250bf08041b059e05d7eda18d691746d846ac96a2d79'
EXPECTED_FILES=243
STAGING='publish-v1-exact-2026-08-08'

command -v zstd >/dev/null
command -v unzip >/dev/null
command -v python >/dev/null

git fetch origin "${STAGING}:refs/remotes/origin/${STAGING}"
rm -rf /tmp/v5-unzip /tmp/v5-src /tmp/v1-src /tmp/v5.zip /tmp/v5.det.tar /tmp/v1.det.tar /tmp/v1.patch.zst /tmp/v1.zip /tmp/v1.index
mkdir -p /tmp/v5-unzip /tmp/v5-src /tmp/v1-src

git show "${V5_COMMIT}:${V5_ZIP_PATH}" > /tmp/v5.zip
echo "Historical container ZIP SHA-256: $(sha256sum /tmp/v5.zip | awk '{print $1}')"
unzip -q /tmp/v5.zip -d /tmp/v5-unzip
mapfile -t PACKAGE_ENTRIES < <(unzip -Z1 /tmp/v5.zip | grep -E '(^|/)package\.json$' | grep -v '^__MACOSX/' || true)
printf 'Candidate package roots: %s\n' "${PACKAGE_ENTRIES[*]:-none}"
test "${#PACKAGE_ENTRIES[@]}" -eq 1
PACKAGE_ENTRY="${PACKAGE_ENTRIES[0]}"
if [[ "$PACKAGE_ENTRY" == 'package.json' ]]; then
  SOURCE_ROOT='/tmp/v5-unzip'
else
  SOURCE_ROOT="/tmp/v5-unzip/${PACKAGE_ENTRY%/package.json}"
fi
test -d "$SOURCE_ROOT"
RAW_COUNT="$(find "$SOURCE_ROOT" -type f | wc -l)"
echo "Historical source-root raw file count: $RAW_COUNT"
find "$SOURCE_ROOT" -type f \( -name '.DS_Store' -o -name '._*' \) -print | sed 's#^#Removing macOS metadata: #' || true
find "$SOURCE_ROOT" -type f \( -name '.DS_Store' -o -name '._*' \) -delete
CLEAN_COUNT="$(find "$SOURCE_ROOT" -type f | wc -l)"
echo "Historical source-root canonical file count: $CLEAN_COUNT"
test "$CLEAN_COUNT" -eq "${EXPECTED_FILES}"
cp -a "$SOURCE_ROOT/." /tmp/v5-src/
test "$(find /tmp/v5-src -type f | wc -l)" -eq "${EXPECTED_FILES}"

(
  cd /tmp/v5-src
  find . -type f -print0 | LC_ALL=C sort -z | \
    tar --sort=name --mtime='UTC 2026-08-08 00:00:00' --owner=0 --group=0 --numeric-owner --format=gnu \
        --null --no-recursion -T - -cf /tmp/v5.det.tar
)
echo "${V5_TAR_SHA}  /tmp/v5.det.tar" | sha256sum -c -

for part in 00 01 02 03; do
  git show "origin/${STAGING}:.publish-v1/patch.part${part}"
done | base64 -d > /tmp/v1.patch.zst
echo "${PATCH_SHA}  /tmp/v1.patch.zst" | sha256sum -c -
zstd -d --patch-from=/tmp/v5.det.tar /tmp/v1.patch.zst -o /tmp/v1.det.tar
echo "${V1_TAR_SHA}  /tmp/v1.det.tar" | sha256sum -c -
tar -xf /tmp/v1.det.tar -C /tmp/v1-src
test "$(find /tmp/v1-src -type f | wc -l)" -eq "${EXPECTED_FILES}"

python - <<'PY'
from pathlib import Path
import zipfile
src = Path('/tmp/v1-src')
out = Path('/tmp/v1.zip')
with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9, strict_timestamps=True) as z:
    for p in sorted(x for x in src.rglob('*') if x.is_file()):
        rel = p.relative_to(src).as_posix()
        zi = zipfile.ZipInfo(rel, date_time=(2026, 8, 8, 0, 0, 0))
        zi.create_system = 3
        zi.external_attr = (0o100644 << 16)
        zi.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(zi, p.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
PY
echo "${V1_ZIP_SHA}  /tmp/v1.zip" | sha256sum -c -
unzip -tq /tmp/v1.zip

python - <<'PY'
import json
from pathlib import Path
root = Path('/tmp/v1-src')
assert json.loads((root/'package.json').read_text())['version'] == '1.0.0'
assert json.loads((root/'src/data/release.json').read_text())['release'] == '1.0.0'
assert not (root/'.publish-v1').exists()
assert not (root/'.github').exists()
PY

PARENT="$(git rev-parse HEAD)"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
GIT_INDEX_FILE=/tmp/v1.index GIT_WORK_TREE=/tmp/v1-src git read-tree --empty
GIT_INDEX_FILE=/tmp/v1.index GIT_WORK_TREE=/tmp/v1-src git add -A
TREE="$(GIT_INDEX_FILE=/tmp/v1.index git write-tree)"
COMMIT="$(printf '%s\n' 'Publish exact V1.0.0 production-clean source' | git commit-tree "$TREE" -p "$PARENT")"

REMOTE_TAG="$(git ls-remote --tags origin refs/tags/v1.0.0 | awk '{print $1}')"
if [[ -n "$REMOTE_TAG" ]]; then
  echo "Refusing to overwrite pre-existing v1.0.0 tag: $REMOTE_TAG" >&2
  exit 1
fi

git push origin "$COMMIT:refs/heads/main"
git tag -a v1.0.0 "$COMMIT" -m 'Saeed Ghezelbash production source V1.0.0 — exact verified release'
git push origin refs/tags/v1.0.0
git fetch origin main --tags
test "$(git rev-parse origin/main)" = "$COMMIT"
test "$(git rev-list -n1 v1.0.0)" = "$COMMIT"
test "$(git show -s --format=%T "$COMMIT")" = "$TREE"
test "$(git ls-tree -r --name-only "$COMMIT" | wc -l)" -eq "${EXPECTED_FILES}"
test "$(git show "$COMMIT:package.json" | python -c 'import json,sys; print(json.load(sys.stdin)["version"])')" = '1.0.0'
echo "Published exact V1.0.0 commit: $COMMIT"
echo "Verified source ZIP SHA-256: $V1_ZIP_SHA"
git push origin --delete "$STAGING"
