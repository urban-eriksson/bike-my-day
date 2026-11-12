#!/usr/bin/env bash
# Publish the API's secrets to SSM Parameter Store as one SecureString at
# /bike-my-day/env, which provision.sh writes to /etc/bike-my-day/api.env on
# every deploy. Values are never echoed.
#
# Source: .env.local at the repo root, with the names Vercel used, so the keys
# can be pasted straight from the Vercel dashboard:
#   NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, ANTHROPIC_API_KEY
# The VAPID pair must be the one the phones subscribed with: never generate a new one.
#
# BMD_SECRET (signs login tokens) is generated on first run and then kept
# from the existing parameter; changing it only signs everybody out.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION=eu-north-1
PARAM=/bike-my-day/env
SOURCE=${1:-.env.local}
[ -f "$SOURCE" ] || { echo "no $SOURCE — nothing to publish" >&2; exit 1; }

EXISTING=$(aws ssm get-parameter --region "$REGION" --name "$PARAM" --with-decryption \
  --query Parameter.Value --output text 2>/dev/null || true)

BLOB=$(EXISTING="$EXISTING" python3 - "$SOURCE" <<'PY'
import os, secrets, shlex, sys

RENAMES = {
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY": "BMD_VAPID_PUBLIC",
    "VAPID_PRIVATE_KEY": "BMD_VAPID_PRIVATE",
    "VAPID_SUBJECT": "BMD_VAPID_SUBJECT",
    "ANTHROPIC_API_KEY": "ANTHROPIC_API_KEY",
}

def parse(lines):
    out = {}
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        out[key.strip()] = value
    return out

source = parse(open(sys.argv[1], encoding="utf-8"))
existing = parse(os.environ.get("EXISTING", "").splitlines())

found = {new: source[old] for old, new in RENAMES.items() if source.get(old)}
missing = [old for old, new in RENAMES.items() if new not in found and old != "VAPID_SUBJECT"]
if missing:
    sys.exit("missing from " + sys.argv[1] + ": " + ", ".join(missing))

if existing.get("BMD_VAPID_PRIVATE") and existing["BMD_VAPID_PRIVATE"] != found["BMD_VAPID_PRIVATE"]:
    sys.exit("refusing: this would replace the VAPID key already in " + "/bike-my-day/env"
             + " and silently end every phone's push subscription")

found["BMD_SECRET"] = existing.get("BMD_SECRET") or secrets.token_urlsafe(48)
print("\n".join(f"{k}={shlex.quote(v)}" for k, v in sorted(found.items())))
PY
)

aws ssm put-parameter --region "$REGION" --name "$PARAM" --type SecureString \
  --value "$BLOB" --overwrite --output text --query Version > /dev/null

# Report shape, never contents.
echo "$PARAM updated: $(printf '%s' "$BLOB" | grep -c .) keys"
printf '%s\n' "$BLOB" | cut -d= -f1 | sed 's/^/  /'
