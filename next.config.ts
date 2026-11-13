import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@google-cloud/firestore"],
};

export default nextConfig;
