import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "*.spec.ts",
  timeout: 120000,
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH, args: ["--no-sandbox"] }
      : {},
  },
  webServer: [
    {
      command: "npm run dev -w @memeparty/server",
      env: { BIND_HOST: "127.0.0.1" },
      url: "http://localhost:3001/health",
      reuseExistingServer: true,
    },
    {
      command: "npm run dev -w @memeparty/web",
      url: "http://localhost:5173",
      reuseExistingServer: true,
    },
  ],
});
