'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Mail } from 'lucide-react';
import { auth, messageFor, QUIET } from '@/lib/firebase';
import Logo from './logo';

// O primeiro ecrã no telemóvel, para quem ainda não tem sessão: entrar com a Google ou com o email,
// ou saltar e usar a app sem conta.
export default function Onboarding({ onEmail, onSkip }: { onEmail: () => void; onSkip: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // A janela da Google tem de abrir logo a partir do clique, ou o navegador bloqueia-a.
  const google = async () => {
    setError('');
    setBusy(true);
    try {
      await signInWithPopup(auth(), new GoogleAuthProvider());
    } catch (err) {
      if (!QUIET.has((err as { code?: string })?.code ?? '')) setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboard" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <header className="onboard-top">
        <span className="onboard-logo"><Logo /></span>
        <button className="onboard-skip" onClick={onSkip}>Saltar</button>
      </header>
      <Dashes />
      <div className="onboard-copy">
        <h1 id="onboard-title">Bem-vindo</h1>
        <p>O teu próximo emprego começa aqui</p>
      </div>
      <div className="onboard-actions">
        <button className="onboard-btn is-light" onClick={google} disabled={busy}>
          <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
          Continuar com o Google
        </button>
        <button className="onboard-btn" onClick={onEmail} disabled={busy}><Mail size={19} strokeWidth={1.8} />Continuar com email</button>
        {error && <p className="onboard-error" role="alert">{error}</p>}
        <p className="onboard-legal">Ao continuar, aceitas os Termos de Serviço e a Política de Privacidade do CVviews.</p>
      </div>
    </div>
  );
}

// Uma nuvem de pequenos traços que se vão alinhando devagar, como folhas de um CV a ganhar forma.
function Dashes() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Os traços: mais juntos no centro de uma folha inclinada, mais soltos à volta.
    const dashes = Array.from({ length: 360 }, () => {
      const dense = rnd() < 0.62;
      const u = (rnd() - 0.5) * (dense ? 0.9 : 1.7);
      const v = (rnd() - 0.5) * (dense ? 1.1 : 1.8);
      const tilt = -0.32;
      return {
        x: 0.56 + u * Math.cos(tilt) * 0.5 - v * Math.sin(tilt) * 0.42,
        y: 0.5 + u * Math.sin(tilt) * 0.5 + v * Math.cos(tilt) * 0.42,
        a: rnd() * Math.PI * 2,
        len: dense ? 4 + rnd() * 4 : 5 + rnd() * 7,
        phase: rnd() * Math.PI * 2,
        alpha: dense ? 0.7 + rnd() * 0.3 : 0.35 + rnd() * 0.4,
      };
    });
    let frame = 0;
    const draw = (t: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const size = Math.min(w, h);
      const ox = (w - size) / 2, oy = (h - size) / 2;
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.3;
      for (const d of dashes) {
        // cada traço roda devagar para a direção das linhas de uma folha, e volta a soltar-se
        const pull = still ? 0.5 : (Math.sin(t / 2600 + d.phase) + 1) / 2;
        const a = d.a * (1 - pull * 0.6) + -0.32 * pull * 0.6;
        const x = ox + d.x * size, y = oy + d.y * size;
        const dx = Math.cos(a) * d.len / 2, dy = Math.sin(a) * d.len / 2;
        ctx.strokeStyle = `rgba(255,255,255,${d.alpha})`;
        ctx.beginPath();
        ctx.moveTo(x - dx, y - dy);
        ctx.lineTo(x + dx, y + dy);
        ctx.stroke();
      }
      if (!still) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <canvas ref={ref} className="onboard-art" aria-hidden="true" />;
}
