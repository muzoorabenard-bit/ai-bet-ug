// ⚠️ UNVERIFIED — every selector below is a placeholder guess. Nobody has
// inspected BetPawa's real live DOM in this project yet. Confirm each one
// against the actual site (see README's "Selector discovery" section) before
// login.ts/placeBet.ts leave stub mode. Prefer accessibility-first locators
// (getByRole/getByLabel/getByText) over brittle auto-generated CSS classes
// when you fill these in — bookmaker frontends change without notice.

export const SELECTORS = {
  login: {
    usernameInput: 'TODO: e.g. input[name="username"]',
    passwordInput: "TODO",
    submitButton: "TODO",
    loggedInMarker: "TODO: element only present when authenticated, e.g. account balance widget",
  },
  betSlip: {
    oddsButtonForSelection: "TODO: likely dynamic, keyed by market+selection text",
    stakeInput: "TODO",
    confirmButton: "TODO",
    confirmationBanner: "TODO: element/text confirming slip accepted, ideally containing a slip id",
  },
} as const;
