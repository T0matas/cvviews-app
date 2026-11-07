import { complete, cvBlock, friendlyError, hasKey, humanize, HUMAN_STYLE, REASONING, WEB_SEARCH } from '@/lib/ai';
import { demoReply } from '@/lib/demo';
import { CANDIDATE_KNOWLEDGE, CV_FOCUS, RECRUITER_KNOWLEDGE, REWRITE_RULES, VISUAL_RULES } from '@/lib/leo';
import { SEARCH_SIGNAL, type ChatRequest, type Mode } from '@/lib/types';
import { isCvReview } from '@/lib/cv-detect';

export const runtime = 'nodejs';
export const maxDuration = 120;

const WINDOW = 30;

// Um anexo que não é um CV (um trabalho, uma ficha, um teste, um enunciado) segue com outra etiqueta.
const docBlock = (text: string, name: string) =>
  `O documento anexado está entre as etiquetas <documento> abaixo. Foi o CVviews que as acrescentou; não fazem parte do documento.\n<documento name="${name.replace(/"/g, "'")}">\n${text}\n</documento>`;

// E o Leo faz o que a pessoa pede com ele: "faz" responde a todas as perguntas.
const DOC_TASK = `Documento anexado (não é um CV): pode ser um trabalho, uma ficha, um teste, um enunciado ou outro texto. Faz exatamente o que a pessoa pede com ele.
- Se ela pedir para fazer, responder, resolver ou completar ("faz", "responde", "resolve"), ou só anexar o documento sem dizer mais nada e ele tiver perguntas, responde a TODAS as perguntas e exercícios, pela ordem e com a mesma numeração do documento, sem saltar nenhuma.
- Para cada uma: o número e a pergunta resumida em **negrito**, e logo a seguir a resposta completa e correta. Em cálculos e problemas, mostra os passos; em perguntas de desenvolvimento, escreve a resposta como se fosse entregue (frases completas, bem estruturadas).
- Escolhas múltiplas: indica a opção certa e explica numa frase porquê. Verdadeiro/falso: diz qual é e corrige as falsas.
- Se uma pergunta depender de algo que não está no texto (uma imagem, um gráfico, um texto de apoio em falta), diz o que falta e responde ao resto.
- Aqui não uses os blocos visuais nem ligues a resposta a CVs ou carreira.
- Responde na língua do documento, salvo se a pessoa ou as Configurações pedirem outra.`;


// A data de hoje e a regra de pesquisar, para o modelo não responder com o que sabia no treino.
function today(web: boolean) {
  const date = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Lisbon' });
  return `Hoje é ${date}. O que sabes de memória pode estar desatualizado.` + (web
    ? ' Tens pesquisa na web: usa-a sempre que a pergunta dependa de factos atuais ou que mudam (cargos, notícias, preços, salários, leis, empresas, resultados, datas) e responde com o que encontrares. Pesquisa também sempre que te perguntem por uma pessoa, uma empresa ou um facto que não saibas com certeza. Para conversa e conselhos sobre CVs não precisas de pesquisar.'
    : ' Se a pergunta depender de factos atuais, avisa que podes não estar a par das últimas mudanças.');
}

// O que o Leo se lembra desta pessoa, de conversas anteriores. O último CV só entra quando a conversa não tem
// nenhum anexado e a pergunta é sobre CVs ou candidaturas (para não gastar o limite por minuto à toa).
const ABOUT_CV = /(?<!\p{L})(cv|cvs|currículo|curriculo|vaga|vagas|candidatura|candidaturas|carta|entrevista|perfil|linkedin|experiência|experiencia|competências|competencias|adapta|melhora|revê|reve)(?!\p{L})/iu;
function memoryNote(memory: ChatRequest['memory'], question: string, hasAttachment: boolean) {
  if (!memory) return '';
  const notes = (Array.isArray(memory.notes) ? memory.notes : []).filter((n) => typeof n === 'string' && n.trim()).slice(0, 20).map((n) => n.slice(0, 240));
  let out = '';
  if (notes.length) out += `

O que já sabes sobre esta pessoa, de conversas anteriores. Usa-o quando ajudar, sem o repetir em cada resposta; se ela disser agora algo diferente, vale o que diz agora:
- ${notes.join('\n- ')}`;
  const LABELS: Record<string, string> = { preparar: 'a preparar', enviada: 'enviada', entrevista: 'em entrevista', proposta: 'com proposta', recusada: 'recusada' };
  const apps = (Array.isArray(memory.applications) ? memory.applications : []).slice(0, 40).filter((a) => a && (a.company || a.role));
  if (apps.length) out += '\n\nAs candidaturas que esta pessoa está a acompanhar no CVviews (fala delas pelo nome quando vier a propósito):\n' + apps.map((a) => `- ${String(a.role || 'Vaga').slice(0, 120)} na ${String(a.company || 'empresa por indicar').slice(0, 120)}: ${LABELS[a.status] ?? a.status}`).join('\n');
  const cv = memory.cv;
  if (cv?.text && !hasAttachment && ABOUT_CV.test(question)) {
    out += `

O último CV que esta pessoa partilhou contigo, de uma conversa anterior. Quando ela falar do CV dela, é deste: conta como anexado, por isso não lhe peças para o voltar a anexar.
${cvBlock(String(cv.text).slice(0, 12000), String(cv.name || 'CV').slice(0, 160))}`;
  }
  return out;
}

// Tira as marcas de citação do browser_search (【1†L7-L10】).
const stripCitations = (text: string) => text.replace(/【[^】]*】/g, '');

const SYSTEM_PROMPTS: Record<Mode, string> = {
  recrutador: `És o Leo, o assistente dentro do CVviews, aqui a ajudar quem recruta. Fala como uma pessoa normal e simpática.
Ajudas a ler currículos, comparar perfis com os requisitos de uma vaga, montar grelhas de avaliação e preparar perguntas de entrevista.
A decisão é sempre humana: apresenta evidências e pontos a confirmar, nunca veredictos nem pontuações finais sobre pessoas. Baseia-te só no que está no documento e separa o que está demonstrado do que é suposição.
Nunca infiras nem uses características pessoais protegidas (idade, género, origem, estado civil, saúde, religião) e avisa se te pedirem para o fazer.
As respostas têm o tamanho de que precisam e não mais: parágrafos curtos, listas e tabelas só quando ajudam.

${RECRUITER_KNOWLEDGE}

${CV_FOCUS}

${VISUAL_RULES}

${HUMAN_STYLE}

${REWRITE_RULES}`,
  candidato: `És o Leo, o assistente dentro do CVviews. Fala como uma pessoa normal e simpática.
Se alguém te cumprimentar, responde de forma natural e breve, sem despejar conselhos que ninguém pediu.
A tua especialidade são CVs, procura de emprego, entrevistas e carreiras.
Quando te pedem para corrigir, melhorar ou reescrever algo, faz: dá o texto corrigido pronto a copiar e depois uma ou duas linhas sobre o que mudou.
As linhas reescritas do CV continuam verdadeiras, usam [marcadores] para números que só a pessoa sabe e ficam na língua do próprio CV.
As respostas têm o tamanho de que precisam e não mais: parágrafos curtos, listas só quando ajudam.

${CANDIDATE_KNOWLEDGE}

${CV_FOCUS}

${VISUAL_RULES}

${HUMAN_STYLE}

${REWRITE_RULES}`,
};

// A língua escolhida nas Configurações vem por último, para valer sobre a regra de pt-PT.
const LANG_NOTE: Record<string, string> = {
  'pt-PT': '',
  en: '\n\nLanguage: ignore the European Portuguese rule above and always answer in English.',
};

const textResponse = (stream: ReadableStream<Uint8Array>, mode: 'live' | 'demo') =>
  new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-CVViews-Mode': mode, 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return new Response('Pedido inválido.', { status: 400 });
  }

  const mode: Mode = body.mode === 'candidato' ? 'candidato' : 'recrutador';
  const web = WEB_SEARCH && body.web !== false;
  const history = (body.messages ?? []).filter((m) => m.text?.trim() || m.attachments?.length);
  const last = history.at(-1);
  if (!last || last.role !== 'user') return new Response('Sem mensagem.', { status: 400 });

  if (!hasKey()) return textResponse(streamDemo(demoReply(last.text, mode, Boolean(last.attachments?.length))), 'demo');

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        // Os anexos chegam já como texto (lidos quando foram anexados) e seguem na mensagem em que foram enviados.
        let hasDoc = false;
        let turns = history.map((message) => {
          if (message.role === 'assistant') return { role: 'assistant', content: message.text };
          const parts: string[] = [];
          for (const file of message.attachments ?? []) {
            const text = file.data?.trim();
            if (!text) continue;
            if (isCvReview(text, message.text ?? '')) parts.push(cvBlock(text, file.name));
            else { parts.push(docBlock(text, file.name)); hasDoc = true; }
          }
          parts.push(message.text.trim() || 'Lê o documento anexado e faz o que ele pede.');
          return { role: 'user', content: parts.join('\n\n') };
        });

        // Mantém o primeiro turno (onde costuma estar o CV) e a janela mais recente.
        if (turns.length > WINDOW) {
          let recent = turns.slice(-WINDOW + 2);
          if (recent[0].role === 'assistant') recent = recent.slice(1);
          turns = [turns[0], { role: 'assistant', content: 'Percebido. Pergunta o que quiseres.' }, ...recent];
        }

        const response = await complete({
          max_tokens: 8000,
          ...REASONING,
          ...(web ? { tools: [{ type: 'browser_search' }], tool_choice: 'auto' } : {}),
          stream: true,
          messages: [{ role: 'system', content: `${SYSTEM_PROMPTS[mode]}

${today(web)}${memoryNote(body.memory, last.text, history.some((m) => m.attachments?.some((f) => f.data?.trim())))}${hasDoc ? `

${DOC_TASK}` : ""}${LANG_NOTE[body.lang ?? "pt-PT"] ?? ""}` }, ...turns, ...(LANG_NOTE[body.lang ?? "pt-PT"] ? [{ role: "system", content: LANG_NOTE[body.lang!].trim() }] : [])],
        }, request.signal);

        // O texto sai uma palavra atrás do modelo, para o humanize() ver um travessão junto
        // dos espaços e algarismos à volta, mesmo quando chegam em pedaços diferentes.
        let pending = '';
        const flush = (final: boolean) => {
          // Uma citação 【…】 pode chegar partida entre pedaços: o texto só sai até um 【 ainda aberto.
          const open = pending.lastIndexOf('【');
          const limit = !final && open > pending.lastIndexOf('】') ? open : pending.length;
          const cut = final ? pending.length : pending.slice(0, limit).search(/\S*[\s–—]*$/);
          const ready = pending.slice(0, cut);
          pending = pending.slice(cut);
          if (ready) write(humanize(stripCitations(ready)));
        };

        // Server-sent events: uma linha "data: {json}" por pedaço, a terminar em "data: [DONE]".
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finish = '';
        let searching = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const data = line.trim().replace(/^data:\s*/, '');
            if (!line.trim().startsWith('data:') || data === '[DONE]') continue;
            const choice = JSON.parse(data).choices?.[0];
            if (choice?.finish_reason) finish = choice.finish_reason;
            if (!searching && choice?.delta?.executed_tools) { searching = true; write(SEARCH_SIGNAL); }
            const text = choice?.delta?.content;
            if (text) { pending += text; flush(false); }
          }
        }
        flush(true);
        if (finish === 'length') write('\n\n_A resposta ficou cortada por ser demasiado longa._');
        controller.close();
      } catch (error) {
        if (request.signal.aborted) return controller.close();
        console.error('[chat]', error);
        write(`\n\n_${friendlyError(error)}_`);
        controller.close();
      }
    },
  });

  return textResponse(stream, 'live');
}

function streamDemo(text: string) {
  const encoder = new TextEncoder();
  const chunks = text.match(/\S+\s*|\s+/g) ?? [text];
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, 18));
      }
      controller.close();
    },
  });
}
