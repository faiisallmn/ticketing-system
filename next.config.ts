import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
    // Barrel-heavy deps used on a few pages: only transform what we import,
    // which keeps dev cold-compiles of /reports and /kb fast.
    optimizePackageImports: ["recharts", "react-markdown", "remark-gfm"],
  },
};

export default nextConfig;
