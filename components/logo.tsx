// A marca do Leo dentro da app: uma linha manuscrita, na cor do texto (claro ou escuro).
// O ícone da app (folha com visto) fica só em public/icon.svg e app/icon.svg.
export default function Logo({ className = 'logo' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 17c3-1 4-9 7-9s1 9 4 9 3-11 7-11-1 11 3 11 3-7 6-7 2 6 5 6 3-3 4-4" />
    </svg>
  );
}
