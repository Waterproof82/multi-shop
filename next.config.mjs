/** @type {import('next').NextConfig} */


import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  // experimental: {},
}

export default nextConfig
