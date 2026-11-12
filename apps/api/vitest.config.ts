import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Starting a Postgres container can take a while on a cold CI runner.
    hookTimeout: 120_000,
  },
});
