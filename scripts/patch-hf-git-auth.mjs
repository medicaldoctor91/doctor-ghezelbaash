import {readFile,writeFile} from 'node:fs/promises';

const file='.github/workflows/hugging-face-authority.yml';
let source=await readFile(file,'utf8');
const must=(condition,message)=>{if(!condition)throw new Error(message)};
const replaceOnce=(oldText,newText,label)=>{
  const count=source.split(oldText).length-1;
  must(count===1,`${label}: expected exactly one block, found ${count}`);
  source=source.replace(oldText,newText);
};

const askpassSetup=`          export HF_GIT_USERNAME="\${HF_REPO%%/*}"
          export GIT_TERMINAL_PROMPT=0
          export GIT_ASKPASS="$RUNNER_TEMP/hf-askpass.sh"
          cat > "$GIT_ASKPASS" <<'SH'
          #!/bin/sh
          case "$1" in
            *Username*) printf '%s\\n' "$HF_GIT_USERNAME" ;;
            *Password*) printf '%s\\n' "$HF_TOKEN" ;;
            *) exit 1 ;;
          esac
          SH
          chmod 700 "$GIT_ASKPASS"
          curl -fsS -H "Authorization: Bearer $HF_TOKEN" https://huggingface.co/api/whoami-v2 >/dev/null
`;

replaceOnce(
`          HF_AUTH="$(printf 'oauth2:%s' "$HF_TOKEN" | base64 -w0)"
          git -C .release/huggingface -c "http.https://huggingface.co/.extraheader=AUTHORIZATION: basic $HF_AUTH" push origin HEAD:main
          unset HF_AUTH
`,
`${askpassSetup}          git -C .release/huggingface push origin HEAD:main
          rm -f "$GIT_ASKPASS"
`,
'current Hugging Face publish auth'
);

replaceOnce(
`          HF_AUTH="$(printf 'oauth2:%s' "$HF_TOKEN" | base64 -w0)"
          git -C .release/huggingface -c "http.https://huggingface.co/.extraheader=AUTHORIZATION: basic $HF_AUTH" push origin HEAD:"$HF_BRANCH"
          unset HF_AUTH
`,
`${askpassSetup}          git -C .release/huggingface push origin HEAD:"$HF_BRANCH"
          rm -f "$GIT_ASKPASS"
`,
'Hugging Face candidate push auth'
);

replaceOnce(
`          HF_AUTH="$(printf 'oauth2:%s' "$HF_TOKEN" | base64 -w0)"
          git -C .release/huggingface -c "http.https://huggingface.co/.extraheader=AUTHORIZATION: basic $HF_AUTH" push origin HEAD:main
          if git -C .release/huggingface ls-remote --exit-code --tags origin "refs/tags/v$RELEASE_TARGET" >/dev/null 2>&1; then
            test "$(git -C .release/huggingface ls-remote origin "refs/tags/v$RELEASE_TARGET^{}" | awk '{print $1}')" = "$HF_CANDIDATE_SHA" || \\
              test "$(git -C .release/huggingface ls-remote origin "refs/tags/v$RELEASE_TARGET" | awk '{print $1}')" = "$HF_CANDIDATE_SHA"
          else
            git -C .release/huggingface tag -a "v$RELEASE_TARGET" -m "Dr. Saeed Ghezelbash Public Knowledge Graph v$RELEASE_TARGET"
            git -C .release/huggingface -c "http.https://huggingface.co/.extraheader=AUTHORIZATION: basic $HF_AUTH" push origin "refs/tags/v$RELEASE_TARGET"
          fi
          unset HF_AUTH
`,
`${askpassSetup}          git -C .release/huggingface push origin HEAD:main
          if git -C .release/huggingface ls-remote --exit-code --tags origin "refs/tags/v$RELEASE_TARGET" >/dev/null 2>&1; then
            test "$(git -C .release/huggingface ls-remote origin "refs/tags/v$RELEASE_TARGET^{}" | awk '{print $1}')" = "$HF_CANDIDATE_SHA" || \\
              test "$(git -C .release/huggingface ls-remote origin "refs/tags/v$RELEASE_TARGET" | awk '{print $1}')" = "$HF_CANDIDATE_SHA"
          else
            git -C .release/huggingface tag -a "v$RELEASE_TARGET" -m "Dr. Saeed Ghezelbash Public Knowledge Graph v$RELEASE_TARGET"
            git -C .release/huggingface push origin "refs/tags/v$RELEASE_TARGET"
          fi
          rm -f "$GIT_ASKPASS"
`,
'Hugging Face canonical promotion auth'
);

replaceOnce(
`          GITHUB_AUTH="$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)"
          HF_AUTH="$(printf 'oauth2:%s' "$HF_TOKEN" | base64 -w0)"
          git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $GITHUB_AUTH" push origin --delete "release/v$RELEASE_TARGET" || true
          git -C .release/huggingface -c "http.https://huggingface.co/.extraheader=AUTHORIZATION: basic $HF_AUTH" push origin --delete "release/v$RELEASE_TARGET" || true
          unset GITHUB_AUTH HF_AUTH
`,
`          GITHUB_AUTH="$(printf 'x-access-token:%s' "$GITHUB_TOKEN" | base64 -w0)"
${askpassSetup}          git -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $GITHUB_AUTH" push origin --delete "release/v$RELEASE_TARGET" || true
          git -C .release/huggingface push origin --delete "release/v$RELEASE_TARGET" || true
          rm -f "$GIT_ASKPASS"
          unset GITHUB_AUTH
`,
'Hugging Face cleanup auth'
);

must(!source.includes('HF_AUTH='),'legacy Hugging Face auth variable remains');
must(!source.includes('AUTHORIZATION: basic $HF_AUTH'),'legacy Hugging Face basic extraheader remains');
await writeFile(file,source);
console.log(JSON.stringify({patched:file,auth:'GIT_ASKPASS',tokenPreflight:'whoami-v2',legacyBasicHeader:false},null,2));
