// Verified against the live site 2026-08-16 via src/cli/reconLogin.ts and
// src/cli/reconBetSlip.ts (throwaway reconnaissance scripts — see git
// history). Bookmaker frontends change without notice: re-verify with the
// same recon-script approach if login or bet placement starts failing.

export const SELECTORS = {
  login: {
    // Navbar trigger that opens the login form (there are a few "Login"
    // texts on the page; the navbar one is first in DOM order).
    loginTrigger: 'text=Login',
    // Phone number field takes the LOCAL number without the +256 prefix
    // (the prefix is a fixed label next to the input, not part of its value).
    usernameInput: 'input[name="username"]',
    // Password input's id is a React-generated useId (e.g. "«r5»") and is
    // NOT stable across reloads/builds — use the name attribute instead.
    passwordInput: 'input[name="password"]',
    // Scoped to the form containing the password field, since a
    // button[type="submit"] elsewhere on the page (e.g. "Load Betslip")
    // would otherwise also match.
    submitButton: 'form:has(input[name="password"]) button[type="submit"]',
    // Simple, human-readable marker that only appears once authenticated.
    loggedInMarker: 'text=View My Bets',
  },
  betSlip: {
    stakeInput: 'input[name="stake"]',
    // "text=" substring match — unique on the page, no other button's text
    // contains "Place bet" (confirmed via reconBetSlip.ts's button dump).
    confirmButton: "text=Place bet",
    // ⚠️ UNVERIFIED — nobody has clicked an actual confirm button yet (all
    // recon stopped short of that deliberately). Best guess pending a real
    // (small-stake) live placement test.
    confirmationBanner: "TODO: element/text confirming slip accepted, ideally containing a slip id",
  },
  // Exact market-card heading text, verified via reconBetSlip.ts against a
  // real match page. Each has near-identical sibling headings on the same
  // page (team-specific or combo-market variants) that an exact string match
  // correctly excludes — see marketCard.ts.
  marketHeadings: {
    "1X2": "1X2 | Full Time",
    "Double Chance": "Double Chance | Full Time",
    BTTS: "Both Teams To Score | Full Time",
    "Over/Under 2.5": "Over/Under | Full Time",
  },
} as const;
