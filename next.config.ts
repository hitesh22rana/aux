import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  agentRules: false,
  serverExternalPackages: ["better-sqlite3"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};
export default nextConfig;
