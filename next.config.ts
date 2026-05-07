import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strict Mode enabled — helps catch bugs in development via double-invoke of effects
  reactStrictMode: true,
  // Force per-icon imports for lucide-react. Guards against accidental
  // `import * as Icons from "lucide-react"` shipping the entire icon set.
  modularizeImports: {
    "lucide-react": {
      transform: "lucide-react/dist/esm/icons/{{ kebabCase member }}",
      preventFullImport: true,
    },
  },
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