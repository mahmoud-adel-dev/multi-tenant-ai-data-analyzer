import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".build",
  experimental: {
    /**
     * Server Actions body size limit for file uploads.
     */
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },

  /**
   * Security headers applied to every response.
   */
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
