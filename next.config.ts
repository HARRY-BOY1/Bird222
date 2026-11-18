import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "github.com", pathname: "**" },
      { protocol: "https", hostname: "utfs.io", pathname: "**" },
    ],
  },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
