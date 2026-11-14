# Plan: off Next.js, Vercel and Supabase

Started 2026-11-11. Goal: run bike-my-day like isabelle: a Vite web app on S3 + CloudFront,
a FastAPI + SQLite server on the korist dev box, with no free-tier services in the path.
About 5 users, none riding in November, so a short outage is fine. **Losing their push
subscriptions or making them reinstall the app is not.**

## Where things are today

- Web app and API: Next.js 16 on Vercel. `bike-my-day.korist.se` resolves to Vercel.
- Data and login: Supabase (Postgres + RLS, email OTP code).
- Nightly run: systemd timer `bike-my-day-notify` on the dev box, 04:00 Europe/Stockholm,
  curls `/api/cron/notify` on Vercel. Secret in SSM at `/bike-my-day/CRON_SECRET`.
- The EC2 move in `scripts/deploy.sh`, `provision-app.sh` and `infra/` (a `BikeMyDay` stack
  serving Next.js from the box) was never deployed. This plan replaces it; delete those files
  once the new deploy works.

## Target

| Part | What | Like |
|---|---|---|
| `apps/web/` | Vite + React + TS + Tailwind 4, shadcn-style components, Biome, Vitest | isabelle, sopkoll |
| `server/` | FastAPI + SQLite, uv, ruff, pyright, pytest | isabelle |
| `infra/` | CDK (Python): cert stack (us-east-1) + app stack (eu-north-1) | isabelle |
| Login | Emailed 6-digit code + JWT, SES, `MAIL_MODE=log` locally | snicksnack `auth.py`, `mail.py` |
| Nightly | systemd timer runs `python -m bike_my_day.notify` directly, no HTTP cron | isabelle `remind` |

Hosting: CloudFront serves the S3 bucket at `bike-my-day.korist.se` (403/404 → `index.html`)
and proxies `/api/*` to `api.bike-my-day.korist.se` (Caddy → uvicorn on the dev box).

Mail: From `Bike my day <noreply@korist.se>`, Reply-To `support@korist.se`. The SES domain
identity `korist.se` is verified, DKIM-signing, and out of the sandbox (checked 2026-11-11);
SPF already includes amazonses.com and mailbox.org. The box role needs `ses:SendEmail` on the
`korist.se` identity (granted by this app's stack, under its own construct id).

## Push continuity: the hard constraints

A phone keeps getting notifications with no action from its owner only if all of these hold:

1. **Same origin**: the web app stays at `https://bike-my-day.korist.se`. The installed PWA and its
   push subscription belong to that origin.
2. **Same VAPID key pair.** New keys end every subscription silently. The keys are in Vercel's
   environment and nowhere else we know of (no `.env.local` here, nothing in SSM). **Step 0
   below must succeed before any other work matters.**
3. **`/sw.js` at the same path, scope `/`**, never served stale: a `/sw.js` behaviour with caching
   disabled at the edge, and both the old and new client register it with
   `updateViaCache: "none"` (so the 5-minute max-age on the object is ignored for update checks).
   Keep the push payload shape the worker reads.
4. **Subscription rows migrated with the user's id**, so the nightly job has them before anyone
   opens the app.
5. **The client re-sends its subscription on every app open** (after login). Today it only checks
   locally and shows "on", so a subscription the server lost stays broken for good. Fix that in the
   new client.

Users will have to log in once inside the installed app (Supabase sessions do not carry over).
That is a typed code, so it works in the PWA. Notifications do not depend on it.

## Steps

Status as of 2026-11-12: steps 1–3 are built and tested locally on branch
`migrate/fastapi-vite`; nothing is deployed.

0. [x] **Recover the VAPID keys** (and the Anthropic key) from Vercel. Done 2026-11-12: the
   VAPID pair is *Sensitive* in Vercel, so a throwaway preview route sealed it with an RSA key
   held only locally (branch and key deleted since); the private key was checked to derive the
   public one (public key sha256 `46b93022`). All four are in `.env.local` under the Vercel
   names, and `scripts/push-env.sh` has put them in SSM `/bike-my-day/env` with a generated
   `BMD_SECRET` (it refuses to replace a VAPID key that is already there).
1. [x] **Server** (`server/`). Ported with tests; `tests/golden/typescript.json` was generated
   from the old TypeScript and proves the verdict prompt, push text, next departure and compass
   are byte-identical. `bike_my_day.importer` loads the Supabase export (keeps ids).
   Dropped on purpose: the capacity warning to `ADMIN_EMAIL` (it measured Vercel's 300 s
   function limit; a systemd job has none) and the `CRON_SECRET` HTTP trigger.
2. [x] **Web** (`apps/web/`). Same routes, copy, components and look. The client re-sends its
   push subscription on every open (constraint 5) and reads the old `lang` cookie as a starting
   language. Checked end to end in Chrome against the local API.
3. [x] **Infra + scripts** (`infra/app.py`, `scripts/provision.sh`, `deploy-server.sh`,
   `deploy-web.sh`, `push-env.sh`). `cdk synth` is clean. Port 8004 and the 05:17 UTC backup
   slot are confirmed by korist-infra (its port map, 21679e2).
4. [ ] **Rehearse.** Deployed 2026-11-12 at https://d9b8t5yetmy9j.cloudfront.net; smoke test
   passes (SPA paths, `/sw.js`, `/api/*` with bearer, API 404s stay JSON, push key sha256
   `46b93022`); on the box the old notify timer is still on and the new forecast timer off.
   Left: the operator's own test below. `cd infra && npx aws-cdk deploy BikeMyDayCert BikeMyDay` (cutover stays
   false in `cdk.json`: the live record is untouched), `scripts/deploy-server.sh` (nightly run
   stays off), `scripts/deploy-web.sh`. Test on the `OutCloudFrontUrl` with the operator's
   account: login mail arrives from noreply@korist.se, rides, preview, a test push.
   Done 2026-11-12: login mail, rides, preview and a browser test push all worked.
5. [x] **Data.** Done 2026-11-13 as part of the cutover (counts matched the export:
   6 users, 5 profiles, 7 rides, 4 push subscriptions, 250 notifications). In the Supabase SQL editor run the query printed by
   `uv run python -m bike_my_day.importer`, save the result as `server/export.json`, copy it to
   the box and import it into an empty `/var/lib/bike-my-day/bike-my-day.db`. Compare counts.
6. [x] **Cutover** (one sitting, not near 04:00). Steps 1–4 done 2026-11-13 ~21:45–21:55
   CET: old timer disabled, import into a fresh database (the trial one is kept as
   `bike-my-day.db.trial-*`), record moved (`32e2b82`), forecast timer on with no catch-up run,
   and a dry run as of Monday 04:00 reaches the same 3 rides / 4 devices the old job did.
   Phone check passed 2026-11-14 (installed app kept its subscription; test push arrived).
   1. Stop the old trigger on the box: `systemctl disable --now bike-my-day-notify.timer`.
   2. Final export/import (step 5) into a fresh database.
   3. Set `"cutover": "true"` in `infra/cdk.json`, commit, `scripts/deploy-web.sh` (moves the
      record from Vercel to CloudFront; TTL 5 min).
   4. `scripts/deploy-server.sh --enable-forecast`, then on the box run
      `python -m bike_my_day.notify --dry-run` as the service user: it must list the same rides
      the old cron would have.
   5. On a real phone: the installed app opens without reinstalling, login by code, a test push
      arrives from the preview page.
7. [ ] **Clean up after two quiet weeks.** Delete the Vercel and Supabase projects; remove the old
   timer's files on the box and `CRON_SECRET` from SSM; delete the Next.js app (root
   `package.json`, `src/`, `supabase/`, `tests/`, `next.config.ts`, …), `provision-app.sh`,
   `deploy.sh`, `provision-notify-timer.sh`; update README, CLAUDE.md, AGENTS.md and
   `../korist-infra/CLAUDE.md`. Box-side removals (old timer files, `CRON_SECRET`) go to korist-infra as
   an entry in `~/repos/INFRA-INBOX.md`; the cutover notice was posted there on 2026-11-14.

Rollback until step 7: point DNS back at Vercel (`cutover` false + deploy, or the record by
hand), disable `bike-my-day-forecast.timer`, re-enable `bike-my-day-notify.timer`. Never run
both timers at once; `provision.sh` refuses to enable the new one while the old one is on.

## Open questions

- Port and backup slot on the dev box: needs a `korist-infra` session (see below).
- Verdict model: switched to Claude Haiku 5.5 at low effort on 2026-11-14 (`ea19fd1`).

## What korist-infra has to do

Small, and all box-level bookkeeping:

1. Confirm port **8004** for the bike-my-day API (3000 was reserved for Node) and the nightly
   backup slot **05:17 UTC** (both assumed in `scripts/provision.sh`). Update the port and
   schedule map.
2. Check memory headroom on the dev box for one more uvicorn process (~60 MB).
3. At cutover, confirm the old `bike-my-day-notify` timer is gone and only the new one runs.
4. Update its CLAUDE.md: bike-my-day web is on S3 + CloudFront, API on the dev box, no Vercel.

Everything else (Caddy block, units, buckets, DNS, the SES grant) is this repo's own
provision script and stack, per the box rules.
