import { type Kysely, sql } from "kysely";

// Migrations take Kysely<unknown> on purpose: they must not depend on the
// current Database type, which describes the schema after the last migration.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("suppliers")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("products")
    .addColumn("id", "integer", (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn("supplier_id", "text", (col) => col.notNull().references("suppliers.id"))
    .addColumn("supplier_sku", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("unit", "text", (col) => col.notNull())
    .addColumn("price_cents", "integer", (col) => col.notNull().check(sql`price_cents >= 0`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("products_supplier_sku_key", ["supplier_id", "supplier_sku"])
    .execute();

  await db.schema
    .createTable("proposed_changes")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("reconciliation_id", "uuid", (col) => col.notNull())
    .addColumn("product_id", "integer", (col) => col.notNull().references("products.id"))
    .addColumn("current_price_cents", "integer", (col) => col.notNull())
    .addColumn("proposed_price_cents", "integer", (col) =>
      col.notNull().check(sql`proposed_price_cents >= 0`),
    )
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) =>
      col.notNull().defaultTo("pending").check(sql`status in ('pending', 'approved', 'rejected')`),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex("proposed_changes_reconciliation_id_idx")
    .on("proposed_changes")
    .column("reconciliation_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("proposed_changes").execute();
  await db.schema.dropTable("products").execute();
  await db.schema.dropTable("suppliers").execute();
}
