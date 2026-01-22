import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Temporarily disable Strict Mode to prevent double rendering on production
  // This may help with AbortError issues on custom domain
  reactStrictMode: false,
  async redirects() {
    const redirects = [
      { source: "/places", destination: "/", permanent: false },
    ];

    // Enforce canonical host (non-www) - redirect www to non-www
    // This ensures consistent behavior across both hosts
    if (process.env.NODE_ENV === 'production') {
      redirects.push({
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'www.maporia.co',
          },
        ],
        destination: 'https://maporia.co/:path*',
        permanent: true, // 308 permanent redirect
      });
    }

    return redirects;
  },
};

export default nextConfig;