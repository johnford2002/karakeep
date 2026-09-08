/// <reference types="vitest" />

import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths({ skip: (dir) => dir === ".claude" })],
  test: {
    // Builds the migrated PostgreSQL template when DATABASE_DIALECT=postgresql;
    // a no-op on SQLite.
    globalSetup: ["./testGlobalSetup.ts"],
  },
});
