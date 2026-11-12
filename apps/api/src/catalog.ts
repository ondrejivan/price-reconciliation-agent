import type { Kysely } from "kysely";
import type { Database } from "./db/database.js";

export type CatalogProduct = {
  id: number;
  sku: string;
  name: string;
  unit: string;
  priceCents: number;
};

export type ProductQuery = { sku?: string; name?: string };

/** Looks up products in one supplier's catalog. Bound to a supplier so callers cannot read other catalogs. */
export type LookupProduct = (query: ProductQuery) => Promise<CatalogProduct[]>;

export function catalogLookup(db: Kysely<Database>, supplierId: string): LookupProduct {
  return async ({ sku, name }) => {
    if (!sku && !name) return [];
    const rows = await db
      .selectFrom("products")
      .select(["id", "supplier_sku", "name", "unit", "price_cents"])
      .where("supplier_id", "=", supplierId)
      .where((eb) =>
        eb.or([
          ...(sku ? [eb(eb.fn("upper", ["supplier_sku"]), "=", sku.trim().toUpperCase())] : []),
          ...(name ? [eb("name", "ilike", `%${name.trim()}%`)] : []),
        ]),
      )
      .orderBy("id")
      .limit(5)
      .execute();
    return rows.map((row) => ({
      id: row.id,
      sku: row.supplier_sku,
      name: row.name,
      unit: row.unit,
      priceCents: row.price_cents,
    }));
  };
}
