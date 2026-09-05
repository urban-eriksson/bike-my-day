#!/usr/bin/env bash
# Build bike-my-day locally and deploy it to the shared korist.se box via
# S3 + SSM (no SSH). Requires the BikeMyDay stack to be deployed first and
# scripts/push-env.sh to have been run at least once.
#
# The build happens HERE, never on the box: `next build` wants about a gigabyte
# and the box has ~490 MB free shared with snicksnack and isabelle. What ships
# is the standalone trace — ~15 MB compressed, ~49 MB unpacked — which needs no
# npm install on the far end.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION=eu-north-1
STACK=BikeMyDay
DOMAIN=bike-my-day.korist.se
ORIGIN_DOMAIN=origin.bike-my-day.korist.se

out() {
  aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET=$(out OutDeployBucket)
INSTANCE=$(out OutInstanceId)

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so the
# build needs the real ones. A bundle built without them fails in the browser,
# not here, which is the worst place to find out. `next build` loads .env.local
# itself, so this only has to check that it is there.
[ -f .env.local ] || { echo "no .env.local — the client bundle needs the NEXT_PUBLIC_* values at build time" >&2; exit 1; }

echo "building"
npm run build

echo "packaging -> s3://$BUCKET/release.tgz"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/pkg"
cp -a .next/standalone/. "$TMP/pkg/"
# server.js serves these two itself, but standalone does not copy them: they are
# assumed to be behind a CDN. There is no CDN here, so they have to come along.
cp -a .next/static "$TMP/pkg/.next/static"
cp -a public "$TMP/pkg/public"
cp scripts/provision-app.sh "$TMP/pkg/provision-app.sh"
tar -czf "$TMP/release.tgz" -C "$TMP/pkg" .
echo "  $(du -h "$TMP/release.tgz" | cut -f1) compressed, $(du -sh "$TMP/pkg" | cut -f1) unpacked"
aws s3 cp --only-show-errors "$TMP/release.tgz" "s3://$BUCKET/release.tgz"

echo "deploying on $INSTANCE"
# Built as JSON rather than hand-quoted into the CLI: this list contains the
# rollback path, and a quoting slip there is a slip in the thing that is meant
# to save us.
PARAMS=$(python3 - "$BUCKET" "$DOMAIN" "$ORIGIN_DOMAIN" <<'PY'
import json, sys
bucket, domain, origin = sys.argv[1:4]
root = "/opt/bike-my-day"
commands = [
    "set -eux",
    f"aws s3 cp s3://{bucket}/release.tgz /tmp/bike-my-day-release.tgz",
    f"rm -rf {root}/app.new && mkdir -p {root}/app.new",
    f"tar -xzf /tmp/bike-my-day-release.tgz -C {root}/app.new",
    f"bash {root}/app.new/provision-app.sh {domain} {origin}",
    # Keep exactly one previous release. Two would be a backup policy; the
    # deploy bucket is versioned for anything older than that.
    f"rm -rf {root}/app.prev",
    f"if [ -d {root}/app ]; then mv {root}/app {root}/app.prev; fi",
    f"mv {root}/app.new {root}/app",
    f"chown -R bike-my-day:bike-my-day {root}/app",
    "systemctl restart bike-my-day",
    # Roll back on a failed health check rather than leaving a dead site up.
    # Twenty tries at 3s covers a cold start with plenty of room; the box has
    # been serving the old release the whole time, so patience costs nothing.
    "for i in $(seq 1 20); do sleep 3; "
    "if curl -sf http://127.0.0.1:3000/api/health; then echo; echo healthy; exit 0; fi; done; "
    "echo 'health check failed, rolling back'; "
    f"if [ -d {root}/app.prev ]; then rm -rf {root}/app.bad && mv {root}/app {root}/app.bad && "
    f"mv {root}/app.prev {root}/app && systemctl restart bike-my-day && "
    "echo 'rolled back to previous release'; else echo 'no previous release to roll back to'; fi; "
    "exit 1",
]
print(json.dumps({"commands": commands}))
PY
)
CMD_ID=$(aws ssm send-command --region "$REGION" \
  --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript \
  --comment "bike-my-day deploy" \
  --parameters "$PARAMS" \
  --query 'Command.CommandId' --output text)

echo "waiting for SSM command $CMD_ID"
aws ssm wait command-executed --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE" || true
aws ssm get-command-invocation --region "$REGION" --command-id "$CMD_ID" --instance-id "$INSTANCE" \
  --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json |
  python3 -c "import json,sys; d=json.load(sys.stdin); print('status:', d['status']); print(d['stdout'][-3000:]); print(d['stderr'][-3000:], file=sys.stderr); sys.exit(0 if d['status']=='Success' else 1)"

echo
echo "origin:     https://$ORIGIN_DOMAIN/api/health"
echo "production: https://$DOMAIN/"
