import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { catalogLookup } from "../catalog.js";
import type { Database, Product } from "../db/database.js";
import type { ProposalDraft, ReconcileInput, Reconciler, UnmatchedRow } from "./reconciler.js";

export type ProposedChangeView = {
  id: string;
  productId: number;
  sku: string;
  name: string;
  unit: string;
  currentPriceCents: number;
  proposedPriceCents: number;
  changePercent: number;
  reason: string;
  status: string;
};

export type ReconciliationView = {
  reconciliationId: string;
  supplierId: string;
  reconciler: string;
  proposedChanges: ProposedChangeView[];
  unchangedCount: number;
  unmatched: UnmatchedRow[];
};

/**
 * Runs a reconciler and stores its proposals as pending changes. Never touches
 * products.price_cents: applying a change is a separate, human-approved step.
 * Returns null if the supplier does not exist.
 */
export async function runReconciliation(
  db: Kysely<Database>,
  reconciler: Reconciler,
  input: ReconcileInput,
): Promise<ReconciliationView | null> {
  const supplier = await db
    .selectFrom("suppliers")
    .select("id")
    .where("id", "=", input.supplierId)
    .executeTakeFirst();
  if (!supplier) return null;

  const result = await reconciler.reconcile(input, catalogLookup(db, supplier.id));

  // Don't trust the reconciler's view of the catalog: re-read each proposed
  // product, scoped to this supplier, and take the current price from the DB.
  const drafts = new Map<number, ProposalDraft>(result.proposals.map((p) => [p.productId, p]));
  const products: Product[] =
    drafts.size === 0
      ? []
      : await db
          .selectFrom("products")
          .selectAll()
          .where("supplier_id", "=", supplier.id)
          .where("id", "in", [...drafts.keys()])
          .execute();
  const productsById = new Map(products.map((p) => [p.id, p]));

  const reconciliationId = randomUUID();
  const unmatched = [...result.unmatched];
  const rows = [];
  let unchangedCount = 0;
  for (const draft of drafts.values()) {
    const product = productsById.get(draft.productId);
    if (!product) {
      unmatched.push({
        row: `productId ${draft.productId}`,
        reason: "Not in this supplier's catalog",
      });
    } else if (product.price_cents === draft.proposedPriceCents) {
      unchangedCount++;
    } else {
      rows.push({
        reconciliation_id: reconciliationId,
        product_id: product.id,
        current_price_cents: product.price_cents,
        proposed_price_cents: draft.proposedPriceCents,
        reason: draft.reason,
      });
    }
  }

  const inserted =
    rows.length === 0
      ? []
      : await db.insertInto("proposed_changes").values(rows).returningAll().execute();

  return {
    reconciliationId,
    supplierId: supplier.id,
    reconciler: reconciler.name,
    proposedChanges: inserted.map((change) => {
      const product = productsById.get(change.product_id) as Product;
      return {
        id: change.id,
        productId: product.id,
        sku: product.supplier_sku,
        name: product.name,
        unit: product.unit,
        currentPriceCents: change.current_price_cents,
        proposedPriceCents: change.proposed_price_cents,
        changePercent: percentChange(change.current_price_cents, change.proposed_price_cents),
        reason: change.reason,
        status: change.status,
      };
    }),
    unchangedCount,
    unmatched,
  };
}

function percentChange(from: number, to: number): number {
  if (from === 0) return 100;
  return Math.round(((to - from) / from) * 1000) / 10;
}
