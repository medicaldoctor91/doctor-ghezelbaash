#!/usr/bin/env bash
set -euo pipefail

cat > "$HOME/user-config.py" <<'EOF'
family = 'wikipedia'
mylang = 'en'
usernames['wikipedia']['en'] = 'Medicaldoctor91'
EOF

pwb.py login
curl -fsSL 'https://raw.githubusercontent.com/medicaldoctor91/doctor-ghezelbaash/main/scripts/paws_enwiki_bipolar_coi_request.py' -o "$HOME/paws_enwiki_bipolar_coi_request.py"
python3 "$HOME/paws_enwiki_bipolar_coi_request.py"
