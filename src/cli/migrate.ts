import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { logger } from "../runner/logger.js";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  logger.error("set SUPABASE_DB_URL env var (postgres connection string) before running this script");
  process.exit(1);
}

const migrationsDir = path.resolve("supabase/migrations");
const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();

  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    logger.info(`applying ${file}`);
    await client.query(sql);
  }

  const seedPath = path.resolve("supabase/seed.sql");
  const seedSql = readFileSync(seedPath, "utf8");
  logger.info("applying seed.sql");
  await client.query(seedSql);

  logger.info("all migrations applied");
  await client.end();
}

main().catch(async (err) => {
  logger.error({ err }, "migration failed");
  await client.end();
  process.exit(1);
});
