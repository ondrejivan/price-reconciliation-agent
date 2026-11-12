import { z } from "zod";

const emptyAsUndefined = (value: unknown) => (value === "" ? undefined : value);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().default(3000),
  ANTHROPIC_API_KEY: z.preprocess(emptyAsUndefined, z.string().optional()),
  RECONCILER: z.preprocess(emptyAsUndefined, z.enum(["claude", "deterministic"]).optional()),
  CLAUDE_MODEL: z.string().default("sonnet"),
});

export type Config = {
  databaseUrl: string;
  port: number;
  reconciler: "claude" | "deterministic";
  claudeModel: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  const reconciler = parsed.RECONCILER ?? (parsed.ANTHROPIC_API_KEY ? "claude" : "deterministic");
  if (reconciler === "claude" && !parsed.ANTHROPIC_API_KEY) {
    throw new Error("RECONCILER=claude requires ANTHROPIC_API_KEY");
  }
  return {
    databaseUrl: parsed.DATABASE_URL,
    port: parsed.PORT,
    reconciler,
    claudeModel: parsed.CLAUDE_MODEL,
  };
}
