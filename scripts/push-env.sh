#!/usr/bin/env bash
# Publish the app's runtime environment to SSM Parameter Store as a single
# SecureString at /bike-my-day/env, which bike-my-day-server reads on every
# start. Source of truth is .env.local, the same file used for the build.
#
# Run this whenever a secret changes, then `systemctl restart bike-my-day`
# (deploy.sh does that anyway). Values are never echoed.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION=eu-north-1
PARAM=/bike-my-day/env
SOURCE=${1:-.env.local}

[ -f "$SOURCE" ] || { echo "no $SOURCE — nothing to publish" >&2; exit 1; }

# Everything the server needs at runtime. The NEXT_PUBLIC_* pair is here too:
# those are inlined into the client bundle at build time, but the server reads
# them as well when it constructs a Supabase client per request.
BLOB=$(python3 - "$SOURCE" <<'PY'
import shlex, sys

WANTED = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ANTHROPIC_API_KEY",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT",
    "CRON_SECRET",
    "ADMIN_EMAIL",
]

found = {}
for line in open(sys.argv[1], encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, _, value = line.partition("=")
    key = key.strip()
    if key in WANTED:
        # .env files may or may not quote; strip one matched pair if present.
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        found[key] = value

# ADMIN_EMAIL is documented as optional; everything else is load-bearing and a
# server that boots without it fails later, in the dark, on a rider's morning.
missing = [k for k in WANTED if k != "ADMIN_EMAIL" and not found.get(k)]
if missing:
    sys.exit("missing from " + sys.argv[1] + ": " + ", ".join(missing))

print("\n".join(f"{k}={shlex.quote(found[k])}" for k in WANTED if k in found))
PY
)

aws ssm put-parameter --region "$REGION" --name "$PARAM" --type SecureString \
  --value "$BLOB" --overwrite --output text --query Version > /dev/null

# Report shape, never contents.
echo "$PARAM updated: $(printf '%s' "$BLOB" | grep -c .) keys, $(printf '%s' "$BLOB" | wc -c) bytes"
printf '%s\n' "$BLOB" | cut -d= -f1 | sed 's/^/  /'
