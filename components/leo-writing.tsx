// O Leo a escrever: uma caneta que desenha uma linha manuscrita, apaga-a e volta a escrever,
// enquanto a resposta chega. Com legenda ("A pensar", "A pesquisar na web") antes do primeiro texto.
export default function LeoWriting({ label }: { label?: string }) {
  return (
    <div className="leo-writing" role="status" aria-label={label ?? 'O Leo está a escrever'}>
      <svg viewBox="0 0 40 24" aria-hidden="true">
        <path className="leo-ink" pathLength={1} d="M2 17c3-1 4-9 7-9s1 9 4 9 3-11 7-11-1 11 3 11 3-7 6-7 2 6 5 6 3-3 4-4" />
        <g className="leo-pen">
          <path d="M0 0l2.4-6.6 3 1.1L3 1.1z" />
          <path d="M0 0l.9-2.4 1.1.4z" className="leo-nib" />
        </g>
      </svg>
      {label && <span className="leo-label">{label}</span>}
    </div>
  );
}

// A mesma linha manuscrita, parada: a marca do Leo na saudação.
export function LeoMark() {
  return (
    <svg className="leo-mark" viewBox="0 0 40 24" aria-hidden="true">
      <path d="M2 17c3-1 4-9 7-9s1 9 4 9 3-11 7-11-1 11 3 11 3-7 6-7 2 6 5 6 3-3 4-4" />
    </svg>
  );
}
