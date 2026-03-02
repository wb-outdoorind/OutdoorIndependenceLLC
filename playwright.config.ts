import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 4020);
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `PORT=${port} npm run start`,
        port,
        timeout: 120_000,
        reuseExistingServer: true,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
