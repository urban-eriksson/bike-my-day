# bike-my-day

Let an agent check if tomorrow is a good bike day.

You define your recurring bike routes (start + end address, depart time, days of week). The night before, the app fetches a weather forecast for the relevant time and place, computes the directional wind component along your route (head/tail/cross), and asks an LLM to turn the raw data into a one-line plain-English forecast. The forecast arrives as a web push notification on every device you've subscribed — on iPhone, install the app to your home screen (Safari → Share → Add to Home Screen) and enable notifications in Settings.

## Stack

- Next.js (App Router) + TypeScript, self-hosted on EC2 (eu-north-1)
- Supabase (Postgres + Auth email OTP code + RLS)
- Open-Meteo for forecasts, Photon (OSM) for address autocomplete + geocoding (no API keys)
- Anthropic Claude (Haiku 4.5) for the forecast text, with prompt caching
- Web Push (VAPID) for notifications, installable as a PWA
- Vitest (unit + integration) + Playwright (E2E)

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest unit + integration
npm run test:e2e     # Playwright
```

CI runs lint, typecheck, unit/integration tests, and Playwright on every PR.

## Deployment

The app runs on a shared t3.micro in eu-north-1 alongside two other hobby
projects, behind Caddy, which terminates TLS. It moved off Vercel because
Hobby-tier cron gives no delivery guarantee and stopped firing for two nights
without any signal (#59, #61).

```bash
cd infra && npx aws-cdk@2 deploy      # deploy bucket + DNS (once, or when infra changes)
./scripts/push-env.sh                 # publish .env.local secrets to SSM (when a secret changes)
./scripts/deploy.sh                   # build here, ship, restart, health-check, roll back on failure
```

`deploy.sh` builds locally and ships the ~15 MB standalone trace via S3 + SSM.
**Never build on the box**: `next build` wants about a gigabyte and would
OOM-kill the neighbouring services.

Runtime secrets live in one SSM SecureString at `/bike-my-day/env` and are
fetched into the process environment on each start, never written to disk.

| Where                                  | What                                                         |
| -------------------------------------- | ------------------------------------------------------------ |
| `https://bike-my-day.korist.se`        | production                                                   |
| `https://origin.bike-my-day.korist.se` | same box, same process; reachable when production DNS is not |
| `systemctl status bike-my-day`         | the web app                                                  |
| `journalctl -u bike-my-day-notify`     | the 04:00 nightly run, one line per night                    |
