'use client';

import { type FormEvent, useState } from 'react';
import { ExternalLink, FileText, Plus, Trash2, X } from 'lucide-react';
import { APP_STATUS, type Application, type AppStatus } from '@/lib/memory';

// As candidaturas que a pessoa está a acompanhar: um quadro por estado, para ver de relance onde está cada uma.
// O Leo sabe de todas (vão com a memória) e pode adaptar o CV a cada vaga.
export default function ApplicationsDialog({ items, onChange, onAdapt, onClose }: {
  items: Application[];
  onChange: (next: Application[]) => void;
  onAdapt: (app: Application) => void;
  onClose: () => void;
}) {
  const [adding, setAdding] = useState(items.length === 0);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const role = String(form.get('role') ?? '').trim();
    const company = String(form.get('company') ?? '').trim();
    if (!role && !company) return;
    onChange([{ id: Math.random().toString(36).slice(2, 10), role, company, link: String(form.get('link') ?? '').trim(), status: 'preparar', updatedAt: Date.now() }, ...items]);
    event.currentTarget.reset();
    setAdding(false);
  }
  const update = (id: string, patch: Partial<Application>) => onChange(items.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)));
  const counts = APP_STATUS.map((s) => ({ ...s, n: items.filter((a) => a.status === s.id).length }));

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog apps" role="dialog" aria-modal="true" aria-labelledby="apps-title">
        <header className="apps-head">
          <div>
            <h2 id="apps-title">Candidaturas</h2>
            <p className="dialog-sub">O Leo sabe de todas e adapta o teu CV a cada vaga.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </header>

        {items.length > 0 && (
          <div className="apps-stats">
            {counts.map((s) => <div key={s.id} className={`apps-stat s-${s.id}`}><strong>{s.n}</strong><span>{s.label}</span></div>)}
          </div>
        )}

        {adding ? (
          <form className="apps-form" onSubmit={add}>
            <input name="role" placeholder="Cargo (ex.: Product Designer)" autoFocus />
            <input name="company" placeholder="Empresa" />
            <input name="link" placeholder="Link do anúncio (opcional)" type="url" />
            <div className="apps-form-row">
              {items.length > 0 && <button type="button" className="ghost-btn" onClick={() => setAdding(false)}>Cancelar</button>}
              <button className="primary-btn" type="submit">Guardar candidatura</button>
            </div>
          </form>
        ) : (
          <button className="apps-add" onClick={() => setAdding(true)}><Plus size={16} /> Nova candidatura</button>
        )}

        <ul className="apps-list">
          {items.map((a) => (
            <li key={a.id} className={`apps-item s-${a.status}`}>
              <div className="apps-item-top">
                <div className="apps-item-title">
                  <strong>{a.role || 'Vaga'}</strong>
                  <span>{a.company || 'Empresa por indicar'}</span>
                </div>
                {a.link && <a className="icon-btn" href={a.link} target="_blank" rel="noreferrer noopener" aria-label="Abrir o anúncio" title="Abrir o anúncio"><ExternalLink size={15} /></a>}
                <button className="icon-btn" onClick={() => { if (window.confirm('Apagar esta candidatura?')) onChange(items.filter((x) => x.id !== a.id)); }} aria-label="Apagar" title="Apagar"><Trash2 size={15} /></button>
              </div>
              <div className="apps-steps" role="radiogroup" aria-label="Estado">
                {APP_STATUS.map((s) => (
                  <button key={s.id} role="radio" aria-checked={a.status === s.id} className={a.status === s.id ? 'is-on' : ''} onClick={() => update(a.id, { status: s.id as AppStatus })}>{s.label}</button>
                ))}
              </div>
              <button className="apps-adapt" onClick={() => onAdapt(a)}><FileText size={14} /> Adaptar o CV a esta vaga</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
