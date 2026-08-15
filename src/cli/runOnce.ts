import { runOneCycle } from "../runner/pollLoop.js";
import { logger } from "../runner/logger.js";

runOneCycle()
  .then(() => logger.info("run-once cycle complete"))
  .catch((err) => {
    logger.error({ err }, "run-once cycle failed");
    process.exit(1);
  });
