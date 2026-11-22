import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  // Chỉ dùng khi chạy thử cục bộ không có DATABASE_URL (xem lib/db.ts)
  serverExternalPackages: ["@electric-sql/pglite"],
  async headers() {
    return [
      {
        source: "/p/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default config;
