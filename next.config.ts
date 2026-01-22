import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Temporarily disable Strict Mode to prevent double rendering on production
  // This may help with AbortError issues on custom domain
  reactStrictMode: false,
  async redirects() {
    return [{ source: "/places", destination: "/", permanent: false }];
  },
};

export default nextConfig;