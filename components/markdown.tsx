import { Fragment, type ReactNode } from 'react';

// Enquanto a resposta aparece, cada palavra vem num <span class="w"> que entra a desfocar (ver .prose .w).
// As palavras já mostradas mantêm a mesma posição, por isso o React não as recria e só as novas animam.
let REVEAL = false;

/** Renderizador de Markdown pequeno e seguro (sem HTML bruto) para as respostas do assistente. */
export default function Markdown({ text, reveal = false }: { text: string; reveal?: boolean }) {
  REVEAL = reveal;
  try {
    return <>{parseBlocks(text)}</>;
  } finally {
    REVEAL = false;
  }
}

function words(text: string, key: number): ReactNode {
  if (!REVEAL) return text;
  return <Fragment key={`t${key}`}>{text.split(/(\s+)/).map((part, n) => (part && !/^\s+$/.test(part) ? <span className="w" key={n}>{part}</span> : part))}</Fragment>;
}

function parseBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      // Uma tabela Markdown que o modelo meteu dentro de um bloco de código desenha-se como tabela a sério.
      const tableInside = code.findIndex((l, k) => l.trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(code[k + 1] ?? ''));
      if (tableInside >= 0 && !['js', 'ts', 'java', 'python', 'py', 'c', 'cpp', 'html', 'css', 'sql', 'json'].includes(lang.toLowerCase())) {
        for (const node of parseBlocks(code.join('\n'))) blocks.push(<Fragment key={blocks.length}>{node}</Fragment>);
        continue;
      }
      const shown = visual(lang, code, blocks.length);
      blocks.push(shown ?? <pre key={blocks.length} data-lang={lang || undefined}><code>{code.join('\n')}</code></pre>);
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 4);
      const Tag = `h${level}` as 'h2' | 'h3' | 'h4';
      blocks.push(<Tag key={blocks.length}>{inline(heading[2])}</Tag>);
      i++;
      continue;
    }

    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { blocks.push(<hr key={blocks.length} />); i++; continue; }

    if (line.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]));
      blocks.push(
        <div className="md-table" key={blocks.length}><table>
          <thead><tr>{head.map((cell, c) => <th key={c}>{inline(cell)}</th>)}</tr></thead>
          <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{inline(cell)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={blocks.length}>{inline(quote.join(' '))}</blockquote>);
      continue;
    }

    const listMatch = /^\s*([-*+]|\d+[.)])\s+/.exec(line);
    if (listMatch) {
      const ordered = /\d/.test(listMatch[1]);
      const items: string[] = [];
      while (i < lines.length) {
        const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (item && /\d/.test(item[1]) === ordered) { items.push(item[2]); i++; }
        else if (lines[i].startsWith('   ') && items.length) { items[items.length - 1] += ' ' + lines[i].trim(); i++; }
        else break;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(<List key={blocks.length}>{items.map((item, n) => <li key={n}>{inline(item)}</li>)}</List>);
      continue;
    }

    if (!line.trim()) { i++; continue; }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|>|\||\s*([-*+]|\d+[.)])\s)/.test(lines[i])) paragraph.push(lines[i++]);
    if (!paragraph.length) paragraph.push(lines[i++]);
    blocks.push(<p key={blocks.length}>{paragraph.map((part, n) => <Fragment key={n}>{n > 0 && <br />}{inline(part)}</Fragment>)}</p>);
  }

  return blocks;
}

// Blocos visuais que o Leo escreve em vez de texto corrido (ver lib/leo.ts, VISUAL_RULES). Cada um tem um formato
// simples, linha a linha, para nunca partir: se vier mal escrito, aparece como texto normal.
const pairsOf = (lines: string[]) => lines.map((l) => l.trim()).filter(Boolean).map((l) => {
  const at = l.indexOf('|');
  return at < 0 ? [l, ''] : [l.slice(0, at).trim(), l.slice(at + 1).trim()];
});

// Nomes que o modelo às vezes inventa para "a resposta em destaque".
const KEY_ALIASES = new Set(['texto', 'resposta', 'nota', 'resultado', 'conclusao', 'resumo', 'answer']);

function visual(lang: string, lines: string[], key: number): ReactNode | null {
  let kind = lang.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  if (KEY_ALIASES.has(kind)) kind = 'destaque';
  if (kind === 'pontuacao') {
    const rows = lines.map((l) => /^(.+?)\s*[:|]\s*(\d{1,3})(?:\s*\/\s*100)?\s*%?\s*$/.exec(l.trim())).filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => ({ label: m[1].trim(), value: Math.max(0, Math.min(100, Number(m[2]))) }));
    if (!rows.length) return null;
    const tone = (v: number) => (v >= 75 ? 'good' : v >= 50 ? 'mid' : 'low');
    if (rows.length === 1) {
      const { label, value } = rows[0];
      return (
        <div className="vx vx-ring" key={key}>
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" className="vx-ring-track" /><circle cx="60" cy="60" r="52" className={`vx-ring-fill ${tone(value)}`} style={{ strokeDasharray: `${(value / 100) * 326.7} 326.7` }} /></svg>
          <div><strong>{value}</strong><span>{inline(label)}</span></div>
        </div>
      );
    }
    return (
      <div className="vx vx-scores" key={key}>
        {rows.map(({ label, value }, n) => (
          <div className="vx-score" key={n}>
            <div className="vx-score-head"><span>{inline(label)}</span><strong>{value}</strong></div>
            <div className="vx-bar"><i className={tone(value)} style={{ width: `${value}%` }} /></div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'antes-depois') {
    const items: { before: string; after: string; why: string }[] = [];
    for (const raw of lines) {
      const m = /^\s*(antes|depois|porqu[eê]|before|after|why)\s*:\s*(.*)$/i.exec(raw);
      if (!m) continue;
      const tag = m[1].toLowerCase();
      if (tag === 'antes' || tag === 'before' || !items.length) items.push({ before: '', after: '', why: '' });
      const item = items[items.length - 1];
      if (tag === 'antes' || tag === 'before') item.before = m[2];
      else if (tag === 'depois' || tag === 'after') item.after = m[2];
      else item.why = m[2];
    }
    const good = items.filter((x) => x.after);
    if (!good.length) return null;
    return (
      <div className="vx vx-ba" key={key}>
        {good.map((x, n) => (
          <div className="vx-ba-item" key={n}>
            {x.before && <p className="vx-before"><span>Antes</span>{inline(x.before)}</p>}
            <p className="vx-after"><span>Depois</span>{inline(x.after)}</p>
            {x.why && <p className="vx-why">{inline(x.why)}</p>}
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'passos') {
    const rows = pairsOf(lines);
    if (!rows.length) return null;
    return (
      <ol className="vx vx-steps" key={key}>
        {rows.map(([title, text], n) => <li key={n}><b>{n + 1}</b><div><strong>{inline(title)}</strong>{text && <span>{inline(text)}</span>}</div></li>)}
      </ol>
    );
  }
  if (kind === 'cartoes') {
    const rows = pairsOf(lines);
    if (!rows.length) return null;
    return (
      <div className="vx vx-cards" key={key}>
        {rows.map(([title, text], n) => <div className="vx-card" key={n}><strong>{inline(title)}</strong>{text && <span>{inline(text)}</span>}</div>)}
      </div>
    );
  }
  // A resposta-chave, em grande: a primeira linha é a resposta, as seguintes explicam.
  if (kind === 'destaque') {
    const rows = lines.map((l) => l.trim()).filter(Boolean);
    if (!rows.length) return null;
    return (
      <div className="vx vx-key" key={key}>
        <strong>{inline(rows[0])}</strong>
        {rows.slice(1).map((r, n) => <span key={n}>{inline(r)}</span>)}
      </div>
    );
  }
  // Valores para comparar (qualquer número, com unidade opcional): barras proporcionais ao maior.
  if (kind === 'barras') {
    const rows = lines.map((l) => /^(.+?)\s*[:|]\s*(-?\d+(?:[.,]\d+)?)\s*(.*)$/.exec(l.trim())).filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => ({ label: m[1].trim(), value: Number(m[2].replace(',', '.')), unit: m[3].trim() }));
    if (!rows.length) return null;
    const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9);
    return (
      <div className="vx vx-bars" key={key}>
        {rows.map(({ label, value, unit }, n) => (
          <div className="vx-barrow" key={n}>
            <span className="vx-barlabel">{inline(label)}</span>
            <div className="vx-bar"><i style={{ width: `${Math.max(3, (Math.abs(value) / max) * 100)}%` }} /></div>
            <strong>{String(value).replace('.', ',')}{unit ? ` ${unit}` : ''}</strong>
          </div>
        ))}
      </div>
    );
  }
  // Datas ou etapas ao longo do tempo.
  if (kind === 'linha-tempo' || kind === 'cronologia') {
    const rows = pairsOf(lines);
    if (!rows.length) return null;
    return (
      <ol className="vx vx-time" key={key}>
        {rows.map(([when, what], n) => <li key={n}><b>{inline(when)}</b><span>{inline(what)}</span></li>)}
      </ol>
    );
  }
  // Uma hierarquia (classes, conceitos, partes de um todo): a indentação diz quem está dentro de quem.
  if (kind === 'arvore') {
    const rows = lines.filter((l) => l.trim()).map((l) => ({ depth: Math.floor((l.match(/^\s*/)?.[0].length ?? 0) / 2), text: l.trim().replace(/^[-*]\s+/, '') }));
    if (!rows.length) return null;
    return (
      <ul className="vx vx-tree" key={key}>
        {rows.map(({ depth, text }, n) => <li key={n} style={{ '--d': depth } as React.CSSProperties} className={depth ? '' : 'root'}><span>{inline(text)}</span></li>)}
      </ul>
    );
  }
  // Causa e efeito, ou um processo curto: passos ligados por setas ("A -> B -> C", ou um por linha).
  if (kind === 'fluxo') {
    const steps = lines.join(' -> ').split(/\s*(?:->|→)\s*/).map((s) => s.trim()).filter(Boolean);
    if (steps.length < 2) return null;
    return (
      <div className="vx vx-flow" key={key}>
        {steps.map((s, n) => <Fragment key={n}>{n > 0 && <i aria-hidden="true">→</i>}<span>{inline(s)}</span></Fragment>)}
      </div>
    );
  }
  if (kind === 'checklist') {
    const rows = lines.map((l) => /^\s*([+\-xX✓✗])\s+(.*)$/.exec(l)).filter((m): m is RegExpExecArray => Boolean(m));
    if (!rows.length) return null;
    return (
      <ul className="vx vx-check" key={key}>
        {rows.map((m, n) => { const ok = m[1] === '+' || m[1] === '✓'; return <li key={n} className={ok ? 'ok' : 'fix'}><i aria-hidden="true">{ok ? '✓' : '!'}</i><span>{inline(m[2])}</span></li>; })}
      </ul>
    );
  }
  return null;
}

function inline(text: string): ReactNode[] {
  // "<br>" escrito pelo modelo (sobretudo dentro de tabelas) vira uma quebra de linha a sério
  if (/<br\s*\/?>/i.test(text)) return text.split(/<br\s*\/?>/i).map((part, n) => <Fragment key={`p${n}`}>{n > 0 && <br />}{inline(part)}</Fragment>);
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push(words(text.slice(last, index), out.length));
    const token = match[0];
    const key = out.length;
    if (token.startsWith('`')) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('**') || token.startsWith('__')) out.push(<strong key={key}>{inline(token.slice(2, -2))}</strong>);
    else if (token.startsWith('[')) out.push(<a key={key} href={match[2]} target="_blank" rel="noreferrer noopener">{token.slice(1, token.indexOf(']'))}</a>);
    else out.push(<em key={key}>{inline(token.slice(1, -1))}</em>);
    last = index + token.length;
  }
  if (last < text.length) out.push(words(text.slice(last), out.length));
  return out;
}
