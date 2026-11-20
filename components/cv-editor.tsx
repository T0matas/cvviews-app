'use client';

// O editor do CV, no painel à direita (ao estilo do Figma): camadas à esquerda, a folha ao centro, o desenho à direita
// e uma barra de ferramentas em baixo. Quando o CV corrigido chega, o Leo edita-o à frente da pessoa: um cursor com o
// nome dele vai a cada linha reescrita, seleciona-a e escreve a versão nova. Depois, tudo se edita à mão (clicar e
// escrever), e cada linha pode ser melhorada pelo Leo. As alterações ficam guardadas na conversa.
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Hand, Loader2, Maximize2, Minimize2, Minus, MousePointer2, Plus, Redo2, Sparkles, Trash2, Undo2, Wand2,
} from 'lucide-react';
import type { FullCv, Review } from '@/lib/review';

export type CvDesign = { template: 'moderno' | 'classico' | 'minimal'; accent: string; font: 'sans' | 'serif'; size: number; spacing: number };
export type CvEdit = { cv: FullCv; design: CvDesign };
const DEFAULT_DESIGN: CvDesign = { template: 'moderno', accent: '#1f8a71', font: 'sans', size: 1, spacing: 1 };
const ACCENTS = ['#1f8a71', '#2f63e2', '#7a4de0', '#d6463b', '#c77d12', '#1d1d1f'];
const PAGE_W = 794, PAGE_H = 1123; // A4 a 96 ppp

/* ---------------- caminhos: "name", "headline", "c.0", "s.1.t", "s.1.e.0.t|st|d", "s.1.e.0.l.2" ---------------- */
type Cv = FullCv;
function getAt(cv: Cv, path: string): string {
  const p = path.split('.');
  if (p[0] === 'name') return cv.name;
  if (p[0] === 'headline') return cv.headline;
  if (p[0] === 'c') return cv.contact[+p[1]] ?? '';
  const s = cv.sections[+p[1]];
  if (!s) return '';
  if (p[2] === 't') return s.title;
  const e = s.entries[+p[3]];
  if (!e) return '';
  if (p[4] === 't') return e.title;
  if (p[4] === 'st') return e.subtitle;
  if (p[4] === 'd') return e.dates;
  return e.lines[+p[5]] ?? '';
}
function setAt(cv: Cv, path: string, value: string): Cv {
  const p = path.split('.');
  if (p[0] === 'name') return { ...cv, name: value };
  if (p[0] === 'headline') return { ...cv, headline: value };
  if (p[0] === 'c') return { ...cv, contact: cv.contact.map((c, i) => (i === +p[1] ? value : c)) };
  return {
    ...cv,
    sections: cv.sections.map((s, si) => {
      if (si !== +p[1]) return s;
      if (p[2] === 't') return { ...s, title: value };
      return {
        ...s,
        entries: s.entries.map((e, ei) => {
          if (ei !== +p[3]) return e;
          if (p[4] === 't') return { ...e, title: value };
          if (p[4] === 'st') return { ...e, subtitle: value };
          if (p[4] === 'd') return { ...e, dates: value };
          return { ...e, lines: e.lines.map((l, li) => (li === +p[5] ? value : l)) };
        }),
      };
    }),
  };
}
function editLines(cv: Cv, path: string, fn: (lines: string[], at: number) => string[]): Cv {
  const p = path.split('.');
  return {
    ...cv,
    sections: cv.sections.map((s, si) => (si !== +p[1] ? s : {
      ...s,
      entries: s.entries.map((e, ei) => (ei !== +p[3] ? e : { ...e, lines: fn(e.lines, +p[5]) })),
    })),
  };
}
const isLine = (path: string | null) => Boolean(path && /^s\.\d+\.e\.\d+\.l\.\d+$/.test(path));
const KIND: Record<string, string> = { name: 'Nome', headline: 'Cargo', c: 'Contacto', t: 'Título de secção', st: 'Empresa ou escola', d: 'Datas', l: 'Linha', et: 'Título' };
const kindOf = (path: string) => {
  const p = path.split('.');
  if (p[0] === 'name' || p[0] === 'headline' || p[0] === 'c') return KIND[p[0]];
  if (p[2] === 't') return KIND.t;
  if (p[4] === 't') return KIND.et;
  return KIND[p[4]] ?? 'Texto';
};

/* ---------------- onde o Leo reescreveu: cada reescrita da revisão encontra a sua linha no CV corrigido ---------------- */
const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
function overlap(a: string, b: string) {
  const A = new Set(words(a)), B = words(b);
  if (!A.size || !B.length) return 0;
  return B.filter((w) => A.has(w)).length / Math.max(A.size, B.length);
}
function plan(cv: Cv, review?: Review) {
  const used = new Set<string>();
  const out: { path: string; from: string; to: string }[] = [];
  for (const r of review?.rewrites ?? []) {
    if (!r.original || !r.improved) continue;
    let best = { path: '', score: 0 };
    cv.sections.forEach((s, si) => s.entries.forEach((e, ei) => e.lines.forEach((l, li) => {
      const path = `s.${si}.e.${ei}.l.${li}`;
      if (used.has(path)) return;
      const score = Math.max(overlap(l, r.improved), overlap(l, r.original) * .8);
      if (score > best.score) best = { path, score };
    })));
    if (best.score >= .3) { used.add(best.path); out.push({ path: best.path, from: r.original, to: getAt(cv, best.path) }); }
  }
  // de cima para baixo, como alguém que lê o CV
  return out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
}
const SIDE = /compet|skill|l[ií]ngua|idioma|lang|ferrament|tool|interes|certif|conhec|software|soft/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function CvEditor({ full, review, target, cvName, edited, onSave }: {
  full?: FullCv | null; review?: Review; target?: string; cvName: string; edited?: CvEdit; onSave: (edit: CvEdit) => void;
}) {
  const [cv, setCv] = useState<Cv | null>(edited?.cv ?? full ?? null);
  const [design, setDesign] = useState<CvDesign>(edited?.design ?? DEFAULT_DESIGN);
  const [past, setPast] = useState<Cv[]>([]);
  const [future, setFuture] = useState<Cv[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [leo, setLeo] = useState<{ x: number; y: number; label: string } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [zoom, setZoom] = useState(.7);
  const [fitted, setFitted] = useState(false);
  const [tool, setTool] = useState<'edit' | 'hand'>('edit');
  const [big, setBig] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(Boolean(edited));
  const pageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const played = useRef(Boolean(edited));

  // o CV corrigido chega depois da revisão
  useEffect(() => { if (!cv && full) setCv(full); }, [full, cv]);

  // ajusta a folha à largura da tela
  const fit = useCallback(() => {
    const w = viewRef.current?.clientWidth ?? 0;
    if (w > 0) setZoom(Math.max(.3, Math.min(1.2, (w - 64) / PAGE_W)));
  }, []);
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { if (!fitted) fit(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, fitted, big]);

  // posição de um elemento dentro da folha (sem zoom)
  const spot = (path: string) => {
    const page = pageRef.current;
    let el = page?.querySelector<HTMLElement>(`[data-path="${path}"]`) ?? null;
    if (!page || !el) return null;
    const w = el.offsetWidth;
    let x = 0, y = 0;
    while (el && el !== page) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent as HTMLElement | null; }
    return { x: x + Math.min(w, 260), y: y + 6 };
  };
  const show = (path: string) => pageRef.current?.querySelector(`[data-path="${path}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });

  // o Leo escreve uma linha: vai até ela, seleciona e escreve
  const typeLine = useCallback(async (path: string, to: string, label = 'Leo') => {
    const at = spot(path);
    if (at) setLeo({ ...at, label });
    show(path);
    await sleep(650);
    setSelected(path);
    await sleep(320);
    const step = Math.max(1, Math.round(to.length / 70));
    for (let i = 0; i <= to.length; i += step) {
      setOverrides((o) => ({ ...o, [path]: to.slice(0, i) }));
      const now = spot(path);
      if (now) setLeo({ x: now.x, y: now.y, label });
      await sleep(18);
    }
    setOverrides((o) => { const n = { ...o }; delete n[path]; return n; });
  }, []);

  // a primeira vez: o Leo edita o CV à frente da pessoa
  useEffect(() => {
    if (!cv || played.current) return;
    played.current = true;
    const steps = plan(cv, review);
    if (!steps.length) return;
    setPlaying(true);
    setOverrides(Object.fromEntries(steps.map((s) => [s.path, s.from])));
    (async () => {
      await sleep(500);
      for (const s of steps) await typeLine(s.path, s.to, 'Leo');
      setLeo(null);
      setSelected(null);
      setPlaying(false);
    })();
  }, [cv, review, typeLine]);

  // guardar na conversa (com uma pequena pausa)
  useEffect(() => {
    if (!cv || playing || !played.current) return;
    const t = setTimeout(() => { onSave({ cv, design }); setSaved(true); }, 700);
    setSaved(false);
    return () => clearTimeout(t);
  }, [cv, design, playing, onSave]);

  const commit = (next: Cv) => {
    if (!cv) return;
    setPast((p) => [...p.slice(-50), cv]);
    setFuture([]);
    setCv(next);
  };
  const undo = () => { if (!past.length || !cv) return; setFuture((f) => [cv, ...f]); setCv(past[past.length - 1]); setPast((p) => p.slice(0, -1)); };
  const redo = () => { if (!future.length || !cv) return; setPast((p) => [...p, cv]); setCv(future[0]); setFuture((f) => f.slice(1)); };

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      if (e.key === 'Escape' && big) setBig(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // pedir ao Leo para melhorar a linha selecionada
  const improve = async () => {
    if (!cv || !selected || busyLine) return;
    const line = getAt(cv, selected);
    const p = selected.split('.');
    const context = cv.sections[+p[1]] ? `${cv.sections[+p[1]].title} · ${cv.sections[+p[1]].entries[+p[3]]?.title ?? ''}` : '';
    setBusyLine(selected);
    setError('');
    try {
      const res = await fetch('/api/rewrite-line', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line, context, target }) });
      const data = (await res.json()) as { line?: string; error?: string };
      if (!res.ok || !data.line) throw new Error(data.error || 'O Leo não conseguiu reescrever agora.');
      const path = selected;
      setOverrides((o) => ({ ...o, [path]: line }));
      setPlaying(true);
      await typeLine(path, data.line, 'Leo');
      setPlaying(false);
      setLeo(null);
      commit(setAt(cv, path, data.line));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'O Leo não conseguiu reescrever agora.');
    } finally {
      setBusyLine(null);
    }
  };

  const exportPdf = () => {
    const page = pageRef.current;
    if (!page) return;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('');
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${(cv?.name || cvName || 'CV').replace(/[<>]/g, '')} - CV</title>${styles}<style>@page{size:A4;margin:0}html,body{margin:0;background:#fff}.cvp{box-shadow:none!important;zoom:1!important;min-height:auto}.cve-leo,.cvp-break{display:none!important}[contenteditable]{outline:none!important}</style></head><body>${page.outerHTML}</body></html>`);
    doc.close();
    setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); setTimeout(() => frame.remove(), 2000); }, 400);
  };

  // um texto editável da folha
  const E = ({ path, as: Tag = 'span', className = '', k }: { path: string; as?: 'span' | 'div' | 'h1' | 'h2' | 'h3' | 'li' | 'p'; className?: string; k?: number }) => {
    const value = overrides[path] ?? (cv ? getAt(cv, path) : '');
    const typing = path in overrides && playing;
    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        (e.currentTarget as HTMLElement).blur();
        if (isLine(path) && cv) {
          const next = editLines(setAt(cv, path, (e.currentTarget as HTMLElement).innerText.trim()), path, (lines, at) => [...lines.slice(0, at + 1), '', ...lines.slice(at + 1)]);
          commit(next);
          const p = path.split('.');
          const newPath = `s.${p[1]}.e.${p[3]}.l.${+p[5] + 1}`;
          setTimeout(() => { const el = pageRef.current?.querySelector<HTMLElement>(`[data-path="${newPath}"]`); el?.focus(); }, 30);
        }
      }
    };
    return (
      <Tag
        key={k ?? path}
        data-path={path}
        className={`cvp-e ${className}${selected === path ? ' is-sel' : ''}${typing ? ' is-typing' : ''}${!value ? ' is-empty' : ''}`}
        contentEditable={!playing && tool === 'edit'}
        suppressContentEditableWarning
        spellCheck={false}
        onFocus={() => setSelected(path)}
        onBlur={(e) => {
          const text = e.currentTarget.innerText.replace(/\s+/g, ' ').trim();
          if (cv && text !== getAt(cv, path)) commit(setAt(cv, path, text));
        }}
        onKeyDown={onKeyDown}
      >{value}</Tag>
    );
  };

  /* ---------------- a folha ---------------- */
  const page = useMemo(() => {
    if (!cv) return null;
    const sideIdx = design.template === 'moderno' ? cv.sections.map((s, i) => (SIDE.test(s.title) ? i : -1)).filter((i) => i >= 0) : [];
    const section = (s: Cv['sections'][number], si: number, side = false): ReactNode => (
      <section className="cvp-sec" key={si}>
        {E({ path: `s.${si}.t`, as: 'h3', className: 'cvp-st' })}
        {s.entries.map((e, ei) => (
          <div className="cvp-entry" key={ei}>
            {(e.title || e.dates || !side) && (e.title || e.subtitle || e.dates) ? (
              <div className="cvp-row">
                {E({ path: `s.${si}.e.${ei}.t`, className: 'cvp-et' })}
                {e.dates ? E({ path: `s.${si}.e.${ei}.d`, className: 'cvp-d' }) : null}
              </div>
            ) : null}
            {e.subtitle ? E({ path: `s.${si}.e.${ei}.st`, as: 'div', className: 'cvp-sub' }) : null}
            {e.lines.length > 0 && (side
              ? <div className="cvp-tags">{e.lines.map((_, li) => E({ path: `s.${si}.e.${ei}.l.${li}`, className: 'cvp-tag', k: li }))}</div>
              : <ul>{e.lines.map((_, li) => E({ path: `s.${si}.e.${ei}.l.${li}`, as: 'li', k: li }))}</ul>)}
          </div>
        ))}
      </section>
    );
    const head = (
      <header className="cvp-head">
        {E({ path: 'name', as: 'h1', className: 'cvp-name' })}
        {E({ path: 'headline', as: 'div', className: 'cvp-role' })}
        <div className="cvp-contact">{cv.contact.map((_, i) => E({ path: `c.${i}`, k: i }))}</div>
      </header>
    );
    return design.template === 'moderno' ? (
      <div className="cvp-grid">
        <aside className="cvp-side">{head}{sideIdx.map((i) => section(cv.sections[i], i, true))}</aside>
        <main className="cvp-main">{cv.sections.map((s, i) => (sideIdx.includes(i) ? null : section(s, i)))}</main>
      </div>
    ) : (
      <>{head}{cv.sections.map((s, i) => section(s, i))}</>
    );
    // E é recriado em cada desenho de propósito: lê o estado atual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv, design.template, overrides, selected, playing, tool]);

  const layers = cv ? [
    { path: 'name', label: cv.name || 'Nome', depth: 0, kind: 'T' },
    { path: 'headline', label: cv.headline || 'Cargo', depth: 0, kind: 'T' },
    ...cv.sections.flatMap((s, si) => [
      { path: `s.${si}.t`, label: s.title || 'Secção', depth: 0, kind: '#' },
      ...s.entries.map((e, ei) => ({ path: e.title ? `s.${si}.e.${ei}.t` : `s.${si}.e.${ei}.l.0`, label: e.title || e.lines[0] || '…', depth: 1, kind: 'T' })),
    ]),
  ] : [];

  const zoomBy = (d: number) => { setFitted(true); setZoom((z) => Math.max(.3, Math.min(2, +(z + d).toFixed(2)))); };
  const pan = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  return (
    <div className={`cve${big ? ' is-big' : ''}`}>
      {/* barra de cima */}
      <div className="cve-top">
        <div className="cve-file"><strong>{cv?.name ? `CV de ${cv.name}` : 'O teu CV'}</strong><span>{cvName}</span></div>
        <span className={`cve-status${playing ? ' is-live' : ''}`}>
          {playing ? <><i />O Leo está a editar</> : !cv ? <><Loader2 size={13} className="spin" />A corrigir o CV</> : saved ? 'Guardado' : 'A guardar…'}
        </span>
        <button className="cve-export" onClick={exportPdf} disabled={!cv || playing}><Download size={15} />Exportar PDF</button>
      </div>

      <div className="cve-body">
        {/* camadas */}
        <aside className="cve-left">
          <div className="cve-ph">Camadas</div>
          <div className="cve-layers">
            {layers.map((l) => (
              <button key={l.path} className={`cve-layer d${l.depth}${selected === l.path ? ' is-on' : ''}`} onClick={() => { setSelected(l.path); show(l.path); }}>
                <i>{l.kind}</i><span>{l.label}</span>
              </button>
            ))}
            {!cv && <div className="cve-skel"><i /><i /><i /><i /></div>}
          </div>
        </aside>

        {/* tela */}
        <div
          className={`cve-view tool-${tool}`}
          ref={viewRef}
          onWheel={(e) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? .08 : -.08); } }}
          onMouseDown={(e) => { if (tool === 'hand' && viewRef.current) pan.current = { x: e.clientX, y: e.clientY, sl: viewRef.current.scrollLeft, st: viewRef.current.scrollTop }; else if (e.target === e.currentTarget) setSelected(null); }}
          onMouseMove={(e) => { const p = pan.current; if (p && viewRef.current) { viewRef.current.scrollLeft = p.sl - (e.clientX - p.x); viewRef.current.scrollTop = p.st - (e.clientY - p.y); } }}
          onMouseUp={() => { pan.current = null; }}
          onMouseLeave={() => { pan.current = null; }}
        >
          <div className="cve-stagepad">
            <div
              ref={pageRef}
              className={`cvp t-${design.template} f-${design.font}`}
              style={{ zoom, ['--acc' as string]: design.accent, ['--fs' as string]: design.size, ['--sp' as string]: design.spacing, width: PAGE_W, minHeight: PAGE_H }}
            >
              {cv ? page : (
                <div className="cvp-wait"><i style={{ width: '46%', height: 30 }} /><i style={{ width: '30%' }} /><i /><i /><i style={{ width: '80%' }} /><i /><i style={{ width: '60%' }} /></div>
              )}
              {/* quebras de página */}
              {[1, 2].map((n) => <div key={n} className="cvp-break" style={{ top: PAGE_H * n }} />)}
              {(leo || !cv) && (
                <div className="cve-leo" style={leo ? { transform: `translate(${leo.x}px, ${leo.y}px)` } : { transform: 'translate(420px, 180px)' }}>
                  <svg viewBox="0 0 24 24"><path d="M4 2l15 9.5-6.6 1.5 3.9 7.4-3 1.6-3.9-7.5L4 19z" /></svg>
                  <span>{leo?.label ?? 'Leo'}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* desenho */}
        <aside className="cve-right">
          {selected && cv && (
            <div className="cve-block">
              <div className="cve-ph">{kindOf(selected)}</div>
              <button className="cve-act is-leo" onClick={improve} disabled={Boolean(busyLine) || playing}>
                {busyLine ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}Melhorar com o Leo
              </button>
              {isLine(selected) && <>
                <button className="cve-act" onClick={() => commit(editLines(cv, selected, (lines, at) => [...lines.slice(0, at + 1), 'Nova linha', ...lines.slice(at + 1)]))}><Plus size={15} />Linha por baixo</button>
                <button className="cve-act" onClick={() => { commit(editLines(cv, selected, (lines, at) => lines.filter((_, i) => i !== at))); setSelected(null); }}><Trash2 size={15} />Apagar linha</button>
              </>}
              {error && <p className="cve-err">{error}</p>}
            </div>
          )}
          <div className="cve-block">
            <div className="cve-ph">Modelo</div>
            <div className="cve-templates">
              {(['moderno', 'classico', 'minimal'] as const).map((t) => (
                <button key={t} className={design.template === t ? 'is-on' : ''} onClick={() => setDesign({ ...design, template: t })}>
                  <span className={`cve-thumb th-${t}`}><i /><i /><i /><i /></span>{t === 'moderno' ? 'Moderno' : t === 'classico' ? 'Clássico' : 'Minimal'}
                </button>
              ))}
            </div>
          </div>
          <div className="cve-block">
            <div className="cve-ph">Cor</div>
            <div className="cve-swatches">{ACCENTS.map((c) => <button key={c} style={{ background: c }} className={design.accent === c ? 'is-on' : ''} onClick={() => setDesign({ ...design, accent: c })} aria-label={`Cor ${c}`} />)}</div>
          </div>
          <div className="cve-block">
            <div className="cve-ph">Letra</div>
            <div className="cve-seg">
              <button className={design.font === 'sans' ? 'is-on' : ''} onClick={() => setDesign({ ...design, font: 'sans' })}>Sans</button>
              <button className={design.font === 'serif' ? 'is-on' : ''} onClick={() => setDesign({ ...design, font: 'serif' })} style={{ fontFamily: 'var(--serif)' }}>Serifa</button>
            </div>
            <label className="cve-range"><span>Tamanho</span><input type="range" min={.85} max={1.15} step={.01} value={design.size} onChange={(e) => setDesign({ ...design, size: +e.target.value })} /></label>
            <label className="cve-range"><span>Espaço</span><input type="range" min={.7} max={1.4} step={.02} value={design.spacing} onChange={(e) => setDesign({ ...design, spacing: +e.target.value })} /></label>
          </div>
          <p className="cve-hint"><Sparkles size={13} />Clica num texto para o editar. Enter cria uma linha nova.</p>
        </aside>
      </div>

      {/* barra de ferramentas */}
      <div className="cve-tools">
        <button className={tool === 'edit' ? 'is-on' : ''} onClick={() => setTool('edit')} title="Editar texto"><MousePointer2 size={17} /></button>
        <button className={tool === 'hand' ? 'is-on' : ''} onClick={() => setTool('hand')} title="Mover a tela"><Hand size={17} /></button>
        <i />
        <button onClick={undo} disabled={!past.length} title="Desfazer"><Undo2 size={17} /></button>
        <button onClick={redo} disabled={!future.length} title="Refazer"><Redo2 size={17} /></button>
        <i />
        <button onClick={() => zoomBy(-.1)} title="Afastar"><Minus size={16} /></button>
        <button className="cve-zoom" onClick={() => { setFitted(false); fit(); }} title="Ajustar à tela">{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomBy(.1)} title="Aproximar"><Plus size={16} /></button>
        <i />
        <button onClick={() => { setBig(!big); setFitted(false); }} title={big ? 'Sair do ecrã inteiro' : 'Ecrã inteiro'}>{big ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
      </div>
    </div>
  );
}
