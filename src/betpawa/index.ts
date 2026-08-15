import type { BetPawaClient } from "./types.js";
import { stubClient } from "./stubClient.js";

// Swap this for `realClient` (see realClient.ts) once selectors.ts has been
// filled in and verified per the README's "Selector discovery" walkthrough.
export const betPawaClient: BetPawaClient = stubClient;
