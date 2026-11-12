// Usage: node dist/migrate.js [--seed]
import { createDb } from "./db/database.js";
import { migrateToLatest } from "./db/migrator.js";
import { seed } from "./db/seed.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const db = createDb(databaseUrl);
try {
  await migrateToLatest(db);
  if (process.argv.includes("--seed")) await seed(db);
} finally {
  await db.destroy();
}
