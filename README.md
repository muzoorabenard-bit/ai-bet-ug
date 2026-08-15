# AI Bet UG

A soccer value-betting runner for the top 5 European leagues (EPL, La Liga, Serie A, Bundesliga, Ligue 1). Supabase holds all state (recommended bets, placements, settings, bankroll); a local Node/TypeScript process polls it and, once real selectors are wired in, drives Playwright to place bets on BetPawa.

## ⚠️ Read this before flipping anything live

- BetPawa has no public betting API. Automated placement means Playwright driving your own logged-in account through their real website. This almost certainly breaches their Terms of Service — risk of account limitation, bet voiding, or forfeiture of funds. That's a risk you accepted going in; this project just tries to make the engineering side of it as safe as possible.
- **Dry-run is on by default at every layer** (`settings.dry_run_default = true`, and each `recommended_bets` row defaults `dry_run = true`). Nothing places a real stake until you deliberately flip both off for one specific, small, manually-approved bet.
- **The kill switch defaults to ON.** The runner does nothing until you explicitly turn it off (`npm run kill-switch -- off`).
- **Nothing is auto-actionable.** Every `recommended_bets` row starts as `pending_review` — a human must manually flip it to `approved` (in Supabase Studio, or your own tooling later) before the runner will ever touch it, independent of dry-run and the kill switch.
- **No blind retries.** A failed placement stays `failed`. A human must review it and manually re-approve it. This is the guard against a broken selector or a site hiccup silently repeating a stake.

## Setup

1. `npm install`
2. `npx playwright install chromium` (or `npm run playwright:install`)
3. Copy `.env.example` to `.env` and fill in:
   - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — from **this project's own Supabase project** (not buildableug's). Service-role key only — it bypasses RLS and must never be shipped to a browser/frontend.
   - `BETPAWA_USERNAME` / `BETPAWA_PASSWORD` — your own account. Never commit this file, never paste these into chat.
4. Apply the schema to your Supabase project — either:
   - Paste `supabase/migrations/0001_init.sql`, `0002_recommended_bets.sql`, `0003_bet_placements.sql` into the Supabase SQL Editor in order, or
   - Run `SUPABASE_DB_URL="postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres" npm run migrate` (the DB password is under Project Settings → Database — this is a one-off env var for this command only, never put it in `.env`, the app itself never needs direct DB access).
5. Sanity-check RLS: in Supabase Studio, confirm the `settings` table has exactly one row with `kill_switch = true`. Then confirm the anon/public key **cannot** read any of the four tables (RLS is enabled with zero policies granted to anon/authenticated — only the service-role key, used solely by this local runner, can access them).

## Proving the state machine (no real BetPawa involved yet)

Right now `src/betpawa/index.ts` exports the **stub client** — it simulates the shape of a bet placement (a short delay, then a result) without ever opening a browser. This lets you verify the whole pipeline — guardrails, dry-run, the kill switch, the duplicate-placement guard — before any real automation risk.

```sh
npm run seed-fake-bet     # inserts one fake recommended_bet, status='pending_review'
```

Then in Supabase Studio, flip that row's `status` to `approved`.

```sh
npm run run-once          # runs a single poll cycle
```

You should see a `dry_run_success` row appear in `bet_placements` and the `recommended_bets` row move to `placed`. Try seeding + approving the same bet twice in quick succession and running `run-once` — the second attempt should be blocked by the duplicate-placement guard (backed by a Postgres partial unique index, not just application logic).

## Selector discovery (you drive this — not something the assistant can do)

`src/betpawa/selectors.ts` is full of `TODO` placeholders. Nobody has inspected BetPawa's live DOM in this project. To fill them in:

1. Set `HEADLESS=false` in `.env` so a real Chromium window opens.
2. Either:
   - Add a temporary `await page.pause()` right after `page.goto()` in `src/betpawa/session.ts` — this opens the Playwright Inspector, where you can click through login/bet-slip manually and use its element picker to get real selectors, or
   - Run `npx playwright codegen https://www.betpawa.ug` separately, log in and walk through a bet slip manually (stop before confirming a real stake), and copy the generated selectors.
3. Prefer accessibility-first locators (`getByRole`, `getByLabel`, `getByText`) over auto-generated CSS classes — bookmaker frontends change without notice, and brittle selectors fail silently in ways that are hard to notice.
4. Fill the real values into `SELECTORS` in `selectors.ts`.
5. Switch `src/betpawa/index.ts` to export `realClient` instead of `stubClient`.
6. Re-run `npm run seed-fake-bet` + approve + `npm run run-once` with dry-run still on — this should now really log into BetPawa, navigate to the match, read the live odds, and stop before confirming. Check the logs and the `bet_placements.submitted_odds` value make sense.
7. Only after several clean dry runs: pick one bet, set `recommended_bets.dry_run = false` on that single row, temporarily set `settings.dry_run_default = false`, turn the kill switch off (`npm run kill-switch -- off`), let one cycle run, then immediately turn the kill switch back on (`npm run kill-switch -- on`) and set `dry_run_default` back to `true`.

## Running continuously

```sh
npm start
```

Polls every `POLL_INTERVAL_SECONDS` (default 30s). Stop it with Ctrl+C, or leave the kill switch on to make it a no-op without stopping the process.

## What's not built yet

The prediction model. `recommended_bets` is the clean interface it will write into — no schema or runner changes will be needed when it's added; it just needs to insert rows the same way `src/cli/seedFakeBet.ts` does.
