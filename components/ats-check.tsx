'use client';

// O que um sistema de recrutamento (ATS) consegue ler do CV: se há texto, por que ordem o lê, se encontra os
// contactos, as secções e as datas. Tudo calculado aqui, a partir do texto que o próprio PDF dá (é o mesmo que um
// ATS extrai) e da posição das palavras na página; não precisa da IA.

export type AtsInfo = { columns: boolean; switches: number } | null;
type Kind = 'pdf' | 'image' | 'other';
type Check = { ok: boolean | 'mid'; title: string; detail: string; weight?: number };

const SECTIONS = [
  /\b(experi[eê]ncia|experience|employment|percurso profissional)\b/i,
  /\b(forma[cç][aã]o|educa[cç][aã]o|education|habilita[cç][oõ]es)\b/i,
  /\b(compet[eê]ncias|skills|aptid[oõ]es|conhecimentos)\b/i,
  /\b(l[ií]nguas|idiomas|languages)\b/i,
  /\b(perfil|resumo|sobre mim|profile|summary|about)\b/i,
];

export function checks(text: string, kind: Kind, ats: AtsInfo): Check[] {
  if (kind === 'image') {
    return [{ ok: false, weight: 85, title: 'O ATS não consegue ler este ficheiro', detail: 'É uma fotografia ou um PDF digitalizado: para um sistema de recrutamento não tem texto nenhum. Exporta o CV em PDF a partir do Word ou do Google Docs.' }];
  }
  const out: Check[] = [];
  const email = /[\w.+-]+@[\w-]+\.[\w.]+/.test(text);
  const phone = /(\+?\d[\d\s().-]{7,}\d)/.test(text);
  out.push(email && phone
    ? { ok: true, title: 'Contactos encontrados', detail: 'O email e o telefone estão em texto, onde o ATS os encontra.' }
    : { ok: false, title: email || phone ? 'Falta um contacto' : 'Contactos não encontrados', detail: `${!email ? 'O email' : 'O telefone'} não aparece como texto. Se está dentro de um ícone ou de uma imagem, o ATS não o lê.` });

  const found = SECTIONS.filter((re) => re.test(text)).length;
  out.push(found >= 3
    ? { ok: true, title: 'Secções reconhecíveis', detail: 'Os títulos são os habituais (Experiência, Formação, Competências), e o ATS sabe onde está cada coisa.' }
    : { ok: found === 2 ? 'mid' : false, title: 'Títulos de secção pouco claros', detail: 'Usa títulos simples como "Experiência profissional", "Formação" e "Competências", para o ATS arrumar o teu percurso.' });

  if (kind === 'pdf' && ats?.columns) {
    out.push(ats.switches > 8
      ? { ok: false, title: 'As colunas misturam-se', detail: 'O texto das duas colunas é lido intercalado, linha a linha, e a experiência fica baralhada com as competências. Uma coluna só, ou colunas feitas com caixas de texto separadas, resolve.' }
      : { ok: true, title: 'Duas colunas, lidas pela ordem certa', detail: 'Primeiro uma coluna, depois a outra: o ATS não as mistura.' });
  }

  const years = (text.match(/\b(19|20)\d{2}\b/g) || []).length;
  const ranges = (text.match(/\b(19|20)\d{2}\s*[-–—a]+\s*((19|20)\d{2}|presente|atual|actual|hoje|present|now)\b/gi) || []).length;
  out.push(years >= 2 && ranges >= 1
    ? { ok: true, title: 'Datas legíveis', detail: 'As datas têm início e fim, num formato que o ATS entende.' }
    : { ok: years >= 2 ? 'mid' : false, title: years >= 2 ? 'Datas sem intervalo claro' : 'Quase não há datas', detail: 'Escreve cada experiência com início e fim, como "2021 - 2024" ou "Set 2021 - Presente".' });

  const words = text.split(/\s+/).filter(Boolean).length;
  out.push(words < 220
    ? { ok: false, title: 'Pouco texto', detail: `O ATS só encontra ${words} palavras. Descreve o que fizeste em cada experiência, com as palavras-chave das vagas.` }
    : words > 1100
      ? { ok: 'mid', title: 'CV longo', detail: `São ${words} palavras. Uma ou duas páginas chegam: corta o que não é para esta vaga.` }
      : { ok: true, title: 'Quantidade de texto certa', detail: `${words} palavras: o suficiente para o ATS encontrar as tuas competências.` });

  const odd = (text.match(/[-■-◿✀-➿]/g) || []).length;
  if (odd > 3) out.push({ ok: false, title: 'Símbolos estranhos', detail: 'Há ícones ou símbolos que o ATS lê como caracteres soltos. Troca-os por palavras ("Email:", "Telefone:").' });
  return out;
}

export default function AtsCheck({ text, kind, ats }: { text: string; kind: Kind; ats: AtsInfo }) {
  const list = checks(text, kind, ats);
  const score = Math.max(5, Math.min(100, Math.round(list.reduce((s, c) => s - (c.ok === true ? 0 : c.weight ?? (c.ok === 'mid' ? 7 : 15)), 100))));
  const tone = score >= 75 ? 'good' : score >= 50 ? 'mid' : 'low';
  return (
    <div className="ats">
      <div className="vx vx-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" className="vx-ring-track" /><circle cx="60" cy="60" r="52" className={`vx-ring-fill ${tone}`} style={{ strokeDasharray: `${(score / 100) * 326.7} 326.7` }} /></svg>
        <div><strong>{score}</strong><span>{score >= 75 ? 'Um ATS lê bem o teu CV' : score >= 50 ? 'Um ATS lê o teu CV com falhas' : 'Um ATS tem dificuldade em ler o teu CV'}</span></div>
      </div>
      <ul className="vx vx-check">
        {list.map((c, n) => (
          <li key={n} className={c.ok === true ? 'ok' : 'fix'}><i aria-hidden="true">{c.ok === true ? '✓' : '!'}</i><span><strong>{c.title}.</strong> {c.detail}</span></li>
        ))}
      </ul>
      {kind !== 'image' && text.trim() && (
        <details className="ats-text">
          <summary>Ver o texto como o ATS o lê</summary>
          <pre>{text.slice(0, 3000)}{text.length > 3000 ? '\n…' : ''}</pre>
        </details>
      )}
    </div>
  );
}
