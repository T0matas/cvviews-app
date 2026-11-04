'use client';

import { type FormEvent, useState } from 'react';
import { createUserWithEmailAndPassword, GoogleAuthProvider, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup, updateProfile } from 'firebase/auth';
import { X } from 'lucide-react';
import { auth, messageFor, QUIET } from '@/lib/firebase';

type Step = 'login' | 'signup' | 'reset';

const COPY: Record<Step, [string, string]> = {
  login: ['Olá de novo', 'Entra no CVviews para guardares as tuas conversas.'],
  signup: ['Cria a tua conta', 'Demora um minuto.'],
  reset: ['Recuperar a palavra-passe', 'Escreve o email com que criaste a conta e enviamos-te uma ligação.'],
};

export default function AuthDialog({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('login');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

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
        <button className="icon-btn dialog-close" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        <h2 id="auth-title">{title}</h2>
        <p className="dialog-sub">{sub}</p>

        {step !== 'reset' && (
          <>
            <button className="google-btn" onClick={google} disabled={busy}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
              Continuar com o Google
            </button>
            <div className="divider"><span>ou</span></div>
          </>
        )}

        <form className="auth-form" onSubmit={submit}>
          {step === 'signup' && <label>Nome<input name="name" autoComplete="name" placeholder="Como te chamas" /></label>}
          <label>Email<input name="email" type="email" autoComplete="email" placeholder="nome@exemplo.pt" required /></label>
          {step !== 'reset' && (
            <label>
              <span className="label-row">Palavra-passe{step === 'login' && <button type="button" className="link" onClick={() => { setStep('reset'); setError(''); }}>Esqueceste-te?</button>}</span>
              <input name="password" type="password" autoComplete={step === 'signup' ? 'new-password' : 'current-password'} minLength={step === 'signup' ? 8 : undefined} required />
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-notice" role="status">{notice}</p>}
          <button className="primary-btn" type="submit" disabled={busy}>
            {step === 'login' ? 'Entrar' : step === 'signup' ? 'Criar conta' : 'Enviar ligação'}
          </button>
        </form>

        <p className="auth-switch">
          {step === 'login' && <>Ainda não tens conta? <button className="link" onClick={() => setStep('signup')}>Criar conta</button></>}
          {step === 'signup' && <>Já tens conta? <button className="link" onClick={() => setStep('login')}>Entrar</button></>}
          {step === 'reset' && <button className="link" onClick={() => setStep('login')}>Voltar a entrar</button>}
        </p>
      </div>
    </div>
  );
}
