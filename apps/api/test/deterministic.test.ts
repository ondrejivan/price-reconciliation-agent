import { describe, expect, it } from "vitest";
import type { CatalogProduct, LookupProduct } from "../src/catalog.js";
import { deterministicReconciler, parsePriceCents } from "../src/reconcile/deterministic.js";

const catalog: CatalogProduct[] = [
  { id: 1, sku: "ACME-001", name: "Whole milk", unit: "1 L", priceCents: 119 },
  { id: 2, sku: "ACME-002", name: "Butter", unit: "250 g", priceCents: 249 },
];
const lookup: LookupProduct = async ({ sku }) =>
  catalog.filter((p) => p.sku === sku?.toUpperCase());

describe("parsePriceCents", () => {
  it.each([
    ["1.29", 129],
    ["1,29", 129],
    ["€ 2.5", 250],
    ["3", 300],
  ])("parses %s", (input, expected) => {
    expect(parsePriceCents(input)).toBe(expected);
  });

  it.each(["", "abc", "1.299", undefined])("rejects %s", (input) => {
    expect(parsePriceCents(input)).toBeNull();
  });
});

describe("deterministicReconciler", () => {
  it("matches rows by SKU and reports the rest as unmatched", async () => {
    const priceList =
      "SKU,Name,Price\nacme-001,Whole milk 1L,1.29\nACME-999,Oat milk,1.89\nACME-002,Butter,n/a\n";

    const result = await deterministicReconciler.reconcile(
      { supplierId: "acme-foods", priceList },
      lookup,
    );

    expect(result.proposals).toEqual([
      {
        productId: 1,
        proposedPriceCents: 129,
        reason: "Exact SKU match on acme-001; supplier lists 1.29",
      },
    ]);
    expect(result.unmatched.map((u) => u.reason)).toEqual([
      "No catalog product with SKU ACME-999",
      "Row needs a sku and a numeric price",
    ]);
  });
});
