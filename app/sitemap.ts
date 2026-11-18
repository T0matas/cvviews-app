import type { MetadataRoute } from 'next';

// Servido em https://cvviews.me/sitemap.xml para o Google Search Console.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://cvviews.me/', lastModified: new Date('2026-11-05'), changeFrequency: 'weekly', priority: 1 },
  ];
}
