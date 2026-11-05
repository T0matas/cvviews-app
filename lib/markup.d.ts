import type { FullCv, Review } from './review';

/** O desenho do CV original, lido da primeira página. Cores em "#rrggbb". */
export type CvLayout = {
  width: number;
  height: number;
  split: number | null;
  side: 'left' | 'right' | null;
  sideBg: string | null;
  sideDark: boolean;
  accent: string | null;
  heading: string | null;
  decor: string | null;
  band: string | null;
  topBar: boolean;
  photo: { src: string; round: boolean; x: number; y: number } | null;
  nameUpper: boolean;
  serif: boolean;
  font: string | null;
  words: { norm: string; text: string; page: number; line: string; x: number; y: number }[];
};

/** Onde fica cada parte do CV corrigido, no mesmo desenho do original. */
export type CvStyle = {
  two: boolean;
  side: 'left' | 'right' | null;
  sideRatio: number;
  sections: ('side' | 'main')[];
  header: 'side' | 'main';
  contact: 'side' | 'header';
  photo: { src: string; round: boolean; column: 'side' | 'main' } | null;
  accent: string | null;
  heading: string | null;
  decor: string | null;
  band: string | null;
  sideBg: string | null;
  sideDark: boolean;
  topBar: boolean;
  nameUpper: boolean;
  serif: boolean;
  font: string | null;
};

export function drawCorrections(input: {
  review: Review;
  /** Fotografias do CV (data URLs). */
  images?: string[] | null;
  /** O PDF original em base64. */
  pdf?: string | null;
  onStep?: (step: string) => void;
}): Promise<{ pages: HTMLCanvasElement[]; marks: number; layout: CvLayout | null }>;

export function styleFor(full: FullCv, layout: CvLayout | null, text?: string): CvStyle | null;
