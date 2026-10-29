import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { priceAge } from '../utils/formatting';

export function ItemIcon({ id, size = 38 }: { id: string; size?: number }) {
  const iconId = id.split('#')[0];
  const imageUrl = `https://render.albiononline.com/v1/item/${encodeURIComponent(iconId)}.png?quality=1&size=76`;
  const imageRef = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    let observer: IntersectionObserver | undefined;
    const load = async () => {
      try {
        if (typeof caches === 'undefined') throw new Error('Persistent cache unavailable');
        const cache = await caches.open('planner-albion-item-icons-v1');
        let response = await cache.match(imageUrl);
        if (!response) {
          response = await fetch(imageUrl);
          if (!response.ok) throw new Error(`Icon request failed: ${response.status}`);
          try { await cache.put(imageUrl, response.clone()); } catch { /* A cache quota or policy issue should not block the icon. */ }
        }
        const blob = await response.blob();
        if (!blob.size) throw new Error('Empty icon response');
        objectUrl = URL.createObjectURL(blob);
        if (active) setSrc(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      } catch {
        if (active) setSrc(imageUrl);
      }
    };
    const image = imageRef.current;
    if (image && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          void load();
        }
      }, { rootMargin: '250px' });
      observer.observe(image);
    } else {
      void load();
    }
    return () => {
      active = false;
      observer?.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageUrl]);
  return <img ref={imageRef} className="item-icon" width={size} height={size} src={src} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />;
}

export function CopyableName({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copyName = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(name);
      } else {
        const input = document.createElement('textarea');
        input.value = name;
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const success = document.execCommand('copy');
        input.remove();
        if (!success) throw new Error('Copy failed');
      }
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return <>
    <button type="button" className="material-name-copy" title="Copy item name" aria-label={`Copy ${name}`} onClick={() => void copyName()}>{name}</button>
    <span className="sr-only" role="status" aria-live="polite">{copied ? `${name} copied` : ''}</span>
    {copied && <small className="material-copy-feedback" aria-hidden="true">Copied</small>}
  </>;
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
  const tone = value === 'MANUAL' ? 'manual' : value.includes('PARTIALLY FULFILLED') ? 'partial' : value === 'ACTIVE' ? 'fresh' : value === 'FULFILLED' ? 'ready' : value === 'CANCELLED' ? 'stale' : value.includes('Fresh') ? 'fresh' : value.includes('Aging') ? 'aging' : value.includes('Stale') ? 'stale' : value.includes('Unverified') ? 'unverified' : value === 'UNAVAILABLE' ? 'unavailable' : value === 'READY TO CRAFT' ? 'ready' : 'neutral';
  return <span className={`status-badge ${tone}`}>{value}</span>;
}

export function PriceAge({ date }: { date: string | null | undefined }) {
  const age = priceAge(date);
  return <small className={`price-age price-age-${age.tone}`} title={date ? new Date(date).toLocaleString() : undefined}>{age.label}</small>;
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
