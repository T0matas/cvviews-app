import type { FullCv } from './review';

export function savePdf(blob: Blob, name: string): void;
export function imagesPdf(srcs: string[]): Promise<Blob>;
export function textPdf(doc: FullCv, accent?: string): Blob;
import type { CvStyle } from './markup.js';
export function styledPdf(doc: FullCv, style: CvStyle): Promise<Blob>;
