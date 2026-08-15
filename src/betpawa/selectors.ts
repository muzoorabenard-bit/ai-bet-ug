// Verified against the live site 2026-08-15 via src/cli/reconLogin.ts (a
// throwaway reconnaissance script — see git history / README). The bet-slip
// selectors are still unverified placeholders — nobody has walked through an
// actual bet placement yet. Bookmaker frontends change without notice:
// re-verify with reconLogin.ts-style inspection if login starts failing.

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
    // ⚠️ UNVERIFIED — nobody has walked through a real bet placement yet.
    oddsButtonForSelection: "TODO: likely dynamic, keyed by market+selection text",
    stakeInput: "TODO",
    confirmButton: "TODO",
    confirmationBanner: "TODO: element/text confirming slip accepted, ideally containing a slip id",
  },
} as const;
