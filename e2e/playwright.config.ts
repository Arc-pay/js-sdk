import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  testMatch: "**/*.spec.ts",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4567",
    trace: "on-first-retry",
    actionTimeout: 5_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command:
      "cp ../dist/cdn/arcpay.global.js fixtures/arcpay.global.js && npx http-server fixtures -p 4567 -c-1 --silent",
    url: "http://localhost:4567/merchant.html",
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
    cwd: "./",
  },
});
