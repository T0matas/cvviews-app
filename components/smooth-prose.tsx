'use client';

import { useEffect, useRef, useState } from 'react';
import Markdown from './markdown';

// O texto aparece a ritmo constante, palavra a palavra, mesmo quando a Groq o manda aos bocados grandes
// (uma resposta curta chega muitas vezes num só bocado, e sem isto aparecia toda de uma vez).
// Cada palavra nova entra a desfocar e a ganhar opacidade; cada parágrafo, lista ou tabela sobe um pouco
// (ver .prose.is-revealing em review.css).
const BASE = 48;        // caracteres por segundo quando está quase em dia
const CATCH_UP = 1.1;   // mais isto por cada carácter em atraso, para nunca ficar muito para trás
const SETTLE = 750;     // as últimas palavras acabam de entrar antes de se tirar a animação

export default function SmoothProse({ text, streaming }: { text: string; streaming: boolean }) {
  // Uma resposta que já estava completa ao abrir a conversa aparece logo inteira.
  const [shown, setShown] = useState(() => (streaming ? 0 : text.length));
  const [settling, setSettling] = useState(false);
  const target = useRef(text);
  target.current = text;
  const progress = useRef(shown);
  const animating = shown < text.length;

  useEffect(() => {
    if (!animating) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return setShown(text.length);
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      const full = target.current;
      const behind = full.length - progress.current;
      if (behind > 0) {
        // posição fracionária: avança suavemente frame a frame, sem saltos
        progress.current = Math.min(full.length, progress.current + ((BASE + behind * CATCH_UP) * dt) / 1000);
        let next = Math.floor(progress.current);
        // só mostra palavras inteiras (uma palavra cortada a meio aparecia aos pedaços)
        if (next < full.length && /\S/.test(full[next])) {
          const start = full.lastIndexOf(' ', next);
          next = Math.max(0, start);
        }
        setShown((current) => (next > current ? next : current));
        if (progress.current >= full.length) setShown(full.length);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animating, text.length]);

  // Quando acaba, a animação das palavras fica mais um instante, para as últimas não aparecerem de repente.
  const live = animating || streaming;
  useEffect(() => {
    if (live) { setSettling(true); return; }
    const t = setTimeout(() => setSettling(false), SETTLE);
    return () => clearTimeout(t);
  }, [live]);

  const reveal = live || settling;
  return (
    <div className={`prose${reveal ? ' is-revealing' : ''}`}>
      <Markdown text={text.slice(0, shown)} reveal={reveal} />
    </div>
  );
}
