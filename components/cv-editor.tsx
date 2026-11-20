'use client';

// O editor do CV, no painel à direita (ao estilo do Figma): camadas à esquerda, a folha ao centro, o desenho à direita
// e uma barra de ferramentas em baixo. Quando o CV corrigido chega, o Leo edita-o à frente da pessoa: um cursor com o
// nome dele vai a cada linha reescrita, seleciona-a e escreve a versão nova. Depois, tudo se edita à mão (clicar e
// escrever), e cada linha pode ser melhorada pelo Leo. As alterações ficam guardadas na conversa.
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, Hand, ImagePlus, Loader2, Maximize2, Minimize2, Minus, MousePointer2, Palette, Plus, Redo2, Sparkles, Trash2, Undo2, Wand2, X,
} from 'lucide-react';
import type { FullCv, Review } from '@/lib/review';
import { tidyCv } from '@/lib/cv-tidy';
import type { CvSource, OriginalLook } from './review-view';
import type { CvLayoutInfo } from '@/app/api/layout/route';

export type CvDesign = {
  template: 'original' | 'moderno' | 'classico' | 'minimal'; accent: string; font: 'sans' | 'serif'; size: number; spacing: number;
  /** a fotografia: undefined = a do original; null = sem foto; texto = uma imagem posta pela pessoa */
  photo?: string | null; photoRound?: boolean; sideBg?: string | null;
  /** onde a pessoa arrastou a foto (px na folha, a partir do sítio normal) */
  photoPos?: { x: number; y: number };
};
export type CvEdit = { cv: FullCv; design: CvDesign };
const DEFAULT_DESIGN: CvDesign = { template: 'moderno', accent: '#1f8a71', font: 'sans', size: 1, spacing: 1 };
// frases que descrevem a imagem (de leituras antigas) não são linhas do CV
const DESCRIBES = /^(?:a imagem|esta imagem|na imagem|a fotografia|o documento|este documento|a sec[çc][ãa]o\s+["“'A-Z]|o cv (?:apresenta|cont[ée]m|inclui|mostra)|the image|this image)/i;
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// As secções pela ordem em que estavam no CV original (o CV corrigido pode vir reordenado).
function cleanCv(cv: FullCv, original = ''): FullCv {
  const t = tidyCv(cv);
  const text = norm(original);
  const at = (title: string) => { const i = title ? text.indexOf(norm(title)) : -1; return i < 0 ? Infinity : i; };
  const sections = t.sections
    .map((s, i) => ({ s, i, pos: at(s.title) }))
    .sort((a, b) => (a.pos === b.pos ? a.i - b.i : a.pos - b.pos))
    .map(({ s }) => ({ ...s, entries: s.entries.map((e) => ({ ...e, lines: e.lines.filter((l) => !DESCRIBES.test(l)) })) }));
  return { ...t, contact: t.contact.filter((c) => !DESCRIBES.test(c) && c.length < 90), sections };
}
// O título "Contacto" na língua do CV.
function contactWord(cv: FullCv) {
  const titles = cv.sections.map((s) => norm(s.title)).join(' ');
  if (/\b(experience|education|skills|profile|languages|summary|work)\b/.test(titles)) return 'Contact';
  if (/\b(experiencia|educacion|habilidades|idiomas)\b/.test(titles)) return 'Contacto';
  if (/\b(experience professionnelle|formation|competences|langues)\b/.test(titles)) return 'Contact';
  if (/\b(berufserfahrung|ausbildung|kenntnisse|sprachen)\b/.test(titles)) return 'Kontakt';
  return 'Contacto';
}
// uma página do CV, reduzida, para o modelo de visão ler a estrutura
async function shrinkSrc(src: string, max: number) {
  const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
// uma imagem posta pela pessoa, reduzida para caber na conversa
async function shrinkImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const s = Math.min(1, 520 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const x = c.getContext('2d')!; x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.9);
  } finally { URL.revokeObjectURL(url); }
}
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
  if (path === 'photo') return 'Fotografia';
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

export default function CvEditor({ full, original, failed, review, target, cvName, cvText = '', edited, look, layoutInfo, source, onLayout, onSave, overlay = false, onClose }: {
  full?: FullCv | null; original?: FullCv; failed?: string; review?: Review; target?: string; cvName: string; cvText?: string; edited?: CvEdit; look?: OriginalLook;
  layoutInfo?: CvLayoutInfo; source?: CvSource; onLayout?: (layout: CvLayoutInfo) => void;
  onSave: (edit: CvEdit) => void; overlay?: boolean; onClose?: () => void;
}) {
  // primeiro o CV original (chega cedo), depois o corrigido; uma edição guardada vem antes de tudo
  const [cv, setCv] = useState<Cv | null>(edited?.cv ?? (full ? cleanCv(full, cvText) : original ? cleanCv(original, cvText) : null));
  const fromOriginal = useRef(!edited && !full && Boolean(original));
  // se a revisão falhar (ou demorar demasiado), deixa de esperar: o CV original fica para editar à mão
  const [gaveUp, setGaveUp] = useState(false);
  useEffect(() => {
    if (full || !cv || !fromOriginal.current) return;
    if (failed) { fromOriginal.current = false; setGaveUp(true); return; }
    const t = setTimeout(() => { if (fromOriginal.current) { fromOriginal.current = false; setGaveUp(true); } }, 90_000);
    return () => clearTimeout(t);
  }, [failed, full, cv]);
  // em que coluna ficava cada secção no original, pelo título (a revisão dá-a pela ordem do CV corrigido)
  const sideOf = useMemo(() => {
    const map = new Map<string, 'side' | 'main'>();
    if (look && full) tidyCv(full).sections.forEach((s, i) => { if (look.sections[i]) map.set(norm(s.title), look.sections[i]); });
    return map;
  }, [look, full]);
  // a estrutura do original, lida pelo modelo de visão a partir da imagem (uma vez; fica guardada na conversa)
  const [layout, setLayout] = useState<CvLayoutInfo | undefined>(layoutInfo);
  const askedLayout = useRef(false);
  useEffect(() => {
    if (layout || askedLayout.current) return;
    const first = source?.images?.[0];
    if (!first) return;
    askedLayout.current = true;
    (async () => {
      try {
        const image = await shrinkSrc(first, 1500);
        const res = await fetch('/api/layout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }) });
        const data = (await res.json()) as { layout?: CvLayoutInfo };
        if (data.layout) { setLayout(data.layout); onLayout?.(data.layout); }
      } catch { /* fica a deteção da revisão */ }
    })();
  }, [layout, source, onLayout]);

  // o desenho do original, numa só forma: a estrutura lida pela visão e, para o que faltar, a da revisão
  const shape = useMemo(() => {
    if (!layout && !look) return null;
    const ls = layout?.sections ?? [];
    const find = (title: string) => { const n = norm(title); return ls.findIndex((x) => { const m = norm(x.title); return m === n || (m.length > 3 && (m.includes(n) || n.includes(m))); }); };
    const side: 'left' | 'right' | 'none' = layout ? layout.sidebar : look?.two ? look.side : 'none';
    return {
      side,
      ratio: Math.max(.26, Math.min(.44, layout?.sidebarWidth ?? look?.sideRatio ?? .33)),
      sideBg: layout ? (layout.sidebar !== 'none' ? layout.sidebarColor : null) : look?.sideBg ?? null,
      sideDark: layout ? layout.sidebarDark : Boolean(look?.sideDark),
      accent: layout?.accent ?? look?.accent ?? '#1f8a71',
      nameUpper: layout?.nameUpper ?? Boolean(look?.nameUpper),
      nameCol: (layout?.nameColumn ?? (look?.header === 'side' ? 'side' : 'main')) as 'side' | 'main',
      contactCol: (layout?.contactColumn ?? (look?.contact === 'side' ? 'side' : 'main')) as 'side' | 'main',
      contactTitle: layout?.contactTitle ?? '',
      photoCol: (layout ? (layout.photo === 'none' ? null : layout.photo) : look?.photo?.column ?? (look?.photo ? 'side' : null)) as 'side' | 'main' | null,
      photoRound: layout ? layout.photoShape === 'round' : look?.photo?.round ?? true,
      serif: Boolean(look?.serif),
      info: (title: string, i: number) => {
        const k = find(title);
        if (k >= 0) return { col: side === 'none' ? 'main' as const : ls[k].column, style: ls[k].style as 'bullets' | 'paragraph' | 'timeline' | 'two-columns' | 'tags', rank: k };
        const col = sideOf.get(norm(title)) ?? (SIDE.test(title) ? 'side' : 'main');
        return { col: side === 'none' ? 'main' as const : col, style: undefined, rank: 100 + i };
      },
    };
  }, [layout, look, sideOf]);

  const designFromShape = (s: NonNullable<typeof shape>): CvDesign => ({
    template: 'original', accent: s.accent, font: s.serif ? 'serif' : 'sans', size: 1, spacing: 1, photoRound: s.photoRound, sideBg: s.sideBg,
  });
  const [design, setDesignState] = useState<CvDesign>(edited?.design ?? (shape ? designFromShape(shape) : DEFAULT_DESIGN));
  const touched = useRef(Boolean(edited));
  const setDesign = (d: CvDesign) => { touched.current = true; setDesignState(d); };
  const designRef = useRef(design);
  designRef.current = design;
  // o desenho do original chega depois (é lido da imagem): o editor passa a usá-lo, se a pessoa ainda não mexeu
  useEffect(() => { if (shape && !touched.current) setDesignState(designFromShape(shape)); }, [shape]); // eslint-disable-line react-hooks/exhaustive-deps
  const [panelOpen, setPanelOpen] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const dragNow = useRef<{ x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photo = design.photo === undefined ? (shape?.photoCol ? look?.photo?.src ?? null : null) : design.photo;
  const pickPhoto = async (file?: File | null) => { if (!file) return; setDesign({ ...design, photo: await shrinkImage(file) }); };
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
  const [big, setBig] = useState(overlay);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(Boolean(edited));
  const pageRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const played = useRef(Boolean(edited));

  // o CV corrigido chega depois da revisão
  useEffect(() => {
    if (!cv && full) { setCv(cleanCv(full, cvText)); return; }
    if (!cv && original && !full) { setCv(cleanCv(original, cvText)); fromOriginal.current = true; return; }
    // o CV corrigido chegou por cima do original: o Leo aplica as correções (se a pessoa ainda não mexeu)
    if (cv && full && fromOriginal.current) {
      fromOriginal.current = false;
      if (!past.length) { played.current = false; setCv(cleanCv(full, cvText)); }
    }
  }, [full, original, cv, cvText, past.length]);

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
    if (!cv || played.current || fromOriginal.current) return;
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
    if (!cv || playing || !played.current || (fromOriginal.current && !past.length)) return;
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

  // Download: a folha desenhada a 100%, em alta resolução, cortada em páginas A4 e guardada logo como PDF
  const [downloading, setDownloading] = useState(false);
  const exportPdf = async () => {
    const page = pageRef.current;
    if (!page || downloading) return;
    setDownloading(true);
    const prev = { zoom: page.style.zoom, sel: selected };
    setSelected(null);
    page.classList.add('is-printing');
    page.style.zoom = '1';
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const { toCanvas } = await import('html-to-image');
      const scale = 2.5;
      const canvas = await toCanvas(page, { pixelRatio: scale, backgroundColor: '#ffffff', cacheBust: true, filter: (n) => !(n instanceof HTMLElement && (n.classList.contains('cve-leo') || n.classList.contains('cvp-break') || n.classList.contains('cvp-photo-bar'))) });
      // páginas A4: cortes de 1123 px (com a escala), cada um em JPEG
      const pageH = Math.round(PAGE_H * scale);
      const pages: string[] = [];
      for (let y = 0; y < canvas.height - 4; y += pageH) {
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = pageH;
        const x = c.getContext('2d')!;
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(canvas, 0, y, canvas.width, Math.min(pageH, canvas.height - y), 0, 0, canvas.width, Math.min(pageH, canvas.height - y));
        pages.push(c.toDataURL('image/jpeg', 0.95));
      }
      const m = await import('@/lib/pdf-export.js');
      m.savePdf(await m.imagesPdf(pages), `${cv?.name || cvName.replace(/\.[a-z0-9]+$/i, '') || 'CV'} - CV`);
    } catch (err) {
      console.warn('[download]', err);
      setError('Não foi possível criar o PDF agora.');
    } finally {
      page.style.zoom = prev.zoom;
      page.classList.remove('is-printing');
      setDownloading(false);
    }
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
    type Style = 'bullets' | 'paragraph' | 'timeline' | 'two-columns' | 'tags';
    const section = (s: Cv['sections'][number], si: number, side = false, style?: Style): ReactNode => {
      // sem estilo dado: na coluna lateral, etiquetas (modelos da app); um texto corrido sem títulos é um parágrafo
      const st: Style = style ?? (side ? 'tags' : s.entries.every((e) => !e.title && !e.dates && e.lines.length <= 2 && e.lines.join(' ').length > 90) ? 'paragraph' : 'bullets');
      return (
        <section className={`cvp-sec s-${st}`} key={si}>
          {E({ path: `s.${si}.t`, as: 'h3', className: 'cvp-st' })}
          <div className="cvp-entries">
            {s.entries.map((e, ei) => (
              <div className="cvp-entry" key={ei}>
                {(e.title || e.dates) ? (
                  <div className="cvp-row">
                    {E({ path: `s.${si}.e.${ei}.t`, className: 'cvp-et' })}
                    {e.dates ? E({ path: `s.${si}.e.${ei}.d`, className: 'cvp-d' }) : null}
                  </div>
                ) : null}
                {e.subtitle ? E({ path: `s.${si}.e.${ei}.st`, as: 'div', className: 'cvp-sub' }) : null}
                {e.lines.length > 0 && (st === 'tags'
                  ? <div className="cvp-tags">{e.lines.map((_, li) => E({ path: `s.${si}.e.${ei}.l.${li}`, className: 'cvp-tag', k: li }))}</div>
                  : st === 'paragraph'
                    ? e.lines.map((_, li) => E({ path: `s.${si}.e.${ei}.l.${li}`, as: 'p', className: 'cvp-p', k: li }))
                    : <ul>{e.lines.map((_, li) => E({ path: `s.${si}.e.${ei}.l.${li}`, as: 'li', k: li }))}</ul>)}
              </div>
            ))}
          </div>
        </section>
      );
    };
    // a fotografia: clicar seleciona-a (no painel: trocar, remover, forma)
    // arrasta-se para onde se quiser; um toque sem arrastar seleciona-a (com as opções por cima)
    const pos = drag ?? design.photoPos ?? { x: 0, y: 0 };
    const pic = photo ? (
      <div className="cvp-photo-wrap" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
        <div
          role="button"
          tabIndex={0}
          className={`cvp-photo${design.photoRound === false ? ' is-square' : ''}${selected === 'photo' ? ' is-sel' : ''}${drag ? ' is-dragging' : ''}`}
          aria-label="Fotografia (arrasta para mover)"
          onPointerDown={(e) => {
            if (playing || tool !== 'edit') return;
            e.preventDefault();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const base = design.photoPos ?? { x: 0, y: 0 };
            dragStart.current = { px: e.clientX, py: e.clientY, x: base.x, y: base.y, moved: false };
            setSelected('photo');
          }}
          onPointerMove={(e) => {
            const d = dragStart.current;
            if (!d) return;
            const dx = (e.clientX - d.px) / zoom, dy = (e.clientY - d.py) / zoom;
            if (!d.moved && Math.hypot(dx, dy) < 3) return;
            d.moved = true;
            const next = { x: Math.round(d.x + dx), y: Math.round(d.y + dy) };
            dragNow.current = next;
            setDrag(next);
          }}
          onPointerUp={() => {
            const d = dragStart.current;
            dragStart.current = null;
            if (d?.moved && dragNow.current) setDesign({ ...designRef.current, photoPos: dragNow.current });
            dragNow.current = null;
            setDrag(null);
          }}
        ><img src={photo} alt="" draggable={false} /></div>
        {selected === 'photo' && !drag && (
          <div className="cvp-photo-bar" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => fileRef.current?.click()}><ImagePlus size={14} />Trocar</button>
            <button type="button" onClick={() => setDesign({ ...design, photoRound: design.photoRound === false })}>{design.photoRound === false ? 'Redonda' : 'Quadrada'}</button>
            {design.photoPos && <button type="button" onClick={() => setDesign({ ...design, photoPos: undefined })}>Repor</button>}
            <button type="button" className="is-danger" onClick={() => { setDesign({ ...design, photo: null, photoPos: undefined }); setSelected(null); }} aria-label="Remover a foto"><Trash2 size={14} /></button>
          </div>
        )}
      </div>
    ) : null;
    const contact = <div className="cvp-contact">{cv.contact.map((_, i) => E({ path: `c.${i}`, k: i }))}</div>;
    const nameBlock = (withContact: boolean) => (
      <header className="cvp-head">
        {E({ path: 'name', as: 'h1', className: `cvp-name${shape?.nameUpper && design.template === 'original' ? ' is-upper' : ''}` })}
        {E({ path: 'headline', as: 'div', className: 'cvp-role' })}
        {withContact && contact}
      </header>
    );
    const head = nameBlock(true);

    // o desenho do original: a coluna do mesmo lado, na mesma cor, com as mesmas secções
    if (design.template === 'original' && shape) {
      // cada secção na coluna, ordem e estilo que tinha no original
      const order = cv.sections.map((s, i) => ({ s, i, ...shape.info(s.title, i) })).sort((a, b) => a.rank - b.rank || a.i - b.i);
      const draw = (col: 'side' | 'main') => order.filter((o) => o.col === col).map((o) => section(o.s, o.i, col === 'side', o.style));
      const contactBlock = shape.contactTitle || shape.side !== 'none'
        ? <section className="cvp-sec"><h3 className="cvp-st">{shape.contactTitle || contactWord(cv)}</h3>{contact}</section>
        : contact;
      if (shape.side === 'none') return (
        <>{pic}{nameBlock(true)}{draw('side')}{draw('main')}</>
      );
      const sideFirst = shape.side === 'left';
      const side = (
        <aside className={`cvp-side${shape.sideDark ? ' is-dark' : ''}`} style={{ background: design.sideBg || shape.sideBg || undefined }}>
          {shape.photoCol === 'side' && pic}
          {shape.nameCol === 'side' && nameBlock(false)}
          {shape.contactCol === 'side' && contactBlock}
          {draw('side')}
        </aside>
      );
      const main = (
        <main className="cvp-main">
          {shape.photoCol === 'main' && pic}
          {shape.nameCol === 'main' && nameBlock(shape.contactCol === 'main')}
          {draw('main')}
        </main>
      );
      return (
        <div className="cvp-grid" style={{ gridTemplateColumns: sideFirst ? `${Math.round(shape.ratio * PAGE_W)}px 1fr` : `1fr ${Math.round(shape.ratio * PAGE_W)}px` }}>
          {sideFirst ? <>{side}{main}</> : <>{main}{side}</>}
        </div>
      );
    }
    if (design.template === 'moderno') return (
      <div className="cvp-grid">
        <aside className="cvp-side">{pic}{head}{sideIdx.map((i) => section(cv.sections[i], i, true))}</aside>
        <main className="cvp-main">{cv.sections.map((s, i) => (sideIdx.includes(i) ? null : section(s, i)))}</main>
      </div>
    );
    return design.template === 'minimal' ? (
      <><div className="cvp-top">{head}{pic}</div>{cv.sections.map((s, i) => section(s, i))}</>
    ) : (
      <>{pic}{head}{cv.sections.map((s, i) => section(s, i))}</>
    );
    // E é recriado em cada desenho de propósito: lê o estado atual
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cv, design, photo, shape, look, overrides, selected, playing, tool, drag, zoom]);

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
          {playing ? <><i />O Leo está a editar</> : !cv ? <><Loader2 size={13} className="spin" />A ler o CV</> : fromOriginal.current ? <><Loader2 size={13} className="spin" />O Leo está a rever</> : gaveUp && !full ? 'Sem correções por agora' : saved ? 'Guardado' : 'A guardar…'}
        </span>
        <button className="cve-export" onClick={exportPdf} disabled={!cv || playing || downloading}>{downloading ? <Loader2 size={15} className="spin" /> : <Download size={15} />}<span>Download</span></button>
        {overlay && <button className="cve-close" onClick={onClose} aria-label="Fechar o editor"><X size={18} /></button>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />

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
        <aside className={`cve-right${panelOpen ? ' is-open' : ''}`}>
          <button className="cve-sheet-close" onClick={() => setPanelOpen(false)} aria-label="Fechar o painel"><X size={16} /></button>
          {selected && selected !== 'photo' && cv && (
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
          {!photo && cv && (
            <div className="cve-block">
              <button className="cve-act" onClick={() => fileRef.current?.click()}><ImagePlus size={15} />Pôr uma fotografia</button>
            </div>
          )}
          <div className="cve-block">
            <div className="cve-ph">Modelo</div>
            <div className={`cve-templates${shape ? ' has-original' : ''}`}>
              {([...(shape ? ['original'] : []), 'moderno', 'classico', 'minimal'] as CvDesign['template'][]).map((t) => (
                <button key={t} className={design.template === t ? 'is-on' : ''} onClick={() => setDesign(t === 'original' && shape ? { ...designFromShape(shape), photo: design.photo, size: design.size, spacing: design.spacing } : { ...design, template: t })}>
                  <span className={`cve-thumb th-${t}`} style={t === 'original' && shape?.sideBg ? { ['--side' as string]: shape.sideBg } : undefined}><i /><i /><i /><i /></span>
                  {t === 'original' ? 'Original' : t === 'moderno' ? 'Moderno' : t === 'classico' ? 'Clássico' : 'Minimal'}
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
        <button className={`cve-panel-btn${panelOpen ? ' is-on' : ''}`} onClick={() => setPanelOpen(!panelOpen)} title="Desenho"><Palette size={16} /></button>
        {!overlay && <button onClick={() => { setBig(!big); setFitted(false); }} title={big ? 'Sair do ecrã inteiro' : 'Ecrã inteiro'}>{big ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
      </div>
    </div>
  );
}
