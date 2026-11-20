'use client';

import { type FormEvent, useState } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { ArrowLeft, Eye, EyeOff, X } from 'lucide-react';
import { auth, messageFor, QUIET } from '@/lib/firebase';

type Step = 'login' | 'signup' | 'reset';

const COPY: Record<Step, [string, string]> = {
  login: ['Entra no CVviews', 'As tuas conversas e candidaturas, em qualquer aparelho.'],
  signup: ['Cria a tua conta', 'Grátis. Guarda as conversas, os CVs e as candidaturas.'],
  reset: ['Recuperar acesso', 'Diz-nos o email da conta e enviamos-te uma ligação para criares uma palavra-passe nova.'],
};

export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('login');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const go = (next: Step) => { setStep(next); setError(''); setNotice(''); };

  async function run(action: () => Promise<unknown>, done?: string) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await action();
      if (done) setNotice(done); else onClose();
    } catch (err) {
      if (!QUIET.has((err as { code?: string })?.code ?? '')) setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  // A janela da Google tem de abrir logo a partir do clique, ou o navegador bloqueia-a.
  const google = () => run(() => signInWithPopup(auth(), new GoogleAuthProvider()));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (step === 'reset') return run(() => sendPasswordResetEmail(auth(), email), 'Se existir uma conta com esse email, já lá tens a ligação.');
    if (step === 'login') return run(() => signInWithEmailAndPassword(auth(), email, password));
    const name = String(form.get('name') ?? '').trim();
    return run(async () => {
      const { user } = await createUserWithEmailAndPassword(auth(), email, password);
      if (name) await updateProfile(user, { displayName: name });
    });
  }

  const [title, sub] = COPY[step];
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog auth" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <header className="auth-top">
          {step === 'reset' ? <button className="icon-btn auth-back" onClick={() => go('login')} aria-label="Voltar"><ArrowLeft size={18} /></button> : <span />}
          <button className="icon-btn dialog-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>
        <h2 id="auth-title">{title}</h2>
        <p className="dialog-sub">{sub}</p>

        {step !== 'reset' && (
          <>
            <div className="auth-seg" role="tablist">
              <span className={`auth-seg-pill${step === 'signup' ? ' is-right' : ''}`} aria-hidden="true" />
              <button role="tab" aria-selected={step === 'login'} onClick={() => go('login')}>Entrar</button>
              <button role="tab" aria-selected={step === 'signup'} onClick={() => go('signup')}>Criar conta</button>
            </div>
            <button className="google-btn" onClick={google} disabled={busy}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
              Continuar com o Google
            </button>
            <p className="auth-or">ou com o teu email</p>
          </>
        )}

        <form className="auth-form" onSubmit={submit}>
          <div className="auth-group">
            {step === 'signup' && <label className="auth-row"><span>Nome</span><input name="name" autoComplete="name" placeholder="Como te chamas" /></label>}
            <label className="auth-row"><span>Email</span><input name="email" type="email" autoComplete="email" placeholder="nome@exemplo.pt" required /></label>
            {step !== 'reset' && (
              <label className="auth-row">
                <span>Palavra-passe</span>
                <input name="password" type={showPass ? 'text' : 'password'} autoComplete={step === 'signup' ? 'new-password' : 'current-password'} minLength={step === 'signup' ? 8 : undefined} placeholder={step === 'signup' ? 'Pelo menos 8 caracteres' : '••••••••'} required />
                <button type="button" className="auth-eye" onClick={() => setShowPass((v) => !v)} aria-label={showPass ? 'Esconder a palavra-passe' : 'Mostrar a palavra-passe'}>{showPass ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </label>
            )}
          </div>
          {step === 'login' && <button type="button" className="link auth-forgot" onClick={() => go('reset')}>Esqueci-me da palavra-passe</button>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-notice" role="status">{notice}</p>}
          <button className="primary-btn auth-submit" type="submit" disabled={busy}>
            {busy ? 'Um momento…' : step === 'login' ? 'Entrar' : step === 'signup' ? 'Criar conta' : 'Enviar ligação'}
          </button>
        </form>

        {step !== 'reset' && <p className="auth-legal">Ao continuar, aceitas os Termos e a Política de Privacidade.</p>}
      </div>
    </div>
  );
}
