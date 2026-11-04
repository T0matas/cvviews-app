import { ApiError, friendlyError, hasKey, transcribe } from '@/lib/ai';

export const runtime = 'nodejs';

const MAX_BYTES = 24 * 1024 * 1024;

export async function POST(request: Request) {
  if (!hasKey() || !process.env.GROQ_API_KEY) return Response.json({ error: 'O ditado precisa da GROQ_API_KEY.' }, { status: 503 });
  try {
    const form = await request.formData();
    const audio = form.get('audio');
    if (!(audio instanceof Blob) || !audio.size) return Response.json({ error: 'Não chegou áudio.' }, { status: 400 });
    if (audio.size > MAX_BYTES) return Response.json({ error: 'A gravação é demasiado longa.' }, { status: 413 });
    const language = form.get('language') === 'en' ? 'en' : 'pt';
    return Response.json({ text: await transcribe(audio, language) });
  } catch (error) {
    // Um áudio que a Groq não consegue ler (curto demais ou noutro formato) não é um problema de CV.
    if (error instanceof ApiError && error.status === 400) {
      console.error('[transcribe 400]', error.message);
      return Response.json({ error: 'Não consegui ouvir a gravação. Grava de novo, durante pelo menos um segundo.' }, { status: 400 });
    }
    return Response.json({ error: friendlyError(error) }, { status: 502 });
  }
}
