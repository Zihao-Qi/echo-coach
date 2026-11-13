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
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
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
    command: "npm run build && PORT=3100 AUTH_URL=http://127.0.0.1:3100 USE_MOCK=true PRACTICE_AUTH_MODE=demo PRACTICE_STORAGE=memory PRACTICE_TRANSCRIPTION_MODE=demo ALLOW_LOCAL_TRANSCRIPTION=false npm run start:test",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
