'use client';

import { useEffect, useRef, useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Mail } from 'lucide-react';
import { auth, messageFor, QUIET } from '@/lib/firebase';

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

// Uma nuvem de pequenos traços que se juntam numa folha de CV (título e linhas de texto), ficam um instante
// e voltam a soltar-se. Ao tocar ou passar o dedo, os traços afastam-se.
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
    const CLOUD_TILT = -0.32; // a nuvem solta
    const TILT = -0.1; // a folha formada, só um pouco inclinada
    const COUNT = 380;

    // A folha de CV, em coordenadas da página (largura 1, altura 1.3, centro em 0,0): o contorno tracejado,
    // a foto, o nome e o cargo, uma coluna lateral com competências e a coluna principal com secções e marcadores.
    type Seg = { x0: number; y0: number; x1: number; y1: number; w: number; fill: number; density: number };
    const segs: Seg[] = [];
    const line = (x0: number, y0: number, x1: number, y1: number, w = 1.4, fill = 0.92, density = 1) => segs.push({ x0, y0, x1, y1, w, fill, density });
    const W = 0.5, H = 0.65;
    // contorno da folha, tracejado
    line(-W, -H, W, -H, 1.1, 0.5, 0.55); line(W, -H, W, H, 1.1, 0.5, 0.55); line(W, H, -W, H, 1.1, 0.5, 0.55); line(-W, H, -W, -H, 1.1, 0.5, 0.55);
    // foto: um círculo
    const cx = -0.3, cy = -0.47, r = 0.1;
    for (let i = 0; i < 16; i++) { const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2; line(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, 1.5, 0.85, 1.4); }
    // nome e cargo
    line(-0.13, -0.51, 0.36, -0.51, 3.2, 0.96, 1.3);
    line(-0.13, -0.43, 0.16, -0.43, 1.4);
    line(-0.42, -0.31, 0.42, -0.31, 1, 0.96, 0.6);
    // coluna lateral: título, barras de competências, título, linhas curtas
    line(-0.42, -0.23, -0.24, -0.23, 2.4);
    for (const [y, len] of [[-0.15, 0.24], [-0.09, 0.18], [-0.03, 0.21], [0.03, 0.14]] as const) { line(-0.42, y, -0.42 + 0.26, y, 1, 0.96, 0.5); line(-0.42, y, -0.42 + len, y, 2.6); }
    line(-0.42, 0.14, -0.26, 0.14, 2.4);
    for (const [y, len] of [[0.21, 0.24], [0.27, 0.2], [0.33, 0.25], [0.39, 0.17], [0.45, 0.22]] as const) line(-0.42, y, -0.42 + len, y, 1.3);
    // coluna principal: perfil (parágrafo) e experiência (marcadores)
    line(-0.04, -0.23, 0.2, -0.23, 2.4);
    for (const [y, len] of [[-0.16, 0.46], [-0.1, 0.44], [-0.04, 0.46], [0.02, 0.3]] as const) line(-0.04, y, -0.04 + len, y, 1.3);
    line(-0.04, 0.11, 0.24, 0.11, 2.4);
    for (const [y, len] of [[0.18, 0.4], [0.24, 0.36], [0.31, 0.42], [0.37, 0.3], [0.44, 0.38], [0.5, 0.26]] as const) {
      line(-0.04, y, -0.025, y, 2.6, 1, 2.5); // o marcador
      line(0.0, y, len, y, 1.3);
    }
    // os traços dividem-se pelos segmentos, conforme o comprimento
    const segLen = (s: Seg) => Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
    const weight = segs.reduce((sum, s) => sum + segLen(s) * s.density, 0);
    const slots: { u: number; v: number; len: number; ang: number; w: number }[] = [];
    for (const s of segs) {
      const k = Math.max(1, Math.round((COUNT * segLen(s) * s.density) / weight));
      const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
      for (let i = 0; i < k; i++) {
        const t = (i + 0.5) / k;
        slots.push({ u: s.x0 + (s.x1 - s.x0) * t, v: s.y0 + (s.y1 - s.y0) * t, len: (segLen(s) / k) * s.fill, ang, w: s.w });
      }
    }
    // baralhados, para cada traço da nuvem ir para um sítio qualquer da folha
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    const SCALE = 0.6;
    const toPage = (u: number, v: number) => ({
      x: 0.5 + (u * Math.cos(TILT) - v * Math.sin(TILT)) * SCALE,
      y: 0.5 + (u * Math.sin(TILT) + v * Math.cos(TILT)) * SCALE,
    });

    const dashes = Array.from({ length: slots.length }, (_, i) => {
      const dense = rnd() < 0.62;
      const u = (rnd() - 0.5) * (dense ? 0.9 : 1.7);
      const v = (rnd() - 0.5) * (dense ? 1.1 : 1.8);
      const slot = slots[i];
      const page = toPage(slot.u, slot.v);
      return {
        x: 0.56 + u * Math.cos(CLOUD_TILT) * 0.5 - v * Math.sin(CLOUD_TILT) * 0.42,
        y: 0.5 + u * Math.sin(CLOUD_TILT) * 0.5 + v * Math.cos(CLOUD_TILT) * 0.42,
        a: rnd() * Math.PI * 2,
        spin: (rnd() - 0.5) * 0.0012,
        len: dense ? 4 + rnd() * 4 : 5 + rnd() * 7,
        px: page.x, py: page.y, plen: slot.len * SCALE, pang: slot.ang, pw: slot.w,
        phase: rnd() * Math.PI * 2,
        delay: rnd() * 0.35,
        alpha: dense ? 0.7 + rnd() * 0.3 : 0.35 + rnd() * 0.4,
        ox: 0, oy: 0, // afastamento pelo dedo, que volta devagar ao sítio
      };
    });

    // O ciclo: solto, junta-se em folha, fica, solta-se.
    const CYCLE = 9000;
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const gather = (t: number, delay: number) => {
      const c = (t % CYCLE) / CYCLE;
      const inn = Math.min(1, Math.max(0, (c - 0.12 - delay * 0.25) / 0.25));
      const out = Math.min(1, Math.max(0, (c - 0.72 - delay * 0.15) / 0.2));
      return ease(inn) * (1 - ease(out));
    };

    const pointer = { x: -1e4, y: -1e4 };
    const move = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; };
    const leave = () => { pointer.x = pointer.y = -1e4; };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerup', leave);

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
      const left = (w - size) / 2, top = (h - size) / 2;
      ctx.lineCap = 'round';
      for (const d of dashes) {
        const g = still ? 1 : gather(t, d.delay);
        // solto: flutua e roda devagar; na folha: alinhado com as linhas
        const fx = d.x + Math.sin(t / 1700 + d.phase) * 0.012;
        const fy = d.y + Math.cos(t / 2100 + d.phase) * 0.012;
        let x = left + (fx + (d.px - fx) * g) * size;
        let y = top + (fy + (d.py - fy) * g) * size;
        const free = d.a + t * d.spin;
        // um traço não tem sentido: roda para a inclinação da folha pelo caminho mais curto
        const goal = TILT + d.pang;
        const target = goal + Math.PI * Math.round((free - goal) / Math.PI);
        const a = free + (target - free) * g;
        const len = d.len + (d.plen * size - d.len) * g;

        // o dedo empurra os traços para fora, e eles voltam
        const dx0 = x + d.ox - pointer.x, dy0 = y + d.oy - pointer.y;
        const dist = Math.hypot(dx0, dy0);
        const R = 70;
        if (dist < R && dist > 0.01) { const push = (1 - dist / R) * 6; d.ox += (dx0 / dist) * push; d.oy += (dy0 / dist) * push; }
        d.ox *= 0.92; d.oy *= 0.92;
        x += d.ox; y += d.oy;

        const hx = Math.cos(a) * len / 2, hy = Math.sin(a) * len / 2;
        ctx.lineWidth = 1.3 + (d.pw - 1.3) * g;
        ctx.strokeStyle = `rgba(255,255,255,${d.alpha + (0.95 - d.alpha) * g * 0.6})`;
        ctx.beginPath();
        ctx.moveTo(x - hx, y - hy);
        ctx.lineTo(x + hx, y + hy);
        ctx.stroke();
      }
      if (!still) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointerup', leave);
    };
  }, []);
  return <canvas ref={ref} className="onboard-art" aria-hidden="true" />;
}
