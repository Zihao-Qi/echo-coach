import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: "https://127.0.0.1:8443", ignoreHTTPSErrors: true, trace: "retain-on-failure",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    permissions: ["microphone"],
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  },
});
