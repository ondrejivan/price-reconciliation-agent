import { createSdkMcpServer, query, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { Reconciler } from "./reconciler.js";

const resultSchema = z.object({
  proposals: z.array(
    z.object({
      productId: z.number().int().describe("Catalog product id returned by lookup_product"),
      proposedPriceCents: z.number().int().nonnegative(),
      reason: z.string().describe("One sentence: which row matched and why"),
    }),
  ),
  unmatched: z.array(
    z.object({
      row: z.string().describe("The price list row as written by the supplier"),
      reason: z.string(),
    }),
  ),
});

const systemPrompt = `You reconcile supplier price lists against a retail product catalog.
For every item in the price list, call lookup_product (by SKU first, then by name) to find the matching catalog product.
Propose a price only when you are confident the row and the product are the same item in the same unit size.
Convert prices to integer cents. Put every row you cannot match confidently into "unmatched" with a short reason.
You cannot change prices yourself; a human reviews every proposal.`;

export function createClaudeReconciler(options: { model: string }): Reconciler {
  return {
    name: "claude",
    async reconcile({ supplierId, priceList }, lookup) {
      const catalog = createSdkMcpServer({
        name: "catalog",
        version: "0.1.0",
        tools: [
          tool(
            "lookup_product",
            "Search this supplier's catalog by exact supplier SKU and/or a product name fragment. Returns up to 5 products with id, sku, name, unit and current priceCents.",
            {
              sku: z
                .string()
                .optional()
                .describe("Supplier SKU, matched exactly (case-insensitive)"),
              name: z.string().optional().describe("Product name fragment, matched as a substring"),
            },
            async (args) => ({
              content: [{ type: "text", text: JSON.stringify(await lookup(args)) }],
            }),
            { annotations: { readOnlyHint: true } },
          ),
        ],
      });

      const messages = query({
        prompt: `Supplier: ${supplierId}\n\nPrice list:\n${priceList}`,
        options: {
          model: options.model,
          systemPrompt,
          mcpServers: { catalog },
          // No built-in Claude Code tools (Bash, Read, ...): the catalog tool is the only capability.
          tools: [],
          allowedTools: ["mcp__catalog__lookup_product"],
          permissionMode: "dontAsk",
          settingSources: [],
          persistSession: false,
          maxTurns: 30,
          outputFormat: { type: "json_schema", schema: z.toJSONSchema(resultSchema) },
        },
      });

      for await (const message of messages) {
        if (message.type !== "result") continue;
        if (message.subtype !== "success") {
          throw new Error(`Agent run failed: ${message.subtype}`);
        }
        return resultSchema.parse(message.structured_output);
      }
      throw new Error("Agent run ended without a result");
    },
  };
}
