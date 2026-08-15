import { setKillSwitch } from "../db/settings.repo.js";
import { logger } from "../runner/logger.js";

const arg = process.argv[2];

if (arg !== "on" && arg !== "off") {
  logger.error('usage: npm run kill-switch -- on|off');
  process.exit(1);
}

setKillSwitch(arg === "on")
  .then(() => logger.info(`kill_switch set to ${arg === "on"}`))
  .catch((err) => {
    logger.error({ err }, "failed to set kill switch");
    process.exit(1);
  });
