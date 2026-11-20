'use client';

// Num telemóvel ou tablet, pôr o foco num campo abre logo o teclado e tapa metade do ecrã.
// Por isso o foco automático só acontece em aparelhos com rato (computador); no toque, a pessoa toca no campo quando quiser.
export const canAutoFocus = () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export function autoFocus(el: HTMLElement | null | undefined) {
  if (el && canAutoFocus()) el.focus();
}
