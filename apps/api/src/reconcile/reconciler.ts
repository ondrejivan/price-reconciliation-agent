import type { LookupProduct } from "../catalog.js";

export type ReconcileInput = { supplierId: string; priceList: string };

export type ProposalDraft = {
  productId: number;
  proposedPriceCents: number;
  reason: string;
};

export type UnmatchedRow = { row: string; reason: string };

export type ReconcileResult = {
  proposals: ProposalDraft[];
  unmatched: UnmatchedRow[];
};

/**
 * Turns a supplier price list into proposed price changes. Implementations only
 * read the catalog through `lookup`; persisting proposals is the caller's job.
 */
export interface Reconciler {
  readonly name: string;
  reconcile(input: ReconcileInput, lookup: LookupProduct): Promise<ReconcileResult>;
}
