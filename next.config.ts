import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};
export default nextConfig;
