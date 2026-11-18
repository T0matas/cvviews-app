import type { MetadataRoute } from 'next';

// Servido em https://cvviews.me/robots.txt: deixa indexar o site e indica o sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: 'https://cvviews.me/sitemap.xml',
  };
}
