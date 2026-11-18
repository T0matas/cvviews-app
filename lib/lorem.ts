// Texto de exemplo dos modelos de CV ("lorem ipsum…"), mesmo mal lido de uma fotografia: nunca é conteúdo.
export const LOREM_WORDS = new Set(
  'lorem ipsum dolor amet consectetur adipiscing elit eiusmod tempor incididunt labore dolore magna aliqua quis suspendisse ultrices gravida risus commodo commode viverra maecenas accumsan lacus facilisis nostrud exercitation ullamco laboris nisi aliquip consequat duis aute irure reprehenderit voluptate velit cillum fugiat pariatur excepteur occaecat cupidatat proident deserunt mollit'.split(' '),
);

const wordsOf = (s: string) => String(s).toLowerCase().match(/\p{L}+/gu) || [];

// Uma frase é texto de exemplo quando boa parte das palavras o são ("Graduated Magna Cum Laude" não é).
export function isLorem(text: string) {
  const w = wordsOf(text);
  const n = w.filter((x) => LOREM_WORDS.has(x)).length;
  return (n >= 2 && n >= w.length * 0.3) || (n >= 1 && n >= w.length * 0.5);
}

// Tira de uma linha as frases de texto de exemplo e deixa o resto.
export function withoutLorem(line: string) {
  return String(line).split(/(?<=[.!?;])\s+/).filter((s) => !isLorem(s)).join(' ').trim();
}
