import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:1421",
    channel: "msedge",
    headless: true,
    viewport: { width: 1320, height: 860 },
  },
  webServer: {
    command: "npm run dev -- --port 1421",
    url: "http://127.0.0.1:1421",
    reuseExistingServer: !process.env.CI,
  },
});
