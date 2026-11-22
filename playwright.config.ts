import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests",
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:3000" },
  webServer: {
    command: "npx next start -p 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
