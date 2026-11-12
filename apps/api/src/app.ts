import Fastify, { type FastifyServerOptions } from "fastify";
import { type Kysely, sql } from "kysely";
import type { Database } from "./db/database.js";
import type { Reconciler } from "./reconcile/reconciler.js";
import { runReconciliation } from "./reconcile/service.js";

type AppDeps = {
  db: Kysely<Database>;
  reconciler: Reconciler;
  logger?: FastifyServerOptions["logger"];
};

type ReconciliationBody = { supplierId: string; priceList: string };

export function buildApp({ db, reconciler, logger = false }: AppDeps) {
  const app = Fastify({ logger });

  app.get("/health", async () => {
    await sql`select 1`.execute(db);
    return { status: "ok" };
  });

  app.post<{ Body: ReconciliationBody }>(
    "/reconciliations",
    {
      schema: {
        body: {
          type: "object",
          required: ["supplierId", "priceList"],
          additionalProperties: false,
          properties: {
            supplierId: { type: "string", minLength: 1 },
            priceList: { type: "string", minLength: 1, maxLength: 100_000 },
          },
        },
      },
    },
    async (request, reply) => {
      const result = await runReconciliation(db, reconciler, request.body);
      if (!result) {
        return reply.code(404).send({ error: `Unknown supplier: ${request.body.supplierId}` });
      }
      return reply.code(201).send(result);
    },
  );

  return app;
}
