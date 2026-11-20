// Traduz um CV já arrumado (FullCv) para outra língua, sem mexer na estrutura: as mesmas secções, entradas e linhas,
// pela mesma ordem. A app volta a desenhá-lo no mesmo estilo do original (components/review-view.tsx).
import { friendlyError, hasKey } from '@/lib/ai';
import { list, obj, str, structured } from '@/lib/ai-structured';
import type { FullCv } from '@/lib/review';

export const runtime = 'nodejs';
export const maxDuration = 120;

const LANGS: Record<string, string> = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', pt: 'European Portuguese', it: 'Italian' };

const SCHEMA = obj({
  name: str("The person's name, unchanged."),
  headline: str('The job title or headline, translated.'),
  contact: list(str('One contact item (email, phone, city, link), unchanged except words like the city name if it has a usual translation.')),
  sections: list(obj({
    title: str('The section title, translated to the standard title used in CVs in that language (e.g. Experience, Education, Skills, Languages).'),
    entries: list(obj({
      title: str('Entry title (job title, degree...), translated. Company and school names stay as they are.'),
      subtitle: str('Entry subtitle (company, school, place), translated only where it is an ordinary word.'),
      dates: str('Dates, with month names translated and "Present" in that language.'),
      lines: list(str('One line, translated.')),
    })),
  })),
});

const system = (lang: string) => `You translate a CV into ${lang}, the way a native professional recruiter would write it.
- Keep the structure exactly: the same sections, the same entries in each section and the same number of lines in each entry, in the same order. Never add, drop, merge or reorder anything.
- Keep unchanged: people's names, company, school and product names, emails, phone numbers, links, numbers and every placeholder in square brackets such as [X].
- Translate everything else naturally (not word for word): job titles, skills, section titles, months. Use the standard CV section titles of that language.
- Date ranges keep the same separator as the original (e.g. "March 2021 – Present"). Elsewhere: no dashes (— or –), no buzzwords, no exclamation marks.`;

export async function POST(request: Request) {
  if (!hasKey()) return Response.json({ error: 'Traduzir o CV precisa da GROQ_API_KEY.' }, { status: 503 });
  try {
    const { full, lang } = (await request.json()) as { full?: FullCv; lang?: string };
    const target = LANGS[String(lang)];
    if (!target) return Response.json({ error: 'Língua desconhecida.' }, { status: 400 });
    if (!full?.sections?.length) return Response.json({ error: 'Não chegou nenhum CV para traduzir.' }, { status: 400 });
    const translated = await structured<FullCv>({
      system: system(target),
      content: `Translate this CV (JSON) into ${target}, keeping the structure exactly:\n${JSON.stringify(full)}`,
      schema: SCHEMA,
      maxTokens: 16000,
    });
    // a estrutura tem de bater certo com a original; se a IA cortou alguma coisa, completa-se com o original
    translated.sections = full.sections.map((section, s) => {
      const t = translated.sections?.[s];
      return {
        title: t?.title || section.title,
        entries: section.entries.map((entry, e) => {
          const te = t?.entries?.[e];
          return { title: te?.title ?? entry.title, subtitle: te?.subtitle ?? entry.subtitle, dates: te?.dates ?? entry.dates, lines: entry.lines.map((line, l) => te?.lines?.[l] || line) };
        }),
      };
    });
    translated.name = full.name;
    if (!translated.contact?.length) translated.contact = full.contact;
    return Response.json({ full: translated });
  } catch (error) {
    return Response.json({ error: friendlyError(error) }, { status: 500 });
  }
}
