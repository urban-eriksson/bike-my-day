#!/bin/bash
# Sets up the bike-my-day API on the shared dev box (KoristDev). Runs as root
# through deploy-server.sh on every deploy and is idempotent. It touches only
# its own files: never other apps' units, and it only appends its own Caddy
# site block.
#
# It also leaves the old Vercel-era trigger (bike-my-day-notify.timer,
# /etc/bike-my-day/settings) alone: the new nightly run is a separate unit,
# bike-my-day-forecast.timer, enabled only when asked. Both timers must never
# run at once (double notifications).
#
# Arguments: API_DOMAIN WEB_DOMAIN BACKUP_BUCKET ENABLE_FORECAST(yes|no)
set -euo pipefail
API_DOMAIN=$1
WEB_DOMAIN=$2
BACKUP_BUCKET=$3
ENABLE_FORECAST=${4:-no}
REGION=eu-north-1
PORT=8004

useradd -r -m -d /opt/bike-my-day bike-my-day || true
install -d -m 755 -o bike-my-day -g bike-my-day /opt/bike-my-day /var/lib/bike-my-day
install -d -m 755 /etc/bike-my-day

# Secrets come from SSM (scripts/push-env.sh). The VAPID pair in there is the
# one every phone subscribed with: it is never generated here, and a missing
# one stops the deploy rather than letting the API start without it.
ENV_NEW=$(mktemp)
aws ssm get-parameter --region "$REGION" --name /bike-my-day/env --with-decryption \
  --query Parameter.Value --output text > "$ENV_NEW"
for key in BMD_SECRET BMD_VAPID_PUBLIC BMD_VAPID_PRIVATE ANTHROPIC_API_KEY; do
  grep -q "^$key=." "$ENV_NEW" || { echo "/bike-my-day/env lacks $key" >&2; rm -f "$ENV_NEW"; exit 1; }
done
install -m 640 -o root -g bike-my-day "$ENV_NEW" /etc/bike-my-day/api.env
rm -f "$ENV_NEW"

cat > /etc/bike-my-day/api.settings <<EOF
BMD_DB=/var/lib/bike-my-day/bike-my-day.db
BMD_WEB_URL=https://$WEB_DOMAIN
BMD_MAIL_MODE=ses
BMD_MAIL_REGION=$REGION
EOF
chmod 644 /etc/bike-my-day/api.settings

# Caddy: our own site block, appended once; validate before reloading and put
# the shared file back untouched if it does not parse.
if ! grep -q "^$API_DOMAIN" /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
  cat >> /etc/caddy/Caddyfile <<EOF

$API_DOMAIN {
    reverse_proxy 127.0.0.1:$PORT
}
EOF
  if ! caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile; then
    mv /etc/caddy/Caddyfile.bak /etc/caddy/Caddyfile
    echo "Caddyfile did not validate; left untouched and did not reload" >&2
    exit 1
  fi
  systemctl reload caddy
fi

cat > /etc/systemd/system/bike-my-day-api.service <<EOF
[Unit]
Description=bike-my-day API
After=network.target

[Service]
User=bike-my-day
WorkingDirectory=/opt/bike-my-day/app
EnvironmentFile=/etc/bike-my-day/api.env
EnvironmentFile=/etc/bike-my-day/api.settings
ExecStart=/usr/local/bin/uv run --frozen --no-dev uvicorn bike_my_day.main:app --host 127.0.0.1 --port $PORT --proxy-headers
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/bike-my-day-forecast.service <<'EOF'
[Unit]
Description=Send bike-my-day forecasts for the coming day
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=bike-my-day
WorkingDirectory=/opt/bike-my-day/app
EnvironmentFile=/etc/bike-my-day/api.env
EnvironmentFile=/etc/bike-my-day/api.settings
ExecStart=/usr/local/bin/uv run --frozen --no-dev python -m bike_my_day.notify
EOF

# Persistent=true: if the box is down at 04:00 the run happens at boot rather
# than being lost.
cat > /etc/systemd/system/bike-my-day-forecast.timer <<'EOF'
[Unit]
Description=Nightly bike-my-day forecast run

[Timer]
OnCalendar=*-*-* 04:00:00 Europe/Stockholm
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /usr/local/bin/bike-my-day-backup <<SCRIPT
#!/bin/bash
set -euo pipefail
DB=/var/lib/bike-my-day/bike-my-day.db
[ -f "\$DB" ] || exit 0
STAMP=\$(date -u +%Y%m%dT%H%M%SZ)
TMP=\$(mktemp -d)
trap 'rm -rf "\$TMP"' EXIT
sqlite3 "\$DB" ".backup '\$TMP/bike-my-day.db'"
gzip -9 "\$TMP/bike-my-day.db"
aws s3 cp "\$TMP/bike-my-day.db.gz" "s3://$BACKUP_BUCKET/db/bike-my-day-\$STAMP.db.gz" --only-show-errors
aws s3 cp "s3://$BACKUP_BUCKET/db/bike-my-day-\$STAMP.db.gz" "s3://$BACKUP_BUCKET/db/latest.db.gz" --only-show-errors
SCRIPT
chmod 755 /usr/local/bin/bike-my-day-backup

cat > /etc/systemd/system/bike-my-day-backup.service <<'EOF'
[Unit]
Description=Back up the bike-my-day database to S3
After=network-online.target

[Service]
Type=oneshot
User=bike-my-day
ExecStart=/usr/local/bin/bike-my-day-backup
EOF

# Slot from korist-infra's schedule map; backups are staggered so none overlap.
cat > /etc/systemd/system/bike-my-day-backup.timer <<'EOF'
[Unit]
Description=Nightly bike-my-day database backup

[Timer]
OnCalendar=*-*-* 05:17:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable bike-my-day-api
systemctl enable --now bike-my-day-backup.timer

if [ "$ENABLE_FORECAST" = yes ]; then
  if systemctl is-enabled --quiet bike-my-day-notify.timer 2>/dev/null; then
    echo "the old bike-my-day-notify.timer is still enabled; disable it first (double notifications)" >&2
    exit 1
  fi
  # Persistent=true fires at once on first enable to "catch up" a window it
  # thinks it missed: riders would get a forecast against tonight's weather.
  # Seed the stamp so the first run is the next real 04:00.
  STAMP=/var/lib/systemd/timers/stamp-bike-my-day-forecast.timer
  if [ ! -f "$STAMP" ]; then
    install -d -m 755 /var/lib/systemd/timers
    touch "$STAMP"
  fi
  systemctl enable --now bike-my-day-forecast.timer
fi
