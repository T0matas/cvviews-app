// Portado de cvviews-ofcsite/lib/ai.js e lib/schema.js: pedidos com resposta em JSON validado,
// a língua do CV e os números que o modelo não pode inventar.
import { ApiError, complete, humanize, REASONING } from './ai';

/* ---------------- Esquemas ---------------- */
// Os structured outputs pedem todas as propriedades obrigatórias e nenhuma a mais.
export const str = (description: string) => ({ type: 'string', description });
export const int = (description: string) => ({ type: 'integer', description });
export const list = (items: object, description?: string) => ({ type: 'array', items, description });
export const oneOf = (values: string[], description: string) => ({ type: 'string', enum: values, description });
export const obj = (properties: Record<string, object>, description?: string) => ({
  type: 'object',
  description,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

/* ---------------- Línguas ---------------- */
export const LANGUAGE_NAMES: Record<string, string> = { en: 'English', pt: 'European Portuguese', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian' };

// Regras de escrita para um CV que não está em português: as linhas do CV ficam na língua dele.
export const CV_STYLE = (lang: string) => `Write in ${LANGUAGE_NAMES[lang] || "the CV's own language"}, as a native recruiter would: plain words, short sentences, concrete. No dashes (— or –), no buzzwords (leverage, synergy, dynamic, passionate, innovative, spearheaded), no exclamation marks, no emojis.`;

const STOPWORDS: Record<string, string> = {
  en: 'the and of to in for with on at by from as an is are was were my our their this that have has during new into over per using including led managed developed improved team company',
  pt: 'de da do das dos em no na nos nas para com por uma um os as que ao à é foi sou e geri desenvolvi melhorei equipa empresa',
  es: 'de la el los las en para con por una un que y es fue soy del al gestioné desarrollé mejoré equipo empresa',
  fr: 'de la le les des en pour avec par une un et est était je du au dans sur géré développé amélioré équipe entreprise',
  de: 'der die das und mit für von im in auf ein eine ist war ich zu den dem des bei entwickelt verbessert team unternehmen',
  it: 'di la il lo gli le in per con da una un che e è era sono del della al nella gestito sviluppato migliorato squadra azienda',
};
const STOPSETS = Object.fromEntries(Object.entries(STOPWORDS).map(([k, v]) => [k, new Set(v.split(' '))]));

// Adivinha a língua de um texto pelas palavras curtas mais comuns. Devolve "" quando há pouco texto.
export function languageOf(text: string) {
  const words = String(text || '').toLowerCase().match(/\p{L}+/gu) || [];
  const counts: Record<string, number> = Object.fromEntries(Object.keys(STOPSETS).map((k) => [k, 0]));
  for (const w of words) for (const k in STOPSETS) if (STOPSETS[k].has(w)) counts[k]++;
  // As letras portuguesas desempatam com o espanhol.
  counts.pt += (String(text).match(/[ãõç]|ção|ções/gi) || []).length;
  const [best, second] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (best[1] < 2 || best[1] === second[1]) return '';
  return best[0];
}

// O modelo deixa [marcadores] para números que só o candidato sabe, e às vezes escreve um na mesma.
// Qualquer número em `text` que não esteja em nenhuma das `sources` passa a [X], [Y]...
export function blankUnknownNumbers(text: string, ...sources: string[]) {
  if (typeof text !== 'string') return text;
  const tidy = text.replace(/(?<![\p{L}\p{N}\[])([XYZWVNM])(?=\s?%)/gu, '[$1]');
  const known = new Set((sources.join(' ').match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(',', '.')));
  // Uma percentagem só vale se essa mesma percentagem estiver no CV: "20 chamadas" ou "20XX" não autorizam "20%".
  const knownPct = new Set([...sources.join(' ').matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)].map((m) => m[1].replace(',', '.')));
  const taken = new Set([...tidy.matchAll(/\[([A-Z])(?:\s?%)?\]/g)].map((m) => m[1]));
  const free = ['X', 'Y', 'Z', 'W', 'V', 'N', 'M'].filter((l) => !taken.has(l));
  const blanks = new Map<string, string>();
  return tidy.replace(/(?<![\p{L}\p{N}\[.,])\d+(?:[.,]\d+)?(?![\p{L}\p{N}\]])/gu, (n, at: number) => {
    const key = n.replace(',', '.');
    const pct = /^\s?%/.test(tidy.slice(at + n.length));
    if (pct ? knownPct.has(key) : known.has(key)) return n;
    if (!blanks.has(key)) blanks.set(key, free[blanks.size % free.length] || 'X');
    return `[${blanks.get(key)}]`;
  });
}

/* ---------------- Respostas em JSON ---------------- */
// O modelo às vezes escreve JSON que falha a verificação do esquema; uma segunda tentativa quase sempre resulta.
const isBadJson = (error: unknown) => error instanceof ApiError && error.status === 400 && /json_validate_failed/.test(error.message);

type StructuredRequest = { system: string; content: string; schema: object; maxTokens?: number };

export async function structured<T>(request: StructuredRequest): Promise<T> {
  try {
    return await structuredOnce<T>(request);
  } catch (error) {
    if (!isBadJson(error)) throw error;
    console.warn('[structured] JSON failed the schema check, trying once more');
    return structuredOnce<T>(request);
  }
}

async function structuredOnce<T>({ system, content, schema, maxTokens = 12000 }: StructuredRequest): Promise<T> {
  const response = await complete({
    max_tokens: maxTokens,
    ...REASONING,
    response_format: { type: 'json_schema', json_schema: { name: 'result', schema, strict: true } },
    messages: [{ role: 'system', content: system }, { role: 'user', content }],
  });
  const data = (await response.json()) as { choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[] };
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') throw new Error('A resposta ficou cortada. Experimenta um CV mais curto.');
  if (choice?.message?.refusal) throw new Error('A IA não conseguiu ajudar com este pedido. Experimenta outro CV.');
  return deepHumanize(JSON.parse(choice?.message?.content || '{}')) as T;
}

function deepHumanize(value: unknown): unknown {
  if (typeof value === 'string') return humanize(value);
  if (Array.isArray(value)) return value.map(deepHumanize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepHumanize(v)]));
  return value;
}

// Põe na língua `lang` todas as frases que voltaram noutra, deixando as restantes como estão.
export async function intoLanguage(strings: string[], lang: string) {
  if (!LANGUAGE_NAMES[lang]) return strings;
  const wrong = strings.map((s, i) => [s, i] as const).filter(([s]) => { const l = languageOf(s); return l && l !== lang; });
  if (!wrong.length) return strings;
  const out = [...strings];
  try {
    const { lines } = await structured<{ lines: string[] }>({
      system: `Translate each line into ${LANGUAGE_NAMES[lang]}, the language of the candidate's CV. Keep the meaning and roughly the same length. Keep [placeholders] like [X], names, companies, tools, numbers and dates exactly as they are. Plain text, no markdown. Return the same number of lines, in order.`,
      content: JSON.stringify(wrong.map(([s]) => s)),
      schema: { type: 'object', properties: { lines: { type: 'array', items: { type: 'string' } } }, required: ['lines'], additionalProperties: false },
      maxTokens: 4000,
    });
    wrong.forEach(([, i], n) => { if (lines?.[n]) out[i] = lines[n]; });
  } catch (error) {
    console.warn('[translate]', error instanceof Error ? error.message : error);
  }
  return out;
}
