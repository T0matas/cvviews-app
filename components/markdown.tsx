import { Fragment, type ReactNode } from 'react';

/** Renderizador de Markdown pequeno e seguro (sem HTML bruto) para as respostas do assistente. */
export default function Markdown({ text }: { text: string }) {
  return <>{parseBlocks(text)}</>;
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
      blocks.push(<pre key={blocks.length} data-lang={lang || undefined}><code>{code.join('\n')}</code></pre>);
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

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const token = match[0];
    const key = out.length;
    if (token.startsWith('`')) out.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('**') || token.startsWith('__')) out.push(<strong key={key}>{inline(token.slice(2, -2))}</strong>);
    else if (token.startsWith('[')) out.push(<a key={key} href={match[2]} target="_blank" rel="noreferrer noopener">{token.slice(1, token.indexOf(']'))}</a>);
    else out.push(<em key={key}>{inline(token.slice(1, -1))}</em>);
    last = index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
