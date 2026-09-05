#!/bin/bash
# Sets up the bike-my-day web app on the shared korist.se box, next to
# snicksnack and isabelle. Runs as root through deploy.sh on every deploy and
# is idempotent: it never touches the neighbours' units and only appends its
# own Caddy site block.
#
# It deliberately does NOT build anything. `next build` wants about a gigabyte
# and this box has ~490 MB free; a build here would OOM-kill the neighbours.
# deploy.sh ships an already-built standalone tree and this script only wires
# it up.
#
# Arguments: DOMAIN ORIGIN_DOMAIN
set -euo pipefail
DOMAIN=$1
ORIGIN_DOMAIN=$2

PORT=3000
NODE_VERSION=v24.1.0
REGION=eu-north-1
ENV_PARAM=/bike-my-day/env

# --- swap -------------------------------------------------------------------
# 512 MB was sized for two small Python services and is already ~140 MB in use
# before Node arrives. Disk is the one thing this box has spare (4.3 GB free),
# so buy the headroom: a spike should page, not OOM-kill a neighbour.
if [ "$(stat -c %s /swapfile 2>/dev/null || echo 0)" -lt 1073741824 ]; then
  swapoff /swapfile 2>/dev/null || true
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- node -------------------------------------------------------------------
# The official tarball rather than an apt repo or nvm: pinned, checksum-verified,
# and removable with an rm -rf. Matches the version CI and the build machine use,
# so sharp's prebuilt binaries in the artifact are the right ABI.
NODE_DIR=/opt/node-$NODE_VERSION
if [ ! -x "$NODE_DIR/bin/node" ]; then
  TARBALL=node-$NODE_VERSION-linux-x64.tar.xz
  TMP=$(mktemp -d)
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL -o "$TMP/$TARBALL" "https://nodejs.org/dist/$NODE_VERSION/$TARBALL"
  curl -fsSL -o "$TMP/SHASUMS256.txt" "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt"
  (cd "$TMP" && grep " $TARBALL\$" SHASUMS256.txt | sha256sum -c -)
  rm -rf "$NODE_DIR"
  mkdir -p "$NODE_DIR"
  tar -xJf "$TMP/$TARBALL" -C "$NODE_DIR" --strip-components=1
  rm -rf "$TMP"
  trap - EXIT
fi
ln -sfn "$NODE_DIR" /opt/node

# --- user and directories ---------------------------------------------------
# The user already exists: #59 created it for the nightly timer. Same account
# runs the server, so a compromise of one is not an escalation over the other.
useradd -r -m -d /opt/bike-my-day bike-my-day || true
install -d -m 755 -o bike-my-day -g bike-my-day /opt/bike-my-day
install -d -m 755 /etc/bike-my-day

# --- server wrapper ---------------------------------------------------------
# Secrets are fetched from Parameter Store into this process's environment on
# every start and never written to disk, matching bike-my-day-notify from #59.
# The tradeoff is that a restart now needs SSM to be reachable; that is the same
# dependency the nightly run already has, and it fails loudly rather than
# booting a half-configured server.
cat > /usr/local/bin/bike-my-day-server <<SCRIPT
#!/bin/bash
set -euo pipefail
ENV_BLOB=\$(aws ssm get-parameter --region $REGION --name $ENV_PARAM \\
  --with-decryption --query Parameter.Value --output text)
# The blob is KEY='value' lines, shell-quoted by scripts/push-env.sh. Only
# account admins can write the parameter, and they already have root here via
# SSM Run Command, so this is no wider a trust boundary than EnvironmentFile.
set -a
eval "\$ENV_BLOB"
set +a
cd /opt/bike-my-day/app
exec /opt/node/bin/node server.js
SCRIPT
chmod 755 /usr/local/bin/bike-my-day-server

# --- unit -------------------------------------------------------------------
cat > /etc/systemd/system/bike-my-day.service <<EOF
[Unit]
Description=bike-my-day web app
After=network-online.target
Wants=network-online.target

[Service]
User=bike-my-day
WorkingDirectory=/opt/bike-my-day/app
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=PORT=$PORT
# A runaway backstop, not a tuning knob: 300 requests at 30 concurrent peaked
# at 180 MB RSS with a 128 MB cap and 182 MB with a 192 MB one, so the cap is
# not binding in normal operation. It is set above any legitimate workload so
# that a leak hits a ceiling instead of paging out the neighbours.
Environment=NODE_OPTIONS=--max-old-space-size=192
ExecStart=/usr/local/bin/bike-my-day-server
Restart=always
RestartSec=3
# Do not let a crash-loop starve the neighbours of CPU.
StartLimitIntervalSec=300
StartLimitBurst=10

[Install]
WantedBy=multi-user.target
EOF

# --- caddy ------------------------------------------------------------------
# Our own site block, appended once. Caddy's automatic HTTPS handles the certs;
# the origin name gets one too, so the whole path can be proven before the
# production name moves. Both are proxied to the same process.
if ! grep -q "^$DOMAIN" /etc/caddy/Caddyfile; then
  cat >> /etc/caddy/Caddyfile <<EOF

$DOMAIN, $ORIGIN_DOMAIN {
    reverse_proxy 127.0.0.1:$PORT
}
EOF
  systemctl reload caddy
fi

systemctl daemon-reload
systemctl enable bike-my-day
