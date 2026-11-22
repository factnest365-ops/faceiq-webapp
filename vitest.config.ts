import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["engine/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});
