import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',poweredByHeader: false,
  serverExternalPackages: ['@prisma/client','@react-pdf/renderer','pino'],
  outputFileTracingIncludes: {
    // PDFKit loads standard fonts dynamically; include their shared chunks too.
    '/api/v1/*': ['./node_modules/pdfkit/js/standard-fonts/**/*'],
  },
};
export default config;