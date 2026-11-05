// Fiel ao CV original: depois de a IA reescrever o CV, nada de resultados inventados e nenhuma frase perdida.
// Verificado aqui, com regras simples, sem depender de a IA cumprir as instruções.
import type { FullCv, Review } from './review';

const wordsOf = (s: string) => new Set(String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
// Quanto duas frases se parecem: a parte das palavras da mais curta que também estão na outra.
export function alike(a: string, b: string) {
  const x = wordsOf(a), y = wordsOf(b);
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / Math.max(1, Math.min(x.size, y.size));
}

const PLACEHOLDER = /\[[A-Z](?:\s?%)?\]/;
// Texto de exemplo dos modelos de CV ("lorem ipsum…"), mesmo mal lido de uma fotografia: nunca é conteúdo.
const LOREM_WORDS = new Set('lorem ipsum dolor amet consectetur adipiscing elit eiusmod tempor incididunt labore dolore magna aliqua quis suspendisse ultrices gravida risus commodo commode viverra maecenas accumsan lacus facilisis nostrud exercitation ullamco laboris nisi aliquip commodo consequat duis aute irure reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat proident sunt culpa officia deserunt mollit anim'.split(' '));
const isLorem = (s: string) => (String(s).toLowerCase().match(/\p{L}+/gu) || []).filter((w) => LOREM_WORDS.has(w)).length >= 2;
const clean = (s: string) => s.replace(/^[\s\-•*·▪●◦–—>]+/, '').replace(/\s+/g, ' ').trim();

type Rewrite = Review['rewrites'][number];

export function keepFaithful(full: FullCv, cvText: string, rewrites: Rewrite[]): FullCv {
  const original = String(cvText).split(/\r?\n/).map(clean).filter((l) => l.split(' ').length >= 4 && !isLorem(l));
  const fromReview = (line: string) => rewrites.some((w) => alike(line, w.improved) >= 0.75);

  // 1. Um espaço para preencher ([X]) só pode vir de uma linha que a revisão reescreveu. Os outros são
  //    resultados que a IA acrescentou: a linha volta a ser a do CV, ou perde só a parte inventada.
  const faithful = (line: string) => {
    if (!PLACEHOLDER.test(line) || fromReview(line)) return line;
    let best = '', score = 0;
    for (const o of original) { const s = alike(line, o); if (s > score) { score = s; best = o; } }
    if (score >= 0.5 && !PLACEHOLDER.test(best)) return best;
    const kept = line.split(/,\s+|;\s+|\s+(?:e|and|y|et|und)\s+/).filter((part) => !PLACEHOLDER.test(part)).join(', ').trim();
    return kept.split(' ').length >= 3 ? kept.replace(/,\s*$/, '') + (/[.!?]$/.test(kept) ? '' : '.') : line;
  };
  for (const s of full.sections) for (const e of s.entries) e.lines = e.lines.map(faithful);

  // 2. Nenhuma frase do CV se perde: cada frase com conteúdo tem de estar no CV corrigido (como estava,
  //    ou na versão da revisão). Uma que falte volta a entrar logo a seguir à frase que a antecedia.
  const all = () => full.sections.flatMap((s) => s.entries.flatMap((e) => [e.title, e.subtitle, ...e.lines]));
  const covered = (o: string) => all().some((l) => alike(l, o) >= 0.6) || rewrites.some((w) => alike(w.original, o) >= 0.6 && all().some((l) => alike(l, w.improved) >= 0.6));
  for (let i = 0; i < original.length; i++) {
    const o = original[i];
    if (o.split(' ').length < 6 || /@|https?:|www\./.test(o) || covered(o)) continue;
    // a frase anterior do CV que está no corrigido diz onde esta pertence
    for (let k = i - 1; k >= Math.max(0, i - 4); k--) {
      let placed = false;
      for (const s of full.sections) for (const e of s.entries) {
        if (placed) continue;
        const at = e.lines.findIndex((l) => alike(l, original[k]) >= 0.6 || rewrites.some((w) => alike(w.original, original[k]) >= 0.6 && alike(l, w.improved) >= 0.6));
        if (at >= 0) { e.lines.splice(at + 1, 0, o); placed = true; continue; }
        // the line before was the job's own title or company: the sentence is that job's first bullet
        if ([e.title, e.subtitle, [e.subtitle, e.dates].join(' ')].some((h) => h && alike(h, original[k]) >= 0.6)) { e.lines.unshift(o); placed = true; }
      }
      if (placed) break;
    }
  }
  return full;
}
