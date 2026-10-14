import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function ItemIcon({ id, size = 38 }: { id: string; size?: number }) {
  const iconId = id.split('#')[0];
  return <img className="item-icon" width={size} height={size} src={`https://render.albiononline.com/v1/item/${encodeURIComponent(iconId)}.png?quality=1&size=${size}`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />;
}

function groupPriceText(value: string) {
  if (!value) return '';
  const [integer, decimal] = value.replaceAll(',', '').split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal === undefined ? grouped : `${grouped}.${decimal}`;
}

export function PriceInput({ value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & { value: string; onChange: (value: string) => void }) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => groupPriceText(value));
  useEffect(() => { if (!focused) setDraft(groupPriceText(value)); }, [focused, value]);
  return <input {...props} type="text" inputMode="decimal" value={draft} onFocus={() => { setFocused(true); setDraft(value.replaceAll(',', '')); }} onChange={(event) => { const raw = event.target.value.replaceAll(',', '').replace(/[^\d.]/g, ''); setDraft(raw); onChange(raw); }} onBlur={() => { setFocused(false); setDraft(groupPriceText(draft)); }} />;
}

export function StatusBadge({ value }: { value: string }) {
  const tone = value === 'MANUAL' ? 'manual' : value.includes('PARTIALLY FULFILLED') ? 'partial' : value === 'ACTIVE' ? 'fresh' : value === 'FULFILLED' ? 'ready' : value === 'CANCELLED' ? 'stale' : value.includes('Fresh') ? 'fresh' : value.includes('Stale') ? 'stale' : value.includes('Unverified') ? 'unverified' : value === 'UNAVAILABLE' ? 'unavailable' : value === 'READY TO CRAFT' ? 'ready' : 'neutral';
  return <span className={`status-badge ${tone}`}>{value}</span>;
}

export function Progress({ value, tone = 'green' }: { value: number; tone?: 'green' | 'gold' }) {
  return <div className={`progress-track ${tone}`}><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

export function ModalShell({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="modal-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
    {children}
  </section></div>;
}
