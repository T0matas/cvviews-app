import { friendlyError, hasKey, imageToText } from '@/lib/ai';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_IMAGES = 4;
const IMAGE = /^data:image\/(jpeg|png|webp);base64,/;

// Lê qualquer imagem com o modelo de visão: o texto de um documento (um CV, uma ficha, as páginas de um PDF feito de
// imagens), ou o texto que houver mais uma descrição detalhada de uma fotografia, de um gráfico ou de um desenho.
export async function POST(request: Request) {
  if (!hasKey()) return Response.json({ error: 'Ler imagens precisa da GROQ_API_KEY.' }, { status: 503 });
  try {
    const { images } = (await request.json()) as { images?: unknown };
    const list = (Array.isArray(images) ? images : [])
      .filter((src): src is string => typeof src === 'string' && IMAGE.test(src) && src.length < 4_000_000)
      .slice(0, MAX_IMAGES);
    if (!list.length) return Response.json({ error: 'Não chegou nenhuma imagem.' }, { status: 400 });
    // Uma página de cada vez: o limite por minuto da Groq é curto.
    const pages: string[] = [];
    for (const src of list) pages.push(await imageToText(src, request.signal));
    const text = pages.filter(Boolean).join('\n\n').trim();
    if (text.length < 10) return Response.json({ error: 'Não consegui ler esta imagem. Experimenta outra, mais nítida.' }, { status: 422 });
    return Response.json({ text });
  } catch (error) {
    return Response.json({ error: friendlyError(error) }, { status: 502 });
  }
}
