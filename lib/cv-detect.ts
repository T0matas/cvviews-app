// Um anexo é um CV, ou outro documento (um trabalho, uma ficha, um teste, um enunciado)?
// Usado na app (para decidir entre a revisão de CV e uma resposta normal) e no servidor (para dizer ao Leo o que recebeu).

const CV_WORDS = /\b(experi[êe]ncia profissional|experi[êe]ncia|work experience|experience|forma[çc][ãa]o acad[ée]mica|forma[çc][ãa]o|educa[çc][ãa]o|education|compet[êe]ncias|skills|habilita[çc][õo]es|curr[íi]culo|curriculum vitae|resume|perfil profissional|profile|idiomas|languages|refer[êe]ncias|references|objetivo profissional|certifica[çc][õo]es|certifications|linkedin|soft skills|hard skills)\b/gi;
const TASK_WORDS = /\b(pergunta|perguntas|quest[ãa]o|quest[õo]es|exerc[íi]cio|exerc[íi]cios|responde|responda|resolve|resolva|calcula|calcule|explica|explique|indica|indique|justifica|justifique|completa|complete|identifica|identifique|ficha|teste|enunciado|grupo [ivx]+|cota[çc][ãa]o|quest(ion)?s?|answer|explain|calculate)\b/gi;

export function looksLikeCv(text: string) {
  const t = text.slice(0, 15000);
  const cvWords = new Set((t.match(CV_WORDS) ?? []).map((w) => w.toLowerCase())).size;
  const contacts = (/[\w.+-]+@[\w-]+\.[\w.]+/.test(t) ? 1 : 0) + (/(\+?\d[\d\s().-]{8,}\d)/.test(t) ? 1 : 0);
  const periods = (t.match(/\b(19|20)\d{2}\s*[-–—]\s*((19|20)\d{2}|presente|present|atual|atualmente|hoje|now)\b/gi) ?? []).length;
  const cv = cvWords * 2 + contacts * 1.5 + Math.min(periods, 4);
  const task = (t.match(TASK_WORDS) ?? []).length + (t.match(/\?/g) ?? []).length * 0.6;
  return cv >= 5 && cv > task;
}

// A mensagem pede para fazer o trabalho (responder, resolver, completar)?
export const asksToDoTask = (message: string) => /\b(faz|fa[çc]a|fazer|faz isto|responde|responda|responder|resolve|resolva|resolver|completa|complete|preenche|preencha|do (it|this)|answer|solve)\b/i.test(message);

// A mensagem fala de um CV (então é mesmo para rever o CV)?
export const mentionsCv = (message: string) => /\b(cv|c\.v\.|curr[íi]culo|curriculum|resume|candidatura)\b/i.test(message);

// Juntando tudo: este anexo, com esta mensagem, vai para a revisão de CV?
export function isCvReview(text: string, message: string) {
  if (mentionsCv(message)) return true;
  if (asksToDoTask(message)) return false;
  return looksLikeCv(text);
}
