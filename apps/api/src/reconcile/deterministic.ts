import { parse } from "csv-parse/sync";
import type { ReconcileResult, Reconciler } from "./reconciler.js";

/** Parses "1.29", "1,29" or "€1.29" into cents. Returns null for anything else. */
export function parsePriceCents(value: string | undefined): number | null {
  const normalized = value?.replace(/[^\d.,]/g, "").replace(",", ".");
  if (!normalized || !/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/**
 * Matches CSV rows with `sku` and `price` columns to the catalog by exact SKU.
 * No model involved: used in tests, and locally when no ANTHROPIC_API_KEY is set.
 */
export const deterministicReconciler: Reconciler = {
  name: "deterministic",
  async reconcile({ priceList }, lookup) {
    const rows: Record<string, string>[] = parse(priceList, {
      columns: (header: string[]) => header.map((column) => column.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
    });

    const result: ReconcileResult = { proposals: [], unmatched: [] };
    for (const row of rows) {
      const line = Object.values(row).join(",");
      const sku = row.sku;
      const priceCents = parsePriceCents(row.price);
      if (!sku || priceCents === null) {
        result.unmatched.push({ row: line, reason: "Row needs a sku and a numeric price" });
        continue;
      }
      const [product] = (await lookup({ sku })).filter(
        (p) => p.sku.toUpperCase() === sku.toUpperCase(),
      );
      if (!product) {
        result.unmatched.push({ row: line, reason: `No catalog product with SKU ${sku}` });
        continue;
      }
      result.proposals.push({
        productId: product.id,
        proposedPriceCents: priceCents,
        reason: `Exact SKU match on ${sku}; supplier lists ${row.price}`,
      });
    }
    return result;
  },
};
