'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';
import { Database, Globe, LogIn, LogOut, Mic, Settings2, UserRound, X } from 'lucide-react';
import type { Mode } from '@/lib/types';

export type Settings = {
  displayName: string;
  defaultMode: Mode;
  web: boolean;
  enterToSend: boolean;
  voiceLang: 'pt' | 'en';
  autoSendVoice: boolean;
};

export const DEFAULT_SETTINGS: Settings = { displayName: '', defaultMode: 'recrutador', web: true, enterToSend: true, voiceLang: 'pt', autoSendVoice: false };

const TABS = [
  { id: 'geral', label: 'Geral', icon: Settings2 },
  { id: 'leo', label: 'Leo', icon: Globe },
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
  onClearAll: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
  onClose: () => void;
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={checked} aria-label={label} className={`switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)}><i /></button>;
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div><strong>{title}</strong>{hint && <small>{hint}</small>}</div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(([id, label]) => <button key={id} role="radio" aria-checked={value === id} className={value === id ? 'is-on' : ''} onClick={() => onChange(id)}>{label}</button>)}
    </div>
  );
}

export default function SettingsDialog({ settings, onChange, user, conversationCount, onExport, onClearAll, onSignIn, onSignOut, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('geral');
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });

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
                <Row title="Tema" hint="Segue o do sistema: branco no modo claro, preto no modo escuro."><span className="setting-value">Sistema</span></Row>
                <Row title="Como te tratamos" hint={user?.displayName ? `Por omissão, o nome da tua conta: ${user.displayName}` : 'Aparece na saudação.'}>
                  <input className="setting-input" value={settings.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder={user?.displayName?.split(' ')[0] || 'O teu nome'} />
                </Row>
                <Row title="Modo das novas conversas">
                  <Segmented value={settings.defaultMode} options={[['recrutador', 'Recrutador'], ['candidato', 'Candidato']]} onChange={(v) => set('defaultMode', v)} />
                </Row>
                <Row title="Enter envia a mensagem" hint="Shift + Enter muda de linha. No telemóvel, o Enter muda sempre de linha.">
                  <Toggle label="Enter envia a mensagem" checked={settings.enterToSend} onChange={(v) => set('enterToSend', v)} />
                </Row>
              </>
            )}
            {tab === 'leo' && (
              <>
                <Row title="Pesquisa na web" hint="O Leo pesquisa na internet quando a pergunta depende de factos atuais, como notícias, cargos ou salários.">
                  <Toggle label="Pesquisa na web" checked={settings.web} onChange={(v) => set('web', v)} />
                </Row>
                <Row title="Língua das respostas" hint="Português de Portugal. Se escreveres noutra língua, o Leo responde nessa."><span className="setting-value">pt-PT</span></Row>
              </>
            )}
            {tab === 'voz' && (
              <>
                <Row title="Língua do ditado">
                  <Segmented value={settings.voiceLang} options={[['pt', 'Português'], ['en', 'English']]} onChange={(v) => set('voiceLang', v)} />
                </Row>
                <Row title="Enviar logo depois de ditar" hint="Senão, o texto fica na caixa para o reveres.">
                  <Toggle label="Enviar logo depois de ditar" checked={settings.autoSendVoice} onChange={(v) => set('autoSendVoice', v)} />
                </Row>
              </>
            )}
            {tab === 'dados' && (
              <>
                <Row title="Onde ficam as conversas" hint={user ? 'Neste dispositivo, separadas por conta.' : 'Neste dispositivo. Entra para as separares por conta.'}><span className="setting-value">{conversationCount} {conversationCount === 1 ? 'conversa' : 'conversas'}</span></Row>
                <Row title="Exportar conversas" hint="Um ficheiro JSON com todas as conversas."><button className="ghost-btn" onClick={onExport}>Exportar</button></Row>
                <Row title="Eliminar todas as conversas" hint="Não dá para desfazer."><button className="ghost-btn danger" onClick={onClearAll}>Eliminar</button></Row>
              </>
            )}
            {tab === 'conta' && (user ? (
              <>
                <div className="account-card">
                  {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <span className="avatar large">{(user.displayName || user.email || '?')[0].toUpperCase()}</span>}
                  <div><strong>{user.displayName || 'Sem nome'}</strong><small>{user.email}</small></div>
                </div>
                <Row title="Entrada com" hint="Gerida pela conta CVviews (Firebase)."><span className="setting-value">{user.providerData[0]?.providerId === 'google.com' ? 'Google' : 'Email'}</span></Row>
                <Row title="Terminar sessão"><button className="ghost-btn" onClick={onSignOut}><LogOut size={15} /> Sair</button></Row>
              </>
            ) : (
              <Row title="Não tens sessão iniciada" hint="Entra com o Google ou com o teu email para teres a tua foto e as tuas conversas.">
                <button className="primary-btn small" onClick={onSignIn}><LogIn size={15} /> Entrar</button>
              </Row>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
