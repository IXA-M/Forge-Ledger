import React, { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { formatItemName, formatTier, type CatalogItem } from '../domain';
import { catalog, catalogById } from '../data/catalog';
import { CopyableName, ItemIcon } from './SharedUi';

export function ItemPicker({ value, onChange, disabled = false, selectedDisplayName, copySelected = false }: { value: string; onChange: (item: CatalogItem | undefined) => void; disabled?: boolean; selectedDisplayName?: string; copySelected?: boolean }) {
  const selected = catalogById.get(value);
  const [query, setQuery] = useState(selected ? formatItemName(selected.name, selected.id) : '');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return catalog.slice(0, 24);
    return catalog.filter((item) => `${item.name} ${item.id} ${item.category} ${item.subcategory}`.toLowerCase().includes(needle)).slice(0, 40);
  }, [query]);

  return <div className="picker-wrap">
    <label className="field-label">Craftable item <span className="required-star">*</span></label>
    <div className="picker-input"><Search size={16} /><input value={query} disabled={disabled} placeholder={`Search ${catalog.length.toLocaleString()} craftable items…`} onChange={(event) => { setQuery(event.target.value); setOpen(true); if (value) onChange(undefined); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 130)} /><ChevronDown size={15} /></div>
    {open && <div className="picker-results">{results.length ? results.map((item) => <button type="button" className="picker-option" key={item.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(formatItemName(item.name, item.id)); setOpen(false); onChange(item); }}>
      <ItemIcon id={item.id} size={38} /><span className="picker-option-title"><strong>{formatItemName(item.name, item.id)}</strong><small>{item.category} · {formatTier(item.tier, item.id)}</small></span><span className="item-id">{item.id}</span>
    </button>) : <div className="picker-empty">No craftable items found in the current catalog.</div>}</div>}
    {selected && <div className="selected-item"><ItemIcon id={selected.id} /><span><strong>{copySelected ? <CopyableName name={selectedDisplayName || formatItemName(selected.name, selected.id)} /> : selectedDisplayName || formatItemName(selected.name, selected.id)}</strong><small>{selected.category} · {formatTier(selected.tier, selected.id)}</small></span></div>}
  </div>;
}
