import type { NextConfig } from "next";

const isExport = process.env.IS_CAPACITOR_BUILD === 'true';

const nextConfig: NextConfig = {
  output: isExport ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
