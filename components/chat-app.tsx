'use client';

import { type ChangeEvent, type DragEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  ArrowDown, ArrowUp, ArrowUpRight, BriefcaseBusiness, Check, ChevronDown, ChevronRight, Copy, FileText, Globe, Image as ImageIcon, ListChecks, Loader2, LogIn, LogOut, MessageSquareText,
  Mic, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Paperclip, Pencil, Pin, PinOff, Plus, RotateCcw, Search, Settings as Gear, Settings2,
  Square, SquarePen, Trash2, UserRound, UsersRound, X,
} from 'lucide-react';
import AuthDialog from './auth-dialog';
import Onboarding from './onboarding';
import LeoWriting from './leo-writing';
import Logo from './logo';
import SmoothProse from './smooth-prose';
import SettingsDialog, { DEFAULT_SETTINGS, type Settings } from './settings-dialog';
import { auth } from '@/lib/firebase';
import ReviewView, { type CvSource } from './review-view';
import { readImage, readPdf, readWord, toBase64 } from '@/lib/read-file';
import { type FullCv, type Review, reviewSummary } from '@/lib/review';
import { useRecorder } from '@/lib/use-recorder';
import { SEARCH_SIGNAL, type Attachment, type ChatRequest, type Conversation, type Message, type Mode } from '@/lib/types';

// As conversas de quem não entrou ficam na chave antiga; as de cada conta, numa chave com o uid.
const storageKey = (uid?: string) => (uid ? `cvviews-conversations:${uid}` : 'cvviews-conversations');
const SETTINGS_KEY = 'cvviews-settings';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const KIND_LABEL = { pdf: 'PDF', text: 'Texto', image: 'Fotografia', word: 'Word' } as const;

const MODES: Record<Mode, { label: string; hint: string; icon: typeof BriefcaseBusiness }> = {
  recrutador: { label: 'Recrutador', hint: 'Analisar currículos e preparar seleções', icon: BriefcaseBusiness },
  candidato: { label: 'Candidato', hint: 'Melhorar o meu CV e preparar entrevistas', icon: UsersRound },
};

const SUGGESTIONS: Record<Mode, { icon: typeof FileText; title: string; hint: string; prompt: string }[]> = {
  recrutador: [
    { icon: ListChecks, title: 'Grelha de avaliação', hint: 'Requisitos essenciais e desejáveis', prompt: 'Cria uma grelha de avaliação para uma vaga de Product Designer, separando requisitos essenciais e desejáveis.' },
    { icon: FileText, title: 'Resumir um CV', hint: 'Experiência e o que confirmar', prompt: 'Vou anexar um currículo. Resume a experiência, as competências e os pontos a confirmar na entrevista.' },
    { icon: MessageSquareText, title: 'Perguntas de entrevista', hint: 'Avaliar a liderança de equipa', prompt: 'Que perguntas comportamentais devo fazer para avaliar liderança de equipa?' },
    { icon: UsersRound, title: 'Comparar candidatos', hint: 'Critérios iguais para todos', prompt: 'Como posso comparar candidaturas de forma consistente e justa?' },
  ],
  candidato: [
    { icon: Pencil, title: 'Melhorar o meu CV', hint: 'Melhorias concretas ao currículo', prompt: 'Vou anexar o meu currículo. Que melhorias concretas sugeres?' },
    { icon: BriefcaseBusiness, title: 'Adaptar a uma vaga', hint: 'Ajustar o CV a um anúncio', prompt: 'Como adapto o meu currículo a um anúncio de emprego específico?' },
    { icon: MessageSquareText, title: 'Preparar entrevista', hint: 'Respostas às perguntas difíceis', prompt: 'Ajuda-me a preparar respostas para uma entrevista de Analista de Dados.' },
    { icon: FileText, title: 'Carta de apresentação', hint: 'Curta, clara e convincente', prompt: 'Escreve uma estrutura de carta de apresentação curta e convincente.' },
  ],
};

type Pending = Attachment & { id: string; reading?: boolean; source?: CvSource };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function loadConversations(key: string): Conversation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function groupLabel(time: number) {
  const day = 86_400_000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  if (time >= startOfToday) return 'Hoje';
  if (time >= startOfToday - day) return 'Ontem';
  if (time >= startOfToday - 7 * day) return 'Últimos 7 dias';
  if (time >= startOfToday - 30 * day) return 'Últimos 30 dias';
  return 'Mais antigas';
}

function formatSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Três traços, o último mais curto: abre a gaveta no telemóvel.
function MenuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6.5h16M4 12h16M4 17.5h10" />
    </svg>
  );
}

export default function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newChatMode, setNewChatMode] = useState<Mode>('recrutador');
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // No PC, a app abre sempre com a barra lateral aberta; fechada, fica só a faixa de ícones.
  const [panelOpen, setPanelOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [dialog, setDialogState] = useState<'auth' | 'settings' | null>(null);
  // No telemóvel, abrir um diálogo fecha a gaveta que estava por trás.
  const setDialog = (next: 'auth' | 'settings' | null) => { if (next) setDrawerOpen(false); setDialogState(next); };
  const [searchingId, setSearchingId] = useState<string | null>(null);
  const [liveAI, setLiveAI] = useState<boolean | null>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  // No PC, o ecrã inicial tem a caixa de mensagem logo abaixo da saudação; no telemóvel, fica em baixo.
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 821px)');
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const [profileMenu, setProfileMenu] = useState<'rail' | 'panel' | null>(null);
  const [itemMenu, setItemMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const [hydrated, setHydrated] = useState(false);
  // No telemóvel, quem não tem sessão vê primeiro o ecrã de entrada (até entrar ou saltar).
  const [skipped, setSkipped] = useState<boolean | null>(null);
  useEffect(() => { try { setSkipped(localStorage.getItem('cvviews-skip-login') === '1'); } catch { setSkipped(true); } }, []);
  const skipLogin = () => { setSkipped(true); try { localStorage.setItem('cvviews-skip-login', '1'); } catch { /* armazenamento indisponível */ } };

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Conteúdo dos anexos fica só em memória (pode ser grande demais para o localStorage).
  const attachmentData = useRef(new Map<string, Attachment[]>());
  // O ficheiro original de cada revisão (PDF ou fotografias), para desenhar as correções por cima.
  const cvSources = useRef(new Map<string, CvSource>());

  const active = conversations.find((c) => c.id === activeId) ?? null;
  const mode = active?.mode ?? newChatMode;
  const messages = active?.messages ?? [];
  const isStreaming = streamingId !== null;

  useEffect(() => {
    try {
      const stored = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') } as Settings;
      setSettings(stored);
      setNewChatMode(stored.defaultMode);
    } catch { /* armazenamento indisponível */ }
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
    return onAuthStateChanged(auth(), (next) => { setUser(next); setAuthReady(true); });
  }, []);

  // Ao entrar ou sair, mostra as conversas dessa conta.
  useEffect(() => {
    if (!authReady) return;
    abortRef.current?.abort();
    setHydrated(false);
    setActiveId(null);
    setConversations(loadConversations(storageKey(user?.uid)));
    setHydrated(true);
  }, [authReady, user?.uid]);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(storageKey(user?.uid), JSON.stringify(conversations)); } catch { /* cheio ou bloqueado */ }
  }, [conversations, hydrated, user?.uid]);

  function updateSettings(next: Settings) {
    setSettings(next);
    if (next.defaultMode !== settings.defaultMode && !activeId) setNewChatMode(next.defaultMode);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
  }

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  useEffect(() => { if (atBottom) scrollToBottom(); }, [messages, atBottom, scrollToBottom]);
  useEffect(() => { setAtBottom(true); scrollToBottom(); }, [activeId, scrollToBottom]);

  // A caixa cresce com o texto. Mede-se só quando tem largura a sério (medida estreita, o texto de exemplo partia
  // letra a letra e a caixa ficava enorme e vazia) e volta a medir-se quando a largura muda.
  const hasMessages = messages.length > 0;
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const fit = () => {
      if (el.clientWidth < 80) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
    };
    fit();
    let width = el.clientWidth;
    const watch = new ResizeObserver(() => { if (Math.abs(el.clientWidth - width) > 1) { width = el.clientWidth; fit(); } });
    watch.observe(el);
    return () => watch.disconnect();
  }, [draft, hasMessages, pending.length, wide]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setDrawerOpen(false); setModeMenuOpen(false); setPlusOpen(false); setProfileMenu(null); setItemMenu(null); setDialog(null); }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'o') { event.preventDefault(); newChat(); }
    };
    const onClick = () => { setModeMenuOpen(false); setPlusOpen(false); setProfileMenu(null); setItemMenu(null); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('click', onClick); };
  });

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);

  const updateConversation = (id: string, update: (c: Conversation) => Conversation) =>
    setConversations((list) => list.map((c) => (c.id === id ? update(c) : c)));

  function closeSidebar() {
    setDrawerOpen(false);
    setPanelOpen(false);
  }

  function focusSearch() {
    setPanelOpen(true);
    setTimeout(() => document.querySelector<HTMLInputElement>('.search input')?.focus(), 60);
  }

  function newChat() {
    abortRef.current?.abort();
    setActiveId(null);
    setDraft('');
    setPending([]);
    setDrawerOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function openConversation(id: string) {
    if (id === activeId) return setDrawerOpen(false);
    abortRef.current?.abort();
    setActiveId(id);
    setDrawerOpen(false);
  }

  function deleteConversation(id: string) {
    if (id === activeId) { abortRef.current?.abort(); setActiveId(null); }
    setConversations((list) => list.filter((c) => c.id !== id));
  }

  // Lê cada ficheiro logo ao anexar: o texto dos PDFs no navegador; fotografias e PDFs feitos de imagens
  // são transcritos uma única vez em /api/read. O chip mostra "A ler…" até estar pronto.
  async function addFiles(files: FileList | File[]) {
    inputRef.current?.focus();
    await Promise.all(Array.from(files).map(async (file) => {
      const lower = file.name.toLowerCase();
      const isPdf = file.type === 'application/pdf' || lower.endsWith('.pdf');
      const isImage = /^image\/(jpeg|png|webp)$/.test(file.type) || /\.(jpe?g|png|webp)$/.test(lower);
      const isWord = lower.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const isText = file.type.startsWith('text/') || /\.(txt|md|csv|rtf)$/.test(lower);
      if (!isPdf && !isImage && !isWord && !isText) return setNotice(`${file.name}: usa PDF, Word, texto ou uma fotografia.`);
      if (file.size > MAX_FILE_BYTES) return setNotice(`${file.name} excede 20 MB.`);

      const id = uid();
      const kind = isPdf ? 'pdf' : isImage ? 'image' : isWord ? 'word' : 'text';
      setPending((list) => [...list, { id, name: file.name, kind, data: '', size: file.size, reading: true }]);
      const ready = (data: string, source?: CvSource) => setPending((list) => list.map((f) => (f.id === id ? { ...f, data, source, reading: false } : f)));
      const drop = (message: string) => { setPending((list) => list.filter((f) => f.id !== id)); setNotice(message); };
      try {
        if (isText) return ready(await file.text());
        if (isWord) return ready(await readWord(file));
        const images = isImage ? [await readImage(file)] : null;
        const pdf = isPdf ? await readPdf(file) : null;
        if (pdf && 'text' in pdf) return ready(pdf.text, { pdf: await toBase64(file) });
        const pages = images ?? (pdf && 'images' in pdf ? pdf.images : []);
        const response = await fetch('/api/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images: pages }) });
        const result = (await response.json()) as { text?: string; error?: string };
        if (!response.ok || !result.text) return drop(result.error || `Não foi possível ler ${file.name}.`);
        // Fotografias e PDFs feitos de imagens: as correções desenham-se sobre as páginas.
        ready(result.text, { images: pages });
      } catch {
        drop(`Não foi possível ler ${file.name}.`);
      }
    }));
  }

  // Um CV anexado recebe a revisão do site: nota, anotações sobre o próprio ficheiro e o CV corrigido.
  async function reviewCv(conversationId: string, history: Message[], files: Pending[], target: string) {
    const assistantId = uid();
    const cv = files.find((f) => f.source) ?? files[0];
    const cvText = files.map((f) => f.data).join('\n\n').trim();
    if (cv.source) cvSources.current.set(assistantId, cv.source);
    const base = { cvText, cvName: cv.name, target };
    const set = (patch: Partial<Message>) => updateConversation(conversationId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)) }));
    updateConversation(conversationId, (c) => ({ ...c, messages: [...history, { id: assistantId, role: 'assistant', text: '', cvReview: base }], updatedAt: Date.now() }));
    setStreamingId(assistantId);
    setAtBottom(true);
    try {
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cvText, name: cv.name, target }) });
      setLiveAI(response.status !== 503);
      const data = (await response.json()) as { review?: Review; error?: string };
      if (!response.ok || !data.review) throw new Error(data.error || 'Não foi possível rever o CV agora.');
      set({ text: reviewSummary(data.review), cvReview: { ...base, review: data.review } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível rever o CV agora.';
      set({ text: message, error: true, cvReview: { ...base, error: message } });
    } finally {
      setStreamingId(null);
    }
  }

  const saveFull = (conversationId: string, messageId: string) => (full: FullCv) =>
    updateConversation(conversationId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === messageId && m.cvReview ? { ...m, cvReview: { ...m.cvReview, full } } : m)) }));

  async function streamReply(conversationId: string, history: Message[], conversationMode: Mode) {
    const assistantId = uid();
    updateConversation(conversationId, (c) => ({ ...c, messages: [...history, { id: assistantId, role: 'assistant', text: '' }], updatedAt: Date.now() }));
    setStreamingId(assistantId);
    setAtBottom(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const payload: ChatRequest = {
      mode: conversationMode,
      web: settings.web,
      messages: history.map((m) => ({ role: m.role, text: m.text, attachments: attachmentData.current.get(m.id) })),
    };

    let text = '';
    const write = (error = false) =>
      updateConversation(conversationId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === assistantId ? { ...m, text, error } : m)) }));

    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      setLiveAI(response.headers.get('X-CVViews-Mode') === 'live');
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let frame = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if (text.includes(SEARCH_SIGNAL)) { text = text.replaceAll(SEARCH_SIGNAL, ''); setSearchingId(assistantId); }
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; write(); });
      }
      cancelAnimationFrame(frame);
      write();
    } catch {
      if (controller.signal.aborted) { write(); }
      else { text = text || 'Não foi possível obter uma resposta. Verifica a ligação e tenta de novo.'; write(true); }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreamingId(null);
      setSearchingId(null);
    }
  }

  function send(textOverride?: string) {
    const text = (textOverride ?? draft).trim();
    if ((!text && !pending.length) || isStreaming) return;
    if (pending.some((f) => f.reading)) return setNotice('Espera um instante, ainda estou a ler o ficheiro.');

    const userMessage: Message = {
      id: uid(),
      role: 'user',
      text,
      attachments: pending.length ? pending.map(({ name, kind, size }) => ({ name, kind, size })) : undefined,
    };
    if (pending.length) attachmentData.current.set(userMessage.id, pending.map(({ name, kind, data, size }) => ({ name, kind, data, size })));

    let conversationId = activeId;
    let history: Message[];
    if (!active) {
      conversationId = uid();
      const title = (text || pending[0]?.name || 'Nova conversa').replace(/\s+/g, ' ').slice(0, 48);
      history = [userMessage];
      setConversations((list) => [{ id: conversationId!, title, mode, messages: history, updatedAt: Date.now() }, ...list]);
      setActiveId(conversationId);
    } else {
      history = [...active.messages, userMessage];
    }

    const files = pending;
    setDraft('');
    setPending([]);
    // Um CV anexado (seja que ficheiro for) é revisto como no site; o texto escrito com ele conta como a vaga.
    if (files.some((f) => f.data.trim().length >= 40)) void reviewCv(conversationId!, history, files, text);
    else void streamReply(conversationId!, history, mode);
  }

  function regenerate() {
    if (!active || isStreaming) return;
    const lastUser = active.messages.findLastIndex((m) => m.role === 'user');
    if (lastUser >= 0) void streamReply(active.id, active.messages.slice(0, lastUser + 1), active.mode);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  async function copy(message: Message) {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopiedId(message.id);
      setTimeout(() => setCopiedId((id) => (id === message.id ? null : id)), 1600);
    } catch {
      setNotice('Não foi possível copiar.');
    }
  }

  function changeMode(next: Mode) {
    setModeMenuOpen(false);
    if (active && active.messages.length) updateConversation(active.id, (c) => ({ ...c, mode: next }));
    else setNewChatMode(next);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-PT');
    const list = q ? conversations.filter((c) => c.title.toLocaleLowerCase('pt-PT').includes(q) || c.messages.some((m) => m.text.toLocaleLowerCase('pt-PT').includes(q))) : conversations;
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    const groups: { label: string; items: Conversation[] }[] = [];
    const pinned = sorted.filter((c) => c.pinned);
    if (pinned.length) groups.push({ label: 'Fixadas', items: pinned });
    for (const c of sorted.filter((c) => !c.pinned)) {
      const label = groupLabel(c.updatedAt);
      const group = groups.find((g) => g.label === label);
      if (group) group.items.push(c); else groups.push({ label, items: [c] });
    }
    return groups;
  }, [conversations, query]);

  const userName = settings.displayName.trim() || user?.displayName || '';
  const firstName = userName.split(/\s+/)[0];
  // "Bom dia", "Boa tarde" ou "Boa noite", pela hora de quem usa (só no browser, para não divergir do servidor).
  const [greeting, setGreeting] = useState('Olá');
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h >= 6 && h < 13 ? 'Bom dia' : h >= 13 && h < 20 ? 'Boa tarde' : 'Boa noite');
  }, []);
  const initials = (userName || user?.email || '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const canSend = (draft.trim().length > 0 || pending.length > 0) && !isStreaming && !pending.some((f) => f.reading);

  const sendRef = useRef(send);
  sendRef.current = send;
  const recorder = useRecorder({
    language: settings.voiceLang,
    onText: useCallback((text: string) => {
      if (settings.autoSendVoice) return sendRef.current(text);
      setDraft((current) => (current.trim() ? `${current.trimEnd()} ${text}` : text));
      inputRef.current?.focus();
    }, [settings.autoSendVoice]),
    onError: useCallback((message: string) => setNotice(message), []),
  });

  function exportConversations() {
    const blob = new Blob([JSON.stringify(conversations, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: `cvviews-conversas-${new Date().toISOString().slice(0, 10)}.json` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function clearAll() {
    if (!window.confirm('Eliminar todas as conversas deste dispositivo?')) return;
    abortRef.current?.abort();
    setConversations([]);
    setActiveId(null);
  }

  async function logout() {
    setProfileMenu(null);
    setDialog(null);
    await signOut(auth()).catch(() => setNotice('Não foi possível terminar a sessão.'));
  }

  const avatar = user?.photoURL
    ? <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
    : <span className="avatar">{initials || <UserRound size={16} />}</span>;

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) void addFiles(event.dataTransfer.files);
  };

  const composer = (
  <div className="composer-wrap">
    {!atBottom && messages.length > 0 && <button className="to-bottom" onClick={() => { setAtBottom(true); scrollToBottom(true); }} aria-label="Ir para o fim"><ArrowDown size={17} /></button>}
    <form className="composer" onSubmit={handleSubmit}>
      {pending.length > 0 && (
        <div className="pending">
          {pending.map((file) => (
            <div className={`file-chip${file.reading ? ' is-reading' : ''}`} key={file.id}>
              <span className={`file-icon ${file.kind}`}>{file.reading ? <Loader2 size={16} className="spin" /> : file.kind === 'image' ? <ImageIcon size={16} /> : <FileText size={16} />}</span>
              <span><strong>{file.name}</strong><small>{file.reading ? 'A ler…' : `${KIND_LABEL[file.kind]} · ${formatSize(file.size)}`}</small></span>
              <button type="button" onClick={() => setPending((list) => list.filter((f) => f.id !== file.id))} aria-label={`Remover ${file.name}`}><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        value={draft}
        rows={1}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          const touch = window.matchMedia('(pointer: coarse)').matches;
          if (e.key === 'Enter' && !e.shiftKey && settings.enterToSend && !touch && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
        }}
        onPaste={(e) => { if (e.clipboardData.files.length) { e.preventDefault(); void addFiles(e.clipboardData.files); } }}
        placeholder={messages.length ? 'Responde ao Leo…' : wide ? 'Em que posso ajudar hoje?' : 'Escreve ao Leo…'}
        aria-label="Mensagem"
      />
      <input ref={fileRef} type="file" hidden multiple accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,image/jpeg,image/png,image/webp" onChange={(e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
      {recorder.state === 'recording' ? (
        <div className="composer-row recording">
          <button type="button" className="tool-btn" onClick={recorder.cancel} aria-label="Cancelar gravação" title="Cancelar"><X size={18} /></button>
          <div className="wave" aria-hidden="true">{recorder.levels.map((level, i) => <i key={i} style={{ transform: `scaleY(${Math.max(0.08, level)})` }} />)}</div>
          <span className="rec-time"><span className="rec-dot" />{Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, '0')}</span>
          <button type="button" className="send-btn" onClick={recorder.finish} aria-label="Terminar e transcrever" title="Terminar"><Check size={18} strokeWidth={2.4} /></button>
        </div>
      ) : (
        <div className="composer-row">
          <div className="plus">
            <button type="button" className="tool-btn" onClick={(e) => { e.stopPropagation(); setPlusOpen((o) => !o); }} aria-label="Adicionar" aria-expanded={plusOpen} title="Adicionar"><Plus size={20} /></button>
            {plusOpen && (
              <div className="menu plus-menu" onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => { setPlusOpen(false); fileRef.current?.click(); }}><Paperclip size={16} /> Adicionar CV ou fotografia</button>
                <button type="button" onClick={() => updateSettings({ ...settings, web: !settings.web })}><Globe size={16} /> Pesquisa na web<span className={`switch mini${settings.web ? ' is-on' : ''}`}><i /></span></button>
              </div>
            )}
          </div>
          <button type="button" className="tool-btn mic-btn" onClick={recorder.start} disabled={recorder.state === 'transcribing'} aria-label="Ditar por voz" title="Ditar por voz">
            {recorder.state === 'transcribing' ? <Loader2 size={18} className="spin" /> : <Mic size={18} />}
          </button>
          {isStreaming ? (
            <button type="button" className="send-btn is-stop" onClick={() => abortRef.current?.abort()} aria-label="Parar resposta"><Square size={13} fill="currentColor" /></button>
          ) : (
            <button type="submit" className={`send-btn${canSend ? '' : ' is-idle'}`} disabled={!canSend} aria-label="Enviar"><ArrowUp size={18} strokeWidth={2.4} /></button>
          )}
        </div>
      )}
    </form>

    <div className="composer-meta">
      <div className="mode-picker">
        <button type="button" className="meta-btn" onClick={(e) => { e.stopPropagation(); setModeMenuOpen((o) => !o); }} aria-haspopup="menu" aria-expanded={modeMenuOpen}>
          {MODES[mode].label}<ChevronDown size={14} />
        </button>
        {modeMenuOpen && (
          <div className="menu mode-menu" role="menu" onClick={(e) => e.stopPropagation()}>
            {(Object.keys(MODES) as Mode[]).map((key) => {
              const Icon = MODES[key].icon;
              return (
                <button key={key} role="menuitemradio" aria-checked={mode === key} onClick={() => changeMode(key)}>
                  <span className="mode-icon"><Icon size={16} /></span>
                  <span className="mode-copy"><strong>{MODES[key].label}</strong><small>{MODES[key].hint}</small></span>
                  {mode === key && <Check size={16} className="mode-check" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button type="button" className="meta-btn" onClick={() => updateSettings({ ...settings, web: !settings.web })} title={settings.web ? 'Desligar a pesquisa na web' : 'Ligar a pesquisa na web'}>
        <strong>Leo</strong><span>{settings.web ? 'Com web' : 'Sem web'}</span>
      </button>
    </div>
  </div>
  );

  const accountMenu = (where: 'rail' | 'panel') => profileMenu === where && (
    <div className={`menu settings-menu from-${where}`} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => { setProfileMenu(null); setDialog('settings'); }}><Settings2 size={15} /> Configurações</button>
      <button onClick={logout}><LogOut size={15} /> Terminar sessão</button>
    </div>
  );

  return (
    <div className={`app${panelOpen ? ' panel-open' : ''}${drawerOpen ? ' drawer-open' : ''}`}>
      <div className="scrim" onClick={() => setDrawerOpen(false)} aria-hidden="true" />

      {/* PC: a faixa de ícones, sempre à vista. */}
      <nav className="rail" aria-label="Navegação">
        <button className="rail-logo" onClick={() => setPanelOpen(!panelOpen)} aria-label={panelOpen ? 'Fechar barra lateral' : 'Abrir barra lateral'} aria-expanded={panelOpen} title={panelOpen ? 'Fechar barra lateral' : 'Abrir barra lateral'}>
          <Logo />
          <span className="rail-logo-hover">{panelOpen ? <PanelLeftClose size={20} strokeWidth={1.7} /> : <PanelLeftOpen size={20} strokeWidth={1.7} />}</span>
        </button>
        <button className="rail-btn is-on" onClick={() => setPanelOpen(!panelOpen)} aria-label="Conversas" aria-expanded={panelOpen} title="Conversas"><MessageSquareText size={21} strokeWidth={1.7} /></button>
        <button className="rail-btn" onClick={focusSearch} aria-label="Pesquisar conversas" title="Pesquisar conversas"><Search size={21} strokeWidth={1.7} /></button>
        <div className="rail-foot">
          {authReady && !user && <button className="rail-btn" onClick={() => setDialog('auth')} aria-label="Entrar" title="Entrar"><LogIn size={21} strokeWidth={1.7} /></button>}
          <button className="rail-btn" onClick={() => setDialog('settings')} aria-label="Configurações" title="Configurações"><Gear size={21} strokeWidth={1.7} /></button>
          {user && <button className="rail-avatar" onClick={(e) => { e.stopPropagation(); setProfileMenu(profileMenu === 'rail' ? null : 'rail'); }} aria-label="A tua conta" title={userName || user.email || 'A tua conta'}>{avatar}</button>}
          {accountMenu('rail')}
        </div>
      </nav>

      {/* A lista de conversas: ao lado da faixa no PC, gaveta no telemóvel. */}
      <aside className="sidebar" aria-label="Conversas">
        <div className="sidebar-top">
          <span className="brand-word">CVviews</span>
          <button className="close-btn" onClick={closeSidebar} aria-label="Fechar" title="Fechar"><X size={19} /></button>
        </div>

        <button className="side-row new-chat is-on" onClick={newChat}><SquarePen size={19} /> Nova conversa <kbd className="desktop-only">Ctrl ⇧ O</kbd></button>

        <label className="side-row search">
          <Search size={19} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar conversas" aria-label="Pesquisar conversas" />
          {query && <button onClick={() => setQuery('')} aria-label="Limpar pesquisa"><X size={14} /></button>}
        </label>

        <button className="side-row phone-row" onClick={() => setDialog('settings')}><Gear size={19} /> Configurações</button>

        <nav className="history">
          {hydrated && !conversations.length && <p className="history-empty">As tuas conversas aparecem aqui.</p>}
          {hydrated && conversations.length > 0 && !filtered.length && <p className="history-empty">Nenhuma conversa encontrada.</p>}
          {filtered.map((group) => (
            <section key={group.label}>
              <h3>{group.label}</h3>
              {group.items.map((c) => (
                <div className={`history-item${c.id === activeId ? ' is-active' : ''}${itemMenu === c.id ? ' menu-open' : ''}`} key={c.id}>
                  {renaming?.id === c.id ? (
                    <form onSubmit={(e) => { e.preventDefault(); updateConversation(c.id, (x) => ({ ...x, title: renaming.title.trim() || x.title })); setRenaming(null); }}>
                      <input autoFocus value={renaming.title} onChange={(e) => setRenaming({ id: c.id, title: e.target.value })} onBlur={(e) => e.currentTarget.form?.requestSubmit()} aria-label="Novo título" />
                    </form>
                  ) : (
                    <button className="history-link" onClick={() => openConversation(c.id)} title={c.title}>
                      {c.pinned && <Pin size={12} className="pin-icon" />}<span>{c.title}</span>
                    </button>
                  )}
                  <button className="history-more" aria-label="Opções da conversa" onClick={(e) => { e.stopPropagation(); setItemMenu(itemMenu === c.id ? null : c.id); }}><MoreHorizontal size={17} /></button>
                  {itemMenu === c.id && (
                    <div className="menu history-menu" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => { setRenaming({ id: c.id, title: c.title }); setItemMenu(null); }}><Pencil size={15} /> Mudar o nome</button>
                      <button onClick={() => { updateConversation(c.id, (x) => ({ ...x, pinned: !x.pinned })); setItemMenu(null); }}>{c.pinned ? <><PinOff size={15} /> Desafixar</> : <><Pin size={15} /> Fixar</>}</button>
                      <button className="danger" onClick={() => { deleteConversation(c.id); setItemMenu(null); }}><Trash2 size={15} /> Eliminar</button>
                    </div>
                  )}
                </div>
              ))}
            </section>
          ))}
        </nav>

        <div className="sidebar-footer">
          {authReady && !user ? (
            <button className="signin-btn" onClick={() => setDialog('auth')}><LogIn size={19} /> Entrar</button>
          ) : (
            <button className="profile" onClick={(e) => { e.stopPropagation(); setProfileMenu(profileMenu === 'panel' ? null : 'panel'); }} aria-expanded={profileMenu === 'panel'}>
              {avatar}
              <span className="profile-text"><strong>{userName || user?.email || ' '}</strong><small>{user?.email && userName ? user.email : MODES[newChatMode].label}</small></span>
              <MoreHorizontal size={16} />
            </button>
          )}
          {accountMenu('panel')}
        </div>
      </aside>

      <main className="main" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={onDrop}>
        <header className="topbar">
          <button className="icon-btn menu-btn mobile-only" onClick={() => setDrawerOpen(true)} aria-label="Abrir menu" title="Abrir menu"><MenuIcon /></button>
          <span className="topbar-title">{active?.title ?? ''}</span>
          {liveAI === false && <span className="demo-badge" title="Sem GROQ_API_KEY: respostas de demonstração">Demo</span>}
          <button className={`icon-btn new-btn${active ? '' : ' mobile-only'}`} onClick={newChat} aria-label="Nova conversa" title="Nova conversa"><SquarePen size={19} /></button>
        </header>

        <div className="thread" ref={scrollRef} onScroll={(e) => { const el = e.currentTarget; setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80); }}>
          {!messages.length && wide ? (
            // PC: uma coluna alinhada à esquerda, com a saudação, o modo, a caixa e as sugestões numa lista.
            <div className="desk">
              <div className="desk-glow" aria-hidden="true" />
              <div className="desk-col">
                <header className="desk-head">
                  <div className="desk-hello">
                    <p><Logo className="desk-logo" /><span>{greeting}{firstName ? `, ${firstName}` : ''}</span></p>
                    <h1>O que vamos fazer hoje?</h1>
                  </div>
                  <div className="desk-tabs" role="radiogroup" aria-label="Modo">
                    {(Object.keys(MODES) as Mode[]).map((key) => (
                      <button key={key} role="radio" aria-checked={mode === key} className={mode === key ? 'is-on' : ''} onClick={() => changeMode(key)}>{MODES[key].label}</button>
                    ))}
                  </div>
                </header>
                {composer}
                <section className="desk-list" aria-label="Sugestões">
                  <h2>{mode === 'recrutador' ? 'Para recrutar' : 'Para a tua candidatura'}</h2>
                  {SUGGESTIONS[mode].map(({ icon: Icon, title, hint, prompt }, i) => (
                    <button key={title} className="desk-row" style={{ animationDelay: `${0.12 + i * 0.05}s` }} onClick={() => { if (prompt.startsWith('Vou anexar')) { setDraft(prompt); fileRef.current?.click(); } else send(prompt); }}>
                      <span className="desk-row-icon"><Icon size={18} strokeWidth={1.7} /></span>
                      <span className="desk-row-text"><strong>{title}</strong><small>{hint}</small></span>
                      <ArrowUpRight size={17} className="desk-row-go" />
                    </button>
                  ))}
                </section>
                <p className="desk-drop"><Paperclip size={14} /> Arrasta um CV para qualquer sítio da página · PDF, Word ou fotografia</p>
              </div>
            </div>
          ) : !messages.length ? (
            <div className="welcome">
              <div className="mode-switch" role="radiogroup" aria-label="Modo">
                {(Object.keys(MODES) as Mode[]).map((key) => (
                  <button key={key} role="radio" aria-checked={mode === key} className={mode === key ? 'is-on' : ''} onClick={() => changeMode(key)}>{MODES[key].label}</button>
                ))}
              </div>
              <div className="hello">
                <p className="hello-name"><Logo className="hello-logo" /><span>Olá{firstName ? `, ${firstName}` : ''}!</span></p>
                <h1>O que vamos fazer hoje?</h1>
              </div>
              {wide && composer}
              <div className="ideas">
                {SUGGESTIONS[mode].map(({ icon: Icon, title, hint, prompt }, i) => (
                  <button key={title} className="idea" style={{ animationDelay: `${0.1 + i * 0.05}s` }} onClick={() => { if (prompt.startsWith('Vou anexar')) { setDraft(prompt); fileRef.current?.click(); } else send(prompt); }}>
                    <span className="idea-icon"><Icon size={22} strokeWidth={1.6} /></span>
                    <span className="idea-text"><strong>{title}</strong><small>{hint}</small></span>
                    <ChevronRight size={20} className="idea-chevron" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages" aria-live="polite">
              {messages.map((m, index) => {
                const isLast = index === messages.length - 1;
                const writing = m.id === streamingId;
                const thinking = writing && !m.text;
                return m.role === 'user' ? (
                  <div className="msg msg-user" key={m.id}>
                    {m.attachments?.map((file) => (
                      <div className="file-chip in-thread" key={file.name}><span className={`file-icon ${file.kind}`}>{file.kind === 'image' ? <ImageIcon size={16} /> : <FileText size={16} />}</span><span><strong>{file.name}</strong><small>{KIND_LABEL[file.kind]} · {formatSize(file.size)}</small></span></div>
                    ))}
                    {m.text && <div className="bubble">{m.text}</div>}
                  </div>
                ) : (
                  <div className={`msg msg-assistant${m.error ? ' is-error' : ''}`} key={m.id}>
                    <div className="assistant-body">
                      {m.cvReview ? (
                        <ReviewView
                          {...m.cvReview}
                          source={cvSources.current.get(m.id)}
                          onFull={saveFull(active!.id, m.id)}
                        />
                      ) : thinking ? <LeoWriting label={searchingId === m.id ? 'A pesquisar na web' : 'A pensar'} /> : (
                        <SmoothProse text={m.text} streaming={writing} />
                      )}
                      {writing && !thinking && !m.cvReview && <LeoWriting />}
                      {m.id !== streamingId && m.text && !m.cvReview && (
                        <div className="msg-actions">
                          <button onClick={() => copy(m)} aria-label="Copiar" title="Copiar">{copiedId === m.id ? <Check size={15} /> : <Copy size={15} />}</button>
                          {isLast && <button onClick={regenerate} aria-label="Gerar novamente" title="Gerar novamente"><RotateCcw size={15} /></button>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {(!wide || messages.length > 0) && composer}

        {dragging && <div className="drop-overlay"><Paperclip size={26} /><strong>Larga o currículo aqui</strong><span>PDF, TXT ou fotografia, até 20 MB</span></div>}
        {notice && <div className="toast" role="status">{notice}</div>}
      </main>

      {!wide && authReady && !user && skipped === false && <Onboarding onEmail={() => setDialog('auth')} onSkip={skipLogin} />}
      {dialog === 'auth' && <AuthDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && (
        <SettingsDialog
          settings={settings}
          onChange={updateSettings}
          user={user}
          conversationCount={conversations.length}
          onExport={exportConversations}
          onClearAll={clearAll}
          onSignIn={() => setDialog('auth')}
          onSignOut={logout}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
