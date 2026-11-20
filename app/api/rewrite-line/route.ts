// O Leo reescreve uma só linha do CV, a pedido, no editor (components/cv-editor.tsx).
// Mesmas regras de sempre: diz o mesmo, melhor escrito, sem inventar números nem resultados ([X] para preencher).
import { complete, friendlyError, hasKey, humanize, REASONING } from '@/lib/ai';
import { REWRITE_RULES } from '@/lib/leo';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  if (!hasKey()) return Response.json({ error: 'O Leo precisa da GROQ_API_KEY para reescrever.' }, { status: 503 });
  try {
    const { line, context, target } = (await request.json()) as { line?: string; context?: string; target?: string };
    const text = String(line || '').trim();
    if (!text) return Response.json({ error: 'Não há texto nesta linha.' }, { status: 400 });
    const response = await complete({
      max_tokens: 400,
      ...REASONING,
      messages: [
        { role: 'system', content: `Reescreves uma linha de um CV. Respondes só com a linha nova, sem aspas nem explicações, na mesma língua da linha original.\n\n${REWRITE_RULES}` },
        { role: 'user', content: `${target ? `Vaga: ${target}\n` : ''}${context ? `Onde está: ${String(context).slice(0, 200)}\n` : ''}Linha: ${text}` },
      ],
    }, request.signal);
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content || '';
    const improved = humanize(raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim().split('\n').filter(Boolean)[0] || '').replace(/^["“«]|["”»]$/g, '').trim();
    if (!improved) throw new Error('resposta vazia');
    return Response.json({ line: improved });
  } catch (error) {
    return Response.json({ error: friendlyError(error) }, { status: 500 });
  }
}
