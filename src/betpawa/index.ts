import type { BetPawaClient } from "./types.js";
import { realClient } from "./realClient.js";

export const betPawaClient: BetPawaClient = realClient;
