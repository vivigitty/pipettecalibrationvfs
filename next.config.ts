import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',poweredByHeader: false,
  serverExternalPackages: ['@prisma/client','@react-pdf/renderer','pino'],
};
export default config;