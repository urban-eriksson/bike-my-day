#!/usr/bin/env bash
# Package server/ + scripts/provision.sh and deploy to the shared dev box via
# S3 + SSM (no SSH). Requires the BikeMyDay stack and scripts/push-env.sh.
#
#   scripts/deploy-server.sh                    deploy; nightly run stays off
#   scripts/deploy-server.sh --enable-forecast  also enable the 04:00 run (cutover)
set -euo pipefail
cd "$(dirname "$0")/.."

ENABLE_FORECAST=no
[ "${1:-}" = "--enable-forecast" ] && ENABLE_FORECAST=yes

(cd server && uv run ruff check -q . && uv run pyright -q && uv run pytest -q)

out() {
  aws cloudformation describe-stacks --region eu-north-1 --stack-name BikeMyDay \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
BUCKET=$(out OutDeployBucket)
BACKUP_BUCKET=$(out OutBackupBucket)
INSTANCE=$(out OutInstanceId)
API_DOMAIN=api.bike-my-day.korist.se
WEB_DOMAIN=bike-my-day.korist.se

echo "packaging server -> s3://$BUCKET/server.tgz"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/pkg"
cp -r server/. "$TMP/pkg/"
cp scripts/provision.sh "$TMP/pkg/provision.sh"
tar -czf "$TMP/server.tgz" -C "$TMP/pkg" \
  --exclude .venv --exclude '*.db' --exclude __pycache__ --exclude .pytest_cache \
  --exclude .ruff_cache --exclude 'export*.json' .
aws s3 cp --only-show-errors "$TMP/server.tgz" "s3://$BUCKET/server.tgz"

echo "deploying on $INSTANCE (nightly run: $ENABLE_FORECAST)"
CMD_ID=$(aws ssm send-command --region eu-north-1 \
  --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript \
  --comment "bike-my-day server deploy" \
  --parameters 'commands=[
    "set -eux",
    "aws s3 cp s3://'"$BUCKET"'/server.tgz /tmp/bike-my-day-server.tgz",
    "rm -rf /opt/bike-my-day/app.new && mkdir -p /opt/bike-my-day/app.new",
    "tar -xzf /tmp/bike-my-day-server.tgz -C /opt/bike-my-day/app.new",
    "bash /opt/bike-my-day/app.new/provision.sh '"$API_DOMAIN"' '"$WEB_DOMAIN"' '"$BACKUP_BUCKET"' '"$ENABLE_FORECAST"'",
    "rm -rf /opt/bike-my-day/app && mv /opt/bike-my-day/app.new /opt/bike-my-day/app",
    "chown -R bike-my-day:bike-my-day /opt/bike-my-day/app",
    "cd /opt/bike-my-day/app && sudo -u bike-my-day /usr/local/bin/uv sync --frozen --no-dev",
    "systemctl restart bike-my-day-api",
    "for i in $(seq 1 20); do sleep 3; curl -sf http://127.0.0.1:8004/api/health && exit 0; done; echo health check failed; exit 1"
  ]' \
  --query 'Command.CommandId' --output text)

echo "waiting for SSM command $CMD_ID"
aws ssm wait command-executed --region eu-north-1 --command-id "$CMD_ID" --instance-id "$INSTANCE" || true
aws ssm get-command-invocation --region eu-north-1 --command-id "$CMD_ID" --instance-id "$INSTANCE" \
  --query '{status:Status,stdout:StandardOutputContent,stderr:StandardErrorContent}' --output json |
  python3 -c "import json,sys; d=json.load(sys.stdin); print('status:', d['status']); print(d['stdout'][-3000:]); print(d['stderr'][-3000:], file=sys.stderr); sys.exit(0 if d['status']=='Success' else 1)"
