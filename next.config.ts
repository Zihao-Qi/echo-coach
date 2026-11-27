import type { NextConfig } from "next";
import { demoAudioAssets } from "./src/content/questions/demo-audio";

const nextConfig: NextConfig = {
  output: "standalone",
  env: { NEXT_PUBLIC_ECHO_PUBLIC_DEMO: process.env.NEXT_PUBLIC_ECHO_PUBLIC_DEMO === "true" ? "true" : "false" },
  async headers() {
    return [
      { source: "/audio/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      ...demoAudioAssets.filter(({ path }) => /^\/audio\/(questions|answers)\/[a-z0-9-]+\.[a-f0-9]{8}\.m4a$/.test(path)).map(({ path }) => ({
        source: path.replaceAll(".", "\\."),
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      })),
    ];
  },
  serverExternalPackages: ["@google-cloud/firestore"],
};

export default nextConfig;
