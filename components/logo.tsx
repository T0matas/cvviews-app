import { useId } from 'react';

// A marca do CVviews: uma folha com um visto. Desenhada em traço, segue a cor do texto (claro ou escuro).
export default function Logo({ className = 'logo' }: { className?: string }) {
  const id = useId();
  return (
    <svg className={className} viewBox="316 276 420 420" aria-hidden="true">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
          <rect width="1024" height="1024" fill="#fff" />
          <path d="M560 575l45 45 100-105" fill="none" stroke="#000" strokeWidth="92" strokeLinecap="round" strokeLinejoin="round" />
        </mask>
      </defs>
      <g mask={`url(#${id})`} fill="none" stroke="currentColor" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round">
        <path d="M548 322H390a45 45 0 0 0-45 45v236a45 45 0 0 0 45 45h235a45 45 0 0 0 45-45V444z" />
        <path d="M548 322v77a45 45 0 0 0 45 45h77z" fill="currentColor" />
      </g>
      <path d="M418 438h89M418 498h89" fill="none" stroke="currentColor" strokeWidth="36" strokeLinecap="round" />
      <path d="M560 575l45 45 100-105" fill="none" stroke="currentColor" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
