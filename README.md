# bike-my-day

Let an agent check if tomorrow is a good bike day.

You define your recurring bike routes (start + end address, depart time, days of week). The night before, the app fetches a weather forecast for the relevant time and place, computes the directional wind component along your route (head/tail/cross), and asks an LLM to turn the raw data into a one-line plain-English verdict. The verdict arrives as a web push notification on every device you've subscribed — on iPhone, install the app to your home screen (Safari → Share → Add to Home Screen) and enable notifications in Settings.

## Stack

- Next.js (App Router) + TypeScript on Vercel
- Supabase (Postgres + Auth email OTP code + RLS)
- Open-Meteo for forecasts, Photon (OSM) for address autocomplete + geocoding (no API keys)
- Anthropic Claude (Haiku 4.5) for the verdict text, with prompt caching
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
