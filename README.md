# AI Bet UG

A soccer value-betting runner for the top 5 European leagues (EPL, La Liga, Serie A, Bundesliga, Ligue 1). Picks come from **Project Pi** (`../project-pi`, a separate repo whose `analyze-matches` Supabase Edge Function shares this exact Supabase project — see "Where picks come from" below); this repo's job is turning an approved pick into an actual BetPawa bet. Supabase holds all state (recommended bets, placements, settings, bankroll); a local Node/TypeScript process polls it and drives Playwright to place bets on BetPawa.

## ⚠️ Read this before flipping anything live

- BetPawa has no public betting API. Automated placement means Playwright driving your own logged-in account through their real website. This almost certainly breaches their Terms of Service — risk of account limitation, bet voiding, or forfeiture of funds. That's a risk you accepted going in; this project just tries to make the engineering side of it as safe as possible.
- **Dry-run is on by default at every layer** (`settings.dry_run_default = true`, and each `recommended_bets` row defaults `dry_run = true`). Nothing places a real stake until you deliberately flip both off for one specific, small, manually-approved bet.
- **The kill switch defaults to ON.** The runner does nothing until you explicitly turn it off (`npm run kill-switch -- off`).
- **Nothing is auto-actionable.** Every `recommended_bets` row starts as `pending_review` — a human must manually flip it to `approved` (in Supabase Studio) before the runner will ever touch it, independent of dry-run and the kill switch. This applies equally to rows Project Pi inserts automatically.
- **No blind retries.** A failed placement stays `failed`. A human must review it and manually re-approve it. This is the guard against a broken selector or a site hiccup silently repeating a stake.

## Setup

1. `npm install`
2. `npx playwright install chromium` (or `npm run playwright:install`)
3. Copy `.env.example` to `.env` and fill in:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — from **this project's own Supabase project** (also Project Pi's — they're deliberately the same project). Service-role key only — it bypasses RLS and must never be shipped to a browser/frontend.
   - `BETPAWA_PHONE` / `BETPAWA_PASSWORD` — your own account. Never commit this file, never paste these into chat.
4. Apply the schema to your Supabase project — either:
   - Paste each file in `supabase/migrations/` into the Supabase SQL Editor in order, or
   - Run `SUPABASE_DB_URL="postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres" npm run migrate` (the DB password is under Project Settings → Database — this is a one-off env var for this command only, never put it in `.env`). Tracks applied files in a `schema_migrations` table, so re-running is safe.
5. Sanity-check RLS: in Supabase Studio, confirm the `settings` table has exactly one row with `kill_switch = true`. Then confirm the anon/public key **cannot** read any of the four ai-bet-ug tables (RLS is enabled with zero policies granted to anon/authenticated — only the service-role key, used solely by this local runner, can access them).

## Where picks come from

Project Pi computes a Poisson model + a heuristic "Pressure Model" + situational signals (relegation desperation, draw-trap flags) from football-data.org fixtures/stats, then asks Claude to pick a bet. Its `analyze-matches` function (in the separate `project-pi` repo, not here) writes to its own `recommendations` table **and**, in the same run, bridges into this project's `recommended_bets` — mapping `bet_type`/`pick` onto BetPawa's actual market vocabulary (`1X2`, `Double Chance`, `BTTS`, `Over/Under 2.5`; `draw_no_bet` picks are skipped — no confirmed BetPawa market for it yet), sizing stake from confidence (Low/Medium/High → 1/2/3), and leaving `bookmaker_event_url` null (a Deno edge function can't run Playwright).

That URL gets filled in locally:

```sh
npm run resolve-events
```

Fuzzy-matches each pending bet's team names (`src/betpawa/resolveMatch.ts`) against the relevant BetPawa league page (league→id map in `src/betpawa/leagues.ts`) and fills in `bookmaker_event_url`. Best-effort and conservative — leaves it null and logs a warning rather than guessing wrong; check Supabase Studio for any that need a manual URL pasted in.

Note: as of 2026-08-16 Project Pi's `ANTHROPIC_API_KEY` is out of credits (`recommendations` had been silently stalled since 2026-05-11) — `analyze-matches` won't produce new picks until that's topped up at console.anthropic.com and the secret is refreshed (`supabase secrets set ANTHROPIC_API_KEY=... --project-ref vkaprrhkmbbhagcidaka`).

## Proving the state machine (no real BetPawa involved)

`src/betpawa/index.ts` currently exports the **stub client** — it simulates the shape of a bet placement (a short delay, then a result) without ever opening a browser. This lets you verify the whole pipeline — guardrails, dry-run, the kill switch, the duplicate-placement guard — before any real automation risk.

```sh
npm run seed-fake-bet     # inserts one fake recommended_bet, status='pending_review'
```

Then in Supabase Studio, flip that row's `status` to `approved`.

```sh
npm run run-once          # runs a single poll cycle
```

You should see a `dry_run_success` row appear in `bet_placements` and the `recommended_bets` row move to `placed`. Try seeding + approving the same bet twice in quick succession and running `run-once` — the second attempt should be blocked by the duplicate-placement guard (backed by a Postgres partial unique index, not just application logic).

## BetPawa automation status

`src/betpawa/selectors.ts` — **login and all four markets' selectors are verified** against the live site (2026-08-16, via the throwaway `src/cli/reconLogin.ts` / `reconBetSlip.ts` scripts — rerun that style of script if selectors start failing, since bookmaker frontends change without notice). `npm run test-login` proves the real login flow end-to-end with `storageState/betpawa.json` reuse.

Two site-specific quirks baked into the code: it's a client-rendered SPA (`session.ts`/`placeBet.ts` wait for a fixed delay after navigation rather than `networkidle`, since match pages stream live odds continuously and never go idle), and the mobile-number field wants the **local number without the `256` prefix** (stripped automatically from `BETPAWA_PHONE`).

**What's still unverified**: `SELECTORS.betSlip.confirmationBanner` — no recon run has ever clicked the actual "Place bet" button (deliberately, to avoid staking real money during discovery), so what the post-confirmation success state looks like is a best guess. This only matters for `dry_run=false` live placements; dry-run stops one step before it.

To go live with `realClient`:

1. Switch `src/betpawa/index.ts` to export `realClient` instead of `stubClient`.
2. Run `npm run resolve-events`, approve a bet with a resolved `bookmaker_event_url`, `npm run run-once` with dry-run still on — this really logs into BetPawa, navigates to the match, reads live odds for the right market/selection, fills the stake, and stops. Check `bet_placements.submitted_odds` looks sane for the market.
3. Only after several clean dry runs: pick one bet, set `recommended_bets.dry_run = false` on that single row, temporarily set `settings.dry_run_default = false`, turn the kill switch off (`npm run kill-switch -- off`), let one cycle run, then immediately turn the kill switch back on (`npm run kill-switch -- on`) and set `dry_run_default` back to `true`. Watch for a `confirmationBanner`-related failure specifically — if the selector's wrong, `bet_placements` will show `failed` with a clear error rather than silently misreporting success.

## Running continuously

```sh
npm start
```

Polls every `POLL_INTERVAL_SECONDS` (default 30s). Stop it with Ctrl+C, or leave the kill switch on to make it a no-op without stopping the process. `resolve-events` isn't part of this loop yet — run it manually.
