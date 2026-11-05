import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // O pdf.js dentro do unpdf deixa de ler texto quando é empacotado; corre como pacote normal do Node.
  serverExternalPackages: ['unpdf'],
  devIndicators: false,
  // A janela de entrada com a Google abre em cvviews.me (e diz "Continuar para cvviews.me"):
  // estes caminhos vão buscar o tratamento de entrada da Firebase ao domínio do projeto.
  async rewrites() {
    return [
      { source: '/__/auth/:path*', destination: 'https://cvviews-26241.firebaseapp.com/__/auth/:path*' },
      { source: '/__/firebase/:path*', destination: 'https://cvviews-26241.firebaseapp.com/__/firebase/:path*' },
    ];
  },
};

export default nextConfig;
