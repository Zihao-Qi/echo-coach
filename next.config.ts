import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  env: { NEXT_PUBLIC_ECHO_PUBLIC_DEMO: process.env.NEXT_PUBLIC_ECHO_PUBLIC_DEMO === "true" ? "true" : "false" },
  serverExternalPackages: ["@google-cloud/firestore"],
};

export default nextConfig;
