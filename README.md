# AI Bet UG

A soccer value-betting runner for the top 5 European leagues (EPL, La Liga, Serie A, Bundesliga, Ligue 1). Picks come from **Project Pi** (`../project-pi`, a separate repo whose `analyze-matches` Supabase Edge Function shares this exact Supabase project — see "Where picks come from" below); this repo's job is turning an approved pick into an actual BetPawa bet. Supabase holds all state (recommended bets, placements, settings, bankroll); a local Node/TypeScript process polls it and drives Playwright to place bets on BetPawa.

## ⚠️ Read this before flipping anything live

- BetPawa has no public betting API. Automated placement means Playwright driving your own logged-in account through their real website. This almost certainly breaches their Terms of Service — risk of account limitation, bet voiding, or forfeiture of funds. That's a risk you accepted going in; this project just tries to make the engineering side of it as safe as possible.
- **Fully autonomous as of 2026-08-16 — no human reviews an individual bet before it places for real.** Earlier versions of this project required a human to manually flip every `recommended_bets` row to `approved` in Supabase Studio before anything could place, regardless of dry-run/kill-switch state. That gate is gone by deliberate operator choice: `resolve-events` now auto-approves a bet the moment its BetPawa URL resolves (`src/db/recommendedBets.repo.ts`'s `autoApprove`), on its own daily schedule (`.github/workflows/poll.yml`). What's left standing between a Claude pick and real money is purely quantitative: Kelly abstaining with no edge, the stake caps, the weekly drawdown breaker, the kill switch, and the duplicate-placement guard — see "Money management" below. There is no longer a sanity check on whether an individual pick actually makes sense.
- `settings.dry_run_default` still exists and still governs whether an approved bet places for real or simulates — check it before assuming anything below is live.
- **The kill switch defaults to ON.** The runner does nothing until you explicitly turn it off (`npm run kill-switch -- off`). With approval now automatic too, this is the fastest way to pause everything.
- **No blind retries.** A failed placement stays `failed` and is never retried automatically — same reasoning as before (guards against a broken selector or a site hiccup silently repeating a stake), it just now needs a human to notice and manually re-approve it, since nothing else will.

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

Project Pi computes a Poisson model + a heuristic "Pressure Model" + situational signals (relegation desperation, draw-trap flags) from football-data.org fixtures/stats, then asks Claude to pick a bet. Its `analyze-matches` function (in the separate `project-pi` repo, not here) writes to its own `recommendations` table **and**, in the same run, bridges into this project's `recommended_bets` — mapping `bet_type`/`pick` onto BetPawa's actual market vocabulary (`1X2`, `Double Chance`, `BTTS`; `draw_no_bet` picks are skipped — no confirmed BetPawa market for it yet; `Over/Under 2.5` was retired from auto-placement 2026-08-16 as too risky — Claude is no longer prompted to suggest it, and the market is absent from both the bridge's mapping function and this repo's own market/selector maps, so a stray pick fails closed instead of placing), persisting `model_probability` and `pi_match_id` (links back to Project Pi's own `matches` row, used by settlement — see below), and leaving `bookmaker_event_url` null (a Deno edge function can't run Playwright). `recommended_stake` (a flat confidence-tier number) is written too but is purely an **advisory display value** for the human approval step — it never governs real money; see "Money management" below for what actually decides the stake.

That URL gets filled in automatically once a day (05:20 UTC, via `.github/workflows/poll.yml`), or manually any time:

```sh
npm run resolve-events
```

Fuzzy-matches each pending bet's team names (`src/betpawa/resolveMatch.ts`) against the relevant BetPawa league page (league→id map in `src/betpawa/leagues.ts`) and fills in `bookmaker_event_url`. Best-effort and conservative — leaves it null and logs a warning rather than guessing wrong; those rows stay `pending_review` (i.e. never auto-approved, never placed) until someone pastes a URL in manually. On a successful resolve, the bet is **auto-approved in the same step** (see the autonomy note above) — there's no separate review between "URL found" and "eligible to place."

Status as of 2026-08-16: verified working end-to-end against real fixtures (`recommendations` had been silently stalled since 2026-05-11 on exhausted Anthropic credits — topped up and fixed, along with three bugs found in the process: extended-thinking mode silently eating the whole `max_tokens` budget on some matches with no text output — fixed by disabling `thinking` and raising `max_tokens` to 2000; one match's failure aborting the whole batch instead of just that match — fixed with per-match error isolation; and a dedup check comparing recommendation-insertion time against the *fixture's* date rather than checking match_id existence outright — fixed, was silently producing duplicate picks whenever analysis ran the night before a fixture's date).

## Money management: Kelly staking, settlement, and the drawdown breaker

**A note on targets**: this system is built for a realistic, sustainable weekly return with strict risk controls — not to force any specific profit target. A staking system tuned to hit a large weekly percentage target reliably would require gambler's-ruin-level variance; the design below deliberately trades that off for capital preservation. Treat any single good week as upside, not the baseline.

**Fractional-Kelly stake sizing** — the real stake is decided in `processBet.ts`'s `resolveStake` callback, invoked from inside `placeBet.ts` right after the real odds are read live from BetPawa (not a second page navigation — see the doc comment on `ResolveStake` in `betpawa/types.ts` for why). Formula (`src/guardrails/kelly.ts`): `f* = p - (1-p)/b` where `b = odds - 1`, capped at `settings.kelly_fraction_cap` (quarter-Kelly by default) of full Kelly. **Abstains** (skips the bet entirely, never forces a stake) when the real odds imply no edge over `model_probability`, or when the computed stake falls below `settings.min_viable_stake` — a too-small Kelly stake is never rounded *up* to a floor, since that would silently override the sizing discipline in the wrong direction. An abstain shows up as `bet_placements.status = 'aborted_guardrail'` / `recommended_bets.status = 'skipped'`, not `'failed'`.

**Settlement pipeline** (lives in Project Pi — `supabase/functions/settle-results/index.ts`, hourly cron): the piece that closes the loop nothing else in this project ever did before — checking whether a placed bet actually won. Three idempotent phases, each re-deriving its own worklist every run (a crash between phases just means the next scheduled run resumes cleanly): (1) fetch real results from football-data.org for matches whose kickoff has passed, (2) settle Project Pi's own `recommendations.result` dashboard column, (3) settle `bet_placements` (`result`/`payout`/`settled_at`) and update the bankroll via the atomic `append_bankroll_entry()` Postgres function — the only legal way to write `bankroll_ledger` now, since settlement (Project Pi, on its own schedule) and the poll loop (this repo) are two independent, concurrent writers. Verified end-to-end this session with synthetic won-bet data (correct win/payout/ledger entry, confirmed idempotent on replay).

**Weekly drawdown circuit breaker** — `pollLoop.ts` checks every cycle (independent of whether anything is queued, since the bankroll moves asynchronously via settlement) whether the week's realized P&L has crossed `-settings.weekly_drawdown_limit_pct` (default 20%) against a stored `week_start_bankroll` baseline, auto-rolling that baseline over every 7 days. A breach trips `kill_switch = true` automatically — stopping the whole week, not just one bet. Verified live by simulating a -33% week and confirming the trip.

**Before trusting any of this with real stakes**: `settings.max_stake_per_bet`/`max_daily_stake_total` must be sized against your *actual* bankroll (recalibrated this session from placeholder flat-staking values of 5/20 to 2000/6000 against a ~20,000 UGX bankroll — these are safety ceilings layered on top of Kelly, not a replacement for it, and need revisiting if the bankroll changes materially). `settings.min_viable_stake` (default 500) must stay above BetPawa's real minimum stake (confirmed UGX 1.00 via recon — comfortably satisfied by the default, but re-check if that changes).

**Not built yet**: self-improving calibration (adjusting `kelly_fraction_cap` or per-market participation from realized win-rate vs. `model_probability`, tracked via the now-populated `bet_placements.kelly_fraction_applied`/`result`/`payout` columns) needs real settled volume to accumulate first — this is the natural next step once there's a few weeks of settlement history.

## Proving the state machine (no real BetPawa involved)

`src/betpawa/index.ts` exports `realClient` (see "BetPawa automation status" below) — for pipeline-only testing that never opens a browser, temporarily swap it to `stubClient` (simulates the shape of a placement, including exercising the Kelly `resolveStake` callback with a fake odds value, so guardrail behavior gets tested too), then swap back to `realClient` afterward. This lets you verify guardrails, dry-run, the kill switch, and the duplicate-placement guard in isolation before any real automation risk.

```sh
npm run seed-fake-bet     # inserts one fake recommended_bet, status='pending_review'
```

Then in Supabase Studio, flip that row's `status` to `approved`.

```sh
npm run run-once          # runs a single poll cycle
```

You should see a `dry_run_success` row appear in `bet_placements` and the `recommended_bets` row move to `placed`. Try seeding + approving the same bet twice in quick succession and running `run-once` — the second attempt should be blocked by the duplicate-placement guard (backed by a Postgres partial unique index, not just application logic).

## BetPawa automation status

`src/betpawa/index.ts` exports `realClient` — **live as of 2026-08-16**. Login, dry-run, and one real placement (Double Chance/X2 on RCD Espanyol de Barcelona v Levante UD, stake UGX 2, slip #12654578206) have all been verified against the live site.

Two site-specific quirks baked into the code: it's a client-rendered SPA (`session.ts`/`placeBet.ts` wait for a fixed delay after navigation rather than `networkidle`, since match pages stream live odds continuously and never go idle), and the mobile-number field wants the **local number without the `256` prefix** (stripped automatically from `BETPAWA_PHONE`).

**Important lesson from that first live bet**: `SELECTORS.betSlip.confirmationBanner` was an unverified guess and turned out wrong — the "Place bet" click succeeded for real (balance dropped by exactly the stake) but the banner selector never matched, so `placeBetFlow` threw and the bet was initially recorded as `failed` even though it had genuinely succeeded. **`placeBet.ts` no longer trusts the banner as the success signal** — it reads the account balance before and after clicking confirm and treats a balance drop matching the stake as the authoritative success signal, regardless of whether any banner text matched. The banner selector is now purely a best-effort bonus for capturing a slip reference; a miss there is harmless and no longer fails the placement. If you ever see a `failed` bet_placements row for a live (non-dry-run) attempt, still double check BetPawa's "My Bets" / balance manually before re-approving — the balance check is much more reliable than a banner guess, but "manually verify before any retry" remains the right instinct any time a live placement errors.

To run a dry-run proof before trusting a new market/selection combo (or after any code change to the placement path) — since approval is now automatic, the only manual lever left is `dry_run_default` itself:

1. With `settings.dry_run_default = true`, let `resolve-events` auto-approve a bet normally, then `npm run run-once` — this really logs into BetPawa, navigates to the match, reads live odds for the right market/selection, fills the stake, and stops. Check `bet_placements.submitted_odds` looks sane for the market.
2. Only after a clean dry run: flip `settings.dry_run_default = false` (globally — there's no longer a manual per-bet review step to scope it to a single row). The very next bet that auto-approves will place for real.

## Running continuously

```sh
npm start
```

Polls every `POLL_INTERVAL_SECONDS` (default 30s). Stop it with Ctrl+C, or leave the kill switch on to make it a no-op without stopping the process. `resolve-events` isn't part of this loop — it runs on its own schedule (see below) since it only needs to happen roughly once a day, not every poll cycle. Useful for local testing, but `npm start` only acts while this process is actually running on some machine — see below for running independent of any one PC.

## Running independent of any one PC (GitHub Actions)

`.github/workflows/poll.yml` has two scheduled jobs: `run-once` (`npm run run-once`, every 30 min — places anything already `approved`) and `resolve-events` (`npm run resolve-events`, daily at 05:20 UTC, 15 min after Project Pi's `analyze-matches` cron — resolves fresh picks' BetPawa URLs and, in fully-autonomous mode, auto-approves them in the same step). Both run on GitHub's infrastructure, not a continuously-running process. Nothing in the system is time-critical until a bet is already approved — real odds are read live from BetPawa at execution time regardless of how long a `recommended_bets` row sat `approved` first — so these scheduled cadences lose nothing versus true continuous polling.

**One-time setup**, since this needs your GitHub account access I don't have in this session:

1. Create a **private** GitHub repo for this project (private matters here — the code and README document real automated bet placement that breaches BetPawa's ToS; keep that out of a public repo even though secrets themselves are equally safe either way).
2. `git remote add origin <your-repo-url>` and `git push -u origin main`.
3. In the repo's Settings → Secrets and variables → Actions, add: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BETPAWA_PHONE`, `BETPAWA_PASSWORD` (same values as your local `.env`).
4. Confirm it works: Actions tab → "Poll loop" → Run workflow (manual trigger via `workflow_dispatch` runs both jobs, don't wait for the schedule) → check both the `run-once` and `resolve-events` job logs.

**Real tradeoff worth knowing**: `storageState/betpawa.json` (the saved login session) is gitignored on purpose — it's a live session credential, not something to commit. That means every Actions run logs in fresh, from a GitHub-hosted runner's datacenter IP rather than a stable home IP, and never reuses a session. That's a meaningfully different fingerprint than how the one real bet this project has placed so far was tested (this PC, one persistent session). It's a plausible contributor to account-review risk on top of the automation risk already accepted — worth watching "My Bets"/account status a bit more closely once this is live, especially in the first few days.

Also watch Actions usage under repo Settings → Billing if the repo is private (~2000 free minutes/month) — loosen the cron in `poll.yml` (e.g. `*/45 * * * *` or hourly) if it's burning through the budget faster than expected.
