import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads the user session, so Cache Components would add Suspense boilerplate with no cache benefit.
  experimental: {
    serverActions: { bodySizeLimit: "10mb" }, // PDF / CSV uploads
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
