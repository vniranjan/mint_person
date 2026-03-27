import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // Integration tests (like RLS isolation) need a real DB — run sequentially
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Only run files explicitly targeting integration tests via test:rls script
    // Unit tests can be added to src/**/*.test.ts pattern later
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
});
