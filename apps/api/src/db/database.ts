import { type Generated, Kysely, PostgresDialect, type Selectable } from "kysely";
import pg from "pg";

export interface SupplierTable {
  id: string;
  name: string;
  created_at: Generated<Date>;
}

export interface ProductTable {
  id: Generated<number>;
  supplier_id: string;
  supplier_sku: string;
  name: string;
  unit: string;
  price_cents: number;
  updated_at: Generated<Date>;
}

export type ProposedChangeStatus = "pending" | "approved" | "rejected";

export interface ProposedChangeTable {
  id: Generated<string>;
  reconciliation_id: string;
  product_id: number;
  current_price_cents: number;
  proposed_price_cents: number;
  reason: string;
  status: Generated<ProposedChangeStatus>;
  created_at: Generated<Date>;
}

export interface Database {
  suppliers: SupplierTable;
  products: ProductTable;
  proposed_changes: ProposedChangeTable;
}

export type Product = Selectable<ProductTable>;

export function createDb(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString, max: 5 }) }),
  });
}
