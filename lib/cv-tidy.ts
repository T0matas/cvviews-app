// Arruma o CV corrigido antes de ser mostrado ou descarregado: nada fica fora do sítio nem desorganizado.
// O modelo escreve o conteúdo; a estrutura é garantida aqui, sempre da mesma forma.
import type { FullCv } from './review';

type Section = FullCv['sections'][number];
type Entry = Section['entries'][number];

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').replace(/^[\s\-•*·▪●◦–—>]+/, '').trim();
const key = (s: string) => s.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Um contacto, onde quer que o modelo o tenha posto: email, telefone, link ou perfil.
const isContact = (s: string) =>
  /@|https?:\/\/|www\.|linkedin\.|github\.com|behance\./i.test(s) || (/^\+?[\d\s().-]+$/.test(s) && (s.match(/\d/g) || []).length >= 9);

// A ordem em que um recrutador espera ler as secções (em várias línguas). O que não se reconhece fica no fim, pela ordem do CV.
const ORDER: [RegExp, number][] = [
  [/perfil|profile|resumo|summary|sobre|about|objetivo|objective|apresenta|resumen|profil|zusammenfassung|profilo/, 0],
  [/experi|employment|work|emprego|profissional|career|carreira|berufserfahrung|esperienz|trabajo/, 1],
  [/projet|project|portf|proyect/, 2],
  [/educa|forma|academ|estud|studi|ausbildung|istruzion|formaci/, 3],
  [/certif|curso|course|training|licen|forma[cç][aã]o complementar/, 4],
  [/compet|skill|expertise|especiali|aptid|ferrament|tecnolog|conhecimento|habilidad|kompetenz|competenz|outils|tools/, 5],
  [/idioma|lingua|language|langue|sprach|lingue/, 6],
  [/volunt|benevol|ehrenamt/, 7],
  [/interess|hobb|loisir|interest|aficion/, 8],
  [/refer/, 9],
];
const rank = (title: string) => ORDER.find(([re]) => re.test(key(title)))?.[1] ?? 7.5;
const isSkills = (title: string) => rank(title) === 5 || rank(title) === 6 || rank(title) === 8;
const isContactSection = (title: string) => /contact|contato|kontakt|dados pessoais|personal (details|info)|informa[cç][oõ]es pessoais/.test(key(title));

// Nomes em maiúsculas passam a "Nome Apelido"; o resto fica como está.
const titleCase = (s: string) => (s && s === s.toUpperCase() && /\p{L}{2}/u.test(s) ? s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase()) : s);

// Datas com um só separador entre o início e o fim: "Set 2020 - Presente".
// Um hífen colado ("2020-2021", "01-2020") fica como está.
const tidyDates = (s: string) => clean(s)
  .replace(/\s+[-–—]\s+|\s*[–—]\s*|\s+(?:to|até|ate|bis)\s+/giu, ' - ')
  .replace(/\s*,\s*(?=(?:\p{L}+\.?\s*)?\d{4}|present|presente|atual|actual|hoje|now|heute|oggi)/giu, ' - ')
  .replace(/^-\s*|\s*-$/g, '');

export function tidyCv(input: FullCv): FullCv {
  const contact: string[] = [];
  const seenContact = new Set<string>();
  const addContact = (c: string) => {
    for (const part of clean(c).split(/\s*[|·•]\s*/)) {
      const k = key(part);
      if (part && k && !seenContact.has(k)) { seenContact.add(k); contact.push(part); }
    }
  };
  (input.contact || []).forEach(addContact);

  const seenLines = new Set<string>();
  const sections: Section[] = [];
  for (const raw of input.sections || []) {
    const title = clean(raw.title);
    if (!title) continue;
    // Contactos são do cabeçalho, nunca uma secção.
    if (isContactSection(title)) {
      for (const e of raw.entries || []) [e.title, e.subtitle, ...(e.lines || [])].forEach((s) => clean(s) && addContact(String(s)));
      continue;
    }
    const entries: Entry[] = [];
    for (const e of raw.entries || []) {
      const lines: string[] = [];
      for (const l of e.lines || []) {
        const line = clean(l);
        if (!line) continue;
        if (isContact(line) && line.split(' ').length <= 4) { addContact(line); continue; }
        const k = key(line);
        if (!k || seenLines.has(k)) continue;
        seenLines.add(k);
        lines.push(line);
      }
      const entry = { title: clean(e.title), subtitle: clean(e.subtitle), dates: tidyDates(e.dates || ''), lines };
      if (entry.title || entry.subtitle || entry.lines.length) entries.push(entry);
    }
    if (!entries.length) continue;
    // A mesma secção duas vezes junta-se numa só.
    const same = sections.find((s) => key(s.title) === key(title));
    if (same) same.entries.push(...entries); else sections.push({ title, entries });
  }

  // Competências, línguas e interesses: uma lista simples, sem entradas soltas pelo meio.
  for (const s of sections) {
    if (!isSkills(s.title)) continue;
    const items: string[] = [];
    const grouped: Entry[] = [];
    for (const e of s.entries) {
      if (e.title && e.lines.length) grouped.push({ ...e, dates: '', lines: [e.lines.join(', ')] });
      else items.push(...[e.title, e.subtitle].filter(Boolean), ...e.lines);
    }
    const short = items.filter((i) => i.split(' ').length <= 5);
    const long = items.filter((i) => i.split(' ').length > 5);
    s.entries = [
      ...grouped,
      ...(short.length ? [{ title: '', subtitle: '', dates: '', lines: [short.join(' · ')] }] : []),
      ...(long.length ? [{ title: '', subtitle: '', dates: '', lines: long }] : []),
    ];
  }

  sections.sort((a, b) => rank(a.title) - rank(b.title));
  return { name: titleCase(clean(input.name)), headline: clean(input.headline), contact, sections };
}
