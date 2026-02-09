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
    return [
      { source: "/places", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;