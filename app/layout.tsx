import type { Metadata, Viewport } from 'next';
import './globals.css';
import './extras.css';
import './review.css';

export const metadata: Metadata = {
  title: 'CVviews',
  description: 'O Leo ajuda-te a ler currículos, preparar entrevistas e melhorar o teu CV.',
  applicationName: 'CVviews',
  appleWebApp: { capable: true, title: 'CVviews', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

// Segue o tema do sistema: branco no modo claro, preto no modo escuro.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0a' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
