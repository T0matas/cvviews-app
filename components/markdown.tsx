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

function visual(lang: string, lines: string[], key: number): ReactNode | null {
  const kind = lang.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
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
