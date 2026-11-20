// A estrutura visual de um CV em imagem, lida pelo modelo de visão: de que lado fica a coluna lateral, as cores,
// em que coluna e por que ordem fica cada secção e como cada uma é desenhada. O editor (components/cv-editor.tsx)
// usa-a para refazer o CV com o mesmo desenho do original.
import { complete, friendlyError, hasKey, VISION_MODEL } from '@/lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

export type CvLayoutInfo = {
  sidebar: 'left' | 'right' | 'none';
  sidebarWidth: number;            // fração da largura da página (0.25 a 0.45)
  sidebarColor: string;            // cor de fundo da coluna lateral (#rrggbb)
  sidebarDark: boolean;            // letra branca na coluna
  accent: string;                  // cor dos títulos de secção na coluna principal
  pageColor: string;
  nameUpper: boolean;
  nameColumn: 'side' | 'main';
  photo: 'side' | 'main' | 'none';
  photoShape: 'round' | 'square';
  contactColumn: 'side' | 'main';
  contactTitle: string;            // o título da secção de contacto, como está escrito ("CONTACT"), ou ""
  sections: { title: string; column: 'side' | 'main'; style: 'bullets' | 'paragraph' | 'timeline' | 'two-columns' | 'tags' }[];
};

const PROMPT = `Look at this CV page and describe its visual structure as JSON only (no other text), with exactly these keys:
{"sidebar":"left"|"right"|"none","sidebarWidth":number (fraction of page width, e.g. 0.36),"sidebarColor":"#rrggbb","sidebarDark":true|false,"accent":"#rrggbb" (colour of the section titles in the main column),"pageColor":"#rrggbb","nameUpper":true|false,"nameColumn":"side"|"main","photo":"side"|"main"|"none","photoShape":"round"|"square","contactColumn":"side"|"main","contactTitle":"the contact section title exactly as written, or empty","sections":[{"title":"exact section title as written","column":"side"|"main","style":"bullets"|"paragraph"|"timeline"|"two-columns"|"tags"}]}
- List every section (except the contact block) in reading order: first all sections of the left column from top to bottom, then the right column.
- "timeline" is a list of jobs joined by a vertical line with dots; "two-columns" is a section whose entries sit side by side (like two references); "paragraph" is running text; "bullets" is a bulleted list.
- Colours: sample the real colours you see. A dark navy sidebar is something like #1f3b5c.`;

const HEX = /^#[0-9a-f]{6}$/i;
const pick = <T extends string>(v: unknown, ok: readonly T[], fallback: T): T => (ok.includes(v as T) ? (v as T) : fallback);

export async function POST(request: Request) {
  if (!hasKey()) return Response.json({ error: 'Sem GROQ_API_KEY.' }, { status: 503 });
  try {
    const { image } = (await request.json()) as { image?: string };
    if (!image?.startsWith('data:image/')) return Response.json({ error: 'Falta a imagem.' }, { status: 400 });
    const response = await complete({
      model: VISION_MODEL,
      max_tokens: 1500,
      temperature: 0,
      reasoning_format: 'hidden',
      messages: [{ role: 'user', content: [{ type: 'text', text: PROMPT }, { type: 'image_url', image_url: { url: image } }] }],
    }, request.signal);
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = String(data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as Record<string, unknown>;
    const sidebar = pick(json.sidebar, ['left', 'right', 'none'] as const, 'none');
    const layout: CvLayoutInfo = {
      sidebar,
      sidebarWidth: Math.max(0.25, Math.min(0.45, Number(json.sidebarWidth) || 0.34)),
      sidebarColor: HEX.test(String(json.sidebarColor)) ? String(json.sidebarColor) : '#f1f4f3',
      sidebarDark: Boolean(json.sidebarDark),
      accent: HEX.test(String(json.accent)) ? String(json.accent) : '#1f1f1f',
      pageColor: HEX.test(String(json.pageColor)) ? String(json.pageColor) : '#ffffff',
      nameUpper: Boolean(json.nameUpper),
      nameColumn: pick(json.nameColumn, ['side', 'main'] as const, 'main'),
      photo: pick(json.photo, ['side', 'main', 'none'] as const, 'none'),
      photoShape: pick(json.photoShape, ['round', 'square'] as const, 'round'),
      contactColumn: pick(json.contactColumn, ['side', 'main'] as const, sidebar === 'none' ? 'main' : 'side'),
      contactTitle: String(json.contactTitle || '').slice(0, 30),
      sections: (Array.isArray(json.sections) ? json.sections : []).slice(0, 16).map((s) => {
        const o = s as Record<string, unknown>;
        return { title: String(o.title || '').slice(0, 60), column: pick(o.column, ['side', 'main'] as const, 'main'), style: pick(o.style, ['bullets', 'paragraph', 'timeline', 'two-columns', 'tags'] as const, 'bullets') };
      }).filter((s) => s.title),
    };
    return Response.json({ layout });
  } catch (error) {
    return Response.json({ error: friendlyError(error) }, { status: 500 });
  }
}
