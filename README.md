# bike-my-day

Let an agent check if tomorrow is a good bike day.

You define your recurring bike routes (start + end address, depart time, days of week). The night before, the app fetches a weather forecast for the relevant time and place, computes the directional wind component along your route (head/tail/cross), and asks an LLM to turn the raw data into a one-line plain-English verdict. The verdict is delivered by email today; native push later.

## Stack

- Next.js (App Router) + TypeScript on Vercel
- Supabase (Postgres + Auth magic-link + RLS)
- Open-Meteo for forecast + geocoding (no API key)
- Anthropic Claude (Haiku 4.5) for the verdict text, with prompt caching
- Resend for email notifications
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
