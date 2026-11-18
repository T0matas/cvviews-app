'use client';

import { useEffect, useRef, useState } from 'react';
import Markdown from './markdown';

// O texto aparece a ritmo constante, palavra a palavra, mesmo quando a Groq o manda aos bocados grandes.
// Cada parágrafo, lista ou tabela nova sobe e ganha opacidade ao entrar (ver .prose.is-revealing em extras.css).
export default function SmoothProse({ text, streaming }: { text: string; streaming: boolean }) {
  // Uma resposta que já estava completa ao abrir a conversa aparece logo inteira.
  const [shown, setShown] = useState(() => (streaming ? 0 : text.length));
  const target = useRef(text);
  target.current = text;
  const animating = shown < text.length;

  useEffect(() => {
    if (!animating) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(text.length);
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      setShown((current) => {
        const behind = target.current.length - current;
        if (behind <= 0) return current;
        // Mais depressa quando fica muito para trás, para nunca se atrasar demasiado à resposta.
        const speed = Math.max(90, behind * 2.2); // caracteres por segundo
        let next = Math.min(target.current.length, current + Math.max(1, Math.round((speed * dt) / 1000)));
        // Acaba sempre numa palavra inteira.
        const space = target.current.slice(next).search(/\s/);
        if (space > 0 && space < 14) next += space;
        return next;
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animating, text.length]);

  return (
    <div className={`prose${animating || streaming ? ' is-revealing' : ''}`}>
      <Markdown text={text.slice(0, shown)} reveal={animating || streaming} />
    </div>
  );
}
