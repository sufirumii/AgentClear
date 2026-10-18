import type { NextConfig } from "next";

/**
 * Static site build — `next build` emits a fully static `out/` directory
 * (a single index.html + hashed assets) that can be served by any static
 * host. No Node server, no API routes, no database: the whole product
 * runs client-side through the local demo backend (src/lib/local.ts).
 */
const nextConfig: NextConfig = {
  output: "export",
  images: {
    // Static hosts don't run the Next.js image optimizer.
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
