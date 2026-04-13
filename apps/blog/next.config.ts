import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['next-mdx-remote'],
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
