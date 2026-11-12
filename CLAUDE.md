# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mid-migration: read PLAN.md first

The app is moving off Next.js + Vercel + Supabase to the house stack (like `../isabelle`):

- **New** (where work happens): `apps/web/` (Vite + React + TS + Tailwind 4, Biome, Vitest),
  `server/` (FastAPI + SQLite, uv), `infra/` (CDK: S3 + CloudFront + the shared dev box),
  `scripts/provision.sh`, `deploy-server.sh`, `deploy-web.sh`, `push-env.sh`.
- **Old, still live until cutover**: the Next.js app at the repo root (`package.json`, `src/`,
  `supabase/`, `tests/`, `next.config.ts`, `AGENTS.md`), served by Vercel from `main`. Don't
  change or delete it before the cutover in PLAN.md: merging to `main` still deploys it.
  `scripts/deploy.sh`, `provision-app.sh` and `provision-notify-timer.sh` belong to it too.

**Push continuity is the constraint** (PLAN.md has the list): same origin, same VAPID pair, `/sw.js`
at scope `/`, the same route paths (`/dashboard`, `/rides/<id>/forecast` are in notifications and
the installed app's `start_url`), and user ids kept by the importer. Never rotate the VAPID keys.

## Commands

```bash
# Web
cd apps/web && npm install
npm run dev                  # Vite; proxies /api to the server on :8004
npm run check                # tsc + Biome
npm run fix                  # Biome autofix/format
npm test                     # Vitest (src/**/*.test.ts)
npx vitest run src/lib/format-days.test.ts

# Server
cd server && uv sync
uv run uvicorn bike_my_day.main:app --port 8004 --reload
uv run pytest                                   # all tests
uv run pytest tests/test_api.py::test_nightly_run
uv run pytest --live -k live                    # also hit real Photon and Open-Meteo
uv run ruff check . && uv run ruff format . && uv run pyright
uv run python -m bike_my_day.notify --dry-run   # what tonight's run would send
```

Signing in locally needs no mail: `BMD_MAIL_MODE` defaults to `log`, so the code is printed in
the server log. All server config is `BMD_*` env vars (`server/src/bike_my_day/config.py`).

## Architecture

**Nightly run** (`notify.py`, systemd timer `bike-my-day-forecast` at 04:00 Europe/Stockholm):
`schedule.select_due` picks active rides departing in the next 24 h (0 = Sunday, like the old
schema), `verdict.run_verdict` fetches Open-Meteo at the start (and at the destination for the
return hour) and asks Claude Haiku 4.5 for a `SCORE: n` line plus text in the rider's
`profiles.locale`, then `push.send_to_all` pushes and prunes 404/410 subscriptions. Network work
runs in a pool of 5; database writes stay on the main thread. `notifications.unique(ride_id,
scheduled_for)` plus `sent_at` make reruns idempotent.

**Faithful port**: `verdict.py` and `push.py` reproduce the TypeScript output exactly, including
JS rounding (`geo.js_round`, `js_num`). `tests/test_golden.py` checks against
`tests/golden/typescript.json`, generated from the old `src/lib`. Change prompt text deliberately.

**API** (`main.py`, `auth.py`): bearer JWT in the client's localStorage, emailed six-digit codes
(from snicksnack), SES as `noreply@korist.se` with Reply-To support@. `GET /api/me` re-issues
the token (sliding expiry). The preview endpoint costs one Claude call per request.

**Web**: one route per old Next.js page, under `src/views/`. `lib/session.tsx` loads `/api/me` and
then re-sends the device's push subscription (`lib/push.ts`) on every open, so a lost
subscription heals itself. `lib/i18n/` holds both dictionaries (sv default). Language is
localStorage, then the old `lang` cookie, then the browser; switching also saves
`profiles.locale` for the nightly run. API errors map to dictionary strings in `lib/errors.ts`.

**Hosting** (`infra/app.py`): CloudFront serves the bucket and proxies `/api/*` to
`api.bike-my-day.korist.se` (Caddy → uvicorn :8004 on the KoristDev box). A viewer-request
function, not error responses, rewrites SPA paths, so the API's 404s stay 404s. Whether the stack
owns `bike-my-day.korist.se` is `"cutover"` in `infra/cdk.json`; until then it points at Vercel.

## Deployment

Box rules are in `../korist-infra/CLAUDE.md`. Don't run deploys or `cdk deploy` unasked; `cdk
synth`/`diff` are fine. `scripts/deploy-server.sh` leaves the nightly run off unless given
`--enable-forecast`, and `provision.sh` refuses to enable it while the old
`bike-my-day-notify.timer` is on (both at once means double notifications).
