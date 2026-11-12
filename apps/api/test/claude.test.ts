import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";
import type { LookupProduct } from "../src/catalog.js";
import { createClaudeReconciler } from "../src/reconcile/claude.js";

type FakeTool = {
  name: string;
  handler: (args: unknown) => Promise<{ content: { text: string }[] }>;
};

// Plays the model's role: receives the query options, returns the SDK messages.
const fakeModel = vi.hoisted(() => ({
  run: undefined as unknown as (options: Options) => Promise<unknown[]>,
}));

// Replace the SDK with a fake that keeps tool handlers callable, so tests run
// without spawning Claude Code or calling the Anthropic API.
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  tool: (name: string, _description: string, _schema: unknown, handler: FakeTool["handler"]) => ({
    name,
    handler,
  }),
  createSdkMcpServer: (options: { tools: FakeTool[] }) => options,
  query: ({ options }: { options: Options }) =>
    (async function* () {
      yield* await fakeModel.run(options);
    })(),
}));

const lookup: LookupProduct = async () => [
  { id: 7, sku: "ACME-001", name: "Whole milk", unit: "1 L", priceCents: 119 },
];
const reconciler = createClaudeReconciler({ model: "sonnet" });
const input = { supplierId: "acme-foods", priceList: "ACME-001 whole milk 1L ... 1.29" };

describe("claude reconciler", () => {
  it("offers only lookup_product and returns the agent's structured output", async () => {
    let options: Options | undefined;
    fakeModel.run = async (opts) => {
      options = opts;
      const server = opts.mcpServers?.catalog as unknown as { tools: FakeTool[] };
      const lookupTool = server.tools.find((t) => t.name === "lookup_product");
      if (!lookupTool) throw new Error("lookup_product not registered");
      const toolResult = await lookupTool.handler({ sku: "ACME-001" });
      const [product] = JSON.parse(toolResult.content[0]?.text ?? "[]");
      return [
        {
          type: "result",
          subtype: "success",
          structured_output: {
            proposals: [{ productId: product.id, proposedPriceCents: 129, reason: "SKU match" }],
            unmatched: [],
          },
        },
      ];
    };

    const result = await reconciler.reconcile(input, lookup);

    expect(result).toEqual({
      proposals: [{ productId: 7, proposedPriceCents: 129, reason: "SKU match" }],
      unmatched: [],
    });
    expect(options?.tools).toEqual([]);
    expect(options?.allowedTools).toEqual(["mcp__catalog__lookup_product"]);
    expect(options?.outputFormat?.type).toBe("json_schema");
  });

  it("fails when the agent run does not succeed", async () => {
    fakeModel.run = async () => [{ type: "result", subtype: "error_max_turns" }];

    await expect(reconciler.reconcile(input, lookup)).rejects.toThrow("error_max_turns");
  });

  it("rejects structured output that does not match the schema", async () => {
    fakeModel.run = async () => [
      {
        type: "result",
        subtype: "success",
        structured_output: { proposals: [{ productId: "7" }] },
      },
    ];

    await expect(reconciler.reconcile(input, lookup)).rejects.toThrow();
  });
});
