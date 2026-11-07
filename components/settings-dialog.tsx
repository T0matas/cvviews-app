'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  Brain, BriefcaseBusiness, CornerDownLeft, Database, Download, FileText, Globe, Languages, LogIn, LogOut, Mic,
  Monitor, Moon, Send, Settings2, Sparkles, Sun, Trash2, UserRound, UsersRound, X,
} from 'lucide-react';
import type { Mode } from '@/lib/types';
import { EMPTY_MEMORY, type Memory } from '@/lib/memory';
import Logo from './logo';

export type Settings = {
  displayName: string;
  defaultMode: Mode;
  web: boolean;
  enterToSend: boolean;
  voiceLang: 'pt' | 'en';
  autoSendVoice: boolean;
  /** O Leo lembra-se da pessoa entre conversas (notas e o último CV). */
  memory: boolean;
  /** O tema: o do sistema, ou claro/escuro fixo. */
  theme: 'system' | 'light' | 'dark';
  /** A língua das respostas do Leo. */
  lang: 'pt-PT' | 'pt-BR' | 'en';
};

export const DEFAULT_SETTINGS: Settings = { displayName: '', defaultMode: 'recrutador', web: true, enterToSend: true, voiceLang: 'pt', autoSendVoice: false, memory: true, theme: 'system', lang: 'pt-PT' };

const TABS = [
  { id: 'geral', label: 'Geral', icon: Settings2 },
  { id: 'leo', label: 'Leo', icon: Sparkles },
  { id: 'memoria', label: 'Memória', icon: Brain },
  { id: 'voz', label: 'Voz', icon: Mic },
  { id: 'dados', label: 'Dados', icon: Database },
  { id: 'conta', label: 'Conta', icon: UserRound },
] as const;
type Tab = (typeof TABS)[number]['id'];

type Props = {
  settings: Settings;
  onChange: (next: Settings) => void;
  user: User | null;
  conversationCount: number;
  onExport: () => void;
  onExportTraining: () => void;
  memory: Memory;
  onMemoryChange: (next: Memory) => void;
  onClearAll: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onClose: () => void;
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={checked} aria-label={label} className={`switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}><i /></button>;
}

// Uma linha com ícone, nome curto e o controlo à direita. A explicação longa fica no title (ao passar o rato).
function Line({ icon: Icon, title, hint, children }: { icon: typeof Globe; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="set-line" title={hint}>
      <span className="set-icon"><Icon size={17} /></span>
      <span className="set-title">{title}</span>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <h3 className="set-label">{children}</h3>;
}

// Cartões de escolha (um ícone e um nome), para opções que se percebem melhor a ver do que a ler.
function Choices<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string; icon: typeof Globe }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="set-choices" role="radiogroup" aria-label={label} style={{ '--n': options.length } as React.CSSProperties}>
      {options.map(({ id, label: name, icon: Icon }) => (
        <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'is-on' : ''} onClick={() => onChange(id)}>
          <Icon size={18} /><span>{name}</span>
        </button>
      ))}
    </div>
  );
}

// Uma miniatura da app em cada tema.
function ThemePreview({ kind }: { kind: 'light' | 'dark' | 'system' }) {
  return (
    <span className={`theme-preview ${kind}`} aria-hidden="true">
      <span className="tp-half tp-light"><i className="tp-side" /><i className="tp-line" /><i className="tp-line short" /><i className="tp-box" /></span>
      <span className="tp-half tp-dark"><i className="tp-side" /><i className="tp-line" /><i className="tp-line short" /><i className="tp-box" /></span>
    </span>
  );
}

const greetingNow = () => { const h = new Date().getHours(); return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 20 ? 'Boa tarde' : 'Boa noite'; };

export default function SettingsDialog({ settings, onChange, user, conversationCount, onExport, onExportTraining, memory, onMemoryChange, onClearAll, onSignIn, onSignOut, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('geral');
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });
  const shownName = (settings.displayName.trim() || user?.displayName || '').split(/\s+/)[0];

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-head">
          <h2 id="settings-title">Configurações</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <div className="settings-body">
          <nav className="settings-tabs" role="tablist">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}><Icon size={16} />{label}</button>
            ))}
          </nav>
          <div className="settings-panel" role="tabpanel">
            {tab === 'geral' && (
              <>
                <Label>Tema</Label>
                <div className="theme-cards" role="radiogroup" aria-label="Tema">
                  {([['system', 'Sistema', Monitor], ['light', 'Claro', Sun], ['dark', 'Escuro', Moon]] as const).map(([id, name, Icon]) => (
                    <button key={id} role="radio" aria-checked={settings.theme === id} className={`theme-card${settings.theme === id ? ' is-on' : ''}`} onClick={() => set('theme', id)}>
                      <ThemePreview kind={id} />
                      <span className="theme-name"><Icon size={14} />{name}</span>
                    </button>
                  ))}
                </div>

                <Label>Como te tratamos</Label>
                <div className="name-field">
                  <input className="setting-input" value={settings.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder={user?.displayName?.split(' ')[0] || 'O teu nome'} aria-label="O teu nome" />
                  <span className="name-preview" aria-live="polite"><Logo className="name-logo" />{greetingNow()}{shownName ? `, ${shownName}` : ''}</span>
                </div>

                <Label>Novas conversas começam em</Label>
                <Choices label="Modo das novas conversas" value={settings.defaultMode} onChange={(v) => set('defaultMode', v)} options={[{ id: 'recrutador', label: 'Recrutador', icon: BriefcaseBusiness }, { id: 'candidato', label: 'Candidato', icon: UsersRound }]} />

                <div className="set-lines">
                  <Line icon={CornerDownLeft} title="Enter envia" hint="Shift + Enter muda de linha. No telemóvel, o Enter muda sempre de linha.">
                    <kbd className="set-kbd">↵</kbd>
                    <Toggle label="Enter envia a mensagem" checked={settings.enterToSend} onChange={(v) => set('enterToSend', v)} />
                  </Line>
                </div>
              </>
            )}

            {tab === 'leo' && (
              <>
                <div className="set-lines">
                  <Line icon={Globe} title="Pesquisa na web" hint="O Leo pesquisa na internet quando a pergunta depende de factos atuais (notícias, cargos, salários).">
                    <Toggle label="Pesquisa na web" checked={settings.web} onChange={(v) => set('web', v)} />
                  </Line>
                </div>
                <Label>Língua das respostas</Label>
                <Choices label="Língua das respostas" value={settings.lang} onChange={(v) => set('lang', v)} options={[{ id: 'pt-PT', label: 'Portugal', icon: Languages }, { id: 'pt-BR', label: 'Brasil', icon: Languages }, { id: 'en', label: 'English', icon: Languages }]} />
              </>
            )}

            {tab === 'memoria' && (
              <>
                <div className="set-lines">
                  <Line icon={Brain} title="Memória" hint="O Leo lembra-se do que lhe contas e do teu último CV, de uma conversa para a outra.">
                    <Toggle label="Memória" checked={settings.memory} onChange={(v) => set('memory', v)} />
                  </Line>
                </div>
                <Label>O que o Leo sabe {memory.notes.length > 0 && <span className="set-count">{memory.notes.length}</span>}</Label>
                {memory.notes.length ? (
                  <div className="note-chips">
                    {memory.notes.map((note, i) => (
                      <span className="note-chip" key={i} title={note}>
                        <span>{note}</span>
                        <button onClick={() => onMemoryChange({ ...memory, notes: memory.notes.filter((_, k) => k !== i) })} aria-label={`Esquecer: ${note}`} title="Esquecer"><X size={12} /></button>
                      </span>
                    ))}
                  </div>
                ) : <p className="set-empty"><Brain size={22} />Ainda nada.</p>}

                <Label>Último CV</Label>
                {memory.cv ? (
                  <div className="cv-chip">
                    <span className="file-icon pdf"><FileText size={16} /></span>
                    <strong>{memory.cv.name}</strong>
                    <button className="icon-btn" onClick={() => onMemoryChange({ ...memory, cv: undefined })} aria-label="Esquecer o CV" title="Esquecer"><X size={15} /></button>
                  </div>
                ) : <p className="set-empty"><FileText size={22} />Nenhum CV guardado.</p>}

                {(memory.notes.length > 0 || memory.cv) && (
                  <button className="ghost-btn danger set-bottom" onClick={() => { if (window.confirm('Apagar tudo o que o Leo sabe sobre ti?')) onMemoryChange(EMPTY_MEMORY); }}><Trash2 size={14} />Apagar memória</button>
                )}
              </>
            )}

            {tab === 'voz' && (
              <>
                <Label>Língua do ditado</Label>
                <Choices label="Língua do ditado" value={settings.voiceLang} onChange={(v) => set('voiceLang', v)} options={[{ id: 'pt', label: 'Português', icon: Mic }, { id: 'en', label: 'English', icon: Mic }]} />
                <div className="set-lines">
                  <Line icon={Send} title="Enviar ao acabar de ditar" hint="Desligado, o texto fica na caixa para o reveres antes de enviar.">
                    <Toggle label="Enviar logo depois de ditar" checked={settings.autoSendVoice} onChange={(v) => set('autoSendVoice', v)} />
                  </Line>
                </div>
              </>
            )}

            {tab === 'dados' && (
              <>
                <div className="stat-card">
                  <strong>{conversationCount}</strong>
                  <span>{conversationCount === 1 ? 'conversa' : 'conversas'} neste dispositivo</span>
                </div>
                <div className="action-grid">
                  <button className="action-tile" onClick={onExport} title="Um ficheiro JSON com todas as conversas."><Download size={18} /><span>Exportar conversas</span></button>
                  <button className="action-tile" onClick={onExportTraining} title="As respostas com 👍, prontas para treinar um modelo (JSONL)."><Sparkles size={18} /><span>Exportar treino</span></button>
                  <button className="action-tile danger" onClick={onClearAll} disabled={!conversationCount} title="Não dá para desfazer."><Trash2 size={18} /><span>Eliminar tudo</span></button>
                </div>
              </>
            )}

            {tab === 'conta' && (user ? (
              <>
                <div className="account-card">
                  {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar large">{(user.displayName || user.email || '?')[0].toUpperCase()}</span>}
                  <div>
                    <strong>{user.displayName || 'Sem nome'}</strong>
                    <small>{user.email}</small>
                    <span className="provider-pill">{user.providerData[0]?.providerId === 'google.com' ? 'Google' : 'Email'}</span>
                  </div>
                </div>
                <button className="ghost-btn set-bottom" onClick={onSignOut}><LogOut size={15} /> Terminar sessão</button>
              </>
            ) : (
              <div className="signin-card">
                <span className="set-icon big"><UserRound size={26} /></span>
                <strong>Sem sessão iniciada</strong>
                <button className="primary-btn small" onClick={onSignIn}><LogIn size={15} /> Entrar</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
