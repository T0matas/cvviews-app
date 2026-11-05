import type { CSSProperties, ReactNode } from 'react';
import { Globe, Linkedin, Mail, MapPin, Phone } from 'lucide-react';
import type { FullCv } from '@/lib/review';
import type { CvStyle } from '@/lib/markup.js';

// O CV corrigido no desenho do original: as mesmas colunas, cores, foto e tipo de letra,
// mas montado de raiz, por isso nada fica por cima de outra coisa nem fora do sítio.

type Section = FullCv['sections'][number];

export const isChipSection = (title: string) => /compet|skill|aptid|ferrament|tecnolog|idioma|lingua|language|interess|hobb|softw|tools|conhecimento/i.test(title);
const isProfile = (title: string) => /perfil|profile|resumo|summary|sobre|about|objetiv/i.test(title);

// Uma linha "A · B · C" (ou "A, B, C" de itens curtos) vira etiquetas.
export function chipsOf(lines: string[]) {
  const out: string[] = [];
  for (const line of lines) {
    const parts = line.split(/\s+·\s+|\s*;\s*/).flatMap((p) => (p.split(/,\s+/).every((x) => x.split(' ').length <= 4) ? p.split(/,\s+/) : [p]));
    out.push(...parts.map((p) => p.trim()).filter(Boolean));
  }
  return out;
}

export function contactIcon(text: string) {
  if (/@/.test(text)) return Mail;
  if (/linkedin/i.test(text)) return Linkedin;
  if (/https?:|www\.|\.(com|pt|io|me|net|org)\b/i.test(text)) return Globe;
  if ((text.match(/\d/g) || []).length >= 7 && !/\p{L}{4}/u.test(text)) return Phone;
  return MapPin;
}

const Blanks = ({ s }: { s: string }) => <>{String(s).split(/(\[[^\]\n]{1,14}\])/g).map((part, i) => (/^\[[^\]]+\]$/.test(part) ? <mark className="cvdoc-blank" key={i}>{part}</mark> : part))}</>;

function SectionView({ s, inSide }: { s: Section; inSide: boolean }) {
  const chips = isChipSection(s.title) && s.entries.every((e) => !e.title || !e.lines.length);
  return (
    <section className="cvx-sec">
      <h3>{s.title}</h3>
      {chips ? (
        <div className="cvx-chips">{chipsOf(s.entries.flatMap((e) => [e.title, ...e.lines].filter(Boolean))).map((c, i) => <span key={i}>{c}</span>)}</div>
      ) : (
        s.entries.map((e, i) => {
          const meta = [e.subtitle, e.dates].filter(Boolean).join(' | ');
          const paragraph = !e.title && e.lines.length === 1;
          return (
            <div className="cvx-entry" key={i}>
              {e.title && <p className="cvx-title">{e.title}</p>}
              {meta && <p className="cvx-meta">{meta}</p>}
              {paragraph ? (
                <p className={`cvx-para${isProfile(s.title) && inSide ? ' boxed' : ''}`}><Blanks s={e.lines[0]} /></p>
              ) : e.lines.length > 0 && (
                <ul>{e.lines.map((l, k) => <li key={k}><Blanks s={l} /></li>)}</ul>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}

export default function CvStyled({ f, style: st }: { f: FullCv; style: CvStyle }) {
  const vars = {
    '--cvx-accent': st.accent || '#1a1a1a',
    '--cvx-heading': st.heading || st.accent || '#1a1a1a',
    '--cvx-decor': st.decor || st.accent || '#1a1a1a',
    '--cvx-band': st.band || `color-mix(in srgb, ${st.decor || st.accent || '#1a1a1a'} 10%, #fff)`,
    '--cvx-side-bg': st.sideBg || 'transparent',
    '--cvx-side': `${Math.round(Math.min(0.44, Math.max(0.3, st.sideRatio || 0.36)) * 100)}%`,
    fontFamily: st.font ? `${st.font}, ${st.serif ? 'Georgia, serif' : 'Arial, sans-serif'}` : st.serif ? 'Georgia, "Times New Roman", serif' : 'Calibri, "Segoe UI", Arial, sans-serif',
  } as CSSProperties;

  const photo = st.photo && <img className={`cvx-photo${st.photo.round ? ' round' : ''}`} src={st.photo.src} alt="" />;
  const contactList = (
    <ul className="cvx-contact">{f.contact.map((c, i) => { const Icon = contactIcon(c); return <li key={i}><Icon size={14} />{c}</li>; })}</ul>
  );
  const header = (
    <header className="cvx-head">
      {st.photo?.column === st.header && photo}
      <div>
        <h2 className={st.nameUpper ? 'upper' : ''}>{f.name}</h2>
        {f.headline && <p className="cvx-role">{f.headline}</p>}
        {st.contact === 'header' && f.contact.length > 0 && <p className="cvx-line">{f.contact.join('  ·  ')}</p>}
      </div>
    </header>
  );
  const column = (which: 'side' | 'main') => {
    const parts: ReactNode[] = [];
    if (st.header === which) parts.push(<div key="h">{header}</div>);
    else if (st.photo?.column === which) parts.push(<div key="p" className="cvx-photo-wrap">{photo}</div>);
    if (which === 'side' && st.contact === 'side' && f.contact.length) parts.push(<section className="cvx-sec" key="c"><h3>{/[ãçõé]|ção/i.test(f.sections.map((s) => s.title).join(' ')) ? 'Contacto' : 'Contact'}</h3>{contactList}</section>);
    f.sections.forEach((s, i) => { if (st.sections[i] === which) parts.push(<SectionView key={i} s={s} inSide={which === 'side'} />); });
    return parts;
  };

  return (
    <article className={`cvx${st.sideDark ? ' side-dark' : ''}`} style={vars}>
      {st.topBar && <i className="cvx-bar" aria-hidden="true" />}
      {st.two ? (
        <div className={`cvx-grid side-${st.side}`}>
          <div className="cvx-col cvx-main">{column('main')}</div>
          <div className="cvx-col cvx-side">{column('side')}</div>
        </div>
      ) : (
        <div className="cvx-one">{column('main')}</div>
      )}
    </article>
  );
}
