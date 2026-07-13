import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // jsdom workers are memory-heavy. CI runners also build declarations in
    // this job, so using every reported CPU can make fork startup time out
    // before test code runs. Keep parallelism bounded and deterministic.
    maxWorkers: 2,
    globals: false,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/setup.ts"],
    passWithNoTests: true,
  },
});
