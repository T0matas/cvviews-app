// A revisão de um CV, portada de cvviews-ofcsite/api/analyze.js:
// sem `mode`, devolve a revisão (nota, o que corrigir, linhas reescritas, palavras-chave);
// com `mode: "full"`, devolve o CV original com as correções dessa revisão aplicadas, na mesma estrutura.
import { cvBlock, friendlyError, hasKey, HUMAN_STYLE } from '@/lib/ai';
import { blankUnknownNumbers, int, intoLanguage, LANGUAGE_NAMES, languageOf, list, obj, oneOf, str, structured } from '@/lib/ai-structured';
import { applyReview, restoreSections } from '@/lib/cv-apply';
import { keepFaithful } from '@/lib/cv-fidelity';
import { tidyCv } from '@/lib/cv-tidy';
import type { FullCv, Review } from '@/lib/review';

export const runtime = 'nodejs';
export const maxDuration = 120;

const CATEGORIES: Record<string, string> = {
  impact: 'Impacto e resultados',
  clarity: 'Clareza e estrutura',
  relevance: 'Adequação à vaga',
  skills: 'Competências e palavras-chave',
  format: 'Formatação e ATS',
  language: 'Linguagem e tom',
};
const SENIORITY: Record<string, string> = {
  student: 'Estudante', entry: 'Início de carreira', junior: 'Júnior', mid: 'Intermédio', senior: 'Sénior', lead: 'Líder / Principal', executive: 'Executivo',
};

const SCHEMA = obj({
  is_cv: { type: 'boolean', description: 'True if the document is a CV or resume. False if it is something else (an invoice, an essay, a report, a random photo).' },
  not_cv_reason: str('If is_cv is false: one friendly sentence saying what the document seems to be. Otherwise an empty string.'),
  overall_score: int('Overall CV quality from 0 to 100. Be calibrated: 85+ is genuinely excellent, 50 is average.'),
  verdict: str('A short, warm one-line verdict, max 12 words.'),
  summary: str('2-3 sentence plain-English overview of the CV and how it reads to a recruiter.'),
  profile: obj({
    name: str("Candidate's name, or empty string if not found."),
    current_role: str('Most recent or target job title.'),
    seniority: oneOf(Object.keys(SENIORITY), 'Estimated seniority: student, entry (entry level), junior, mid (mid level), senior, lead (lead or principal) or executive.'),
    years_experience: str("Estimated professional experience, in the language the review is written in, e.g. '3 a 4 anos'."),
  }),
  scores: list(obj({
    category: oneOf(Object.keys(CATEGORIES), 'Scoring category: impact, clarity, relevance, skills, format or language.'),
    score: int('0 to 100.'),
    note: str('One sentence explaining the score.'),
  }), 'Exactly one entry per category, in the listed order.'),
  strengths: list(obj({
    title: str('Short label, 2-5 words.'),
    detail: str('Why this works, 1-2 sentences.'),
    evidence: str("A short quote from the CV that shows it, word for word in the CV's own language."),
  }), '3 to 5 genuine strengths.'),
  weaknesses: list(obj({
    title: str('Short label, 2-5 words.'),
    detail: str('What is wrong and why it hurts, 1-2 sentences.'),
    fix: str('A concrete, specific action to fix it.'),
    severity: oneOf(['high', 'medium', 'low'], 'How much this hurts the CV.'),
  }), '3 to 6 weaknesses, most severe first.'),
  rewrites: list(obj({
    original: str("A weak sentence quoted word for word from the CV, in the CV's own language: a profile sentence or a bullet or description line. Never a heading, a job title, a company, a date, a name or a single skill or language."),
    improved: str("A stronger rewrite in the CV's own language, so it can be pasted straight in. Keep it truthful; use [placeholders] for numbers the candidate must fill in."),
    short: str("The same improvement as a natural sentence in the CV's own language and tone, about as long as the original line (at most a third longer), to replace it in place on the page. Only facts already on that line; a figure the candidate must add is a placeholder like [X]."),
    why: str('Why the rewrite is stronger, one sentence.'),
  }), '3 to 6 before/after rewrites of the weakest sentences (profile and bullets), weakest first. If the CV is a template with placeholder text (lorem ipsum), rewrite EVERY placeholder paragraph or bullet (the profile and each entry, up to 10 rewrites), each one quoted exactly as it is on the CV and replaced by a suggestion that fits the title and company of that entry, with [X] for numbers. When several entries share the same placeholder text, still write one rewrite per entry (quoting the same text again), in the order the entries appear.'),
  ats: obj({
    score: int('Estimated applicant-tracking-system compatibility from 0 to 100.'),
    missing_keywords: list(str('Keyword'), 'Up to 8 keywords recruiters for this role would expect but are missing.'),
    issues: list(str('Issue'), 'Formatting problems that could trip an ATS. Empty if none.'),
  }),
  next_steps: list(str('Action'), '3 to 5 prioritised next steps, each one short sentence.'),
});

const SYSTEM = `You are CVviews, an experienced recruiter and career coach who has screened thousands of CVs.
Review the candidate's CV honestly and kindly: celebrate what genuinely works and be specific about what doesn't.
Every point must be grounded in the actual CV - quote it where you can. Never invent experience the candidate does not have.
A rewritten line ("improved", "short") rephrases only what that line already says. It may invite one figure the candidate must fill in, as a placeholder like "by [X]%", but never states an outcome in words that the CV doesn't give (no "earned positive feedback", "boosted sales", "praised by clients").
If a target role or job description is given, judge relevance against it; otherwise infer the most likely target from the CV.
Portuguese CV conventions: a photo is optional, so never criticise it for being there or missing. Unneeded personal data (tax number NIF, Citizen Card number, full street address, date of birth, marital status) is a weakness: suggest removing it. Salaries in Portugal are gross per month, 14 months a year.
If the document is not a CV, set is_cv to false, explain briefly in not_cv_reason, and keep every other field minimal (scores 0, empty lists, empty strings).
Write every field in European Portuguese (pt-PT), except quotes from the CV and rewritten lines, which stay in the CV's own language: if the CV is in English, "original", "improved" and "short" are in English.
The writing rules below are for your comments only; they never change the language of "original", "improved" or "short".
${HUMAN_STYLE}`;

const FULL_SCHEMA = obj({
  name: str("The candidate's name, as on the CV."),
  headline: str('Their title or target role, one short line. Empty string if the CV has none.'),
  contact: list(str('One contact detail (email, phone, city, link), exactly as on the CV.'), 'Contact details from the CV, in order. Empty if none.'),
  sections: list(obj({
    title: str("Section title in the CV's own language."),
    entries: list(obj({
      title: str('Job title, degree or item name. Empty string for a plain paragraph (like a profile).'),
      subtitle: str('Company or school and place. Empty string if none.'),
      dates: str('Dates exactly as on the CV. Empty string if none.'),
      lines: list(str('One bullet point, or for a paragraph entry the paragraph itself.'), 'The lines of this entry.'),
    }), "Entries in this section, in the CV's order."),
  }), 'Every section of the CV, in its order, nothing left out.'),
});

// O CV como está, copiado para a estrutura: as correções aplicam-se depois, linha a linha (lib/cv-apply.ts),
// por isso a estrutura do CV corrigido é sempre a do original.
const STRUCTURE_SYSTEM = `You copy a CV into a JSON structure, exactly as it is written. You never fix, improve, rewrite, translate, shorten, merge, reorder or add anything: corrections are applied later, line by line.
- "name" and "headline" (the title under the name) as on the CV. Every email, phone, address, city and link goes in "contact", without labels like "Email:".
- Sections in the order they appear. On a two-column page, keep the order within each column (the main column first, then the sidebar).
- Section titles exactly as written.
- Each job, degree or course is its own entry, even when several entries are identical (templates repeat "Company Name" or "2000 - 2000"): never merge or drop one. "title" is the job title or degree, "subtitle" the company or school (and place), "dates" the period as written.
- "lines": the entry's description or bullets, word for word, including placeholder text such as "Lorem ipsum". A profile or summary is one entry with an empty title and the whole paragraph as one line.
- Skills, tools, software and languages: one entry per item, with the item as "title" and no lines. Leave out levels shown as bars, dots or stars.
- Text read from a photo can be broken across columns: put each piece back in its own section and entry.
Plain text only, no markdown.`;
const structureSystem = (lang: string) => (lang ? `${STRUCTURE_SYSTEM}\nThe CV is in ${LANGUAGE_NAMES[lang]}: copy it in ${LANGUAGE_NAMES[lang]}, never translate.` : STRUCTURE_SYSTEM);
const languageNote = (lang: string) => lang ? `\n\nO CV está em ${LANGUAGE_NAMES[lang]}. Os campos "original", "improved" e "short" ficam em ${LANGUAGE_NAMES[lang]} (the rewritten lines must be in ${LANGUAGE_NAMES[lang]}).` : '';

type Body = { cvText?: string; name?: string; target?: string; mode?: 'full'; review?: Partial<Review> };

export async function POST(request: Request) {
  if (!hasKey()) return Response.json({ error: 'A revisão do CV precisa da GROQ_API_KEY.' }, { status: 503 });
  try {
    const { cvText: raw, name = 'CV', target = '', mode, review: given } = (await request.json()) as Body;
    const cvText = String(raw || '').trim().slice(0, 40_000);
    if (cvText.length < 40) return Response.json({ error: 'Esse CV parece curto demais para rever.' }, { status: 400 });
    const cvLang = languageOf(cvText);

    if (mode === 'full') {
      const rewrites = (given?.rewrites || []).filter((w) => w.original && w.improved)
        .map((w) => ({ ...w, improved: blankUnknownNumbers(w.improved, cvText, target) }));
      // 1. O CV original, tal como está, na estrutura: as mesmas secções, entradas e linhas, pela mesma ordem.
      const original = await structured<FullCv>({
        system: structureSystem(cvLang),
        // sem o nome do ficheiro: a IA chegou a usá-lo como nome da pessoa
        content: `${cvBlock(cvText, 'CV')}\n\nCopia este CV para a estrutura, tal como está.`,
        schema: FULL_SCHEMA,
        maxTokens: 16000,
      });
      // O nome é o da pessoa, nunca o do ficheiro; e uma secção que a cópia deixou cair volta, a partir do texto.
      const fileLike = (s: string) => !s.trim() || /\.(png|jpe?g|webp|gif|pdf|docx?|txt|rtf|md)$/i.test(s.trim()) || s.trim().toLowerCase() === name.trim().toLowerCase();
      const reviewed = String(given?.profile?.name || '').trim();
      const copied = String(original.name || '').trim();
      if (fileLike(copied)) original.name = reviewed;
      // a name split over two lines ("Henry" / "Madison") can come back cut short: the review has it whole
      else if (reviewed.split(/\s+/).length > copied.split(/\s+/).length && copied.toLowerCase().split(/\s+/).every((w) => reviewed.toLowerCase().split(/\s+/).includes(w))) original.name = reviewed;
      restoreSections(original, cvText);
      // 2. As correções da revisão (as mesmas da versão marcada) aplicadas linha a linha; o lorem ipsum sai.
      // 3. Fiel ao original (nenhuma frase perdida) e arrumado (contactos no cabeçalho, nada repetido).
      return Response.json({ full: tidyCv(keepFaithful(applyReview(original, rewrites, cvLang), cvText, rewrites)) });
    }

    const ask = target.trim() ? `Vaga ou anúncio:\n<target>\n${target.trim().slice(0, 6000)}\n</target>\n\nRevê o meu CV para esta vaga.` : 'Revê o meu CV.';
    const review = await structured<Review>({ system: SYSTEM, content: `${cvBlock(cvText, name)}\n\n${ask}${languageNote(cvLang)}`, schema: SCHEMA });
    if (review.profile) review.profile.seniority = SENIORITY[review.profile.seniority] || review.profile.seniority;
    review.scores = (review.scores || []).map((s) => ({ ...s, category: CATEGORIES[s.category] || s.category }));
    // Só frases se reescrevem: um título, um cargo com a empresa e as datas, ou uma lista de competências citada
    // não é uma frase, e mudá-lo estragaria a estrutura do CV. Fica de fora, na versão marcada e na corrigida.
    const isSentence = (s: string) => {
      const words = String(s).match(/[\p{L}\p{N}]+/gu) || [];
      const plain = words.filter((x) => /^\p{Ll}/u.test(x)).length;
      return words.length >= 5 && plain >= words.length * 0.3;
    };
    // Uma linha reescrita só guarda os números que estão no CV (ou na vaga); os outros passam a espaços para preencher.
    review.rewrites = (review.rewrites || []).filter((w) => isSentence(w.original))
      .map((w) => ({ ...w, improved: blankUnknownNumbers(w.improved, cvText, target), short: blankUnknownNumbers(w.short, cvText, target) }));
    const said = await intoLanguage(review.rewrites.flatMap((w) => [w.improved, w.short]), cvLang);
    review.rewrites.forEach((w, i) => { w.improved = said[i * 2]; w.short = said[i * 2 + 1]; });
    return Response.json({ review });
  } catch (error) {
    console.error('[analyze]', error);
    return Response.json({ error: friendlyError(error) }, { status: 502 });
  }
}
