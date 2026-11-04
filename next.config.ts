import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // O pdf.js dentro do unpdf deixa de ler texto quando é empacotado; corre como pacote normal do Node.
  serverExternalPackages: ['unpdf'],
  devIndicators: false,
};

export default nextConfig;
