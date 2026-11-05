// A revisão de um CV, portada de cvviews-ofcsite/api/analyze.js:
// sem `mode`, devolve a revisão (nota, o que corrigir, linhas reescritas, palavras-chave);
// com `mode: "full"`, devolve o CV todo reescrito com essa revisão aplicada.
import { cvBlock, friendlyError, hasKey, HUMAN_STYLE } from '@/lib/ai';
import { blankUnknownNumbers, CV_STYLE, int, intoLanguage, LANGUAGE_NAMES, languageOf, list, obj, oneOf, str, structured } from '@/lib/ai-structured';
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
    original: str("A weak line quoted word for word from the CV, in the CV's own language."),
    improved: str("A stronger rewrite in the CV's own language, so it can be pasted straight in. Keep it truthful; use [placeholders] for numbers the candidate must fill in."),
    short: str("The same improvement as a natural sentence in the CV's own language and tone, about as long as the original line (at most a third longer), to replace it in place on the page. Only facts already on that line; a figure the candidate must add is a placeholder like [X]."),
    why: str('Why the rewrite is stronger, one sentence.'),
  }), '3 to 6 before/after rewrites of the weakest lines (profile and bullets), weakest first.'),
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
If a target role or job description is given, judge relevance against it; otherwise infer the most likely target from the CV.
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
  }), 'Every section of the CV, in its order, nothing left out except what the review said to cut.'),
});

const FULL_SYSTEM = `You are CVviews. You get a CV and a review of it, and you write the whole CV again with the review applied.
Keep every true fact, section, job, date and contact detail. Apply the review: use its rewritten lines where they fit, drop what it said to cut, fix the weaknesses it found.
Every line the review rewrote must appear as the review's improved version, and clichés it flagged go. Lines the review did not touch can be tightened, never padded.
Work line by line. Every line you write comes from a line of the same job or section on the CV (or the review's rewrite of that line). Never move a line to another job, never write the same line twice.
Never add anything the CV does not say: no new duties, achievements, frequencies, skill levels, tools, jobs or results. Names, job titles, companies, places and dates stay exactly as written for each entry (a "Secretary" job stays "Secretary"), and no examples the CV does not name.
A placeholder like [X] or [X %] is only for a figure missing from a result the CV already mentions; do not add new results around placeholders.
Structure, always, even when the original layout was messy (two columns, a photo, text read from an image):
- Name and headline go in "name" and "headline"; every email, phone, address, city and link goes in "contact" only, never in a section.
- Keep the CV's own section titles, as written on it (a CV with "PROFESSIONAL EXPERIENCE" keeps "Professional Experience").
- Sections in this order when they exist: profile or summary, experience, projects, education, certifications, skills, languages, anything else. One section per topic, never the same section twice.
- Each job, degree or course is one entry: "title" is the job title or degree, "subtitle" is the company or school (and city), "dates" is its period. Its bullets go in "lines", under that entry and no other.
- A profile/summary is one entry with an empty title and the paragraph as its only line.
- Skills, tools and languages are short items, one per line, with no sentences and no dates.
- No empty sections, no empty entries, no line that only repeats a title or a date, no stray text left over from the page layout (page numbers, "CV", "Curriculum Vitae", column labels).
Plain text only, no markdown.`;
const fullSystem = (lang: string) => lang && lang !== 'pt'
  ? `${FULL_SYSTEM}\nThe CV is in ${LANGUAGE_NAMES[lang]}. Every line you write, section titles included, stays in ${LANGUAGE_NAMES[lang]}; never translate it.\n${CV_STYLE(lang)}`
  : `${FULL_SYSTEM}\nWrite in European Portuguese, as in Portugal: "geri" (not "gerenciei"), "orçamento" (not "budget"), "equipa", "desempenho".\n${HUMAN_STYLE}`;
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
      const full = await structured<FullCv>({
        system: fullSystem(cvLang),
        content: `${cvBlock(cvText, name)}\n\nA revisão (JSON):\n${JSON.stringify(given || {}).slice(0, 20000)}\n\n${target.trim() ? `Vaga: ${target.trim().slice(0, 2000)}\n\n` : ''}Escreve o CV todo, já corrigido.`,
        schema: FULL_SCHEMA,
        maxTokens: 16000,
      });
      // Cada linha que a revisão reescreveu entra como a revisão a escreveu, mesmo que o modelo tenha deixado a antiga.
      const wordsOf = (s: string) => new Set(String(s).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
      const alike = (a: string, b: string) => { const x = wordsOf(a), y = wordsOf(b); let both = 0; for (const w of x) if (y.has(w)) both++; return both / Math.max(1, Math.min(x.size, y.size)); };
      const rewrites = (given?.rewrites || []).filter((w) => w.original && w.improved);
      const fix = (line: string) => blankUnknownNumbers(rewrites.find((w) => alike(line, w.original) >= 0.75)?.improved ?? line, cvText, target);
      full.sections = (full.sections || []).map((s) => ({ ...s, entries: (s.entries || []).map((e) => ({ ...e, lines: (e.lines || []).map(fix) })) }));
      // A estrutura fica sempre arrumada: contactos no cabeçalho, secções pela ordem certa, nada repetido ou solto.
      return Response.json({ full: tidyCv(full) });
    }

    const ask = target.trim() ? `Vaga ou anúncio:\n<target>\n${target.trim().slice(0, 6000)}\n</target>\n\nRevê o meu CV para esta vaga.` : 'Revê o meu CV.';
    const review = await structured<Review>({ system: SYSTEM, content: `${cvBlock(cvText, name)}\n\n${ask}${languageNote(cvLang)}`, schema: SCHEMA });
    if (review.profile) review.profile.seniority = SENIORITY[review.profile.seniority] || review.profile.seniority;
    review.scores = (review.scores || []).map((s) => ({ ...s, category: CATEGORIES[s.category] || s.category }));
    // Uma linha reescrita só guarda os números que estão no CV (ou na vaga); os outros passam a espaços para preencher.
    review.rewrites = (review.rewrites || []).map((w) => ({ ...w, improved: blankUnknownNumbers(w.improved, cvText, target), short: blankUnknownNumbers(w.short, cvText, target) }));
    const said = await intoLanguage(review.rewrites.flatMap((w) => [w.improved, w.short]), cvLang);
    review.rewrites.forEach((w, i) => { w.improved = said[i * 2]; w.short = said[i * 2 + 1]; });
    return Response.json({ review });
  } catch (error) {
    console.error('[analyze]', error);
    return Response.json({ error: friendlyError(error) }, { status: 502 });
  }
}
