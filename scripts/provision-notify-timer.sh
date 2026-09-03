#!/bin/bash
# Fires bike-my-day's nightly forecast run from the shared korist.se box.
#
# Vercel's Hobby cron stopped invoking /api/cron/notify after 2026-09-01 while
# still reporting itself enabled, and Vercel documents Hobby cron timing as
# best-effort with no retry. The endpoint is fine; only the trigger moves here.
# The app itself is still served by Vercel.
#
# Runs as root on the snicksnack box. Idempotent: re-running only rewrites its
# own files and never touches the snicksnack or isabelle units.
# Arguments: APP_ORIGIN [REGION]
set -euo pipefail
APP_ORIGIN=${1:?usage: provision-notify-timer.sh APP_ORIGIN [REGION]}
REGION=${2:-eu-north-1}
SECRET_PARAM=/bike-my-day/CRON_SECRET

# A dedicated unprivileged user, as isabelle and snicksnack each have. It needs
# no home of its own beyond somewhere for the AWS CLI to write.
useradd -r -m -d /opt/bike-my-day bike-my-day || true
install -d -m 755 /etc/bike-my-day

# The secret lives in Parameter Store, not on disk and not in this repo. The
# instance role already carries ssm:GetParameter through
# AmazonSSMManagedInstanceCore, so fetching it needs no IAM change; rotating it
# is a put-parameter with no deploy.
cat > /etc/bike-my-day/settings <<EOF
BMD_APP_ORIGIN=$APP_ORIGIN
BMD_REGION=$REGION
BMD_SECRET_PARAM=$SECRET_PARAM
EOF
chmod 644 /etc/bike-my-day/settings

cat > /usr/local/bin/bike-my-day-notify <<'SCRIPT'
#!/bin/bash
set -euo pipefail
: "${BMD_APP_ORIGIN:?}" "${BMD_REGION:?}" "${BMD_SECRET_PARAM:?}"

SECRET=$(aws ssm get-parameter --region "$BMD_REGION" --name "$BMD_SECRET_PARAM" \
  --with-decryption --query Parameter.Value --output text)

# maxDuration on the route is 300s, so allow the full budget. Retry a few times
# for a transient network or platform blip, but stop long before the ride: a
# forecast that lands after the rider has left is worse than none.
RESPONSE=$(curl -fsS --max-time 320 --retry 3 --retry-delay 120 --retry-all-errors \
  -H "Authorization: Bearer $SECRET" \
  "$BMD_APP_ORIGIN/api/cron/notify")

# One greppable line per run. The verdict texts stay out of the journal; the
# counts are what tells you whether a night went through.
printf '%s' "$RESPONSE" | python3 -c '
import collections, json, sys

raw = sys.stdin.read()
try:
    body = json.loads(raw)
except ValueError:
    sys.exit("cron returned non-JSON: " + raw[:200])

counts = collections.Counter(r.get("status") for r in body.get("results", []))
parts = ["due={}".format(body.get("due", 0))]
parts += ["{}={}".format(k, v) for k, v in sorted(counts.items())] or ["(nothing due)"]
cap = body.get("capacity")
if cap:
    parts.append("used={}% headroom={}".format(cap["usedPct"], cap["headroomRides"]))
print(" ".join(parts))

failed = counts.get("error", 0)
if failed:
    sys.exit("{} ride(s) failed".format(failed))
'
SCRIPT
chmod 755 /usr/local/bin/bike-my-day-notify

cat > /etc/systemd/system/bike-my-day-notify.service <<'EOF'
[Unit]
Description=Send bike-my-day forecasts for the coming day
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=bike-my-day
EnvironmentFile=/etc/bike-my-day/settings
ExecStart=/usr/local/bin/bike-my-day-notify
EOF

# Persistent=true is the whole point of moving here: if the box is down or
# rebooting at 04:00, the run happens at boot instead of being lost in silence.
cat > /etc/systemd/system/bike-my-day-notify.timer <<'EOF'
[Unit]
Description=Nightly bike-my-day forecast run

[Timer]
OnCalendar=*-*-* 04:00:00 Europe/Stockholm
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload

# Persistent=true makes systemd fire immediately on first enable to "catch up"
# a window it thinks it missed. Riders would get tomorrow's forecast tonight,
# against tonight's weather, and the idempotency guard would then suppress the
# real 04:00 run. Seed the stamp so the first run is the next real one.
STAMP=/var/lib/systemd/timers/stamp-bike-my-day-notify.timer
if [ ! -f "$STAMP" ]; then
  install -d -m 755 /var/lib/systemd/timers
  touch "$STAMP"
fi

systemctl enable --now bike-my-day-notify.timer
systemctl list-timers bike-my-day-notify.timer --no-pager
