import type { Metadata, Viewport } from 'next';
import './globals.css';
import './extras.css';
import './review.css';

const SITE = 'https://cvviews.me';
const DESCRIPTION = 'CVviews: revisão de CV com inteligência artificial. O Leo, o assistente do CVviews, corrige o teu currículo, dá-lhe uma nota, prepara entrevistas e ajuda recrutadores a analisar candidaturas.';

// O nome da marca no título, na descrição e nos dados estruturados: é o que o Google usa para mostrar
// o site a quem pesquisa "cvviews".
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'CVviews | Revisão de CV com IA e assistente de recrutamento', template: '%s | CVviews' },
  description: DESCRIPTION,
  applicationName: 'CVviews',
  keywords: ['CVviews', 'CV Views', 'revisão de CV', 'corrigir CV', 'currículo', 'CV com IA', 'recrutamento', 'entrevista de emprego'],
  alternates: { canonical: '/' },
  openGraph: { type: 'website', url: SITE, siteName: 'CVviews', title: 'CVviews | Revisão de CV com IA', description: DESCRIPTION, locale: 'pt_PT' },
  twitter: { card: 'summary', title: 'CVviews | Revisão de CV com IA', description: DESCRIPTION },
  robots: { index: true, follow: true },
  appleWebApp: { capable: true, title: 'CVviews', statusBarStyle: 'default' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', '@id': `${SITE}/#website`, url: SITE, name: 'CVviews', alternateName: ['CV Views', 'cvviews'], inLanguage: 'pt-PT' },
    { '@type': 'Organization', '@id': `${SITE}/#org`, name: 'CVviews', url: SITE, logo: `${SITE}/icon.svg` },
    { '@type': 'WebApplication', name: 'CVviews', url: SITE, applicationCategory: 'BusinessApplication', operatingSystem: 'Web', description: DESCRIPTION, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' } },
  ],
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
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <head>
        {/* O tema escolhido nas Configurações, aplicado antes de pintar a página (sem piscar). */}
        <script dangerouslySetInnerHTML={{ __html: "try{var t=JSON.parse(localStorage.getItem('cvviews-settings')||'{}').theme;if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}" }} />
      </head>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        {children}
      </body>
    </html>
  );
}
