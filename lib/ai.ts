// Portado de cvviews-ofcsite/lib/ai.js: o mesmo fornecedor (Groq, ou xAI sem chave Groq),
// os mesmos modelos de recurso quando o limite por minuto enche e as mesmas regras de escrita.
import { extractText, getDocumentProxy } from 'unpdf';

// Groq e xAI seguem ambos o formato chat-completions da OpenAI.
const PROVIDER = process.env.GROQ_API_KEY
  ? { name: 'Groq', env: 'GROQ_API_KEY', baseUrl: 'https://api.groq.com/openai/v1', model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b' }
  : { name: 'xAI', env: 'XAI_API_KEY', baseUrl: 'https://api.x.ai/v1', model: process.env.XAI_MODEL || 'grok-4' };

export const hasKey = () => Boolean(process.env[PROVIDER.env]);

// Os modelos gpt-oss da Groq pesquisam na web do lado da Groq (browser_search); o xAI aqui não.
export const WEB_SEARCH = PROVIDER.name === 'Groq';

// Transcreve áudio (ditado no compositor) com o Whisper da Groq.
// O nome do ficheiro tem de bater certo com o formato gravado (webm no Chrome, mp4 no Safari).
export async function transcribe(audio: Blob, language = 'pt') {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new ApiError(0, 'missing key');
  const type = audio.type.split(';')[0] || 'audio/webm';
  const extension = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' }[type] ?? 'webm';
  const form = new FormData();
  form.append('file', new Blob([await audio.arrayBuffer()], { type }), `audio.${extension}`);
  form.append('model', process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo');
  form.append('language', language);
  form.append('response_format', 'json');
  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!response.ok) throw new ApiError(response.status, (await response.text().catch(() => '')).slice(0, 500));
  const data = (await response.json()) as { text?: string };
  return String(data.text || '').trim();
}

// Lê fotografias de um CV (ou páginas de um PDF sem texto). Só a Groq está ligada para isto, como no site.
export const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';

export async function imageToText(dataUrl: string, signal?: AbortSignal) {
  if (PROVIDER.name !== 'Groq') throw new Error('Não foi possível ler fotografias neste momento. Experimenta um PDF com texto ou cola o texto.');
  const response = await complete({
    model: VISION_MODEL,
    max_tokens: 6000,
    temperature: 0,
    reasoning_format: 'hidden',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Transcribe all the text of the CV page in this image exactly as written, once, keeping the line breaks and section order. Leave out text outside the page (captions, labels or watermarks around it). Output only the text, nothing else. If the image has no readable text, output NO_TEXT.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    }],
  }, signal);
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = String(data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return text === 'NO_TEXT' ? '' : cleanTranscript(text);
}

// O modelo de visão às vezes fica preso: transcreve a página toda uma segunda vez e depois repete a mesma linha
// até ao fim. Isso duplicava secções e entradas no CV corrigido. Fica só a primeira transcrição.
export function cleanTranscript(text: string) {
  // 1. A mesma linha várias vezes seguidas fica uma vez.
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const last = [...lines].reverse().find((l) => l.trim());
    if (line.trim() && last && last.trim() === line.trim()) continue;
    lines.push(line);
  }
  let out = lines.join('\n');
  // 2. Quando a transcrição recomeça do início (as primeiras palavras outra vez, mais à frente), corta-se aí.
  const words = [...out.matchAll(/\S+/g)].map((m) => ({ at: m.index ?? 0, w: m[0].toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') })).filter((x) => x.w);
  const N = 10;
  if (words.length > N * 4) {
    const head = words.slice(0, N).map((x) => x.w).join(' ');
    for (let i = Math.floor(words.length * 0.25); i <= words.length - N; i++) {
      if (words.slice(i, i + N).map((x) => x.w).join(' ') === head) { out = out.slice(0, words[i].at); break; }
    }
  }
  return out.trim();
}

// gpt-oss pensa antes de responder e isso conta para o limite por minuto; um pensamento leve chega.
export const REASONING = PROVIDER.name === 'Groq' ? { reasoning_effort: process.env.GROQ_REASONING || 'low' } : {};

export const HUMAN_STYLE = `Escreve sempre em português de Portugal (pt-PT), nunca em português do Brasil.
Trata a pessoa por "tu" e usa o vocabulário de Portugal: "equipa", "ficheiro", "ecrã", "telemóvel", "utilizador", "candidatura", "contacto", "facto", "programador" (não "desenvolvedor").
Escreve como um recrutador atento e simpático fala com alguém do outro lado da mesa: palavras simples, frases curtas, concreto sobre esta pessoa e nada genérico.
Nunca uses travessões (— ou –); usa vírgulas, pontos ou parênteses.
Prefere palavras portuguesas a anglicismos: "pontos" ou "linhas" e não "bullet points", "títulos" e não "headings" (nomes de ferramentas, cargos e siglas como ATS ficam como estão).
Evita estas palavras e outras parecidas: alavancar, potenciar, robusto, sinergia, dinâmico, apaixonado, disruptivo, inovador, jornada, crucial, fundamental, além disso, ademais, no mundo atual, desbloquear, elevar, mergulhar.
Sem pontos de exclamação, a não ser que seja mesmo uma boa notícia. Sem emojis.`;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// O plano gratuito da Groq limita os tokens por minuto de cada modelo. Quando o principal enche,
// pede-se a um mais pequeno; se ambos estiverem cheios e a espera for curta, espera-se.
const FALLBACK_MODEL = PROVIDER.name === 'Groq' ? process.env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b' : null;
const MAX_WAIT_S = 25;
const isRateLimit = (error: unknown) => error instanceof ApiError && (error.status === 429 || error.status === 413 || /rate_limit_exceeded/.test(error.message));
function retryAfter(error: ApiError) {
  if (/Request too large/i.test(error.message)) return null;
  const m = error.message.match(/try again in (?:(\d+)m)?([\d.]+)s/);
  return m ? Number(m[1] || 0) * 60 + Number(m[2]) : null;
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function send(body: Record<string, unknown>, signal?: AbortSignal) {
  const key = process.env[PROVIDER.env];
  if (!key) throw new ApiError(0, 'missing key');
  const response = await fetch(`${PROVIDER.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ApiError(response.status, detail.slice(0, 500));
  }
  return response;
}

export async function complete(body: Record<string, unknown>, signal?: AbortSignal) {
  const models = body.model ? [body.model as string] : [PROVIDER.model, FALLBACK_MODEL].filter((m): m is string => Boolean(m));
  const waits: { model: string; wait: number }[] = [];
  let lastError: unknown;
  for (const model of models) {
    try {
      return await send({ ...body, model }, signal);
    } catch (error) {
      if (!isRateLimit(error)) throw error;
      console.warn(`[${PROVIDER.name}] ${model} is at its limit`);
      lastError = error;
      const wait = retryAfter(error as ApiError);
      if (wait != null) waits.push({ model, wait });
    }
  }
  const soonest = waits.sort((a, b) => a.wait - b.wait)[0];
  if (!soonest || soonest.wait > MAX_WAIT_S) throw lastError;
  await sleep((soonest.wait + 0.5) * 1000);
  return send({ ...body, model: soonest.model }, signal);
}

// Troca os caracteres tipográficos que fazem um texto parecer escrito por uma máquina.
export function humanize(value: string) {
  return value
    .replace(/[‐‑‒]/g, '-')
    .replace(/^([ \t]*)[–—][ \t  ]*/gm, '$1- ')
    .replace(/(\d)[   ]*[–—][   ]*(\d)/g, '$1-$2')
    .replace(/[ \t  ]*[–—][ \t  ]*/g, ', ')
    .replace(/[  ]/g, ' ');
}

// O que a pessoa vê nunca nomeia o fornecedor, a chave ou uma configuração: os detalhes vão só para o log.
const UNAVAILABLE = 'O serviço não está disponível neste momento. Tenta de novo daqui a pouco.';
export function friendlyError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 0 || error.status === 401 || error.status === 403) {
      console.error(`[${PROVIDER.name}] key missing, invalid or out of credits (${PROVIDER.env}): ${error.status} ${error.message.slice(0, 300)}`);
      return UNAVAILABLE;
    }
    if (error.status === 429) return 'Estamos com muitos pedidos neste momento. Tenta de novo daqui a um minuto.';
    if (error.status === 400 || error.status === 413) {
      console.error(`[${PROVIDER.name} ${error.status}]`, error.message);
      return 'Não foi possível tratar esse pedido. Experimenta um CV mais curto ou noutro formato.';
    }
    console.error(`[${PROVIDER.name} ${error.status}]`, error.message.slice(0, 300));
    return 'Algo correu mal do nosso lado. Tenta de novo.';
  }
  const message = error instanceof Error ? error.message : '';
  if (!message || /api[_ ]?key|groq|xai|grok|openai|token|ECONN|fetch failed/i.test(message)) {
    console.error('[erro]', message.slice(0, 300));
    return 'Algo correu mal. Tenta de novo.';
  }
  return message;
}

export async function pdfText(base64: string) {
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, 'base64')));
  const { text } = await extractText(pdf, { mergePages: true });
  const clean = String(text).trim();
  if (clean.length < 40) throw new Error('Não foi possível ler texto desse PDF. Se for digitalizado, cola antes o texto.');
  return clean;
}

// A etiqueta <cv> é nossa, não faz parte do documento, por isso o modelo não a deve avaliar.
export function cvBlock(text: string, name: string) {
  return `O CV está entre as etiquetas <cv> abaixo. Foi o CVviews que as acrescentou; não fazem parte do documento.\n<cv name="${name.replace(/"/g, "'")}">\n${text}\n</cv>`;
}
