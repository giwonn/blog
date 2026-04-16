import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ['next-mdx-remote'],
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
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

