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
  photo: { src: string; round: boolean; bleed: boolean; aspect: number; x: number; y: number } | null;
  headingUpper: boolean;
  nameUpper: boolean;
  serif: boolean;
  font: string | null;
  words: { norm: string; text: string; page: number; line: string; x: number; y: number }[];
  /** Barras de nível ao lado de competências ou línguas, em fração da largura da folha. */
  bars: { norm: string; fill: number; total: number | null; x: number; y: number; sx?: number; ix?: number; yc?: number; h?: number }[];
};

/** Onde fica cada parte do CV corrigido, no mesmo desenho do original. */
export type CvStyle = {
  two: boolean;
  side: 'left' | 'right' | null;
  sideRatio: number;
  sections: ('side' | 'main')[];
  header: 'side' | 'main';
  contact: 'side' | 'header';
  photo: { src: string; round: boolean; bleed: boolean; aspect: number; column: 'side' | 'main' } | null;
  headingUpper: boolean;
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
  /** Nível (0 a 1) de cada competência ou língua desenhada com uma barra no original, pela chave normalizada. */
  levels: Record<string, number>;
  /** Para cada secção: se é mostrada com barras, e se as barras tinham um fundo mais claro. */
  barSections: ({ track: boolean } | null)[];
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
