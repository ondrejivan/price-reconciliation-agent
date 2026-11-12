import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/database.js";
import { createClaudeReconciler } from "./reconcile/claude.js";
import { deterministicReconciler } from "./reconcile/deterministic.js";

const config = loadConfig();
const db = createDb(config.databaseUrl);
const reconciler =
  config.reconciler === "claude"
    ? createClaudeReconciler({ model: config.claudeModel })
    : deterministicReconciler;

const app = buildApp({ db, reconciler, logger: true });
app.addHook("onClose", () => db.destroy());

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void app.close());
}

app.log.info({ reconciler: reconciler.name }, "starting");
await app.listen({ host: "0.0.0.0", port: config.port });
