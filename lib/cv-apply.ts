// O CV corrigido é o CV original com as correções da revisão aplicadas, linha a linha.
// A estrutura (secções, entradas, linhas, ordem) vem do original e nunca muda; só as linhas que a revisão
// riscou passam a ser as que ela escreveu, e o texto de exemplo dos modelos (lorem ipsum) sai.
import type { FullCv, Review } from './review';
import { isLorem, withoutLorem } from './lorem';

type Rewrite = Review['rewrites'][number];
type Entry = FullCv['sections'][number]['entries'][number];

const wordSet = (s: string) => new Set(String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
function overlap(a: string, b: string) {
  const x = wordSet(a), y = wordSet(b);
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return { both, min: both / Math.max(1, Math.min(x.size, y.size)), max: both / Math.max(1, Math.max(x.size, y.size)) };
}

// A citação dentro da linha, palavra a palavra (a pontuação entre as palavras pode variar).
function spanOf(line: string, quote: string) {
  const ws = String(quote).match(/[\p{L}\p{N}%+#]+/gu);
  if (!ws?.length) return null;
  const re = new RegExp(ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\p{L}\\p{N}%+#]+'), 'iu');
  const m = line.match(re);
  return m?.index != null ? { start: m.index, end: m.index + m[0].length } : null;
}

// "Senior Designer, Company Name (2000-2005), Led a team…" passa a "Led a team…": o início que só repete o cabeçalho
// da entrada (cargo, empresa, datas, mesmo com outras palavras ou outras datas) já está no CV e sai.
function withoutHeader(text: string, e: Entry) {
  const head = wordSet([e.title, e.subtitle, e.dates].join(' '));
  if (!head.size) return text;
  const parts = text.split(/(?<=[:;,)])\s+|\s+[-–—]\s+/);
  // o último dos três primeiros pedaços que é sobretudo cabeçalho (palavras dele ou números)
  let cut = -1;
  for (let i = 0; i < Math.min(3, parts.length - 1); i++) {
    // espaços para preencher ("([X]-[Y])") contam como as datas que substituem
    const ws = parts[i].replace(/\[[^\]\n]{1,6}\]/g, ' ').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    if (ws.length && ws.filter((w) => head.has(w) || /^\d+$/.test(w)).length >= ws.length * 0.6) cut = i;
  }
  if (cut < 0) return text;
  const rest = parts.slice(cut + 1).join(' ').trim();
  if (rest.split(/\s+/).length < 4) return text;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// Os títulos de secção que um CV costuma ter, em várias línguas (para encontrar no texto as que a cópia deixou cair).
const HEADING = /^(profile|perfil|summary|resumo|about|about me|sobre|sobre mim|objective|objetivo|experience|work experience|professional experience|employment|experiencia|experiencia profissional|education|educacao|formacao|formacao academica|qualifications|skills|key skills|soft skills|technical skills|competencias|competencias tecnicas|expertise|aptidoes|languages|idiomas|linguas|certifications|certificacoes|courses|cursos|projects|projetos|interests|interesses|hobbies|references|referencias|tools|ferramentas|software|contact|contacts|contacto|contactos|contato)$/;
const headKey = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Uma secção que está no texto do CV mas que a cópia deixou cair (como "Languages" com os seus itens) volta,
// no sítio dela. Só listas curtas (línguas, competências, contactos): o resto a cópia não costuma perder.
export function restoreSections(cv: FullCv, text: string): FullCv {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim());
  const order: string[] = [];
  for (const l of lines) if (HEADING.test(headKey(l.replace(/:$/, '')))) order.push(headKey(l.replace(/:$/, '')));
  const have = () => new Set(cv.sections.map((s) => headKey(s.title)));
  for (let i = 0; i < lines.length; i++) {
    const title = lines[i].replace(/:$/, '');
    const k = headKey(title);
    if (!HEADING.test(k) || have().has(k)) continue;
    const items: string[] = [];
    for (let j = i + 1; j < lines.length && lines[j] && !HEADING.test(headKey(lines[j].replace(/:$/, ''))); j++) items.push(lines[j]);
    if (!items.length || items.length > 16 || !items.every((x) => x.split(/\s+/).length <= 6)) continue;
    const section = { title, entries: items.map((t) => ({ title: t, subtitle: '', dates: '', lines: [] as string[] })) };
    // logo a seguir à secção que, no texto, vinha antes dela
    const before = order.slice(0, order.indexOf(k)).reverse();
    const at = before.map((b) => cv.sections.findIndex((s) => headKey(s.title) === b)).find((x) => x >= 0);
    cv.sections.splice(at == null ? 0 : at + 1, 0, section);
  }
  return cv;
}

const FILL_IN: Record<string, { profile: string; other: string }> = {
  pt: { profile: '[Escreve aqui um perfil curto: quem és, a tua experiência e o que procuras]', other: '[Escreve aqui este texto]' },
  en: { profile: '[Write a short profile here: who you are, your experience and what you are looking for]', other: '[Write this text here]' },
  es: { profile: '[Escribe aquí un perfil breve: quién eres, tu experiencia y qué buscas]', other: '[Escribe aquí este texto]' },
  fr: { profile: '[Écris ici un court profil : qui tu es, ton expérience et ce que tu cherches]', other: '[Écris ici ce texte]' },
};

export function applyReview(cv: FullCv, rewrites: Rewrite[], lang = ''): FullCv {
  const used = new Set<Entry>();
  const entries = cv.sections.flatMap((s) => s.entries);
  for (const w of rewrites) {
    if (!w.original || !w.improved) continue;
    // A entrada do CV que a revisão citou: primeiro, a que tem a citação tal e qual numa linha; senão, a mais
    // parecida no todo (cabeçalho e linhas, que a cópia pode ter partido em várias). Entre entradas iguais, a primeira.
    let hit: Entry | null = null;
    let score = 0;
    for (const e of entries) {
      if (used.has(e) || !e.lines.length) continue;
      const literal = e.lines.some((l) => spanOf(l, w.original)) ? 10 : 0;
      const all = overlap([e.title, e.subtitle, e.dates, ...e.lines].join(' '), w.original);
      const body = overlap(e.lines.join(' '), w.original);
      if (!literal && (body.both < 2 || all.min < 0.6 || all.max < 0.3)) continue;
      const sc = literal + all.min + all.max;
      if (sc > score + 1e-9) { score = sc; hit = e; }
    }
    if (!hit) continue;
    used.add(hit);
    const e = hit;
    const improved = withoutHeader(w.improved.replace(/^[-•–*]\s*/, '').trim(), e);
    // As linhas da entrada que fazem parte da citação: a primeira passa a ser a nova, as outras saem.
    // Uma citação que é só parte de uma linha comprida (um parágrafo) substitui só essa parte.
    // A citação pode começar pelo cabeçalho da entrada ("Senior Designer 2000 Company Name Lorem…"): esse pedaço
    // já está no cabeçalho, por isso compara-se o resto com as linhas.
    const headWords = wordSet([e.title, e.subtitle, e.dates].join(' '));
    const bodyWords = (w.original.match(/[\p{L}\p{N}%+#]+/gu) || []).filter((x) => !headWords.has(x.toLowerCase()));
    const quoteBody = bodyWords.join(' ');
    const spanIn = (l: string) => spanOf(l, w.original) || (bodyWords.length >= 2 ? spanOf(l, quoteBody) : null);
    const covered = e.lines.map((l) => Boolean(spanIn(l)) || (bodyWords.length >= 3 && overlap(l, quoteBody).min >= 0.7));
    const first = covered.indexOf(true);
    if (first < 0) continue;
    const line = e.lines[first];
    const at = spanIn(line);
    const rest = at ? `${line.slice(0, at.start)} ${line.slice(at.end)}`.replace(/^[\s,.;:]+|[\s,;:]+$/g, '').trim() : '';
    // Só se mantém o resto da linha quando é texto a sério (não texto de exemplo nem dois ou três restos de palavras).
    const tail = at ? line.slice(at.end).replace(/[.!?]$/.test(improved) ? /^[.!?]/ : /^$/, '') : '';
    e.lines[first] = at && rest.split(/\s+/).length >= 4 && !isLorem(rest)
      ? `${line.slice(0, at.start)}${improved}${tail}`.replace(/\s+/g, ' ').trim()
      : improved;
    e.lines = e.lines.filter((_, i) => i === first || !covered[i]);
  }
  // O texto de exemplo sai. Um parágrafo que era só isso (o perfil de um modelo) não desaparece: fica uma
  // indicação do que escrever, para a secção continuar no sítio dela.
  const fill = FILL_IN[lang] || FILL_IN.en;
  for (const s of cv.sections) for (const e of s.entries) {
    const had = e.lines.length > 0;
    e.lines = e.lines.map(withoutLorem).filter(Boolean);
    if (had && !e.lines.length && !e.title && !e.subtitle) e.lines = [/perfil|profile|resumo|summary|sobre|about|objetiv/i.test(s.title) ? fill.profile : fill.other];
  }
  return cv;
}
