import type { Review } from './review';

export function drawCorrections(input: {
  review: Review;
  /** Fotografias do CV (data URLs). */
  images?: string[] | null;
  /** O PDF original em base64. */
  pdf?: string | null;
  onStep?: (step: string) => void;
}): Promise<{ pages: HTMLCanvasElement[]; marks: number; fixed: HTMLCanvasElement[] }>;
