// Atualiza a memória do Leo depois de uma resposta: recebe as notas que já existem e a última troca de mensagens,
// e devolve as notas atualizadas (só factos duradouros e úteis para CVs e candidaturas).
import { friendlyError, hasKey, SMALL_MODEL } from '@/lib/ai';
import { structured } from '@/lib/ai-structured';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_NOTES = 20;

const SYSTEM = `Manténs a memória do Leo, o assistente do CVviews, sobre a pessoa com quem ele fala. Recebes as notas atuais e a última troca de mensagens e devolves a lista de notas atualizada.
- Guarda só factos duradouros e úteis para a ajudar com CVs, candidaturas e recrutamento: a área e o cargo que procura, os anos de experiência, as competências principais, a cidade ou região, as línguas, as vagas a que se está a candidatar, os objetivos e as preferências (por exemplo, CV de uma página).
- Se for alguém que recruta: a empresa, as vagas que está a preencher e os critérios que valoriza.
- Nunca guardes dados sensíveis ou de identificação: saúde, religião, orientação sexual, opiniões políticas, origem, NIF, números de documentos, morada, telefone ou email. Nem dados de outras pessoas (candidatos que um recrutador avalia).
- Não guardes o que foi só uma pergunta passageira, nem o que o Leo respondeu.
- Cada nota é uma frase curta em português de Portugal, na terceira pessoa ("Procura vagas de Product Designer em Lisboa").
- No máximo ${MAX_NOTES} notas: junta as parecidas, substitui as que mudaram e tira as que deixaram de ser verdade.
- Se não houver nada de novo, devolve as notas exatamente como estavam.`;

const SCHEMA = {
  type: 'object',
  properties: { notes: { type: 'array', items: { type: 'string' }, description: 'A lista completa de notas, atualizada.' } },
  required: ['notes'],
  additionalProperties: false,
};

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function POST(request: Request) {
  let body: { notes?: unknown; question?: unknown; answer?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Pedido inválido.' }, { status: 400 });
  }
  const notes = (Array.isArray(body.notes) ? body.notes : []).map((n) => text(n, 240)).filter(Boolean).slice(0, MAX_NOTES);
  const question = text(body.question, 4000).trim();
  const answer = text(body.answer, 4000).trim();
  if (!question || !hasKey()) return Response.json({ notes });

  try {
    const result = await structured<{ notes: string[] }>({
      system: SYSTEM,
      content: `Notas atuais:\n${notes.length ? notes.map((n) => `- ${n}`).join('\n') : '(nenhuma)'}\n\nA pessoa escreveu:\n${question}\n\nO Leo respondeu:\n${answer}`,
      schema: SCHEMA,
      maxTokens: 2000,
      model: SMALL_MODEL,
    });
    const next = (result.notes || []).map((n) => text(n, 240).trim()).filter(Boolean).slice(0, MAX_NOTES);
    return Response.json({ notes: next });
  } catch (error) {
    console.error('[memory]', error);
    return Response.json({ notes, error: friendlyError(error) });
  }
}
