import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createDb, type Database } from "../src/db/database.js";
import { migrateToLatest } from "../src/db/migrator.js";
import { seed } from "../src/db/seed.js";
import { deterministicReconciler } from "../src/reconcile/deterministic.js";

let container: StartedPostgreSqlContainer;
let db: Kysely<Database>;
let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  db = createDb(container.getConnectionUri());
  await migrateToLatest(db);
  await seed(db);
  app = buildApp({ db, reconciler: deterministicReconciler });
});

afterAll(async () => {
  await app?.close();
  await db?.destroy();
  await container?.stop();
});

const priceList = `sku,name,price
ACME-001,Whole milk 1L,1.29
ACME-002,Butter 250g,2.49
ACME-003,Greek yogurt 500g,2.15
ACME-999,Oat milk 1L,1.89
NB-100,Rye bread 500g,2.99
`;

describe("POST /reconciliations", () => {
  it("stores proposed changes as pending and leaves catalog prices alone", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/reconciliations",
      payload: { supplierId: "acme-foods", priceList },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.unchangedCount).toBe(1);
    expect(
      body.proposedChanges.map((c: Record<string, unknown>) => [
        c.sku,
        c.currentPriceCents,
        c.proposedPriceCents,
        c.changePercent,
        c.status,
      ]),
    ).toEqual([
      ["ACME-001", 119, 129, 8.4, "pending"],
      ["ACME-003", 199, 215, 8, "pending"],
    ]);
    // NB-100 exists, but belongs to another supplier, so it must not match.
    expect(body.unmatched.map((u: { row: string }) => u.row.split(",")[0])).toEqual([
      "ACME-999",
      "NB-100",
    ]);

    const stored = await db
      .selectFrom("proposed_changes")
      .select(["status", "proposed_price_cents"])
      .where("reconciliation_id", "=", body.reconciliationId)
      .execute();
    expect(stored).toHaveLength(2);
    expect(stored.every((row) => row.status === "pending")).toBe(true);

    const milk = await db
      .selectFrom("products")
      .select("price_cents")
      .where("supplier_sku", "=", "ACME-001")
      .executeTakeFirstOrThrow();
    expect(milk.price_cents).toBe(119);
  });

  it("returns 404 for an unknown supplier", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/reconciliations",
      payload: { supplierId: "nope", priceList },
    });
    expect(response.statusCode).toBe(404);
  });

  it("returns 400 for an invalid body", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/reconciliations",
      payload: { supplierId: "acme-foods" },
    });
    expect(response.statusCode).toBe(400);
  });
});

describe("GET /health", () => {
  it("reports ok when the database is reachable", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
