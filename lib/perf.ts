'use client';

// Modo leve para computadores e telemóveis mais fracos (data-lite no <html>):
// - logo no arranque (app/layout.tsx), pelos sinais do aparelho: 2 núcleos, 2 GB de memória ou poupança de dados (o iPhone não diz a memória, por isso o resto fica para a medição);
// - depois, a medir de facto: se os primeiros segundos correrem abaixo de ~40 fotogramas por segundo, liga-se também.
// Em modo leve saem os desfoques, as animações em ciclo e os efeitos pesados (app/review.css), o texto aparece com
// menos atualizações e o fundo das boas-vindas desenha menos traços.


export const isLite = () => typeof document !== 'undefined' && document.documentElement.dataset.lite === '1';

// Mede a fluidez durante uns segundos; um aparelho que não aguenta passa a modo leve (e fica lembrado).
export function watchFrameRate() {
  if (typeof window === 'undefined' || isLite()) return () => {};
  let frames = 0, slow = 0, start = 0, last = 0, raf = 0;
  const tick = (t: number) => {
    if (!start) { start = last = t; raf = requestAnimationFrame(tick); return; }
    const dt = t - last;
    last = t;
    if (document.visibilityState === 'visible' && dt < 500) { frames++; if (dt > 25) slow++; }
    if (t - start > 4000) {
      if (frames > 30 && slow / frames > 0.35) {
        document.documentElement.dataset.lite = '1';
        try { localStorage.setItem('cvviews-lite', '1'); } catch { /* sem armazenamento */ }
      }
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const begin = setTimeout(() => { raf = requestAnimationFrame(tick); }, 1500); // depois do arranque, que é sempre mais pesado
  return () => { clearTimeout(begin); cancelAnimationFrame(raf); };
}
