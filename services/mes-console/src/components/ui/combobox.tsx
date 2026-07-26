import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ComboboxBaseOption = {
  value: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  searchText?: string;
};

type ComboboxBaseProps = {
  value?: string;
  options: ComboboxBaseOption[];
  onValueChange: (value: string) => void;
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  emptyMessage?: React.ReactNode;
  loading?: boolean;
  error?: React.ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
};

export function ComboboxBase({ value, options, onValueChange, onSearchChange, placeholder, emptyMessage, loading, error, disabled, 'aria-label': ariaLabel }: ComboboxBaseProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const updateQuery = (next: string) => {
    setQuery(next);
    onSearchChange?.(next);
    setOpen(true);
  };

  return (
    <div ref={rootRef} className="relative">
      <div className={cn('flex min-h-11 items-center gap-2 rounded-md border border-input bg-input px-3 shadow-sm focus-within:ring-2 focus-within:ring-ring', disabled && 'opacity-60')}>
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={open ? query : selected ? String(selected.label) : query}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); if (event.key === 'Enter' && options[0]) { event.preventDefault(); onValueChange(options[0].value); setQuery(''); setOpen(false); } }}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button type="button" onClick={() => setOpen((current) => !current)} disabled={disabled} aria-label={placeholder} className="text-muted-foreground hover:text-foreground"><ChevronDown className="h-4 w-4" /></button>
      </div>
      {open && <div role="listbox" className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-md border border-slate-700 bg-slate-900 p-1 text-slate-100 shadow-xl">
        {loading && <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}
        {!loading && error && <div className="px-3 py-3 text-sm text-rose-300">{error}</div>}
        {!loading && !error && options.length === 0 && <div className="px-3 py-3 text-sm text-slate-300">{emptyMessage}</div>}
        {!loading && !error && options.map((option) => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => { onValueChange(option.value); setQuery(''); setOpen(false); }} className="flex w-full items-start gap-2 rounded-sm px-3 py-2 text-left hover:bg-slate-800 focus:bg-slate-800 focus:outline-none">
          <span className="mt-0.5 w-4 shrink-0 text-amber-300">{option.value === value ? <Check className="h-4 w-4" /> : null}</span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{option.label}</span>{option.description && <span className="block truncate text-xs text-slate-400">{option.description}</span>}</span>
        </button>)}
      </div>}
    </div>
  );
}
