'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Download, FileDown, RotateCcw } from 'lucide-react';
import LeoWriting from './leo-writing';
import { cvDocText, type FullCv, markedCv, type Review, SEVERITY } from '@/lib/review';
import { tidyCv } from '@/lib/cv-tidy';
import type { CvLayout, styleFor as styleForType } from '@/lib/markup.js';
import CvStyled from './cv-styled';
import AtsCheck, { type AtsInfo } from './ats-check';

/** O ficheiro original, guardado só em memória, para desenhar as correções por cima dele. */
export type CvSource = { pdf?: string; images?: string[] };

type Props = {
  review?: Review;
  error?: string;
  cvText: string;
  cvName: string;
  target?: string;
  source?: CvSource;
  full?: FullCv;
  onFull: (full: FullCv) => void;
};

const STEPS = ['A ler o teu CV', 'A perceber a que vagas se adequa', 'A marcar o que funciona e o que não funciona', 'A escrever novas versões'];
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const baseName = (name: string) => (name || 'CV').replace(/\.[a-z0-9]+$/i, '');

function download(href: string, name: string) {
  Object.assign(document.createElement('a'), { href, download: name }).click();
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="text-act" onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1600); })}>
      {done ? <Check size={14} /> : <Copy size={14} />}{done ? 'Copiado' : label}
    </button>
  );
}

// Enquanto a revisão não chega, o Leo vai dizendo o que está a fazer.
function Working() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3200);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="rv-working">
      <LeoWriting label={STEPS[step]} />
      <div className="rv-skeleton" aria-hidden="true"><i /><i /><i /></div>
    </div>
  );
}

export default function ReviewView({ review: r, error, cvText, cvName, target, source, full, onFull }: Props) {
  if (error) return <p className="rv-error">{error}</p>;
  if (!r) return <Working />;
  if (r.is_cv === false) {
    return (
      <div className="rv">
        <h3 className="rv-verdict">Isto não parece um CV.</h3>
        <p className="rv-summary">{r.not_cv_reason || 'Anexa um CV em PDF, Word, texto ou fotografia.'}</p>
      </div>
    );
  }

  const score = clamp(r.overall_score);
  const p = r.profile || ({} as Review['profile']);
  const name = p.name && p.name === p.name.toUpperCase() ? p.name.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase()) : p.name;
  const profile = [name, p.current_role, p.seniority?.toLowerCase(), p.years_experience].filter(Boolean).join(', ');
  const ats = r.ats?.score != null ? clamp(r.ats.score) : null;
  const kws = r.ats?.missing_keywords || [];
  const scoreWords = score >= 85 ? 'o que é excelente.' : `${score >= 70 ? 'acima da média' : score >= 50 ? 'na média' : 'abaixo da média'}. A partir de 85 é excelente.`;

  return (
    <div className="rv">
      {profile && <p className="rv-profile">{profile}</p>}
      <div className="rv-top">
        <div>
          <h3 className="rv-verdict">{r.verdict}</h3>
          <p className="rv-summary">{r.summary}</p>
        </div>
        <div className="rv-score" style={{ '--v': score } as React.CSSProperties} aria-label={`${score} em 100`}><span>{score}</span></div>
      </div>
      <p className="rv-p">No geral, dava-lhe <strong>{score} em 100</strong>, {scoreWords}</p>

      {r.weaknesses?.length > 0 && <>
        <h4 className="rv-h">O que corrigir</h4>
        <ol className="notes">{r.weaknesses.map((w, i) => (
          <li key={i}>
            <p className="note-title">{w.title} <span className={`sev sev-${w.severity}`}>{SEVERITY[w.severity] || w.severity}</span></p>
            <p>{w.detail}</p>
            {w.fix && <p className="note-fix"><em>O que fazer:</em> {w.fix}</p>}
          </li>
        ))}</ol>
      </>}

      {r.rewrites?.length > 0 && <>
        <h4 className="rv-h">Linhas a reescrever</h4>
        <div className="rewrites">{r.rewrites.map((w, i) => (
          <div className="rw" key={i}>
            <p className="rw-text"><del>{w.original}</del> <ins>{w.improved}</ins></p>
            {w.why && <p className="rw-why">{w.why}</p>}
            <CopyButton text={w.improved} label="Copiar a nova linha" />
          </div>
        ))}</div>
      </>}

      {r.strengths?.length > 0 && <>
        <h4 className="rv-h">O que está a resultar</h4>
        <ul className="notes">{r.strengths.map((s, i) => (
          <li key={i}><p className="note-title">{s.title}</p><p>{s.detail}</p>{s.evidence && <p className="quote">“{s.evidence}”</p>}</li>
        ))}</ul>
      </>}

      {r.scores?.length > 0 && <>
        <h4 className="rv-h">Nota por área</h4>
        <dl className="rv-cats">{r.scores.map((s, i) => (
          <div key={i}>
            <dt>{s.category}</dt>
            <dd className="rv-cat-n">{clamp(s.score)}</dd>
            <dd className="rv-bar"><i style={{ width: `${clamp(s.score)}%` }} /></dd>
            {s.note && <dd className="rv-cat-note">{s.note}</dd>}
          </div>
        ))}</dl>
      </>}

      <h4 className="rv-h">Palavras-chave</h4>
      <p className="rv-p">
        {kws.length ? <>Palavras que um recrutador, ou o software dele, pode procurar e que não estão no teu CV: {kws.map((k, i) => <span key={k}><b>{k}</b>{i < kws.length - 1 ? ', ' : '.'}</span>)}</> : 'Não falta nenhuma palavra-chave evidente para este tipo de vaga.'}
        {ats != null && ` Os sistemas de triagem automática (ATS) ${ats >= 70 ? 'devem lê-lo bem' : ats >= 50 ? 'podem perder partes dele' : 'podem ter dificuldade em lê-lo'} (${ats} em 100).`}
      </p>
      {r.ats?.issues?.length > 0 && <ul className="issues">{r.ats.issues.map((x, i) => <li key={i}>{x}</li>)}</ul>}

      {r.next_steps?.length > 0 && <>
        <h4 className="rv-h">Por onde eu começava</h4>
        <ol className="steps-list">{r.next_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
      </>}

      <Corrections review={r} cvText={cvText} cvName={cvName} target={target} source={source} full={full} onFull={onFull} />
    </div>
  );
}

/* ---------------- O CV marcado e o CV corrigido ---------------- */
function Corrections({ review, cvText, cvName, target, source, full, onFull }: Omit<Props, 'error'> & { review: Review }) {
  const marked = markedCv(review, cvText);
  const visual = Boolean(source?.pdf || source?.images?.length);
  const [shots, setShots] = useState<string[] | null>(null);
  // O CV corrigido em cima do próprio ficheiro: as mesmas páginas, só com as linhas trocadas.
  const [fixedShots, setFixedShots] = useState<string[] | null>(null);
  const [premarked, setPremarked] = useState(false);
  const [atsInfo, setAtsInfo] = useState<AtsInfo>(null);
  const [step, setStep] = useState('A preparar o teu CV');
  const [drawFailed, setDrawFailed] = useState(!visual);
  const started = useRef(false);
  // O desenho do original (colunas, cores, foto), lido da primeira página: undefined enquanto se lê.
  const [look, setLook] = useState<{ layout: CvLayout | null; styleFor: typeof styleForType } | null | undefined>(visual ? undefined : null);

  // As correções desenhadas por cima do próprio ficheiro (só enquanto o ficheiro está em memória).
  useEffect(() => {
    if (!visual || started.current) return;
    started.current = true;
    (async () => {
      try {
        const { drawCorrections, styleFor } = await import('@/lib/markup.js');
        const result = await drawCorrections({ review, images: source?.images, pdf: source?.pdf, onStep: setStep });
        setLook(result.layout ? { layout: result.layout, styleFor } : null);
        setPremarked(result.premarked);
        setAtsInfo(result.ats);
        if (result.fixed > 0) setFixedShots(result.corrected.map((c) => c.toDataURL('image/jpeg', 0.96)));
        if (!result.marks) throw new Error('nenhuma citação encontrada na página');
        setShots(result.pages.map((c) => c.toDataURL('image/jpeg', 0.9)));
      } catch (err) {
        console.warn('[cv marcado]', err);
        setDrawFailed(true);
        setLook((l) => l ?? null);
      }
    })();
  }, [visual, review, source]);

  // O CV corrigido é sempre reescrito de raiz numa estrutura limpa (nunca remendado por cima da imagem,
  // onde as linhas novas podiam ficar por cima de outras ou fora do sítio). Pede-se logo, em paralelo.
  const needFull = !full;
  const tidy = useMemo(() => (full ? tidyCv(full) : null), [full]);
  // Com o ficheiro original, o CV corrigido fica no mesmo desenho; sem ele (texto ou Word), num modelo simples.
  const style = useMemo(() => (tidy && look ? look.styleFor(tidy, look.layout, cvText) : null), [tidy, look, cvText]);
  const ready = tidy && look !== undefined;
  const [fullError, setFullError] = useState('');
  const asked = useRef(0);
  const [attempt, setAttempt] = useState(1);
  useEffect(() => {
    if (!needFull || asked.current >= attempt) return;
    asked.current = attempt;
    setFullError('');
    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'full', cvText, name: cvName, target, review: { profile: review.profile, weaknesses: review.weaknesses, rewrites: review.rewrites, ats: review.ats, next_steps: review.next_steps } }),
    })
      .then(async (res) => { const data = await res.json(); if (!res.ok || !data.full) throw new Error(data.error || 'Não foi possível escrever o CV corrigido agora.'); onFull(data.full); })
      .catch((err) => setFullError(err.message));
  }, [needFull, attempt, cvText, cvName, target, review, onFull]);

  const base = baseName(cvName);
  const savePdf = async (build: (m: typeof import('@/lib/pdf-export.js')) => Blob | Promise<Blob>, name: string) => {
    const m = await import('@/lib/pdf-export.js');
    m.savePdf(await build(m), name);
  };

  return (
    <>
      <h4 className="rv-h">O teu CV, com as correções</h4>
      {premarked && <p className="rv-note">Este ficheiro já era uma versão marcada de uma revisão anterior. Tirámos as marcas antigas antes de corrigir, mas para o melhor resultado anexa o CV original.</p>}
      <p className="rv-p">O que anexaste, com esta revisão por cima: <span className="leg leg-del">a riscar</span>, <span className="leg leg-ins">a escrever no lugar</span> e <span className="leg leg-hi">a manter</span>.</p>
      {shots ? (
        <div className="cvshot">
          {shots.map((src, i) => <figure className="cvshot-page" key={i}><img src={src} alt={`Página ${i + 1} do teu CV, com as correções desenhadas por cima`} /></figure>)}
          <p className="cvmark-act">{shots.map((src, i) => <button type="button" className="text-act" key={i} onClick={() => download(src, `${base}-revisto${shots.length > 1 ? `-${i + 1}` : ''}.jpg`)}><Download size={14} />Descarregar{shots.length > 1 ? ` a página ${i + 1}` : ' esta versão'}</button>)}</p>
        </div>
      ) : visual && !drawFailed ? (
        <div className="cvshot-wait"><span className="cvshot-dot" aria-hidden="true" />{step}…</div>
      ) : marked ? (
        <MarkedSheet rows={marked.rows} corrected={marked.corrected} />
      ) : (
        <p className="rv-p">Não foi possível marcar as correções neste ficheiro.</p>
      )}

      <h4 className="rv-h">O teu CV, já corrigido</h4>
      {fixedShots ? (
        <>
          <p className="rv-p">O teu CV tal como está, com a mesma estrutura, imagens e cores: só as frases que a revisão riscou foram trocadas pelas novas. Onde vires um <span className="cvdoc-blank">[X]</span>, põe o teu número.</p>
          <div className="cvshot">
            {fixedShots.map((src, i) => <figure className="cvshot-page" key={i}><img src={src} alt={`Página ${i + 1} do teu CV, já corrigido`} /></figure>)}
          </div>
          <p className="cvmark-act">
            <button type="button" className="text-act" onClick={() => savePdf((m) => m.imagesPdf(fixedShots), `${base} - corrigido`)}><FileDown size={14} />Descarregar em PDF</button>
            {tidy && <CopyButton text={cvDocText(tidy)} label="Copiar o texto" />}
          </p>
        </>
      ) : visual && !drawFailed && !shots ? (
        <div className="cvshot-wait"><span className="cvshot-dot" aria-hidden="true" />A escrever o teu CV corrigido…</div>
      ) : ready ? (
        <>
          <p className="rv-p">{style ? 'O mesmo desenho do teu CV, com tudo aplicado e cada secção no sítio certo.' : 'Tudo aplicado e arrumado: cada secção no sítio certo, pronto a enviar.'} Onde vires um <span className="cvdoc-blank">[X]</span>, põe o teu número.</p>
          {style ? <CvStyled f={tidy} style={style} /> : <article className="cvdoc"><CvDoc f={tidy} /></article>}
          <p className="cvmark-act">
            <button type="button" className="text-act" onClick={() => savePdf((m) => (style ? m.styledPdf(tidy, style) : m.textPdf(tidy)), `${tidy.name || base} - CV`)}><FileDown size={14} />Descarregar em PDF</button>
            <CopyButton text={cvDocText(tidy)} label="Copiar o texto" />
          </p>
        </>
      ) : fullError ? (
        <>
          <p className="rv-p">{fullError}</p>
          <p className="cvmark-act"><button type="button" className="text-act" onClick={() => setAttempt((a) => a + 1)}><RotateCcw size={14} />Tentar outra vez</button></p>
        </>
      ) : (
        <div className="cvshot-wait"><span className="cvshot-dot" aria-hidden="true" />A escrever o teu CV corrigido…</div>
      )}

      <h4 className="rv-h">Como um sistema de recrutamento (ATS) lê o teu CV</h4>
      <AtsCheck text={cvText} kind={source?.pdf ? 'pdf' : source?.images?.length ? 'image' : 'other'} ats={atsInfo} />
    </>
  );
}

// A folha de papel com a caneta: o que funciona sublinhado, o que sai riscado, a linha nova ao lado.
function MarkedSheet({ rows, corrected }: { rows: NonNullable<ReturnType<typeof markedCv>>['rows']; corrected: string }) {
  const ref = useRef<HTMLElement>(null);
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setStage(3);
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      [1, 2, 3].forEach((s, i) => setTimeout(() => setStage(s), 300 + i * 800));
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const groups: (typeof rows)[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (row.kind === 'item' && last?.[0]?.kind === 'item') last.push(row); else groups.push([row]);
  }
  const line = (row: (typeof rows)[number]) => (
    <>
      <p>{row.pieces.map((p, i) => p.kind === 'del' ? <del className="m-del" key={i}>{p.text}</del> : p.kind === 'ins' ? <ins className="m-ins" key={i}>{p.text}</ins> : p.kind === 'hi' ? <span className="m-hi" key={i}>{p.text}</span> : <span key={i}>{p.text}</span>)}</p>
      {row.note && <span className={`m-note ${row.note.tone}`}>{row.note.text}</span>}
    </>
  );

  return (
    <>
      <article ref={ref} className={`paper cvmark${stage >= 1 ? ' s1' : ''}${stage >= 2 ? ' s2' : ''}${stage >= 3 ? ' s3' : ''}`} aria-label="O teu CV, marcado com esta revisão">
        {groups.map((g, gi) => g[0].kind === 'item'
          ? <ul className="paper-list" key={gi}>{g.map((row, i) => <li className="row" key={i}>{line(row)}</li>)}</ul>
          : g[0].kind === 'name' ? <p className="paper-name" key={gi}>{g[0].pieces.map((p) => p.text).join('')}</p>
          : g[0].kind === 'heading' ? <p className="paper-h" key={gi}>{g[0].pieces.map((p) => p.text).join('')}</p>
          : <div className="row" key={gi}>{line(g[0])}</div>)}
      </article>
      <p className="cvmark-act"><CopyButton text={corrected} label="Copiar o CV já corrigido" /></p>
    </>
  );
}

const Blanks = ({ s }: { s: string }) => <>{String(s).split(/(\[[^\]\n]{1,14}\])/g).map((part, i) => /^\[[^\]]+\]$/.test(part) ? <mark className="cvdoc-blank" key={i}>{part}</mark> : part)}</>;

function CvDoc({ f }: { f: FullCv }) {
  return (
    <>
      <header className="cvdoc-head">
        <h2>{f.name}</h2>
        {f.headline && <p className="cvdoc-role">{f.headline}</p>}
        {f.contact?.length > 0 && <p className="cvdoc-contact">{f.contact.join(' · ')}</p>}
      </header>
      {(f.sections || []).map((s, si) => (
        <section key={si}>
          <h3>{s.title}</h3>
          {(s.entries || []).map((e, ei) => {
            const lines = e.lines || [];
            return (
              <div className="cvdoc-entry" key={ei}>
                {(e.title || e.dates) && <div className="cvdoc-row"><b>{e.title}</b><span>{e.dates}</span></div>}
                {e.subtitle && <p className="cvdoc-sub">{e.subtitle}</p>}
                {!e.title && lines.length === 1 ? <p><Blanks s={lines[0]} /></p> : lines.length > 0 && <ul>{lines.map((l, i) => <li key={i}><Blanks s={l} /></li>)}</ul>}
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
