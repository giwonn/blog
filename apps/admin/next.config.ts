import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    const imageUrl = process.env.IMAGE_PUBLIC_URL || 'http://localhost:8080/images';
    return [
      {
        source: '/api/images/:path*',
        destination: `${imageUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
