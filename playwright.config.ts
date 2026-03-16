import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
    trace: "on-first-retry",
    permissions: ["microphone"],
  },
  projects: [
    {
      name: "chromium",
      use: { 
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream"
          ]
        }
      },
    },
  ],
  webServer: {
    command: "npm run build && PORT=3100 USE_MOCK=true npm run start:test",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
