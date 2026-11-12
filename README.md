# price-reconciliation-agent

A retail ops agent that reconciles supplier price lists against a product catalog in Postgres.

A supplier sends a price list. The agent matches each row to a catalog product and returns
**proposed** price changes. They are stored as `pending` for a human to approve. The agent
never writes catalog prices.

Stack: TypeScript, Fastify, Kysely on Postgres, Claude Agent SDK with an in-process MCP tool,
Docker Compose, Vitest + Testcontainers, GitHub Actions, Terraform for GCP Cloud Run.

This is a walking skeleton. Price lists arrive as CSV text in the request body for now. PDF and
email ingestion, the approval flow, evals, and tracing come later.

## Architecture

```
                POST /reconciliations { supplierId, priceList }
                                  │
                        ┌─────────▼──────────┐
                        │  Fastify (app.ts)  │  validates the body, 404 on unknown supplier
                        └─────────┬──────────┘
                                  │
                   ┌──────────────▼───────────────┐
                   │ runReconciliation (service)  │  re-reads proposed products from the DB,
                   │                              │  drops unchanged prices and other suppliers'
                   └──────┬────────────────┬──────┘  products, stores the rest as pending
                          │ Reconciler     │
            ┌─────────────▼──┐      ┌──────▼──────────────────────────┐
            │ deterministic  │      │ claude (Agent SDK)              │
            │ exact SKU, CSV │      │ in-process MCP server "catalog" │
            └───────┬────────┘      │   └ tool: lookup_product        │
                    │               │ built-in tools disabled         │
                    │               │ JSON-schema structured output   │
                    │               └──────┬──────────────────────────┘
                    └──────────┬───────────┘
                               │ lookupProduct (scoped to one supplier, read-only)
                     ┌─────────▼──────────┐
                     │ Postgres (Kysely)  │  suppliers, products, proposed_changes
                     └────────────────────┘
```

Code map (`apps/api/src`):

| File                         | Role                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| `server.ts`                  | Entry point: reads config and picks a reconciler            |
| `app.ts`                     | Fastify routes: `GET /health`, `POST /reconciliations`      |
| `reconcile/service.ts`       | Runs a reconciler, applies guardrails, stores proposals     |
| `reconcile/claude.ts`        | Claude Agent SDK agent with the `lookup_product` MCP tool   |
| `reconcile/deterministic.ts` | Exact-SKU CSV matcher, used without an API key and in tests |
| `catalog.ts`                 | The catalog query behind `lookup_product`                   |
| `db/`                        | Kysely types, migrations, and sample seed data              |
| `migrate.ts`                 | CLI: `node dist/migrate.js [--seed]`                        |

Which reconciler runs: `RECONCILER=claude|deterministic`. If it's unset, the API uses `claude`
when `ANTHROPIC_API_KEY` is set and `deterministic` otherwise.

## Run locally

You need Docker. To use the Claude agent, also set an Anthropic API key.

```bash
cp .env.example .env          # optionally set ANTHROPIC_API_KEY
docker compose up --build     # Postgres, then migrate + seed, then the API on :3000
```

To work on the code with hot reload, install Node 22+ and pnpm 10:

```bash
pnpm install
docker compose up -d db
export DATABASE_URL=postgres://pra:pra@localhost:5432/pra
pnpm --filter @pra/api db:seed   # migrate and load the sample catalog
pnpm --filter @pra/api dev       # http://localhost:3000
```

Checks:

```bash
pnpm lint && pnpm typecheck && pnpm test   # tests need Docker for Testcontainers
```

## Sample request

The seed data has two suppliers, `acme-foods` and `nordic-bakery`, and eight products.
[`examples/acme-price-list.csv`](examples/acme-price-list.csv) has the same rows as this request.

```bash
curl -s -X POST localhost:3000/reconciliations \
  -H 'content-type: application/json' \
  -d '{"supplierId":"acme-foods","priceList":"sku,name,price\nACME-001,Whole milk 1L,1.29\nACME-002,Butter 250g,2.49\nACME-003,Greek yogurt 500g,2.15\nACME-999,Oat milk 1L,1.89\n"}'
```

Response (`201`, deterministic reconciler, ids vary):

```json
{
  "reconciliationId": "3ec330ab-8ab1-4d44-853a-7c761d339f9e",
  "supplierId": "acme-foods",
  "reconciler": "deterministic",
  "proposedChanges": [
    {
      "id": "7f3921b8-4d68-4c0e-a475-4795b1f22788",
      "productId": 1,
      "sku": "ACME-001",
      "name": "Whole milk",
      "unit": "1 L",
      "currentPriceCents": 119,
      "proposedPriceCents": 129,
      "changePercent": 8.4,
      "reason": "Exact SKU match on ACME-001; supplier lists 1.29",
      "status": "pending"
    },
    {
      "id": "5a57db54-2c3d-4e72-a740-a6680f87ad6b",
      "productId": 3,
      "sku": "ACME-003",
      "name": "Greek yogurt",
      "unit": "500 g",
      "currentPriceCents": 199,
      "proposedPriceCents": 215,
      "changePercent": 8,
      "reason": "Exact SKU match on ACME-003; supplier lists 2.15",
      "status": "pending"
    }
  ],
  "unchangedCount": 1,
  "unmatched": [
    { "row": "ACME-999,Oat milk 1L,1.89", "reason": "No catalog product with SKU ACME-999" }
  ]
}
```

Butter's price matches the catalog, so it only counts toward `unchangedCount`. The Claude
reconciler returns the same shape, with `reason` texts written by the model. It is meant for
rows the SKU matcher can't handle, such as `"Milk whole 1 litre .... EUR 1,29"`, because it can
also search by name.

`GET /health` returns `{"status":"ok"}` once the database is reachable.

## Deploy to GCP

Terraform in [`infra/terraform`](infra/terraform) creates:

- Artifact Registry for images
- Cloud SQL Postgres 16 on `db-f1-micro`, reached from Cloud Run over the Cloud SQL connector
- Secret Manager secrets for `DATABASE_URL` and the Anthropic key
- The Cloud Run service and a Cloud Run job that runs migrations and the seed
- Workload identity federation so GitHub Actions on `main` can deploy without a key file

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # set project_id
gcloud auth application-default login
terraform init && terraform apply
```

The first apply deploys Google's `hello` image. To make the real app go live:

1. Copy the three `github_secret_*` outputs into GitHub repository secrets: `GCP_PROJECT_ID`,
   `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`.
2. Push to `main` or run the Deploy workflow manually. It builds and pushes the image, runs the
   migrate job, deploys the service, and checks `/health`.
3. Optional: to switch to Claude, add the key and re-apply.

   ```bash
   printf %s "$ANTHROPIC_API_KEY" | gcloud secrets versions add price-reconciliation-api-anthropic-api-key --data-file=-
   terraform apply -var reconciler=claude
   ```

The deploy workflow skips cleanly, with a notice, while those secrets are missing, so CI stays
green before GCP exists. Costs: Cloud SQL `db-f1-micro` runs about USD 10 a month, and Cloud Run
scales to zero. `db_deletion_protection` defaults to `true`, so set it to `false` before
`terraform destroy`.

Alternative to Cloud SQL: a free Neon or Supabase Postgres. Put its URL in the `DATABASE_URL`
secret, then remove the `google_sql_*` resources and the `cloudsql` volume.

## Design choices and rejected alternatives

- **Claude Agent SDK, not the plain Anthropic SDK.** The task is a tool-using loop: look up a
  row, then decide. The Agent SDK runs that loop, hosts the MCP tool in-process with
  `createSdkMcpServer`, and validates structured output against a JSON schema. The cost is
  weight. It starts a native Claude Code binary per request, which is why the image is Debian
  slim, not Alpine, and Cloud Run gets 1 GiB. All built-in tools are turned off (`tools: []`,
  `permissionMode: "dontAsk"`, no filesystem settings), so `lookup_product` is the agent's only
  capability. If latency or memory becomes a problem, the `Reconciler` interface lets you swap in
  a hand-written loop on `@anthropic-ai/sdk` without touching the API.
- **The model proposes and code decides.** The service re-reads every proposed product, scoped
  to the supplier, and takes the current price from the database, not from the model. It drops
  unchanged prices and stores the rest as `pending`. Nothing writes `products.price_cents`.
- **One MCP tool, bound to one supplier.** `lookup_product` is created per request with the
  supplier id baked in, so the model can't read other suppliers' catalogs.
- **A deterministic reconciler behind the same interface,** instead of mocking HTTP. Tests and
  local runs don't need a key. The Claude reconciler gets its own unit tests with the SDK mocked.
  The integration test runs the full HTTP, service, and Postgres path through Testcontainers.
- **One app in a pnpm workspace,** with no `packages/db` yet. A shared package adds build
  plumbing that a single service doesn't need. Extract one when a second app, such as an email
  ingestion worker, needs the schema.
- **Migrations as a separate step,** a Compose service locally and a Cloud Run job in GCP, not
  run on server boot. A failed migration then stops the deploy before any traffic moves.
  Migrations are imported statically, so the same code runs under tsx, vitest, and `node dist`.
- **Integer cents, not floats or `numeric`.** No rounding surprises, and the type maps directly
  to a JS number.
- **Biome instead of ESLint + Prettier.** One dev dependency and one config file.
- **Rejected for now:** a queue or async jobs (a request takes seconds, not minutes), an ORM
  (Kysely stays close to SQL and is fully typed), and fuzzy matching in SQL with `pg_trgm`
  (name matching is the model's job, and the tool offers a simple `ILIKE`).
