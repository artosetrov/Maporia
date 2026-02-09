import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict Mode enabled — helps catch bugs in development via double-invoke of effects
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "maps.googleapis.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "places.googleapis.com" },
    ],
  },
  async redirects() {
    const redirects = [
      { source: "/places", destination: "/", permanent: false },
    ];

    // Enforce canonical host (non-www) - redirect www to non-www
    // This ensures consistent behavior across both hosts
    // Note: Host-based redirects should be handled in middleware or at the hosting level
    // Keeping this for reference but it may not work in Next.js 16.1.1
    if (process.env.NODE_ENV === 'production') {
      redirects.push({
        source: '/:path*',
        has: [
          {
            type: 'header' as const,
            key: 'host',
            value: 'www.maporia.co',
          },
        ],
        destination: 'https://maporia.co/:path*',
        permanent: true, // 308 permanent redirect
      } as any); // Type assertion needed as Next.js types may not include header-based host matching
    }

    return redirects;
  },
};

export default nextConfig;