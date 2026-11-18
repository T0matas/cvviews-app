// A revisão de um CV, como a do site oficial (cvviews-ofcsite/api/analyze.js e public/app.js):
// os tipos que o servidor devolve e a folha marcada para CVs que só existem como texto.

export type Review = {
  is_cv: boolean;
  not_cv_reason: string;
  overall_score: number;
  verdict: string;
  summary: string;
  profile: { name: string; current_role: string; seniority: string; years_experience: string };
  scores: { category: string; score: number; note: string }[];
  strengths: { title: string; detail: string; evidence: string }[];
  weaknesses: { title: string; detail: string; fix: string; severity: 'high' | 'medium' | 'low' }[];
  rewrites: { original: string; improved: string; short: string; why: string }[];
  ats: { score: number; missing_keywords: string[]; issues: string[] };
  next_steps: string[];
};

export type FullCv = {
  name: string;
  headline: string;
  contact: string[];
  sections: { title: string; entries: { title: string; subtitle: string; dates: string; lines: string[] }[] }[];
};

export const SEVERITY: Record<string, string> = { high: 'corrigir primeiro', medium: 'vale a pena corrigir', low: 'pormenor' };

/* ---------------- A folha marcada ----------------
   A revisão cita o CV palavra a palavra, por isso as citações voltam a encontrar-se no texto e marcam-se
   como faria a caneta de quem revê: riscadas com a linha nova escrita ao lado, ou sublinhadas. */
const WORD = /[\p{L}\p{N}%+#]+/gu;
function findQuote(line: string, quote: string) {
  const words = String(quote || '').match(WORD);
  if (!words?.length) return null;
  const pattern = (list: string[]) => new RegExp(list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\p{L}\\p{N}%+#]+'), 'iu');
  const whole = line.match(pattern(words));
  if (whole?.index != null) return { start: whole.index, end: whole.index + whole[0].length };
  if (words.length < 5) return null;
  const head = line.match(pattern(words.slice(0, 5)));
  return head?.index != null ? { start: head.index, end: line.length } : null;
}
// Uma nota à mão tem poucas palavras, não um parágrafo.
const shortNote = (text: string) => {
  const first = String(text || '').split(/(?<=[.;:])\s/)[0].replace(/[.;:]$/, '');
  return first.length > 70 ? `${first.slice(0, 67).trimEnd()}…` : first;
};

export type Piece = { text: string; kind?: 'del' | 'ins' | 'hi' };
export type MarkedRow = { kind: 'name' | 'heading' | 'item' | 'line'; pieces: Piece[]; fixed: string; note?: { text: string; tone: 'good' | 'fix' } };

export function markedCv(r: Review, text: string): { rows: MarkedRow[]; corrected: string } | null {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 140);
  if (lines.length < 3) return null;
  const rewrites = (r.rewrites || []).filter((w) => w.original && w.improved);
  const strengths = (r.strengths || []).filter((s) => s.evidence);
  const used = new Set<string>();
  let marks = 0;

  const rows: MarkedRow[] = lines.map((line, i) => {
    const spans: { start: number; end: number; kind: 'del' | 'hi'; improved?: string }[] = [];
    let note: MarkedRow['note'];
    rewrites.forEach((w, k) => {
      if (used.has(`w${k}`)) return;
      const at = findQuote(line, w.original);
      if (!at || spans.some((s) => at.start < s.end && s.start < at.end)) return;
      used.add(`w${k}`);
      spans.push({ ...at, kind: 'del', improved: w.improved });
      note ??= { text: shortNote(w.why), tone: 'fix' };
    });
    strengths.forEach((s, k) => {
      if (used.has(`s${k}`)) return;
      const at = findQuote(line, s.evidence);
      if (!at || spans.some((x) => at.start < x.end && x.start < at.end)) return;
      used.add(`s${k}`);
      spans.push({ ...at, kind: 'hi' });
      note ??= { text: s.title, tone: 'good' };
    });
    spans.sort((a, b) => a.start - b.start);
    marks += spans.length;

    // A linha como está no papel, e como fica depois de corrigida.
    const pieces: Piece[] = [];
    let fixed = '';
    let pos = 0;
    for (const s of spans) {
      pieces.push({ text: line.slice(pos, s.start) });
      fixed += line.slice(pos, s.start);
      const piece = line.slice(s.start, s.end);
      if (s.kind === 'del') {
        pieces.push({ text: piece, kind: 'del' }, { text: ' ' }, { text: s.improved!, kind: 'ins' });
        fixed += s.improved;
      } else {
        pieces.push({ text: piece, kind: 'hi' });
        fixed += piece;
      }
      pos = s.end;
    }
    pieces.push({ text: line.slice(pos) });
    fixed += line.slice(pos);

    const bullet = /^[-•*·▪●◦–]\s*/.test(line);
    const heading = i > 0 && line.length <= 40 && !bullet && (/:$/.test(line) || (line === line.toUpperCase() && /\p{L}{3}/u.test(line)));
    if (bullet && pieces[0]) pieces[0] = { ...pieces[0], text: pieces[0].text.replace(/^[-•*·▪●◦–]\s*/, '') };
    return { kind: i === 0 ? 'name' : heading ? 'heading' : bullet ? 'item' : 'line', pieces: pieces.filter((p) => p.text), fixed, note: note?.text ? note : undefined };
  });

  // As palavras-chave que um recrutador procura, escritas ao lado das competências.
  const kws = (r.ats?.missing_keywords || []).slice(0, 6);
  if (kws.length) {
    const skills = rows.findIndex((row) => row.kind === 'heading' && /compet|skill|aptid|ferrament|tecnolog|conhecimento/i.test(row.fixed));
    rows.splice(skills >= 0 ? skills + 1 : rows.length, 0, { kind: 'line', pieces: [{ text: `+ ${kws.join(', ')}`, kind: 'ins' }], fixed: kws.join(', '), note: { text: 'o que um recrutador procura', tone: 'fix' } });
    marks += 1;
  }
  if (!marks) return null;
  return { rows, corrected: rows.map((row) => row.fixed).join('\n') };
}

// O CV corrigido como texto simples, para copiar.
export function cvDocText(f: FullCv) {
  const out: string[] = [f.name, f.headline, (f.contact || []).join(' | '), ''];
  for (const s of f.sections || []) {
    out.push(s.title.toUpperCase());
    for (const e of s.entries || []) {
      const top = [e.title, e.subtitle, e.dates].filter(Boolean).join(', ');
      if (top) out.push(top);
      for (const l of e.lines || []) out.push(e.title || (e.lines || []).length > 1 ? `- ${l}` : l);
    }
    out.push('');
  }
  return out.filter((l, i, a) => l != null && !(l === '' && a[i - 1] === '')).join('\n').trim();
}

// Um resumo curto da revisão, em texto, para o Leo ter contexto nas perguntas seguintes.
export function reviewSummary(r: Review) {
  if (r.is_cv === false) return `O ficheiro não parece um CV. ${r.not_cv_reason}`;
  return [
    `Revi o CV. ${r.verdict} Nota geral: ${r.overall_score} em 100.`,
    r.summary,
    r.weaknesses?.length ? `A corrigir: ${r.weaknesses.map((w) => `${w.title} (${w.fix})`).join('; ')}.` : '',
    r.rewrites?.length ? `Linhas reescritas: ${r.rewrites.map((w) => `"${w.original}" passa a "${w.improved}"`).join('; ')}.` : '',
    r.ats?.missing_keywords?.length ? `Palavras-chave em falta: ${r.ats.missing_keywords.join(', ')}.` : '',
  ].filter(Boolean).join('\n');
}
