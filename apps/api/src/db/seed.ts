import type { Kysely } from "kysely";
import type { Database } from "./database.js";

const suppliers = [
  { id: "acme-foods", name: "ACME Foods" },
  { id: "nordic-bakery", name: "Nordic Bakery" },
];

const products = [
  {
    supplier_id: "acme-foods",
    supplier_sku: "ACME-001",
    name: "Whole milk",
    unit: "1 L",
    price_cents: 119,
  },
  {
    supplier_id: "acme-foods",
    supplier_sku: "ACME-002",
    name: "Butter",
    unit: "250 g",
    price_cents: 249,
  },
  {
    supplier_id: "acme-foods",
    supplier_sku: "ACME-003",
    name: "Greek yogurt",
    unit: "500 g",
    price_cents: 199,
  },
  {
    supplier_id: "acme-foods",
    supplier_sku: "ACME-004",
    name: "Cheddar cheese",
    unit: "200 g",
    price_cents: 329,
  },
  {
    supplier_id: "acme-foods",
    supplier_sku: "ACME-005",
    name: "Free-range eggs",
    unit: "10 pcs",
    price_cents: 289,
  },
  {
    supplier_id: "acme-foods",
    supplier_sku: "ACME-006",
    name: "Sourdough bread",
    unit: "800 g",
    price_cents: 349,
  },
  {
    supplier_id: "nordic-bakery",
    supplier_sku: "NB-100",
    name: "Rye bread",
    unit: "500 g",
    price_cents: 259,
  },
  {
    supplier_id: "nordic-bakery",
    supplier_sku: "NB-101",
    name: "Cinnamon buns",
    unit: "4 pcs",
    price_cents: 399,
  },
];

// Idempotent: re-running resets the sample catalog to these values.
export async function seed(db: Kysely<Database>): Promise<void> {
  await db
    .insertInto("suppliers")
    .values(suppliers)
    .onConflict((oc) => oc.column("id").doUpdateSet((eb) => ({ name: eb.ref("excluded.name") })))
    .execute();

  await db
    .insertInto("products")
    .values(products)
    .onConflict((oc) =>
      oc.columns(["supplier_id", "supplier_sku"]).doUpdateSet((eb) => ({
        name: eb.ref("excluded.name"),
        unit: eb.ref("excluded.unit"),
        price_cents: eb.ref("excluded.price_cents"),
      })),
    )
    .execute();

  console.log(`seeded ${suppliers.length} suppliers and ${products.length} products`);
}
