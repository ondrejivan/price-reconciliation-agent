import type { Kysely } from "kysely";
import { type Migration, Migrator } from "kysely/migration";
import type { Database } from "./database.js";
import * as m0001 from "./migrations/0001_init.js";

// Migrations are imported statically rather than read from disk, so they work
// the same under tsx, vitest and the compiled build.
const migrations: Record<string, Migration> = {
  "0001_init": m0001,
};

export async function migrateToLatest(db: Kysely<Database>): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => migrations },
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const result of results ?? []) {
    console.log(`migration ${result.migrationName}: ${result.status}`);
  }
  if (error) throw error;
}
