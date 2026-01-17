import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  async redirects() {
    return [{ source: "/places", destination: "/", permanent: false }];
  },
};

export default nextConfig;