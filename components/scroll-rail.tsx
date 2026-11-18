'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';

// A barra de rolagem do CVviews, desenhada por nós (a nativa não se deixa pintar com um gradiente em todos os
// navegadores): uma linha fina, de branco para verde, colada à direita da área que rola. Arrasta-se como a nativa,
// fica mais viva enquanto se rola e desaparece quando não há nada para rolar.
export default function ScrollRail({ target, inset = 6 }: { target: RefObject<HTMLElement | null>; inset?: number }) {
  const [box, setBox] = useState<{ top: number; left: number; height: number; thumb: number; y: number } | null>(null);
  const [active, setActive] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ startY: number; startTop: number } | null>(null);

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const { scrollHeight, clientHeight, scrollTop } = el;
      if (scrollHeight <= clientHeight + 2 || r.height < 40) return setBox(null);
      const track = r.height - inset * 2;
      const thumb = Math.max(36, (clientHeight / scrollHeight) * track);
      const y = (scrollTop / (scrollHeight - clientHeight)) * (track - thumb);
      setBox({ top: r.top + inset, left: r.right - 7, height: track, thumb, y });
    };
    const onScroll = () => {
      measure();
      setActive(true);
      if (idle.current) clearTimeout(idle.current);
      idle.current = setTimeout(() => setActive(false), 900);
    };
    measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    const sizes = new ResizeObserver(measure);
    sizes.observe(el);
    // o conteúdo cresce (uma resposta a chegar) sem mudar o tamanho da caixa
    const content = new MutationObserver(measure);
    content.observe(el, { childList: true, subtree: true, characterData: true });
    const tick = setInterval(measure, 1200);   // a grelha mexe-se com animações: volta a medir de vez em quando
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      sizes.disconnect();
      content.disconnect();
      clearInterval(tick);
      if (idle.current) clearTimeout(idle.current);
    };
  }, [target, inset]);

  if (!box) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLSpanElement>) => {
    const el = target.current;
    if (!el) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startTop: el.scrollTop };
    setActive(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLSpanElement>) => {
    const el = target.current;
    if (!el || !drag.current) return;
    const ratio = (el.scrollHeight - el.clientHeight) / Math.max(1, box.height - box.thumb);
    el.scrollTop = drag.current.startTop + (e.clientY - drag.current.startY) * ratio;
  };
  const onPointerUp = () => { drag.current = null; setActive(false); };

  return (
    <div className={`scroll-rail${active ? ' is-active' : ''}`} style={{ top: box.top, left: box.left, height: box.height }} aria-hidden="true">
      <span
        className="scroll-thumb"
        style={{ height: box.thumb, transform: `translateY(${box.y}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
